// Extra raid-trash casts for the automata in the two corridor rooms. Varkhul
// summons the same templates during his encounter, so room membership is the
// authority boundary: those encounter adds retain only Varkhul's authored kit.

import { isLockedOut, isSilenced } from '../combat/cc';
import type { ActiveIgnivarMeteorWarning } from '../ignivar_meteors';
import {
  IGNIVAR_CRUCIBLE_WARDEN_ID,
  IGNIVAR_EMBER_SENTINEL_ID,
  IGNIVAR_FORGE_APPROACH_ID,
  IGNIVAR_MOLTEN_ASSEMBLY_ID,
} from '../ignivar_raid_ids';
import type { SimContext } from '../sim_context';
import { CAST_COMPLETE_EPS, DT, dist2d, type Entity } from '../types';

export const IGNIVAR_CINDER_LANCE_CAST_ID = 'Cinder Lance';
export const IGNIVAR_CINDER_LANCE_CAST_SECONDS = 2;
export const IGNIVAR_CINDER_LANCE_RADIUS = 4;
export const IGNIVAR_CINDER_LANCE_DAMAGE_MAX_HP = 0.14;
export const IGNIVAR_CRUCIBLE_STOMP_ABILITY_ID = 'Crucible Stomp';
export const IGNIVAR_CRUCIBLE_STOMP_RADIUS = 9;
export const IGNIVAR_CRUCIBLE_STOMP_DAMAGE_MAX_HP = 0.18;

const CINDER_LANCE_FIRST_SECONDS = 5;
const CINDER_LANCE_REPEAT_SECONDS = 11;
const CRUCIBLE_STOMP_FIRST_SECONDS = 6;
export const IGNIVAR_CRUCIBLE_STOMP_REPEAT_SECONDS = 12;
const INTERRUPTED_RETRY_SECONDS = 5;

type TrashSpell = NonNullable<Entity['ignivarTrashSpell']>;

function cinderLanceWarningId(mob: Entity): string {
  return `ignivar-trash:${mob.id}:${mob.ignivarTrashCastKey ?? 0}`;
}

export function activeIgnivarTrashMeteorWarning(mob: Entity): ActiveIgnivarMeteorWarning | null {
  if (
    mob.ignivarTrashSpell !== 'cinderLance' ||
    !mob.castAim ||
    mob.castRemaining <= CAST_COMPLETE_EPS
  ) {
    return null;
  }
  return {
    id: cinderLanceWarningId(mob),
    x: mob.castAim.x,
    z: mob.castAim.z,
    radius: IGNIVAR_CINDER_LANCE_RADIUS,
    duration: IGNIVAR_CINDER_LANCE_CAST_SECONDS,
    remaining: Math.min(mob.castRemaining, IGNIVAR_CINDER_LANCE_CAST_SECONDS),
    warningLead: 0,
  };
}

function trashInstanceFor(ctx: SimContext, mob: Entity) {
  const instance = ctx.instances.find(
    (candidate) => candidate.partyKey !== null && candidate.mobIds.includes(mob.id),
  );
  if (
    instance?.dungeonId !== IGNIVAR_FORGE_APPROACH_ID &&
    instance?.dungeonId !== IGNIVAR_MOLTEN_ASSEMBLY_ID
  ) {
    return null;
  }
  return instance;
}

function spellFor(mob: Entity): TrashSpell | null {
  if (mob.templateId === IGNIVAR_EMBER_SENTINEL_ID) return 'cinderLance';
  return null;
}

function castIdFor(_spell: TrashSpell): string {
  return IGNIVAR_CINDER_LANCE_CAST_ID;
}

function firstDelayFor(_spell: TrashSpell): number {
  return CINDER_LANCE_FIRST_SECONDS;
}

function repeatDelayFor(_spell: TrashSpell): number {
  return CINDER_LANCE_REPEAT_SECONDS;
}

function castSecondsFor(_spell: TrashSpell): number {
  return IGNIVAR_CINDER_LANCE_CAST_SECONDS;
}

