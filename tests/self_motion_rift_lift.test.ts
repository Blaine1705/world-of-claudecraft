// Issue #3479 (enable self-motion prediction inside rifts): direct unit
// coverage for the pure lift-resolution pair self_motion.ts calls every
// predictor step. tests/self_motion.test.ts's "rift prediction" describe
// block already exercises this end to end through the predictor kernel; this
// file pins the two functions in isolation, including the region-containment
// guard (riftLiftFor returns 0 off the mirrored floor's band) that end-to-end
// suite has no reason to ever hit.

import { describe, expect, it } from 'vitest';
import { resolvedRiftFloorPlan, riftLiftFor } from '../src/render/self_motion_rift_lift';
import { RIFT_REGION_HALF_X, RIFT_REGION_HALF_Z, riftInstanceOrigin } from '../src/sim/data';
import { generateRiftFloor, riftLiftAt } from '../src/sim/rift/rift_gen';
import type { RiftFloorView } from '../src/world_api/dungeons';

// Same procedural fixture tests/self_motion.test.ts's ramp-walking test uses:
// a raised platform reached by a ramp spanning local z 84..94.
const PLATFORM_SEED = 6;
const PLATFORM_BASE_LEVEL = 20;

function riftFloorView(overrides: Partial<RiftFloorView> = {}): RiftFloorView {
  return {
    eventId: null,
    instanceId: 0,
    seed: PLATFORM_SEED,
    baseLevel: PLATFORM_BASE_LEVEL,
    floorIndex: 0,
    floorCount: 5,
    origin: riftInstanceOrigin(0, 0),
    contentId: `procedural-v1:${PLATFORM_SEED}:${PLATFORM_BASE_LEVEL}`,
    contentHash: `procedural-v1:${PLATFORM_SEED}:${PLATFORM_BASE_LEVEL}`,
    upgrade: null,
    name: 'Test Rift',
    themeName: 'Test Theme',
    tier: null,
    ...overrides,
  };
}

describe('resolvedRiftFloorPlan (issue #3479)', () => {
  it('resolves null for a null floor', () => {
    expect(resolvedRiftFloorPlan(null)).toBeNull();
  });

  it('resolves the same plan generateRiftFloor hands the server for a real floor', () => {
    const view = riftFloorView();
    const plan = resolvedRiftFloorPlan(view);
    expect(plan).not.toBeNull();
    const direct = generateRiftFloor(view.seed, view.baseLevel, view.floorIndex, view.upgrade);
    expect(plan).toBe(direct);
  });
});

describe('riftLiftFor (issue #3479)', () => {
  it('is 0 when the plan is null (not in a rift)', () => {
    const origin = riftInstanceOrigin(0, 0);
    expect(riftLiftFor(null, origin, origin.x, origin.z)).toBe(0);
  });

  it('is 0 at a non-rift x, even with a resolved plan', () => {
    const view = riftFloorView();
    const plan = resolvedRiftFloorPlan(view);
    expect(riftLiftFor(plan, view.origin, 0, 0)).toBe(0);
  });

  it('matches riftLiftAt on the raised plateau, local to the floor origin', () => {
    const view = riftFloorView();
    const plan = resolvedRiftFloorPlan(view);
    expect(plan).not.toBeNull();
    if (!plan) throw new Error('unreachable: plan resolved above');
    const localX = 0;
    const localZ = 100; // past the ramp's rampZ1 (94): flat plateau height
    const expected = riftLiftAt(plan, localX, localZ);
    expect(expected).toBeGreaterThan(0);
    expect(riftLiftFor(plan, view.origin, view.origin.x + localX, view.origin.z + localZ)).toBe(
      expected,
    );
  });

  it('is 0 outside the mirrored region even though isRiftPos(x) is true (containment guard)', () => {
    const view = riftFloorView();
    const plan = resolvedRiftFloorPlan(view);
    // Well past RIFT_REGION_HALF_Z from this floor's own origin, but still
    // inside the rift x-band (isRiftPos reads true): a neighboring floor's
    // footprint, which riftLiftFor must not reach into.
    const farZ = view.origin.z + RIFT_REGION_HALF_Z + 50;
    expect(riftLiftFor(plan, view.origin, view.origin.x, farZ)).toBe(0);

    const farX = view.origin.x + RIFT_REGION_HALF_X + 5;
    expect(riftLiftFor(plan, view.origin, farX, view.origin.z)).toBe(0);
  });
});
