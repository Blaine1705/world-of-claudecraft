// Convert embedded GLB textures to KTX2/Basis (KHR_texture_basisu) so they stay
// GPU-compressed in memory instead of decoding to full RGBA bitmaps. A ~2 KB
// flat-color webp atlas decodes to width*height*4 bytes plus mipmaps; across the
// full model set that decode amplification was the bulk of the WKWebView
// WebContent process footprint that got the native iOS client jetsam-killed at
// world entry (iPhone 17 Pro, killed at 1.54 GB resident). ETC1S/UASTC textures
// upload as-is at roughly an eighth of the RGBA size, on the CPU and GPU side.
//
// Usage: node scripts/assets/compress_glb_textures.mjs [options] [files...]
//   --dir <path>   directory to scan for .glb files (default public/models)
//   --dry-run      report what would be converted, write nothing
//   --jobs <n>     file-level parallelism (default 4)
// With explicit [files...] arguments only those GLBs are processed.
//
// Requires the `ktx` tool from KhronosGroup/KTX-Software 4.3+ on PATH (the
// gltf-transform toktx transform spawns it). No sudo needed: expand the release
// pkg with `pkgutil --expand-full` and add its bin/ to PATH.
//
// Per file: webp textures are first transcoded to png (toktx cannot read webp),
// then normal/occlusion slots go to UASTC (quality) and everything else to
// ETC1S (size). Every file this script writes then goes through
// quantize + meshopt (EXT_meshopt_compression, via KHR_mesh_quantization),
// which both re-applies the geometry codec a read had decoded and ADDS it to a
// GLB that never had it. Only re-applying it (the old `hadMeshopt` guard) meant
// any model produced outside build_assets.mjs, i.e. the whole Tripo
// asset-pipeline output, permanently skipped geometry compression while still
// collecting its KTX2 textures: 118 shipped GLBs, 32.4 MB (issue #3287).
// Files that already have both, and files with no embedded textures whose
// geometry is already compressed (e.g. the Eastbrook kit, which uses a shared
// external atlas and carries provenance extras), are skipped without a write.
// One directory is exempt from ADDING the geometry codec,
// public/models/weapons/ (GEOMETRY_ADD_EXCLUDED_DIRS): quantization recentres a
// mesh onto its bounding box and compensates on the node, but the renderer
// discards that node position and treats the mesh origin as the grip point, so
// recentring drops every weapon out of the hand. The pass still RE-APPLIES the
// codec to a weapon that already carries it. Full rationale on classifyGlb.
// After transforming, the script asserts the source's structure survived and
// aborts the file on any violation. That check is by IDENTITY, not by count
// (geometryPassViolations): a geometry pass legitimately inserts an anonymous
// wrapper node above a mesh whose own transform cannot absorb the
// dequantization TRS, and gives each quantized mesh its own copy of a shared
// skin, so every named node must survive and every addition must prove what it
// is.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mode, toktx } from '@gltf-transform/cli';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import {
  classifyGlb,
  geometryAddExcludedPath,
  geometryPassViolations,
  glbJsonChunk,
  meshoptEncodable,
  weaponVfxModelKeys,
} from './lib/glb_texture_compression_core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_DIR = path.join(ROOT, 'public', 'models');

// Slots that favor UASTC's higher quality over ETC1S's smaller size.
const UASTC_SLOTS = /^(normalTexture|occlusionTexture)$/;

// The WEAPON_VFX skins keep drawable (webp) textures; see the note on
// weaponVfxModelKeys. They are NOT excluded from the file walk: geometry
// compression applies to them like every other shipped model.
function textureExcludedGlbPaths() {
  const source = fs.readFileSync(path.join(ROOT, 'src', 'render', 'weapon_vfx.ts'), 'utf8');
  return new Set(
    weaponVfxModelKeys(source).map((k) =>
      path.join(ROOT, 'public', 'models', 'weapons', `${k}.glb`),
    ),
  );
}

export function parseArgs(argv) {
  const opts = { dir: DEFAULT_DIR, dryRun: false, jobs: 4, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') opts.dir = path.resolve(argv[++i]);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--jobs') opts.jobs = Math.max(1, Number(argv[++i]) || 4);
    else opts.files.push(path.resolve(a));
  }
  return opts;
}

function* walkGlbs(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkGlbs(p);
    else if (e.name.endsWith('.glb')) yield p;
  }
}

