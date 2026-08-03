// The quest-marker classifier (src/sim/quests/quest_marker_kind.ts): the ONE
// rule the four indicator surfaces consume. Pure Node suite, no DOM. The
// per-surface rendering of each kind is pinned in the surface suites
// (nameplate, minimap, map, gossip); THIS file owns the classification rule
// itself, the fold order, and the lifecycle of a real work order driven
// through the real computeQuestState on both cadence-set shapes.

import { describe, expect, it } from 'vitest';
import { QUESTS } from '../src/sim/data';
import { WORK_ORDER_CADENCE_TICKS } from '../src/sim/professions/cadence';
import { computeQuestState } from '../src/sim/quests/quest_commands';
import {
  npcQuestMarkerKind,
  type QuestMarkerKind,
  questMarkerKind,
  strongerQuestMarker,
} from '../src/sim/quests/quest_marker_kind';
import type { QuestDef, QuestProgress } from '../src/sim/types';

const NONE = new Set<string>();

function quest(overrides: Partial<QuestDef> = {}): QuestDef {
  return {
    id: 'q_marker_fixture',
    name: 'Marker Fixture',
    giverNpcId: 'npc_giver',
    turnInNpcId: 'npc_turnin',
    text: 't',
    completionText: 'c',
    objectives: [],
    xpReward: 0,
    copperReward: 0,
    itemRewards: {},
    ...overrides,
  };
}

describe('questMarkerKind: the giver role', () => {
  it('classifies a plain available quest as available (gold), repeatable or not', () => {
    // The Q30 rule's first half: a repeatable quest NEVER completed keeps the
    // gold first-offer mark, because the first turn-in genuinely pays quest
    // XP and gold. Only history flips it blue.
    expect(questMarkerKind(quest(), 'available', NONE, 'giver')).toBe('available');
    expect(questMarkerKind(quest({ repeatable: true }), 'available', NONE, 'giver')).toBe(
      'available',
    );
  });

  it('classifies a completed repeatable as repeat, and history alone never does', () => {
    const done = new Set(['q_marker_fixture']);
    expect(questMarkerKind(quest({ repeatable: true }), 'available', done, 'giver')).toBe('repeat');
    // A non-repeatable id in questsDone must NOT go blue even if a stale
    // caller hands an 'available' state for it: the flag gates, not history.
    expect(questMarkerKind(quest(), 'available', done, 'giver')).toBe('available');
  });

  it('classifies the cadence window as cooldown, and only the cadence window', () => {
    const done = new Set(['q_marker_fixture']);
    const blocked = new Set(['q_marker_fixture']);
    expect(
      questMarkerKind(quest({ repeatable: true }), 'unavailable', done, 'giver', blocked),
    ).toBe('cooldown');
    // Plain unavailability (prereq, level, retirement, the identity gate) is
    // NOT a cooldown: without the set, or with the id absent from it, the
    // giver shows nothing, exactly today's behavior.
    expect(questMarkerKind(quest({ repeatable: true }), 'unavailable', done, 'giver')).toBe('none');
    expect(
      questMarkerKind(
        quest({ repeatable: true }),
        'unavailable',
        done,
        'giver',
        new Set(['other']),
      ),
    ).toBe('none');
  });

  it('shows nothing at the giver for ready, active, and done states', () => {
    // Ready and active belong to the turn-in role; done is finished history.
    expect(questMarkerKind(quest(), 'ready', NONE, 'giver')).toBe('none');
    expect(questMarkerKind(quest(), 'active', NONE, 'giver')).toBe('none');
    expect(questMarkerKind(quest(), 'done', new Set(['q_marker_fixture']), 'giver')).toBe('none');
  });
});

describe('questMarkerKind: the turn-in role', () => {
  it('classifies ready as ready and active as the gray in-progress marker', () => {
    expect(questMarkerKind(quest(), 'ready', NONE, 'turnIn')).toBe('ready');
    expect(questMarkerKind(quest(), 'active', NONE, 'turnIn')).toBe('active');
  });

  it('never answers repeat or cooldown for the turn-in role', () => {
    // The blue mark and the dimmed mark are giver-side statements ("this NPC
    // will offer it"); a turn-in with nothing to receive shows nothing.
    const done = new Set(['q_marker_fixture']);
    const blocked = new Set(['q_marker_fixture']);
    expect(questMarkerKind(quest({ repeatable: true }), 'available', done, 'turnIn')).toBe('none');
    expect(
      questMarkerKind(quest({ repeatable: true }), 'unavailable', done, 'turnIn', blocked),
    ).toBe('none');
  });
});

describe('the fold order', () => {
  // Record<QuestMarkerKind, number> forces this table to name every variant:
  // adding a kind without ranking it here is a compile error, so the sweep
  // below cannot silently skip one (the union-sweep trap).
  const RANK: Record<QuestMarkerKind, number> = {
    ready: 5,
    available: 4,
    repeat: 3,
    active: 2,
    cooldown: 1,
    none: 0,
  };
  const KINDS = Object.keys(RANK) as QuestMarkerKind[];

  it('orders ready > available > repeat > active > cooldown > none, totally', () => {
    for (const a of KINDS) {
      for (const b of KINDS) {
        const expected = RANK[b] > RANK[a] ? b : a;
        expect(strongerQuestMarker(a, b), `${a} vs ${b}`).toBe(expected);
      }
    }
  });

  it('keeps the left value on ties, so a left fold is order-stable', () => {
    for (const k of KINDS) expect(strongerQuestMarker(k, k)).toBe(k);
  });
});

