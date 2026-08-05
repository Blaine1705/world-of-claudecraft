// Build the priest's ability-specific spellcast clips (issue #2889: the class
// has exactly ONE attackByAbility override today, renew, a raw donor clip
// with no baking, so the other 9 abilities in its kit all play the same
// 2H_Melee_Attack_Chop, player_priest in src/render/characters/manifest.ts).
// This authors 7 distinct casts by pose-sample-and-blend (see scripts/anim/
// pose_blend.mjs, the technique behind the hunter's bow_anims.glb and the
// mage's mage_ability_anims.glb) off donor poses already baked into the
// SAME physical rig the mage and warlock share, mage.glb, but with priest-only
// clip names and a priest-only thematic read: this is a THIRD, independent
// ability-anims GLB sampling the same source file, not a reuse of the mage's
// clips (see the manifest wiring note on player_priest).
//
// The priest's 10-ability kit splits mostly by school (src/sim/content/
// classes.ts): 6 holy abilities (5 heal/buff/shield, 1 direct-damage smite)
// and 3 shadow abilities (all direct damage or drain). The holy heal/buff
// side reads as a slow, benevolent, sustained "offering" (raise both hands
// and give the light, never a strike); the shadow side reads as a sharper,
// more clinical gesture (a quick dark flick or a committed forward mental
// blast), the same holy/shadow motion-quality split issue #2889's own
// batch 1 used for the mage's fire/frost read. Smite sits between the two:
// still holy (an aimed point, not a strike), but more decisive than a heal.
//
//   Cast_Heal       (lesser_heal, heal) slow full raise, a sustained two-hand
//                   offering hold, soft settle: no release snap at all, this
//                   is a gift, not an attack.
//   Cast_FlashHeal  (flash_heal) the SAME benevolent quality as Cast_Heal,
//                   compressed to a third of the duration: differentiated by
//                   tempo, not violence, the same way Cast_Fire and
//                   Cast_Frost differ by urgency in the mage's batch.
//   Cast_Ward       (power_word_fortitude, power_word_shield) both cast
//                   instantly: a quick two-arm raise into a defensive guard,
//                   a short hold while the ward sets, then a soft settle.
//   Cast_Smite      (smite) holy damage: raise a hand to call the light, then
//                   an aimed point forward, a decisive judgement but still
//                   an aim, not a strike.
//   Cast_ShadowWord (shadow_word_pain) instant cast: a quick, sharp diagonal
//                   flick, dark and clinical, the fastest clip in the set.
//   Cast_MindBlast  (mind_blast) a committed forward one-hand strike with a
//                   held anticipation beat first: reads as focused, forceful
//                   psychic force, sharper than Smite.
//   Cast_MindFlay   (mind_flay) a channeled drain: extend a hand toward the
//                   target and hold, three small pulses (matching the
//                   ability's own 3 ticks) before releasing.
//
// Donor clips sampled from mage.glb: Idle, Spellcast_Raise, Spellcasting,
// Spellcast_Shoot, Block, Cheer, 1H_Melee_Attack_Chop,
// 1H_Melee_Attack_Slice_Diagonal, Dualwield_Melee_Attack_Chop,
// 2H_Ranged_Shoot. Every one of these except Idle/Spellcast_Raise/
// Spellcasting/Spellcast_Shoot is otherwise unused by any player_priest,
// player_mage, or player_warlock ClipMap entry today (kaykit() only wires
// idle/walk/run/attack/death/hit/emote names, none of which are these), so
// this is genuinely free raw material, the same standing as the elemental
// script's reuse of golelingevolved.glb's unwired No/Yes gestures.
//
// Usage: node scripts/build_priest_ability_anims.mjs [--preview]
// Output: public/models/chars/players/priest_ability_anims.glb (0 meshes/
// skins, 7 clips: Cast_Heal, Cast_FlashHeal, Cast_Ward, Cast_Smite,
// Cast_ShadowWord, Cast_MindBlast, Cast_MindFlay)
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
const SOURCE = resolve(ROOT, 'public/models/chars/players/mage.glb');
const OUT = resolve(ROOT, 'public/models/chars/players/priest_ability_anims.glb');
const PREVIEW_OUT = resolve(ROOT, 'tmp/priest_ability_anims_preview.glb');
const PREVIEW = process.argv.includes('--preview');

