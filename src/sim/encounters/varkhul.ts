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
  VARKHUL_ASSEMBLY_FORGE_LOCAL_POS,
  VARKHUL_ASSEMBLY_FORGE_MAX_HP,
  VARKHUL_ASSEMBLY_RUNE_COUNT,
  VARKHUL_ASSEMBLY_RUNE_OWNER_RADIUS,
  VARKHUL_ASSEMBLY_STUN_DAMAGE_TAKEN_BONUS,
  VARKHUL_ASSEMBLY_STUN_SECONDS,
  varkhulAssemblyRounds,
  varkhulAssemblyRuneSlots,
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
import {
  VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS,
  VARKHUL_FORGE_BEAM_COUNT,
  VARKHUL_FORGE_BEAM_WARMUP_SECONDS,
  VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS,
  VARKHUL_FORGE_MELTDOWN_TICK_SECONDS,
  varkhulForgeBeamAssignments,
  varkhulForgeBeamBlockDamageMaxHp,
  varkhulForgeBeamExposureResetSeconds,
  varkhulForgeBeamOverheatAfterTick,
  varkhulForgeMeltdownInitialDamageMaxHp,
  varkhulForgeMeltdownTickDamageMaxHp,
} from '../varkhul_forge_beams';
import {
  activeVarkhulForgePortalTelegraphs,
  VARKHUL_FORGE_ADD_WAVE_EVERY_SECONDS,
  VARKHUL_FORGE_FINAL_BEAM_SECONDS,
  VARKHUL_FORGE_FINAL_GAP_SECONDS,
  VARKHUL_FORGE_FINAL_HP_THRESHOLD,
  VARKHUL_FORGE_INTERMISSION_HP_THRESHOLD,
  VARKHUL_FORGE_PORTAL_ABILITY_ID,
  VARKHUL_FORGE_PORTAL_LOCAL_POSITIONS,
  VARKHUL_FORGE_PORTAL_TELEGRAPH_SECONDS,
  VARKHUL_FORGE_TEACHING_BEAM_SECONDS,
  VARKHUL_FORGE_TEACHING_GAP_SECONDS,
  VARKHUL_FORGE_TEACHING_HP_THRESHOLD,
  VARKHUL_WORK_FACING,
  VARKHUL_WORK_LOCAL_POS,
  varkhulForgeBeamIsActive,
  varkhulForgeBeamWindowMask,
  varkhulForgeIntermissionSeconds,
  varkhulForgeIntermissionWave,
  varkhulForgeIntermissionWaveCount,
} from '../varkhul_forge_intermission';
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
import {
  VARKHUL_INTERCEPT_BEAM_CAST_ID,
  VARKHUL_INTERCEPT_BEAM_CAST_SECONDS,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_AURA_ID,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_DAMAGE_TAKEN,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_NAME,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_SECONDS,
  VARKHUL_INTERCEPT_BEAM_EVERY_SECONDS,
  VARKHUL_INTERCEPT_BEAM_FIRST_SECONDS,
  varkhulInterceptBeamBlocker,
  varkhulInterceptBeamDamageMaxHp,
} from '../varkhul_intercept_beam';

export { VARKHUL_BOSS_ID } from '../ignivar_raid_ids';
export { VARKHUL_FORGE_PORTAL_ABILITY_ID } from '../varkhul_forge_intermission';
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
export const VARKHUL_FORGE_LOCAL_POS = VARKHUL_ASSEMBLY_FORGE_LOCAL_POS;

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
export const VARKHUL_FORGE_BEAM_ABILITY_ID = 'Crucible Beam';
export const VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID = 'varkhul_crucible_exposure';
export const VARKHUL_FORGE_MELTDOWN_ABILITY_ID = 'Forge Meltdown';
export const VARKHUL_ASSEMBLY_REPAIR_HEAL_MAX_HP = 0.15;
export const VARKHUL_HEROIC_LINK_WARDEN_DELAY_SECONDS = 2;

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

