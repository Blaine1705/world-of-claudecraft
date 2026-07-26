// The Last Keep: the Drakelands' standing castle on the midlands plateau,
// rebuilt from the ruin ring that used to mark it. One authored plan drives
// every consumer: the terrain pad (world.ts applyCastlePad), the walkable
// lift field (castleLift, added into groundHeight the beacon/sowfield way),
// the scatter clearances, the bailey buildings (content decorProps), and
// the render assembly (render/castle_features.ts draws wall modules, stairs,
// towers, and parapets from these same lines, so the wall you see is the
// wall you climb). The curtain walls are TERRAIN, not colliders (the garden
// maze hedge idiom): a 7-unit sheer riser the climb gate refuses from the
// ground, with its flat top the wall-walk. Gates are simple gaps in the
// riser; the walk leaves a mouth open over every gate (the beacon rule: no
// walkable surface may stand over another). Pure leaf: deterministic, no
// rng, no SimContext.

export const CASTLE = {
  // the graded courtyard pad (terrain levels to padH, skirt blends out)
  pad: { x0: 366, x1: 445, z0: 1993, z1: 2072, h: 6 },
  // the curtain wall square: wall centerlines
  wx0: 374,
  wx1: 437,
  wz0: 2001,
  wz1: 2064,
  /** wall module length (KayKit wall is 4 units at scale 1.75) */
  module: 7,
  /** wall thickness: the lift plateau strip (the walkable wall-walk width) */
  wallTh: 2.4,
  /** wall-walk height above the pad */
  wallH: 7,
  /** the tall southeast watchtower: its chamber floor height above the pad
   *  (the render wraps a second wall level around it, an open watch room) */
  towerH: 14,
  /** corner tower half-width (square bastions, walkable tops) */
  towerHw: 3.4,
} as const;

// The three ways in. Every opening is a gap in the wall riser; spans are in
// the wall's run coordinate (z for the west/east walls, x for north/south).
// Gate spans are aligned to the wall's module grid (modules anchor at each
// bastion's edge, wz0 + towerHw etc.), so every gate is EXACTLY one module:
// the arch piece the render places is the opening the lift field leaves.
export const CASTLE_GATES = {
  /** the main gatehouse: west wall, facing the Wyrmwatch road */
  main: { a0: 2025.4, a1: 2032.4 },
  /** the rear postern: a narrow servant door (the doorway module's own
   *  opening; the module's solid flanks stay wall) */
  postern: { a0: 407.6, a1: 410.2 },
  /** the east breach: the wall the drakes brought down, a rubble climb */
  breach: { a0: 2046.5, a1: 2053.5 },
} as const;

// Corner towers (square bastions; the SE tower is the tall watch)
export const CASTLE_TOWERS = [
  { x: CASTLE.wx0, z: CASTLE.wz0, h: CASTLE.wallH, tall: false }, // NW
  { x: CASTLE.wx1, z: CASTLE.wz0, h: CASTLE.wallH, tall: false }, // NE
  { x: CASTLE.wx0, z: CASTLE.wz1, h: CASTLE.wallH, tall: false }, // SW
  { x: CASTLE.wx1, z: CASTLE.wz1, h: CASTLE.towerH, tall: true }, // SE watch
] as const;

// Stairs onto the walls: solid stone ramp masses against inner wall faces
// (the sowfield grandstand idiom: the ramp IS the ground where it stands).
// Each runs along one axis from lift 0 to the wall-walk, 2.6 wide.
export interface CastleRamp {
  /** 'x' ramps run along x at fixed z band; 'z' ramps along z at fixed x */
  axis: 'x' | 'z';
  /** fixed-axis band [min, max] (the ramp width) */
  b0: number;
  b1: number;
  /** run start/end along the axis */
  a0: number;
  a1: number;
  /** lift at a0 / a1 */
  h0: number;
  h1: number;
}
export const CASTLE_RAMPS: readonly CastleRamp[] = [
  // west courtyard flight; it reaches full height just BEFORE the corner
  // bastion square so the landing is a level step, never a lip. The band
  // OVERLAPS the wall strip (no crack: a sliver of courtyard-level ground
  // between ramp and wall would read as a sheer drop and strand the walk).
  { axis: 'z', b0: 375.0, b1: 378.0, a0: 2044, a1: 2060.8, h0: 0, h1: CASTLE.wallH },
  // gate-side courtyard flight, climbing east along the near wall
  { axis: 'x', b0: 2002.0, b1: 2005.0, a0: 414, a1: 434, h0: 0, h1: CASTLE.wallH },
  // the watch flight: the far wall-walk itself climbs to the SE tower,
  // reaching chamber height exactly at the bastion's edge
  {
    axis: 'x',
    b0: CASTLE.wz1 - CASTLE.wallTh / 2,
    b1: CASTLE.wz1 + CASTLE.wallTh / 2,
    a0: 424,
    a1: 433.6,
    h0: CASTLE.wallH,
    h1: CASTLE.towerH,
  },
] as const;

