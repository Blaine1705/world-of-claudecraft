// The teleport camera snap: after a teleport-scale displacement the chase
// camera yaw becomes the landed facing (so an arrival shows what the landing
// authored, e.g. the Proving Shore arrival facing Warden Tam's Gauntlet
// gate); a walked frame leaves the yaw alone. The threshold is shared with
// zone_transition.ts so "what is a teleport" has exactly one definition.

import { describe, expect, it } from 'vitest';
import { islandTeleportCameraYaw, teleportCameraYaw } from '../src/game/teleport_camera';
import { TELEPORT_DISPLACEMENT_YD, zoneWarmupMode } from '../src/game/zone_transition';
import { PROVING_SHORE_ARRIVAL } from '../src/sim/content/proving_shore';
import { FERRY_BELL_TOWN_LANDING } from '../src/sim/interactions/ferry_bell';

describe('teleportCameraYaw', () => {
  it('snaps to the landed facing past the teleport threshold', () => {
    expect(teleportCameraYaw(TELEPORT_DISPLACEMENT_YD + 1, 2.4, 0.1)).toBe(2.4);
    expect(teleportCameraYaw(290, -3.09, 0.1)).toBe(-3.09); // the ferry crossing
  });

  it('leaves a walked frame alone, exactly where the warmup classifier does', () => {
    expect(teleportCameraYaw(0.7, 2.4, 0.1)).toBe(0.1); // a mounted sprint frame
    expect(teleportCameraYaw(TELEPORT_DISPLACEMENT_YD, 2.4, 0.1)).toBe(0.1);
    // The same boundary the loading-screen decision uses: the two can never
    // disagree about what counts as a teleport.
    expect(zoneWarmupMode(TELEPORT_DISPLACEMENT_YD)).toBe('background');
    expect(zoneWarmupMode(TELEPORT_DISPLACEMENT_YD + 1)).toBe('blocking');
  });
});

describe('islandTeleportCameraYaw (the ferry scoping)', () => {
  const JUMP = TELEPORT_DISPLACEMENT_YD + 100;

  it('snaps both ferry rides: town to island and island to town', () => {
    // Outbound: from beside the town bell to the authored arrival.
    expect(
      islandTeleportCameraYaw(
        3,
        -7.5,
        PROVING_SHORE_ARRIVAL.x,
        PROVING_SHORE_ARRIVAL.z,
        JUMP,
        PROVING_SHORE_ARRIVAL.facing,
        0.1,
      ),
    ).toBe(PROVING_SHORE_ARRIVAL.facing);
    // Home: from the Old Pier bell to the town landing.
    expect(
      islandTeleportCameraYaw(
        -280,
        0,
        FERRY_BELL_TOWN_LANDING.x,
        FERRY_BELL_TOWN_LANDING.z,
        JUMP,
        FERRY_BELL_TOWN_LANDING.facing,
        0.1,
      ),
    ).toBe(FERRY_BELL_TOWN_LANDING.facing);
  });

  it('never re-aims a mainland teleport, however large (PR #3467 review, finding 6)', () => {
    // A hearthstone or dungeon door wholly off the island keeps the player's
    // yaw: re-aiming every teleport in the game is a global feel change that
    // must not ride inside the tutorial island.
    expect(islandTeleportCameraYaw(120, 40, 4, -6, JUMP, 2.4, 0.1)).toBe(0.1);
    // Including one that lands in the island's x COLUMN but not its z band
    // (the Willowfen strand): the scoping is the zone rectangle, both axes.
    expect(islandTeleportCameraYaw(120, 40, -232, 220, JUMP, 2.4, 0.1)).toBe(0.1);
  });
});
