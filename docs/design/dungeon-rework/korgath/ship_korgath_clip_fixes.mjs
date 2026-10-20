// Ship Korgath the Bound's re-authored maul clips as a clip donor beside his
// body (VisualDef.animUrls): the body's skeleton (with the left hand's finger
// bones, patch_korgath_fingers.mjs) and
//
// - HammerSlam and HammerSweep, authored on the control rig
//   (maul_rig/run_clip.py with spec_slam.py and spec_sweep.py): both hands locked on the haft in real grips, the
//   right fist turned end for end on the haft for the blow, the left fist
//   closed round it;
// - Death, the body's own fall with the right fist kept closed on the haft
//   until the maul leaves it, then opening (the body's clip bent the finger
//   block through the haft).
//
// A donor's clip replaces the body's clip of the same name when the visual is
// prepared (characters/assets.ts). The body's other clips keep their own keys;
// their broken finger curl on the right hand is dropped by the look
// (sanctum_boss_looks.ts clipTrackDrops), so the modeled fist shows.
//
//   node docs/design/dungeon-rework/korgath/ship_korgath_clip_fixes.mjs <authored.glb>
//     writes public/models/creatures/woc_sanctum_korgath_clips.glb
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const BODY = path.join(ROOT, 'public/models/creatures/woc_sanctum_korgath.glb');
const DONOR = path.join(ROOT, 'public/models/creatures/woc_sanctum_korgath_clips.glb');
const AUTHORED = process.argv[2];
const AUTHORED_CLIPS = ['HammerSlam', 'HammerSweep'];
// The bone the seam check skips: the right fingers (the body's Idle curl is
// dropped by the look, so the authored rest fist is what Idle shows). The new
// finger bones are skipped too (no body clip keys them).
const SEAM_FREE = new Set(['fingers.r']);
/** The right fist opens this far (degrees) once the maul has left it. */
const DEATH_OPEN_DEG = 25;

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

function disposeAnimation(a) {
  for (const s of a.listSamplers()) s.dispose();
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}

const body = await io.readBinary(new Uint8Array(readFileSync(BODY)));
const authored = await io.readBinary(new Uint8Array(readFileSync(AUTHORED)));
const root = body.getRoot();
const skin = root
  .listNodes()
  .find((n) => n.getName() === 'Korgath')
  .getSkin();
const joints = new Set(skin.listJoints());
const byName = new Map(root.listNodes().map((n) => [n.getName(), n]));
const buffer = root.listBuffers()[0];
const fingerBones = [...joints].map((j) => j.getName()).filter((n) => /\.\d\.l$/.test(n));
if (fingerBones.length !== 15) throw new Error('the body has no left-hand finger bones yet');
const bodyClip = (name) => root.listAnimations().find((a) => a.getName() === name);

// The authored rig's rest transforms are the body's (the same Blender rig).
const aNodes = new Map(
  authored
    .getRoot()
    .listNodes()
    .map((n) => [n.getName(), n]),
);
let worstRest = 0;
for (const j of joints) {
  const a = aNodes.get(j.getName());
  if (!a) throw new Error(`the authored rig has no ${j.getName()}`);
  const q = j.getRotation();
  const r = a.getRotation();
  const dot = Math.abs(q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3]);
  worstRest = Math.max(worstRest, 1 - Math.min(1, dot));
  const t = j.getTranslation();
  const u = a.getTranslation();
  worstRest = Math.max(worstRest, Math.hypot(t[0] - u[0], t[1] - u[1], t[2] - u[2]));
}
console.log('authored rig vs body rest, worst', worstRest.toExponential(2));
if (worstRest > 1e-3) throw new Error('the authored rig is not the body rig');

function sampleAt(anim, nodeName, pathName, t) {
  const ch = anim
    .listChannels()
    .find((c) => c.getTargetNode()?.getName() === nodeName && c.getTargetPath() === pathName);
  if (!ch) return null;
  const inp = ch.getSampler().getInput();
  const out = ch.getSampler().getOutput();
  let k = 0;
  while (k < inp.getCount() - 1 && inp.getScalar(k + 1) <= t + 1e-6) k++;
  return out.getElement(k, []);
}

// Seam check: each authored clip starts and ends on the body's Idle frame 0.
const idle = bodyClip('Idle');
for (const name of AUTHORED_CLIPS) {
  const a = authored
    .getRoot()
    .listAnimations()
    .find((x) => x.getName() === name);
  if (!a) {
    console.log('(not authored yet)', name);
    continue;
  }
  const T = Math.max(...a.listSamplers().map((s) => s.getInput().getMax([])[0]));
  let worst = 0;
  let where = '';
  for (const j of joints) {
    const n = j.getName();
    if (SEAM_FREE.has(n) || fingerBones.includes(n)) continue;
    const i0 = sampleAt(idle, n, 'rotation', 0) ?? j.getRotation();
    for (const t of [0, T]) {
      const r = sampleAt(a, n, 'rotation', t);
      if (!r) continue;
      const d =
        1 - Math.min(1, Math.abs(i0[0] * r[0] + i0[1] * r[1] + i0[2] * r[2] + i0[3] * r[3]));
      if (d > worst) {
        worst = d;
        where = `${n}@${t}`;
      }
    }
  }
  console.log(name, 'length', T.toFixed(3), 'seam worst', worst.toExponential(2), where);
  if (worst > 2e-3) throw new Error(`${name} does not start and end on Idle`);
}