export {
  VARKHUL_INTERCEPT_BEAM_CAST_ID,
  VARKHUL_INTERCEPT_BEAM_CAST_SECONDS,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_AURA_ID,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_DAMAGE_TAKEN,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_NAME,
  VARKHUL_INTERCEPT_BEAM_DEBUFF_SECONDS,
  VARKHUL_INTERCEPT_BEAM_EVERY_SECONDS,
  VARKHUL_INTERCEPT_BEAM_FIRST_SECONDS,
} from '../varkhul_intercept_beam';

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
      interceptBeamTimer: VARKHUL_INTERCEPT_BEAM_FIRST_SECONDS,
      interceptBeamCastKey: 0,
      interceptBeamCastRemaining: 0,
      interceptBeamTargetId: null,
      interceptBeamBlockerId: null,
      majorAbility: 'none',
      assemblyTriggered: false,
      assemblyRuneDifficulty: 'normal',
      assemblyPhase: 'done',
      assemblyAddIds: [],
      assemblyLinkAddIds: [],
      assemblyLinkWardenIdsByWave: [],
      assemblyLinkWardenSpawns: [],
      assemblyRemaining: 0,
      assemblyWipeResolved: false,
      assemblyDroppedAddIds: [],
      assemblyCores: [],
      assemblyForgeHp: VARKHUL_ASSEMBLY_FORGE_MAX_HP,
      assemblyForgeOverheat: 0,
      forgeBeamWindow: 'idle',
      forgeBeamWindowRemaining: 0,
      forgeBeamTeachingTriggered: false,
      forgeBeamFinalTriggered: false,
      forgeHeatWarningMask: 0,
      assemblyForgeBeamActiveMask: 0,
      assemblyForgeBeamWarmupRemaining: 0,
      assemblyForgeBeamBlockerIds: Array.from({ length: VARKHUL_FORGE_BEAM_COUNT }, () => null),
      assemblyForgeBeamDamageTimers: Array.from(
        { length: VARKHUL_FORGE_BEAM_COUNT },
        () => VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS,
      ),
      assemblyForgeMeltdownRemaining: 0,
      assemblyForgeMeltdownTickTimer: VARKHUL_FORGE_MELTDOWN_TICK_SECONDS,
      assemblyPortalSpawns: [],
      assemblyNextWaveIndex: 0,
      assemblyNextWaveRemaining: 0,
      assemblyIntermissionWaves: 0,
      assemblyDeliveryWindowRemaining: 0,
      assemblyDeliveredCoreIds: [],
      assemblyArtificerRepaired: false,
      assemblyFixateTargetId: null,
      assemblyRuneCenter: null,
      assemblyRuneAssignments: [],
      assemblyRuneAngles: [],
      assemblyRuneControls: [],
      assemblyRuneControlHoldSeconds: [],
      assemblyRuneAlignmentHoldSeconds: [],
      assemblyRuneRescuerIds: [],
      assemblyRuneUnavailablePlayerIds: [],
      assemblyRuneSlots: Array.from({ length: VARKHUL_ASSEMBLY_RUNE_COUNT }, (_, symbol) => symbol),
      assemblyRuneLayoutKey: boss.varkhulAssemblyAttempt ?? 0,
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
        aura.id !== VARKHUL_ASSEMBLY_LINK_AURA_ID &&
        aura.id !== VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID &&
        aura.id !== VARKHUL_INTERCEPT_BEAM_DEBUFF_AURA_ID) ||
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
  st.interceptBeamCastRemaining = 0;
  st.interceptBeamTargetId = null;
  st.interceptBeamBlockerId = null;
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

function temperedWoundActive(player: Entity, bossId: number): boolean {
  return player.auras.some(
    (aura) =>
      aura.id === VARKHUL_INTERCEPT_BEAM_DEBUFF_AURA_ID &&
      aura.sourceId === bossId &&
      aura.remaining > CAST_COMPLETE_EPS,
  );
}

function applyTemperedWound(ctx: SimContext, boss: Entity, target: Entity): void {
  const existing = target.auras.find(
    (aura) => aura.id === VARKHUL_INTERCEPT_BEAM_DEBUFF_AURA_ID && aura.sourceId === boss.id,
  );
  if (existing) {
    existing.remaining = VARKHUL_INTERCEPT_BEAM_DEBUFF_SECONDS;
    existing.duration = VARKHUL_INTERCEPT_BEAM_DEBUFF_SECONDS;
    existing.value = VARKHUL_INTERCEPT_BEAM_DEBUFF_DAMAGE_TAKEN;
    ctx.emit({ type: 'aura', targetId: target.id, name: existing.name, gained: true });
    return;
  }
  ctx.applyAura(target, {
    id: VARKHUL_INTERCEPT_BEAM_DEBUFF_AURA_ID,
    name: VARKHUL_INTERCEPT_BEAM_DEBUFF_NAME,
    kind: 'vuln_source',
    remaining: VARKHUL_INTERCEPT_BEAM_DEBUFF_SECONDS,
    duration: VARKHUL_INTERCEPT_BEAM_DEBUFF_SECONDS,
    value: VARKHUL_INTERCEPT_BEAM_DEBUFF_DAMAGE_TAKEN,
    sourceId: boss.id,
    school: 'fire',
    encounterOwned: true,
  });
}

function startInterceptBeam(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  const tanks = tankIds(ctx, boss);
  const nonTanks = players.filter((player) => !player.dead && !tanks.has(player.id));
  const unscarred = nonTanks.filter((player) => !temperedWoundActive(player, boss.id));
  const pool =
    unscarred.length > 0
      ? unscarred
      : nonTanks.length > 0
        ? nonTanks
        : players.filter((player) => !player.dead);
  if (pool.length === 0) {
    st.interceptBeamTimer = 2;
    return;
  }
  st.interceptBeamCastKey++;
  const target = pool[st.interceptBeamCastKey % pool.length];
  st.majorAbility = 'interceptBeam';
  st.interceptBeamTimer = VARKHUL_INTERCEPT_BEAM_EVERY_SECONDS;
  st.interceptBeamCastRemaining = VARKHUL_INTERCEPT_BEAM_CAST_SECONDS;
  st.interceptBeamTargetId = target.id;
  st.interceptBeamBlockerId =
    varkhulInterceptBeamBlocker(boss.pos, target.pos, target.id, players)?.blockerId ?? null;
  boss.facing = steadyAngleTo(boss.pos, target.pos, boss.facing);
  boss.castingAbility = VARKHUL_INTERCEPT_BEAM_CAST_ID;
  boss.castTotal = VARKHUL_INTERCEPT_BEAM_CAST_SECONDS;
  boss.castRemaining = VARKHUL_INTERCEPT_BEAM_CAST_SECONDS;
  boss.castTargetId = target.id;
  boss.castAim = { ...target.pos };
  boss.channeling = false;
}

