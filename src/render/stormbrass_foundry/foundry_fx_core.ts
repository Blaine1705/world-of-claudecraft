// Pure plan for the Stormbrass Foundry's floor telegraphs (foundry_fx.ts):
// which cast or encounter object draws which floor shape, how big, in what
// colour, and how it fills, all derived from the sim's own templates and
// encounter constants so the edge a player dodges is the edge the sim tests.
//
// Three-free, DOM-free, deterministic.

import { MOBS } from '../../sim/data';
import {
  FOUNDRY_BURST_RING,
  FOUNDRY_SCRAP_MARK,
  HAULER_STEAM_BLAST,
  HAULER_TUNING,
} from '../../sim/encounters/stormbrass_foundry/ids';
import {
  FOUNDRY_DEPLOY_TURRET,
  FOUNDRY_FIELD_REPAIR,
  FOUNDRY_PISTON_SLAM,
  FOUNDRY_STEAM_SCREEN,
} from '../../sim/mob/trash_kit/foundry_cast_ids';
import { TELEGRAPH_ACCENTS, TELEGRAPH_THREAT_COLORS } from '../floor_telegraph/telegraph_look_core';

export type FoundryTelegraphShape = 'cone' | 'sigil';

export interface FoundryTelegraphSpec {
  shape: FoundryTelegraphShape;
  /** Yards: the cone's reach, the sigil's radius. */
  range: number;
  /** Degrees of the cone's arc (360 for a sigil). */
  arcDeg: number;
  /** The threat colour (floor_telegraph TELEGRAPH_THREAT_COLORS). */
  color: number;
  /** The element accent of the motes and the fill front. */
  accent?: number;
}

/** The foundry's own accents: storm lightning, steam, brass. */
export const FOUNDRY_ACCENTS = {
  lightning: 0xcfe8ff,
  steam: 0xe9eef0,
  brass: 0xffd98a,
} as const;

/** Every cast that paints the floor while its bar runs. */
export function foundryTelegraphSpecs(): Readonly<Record<string, FoundryTelegraphSpec>> {
  const slam = MOBS.brass_sentry?.breathCone;
  return {
    [FOUNDRY_PISTON_SLAM]: {
      shape: 'cone',
      range: slam?.range ?? 0,
      arcDeg: slam?.arcDeg ?? 0,
      color: TELEGRAPH_THREAT_COLORS.danger,
      accent: TELEGRAPH_ACCENTS.physical,
    },
    [HAULER_STEAM_BLAST]: {
      shape: 'cone',
      range: HAULER_TUNING.blastRange,
      arcDeg: HAULER_TUNING.blastArcDeg,
      color: TELEGRAPH_THREAT_COLORS.danger,
      accent: FOUNDRY_ACCENTS.steam,
    },
    // The kicks: a glyph under the caster while the bar runs.
    [FOUNDRY_FIELD_REPAIR]: {
      shape: 'sigil',
      range: 1.8,
      arcDeg: 360,
      color: TELEGRAPH_THREAT_COLORS.interrupt,
      accent: FOUNDRY_ACCENTS.lightning,
    },
    [FOUNDRY_STEAM_SCREEN]: {
      shape: 'sigil',
      range: MOBS.shieldbearer_frame?.trashKit?.screen?.radius ?? 8,
      arcDeg: 360,
      color: TELEGRAPH_THREAT_COLORS.interrupt,
      accent: FOUNDRY_ACCENTS.steam,
    },
    // Not a kick: a small brass glyph where the turret will stand.
    [FOUNDRY_DEPLOY_TURRET]: {
      shape: 'sigil',
      range: 1.4,
      arcDeg: 360,
      color: TELEGRAPH_THREAT_COLORS.control,
      accent: FOUNDRY_ACCENTS.brass,
    },
  };
}

export interface FoundryObjectSpec {
  color: number;
  accent: number;
  /** Seconds the ring takes to fill (its moment is at 1). */
  fillSeconds: (radius: number) => number;
}

/** The encounter objects' floor circles (their radius rides `scale`). */
export const FOUNDRY_OBJECT_SPECS: Readonly<Record<string, FoundryObjectSpec>> = {
  // A death burst building where the mob fell: the Hauler's 8 yd rupture
  // takes 2 s, a bruiser's 6 yd boiler 1.5 s (both authored on the templates).
  [FOUNDRY_BURST_RING]: {
    color: TELEGRAPH_THREAT_COLORS.danger,
    accent: FOUNDRY_ACCENTS.steam,
    fillSeconds: (radius) => burstDelayForRadius(radius),
  },
  // A Scrap Toss plate about to land.
  [FOUNDRY_SCRAP_MARK]: {
    color: TELEGRAPH_THREAT_COLORS.danger,
    accent: FOUNDRY_ACCENTS.brass,
    fillSeconds: () => HAULER_TUNING.tossWarning,
  },
};

/** The death-burst delay the templates author for a ring of this radius (the
 *  ring carries only its radius; the delay is read back from the content). */
const delays = new Map<number, number>();

export function burstDelayForRadius(radius: number): number {
  const cached = delays.get(radius);
  if (cached !== undefined) return cached;
  let best = 1.5;
  let bestGap = Infinity;
  for (const t of Object.values(MOBS)) {
    const b = t.trashKit?.deathBurst;
    if (!b || b.delay <= 0) continue;
    const gap = Math.abs(b.radius - radius);
    if (gap < bestGap) {
      bestGap = gap;
      best = b.delay;
    }
  }
  delays.set(radius, best);
  return best;
}

/** Fill of a cast bar (0 at its start, 1 as it lands). */
export function foundryCastFill(castRemaining: number, castTotal: number): number {
  if (castTotal <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - castRemaining / castTotal));
}

/** Fill of a timed object `age` seconds in (1 at its moment). */
export function foundryTimedFill(age: number, seconds: number): number {
  if (seconds <= 0) return 1;
  return Math.min(1, Math.max(0, age / seconds));
}
