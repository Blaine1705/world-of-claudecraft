// Ship Korgath the Bound's re-solved two-hand blows (korgath_two_hand_fix.py)
// as a clip donor beside his body (VisualDef.animUrls): his skeleton's nodes
// and the fixed HammerSlam and HammerSweep, which replace the body's own clips
// of the same names when the visual is prepared (characters/assets.ts: a
// donor's clip wins by name). The body file, its other clips and the portrait
// pinned on it are never touched.
//
//   node docs/design/dungeon-rework/korgath/ship_korgath_clip_fixes.mjs --decode
//     writes tmp/korgath/korgath_edit.glb (meshopt off, textures dropped) for Blender
//   node docs/design/dungeon-rework/korgath/ship_korgath_clip_fixes.mjs
//     reads tmp/korgath/korgath_two_hand_clips.glb and writes
//     public/models/creatures/woc_sanctum_korgath_clips.glb
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
const FIXED = path.join(ROOT, 'tmp/korgath/korgath_two_hand_clips.glb');
const DONOR = path.join(ROOT, 'public/models/creatures/woc_sanctum_korgath_clips.glb');
const CLIPS = ['HammerSlam', 'HammerSweep'];

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

function disposeAnimation(a) {
  for (const s of a.listSamplers()) {
    s.getInput()?.dispose();
    s.getOutput()?.dispose();
    s.dispose();
  }
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}

const body = await io.readBinary(new Uint8Array(readFileSync(BODY)));
const fixed = await io.readBinary(new Uint8Array(readFileSync(FIXED)));
const root = body.getRoot();
const joints = new Set(root.listSkins()[0].listJoints());
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];
const src = fixed.getRoot().listAnimations();

// The seam check: each fixed clip starts and ends exactly where the body's own
// clip does (the IK is faded out at both ends), bone for bone.
function firstOf(anim, nodeName, p, last) {
  for (const ch of anim.listChannels()) {
    if (ch.getTargetNode()?.getName() !== nodeName || ch.getTargetPath() !== p) continue;
    const out = ch.getSampler().getOutput();
    return out.getElement(last ? out.getCount() - 1 : 0, []);
  }
  return null;
}
for (const name of CLIPS) {
  const a = src.find((x) => x.getName() === name);
  if (!a) throw new Error(`missing ${name}`);
  let worst = 0;
  for (const j of joints) {
    const own = root.listAnimations().find((x) => x.getName() === name);
    for (const last of [false, true]) {
      const i0 = firstOf(own, j.getName(), 'rotation', last);
      const r = firstOf(a, j.getName(), 'rotation', last);
      if (!i0 || !r) continue;
      const dot = Math.abs(i0[0] * r[0] + i0[1] * r[1] + i0[2] * r[2] + i0[3] * r[3]);
      worst = Math.max(worst, 1 - Math.min(1, dot));
    }
  }
  console.log(name, 'seam worst', worst.toExponential(2));
  if (worst > 2e-3) throw new Error(`${name} does not start and end as the body's clip`);
}

// Strip the body to its skeleton, then add the fixed clips.
for (const a of root.listAnimations()) disposeAnimation(a);
for (const n of root.listNodes()) {
  n.setMesh(null);
  n.setSkin(null);
}
for (const s of root.listSkins()) s.dispose();
for (const m of root.listMeshes()) m.dispose();
for (const m of root.listMaterials()) m.dispose();
for (const t of root.listTextures()) t.dispose();
for (const e of root.listExtensionsUsed()) if (/basisu/.test(e.extensionName)) e.dispose();
for (const name of CLIPS) {
  const from = src.find((a) => a.getName() === name);
  const to = body.createAnimation(name);
  for (const ch of from.listChannels()) {
    const node = byName.get(ch.getTargetNode()?.getName() ?? '');
    if (!node || !joints.has(node)) continue;
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
