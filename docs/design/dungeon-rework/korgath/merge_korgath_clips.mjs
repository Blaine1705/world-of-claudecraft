// Ship Korgath the Bound's chained clips (korgath_bound_clips.py) as a clip
// donor beside his body (VisualDef.animUrls): his skeleton's nodes and the two
// clips, no mesh, skin or texture. The body (woc_sanctum_korgath.glb, its mesh,
// KTX2 textures and sixteen clips, and the portrait pinned on it) is never
// touched.
//
//   node docs/design/dungeon-rework/korgath/merge_korgath_clips.mjs --decode
//     writes tmp/korgath/korgath_edit.glb (meshopt off, textures dropped) for Blender
//   node docs/design/dungeon-rework/korgath/merge_korgath_clips.mjs
//     reads tmp/korgath/korgath_bound_clips.glb, checks its frame against the
//     body's (BoundRise's last frame must BE Idle's first, bone for bone), and
//     writes BoundKneel and BoundRise to public/models/creatures/woc_sanctum_korgath_bound.glb
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, dequantize, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const BODY = path.join(ROOT, 'public/models/creatures/woc_sanctum_korgath.glb');
const EDIT = path.join(ROOT, 'tmp/korgath/korgath_edit.glb');
const CLIPS = path.join(ROOT, 'tmp/korgath/korgath_bound_clips.glb');
const DONOR = path.join(ROOT, 'public/models/creatures/woc_sanctum_korgath_bound.glb');
export const KORGATH_BOUND_CLIPS = ['BoundKneel', 'BoundRise'];

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

if (process.argv.includes('--decode')) {
  const doc = await io.readBinary(new Uint8Array(readFileSync(BODY)));
  for (const e of doc.getRoot().listExtensionsUsed())
    if (/meshopt|basisu|quantization/.test(e.extensionName)) e.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
  await doc.transform(dequantize());
  writeFileSync(EDIT, await io.writeBinary(doc));
  console.log('wrote', EDIT);
  process.exit(0);
}

// The donor starts as the body, stripped to its skeleton's nodes.
const body = await io.readBinary(new Uint8Array(readFileSync(BODY)));
const clips = await io.readBinary(new Uint8Array(readFileSync(CLIPS)));
const root = body.getRoot();
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];

function firstValue(anim, node, pathName) {
  for (const ch of anim.listChannels()) {
    if (ch.getTargetNode() !== node || ch.getTargetPath() !== pathName) continue;
    const out = ch.getSampler().getOutput();
    return out.getElement(0, []);
  }
  return null;
}
function lastValue(anim, nodeName, pathName) {
  for (const ch of anim.listChannels()) {
    if (ch.getTargetNode()?.getName() !== nodeName || ch.getTargetPath() !== pathName) continue;
    const out = ch.getSampler().getOutput();
    return out.getElement(out.getCount() - 1, []);
  }
  return null;
}

const idle = root.listAnimations().find((a) => a.getName() === 'Idle');
const src = clips.getRoot().listAnimations();
const rise = src.find((a) => a.getName() === 'BoundRise');
if (!idle || !rise) throw new Error('missing Idle or BoundRise');
// The frame check: BoundRise ends on Idle's first frame in the body's own
// joint frames (a bone imported and exported with another rest would differ).
let worst = 0;
const joints = root.listSkins()[0].listJoints();
for (const j of joints) {
  for (const p of ['translation', 'rotation']) {
    const a = firstValue(idle, j, p);
    const b = lastValue(rise, j.getName(), p);
    if (!a || !b) continue;
    let d = 0;
    if (p === 'rotation') {
      const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
      d = 1 - Math.min(1, dot);
    } else d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    worst = Math.max(worst, d);
  }
}
console.log('frame check (worst joint delta at the seam):', worst.toExponential(2));
if (worst > 2e-3) throw new Error('BoundRise does not end on Idle: the joint frames differ');

// Strip the body to the bare skeleton: no mesh, skin, material, texture or
// old clip rides in the donor (the joints keep their names and rest).
const keepJoints = new Set(joints);
function disposeAnimation(a) {
  for (const s of a.listSamplers()) {
    s.getInput()?.dispose();
    s.getOutput()?.dispose();
    s.dispose();
  }
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}
for (const a of root.listAnimations()) if (a.getName() !== 'Idle') disposeAnimation(a);
for (const n of root.listNodes()) {
  n.setMesh(null);
  n.setSkin(null);
}
for (const s of root.listSkins()) s.dispose();
for (const m of root.listMeshes()) m.dispose();
for (const m of root.listMaterials()) m.dispose();
for (const t of root.listTextures()) t.dispose();
for (const e of root.listExtensionsUsed()) if (/basisu/.test(e.extensionName)) e.dispose();

for (const name of KORGATH_BOUND_CLIPS) {
  const from = src.find((a) => a.getName() === name);
  if (!from) throw new Error(`missing ${name}`);
  const to = body.createAnimation(name);
  for (const ch of from.listChannels()) {
    const node = byName.get(ch.getTargetNode()?.getName() ?? '');
    if (!node || !keepJoints.has(node)) continue;
    const s = ch.getSampler();
    const input = body
      .createAccessor()
      .setType('SCALAR')
      .setArray(new Float32Array(s.getInput().getArray()))
      .setBuffer(buffer);
    const output = body
      .createAccessor()
      .setType(s.getOutput().getType())
      .setArray(new Float32Array(s.getOutput().getArray()))
      .setBuffer(buffer);
    const sampler = body
      .createAnimationSampler()
      .setInput(input)
      .setOutput(output)
      .setInterpolation(s.getInterpolation());
    to.addSampler(sampler);
    to.addChannel(
      body
        .createAnimationChannel()
        .setTargetNode(node)
        .setTargetPath(ch.getTargetPath())
        .setSampler(sampler),
    );
  }
  console.log(name, to.listChannels().length, 'channels');
}
disposeAnimation(idle);
await body.transform(
  resample({ tolerance: 1e-4 }),
  prune(),
  dedup(),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  prune(),
);
const bytes = await io.writeBinary(body);
writeFileSync(DONOR, bytes);
console.log('wrote', DONOR, bytes.length);
