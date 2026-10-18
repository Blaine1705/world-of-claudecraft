// Wickharbor (The Galecrest): the painted rebuild of the town's kit houses.
// Until the rebuild fills it in, the layout stands nothing and the zone file
// keeps its kit houses. A pure, frozen data/geometry module: no engine
// imports, no randomness, no clocks (sim/painted_towns/CLAUDE.md).
import { deepFreeze, indexById } from '../placed_town_kit';
import type { PaintedTownLayout } from './types';

export const WICKHARBOR_LAYOUT: PaintedTownLayout = deepFreeze({
  id: 'wickharbor',
  layoutId: 'wickharbor_painted_v1',
  zoneId: 'galecrest',
  hub: { center: { x: 420, z: 360 }, radius: 16 },
  buildings: [],
  replacedKitBuildings: [],
  pads: [],
  npcs: [],
});

/** Derived keyed views retain the exact frozen records owned by the layout. */
export const WICKHARBOR_BUILDINGS_BY_ID = indexById(WICKHARBOR_LAYOUT.buildings);
export const WICKHARBOR_NPC_PLACEMENTS_BY_ID = indexById(WICKHARBOR_LAYOUT.npcs);
