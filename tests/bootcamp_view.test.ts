// The Proving Shore movement bootcamp's pure core: the strict lesson ladder
// (move, then camera, then the Gauntlet course), sequential checkpoint
// tagging, the three copy arms (keyboard / touch / gamepad) resolving to real
// catalog keys, and the on-screen keycap chips appearing only where physical
// keys exist to show.

import { describe, expect, it } from 'vitest';
import { BOOTCAMP_COURSE_CHECKPOINTS } from '../src/sim/content/proving_shore';
import {
  advanceCheckpoints,
  BOOTCAMP_CAMERA_TURN_RAD,
  BOOTCAMP_CHECKPOINT_RADIUS_YD,
  BOOTCAMP_MOVE_THRESHOLD_YD,
  BOOTCAMP_STEP_ORDER,
  type BootcampStep,
  bootcampArrowTarget,
  bootcampBodyPlan,
  bootcampKeycaps,
  bootcampNeedsRerender,
  bootcampTitleKey,
  computeBootcampStep,
} from '../src/ui/bootcamp_view';
import { t } from '../src/ui/i18n';

const DONE_ALL = {
  movedYd: BOOTCAMP_MOVE_THRESHOLD_YD + 1,
  cameraTurnedRad: BOOTCAMP_CAMERA_TURN_RAD + 1,
  checkpointsReached: BOOTCAMP_COURSE_CHECKPOINTS.length,
};

describe('computeBootcampStep', () => {
  it('walks the strict ladder: move, camera, course, done', () => {
    expect(computeBootcampStep({ ...DONE_ALL, movedYd: 0 })).toBe('move');
    expect(computeBootcampStep({ ...DONE_ALL, cameraTurnedRad: 0 })).toBe('camera');
    expect(computeBootcampStep({ ...DONE_ALL, checkpointsReached: 0 })).toBe('course');
    expect(computeBootcampStep(DONE_ALL)).toBe('done');
  });

  it('an unmoved player is on move even with everything else satisfied', () => {
    expect(computeBootcampStep({ movedYd: 0, cameraTurnedRad: 99, checkpointsReached: 3 })).toBe(
      'move',
    );
  });
});

describe('advanceCheckpoints', () => {
  const first = BOOTCAMP_COURSE_CHECKPOINTS[0];
  const second = BOOTCAMP_COURSE_CHECKPOINTS[1];

  it('tags the next flag in running order when the player passes close', () => {
    expect(advanceCheckpoints(0, { x: first.x + 1, z: first.z - 1 })).toBe(1);
  });

  it('ignores a later flag until its turn (running order, not any order)', () => {
    expect(advanceCheckpoints(0, { x: second.x, z: second.z })).toBe(0);
  });

  it('does nothing outside the tag radius or past the last flag', () => {
    expect(
      advanceCheckpoints(0, { x: first.x + BOOTCAMP_CHECKPOINT_RADIUS_YD + 1, z: first.z }),
    ).toBe(0);
    expect(advanceCheckpoints(BOOTCAMP_COURSE_CHECKPOINTS.length, { x: first.x, z: first.z })).toBe(
      BOOTCAMP_COURSE_CHECKPOINTS.length,
    );
  });
});

describe('bootcampArrowTarget', () => {
  it('aims at the next untagged flag during the course, nothing otherwise', () => {
    expect(bootcampArrowTarget('course', 1)).toEqual(BOOTCAMP_COURSE_CHECKPOINTS[1]);
    expect(bootcampArrowTarget('move', 0)).toBeNull();
    expect(bootcampArrowTarget('course', BOOTCAMP_COURSE_CHECKPOINTS.length)).toBeNull();
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

  it('keycap chips show only for keyboard steps with physical keys', () => {
    const labels = { moveKeys: ['W', 'A', 'S', 'D'], jumpKey: 'Space' };
    expect(bootcampKeycaps('move', 'keyboard', labels)).toEqual(['W', 'A', 'S', 'D']);
    expect(bootcampKeycaps('course', 'keyboard', labels)).toEqual(['Space']);
    expect(bootcampKeycaps('camera', 'keyboard', labels)).toEqual([]);
    expect(bootcampKeycaps('move', 'touch', labels)).toEqual([]);
    expect(bootcampKeycaps('move', 'pad', labels)).toEqual([]);
  });
});

describe('bootcampNeedsRerender', () => {
  it('repaints on a step change or an input-family flip, not otherwise', () => {
    expect(bootcampNeedsRerender(null, 'move', 'keyboard', 'keyboard')).toBe(true);
    expect(bootcampNeedsRerender('move', 'camera', 'keyboard', 'keyboard')).toBe(true);
    expect(bootcampNeedsRerender('move', 'move', 'keyboard', 'pad')).toBe(true);
    expect(bootcampNeedsRerender('move', 'move', 'pad', 'pad')).toBe(false);
  });
});
