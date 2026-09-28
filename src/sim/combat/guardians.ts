import { createMob } from '../entity';
import type { SimContext } from '../sim_context';
import {
  DT,
  dist2d,
  type Entity,
  type GuardianMelee,
  type GuardianState,
  type MobTemplate,
} from '../types';

export interface GuardianConfig extends Omit<GuardianState, 'attackTimer'> {
  name: string;
  color: number;
  scale: number;
  /** Where it appears (default: a step beside the owner, the classic spot). */
  spawnAt?: { x: number; z: number };
  /** A fixed health pool instead of the template's level curve. */
  maxHp?: number;
}

const GUARDIAN_TEMPLATE: MobTemplate = {
  id: 'temporary_guardian',
  name: 'Guardian',
  minLevel: 1,
  maxLevel: 20,
  family: 'elemental',
  hpBase: 200,
  hpPerLevel: 20,
  dmgBase: 1,
  dmgPerLevel: 0,
  attackSpeed: 2,
  armorPerLevel: 0,
  moveSpeed: 0,
  aggroRadius: 0,
  loot: [],
  scale: 0.8,
  color: 0x51246f,
};

export function guardianOf(ctx: SimContext, ownerId: number, key: string): Entity | null {
  for (const entity of ctx.entities.values()) {
    if (entity.ownerId === ownerId && entity.guardianState?.key === key) return entity;
  }
  return null;
}

export function dismissGuardian(ctx: SimContext, guardian: Entity): void {
  ctx.emit({
    type: 'spellfx',
    sourceId: guardian.id,
    targetId: guardian.id,
    school: guardian.guardianState?.school ?? 'shadow',
    fx: 'echoBurst',
  });
  ctx.dropEntity(guardian.id);
}

export function dismissOwnedGuardians(ctx: SimContext, ownerId: number): void {
  for (const entity of [...ctx.entities.values()]) {
    if (entity.ownerId === ownerId && entity.guardianState) dismissGuardian(ctx, entity);
  }
}

export function summonGuardian(ctx: SimContext, owner: Entity, config: GuardianConfig): Entity {
  const existing = guardianOf(ctx, owner.id, config.key);
  if (existing) dismissGuardian(ctx, existing);

  const template: MobTemplate = {
    ...GUARDIAN_TEMPLATE,
    id: `guardian_${config.key}`,
    name: config.name,
    scale: config.scale,
    color: config.color,
  };
  const spawn = config.spawnAt ?? { x: owner.pos.x + 1.5, z: owner.pos.z + 1.5 };
  const pos = ctx.groundPos(spawn.x, spawn.z);
  const guardian = createMob(ctx.nextId++, template, owner.level, pos);
  if (config.maxHp !== undefined) {
    guardian.maxHp = Math.max(1, Math.round(config.maxHp));
    guardian.hp = guardian.maxHp;
  }
  guardian.ownerId = owner.id;
  guardian.hostile = false;
  guardian.name = config.name;
  guardian.aiState = 'idle';
  guardian.aggroTargetId = null;
  guardian.inCombat = false;
  guardian.loot = null;
  guardian.lootable = false;
  guardian.guardianState = {
    key: config.key,
    remaining: config.remaining,
    attackTimer: Math.min(0.5, config.attackInterval),
    attackInterval: config.attackInterval,
    minDamage: config.minDamage,
    maxDamage: config.maxDamage,
    spellPowerCoeff: config.spellPowerCoeff,
    school: config.school,
    abilityId: config.abilityId,
    abilityName: config.abilityName,
    preferredTargetId: config.preferredTargetId,
    maxRange: config.maxRange,
    requiredTargetAuraId: config.requiredTargetAuraId,
    dismissWhenUntargeted: config.dismissWhenUntargeted,
    // Spread only when set, so every stationary guardian keeps its exact state shape.
    ...(config.melee ? { melee: { ...config.melee } } : {}),
  };
  ctx.addEntity(guardian);
  ctx.emit({
    type: 'spellfx',
    sourceId: owner.id,
    targetId: guardian.id,
    school: config.school,
    fx: 'echoBurst',
  });
  return guardian;
}

function guardianTarget(ctx: SimContext, guardian: Entity, owner: Entity): Entity | null {
  const state = guardian.guardianState;
  if (!state) return null;
  const validTarget = (target: Entity): boolean =>
    !target.dead &&
    ctx.isHostileTo(owner, target) &&
    dist2d(owner.pos, target.pos) <= state.maxRange &&
    (state.requiredTargetAuraId === undefined ||
      target.auras.some(
        (aura) => aura.id === state.requiredTargetAuraId && aura.sourceId === owner.id,
      ));
  const preferred =
    state.preferredTargetId === null ? null : (ctx.entities.get(state.preferredTargetId) ?? null);
  if (preferred && validTarget(preferred)) return preferred;

  const candidates = ctx
    .hostilesInRadius(owner, owner.pos, state.maxRange)
    .filter(validTarget)
    .map((entity) => ({
      entity,
      distance: dist2d(owner.pos, entity.pos),
    }));
  candidates.sort((a, b) => a.distance - b.distance || a.entity.id - b.entity.id);
  return candidates[0]?.entity ?? null;
}

