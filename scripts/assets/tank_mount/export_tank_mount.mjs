// Deterministic procedural Tank mount export, optimization, validation, and preview.
//
// Usage:
//   node scripts/assets/tank_mount/export_tank_mount.mjs --stage blockout --raw-only
//   node scripts/assets/tank_mount/export_tank_mount.mjs --stage final
//   node scripts/assets/tank_mount/export_tank_mount.mjs --stage final --no-preview
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as esbuild from 'esbuild';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import puppeteer from 'puppeteer-core';
import { closePreview, renderPreviews } from '../../asset_pipeline/lib/preview.mjs';
import { BROWSER_PATH } from '../../browser_path.mjs';
import {
  TANK_CLIP_NAMES,
  TANK_MATERIAL_CONTRACT,
  TANK_SOCKET_DEFINITIONS,
  TANK_STAGES,
} from './model.js';
import { tankSourceFingerprint } from './source_fingerprint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const ENTRY = path.join(HERE, 'export_entry.js');
const SPEC = path.join(ROOT, 'scripts/assets/specs/tank_mount.json');
const BUILD_ASSETS = path.join(ROOT, 'scripts/assets/build_assets.mjs');
const SHIPPING_OUT = path.join(ROOT, 'public/models/mounts/tank.glb');
const PREVIEW_ROOT = path.join(ROOT, 'docs/screenshots/tank-mount/authoring');

function optionValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const stage = optionValue('--stage', 'final');
if (!TANK_STAGES.includes(stage)) throw new Error(`unknown tank stage: ${stage}`);
const rawOnly = process.argv.includes('--raw-only');
const noPreview = process.argv.includes('--no-preview');
const rawOut = path.join(ROOT, `tmp/asset_src/tank_mount/tank-${stage}.glb`);
const sourceFingerprint = tankSourceFingerprint(ROOT);

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function createNodeIo() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
}

async function stampSourceFingerprint(glbPath) {
  const io = await createNodeIo();
  const document = await io.read(glbPath);
  const root = document.getRoot();
  root.setExtras({ ...root.getExtras(), sourceFingerprint });
  const asset = root.getAsset();
  const extras =
    asset.extras && typeof asset.extras === 'object' && !Array.isArray(asset.extras)
      ? asset.extras
      : {};
  asset.extras = { ...extras, sourceFingerprint };
  await io.write(glbPath, document);
}

async function inspectGlb(glbPath) {
  const io = await createNodeIo();
  const document = await io.read(glbPath);
  const root = document.getRoot();
  const scene = root.listScenes()[0];
  if (!scene) throw new Error(`${glbPath} has no scene`);
  const meshes = root.listMeshes().map((mesh) => ({
    name: mesh.getName(),
    primitives: mesh.listPrimitives().map((primitive) => {
      const position = primitive.getAttribute('POSITION');
      if (!position) throw new Error(`${mesh.getName()} has no POSITION`);
      return {
        material: primitive.getMaterial()?.getName() ?? null,
        triangles: (primitive.getIndices()?.getCount() ?? position.getCount()) / 3,
        attributes: primitive.listSemantics().sort(),
      };
    }),
  }));
  const bounds = getBounds(scene);
  const nodes = root.listNodes();
  return {
    path: path.relative(ROOT, glbPath),
    bytes: statSync(glbPath).size,
    sha256: createHash('sha256').update(readFileSync(glbPath)).digest('hex'),
    scenes: root.listScenes().length,
    sceneChildren: scene.listChildren().map((node) => node.getName()),
    nodes: nodes.length,
    meshes,
    primitives: meshes.reduce((sum, mesh) => sum + mesh.primitives.length, 0),
    triangles: meshes.reduce(
      (sum, mesh) =>
        sum + mesh.primitives.reduce((meshSum, primitive) => meshSum + primitive.triangles, 0),
      0,
    ),
    materials: root.listMaterials().map((material) => ({
      name: material.getName(),
      roughness: material.getRoughnessFactor(),
      metalness: material.getMetallicFactor(),
    })),
    textures: root.listTextures().length,
    animations: root.listAnimations().map((animation) => ({
      name: animation.getName(),
      duration: Math.max(
        0,
        ...animation
          .listSamplers()
          .map((sampler) => sampler.getInput()?.getMaxNormalizedValue?.() ?? 0),
      ),
      channels: animation.listChannels().length,
    })),
    skins: root.listSkins().length,
    cameras: root.listCameras().length,
    bounds,
    sockets: TANK_SOCKET_DEFINITIONS.map((definition) => {
      const node = nodes.find((candidate) => candidate.getName() === definition.nodeName);
      return node
        ? {
            name: node.getName(),
            translation: node.getTranslation(),
            mesh: node.getMesh()?.getName() ?? null,
            extras: node.getExtras(),
          }
        : null;
    }),
    extensions: root
      .listExtensionsUsed()
      .map((extension) => extension.extensionName)
      .sort(),
    fingerprints: {
      document: root.getExtras()?.sourceFingerprint,
      asset: root.getAsset().extras?.sourceFingerprint,
    },
  };
}

