// Moonrest (The Nightbloom): the painted rebuild of the town's kit houses.
// Until the rebuild fills it in, the layout stands nothing and the zone file
// keeps its kit houses. A pure, frozen data/geometry module: no engine
// imports, no randomness, no clocks (sim/painted_towns/CLAUDE.md).
import { deepFreeze, indexById } from '../placed_town_kit';
import type { PaintedTownLayout } from './types';

export const MOONREST_LAYOUT: PaintedTownLayout = deepFreeze({
  id: 'moonrest',
  layoutId: 'moonrest_painted_v1',
  zoneId: 'nightbloom',
  hub: { center: { x: -370, z: 1420 }, radius: 18 },
  buildings: [],
  replacedKitBuildings: [],
  replacedDecorProps: [],
  pads: [],
  npcs: [],
});

/** Derived keyed views retain the exact frozen records owned by the layout. */
export const MOONREST_BUILDINGS_BY_ID = indexById(MOONREST_LAYOUT.buildings);
export const MOONREST_NPC_PLACEMENTS_BY_ID = indexById(MOONREST_LAYOUT.npcs);
