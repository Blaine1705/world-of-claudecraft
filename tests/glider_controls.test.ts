import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  gliderCameraFacing,
  gliderControlsActive,
  resolveGliderMove,
  scriptedMovementActive,
} from '../src/game/glider_controls';
import {
  applyKeyboardTurnInput,
  newKeyboardTurnState,
  stepKeyboardTurnFacing,
} from '../src/game/keyboard_turn_facing';
import { selfMotionPredictionEnabled } from '../src/game/self_motion_gate';
import { GLIDER_QUEST_ID } from '../src/sim/content/world_quest_glider';
import { createGliderFlightState } from '../src/sim/minigames/glider_flight';
import type { WorldQuestProgress } from '../src/sim/types';

function fixture() {
  const progress: WorldQuestProgress = {
    questId: GLIDER_QUEST_ID,
    state: 'active',
    count: 0,
    glider: createGliderFlightState(),
  };
  return { progress, world: { worldQuestLog: new Map([[GLIDER_QUEST_ID, progress]]) } };
}

describe('glider input mode', () => {
  it('ignores orbit heading and walking destinations but permits deliberate right-drag steering', () => {
    const { world, progress } = fixture();
    let cleared = 0;
    const mi = {
      forward: true,
      back: false,
      turnLeft: true,
      turnRight: false,
      strafeLeft: false,
      strafeRight: false,
      jump: false,
      dive: false,
      surface: false,
    };
    const input = {
      rightDown: false,
      camYaw: 2,
      isMouselookActive: () => true,
      readMoveInput: () => mi,
      clearClickMove: () => {
        cleared++;
      },
    };
    expect(resolveGliderMove(world, input)).toEqual({ mi, facing: null });
    expect(cleared).toBe(1);
    input.rightDown = true;
    expect(gliderCameraFacing(input)).toBe(2);
    progress.glider!.phase = 'failed';
    expect(resolveGliderMove(world, input)).toBeNull();
    expect(cleared).toBe(1);
  });

  it('suspends walking prediction throughout launch and flight, then restores it', () => {
    const { progress, world } = fixture();
    const gate = () =>
      selfMotionPredictionEnabled({
        disabled: false,
        spectating: null,
        movementFrozen: scriptedMovementActive(world),
        playerImmobilized: false,
        posX: 448,
        climbing: false,
      });
    expect(gliderControlsActive(world)).toBe(true);
    expect(gate()).toBe(false);
    progress.glider!.phase = 'flying';
    expect(gate()).toBe(false);
    progress.glider!.phase = 'failed';
    expect(gate()).toBe(true);
    progress.glider!.phase = 'won';
    expect(gate()).toBe(true);
    progress.glider!.phase = 'flying';
    progress.state = 'completed';
    expect(gate()).toBe(false); // Completed WQs permit medal replays.
    delete progress.glider;
    expect(gate()).toBe(true);
  });
  it('streams actual turn flags and drops a stale walking heading during flight', () => {
    const { world } = fixture();
    const state = newKeyboardTurnState();
    state.facing = 1;
    state.wireFacing = 1;
    state.suppressTurnFlags = true;
    const source = { turnLeft: true, turnRight: false, back: false };
    const wire = { ...source };
    stepKeyboardTurnFacing(state, {
      ...source,
      rawTurnIntent: scriptedMovementActive(world),
      turnAllowed: true,
      sentFacing: null,
      serverFacing: 0,
      releaseCommitAcknowledged: false,
      echoMs: 200,
      snapshotIntervalMs: 50,
      movementWireVersion: 1,
      frameDt: 1 / 60,
    });
    applyKeyboardTurnInput(wire, source, state);
    expect(wire.turnLeft).toBe(true);
    expect(state.wireFacing).toBeNull();
    expect(state.facing).toBeNull();
  });
  it('the live client connects flight to both prediction and raw-turn gates', () => {
    const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(source).toContain('kbTurnArgs.rawTurnIntent = scriptedMovementActive(world)');
    expect(source).toContain(
      'selfMotionGateArgs.movementFrozen = movementFrozen() || scriptedMovementActive(world)',
    );
    expect(source).toContain('isGliderActive: () => gliderControlsActive(world)');
  });
});
