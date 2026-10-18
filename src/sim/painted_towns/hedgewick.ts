// Hedgewick (The Evergarden): the painted rebuild of the town's kit houses.
// Until the rebuild fills it in, the layout stands nothing and the zone file
// keeps its kit houses. A pure, frozen data/geometry module: no engine
// imports, no randomness, no clocks (sim/painted_towns/CLAUDE.md).
import { deepFreeze, indexById } from '../placed_town_kit';
import type { PaintedTownLayout } from './types';

export const HEDGEWICK_LAYOUT: PaintedTownLayout = deepFreeze({
  id: 'hedgewick',
  layoutId: 'hedgewick_painted_v1',
  zoneId: 'evergarden',
  hub: { center: { x: 320, z: 810 }, radius: 16 },
  buildings: [],
  replacedKitBuildings: [],
  pads: [],
  npcs: [],
});

/** Derived keyed views retain the exact frozen records owned by the layout. */
export const HEDGEWICK_BUILDINGS_BY_ID = indexById(HEDGEWICK_LAYOUT.buildings);
export const HEDGEWICK_NPC_PLACEMENTS_BY_ID = indexById(HEDGEWICK_LAYOUT.npcs);
