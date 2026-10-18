// Lanternmere (The Amberfall): the painted rebuild of the town's kit houses.
// Until the rebuild fills it in, the layout stands nothing and the zone file
// keeps its kit houses. A pure, frozen data/geometry module: no engine
// imports, no randomness, no clocks (sim/painted_towns/CLAUDE.md).
import { deepFreeze, indexById } from '../placed_town_kit';
import type { PaintedTownLayout } from './types';

export const LANTERNMERE_LAYOUT: PaintedTownLayout = deepFreeze({
  id: 'lanternmere',
  layoutId: 'lanternmere_painted_v1',
  zoneId: 'amberfall',
  hub: { center: { x: -360, z: 2072 }, radius: 24 },
  buildings: [],
  replacedKitBuildings: [],
  pads: [],
  npcs: [],
});

/** Derived keyed views retain the exact frozen records owned by the layout. */
export const LANTERNMERE_BUILDINGS_BY_ID = indexById(LANTERNMERE_LAYOUT.buildings);
export const LANTERNMERE_NPC_PLACEMENTS_BY_ID = indexById(LANTERNMERE_LAYOUT.npcs);