describe('npcQuestMarkerKind: the per-template fold', () => {
  it('ready keeps priority over repeat on a giver-and-turn-in NPC', () => {
    // Acceptance (c): the work-order shape, one NPC holding both roles. A
    // ready turn-in must win the glyph even though the giver arm would say
    // repeat for the same quest id on the next cycle.
    const q = quest({ repeatable: true, giverNpcId: 'npc_both', turnInNpcId: 'npc_both' });
    const done = new Set(['q_marker_fixture']);
    expect(npcQuestMarkerKind(q, 'npc_both', 'ready', done)).toBe('ready');
    expect(npcQuestMarkerKind(q, 'npc_both', 'available', done)).toBe('repeat');
  });

  it('resolves each role only for the template that holds it', () => {
    const q = quest({ repeatable: true });
    const done = new Set(['q_marker_fixture']);
    // The giver template never renders ready/active; the turn-in template
    // never renders the blue or dimmed giver-side marks.
    expect(npcQuestMarkerKind(q, 'npc_giver', 'ready', done)).toBe('none');
    expect(npcQuestMarkerKind(q, 'npc_turnin', 'available', done)).toBe('none');
    expect(npcQuestMarkerKind(q, 'npc_turnin', 'ready', done)).toBe('ready');
    expect(npcQuestMarkerKind(q, 'npc_giver', 'available', done)).toBe('repeat');
    // A template unrelated to the quest shows nothing whatever the state.
    expect(npcQuestMarkerKind(q, 'npc_stranger', 'ready', done)).toBe('none');
  });

  it('honors turnInNpcIds when it widens the turn-in set', () => {
    const q = quest({ turnInNpcIds: ['npc_turnin', 'npc_alt'] });
    expect(npcQuestMarkerKind(q, 'npc_alt', 'ready', NONE)).toBe('ready');
  });
});

describe('the real work-order lifecycle through computeQuestState', () => {
  // The eleven repeatable quests in content are the phase's subjects; this
  // arm drives ONE real work order through the shared state machine both
  // worlds call, so the classifier's inputs are the real ones, not fixtures.
  const WORK_ORDER_ID = 'q_prof_workorder_forge';
  const workOrder = QUESTS[WORK_ORDER_ID];

  it('the fixture quest exists, is repeatable, and carries the cadence window', () => {
    expect(workOrder).toBeDefined();
    expect(workOrder.repeatable).toBe(true);
    expect(workOrder.repeatCadenceTicks).toBe(WORK_ORDER_CADENCE_TICKS);
  });

  const doneWithPrereqs = (extra: string[] = []): Set<string> => {
    const done = new Set<string>(extra);
    if (workOrder.requiresQuest) done.add(workOrder.requiresQuest);
    return done;
  };
  const emptyLog = new Map<string, QuestProgress>();

  it('never completed: available, and the marker stays gold everywhere', () => {
    const state = computeQuestState(WORK_ORDER_ID, emptyLog, doneWithPrereqs(), 60);
    expect(state).toBe('available');
    expect(questMarkerKind(workOrder, state, doneWithPrereqs(), 'giver')).toBe('available');
  });

  it('completed and inside the window: cooldown on the giver, from either cadence-set shape', () => {
    const done = doneWithPrereqs([WORK_ORDER_ID]);
    // Offline shape: the Sim re-derives the blocked set from questCadence.
    // Online shape: the server's sorted cprof.cadenceBlockedQuests mirror.
    // Both reach computeQuestState/questMarkerKind as a ReadonlySet, so one
    // assertion per shape proves the classification cannot diverge.
    const offlineShape = new Set([WORK_ORDER_ID]);
    const onlineShape = new Set([WORK_ORDER_ID].sort());
    for (const withinCadence of [offlineShape, onlineShape]) {
      const state = computeQuestState(WORK_ORDER_ID, emptyLog, done, 60, undefined, withinCadence);
      expect(state).toBe('unavailable');
      expect(questMarkerKind(workOrder, state, done, 'giver', withinCadence)).toBe('cooldown');
    }
  });

  it('completed and lapsed: available again, and the marker turns blue', () => {
    const done = doneWithPrereqs([WORK_ORDER_ID]);
    const state = computeQuestState(WORK_ORDER_ID, emptyLog, done, 60);
    expect(state).toBe('available');
    expect(questMarkerKind(workOrder, state, done, 'giver')).toBe('repeat');
  });

  it('every one of the eleven repeatable quests classifies repeat once completed and offered', () => {
    const repeatables = Object.values(QUESTS).filter((q) => q.repeatable);
    expect(repeatables).toHaveLength(11);
    for (const q of repeatables) {
      expect(questMarkerKind(q, 'available', new Set([q.id]), 'giver'), q.id).toBe('repeat');
    }
  });
});
