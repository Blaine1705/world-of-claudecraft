// Build greyjaw's bespoke attack clip (issue #2889 round 2). greyjaw (the
// Mirefen Marsh named rare wolf boss, manifest key literally "greyjaw", not
// to be confused with mob_wolf on the same WOLF_BAKED ClipMap) currently
// shares WOLF_BAKED's plain Attack, the same swing mob_wolf and form_ghost_wolf (the
// shaman Shadewolf) still play. greyjaw.glb (rebuilt on the wolf rig by
// scripts/assets/wolf_rig/, its own skeleton fitted to his body) ships bonus
// donor clips besides the ones the game plays: Bark, Howl, "Idle Alert", Sneak.
// This authors a genuinely dramatic bespoke attack by pose-sample-and-blend
// (scripts/anim/pose_blend.mjs) off Howl and the rig's own Attack: a
// rear-back, head-raised howl windup into the lunge. No Blender: same
// technique, same module, as scripts/build_stag_anims.mjs.
//
// WOLF_BAKED itself (and mob_wolf, form_ghost_wolf) is NOT touched: this task only
// overrides greyjaw's own ClipMap. greyjaw already ships and wires BOTH
// Idle_HitReact_Left and Idle_HitReact_Right (via animal()), so no
// hit-variety work is needed or possible here: this is attack-only.
//
//   Greyjaw_Attack: rear back into the howl windup with the head raised, then
//   into the lunge windup, pounce impact, follow-through, settle back to idle.
//   Reads as an intimidating howl-then-pounce, clearly more dramatic than the
//   plain Attack every other WOLF_BAKED user (mob_wolf, form_ghost_wolf) still
//   plays.
//
// Grounding. The rig's own clips plant their paws, but a blend between two
// different clips' poses does not: easing from the standing idle into the
// sitting howl swung the hind legs 7 cm under the ground. So the howl and the
// lunge play as their own clips (sampled every frame, retimed), blends happen
// only across the two clip changes, and every frame is then lifted by exactly
// what the skinned body dips under the Idle's ground (scripts/assets/wolf_rig/
// skin_pose.mjs skins it with the game's own glTF math). tests/wolf_rig.test.ts
// pins the result.
//
// Usage: node scripts/build_greyjaw_anims.mjs [--preview]
// Output: public/models/creatures/greyjaw_ability_anims.glb (0 meshes/
// skins, 1 clip: Greyjaw_Attack)
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dedup, prune } from '@gltf-transform/functions';
import {
  bakeClip,
  blendValue,
  createGlbIO,
  easeInOutQuad,
  easeOutCubic,
  indexClip,
  samplePose,
  stripToAnimationsOnly,
} from './anim/pose_blend.mjs';
import {
  idleGround,
  lowestByRegion,
  poseToLocal,
  rigOf,
  worldUpFor,
} from './assets/wolf_rig/skin_pose.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOURCE = resolve(ROOT, 'public/models/creatures/greyjaw.glb');
const OUT = resolve(ROOT, 'public/models/creatures/greyjaw_ability_anims.glb');
const PREVIEW_OUT = resolve(ROOT, 'tmp/greyjaw_anims_preview.glb');
const PREVIEW = process.argv.includes('--preview');
const FPS = 30;

const io = createGlbIO();
const doc = await io.read(SOURCE);
const root = doc.getRoot();
const rig = rigOf(root);

const idleIdx = indexClip(root, 'Idle');
const howlIdx = indexClip(root, 'Howl');
const attackIdx = indexClip(root, 'Attack');

const allKeys = new Set([...idleIdx.keys(), ...howlIdx.keys(), ...attackIdx.keys()]);
const donorFor = (key) => attackIdx.get(key) ?? howlIdx.get(key) ?? idleIdx.get(key);

// greyjaw.glb is built by scripts/assets/wolf_rig/, which ships only the tracks
// that move: a channel a clip leaves out holds its node's REST value through that
// clip. Every sampled pose is completed with rest values, so a blend never borrows
// another clip's value for a bone this clip keeps still.
function restValue(key) {
  const [name, path] = key.split('|');
  const node = rig.byName.get(name);
  if (path === 'translation') return node.getTranslation();
  if (path === 'rotation') return node.getRotation();
  return node.getScale();
}
const at = (clipIndex, t) => {
  const pose = samplePose(clipIndex, t);
  return new Map([...allKeys].map((key) => [key, pose.get(key) ?? restValue(key)]));
};
const blend = (a, b, u) =>
  new Map([...allKeys].map((key) => [key, blendValue(key, a.get(key), b.get(key), u)]));

// The timeline, one row per frame: [time, pose]. Clip times are within each
// donor's real duration (Idle 1.333s, Howl 2.333s, Attack 0.867s).
const HOWL_PEAK = 1.2; // head raised, full howl
const rows = [];
function span(fromTime, toTime, poseAt) {
  const n = Math.round((toTime - fromTime) * FPS);
  for (let i = rows.length ? 1 : 0; i <= n; i++) {
    rows.push([fromTime + (i / n) * (toTime - fromTime), poseAt(i / n)]);
  }
}
// rear back into the howl windup and raise the head: the Howl itself, played faster
span(0, 0.75, (u) => at(howlIdx, HOWL_PEAK * u));
// out of the howl into the lunge windup
span(0.75, 0.95, (u) => blend(at(howlIdx, HOWL_PEAK), at(attackIdx, 0.15), easeOutCubic(u)));
span(0.95, 1.2, (u) => at(attackIdx, 0.15 + 0.4 * u)); // the pounce to its impact
span(1.2, 1.4, (u) => at(attackIdx, 0.55 + 0.25 * u)); // follow-through
// settle back to the idle stance
span(1.4, 1.7, (u) => blend(at(attackIdx, 0.8), at(idleIdx, 0.3), easeInOutQuad(u)));

// Lift every frame out of the ground: the Pelvis carries the whole skin, so
// raising it straight up by the dip puts the lowest point back on the ground.
const ground = idleGround(rig, root);
const up = worldUpFor(rig, 'Pelvis');
let maxLift = 0;
let maxLiftAt = 0;
for (const [time, pose] of rows) {
  const low = Math.min(...Object.values(lowestByRegion(rig, poseToLocal(rig, pose))));
  const dip = ground - low;
  if (dip <= 0) continue;
  pose.set(
    'Pelvis|translation',
    pose.get('Pelvis|translation').map((v, k) => v + up[k] * dip),
  );
  if (dip > maxLift) {
    maxLift = dip;
    maxLiftAt = time;
  }
}

const timeline = rows.map(([time, pose]) => [time, (key) => pose.get(key)]);
const { animation } = bakeClip(doc, {
  clipName: 'Greyjaw_Attack',
  channelKeys: allKeys,
  timeline,
  donorFor,
});
console.log(
  `lifted out of the ground by up to ${(maxLift * 1000).toFixed(1)} mm (at ${maxLiftAt.toFixed(2)} s)`,
);

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