function clearTrashCast(mob: Entity): void {
  mob.castingAbility = null;
  mob.castTotal = 0;
  mob.castRemaining = 0;
  mob.castTargetId = null;
  mob.castAim = null;
  mob.channeling = false;
  mob.ignivarTrashSpell = undefined;
  mob.ignivarTrashCastKey = undefined;
}

export function resetIgnivarTrashAutomaton(mob: Entity): void {
  if (
    mob.ignivarTrashSpell !== undefined ||
    mob.ignivarTrashSpellTimer !== undefined ||
    spellFor(mob) !== null
  ) {
    clearTrashCast(mob);
  }
  mob.ignivarTrashSpellTimer = undefined;
}

function playersInTrashInstance(
  ctx: SimContext,
  instance: NonNullable<ReturnType<typeof trashInstanceFor>>,
): Entity[] {
  if (instance.exitId === null) return [];
  const players: Entity[] = [];
  for (const meta of ctx.players.values()) {
    const player = ctx.entities.get(meta.entityId);
    if (player?.kind !== 'player' || player.dead) continue;
    if (ctx.instanceClaimIdAt(player.pos) !== instance.exitId) continue;
    players.push(player);
  }
  players.sort((a, b) => a.id - b.id);
  return players;
}

function cinderLanceTarget(ctx: SimContext, mob: Entity): Entity | null {
  const instance = trashInstanceFor(ctx, mob);
  if (!instance) return null;
  const players = playersInTrashInstance(ctx, instance);
  let target: Entity | null = null;
  let targetDistance = -1;
  for (const player of players) {
    const distance = dist2d(mob.pos, player.pos);
    if (distance > targetDistance) {
      target = player;
      targetDistance = distance;
    }
  }
  return target;
}

function startTrashCast(ctx: SimContext, mob: Entity, spell: TrashSpell): boolean {
  const seconds = castSecondsFor(spell);
  const target = cinderLanceTarget(ctx, mob);
  if (!target) {
    mob.ignivarTrashSpellTimer = 1;
    return false;
  }
  mob.ignivarTrashSpell = spell;
  mob.ignivarTrashCastKey = ctx.tickCount;
  mob.castingAbility = castIdFor(spell);
  mob.castTotal = seconds;
  mob.castRemaining = seconds;
  mob.castTargetId = target.id;
  mob.castAim = { ...target.pos };
  mob.channeling = false;
  mob.aiState = 'attack';
  ctx.emit({
    type: 'spellfxAt',
    x: target.pos.x,
    z: target.pos.z,
    school: 'fire',
    fx: 'meteorFall',
    sourceId: mob.id,
    radius: IGNIVAR_CINDER_LANCE_RADIUS,
    duration: seconds,
    warningLead: 0,
    persistentId: cinderLanceWarningId(mob),
    ability: IGNIVAR_CINDER_LANCE_CAST_ID,
  });
  return true;
}

function resolveCinderLance(ctx: SimContext, mob: Entity): void {
  const instance = trashInstanceFor(ctx, mob);
  const impact = mob.castAim;
  if (!instance || !impact || ctx.instanceClaimIdAt(impact) !== instance.exitId) return;
  ctx.emit({
    type: 'spellfxAt',
    x: impact.x,
    z: impact.z,
    school: 'fire',
    fx: 'nova',
    sourceId: mob.id,
    radius: IGNIVAR_CINDER_LANCE_RADIUS,
    ability: IGNIVAR_CINDER_LANCE_CAST_ID,
  });
  for (const player of playersInTrashInstance(ctx, instance)) {
    if (dist2d(player.pos, impact) > IGNIVAR_CINDER_LANCE_RADIUS) continue;
    ctx.dealDamage(
      mob,
      player,
      Math.ceil(player.maxHp * IGNIVAR_CINDER_LANCE_DAMAGE_MAX_HP * (mob.mechanicDamageMult ?? 1)),
      false,
      'fire',
      IGNIVAR_CINDER_LANCE_CAST_ID,
      'hit',
      true,
    );
  }
}

