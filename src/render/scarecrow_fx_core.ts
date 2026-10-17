// Old Thatchgrin's visual layer, the pure half (no Three, no DOM): where his thrown gourd
// flies, how a burning patch of stubble fades in and gutters out, and how much fire a
// patch throws at each quality. scarecrow_fx.ts owns the objects and reads these.
//
// Timing contract with the sim and the clip (seasonal/scarecrow_kit.ts, scarecrow_clips.py):
// the ring goes down at the throw's START and the gourd lands when the ring's windup ends.
// The clip releases at GOURD_RELEASE_SEC, so the gourd is in the air for the rest of the
// windup and lands on the ring's last frame.

export const THATCHGRIN_TEMPLATE = 'gourdlight_thatchgrin';
export const GOURD_ABILITY = 'mob_thatchgrin_gourd';
export const CHAFF_ABILITY = 'mob_thatchgrin_chaff';
export const SUMMON_ABILITY = 'mob_thatchgrin_summon';

/** Seconds into the Throw clip when the gourd leaves his left hand. */
export const GOURD_RELEASE_SEC = 1.0;
/** Seconds into the Summon clip when his arms peak and the crows burst off. */
export const SUMMON_PEAK_SEC = 1.4;
/** Death clip beats: the stakes fold, the heap lands (scarecrow_clips.py death_keys). */
export const DEATH_FOLD_SEC = 1.3;
export const DEATH_HEAP_SEC = 1.9;

/** The left hand at release, in the boss's own frame (world yards at his drawn size):
 *  to his left, out in front, high over his head. */
export const GOURD_HAND_LOCAL = { left: 1.4, forward: 1.6, up: 6.2 } as const;

/** World point of a local (left, forward, up) offset from a body at (x, z) facing `facing`. */
export function bodyLocalToWorld(
  x: number,
  z: number,
  facing: number,
  left: number,
  forward: number,
): { x: number; z: number } {
  // the rig's left is model +X, which a facing of f turns to (cos f, -sin f)
  return {
    x: x + Math.cos(facing) * left + Math.sin(facing) * forward,
    z: z - Math.sin(facing) * left + Math.cos(facing) * forward,
  };
}

/** A lobbed arc from a to b: straight in plan, a parabola over it peaking `apex` above
 *  the higher end at the middle. `t` 0..1. */
export function gourdArc(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number,
  apex: number,
): { x: number; y: number; z: number } {
  const k = Math.max(0, Math.min(1, t));
  const lift = 4 * apex * k * (1 - k);
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k + lift,
    z: a.z + (b.z - a.z) * k,
  };
}

/** How high the lob climbs: a short throw still arcs, a long one arcs higher. */
export function gourdApex(distance: number): number {
  return 2.5 + Math.min(1, distance / 40) * 5.5;
}

/** A burning patch's strength 0..1: it catches over the first 0.35 s, burns steady, and
 *  gutters out over its last 1.2 s. */
export function chaffStrength(age: number, total: number): number {
  if (age < 0 || age >= total) return 0;
  const catchUp = Math.min(1, age / 0.35);
  const left = total - age;
  const gutter = Math.min(1, left / 1.2);
  return catchUp * gutter;
}

/** Flame embers a patch emits per frame call at a quality 0..1 (the floor keeps the patch
 *  readable on the lowest tier: burning ground is something a player acts on). */
export function chaffFlameCalls(quality: number): number {
  return Math.max(3, Math.round(3 + 5 * Math.max(0, Math.min(1, quality))));
}
