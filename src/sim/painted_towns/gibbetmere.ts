// Gibbetmere (The Wraithwood): the painted rebuild of the town's kit houses.
// Until the rebuild fills it in, the layout stands nothing and the zone file
// keeps its kit houses. A pure, frozen data/geometry module: no engine
// imports, no randomness, no clocks (sim/painted_towns/CLAUDE.md).
import { deepFreeze, indexById } from '../placed_town_kit';
import type { PaintedTownLayout } from './types';

export const GIBBETMERE_LAYOUT: PaintedTownLayout = deepFreeze({
  id: 'gibbetmere',
  layoutId: 'gibbetmere_painted_v1',
  zoneId: 'wraithwood',
  hub: { center: { x: 360, z: 1430 }, radius: 17 },
  buildings: [],
  replacedKitBuildings: [],
  pads: [],
  npcs: [],
});

/** Derived keyed views retain the exact frozen records owned by the layout. */
export const GIBBETMERE_BUILDINGS_BY_ID = indexById(GIBBETMERE_LAYOUT.buildings);
export const GIBBETMERE_NPC_PLACEMENTS_BY_ID = indexById(GIBBETMERE_LAYOUT.npcs);
