import { describe, expect, it } from 'vitest';
import { applyQuestSelfWire, type QuestSelfMirrors } from '../src/net/quest_snapshot_wire';
import { HORDE_QUEST_ID as ID } from '../src/sim/content/world_quest_horde';
import { createHordeBarricade, tickHordeBarricade } from '../src/sim/minigames/horde_barricade';
import type { WorldQuestProgress } from '../src/sim/types';
import { decodeHordeState, sanitizeHordeResult } from '../src/sim/world_quest_horde_wire';
import { savedWorldQuestState } from '../src/sim/world_quest_state';
import { worldQuestProgressForWire } from '../src/sim/world_quest_trace_wire';
import { bareClient } from './helpers/bare_client';

function running() {
  const state = createHordeBarricade(42);
  for (let i = 0; i < 100; i++) tickHordeBarricade(state, 0);
  return state;
}
function progress(): WorldQuestProgress {
  return { questId: ID, state: 'active', count: 0, horde: running() };
}
function mirror(): QuestSelfMirrors {
  return {
    questLog: new Map(),
    questsDone: new Set(),
    worldQuestCycle: 'wq3_7',
    worldQuestExpiresAtMs: 0,
    worldQuestLog: new Map(),
  };
}

describe('horde owner snapshot and save boundary', () => {
  it('copies upgrade choices, runner actors and feedback through the owner snapshot', () => {
    const state = running();
    state.projectiles = 8;
    state.haste = 3;
    state.lastUpgrade = { kind: 'double', tick: 90 };
    state.units = [
      { id: 1, kind: 'crate', x: -5, z: 20, hp: 16, maxHp: 16, reward: 'projectile', choiceId: 80 },
      { id: 2, kind: 'crate', x: 5, z: 20, hp: 16, maxHp: 16, reward: 'haste', choiceId: 80 },
      { id: 3, kind: 'runner', x: 1, z: 30, hp: 4, maxHp: 4 },
    ];
    state.shots = [{ id: 4, x: 10.1, z: 10, age: 5, damage: 8, pierce: 1 }];
    state.nextId = 5;
    const target = mirror();
    applyQuestSelfWire(target, { wqlog: [{ ...progress(), horde: state }] });
    const copied = target.worldQuestLog.get(ID)!.horde!;
    expect(copied).toEqual(state);
    copied.lastUpgrade!.tick = 80;
    copied.units[0].reward = 'double';
    expect(state.lastUpgrade.tick).toBe(90);
    expect(state.units[0].reward).toBe('projectile');
  });

  it('rejects malformed upgrade fields and safely drops older sessions without independent counters', () => {
    const state = running();
    const crate = {
      id: 1,
      kind: 'crate',
      x: -5,
      z: 20,
      hp: 16,
      maxHp: 16,
      reward: 'pierce',
      choiceId: 80,
    };
    for (const patch of [
      { projectiles: 0 },
      { projectiles: 9 },
      { projectiles: 1.5 },
      { projectiles: undefined },
      { haste: undefined },
      { haste: 4 },
      { haste: NaN },
      { lastUpgrade: null },
      { lastUpgrade: { kind: 'unknown', tick: 10 } },
      { lastUpgrade: { kind: 'double', tick: 101 } },
      { units: [{ ...crate, reward: 'unknown' }] },
      { units: [{ ...crate, choiceId: undefined }] },
      { units: [{ ...crate, choiceId: -1 }] },
      { units: [{ ...crate, kind: 'zombie' }] },
    ])
      expect(decodeHordeState({ ...state, ...patch }, ID)).toBeUndefined();
  });
  it('reaches the live ClientWorld snapshot decoder and retains omitted owner deltas', () => {
    const client = bareClient(1);
    const apply = (self: object) =>
      (
        client as unknown as {
          applySnapshot(value: unknown): void;
        }
      ).applySnapshot({
        t: 'snap',
        ents: [],
        self: {
          id: 1,
          k: 'player',
          tid: 'warrior',
          nm: 'Defender',
          x: 325,
          y: 1,
          z: 1530,
          ...self,
        },
      });
    apply({ wqday: 'wq3_7', wqlog: [worldQuestProgressForWire(progress())] });
    expect(client.worldQuestLog.get(ID)?.horde?.phase).toBe('active');
    const previous = client.worldQuestLog;
    apply({});
    expect(client.worldQuestLog).toBe(previous);
    apply({ wqlog: [] });
    expect(client.worldQuestLog.size).toBe(0);
  });
  it('round trips and copies every mutable actor array without retaining extra fields', () => {
    const original = progress();
    expect(original.horde!.units.length).toBeGreaterThan(0);
    expect(original.horde!.shots.length).toBeGreaterThan(0);
    const encoded = worldQuestProgressForWire(original);
    expect(encoded.horde).toEqual(original.horde);
    encoded.horde!.units[0].hp = 1;
    encoded.horde!.shots[0].damage = 1;
    expect(original.horde!.units[0].hp).not.toBe(1);
    expect(original.horde!.shots[0].damage).not.toBe(1);
    expect(decodeHordeState(original.horde, 'wq_evergarden_forging')).toBeUndefined();
  });

  it('rejects nonfinite, out-of-range, sparse, oversized and duplicate actor payloads atomically', () => {
    const state = running();
    for (const patch of [
      { playerX: NaN },
      { barrier: Infinity },
      { tick: -1 },
      { upgrade: 4 },
      { seed: -1 },
      { nextId: 0 },
      { units: Array(2) },
      { shots: Array(97) },
      { units: [state.units[0], state.units[0]] },
      { units: [{ ...state.units[0], hp: state.units[0].maxHp + 1 }] },
      { shots: [{ ...state.shots[0], x: 100 }] },
      { phase: 'won' },
    ])
      expect(decodeHordeState({ ...state, ...patch }, ID)).toBeUndefined();
  });

  it('preserves omitted delta state, drops malformed sessions and honors explicit empty logs', () => {
    const target = mirror();
    const row = progress();
    applyQuestSelfWire(target, { wqlog: [row] });
    expect(target.worldQuestLog.get(ID)?.horde).toEqual(row.horde);
    row.horde!.units[0].hp = 1;
    expect(target.worldQuestLog.get(ID)?.horde?.units[0].hp).not.toBe(1);
    const previous = target.worldQuestLog;
    applyQuestSelfWire(target, {});
    expect(target.worldQuestLog).toBe(previous);
    applyQuestSelfWire(target, { wqlog: [{ ...progress(), horde: { tick: NaN } }] });
    expect(target.worldQuestLog.get(ID)?.horde).toBeUndefined();
    expect(target.worldQuestLog.get(ID)?.state).toBe('active');
    applyQuestSelfWire(target, { wqlog: [] });
    expect(target.worldQuestLog.size).toBe(0);
  });

  it('strips the live run from saves while copying the bounded best result', () => {
    const row = progress();
    row.hordeResult = { rating: 'gold', kills: 630, barrier: 100, score: 6800 };
    const saved = savedWorldQuestState({
      worldQuestCycle: 'wq3_7',
      worldQuestLog: new Map([[ID, row]]),
    } as Parameters<typeof savedWorldQuestState>[0]);
    const savedRow = 'worldQuests' in saved ? saved.worldQuests!.progress[0] : undefined;
    expect(savedRow?.horde).toBeUndefined();
    expect(savedRow?.hordeResult).toEqual(row.hordeResult);
    expect(savedRow?.hordeResult).not.toBe(row.hordeResult);
    expect(sanitizeHordeResult({ ...row.hordeResult, kills: NaN })).toBeUndefined();
  });
});
