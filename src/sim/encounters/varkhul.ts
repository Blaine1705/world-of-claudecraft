// Varkhul raid encounter. The boss owns only deterministic, sim-local state;
// clients derive every actionable warning from existing casts, auras, facing,
// and GroundAoE snapshots.

import { MOBS } from '../data';
import { createMob } from '../entity';
import {
  IGNIVAR_CINDER_ARTIFICER_ID,
  IGNIVAR_CRUCIBLE_WARDEN_ID,
  IGNIVAR_EMBER_SENTINEL_ID,
  VARKHUL_BOSS_ID as VARKHUL_BOSS_TEMPLATE_ID,
} from '../ignivar_raid_ids';
import { applyDungeonMobTuning, mobTemplateForDungeonDifficulty } from '../instances/difficulty';
import {
  mobCombatProfile,
  mobEffectiveMeleeRange,
  tryMobMeleeSwingInRange,
} from '../mob/combat_profile';
import { updateMobTarget } from '../mob/targeting';
import type { SimContext } from '../sim_context';
import {
  CAST_COMPLETE_EPS,
  DT,
  dist2d,
  type Entity,
  steadyAngleTo,
  type VarkhulEncounterState,
  type Vec3,
} from '../types';
import {
  VARKHUL_ANVIL_METEOR_CAST_ID,
  VARKHUL_ANVIL_METEOR_DAMAGE_MAX_HP,
  VARKHUL_ANVIL_METEOR_RADIUS,
  VARKHUL_ANVIL_METEOR_WARNING_SECONDS,
  varkhulAnvilMeteorId,
  varkhulAnvilMeteorPattern,
} from '../varkhul_anvil_meteors';
import {
  VARKHUL_ANVILS_DECREE_CAST_ID,
  VARKHUL_ANVILS_DECREE_STRIKE_SECONDS,
  VARKHUL_ANVILS_DECREE_STRIKES,
  varkhulAnvilsDecreeDamageMaxHp,
} from '../varkhul_anvils_decree';
import {
  VARKHUL_ASSEMBLY_BURDEN_TICK_SECONDS,
  VARKHUL_ASSEMBLY_CONVERGENCE_SECONDS,
  VARKHUL_ASSEMBLY_CORE_BASE_DAMAGE,
  VARKHUL_ASSEMBLY_CORE_PICKUP_RADIUS,
  VARKHUL_ASSEMBLY_CORE_WINDOW_SECONDS,
  VARKHUL_ASSEMBLY_FORGE_DELIVERY_RADIUS,
  VARKHUL_ASSEMBLY_FORGE_MAX_HP,
  VARKHUL_ASSEMBLY_LINK_FAILURE_DAMAGE_HEROIC,
  VARKHUL_ASSEMBLY_LINK_FAILURE_DAMAGE_NORMAL,
  VARKHUL_ASSEMBLY_LINK_FIREBALL_DAMAGE_HEROIC,
  VARKHUL_ASSEMBLY_LINK_FIREBALL_DAMAGE_NORMAL,
  VARKHUL_ASSEMBLY_LINK_FIREBALL_DURATION,
  VARKHUL_ASSEMBLY_LINK_FIREBALL_RADIUS,
  VARKHUL_ASSEMBLY_PARTIAL_DAMAGE_TAKEN_BONUS,
  VARKHUL_ASSEMBLY_PARTIAL_STUN_SECONDS,
  VARKHUL_ASSEMBLY_RUNE_COUNT,
  VARKHUL_ASSEMBLY_RUNE_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_STATION_DISTANCE,
  VARKHUL_ASSEMBLY_STUN_DAMAGE_TAKEN_BONUS,
  VARKHUL_ASSEMBLY_STUN_SECONDS,
  VARKHUL_ASSEMBLY_UNSTABLE_REACTION_DAMAGE,
  varkhulAssemblyBurdenDamageMaxHp,
  varkhulAssemblyFireballCadence,
  varkhulAssemblyFireballPattern,
  varkhulAssemblyRounds,
  varkhulAssemblyRuneAligned,
  varkhulAssemblyRuneAssignments,
  varkhulAssemblyRuneControlAt,
  varkhulAssemblyRuneOutcome,
  varkhulAssemblyRuneSeconds,
  varkhulAssemblyRuneStartAngle,
  varkhulAssemblyRuneStation,
  varkhulAssemblyRuneTargetAngle,
  varkhulAssemblyStepRune,
} from '../varkhul_assembly';
import {
  VARKHUL_CINDER_FIRE_DAMAGE_MAX_HP,
  VARKHUL_CINDER_FIRE_RADIUS,
  VARKHUL_CINDER_FIRE_TICK_SECONDS,
  VARKHUL_CINDER_ORB_DAMAGE_MAX_HP,
  VARKHUL_CINDER_ORB_DURATION,
  VARKHUL_CINDER_ORB_HIT_RADIUS,
  VARKHUL_CINDER_ORB_PROJECTILES_PER_TARGET,
  VARKHUL_CINDER_ORB_SPEED,
  VARKHUL_CINDER_ORBS_MARK_SECONDS,
  VARKHUL_CINDER_ORBS_TARGETS,
  VARKHUL_RED_HOT_METAL_DAMAGE_MAX_HP,
  VARKHUL_RED_HOT_METAL_DURATION,
  VARKHUL_RED_HOT_METAL_HEAL_ABSORB_MAX_HP,
  VARKHUL_RED_HOT_METAL_TICK_SECONDS,
  varkhulCinderFireCanSpawn,
  varkhulCinderFireId,
  varkhulCinderOrbProjectileId,
} from '../varkhul_cinder_orbs';
import { positionVarkhulLinkPracticeBots } from '../varkhul_dev_raid';
import {
  VARKHUL_FORGESTORM_RADIUS,
  VARKHUL_FORGESTORM_WARNING_SECONDS,
} from '../varkhul_forgestorm';
import {
  pointInVarkhulFrontal,
  VARKHUL_FRONTAL_CAST_ID,
  VARKHUL_FRONTAL_CAST_SECONDS,
  varkhulFrontalDamageMaxHp,
} from '../varkhul_frontal';

export { VARKHUL_BOSS_ID } from '../ignivar_raid_ids';
export const VARKHUL_EMBER_SENTINEL_ID = IGNIVAR_EMBER_SENTINEL_ID;
export const VARKHUL_CRUCIBLE_WARDEN_ID = IGNIVAR_CRUCIBLE_WARDEN_ID;
export const VARKHUL_CINDER_ARTIFICER_ID = IGNIVAR_CINDER_ARTIFICER_ID;

export const VARKHUL_MAKERS_BRAND_AURA_ID = 'varkhul_makers_brand';
export const VARKHUL_MAKERS_BRAND_CAST_ID = "Maker's Brand";
export const VARKHUL_MAKERS_BRAND_EVERY = 14;
export const VARKHUL_MAKERS_BRAND_DAMAGE_MAX_HP = 0.3;
export const VARKHUL_MAKERS_BRAND_DURATION = 30;
export const VARKHUL_MAKERS_BRAND_MAX_STACKS = 3;
export const VARKHUL_MAKERS_BRAND_PER_STACK = 0.35;
export const VARKHUL_MAKERS_BRAND_TANK_SWAP_STACKS = 2;

export {
  VARKHUL_FRONTAL_CAST_ID,
  VARKHUL_FRONTAL_CAST_SECONDS,
  VARKHUL_FRONTAL_DAMAGE_MAX_HP_HEROIC,
  VARKHUL_FRONTAL_DAMAGE_MAX_HP_NORMAL,
  VARKHUL_FRONTAL_HALF_ANGLE,
  VARKHUL_FRONTAL_RANGE,
} from '../varkhul_frontal';

export const VARKHUL_CINDER_ORBS_CAST_ID = 'Cinder Orbs';
export const VARKHUL_CINDER_ORBS_AURA_ID = 'varkhul_cinder_orbs';
export const VARKHUL_RED_HOT_METAL_AURA_ID = 'varkhul_red_hot_metal';
export const VARKHUL_RED_HOT_METAL_ABSORB_AURA_ID = 'varkhul_red_hot_metal_absorb';
export {
  VARKHUL_CINDER_FIRE_DAMAGE_MAX_HP,
  VARKHUL_CINDER_FIRE_MAX_FIELDS,
  VARKHUL_CINDER_FIRE_RADIUS,
  VARKHUL_CINDER_FIRE_TICK_SECONDS,
  VARKHUL_CINDER_ORB_DAMAGE_MAX_HP,
  VARKHUL_CINDER_ORB_DURATION,
  VARKHUL_CINDER_ORB_HIT_RADIUS,
  VARKHUL_CINDER_ORB_PROJECTILES_PER_TARGET,
  VARKHUL_CINDER_ORB_SPEED,
  VARKHUL_CINDER_ORBS_MARK_SECONDS,
  VARKHUL_CINDER_ORBS_TARGETS,
  VARKHUL_RED_HOT_METAL_DAMAGE_MAX_HP,
  VARKHUL_RED_HOT_METAL_DURATION,
  VARKHUL_RED_HOT_METAL_HEAL_ABSORB_MAX_HP,
  VARKHUL_RED_HOT_METAL_TICK_SECONDS,
} from '../varkhul_cinder_orbs';

export const VARKHUL_FORGESTORM_CAST_ID = 'Forgestorm';
export const VARKHUL_FORGESTORM_WAVES = 3;
export const VARKHUL_FORGESTORM_IMPACTS_PER_WAVE = 5;
export const VARKHUL_FORGESTORM_DAMAGE_MAX_HP = 0.3;

export {
  VARKHUL_ANVILS_DECREE_CAST_ID,
  VARKHUL_ANVILS_DECREE_DAMAGE_MAX_HP,
  VARKHUL_ANVILS_DECREE_STRIKE_SECONDS,
  VARKHUL_ANVILS_DECREE_STRIKES,
} from '../varkhul_anvils_decree';
export {
  VARKHUL_FORGESTORM_RADIUS,
  VARKHUL_FORGESTORM_WARNING_SECONDS,
} from '../varkhul_forgestorm';
export const VARKHUL_FORGE_LOCAL_POS = { x: 0, z: 22 } as const;

