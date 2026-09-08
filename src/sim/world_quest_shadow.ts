import {
  SHADOW_GUARDS,
  SHADOW_NPC_DEF,
  SHADOW_NPC_ID,
  SHADOW_QUEST_ID,
  SHADOW_SITE,
} from './content/world_quest_shadow';
import { createNpc } from './entity';
import { hasShadowCloak, SHADOW_CLOAK_AURA_ID } from './shadow_action_lock';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import { DT, type Entity, INTERACT_RANGE, type WorldQuestProgress } from './types';
import { shadowBehindCarrier, shadowPatrolPosition } from './world_quest_shadow_patrol';

export function ensureShadowPost(ctx: SimContext): void {
  if (ctx.cfg.world && !ctx.cfg.world.npcs[SHADOW_NPC_DEF.id]) return;
  for (const row of [{ entityId: SHADOW_NPC_ID, npc: SHADOW_NPC_DEF }, ...SHADOW_GUARDS]) {
    if (!ctx.entities.has(row.entityId))
      ctx.addEntity(createNpc(row.entityId, row.npc, ctx.groundPos(row.npc.pos.x, row.npc.pos.z)));
  }
}
export function clearShadowEncounter(ctx: SimContext, meta: PlayerMeta): void {
  const player = ctx.entities.get(meta.entityId);
  if (player && hasShadowCloak(player)) {
    const index = player.auras.findIndex((aura) => aura.id === SHADOW_CLOAK_AURA_ID);
    const [aura] = player.auras.splice(index, 1);
    ctx.emit({
      type: 'aura',
      targetId: player.id,
      sourceId: aura.sourceId,
      abilityId: aura.id,
      name: aura.name,
      gained: false,
    });
    meta.wireRev++;
    player.stealthed = player.auras.some((aura) => aura.kind === 'stealth');
  }
  const progress = meta.worldQuestLog.get(SHADOW_QUEST_ID);
  if (progress?.shadow) {
    delete progress.shadow;
    meta.wireRev++;
  }
}
export function startShadowEncounter(
  ctx: SimContext,
  meta: PlayerMeta,
  player: Entity,
  npc: Entity,
  progress: WorldQuestProgress,
): void {
  if (
    npc.id !== SHADOW_NPC_ID ||
    npc.templateId !== SHADOW_NPC_DEF.id ||
    npc.dead ||
    Math.abs(player.pos.y - npc.pos.y) > 3 ||
    progress.state !== 'active' ||
    progress.shadow?.phase === 'cloaked' ||
    player.dead ||
    player.inCombat ||
    player.mountKey ||
    player.mountCastRemaining ||
    meta.vehicle ||
    meta.mountRace ||
    player.leap ||
    player.climb ||
    player.valkyrsCalling ||
    player.chargeTargetId !== null ||
    Math.hypot(player.pos.x - npc.pos.x, player.pos.z - npc.pos.z) > INTERACT_RANGE ||
    Math.hypot(npc.pos.x - SHADOW_NPC_DEF.pos.x, npc.pos.z - SHADOW_NPC_DEF.pos.z) > 0.1
  )
    return;
  ctx.cancelCast(player);
  player.autoAttack = false;
  player.followTargetId = null;
  for (const entity of ctx.entities.values())
    if (entity.kind === 'mob' && entity.ownerId === player.id) {
      entity.aggroTargetId = null;
      entity.autoAttack = false;
    }
  progress.shadow = { phase: 'cloaked', suspicion: 0, cooldown: 0 };
  ctx.applyAura(player, {
    id: SHADOW_CLOAK_AURA_ID,
    name: 'Duskweave Cloak',
    kind: 'stealth',
    value: 1,
    remaining: 0,
    duration: 0,
    permanent: true,
    undispellable: true,
    sourceId: player.id,
    school: 'arcane',
  });
  player.stealthed = true;
  meta.wireRev++;
}
function guardTarget(
  ctx: SimContext,
  player: Entity,
  targetId: number | undefined,
): Entity | undefined {
  const def = SHADOW_GUARDS.find((row) => row.entityId === targetId && !row.sentry);
  const entity = def && ctx.entities.get(def.entityId);
  if (
    !def ||
    !entity ||
    entity.kind !== 'npc' ||
    entity.dead ||
    entity.templateId !== def.npc.id ||
    Math.hypot(entity.pos.x - def.npc.pos.x, entity.pos.z - def.npc.pos.z) > 0.1 ||
    Math.hypot(player.pos.x - entity.pos.x, player.pos.z - entity.pos.z) > 2.5 ||
    Math.abs(player.pos.y - entity.pos.y) > 3 ||
    !shadowBehindCarrier(player.pos, entity)
  )
    return;
  return entity;
}
export function performShadowAction(
  ctx: SimContext,
  meta: PlayerMeta,
  player: Entity,
  action: 'pickpocket' | 'leave',
  targetId?: number,
): void {
  if (action === 'leave') {
    clearShadowEncounter(ctx, meta);
    return;
  }
  const progress = meta.worldQuestLog.get(SHADOW_QUEST_ID);
  const state = progress?.shadow;
  if (
    !progress ||
    progress.state !== 'active' ||
    state?.phase !== 'cloaked' ||
    player.dead ||
    !hasShadowCloak(player) ||
    state.cooldown > 0 ||
    state.stealing ||
    state.suspicion > 0
  )
    return;
  const guard = guardTarget(ctx, player, targetId ?? player.targetId ?? undefined);
  if (!guard || progress.creditedObjects?.includes(String(guard.id))) return;
  state.stealing = { targetId: guard.id, remaining: 1, x: player.pos.x, z: player.pos.z };
  meta.wireRev++;
}
/** Returns one credit only after a server-timed stationary steal resolves. */
export function updateShadowEncounter(ctx: SimContext, meta: PlayerMeta, player: Entity): boolean {
  const progress = meta.worldQuestLog.get(SHADOW_QUEST_ID);
  const state = progress?.shadow;
  if (!state || !progress) {
    if (hasShadowCloak(player)) clearShadowEncounter(ctx, meta);
    return false;
  }
  if (
    player.dead ||
    player.inCombat ||
    player.mountKey ||
    player.mountCastRemaining ||
    meta.vehicle ||
    progress.state !== 'active' ||
    Math.hypot(player.pos.x - SHADOW_SITE.x, player.pos.z - SHADOW_SITE.z) > SHADOW_SITE.radius ||
    (state.phase === 'cloaked' && !hasShadowCloak(player))
  ) {
    clearShadowEncounter(ctx, meta);
    return false;
  }
  if (state.phase !== 'cloaked' || state.lastTick === ctx.tickCount) return false;
  state.lastTick = ctx.tickCount;
  let exposed = false;
  for (const row of SHADOW_GUARDS) {
    const guard = ctx.entities.get(row.entityId);
    if (!guard || guard.templateId !== row.npc.id || guard.dead) continue;
    if (row.patrol) {
      const patrol = shadowPatrolPosition(row.npc.pos, row.patrol, ctx.tickCount * DT);
      const pos = ctx.groundPos(patrol.x, patrol.z);
      if (guard.pos.x !== pos.x || guard.pos.z !== pos.z) {
        guard.prevPos = { ...guard.pos };
        guard.pos = pos;
      }
      guard.facing = patrol.facing;
    }
    if (Math.hypot(player.pos.x - guard.pos.x, player.pos.z - guard.pos.z) < row.detectionRadius)
      exposed = true;
  }
  state.suspicion = exposed
    ? Math.min(1, state.suspicion + DT / 0.6)
    : Math.max(0, state.suspicion - DT * 2);
  state.cooldown = Math.max(0, state.cooldown - DT);
  if (state.suspicion >= 1) {
    clearShadowEncounter(ctx, meta);
    progress.shadow = { phase: 'caught', suspicion: 0, cooldown: 0 };
    player.pos = ctx.groundPos(SHADOW_NPC_DEF.pos.x + 2, SHADOW_NPC_DEF.pos.z);
    player.prevPos = { ...player.pos };
    player.vx = player.vy = player.vz = 0;
    player.autoAttack = false;
    player.followTargetId = null;
    meta.wireRev++;
    return false;
  }
  const steal = state.stealing;
  if (steal) {
    if (
      exposed ||
      !guardTarget(ctx, player, steal.targetId) ||
      Math.hypot(player.pos.x - steal.x, player.pos.z - steal.z) > 0.1
    )
      delete state.stealing;
    else {
      steal.remaining -= DT;
      if (steal.remaining <= 0) {
        delete state.stealing;
        const key = String(steal.targetId);
        if (!progress.creditedObjects?.includes(key)) {
          progress.creditedObjects ??= [];
          progress.creditedObjects.push(key);
          state.cooldown = 0.8;
          meta.wireRev++;
          return true;
        }
      }
    }
  }
  if (ctx.tickCount % 2 === 0) meta.wireRev++;
  return false;
}
