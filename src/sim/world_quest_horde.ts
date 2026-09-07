import {
  HORDE_NPC_DEF,
  HORDE_NPC_ID,
  HORDE_QUEST_ID,
  HORDE_SITE,
} from './content/world_quest_horde';
import { createNpc } from './entity';
import { createHordeBarricade, tickHordeBarricade } from './minigames/horde_barricade';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { clearAfkOnMove } from './social/away';
import { type Entity, INTERACT_RANGE, type WorldQuestProgress } from './types';

export function ensureHordeInstructor(ctx: SimContext): void {
  if ((ctx.cfg.world && !ctx.cfg.world.npcs[HORDE_NPC_DEF.id]) || ctx.entities.has(HORDE_NPC_ID))
    return;
  ctx.addEntity(
    createNpc(HORDE_NPC_ID, HORDE_NPC_DEF, ctx.groundPos(HORDE_NPC_DEF.pos.x, HORDE_NPC_DEF.pos.z)),
  );
}

export function clearHordeEncounter(meta: PlayerMeta, progress: WorldQuestProgress): void {
  if (!progress.horde) return;
  delete progress.horde;
  meta.wireRev++;
}

export function startHordeEncounter(
  ctx: SimContext,
  meta: PlayerMeta,
  player: Entity,
  npc: Entity,
  progress: WorldQuestProgress,
): void {
  if (
    (ctx.cfg.world && !ctx.cfg.world.npcs[HORDE_NPC_DEF.id]) ||
    player.dead ||
    player.inCombat ||
    player.mountKey ||
    (player.mountCastRemaining ?? 0) > 0 ||
    meta.vehicle ||
    player.leap ||
    player.climb ||
    player.valkyrsCalling ||
    player.chargeTargetId !== null ||
    player.jumping ||
    meta.mountRace ||
    npc.id !== HORDE_NPC_ID ||
    npc.templateId !== HORDE_NPC_DEF.id ||
    npc.dead ||
    Math.hypot(player.pos.x - npc.pos.x, player.pos.z - npc.pos.z) > INTERACT_RANGE + 2 ||
    Math.abs(player.pos.y - npc.pos.y) > INTERACT_RANGE ||
    progress.horde?.phase === 'active' ||
    progress.horde?.phase === 'countdown'
  )
    return;
  ctx.cancelCast(player);
  player.autoAttack = false;
  player.followTargetId = null;
  player.vx = player.vy = player.vz = 0;
  player.pos = ctx.groundPos(HORDE_SITE.x, HORDE_SITE.z);
  player.prevPos = { ...player.pos };
  player.facing = 0;
  progress.horde = createHordeBarricade(Math.imul(meta.entityId, 7919) ^ ctx.tickCount);
  meta.wireRev++;
}

/** Existing movement intent controls a private lane, identically on every host. */
export function advanceHordeMovement(ctx: SimContext, player: Entity, meta: PlayerMeta): boolean {
  const progress = meta.worldQuestLog.get(HORDE_QUEST_ID);
  const state = progress?.horde;
  if (!progress || !state || (state.phase !== 'countdown' && state.phase !== 'active'))
    return false;
  if (
    player.dead ||
    player.inCombat ||
    player.mountKey ||
    meta.vehicle ||
    player.leap ||
    player.climb ||
    player.valkyrsCalling ||
    Math.abs(player.pos.x - HORDE_SITE.x - state.playerX) > 1 ||
    Math.abs(player.pos.z - HORDE_SITE.z) > 1 ||
    meta.moveInput.back
  ) {
    clearHordeEncounter(meta, progress);
    return false;
  }
  const input = meta.moveInput;
  // Camera looks toward +z: screen right is negative world x.
  const horizontal =
    Number(input.strafeLeft || input.turnLeft) - Number(input.strafeRight || input.turnRight);
  const before = state.phase;
  tickHordeBarricade(state, horizontal);
  const oldX = player.pos.x;
  player.pos = ctx.groundPos(HORDE_SITE.x + state.playerX, HORDE_SITE.z);
  player.vx = (player.pos.x - oldX) * 20;
  player.vy = player.vz = 0;
  player.facing = 0;
  player.autoAttack = false;
  player.followTargetId = null;
  if (horizontal) {
    meta.lastActiveTick = ctx.tickCount;
    clearAfkOnMove(ctx, meta, player);
  }
  if (state.tick % 4 === 0 || state.phase !== before) meta.wireRev++;
  return true;
}

/** Returning true authorizes canonical WQ credit; failed attempts never qualify. */
export function updateHordeEncounter(
  meta: PlayerMeta,
  player: Entity,
  progress: WorldQuestProgress,
): boolean {
  const state = progress.horde;
  if (!state) return false;
  if (player.dead || player.inCombat || player.mountKey) {
    clearHordeEncounter(meta, progress);
    return false;
  }
  if (state.phase !== 'won' || !state.result) return false;
  if (!progress.hordeResult || state.result.score > progress.hordeResult.score) {
    progress.hordeResult = { ...state.result };
    meta.wireRev++;
  }
  return true;
}