export const VARKHUL_MASTERS_ASSEMBLY_CAST_ID = "The Master's Assembly";
export const VARKHUL_MASTERS_ASSEMBLY_AURA_ID = 'varkhul_masters_assembly';
export const VARKHUL_MASTERS_ASSEMBLY_HP_THRESHOLD = 0.5;
export const VARKHUL_MASTERS_ASSEMBLY_SECONDS = 45;
export const VARKHUL_WARDEN_SHIELD_AURA_ID = 'varkhul_warden_shield';
export const VARKHUL_ASSEMBLY_FIXATE_AURA_ID = 'varkhul_assembly_fixate';
export const VARKHUL_ASSEMBLY_CORE_AURA_ID = 'varkhul_molten_core';
export const VARKHUL_ASSEMBLY_LINK_AURA_ID = 'varkhul_forge_link';
export const VARKHUL_ASSEMBLY_STUN_AURA_ID = 'varkhul_forge_shattered';
export const VARKHUL_ASSEMBLY_REPAIR_CAST_ID = 'Repair Protocol';
export const VARKHUL_ASSEMBLY_CONVERGENCE_CAST_ID = 'Forge Convergence';
export const VARKHUL_ASSEMBLY_LINK_CAST_ID = 'Forge Links';
export const VARKHUL_ASSEMBLY_REPAIR_HEAL_MAX_HP = 0.15;

export const VARKHUL_MASTERPIECE_UNBOUND_AURA_ID = 'varkhul_masterpiece_unbound';
export const VARKHUL_MASTERPIECE_UNBOUND_HP_THRESHOLD = 0.2;
export const VARKHUL_MASTERPIECE_UNBOUND_SECONDS = 45;
export const VARKHUL_MASTERPIECE_UNBOUND_SPEED_MULTIPLIER = 1.25;
export const VARKHUL_MASTERPIECE_UNBOUND_DAMAGE_BONUS = 0.25;
export const VARKHUL_MASTERPIECE_UNBOUND_PULSE_SECONDS = 3;
export const VARKHUL_MASTERPIECE_UNBOUND_PULSE_MAX_HP = 0.05;

const VARKHUL_FIRST_CINDER_ORBS_SECONDS = 8;
const VARKHUL_FIRST_FRONTAL_SECONDS = 13;
const VARKHUL_FIRST_FORGESTORM_SECONDS = 20;
const VARKHUL_FIRST_ANVIL_SECONDS = 32;
const VARKHUL_CINDER_ORBS_EVERY = 34;
const VARKHUL_FRONTAL_EVERY = 26;
const VARKHUL_FORGESTORM_EVERY = 38;
const VARKHUL_ANVIL_EVERY = 42;
const VARKHUL_WIPE_DAMAGE_MULTIPLIER = 100;
const VARKHUL_ASSEMBLY_WARDEN_FIRST_CAST_SECONDS = 1.5;
const VARKHUL_ASSEMBLY_ADD_OFFSETS = [
  { id: VARKHUL_EMBER_SENTINEL_ID, x: -10, z: 11 },
  { id: VARKHUL_CRUCIBLE_WARDEN_ID, x: 10, z: 11 },
  { id: VARKHUL_CINDER_ARTIFICER_ID, x: -28, z: -28 },
] as const;

function encounterInstance(ctx: SimContext, boss: Entity) {
  return ctx.instances.find((instance) => instance.mobIds.includes(boss.id)) ?? null;
}

function playersInEncounter(ctx: SimContext, boss: Entity, includeDead = false): Entity[] {
  const instance = encounterInstance(ctx, boss);
  if (!instance || instance.exitId === null) return [];
  const players: Entity[] = [];
  for (const meta of ctx.players.values()) {
    const player = ctx.entities.get(meta.entityId);
    if (player?.kind !== 'player' || (!includeDead && player.dead)) continue;
    if (ctx.instanceClaimIdAt(player.pos) !== instance.exitId) continue;
    players.push(player);
  }
  players.sort((a, b) => a.id - b.id);
  return players;
}

function tankIds(ctx: SimContext, boss: Entity): Set<number> {
  const result = new Set<number>();
  if (boss.aggroTargetId !== null) result.add(boss.aggroTargetId);
  for (const meta of ctx.players.values()) {
    if (meta.talentMods.role === 'tank') result.add(meta.entityId);
  }
  return result;
}

export function selectVarkhulCinderOrbTargets(
  players: readonly Entity[],
  tanks: ReadonlySet<number>,
  castKey: number,
): Entity[] {
  const candidates = players.filter((player) => !player.dead && !tanks.has(player.id));
  if (candidates.length <= VARKHUL_CINDER_ORBS_TARGETS) return candidates;
  const start = castKey % candidates.length;
  return Array.from(
    { length: VARKHUL_CINDER_ORBS_TARGETS },
    (_, index) => candidates[(start + index) % candidates.length],
  );
}

export function varkhulForgestormPattern(
  castKey: number,
  waveIndex: number,
  origin: Pick<Vec3, 'x' | 'z'>,
): Array<{ x: number; z: number }> {
  const rotation = castKey * 0.47 + waveIndex * 0.83;
  const radii = [8, 15, 22, 15, 8] as const;
  return radii.map((radius, index) => {
    const angle = rotation + (index * Math.PI * 2) / VARKHUL_FORGESTORM_IMPACTS_PER_WAVE;
    return {
      x: origin.x + Math.sin(angle) * radius,
      z: origin.z + Math.cos(angle) * radius,
    };
  });
}

function initVarkhulEncounter(boss: Entity): VarkhulEncounterState {
  if (!boss.varkhul) {
    boss.varkhul = {
      makersBrandTimer: VARKHUL_MAKERS_BRAND_EVERY,
      frontalTimer: VARKHUL_FIRST_FRONTAL_SECONDS,
      frontalCastKey: 0,
      frontalCastRemaining: 0,
      frontalFacing: boss.facing,
      frontalTargetId: null,
      cinderOrbsTimer: VARKHUL_FIRST_CINDER_ORBS_SECONDS,
      cinderOrbsCastKey: 0,
      cinderOrbsMarkRemaining: 0,
      cinderOrbsTargetIds: [],
      cinderFires: [],
      cinderOrbProjectiles: [],
      forgestormTimer: VARKHUL_FIRST_FORGESTORM_SECONDS,
      forgestormCastKey: 0,
      forgestormWaveIndex: 0,
      forgestormWarningRemaining: 0,
      forgestormPoints: [],
      anvilTimer: VARKHUL_FIRST_ANVIL_SECONDS,
      anvilStrikeIndex: 0,
      anvilStrikeRemaining: 0,
      anvilMeteorCastKey: 0,
      anvilMeteorBatches: [],
      majorAbility: 'none',
      assemblyTriggered: false,
      assemblyPhase: 'done',
      assemblyAddIds: [],
      assemblyRemaining: 0,
      assemblyWipeResolved: false,
      assemblyDroppedAddIds: [],
      assemblyCores: [],
      assemblyForgeHp: VARKHUL_ASSEMBLY_FORGE_MAX_HP,
      assemblyDeliveryWindowRemaining: 0,
      assemblyDeliveredCoreIds: [],
      assemblyArtificerRepaired: false,
      assemblyFixateTargetId: null,
      assemblyRuneCenter: null,
      assemblyRuneAssignments: [],
      assemblyRuneAngles: [],
      assemblyRuneControls: [],
      assemblyLinkFireballTimer: 0,
      assemblyLinkFireballWave: 0,
      assemblyRuneRound: 0,
      assemblyRuneRounds: 1,
      assemblyRuneRemaining: 0,
      assemblyStunRemaining: 0,
      masterpieceTriggered: false,
      masterpieceRemaining: 0,
      masterpiecePulseTimer: VARKHUL_MASTERPIECE_UNBOUND_PULSE_SECONDS,
      masterpieceWipeResolved: false,
    };
  }
  return boss.varkhul;
}

function resolveLivingTarget(boss: Entity, players: readonly Entity[]): Entity | null {
  const current =
    boss.aggroTargetId === null
      ? null
      : (players.find((player) => player.id === boss.aggroTargetId && !player.dead) ?? null);
  const target = current ?? players.find((player) => !player.dead) ?? null;
  boss.aggroTargetId = target?.id ?? null;
  return target;
}

function clearBossCast(boss: Entity): void {
  boss.castingAbility = null;
  boss.castTotal = 0;
  boss.castRemaining = 0;
  boss.castTargetId = null;
  boss.castAim = null;
  boss.channeling = false;
}

function clearEncounterWarnings(ctx: SimContext, boss: Entity): void {
  for (let index = ctx.groundAoEs.length - 1; index >= 0; index--) {
    const effect = ctx.groundAoEs[index];
    if (effect.sourceId === boss.id && effect.abilityId === VARKHUL_FORGESTORM_CAST_ID) {
      ctx.groundAoEs.splice(index, 1);
    }
  }
}

export function clearVarkhulEncounterAuras(player: Entity, sourceId?: number): void {
  player.auras = player.auras.filter(
    (aura) =>
      (aura.id !== VARKHUL_MAKERS_BRAND_AURA_ID &&
        aura.id !== VARKHUL_CINDER_ORBS_AURA_ID &&
        aura.id !== VARKHUL_RED_HOT_METAL_AURA_ID &&
        aura.id !== VARKHUL_RED_HOT_METAL_ABSORB_AURA_ID &&
        aura.id !== VARKHUL_ASSEMBLY_FIXATE_AURA_ID &&
        aura.id !== VARKHUL_ASSEMBLY_CORE_AURA_ID &&
        aura.id !== VARKHUL_ASSEMBLY_LINK_AURA_ID) ||
      (sourceId !== undefined && aura.sourceId !== sourceId),
  );
}

function cancelMajorAbility(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  for (const player of playersInEncounter(ctx, boss, true)) {
    player.auras = player.auras.filter(
      (aura) => aura.id !== VARKHUL_CINDER_ORBS_AURA_ID || aura.sourceId !== boss.id,
    );
  }
  clearEncounterWarnings(ctx, boss);
  st.majorAbility = 'none';
  st.frontalCastRemaining = 0;
  st.frontalTargetId = null;
  st.cinderOrbsMarkRemaining = 0;
  st.cinderOrbsTargetIds = [];
  st.forgestormWarningRemaining = 0;
  st.forgestormPoints = [];
  st.anvilStrikeIndex = 0;
  st.anvilStrikeRemaining = 0;
  st.anvilMeteorBatches = [];
  clearBossCast(boss);
}

