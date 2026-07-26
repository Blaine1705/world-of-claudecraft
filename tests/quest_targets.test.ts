// Tests for the pure quest-objective target/location resolver
// (src/sim/quest_targets.ts): the shared derivation behind the world map's
// quest-area blobs and the mob tooltip's Questie-style quest lines. Driven with the
// real content tables (QUESTS/CAMPS/MOBS/GROUND_OBJECTS) so the fixtures can
// never drift from shipped content.

import { describe, expect, it } from 'vitest';
import { CAMPS, GATHER_NODES, GROUND_OBJECTS, MOBS, QUESTS, zoneAt } from '../src/sim/data';
import { questObjectiveAreas, questObjectivesForMob } from '../src/sim/quest_targets';
import type { QuestDef, QuestProgress } from '../src/sim/types';

function activeLog(quest: QuestDef, counts?: number[]): Map<string, QuestProgress> {
  return new Map([
    [
      quest.id,
      {
        questId: quest.id,
        counts: counts ?? quest.objectives.map(() => 0),
        state: 'active' as const,
      },
    ],
  ]);
}

// Real-content fixtures, found by shape (not hardcoded ids) so a content
// rename fails loudly here rather than silently testing nothing.
function requireKillQuest(): { quest: QuestDef; mobId: string; objIndex: number } {
  for (const q of Object.values(QUESTS)) {
    for (const [i, objective] of q.objectives.entries()) {
      if (objective.type !== 'kill') continue;
      if (CAMPS.some((camp) => camp.mobId === objective.targetMobId)) {
        return { quest: q, mobId: objective.targetMobId, objIndex: i };
      }
    }
  }
  throw new Error('expected a kill quest whose target mob has camps');
}

function requireLootCollectQuest(): { quest: QuestDef; mobId: string } {
  for (const q of Object.values(QUESTS)) {
    for (const o of q.objectives) {
      if (o.type !== 'collect' || !o.itemId) continue;
      for (const [mobId, def] of Object.entries(MOBS)) {
        if (def.loot.some((l) => l.itemId === o.itemId && l.questId === q.id))
          return { quest: q, mobId };
      }
    }
  }
  throw new Error('expected a collect quest fed by tagged mob loot');
}

function requireGroundObjectQuest(): { quest: QuestDef; itemId: string } {
  for (const q of Object.values(QUESTS)) {
    for (const o of q.objectives) {
      const itemId =
        o.type === 'collect' ? o.itemId : o.type === 'interact' ? o.targetObjectItemId : undefined;
      if (itemId && GROUND_OBJECTS.some((g) => g.itemId === itemId && g.positions.length > 0))
        return { quest: q, itemId };
    }
  }
  throw new Error('expected a quest fed by ground objects');
}

describe('questObjectivesForMob (the mob tooltip quest lines)', () => {
  it('is empty with no active quests', () => {
    expect(questObjectivesForMob(new Map(), 'forest_wolf')).toEqual([]);
  });

  it('lists an incomplete kill objective with its live counts', () => {
    const { quest, mobId, objIndex } = requireKillQuest();
    const counts = quest.objectives.map(() => 0);
    counts[objIndex] = 3;
    const lines = questObjectivesForMob(activeLog(quest, counts), mobId);
    expect(lines).toContainEqual({
      questId: quest.id,
      objectiveIndex: objIndex,
      current: 3,
      total: quest.objectives[objIndex].count,
    });
    // an unrelated mob gets no lines from this quest's kill objective
    expect(
      questObjectivesForMob(activeLog(quest, counts), 'no_such_mob').some(
        (l) => l.questId === quest.id && l.objectiveIndex === objIndex,
      ),
    ).toBe(false);
  });

  it('drops the line once its objective is complete (even while the quest is active)', () => {
    const { quest, mobId, objIndex } = requireKillQuest();
    const counts = quest.objectives.map((o) => o.count);
    counts[objIndex] = quest.objectives[objIndex].count;
    expect(questObjectivesForMob(activeLog(quest, counts), mobId)).toEqual([]);
  });

  it('lists collect objectives fed by the mob tagged loot', () => {
    const { quest, mobId } = requireLootCollectQuest();
    const lines = questObjectivesForMob(activeLog(quest), mobId);
    expect(lines.some((l) => l.questId === quest.id)).toBe(true);
  });

  it('lists nothing for ready quests (turn-in is the ? marker, not a target)', () => {
    const { quest, mobId } = requireKillQuest();
    const log: Map<string, QuestProgress> = new Map([
      [
        quest.id,
        { questId: quest.id, counts: quest.objectives.map((o) => o.count), state: 'ready' },
      ],
    ]);
    expect(questObjectivesForMob(log, mobId)).toEqual([]);
  });
});

