// Pure plan for the Wildheart Basin's encounter visuals (basin_fx.ts): which
// cast paints which floor shape, how big, in which threat colour and how it
// fills (every number from the sim's own tuning and templates, so the edge a
// player dodges is the edge the sim tests), the encounter objects' looks, and
// the timelines of the creature effects (the Earthshaking Stomp's ground
// shock, the Tail Swipe's sweep, the howdah breaking, the Saurian's enrage,
// the Sunbone Totem's pulse rings, the Spore Burst cloud, the Entangling Lash's
// vines, the Pounce trail).
//
// Three-free, DOM-free, deterministic.

import { MOBS } from '../../sim/data';
import {
  GREAT_SAURIAN_ID,
  SAURIAN_STOMP,
  SAURIAN_TAIL_SWIPE,
  SAURIAN_TUNING,
  WILDHEART_SPORE_CLOUD,
} from '../../sim/encounters/wildheart_basin/ids';
import {
  WILDHEART_ANCESTRAL_SAP,
  WILDHEART_ENTANGLING_LASH,
} from '../../sim/mob/trash_kit/wildheart_cast_ids';
import {
  TELEGRAPH_ACCENTS,
  TELEGRAPH_THREAT_COLORS,
  telegraphFillOf,
} from '../floor_telegraph/telegraph_look_core';

export type BasinTelegraphShape = 'cone' | 'ring' | 'lane' | 'sigil';

export interface BasinTelegraphSpec {
  shape: BasinTelegraphShape;
  /** Yards: the cone's reach, the ring's radius, the lane's length. */
  range: number;
  /** Degrees of the cone's arc (360 for a ring). */
  arcDeg: number;
  /** A lane's half width (yards). */
  halfWidth?: number;
  /** Radians added to the caster's facing (the Tail Swipe strikes behind). */
  yawOffset: number;
  /** The threat colour (floor_telegraph TELEGRAPH_THREAT_COLORS). */
  color: number;
  /** The element accent of the motes and the fill front. */
  accent?: number;
}

/** The basin's element accents (motes and fill fronts only, never the rim). */
export const BASIN_ACCENTS = {
  ...TELEGRAPH_ACCENTS,
  /** Living vine and thorn. */
  vine: 0xb8ff8a,
  /** The Gorgebloom's and the Spore Toad's pollen. */
  pollen: 0xe8e05a,
  /** Zulgar's jade spirit flame. */
  spirit: 0x5fe0a0,
} as const;

/** Every cast of the basin that paints the floor while its bar runs. */
export function basinTelegraphSpecs(): Readonly<Record<string, BasinTelegraphSpec>> {
  const lash = MOBS.vine_lasher?.trashKit?.line;
  return {
    // The tail sweeps a rear cone: orange (avoidable damage and a throw).
    [SAURIAN_TAIL_SWIPE]: {
      shape: 'cone',
      range: SAURIAN_TUNING.tailRange,
      arcDeg: SAURIAN_TUNING.tailArcDeg,
      yawOffset: Math.PI,
      color: TELEGRAPH_THREAT_COLORS.danger,
      accent: BASIN_ACCENTS.physical,
    },
    // The stomp knocks everyone down: violet (control), the whole ring.
    [SAURIAN_STOMP]: {
      shape: 'ring',
      range: SAURIAN_TUNING.stompRadius,
      arcDeg: 360,
      yawOffset: 0,
      color: TELEGRAPH_THREAT_COLORS.control,
      accent: BASIN_ACCENTS.physical,
    },
    // The lash roots whoever stands in its lane: violet (control).
    [WILDHEART_ENTANGLING_LASH]: {
      shape: 'lane',
      range: lash?.length ?? 0,
      arcDeg: 0,
      halfWidth: lash?.halfWidth ?? 1,
      yawOffset: 0,
      color: TELEGRAPH_THREAT_COLORS.control,
      accent: BASIN_ACCENTS.vine,
    },
    // The kickable heal marks its caster (a glyph turning under its feet).
    [WILDHEART_ANCESTRAL_SAP]: {
      shape: 'sigil',
      range: 1.8,
      arcDeg: 360,
      yawOffset: 0,
      color: TELEGRAPH_THREAT_COLORS.interrupt,
      accent: BASIN_ACCENTS.spirit,
    },
  };
}

/** The encounter objects' floor looks (scale = radius). */
export const BASIN_OBJECT_SPECS: Readonly<
  Record<string, { color: number; accent: number; seconds: number }>
> = {
  [WILDHEART_SPORE_CLOUD]: {
    color: TELEGRAPH_THREAT_COLORS.danger,
    accent: BASIN_ACCENTS.pollen,
    seconds: MOBS.spore_toad?.trashKit?.deathCloud?.seconds ?? 6,
  },
};

