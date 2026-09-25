// The ferry piers at the far berths (sim/ferry_piers.ts): the Moonrest pier
// off the Nightbloom's sunset shore and the Wyrmwatch pier with its bluff
// stair, drawn in New Eastbrook's harbor wood from the same deck rectangles
// world.ts groundHeight walks (render/eastbrook_harbor.ts buildHarborWood),
// so the planks underfoot are the planks on screen. Built once into the
// props root beside the scheduled ships (props.ts), linked by the world-entry
// compile with the rest of the props (the Eastbrook harbor's two programs);
// nothing here runs per frame.

import type * as THREE from 'three';
import { FERRY_PIER_DECKS } from '../sim/ferry_piers';
import { buildHarborWood } from './eastbrook_harbor';

export function buildFerryPiers(seed: number): THREE.Group {
  return buildHarborWood('ferryPiers', FERRY_PIER_DECKS, seed);
}