// The Idle fist curl (its axis opens the fist in Death), read before the strip.
const idleFistCurl = sampleAt(idle, 'fingers.r', 'rotation', 0);
// Strip the body to its skeleton.
const keepDeath = bodyClip('Death');
const deathData = keepDeath.listChannels().map((ch) => ({
  node: ch.getTargetNode(),
  path: ch.getTargetPath(),
  interp: ch.getSampler().getInterpolation(),
  input: Array.from(ch.getSampler().getInput().getArray()),
  output: (() => {
    const o = ch.getSampler().getOutput();
    const out = [];
    for (let i = 0; i < o.getCount(); i++) out.push(...o.getElement(i, []));
    return out;
  })(),
  size: ch.getSampler().getOutput().getElementSize(),
  type: ch.getSampler().getOutput().getType(),
}));
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

function addChannel(anim, node, pathName, interp, input, output, type) {
  const inp = body
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Float32Array(input))
    .setBuffer(buffer);
  const out = body
    .createAccessor()
    .setType(type)
    .setArray(new Float32Array(output))
    .setBuffer(buffer);
  const sampler = body
    .createAnimationSampler()
    .setInput(inp)
    .setOutput(out)
    .setInterpolation(interp);
  anim.addSampler(sampler);
  anim.addChannel(
    body.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(sampler),
  );
}

// The authored clips, every joint keyed.
for (const name of AUTHORED_CLIPS) {
  const from = authored
    .getRoot()
    .listAnimations()
    .find((x) => x.getName() === name);
  if (!from) continue;
  const to = body.createAnimation(name);
  for (const ch of from.listChannels()) {
    const node = byName.get(ch.getTargetNode()?.getName() ?? '');
    if (!node || !joints.has(node)) continue;
    const s = ch.getSampler();
    const o = s.getOutput();
    const out = [];
    for (let i = 0; i < o.getCount(); i++) out.push(...o.getElement(i, []));
    addChannel(
      to,
      node,
      ch.getTargetPath(),
      s.getInterpolation(),
      s.getInput().getArray(),
      out,
      o.getType(),
    );
  }
  console.log(name, to.listChannels().length, 'channels');
}

// Death: the body's fall, the right fist closed until the maul leaves it.
{
  const death = body.createAnimation('Death');
  const hammerT = deathData.find((d) => d.node.getName() === 'hammer' && d.path === 'translation');
  // The body re-seats the maul in the fist in its first 0.3 s as he buckles;
  // it leaves the fist when it starts to fall away after that.
  const settle = hammerT.input.findIndex((t) => t >= 0.3);
  const t0 = hammerT.output.slice(settle * 3, settle * 3 + 3);
  let release = hammerT.input[hammerT.input.length - 1];
  for (let i = settle; i < hammerT.input.length; i++) {
    const v = hammerT.output.slice(i * 3, i * 3 + 3);
    if (Math.hypot(v[0] - t0[0], v[1] - t0[1], v[2] - t0[2]) > 0.05) {
      release = hammerT.input[i];
      break;
    }
  }
  const fr = byName.get('fingers.r');
  const rest = new THREE.Quaternion().fromArray(fr.getRotation());
  if (!idleFistCurl) throw new Error('no Idle fist curl');
  const idleCurl = new THREE.Quaternion().fromArray(idleFistCurl);
  const d = rest.clone().invert().multiply(idleCurl);
  const axis = new THREE.Vector3(d.x, d.y, d.z).normalize();
  const open = rest
    .clone()
    .multiply(new THREE.Quaternion().setFromAxisAngle(axis, (-DEATH_OPEN_DEG * Math.PI) / 180));
  console.log('Death: the maul leaves the fist at', release.toFixed(3), 's');
  for (const ch of deathData) {
    if (ch.node.getName() === 'fingers.r' && ch.path === 'rotation') {
      const out = [];
      for (const t of ch.input) {
        const u = Math.min(1, Math.max(0, (t - release) / 0.3));
        const k = u * u * (3 - 2 * u);
        out.push(...rest.clone().slerp(open, k).toArray());
      }
      addChannel(death, ch.node, ch.path, 'LINEAR', ch.input, out, ch.type);
      continue;
    }
    addChannel(death, ch.node, ch.path, ch.interp, ch.input, ch.output, ch.type);
  }
}

await body.transform(
  resample({ tolerance: 1e-4 }),
  prune({ keepLeaves: true }),
  dedup(),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
const bytes = await io.writeBinary(body);
writeFileSync(DONOR, bytes);
console.log('wrote', DONOR, bytes.length);