describe('questObjectiveAreas', () => {
  it('is empty with no active quests', () => {
    expect(questObjectiveAreas(new Map())).toEqual([]);
  });

  it('covers every camp of a kill target, padded past the spawn radius', () => {
    const { quest, mobId, objIndex } = requireKillQuest();
    const areas = questObjectiveAreas(activeLog(quest));
    const camps = CAMPS.filter((c) => c.mobId === mobId);
    for (const camp of camps) {
      const area = areas.find((a) => a.center.x === camp.center.x && a.center.z === camp.center.z);
      expect(area, `camp at ${camp.center.x},${camp.center.z} should have an area`).toBeTruthy();
      if (area) {
        expect(area.radius).toBeGreaterThan(camp.radius);
        // the area knows which objective it stands for (the hover tooltip's key)
        expect(
          area.objectives.some((o) => o.questId === quest.id && o.objectiveIndex === objIndex),
        ).toBe(true);
      }
    }
  });

  it('encloses a ground-object cluster in one finite circle', () => {
    const { quest, itemId } = requireGroundObjectQuest();
    const areas = questObjectiveAreas(activeLog(quest));
    const def = GROUND_OBJECTS.find((g) => g.itemId === itemId && g.positions.length > 0);
    expect(def).toBeTruthy();
    if (!def) return;
    // at least one area contains every position of the cluster
    const containing = areas.find((a) =>
      def.positions.every((p) => Math.hypot(p.x - a.center.x, p.z - a.center.z) <= a.radius + 1e-9),
    );
    expect(containing, 'expected one area enclosing the whole object cluster').toBeTruthy();
  });

  it('encloses each cluster of gather nodes in one circle, never one per node', () => {
    // This used to look for a circle centred exactly ON each node, because the
    // gather branch drew one per node. Six nodes of every type in every zone made
    // that a smear: the fills are translucent and composite per circle, so
    // overlapping blobs darkened toward opaque, and each carried its own opaque
    // numbered badge. Clustered circles are the fix, and the properties that
    // matter are containment (no node loses its marker) and zone residency (an
    // area whose centre lands in the wrong band is culled off every map).
    const quest = QUESTS.q_prof_intro;
    const objectiveIndex = quest.objectives.findIndex((objective) => objective.type === 'gather');
    expect(objectiveIndex).toBeGreaterThanOrEqual(0);
    const areas = questObjectiveAreas(activeLog(quest));
    const oreNodes = GATHER_NODES.filter((node) => node.type === 'ore');
    expect(oreNodes.length).toBeGreaterThan(0);

    // 1. Every node still sits inside an area, and that area carries the ref.
    const areaFor = new Map<string, (typeof areas)[number]>();
    for (const node of oreNodes) {
      const area = areas.find(
        (candidate) =>
          Math.hypot(candidate.center.x - node.pos.x, candidate.center.z - node.pos.z) <=
          candidate.radius + 1e-9,
      );
      expect(area, `gather node ${node.id} should sit inside an objective area`).toBeTruthy();
      if (!area) continue;
      expect(area.objectives).toContainEqual({ questId: quest.id, objectiveIndex });
      areaFor.set(node.id, area);
    }

    // 2. Fewer circles than nodes: the clustering is doing something. A per-node
    // implementation passes arm 1 trivially, so without this the rewrite would
    // not be pinned at all.
    const oreAreas = new Set(areaFor.values());
    expect(oreAreas.size, `${oreAreas.size} circles for ${oreNodes.length} ore nodes`).toBeLessThan(
      oreNodes.length,
    );

    // 3. The worst case specifically: Eastbrook's six veins are all held inside
    // one 20-yard ring around the Copper Dig landmark (see
    // tests/gather_nodes.test.ts), which is exactly the pile the old loop drew six
    // times. They must resolve to ONE circle, and it must hold all six.
    const eastbrookOre = oreNodes.filter((n) => n.zoneId === 'eastbrook_vale');
    expect(eastbrookOre.length).toBe(6);
    const digAreas = new Set(eastbrookOre.map((n) => areaFor.get(n.id)));
    expect(digAreas.size, 'the Copper Dig ore field should be one circle').toBe(1);

    // 4. Every area's centre resolves to the same zone as every node inside it.
    // map_window_view culls areas by centre z against the committed zone band, so
    // a cluster straddling a boundary would vanish from both maps rather than
    // render twice.
    for (const node of oreNodes) {
      const area = areaFor.get(node.id);
      if (!area) continue;
      expect(
        zoneAt(area.center.z).id,
        `the circle holding ${node.id} is centred in ${zoneAt(area.center.z).id}, not ${node.zoneId}`,
      ).toBe(node.zoneId);
    }
  });

  it('never emits duplicate circles across a multi-quest log', () => {
    const log = new Map<string, QuestProgress>();
    for (const q of Object.values(QUESTS)) {
      log.set(q.id, { questId: q.id, counts: q.objectives.map(() => 0), state: 'active' });
    }
    const areas = questObjectiveAreas(log);
    const keys = new Set(areas.map((a) => `${a.center.x},${a.center.z},${a.radius}`));
    expect(keys.size).toBe(areas.length);
    for (const a of areas) {
      expect(Number.isFinite(a.center.x)).toBe(true);
      expect(Number.isFinite(a.center.z)).toBe(true);
      expect(a.radius).toBeGreaterThan(0);
      // a shared circle merges objective refs instead of duplicating them
      expect(a.objectives.length).toBeGreaterThan(0);
      const refKeys = new Set(a.objectives.map((o) => `${o.questId}#${o.objectiveIndex}`));
      expect(refKeys.size).toBe(a.objectives.length);
      // every ref points at a real objective of a real quest
      for (const o of a.objectives)
        expect(QUESTS[o.questId]?.objectives[o.objectiveIndex]).toBeTruthy();
    }
  });
});