function releaseInterceptBeam(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): void {
  const target = players.find((player) => player.id === st.interceptBeamTargetId && !player.dead);
  if (target) {
    const hit = varkhulInterceptBeamBlocker(boss.pos, target.pos, target.id, players);
    const victim = hit
      ? players.find((player) => player.id === hit.blockerId && !player.dead)
      : target;
    if (victim) {
      const difficulty = encounterInstance(ctx, boss)?.difficulty ?? 'normal';
      dealFractionalDamage(
        ctx,
        boss,
        victim,
        varkhulInterceptBeamDamageMaxHp(difficulty, hit !== null),
        VARKHUL_INTERCEPT_BEAM_CAST_ID,
      );
      if (!victim.dead) applyTemperedWound(ctx, boss, victim);
      ctx.emit({
        type: 'spellfxAt',
        x: victim.pos.x,
        z: victim.pos.z,
        school: 'fire',
        fx: 'burst',
        sourceId: boss.id,
        radius: 2.4,
        ability: VARKHUL_INTERCEPT_BEAM_CAST_ID,
      });
    }
  }
  st.interceptBeamCastRemaining = 0;
  st.interceptBeamTargetId = null;
  st.interceptBeamBlockerId = null;
  st.majorAbility = 'none';
  clearBossCast(boss);
}