function dealFractionalDamage(
  ctx: SimContext,
  boss: Entity,
  target: Entity,
  fraction: number,
  ability: string,
): void {
  ctx.dealDamage(
    boss,
    target,
    Math.ceil(target.maxHp * fraction),
    false,
    'fire',
    ability,
    'hit',
    true,
    undefined,
    false,
    false,
    true,
  );
}

function wipeEncounter(
  ctx: SimContext,
  boss: Entity,
  players: readonly Entity[],
  ability: string,
): void {
  for (const player of players) {
    if (player.dead) continue;
    ctx.emit({
      type: 'spellfx',
      sourceId: boss.id,
      targetId: player.id,
      school: 'fire',
      fx: 'nova',
    });
    ctx.dealDamage(
      boss,
      player,
      player.maxHp * VARKHUL_WIPE_DAMAGE_MULTIPLIER,
      false,
      'fire',
      ability,
      'hit',
      true,
      undefined,
      false,
      false,
      true,
    );
  }
}

function castMakersBrand(ctx: SimContext, boss: Entity, target: Entity): boolean {
  if (dist2d(boss.pos, target.pos) > mobEffectiveMeleeRange(boss)) return false;
  const existing = target.auras.find(
    (aura) => aura.id === VARKHUL_MAKERS_BRAND_AURA_ID && aura.sourceId === boss.id,
  );
  dealFractionalDamage(
    ctx,
    boss,
    target,
    VARKHUL_MAKERS_BRAND_DAMAGE_MAX_HP,
    VARKHUL_MAKERS_BRAND_CAST_ID,
  );
  if (!target.dead) {
    if (existing) {
      existing.stacks = Math.min(
        VARKHUL_MAKERS_BRAND_MAX_STACKS,
        Math.max(1, existing.stacks ?? 1) + 1,
      );
      existing.value = existing.stacks * VARKHUL_MAKERS_BRAND_PER_STACK;
      existing.remaining = VARKHUL_MAKERS_BRAND_DURATION;
      ctx.emit({ type: 'aura', targetId: target.id, name: existing.name, gained: true });
    } else {
      ctx.applyAura(target, {
        id: VARKHUL_MAKERS_BRAND_AURA_ID,
        name: VARKHUL_MAKERS_BRAND_CAST_ID,
        kind: 'vuln_source',
        remaining: VARKHUL_MAKERS_BRAND_DURATION,
        duration: VARKHUL_MAKERS_BRAND_DURATION,
        value: VARKHUL_MAKERS_BRAND_PER_STACK,
        stacks: 1,
        sourceId: boss.id,
        school: 'fire',
        encounterOwned: true,
      });
    }
  }
  ctx.emit({
    type: 'spellfx',
    sourceId: boss.id,
    targetId: target.id,
    school: 'fire',
    fx: 'projectile',
  });
  return true;
}

function startFrontal(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  const tanks = tankIds(ctx, boss);
  const candidates = players.filter((player) => !player.dead && !tanks.has(player.id));
  const pool = candidates.length > 0 ? candidates : players.filter((player) => !player.dead);
  if (pool.length === 0) {
    st.frontalTimer = 2;
    return;
  }
  st.frontalCastKey++;
  const target = pool[st.frontalCastKey % pool.length];
  st.majorAbility = 'frontal';
  st.frontalTimer = VARKHUL_FRONTAL_EVERY;
  st.frontalCastRemaining = VARKHUL_FRONTAL_CAST_SECONDS;
  st.frontalTargetId = target.id;
  st.frontalFacing = Math.atan2(target.pos.x - boss.pos.x, target.pos.z - boss.pos.z);
  boss.facing = st.frontalFacing;
  boss.castingAbility = VARKHUL_FRONTAL_CAST_ID;
  boss.castTotal = VARKHUL_FRONTAL_CAST_SECONDS;
  boss.castRemaining = VARKHUL_FRONTAL_CAST_SECONDS;
  boss.castTargetId = target.id;
  boss.castAim = { ...target.pos };
  boss.channeling = false;
}

function releaseFrontal(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  const difficulty = encounterInstance(ctx, boss)?.difficulty ?? 'normal';
  for (const player of players) {
    if (!pointInVarkhulFrontal(boss.pos, st.frontalFacing, player.pos)) continue;
    dealFractionalDamage(
      ctx,
      boss,
      player,
      varkhulFrontalDamageMaxHp(difficulty),
      VARKHUL_FRONTAL_CAST_ID,
    );
  }
  ctx.emit({
    type: 'spellfxAt',
    x: boss.pos.x + Math.sin(st.frontalFacing) * 15,
    z: boss.pos.z + Math.cos(st.frontalFacing) * 15,
    school: 'fire',
    fx: 'burst',
    sourceId: boss.id,
    radius: 8,
    ability: VARKHUL_FRONTAL_CAST_ID,
  });
  st.frontalCastRemaining = 0;
  st.frontalTargetId = null;
  st.majorAbility = 'none';
  clearBossCast(boss);
}

function updateFrontal(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
  speed: number,
): void {
  st.frontalCastRemaining = Math.max(0, st.frontalCastRemaining - DT * speed);
  boss.facing = st.frontalFacing;
  boss.castingAbility = VARKHUL_FRONTAL_CAST_ID;
  boss.castRemaining = st.frontalCastRemaining;
  if (st.frontalCastRemaining <= CAST_COMPLETE_EPS) releaseFrontal(ctx, boss, st, players);
}

function applyRedHotMetal(ctx: SimContext, boss: Entity, target: Entity): void {
  ctx.applyAura(target, {
    id: VARKHUL_RED_HOT_METAL_AURA_ID,
    name: 'Red-hot Metal',
    kind: 'dot',
    remaining: VARKHUL_RED_HOT_METAL_DURATION,
    duration: VARKHUL_RED_HOT_METAL_DURATION,
    value: Math.ceil(target.maxHp * VARKHUL_RED_HOT_METAL_DAMAGE_MAX_HP),
    tickInterval: VARKHUL_RED_HOT_METAL_TICK_SECONDS,
    tickTimer: VARKHUL_RED_HOT_METAL_TICK_SECONDS,
    sourceId: boss.id,
    school: 'fire',
    encounterOwned: true,
  });
  ctx.applyAura(target, {
    id: VARKHUL_RED_HOT_METAL_ABSORB_AURA_ID,
    name: 'Red-hot Metal Barrier',
    kind: 'heal_absorb',
    remaining: VARKHUL_RED_HOT_METAL_DURATION,
    duration: VARKHUL_RED_HOT_METAL_DURATION,
    value: Math.ceil(target.maxHp * VARKHUL_RED_HOT_METAL_HEAL_ABSORB_MAX_HP),
    sourceId: boss.id,
    school: 'fire',
    encounterOwned: true,
  });
}

