// Tests for the pure quest-objective target/location resolver
// (src/sim/quest_targets.ts): the shared derivation behind the world map's
// quest-area blobs and the mob tooltip's Questie-style quest lines. Driven with the
// real content tables (QUESTS/CAMPS/MOBS/GROUND_OBJECTS) so the fixtures can
// never drift from shipped content.

import { describe, expect, it } from 'vitest';
import {
  CAMPS,
  GATHER_NODE_TYPES,
  GATHER_NODES,
  GROUND_OBJECTS,
  MOBS,
  QUESTS,
  zoneAt,
} from '../src/sim/data';
import {
  gatherNodeClusters,
  questObjectiveAreas,
  questObjectivesForMob,
} from '../src/sim/quest_targets';
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
    if (!containing) return;
    // And the EXACT circle, not just a containing one. Containment alone survives
    // dividing by the wrong count, dropping CAMP_AREA_PAD, or taking a min instead
    // of a max on the radius, all of which would still cover most clusters. This
    // matters because the centroid-plus-farthest arithmetic is now shared with the
    // gather-node path (pushEnclosing), so the ground-object caller is the pin that
    // proves the extraction was a move and not a rewrite.
    const n = def.positions.length;
    const cx = def.positions.reduce((s, p) => s + p.x, 0) / n;
    const cz = def.positions.reduce((s, p) => s + p.z, 0) / n;
    const far = Math.max(...def.positions.map((p) => Math.hypot(p.x - cx, p.z - cz)));
    expect(containing.center.x).toBeCloseTo(cx, 9);
    expect(containing.center.z).toBeCloseTo(cz, 9);
    // POINT_AREA_RADIUS 6 and CAMP_AREA_PAD 4 are module-private, so the expected
    // radius is spelled out: max(6, farthest + 4).
    expect(containing.radius).toBeCloseTo(Math.max(6, far + 4), 9);
  });

  it('groups gather nodes into stable clusters across the whole threshold plateau', () => {
    // gatherNodeClusters is exported ONLY for this pin. The grouping is derived
    // from coordinates rather than authored, so without a stability assertion a
    // content nudge silently merges two blobs into one and nothing reds. The
    // tightest real margins: the widest pair inside one cluster is 49.98 yards
    // (chained, single linkage is transitive) and the nearest pair in two
    // different clusters is 33.54 yards, so the identical-partition band is 26 to
    // 33 and the shipped 30 sits 3.5 yards below its upper edge.
    const key = (groups: { x: number; z: number }[][]) =>
      groups.map((g) => g.map((p) => `${p.x},${p.z}`).join(' ')).join(' | ');
    for (const type of GATHER_NODE_TYPES) {
      const at30 = key(gatherNodeClusters(type));
      // Both edges, so a future bump in either direction reds. 25 and 34 are
      // outside the band for at least one type, which is what makes this decisive
      // rather than a restatement of the default.
      expect(key(gatherNodeClusters(type, 27)), `${type} at 27yd`).toBe(at30);
      expect(key(gatherNodeClusters(type, 33)), `${type} at 33yd`).toBe(at30);
      // Every node lands in exactly one group, and groups come back ordered by
      // their first member so the badge numbering a player sees is stable.
      const groups = gatherNodeClusters(type);
      const total = groups.reduce((s, g) => s + g.length, 0);
      expect(total, `${type} clusters must cover every node exactly once`).toBe(
        GATHER_NODES.filter((n) => n.type === type).length,
      );
      expect(gatherNodeClusters(type), `${type} must be call-stable`).toEqual(groups);
    }
    // The band is not open-ended: 60 yards merges groups that 30 keeps apart, so
    // raising the constant cannot pass unnoticed.
    expect(key(gatherNodeClusters('wood', 60))).not.toBe(key(gatherNodeClusters('wood')));
  });

  it('encloses each cluster of gather nodes in one circle, never one per node', () => {
    // This used to look for a circle centred exactly ON each node, because the
    // gather branch drew one per node. Six nodes of every type in every zone made
    // that a smear: the fills are translucent and composite per circle, so
    // overlapping blobs darkened toward opaque, and each carried its own opaque
    // numbered badge. Clustered circles are the fix, and the properties that
    // matter are containment (no node loses its marker) and zone residency (an
    // area whose centre lands in the wrong band is culled off every map).
    // Driven by every node type that a shipped quest actually gathers, not just
    // ore: today that is ore and herb, and herb is the one three of the four
    // gather objectives use, so pinning ore alone would leave the common case
    // uncovered. Wood has no gather quest yet and so cannot be reached through
    // this path at all; the type-level property that would catch it lives in the
    // zone-residency arm below, which loops all three.
    const typed = GATHER_NODE_TYPES.map((type) => {
      for (const quest of Object.values(QUESTS)) {
        const objectiveIndex = quest.objectives.findIndex(
          (o) => o.type === 'gather' && o.nodeType === type,
        );
        if (objectiveIndex >= 0) return { type, quest, objectiveIndex };
      }
      return null;
    }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    expect(typed.map((t) => t.type)).toEqual(['ore', 'herb']);

    for (const { type, quest, objectiveIndex } of typed) {
      const areas = questObjectiveAreas(activeLog(quest));
      const nodes = GATHER_NODES.filter((node) => node.type === type);
      expect(nodes.length).toBeGreaterThan(0);

      // 1. Every node still sits inside an area, and that area carries the ref.
      const areaFor = new Map<string, (typeof areas)[number]>();
      for (const node of nodes) {
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
      const distinct = new Set(areaFor.values());
      expect(
        distinct.size,
        `${distinct.size} circles for ${nodes.length} ${type} nodes`,
      ).toBeLessThan(nodes.length);

      // 3. Every area's centre resolves to the same zone as the nodes inside it.
      // map_window_view culls areas by centre z against the committed zone band, so
      // a cluster straddling a boundary would vanish from both maps rather than
      // render twice.
      for (const node of nodes) {
        const area = areaFor.get(node.id);
        if (!area) continue;
        expect(
          zoneAt(area.center.z).id,
          `the ${type} circle holding ${node.id} is centred in ${zoneAt(area.center.z).id}, not ${node.zoneId}`,
        ).toBe(node.zoneId);
      }

      // 4. The worst case specifically, and only ore has one: Eastbrook's six
      // veins are all held inside a 20-yard ring around the Copper Dig landmark
      // (tests/gather_nodes.test.ts), which is exactly the pile the old loop drew
      // six times over. They must resolve to ONE circle holding all six. The
      // Eastbrook herb patches are deliberately spread instead, so herb has no
      // equivalent pile and asserting one for it would be asserting a coincidence.
      if (type === 'ore') {
        const eastbrook = nodes.filter((n) => n.zoneId === 'eastbrook_vale');
        expect(eastbrook.length).toBe(6);
        const digAreas = new Set(eastbrook.map((n) => areaFor.get(n.id)));
        expect(digAreas.size, 'the Copper Dig ore field should be one circle').toBe(1);
      }
    }
  });

  it('every cluster of every type is centred in its own members zone', () => {
    // The silent-cull hazard for the two types no shipped quest gathers. The map's
    // pure core drops an area whose centre z falls outside the committed zone
    // band, so a cluster spanning a boundary would disappear from both maps with
    // nothing red, and the arm above can only reach the types a quest exists for.
    for (const type of GATHER_NODE_TYPES) {
      for (const group of gatherNodeClusters(type)) {
        const zones = new Set(
          group.map(
            (p) =>
              GATHER_NODES.find((n) => n.type === type && n.pos.x === p.x && n.pos.z === p.z)
                ?.zoneId,
          ),
        );
        expect(zones.size, `a ${type} cluster spans ${[...zones].join(' and ')}`).toBe(1);
        const cz = group.reduce((s, p) => s + p.z, 0) / group.length;
        expect(zoneAt(cz).id, `a ${type} cluster centroid lands outside its zone`).toBe(
          [...zones][0],
        );
      }
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
