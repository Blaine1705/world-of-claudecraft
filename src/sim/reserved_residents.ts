// The reserved-id residents raised at world init (rng-free, outside the sequential allocator):
// the Wyrmwatch harbormaster, the Highwatch manor's steward and the Highwatch guild's four
// residents. One call from sim.ts.

import { spawnHighwatchGuildResidents } from './highwatch_guild';
import { spawnHighwatchSteward } from './highwatch_manor';
import type { SimContext } from './sim_context';
import type { WorldContent } from './types';
import { spawnHarborHouseKeeper } from './wyrmwatch_harbor_house';

export function spawnReservedResidents(ctx: SimContext, world: WorldContent): void {
  spawnHarborHouseKeeper(ctx, world);
  spawnHighwatchSteward(ctx, world);
  spawnHighwatchGuildResidents(ctx, world);
}