function startCinderOrbs(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  st.cinderOrbsCastKey++;
  const targets = selectVarkhulCinderOrbTargets(players, tankIds(ctx, boss), st.cinderOrbsCastKey);
  if (targets.length === 0) {
    st.cinderOrbsTimer = 2;
    return;
  }
  st.majorAbility = 'cinderOrbs';
  st.cinderOrbsMarkRemaining = VARKHUL_CINDER_ORBS_MARK_SECONDS;
  st.cinderOrbsTargetIds = targets.map((target) => target.id);
  st.cinderOrbsTimer = VARKHUL_CINDER_ORBS_EVERY;
  boss.castingAbility = VARKHUL_CINDER_ORBS_CAST_ID;
  boss.castTotal = VARKHUL_CINDER_ORBS_MARK_SECONDS;
  boss.castRemaining = boss.castTotal;
  boss.castTargetId = null;
  boss.castAim = null;
  boss.channeling = true;
  for (const target of targets) {
    ctx.applyAura(target, {
      id: VARKHUL_CINDER_ORBS_AURA_ID,
      name: VARKHUL_CINDER_ORBS_CAST_ID,
      kind: 'vulnerability',
      remaining: VARKHUL_CINDER_ORBS_MARK_SECONDS,
      duration: VARKHUL_CINDER_ORBS_MARK_SECONDS,
      value: 0,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
    applyRedHotMetal(ctx, boss, target);
  }
}

function releaseCinderOrbs(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  for (let targetIndex = 0; targetIndex < st.cinderOrbsTargetIds.length; targetIndex++) {
    const target = ctx.entities.get(st.cinderOrbsTargetIds[targetIndex]);
    if (target?.kind !== 'player' || target.dead) continue;
    const point = ctx.groundPos(target.pos.x, target.pos.z);
    ctx.emit({
      type: 'spellfxAt',
      x: point.x,
      z: point.z,
      school: 'fire',
      fx: 'meteorImpact',
      sourceId: boss.id,
      radius: VARKHUL_CINDER_FIRE_RADIUS,
      ability: VARKHUL_CINDER_ORBS_CAST_ID,
    });
    if (varkhulCinderFireCanSpawn(st.cinderFires.length)) {
      st.cinderFires.push({
        id: varkhulCinderFireId(boss.id, st.cinderOrbsCastKey, targetIndex),
        pos: { ...point },
        tickTimer: VARKHUL_CINDER_FIRE_TICK_SECONDS,
      });
    }
    const rotation = st.cinderOrbsCastKey * 0.47 + (targetIndex * Math.PI) / 6;
    for (
      let projectileIndex = 0;
      projectileIndex < VARKHUL_CINDER_ORB_PROJECTILES_PER_TARGET;
      projectileIndex++
    ) {
      const angle =
        rotation + (projectileIndex * Math.PI * 2) / VARKHUL_CINDER_ORB_PROJECTILES_PER_TARGET;
      st.cinderOrbProjectiles.push({
        id: varkhulCinderOrbProjectileId(
          boss.id,
          st.cinderOrbsCastKey,
          targetIndex,
          projectileIndex,
        ),
        ownerId: target.id,
        pos: { ...point },
        dir: { x: Math.sin(angle), z: Math.cos(angle) },
        remaining: VARKHUL_CINDER_ORB_DURATION,
        hitPlayerIds: [target.id],
      });
    }
  }
  for (const player of playersInEncounter(ctx, boss, true)) {
    player.auras = player.auras.filter(
      (aura) => aura.id !== VARKHUL_CINDER_ORBS_AURA_ID || aura.sourceId !== boss.id,
    );
  }
  st.cinderOrbsTargetIds = [];
  st.majorAbility = 'none';
  clearBossCast(boss);
}

function updateCinderOrbs(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  speed: number,
): void {
  boss.castingAbility = VARKHUL_CINDER_ORBS_CAST_ID;
  st.cinderOrbsMarkRemaining = Math.max(0, st.cinderOrbsMarkRemaining - DT * speed);
  boss.castRemaining = st.cinderOrbsMarkRemaining;
  if (st.cinderOrbsMarkRemaining <= CAST_COMPLETE_EPS) releaseCinderOrbs(ctx, boss, st);
}

function updateCinderFires(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  for (const fire of st.cinderFires) {
    fire.tickTimer -= DT;
    while (fire.tickTimer <= CAST_COMPLETE_EPS) {
      fire.tickTimer += VARKHUL_CINDER_FIRE_TICK_SECONDS;
      ctx.emit({
        type: 'spellfxAt',
        x: fire.pos.x,
        z: fire.pos.z,
        school: 'fire',
        fx: 'tick',
        sourceId: boss.id,
        radius: VARKHUL_CINDER_FIRE_RADIUS,
        ability: VARKHUL_CINDER_ORBS_CAST_ID,
      });
      for (const player of players) {
        if (player.dead || dist2d(fire.pos, player.pos) > VARKHUL_CINDER_FIRE_RADIUS) continue;
        dealFractionalDamage(
          ctx,
          boss,
          player,
          VARKHUL_CINDER_FIRE_DAMAGE_MAX_HP,
          VARKHUL_CINDER_ORBS_CAST_ID,
        );
      }
    }
  }
}

function updateCinderOrbProjectiles(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  for (let index = st.cinderOrbProjectiles.length - 1; index >= 0; index--) {
    const projectile = st.cinderOrbProjectiles[index];
    const speed = projectile.speed ?? VARKHUL_CINDER_ORB_SPEED;
    const radius = projectile.radius ?? VARKHUL_CINDER_ORB_HIT_RADIUS;
    const ability = projectile.ability ?? VARKHUL_CINDER_ORBS_CAST_ID;
    projectile.pos.x += projectile.dir.x * speed * DT;
    projectile.pos.z += projectile.dir.z * speed * DT;
    projectile.remaining = Math.max(0, projectile.remaining - DT);
    for (const player of players) {
      if (
        player.dead ||
        projectile.hitPlayerIds.includes(player.id) ||
        dist2d(projectile.pos, player.pos) > radius
      ) {
        continue;
      }
      projectile.hitPlayerIds.push(player.id);
      dealFractionalDamage(
        ctx,
        boss,
        player,
        projectile.damageMaxHp ?? VARKHUL_CINDER_ORB_DAMAGE_MAX_HP,
        ability,
      );
      ctx.emit({
        type: 'spellfxAt',
        x: projectile.pos.x,
        z: projectile.pos.z,
        school: 'fire',
        fx: 'burst',
        sourceId: boss.id,
        radius,
        ability,
      });
    }
    if (projectile.remaining <= CAST_COMPLETE_EPS) st.cinderOrbProjectiles.splice(index, 1);
  }
}

function addForgestormWarnings(ctx: SimContext, boss: Entity, points: readonly Vec3[]): void {
  for (const point of points) {
    ctx.groundAoEs.push({
      sourceId: boss.id,
      abilityId: VARKHUL_FORGESTORM_CAST_ID,
      ability: VARKHUL_FORGESTORM_CAST_ID,
      pos: { ...point },
      radius: VARKHUL_FORGESTORM_RADIUS,
      min: 0,
      max: 0,
      remaining: VARKHUL_FORGESTORM_WARNING_SECONDS + DT * 2,
      interval: 999,
      tickTimer: 999,
      school: 'fire',
    });
  }
}

function startForgestormWave(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  waveIndex: number,
): void {
  const instance = encounterInstance(ctx, boss);
  if (!instance) return;
  const origin = ctx.instanceOriginOf(instance);
  st.forgestormWaveIndex = waveIndex;
  st.forgestormWarningRemaining = VARKHUL_FORGESTORM_WARNING_SECONDS;
  st.forgestormPoints = varkhulForgestormPattern(st.forgestormCastKey, waveIndex, origin).map(
    (point) => ctx.groundPos(point.x, point.z),
  );
  addForgestormWarnings(ctx, boss, st.forgestormPoints);
}

function startForgestorm(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  st.majorAbility = 'forgestorm';
  st.forgestormTimer = VARKHUL_FORGESTORM_EVERY;
  st.forgestormCastKey++;
  boss.castingAbility = VARKHUL_FORGESTORM_CAST_ID;
  boss.castTotal = VARKHUL_FORGESTORM_WAVES * VARKHUL_FORGESTORM_WARNING_SECONDS;
  boss.castRemaining = boss.castTotal;
  boss.castTargetId = null;
  boss.castAim = null;
  boss.channeling = true;
  startForgestormWave(ctx, boss, st, 0);
}

function resolveForgestormWave(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  for (const point of st.forgestormPoints) {
    ctx.emit({
      type: 'spellfxAt',
      x: point.x,
      z: point.z,
      school: 'fire',
      fx: 'meteorImpact',
      sourceId: boss.id,
      radius: VARKHUL_FORGESTORM_RADIUS,
      ability: VARKHUL_FORGESTORM_CAST_ID,
    });
  }
  for (const player of players) {
    if (
      !st.forgestormPoints.some(
        (point) =>
          Math.hypot(player.pos.x - point.x, player.pos.z - point.z) <= VARKHUL_FORGESTORM_RADIUS,
      )
    )
      continue;
    dealFractionalDamage(
      ctx,
      boss,
      player,
      VARKHUL_FORGESTORM_DAMAGE_MAX_HP,
      VARKHUL_FORGESTORM_CAST_ID,
    );
  }
  clearEncounterWarnings(ctx, boss);
  st.forgestormPoints = [];
  const nextWave = st.forgestormWaveIndex + 1;
  if (nextWave < VARKHUL_FORGESTORM_WAVES) {
    startForgestormWave(ctx, boss, st, nextWave);
    return;
  }
  st.forgestormWarningRemaining = 0;
  st.majorAbility = 'none';
  clearBossCast(boss);
}

function updateForgestorm(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
  speed: number,
): void {
  st.forgestormWarningRemaining = Math.max(0, st.forgestormWarningRemaining - DT * speed);
  boss.castingAbility = VARKHUL_FORGESTORM_CAST_ID;
  boss.castRemaining =
    (VARKHUL_FORGESTORM_WAVES - 1 - st.forgestormWaveIndex) * VARKHUL_FORGESTORM_WARNING_SECONDS +
    st.forgestormWarningRemaining;
  if (st.forgestormWarningRemaining <= CAST_COMPLETE_EPS) {
    resolveForgestormWave(ctx, boss, st, players);
  }
}

function anvilWorldPosition(ctx: SimContext, boss: Entity): Vec3 {
  const instance = encounterInstance(ctx, boss);
  if (!instance) return { ...boss.spawnPos };
  const origin = ctx.instanceOriginOf(instance);
  return ctx.groundPos(origin.x + VARKHUL_FORGE_LOCAL_POS.x, origin.z + VARKHUL_FORGE_LOCAL_POS.z);
}

function startAnvilsDecree(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  st.majorAbility = 'anvil';
  st.anvilTimer = VARKHUL_ANVIL_EVERY;
  st.anvilStrikeIndex = 0;
  st.anvilMeteorCastKey++;
  st.anvilStrikeRemaining = VARKHUL_ANVILS_DECREE_STRIKE_SECONDS;
  const forge = anvilWorldPosition(ctx, boss);
  boss.pos = { ...forge };
  boss.prevPos = { ...forge };
  boss.castingAbility = VARKHUL_ANVILS_DECREE_CAST_ID;
  boss.castTotal = VARKHUL_ANVILS_DECREE_STRIKES * VARKHUL_ANVILS_DECREE_STRIKE_SECONDS;
  boss.castRemaining = boss.castTotal;
  boss.castTargetId = null;
  boss.castAim = { ...forge };
  boss.channeling = true;
}

function startAnvilMeteors(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  const instance = encounterInstance(ctx, boss);
  if (instance?.difficulty !== 'heroic') return;
  const origin = ctx.instanceOriginOf(instance);
  st.anvilMeteorBatches.push({
    castKey: st.anvilMeteorCastKey,
    strikeIndex: st.anvilStrikeIndex,
    remaining: VARKHUL_ANVIL_METEOR_WARNING_SECONDS,
    points: varkhulAnvilMeteorPattern(st.anvilMeteorCastKey, st.anvilStrikeIndex, origin).map(
      (point) => ctx.groundPos(point.x, point.z),
    ),
  });
}

function updateAnvilMeteors(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  for (const batch of st.anvilMeteorBatches) {
    batch.remaining = Math.max(0, batch.remaining - DT);
    if (batch.remaining > CAST_COMPLETE_EPS) continue;
    for (let meteorIndex = 0; meteorIndex < batch.points.length; meteorIndex++) {
      const point = batch.points[meteorIndex];
      const persistentId = varkhulAnvilMeteorId(
        boss.id,
        batch.castKey,
        batch.strikeIndex,
        meteorIndex,
      );
      ctx.emit({
        type: 'spellfxAt',
        x: point.x,
        z: point.z,
        school: 'fire',
        fx: 'meteorImpact',
        sourceId: boss.id,
        radius: VARKHUL_ANVIL_METEOR_RADIUS,
        ability: VARKHUL_ANVIL_METEOR_CAST_ID,
        persistentId,
      });
      for (const player of players) {
        if (player.dead || dist2d(point, player.pos) > VARKHUL_ANVIL_METEOR_RADIUS) continue;
        dealFractionalDamage(
          ctx,
          boss,
          player,
          VARKHUL_ANVIL_METEOR_DAMAGE_MAX_HP,
          VARKHUL_ANVIL_METEOR_CAST_ID,
        );
      }
    }
  }
  st.anvilMeteorBatches = st.anvilMeteorBatches.filter(
    (batch) => batch.remaining > CAST_COMPLETE_EPS,
  );
}

function resolveAnvilStrike(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  const forge = anvilWorldPosition(ctx, boss);
  const difficulty = encounterInstance(ctx, boss)?.difficulty ?? 'normal';
  const damageMaxHp = varkhulAnvilsDecreeDamageMaxHp(difficulty, st.anvilStrikeIndex);
  ctx.emit({
    type: 'spellfxAt',
    x: forge.x,
    z: forge.z,
    school: 'fire',
    fx: 'nova',
    sourceId: boss.id,
    ability: VARKHUL_ANVILS_DECREE_CAST_ID,
  });
  for (const player of players) {
    dealFractionalDamage(ctx, boss, player, damageMaxHp, VARKHUL_ANVILS_DECREE_CAST_ID);
  }
  startAnvilMeteors(ctx, boss, st);
  st.anvilStrikeIndex++;
  if (st.anvilStrikeIndex >= VARKHUL_ANVILS_DECREE_STRIKES) {
    st.anvilStrikeRemaining = 0;
    st.majorAbility = 'none';
    clearBossCast(boss);
    return;
  }
  st.anvilStrikeRemaining = VARKHUL_ANVILS_DECREE_STRIKE_SECONDS;
}

function updateAnvilsDecree(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
  speed: number,
): void {
  st.anvilStrikeRemaining = Math.max(0, st.anvilStrikeRemaining - DT * speed);
  boss.castingAbility = VARKHUL_ANVILS_DECREE_CAST_ID;
  boss.castRemaining =
    (VARKHUL_ANVILS_DECREE_STRIKES - 1 - st.anvilStrikeIndex) *
      VARKHUL_ANVILS_DECREE_STRIKE_SECONDS +
    st.anvilStrikeRemaining;
  if (st.anvilStrikeRemaining <= CAST_COMPLETE_EPS) {
    resolveAnvilStrike(ctx, boss, st, players);
  }
}

function spawnAssemblyAdd(
  ctx: SimContext,
  boss: Entity,
  templateId: string,
  localX: number,
  localZ: number,
): Entity | null {
  const instance = encounterInstance(ctx, boss);
  const template = MOBS[templateId];
  if (!instance || !template) return null;
  const origin = ctx.instanceOriginOf(instance);
  const difficulty = instance.difficulty ?? 'normal';
  const spawnTemplate = mobTemplateForDungeonDifficulty(template, instance.dungeonId, difficulty);
  const add = createMob(
    ctx.nextId++,
    spawnTemplate,
    spawnTemplate.maxLevel,
    ctx.groundPos(origin.x + localX, origin.z + localZ),
  );
  applyDungeonMobTuning(add, instance.dungeonId, difficulty);
  add.spawnPos = { ...add.pos };
  add.tappedById = boss.tappedById;
  add.inCombat = true;
  add.aiState = 'attack';
  add.aggroTargetId = boss.aggroTargetId;
  if (templateId === VARKHUL_CRUCIBLE_WARDEN_ID) {
    add.bigCastTimer = VARKHUL_ASSEMBLY_WARDEN_FIRST_CAST_SECONDS;
    add.ignoreHardLeash = true;
  }
  ctx.addEntity(add);
  boss.summonedIds.push(add.id);
  instance.mobIds.push(add.id);
  return add;
}

function assignAssemblyFixate(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  sentinelOverride?: Entity,
): Entity | null {
  const players = playersInEncounter(ctx, boss);
  const current = players.find((player) => player.id === st.assemblyFixateTargetId) ?? null;
  const sentinel =
    sentinelOverride ??
    st.assemblyAddIds
      .map((id) => ctx.entities.get(id))
      .find((add) => add?.templateId === VARKHUL_EMBER_SENTINEL_ID);
  if (current) return current;
  if (st.assemblyFixateTargetId !== null) {
    const previous = ctx.entities.get(st.assemblyFixateTargetId);
    if (previous) {
      previous.auras = previous.auras.filter(
        (aura) => aura.id !== VARKHUL_ASSEMBLY_FIXATE_AURA_ID || aura.sourceId !== boss.id,
      );
    }
  }
  const nonTanks = players.filter((player) => !tankIds(ctx, boss).has(player.id));
  const pool = nonTanks.length > 0 ? nonTanks : players;
  const target = pool.length > 0 ? pool[boss.id % pool.length] : null;
  st.assemblyFixateTargetId = target?.id ?? null;
  if (!sentinel || !target) return target;
  sentinel.ignoreHardLeash = true;
  sentinel.forcedTargetId = target.id;
  sentinel.forcedTargetTimer = VARKHUL_MASTERS_ASSEMBLY_SECONDS;
  sentinel.aggroTargetId = target.id;
  ctx.applyAura(target, {
    id: VARKHUL_ASSEMBLY_FIXATE_AURA_ID,
    name: "Sentinel's Gaze",
    kind: 'vulnerability',
    remaining: VARKHUL_MASTERS_ASSEMBLY_SECONDS,
    duration: VARKHUL_MASTERS_ASSEMBLY_SECONDS,
    value: 0,
    sourceId: boss.id,
    school: 'fire',
    encounterOwned: true,
  });
  return target;
}

function startMastersAssembly(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  cancelMajorAbility(ctx, boss, st);
  st.assemblyTriggered = true;
  st.assemblyPhase = 'adds';
  st.assemblyRemaining = VARKHUL_MASTERS_ASSEMBLY_SECONDS;
  st.assemblyWipeResolved = false;
  st.assemblyDroppedAddIds = [];
  st.assemblyCores = [];
  st.assemblyForgeHp = VARKHUL_ASSEMBLY_FORGE_MAX_HP;
  st.assemblyDeliveryWindowRemaining = 0;
  st.assemblyDeliveredCoreIds = [];
  st.assemblyArtificerRepaired = false;
  st.assemblyRuneCenter = null;
  st.assemblyRuneAssignments = [];
  st.assemblyRuneAngles = [];
  st.assemblyRuneControls = [];
  st.assemblyLinkFireballTimer = 0;
  st.assemblyLinkFireballWave = 0;
  st.assemblyRuneRound = 0;
  st.assemblyRuneRounds = varkhulAssemblyRounds(
    encounterInstance(ctx, boss)?.difficulty ?? 'normal',
  );
  st.assemblyRuneRemaining = 0;
  st.assemblyStunRemaining = 0;
  boss.damageImmune = true;
  boss.knockbackResistance = 1;
  const forge = anvilWorldPosition(ctx, boss);
  boss.pos = { ...forge };
  boss.prevPos = { ...forge };
  const adds = VARKHUL_ASSEMBLY_ADD_OFFSETS.map((spawn) =>
    spawnAssemblyAdd(ctx, boss, spawn.id, spawn.x, spawn.z),
  ).filter((add): add is Entity => add !== null);
  st.assemblyAddIds = adds.map((add) => add.id);
  ctx.applyAura(boss, {
    id: VARKHUL_MASTERS_ASSEMBLY_AURA_ID,
    name: VARKHUL_MASTERS_ASSEMBLY_CAST_ID,
    kind: 'absorb',
    remaining: 999,
    duration: 999,
    value: boss.maxHp * VARKHUL_WIPE_DAMAGE_MULTIPLIER,
    sourceId: boss.id,
    school: 'fire',
    encounterOwned: true,
  });
  const sentinel = adds.find((add) => add.templateId === VARKHUL_EMBER_SENTINEL_ID);
  assignAssemblyFixate(ctx, boss, st, sentinel);
}

function clearAssemblyPlayerAuras(ctx: SimContext, boss: Entity): void {
  for (const player of playersInEncounter(ctx, boss, true)) {
    player.auras = player.auras.filter(
      (aura) =>
        aura.id !== VARKHUL_ASSEMBLY_FIXATE_AURA_ID &&
        aura.id !== VARKHUL_ASSEMBLY_CORE_AURA_ID &&
        aura.id !== VARKHUL_ASSEMBLY_LINK_AURA_ID,
    );
  }
}

function finishAssembly(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  boss.damageImmune = false;
  boss.damageFloorHp = undefined;
  boss.knockbackResistance = 0;
  boss.auras = boss.auras.filter(
    (aura) => aura.id !== VARKHUL_MASTERS_ASSEMBLY_AURA_ID || aura.sourceId !== boss.id,
  );
  clearAssemblyPlayerAuras(ctx, boss);
  st.cinderOrbProjectiles = st.cinderOrbProjectiles.filter(
    (projectile) => !projectile.id.startsWith(`${boss.id}:assembly-links:`),
  );
  for (const id of st.assemblyAddIds) {
    const add = ctx.entities.get(id);
    if (add) clearBossCast(add);
  }
}

function dropDeadAssemblyCores(ctx: SimContext, st: VarkhulEncounterState): void {
  for (const addId of st.assemblyAddIds) {
    if (st.assemblyDroppedAddIds.includes(addId)) continue;
    const add = ctx.entities.get(addId);
    if (!add?.dead) continue;
    st.assemblyDroppedAddIds.push(addId);
    st.assemblyCores.push({
      id: `varkhul-core:${addId}`,
      sourceAddId: addId,
      pos: { ...add.pos },
      carrierId: null,
      delivered: false,
      burdenStacks: 0,
      burdenTickTimer: VARKHUL_ASSEMBLY_BURDEN_TICK_SECONDS,
    });
  }
}

function removeCoreAura(player: Entity): void {
  player.auras = player.auras.filter((aura) => aura.id !== VARKHUL_ASSEMBLY_CORE_AURA_ID);
}

function ejectDeliveredCores(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  const forge = anvilWorldPosition(ctx, boss);
  const delivered = st.assemblyCores.filter((core) => core.delivered);
  for (let index = 0; index < delivered.length; index++) {
    const core = delivered[index];
    const angle = (index * Math.PI * 2) / Math.max(1, delivered.length) + 0.45;
    core.delivered = false;
    core.carrierId = null;
    core.pos = ctx.groundPos(forge.x + Math.sin(angle) * 5, forge.z + Math.cos(angle) * 5);
  }
  st.assemblyDeliveredCoreIds = [];
  st.assemblyDeliveryWindowRemaining = 0;
}

function applyLinkAuras(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  for (const assignment of st.assemblyRuneAssignments) {
    const player = ctx.entities.get(assignment.playerId);
    if (player?.kind !== 'player' || player.dead) continue;
    ctx.applyAura(player, {
      id: VARKHUL_ASSEMBLY_LINK_AURA_ID,
      name: 'Forge Link',
      kind: 'vulnerability',
      remaining: st.assemblyRuneRemaining,
      duration: st.assemblyRuneRemaining,
      value: 0,
      stacks: assignment.symbol + 1,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
  }
}

function startAssemblyConvergence(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  const instance = encounterInstance(ctx, boss);
  if (!instance) return;
  const origin = ctx.instanceOriginOf(instance);
  const center = ctx.groundPos(origin.x, origin.z);
  for (const player of playersInEncounter(ctx, boss)) {
    player.pos = { ...center };
    player.prevPos = { ...center };
    player.vx = 0;
    player.vy = 0;
    player.vz = 0;
    player.jumping = false;
    player.onGround = true;
    player.fallStartY = center.y;
    ctx.rebucket(player);
  }
  clearAssemblyPlayerAuras(ctx, boss);
  st.assemblyRuneCenter = { ...center };
  st.assemblyPhase = 'convergence';
  st.assemblyWipeResolved = false;
  st.assemblyRuneAssignments = [];
  st.assemblyRuneAngles = [];
  st.assemblyRuneControls = [];
  st.assemblyLinkFireballTimer = 0;
  st.assemblyLinkFireballWave = 0;
  st.assemblyRuneRemaining = VARKHUL_ASSEMBLY_CONVERGENCE_SECONDS;
  boss.castingAbility = VARKHUL_ASSEMBLY_CONVERGENCE_CAST_ID;
  boss.castTotal = VARKHUL_ASSEMBLY_CONVERGENCE_SECONDS;
  boss.castRemaining = VARKHUL_ASSEMBLY_CONVERGENCE_SECONDS;
  boss.castTargetId = null;
  boss.castAim = { ...center };
  boss.channeling = true;
  ctx.emit({
    type: 'spellfxAt',
    x: center.x,
    z: center.z,
    school: 'fire',
    fx: 'nova',
    sourceId: boss.id,
    radius: 6,
    ability: VARKHUL_ASSEMBLY_CONVERGENCE_CAST_ID,
  });
}

function updateAssemblyConvergence(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  st.assemblyRuneRemaining = Math.max(0, st.assemblyRuneRemaining - DT);
  boss.castingAbility = VARKHUL_ASSEMBLY_CONVERGENCE_CAST_ID;
  boss.castRemaining = st.assemblyRuneRemaining;
  if (st.assemblyRuneRemaining <= CAST_COMPLETE_EPS) startAssemblyLinkRound(ctx, boss, st, 0);
}

function startAssemblyLinkRound(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  round: number,
): void {
  const difficulty = encounterInstance(ctx, boss)?.difficulty ?? 'normal';
  const players = playersInEncounter(ctx, boss);
  st.assemblyPhase = 'links';
  st.assemblyWipeResolved = false;
  st.assemblyRuneRound = round;
  st.assemblyRuneRemaining = varkhulAssemblyRuneSeconds(difficulty);
  st.assemblyRuneAssignments = varkhulAssemblyRuneAssignments(
    players.map((player) => player.id),
    boss.id,
    round,
  ).map((assignment) => ({ ...assignment, locked: false }));
  st.assemblyRuneAngles = Array.from({ length: VARKHUL_ASSEMBLY_RUNE_COUNT }, (_, symbol) =>
    varkhulAssemblyRuneStartAngle(boss.id, symbol, round),
  );
  st.assemblyRuneControls = Array.from({ length: VARKHUL_ASSEMBLY_RUNE_COUNT }, () => 'off');
  st.assemblyLinkFireballTimer = 1.2;
  st.assemblyLinkFireballWave = 0;
  clearAssemblyPlayerAuras(ctx, boss);
  applyLinkAuras(ctx, boss, st);
  boss.castingAbility = VARKHUL_ASSEMBLY_LINK_CAST_ID;
  boss.castTotal = st.assemblyRuneRemaining;
  boss.castRemaining = st.assemblyRuneRemaining;
  boss.castTargetId = null;
  boss.castAim = null;
  boss.channeling = true;
}

function shatterAssemblyForge(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  stunSeconds = VARKHUL_ASSEMBLY_STUN_SECONDS,
  damageTakenBonus = VARKHUL_ASSEMBLY_STUN_DAMAGE_TAKEN_BONUS,
): void {
  finishAssembly(ctx, boss, st);
  st.assemblyPhase = 'stunned';
  st.assemblyStunRemaining = stunSeconds;
  st.assemblyRuneRemaining = 0;
  boss.aiState = 'idle';
  boss.aggroTargetId = null;
  clearBossCast(boss);
  ctx.applyAura(boss, {
    id: VARKHUL_ASSEMBLY_STUN_AURA_ID,
    name: 'Forge Shattered',
    kind: 'vulnerability',
    remaining: stunSeconds,
    duration: stunSeconds,
    value: damageTakenBonus,
    sourceId: boss.id,
    school: 'fire',
    encounterOwned: true,
  });
  const forge = anvilWorldPosition(ctx, boss);
  ctx.emit({
    type: 'spellfxAt',
    x: forge.x,
    z: forge.z,
    school: 'fire',
    fx: 'meteorImpact',
    sourceId: boss.id,
    radius: 14,
    ability: 'Unstable Reaction',
  });
}

function deliverCore(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  core: VarkhulEncounterState['assemblyCores'][number],
  carrier: Entity,
): void {
  removeCoreAura(carrier);
  core.carrierId = null;
  core.delivered = true;
  core.pos = anvilWorldPosition(ctx, boss);
  st.assemblyForgeHp = Math.max(
    VARKHUL_ASSEMBLY_UNSTABLE_REACTION_DAMAGE,
    st.assemblyForgeHp - VARKHUL_ASSEMBLY_CORE_BASE_DAMAGE,
  );
  if (st.assemblyDeliveryWindowRemaining <= 0) {
    st.assemblyDeliveredCoreIds = [];
    st.assemblyDeliveryWindowRemaining = VARKHUL_ASSEMBLY_CORE_WINDOW_SECONDS;
  }
  st.assemblyDeliveredCoreIds.push(core.id);
  ctx.emit({
    type: 'spellfxAt',
    x: core.pos.x,
    z: core.pos.z,
    school: 'fire',
    fx: 'nova',
    sourceId: boss.id,
    radius: VARKHUL_ASSEMBLY_FORGE_DELIVERY_RADIUS,
    ability: 'Molten Core',
  });
  if (st.assemblyDeliveredCoreIds.length < 3) return;
  st.assemblyForgeHp = Math.max(0, st.assemblyForgeHp - VARKHUL_ASSEMBLY_UNSTABLE_REACTION_DAMAGE);
  startAssemblyConvergence(ctx, boss, st);
}

function updateAssemblyCores(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): boolean {
  const forge = anvilWorldPosition(ctx, boss);
  for (const core of st.assemblyCores) {
    if (core.delivered) continue;
    const carrier =
      core.carrierId === null
        ? null
        : (players.find((player) => player.id === core.carrierId) ?? null);
    const detachedCarrier =
      core.carrierId === null ? null : (ctx.entities.get(core.carrierId) ?? null);
    if (carrier?.kind === 'player' && !carrier.dead) {
      core.pos = { ...carrier.pos };
      core.burdenTickTimer -= DT;
      if (core.burdenTickTimer <= CAST_COMPLETE_EPS) {
        core.burdenTickTimer += VARKHUL_ASSEMBLY_BURDEN_TICK_SECONDS;
        core.burdenStacks++;
        dealFractionalDamage(
          ctx,
          boss,
          carrier,
          varkhulAssemblyBurdenDamageMaxHp(core.burdenStacks),
          'Molten Burden',
        );
      }
      if (!carrier.dead && dist2d(carrier.pos, forge) <= VARKHUL_ASSEMBLY_FORGE_DELIVERY_RADIUS) {
        deliverCore(ctx, boss, st, core, carrier);
        if (st.assemblyPhase === 'convergence') return true;
      }
      continue;
    }
    if (detachedCarrier) removeCoreAura(detachedCarrier);
    core.carrierId = null;
    const player = players.find(
      (candidate) =>
        !candidate.dead &&
        !st.assemblyCores.some((other) => other.carrierId === candidate.id) &&
        dist2d(candidate.pos, core.pos) <= VARKHUL_ASSEMBLY_CORE_PICKUP_RADIUS,
    );
    if (!player) continue;
    core.carrierId = player.id;
    core.burdenStacks = 0;
    core.burdenTickTimer = VARKHUL_ASSEMBLY_BURDEN_TICK_SECONDS;
    ctx.applyAura(player, {
      id: VARKHUL_ASSEMBLY_CORE_AURA_ID,
      name: 'Molten Core',
      kind: 'vulnerability',
      remaining: 999,
      duration: 999,
      value: 0,
      sourceId: boss.id,
      school: 'fire',
      encounterOwned: true,
    });
  }
  if (st.assemblyDeliveryWindowRemaining > 0) {
    st.assemblyDeliveryWindowRemaining = Math.max(0, st.assemblyDeliveryWindowRemaining - DT);
    if (st.assemblyDeliveryWindowRemaining <= CAST_COMPLETE_EPS) {
      ejectDeliveredCores(ctx, boss, st);
    }
  }
  return false;
}

function spawnAssemblyLinkFireballs(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  forge: Vec3,
): void {
  const difficulty = encounterInstance(ctx, boss)?.difficulty ?? 'normal';
  for (const [index, fireball] of varkhulAssemblyFireballPattern(
    forge,
    difficulty,
    st.assemblyRuneRound,
    st.assemblyLinkFireballWave,
  ).entries()) {
    st.cinderOrbProjectiles.push({
      id: `${boss.id}:assembly-links:${st.assemblyRuneRound}:${st.assemblyLinkFireballWave}:${index}`,
      ownerId: boss.id,
      pos: ctx.groundPos(fireball.x, fireball.z),
      dir: { x: fireball.dirX, z: fireball.dirZ },
      remaining: VARKHUL_ASSEMBLY_LINK_FIREBALL_DURATION,
      hitPlayerIds: [],
      radius: VARKHUL_ASSEMBLY_LINK_FIREBALL_RADIUS,
      duration: VARKHUL_ASSEMBLY_LINK_FIREBALL_DURATION,
      speed: VARKHUL_CINDER_ORB_SPEED,
      damageMaxHp:
        difficulty === 'heroic'
          ? VARKHUL_ASSEMBLY_LINK_FIREBALL_DAMAGE_HEROIC
          : VARKHUL_ASSEMBLY_LINK_FIREBALL_DAMAGE_NORMAL,
      ability: VARKHUL_ASSEMBLY_LINK_CAST_ID,
    });
  }
  st.assemblyLinkFireballWave++;
  st.assemblyLinkFireballTimer += varkhulAssemblyFireballCadence(difficulty);
}

function updateAssemblyLinks(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  st.assemblyRuneRemaining = Math.max(0, st.assemblyRuneRemaining - DT);
  boss.castingAbility = VARKHUL_ASSEMBLY_LINK_CAST_ID;
  boss.castRemaining = st.assemblyRuneRemaining;
  const forge = anvilWorldPosition(ctx, boss);
  const instance = encounterInstance(ctx, boss);
  if (!instance) return;
  const origin = ctx.instanceOriginOf(instance);
  const roomCenter = ctx.groundPos(origin.x, origin.z);
  positionVarkhulLinkPracticeBots(ctx, roomCenter, boss.id, st);
  const players = playersInEncounter(ctx, boss);
  const difficulty = instance.difficulty ?? 'normal';
  st.assemblyLinkFireballTimer -= DT;
  if (st.assemblyLinkFireballTimer <= CAST_COMPLETE_EPS) {
    spawnAssemblyLinkFireballs(ctx, boss, st, forge);
  }
  for (const assignment of st.assemblyRuneAssignments) {
    const player = ctx.entities.get(assignment.playerId);
    const aura = player?.auras.find((entry) => entry.id === VARKHUL_ASSEMBLY_LINK_AURA_ID);
    if (aura) aura.remaining = st.assemblyRuneRemaining;
  }
  for (const assignment of st.assemblyRuneAssignments) {
    if (assignment.locked) continue;
    const player = ctx.entities.get(assignment.playerId);
    const station = varkhulAssemblyRuneStation(roomCenter, assignment.symbol, st.assemblyRuneRound);
    const targetAngle = varkhulAssemblyRuneTargetAngle(
      boss.id,
      assignment.symbol,
      st.assemblyRuneRound,
    );
    const previousAngle =
      st.assemblyRuneAngles[assignment.symbol] ??
      varkhulAssemblyRuneStartAngle(boss.id, assignment.symbol, st.assemblyRuneRound);
    const control =
      player?.kind === 'player' && !player.dead
        ? varkhulAssemblyRuneControlAt(station, player.pos)
        : 'off';
    const glyphAngle = varkhulAssemblyStepRune(previousAngle, control, difficulty, DT, targetAngle);
    st.assemblyRuneAngles[assignment.symbol] = glyphAngle;
    st.assemblyRuneControls[assignment.symbol] = control;
    if (!varkhulAssemblyRuneAligned(glyphAngle, targetAngle)) continue;
    assignment.locked = true;
    if (player) {
      player.auras = player.auras.filter(
        (aura) => aura.id !== VARKHUL_ASSEMBLY_LINK_AURA_ID || aura.sourceId !== boss.id,
      );
    }
    ctx.emit({
      type: 'spellfxAt',
      x: station.x,
      z: station.z,
      school: 'fire',
      fx: 'nova',
      sourceId: boss.id,
      radius: VARKHUL_ASSEMBLY_RUNE_RADIUS,
      ability: VARKHUL_ASSEMBLY_LINK_CAST_ID,
    });
  }
  if (
    st.assemblyRuneAssignments.length === VARKHUL_ASSEMBLY_RUNE_COUNT &&
    st.assemblyRuneAssignments.every((assignment) => assignment.locked)
  ) {
    if (st.assemblyRuneRound + 1 < st.assemblyRuneRounds) {
      startAssemblyLinkRound(ctx, boss, st, st.assemblyRuneRound + 1);
    } else {
      shatterAssemblyForge(ctx, boss, st);
    }
    return;
  }
  boss.castRemaining = st.assemblyRuneRemaining;
  if (st.assemblyRuneRemaining <= CAST_COMPLETE_EPS && !st.assemblyWipeResolved) {
    st.assemblyWipeResolved = true;
    const lockedRunes = st.assemblyRuneAssignments.filter((assignment) => assignment.locked).length;
    const outcome = varkhulAssemblyRuneOutcome(lockedRunes);
    if (outcome === 'partial') {
      shatterAssemblyForge(
        ctx,
        boss,
        st,
        VARKHUL_ASSEMBLY_PARTIAL_STUN_SECONDS,
        VARKHUL_ASSEMBLY_PARTIAL_DAMAGE_TAKEN_BONUS,
      );
      return;
    }
    finishAssembly(ctx, boss, st);
    st.assemblyPhase = 'done';
    st.assemblyAddIds = [];
    clearBossCast(boss);
    boss.aiState = 'attack';
    const damage =
      difficulty === 'heroic'
        ? VARKHUL_ASSEMBLY_LINK_FAILURE_DAMAGE_HEROIC
        : VARKHUL_ASSEMBLY_LINK_FAILURE_DAMAGE_NORMAL;
    for (const player of players) {
      if (!player.dead) {
        dealFractionalDamage(ctx, boss, player, damage, VARKHUL_ASSEMBLY_LINK_CAST_ID);
      }
    }
    ctx.emit({
      type: 'spellfxAt',
      x: forge.x,
      z: forge.z,
      school: 'fire',
      fx: 'meteorImpact',
      sourceId: boss.id,
      radius: VARKHUL_ASSEMBLY_RUNE_STATION_DISTANCE,
      ability: VARKHUL_ASSEMBLY_LINK_CAST_ID,
    });
  }
}

function updateMastersAssembly(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): boolean {
  if (!st.assemblyTriggered || st.assemblyPhase === 'done') return false;
  const forge = anvilWorldPosition(ctx, boss);
  boss.pos = { ...forge };
  boss.prevPos = { ...forge };
  if (st.assemblyPhase === 'stunned') {
    st.assemblyStunRemaining = Math.max(0, st.assemblyStunRemaining - DT);
    boss.aiState = 'idle';
    boss.aggroTargetId = null;
    if (st.assemblyStunRemaining <= CAST_COMPLETE_EPS) {
      st.assemblyPhase = 'done';
      st.assemblyAddIds = [];
      boss.auras = boss.auras.filter((aura) => aura.id !== VARKHUL_ASSEMBLY_STUN_AURA_ID);
    }
    return st.assemblyPhase !== 'done';
  }
  if (st.assemblyPhase === 'links') {
    updateAssemblyLinks(ctx, boss, st);
    return true;
  }
  if (st.assemblyPhase === 'convergence') {
    updateAssemblyConvergence(ctx, boss, st);
    return true;
  }
  const adds = st.assemblyAddIds.map((id) => ctx.entities.get(id)).filter(Boolean) as Entity[];
  const liveAdds = adds.filter((add) => !add.dead);
  dropDeadAssemblyCores(ctx, st);
  const sentinel = adds.find((add) => add.templateId === VARKHUL_EMBER_SENTINEL_ID);
  if (sentinel?.dead && st.assemblyFixateTargetId !== null) {
    const target = ctx.entities.get(st.assemblyFixateTargetId);
    if (target) {
      target.auras = target.auras.filter(
        (aura) => aura.id !== VARKHUL_ASSEMBLY_FIXATE_AURA_ID || aura.sourceId !== boss.id,
      );
    }
    st.assemblyFixateTargetId = null;
  }
  if (liveAdds.length === 0) st.assemblyPhase = 'cores';
  if (st.assemblyPhase === 'cores' && updateAssemblyCores(ctx, boss, st, players)) return true;
  st.assemblyRemaining = Math.max(0, st.assemblyRemaining - DT);
  if (st.assemblyRemaining <= CAST_COMPLETE_EPS && !st.assemblyWipeResolved) {
    st.assemblyWipeResolved = true;
    wipeEncounter(ctx, boss, players, VARKHUL_MASTERS_ASSEMBLY_CAST_ID);
  }
  boss.aiState = 'attack';
  return true;
}

export function updateVarkhulAssemblyAutomaton(ctx: SimContext, add: Entity): boolean {
  let boss: Entity | null = null;
  for (const entity of ctx.entities.values()) {
    if (
      entity.templateId === VARKHUL_BOSS_TEMPLATE_ID &&
      entity.varkhul?.assemblyPhase === 'adds' &&
      entity.varkhul.assemblyAddIds.includes(add.id)
    ) {
      boss = entity;
      break;
    }
  }
  if (!boss?.varkhul) return false;
  add.inCombat = true;
  if (add.templateId === VARKHUL_CINDER_ARTIFICER_ID) {
    add.castingAbility = VARKHUL_ASSEMBLY_REPAIR_CAST_ID;
    add.castTotal = 0;
    add.castRemaining = 0;
    add.castTargetId = boss.id;
    add.castAim = { ...boss.pos };
    add.channeling = false;
    if (ctx.isStunned(add)) return true;
    if (dist2d(add.pos, boss.pos) <= VARKHUL_ASSEMBLY_FORGE_DELIVERY_RADIUS) {
      add.aiState = 'attack';
      if (!boss.varkhul.assemblyArtificerRepaired) {
        boss.varkhul.assemblyArtificerRepaired = true;
        ctx.applyHeal(
          add,
          boss,
          Math.ceil(boss.maxHp * VARKHUL_ASSEMBLY_REPAIR_HEAL_MAX_HP),
          VARKHUL_ASSEMBLY_REPAIR_CAST_ID,
          undefined,
          false,
        );
        ctx.emit({
          type: 'spellfx',
          sourceId: add.id,
          targetId: boss.id,
          school: 'fire',
          fx: 'projectile',
        });
      }
      return true;
    }
    add.aiState = 'chase';
    if (!ctx.isRooted(add)) {
      ctx.moveToward(add, boss.pos, add.moveSpeed * ctx.moveSpeedMult(add));
    }
    add.facing = steadyAngleTo(add.pos, boss.pos, add.facing);
    return true;
  }
  if (add.templateId === VARKHUL_EMBER_SENTINEL_ID) {
    const fixateTarget = assignAssemblyFixate(ctx, boss, boss.varkhul, add);
    if (!fixateTarget) return true;
    add.forcedTargetId = fixateTarget.id;
    add.forcedTargetTimer = Math.max(add.forcedTargetTimer, DT * 2);
    add.aggroTargetId = fixateTarget.id;
  }
  if (add.templateId === VARKHUL_CRUCIBLE_WARDEN_ID) {
    const bigCast = MOBS[add.templateId]?.bigCast;
    if (!bigCast) return false;
    add.ignoreHardLeash = true;
    add.aiState = 'attack';
    updateMobTarget(ctx, add);
    const target = add.aggroTargetId === null ? null : ctx.entities.get(add.aggroTargetId);
    if (target && !target.dead) add.facing = steadyAngleTo(add.pos, target.pos, add.facing);
    if (ctx.isStunned(add)) return true;
    add.bigCastTimer = Math.max(0, add.bigCastTimer - DT);
    add.swingTimer = Math.max(0, add.swingTimer - DT);
    if (target && !target.dead) {
      const profile = mobCombatProfile(add);
      tryMobMeleeSwingInRange(ctx, add, target);
      if (dist2d(add.pos, target.pos) > profile.meleeRange) {
        if (!ctx.isRooted(add)) {
          ctx.moveToward(
            add,
            target.pos,
            add.moveSpeed * profile.chaseSpeedMult * ctx.moveSpeedMult(add),
          );
        } else {
          add.facing = steadyAngleTo(add.pos, target.pos, add.facing);
        }
      }
      tryMobMeleeSwingInRange(ctx, add, target);
      add.aiState = dist2d(add.pos, target.pos) <= profile.meleeRange ? 'attack' : 'chase';
    }
    if (add.castingAbility === bigCast.castId) {
      add.castRemaining = Math.max(0, add.castRemaining - DT);
      if (add.castRemaining <= CAST_COMPLETE_EPS) {
        clearBossCast(add);
        const school = bigCast.school ?? 'nature';
        ctx.emit({ type: 'spellfx', sourceId: add.id, targetId: add.id, school, fx: 'nova' });
        for (const player of playersInEncounter(ctx, boss)) {
          if (dist2d(player.pos, add.pos) > bigCast.radius) continue;
          const damage = Math.round(
            ctx.rng.range(bigCast.min, bigCast.max) * (add.mechanicDamageMult ?? 1),
          );
          ctx.dealDamage(add, player, damage, false, school, bigCast.name, 'hit', true);
        }
      }
      return true;
    }
    if (add.bigCastTimer <= CAST_COMPLETE_EPS && add.castingAbility === null) {
      add.bigCastTimer = bigCast.every;
      add.castingAbility = bigCast.castId;
      add.castTotal = bigCast.castTime;
      add.castRemaining = bigCast.castTime;
      add.castTargetId = null;
      add.castAim = null;
      add.channeling = false;
    }
    return true;
  }
  return false;
}

function startMasterpieceUnbound(boss: Entity, st: VarkhulEncounterState): void {
  st.masterpieceTriggered = true;
  st.masterpieceRemaining = VARKHUL_MASTERPIECE_UNBOUND_SECONDS;
  st.masterpiecePulseTimer = VARKHUL_MASTERPIECE_UNBOUND_PULSE_SECONDS;
  st.masterpieceWipeResolved = false;
  boss.enraged = true;
  boss.auras.push({
    id: VARKHUL_MASTERPIECE_UNBOUND_AURA_ID,
    name: 'Masterpiece Unbound',
    kind: 'enrage',
    remaining: VARKHUL_MASTERPIECE_UNBOUND_SECONDS,
    duration: VARKHUL_MASTERPIECE_UNBOUND_SECONDS,
    value: VARKHUL_MASTERPIECE_UNBOUND_DAMAGE_BONUS,
    sourceId: boss.id,
    school: 'fire',
    encounterOwned: true,
  });
}

function updateMasterpieceUnbound(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  if (!st.masterpieceTriggered || st.masterpieceWipeResolved) return;
  st.masterpieceRemaining = Math.max(0, st.masterpieceRemaining - DT);
  st.masterpiecePulseTimer -= DT;
  if (st.masterpiecePulseTimer <= CAST_COMPLETE_EPS) {
    st.masterpiecePulseTimer += VARKHUL_MASTERPIECE_UNBOUND_PULSE_SECONDS;
    for (const player of players) {
      dealFractionalDamage(
        ctx,
        boss,
        player,
        VARKHUL_MASTERPIECE_UNBOUND_PULSE_MAX_HP,
        'Living Forge',
      );
    }
  }
  if (st.masterpieceRemaining <= CAST_COMPLETE_EPS) {
    st.masterpieceWipeResolved = true;
    wipeEncounter(ctx, boss, players, 'Masterpiece Unbound');
  }
}

export function resetVarkhulEncounter(ctx: SimContext, boss: Entity): void {
  for (const meta of ctx.players.values()) {
    const player = ctx.entities.get(meta.entityId);
    if (player?.kind !== 'player') continue;
    clearVarkhulEncounterAuras(player, boss.id);
  }
  clearEncounterWarnings(ctx, boss);
  ctx.despawnSummonedAdds(boss);
  boss.varkhul = undefined;
  boss.enraged = false;
  boss.damageImmune = false;
  boss.damageFloorHp = Math.ceil(boss.maxHp * VARKHUL_MASTERS_ASSEMBLY_HP_THRESHOLD);
  boss.knockbackResistance = 0;
  boss.auras = boss.auras.filter(
    (aura) =>
      aura.id !== VARKHUL_MASTERS_ASSEMBLY_AURA_ID &&
      aura.id !== VARKHUL_ASSEMBLY_STUN_AURA_ID &&
      aura.id !== VARKHUL_MASTERPIECE_UNBOUND_AURA_ID,
  );
  clearBossCast(boss);
}

function updateMajorAbility(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
  speed: number,
): boolean {
  if (st.majorAbility === 'frontal') {
    updateFrontal(ctx, boss, st, players, speed);
    return true;
  }
  if (st.majorAbility === 'cinderOrbs') {
    updateCinderOrbs(ctx, boss, st, speed);
    return true;
  }
  if (st.majorAbility === 'forgestorm') {
    updateForgestorm(ctx, boss, st, players, speed);
    return true;
  }
  if (st.majorAbility === 'anvil') {
    updateAnvilsDecree(ctx, boss, st, players, speed);
    return true;
  }
  return false;
}

export function updateVarkhulEncounter(ctx: SimContext, boss: Entity, pursueTarget = false): void {
  if (boss.templateId !== VARKHUL_BOSS_TEMPLATE_ID || boss.dead) return;
  let players = playersInEncounter(ctx, boss);
  if (players.length === 0) {
    boss.aiState = 'evade';
    if (boss.combatExitHoldUntil > ctx.time) return;
    resetVarkhulEncounter(ctx, boss);
    ctx.resetEvadingMob(boss);
    return;
  }
  const st = initVarkhulEncounter(boss);
  updateCinderFires(ctx, boss, st, players);
  updateCinderOrbProjectiles(ctx, boss, st, players);
  updateAnvilMeteors(ctx, boss, st, players);
  updateMobTarget(ctx, boss);
  let target = resolveLivingTarget(boss, players);
  if (!target) return;
  boss.aggroTargetId = target.id;
  boss.inCombat = true;
  boss.aiState = 'attack';

  if (!st.assemblyTriggered && boss.hp / boss.maxHp <= VARKHUL_MASTERS_ASSEMBLY_HP_THRESHOLD) {
    startMastersAssembly(ctx, boss, st);
  }
  if (updateMastersAssembly(ctx, boss, st, players)) return;

  if (
    !st.masterpieceTriggered &&
    boss.hp / boss.maxHp <= VARKHUL_MASTERPIECE_UNBOUND_HP_THRESHOLD
  ) {
    startMasterpieceUnbound(boss, st);
  }
  updateMasterpieceUnbound(ctx, boss, st, players);
  players = playersInEncounter(ctx, boss);
  target = resolveLivingTarget(boss, players);
  if (!target) return;

  const speed = st.masterpieceTriggered ? VARKHUL_MASTERPIECE_UNBOUND_SPEED_MULTIPLIER : 1;
  st.makersBrandTimer -= DT;
  if (st.makersBrandTimer <= CAST_COMPLETE_EPS && castMakersBrand(ctx, boss, target)) {
    st.makersBrandTimer = VARKHUL_MAKERS_BRAND_EVERY;
    players = playersInEncounter(ctx, boss);
    target = resolveLivingTarget(boss, players);
    if (!target) return;
  }

  if (updateMajorAbility(ctx, boss, st, players, speed)) return;

  st.cinderOrbsTimer -= DT * speed;
  st.frontalTimer -= DT * speed;
  st.forgestormTimer -= DT * speed;
  st.anvilTimer -= DT * speed;
  if (st.frontalTimer <= CAST_COMPLETE_EPS) {
    startFrontal(ctx, boss, st, players);
    return;
  }
  if (st.cinderOrbsTimer <= CAST_COMPLETE_EPS) {
    startCinderOrbs(ctx, boss, st, players);
    return;
  }
  if (st.forgestormTimer <= CAST_COMPLETE_EPS) {
    startForgestorm(ctx, boss, st);
    return;
  }
  if (st.anvilTimer <= CAST_COMPLETE_EPS) {
    startAnvilsDecree(ctx, boss, st);
    return;
  }

  boss.swingTimer = Math.max(0, boss.swingTimer - DT);
  tryMobMeleeSwingInRange(ctx, boss, target);
  if (!pursueTarget) return;
  const profile = mobCombatProfile(boss);
  if (dist2d(boss.pos, target.pos) > profile.desiredRange) {
    if (!ctx.isRooted(boss)) {
      ctx.moveToward(
        boss,
        target.pos,
        boss.moveSpeed * profile.chaseSpeedMult * ctx.moveSpeedMult(boss),
      );
    } else {
      boss.facing = steadyAngleTo(boss.pos, target.pos, boss.facing);
    }
  } else {
    boss.facing = steadyAngleTo(boss.pos, target.pos, boss.facing);
  }
  tryMobMeleeSwingInRange(ctx, boss, target);
  boss.aiState = dist2d(boss.pos, target.pos) <= profile.meleeRange ? 'attack' : 'chase';
}