function verifyContract(stats, optimized) {
  const expectedExtensions = optimized ? ['EXT_meshopt_compression', 'KHR_mesh_quantization'] : [];
  assertCondition(stats.scenes === 1, `${stats.path} must contain one scene`);
  assertCondition(
    JSON.stringify(stats.sceneChildren) === JSON.stringify(['Tank']),
    `${stats.path} scene root must be Tank`,
  );
  assertCondition(stats.textures === 0, `${stats.path} must contain zero textures`);
  assertCondition(stats.skins === 0, `${stats.path} must contain zero skins`);
  assertCondition(stats.cameras === 0, `${stats.path} must contain zero cameras`);
  assertCondition(stats.triangles <= 14_000, `${stats.path} exceeds 14,000 triangles`);
  assertCondition(stats.primitives <= 24, `${stats.path} exceeds 24 primitives`);
  if (stage === 'final') {
    assertCondition(stats.materials.length === 6, `${stats.path} must contain six materials`);
    assertCondition(
      JSON.stringify(stats.materials.map((material) => material.name).sort()) ===
        JSON.stringify(TANK_MATERIAL_CONTRACT.map((material) => material.name).sort()),
      `${stats.path} material names changed`,
    );
  }
  assertCondition(
    JSON.stringify(stats.animations.map((animation) => animation.name)) ===
      JSON.stringify(TANK_CLIP_NAMES),
    `${stats.path} must contain Idle, Walk, Run, Death in order`,
  );
  assertCondition(
    stats.animations.every((animation) => animation.channels > 0),
    `${stats.path} clips must have live animation channels`,
  );
  assertCondition(
    stats.sockets.every((socket) => socket && socket.mesh === null && socket.extras?.purpose),
    `${stats.path} sockets must be extras-bearing empty nodes`,
  );
  assertCondition(Math.abs(stats.bounds.min[1]) <= 0.001, `${stats.path} must sit on minY zero`);
  if (stage === 'final') {
    assertCondition(
      stats.bounds.max[1] >= 2.3 && stats.bounds.max[1] <= 2.55,
      `${stats.path} height must remain in the 2.3 to 2.55 yard contract`,
    );
  }
  assertCondition(
    stats.fingerprints.document === sourceFingerprint &&
      stats.fingerprints.asset === sourceFingerprint,
    `${stats.path} source fingerprint is missing or stale`,
  );
  assertCondition(
    JSON.stringify(stats.extensions) === JSON.stringify(expectedExtensions),
    `${stats.path} extensions changed: ${stats.extensions.join(', ')}`,
  );
  if (optimized) {
    assertCondition(stats.bytes <= 320 * 1024, `${stats.path} exceeds 320 KiB`);
  }
}

const { outputFiles } = await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
  logLevel: 'silent',
});
const bundle = outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${bundle}</script></body></html>`;
const browser = await puppeteer.launch({
  executablePath: BROWSER_PATH,
  headless: 'new',
  args: [
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--enable-webgl',
  ],
});

let authoringStats;
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error('PAGEERR', error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('CONSOLE', message.text());
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 20_000 });
  const result = await page.evaluate(
    (selectedStage, fingerprint) => window.exportTankMount(selectedStage, fingerprint),
    stage,
    sourceFingerprint,
  );
  mkdirSync(path.dirname(rawOut), { recursive: true });
  writeFileSync(rawOut, Buffer.from(result.b64, 'base64'));
  authoringStats = result.stats;
} finally {
  await browser.close();
}

await stampSourceFingerprint(rawOut);
const rawStats = await inspectGlb(rawOut);
verifyContract(rawStats, false);
console.log(`raw: ${path.relative(ROOT, rawOut)}`);
console.log(`authoring stats: ${JSON.stringify(authoringStats)}`);
console.log(`raw contract: ${JSON.stringify(rawStats)}`);

if (!noPreview) {
  const previewDir = path.join(PREVIEW_ROOT, stage);
  const files = await renderPreviews(rawOut, previewDir, {
    size: 640,
    views: ['front', 'right', 'back', 'hero'],
    clips: true,
  });
  for (const file of files) console.log(`preview: ${path.relative(ROOT, file)}`);
  await closePreview();
}

if (!rawOnly) {
  if (stage !== 'final') {
    throw new Error('shipping optimization is only allowed for --stage final');
  }
  const pipeline = spawnSync(process.execPath, [BUILD_ASSETS, SPEC], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (pipeline.status !== 0) process.exit(pipeline.status ?? 1);
  await stampSourceFingerprint(SHIPPING_OUT);
  const shippingStats = await inspectGlb(SHIPPING_OUT);
  verifyContract(shippingStats, true);
  console.log(`shipping contract: ${JSON.stringify(shippingStats)}`);
}

console.log(`source fingerprint: ${sourceFingerprint}`);
