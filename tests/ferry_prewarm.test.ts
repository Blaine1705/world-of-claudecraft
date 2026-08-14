// The ferry prewarm decision: a clicked crossing has no reading time to hide a
// cold destination behind, so the far shore is streamed while the player walks
// up to the bell. Pinned against the shipped bell placements.

import { describe, expect, it } from 'vitest';
import { FERRY_PREWARM_RADIUS_YD, ferryPrewarmTargetFor } from '../src/game/ferry_prewarm';
import { PROVING_SHORE_ARRIVAL, PROVING_SHORE_OBJECTS } from '../src/sim/content/proving_shore';
import { FERRY_BELL_TOWN_LANDING } from '../src/sim/interactions/ferry_bell';

const bells = PROVING_SHORE_OBJECTS.find((o) => o.itemId === 'ps_ferry_bell')?.positions ?? [];
const islandBell = bells.find((b) => b.x < -180)!;
const townBell = bells.find((b) => b.x >= -180)!;

describe('ferry prewarm target', () => {
  it('warms the OTHER shore at each bell, matching the sim side test', () => {
    const atIsland = ferryPrewarmTargetFor(islandBell.x, islandBell.z);
    expect(atIsland?.id).toBe('eastbrook_town');
    expect([atIsland?.x, atIsland?.z]).toEqual([
      FERRY_BELL_TOWN_LANDING.x,
      FERRY_BELL_TOWN_LANDING.z,
    ]);

    const atTown = ferryPrewarmTargetFor(townBell.x, townBell.z);
    expect(atTown?.id).toBe('proving_shore');
    expect([atTown?.x, atTown?.z]).toEqual([PROVING_SHORE_ARRIVAL.x, PROVING_SHORE_ARRIVAL.z]);
  });

  it('reaches far enough to cover an ordinary walk up to the bell', () => {
    // Just inside the radius warms; well outside does not, so the whole world
    // is not streaming a ferry destination at all times.
    const near = ferryPrewarmTargetFor(islandBell.x, islandBell.z + FERRY_PREWARM_RADIUS_YD - 1);
    expect(near?.id).toBe('eastbrook_town');
    expect(ferryPrewarmTargetFor(islandBell.x, islandBell.z + FERRY_PREWARM_RADIUS_YD + 5)).toBeNull();
  });

  it('is null out in the world, away from either bell', () => {
    // The Eastbrook spawn square is close to the town bell, so sample a real
    // elsewhere: the Mirefen hub, a zone away.
    expect(ferryPrewarmTargetFor(0, 400)).toBeNull();
  });
});