// The bailey: every building, its prop key, and its collider footprint.
// Placement honors the gate corridors (west gate road to the courtyard,
// postern lane, breach yard), the stair masses, and each other.
export interface CastleBuilding {
  key: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
  r: number;
  h: number;
}
export const CASTLE_BUILDINGS: readonly CastleBuilding[] = [
  // the keep, gate-side quarter; its door (the Last Keep interior) faces
  // the courtyard (+z, the authored model front). Native model 2 x 4 x 2.3.
  { key: 'hexrCastle', x: 420, z: 2015, rot: 0, scale: 9, r: 8.5, h: 32 },
  // the great hall beside the keep
  { key: 'hexrTownhall', x: 391, z: 2010, rot: 0, scale: 8, r: 6.5, h: 15 },
  // the forge quarter by the west wall
  { key: 'hexrBlacksmith', x: 381.5, z: 2020, rot: Math.PI / 2, scale: 7, r: 5, h: 7 },
  // the market off the gate road
  { key: 'hexrMarket', x: 397, z: 2041, rot: -Math.PI / 2, scale: 6.5, r: 4.5, h: 6.5 },
  // the stables past the gate road, clear of the west stair mass
  { key: 'hexrStables', x: 384.2, z: 2047, rot: 0.35, scale: 7, r: 5.5, h: 4.5 },
  // the barracks along the far wall
  { key: 'hexrBarracks', x: 393.5, z: 2056, rot: Math.PI, scale: 7.5, r: 6, h: 12.5 },
  // the inn on the far court
  { key: 'hexrTavern', x: 409, z: 2054, rot: Math.PI, scale: 7.5, r: 5.5, h: 10.5 },
  // the chapel, east court, clear of the breach corridor
  { key: 'hexrChurch', x: 429, z: 2038, rot: -Math.PI / 2, scale: 7.5, r: 5.5, h: 12.5 },
  // the granary windmill on the plaza's east edge
  { key: 'hexrWindmill', x: 415, z: 2036, rot: -Math.PI / 2, scale: 7.5, r: 4.2, h: 11 },
  // servant quarter on the east court, between the keep and the chapel
  { key: 'hexrHomeA', x: 431, z: 2026, rot: Math.PI / 2, scale: 6, r: 3.8, h: 6 },
  // the officer's house south of the inn, clear of the breach yard
  { key: 'hexrHomeB', x: 423, z: 2057.5, rot: 0, scale: 7, r: 4.5, h: 9 },
] as const;

// Ember crystals of varying sizes around the grounds and approach (drawn by
// render/ember_features.ts with the shared crystal model).
export const CASTLE_CRYSTALS: readonly { x: number; z: number; fp: number }[] = [
  // flanking the main gate approach
  { x: 368.5, z: 2025, fp: 5.5 },
  { x: 369, z: 2038.5, fp: 4.2 },
  { x: 362, z: 2031, fp: 2.4 },
  // the courtyard corners
  { x: 402, z: 2029, fp: 1.8 },
  { x: 412, z: 2040, fp: 2.6 },
  { x: 422, z: 2029.5, fp: 3.4 },
  // the breach yard: crystals growing through the fallen stone
  { x: 440.5, z: 2053.5, fp: 4.8 },
  { x: 434, z: 2050, fp: 2.2 },
  { x: 441, z: 2059.5, fp: 3.0 },
  // outside the walls, seeded along the skirt
  { x: 371, z: 2005, fp: 3.6 },
  { x: 441.5, z: 1998.5, fp: 5.0 },
  { x: 405, z: 2069.5, fp: 3.2 },
  { x: 379, z: 2068.5, fp: 2.0 },
  { x: 442.5, z: 2020, fp: 2.8 },
] as const;