/** Fill of a cast telegraph in [0, 1] (the sim's own bar). */
export function basinCastFill(castRemaining: number, castTotal: number): number {
  return telegraphFillOf(castRemaining, castTotal);
}

/** How strongly a standing cloud draws `elapsed` seconds after it rose: in at
 *  once (it is a hazard from its first tick), thinning only at its very end. */
export function cloudPresence(elapsed: number, seconds: number): number {
  if (elapsed < 0) return 0;
  const fadeIn = Math.min(1, elapsed / 0.25);
  const left = seconds - elapsed;
  const fadeOut = left <= 0 ? 0.35 : Math.min(1, 0.35 + left / 1.2);
  return fadeIn * fadeOut;
}

// ---- the Great Saurian's body (the placeholder look; manifest grows it) ---------

/** The Saurian's drawn proportions per unit of its sim scale: the back the
 *  howdah sits on, the hips the tail leaves from, the reach of its feet. */
export const SAURIAN_DRAW = {
  /** Body height per sim scale unit (yards). */
  height: 4.2,
  /** The howdah's seat over its back, as a share of the height. */
  back: 0.86,
  /** Behind its centre to its hips, per scale unit. */
  hips: 1.2,
  /** Radius its legs churn the ford, per scale unit. */
  wade: 1.6,
} as const;

/** The Saurian's back (where the howdah rides) in instance space. */
export function saurianBackPoint(
  pos: { x: number; y: number; z: number },
  scale: number,
): [number, number, number] {
  return [pos.x, pos.y + SAURIAN_DRAW.height * scale * SAURIAN_DRAW.back, pos.z];
}

/** The point the tail leaves its body, behind it. */
export function saurianHipPoint(
  pos: { x: number; y: number; z: number },
  facing: number,
  scale: number,
): [number, number, number] {
  const k = SAURIAN_DRAW.hips * scale;
  return [
    pos.x - Math.sin(facing) * k,
    pos.y + SAURIAN_DRAW.height * scale * 0.4,
    pos.z - Math.cos(facing) * k,
  ];
}

/** Every mob that churns the ford's water, and how wide (yards). */
export function waderRadius(templateId: string, scale: number): number {
  if (templateId === GREAT_SAURIAN_ID) return SAURIAN_DRAW.wade * scale;
  return 0;
}

// ---- effect timelines ---------------------------------------------------------------

/** The Stomp's ground shock: a ring racing out to the stomp's radius and on a
 *  little past it, fading; `elapsed` seconds after the impact. */
export const STOMP_SHOCK_SECONDS = 0.9;
export function stompShock(elapsed: number): { radius: number; alpha: number } {
  const t = Math.max(0, Math.min(1, elapsed / STOMP_SHOCK_SECONDS));
  const ease = 1 - (1 - t) ** 3;
  return { radius: SAURIAN_TUNING.stompRadius * (0.15 + 1.05 * ease), alpha: (1 - t) ** 1.4 };
}

/** The Totem's healing pulse: a green-gold ring out to its reach. */
export const TOTEM_PULSE_RADIUS = MOBS.sunbone_totem?.trashKit?.pulse?.radius ?? 12;
export const TOTEM_PULSE_SECONDS = 1.1;
export function totemPulse(elapsed: number): { radius: number; alpha: number } {
  const t = Math.max(0, Math.min(1, elapsed / TOTEM_PULSE_SECONDS));
  return { radius: TOTEM_PULSE_RADIUS * (0.1 + 0.9 * Math.sqrt(t)), alpha: (1 - t) * 0.9 };
}

/** The vines climbing a rooted player: 0 as the root lands, 1 grown. */
export function entangleGrowth(elapsed: number): number {
  const t = Math.max(0, Math.min(1, elapsed / 0.35));
  return 1 - (1 - t) ** 2;
}

/** Seconds a Pounce leaves its trail behind the leaping raptor. */
export const POUNCE_TRAIL_SECONDS = 1.1;

/** The enrage's breathing glow (0..1) at clock `t`. */
export function enrageGlow(t: number): number {
  return 0.65 + 0.35 * Math.sin(t * 6.5) ** 2;
}

/** The jaguar's eyes: a steady burn over the basin, full spirit fire while
 *  Zulgar fights (a colour write on the kit's eyes material). */
export function jaguarEyesBurn(zulgarEngaged: boolean, t: number): number {
  return zulgarEngaged ? 0.85 + 0.15 * Math.sin(t * 3.1) : 0.42;
}
