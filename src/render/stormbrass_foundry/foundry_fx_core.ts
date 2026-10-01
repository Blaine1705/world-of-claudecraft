// Pure plan for the Stormbrass Foundry's floor telegraphs (foundry_fx.ts):
// which cast or encounter object draws which floor shape, how big, in what
// colour, and how it fills, all derived from the sim's own templates and
// encounter constants so the edge a player dodges is the edge the sim tests.
// Phase 2 adds the four bosses: the press strip, the shells, the coil strikes,
// the fists, the cells and the hatch ring, the aura glyphs (a marked player, a
// cell carrier), the plating rings, the Stored Charge ring and the belts.
//
// Three-free, DOM-free, deterministic.

import { MAIN_LINE_BELTS } from '../../sim/content/stormbrass_foundry_layout';
import { MOBS } from '../../sim/data';
import {
  DRAFT_ARM_SWEEP,
  DRAFT_CELL_CARRY,
  DRAFT_TREMOR_STEP,
  DRAFT_TUNING,
  DRAFT_UNBOLT,
  FOUNDRY_BELT_TEMPLATES,
  FOUNDRY_BURST_RING,
  FOUNDRY_CELL_TEMPLATES,
  FOUNDRY_COIL_STRIKE_MARK,
  FOUNDRY_FIST_MARK,
  FOUNDRY_HATCH_TEMPLATES,
  FOUNDRY_PRESS_STRIP,
  FOUNDRY_SCRAP_MARK,
  FOUNDRY_SHELL_MARK,
  FOUNDRY_SHRAPNEL,
  HAULER_STEAM_BLAST,
  HAULER_TUNING,
  RANGE_TARGET_LOCK,
  RANGE_TUNING,
  TOCK_LEVER,
  TOCK_TUNING,
  VOLTAIC_CHARGED,
  VOLTAIC_FLIP,
  VOLTAIC_GROUNDED,
  VOLTAIC_TUNING,
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

/** The boss fights' own floor colours: the things you WANT to stand on or
 *  carry (a cell, the open hatch) read apart from every threat colour, and
 *  the plating's two faces are unmistakable (copper-green against blue). */
export const FOUNDRY_MECHANIC_COLORS = {
  /** A Storm Cell on the floor, and the crackle round its carrier. */
  cell: 0x5fd0ff,
  /** The Core Hatch's ring: shut (dim), shuddering, open (gold: go). */
  hatchClosed: 0x5d6b7a,
  hatchWarn: 0xffc83a,
  hatchOpen: 0xffe066,
  /** The plating rings under the Voltaic Warden and its drones. */
  grounded: 0x4fd18b,
  charged: 0x5fb6ff,
  /** The Stored Charge filling round the Warden's feet. */
  stored: 0xeaf4ff,
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
    // ---- the bosses -----------------------------------------------------------
    // Tock's klaxon: a glyph under him while the belts are about to reverse.
    [TOCK_LEVER]: {
      shape: 'sigil',
      range: 2.5,
      arcDeg: 360,
      color: TELEGRAPH_THREAT_COLORS.control,
      accent: FOUNDRY_ACCENTS.brass,
    },
    // The Voltaic Warden's rattle: the plates are about to flip.
    [VOLTAIC_FLIP]: {
      shape: 'sigil',
      range: 3,
      arcDeg: 360,
      color: TELEGRAPH_THREAT_COLORS.control,
      accent: FOUNDRY_ACCENTS.lightning,
    },
    // The Prime Draft's Arm Sweep (its front), Tremor Step and rivet shower.
    [DRAFT_ARM_SWEEP]: {
      shape: 'cone',
      range: DRAFT_TUNING.sweepRange,
      arcDeg: DRAFT_TUNING.sweepArcDeg,
      color: TELEGRAPH_THREAT_COLORS.danger,
      accent: TELEGRAPH_ACCENTS.physical,
    },
    [DRAFT_TREMOR_STEP]: {
      shape: 'cone',
      range: DRAFT_TUNING.tremorRadius,
      arcDeg: 360,
      color: TELEGRAPH_THREAT_COLORS.danger,
      accent: TELEGRAPH_ACCENTS.physical,
    },
    [DRAFT_UNBOLT]: {
      shape: 'cone',
      range: DRAFT_TUNING.rivetShowerRadius,
      arcDeg: 360,
      color: TELEGRAPH_THREAT_COLORS.danger,
      accent: FOUNDRY_ACCENTS.brass,
    },
  };
}

