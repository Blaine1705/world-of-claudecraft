// Pure plan of the Hammer Council's effects (council_fx.ts paints them;
// docs/design/raid/smith_heart.md sections 5.18 and 7.1): how a pillar shows
// its integrity (its cracks, its lean, the pips round its foot), how it bursts
// out of the floor and how it falls, the marks' footprints (Wake the Stone,
// the heir's rising stone, the Falling Rock's soak, Resonance, Hammer's
// Weight) and their colours, the rock's fall, the heroic pulse, the
// inheritance's stream of light, the Wrath holder's gathering energy. The
// sim's numbers are read here, never tuned.
//
// Three-free, DOM-free, deterministic (a hash, never rng).

import { SMITH_HEART_VEIN_COLORS } from '../../sim/content/smith_heart_layout';
import {
  COUNCIL_AURAS,
  COUNCIL_CASTS,
  COUNCIL_CUES,
  COUNCIL_RISE_SPOT,
  COUNCIL_RUBBLE,
  councilPillarOf,
  councilRoleOf,
  COUNCIL_TUNING as T,
} from '../../sim/encounters/smith_heart/council_ids';
import { TELEGRAPH_THREAT_COLORS } from '../floor_telegraph/telegraph_look_core';
import { fxHash } from './hammer_fx_core';

export {
  COUNCIL_AURAS,
  COUNCIL_CASTS,
  COUNCIL_CUES,
  COUNCIL_RISE_SPOT,
  COUNCIL_RUBBLE,
  councilPillarOf,
  councilRoleOf,
};

/** The palette. Every footprint's RIM is a threat colour (the floor
 *  telegraph's rule); the vein's ochre rides the accents and the glows only. */
export const COUNCIL_FX_COLORS = {
  /** The Hammer vein's ochre: seams, threads, the integrity pips. */
  ochre: SMITH_HEART_VEIN_COLORS.hammer,
  /** The cracks' hot core and their dark lip (linear 0..1). */
  crackCore: [1.0, 0.82, 0.48] as const,
  crackEdge: [0.92, 0.42, 0.1] as const,
  crackDark: [0.06, 0.04, 0.03] as const,
  dust: [0.74, 0.64, 0.5] as const,
  dustDark: [0.42, 0.35, 0.27] as const,
  flash: [1.0, 0.8, 0.46] as const,
  /** The soak: a gold to gather in (the Chorus mark's precedent). */
  soak: 0xffc94a,
  /** Wake the Stone: a knockback, the control colour. */
  wake: TELEGRAPH_THREAT_COLORS.control,
  /** The rubble, the heroic pulse, the heir's rising stone: damage. */
  danger: TELEGRAPH_THREAT_COLORS.danger,
  /** Resonance's ring: the vein's hum (an accent, never a damage rim). */
  resonance: 0xf0c070,
  /** Hammer's Weight: the tank's mark, lethal if not swapped. */
  weight: TELEGRAPH_THREAT_COLORS.lethal,
  /** The pips: lit and spent. */
  pipLit: 0xffc66a,
  pipSpent: 0x2a2018,
} as const;

/** The pools the painter keeps (fixed: no allocation in a fight). */
export const COUNCIL_FX_POOLS = {
  pillars: 9,
  fallen: 4,
  rubble: 4,
  marks: 8,
  spots: 4,
  rocks: 2,
  rings: 6,
  weights: 2,
  bolts: 6,
  streams: 4,
  debris: 120,
} as const;

// ---- the pillars ----------------------------------------------------------------------

/** What a pillar's integrity looks like: the crack network's reach (0 none,
 *  1 all of it), its lean (radians, away from its hashed side), how hot its
 *  seams burn, how often grit trickles off it (a second), and whether its
 *  crown is split loose. */
export interface PillarLook {
  crack: number;
  lean: number;
  heat: number;
  grit: number;
  crownLoose: boolean;
}

