// Deterministic export, optimization, and contract verification of the Balgath Form: the
// LIGHT player-transformation body of the Balgath world boss.
//
// Usage:
//   node scripts/assets/balgath_form/export_balgath_form.mjs
//   node scripts/assets/balgath_form/export_balgath_form.mjs --raw-only
//   node scripts/assets/balgath_form/export_balgath_form.mjs --blender=<path to blender 5.2.1>
//
// 1. Writes a texture-free, clip-free copy of the boss GLB for Blender (its importer cannot
//    read KHR_texture_basisu): tmp/asset_src/balgath_form/balgath_source_blender.glb.
// 2. Runs the Blender factory (model.py) in --background with the eyeGlow anchor resolved
//    into bind space (the factory locks the crystal eye there): it decimates the one
//    skinned primitive and exports it as tmp/asset_src/balgath_form/balgath_form_blender.glb.
// 3. Grafts the decimated attributes back into the BOSS's own glTF document: the joints,
//    their rest transforms, the inverse bind matrices, the material and the three KTX2
//    textures stay the boss's own bytes, and only the primitive's accessors are replaced
//    (joint indices remapped from Blender's skin order to the boss's by NAME, weights
//    sorted and renormalized). The clips are dropped: the form gets them from the donors.
// 4. Stamps the source fingerprint (source_fingerprint.mjs) into the raw GLB.
// 5. Optimizes through scripts/assets/build_assets.mjs with specs/balgath_form.json into
//    public/models/chars/forms/, then again into a candidate root, and requires the two to match
//    byte for byte.
// 6. Verifies the contract (contract.mjs) on the raw AND shipped files.
// After a run, regenerate the media manifest:
//   node scripts/build_media_manifest.mjs generate
// and re-pin tests/balgath_form_asset.test.ts from the printed summary.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  BALGATH_FORM_BLENDER_VERSION,
  BALGATH_FORM_EYE,
  BALGATH_FORM_FILE,
  BALGATH_FORM_JOINT_COUNT,
  BALGATH_FORM_MAX_BYTES,
  BALGATH_FORM_MAX_INFLUENCES,
  BALGATH_FORM_MAX_TRIANGLES,
  BALGATH_FORM_MESH,
  BALGATH_FORM_SOURCE_FILE,
} from './contract.mjs';
import { balgathFormSourceFingerprint } from './source_fingerprint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const FACTORY = path.join(HERE, 'model.py');
const RAW_DIR = path.join(ROOT, 'tmp/asset_src/balgath_form');
const BLENDER_SOURCE = path.join(RAW_DIR, 'balgath_source_blender.glb');
const BLENDER_RAW = path.join(RAW_DIR, 'balgath_form_blender.glb');
const RAW = path.join(RAW_DIR, 'balgath_form.glb');
const SOURCE = path.join(ROOT, 'public', BALGATH_FORM_SOURCE_FILE);
const SPEC = path.join(ROOT, 'scripts/assets/specs/balgath_form.json');
const BUILD_ASSETS = path.join(ROOT, 'scripts/assets/build_assets.mjs');
const SHIPPED = path.join(ROOT, 'public', BALGATH_FORM_FILE);
const CANDIDATE_ROOT = path.join(ROOT, 'tmp/asset_optimized/balgath_form/deterministic');
const blenderArg = process.argv.find((arg) => arg.startsWith('--blender='));
const BLENDER = blenderArg
  ? blenderArg.slice('--blender='.length)
  : 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const rawOnly = process.argv.includes('--raw-only');

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function createNodeIo() {
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
}

/** Step 1: the boss without its KTX2 textures or clips, which is all Blender needs. */
async function writeBlenderSource() {
  const io = await createNodeIo();
  const document = await io.read(SOURCE);
  const root = document.getRoot();
  for (const animation of root.listAnimations()) animation.dispose();
  for (const texture of root.listTextures()) texture.dispose();
  for (const extension of root.listExtensionsUsed()) extension.dispose();
  mkdirSync(RAW_DIR, { recursive: true });
  await io.write(BLENDER_SOURCE, document);
}

