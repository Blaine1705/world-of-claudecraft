// The Wildheart Basin trash's Blender bodies, measured (scripts/assets/
// wildheart_basin_raptor and its siblings, the delivery notes, and the shipped
// GLBs): the facts their looks (characters/wildheart_creature_looks.ts) and the
// hunt's effects (basin_trash_fx_core.ts: the heights its glows and anchors
// ride) key on. Each body is drawn at its authored size: one model yard per
// game yard at the template's sim scale.
//
// Model space: yards at the authored size, glTF axes: +Y up, the body faces
// +Z, its LEFT is +X; the origin on the ground under the body. Clip times are
// seconds in the shipped clips (their first key one 24 fps frame in: every
// authored beat sits KEY_LEAD later).
//
// Three-free, DOM-free, deterministic.

import { KEY_LEAD } from './gorgebloom_model_core';

/** The Basin Raptor's sim scale (sim/content/wildheart.ts basin_raptor). */
export const RAPTOR_SIM_SCALE = 1.7;

export const RAPTOR_MODEL = {
  url: 'models/creatures/wildheart_basin_raptor.glb',
  /** The Idle pose's skinned bounds (0.5 s in): the soles to the crest's tips
   *  (the head itself tops out lower, see `head`). */
  idleMin: -0.002,
  idleTop: 5.167,
  /** The skull's top at Idle (yards): nearly twice a 2.6 yd player. */
  head: 4.5,
  /** The gaits' reference speeds (planted feet slide at these). */
  walkRef: 2.6,
  runRef: 8,
} as const;

export const RAPTOR_CLIP = {
  /** Bite: the jaws snap shut at 0.42, a tearing shake to 0.75. */
  bite: 0.42 + KEY_LEAD,
  /** Slash: the sickle cuts down through the target at 0.46. */
  slash: 0.46 + KEY_LEAD,
  /** Pounce (the trash kit's leap, flown by the sim over 0.6 s from the
   *  windup's tick): airborne from its first frame, the feet strike at 0.60. */
  pounceLand: 0.6 + KEY_LEAD,
  /** Screech (the Pack Frenzy gesture and its flourish): peaks at 0.55. */
  screechPeak: 0.55 + KEY_LEAD,
  /** Death: the body hits the ground at 1.10, the head at 1.30. */
  deathBody: 1.1 + KEY_LEAD,
} as const;

/** The Pounce's rate: its feet strike on the last tick of the sim's flight
 *  (`seconds`, the leap kit's own). */
export function raptorPounceRate(seconds: number): number {
  return seconds > 0 ? RAPTOR_CLIP.pounceLand / seconds : 1;
}

/** The def height (pivot to the Idle bounds' top at sim scale 1) that draws a
 *  model at its authored size at sim `scale`. */
export function trashLookHeight(m: { idleMin: number; idleTop: number }, scale: number): number {
  return (m.idleTop - m.idleMin) / scale;
}

/** The def hover that keeps the authored ground on the pivot. */
export function trashLookHover(m: { idleMin: number }, scale: number): number {
  return m.idleMin / scale;
}
