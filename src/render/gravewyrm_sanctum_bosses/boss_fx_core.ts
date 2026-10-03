// The Gravewyrm Sanctum bosses' effect plan (pure): which floor telegraph each
// boss bar lays, the chains' sag, the plates' looks, the shackles' glow, and
// which plates a Grave Breath will burn. Drawn by sanctum_boss_fx.ts; every
// state is read from IWorld entities (casts, auras, encounter object template
// ids and `scale`), so offline and online draw the same thing.
//
// Three-free, DOM-free, deterministic.

import {
  KORGATH_CHAIN_FLAIL,
  KORGATH_MAUL_ARC,
  KORGATH_STOMP,
  KORGATH_THRESHOLD_CHARGE,
  KORGATH_TUNING,
  KORZUL_GRAVE_BREATH,
  KORZUL_GRAVE_INFERNO,
  KORZUL_TAIL_SWEEP,
  KORZUL_TUNING,
  type PlateState,
  plateOf,
} from '../../sim/encounters/gravewyrm_sanctum/boss_ids';
import {
  TELEGRAPH_ACCENTS,
  TELEGRAPH_THREAT_COLORS,
  type TelegraphThreat,
} from '../floor_telegraph/telegraph_look_core';

/** The Sanctum's own colours (motes, glows, fills; never a threat rim). */
export const SANCTUM_COLORS = {
  /** The Smith's rune blue: an intact seal, a whole shackle. */
  smithBlue: 0x6cc8ff,
  /** The cult's goad red: a shackle about to give. */
  goadRed: 0xff3a2a,
  frost: 0xd8f4ff,
  /** Velkhar's soulfire: grave-green with a violet rim. */
  soulfire: 0x9dff7a,
  soulViolet: 0xa76bff,
  /** Korzul's fire: rose-gold at the heart, ember at the edge. */
  wyrmFire: 0xffb46a,
  ember: 0xff6a1a,
  steam: 0xe6eef4,
  meltwater: 0x0b1a24,
} as const;

/** A boss bar's floor telegraph. `rear`: laid behind the caster (a tail). */
export interface SanctumCastSpec {
  shape: 'fan' | 'lane';
  /** Fan arc in degrees (360: a ring). */
  arcDeg: number;
  /** A fan's radius or a lane's length (yards). */
  range: number;
  /** A lane's half width (yards). */
  half: number;
  threat: TelegraphThreat;
  accent: number;
  rear: boolean;
}

const K = KORGATH_TUNING;
const Z = KORZUL_TUNING;

/** Every boss bar that lays a shape on the floor under its caster, by cast
 *  id. (Strain's rings stand at the pillars, the trench at its lane object,
 *  the Plunging Fire and the landing on their plate objects: drawn apart.) */
export const SANCTUM_CAST_SPECS: Readonly<Record<string, SanctumCastSpec>> = {
  [KORGATH_STOMP]: {
    shape: 'fan',
    arcDeg: 360,
    range: K.stompRadius,
    half: 0,
    threat: 'danger',
    accent: TELEGRAPH_ACCENTS.frost,
    rear: false,
  },
  [KORGATH_MAUL_ARC]: {
    shape: 'fan',
    arcDeg: K.maulArcDeg,
    range: K.maulRange,
    half: 0,
    threat: 'danger',
    accent: TELEGRAPH_ACCENTS.physical,
    rear: false,
  },
  [KORGATH_CHAIN_FLAIL]: {
    shape: 'lane',
    arcDeg: 0,
    range: K.flailLength,
    half: K.flailHalfWidth,
    threat: 'danger',
    accent: TELEGRAPH_ACCENTS.frost,
    rear: false,
  },
  [KORGATH_THRESHOLD_CHARGE]: {
    shape: 'lane',
    arcDeg: 0,
    range: K.chargeLength,
    half: K.chargeHalfWidth,
    threat: 'control',
    accent: TELEGRAPH_ACCENTS.physical,
    rear: false,
  },
  [KORZUL_GRAVE_BREATH]: {
    shape: 'fan',
    arcDeg: Z.breathArcDeg,
    range: Z.breathRange,
    half: 0,
    threat: 'lethal',
    accent: SANCTUM_COLORS.wyrmFire,
    rear: false,
  },
  [KORZUL_TAIL_SWEEP]: {
    shape: 'fan',
    arcDeg: Z.tailArcDeg,
    range: Z.tailRange,
    half: 0,
    threat: 'danger',
    accent: TELEGRAPH_ACCENTS.physical,
    rear: true,
  },
  [KORZUL_GRAVE_INFERNO]: {
    shape: 'fan',
    arcDeg: 360,
    range: Z.infernoRadius,
    half: 0,
    threat: 'lethal',
    accent: SANCTUM_COLORS.wyrmFire,
    rear: false,
  },
};

/** The threat colour of a spec (the palette, never the school). */
export function specColor(spec: SanctumCastSpec): number {
  return TELEGRAPH_THREAT_COLORS[spec.threat];
}

/** The floor yaw a spec lays at for a caster facing `facing`. */
export function specYaw(spec: SanctumCastSpec, facing: number): number {
  return spec.rear ? facing + Math.PI : facing;
}

// ---- Korgath's chains -------------------------------------------------------------

