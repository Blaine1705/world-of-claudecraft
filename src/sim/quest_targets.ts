// Pure quest-objective target/location resolution over the static content
// tables, shared by the presentation layers: the world map draws translucent
// "your objective lives here" areas from questObjectiveAreas(), and the mob
// hover tooltip lists the objectives a mob advances via questObjectivesForMob(). A host-agnostic leaf
// like threat.ts / format_money.ts: no DOM, no rng, no Sim state. Everything
// derives from the QUESTS/CAMPS/MOBS/GROUND_OBJECTS/NPCS content plus the
// player's live quest log, so the offline Sim and the online ClientWorld
// mirror produce identical output, and (unlike world.entities) none of it is
// interest-radius limited: a camp far across the zone still resolves.

import { CAMPS, GATHER_NODES, GROUND_OBJECTS, MOBS, NPCS, QUESTS } from './data';
import { type QuestObjective, type QuestProgress, questObjectiveRequired } from './types';

/** Identity of one quest objective (the map tooltip resolves its localized
 *  label + live counts from this; the pure layers never carry text). */
export interface QuestObjectiveRef {
  questId: string;
  objectiveIndex: number;
}

/** One circular "this objective happens here" area, in world coords. When
 *  several objectives share the exact circle (two quests hunting one camp),
 *  their refs merge onto one area instead of stacking translucent fills. */
export interface QuestObjectiveArea {
  center: { x: number; z: number };
  radius: number;
  objectives: QuestObjectiveRef[];
}

// Padding added around a camp's spawn radius so the drawn area comfortably
// covers mobs that wandered a little off their spawn ring.
const CAMP_AREA_PAD = 4;
// Radius drawn around a lone point target (an interact NPC or single object).
const POINT_AREA_RADIUS = 6;
// How close two gather nodes have to be to read as ONE place on the map, used
// by pushNodeCluster below. Every zone carries six nodes of every type
// (content/gather_nodes.ts), so a circle per node put six translucent fills and
// six numbered badges over one zone map, several of them overlapping, and the
// map went from "the ore is over there" to a blue smear. This groups them first.
//
// 30 yards is not a knife edge: the authored clusters sit 5 to 25 yards apart
// internally and 40-plus yards from the next cluster, so every threshold from 26
// to 32 yards produces the identical grouping and 30 is the middle of that
// plateau. For scale, it is close to the widest authored mob camp (24 yards),
// which is the spread the map already draws as a single kill-objective blob.
const NODE_CLUSTER_LINK_YD = 30;

// The player's active quests' objectives that still need progress. 'ready'
// and 'done' quests contribute nothing (the '?' turn-in marker guides those).
function incompleteObjectives(
  questLog: ReadonlyMap<string, QuestProgress>,
): { questId: string; objectiveIndex: number; obj: QuestObjective; required: number }[] {
  const out: {
    questId: string;
    objectiveIndex: number;
    obj: QuestObjective;
    required: number;
  }[] = [];
  for (const qp of questLog.values()) {
    if (qp.state !== 'active') continue;
    const quest = QUESTS[qp.questId];
    if (!quest) continue;
    quest.objectives.forEach((obj, i) => {
      const required = questObjectiveRequired(quest, qp, i);
      if ((qp.counts[i] ?? 0) < required)
        out.push({ questId: qp.questId, objectiveIndex: i, obj, required });
    });
  }
  return out;
}

// Mobs whose loot feeds this quest's collect objective. Loot entries are
// tagged with the questId they exist for, the same key quest_credit joins on.
function mobsDroppingQuestItem(itemId: string, questId: string): string[] {
  const out: string[] = [];
  for (const [mobId, def] of Object.entries(MOBS)) {
    if (def.loot.some((l) => l.itemId === itemId && l.questId === questId)) out.push(mobId);
  }
  return out;
}

/** One quest objective a hovered mob advances, with its live counts: the
 *  identity + numbers behind the Questie-style mob-tooltip quest lines. */
export interface MobQuestObjective {
  questId: string;
  objectiveIndex: number;
  current: number;
  total: number;
}

/**
 * The player's active, incomplete objectives this mob's template advances:
 * kill objectives targeting it, plus collect objectives fed by its tagged
 * loot. The mob tooltip renders one quest-title + progress pair per entry,
 * so the player knows "this one counts" (and how far along they are).
 */
export function questObjectivesForMob(
  questLog: ReadonlyMap<string, QuestProgress>,
  mobTemplateId: string,
): MobQuestObjective[] {
  const out: MobQuestObjective[] = [];
  const loot = MOBS[mobTemplateId]?.loot;
  for (const { questId, objectiveIndex, obj, required } of incompleteObjectives(questLog)) {
    const advances =
      (obj.type === 'kill' && obj.targetMobId === mobTemplateId) ||
      (obj.type === 'collect' &&
        !!obj.itemId &&
        !!loot?.some((l) => l.itemId === obj.itemId && l.questId === questId));
    if (!advances) continue;
    const qp = questLog.get(questId);
    out.push({
      questId,
      objectiveIndex,
      current: Math.min(qp?.counts[objectiveIndex] ?? 0, required),
      total: required,
    });
  }
  return out;
}

