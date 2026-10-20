// Korgath the Bound's left hand gets finger bones (maul_rig/handrig.py): the
// shipped body modeled his left hand open on one fingers.l bone, so it could
// never close on the maul's haft. Blender adds a three-joint chain per finger
// (children of fingers.l) and one for the thumb (child of hand.l), splits the
// old weights over them and exports mesh + rig; this script carries the new
// joints (local rest transforms, inverse binds) and the new JOINTS_0 /
// WEIGHTS_0 into the shipped body. Nothing else changes: positions, normals,
// UVs, textures, materials, the broken-chain meshes and every clip stay the
// body's own, and at rest the new bones leave every vertex where it was.
//
//   node docs/design/dungeon-rework/korgath/patch_korgath_fingers.mjs <export.glb> <split.json> [--write]
//     --write overwrites public/models/creatures/woc_sanctum_korgath.glb;
//     without it the result goes to tmp/korgath_aaa/woc_sanctum_korgath_fingers.glb
//     (run it on the ORIGINAL body: it refuses a body that already has the bones)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const BODY = path.join(ROOT, 'public/models/creatures/woc_sanctum_korgath.glb');
const OUT = process.argv.includes('--write')
  ? BODY
  : path.join(ROOT, 'tmp/korgath_aaa/woc_sanctum_korgath_fingers.glb');
const EXPORT = process.argv[2];
const SPLIT = process.argv[3];
const KORGATH_FINGER_BONES = [];
for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb'])
  for (const i of [1, 2, 3]) KORGATH_FINGER_BONES.push(`${f}.${i}.l`);

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const body = await io.readBinary(new Uint8Array(readFileSync(BODY)));
const exp = await io.readBinary(new Uint8Array(readFileSync(EXPORT)));
const bRoot = body.getRoot();
const eRoot = exp.getRoot();
const buffer = bRoot.listBuffers()[0];
const bNode = new Map(bRoot.listNodes().map((n) => [n.getName(), n]));
const eNode = new Map(eRoot.listNodes().map((n) => [n.getName(), n]));
const m4 = (a) => new THREE.Matrix4().fromArray(a);

// 1. The rigs agree where they overlap (the export round-trips the body's rig).
let worstRig = 0;
for (const [name, n] of bNode) {
  const e = eNode.get(name);
  if (!e) continue;
  const a = n.getWorldMatrix();
  const b = e.getWorldMatrix();
  for (let i = 0; i < 16; i++) worstRig = Math.max(worstRig, Math.abs(a[i] - b[i]));
}
console.log('rig world-matrix worst diff', worstRig.toExponential(2));
if (worstRig > 2e-4) throw new Error('the export rig does not match the body rig');

// 2. New joint nodes under their (body) parents, with the export's local rest.
const bodyMesh = bRoot.listNodes().find((n) => n.getName() === 'Korgath');
const skin = bodyMesh.getSkin();
const expMesh = eRoot.listNodes().find((n) => n.getName() === 'Korgath');
const eSkin = expMesh.getSkin();
const eJoints = eSkin.listJoints();
const eIbm = eSkin.getInverseBindMatrices();
for (const name of KORGATH_FINGER_BONES) {
  if (bNode.has(name)) throw new Error(`${name} already in the body`);
  const e = eNode.get(name);
  const parent = bNode.get(e.getParentNode().getName());
  const n = body
    .createNode(name)
    .setTranslation(e.getTranslation())
    .setRotation(e.getRotation())
    .setScale(e.getScale());
  parent.addChild(n);
  bNode.set(name, n);
}
// Each file's bind space: world = J_world * IBM * p, the same for every joint at
// rest (the body's positions are quantized; its inverse binds carry the scale).
const oldJoints = skin.listJoints();
const oldIbm = skin.getInverseBindMatrices();
const bindSpace = (joints, acc) => {
  const i = joints.findIndex((j) => j.getName() === 'hips');
  return m4(joints[i].getWorldMatrix()).multiply(m4(acc.getElement(i, [])));
};
const meshWb = bindSpace(oldJoints, oldIbm);
const meshWe = bindSpace(eJoints, eIbm);
const ibm = new Float32Array((oldJoints.length + KORGATH_FINGER_BONES.length) * 16);
for (let i = 0; i < oldJoints.length; i++) ibm.set(oldIbm.getElement(i, []), i * 16);
KORGATH_FINGER_BONES.forEach((name, k) => {
  const ei = eJoints.findIndex((j) => j.getName() === name);
  const jw = meshWe.clone().multiply(m4(eIbm.getElement(ei, [])).invert());
  const out = jw.invert().multiply(meshWb);
  ibm.set(out.elements, (oldJoints.length + k) * 16);
  skin.addJoint(bNode.get(name));
});
skin.setInverseBindMatrices(body.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));
const jointIndex = new Map(skin.listJoints().map((j, i) => [j.getName(), i]));

