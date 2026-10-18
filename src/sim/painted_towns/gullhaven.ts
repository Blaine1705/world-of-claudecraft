// Gullhaven (The Farshore): the painted rebuild of the town's kit houses.
// Until the rebuild fills it in, the layout stands nothing and the zone file
// keeps its kit houses. A pure, frozen data/geometry module: no engine
// imports, no randomness, no clocks (sim/painted_towns/CLAUDE.md).
import { deepFreeze, indexById } from '../placed_town_kit';
import type { PaintedTownLayout } from './types';

export const GULLHAVEN_LAYOUT: PaintedTownLayout = deepFreeze({
  id: 'gullhaven',
  layoutId: 'gullhaven_painted_v1',
  zoneId: 'farshore_isle',
  hub: { center: { x: 305, z: 70 }, radius: 15 },
  buildings: [],
  replacedKitBuildings: [],
  replacedDecorProps: [],
  pads: [],
  npcs: [],
});

/** Derived keyed views retain the exact frozen records owned by the layout. */
export const GULLHAVEN_BUILDINGS_BY_ID = indexById(GULLHAVEN_LAYOUT.buildings);
export const GULLHAVEN_NPC_PLACEMENTS_BY_ID = indexById(GULLHAVEN_LAYOUT.npcs);
