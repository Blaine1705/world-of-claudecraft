// The Proving Shore movement bootcamp's pure core: the strictly ordered
// Gauntlet ladder (forward, camera, strafe left, camera, forward), the
// order-gated checkpoint tagging, the three copy arms (keyboard / touch /
// gamepad) resolving to real catalog keys, and the on-screen keycap chips
// appearing only where physical keys exist to show.

import { describe, expect, it } from 'vitest';
import { BOOTCAMP_COURSE_CHECKPOINTS } from '../src/sim/content/proving_shore';
import {
  advanceCheckpoints,
  BOOTCAMP_CAMERA_TURN_RAD,
  BOOTCAMP_CHECKPOINT_RADIUS_YD,
  BOOTCAMP_STEP_ORDER,
  type BootcampStep,
  bootcampArrowTarget,
  bootcampBodyPlan,
  bootcampKeycaps,
  bootcampNeedsRerender,
  bootcampTitleKey,
  computeBootcampStep,
  stepMovementAction,
} from '../src/ui/bootcamp_view';
import { t } from '../src/ui/i18n';

const TURNED = BOOTCAMP_CAMERA_TURN_RAD + 0.1;

describe('computeBootcampStep', () => {
  it('walks the ladder in the Gauntlet running order', () => {
    expect(computeBootcampStep({ checkpointsReached: 0, yawTurnedSinceFlagRad: 99 })).toBe(
      'forward',
    );
    expect(computeBootcampStep({ checkpointsReached: 1, yawTurnedSinceFlagRad: 0 })).toBe('camera');
    expect(computeBootcampStep({ checkpointsReached: 1, yawTurnedSinceFlagRad: TURNED })).toBe(
      'left',
    );
    expect(computeBootcampStep({ checkpointsReached: 2, yawTurnedSinceFlagRad: 0 })).toBe(
      'camera2',
    );
    expect(computeBootcampStep({ checkpointsReached: 2, yawTurnedSinceFlagRad: TURNED })).toBe(
      'forward2',
    );
    expect(computeBootcampStep({ checkpointsReached: 3, yawTurnedSinceFlagRad: 0 })).toBe('done');
  });

  it('each camera lesson gates the lane after it (the yaw counter resets per flag)', () => {
    // Reaching flag 1 with a huge PRIOR yaw travel still lands on 'camera':
    // the overlay resets the counter at every tag, and the ladder reads only
    // the travel since the last flag.
    expect(computeBootcampStep({ checkpointsReached: 1, yawTurnedSinceFlagRad: 0 })).toBe('camera');
  });
});

describe('stepMovementAction', () => {
  it('maps lanes to their buttons and camera lessons to none', () => {
    expect(stepMovementAction('forward')).toBe('forward');
    expect(stepMovementAction('forward2')).toBe('forward');
    expect(stepMovementAction('left')).toBe('strafeLeft');
    expect(stepMovementAction('camera')).toBeNull();
    expect(stepMovementAction('camera2')).toBeNull();
    expect(stepMovementAction('done')).toBeNull();
  });
});

describe('advanceCheckpoints', () => {
  const first = BOOTCAMP_COURSE_CHECKPOINTS[0];
  const second = BOOTCAMP_COURSE_CHECKPOINTS[1];

  it('tags the next flag in running order when the player passes close', () => {
    expect(advanceCheckpoints(0, { x: first.x + 1, z: first.z - 1 }, true)).toBe(1);
  });

  it('never credits while the ladder is on a camera lesson (creditAllowed false)', () => {
    expect(advanceCheckpoints(1, { x: second.x, z: second.z }, false)).toBe(1);
  });

  it('ignores a later flag until its turn (running order, not any order)', () => {
    expect(advanceCheckpoints(0, { x: second.x, z: second.z }, true)).toBe(0);
  });

  it('does nothing outside the tag radius or past the last flag', () => {
    expect(
      advanceCheckpoints(0, { x: first.x + BOOTCAMP_CHECKPOINT_RADIUS_YD + 1, z: first.z }, true),
    ).toBe(0);
    expect(
      advanceCheckpoints(BOOTCAMP_COURSE_CHECKPOINTS.length, { x: first.x, z: first.z }, true),
    ).toBe(BOOTCAMP_COURSE_CHECKPOINTS.length);
  });
});