async function convertFile(io, file, { dryRun, textureExcluded, geometryAddExcluded }) {
  const srcBuf = fs.readFileSync(file);
  const srcJson = glbJsonChunk(srcBuf);
  const cls = classifyGlb(srcJson, { textureExcluded, geometryAddExcluded });
  // A file with no accessors has nothing for the geometry codec to encode.
  const wantsMeshopt = cls.needsMeshopt && meshoptEncodable(srcJson);
  if (cls.skip || (!cls.needsTextures && !wantsMeshopt))
    return { file, status: 'skipped', before: srcBuf.length, after: srcBuf.length };
  const work = [cls.needsTextures ? 'textures' : null, wantsMeshopt ? 'geometry' : null]
    .filter(Boolean)
    .join('+');
  if (dryRun)
    return {
      file,
      status: 'would-convert',
      reason: work,
      before: srcBuf.length,
      after: srcBuf.length,
    };

  const doc = await io.readBinary(srcBuf);
  const transforms = [];
  if (cls.needsTextures) {
    transforms.push(
      textureCompress({ encoder: sharp, targetFormat: 'png', formats: /^image\/webp$/ }),
      // encoder feeds the transform's own resize path: ktx requires dimensions
      // that are multiples of four, and NPOT sources get resized via sharp first.
      toktx({ mode: Mode.UASTC, slots: UASTC_SLOTS, jobs: 2, encoder: sharp }),
      toktx({ mode: Mode.ETC1S, jobs: 2, encoder: sharp }),
    );
  }
  // Reading a meshopt file decodes it, so the codec is re-applied on any write;
  // a file that never had it gets it here. quantize rides along inside
  // meshopt() (reorder + quantize + EXT_meshopt_compression), which is the same
  // geometry-safe transform build_assets.mjs runs: never join/flatten/simplify.
  // Skipped only for an accessor-less file, where meshopt() returns before
  // creating the extension: pushing it there would abort a run whose real work
  // was the textures.
  const applyMeshopt = wantsMeshopt || cls.hadMeshopt;
  if (applyMeshopt) {
    // A source that ALREADY carries KHR_mesh_quantization must be dequantized
    // back to float first. Re-quantizing an integer accessor in place silently
    // destroys the model: rift_portal.glb, the one file in this tree in that
    // state, came out with POSITION max [0, 32767, 0], every x and z collapsed
    // to zero, a 4.7 MB flat line that still passed every structural check
    // because its meshes, nodes and materials were all intact.
    if (cls.hadQuantization) transforms.push(dequantize());
    transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  }
  await doc.transform(...transforms);
  const outBuf = Buffer.from(await io.writeBinary(doc));

  const outJson = glbJsonChunk(outBuf);
  const abort = (reason) => ({
    file,
    status: 'aborted',
    reason,
    before: srcBuf.length,
    after: srcBuf.length,
  });
  const bad = geometryPassViolations(srcJson, outJson);
  if (bad.length) return abort(bad.join('; '));
  if (cls.needsTextures) {
    const leftover = (outJson.images ?? []).filter((i) => i.mimeType !== 'image/ktx2').length;
    if (leftover > 0) return abort(`${leftover} textures not converted`);
  }
  // Read from the SOURCE: this pass never touches a texture-excluded file's
  // images, so a KTX2 one arrived that way and blaming the pass would send the
  // operator hunting the wrong thing (and abort the run forever).
  if (textureExcluded) {
    const compressed = (srcJson.images ?? []).filter((i) => i.mimeType === 'image/ktx2').length;
    if (compressed > 0)
      return abort(`${compressed} WEAPON_VFX textures are already ktx2 and must stay drawable`);
  }
  // Mirror what tests/glb_meshopt_coverage.test.ts requires of the tree, so a
  // shortfall fails at the write rather than one test run later.
  if (applyMeshopt) {
    const used = outJson.extensionsUsed ?? [];
    if (!used.includes('EXT_meshopt_compression'))
      return abort('EXT_meshopt_compression missing from the output');
    if ((outJson.meshes ?? []).length > 0 && !used.includes('KHR_mesh_quantization'))
      return abort('KHR_mesh_quantization missing from the output');
  }

  fs.writeFileSync(file, outBuf);
  return { file, status: 'converted', reason: work, before: srcBuf.length, after: outBuf.length };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const textureExcluded = textureExcludedGlbPaths();
  const files = opts.files.length ? opts.files : [...walkGlbs(opts.dir)];
  // The meshopt WASM instantiates lazily; gltf-transform does not await it, so
  // a decode reached before readiness dies with "reading 'exports'".
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  io.setLogger({ debug() {}, info() {}, warn() {}, error: (m) => console.error(m) });

  const results = [];
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const file = files[next++];
      try {
        const r = await convertFile(io, file, {
          ...opts,
          textureExcluded: textureExcluded.has(path.resolve(file)),
          geometryAddExcluded: geometryAddExcludedPath(path.relative(ROOT, file)),
        });
        results.push(r);
        if (r.status === 'converted' || r.status === 'would-convert' || r.status === 'aborted') {
          const rel = path.relative(ROOT, r.file);
          const delta = `${(r.before / 1024).toFixed(0)}K -> ${(r.after / 1024).toFixed(0)}K`;
          console.log(
            `${r.status.padEnd(14)} ${delta.padStart(16)}  ${rel}${r.reason ? `  (${r.reason})` : ''}`,
          );
        }
      } catch (err) {
        results.push({ file, status: 'failed', reason: String(err), before: 0, after: 0 });
        console.error(`failed         ${path.relative(ROOT, file)}: ${err}`);
      }
    }
  }
  await Promise.all(Array.from({ length: opts.jobs }, worker));

  const by = (s) => results.filter((r) => r.status === s);
  const converted = by('converted');
  const beforeTotal = converted.reduce((s, r) => s + r.before, 0);
  const afterTotal = converted.reduce((s, r) => s + r.after, 0);
  console.log(
    `\n${converted.length} converted (${(beforeTotal / 1048576).toFixed(1)} MB -> ${(afterTotal / 1048576).toFixed(1)} MB), ` +
      `${by('would-convert').length} pending (dry run), ${by('skipped').length} skipped, ` +
      `${by('aborted').length} aborted, ${by('failed').length} failed`,
  );
  if (by('aborted').length || by('failed').length) process.exitCode = 1;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await main();
