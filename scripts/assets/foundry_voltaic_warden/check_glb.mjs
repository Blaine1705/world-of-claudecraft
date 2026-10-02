// Objective checks of the exported Voltaic Warden GLB (authoring aid):
//   node check_glb.mjs <glb>
// Prints meshes, materials, clips with durations, joint count, and for every plate bone the
// rest-pose world direction of its local +Y (the flip axis) and of the plate's outward normal
// (local axis found by matching), so the integration notes state the flip method exactly.
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const [, , file] = process.argv;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.readBinary(fs.readFileSync(file));
const root = doc.getRoot();
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const world = (n) => {
  let m = n.getMatrix();
  let p = n.getParentNode();
  while (p) {
    m = mul(p.getMatrix(), m);
    p = p.getParentNode();
  }
  return m;
};
const col = (m, i) => {
  const v = [m[i * 4], m[i * 4 + 1], m[i * 4 + 2]];
  const l = Math.hypot(...v);
  return v.map((x) => +(x / l).toFixed(3));
};
console.log(
  'meshes',
  root
    .listMeshes()
    .map((m) => `${m.getName()}[${m.listPrimitives().length}]`)
    .join(' '),
);
console.log(
  'materials',
  root
    .listMaterials()
    .map((m) => `${m.getName()}(${m.getAlphaMode()})`)
    .join(' '),
);
let tris = 0;
for (const m of root.listMeshes())
  for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
console.log('triangles', tris);
const skin = root.listSkins()[0];
console.log('joints', skin.listJoints().length);
for (const a of root.listAnimations()) {
  let t = 0;
  for (const s of a.listSamplers()) {
    const arr = s.getInput().getArray();
    t = Math.max(t, arr[arr.length - 1]);
  }
  console.log('clip', a.getName(), t.toFixed(3));
}
for (const j of skin.listJoints()) {
  const n = j.getName();
  if (
    !n.startsWith('Plate_') &&
    !['CoilCore', 'CrownTop', 'L_Hand', 'R_Hand', 'Head', 'Root'].includes(n)
  )
    continue;
  const m = world(j);
  console.log(
    'joint',
    n,
    'pos',
    [m[12], m[13], m[14]].map((x) => +x.toFixed(3)),
    'X',
    col(m, 0),
    'Y',
    col(m, 1),
    'Z',
    col(m, 2),
  );
}
