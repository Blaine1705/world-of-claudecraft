// Dawnhold Castle: the Evergarden's garden keep, rebuilt from the old
// decor shell into real grounds the player can walk (the Last Keep idiom
// at a smaller, gentler scale). One authored plan drives every consumer:
// the graded pad (world.ts applyDawnholdPad), the walkable lift field
// (dawnholdLift, added into groundHeight beside castleLift), the garden
// scatter clearance, the bailey buildings (content decorProps), and the
// render assembly (render/dawnhold_features.ts). The curtain walls are
// TERRAIN (sheer risers the climb gate refuses, flat tops as the walk);
// gates are module-aligned gaps whose lift spans sit INSIDE the rendered
// arch openings; the walk leaves a mouth open over every gate. Unlike the
// Last Keep there is no terraced ward: one warm bailey full of parterre
// beds, with the keep composed against its hall wing on the north side.
// Pure leaf: deterministic, no rng, no SimContext.

export const DAWNHOLD = {
  // the graded grounds (the skirt blends into the garden hills and yields
  // to the coast lobes west of the walls)
  pad: { x0: 232, x1: 300, z0: 854, z1: 936, h: 3.2 },
  // the curtain wall square: wall centerlines
  wx0: 240,
  wx1: 292,
  wz0: 864,
  wz1: 922,
  /** wall module length (KayKit wall is 4 units at scale 1.75) */
  module: 7,
  /** wall thickness (walkable strip; both faces skinned with modules) */
  wallTh: 3.0,
  /** the wall-walk's ABSOLUTE height */
  walkAbs: 9.7,
  /** the tall northeast watchtower's ABSOLUTE platform height */
  watchAbs: 14.2,
  /** corner tower half-width */
  towerHw: 3.0,
} as const;

// The ways in. Spans are in the wall's run coordinate; every span is the
// visual opening of the doorway module that renders there.
export const DAWNHOLD_GATES = {
  /** the main gate: east wall, facing the Hedgewick road (which ends at
   *  288,887); the doorway module at scale 1.75 opens 3.4yd */
  main: { a0: 885.3, a1: 888.7 },
  /** the garden postern: a narrow south door toward the parterre lawn */
  postern: { a0: 260.7, a1: 263.3 },
} as const;

export interface DawnholdTower {
  x: number;
  z: number;
  hAbs: number;
  hw: number;
  tall: boolean;
}
export const DAWNHOLD_TOWERS: readonly DawnholdTower[] = [
  { x: DAWNHOLD.wx0, z: DAWNHOLD.wz0, hAbs: DAWNHOLD.walkAbs, hw: DAWNHOLD.towerHw, tall: false },
  // NE: the tall watch, looking over Hedgewick and the road
  { x: DAWNHOLD.wx1, z: DAWNHOLD.wz0, hAbs: DAWNHOLD.watchAbs, hw: DAWNHOLD.towerHw, tall: true },
  { x: DAWNHOLD.wx0, z: DAWNHOLD.wz1, hAbs: DAWNHOLD.walkAbs, hw: DAWNHOLD.towerHw, tall: false },
  { x: DAWNHOLD.wx1, z: DAWNHOLD.wz1, hAbs: DAWNHOLD.walkAbs, hw: DAWNHOLD.towerHw, tall: false },
] as const;

// The one stair flight onto the walk: along the east wall's inner face,
// south of the main gate, landing on the SE bastion (ABS heights; the
// band tucks into the wall strip so no crack opens at the top).
export interface DawnholdRamp {
  axis: 'x' | 'z';
  b0: number;
  b1: number;
  a0: number;
  a1: number;
  h0: number;
  h1: number;
}
export const DAWNHOLD_RAMPS: readonly DawnholdRamp[] = [
  { axis: 'z', b0: 288.7, b1: 291.5, a0: 896, a1: 910, h0: DAWNHOLD.pad.h, h1: DAWNHOLD.walkAbs },
  {
    axis: 'z',
    b0: 288.7,
    b1: 291.5,
    a0: 910,
    a1: 919.6,
    h0: DAWNHOLD.walkAbs,
    h1: DAWNHOLD.walkAbs,
  },
] as const;

