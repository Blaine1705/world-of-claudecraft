// Bridgemere (The Willowfen): the painted rebuild of the town's kit houses.
// Until the rebuild fills it in, the layout stands nothing and the zone file
// keeps its kit houses. A pure, frozen data/geometry module: no engine
// imports, no randomness, no clocks (sim/painted_towns/CLAUDE.md).
import { deepFreeze, indexById } from '../placed_town_kit';
import type { PaintedTownLayout } from './types';

export const BRIDGEMERE_LAYOUT: PaintedTownLayout = deepFreeze({
  id: 'bridgemere',
  layoutId: 'bridgemere_painted_v1',
  zoneId: 'willowfen',
  hub: { center: { x: -360, z: 362 }, radius: 20 },
  buildings: [],
  replacedKitBuildings: [],
  replacedDecorProps: [],
  pads: [],
  npcs: [],
});

/** Derived keyed views retain the exact frozen records owned by the layout. */
export const BRIDGEMERE_BUILDINGS_BY_ID = indexById(BRIDGEMERE_LAYOUT.buildings);
export const BRIDGEMERE_NPC_PLACEMENTS_BY_ID = indexById(BRIDGEMERE_LAYOUT.npcs);