const G = CASTLE_GATES;
const inSpan = (v: number, s: { a0: number; a1: number }): boolean => v >= s.a0 && v <= s.a1;

/** Inside the castle grounds (walls inclusive), with an optional margin. */
export function inCastleGrounds(x: number, z: number, pad = 0): boolean {
  return (
    x >= CASTLE.wx0 - pad && x <= CASTLE.wx1 + pad && z >= CASTLE.wz0 - pad && z <= CASTLE.wz1 + pad
  );
}

/** Scatter clearance: the pad plus skirt is castle ground; no wild scatter. */
export function castleClear(x: number, z: number): boolean {
  const p = CASTLE.pad;
  return x < p.x0 - 4 || x > p.x1 + 4 || z < p.z0 - 4 || z > p.z1 + 4;
}

const sstepv = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// the Last Spring pool sits off the pad's northeast apron; the pad yields
// to the lake's graded escape shore there (the fade completes before the
// curtain wall corner, so the walls and courtyard stay dead level)
const LAST_SPRING = { x: 456, z: 1988 } as const;

/** The graded pad: level courtyard, gentle skirt back to the waste. */
export function castlePadWeight(x: number, z: number): number {
  const p = CASTLE.pad;
  const dx = Math.max(p.x0 - x, 0, x - p.x1);
  const dz = Math.max(p.z0 - z, 0, z - p.z1);
  const d = Math.hypot(dx, dz);
  if (d >= 9) return 0;
  const t = 1 - d / 9;
  return t * t * (3 - 2 * t) * sstepv(13, 20, Math.hypot(x - LAST_SPRING.x, z - LAST_SPRING.z));
}

const HT = CASTLE.wallTh / 2;

// wall strip lift: full height across the strip, gap over each gate span
function wallStripLift(
  along: number,
  across: number,
  wallLine: number,
  gate: { a0: number; a1: number } | null,
): number {
  if (Math.abs(across - wallLine) > HT) return 0;
  if (gate && inSpan(along, gate)) return 0;
  return CASTLE.wallH;
}

/**
 * The castle's walkable lift field (single-valued; added into groundHeight).
 * Wall plateaus, corner bastions, stair ramps, and the watch platform. The
 * player reaches wall tops only by the two courtyard flights; every gate
 * keeps its mouth open (no lift above an opening).
 */
export function castleLift(x: number, z: number): number {
  const p = CASTLE.pad;
  if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) return 0;
  let lift = 0;
  // curtain walls (with gate gaps)
  if (z >= CASTLE.wz0 - HT && z <= CASTLE.wz1 + HT) {
    lift = Math.max(
      lift,
      wallStripLift(z, x, CASTLE.wx0, G.main), // west
      wallStripLift(z, x, CASTLE.wx1, G.breach), // east
    );
  }
  if (x >= CASTLE.wx0 - HT && x <= CASTLE.wx1 + HT) {
    lift = Math.max(
      lift,
      wallStripLift(x, z, CASTLE.wz0, G.postern), // north
      wallStripLift(x, z, CASTLE.wz1, null), // south (solid)
    );
  }
  // corner bastions (square tower tops, walkable, continuous with walks)
  for (const t of CASTLE_TOWERS) {
    if (Math.abs(x - t.x) <= CASTLE.towerHw && Math.abs(z - t.z) <= CASTLE.towerHw) {
      lift = Math.max(lift, t.h);
    }
  }
  // stair ramps (solid masses; linear rise along their axis)
  for (const rmp of CASTLE_RAMPS) {
    const along = rmp.axis === 'z' ? z : x;
    const across = rmp.axis === 'z' ? x : z;
    if (across < rmp.b0 || across > rmp.b1) continue;
    const lo = Math.min(rmp.a0, rmp.a1);
    const hi = Math.max(rmp.a0, rmp.a1);
    if (along < lo || along > hi) continue;
    const t = (along - rmp.a0) / (rmp.a1 - rmp.a0);
    lift = Math.max(lift, rmp.h0 + (rmp.h1 - rmp.h0) * t);
  }
  return lift;
}