const io = createGlbIO();
const doc = await io.read(SOURCE);
const root = doc.getRoot();

const idleIdx = indexClip(root, 'Idle');
const raiseIdx = indexClip(root, 'Spellcast_Raise');
const castIdx = indexClip(root, 'Spellcasting');
const shootIdx = indexClip(root, 'Spellcast_Shoot');
const blockIdx = indexClip(root, 'Block');
const cheerIdx = indexClip(root, 'Cheer');
const chop1hIdx = indexClip(root, '1H_Melee_Attack_Chop');
const diagIdx = indexClip(root, '1H_Melee_Attack_Slice_Diagonal');
const dualIdx = indexClip(root, 'Dualwield_Melee_Attack_Chop');
const rangedIdx = indexClip(root, '2H_Ranged_Shoot');

const allKeys = new Set([
  ...idleIdx.keys(),
  ...raiseIdx.keys(),
  ...castIdx.keys(),
  ...shootIdx.keys(),
  ...blockIdx.keys(),
  ...cheerIdx.keys(),
  ...chop1hIdx.keys(),
  ...diagIdx.keys(),
  ...dualIdx.keys(),
  ...rangedIdx.keys(),
]);
const donorFor = (key) =>
  raiseIdx.get(key) ??
  cheerIdx.get(key) ??
  castIdx.get(key) ??
  shootIdx.get(key) ??
  blockIdx.get(key) ??
  chop1hIdx.get(key) ??
  diagIdx.get(key) ??
  dualIdx.get(key) ??
  rangedIdx.get(key) ??
  idleIdx.get(key);

// Donor poses, sampled once at chosen timestamps within each clip's real
// duration (Idle 1.067s, Spellcast_Raise 2.100s, Spellcasting 0.667s,
// Spellcast_Shoot 0.933s, Block 1.067s, Cheer 1.667s, 1H_Melee_Attack_Chop
// 1.067s, 1H_Melee_Attack_Slice_Diagonal 1.000s, Dualwield_Melee_Attack_Chop
// 1.267s, 2H_Ranged_Shoot 1.067s).
const P_idle = samplePose(idleIdx, 0.3);
const P_raiseEarly = samplePose(raiseIdx, 0.3); // starting to lift a hand
const P_raiseHold = samplePose(raiseIdx, 1.8); // sustained ready pose near the tail
const P_castLoop = samplePose(castIdx, 0.3); // mid-loop channel pose
const P_shootRelease = samplePose(shootIdx, 0.7); // full release / follow-through
const P_blockGuard = samplePose(blockIdx, 0.5); // two-arm defensive guard
const P_cheerHold = samplePose(cheerIdx, 1.0); // sustained joyous two-hand raise
const P_chopWind = samplePose(chop1hIdx, 0.2); // one-hand windup, drawing back
const P_chopImpact = samplePose(chop1hIdx, 0.65); // committed one-hand forward release
const P_diagWind = samplePose(diagIdx, 0.15); // quick sharp draw
const P_diagImpact = samplePose(diagIdx, 0.55); // quick sharp release
const P_dualReach = samplePose(dualIdx, 0.5); // both-hand extend toward target
const P_rangedPoint = samplePose(rangedIdx, 0.5); // staff pointed forward, aimed

// Donor clips from this rig don't all animate the same channel set (e.g.
// 2H_Melee_Attack_Chop or Spellcasting drop a few bones full-body clips like
// Idle animate), so a single donor pose is an incomplete fallback for a
// multi-donor blend (pose_blend.mjs mergePoses doc): merge every donor pose
// used below once so every channel any of them animates has SOME fallback
// value instead of null-ing out mid-blend.
const P_all = mergePoses(
  P_idle,
  P_raiseEarly,
  P_raiseHold,
  P_castLoop,
  P_shootRelease,
  P_blockGuard,
  P_cheerHold,
  P_chopWind,
  P_chopImpact,
  P_diagWind,
  P_diagImpact,
  P_dualReach,
  P_rangedPoint,
);

const animations = [];