export function pillarLook(integrity: number): PillarLook {
  if (integrity >= 3) return { crack: 0, lean: 0, heat: 0, grit: 0, crownLoose: false };
  if (integrity === 2)
    return { crack: 0.55, lean: 0.035, heat: 0.45, grit: 1.5, crownLoose: false };
  return { crack: 1, lean: 0.085, heat: 1, grit: 5, crownLoose: true };
}

/** The side a pillar leans toward (sim yaw), fixed per entity. */
export function pillarLeanYaw(id: number): number {
  return fxHash(id, 17) * Math.PI * 2;
}

/** Seconds a pillar takes to burst out of the floor. */
export const PILLAR_RISE_SECONDS = 0.75;

/** A rising pillar `age` seconds in: how far it still stands below its rest
 *  (a share of its height, 1 sunk to 0 risen, overshooting a breath), and its
 *  shudder (yards of jitter). */
export function pillarRise(age: number): { sunk: number; shudder: number } {
  if (age <= 0) return { sunk: 1, shudder: 0.12 };
  const t = Math.min(1, age / PILLAR_RISE_SECONDS);
  // Fast out of the floor, a breath of overshoot, settle.
  const ease = 1 - (1 - t) ** 3;
  const over = t < 1 ? Math.sin(t * Math.PI) * 0.04 : 0;
  return { sunk: Math.max(-0.03, 1 - ease - over), shudder: (1 - t) * 0.12 };
}

/** Seconds a fallen pillar takes to tip and break, and the crumble after. */
export const PILLAR_FALL_SECONDS = 1.1;
export const PILLAR_CRUMBLE_SECONDS = 0.8;

/** A falling pillar `age` seconds in: how far it has tipped (radians), how
 *  far it has sunk (a share of its height) and how visible it still is. */
export function pillarFall(age: number): { tip: number; sunk: number; alpha: number } {
  const t = Math.min(1, Math.max(0, age / PILLAR_FALL_SECONDS));
  // The tip accelerates like a felled column.
  const tip = (Math.PI / 2.4) * t * t;
  const c = Math.max(0, age - PILLAR_FALL_SECONDS) / PILLAR_CRUMBLE_SECONDS;
  return { tip, sunk: Math.min(1, t * 0.25 + c * 0.75), alpha: Math.max(0, 1 - c) };
}

/** Seconds a risen pillar takes to sink back at the council's fall. */
export const PILLAR_SETTLE_SECONDS = 1.6;

/** How many of a pillar's three pips burn. */
export function pillarPips(integrity: number): number {
  return Math.max(0, Math.min(T.integrity, integrity));
}

/** A crack's flash after it lost a piece (0 to 1 over its seconds). */
export function crackFlash(age: number): number {
  if (age < 0 || age > 0.9) return 0;
  return age < 0.08 ? age / 0.08 : Math.max(0, 1 - (age - 0.08) / 0.82);
}

/** How hard a pillar shakes while a Resonance is cracking it (`share` of
 *  the 3 s stood, 0 to 1): yards of jitter and the seams' extra heat. */
export function resonanceShake(share: number, clock: number): { jitter: number; heat: number } {
  const s = Math.max(0, Math.min(1, share));
  if (s <= 0) return { jitter: 0, heat: 0 };
  const hum = 0.5 + 0.5 * Math.sin(clock * (18 + s * 22));
  return { jitter: 0.02 + s * 0.06 * hum, heat: 0.35 + s * 0.65 * hum };
}

// ---- the marks ---------------------------------------------------------------------------

/** A player mark (an aura on them): the footprint it draws round them. */
export interface CouncilMarkSpec {
  radius: number;
  color: number;
  accent: number;
  /** The motes stream in (gather here) or out (keep clear). */
  gather: boolean;
}

export const COUNCIL_MARK_SPECS: Readonly<Record<string, CouncilMarkSpec>> = {
  [COUNCIL_AURAS.wakeMark]: {
    radius: T.riseKnockRadius,
    color: COUNCIL_FX_COLORS.wake,
    accent: COUNCIL_FX_COLORS.ochre,
    gather: false,
  },
  [COUNCIL_AURAS.rockMark]: {
    radius: T.rockRadius,
    color: COUNCIL_FX_COLORS.soak,
    accent: 0xfff0c0,
    gather: true,
  },
};