/** Returns false when the guardian despawned and must not receive later mob updates. */
export function updateGuardian(ctx: SimContext, guardian: Entity): boolean {
  const state = guardian.guardianState;
  if (!state) return true;
  const owner = guardian.ownerId === null ? null : (ctx.entities.get(guardian.ownerId) ?? null);
  state.remaining -= DT;
  if (!owner || owner.dead || state.remaining <= 0) {
    dismissGuardian(ctx, guardian);
    return false;
  }
  if (state.melee) return updateMeleeGuardian(ctx, guardian, owner, state, state.melee);

  state.attackTimer -= DT;
  if (state.attackTimer > 0) return true;
  const target = guardianTarget(ctx, guardian, owner);
  if (!target) {
    if (state.dismissWhenUntargeted) {
      dismissGuardian(ctx, guardian);
      return false;
    }
    state.attackTimer = Math.min(0.25, state.attackInterval);
    return true;
  }

  state.attackTimer += state.attackInterval;
  guardian.facing = Math.atan2(target.pos.x - guardian.pos.x, target.pos.z - guardian.pos.z);
  ctx.emit({
    type: 'spellfx',
    sourceId: guardian.id,
    targetId: target.id,
    school: state.school,
    fx: 'projectile',
  });
  ctx.dealDamage(
    guardian,
    target,
    ctx.rng.range(state.minDamage, state.maxDamage) +
      Math.round(owner.spellPower * (state.spellPowerCoeff ?? 0)),
    false,
    state.school,
    state.abilityName,
    'hit',
    true,
    undefined,
    true,
    false,
    false,
    state.abilityId,
    false,
  );
  return ctx.entities.has(guardian.id);
}

// ---- the walking melee mode (GuardianState.melee) ------------------------------------

/** Its owner's current target, when that is a living enemy of the owner inside the
 *  guardian's leash of its post, and one the fight has already reached: a creature
 *  already in combat, or a player while the owner is in combat. The ONLY thing a melee
 *  guardian ever fights, so it never opens a fight (never pulls) on its own. */
function ownerTarget(ctx: SimContext, owner: Entity, melee: GuardianMelee): Entity | null {
  const target = owner.targetId === null ? null : (ctx.entities.get(owner.targetId) ?? null);
  if (!target || target.dead || target.id === owner.id) return null;
  if (!ctx.isHostileTo(owner, target)) return null;
  if (target.kind === 'mob' ? !target.inCombat : !owner.inCombat) return null;
  if (Math.hypot(target.pos.x - melee.postX, target.pos.z - melee.postZ) > melee.leash) return null;
  return target;
}

/** The most height a melee guardian swings across (a ledge above or below is out of reach). */
const MELEE_GUARDIAN_MAX_RISE = 4;

/** Drop the guardian and, when it carries one, the owner's post aura (the standard). */
function dismissFromPost(ctx: SimContext, guardian: Entity, owner: Entity, melee: GuardianMelee) {
  dismissGuardian(ctx, guardian);
  if (!melee.postAuraId) return;
  const index = owner.auras.findIndex((a) => a.id === melee.postAuraId);
  if (index < 0) return;
  const [aura] = owner.auras.splice(index, 1);
  ctx.emit({ type: 'aura', targetId: owner.id, name: aura.name, gained: false });
}

/**
 * One tick of a walking melee guardian. It runs to its owner's target, faces it and
 * swings from `reach` every `attackInterval`, a plain melee hit through the shared
 * damage path (so the struck creature can turn on it, and it can be killed); with no
 * target it walks back to its post. It never scans for enemies of its own. Draws rng
 * only for the damage roll of a landed swing, exactly like the stationary guardians.
 */
function updateMeleeGuardian(
  ctx: SimContext,
  guardian: Entity,
  owner: Entity,
  state: GuardianState,
  melee: GuardianMelee,
): boolean {
  // Struck down: its corpse neither walks nor swings (handleDeath keeps owned bodies).
  if (guardian.dead) {
    dismissGuardian(ctx, guardian);
    return false;
  }
  if (Math.hypot(owner.pos.x - melee.postX, owner.pos.z - melee.postZ) > melee.leash) {
    dismissFromPost(ctx, guardian, owner, melee);
    return false;
  }
  const target = ownerTarget(ctx, owner, melee);
  state.attackTimer = Math.max(0, state.attackTimer - DT);
  if (!target) {
    guardian.aggroTargetId = null;
    guardian.inCombat = false;
    const post = { x: melee.postX, y: guardian.pos.y, z: melee.postZ };
    if (dist2d(guardian.pos, post) > 1.2) ctx.moveToward(guardian, post, melee.moveSpeed);
    return true;
  }
  guardian.aggroTargetId = target.id;
  guardian.inCombat = true;
  const reach = melee.reach + 0.5 * (target.scale ?? 1);
  if (dist2d(guardian.pos, target.pos) > reach) {
    ctx.moveToward(guardian, target.pos, melee.moveSpeed);
    return true;
  }
  guardian.facing = Math.atan2(target.pos.x - guardian.pos.x, target.pos.z - guardian.pos.z);
  if (state.attackTimer > 0) return true;
  if (Math.abs(target.pos.y - guardian.pos.y) > MELEE_GUARDIAN_MAX_RISE) return true;
  if (!ctx.hasLineOfSight(guardian, target)) return true;
  state.attackTimer = state.attackInterval;
  // The stationary guardians' damage call (direct, named, attributed), physical and
  // unscaled at the swing: the damage was snapshotted from the owner's power at summon.
  ctx.dealDamage(
    guardian,
    target,
    Math.round(ctx.rng.range(state.minDamage, state.maxDamage)),
    false,
    'physical',
    state.abilityName,
    'hit',
    true,
    undefined,
    true,
    false,
    false,
    state.abilityId,
    false,
  );
  return ctx.entities.has(guardian.id);
}
