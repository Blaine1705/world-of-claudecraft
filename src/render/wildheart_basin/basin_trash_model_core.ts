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

/** The Spore Toad's sim scale (sim/content/wildheart.ts spore_toad). */
export const TOAD_SIM_SCALE = 2.4;

export const TOAD_MODEL = {
  url: 'models/creatures/wildheart_spore_toad.glb',
  /** The Idle pose's skinned bounds (0.5 s in): the claw tips' dip below the
   *  soles to the tops of its eyes. */
  idleMin: -0.107,
  idleTop: 3.783,
  /** Its eyes' tops at Idle (yards): its highest point, over a player's head. */
  eyes: 3.78,
  /** Where the tongue leaves its open mouth on the Snaring Tongue's release
   *  (Tongue at the bar's end, sampled off the shipped clip): yards up and
   *  forward of its origin. */
  mouth: { up: 1.38, forward: 3.45 },
  /** The gaits' reference speeds (planted feet slide at these). */
  walkRef: 2.4,
  runRef: 6,
} as const;

export const TOAD_CLIP = {
  /** Bite: the jaws shut at 0.45. Slam: the chest hits at 0.58. */
  bite: 0.45 + KEY_LEAD,
  slam: 0.58 + KEY_LEAD,
  /** Tongue (the Snaring Tongue's 1.5 s bar, played from its start): the
   *  throat swells to 1.22, the head snaps down the lane and the jaws fly
   *  open at 1.50, held wide through the reel to 2.35, shut by 2.65. */
  tongueFire: 1.5 + KEY_LEAD,
  tongueShut: 2.65 + KEY_LEAD,
  /** Death (the Spore Burst): it bloats, the puffballs burst at 0.85, it lies
   *  flat at 1.45 (at 1x; the look plays it faster). */
  burst: 0.85 + KEY_LEAD,
  flat: 1.45 + KEY_LEAD,
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