export interface FoundryObjectSpec {
  color: number;
  accent: number;
  /** Seconds the ring takes to fill (its moment is at 1; 0 = full at once,
   *  a standing zone rather than a countdown). */
  fillSeconds: (radius: number) => number;
  /** A glyph instead of a filling footprint (a thing to take, not to dodge). */
  sigil?: boolean;
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
  // The Rangewarden's shell painting its circle a beat before it lands, and
  // the heroic shrapnel left where one burst (a standing zone).
  [FOUNDRY_SHELL_MARK]: {
    color: TELEGRAPH_THREAT_COLORS.lethal,
    accent: TELEGRAPH_ACCENTS.physical,
    fillSeconds: () => RANGE_TUNING.shellWarning,
  },
  [FOUNDRY_SHRAPNEL]: {
    color: TELEGRAPH_THREAT_COLORS.danger,
    accent: TELEGRAPH_ACCENTS.physical,
    fillSeconds: () => 0,
  },
  // The great coil's strike about to land on the crown.
  [FOUNDRY_COIL_STRIKE_MARK]: {
    color: TELEGRAPH_THREAT_COLORS.danger,
    accent: FOUNDRY_ACCENTS.lightning,
    fillSeconds: () => VOLTAIC_TUNING.strikeWarning,
  },
  // The Prime Draft's Piston Fist about to slam.
  [FOUNDRY_FIST_MARK]: {
    color: TELEGRAPH_THREAT_COLORS.lethal,
    accent: TELEGRAPH_ACCENTS.physical,
    fillSeconds: () => DRAFT_TUNING.fistWarning,
  },
  // A Storm Cell to take (a glyph: a thing you want, not a thing to dodge);
  // a jammed one still rolling reads dim until it settles.
  [FOUNDRY_CELL_TEMPLATES.ready]: {
    color: FOUNDRY_MECHANIC_COLORS.cell,
    accent: FOUNDRY_ACCENTS.lightning,
    fillSeconds: () => 0,
    sigil: true,
  },
  [FOUNDRY_CELL_TEMPLATES.rolling]: {
    color: FOUNDRY_MECHANIC_COLORS.hatchClosed,
    accent: FOUNDRY_ACCENTS.lightning,
    fillSeconds: () => DRAFT_TUNING.jamRollSeconds,
    sigil: true,
  },
  // The Core Hatch's ring in front of the Draft: where to bring the cell.
  // Shut it is a dim glyph, shuddering it fills yellow, open it is gold.
  [FOUNDRY_HATCH_TEMPLATES.closed]: {
    color: FOUNDRY_MECHANIC_COLORS.hatchClosed,
    accent: FOUNDRY_ACCENTS.steam,
    fillSeconds: () => 0,
    sigil: true,
  },
  [FOUNDRY_HATCH_TEMPLATES.warn]: {
    color: FOUNDRY_MECHANIC_COLORS.hatchWarn,
    accent: FOUNDRY_ACCENTS.steam,
    fillSeconds: () => DRAFT_TUNING.hatchWarning,
  },
  [FOUNDRY_HATCH_TEMPLATES.open]: {
    color: FOUNDRY_MECHANIC_COLORS.hatchOpen,
    accent: FOUNDRY_ACCENTS.brass,
    fillSeconds: () => 0,
  },
};

/** The Stamping Press strip: a lane over one belt's last yards, from its
 *  object (which stands on the strip's centre; its scale is the length). */