function updateInterceptBeam(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
  speed: number,
): void {
  const target = players.find((player) => player.id === st.interceptBeamTargetId && !player.dead);
  if (!target) {
    st.interceptBeamTimer = Math.min(st.interceptBeamTimer, 4);
    st.interceptBeamCastRemaining = 0;
    st.interceptBeamTargetId = null;
    st.interceptBeamBlockerId = null;
    st.majorAbility = 'none';
    clearBossCast(boss);
    return;
  }
  const hit = varkhulInterceptBeamBlocker(boss.pos, target.pos, target.id, players);
  st.interceptBeamBlockerId = hit?.blockerId ?? null;
  st.interceptBeamCastRemaining = Math.max(0, st.interceptBeamCastRemaining - DT * speed);
  boss.facing = steadyAngleTo(boss.pos, target.pos, boss.facing);
  boss.castingAbility = VARKHUL_INTERCEPT_BEAM_CAST_ID;
  boss.castRemaining = st.interceptBeamCastRemaining;
  boss.castTargetId = target.id;
  boss.castAim = { ...target.pos };
  if (st.interceptBeamCastRemaining <= CAST_COMPLETE_EPS) {
    releaseInterceptBeam(ctx, boss, st, players);
  }
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

function varkhulWorkWorldPosition(ctx: SimContext, boss: Entity): Vec3 {
  const instance = encounterInstance(ctx, boss);
  if (!instance) return { ...boss.spawnPos };
  const origin = ctx.instanceOriginOf(instance);
  return ctx.groundPos(origin.x + VARKHUL_WORK_LOCAL_POS.x, origin.z + VARKHUL_WORK_LOCAL_POS.z);
}

function placeVarkhulAtAnvil(ctx: SimContext, boss: Entity): void {
  const work = varkhulWorkWorldPosition(ctx, boss);
  boss.pos = { ...work };
  boss.prevPos = { ...work };
  boss.facing = VARKHUL_WORK_FACING;
  boss.prevFacing = VARKHUL_WORK_FACING;
}

function startAnvilsDecree(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  st.majorAbility = 'anvil';
  st.anvilTimer = VARKHUL_ANVIL_EVERY;
  st.anvilStrikeIndex = 0;
  st.anvilMeteorCastKey++;
  st.anvilStrikeRemaining = VARKHUL_ANVILS_DECREE_STRIKE_SECONDS;
  const forge = anvilWorldPosition(ctx, boss);
  placeVarkhulAtAnvil(ctx, boss);
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
  // Portal adds belong to the encounter, not to their individual portal. They
  // must be able to cross the room to the raid without the ordinary trash
  // leash turning them around halfway through the pull.
  add.ignoreHardLeash = true;
  if (templateId === VARKHUL_CRUCIBLE_WARDEN_ID) {
    add.bigCastTimer = VARKHUL_ASSEMBLY_WARDEN_FIRST_CAST_SECONDS;
  }
  ctx.addEntity(add);
  boss.summonedIds.push(add.id);
  instance.mobIds.push(add.id);
  return add;
}

function emitVarkhulCallout(
  ctx: SimContext,
  boss: Entity,
  call: Extract<import('../types').SimEvent, { type: 'varkhulCallout' }>['call'],
): void {
  for (const player of playersInEncounter(ctx, boss, true)) {
    ctx.emit({ type: 'varkhulCallout', pid: player.id, sourceId: boss.id, call });
  }
}

function highestThreatTankTarget(
  ctx: SimContext,
  boss: Entity,
  players: readonly Entity[],
): Entity | null {
  const authoredTankIds = new Set<number>();
  for (const meta of ctx.players.values()) {
    if (meta.talentMods.role === 'tank') authoredTankIds.add(meta.entityId);
  }
  const tanks = players.filter((player) => !player.dead && authoredTankIds.has(player.id));
  const pool = tanks.length > 0 ? tanks : players.filter((player) => !player.dead);
  let best: Entity | null = null;
  let bestThreat = Number.NEGATIVE_INFINITY;
  for (const player of pool) {
    const threat = boss.threat.get(player.id) ?? (boss.aggroTargetId === player.id ? 1 : 0);
    if (threat > bestThreat || (threat === bestThreat && (best === null || player.id < best.id))) {
      best = player;
      bestThreat = threat;
    }
  }
  return best;
}

function sendAssemblyAddTowardTank(
  ctx: SimContext,
  boss: Entity,
  add: Entity,
  players: readonly Entity[],
): void {
  const target = highestThreatTankTarget(ctx, boss, players);
  add.forcedTargetId = null;
  add.forcedTargetTimer = 0;
  add.threat.clear();
  add.aggroTargetId = target?.id ?? null;
  if (!target) return;
  add.threat.set(target.id, Math.max(1, boss.threat.get(target.id) ?? 1));
  add.facing = steadyAngleTo(add.pos, target.pos, add.facing);
  const profile = mobCombatProfile(add);
  if (!ctx.isRooted(add) && dist2d(add.pos, target.pos) > profile.meleeRange) {
    ctx.moveToward(
      add,
      target.pos,
      add.moveSpeed * profile.chaseSpeedMult * ctx.moveSpeedMult(add),
    );
    add.aiState = 'chase';
  }
}

function emitForgePortalTelegraph(
  ctx: SimContext,
  boss: Entity,
  origin: { x: number; z: number },
  portalIndex: number,
  duration: number,
): void {
  const portal = VARKHUL_FORGE_PORTAL_LOCAL_POSITIONS[portalIndex];
  if (!portal) return;
  ctx.emit({
    type: 'spellfxAt',
    x: origin.x + portal.x,
    z: origin.z + portal.z,
    school: 'fire',
    fx: 'burst',
    sourceId: boss.id,
    radius: 4,
    duration,
    ability: VARKHUL_FORGE_PORTAL_ABILITY_ID,
  });
}

function retelegraphPendingForgePortals(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
): void {
  const instance = encounterInstance(ctx, boss);
  if (!instance) return;
  const origin = ctx.instanceOriginOf(instance);
  for (const telegraph of activeVarkhulForgePortalTelegraphs(boss.id, st, origin)) {
    ctx.emit(telegraph);
  }
}

function queueForgeAddWave(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  wave: number,
): void {
  const instance = encounterInstance(ctx, boss);
  if (!instance) return;
  const origin = ctx.instanceOriginOf(instance);
  const plan = varkhulForgeIntermissionWave(st.assemblyRuneDifficulty, wave);
  const telegraphedPortals = [false, false, false, false];
  for (let spawnIndex = 0; spawnIndex < plan.length; spawnIndex++) {
    const spawn = plan[spawnIndex];
    st.assemblyPortalSpawns.push({
      wave,
      spawnIndex,
      remaining: VARKHUL_FORGE_PORTAL_TELEGRAPH_SECONDS,
    });
    if (telegraphedPortals[spawn.portalIndex]) continue;
    telegraphedPortals[spawn.portalIndex] = true;
    emitForgePortalTelegraph(
      ctx,
      boss,
      origin,
      spawn.portalIndex,
      VARKHUL_FORGE_PORTAL_TELEGRAPH_SECONDS,
    );
  }
}

function updateForgeAddSpawns(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  const players = playersInEncounter(ctx, boss);
  const pending: VarkhulEncounterState['assemblyPortalSpawns'] = [];
  for (const scheduled of st.assemblyPortalSpawns) {
    const remaining = Math.max(0, scheduled.remaining - DT);
    if (remaining > CAST_COMPLETE_EPS) {
      pending.push({ ...scheduled, remaining });
      continue;
    }
    const plan = varkhulForgeIntermissionWave(st.assemblyRuneDifficulty, scheduled.wave);
    const planned = plan[scheduled.spawnIndex];
    const portal = planned ? VARKHUL_FORGE_PORTAL_LOCAL_POSITIONS[planned.portalIndex] : undefined;
    if (!planned || !portal) continue;
    const add = spawnAssemblyAdd(ctx, boss, planned.templateId, portal.x, portal.z);
    if (!add) {
      pending.push({ ...scheduled, remaining: DT });
      continue;
    }
    st.assemblyAddIds.push(add.id);
    sendAssemblyAddTowardTank(ctx, boss, add, players);
  }
  st.assemblyPortalSpawns = pending;

  if (st.assemblyNextWaveIndex >= st.assemblyIntermissionWaves) return;
  st.assemblyNextWaveRemaining = Math.max(0, st.assemblyNextWaveRemaining - DT);
  if (st.assemblyNextWaveRemaining > CAST_COMPLETE_EPS) return;
  queueForgeAddWave(ctx, boss, st, st.assemblyNextWaveIndex);
  st.assemblyNextWaveIndex++;
  st.assemblyNextWaveRemaining = VARKHUL_FORGE_ADD_WAVE_EVERY_SECONDS;
}

function startMastersAssembly(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  const difficulty = encounterInstance(ctx, boss)?.difficulty ?? 'normal';
  cancelMajorAbility(ctx, boss, st);
  st.assemblyTriggered = true;
  st.assemblyRuneDifficulty = difficulty;
  st.assemblyPhase = 'adds';
  st.assemblyRemaining = varkhulForgeIntermissionSeconds(difficulty);
  st.assemblyWipeResolved = false;
  st.assemblyDroppedAddIds = [];
  st.assemblyLinkAddIds = [];
  st.assemblyLinkWardenIdsByWave = [];
  st.assemblyLinkWardenSpawns = [];
  st.assemblyCores = [];
  st.assemblyForgeHp = VARKHUL_ASSEMBLY_FORGE_MAX_HP;
  st.forgeBeamWindow = 'intermission';
  st.forgeBeamWindowRemaining = st.assemblyRemaining;
  st.assemblyForgeBeamActiveMask = varkhulForgeBeamWindowMask('intermission');
  st.assemblyForgeBeamWarmupRemaining = VARKHUL_FORGE_BEAM_WARMUP_SECONDS;
  st.assemblyForgeBeamBlockerIds = Array.from({ length: VARKHUL_FORGE_BEAM_COUNT }, () => null);
  st.assemblyForgeBeamDamageTimers = Array.from(
    { length: VARKHUL_FORGE_BEAM_COUNT },
    () => VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS,
  );
  st.assemblyForgeMeltdownRemaining = 0;
  st.assemblyForgeMeltdownTickTimer = VARKHUL_FORGE_MELTDOWN_TICK_SECONDS;
  st.assemblyPortalSpawns = [];
  st.assemblyIntermissionWaves = varkhulForgeIntermissionWaveCount(difficulty);
  st.assemblyNextWaveIndex = 1;
  st.assemblyNextWaveRemaining = VARKHUL_FORGE_ADD_WAVE_EVERY_SECONDS;
  st.assemblyDeliveryWindowRemaining = 0;
  st.assemblyDeliveredCoreIds = [];
  st.assemblyArtificerRepaired = false;
  st.assemblyRuneCenter = null;
  st.assemblyRuneAssignments = [];
  st.assemblyRuneAngles = [];
  st.assemblyRuneControls = [];
  st.assemblyRuneControlHoldSeconds = [];
  st.assemblyRuneAlignmentHoldSeconds = [];
  st.assemblyRuneRescuerIds = [];
  st.assemblyRuneUnavailablePlayerIds = [];
  boss.varkhulAssemblyAttempt = (boss.varkhulAssemblyAttempt ?? -1) + 1;
  st.assemblyRuneLayoutKey = boss.varkhulAssemblyAttempt;
  st.assemblyLinkFireballTimer = 0;
  st.assemblyLinkFireballWave = 0;
  st.assemblyRuneRound = 0;
  st.assemblyRuneRounds = varkhulAssemblyRounds(difficulty);
  st.assemblyRuneSlots = varkhulAssemblyRuneSlots(difficulty, st.assemblyRuneLayoutKey);
  st.assemblyRuneRemaining = 0;
  st.assemblyStunRemaining = 0;
  boss.damageImmune = true;
  boss.knockbackResistance = 1;
  placeVarkhulAtAnvil(ctx, boss);
  st.assemblyAddIds = [];
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
  emitVarkhulCallout(ctx, boss, 'bothPillarsCharging');
  emitVarkhulCallout(ctx, boss, 'portalsOpening');
  queueForgeAddWave(ctx, boss, st, 0);
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
  for (const id of st.assemblyLinkAddIds) {
    const add = ctx.entities.get(id);
    if (add) clearBossCast(add);
  }
  ctx.despawnSummonedAdds(boss);
  st.assemblyAddIds = [];
  st.assemblyLinkAddIds = [];
  st.assemblyLinkWardenIdsByWave = [];
  st.assemblyLinkWardenSpawns = [];
  st.assemblyPortalSpawns = [];
  st.assemblyNextWaveIndex = 0;
  st.assemblyNextWaveRemaining = 0;
  st.assemblyIntermissionWaves = 0;
  st.assemblyRuneRescuerIds.fill(null);
  st.assemblyRuneUnavailablePlayerIds = [];
  st.forgeBeamWindow = 'idle';
  st.forgeBeamWindowRemaining = 0;
  st.assemblyForgeBeamActiveMask = 0;
  st.assemblyForgeBeamWarmupRemaining = 0;
  st.assemblyForgeBeamBlockerIds.fill(null);
  st.assemblyForgeBeamDamageTimers.fill(VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS);
  st.assemblyForgeMeltdownRemaining = 0;
  st.assemblyForgeMeltdownTickTimer = VARKHUL_FORGE_MELTDOWN_TICK_SECONDS;
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
function triggerForgeMeltdown(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
  forge: Vec3,
): void {
  const difficulty = st.assemblyRuneDifficulty;
  const resumesIntermission = st.assemblyTriggered && st.assemblyPhase === 'adds';
  cancelMajorAbility(ctx, boss, st);
  // An intermission Meltdown pauses its scheduler but never removes combatants
  // or rewards the failure by skipping planned waves. Teaching and final-burn
  // failures remain terminal beam windows without touching the future 50% floor.
  if (!resumesIntermission) {
    st.assemblyPhase = 'done';
    st.assemblyRemaining = 0;
    st.assemblyRuneRemaining = 0;
  } else if (st.assemblyRemaining <= CAST_COMPLETE_EPS) {
    st.assemblyRemaining = 0;
  }
  st.forgeBeamWindow = 'meltdown';
  st.assemblyForgeBeamActiveMask = varkhulForgeBeamWindowMask('meltdown');
  st.assemblyWipeResolved = resumesIntermission ? st.assemblyRemaining <= CAST_COMPLETE_EPS : true;
  st.assemblyForgeOverheat = 1;
  st.assemblyForgeMeltdownRemaining = VARKHUL_FORGE_MELTDOWN_DURATION_SECONDS;
  st.assemblyForgeMeltdownTickTimer = VARKHUL_FORGE_MELTDOWN_TICK_SECONDS;
  clearBossCast(boss);
  boss.aiState = 'attack';
  const damage = varkhulForgeMeltdownInitialDamageMaxHp(difficulty);
  for (const player of players) {
    if (!player.dead) {
      dealFractionalDamage(ctx, boss, player, damage, VARKHUL_FORGE_MELTDOWN_ABILITY_ID);
    }
  }
  ctx.emit({
    type: 'spellfxAt',
    x: forge.x,
    z: forge.z,
    school: 'fire',
    fx: 'meteorImpact',
    sourceId: boss.id,
    radius: VARKHUL_ASSEMBLY_RUNE_OWNER_RADIUS,
    ability: VARKHUL_FORGE_MELTDOWN_ABILITY_ID,
  });
  if (resumesIntermission) boss.aiState = 'idle';
}

function updateForgeMeltdown(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): boolean {
  if (st.assemblyForgeMeltdownRemaining <= CAST_COMPLETE_EPS) return false;
  st.assemblyForgeMeltdownRemaining = Math.max(0, st.assemblyForgeMeltdownRemaining - DT);
  st.assemblyForgeMeltdownTickTimer -= DT;
  if (st.assemblyForgeMeltdownTickTimer <= CAST_COMPLETE_EPS) {
    st.assemblyForgeMeltdownTickTimer += VARKHUL_FORGE_MELTDOWN_TICK_SECONDS;
    const damage = varkhulForgeMeltdownTickDamageMaxHp(st.assemblyRuneDifficulty);
    for (const player of players) {
      if (!player.dead) {
        dealFractionalDamage(ctx, boss, player, damage, VARKHUL_FORGE_MELTDOWN_ABILITY_ID);
      }
    }
    const forge = anvilWorldPosition(ctx, boss);
    ctx.emit({
      type: 'spellfxAt',
      x: forge.x,
      z: forge.z,
      school: 'fire',
      fx: 'nova',
      sourceId: boss.id,
      radius: 12,
      ability: VARKHUL_FORGE_MELTDOWN_ABILITY_ID,
    });
  }
  if (st.assemblyForgeMeltdownRemaining <= CAST_COMPLETE_EPS) {
    st.assemblyForgeMeltdownRemaining = 0;
    st.assemblyForgeOverheat = 0;
    if (st.assemblyTriggered && st.assemblyPhase === 'adds') {
      st.forgeBeamWindow = 'intermission';
      st.forgeBeamWindowRemaining = st.assemblyRemaining;
      st.assemblyForgeBeamActiveMask = varkhulForgeBeamWindowMask('intermission');
      st.assemblyForgeBeamWarmupRemaining = VARKHUL_FORGE_BEAM_WARMUP_SECONDS;
      emitVarkhulCallout(ctx, boss, 'bothPillarsCharging');
      emitVarkhulCallout(ctx, boss, 'portalsOpening');
      retelegraphPendingForgePortals(ctx, boss, st);
    } else {
      st.forgeBeamWindow = 'idle';
      st.forgeBeamWindowRemaining = 0;
      st.assemblyForgeBeamActiveMask = 0;
      st.assemblyForgeBeamWarmupRemaining = 0;
    }
    st.assemblyForgeBeamBlockerIds.fill(null);
    st.assemblyForgeBeamDamageTimers.fill(VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS);
  }
  // Even the terminal tick belongs wholly to Meltdown. The scheduler resumes
  // on the next fixed tick, after the fresh pillar warning has been published.
  return true;
}

function updateAssemblyForgeBeams(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
  forge: Vec3,
): boolean {
  const activeMask = st.assemblyForgeBeamActiveMask;
  const activeBeamCount =
    Number(varkhulForgeBeamIsActive(activeMask, 0)) +
    Number(varkhulForgeBeamIsActive(activeMask, 1));
  if (activeBeamCount === 0) {
    st.assemblyForgeBeamWarmupRemaining = 0;
    st.assemblyForgeBeamBlockerIds.fill(null);
    st.assemblyForgeBeamDamageTimers.fill(VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS);
    st.assemblyForgeOverheat = varkhulForgeBeamOverheatAfterTick(
      st.assemblyForgeOverheat,
      st.assemblyRuneDifficulty,
      0,
      0,
      DT,
    );
    return false;
  }
  const assignments = varkhulForgeBeamAssignments(
    forge,
    players.map((player) => ({
      id: player.id,
      x: player.pos.x,
      z: player.pos.z,
      dead: player.dead,
    })),
  );
  const previousBlockerIds = [...st.assemblyForgeBeamBlockerIds];
  st.assemblyForgeBeamBlockerIds = assignments.map((assignment) =>
    varkhulForgeBeamIsActive(activeMask, assignment.index) ? assignment.blockerId : null,
  );
  if (st.assemblyForgeBeamWarmupRemaining > CAST_COMPLETE_EPS) {
    st.assemblyForgeBeamBlockerIds.fill(null);
    const remaining = Math.max(0, st.assemblyForgeBeamWarmupRemaining - DT);
    st.assemblyForgeBeamWarmupRemaining = remaining <= CAST_COMPLETE_EPS ? 0 : remaining;
    st.assemblyForgeBeamDamageTimers.fill(VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS);
    if (st.assemblyForgeBeamWarmupRemaining === 0) {
      if (activeMask === 1) emitVarkhulCallout(ctx, boss, 'leftPillar');
      else if (activeMask === 2) emitVarkhulCallout(ctx, boss, 'rightPillar');
      else if (activeMask === 3) emitVarkhulCallout(ctx, boss, 'bothPillars');
    }
    return false;
  }

  let blockedCount = 0;
  for (const assignment of assignments) {
    const blockerId = varkhulForgeBeamIsActive(activeMask, assignment.index)
      ? assignment.blockerId
      : null;
    if (blockerId === null) {
      st.assemblyForgeBeamDamageTimers[assignment.index] =
        VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS;
      continue;
    }
    blockedCount++;
    if (previousBlockerIds[assignment.index] !== blockerId) {
      st.assemblyForgeBeamDamageTimers[assignment.index] =
        VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS;
    }
    st.assemblyForgeBeamDamageTimers[assignment.index] =
      (st.assemblyForgeBeamDamageTimers[assignment.index] ??
        VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS) - DT;
    if (st.assemblyForgeBeamDamageTimers[assignment.index] > CAST_COMPLETE_EPS) continue;
    st.assemblyForgeBeamDamageTimers[assignment.index] +=
      VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS;
    const blocker = ctx.entities.get(blockerId);
    if (blocker?.kind === 'player' && !blocker.dead) {
      const resetSeconds = varkhulForgeBeamExposureResetSeconds(st.assemblyRuneDifficulty);
      const exposure = blocker.auras.find(
        (aura) => aura.id === VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID && aura.sourceId === boss.id,
      );
      const exposureStack = (exposure?.stacks ?? 0) + 1;
      if (exposure) {
        exposure.remaining = resetSeconds;
        exposure.duration = resetSeconds;
        exposure.stacks = exposureStack;
      } else {
        ctx.applyAura(blocker, {
          id: VARKHUL_FORGE_BEAM_EXPOSURE_AURA_ID,
          name: 'Crucible Exposure',
          kind: 'vulnerability',
          remaining: resetSeconds,
          duration: resetSeconds,
          value: 0,
          stacks: exposureStack,
          sourceId: boss.id,
          school: 'fire',
          encounterOwned: true,
        });
      }
      dealFractionalDamage(
        ctx,
        boss,
        blocker,
        varkhulForgeBeamBlockDamageMaxHp(st.assemblyRuneDifficulty, exposureStack),
        VARKHUL_FORGE_BEAM_ABILITY_ID,
      );
    }
  }
  st.assemblyForgeOverheat = varkhulForgeBeamOverheatAfterTick(
    st.assemblyForgeOverheat,
    st.assemblyRuneDifficulty,
    activeBeamCount,
    blockedCount,
    DT,
  );
  if (st.assemblyForgeOverheat >= 0.75 && (st.forgeHeatWarningMask & 1) === 0) {
    st.forgeHeatWarningMask |= 1;
    emitVarkhulCallout(ctx, boss, 'heat75');
  }
  if (st.assemblyForgeOverheat >= 0.9 && (st.forgeHeatWarningMask & 2) === 0) {
    st.forgeHeatWarningMask |= 2;
    emitVarkhulCallout(ctx, boss, 'heat90');
  }
  if (st.assemblyForgeOverheat < 1) return false;
  triggerForgeMeltdown(ctx, boss, st, players, forge);
  return true;
}
function updateMastersAssembly(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): boolean {
  if (!st.assemblyTriggered || st.assemblyPhase === 'done') return false;
  const forge = anvilWorldPosition(ctx, boss);
  placeVarkhulAtAnvil(ctx, boss);
  if (st.assemblyPhase === 'stunned') {
    updateAssemblyForgeBeams(ctx, boss, st, players, forge);
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
  st.forgeBeamWindow = 'intermission';
  st.forgeBeamWindowRemaining = st.assemblyRemaining;
  st.assemblyForgeBeamActiveMask = varkhulForgeBeamWindowMask('intermission');
  if (updateAssemblyForgeBeams(ctx, boss, st, players, forge)) return true;
  updateForgeAddSpawns(ctx, boss, st);
  st.assemblyRemaining = Math.max(0, st.assemblyRemaining - DT);
  st.forgeBeamWindowRemaining = st.assemblyRemaining;
  const allWavesQueued = st.assemblyNextWaveIndex >= st.assemblyIntermissionWaves;
  const allAddsSpawned = allWavesQueued && st.assemblyPortalSpawns.length === 0;
  const liveAdds = st.assemblyAddIds.some((id) => {
    const add = ctx.entities.get(id);
    return add !== undefined && !add.dead;
  });
  if (allAddsSpawned && !liveAdds) {
    emitVarkhulCallout(ctx, boss, 'addsDefeated');
    shatterAssemblyForge(ctx, boss, st);
    return true;
  }
  if (st.assemblyRemaining <= CAST_COMPLETE_EPS && !st.assemblyWipeResolved) {
    st.assemblyWipeResolved = true;
    triggerForgeMeltdown(ctx, boss, st, players, forge);
  }
  boss.aiState = 'idle';
  return true;
}

function startForgeBeamWindow(
  st: VarkhulEncounterState,
  window: VarkhulEncounterState['forgeBeamWindow'],
  seconds: number,
): void {
  st.forgeBeamWindow = window;
  st.forgeBeamWindowRemaining = seconds;
  st.assemblyForgeBeamActiveMask = varkhulForgeBeamWindowMask(window);
  st.assemblyForgeBeamBlockerIds.fill(null);
  st.assemblyForgeBeamDamageTimers.fill(VARKHUL_FORGE_BEAM_BLOCK_DAMAGE_TICK_SECONDS);
  st.assemblyForgeBeamWarmupRemaining =
    st.assemblyForgeBeamActiveMask === 0 ? 0 : VARKHUL_FORGE_BEAM_WARMUP_SECONDS;
}

function advanceForgeBeamWindow(ctx: SimContext, boss: Entity, st: VarkhulEncounterState): void {
  switch (st.forgeBeamWindow) {
    case 'teaching_left':
      startForgeBeamWindow(st, 'teaching_gap', VARKHUL_FORGE_TEACHING_GAP_SECONDS);
      break;
    case 'teaching_gap':
      startForgeBeamWindow(st, 'teaching_right', VARKHUL_FORGE_TEACHING_BEAM_SECONDS);
      emitVarkhulCallout(ctx, boss, 'rightPillarCharging');
      break;
    case 'teaching_right':
      startForgeBeamWindow(st, 'idle', 0);
      break;
    case 'final_left':
      startForgeBeamWindow(st, 'final_gap_left', VARKHUL_FORGE_FINAL_GAP_SECONDS);
      break;
    case 'final_gap_left':
      startForgeBeamWindow(st, 'final_right', VARKHUL_FORGE_FINAL_BEAM_SECONDS);
      emitVarkhulCallout(ctx, boss, 'rightPillarCharging');
      break;
    case 'final_right':
      startForgeBeamWindow(st, 'final_gap_right', VARKHUL_FORGE_FINAL_GAP_SECONDS);
      break;
    case 'final_gap_right':
      startForgeBeamWindow(st, 'final_left', VARKHUL_FORGE_FINAL_BEAM_SECONDS);
      emitVarkhulCallout(ctx, boss, 'leftPillarCharging');
      break;
    default:
      break;
  }
}

function updateForgeBeamWindows(
  ctx: SimContext,
  boss: Entity,
  st: VarkhulEncounterState,
  players: readonly Entity[],
): boolean {
  st.assemblyRuneDifficulty = encounterInstance(ctx, boss)?.difficulty ?? 'normal';
  const hpPct = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
  if (
    !st.forgeBeamTeachingTriggered &&
    hpPct <= VARKHUL_FORGE_TEACHING_HP_THRESHOLD &&
    hpPct > VARKHUL_FORGE_INTERMISSION_HP_THRESHOLD &&
    st.majorAbility === 'none'
  ) {
    st.forgeBeamTeachingTriggered = true;
    startForgeBeamWindow(st, 'teaching_left', VARKHUL_FORGE_TEACHING_BEAM_SECONDS);
    emitVarkhulCallout(ctx, boss, 'leftPillarCharging');
  }
  if (
    !st.forgeBeamFinalTriggered &&
    hpPct <= VARKHUL_FORGE_FINAL_HP_THRESHOLD &&
    st.majorAbility === 'none'
  ) {
    st.forgeBeamFinalTriggered = true;
    startForgeBeamWindow(st, 'final_left', VARKHUL_FORGE_FINAL_BEAM_SECONDS);
    emitVarkhulCallout(ctx, boss, 'leftPillarCharging');
  }

  const forge = anvilWorldPosition(ctx, boss);
  const wasWarming = st.assemblyForgeBeamWarmupRemaining > CAST_COMPLETE_EPS;
  if (updateAssemblyForgeBeams(ctx, boss, st, players, forge)) return true;
  if (st.forgeBeamWindow === 'idle') return false;
  if (!wasWarming) {
    st.forgeBeamWindowRemaining = Math.max(0, st.forgeBeamWindowRemaining - DT);
  }
  if (st.forgeBeamWindowRemaining <= CAST_COMPLETE_EPS) advanceForgeBeamWindow(ctx, boss, st);
  return st.forgeBeamWindow.startsWith('teaching_');
}

export function updateVarkhulAssemblyAutomaton(ctx: SimContext, add: Entity): boolean {
  let boss: Entity | null = null;
  for (const entity of ctx.entities.values()) {
    if (
      entity.templateId === VARKHUL_BOSS_TEMPLATE_ID &&
      (entity.varkhul?.assemblyAddIds.includes(add.id) ||
        (entity.varkhul?.assemblyPhase === 'links' &&
          entity.varkhul.assemblyLinkAddIds.includes(add.id)))
    ) {
      boss = entity;
      break;
    }
  }
  if (!boss?.varkhul) return false;
  add.inCombat = true;
  // Sentinels use the ordinary threat driver in the new add intermission. They
  // inherit a tank target at spawn, then taunts and threat work normally.
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
  boss.facing = VARKHUL_WORK_FACING;
  boss.prevFacing = VARKHUL_WORK_FACING;
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
  if (st.majorAbility === 'interceptBeam') {
    updateInterceptBeam(ctx, boss, st, players, speed);
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
  if (updateForgeMeltdown(ctx, boss, st, players)) return;
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

  const forgeBeamWindowActive = updateForgeBeamWindows(ctx, boss, st, players);
  if (st.assemblyForgeMeltdownRemaining > CAST_COMPLETE_EPS) return;

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

  if (forgeBeamWindowActive) {
    boss.swingTimer = Math.max(0, boss.swingTimer - DT);
    tryMobMeleeSwingInRange(ctx, boss, target);
    if (pursueTarget) {
      const profile = mobCombatProfile(boss);
      if (dist2d(boss.pos, target.pos) > profile.desiredRange && !ctx.isRooted(boss)) {
        ctx.moveToward(
          boss,
          target.pos,
          boss.moveSpeed * profile.chaseSpeedMult * ctx.moveSpeedMult(boss),
        );
      }
      boss.facing = steadyAngleTo(boss.pos, target.pos, boss.facing);
      tryMobMeleeSwingInRange(ctx, boss, target);
    }
    return;
  }

  st.cinderOrbsTimer -= DT * speed;
  st.frontalTimer -= DT * speed;
  st.forgestormTimer -= DT * speed;
  st.anvilTimer -= DT * speed;
  st.interceptBeamTimer -= DT * speed;
  if (st.frontalTimer <= CAST_COMPLETE_EPS) {
    startFrontal(ctx, boss, st, players);
    return;
  }
  if (st.cinderOrbsTimer <= CAST_COMPLETE_EPS) {
    startCinderOrbs(ctx, boss, st, players);
    return;
  }
  if (st.interceptBeamTimer <= CAST_COMPLETE_EPS) {
    startInterceptBeam(ctx, boss, st, players);
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