// The bailey buildings, all the GREEN colorway. The keep and its hall
// wing compose one palace mass on the north side (door faces +z, south
// into the courtyard); cottages and the chapel ring the parterre yard.
export interface DawnholdBuilding {
  key: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
  r: number;
  h: number;
  keepComplex?: boolean;
}
export const DAWNHOLD_BUILDINGS: readonly DawnholdBuilding[] = [
  { key: 'hexCastle', x: 258, z: 878, rot: 0, scale: 7.5, r: 7.2, h: 28, keepComplex: true },
  {
    key: 'hexBarracks',
    x: 270.5,
    z: 878,
    rot: Math.PI / 2,
    scale: 6.5,
    r: 5.2,
    h: 11,
    keepComplex: true,
  },
  { key: 'hexTavern', x: 246.5, z: 906, rot: Math.PI / 2, scale: 6.5, r: 4.8, h: 9 },
  { key: 'hexChurch', x: 283, z: 908.5, rot: -Math.PI / 2, scale: 6.5, r: 4.8, h: 11 },
  { key: 'hexHomeA', x: 268, z: 915, rot: Math.PI, scale: 5.5, r: 3.5, h: 5.5 },
] as const;

/** the courtyard parterre beds (feed GARDEN_BED_PADS and the bed decor) */
export const DAWNHOLD_BEDS: readonly { x: number; z: number }[] = [
  { x: 258, z: 899 },
  { x: 273, z: 897 },
] as const;

const G = DAWNHOLD_GATES;
const inSpan = (v: number, s: { a0: number; a1: number }): boolean => v >= s.a0 && v <= s.a1;

/** Scatter clearance: no garden specimen scatter on the pad or skirt. */
export function dawnholdClear(x: number, z: number): boolean {
  const p = DAWNHOLD.pad;
  return x < p.x0 - 4 || x > p.x1 + 4 || z < p.z0 - 4 || z > p.z1 + 4;
}

/** The pad's target height (one level; no terrace). */
export function dawnholdPadTarget(): number {
  return DAWNHOLD.pad.h;
}

/** Graded pad weight: level grounds, gentle skirt back to the garden. */
export function dawnholdPadWeight(x: number, z: number): number {
  const p = DAWNHOLD.pad;
  const dx = Math.max(p.x0 - x, 0, x - p.x1);
  const dz = Math.max(p.z0 - z, 0, z - p.z1);
  const d = Math.hypot(dx, dz);
  if (d >= 8) return 0;
  const t = 1 - d / 8;
  return t * t * (3 - 2 * t);
}

const HT = DAWNHOLD.wallTh / 2;

function wallStripAbs(
  along: number,
  across: number,
  wallLine: number,
  gate: { a0: number; a1: number } | null,
): number {
  if (Math.abs(across - wallLine) > HT) return 0;
  if (gate && inSpan(along, gate)) return 0;
  return DAWNHOLD.walkAbs;
}

/**
 * Dawnhold's walkable lift field (single-valued, ABSOLUTE surface heights
 * over the flat pad; added into groundHeight beside the Last Keep's).
 */
export function dawnholdLift(x: number, z: number): number {
  const p = DAWNHOLD.pad;
  if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return 0;
  let abs = 0;
  if (z >= DAWNHOLD.wz0 - HT && z <= DAWNHOLD.wz1 + HT) {
    abs = Math.max(
      abs,
      wallStripAbs(z, x, DAWNHOLD.wx0, null), // west (solid)
      wallStripAbs(z, x, DAWNHOLD.wx1, G.main), // east, the main gate
    );
  }
  if (x >= DAWNHOLD.wx0 - HT && x <= DAWNHOLD.wx1 + HT) {
    abs = Math.max(
      abs,
      wallStripAbs(x, z, DAWNHOLD.wz0, null), // north (solid)
      wallStripAbs(x, z, DAWNHOLD.wz1, G.postern), // south, the garden door
    );
  }
  for (const t of DAWNHOLD_TOWERS) {
    if (Math.abs(x - t.x) <= t.hw && Math.abs(z - t.z) <= t.hw) {
      abs = Math.max(abs, t.hAbs);
    }
  }
  for (const rmp of DAWNHOLD_RAMPS) {
    const along = rmp.axis === 'z' ? z : x;
    const across = rmp.axis === 'z' ? x : z;
    if (across < rmp.b0 || across > rmp.b1) continue;
    const lo = Math.min(rmp.a0, rmp.a1);
    const hi = Math.max(rmp.a0, rmp.a1);
    if (along < lo || along > hi) continue;
    const t = (along - rmp.a0) / (rmp.a1 - rmp.a0);
    abs = Math.max(abs, rmp.h0 + (rmp.h1 - rmp.h0) * t);
  }
  if (abs <= 0) return 0;
  return Math.max(0, abs - DAWNHOLD.pad.h);
}