function bake(clipName, timeline) {
  const { animation } = bakeClip(doc, { clipName, channelKeys: allKeys, timeline, donorFor });
  animations.push(animation);
}

// --- Cast_Heal: slow full raise, sustained two-hand offering, soft settle -
// No release snap: this is a gift, not an attack.
{
  const t = [[0, (k) => poseValue(P_idle, k, P_raiseEarly)]];
  pushPoseRamp(t, {
    fromTime: 0,
    toTime: 0.35,
    steps: 5,
    ease: easeOutCubic,
    fromPose: P_idle,
    toPose: P_raiseEarly,
    fallback: P_all,
  });
  pushPoseRamp(t, {
    fromTime: 0.35,
    toTime: 0.8,
    steps: 5,
    ease: easeOutCubic,
    fromPose: P_raiseEarly,
    toPose: P_raiseHold,
    fallback: P_all,
  });
  pushPoseRamp(t, {
    fromTime: 0.8,
    toTime: 1.3,
    steps: 5,
    ease: easeInOutQuad,
    fromPose: P_raiseHold,
    toPose: P_cheerHold,
    fallback: P_all,
  });
  pushPoseRamp(t, {
    fromTime: 1.3,
    toTime: 1.8,
    steps: 5,
    ease: easeInOutQuad,
    fromPose: P_cheerHold,
    toPose: P_idle,
    fallback: P_all,
  });
  bake('Cast_Heal', t);
}

// --- Cast_FlashHeal: the same benevolent read as Cast_Heal, at urgent tempo
{
  const t = [[0, (k) => poseValue(P_idle, k, P_raiseEarly)]];
  pushPoseRamp(t, {
    fromTime: 0,
    toTime: 0.15,
    steps: 3,
    ease: easeOutCubic,
    fromPose: P_idle,
    toPose: P_raiseEarly,
    fallback: P_all,
  });
  pushPoseRamp(t, {
    fromTime: 0.15,
    toTime: 0.35,
    steps: 3,
    ease: easeOutCubic,
    fromPose: P_raiseEarly,
    toPose: P_cheerHold,
    fallback: P_all,
  });
  pushPoseRamp(t, {
    fromTime: 0.35,
    toTime: 0.55,
    steps: 3,
    ease: easeOutCubic,
    fromPose: P_cheerHold,
    toPose: P_shootRelease,
    fallback: P_all,
  });
  pushPoseRamp(t, {
    fromTime: 0.55,
    toTime: 0.85,
    steps: 4,
    ease: easeInOutQuad,
    fromPose: P_shootRelease,
    toPose: P_idle,
    fallback: P_all,
  });
  bake('Cast_FlashHeal', t);
}

// --- Cast_Ward: quick two-arm raise into a defensive guard, brief hold, settle
{
  const t = [[0, (k) => poseValue(P_idle, k, P_blockGuard)]];
  pushPoseRamp(t, {
    fromTime: 0,
    toTime: 0.2,
    steps: 3,
    ease: easeOutCubic,
    fromPose: P_idle,
    toPose: P_blockGuard,
    fallback: P_all,
  });
  t.push([0.4, (k) => poseValue(P_blockGuard, k, P_all)]); // hold while the ward sets
  pushPoseRamp(t, {
    fromTime: 0.4,
    toTime: 0.75,
    steps: 4,
    ease: easeInOutQuad,
    fromPose: P_blockGuard,
    toPose: P_idle,
    fallback: P_all,
  });
  bake('Cast_Ward', t);
}

// --- Cast_Smite: raise a hand to call the light, an aimed point, settle ---
// Holy damage: more decisive than a heal, but still an aim, not a strike.
{
  const t = [[0, (k) => poseValue(P_idle, k, P_raiseEarly)]];
  pushPoseRamp(t, {
    fromTime: 0,
    toTime: 0.25,
    steps: 4,
    ease: easeOutCubic,
    fromPose: P_idle,
    toPose: P_raiseEarly,
    fallback: P_all,
  });
  pushPoseRamp(t, {
    fromTime: 0.25,
    toTime: 0.55,
    steps: 4,
    ease: easeOutCubic,
    fromPose: P_raiseEarly,
    toPose: P_rangedPoint,
    fallback: P_all,
  });
  t.push([0.7, (k) => poseValue(P_rangedPoint, k, P_all)]); // beat of impact
  pushPoseRamp(t, {
    fromTime: 0.7,
    toTime: 1.05,
    steps: 5,
    ease: easeInOutQuad,
    fromPose: P_rangedPoint,
    toPose: P_idle,
    fallback: P_all,
  });
  bake('Cast_Smite', t);
}