/** The eyeGlow anchor in the boss's bind space (glTF units, Y up): the factory locks the
 *  geometry around it so the round crystal eye survives the collapse. */
async function eyeAnchorPoint() {
  const io = await createNodeIo();
  const root = (await io.read(SOURCE)).getRoot();
  const bone = root.listNodes().find((node) => node.getName() === BALGATH_FORM_EYE.bone);
  assertCondition(bone, `the boss rig has no ${BALGATH_FORM_EYE.bone} joint`);
  return transformPoint(bone.getWorldMatrix(), BALGATH_FORM_EYE.offset);
}

/** Step 2: the Blender factory. */
function runBlender(eye) {
  const version = spawnSync(BLENDER, ['--version'], { encoding: 'utf8' });
  assertCondition(version.status === 0, `blender not runnable at ${BLENDER}`);
  assertCondition(
    version.stdout.includes(`Blender ${BALGATH_FORM_BLENDER_VERSION}`),
    `the form is authored against Blender ${BALGATH_FORM_BLENDER_VERSION}; found: ${version.stdout.split('\n')[0]}`,
  );
  const result = spawnSync(
    BLENDER,
    [
      '--background',
      '--factory-startup',
      '--python',
      FACTORY,
      '--',
      '--src',
      BLENDER_SOURCE,
      '--out',
      RAW_DIR,
      '--eye',
      eye.map((value) => value.toFixed(6)).join(','),
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const report = /BALGATH_FORM_REPORT_BEGIN\n([\s\S]*?)BALGATH_FORM_REPORT_END/.exec(
    result.stdout.replaceAll('\r\n', '\n'),
  );
  if (result.status !== 0 || !report) {
    process.stderr.write(result.stdout.slice(-4000));
    process.stderr.write(result.stderr.slice(-4000));
    throw new Error(`blender factory failed: ${result.status ?? 'unknown'}`);
  }
  process.stdout.write(`factory report:\n${report[1]}`);
}

/** Step 3: the boss's document with the decimated primitive grafted in. */
async function graft() {
  const io = await createNodeIo();
  const document = await io.read(SOURCE);
  const root = document.getRoot();
  const decimated = (await io.read(BLENDER_RAW)).getRoot();

  for (const animation of root.listAnimations()) animation.dispose();

  const meshes = root.listMeshes();
  assertCondition(meshes.length === 1, `the boss has ${meshes.length} meshes, expected 1`);
  const mesh = meshes[0];
  const primitives = mesh.listPrimitives();
  assertCondition(primitives.length === 1, 'the boss mesh has more than one primitive');
  const primitive = primitives[0];
  const meshNode = root.listNodes().find((node) => node.getMesh() === mesh);
  const skin = meshNode?.getSkin();
  assertCondition(meshNode && skin, 'the boss mesh node carries no skin');
  const jointNames = skin.listJoints().map((joint) => joint.getName());

  const blenderMeshes = decimated.listMeshes();
  assertCondition(blenderMeshes.length === 1, 'the factory exported more than one mesh');
  const blenderPrimitives = blenderMeshes[0].listPrimitives();
  assertCondition(blenderPrimitives.length === 1, 'the factory exported more than one primitive');
  const source = blenderPrimitives[0];
  const blenderSkin = decimated.listSkins()[0];
  assertCondition(blenderSkin, 'the factory exported no skin');
  const remap = blenderSkin.listJoints().map((joint) => {
    const index = jointNames.indexOf(joint.getName());
    assertCondition(index >= 0, `factory joint ${joint.getName()} is not on the boss rig`);
    return index;
  });

  const position = source.getAttribute('POSITION');
  const normal = source.getAttribute('NORMAL');
  const uv = source.getAttribute('TEXCOORD_0');
  const joints = source.getAttribute('JOINTS_0');
  const weights = source.getAttribute('WEIGHTS_0');
  assertCondition(position && normal && uv && joints && weights, 'factory attributes missing');
  assertCondition(!source.getAttribute('JOINTS_1'), 'factory exported more than 4 influences');
  const count = position.getCount();

  const outJoints = new Uint8Array(count * 4);
  const outWeights = new Float32Array(count * 4);
  const j = [0, 0, 0, 0];
  const w = [0, 0, 0, 0];
  for (let v = 0; v < count; v++) {
    joints.getElement(v, j);
    weights.getElement(v, w);
    const influences = [0, 1, 2, 3]
      .map((k) => ({ joint: remap[j[k]], weight: w[k] }))
      .filter((influence) => influence.weight > 0)
      .sort((a, b) => b.weight - a.weight || a.joint - b.joint)
      .slice(0, BALGATH_FORM_MAX_INFLUENCES);
    const total = influences.reduce((sum, influence) => sum + influence.weight, 0);
    assertCondition(total > 0, `vertex ${v} carries no weight`);
    influences.forEach((influence, k) => {
      outJoints[v * 4 + k] = influence.joint;
      outWeights[v * 4 + k] = influence.weight / total;
    });
  }

  const buffer = root.listBuffers()[0];
  const accessor = (type, array) =>
    document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const copy = (attribute) => attribute.getArray().slice();
  const old = [
    ...primitive.listAttributes(),
    ...(primitive.getIndices() ? [primitive.getIndices()] : []),
  ];
  for (const semantic of primitive.listSemantics()) primitive.setAttribute(semantic, null);
  primitive
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(copy(position))))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(copy(normal))))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(copy(uv))))
    .setAttribute('JOINTS_0', accessor('VEC4', outJoints))
    .setAttribute('WEIGHTS_0', accessor('VEC4', outWeights))
    .setIndices(accessor('SCALAR', new Uint16Array(source.getIndices().getArray())));
  for (const stale of old) stale.dispose();
  mesh.setName(BALGATH_FORM_MESH);
  meshNode.setName(BALGATH_FORM_MESH);
  await io.write(RAW, document);
}