// 3. Skin attributes from the split table (maul_rig/handrig.py, per body vertex
// in glTF order): fingers.l's old weight goes over the finger chains, hand.l's
// over the thumb chain, every other influence stays. Under every old clip a
// finger chain moves exactly as fingers.l and the thumb chain as hand.l, so
// the split (and folding within a family to stay at four influences) leaves
// the old clips' deformation as it was, but for byte rounding.
const { split, co } = JSON.parse(readFileSync(SPLIT, 'utf8'));
const bPrim = bodyMesh.getMesh().listPrimitives()[0];
const bPos = bPrim.getAttribute('POSITION');
const bJ = bPrim.getAttribute('JOINTS_0');
const bW = bPrim.getAttribute('WEIGHTS_0');
const n = bPos.getCount();
const J = new Uint8Array(n * 4);
const W = new Uint8Array(n * 4);
const FAMILY = (name) => (name === 'hand.l' || name.startsWith('thumb.') ? 'T' : 'F');
const oldNames = oldJoints.map((j) => j.getName());
let changed = 0;
// The table's vertex i is the body's vertex i: Blender's import space is an
// affine map of the quantized positions, fitted here (least squares on x, y, z
// separately, Blender z-up: x, -z, y), every residual near zero.
const rows = Object.keys(split).map(Number);
const fit = [0, 1, 2].map((axis) => {
  const A = [];
  const b = [];
  for (const i of rows) {
    const p = bPos.getElement(i, []);
    A.push([p[0], p[1], p[2], 1]);
    b.push(co[i][axis]);
  }
  // normal equations 4x4
  const M = [0, 1, 2, 3].map((r) =>
    [0, 1, 2, 3].map((c) => A.reduce((s, a) => s + a[r] * a[c], 0)),
  );
  const v = [0, 1, 2, 3].map((r) => A.reduce((s, a, k) => s + a[r] * b[k], 0));
  for (let c = 0; c < 4; c++) {
    let piv = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    [v[c], v[piv]] = [v[piv], v[c]];
    for (let r = 0; r < 4; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k < 4; k++) M[r][k] -= f * M[c][k];
      v[r] -= f * v[c];
    }
  }
  return v.map((x, r) => x / M[r][r]);
});
let worstPos = 0;
for (let i = 0; i < n; i++) {
  const oj = bJ.getElement(i, []);
  const ow = bW.getElement(i, []);
  for (let k = 0; k < 4; k++) {
    J[i * 4 + k] = oj[k];
    W[i * 4 + k] = Math.round(ow[k] * 255);
  }
  const row = split[i];
  if (!row) continue;
  const p = bPos.getElement(i, []);
  for (let a = 0; a < 3; a++) {
    const f = fit[a];
    worstPos = Math.max(
      worstPos,
      Math.abs(f[0] * p[0] + f[1] * p[1] + f[2] * p[2] + f[3] - co[i][a]),
    );
  }
  // the body's own bytes per influence: other joints keep theirs exactly, and
  // each family's byte total is shared out inside the family
  const bytes = new Map();
  for (let k = 0; k < 4; k++) {
    const b = Math.round(ow[k] * 255);
    if (b > 0) bytes.set(oldNames[oj[k]], (bytes.get(oldNames[oj[k]]) ?? 0) + b);
  }
  const familyBytes = { F: bytes.get('fingers.l') ?? 0, T: bytes.get('hand.l') ?? 0 };
  bytes.delete('fingers.l');
  bytes.delete('hand.l');
  const hand = new Map(Object.entries(row.new).filter(([, w]) => w > 1e-4));
  while (bytes.size + hand.size > 4) {
    const [small] = [...hand].sort((a, b) => a[1] - b[1])[0];
    const host = [...hand]
      .filter(([k]) => k !== small && FAMILY(k) === FAMILY(small))
      .sort((a, b) => b[1] - a[1])[0];
    if (!host) throw new Error(`vertex ${i}: cannot fold ${small}`);
    hand.set(host[0], host[1] + hand.get(small));
    hand.delete(small);
  }
  if (![...hand.keys()].some((k) => KORGATH_FINGER_BONES.includes(k))) continue;
  const out = [...bytes];
  for (const fam of ['F', 'T']) {
    const members = [...hand].filter(([k]) => FAMILY(k) === fam);
    const total = members.reduce((s, [, w]) => s + w, 0);
    if (!members.length || familyBytes[fam] === 0) continue;
    // largest remainder: the family's bytes split exactly
    const share = members.map(([k, w]) => [k, (w / total) * familyBytes[fam]]);
    const fl = share.map(([k, x]) => [k, Math.floor(x), x - Math.floor(x)]);
    let left = familyBytes[fam] - fl.reduce((s, [, b]) => s + b, 0);
    fl.sort((a, b) => b[2] - a[2]);
    for (const f of fl)
      if (left > 0) {
        f[1]++;
        left--;
      }
    for (const [k, b] of fl) if (b > 0) out.push([k, b]);
  }
  out.sort((a, b) => b[1] - a[1]);
  if (out.length > 4) throw new Error(`vertex ${i}: ${out.length} influences`);
  for (let k = 0; k < 4; k++) {
    J[i * 4 + k] = out[k] ? jointIndex.get(out[k][0]) : 0;
    W[i * 4 + k] = out[k]?.[1] ?? 0;
  }
  changed++;
}
console.log(
  'vertices',
  n,
  'reweighted',
  changed,
  'table position check',
  worstPos.toExponential(2),
);
if (worstPos > 1e-4) throw new Error('the split table is not in the body vertex order');
bPrim.setAttribute('JOINTS_0', body.createAccessor().setType('VEC4').setArray(J).setBuffer(buffer));
bPrim.setAttribute(
  'WEIGHTS_0',
  body.createAccessor().setType('VEC4').setArray(W).setNormalized(true).setBuffer(buffer),
);
bJ.dispose();
bW.dispose();
if (oldIbm.listParents().length <= 1) oldIbm.dispose();
// The same compression the body shipped with, without touching any other accessor.
body
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const bytes = await io.writeBinary(body);
writeFileSync(OUT, bytes);
console.log('wrote', OUT, bytes.length);
