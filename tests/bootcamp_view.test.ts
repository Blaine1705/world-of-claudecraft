// The Proving Shore movement bootcamp's pure core: the ordered Gauntlet
// ladder (talk to Warden Tam, forward, turn-and-walk, strafe, hand in), the
// arrow targeting (Tam, the current lane's flag, Overseer Pell), the three
// copy arms (keyboard / touch / gamepad) resolving to real catalog keys, and
// the on-screen keycap chips appearing only where physical keys exist.

import { describe, expect, it } from 'vitest';
import { BOOTCAMP_COURSE_CHECKPOINTS, PROVING_SHORE_NPCS } from '../src/sim/content/proving_shore';
import {
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

describe('computeBootcampStep', () => {
  it('walks the ladder in the Gauntlet running order', () => {
    expect(computeBootcampStep({ questActive: false, checkpointsReached: 0 })).toBe('talk');
    expect(computeBootcampStep({ questActive: true, checkpointsReached: 0 })).toBe('forward');
    expect(computeBootcampStep({ questActive: true, checkpointsReached: 1 })).toBe('turnwalk');
    expect(computeBootcampStep({ questActive: true, checkpointsReached: 2 })).toBe('strafe');
    expect(computeBootcampStep({ questActive: true, checkpointsReached: 3 })).toBe('done');
  });
});

// NOTE flag tagging is covered sim-side (tests/tutorial_greeting.test.ts
// drives updateGauntletRuns through a real Sim): this core never tags.

describe('bootcampArrowTarget', () => {
  it('leads to Tam, then the current lane flag, then Overseer Pell', () => {
    expect(bootcampArrowTarget('talk', 0)).toEqual(PROVING_SHORE_NPCS.warden_tam.pos);
    expect(bootcampArrowTarget('forward', 0)).toEqual(BOOTCAMP_COURSE_CHECKPOINTS[0]);
    expect(bootcampArrowTarget('turnwalk', 1)).toEqual(BOOTCAMP_COURSE_CHECKPOINTS[1]);
    expect(bootcampArrowTarget('strafe', 2)).toEqual(BOOTCAMP_COURSE_CHECKPOINTS[2]);
    expect(bootcampArrowTarget('done', 3)).toEqual(PROVING_SHORE_NPCS.overseer_pell.pos);
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

  it('touch and pad copy never interpolate bind labels', () => {
    for (const step of steps) {
      for (const mode of ['touch', 'pad'] as const) {
        const plan = bootcampBodyPlan(step, mode);
        expect(plan.params, `${step}/${mode} interpolates bind labels`).toHaveLength(0);
      }
    }
  });

  it('keycap chips show the ordered buttons per lesson, keyboard only', () => {
    const labels = { forwardKey: 'W', turnKey: 'D', strafeKey: 'Q', interactKey: 'F' };
    expect(bootcampKeycaps('talk', 'keyboard', labels)).toEqual(['F']);
    expect(bootcampKeycaps('forward', 'keyboard', labels)).toEqual(['W']);
    expect(bootcampKeycaps('turnwalk', 'keyboard', labels)).toEqual(['D', 'W']);
    expect(bootcampKeycaps('strafe', 'keyboard', labels)).toEqual(['Q']);
    expect(bootcampKeycaps('done', 'keyboard', labels)).toEqual(['F']);
    expect(bootcampKeycaps('forward', 'touch', labels)).toEqual([]);
    expect(bootcampKeycaps('strafe', 'pad', labels)).toEqual([]);
  });
});

describe('bootcampNeedsRerender', () => {
  it('repaints on a step change or an input-family flip, not otherwise', () => {
    expect(bootcampNeedsRerender(null, 'talk', 'keyboard', 'keyboard')).toBe(true);
    expect(bootcampNeedsRerender('talk', 'forward', 'keyboard', 'keyboard')).toBe(true);
    expect(bootcampNeedsRerender('forward', 'forward', 'keyboard', 'pad')).toBe(true);
    expect(bootcampNeedsRerender('forward', 'forward', 'pad', 'pad')).toBe(false);
  });
});