async function stampSourceFingerprint(glbPath, sourceFingerprint) {
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

/** Column-major 4x4 times a point. */
function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/** Column-major 4x4 product a * b. */
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

/** Bind-space positions of a skinned primitive. A meshopt-quantized skinned mesh stores
 *  integer positions and folds the dequantization into its inverse bind matrices, so a
 *  vertex is read back through the root joint at rest: world(joint) * IBM(joint) * p,
 *  which is the identity on an unquantized file. */
function skinPositions(node, primitive) {
  const position = primitive.getAttribute('POSITION');
  const skin = node.getSkin();
  const ibm = skin.getInverseBindMatrices().getElement(0, new Array(16).fill(0));
  const local = multiply(skin.listJoints()[0].getWorldMatrix(), ibm);
  const out = [];
  const element = [0, 0, 0];
  for (let i = 0; i < position.getCount(); i++) {
    out.push(transformPoint(local, position.getElement(i, element)));
  }
  return out;
}

/** Where the eyeGlow anchor (BALGATH_FORM_EYE, the boss VisualDef's bone-local offset)
 *  lands on the mesh: the distance from the anchor at rest to the nearest vertex, and that
 *  vertex's UV (on the painted turquoise eye). The decimation protects the head, so the
 *  eye vertex must survive exactly and the boss's anchor keeps working on the form. */
function eyeAnchor(node, primitive, skin) {
  const bone = skin.listJoints().find((joint) => joint.getName() === BALGATH_FORM_EYE.bone);
  const anchor = transformPoint(bone.getWorldMatrix(), BALGATH_FORM_EYE.offset);
  const points = skinPositions(node, primitive);
  let best = 0;
  for (let v = 1; v < points.length; v++) {
    if (
      Math.hypot(...points[v].map((p, k) => p - anchor[k])) <
      Math.hypot(...points[best].map((p, k) => p - anchor[k]))
    )
      best = v;
  }
  const distance = Math.hypot(...points[best].map((p, k) => p - anchor[k]));
  const uv = primitive.getAttribute('TEXCOORD_0').getElement(best, [0, 0]);
  return { distance: Number(distance.toFixed(5)), uv: uv.map((value) => Number(value.toFixed(3))) };
}

async function inspectGlb(glbPath) {
  const io = await createNodeIo();
  const bytes = readFileSync(glbPath);
  const document = await io.readBinary(bytes);
  const root = document.getRoot();
  const meshes = root.listMeshes();
  const meshNodes = root.listNodes().filter((node) => node.getMesh());
  const primitives = meshes.flatMap((mesh) => mesh.listPrimitives());
  const primitive = primitives[0];
  const skin = meshNodes[0]?.getSkin() ?? null;
  const indices = primitive?.getIndices();
  const points = primitive ? skinPositions(meshNodes[0], primitive) : [];
  const min = [0, 1, 2].map((k) => Math.min(...points.map((p) => p[k])));
  const max = [0, 1, 2].map((k) => Math.max(...points.map((p) => p[k])));
  let worstWeightSum = 0;
  const weights = primitive?.getAttribute('WEIGHTS_0');
  const w = [0, 0, 0, 0];
  for (let v = 0; weights && v < weights.getCount(); v++) {
    weights.getElement(v, w);
    worstWeightSum = Math.max(worstWeightSum, Math.abs(w[0] + w[1] + w[2] + w[3] - 1));
  }
  return {
    path: path.relative(ROOT, glbPath).split(path.sep).join('/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    meshes: meshes.map((mesh) => mesh.getName()),
    meshNodes: meshNodes.map((node) => node.getName()),
    primitives: primitives.length,
    triangles: indices ? indices.getCount() / 3 : 0,
    vertices: primitive?.getAttribute('POSITION')?.getCount() ?? 0,
    hasJoints1: Boolean(primitive?.getAttribute('JOINTS_1')),
    worstWeightSum,
    joints: skin ? skin.listJoints().map((joint) => joint.getName()) : [],
    jointRest: skin
      ? skin
          .listJoints()
          .map((joint) => [...joint.getTranslation(), ...joint.getRotation(), ...joint.getScale()])
      : [],
    nodeNames: root.listNodes().map((node) => node.getName()),
    animations: root.listAnimations().length,
    skins: root.listSkins().length,
    images: root.listTextures().map((texture) => ({
      name: texture.getName(),
      mimeType: texture.getMimeType(),
      sha256: createHash('sha256').update(texture.getImage()).digest('hex'),
    })),
    extensions: root
      .listExtensionsUsed()
      .map((extension) => extension.extensionName)
      .sort(),
    required: root
      .listExtensionsRequired()
      .map((extension) => extension.extensionName)
      .sort(),
    min,
    max,
    eye: primitive && skin ? eyeAnchor(meshNodes[0], primitive, skin) : null,
    fingerprints: {
      document: root.getExtras()?.sourceFingerprint,
      asset: root.getAsset().extras?.sourceFingerprint,
    },
  };
}

function verifyContract(stats, boss, optimized, sourceFingerprint) {
  const where = stats.path;
  if (optimized) {
    assertCondition(
      stats.bytes <= BALGATH_FORM_MAX_BYTES,
      `${where}: ${stats.bytes} bytes over ${BALGATH_FORM_MAX_BYTES}`,
    );
    assertCondition(stats.extensions.includes('EXT_meshopt_compression'), `${where}: not meshopt`);
    assertCondition(stats.bytes < boss.bytes, `${where}: not lighter than the boss`);
  }
  assertCondition(
    JSON.stringify(stats.meshes) === JSON.stringify([BALGATH_FORM_MESH]) &&
      JSON.stringify(stats.meshNodes) === JSON.stringify([BALGATH_FORM_MESH]),
    `${where}: expected exactly one mesh and node named ${BALGATH_FORM_MESH}`,
  );
  assertCondition(stats.primitives === 1 && stats.skins === 1, `${where}: one skinned primitive`);
  assertCondition(
    stats.triangles > 0 && stats.triangles <= BALGATH_FORM_MAX_TRIANGLES,
    `${where}: ${stats.triangles} triangles over ${BALGATH_FORM_MAX_TRIANGLES}`,
  );
  assertCondition(!stats.hasJoints1, `${where}: more than ${BALGATH_FORM_MAX_INFLUENCES} weights`);
  assertCondition(stats.worstWeightSum < 0.02, `${where}: weights not normalized`);
  assertCondition(stats.animations === 0, `${where}: carries its own clips`);
  assertCondition(stats.joints.length === BALGATH_FORM_JOINT_COUNT, `${where}: joint count`);
  assertCondition(
    JSON.stringify(stats.joints) === JSON.stringify(boss.joints),
    `${where}: joint names or order differ from the boss`,
  );
  assertCondition(
    JSON.stringify(stats.jointRest) === JSON.stringify(boss.jointRest),
    `${where}: a joint rest transform differs from the boss`,
  );
  const bossNodes = boss.nodeNames.map((name) =>
    name === boss.meshNodes[0] ? BALGATH_FORM_MESH : name,
  );
  assertCondition(
    JSON.stringify(stats.nodeNames) === JSON.stringify(bossNodes),
    `${where}: node set differs from the boss (extra or missing nodes)`,
  );
  assertCondition(
    JSON.stringify(stats.images) === JSON.stringify(boss.images),
    `${where}: textures are not the boss's KTX2 textures byte for byte`,
  );
  assertCondition(
    stats.images.length === 3 && stats.images.every((image) => image.mimeType === 'image/ktx2'),
    `${where}: expected the three KTX2 textures`,
  );
  assertCondition(stats.required.includes('KHR_texture_basisu'), `${where}: basisu not required`);
  assertCondition(Math.abs(stats.min[1]) < 1e-3, `${where}: not floor-seated (${stats.min[1]})`);
  for (let k = 0; k < 3; k++) {
    const span = boss.max[k] - boss.min[k];
    assertCondition(
      Math.abs(stats.min[k] - boss.min[k]) <= 0.01 * span &&
        Math.abs(stats.max[k] - boss.max[k]) <= 0.01 * span,
      `${where}: bounds axis ${k} drifted from the boss`,
    );
  }
  assertCondition(
    stats.eye.distance < 0.002 && JSON.stringify(stats.eye.uv) === JSON.stringify(boss.eye.uv),
    `${where}: the eyeGlow anchor no longer sits on the boss's eye vertex`,
  );
  assertCondition(
    stats.fingerprints.document === sourceFingerprint &&
      stats.fingerprints.asset === sourceFingerprint,
    `${where}: source fingerprint changed or is missing`,
  );
}

function runOptimizer(outputRoot) {
  const args = [BUILD_ASSETS, SPEC];
  if (outputRoot) args.push('--output-root', outputRoot);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0)
    throw new Error(`balgath form optimizer failed: ${result.status ?? 'unknown'}`);
}

const sourceFingerprint = balgathFormSourceFingerprint(ROOT);
console.log(`source fingerprint: ${sourceFingerprint}`);
const boss = await inspectGlb(SOURCE);
await writeBlenderSource();
runBlender(await eyeAnchorPoint());
assertCondition(existsSync(BLENDER_RAW), `factory did not write ${BLENDER_RAW}`);
await graft();
await stampSourceFingerprint(RAW, sourceFingerprint);
const raw = await inspectGlb(RAW);
verifyContract(raw, boss, false, sourceFingerprint);
if (!rawOnly) {
  runOptimizer(null);
  runOptimizer(CANDIDATE_ROOT);
  const candidate = path.join(CANDIDATE_ROOT, BALGATH_FORM_FILE);
  const stats = await inspectGlb(SHIPPED);
  verifyContract(stats, boss, true, sourceFingerprint);
  assertCondition(
    readFileSync(candidate).equals(readFileSync(SHIPPED)),
    'balgath_form: deterministic optimized rebuild differs byte for byte',
  );
  const summary = {
    file: BALGATH_FORM_FILE,
    bytes: stats.bytes,
    sha256: stats.sha256,
    sourceFingerprint,
    triangles: stats.triangles,
    vertices: stats.vertices,
    boss: { bytes: boss.bytes, triangles: boss.triangles, vertices: boss.vertices },
    eye: { boss: boss.eye, raw: raw.eye, shipped: stats.eye },
    min: stats.min.map((value) => Number(value.toFixed(4))),
    max: stats.max.map((value) => Number(value.toFixed(4))),
  };
  console.log(JSON.stringify(summary, null, 2));
}
