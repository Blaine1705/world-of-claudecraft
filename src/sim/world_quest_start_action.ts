import type { Sim } from './sim';
import { dist2d, type Entity } from './types';
import { worldQuestStarterFor, worldQuestStarterInReach } from './world_quest_start_core';

/** The headless confirmation mirrors selecting a nearby NPC's Start WQ option. */
export function startNearbyWorldQuest(sim: Sim): void {
  const player = sim.player;
  const target = player.targetId === null ? undefined : sim.entities.get(player.targetId);
  if (target && worldQuestStarterFor(target) && worldQuestStarterInReach(player, target)) {
    sim.startWorldQuest(target.id);
    return;
  }
  let nearest: Entity | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const npc of sim.entities.values()) {
    if (!worldQuestStarterFor(npc) || !worldQuestStarterInReach(player, npc)) continue;
    const next = dist2d(player.pos, npc.pos);
    if (next < distance) {
      nearest = npc;
      distance = next;
    }
  }
  if (nearest) sim.startWorldQuest(nearest.id);
}
