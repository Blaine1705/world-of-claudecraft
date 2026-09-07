import { describe, expect, it } from 'vitest';
import { hordeControlsActive, hordeExitInput, requestHordeExit } from '../src/game/horde_controls';
import { HORDE_QUEST_ID } from '../src/sim/content/world_quest_horde';
import { createHordeBarricade } from '../src/sim/minigames/horde_barricade';
import { emptyMoveInput, type WorldQuestProgress } from '../src/sim/types';

describe('horde input ownership', () => {
  it('holds requested exit over multiple network frames but never cancels a new attempt', () => {
    const state = createHordeBarricade(5);
    const progress: WorldQuestProgress = {
      questId: HORDE_QUEST_ID,
      state: 'active',
      count: 0,
      horde: state,
    };
    const world = { worldQuestLog: new Map([[HORDE_QUEST_ID, progress]]) };
    requestHordeExit(world);
    expect(hordeExitInput(world, emptyMoveInput()).back).toBe(true);
    progress.horde = { ...state, tick: 10 };
    expect(hordeExitInput(world, emptyMoveInput()).back).toBe(true);
    progress.horde = createHordeBarricade(6);
    expect(hordeExitInput(world, emptyMoveInput()).back).toBe(false);
    requestHordeExit(world);
    delete progress.horde;
    expect(hordeExitInput(world, emptyMoveInput()).back).toBe(false);
  });
  it('owns only the live owner countdown or active lane, including practice', () => {
    const state = createHordeBarricade(1);
    const p: WorldQuestProgress = {
      questId: HORDE_QUEST_ID,
      state: 'completed',
      count: 1,
      horde: state,
    };
    const world = { worldQuestLog: new Map([[HORDE_QUEST_ID, p]]) };
    expect(hordeControlsActive(world)).toBe(true);
    state.phase = 'active';
    expect(hordeControlsActive(world)).toBe(true);
    state.phase = 'won';
    expect(hordeControlsActive(world)).toBe(false);
    state.phase = 'failed';
    expect(hordeControlsActive(world)).toBe(false);
    delete p.horde;
    expect(hordeControlsActive(world)).toBe(false);
    expect(hordeControlsActive({ worldQuestLog: new Map() })).toBe(false);
  });
});
