// The Proving Shore coach's pure core: the ordered Gauntlet ladder (talk to
// Warden Tam, forward, turn-and-walk, strafe, the end-of-course camera swing,
// hand in), the arrow targeting (Tam, the current lane's flag, Overseer
// Pell), the three copy arms (keyboard / touch / gamepad) resolving to real
// catalog keys, the on-screen keycap chips appearing only where physical keys
// exist, and the generic rail coach that keeps the card up for every later
// quest on the relay.

import { describe, expect, it } from 'vitest';
import {
  BOOTCAMP_COURSE_CHECKPOINTS,
  PROVING_SHORE_NPCS,
  PROVING_SHORE_QUEST_ORDER,
  PROVING_SHORE_QUESTS,
} from '../src/sim/content/proving_shore';
import {
  BOOTCAMP_STEP_ORDER,
  type BootcampStep,
  bootcampArrowTarget,
  bootcampBodyPlan,
  bootcampKeycaps,
  bootcampTitleKey,
  COACH_ACTIVE_TARGETS,
  COACH_GAUNTLET_QUEST_ID,
  type CoachState,
  coachCardPlan,
  coachFocus,
  coachKeycaps,
  computeBootcampStep,
} from '../src/ui/bootcamp_view';
import { t } from '../src/ui/i18n';

describe('computeBootcampStep', () => {
  it('walks the ladder in the Gauntlet running order, camera last', () => {
    const base = { cameraTurned: false };
    expect(computeBootcampStep({ questActive: false, checkpointsReached: 0, ...base })).toBe(
      'talk',
    );
    expect(computeBootcampStep({ questActive: true, checkpointsReached: 0, ...base })).toBe(
      'forward',
    );
    expect(computeBootcampStep({ questActive: true, checkpointsReached: 1, ...base })).toBe(
      'turnwalk',
    );
    expect(computeBootcampStep({ questActive: true, checkpointsReached: 2, ...base })).toBe(
      'strafe',
    );
    // All flags tagged: the camera lesson holds the card until the view has
    // genuinely swung, then the hand-in card takes over.
    expect(computeBootcampStep({ questActive: true, checkpointsReached: 3, ...base })).toBe(
      'camera',
    );
    expect(
      computeBootcampStep({ questActive: true, checkpointsReached: 3, cameraTurned: true }),
    ).toBe('done');
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
    // The camera lesson has no world target: the lesson is the view itself.
    expect(bootcampArrowTarget('camera', 3)).toBeNull();
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

  it('the strafe lesson turns with the turn key, never the camera', () => {
    // The camera got its own end-of-course lesson; the strafe copy must not
    // reintroduce mouse-drag view control on the keyboard arm.
    const plan = bootcampBodyPlan('strafe', 'keyboard');
    expect(plan.params).toEqual(['turnKey', 'strafeKey']);
    const body = t(plan.bodyKey, { turnKey: 'D', strafeKey: 'Q' });
    expect(body).not.toMatch(/mouse/i);
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
    expect(bootcampKeycaps('strafe', 'keyboard', labels)).toEqual(['D', 'Q']);
    // The camera lesson is mouse/stick work: no keycaps anywhere.
    expect(bootcampKeycaps('camera', 'keyboard', labels)).toEqual([]);
    expect(bootcampKeycaps('done', 'keyboard', labels)).toEqual(['F']);
    expect(bootcampKeycaps('forward', 'touch', labels)).toEqual([]);
    expect(bootcampKeycaps('strafe', 'pad', labels)).toEqual([]);
  });
});

describe('the rail coach', () => {
  it('focuses the first quest still moving, in chain order', () => {
    expect(COACH_GAUNTLET_QUEST_ID).toBe('q_ps_the_gauntlet');
    // Nothing moving: no card.
    expect(coachFocus(() => null)).toBeNull();
    // The head quest wins even when a later state might exist.
    expect(coachFocus((id) => (id === 'q_ps_the_gauntlet' ? 'available' : null))).toEqual({
      questId: 'q_ps_the_gauntlet',
      state: 'available',
    });
    // Mid-rail: the relay's current station is the first non-null state.
    expect(coachFocus((id) => (id === 'q_ps_shell_and_claw' ? 'active' : null))).toEqual({
      questId: 'q_ps_shell_and_claw',
      state: 'active',
    });
  });

  it('every rail quest resolves a full three-state card in all three arms', () => {
    for (const questId of PROVING_SHORE_QUEST_ORDER) {
      for (const state of ['available', 'active', 'ready'] as CoachState[]) {
        for (const mode of ['keyboard', 'touch', 'pad'] as const) {
          const plan = coachCardPlan({ questId, state }, mode);
          const params: Record<string, string> = { npc: 'X' };
          for (const p of plan.params) params[p] = 'X';
          const body = t(plan.bodyKey, params);
          expect(body, `${questId}/${state}/${mode}`).toBeTruthy();
          expect(body, `${questId}/${state}/${mode} unfilled param`).not.toMatch(/\{\w+\}/);
          if (plan.titleKey) {
            const title = t(plan.titleKey, { npc: 'X' });
            expect(title, `${questId}/${state}/${mode} title`).toBeTruthy();
            expect(title).not.toMatch(/\{\w+\}/);
          } else {
            // The active card is titled with the quest's own localized name.
            expect(state).toBe('active');
          }
          // Touch and pad never interpolate bind labels.
          if (mode !== 'keyboard') expect(plan.params).toHaveLength(0);
        }
      }
    }
  });

  it('arrows lead to the giver, the task ground, then the turn-in', () => {
    for (const questId of PROVING_SHORE_QUEST_ORDER) {
      const quest = PROVING_SHORE_QUESTS[questId];
      const giver = PROVING_SHORE_NPCS[quest.giverNpcId];
      const turnIn = PROVING_SHORE_NPCS[quest.turnInNpcId];
      expect(coachCardPlan({ questId, state: 'available' }, 'keyboard').arrow).toEqual(giver.pos);
      expect(coachCardPlan({ questId, state: 'ready' }, 'keyboard').arrow).toEqual(turnIn.pos);
      const active = coachCardPlan({ questId, state: 'active' }, 'keyboard').arrow;
      expect(active).toEqual(COACH_ACTIVE_TARGETS[questId] ?? turnIn.pos);
    }
    // Every quest after the Gauntlet has an authored task target (the head
    // quest's active card is the lesson ladder, which aims at the flags).
    for (const questId of PROVING_SHORE_QUEST_ORDER.slice(1)) {
      expect(COACH_ACTIVE_TARGETS[questId], `${questId} task target`).toBeTruthy();
    }
  });

  it('the npc whose name the card splices is the giver in, the turn-in back', () => {
    for (const questId of PROVING_SHORE_QUEST_ORDER) {
      const quest = PROVING_SHORE_QUESTS[questId];
      expect(coachCardPlan({ questId, state: 'available' }, 'touch').npcId).toBe(quest.giverNpcId);
      expect(coachCardPlan({ questId, state: 'ready' }, 'touch').npcId).toBe(quest.turnInNpcId);
    }
  });

  it('coach keycaps: the interact key going in and back, nothing mid-task', () => {
    expect(coachKeycaps('available', 'keyboard', 'F')).toEqual(['F']);
    expect(coachKeycaps('ready', 'keyboard', 'F')).toEqual(['F']);
    expect(coachKeycaps('active', 'keyboard', 'F')).toEqual([]);
    expect(coachKeycaps('available', 'touch', 'F')).toEqual([]);
    expect(coachKeycaps('ready', 'pad', 'F')).toEqual([]);
  });
});