/**
 * A point along a chain from its harness anchor (t = 0) to its shackle
 * (t = 1): a catenary-like sag that pulls taut as `tension` rises (0 slack,
 * 1 straining), and shivers while it strains. Writes into `out`.
 */
export function chainPoint(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  t: number,
  tension: number,
  clock: number,
  out: { x: number; y: number; z: number },
): void {
  const span = Math.hypot(bx - ax, bz - az);
  const slack = (1 - Math.min(1, Math.max(0, tension))) * 0.09 + 0.012;
  const sag = 4 * t * (1 - t) * span * slack;
  const shiver = tension > 0.8 ? Math.sin(clock * 47 + t * 19) * 0.05 * (tension - 0.8) * 5 : 0;
  out.x = ax + (bx - ax) * t + shiver * (bz - az) * 0.02;
  out.y = ay + (by - ay) * t - sag + shiver;
  out.z = az + (bz - az) * t - shiver * (bx - ax) * 0.02;
}

/** A chain whipping loose after its break, `k` seconds 0..1 of the whip: the
 *  free end lashes back toward the harness in a sideways S and falls. Returns
 *  how far along the old chain the free end still reaches (1 at the break). */
export function chainWhipReach(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return 1 - 0.78 * (1 - (1 - c) ** 3);
}

/** The shackle's glow from its health share (1 whole: the Smith's blue; down
 *  toward the goad red as it is hammered), and its flicker rate. */
export function shackleGlow(hpShare: number): { r: number; g: number; b: number; flicker: number } {
  const h = Math.min(1, Math.max(0, hpShare));
  const k = 1 - h;
  const blue = [0.42, 0.78, 1.0];
  const red = [1.0, 0.23, 0.16];
  return {
    r: blue[0] + (red[0] - blue[0]) * k,
    g: blue[1] + (red[1] - blue[1]) * k,
    b: blue[2] + (red[2] - blue[2]) * k,
    flicker: 0.6 + 9 * k * k,
  };
}

// ---- Korzul's lake ------------------------------------------------------------------

/** A plate's look from its object's template id: 0 sound, 1 cracked, 2 broken,
 *  and the refreeze still to go (1 just cracked, 0 refreezing; null: never). */
export function plateLook(templateId: string): { state: number; refreeze: number | null } | null {
  const p = plateOf(templateId);
  if (!p) return null;
  const state = p.state === 'sound' ? 0 : p.state === 'cracked' ? 1 : 2;
  return { state, refreeze: p.refreeze };
}

/** The refreeze clock between template steps: the tenths step ticks every 3 s
 *  on a 30 s refreeze, so the ring keeps closing smoothly between them. */
export function refreezeShown(stepShare: number, secondsSinceStep: number): number {
  const perStep = KORZUL_TUNING.refreezeSeconds / 10;
  const floor = Math.max(0, stepShare - 0.1);
  return Math.max(floor, stepShare - secondsSinceStep / (perStep * 10));
}

export interface PlateSpot {
  id: number;
  x: number;
  z: number;
  r: number;
  state: PlateState;
}

/** The plates a Grave Breath from (x, z) along `yaw` will burn: those it
 *  covers (their centre inside the cone, reach widened by the plate's
 *  radius), the nearest first, at most `max`; ties to the lower object id. */
export function breathPlates(
  x: number,
  z: number,
  yaw: number,
  plates: readonly PlateSpot[],
  range = KORZUL_TUNING.breathRange,
  arcDeg = KORZUL_TUNING.breathArcDeg,
  max = KORZUL_TUNING.breathPlates,
): number[] {
  const half = (arcDeg * Math.PI) / 360;
  const hits: { id: number; d: number }[] = [];
  for (const p of plates) {
    if (p.state === 'broken') continue;
    const dx = p.x - x;
    const dz = p.z - z;
    const d = Math.hypot(dx, dz);
    if (d > range + p.r) continue;
    if (d > p.r) {
      let a = Math.atan2(dx, dz) - yaw;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      // The cone's edge may clip the plate: widen by the plate's half angle.
      if (Math.abs(a) > half + Math.asin(Math.min(1, p.r / d))) continue;
    }
    hits.push({ id: p.id, d });
  }
  hits.sort((a, b) => a.d - b.d || a.id - b.id);
  return hits.slice(0, max).map((h) => h.id);
}

/** The plate a point stands on: the nearest plate centre within its radius
 *  plus a seam's slack, or -1 on the shelf. */
export function plateUnder(x: number, z: number, plates: readonly PlateSpot[]): number {
  let best = -1;
  let bestD = Infinity;
  for (const p of plates) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d <= p.r * 1.15 && d < bestD) {
      best = p.id;
      bestD = d;
    }
  }
  return best;
}

/** Grave Inferno's pulse fill: the bar's elapsed share stepped to its four
 *  pulses (each pulse floods the ring a quarter brighter). */
export function infernoLevel(fill: number): number {
  const n = KORZUL_TUNING.infernoPulses;
  return Math.min(n, Math.floor(fill * n + 1e-6)) / n;
}

/** The landing shadow's spread over its warning (0 a speck, 1 the full ring). */
export function shadowGrowth(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return 0.25 + 0.75 * c * c;
}

/** An Unquenched ring's countdown share (1 as it sinks, 0 as it rises). */
export function unquenchedLeft(seconds: number, riseDelay = 4): number {
  return Math.min(1, Math.max(0, 1 - seconds / riseDelay));
}
