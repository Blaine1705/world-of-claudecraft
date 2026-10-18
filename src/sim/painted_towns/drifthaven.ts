// Drifthaven (The Palmreach): the painted rebuild of the town's kit houses.
// Until the rebuild fills it in, the layout stands nothing and the zone file
// keeps its kit houses. A pure, frozen data/geometry module: no engine
// imports, no randomness, no clocks (sim/painted_towns/CLAUDE.md).
import { deepFreeze, indexById } from '../placed_town_kit';
import type { PaintedTownLayout } from './types';

export const DRIFTHAVEN_LAYOUT: PaintedTownLayout = deepFreeze({
  id: 'drifthaven',
  layoutId: 'drifthaven_painted_v1',
  zoneId: 'palmreach',
  hub: { center: { x: -300, z: 820 }, radius: 16 },
  buildings: [],
  replacedKitBuildings: [],
  pads: [],
  npcs: [],
});

/** Derived keyed views retain the exact frozen records owned by the layout. */
export const DRIFTHAVEN_BUILDINGS_BY_ID = indexById(DRIFTHAVEN_LAYOUT.buildings);
export const DRIFTHAVEN_NPC_PLACEMENTS_BY_ID = indexById(DRIFTHAVEN_LAYOUT.npcs);
