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
  PROVING_SHORE_OBJECTS,
  PROVING_SHORE_QUEST_ORDER,
  PROVING_SHORE_QUESTS,
} from '../src/sim/content/proving_shore';
import {
  BELL_STEP_TARGET,
  BOOTCAMP_STEP_ORDER,
  type BootcampStep,
  bellCardPlan,
  bootcampArrowTarget,
  bootcampBodyPlan,
  bootcampKeycaps,
  bootcampTitleKey,
  CAMERA_LESSON_TRAVEL_RAD,
  COACH_ACTIVE_TARGETS,
  COACH_GAUNTLET_QUEST_ID,
  type CoachState,
  coachCardPlan,
  coachFocus,
  coachKeycaps,
  computeBootcampStep,
  nextWreckCrateTarget,
  WRECK_CRATE_POSITIONS,
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
    // One deliberate drag completes the camera lesson immediately: the
    // travel ask stays a fraction of a turn, never a full circle.
    expect(CAMERA_LESSON_TRAVEL_RAD).toBeLessThanOrEqual(0.5);
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

  it('the strafe lesson asks for the strafe key alone', () => {
    // The camera got its own end-of-course lesson, and the turn lesson
    // already happened a lane ago: the strafe copy names ONE key and must
    // reintroduce neither mouse-drag view control nor the turn key.
    const plan = bootcampBodyPlan('strafe', 'keyboard');
    expect(plan.params).toEqual(['strafeKey']);
    const body = t(plan.bodyKey, { strafeKey: 'Q' });
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
    expect(bootcampKeycaps('strafe', 'keyboard', labels)).toEqual(['Q']);
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

  it('coach keycaps mirror the card plan params, minus the map-key aside', () => {
    const labels = {
      interactKey: 'F',
      mapKey: 'M',
      targetKey: 'Tab',
      attackKey: '1',
      bagsKey: 'B',
    };
    const at = (questId: string, state: CoachState, mode: 'keyboard' | 'touch' | 'pad') =>
      coachKeycaps(coachCardPlan({ questId, state }, mode), mode, labels);
    expect(at('q_ps_shell_and_claw', 'available', 'keyboard')).toEqual(['F']);
    expect(at('q_ps_shell_and_claw', 'ready', 'keyboard')).toEqual(['F']);
    // The generic task card's only param is the map key, which stays an
    // aside in the copy, never a chip (Set Sail is the one generic task).
    expect(at('q_ps_set_sail', 'active', 'keyboard')).toEqual([]);
    expect(at('q_ps_strike_true', 'active', 'keyboard')).toEqual(['Tab', '1']);
    expect(at('q_ps_shell_and_claw', 'active', 'keyboard')).toEqual(['Tab', '1']);
    expect(at('q_ps_the_wreck_line', 'active', 'keyboard')).toEqual(['F']);
    expect(at('q_ps_pouch_and_purse', 'active', 'keyboard')).toEqual(['F']);
    expect(at('q_ps_pouch_and_purse', 'ready', 'keyboard')).toEqual(['B', 'F']);
    expect(at('q_ps_shell_and_claw', 'available', 'touch')).toEqual([]);
    expect(at('q_ps_strike_true', 'active', 'pad')).toEqual([]);
  });

  it('quest-mechanic overrides replace the generic bodies with real lessons', () => {
    // Strike True teaches targeting and the swing; the Wreck Line teaches
    // the pickup press; the pouch lesson's hand-in card walks the buckle-on.
    const strike = coachCardPlan({ questId: 'q_ps_strike_true', state: 'active' }, 'keyboard');
    expect(strike.params).toEqual(['targetKey', 'attackKey']);
    const strikeBody = t(strike.bodyKey, { targetKey: 'Tab', attackKey: '1' });
    expect(strikeBody).toMatch(/target/i);
    expect(strikeBody).not.toMatch(/\{\w+\}/);
    const wreck = coachCardPlan({ questId: 'q_ps_the_wreck_line', state: 'active' }, 'keyboard');
    expect(wreck.params).toEqual(['interactKey']);
    expect(t(wreck.bodyKey, { interactKey: 'F' })).toMatch(/crate/i);
    // The scuttler cull's card carries the retreat warning.
    const shell = coachCardPlan({ questId: 'q_ps_shell_and_claw', state: 'active' }, 'keyboard');
    expect(shell.params).toEqual(['targetKey', 'attackKey']);
    const shellBody = t(shell.bodyKey, { targetKey: 'Tab', attackKey: '1' });
    expect(shellBody).toMatch(/retreat/i);
    expect(shellBody).not.toMatch(/\{\w+\}/);
    // The pouch lesson's ACTIVE card walks the stall purchase, naming the
    // GIVER (Quartermaster Finch, who runs the stall), not the turn-in.
    const pouchBuy = coachCardPlan(
      { questId: 'q_ps_pouch_and_purse', state: 'active' },
      'keyboard',
    );
    expect(pouchBuy.params).toEqual(['interactKey']);
    expect(pouchBuy.bodyHasNpc).toBe(true);
    expect(pouchBuy.npcId).toBe('quartermaster_finch');
    const pouchBuyBody = t(pouchBuy.bodyKey, { interactKey: 'F', npc: 'X' });
    expect(pouchBuyBody).toMatch(/pouch/i);
    expect(pouchBuyBody).not.toMatch(/\{\w+\}/);
    const pouch = coachCardPlan({ questId: 'q_ps_pouch_and_purse', state: 'ready' }, 'keyboard');
    expect(pouch.params).toEqual(['bagsKey', 'interactKey']);
    expect(pouch.bodyHasNpc).toBe(true);
    const pouchBody = t(pouch.bodyKey, { bagsKey: 'B', interactKey: 'F', npc: 'X' });
    expect(pouchBody).toMatch(/bag/i);
    expect(pouchBody).not.toMatch(/\{\w+\}/);
    // Quests without an override keep the generic three-state copy.
    const generic = coachCardPlan({ questId: 'q_ps_set_sail', state: 'active' }, 'keyboard');
    expect(generic.bodyKey).toBe('hudChrome.bootcamp.coachTaskBody');
  });
});

describe('the crate line arrow', () => {
  it('walks the authored line, hopping to the next un-looted crate', () => {
    expect(WRECK_CRATE_POSITIONS.length).toBe(6);
    // Everything standing: the first crate.
    expect(nextWreckCrateTarget(WRECK_CRATE_POSITIONS)).toEqual(WRECK_CRATE_POSITIONS[0]);
    // The first two picked up: the third is next.
    expect(nextWreckCrateTarget(WRECK_CRATE_POSITIONS.slice(2))).toEqual(WRECK_CRATE_POSITIONS[2]);
    // Only the last stands: aim there.
    expect(nextWreckCrateTarget([WRECK_CRATE_POSITIONS[5]])).toEqual(WRECK_CRATE_POSITIONS[5]);
    // A crate slightly off its authored spot (the entity's live pos) still
    // matches its authored anchor.
    const off = { x: WRECK_CRATE_POSITIONS[3].x + 0.5, z: WRECK_CRATE_POSITIONS[3].z - 0.5 };
    expect(nextWreckCrateTarget([off])).toEqual(WRECK_CRATE_POSITIONS[3]);
    // Nothing mirrored yet: fall back to the line's start.
    expect(nextWreckCrateTarget([])).toEqual(WRECK_CRATE_POSITIONS[0]);
  });
});

describe('the closing bell card', () => {
  it('aims at the authored island ferry bell and resolves all three arms', () => {
    const bell = PROVING_SHORE_OBJECTS.find((o) => o.itemId === 'ps_ferry_bell');
    const island = bell?.positions.find((p) => p.x < -180);
    expect(BELL_STEP_TARGET).toEqual(island);
    for (const mode of ['keyboard', 'touch', 'pad'] as const) {
      const plan = bellCardPlan(mode);
      expect(plan.arrow).toEqual(island);
      const params: Record<string, string> = {};
      for (const p of plan.params) params[p] = 'X';
      const body = t(plan.bodyKey, params);
      expect(body, `bell/${mode}`).toBeTruthy();
      expect(body).not.toMatch(/\{\w+\}/);
      expect(t(plan.titleKey)).toBeTruthy();
      if (mode !== 'keyboard') expect(plan.params).toHaveLength(0);
    }
  });
});