describe('bootcampArrowTarget', () => {
  it('aims at the current lane flag, hides during camera lessons and when done', () => {
    expect(bootcampArrowTarget('forward', 0)).toEqual(BOOTCAMP_COURSE_CHECKPOINTS[0]);
    expect(bootcampArrowTarget('left', 1)).toEqual(BOOTCAMP_COURSE_CHECKPOINTS[1]);
    expect(bootcampArrowTarget('forward2', 2)).toEqual(BOOTCAMP_COURSE_CHECKPOINTS[2]);
    expect(bootcampArrowTarget('camera', 1)).toBeNull();
    expect(bootcampArrowTarget('camera2', 2)).toBeNull();
    expect(bootcampArrowTarget('done', 3)).toBeNull();
  });
});

describe('copy plans', () => {
  const steps: BootcampStep[] = [...BOOTCAMP_STEP_ORDER, 'done'];

  it('every step resolves a real English string in all three input arms', () => {
    for (const step of steps) {
      for (const mode of ['keyboard', 'touch', 'pad'] as const) {
        const plan = bootcampBodyPlan(step, mode);
        const params: Record<string, string> = {};
        for (const p of plan.params) params[p] = 'X';
        const body = t(plan.bodyKey, params);
        expect(body, `${step}/${mode}`).toBeTruthy();
        expect(body, `${step}/${mode} leaked its key`).not.toBe(plan.bodyKey);
        // No unresolved {placeholder} survives interpolation.
        expect(body, `${step}/${mode} has an unfilled param`).not.toMatch(/\{\w+\}/);
      }
      const title = t(bootcampTitleKey(step));
      expect(title, `${step} title`).toBeTruthy();
    }
  });

  it('touch and pad copy never reference keyboard hardware', () => {
    for (const step of steps) {
      for (const mode of ['touch', 'pad'] as const) {
        const plan = bootcampBodyPlan(step, mode);
        expect(plan.params, `${step}/${mode} interpolates bind labels`).toHaveLength(0);
        const body = t(plan.bodyKey, {});
        expect(body, `${step}/${mode} says mouse`).not.toMatch(/mouse/i);
      }
    }
  });

  it('keycap chips show the ordered buttons: W lanes, Q lane, none for camera', () => {
    const labels = { forwardKey: 'W', strafeKey: 'Q' };
    expect(bootcampKeycaps('forward', 'keyboard', labels)).toEqual(['W']);
    expect(bootcampKeycaps('left', 'keyboard', labels)).toEqual(['Q']);
    expect(bootcampKeycaps('forward2', 'keyboard', labels)).toEqual(['W']);
    expect(bootcampKeycaps('camera', 'keyboard', labels)).toEqual([]);
    expect(bootcampKeycaps('camera2', 'keyboard', labels)).toEqual([]);
    expect(bootcampKeycaps('forward', 'touch', labels)).toEqual([]);
    expect(bootcampKeycaps('left', 'pad', labels)).toEqual([]);
  });
});

describe('bootcampNeedsRerender', () => {
  it('repaints on a step change or an input-family flip, not otherwise', () => {
    expect(bootcampNeedsRerender(null, 'forward', 'keyboard', 'keyboard')).toBe(true);
    expect(bootcampNeedsRerender('forward', 'camera', 'keyboard', 'keyboard')).toBe(true);
    expect(bootcampNeedsRerender('forward', 'forward', 'keyboard', 'pad')).toBe(true);
    expect(bootcampNeedsRerender('forward', 'forward', 'pad', 'pad')).toBe(false);
  });
});
