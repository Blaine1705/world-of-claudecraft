// The reserved-id residents raised at world init (rng-free, outside the sequential allocator):
// the Wyrmwatch harbormaster and the Highwatch manor's steward. One call from sim.ts.

import { spawnHighwatchSteward } from './highwatch_manor';
import type { SimContext } from './sim_context';
import type { WorldContent } from './types';
import { spawnHarborHouseKeeper } from './wyrmwatch_harbor_house';

export function spawnReservedResidents(ctx: SimContext, world: WorldContent): void {
  spawnHarborHouseKeeper(ctx, world);
  spawnHighwatchSteward(ctx, world);
}
