// The teleport camera snap: after a teleport-scale displacement the chase
// camera yaw becomes the landed facing (so an arrival shows what the landing
// authored, e.g. the Proving Shore arrival facing Warden Tam's Gauntlet
// gate); a walked frame leaves the yaw alone. The threshold is shared with
// zone_transition.ts so "what is a teleport" has exactly one definition.

import { describe, expect, it } from 'vitest';
import { teleportCameraYaw } from '../src/game/teleport_camera';
import { TELEPORT_DISPLACEMENT_YD, zoneWarmupMode } from '../src/game/zone_transition';

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