/**
 * Circular world areas where the player's active, incomplete objectives are
 * carried out (the classic quest-POI blobs): the camps of kill/collect target
 * mobs, the spread of collect/interact ground objects, and interact NPCs.
 * Deduped by circle so overlapping objectives don't stack translucent fills.
 */
export function questObjectiveAreas(
  questLog: ReadonlyMap<string, QuestProgress>,
): QuestObjectiveArea[] {
  const out: QuestObjectiveArea[] = [];
  const byCircle = new Map<string, QuestObjectiveArea>();
  const push = (ref: QuestObjectiveRef, center: { x: number; z: number }, radius: number): void => {
    const key = `${center.x},${center.z},${radius}`;
    const existing = byCircle.get(key);
    if (existing) {
      // Same circle again: merge the objective identity instead of a second fill.
      if (
        !existing.objectives.some(
          (o) => o.questId === ref.questId && o.objectiveIndex === ref.objectiveIndex,
        )
      )
        existing.objectives.push(ref);
      return;
    }
    const area: QuestObjectiveArea = { center, radius, objectives: [ref] };
    byCircle.set(key, area);
    out.push(area);
  };
  const pushMobCamps = (ref: QuestObjectiveRef, mobId: string): void => {
    for (const camp of CAMPS) {
      // fresh {x,z}: never alias the shared CAMPS content the sim spawns from
      if (camp.mobId === mobId)
        push(ref, { x: camp.center.x, z: camp.center.z }, camp.radius + CAMP_AREA_PAD);
    }
  };
  // Centroid of a set of points plus its farthest member: a simple enclosing
  // bound, which is plenty at map scale (this is not a minimal enclosing circle
  // and does not need to be).
  const pushEnclosing = (ref: QuestObjectiveRef, points: readonly { x: number; z: number }[]) => {
    let cx = 0;
    let cz = 0;
    for (const p of points) {
      cx += p.x;
      cz += p.z;
    }
    cx /= points.length;
    cz /= points.length;
    let r = 0;
    for (const p of points) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz));
    push(ref, { x: cx, z: cz }, Math.max(POINT_AREA_RADIUS, r + CAMP_AREA_PAD));
  };
  // One enclosing circle per ground-object definition: each def already carries
  // its own authored cluster of spawn positions.
  const pushObjectCluster = (ref: QuestObjectiveRef, itemId: string): void => {
    for (const def of GROUND_OBJECTS) {
      if (def.itemId !== itemId || def.positions.length === 0) continue;
      pushEnclosing(ref, def.positions);
    }
  };
  // The same enclosing circle for gather nodes, one per CLUSTER. Unlike
  // GROUND_OBJECTS, GATHER_NODES is a flat list with no authored cluster record,
  // so the grouping is derived: single linkage at NODE_CLUSTER_LINK_YD, which is
  // deterministic (it reads only the fixed content table, in table order, and the
  // relation "within N yards" is symmetric so the result is independent of visit
  // order). Grouping by zoneId instead would NOT do: the six nodes of a type in
  // one zone are deliberately spread across it, so a per-zone circle would be
  // 120-plus yards wide and mark most of the map as "here".
  const pushNodeCluster = (ref: QuestObjectiveRef, nodeType: string): void => {
    const nodes = GATHER_NODES.filter((n) => n.type === nodeType);
    if (nodes.length === 0) return;
    const root = nodes.map((_, i) => i);
    const find = (i: number): number => {
      let r = i;
      while (root[r] !== r) r = root[r];
      // path-compress so repeated finds stay cheap on long chains
      while (root[i] !== r) {
        const next = root[i];
        root[i] = r;
        i = next;
      }
      return r;
    };
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i].pos.x - nodes[j].pos.x, nodes[i].pos.z - nodes[j].pos.z);
        if (d <= NODE_CLUSTER_LINK_YD) root[find(i)] = find(j);
      }
    }
    const groups = new Map<number, { x: number; z: number }[]>();
    for (let i = 0; i < nodes.length; i++) {
      const key = find(i);
      const group = groups.get(key);
      // fresh {x,z}: never alias the shared GATHER_NODES content
      if (group) group.push({ x: nodes[i].pos.x, z: nodes[i].pos.z });
      else groups.set(key, [{ x: nodes[i].pos.x, z: nodes[i].pos.z }]);
    }
    for (const group of groups.values()) pushEnclosing(ref, group);
  };
  for (const { questId, objectiveIndex, obj } of incompleteObjectives(questLog)) {
    const ref: QuestObjectiveRef = { questId, objectiveIndex };
    if (obj.type === 'kill' && obj.targetMobId) pushMobCamps(ref, obj.targetMobId);
    else if (obj.type === 'collect' && obj.itemId) {
      for (const mobId of mobsDroppingQuestItem(obj.itemId, questId)) pushMobCamps(ref, mobId);
      pushObjectCluster(ref, obj.itemId);
    } else if (obj.type === 'interact') {
      if (obj.targetObjectItemId) pushObjectCluster(ref, obj.targetObjectItemId);
      const npc = obj.targetNpcId ? NPCS[obj.targetNpcId] : undefined;
      // fresh {x,z}: never alias the shared NPCS content the sim places from
      if (npc) push(ref, { x: npc.pos.x, z: npc.pos.z }, POINT_AREA_RADIUS);
    } else if (obj.type === 'gather' && obj.nodeType) pushNodeCluster(ref, obj.nodeType);
  }
  return out;
}
