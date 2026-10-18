// Icemantle (The Frostveil Reach): the painted rebuild of the town's kit houses.
// Until the rebuild fills it in, the layout stands nothing and the zone file
// keeps its kit houses. A pure, frozen data/geometry module: no engine
// imports, no randomness, no clocks (sim/painted_towns/CLAUDE.md).
import { deepFreeze, indexById } from '../placed_town_kit';
import type { PaintedTownLayout } from './types';

export const ICEMANTLE_LAYOUT: PaintedTownLayout = deepFreeze({
  id: 'icemantle',
  layoutId: 'icemantle_painted_v1',
  zoneId: 'frostveil',
  hub: { center: { x: -30, z: 1560 }, radius: 22 },
  buildings: [],
  replacedKitBuildings: [],
  pads: [],
  npcs: [],
});

/** Derived keyed views retain the exact frozen records owned by the layout. */
export const ICEMANTLE_BUILDINGS_BY_ID = indexById(ICEMANTLE_LAYOUT.buildings);
export const ICEMANTLE_NPC_PLACEMENTS_BY_ID = indexById(ICEMANTLE_LAYOUT.npcs);