function updateCrucibleStomp(
  ctx: SimContext,
  mob: Entity,
  instance: NonNullable<ReturnType<typeof trashInstanceFor>>,
): boolean {
  // This template is reused by Varkhul, where Crucible Quake remains a real
  // interruptible cast. The placed trash miniboss replaces it with this instant
  // body attack, so keep the generic template hardcast cadence permanently away
  // from zero while the Warden belongs to either corridor claim.
  mob.bigCastTimer = Number.MAX_SAFE_INTEGER;
  mob.ignivarTrashSpellTimer ??= CRUCIBLE_STOMP_FIRST_SECONDS;
  mob.ignivarTrashSpellTimer = Math.max(0, mob.ignivarTrashSpellTimer - DT);
  if (mob.ignivarTrashSpellTimer > CAST_COMPLETE_EPS) return false;

  const targets = playersInTrashInstance(ctx, instance).filter(
    (player) => dist2d(player.pos, mob.pos) <= IGNIVAR_CRUCIBLE_STOMP_RADIUS,
  );
  if (targets.length === 0) return false;

  mob.ignivarTrashSpellTimer = IGNIVAR_CRUCIBLE_STOMP_REPEAT_SECONDS;
  ctx.emit({
    type: 'spellfx',
    sourceId: mob.id,
    targetId: mob.id,
    school: 'fire',
    fx: 'windup',
    ability: IGNIVAR_CRUCIBLE_STOMP_ABILITY_ID,
  });
  ctx.emit({
    type: 'spellfxAt',
    x: mob.pos.x,
    z: mob.pos.z,
    school: 'fire',
    fx: 'nova',
    sourceId: mob.id,
    radius: IGNIVAR_CRUCIBLE_STOMP_RADIUS,
    ability: IGNIVAR_CRUCIBLE_STOMP_ABILITY_ID,
  });
  for (const player of targets) {
    ctx.dealDamage(
      mob,
      player,
      Math.ceil(
        player.maxHp * IGNIVAR_CRUCIBLE_STOMP_DAMAGE_MAX_HP * (mob.mechanicDamageMult ?? 1),
      ),
      false,
      'fire',
      IGNIVAR_CRUCIBLE_STOMP_ABILITY_ID,
      'hit',
      true,
    );
  }
  return true;
}

export function updateIgnivarTrashAutomaton(ctx: SimContext, mob: Entity): boolean {
  const instance = trashInstanceFor(ctx, mob);
  if (!instance) {
    if (mob.ignivarTrashSpell !== undefined || mob.ignivarTrashSpellTimer !== undefined) {
      resetIgnivarTrashAutomaton(mob);
    }
    return false;
  }
  if (mob.templateId === IGNIVAR_CRUCIBLE_WARDEN_ID) {
    return updateCrucibleStomp(ctx, mob, instance);
  }

  const spell = spellFor(mob);
  if (!spell) return false;

  mob.ignivarTrashSpellTimer ??= firstDelayFor(spell);
  if (mob.ignivarTrashSpell !== undefined) {
    const castId = castIdFor(mob.ignivarTrashSpell);
    if (mob.castingAbility !== castId || isSilenced(mob) || isLockedOut(mob, 'fire')) {
      clearTrashCast(mob);
      mob.ignivarTrashSpellTimer = INTERRUPTED_RETRY_SECONDS;
      return false;
    }
    mob.castRemaining = Math.max(0, mob.castRemaining - DT);
    if (mob.castRemaining > CAST_COMPLETE_EPS) return true;
    const resolvedSpell = mob.ignivarTrashSpell;
    resolveCinderLance(ctx, mob);
    clearTrashCast(mob);
    mob.ignivarTrashSpellTimer = repeatDelayFor(resolvedSpell);
    return true;
  }

  if (mob.castingAbility !== null || isSilenced(mob) || isLockedOut(mob, 'fire')) return false;
  mob.ignivarTrashSpellTimer = Math.max(0, mob.ignivarTrashSpellTimer - DT);
  if (mob.ignivarTrashSpellTimer > CAST_COMPLETE_EPS) return false;
  return startTrashCast(ctx, mob, spell);
}
