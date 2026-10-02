// Arm posture of a Balgath GLB clip, read off the file the game loads: how far each
// elbow is bent and which way each palm faces.
//
//   node scripts/assets/balgath_cyclops/arm_posture.mjs <glb> [Clip,Clip]
//
// The owner's report after the tremor fix: the arms hung "in a straight line", the
// shoulders read as pushed forward and the palms faced backward. Measured, every rest
// pose was a locked elbow (3.6 degrees of bend, the solver's full reach) with the
// elbow turned out, which rolls the whole arm inward: the palm pointed 60 degrees
// off his thigh, mostly behind him. A relaxed heavy arm hangs with the elbow bent
// and behind him, the palm on the thigh and the thumb forward.
//
//   elbowBend   degrees between the upper arm and the forearm (0 is a straight rod)
//   palmOff     degrees between the palm's normal and "toward his own midline"
//               (0 faces the thigh; 90 faces straight back, forward, up or down)
//   palmBack    the part of the palm's normal that points behind him (-1 .. 1)
//
// The palm's normal is the rest hand's (anatomy.hand_frame: across the hand bone and
// his forward axis) carried by the hand bone, so the rest pose reads 0 by definition
// of "the palm faces the thigh".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptDecoder } from 'meshoptimizer';
import { createGlbIO } from '../../anim/pose_blend.mjs';
import { ARM_JITTER_FPS, worldSampler } from './arm_jitter.mjs';

/** The loops that are a resting carriage of the arms (a blow puts them where it must). */
export const ARM_POSTURE_CLIPS = Object.freeze(['Idle', 'Walk', 'Run']);
/** Degrees: a hanging or swinging arm keeps at least this much elbow. */
export const ELBOW_BEND_MIN = 15;
/** Degrees: the palm stays within this of facing the thigh. */
export const PALM_OFF_MAX = 35;

const rot = (q, v) => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
};
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return a.map((v) => v / l);
};
const deg = (c) => (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
// glTF axes: +Y up, he faces +Z, his left is +X (Blender's -Y forward, +Z up).
const BONE_AXIS = [0, 1, 0];
const FORWARD = [0, 0, 1];

/**
 * Per-frame posture of both arms over one clip, and the clip's extremes. Times are in
 * seconds from the clip's start.
 */
export function clipArmPosture(root, clipName, fps = ARM_JITTER_FPS) {
  const rest = worldSampler(root, null);
  const s = worldSampler(root, clipName);
  const n = Math.max(1, Math.floor(s.duration * fps + 1e-6));
  const out = { clip: clipName, minElbowBend: 180, maxPalmOff: 0, maxPalmBack: -1, frames: [] };
  for (const [side, sign] of [
    ['L_', 1],
    ['R_', -1],
  ]) {
    const restHand = rest.world(`${side}Hand`, 0);
    if (!restHand) continue;
    const down = unit(rot(restHand, BONE_AXIS));
    const width = unit(FORWARD.map((v, i) => v - down[i] * dot(FORWARD, down)));
    // Blender's cross(down, width) * side, in glTF's axes (a proper rotation of them)
    const palmRest = unit(cross(down, width).map((v) => v * sign));
    const palmLocal = rot(qinv(restHand), palmRest);
    for (let f = 0; f <= n; f++) {
      const t = f / fps;
      const upper = rot(s.world(`${side}UpperArm`, t), BONE_AXIS);
      const fore = rot(s.world(`${side}Forearm`, t), BONE_AXIS);
      const palm = rot(s.world(`${side}Hand`, t), palmLocal);
      const elbowBend = deg(dot(unit(upper), unit(fore)));
      const palmOff = deg(-palm[0] * sign);
      const palmBack = -palm[2];
      out.frames.push({ side, t, elbowBend, palmOff, palmBack });
      out.minElbowBend = Math.min(out.minElbowBend, elbowBend);
      out.maxPalmOff = Math.max(out.maxPalmOff, palmOff);
      out.maxPalmBack = Math.max(out.maxPalmBack, palmBack);
    }
  }
  return out;
}

/** The resting loops whose arms lock straight or turn their palms away, as readable lines. */
export function armPostureFailures(root, clips = ARM_POSTURE_CLIPS) {
  const names = new Set(root.listAnimations().map((a) => a.getName()));
  const fails = [];
  for (const clip of clips) {
    if (!names.has(clip)) continue;
    const p = clipArmPosture(root, clip);
    if (p.minElbowBend < ELBOW_BEND_MIN) {
      fails.push(
        `${clip}: an elbow straightens to ${p.minElbowBend.toFixed(1)} degrees (min ${ELBOW_BEND_MIN})`,
      );
    }
    if (p.maxPalmOff > PALM_OFF_MAX) {
      fails.push(
        `${clip}: a palm turns ${p.maxPalmOff.toFixed(1)} degrees off the thigh (max ${PALM_OFF_MAX})`,
      );
    }
  }
  return fails;
}

const isMain =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [, , file, only] = process.argv;
  if (!file) {
    console.error('usage: arm_posture.mjs <glb> [Clip,Clip]');
    process.exit(1);
  }
  await MeshoptDecoder.ready;
  const root = (await createGlbIO().readBinary(fs.readFileSync(file))).getRoot();
  const clips = only ? only.split(',') : ARM_POSTURE_CLIPS;
  for (const clip of clips) {
    const p = clipArmPosture(root, clip);
    const first = p.frames.filter((f) => f.t === 0);
    console.log(
      `POSTURE ${clip.padEnd(8)} elbowBend min=${p.minElbowBend.toFixed(1)} palmOff max=${p.maxPalmOff.toFixed(1)} palmBack max=${p.maxPalmBack.toFixed(2)} | t=0 ${first.map((f) => `${f.side} bend=${f.elbowBend.toFixed(1)} off=${f.palmOff.toFixed(1)} back=${f.palmBack.toFixed(2)}`).join(' ')}`,
    );
  }
  const fails = armPostureFailures(root, clips);
  for (const f of fails) console.log('FAIL', f);
  console.log('POSTURE_FAILS', fails.length);
  process.exitCode = fails.length ? 1 : 0;
}
