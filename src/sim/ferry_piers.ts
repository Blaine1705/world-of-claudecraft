// The ferry piers at the two far berths (content/transport_ships.ts): the
// Moonrest ferry pier off the Nightbloom's sunset shore, and the Wyrmwatch
// ferry pier below the Drakelands bank with its stair up the bluff. Built
// from the same pieces as the Eastbrook and Wickharbor ferry piers: level
// stilt decks (the GaleDeckDef idiom of gale_harbor.ts, drawn by the shared
// plank-walkway builder render/deck_render.ts through render/ferry_piers.ts)
// standing in the water, their planks at Eastbrook's ferry-pier height so
// the gangplank lands on them the same way, and a Galecrest-style bluff
// stair where the bank stands higher than the pier. WALKABLE raised ground:
// deck_surfaces.ts folds them into world.ts groundHeight. Nothing on the
// land moves: each pier roots at the water's edge.
//
// Pure leaf: deterministic, no SimContext; terrain and water level are
// passed in.

import { type GaleDeckDef, galeDeckSurfaceAt } from './gale_harbor';

/** The ferry pier deck, yards above the waterline: Eastbrook's ferry pier
 *  height (its quay-anchored planks), which the gangplank's outer tread
 *  meets 0.22 above (content/transport_ships.ts). */
export const FERRY_PIER_DECK_ABOVE_WATER = 2.64;

const PIER = FERRY_PIER_DECK_ABOVE_WATER;

export const FERRY_PIER_DECKS: readonly GaleDeckDef[] = [
  // Moonrest: from the sunset shore (x -490, where the bank stands 2.4 above
  // the water) straight out west to the berth, its end 8 yd from the ship's
  // centre line like Eastbrook's T-head
  {
    x: -501,
    z: 1506,
    rot: -Math.PI / 2,
    hl: 11,
    hw: 2.2,
    ax: -490,
    az: 1506,
    nearAboveWater: PIER,
    farAboveWater: PIER,
  },
  // Wyrmwatch: from the foot of the bank (x 490) straight out east to the
  // berth...
  {
    x: 498.5,
    z: 1899.2,
    rot: Math.PI / 2,
    hl: 8.5,
    hw: 2.2,
    ax: 490,
    az: 1899.2,
    nearAboveWater: PIER,
    farAboveWater: PIER,
  },
  // ...and the bluff stair up to the top of the bank (the Galecrest bluff
  // stairs' idiom: a steep two-anchor ramp the renderer treads). Its foot
  // overlaps INTO the pier root so the two share walkable ground (the harbor
  // rule), its head roots on the terrain at the bank's crest.
  {
    x: 487,
    z: 1899.2,
    rot: -Math.PI / 2,
    hl: 4,
    hw: 1.3,
    ax: 491,
    az: 1899.2,
    ax2: 483,
    az2: 1899.2,
    nearAboveWater: PIER,
  },
];

// Per-pier bounding boxes for the cheap early-out (the two piers are a world
// apart, so one box would cover the whole east of the map).
const BOXES: readonly (readonly [number, number, number, number])[] = [
  [-514, 1502, -488, 1510],
  [480, 1895, 509, 1903],
];

/** Whether (x, z) lies under a ferry pier's planks (nothing grows through). */
export function onFerryPier(
  x: number,
  z: number,
  terrainAt: (x: number, z: number) => number,
): boolean {
  return ferryPierSurface(x, z, terrainAt, 0) !== Number.NEGATIVE_INFINITY;
}

/**
 * The ferry pier deck surface at (x, z): the highest plank plane underfoot,
 * or -Infinity outside every deck footprint. Shape mirrors galeDeckSurface.
 */
export function ferryPierSurface(
  x: number,
  z: number,
  terrainAt: (x: number, z: number) => number,
  waterLevel: number,
): number {
  let inBox = false;
  for (const [x1, z1, x2, z2] of BOXES) {
    if (x >= x1 && x <= x2 && z >= z1 && z <= z2) inBox = true;
  }
  if (!inBox) return Number.NEGATIVE_INFINITY;
  let surface = Number.NEGATIVE_INFINITY;
  for (const deck of FERRY_PIER_DECKS) {
    const dx = x - deck.x;
    const dz = z - deck.z;
    const dirx = Math.sin(deck.rot);
    const dirz = Math.cos(deck.rot);
    const along = dx * dirx + dz * dirz;
    if (along < -deck.hl || along > deck.hl) continue;
    const across = dx * dirz - dz * dirx;
    if (across < -deck.hw || across > deck.hw) continue;
    surface = Math.max(surface, galeDeckSurfaceAt(deck, along, terrainAt, waterLevel));
  }
  return surface;
}
