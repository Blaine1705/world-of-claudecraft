// Build the choir thrall family's bespoke attack clip (issue #2889).
// mob_choir_thrall shares the literal FLOATING ClipMap object, by reference,
// with several unrelated families in src/render/characters/manifest.ts, so a
// Drowned Litany choir thrall "attacks" with the exact same Headbutt/Punch
// as an alpaca-plain fish spirit or a flying demon imp. Authors one distinct
// clip by pose-sample-and-blend (scripts/anim/pose_blend.mjs), the same
// technique as scripts/build_elemental_anims.mjs.
//
// Rig choice: mob_choir_thrall and mob_ghost both use ghost.glb; mob_glub
// uses the separate glubevolved.glb. Inspecting both GLBs' own donor clips
// (both ship the identical FLOATING clip-name set: Death, Fast_Flying,
// Flying_Idle, Headbutt, HitReact, No, Punch, Yes) found ghost.glb has
// consistently richer spare donor material: its Headbutt clip animates 26
// bone nodes including full per-finger articulation (Index/Middle/Pinky/
// Thumb, 2 joints each side) plus 4 torso segments, where glubevolved.glb's
// Headbutt only animates 9 nodes (a wingtip-and-torso wobble, no hands at
// all, since the glub rig has wings instead of arms). The gap holds across
// every clip pair (Punch 18 nodes vs 9, No/Yes 11 vs 10, Flying_Idle 10 vs
// 9). ghost.glb's hands give this attack real grasping material a
// choir-thrall reach-and-chant deserves; glubevolved.glb's rig physically
// cannot produce that gesture. Picked mob_choir_thrall for that reason.
//
//   ChoirThrall_Attack: draw back into a windup (Punch's own early lean),
//   sway unsettlingly side to side (the unused "No" head-shake, read here as
//   a droning chant sway), lunge into a full reach with the fully-articulated
//   fingers spread into a grasp (Punch's late lunge pose), snap the head down
//   sharply on contact (the unused "Yes" nod, read as a silent shriek), then
//   settle back to the hover idle. Reads as a "reaching claw chant", distinct
//   from the plain Headbutt/Punch every other FLOATING-sharing mob still
//   plays.
//
// Usage: node scripts/build_choir_thrall_anims.mjs [--preview]
// Output: public/models/creatures/choir_thrall_ability_anims.glb (0 meshes/
// skins, 1 clip: ChoirThrall_Attack)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedup, prune } from '@gltf-transform/functions';
import {
  bakeClip,
  createGlbIO,
  easeInOutQuad,
  easeOutCubic,
  indexClip,
  mergePoses,
  poseValue,
  pushPoseRamp,
  samplePose,
  stripToAnimationsOnly,
} from './anim/pose_blend.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, 'public/models/creatures/ghost.glb');
const OUT = resolve(ROOT, 'public/models/creatures/choir_thrall_ability_anims.glb');
const PREVIEW_OUT = resolve(ROOT, 'tmp/choir_thrall_anims_preview.glb');
const PREVIEW = process.argv.includes('--preview');

const io = createGlbIO();
const doc = await io.read(SOURCE);
const root = doc.getRoot();

const idleIdx = indexClip(root, 'Flying_Idle');
const punchIdx = indexClip(root, 'Punch');
const noIdx = indexClip(root, 'No');
const yesIdx = indexClip(root, 'Yes');

const allKeys = new Set([...idleIdx.keys(), ...punchIdx.keys(), ...noIdx.keys(), ...yesIdx.keys()]);
const donorFor = (key) =>
  punchIdx.get(key) ?? yesIdx.get(key) ?? noIdx.get(key) ?? idleIdx.get(key);

// Donor poses, sampled within each clip's real duration (Flying_Idle 1.167s,
// Punch 1.167s, No 1.167s, Yes 1.167s).
const P_idle = samplePose(idleIdx, 0.3);
const P_windup = samplePose(punchIdx, 0.15); // early lean-back before the lunge
const P_sway = samplePose(noIdx, 0.5); // droning side-to-side chant sway
const P_reach = samplePose(punchIdx, 0.75); // full forward lunge, fingers spread into a grasp
const P_snap = samplePose(yesIdx, 0.5); // downward head snap on contact

// ghost.glb's Punch animates 10 finger-bone channels (and a Torso channel)
// that Flying_Idle does not touch at all, and No/Yes both animate a Neck
// channel Flying_Idle skips, so a single donor pose is an incomplete
// fallback for this multi-donor blend (pose_blend.mjs mergePoses doc): merge
// every donor pose used below once so every channel any of them animates has
// SOME fallback value instead of null-ing out mid-blend.
const P_all = mergePoses(P_idle, P_windup, P_sway, P_reach, P_snap);

const timeline = [[0, (k) => poseValue(P_idle, k, P_windup)]];
pushPoseRamp(timeline, {
  fromTime: 0,
  toTime: 0.22,
  steps: 4,
  ease: easeOutCubic,
  fromPose: P_idle,
  toPose: P_windup,
  fallback: P_all,
});
pushPoseRamp(timeline, {
  fromTime: 0.22,
  toTime: 0.42,
  steps: 3,
  ease: easeInOutQuad,
  fromPose: P_windup,
  toPose: P_sway,
  fallback: P_all,
});
pushPoseRamp(timeline, {
  fromTime: 0.42,
  toTime: 0.68,
  steps: 5,
  ease: easeOutCubic,
  fromPose: P_sway,
  toPose: P_reach,
  fallback: P_all,
});
pushPoseRamp(timeline, {
  fromTime: 0.68,
  toTime: 0.85,
  steps: 3,
  ease: easeOutCubic,
  fromPose: P_reach,
  toPose: P_snap,
  fallback: P_all,
});
pushPoseRamp(timeline, {
  fromTime: 0.85,
  toTime: 1.15,
  steps: 5,
  ease: easeInOutQuad,
  fromPose: P_snap,
  toPose: P_idle,
  fallback: P_all,
});

const { animation } = bakeClip(doc, {
  clipName: 'ChoirThrall_Attack',
  channelKeys: allKeys,
  timeline,
  donorFor,
});

if (PREVIEW) {
  await io.write(PREVIEW_OUT, doc);
  console.log(`wrote preview (mesh + skin + clip): ${PREVIEW_OUT}`);
}

stripToAnimationsOnly(doc, [animation]);
await doc.transform(prune(), dedup());
await io.write(OUT, doc);

const kept = root.listAnimations().map((a) => a.getName());
console.log(`wrote ${OUT}`);
console.log(`clips (${kept.length}): ${kept.join(', ')}`);
