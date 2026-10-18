// Eldershine (The Veiled Hollow): the painted rebuild of the town's kit houses.
// Until the rebuild fills it in, the layout stands nothing and the zone file
// keeps its kit houses. A pure, frozen data/geometry module: no engine
// imports, no randomness, no clocks (sim/painted_towns/CLAUDE.md).
import { deepFreeze, indexById } from '../placed_town_kit';
import type { PaintedTownLayout } from './types';

export const ELDERSHINE_LAYOUT: PaintedTownLayout = deepFreeze({
  id: 'eldershine',
  layoutId: 'eldershine_painted_v1',
  zoneId: 'veiled_hollow',
  hub: { center: { x: -40, z: 1030 }, radius: 30 },
  buildings: [],
  replacedKitBuildings: [],
  pads: [],
  npcs: [],
});

/** Derived keyed views retain the exact frozen records owned by the layout. */
export const ELDERSHINE_BUILDINGS_BY_ID = indexById(ELDERSHINE_LAYOUT.buildings);
export const ELDERSHINE_NPC_PLACEMENTS_BY_ID = indexById(ELDERSHINE_LAYOUT.npcs);