// --- Cast_ShadowWord: a quick, sharp diagonal flick, dark and clinical ----
{
  const t = [[0, (k) => poseValue(P_idle, k, P_diagWind)]];
  pushPoseRamp(t, {
    fromTime: 0,
    toTime: 0.12,
    steps: 2,
    ease: easeOutCubic,
    fromPose: P_idle,
    toPose: P_diagWind,
    fallback: P_all,
  });
  pushPoseRamp(t, {
    fromTime: 0.12,
    toTime: 0.28,
    steps: 3,
    ease: easeOutCubic,
    fromPose: P_diagWind,
    toPose: P_diagImpact,
    fallback: P_all,
  });
  pushPoseRamp(t, {
    fromTime: 0.28,
    toTime: 0.55,
    steps: 4,
    ease: easeInOutQuad,
    fromPose: P_diagImpact,
    toPose: P_idle,
    fallback: P_all,
  });
  bake('Cast_ShadowWord', t);
}

// --- Cast_MindBlast: a committed forward strike, held anticipation first --
// Sharper and more forceful than Cast_Smite: focused psychic force.
{
  const t = [[0, (k) => poseValue(P_idle, k, P_chopWind)]];
  pushPoseRamp(t, {
    fromTime: 0,
    toTime: 0.3,
    steps: 4,
    ease: easeOutCubic,
    fromPose: P_idle,
    toPose: P_chopWind,
    fallback: P_all,
  });
  t.push([0.5, (k) => poseValue(P_chopWind, k, P_all)]); // anticipation beat, focusing
  pushPoseRamp(t, {
    fromTime: 0.5,
    toTime: 0.8,
    steps: 4,
    ease: easeOutCubic,
    fromPose: P_chopWind,
    toPose: P_chopImpact,
    fallback: P_all,
  });
  pushPoseRamp(t, {
    fromTime: 0.8,
    toTime: 1.2,
    steps: 5,
    ease: easeInOutQuad,
    fromPose: P_chopImpact,
    toPose: P_idle,
    fallback: P_all,
  });
  bake('Cast_MindBlast', t);
}

// --- Cast_MindFlay: extend a hand and hold, three pulses (the 3 drain ticks)
{
  const t = [[0, (k) => poseValue(P_idle, k, P_dualReach)]];
  pushPoseRamp(t, {
    fromTime: 0,
    toTime: 0.25,
    steps: 4,
    ease: easeOutCubic,
    fromPose: P_idle,
    toPose: P_dualReach,
    fallback: P_all,
  });
  let cursor = 0.25;
  const pulse = (from, to, dur) => {
    pushPoseRamp(t, {
      fromTime: cursor,
      toTime: cursor + dur,
      steps: 2,
      ease: easeInOutQuad,
      fromPose: from,
      toPose: to,
      fallback: P_all,
    });
    cursor += dur;
  };
  for (let i = 0; i < 3; i++) {
    pulse(P_dualReach, P_castLoop, 0.12);
    pulse(P_castLoop, P_dualReach, 0.12);
  }
  pushPoseRamp(t, {
    fromTime: cursor,
    toTime: cursor + 0.3,
    steps: 4,
    ease: easeInOutQuad,
    fromPose: P_dualReach,
    toPose: P_idle,
    fallback: P_all,
  });
  bake('Cast_MindFlay', t);
}

if (PREVIEW) {
  await io.write(PREVIEW_OUT, doc);
  console.log(`wrote preview (mesh + skin + all 7 clips): ${PREVIEW_OUT}`);
}

stripToAnimationsOnly(doc, animations);
await doc.transform(prune(), dedup());
await io.write(OUT, doc);

const kept = root.listAnimations().map((a) => a.getName());
console.log(`wrote ${OUT}`);
console.log(`clips (${kept.length}): ${kept.join(', ')}`);
