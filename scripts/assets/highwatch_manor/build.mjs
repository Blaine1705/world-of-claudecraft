// Ship the Blender-authored Highwatch manor (scripts/assets/highwatch_manor/): validate the
// exported hierarchy, materials and root extras, stamp the source fingerprint, then prune,
// dedup and meshopt it into public/models/tidehold/highwatch/manor.glb, and merge its collision
// rows (manor.collision.json, written by the same Blender run) into
// data/asset_collision_overrides.json under the model's id. Never flatten or join: the town
// view casts no shadow from the G_INT* parts (render/eastbrook_placed_building.ts).
//
//   blender --background --python scripts/assets/highwatch_manor/build_manor.py
//   node scripts/assets/highwatch_manor/build.mjs
//   node scripts/gen_collision_overrides.mjs
//   node scripts/gen_asset_catalog.mjs
//   node scripts/build_media_manifest.mjs generate
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export const HIGHWATCH_MANOR_ASSET = {
  source: 'scripts/assets/highwatch_manor/manor_source.glb',
  target: 'public/models/tidehold/highwatch/manor.glb',
  collision: 'scripts/assets/highwatch_manor/manor.collision.json',
  /** The asset id its collision rows are stored under (the model's path, as placed). */
  collisionId: 'tidehold/highwatch/manor',
  /** The fingerprinted inputs: the Blender sources (and the ferry's shared shiplib they build
   *  with), the exported source and this builder. */
  inputs: [
    'scripts/assets/highwatch_manor/manor_source.glb',
    'scripts/assets/highwatch_manor/build_manor.py',
    'scripts/assets/highwatch_manor/manor_plan.py',
    'scripts/assets/highwatch_manor/manor_lib.py',
    'scripts/assets/highwatch_manor/manor_shell.py',
    'scripts/assets/highwatch_manor/manor_furnish.py',
    'scripts/assets/highwatch_manor/manor_grounds.py',
    'scripts/assets/eastbrook_ferry/shiplib.py',
    'scripts/assets/highwatch_manor/build.mjs',
  ],
  /** Named nodes the runtime and the tests depend on. */
  requiredNodes: [
    'HighwatchManor_ROOT',
    'ManorShell',
    'ManorRoof',
    'ManorTrim',
    'ManorGrounds',
    'ManorGlow',
    'G_INT_Timber',
    'G_INT_Furnishings',
  ],
  materials: [
    'ManorGlass',
    'ManorGlow',
    'ManorMetal',
    'ManorPlaster',
    'ManorSlate',
    'ManorStone',
    'ManorWood',
  ],
};

export function sourceFingerprint(asset = HIGHWATCH_MANOR_ASSET, root = ROOT) {
  const hash = createHash('sha256');
  for (const file of asset.inputs) {
    // Text inputs hash with normalized line endings so a Windows checkout and a Linux
    // checkout agree; the source GLB is binary and hashes byte for byte.
    const bytes = readFileSync(path.join(root, file));
    const body = file.endsWith('.glb')
      ? bytes
      : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    hash.update(file).update('\0').update(body).update('\0');
  }
  return hash.digest('hex');
}

export async function buildHighwatchManor(asset = HIGHWATCH_MANOR_ASSET, root = ROOT) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  const doc = await io.read(path.join(root, asset.source));
  const gltf = doc.getRoot();
  const names = new Set(gltf.listNodes().map((node) => node.getName()));
  const missing = asset.requiredNodes.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Manor source is missing nodes: ${missing.join(', ')}`);
  await doc.transform(prune({ keepExtras: true, keepLeaves: true }));
  const materials = gltf
    .listMaterials()
    .map((material) => material.getName())
    .sort();
  if (JSON.stringify(materials) !== JSON.stringify(asset.materials)) {
    throw new Error(`Unexpected manor materials: ${materials.join(', ')}`);
  }
  if (
    gltf.listTextures().length ||
    gltf.listCameras().length ||
    gltf.listSkins().length ||
    gltf.listAnimations().length
  ) {
    throw new Error('The manor ships texture-free, camera-free, unskinned and still');
  }
  const extras = gltf.listScenes()[0]?.listChildren()[0]?.getExtras() ?? {};
  if (!extras.highwatchManor) throw new Error('HighwatchManor_ROOT lost its extras');
  gltf.setExtras({ sourceFingerprint: sourceFingerprint(asset, root), authoring: 'Blender' });
  await doc.transform(
    prune({ keepExtras: true, keepLeaves: true }),
    dedup(),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  return io.writeBinary(doc);
}

/**
 * The override table's text with the manor's rows set: its own entry replaced in place (or
 * appended at the end), every other byte untouched (the table is formatted by hand and by the
 * Collision Master, so it is never re-serialized whole).
 */
export function mergeManorCollision(raw, rows, id = HIGHWATCH_MANOR_ASSET.collisionId) {
  const body = JSON.stringify(rows, null, 2).replace(/\n/g, '\n  ');
  const key = `"${id}": `;
  const at = raw.indexOf(`\n  ${key}`);
  if (at >= 0) {
    const open = raw.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < raw.length; end++) {
      if (raw[end] === '{') depth++;
      else if (raw[end] === '}' && --depth === 0) break;
    }
    return `${raw.slice(0, open)}${body}${raw.slice(end + 1)}`;
  }
  const close = raw.lastIndexOf('}');
  const head = raw.slice(0, close).replace(/\s*$/, '');
  return `${head},\n  ${key}${body}\n}${raw.slice(close + 1)}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = await buildHighwatchManor();
  mkdirSync(path.dirname(path.join(ROOT, HIGHWATCH_MANOR_ASSET.target)), { recursive: true });
  writeFileSync(path.join(ROOT, HIGHWATCH_MANOR_ASSET.target), bytes);
  console.log(
    `${HIGHWATCH_MANOR_ASSET.target}: ${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
  const coll = JSON.parse(readFileSync(path.join(ROOT, HIGHWATCH_MANOR_ASSET.collision), 'utf8'));
  const tablePath = path.join(ROOT, 'data/asset_collision_overrides.json');
  writeFileSync(tablePath, mergeManorCollision(readFileSync(tablePath, 'utf8'), coll.rows));
  console.log(
    `${HIGHWATCH_MANOR_ASSET.collisionId}: ${coll.rows.boxes.length} boxes, ${coll.rows.ramps.length} decks`,
  );
}
