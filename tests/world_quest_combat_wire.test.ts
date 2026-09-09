import { describe, expect, it } from 'vitest';
import { emitQuestSelfKeys } from '../server/quest_snapshot_wire';
import { applyQuestSelfWire, type QuestSelfMirrors } from '../src/net/quest_snapshot_wire';
import { COMBAT_QUEST_SITES } from '../src/sim/content/world_quest_combat';
import type { PlayerMeta, Sim } from '../src/sim/sim';
import type { WorldQuestCombatState, WorldQuestProgress } from '../src/sim/types';
import { decodeCombatQuestState } from '../src/sim/world_quest_combat_wire';
import { worldQuestCycleOfferingQuest } from '../src/sim/world_quest_rotation';

const state = (): WorldQuestCombatState => ({
  phase: 'waves',
  stage: 1,
  kills: 2,
  required: 4,
  trail: 50,
  integrity: 100,
  secondsRemaining: 120,
});

function fixture(questId = COMBAT_QUEST_SITES[0].questId) {
  const progress: WorldQuestProgress = { questId, count: 0, state: 'active', combat: state() };
  const owner = {
    questLog: new Map(),
    questsDone: new Set(),
    worldQuestCycle: worldQuestCycleOfferingQuest('wq3_0', questId),
    worldQuestLog: new Map([[questId, progress]]),
  } as PlayerMeta;
  const client: QuestSelfMirrors = {
    questLog: new Map(),
    questsDone: new Set(),
    worldQuestCycle: '',
    worldQuestExpiresAtMs: 0,
    worldQuestLog: new Map(),
  };
  const wire = () => {
    const self: Record<string, unknown> = {};
    emitQuestSelfKeys(
      (key, value) => {
        self[key] = value;
      },
      { worldQuestExpiresAtMs: 1_900_000_000_000 } as Sim,
      owner,
    );
    return self;
  };
  return { questId, progress, owner, client, wire };
}

describe('combat world quest owner wire', () => {
  it.each(COMBAT_QUEST_SITES)(
    'round-trips $encounterId without runtime state or shared references',
    (site) => {
      const f = fixture(site.questId);
      Object.assign(f.progress.combat!, {
        entityIds: [123456],
        ownerId: 987654,
        expiresAt: 456789,
      });
      const self = f.wire();
      const row = (self.wqlog as WorldQuestProgress[])[0];
      expect(row.combat).toEqual(state());
      expect(JSON.stringify(self)).not.toMatch(/entityIds|ownerId|expiresAt|123456|987654|456789/);
      applyQuestSelfWire(f.client, self);
      expect(f.client.worldQuestLog.get(f.questId)?.combat).toEqual(state());
      f.progress.combat!.trail = 99;
      row.combat!.kills = 88;
      expect(f.client.worldQuestLog.get(f.questId)?.combat).toEqual(state());
    },
  );

  it('retains omitted deltas and malformed containers, then clears removed state and rollover', () => {
    const f = fixture();
    applyQuestSelfWire(f.client, f.wire());
    const previous = f.client.worldQuestLog;
    applyQuestSelfWire(f.client, {});
    applyQuestSelfWire(f.client, { wqlog: {} });
    expect(f.client.worldQuestLog).toBe(previous);
    delete f.progress.combat;
    applyQuestSelfWire(f.client, f.wire());
    expect(f.client.worldQuestLog.get(f.questId)).not.toHaveProperty('combat');
    applyQuestSelfWire(f.client, { wqday: 'wq3_50', wqlog: [] });
    expect(f.client.worldQuestLog.size).toBe(0);
    expect(f.client.worldQuestCycle).toBe('wq3_50');
  });

  it.each([
    null,
    [],
    {},
    { ...state(), phase: 'unknown' },
    ...(['stage', 'kills', 'required', 'trail', 'integrity', 'secondsRemaining'] as const).flatMap(
      (key) =>
        [undefined, -1, 0.5, Number.NaN, Infinity, '1', 10000].map((value) => ({
          ...state(),
          [key]: value,
        })),
    ),
  ])('drops malformed public state through both boundaries (%j)', (combat) => {
    const f = fixture();
    applyQuestSelfWire(f.client, f.wire());
    applyQuestSelfWire(f.client, { wqlog: [{ ...f.progress, combat }] });
    expect(f.client.worldQuestLog.get(f.questId)).not.toHaveProperty('combat');
    f.progress.combat = combat as WorldQuestCombatState;
    expect((f.wire().wqlog as WorldQuestProgress[])[0]).not.toHaveProperty('combat');
  });

  it('accepts public phases and exact bounds but rejects unrelated quest IDs', () => {
    for (const phase of ['ready', 'leaders', 'waves', 'boss', 'failed']) {
      const value = {
        phase,
        stage: 3,
        kills: 128,
        required: 128,
        trail: 100,
        integrity: 100,
        secondsRemaining: 600,
      };
      expect(decodeCombatQuestState(value, COMBAT_QUEST_SITES[0].questId)).toEqual(value);
    }
    expect(decodeCombatQuestState(state(), 'wq_eastbrook_bandits')).toBeUndefined();
    expect(decodeCombatQuestState(state(), 'constructor')).toBeUndefined();
  });
});