export const FOUNDRY_PRESS_STRIP_SPEC = {
  template: FOUNDRY_PRESS_STRIP,
  halfWidth: MAIN_LINE_BELTS.halfWidth,
  color: TELEGRAPH_THREAT_COLORS.lethal,
  accent: FOUNDRY_ACCENTS.brass,
  fillSeconds: TOCK_TUNING.pressWarning,
} as const;

/** Auras that draw a glyph under whoever wears them: the Rangewarden's
 *  crosshair over a marked player, the crackle round a Storm Cell carrier. */
export const FOUNDRY_AURA_MARKERS: Readonly<
  Record<string, { radius: number; color: number; accent: number }>
> = {
  [RANGE_TARGET_LOCK]: {
    radius: 2.2,
    color: TELEGRAPH_THREAT_COLORS.control,
    accent: TELEGRAPH_ACCENTS.physical,
  },
  [DRAFT_CELL_CARRY]: {
    radius: 1.8,
    color: FOUNDRY_MECHANIC_COLORS.cell,
    accent: FOUNDRY_ACCENTS.lightning,
  },
};

/** The plating ring(s) under a plated body: one ring of its face, or (heroic
 *  Split Plating) a front half and a back half of opposite faces. `yaw` is
 *  relative to the body's facing. */
export function platingRings(
  auras: readonly { id: string; value2?: number }[] | undefined,
): { color: number; arcDeg: number; yaw: number }[] {
  if (!auras) return [];
  for (const a of auras) {
    const grounded = a.id === VOLTAIC_GROUNDED;
    if (!grounded && a.id !== VOLTAIC_CHARGED) continue;
    const front = grounded ? FOUNDRY_MECHANIC_COLORS.grounded : FOUNDRY_MECHANIC_COLORS.charged;
    if (a.value2 !== 1) return [{ color: front, arcDeg: 360, yaw: 0 }];
    const back = grounded ? FOUNDRY_MECHANIC_COLORS.charged : FOUNDRY_MECHANIC_COLORS.grounded;
    return [
      { color: front, arcDeg: 180, yaw: 0 },
      { color: back, arcDeg: 180, yaw: Math.PI },
    ];
  }
  return [];
}

/** The Stored Charge ring's fill (0 empty, 1 a full capped Discharge). */
export function storedChargeFill(stacks: number | undefined, full: number | undefined): number {
  if (!stacks || !full || full <= 0) return 0;
  return Math.min(1, Math.max(0, stacks / full));
}

export interface BeltLook {
  /** The chevrons' scroll: +1 is 3 yd a second toward the press. */
  dir: number;
  /** 1 while the klaxon paints the belt red. */
  alarm: number;
}

/** Is this a belt's encounter object? */
export function isBeltTemplate(templateId: string): boolean {
  return (
    templateId === FOUNDRY_BELT_TEMPLATES.idle ||
    templateId === FOUNDRY_BELT_TEMPLATES.run ||
    templateId === FOUNDRY_BELT_TEMPLATES.alarm
  );
}

/** The four belts' looks from their encounter objects (any order; matched
 *  west to east by x). No object: the belts stand idle. */
export function beltLooks(
  objects: readonly { x: number; templateId: string; facing: number; scale: number }[],
): BeltLook[] {
  const out: BeltLook[] = MAIN_LINE_BELTS.xs.map(() => ({ dir: 0, alarm: 0 }));
  const sorted = [...objects].sort((a, b) => a.x - b.x).slice(0, out.length);
  sorted.forEach((o, i) => {
    if (o.templateId === FOUNDRY_BELT_TEMPLATES.idle) return;
    const sign = Math.cos(o.facing) >= 0 ? 1 : -1;
    out[i].dir = (sign * o.scale) / TOCK_TUNING.beltSpeed;
    out[i].alarm = o.templateId === FOUNDRY_BELT_TEMPLATES.alarm ? 1 : 0;
  });
  return out;
}

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