/** The heir's rising stone: a locked spot, the knockback's radius, its
 *  warning's seconds. */
export const RISE_SPOT_SPEC = {
  radius: T.riseKnockRadius,
  seconds: T.heirRiseWarn,
  color: COUNCIL_FX_COLORS.danger,
  accent: COUNCIL_FX_COLORS.ochre,
} as const;

/** Fill of a timed mark: 0 as it begins, 1 as it lands. */
export function markFill(remaining: number, duration: number): number {
  if (duration <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - remaining / duration));
}

/** The ghost of the pillar a Wake mark will raise, by the mark's fill: its
 *  height (a share of a risen pillar's) and its glow. */
export function wakeGhost(fill: number): { height: number; glow: number } {
  const f = Math.max(0, Math.min(1, fill));
  return { height: 0.15 + 0.85 * f * f, glow: 0.25 + 0.75 * f };
}

/** Seconds before it lands that the falling rock shows over its soak. */
export const ROCK_FALL_SECONDS = 1.2;
/** How high over the floor the rock starts its fall. */
export const ROCK_FALL_HEIGHT = 20;

/** The falling rock over a soak with `remaining` seconds to go: visible, and
 *  its height over the floor (accelerating down). */
export function rockFall(remaining: number): { visible: boolean; height: number; spin: number } {
  if (remaining > ROCK_FALL_SECONDS || remaining < 0) return { visible: false, height: 0, spin: 0 };
  const t = 1 - remaining / ROCK_FALL_SECONDS;
  return { visible: true, height: ROCK_FALL_HEIGHT * (1 - t * t), spin: t * 4.2 };
}

/** Resonance's ring round a marked player: its radius (the reach a pillar's
 *  face must be within) and its pulse. */
export function resonanceRing(clock: number, cracking: boolean): { radius: number; pulse: number } {
  const speed = cracking ? 9 : 3.2;
  return {
    radius: T.resonanceReach,
    pulse: 0.55 + 0.45 * Math.sin(clock * speed),
  };
}

/** The heroic pulse's ring round a pillar: out to its reach past the face. */
export function pulseRadius(pillarR: number): number {
  return pillarR + T.pulseReach;
}

/** The stream of stone light from a fallen member to a survivor: seconds it
 *  takes, and where a mote rides along it at `t` (0 to 1) with a lift. */
export const INHERIT_SECONDS = 2.2;
export function inheritArc(t: number): { along: number; lift: number } {
  const u = Math.max(0, Math.min(1, t));
  return { along: u * u * (3 - 2 * u), lift: Math.sin(u * Math.PI) * 6 };
}

/** The Wrath holder's gathering energy (0 to 100): its glow round the body
 *  and how often embers rise (a second). Above 80 it crackles. */
export function energyLook(energy: number): { glow: number; embers: number; crackle: boolean } {
  const e = Math.max(0, Math.min(1, energy / T.energyMax));
  return { glow: e * e, embers: 2 + e * 14, crackle: e >= 0.8 };
}

/** A Seam Bolt in flight: seconds from the Singer to its mark. */
export const BOLT_SECONDS = 0.38;

/** Hammer's Weight's slam: seconds the stone hammer takes to drop. */
export const WEIGHT_DROP_SECONDS = 0.28;

/** Is this cue one the council's painter draws in full (the renderer's
 *  generic draw of it skipped)? */
export function councilClaims(ability: string | undefined): boolean {
  if (!ability) return false;
  return (
    ability === COUNCIL_CUES.rise ||
    ability === COUNCIL_CUES.crack ||
    ability === COUNCIL_CUES.collapse ||
    ability === COUNCIL_CUES.rockImpact ||
    ability === COUNCIL_CUES.pulse ||
    ability === COUNCIL_CUES.inherit ||
    ability === COUNCIL_CUES.settle ||
    ability === COUNCIL_CASTS.bolt ||
    ability === COUNCIL_CASTS.weight
  );
}
