// The standing rear-up (src/render/mount_rear_core.ts): a jump taken STANDING STILL on a mount
// that can rear plays the rear instead of the in-place hop; every other jump is untouched.
// Pure render-side presentation derived from the airborne/moving facts the renderer already
// reads for every rider (offline and online alike), so nothing in the sim changes.
import { describe, expect, it } from 'vitest';
import {
  createMountRearState,
  MOUNT_REAR_SECONDS,
  mountRearHopCancel,
  stepMountRear,
} from '../src/render/mount_rear_core';

const step = (
  s: ReturnType<typeof createMountRearState>,
  now: number,
  airborne: boolean,
  moving = false,
  canRear = true,
) => stepMountRear(s, { now, airborne, moving, canRear });

describe('the standing rear-up trigger', () => {
  it('starts on the take-off edge of a standing jump, once, and runs its length', () => {
    const s = createMountRearState();
    expect(step(s, 0, false)).toEqual({ start: false, active: false });
    expect(step(s, 0.05, true)).toEqual({ start: true, active: true });
    // still airborne next frame: no second start
    expect(step(s, 0.1, true)).toEqual({ start: false, active: true });
    expect(step(s, 0.6, false).active).toBe(true);
    expect(step(s, MOUNT_REAR_SECONDS + 0.04, false).active).toBe(true);
    expect(step(s, MOUNT_REAR_SECONDS + 0.06, false).active).toBe(false);
  });

  it('leaves a moving jump alone', () => {
    const s = createMountRearState();
    step(s, 0, false, true);
    expect(step(s, 0.05, true, true)).toEqual({ start: false, active: false });
  });

  it('never rears a mount that cannot (every mount but the destrier)', () => {
    const s = createMountRearState();
    step(s, 0, false, false, false);
    expect(step(s, 0.05, true, false, false)).toEqual({ start: false, active: false });
  });

  it('a second standing jump mid-rear does not restart it', () => {
    const s = createMountRearState();
    step(s, 0, false);
    step(s, 0.05, true);
    step(s, 0.6, false);
    expect(step(s, 0.7, true)).toEqual({ start: false, active: true });
  });

  it('breaks off when the rider moves off', () => {
    const s = createMountRearState();
    step(s, 0, false);
    step(s, 0.05, true);
    expect(step(s, 0.3, true, true).active).toBe(false);
  });

  it('a rider seen already airborne (first sighting) does not rear', () => {
    const s = createMountRearState();
    expect(step(s, 0, true).start).toBe(false);
  });
});

describe('the hop cancel', () => {
  it('pulls the mount back to the ground by exactly the jump height while rearing', () => {
    expect(mountRearHopCancel(true, 10.8, 10)).toBeCloseTo(-0.8, 9);
    // grounded or below the sampled ground: nothing to cancel
    expect(mountRearHopCancel(true, 10, 10)).toBe(0);
    expect(mountRearHopCancel(true, 9.9, 10)).toBe(0);
    // not rearing: the hop plays as it always has
    expect(mountRearHopCancel(false, 10.8, 10)).toBe(0);
  });
});
