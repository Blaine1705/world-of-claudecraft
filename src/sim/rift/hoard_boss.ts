import { MOBS, RIFT_REGION_HALF_X, RIFT_REGION_HALF_Z, riftInstanceOrigin } from '../data';
import { createMob } from '../entity';
import { IGNIVAR_METEOR_RADIUS, IGNIVAR_METEOR_REVEAL_DELAY_SECONDS } from '../ignivar_meteors';
import type { SimContext } from '../sim_context';
import { DT, type Entity } from '../types';
import { riftFx } from './fx';
import {
  HOARD_BRUTE_COMBO,
  HOARD_BRUTE_FACING_OFFSETS,
  HOARD_FROST_GUST,
  HOARD_TIDE_WAVE,
  type HoardBossKit,
  type HoardSweepSpec,
  hoardBossKit,
  hoardMarkSpec,
  pointInHoardAnnulus,
  pointInHoardTideWave,
} from './hoard_boss_kits';
import type { HoardBossCue, HoardBossCueVariant, HoardBossState, RiftInstance } from './types';

export { type HoardBossKit, hoardBossKit } from './hoard_boss_kits';

export const HOARD_SWEEP_RANGE = 13;
export const HOARD_SWEEP_HALF_ANGLE = Math.PI * 0.31;
export const HOARD_SWEEP_WINDUP_SEC = 2.4;
export const HOARD_SWEEP_ENRAGED_WINDUP_SEC = 2;
export const HOARD_MARK_RADIUS = 3;
export const HOARD_MARK_WINDUP_SEC = 2.1;
export const HOARD_MARK_ENRAGED_WINDUP_SEC = 1.65;
export const HOARD_MARK_HAZARD_SEC = 2;
export const HOARD_MARK_HAZARD_TICK_SEC = 0.5;
export const HOARD_SWEEP_METEOR_COUNT = 3;
export const HOARD_BONE_WAVE_COUNT = 4;
export const HOARD_BROOD_EGG_COUNT = 4;
export const HOARD_BROOD_HATCH_HP = 0.5;
export const HOARD_TOTEM_TRIGGER_HP = 0.65;
export const HOARD_TOTEM_HEAL_FRACTION = 0.025;
export const HOARD_TOTEM_PULSE_SEC = 2;
export const HOARD_ARCANE_RING_HP = 0.5;
export const HOARD_BRUTE_EXHAUSTED_SEC = 3;

const SWEEP_FIRST_SEC = 3.5;
const MARK_FIRST_SEC = 6;
export const HOARD_SWEEP_EVERY_SEC = 9;
export const HOARD_SWEEP_ENRAGED_EVERY_SEC = 6.5;
export const HOARD_MARK_EVERY_SEC = 11;
export const HOARD_MARK_ENRAGED_EVERY_SEC = 7.5;
const FROST_GUST_EVERY_SEC = 10;
const FROST_ICE_EVERY_SEC = 8;
const BRUTE_COMBO_EVERY_SEC = 11;
const ARCANE_BLIZZARD_EVERY_SEC = 9;
const STORM_EVERY_SEC = 11;
const TIDE_WAVE_EVERY_SEC = 10;
const BONE_WAVE_THRESHOLDS = [0.7, 0.35] as const;

const EMBER_SWEEP: HoardSweepSpec = {
  variant: 'ember-frontal',
  radius: HOARD_SWEEP_RANGE,
  halfAngle: HOARD_SWEEP_HALF_ANGLE,
  windup: HOARD_SWEEP_WINDUP_SEC,
  damageFraction: 0.24,
  school: 'fire',
  knockback: 0,
  ability: 'Emberforge Front',
};

export function hoardMarkTargetCount(livingPlayers: number): number {
  return Math.min(3, Math.max(0, Math.ceil(livingPlayers / 2)));
}

export function hoardMarkTargets(
  sortedLivingIds: readonly number[],
  cursor: number,
): { ids: number[]; nextCursor: number } {
  if (sortedLivingIds.length === 0) return { ids: [], nextCursor: 0 };
  const count = hoardMarkTargetCount(sortedLivingIds.length);
  const ids: number[] = [];
  for (let index = 0; index < count; index++) {
    ids.push(sortedLivingIds[(cursor + index) % sortedLivingIds.length]);
  }
  return { ids, nextCursor: (cursor + count) % sortedLivingIds.length };
}

export function pointInHoardSweep(
  origin: { x: number; z: number },
  facing: number,
  point: { x: number; z: number },
  radius = HOARD_SWEEP_RANGE,
  halfAngle = HOARD_SWEEP_HALF_ANGLE,
): boolean {
  const dx = point.x - origin.x;
  const dz = point.z - origin.z;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq > radius * radius) return false;
  if (distanceSq <= 0.0001) return true;
  const inverseDistance = 1 / Math.sqrt(distanceSq);
  const dot = (dx * Math.sin(facing) + dz * Math.cos(facing)) * inverseDistance;
  return dot >= Math.cos(halfAngle);
}

export function hoardSweepMeteorPoints(cue: {
  x: number;
  z: number;
  facing: number;
  radius: number;
  halfAngle: number;
}): Array<{ x: number; z: number }> {
  const lanes = [-0.42, 0.32, -0.08];
  const distances = [0.46, 0.7, 0.88];
  return lanes.slice(0, HOARD_SWEEP_METEOR_COUNT).map((lane, index) => {
    const angle = cue.facing + cue.halfAngle * lane;
    const distance = cue.radius * distances[index];
    return {
      x: cue.x + Math.sin(angle) * distance,
      z: cue.z + Math.cos(angle) * distance,
    };
  });
}

export function nextHoardBossMechanic(
  sweepTimer: number,
  markTimer: number,
): 'sweep' | 'mark' | null {
  if (sweepTimer > 0 && markTimer > 0) return null;
  return sweepTimer <= markTimer ? 'sweep' : 'mark';
}

export function hoardBossCueViews(inst: RiftInstance) {
  return (inst.hoardBoss?.cues ?? []).map((cue) => ({
    instanceId: inst.instanceId,
    cueId: cue.id,
    kind: cue.kind,
    variant: cue.variant,
    phase: cue.kind === 'mark' ? cue.phase : ('warning' as const),
    x: cue.x,
    z: cue.z,
    radius: cue.radius,
    remaining: cue.remaining,
    total: cue.total,
    facing: cue.kind === 'sweep' ? cue.facing : undefined,
    halfAngle: cue.kind === 'sweep' ? cue.halfAngle : undefined,
    innerRadius: cue.kind === 'mark' ? cue.innerRadius : undefined,
  }));
}

function instancePlayers(ctx: SimContext, inst: RiftInstance): Entity[] {
  const origin = riftInstanceOrigin(inst.slot, inst.floorIndex);
  const candidates =
    inst.memberIds.size > 0
      ? [...inst.memberIds]
      : [...ctx.players.values()].map((meta) => meta.entityId);
  return candidates
    .sort((a, b) => a - b)
    .map((id) => ctx.entities.get(id))
    .filter(
      (entity): entity is Entity =>
        entity !== undefined &&
        Math.abs(entity.pos.x - origin.x) <= RIFT_REGION_HALF_X &&
        Math.abs(entity.pos.z - origin.z) <= RIFT_REGION_HALF_Z,
    );
}

function emitCue(ctx: SimContext, inst: RiftInstance, cue: HoardBossCue): void {
  for (const player of instancePlayers(ctx, inst)) {
    ctx.emit({
      type: 'hoardBossCue',
      pid: player.id,
      instanceId: inst.instanceId,
      cueId: cue.id,
      kind: cue.kind,
      variant: cue.variant,
      phase: cue.kind === 'mark' ? cue.phase : 'warning',
      x: cue.x,
      z: cue.z,
      radius: cue.radius,
      durationSecs: cue.total,
      facing: cue.kind === 'sweep' ? cue.facing : undefined,
      halfAngle: cue.kind === 'sweep' ? cue.halfAngle : undefined,
      innerRadius: cue.kind === 'mark' ? cue.innerRadius : undefined,
    });
  }
}

function removeTotem(
  ctx: SimContext,
  inst: RiftInstance,
  state: HoardBossState,
  boss?: Entity,
): void {
  if (state.totemId === null) return;
  const totemId = state.totemId;
  ctx.dropEntity(state.totemId);
  inst.mobIds = inst.mobIds.filter((id) => id !== totemId);
  if (boss) boss.summonedIds = boss.summonedIds.filter((id) => id !== totemId);
  state.totemId = null;
}

function clearState(ctx: SimContext, inst: RiftInstance, boss?: Entity): void {
  if (!inst.hoardBoss) return;
  removeTotem(ctx, inst, inst.hoardBoss, boss);
  delete inst.hoardBoss;
  for (const player of instancePlayers(ctx, inst)) {
    ctx.emit({ type: 'hoardBossCueClear', pid: player.id });
  }
}

function createState(): HoardBossState {
  return {
    sweepTimer: SWEEP_FIRST_SEC,
    markTimer: MARK_FIRST_SEC,
    targetCursor: 0,
    nextCueId: 1,
    cues: [],
    sequenceStep: 0,
    sequenceTimer: 0,
    sequenceFacing: 0,
    specialTriggered: false,
    totemId: null,
    totemPulseTimer: HOARD_TOTEM_PULSE_SEC,
  };
}

function summonBoneLegion(ctx: SimContext, boss: Entity): void {
  ctx.emit({
    type: 'spellfxAt',
    x: boss.pos.x,
    z: boss.pos.z,
    school: 'shadow',
    fx: 'burst',
    ability: 'Hoard Bone Legion',
    duration: 3.2,
    sourceId: boss.id,
  });
  ctx.spawnBossAdds(boss, 'rift_bonewalker', HOARD_BONE_WAVE_COUNT);
}

function ensureBroodEggs(ctx: SimContext, inst: RiftInstance, boss: Entity): void {
  if (boss.firedSummons > 0) return;
  if (boss.summonedIds.some((id) => ctx.entities.get(id)?.templateId === 'spider_egg_sac')) return;
  const template = MOBS.spider_egg_sac;
  if (!template) return;
  for (let index = 0; index < HOARD_BROOD_EGG_COUNT; index++) {
    const angle = (index / HOARD_BROOD_EGG_COUNT) * Math.PI * 2 + Math.PI * 0.25;
    const radius = index % 2 === 0 ? 5.2 : 6.1;
    const egg = createMob(
      ctx.nextId++,
      template,
      boss.level,
      ctx.groundPos(
        boss.spawnPos.x + Math.sin(angle) * radius,
        boss.spawnPos.z + Math.cos(angle) * radius,
      ),
    );
    egg.facing = angle + Math.PI;
    egg.prevFacing = egg.facing;
    egg.damageImmune = true;
    egg.summonedAdd = true;
    ctx.addEntity(egg);
    boss.summonedIds.push(egg.id);
    inst.mobIds.push(egg.id);
  }
}

function hatchBroodEggs(ctx: SimContext, inst: RiftInstance, boss: Entity): void {
  const eggIds = boss.summonedIds.filter(
    (id) => ctx.entities.get(id)?.templateId === 'spider_egg_sac',
  );
  for (const id of eggIds) {
    const egg = ctx.entities.get(id);
    if (!egg) continue;
    riftFx(ctx, egg.pos.x, egg.pos.z, 'nature', 'burst');
    ctx.dropEntity(id);
  }
  const eggSet = new Set(eggIds);
  boss.summonedIds = boss.summonedIds.filter((id) => !eggSet.has(id));
  inst.mobIds = inst.mobIds.filter((id) => !eggSet.has(id));
  boss.firedSummons = 1;
  ctx.spawnBossAdds(boss, 'rift_spawnling', HOARD_BROOD_EGG_COUNT);
}

function removeBroodEggs(ctx: SimContext, inst: RiftInstance, boss: Entity): void {
  const eggIds = boss.summonedIds.filter(
    (id) => ctx.entities.get(id)?.templateId === 'spider_egg_sac',
  );
  if (eggIds.length === 0) return;
  const eggSet = new Set(eggIds);
  for (const id of eggIds) ctx.dropEntity(id);
  boss.summonedIds = boss.summonedIds.filter((id) => !eggSet.has(id));
  inst.mobIds = inst.mobIds.filter((id) => !eggSet.has(id));
}

function spawnHealingTideTotem(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
): void {
  const template = MOBS.hoard_healing_tide_totem;
  if (!template) return;
  const angle = boss.facing + Math.PI * 0.5;
  const totem = createMob(
    ctx.nextId++,
    template,
    boss.level,
    ctx.groundPos(boss.spawnPos.x + Math.sin(angle) * 6, boss.spawnPos.z + Math.cos(angle) * 6),
  );
  totem.summonedAdd = true;
  totem.facing = angle + Math.PI;
  totem.prevFacing = totem.facing;
  ctx.addEntity(totem);
  boss.summonedIds.push(totem.id);
  inst.mobIds.push(totem.id);
  state.totemId = totem.id;
  state.totemPulseTimer = 0.4;
  state.specialTriggered = true;
  const dx = boss.pos.x - totem.pos.x;
  const dz = boss.pos.z - totem.pos.z;
  const tether: HoardBossCue = {
    id: state.nextCueId++,
    kind: 'sweep',
    variant: 'tide-tether',
    x: totem.pos.x,
    z: totem.pos.z,
    facing: Math.atan2(dx, dz),
    radius: Math.hypot(dx, dz),
    halfAngle: 0.02,
    remaining: HOARD_TOTEM_PULSE_SEC + 0.1,
    total: HOARD_TOTEM_PULSE_SEC + 0.1,
  };
  state.cues.push(tether);
  emitCue(ctx, inst, tether);
  ctx.emit({
    type: 'spellfxAt',
    x: totem.pos.x,
    z: totem.pos.z,
    school: 'nature',
    fx: 'nova',
    ability: 'healing_wave',
    radius: 2.5,
    sourceId: totem.id,
  });
}

function tickHealingTideTotem(ctx: SimContext, boss: Entity, state: HoardBossState): void {
  if (state.totemId === null) return;
  const totem = ctx.entities.get(state.totemId);
  if (!totem || totem.dead || totem.hp <= 0) return;
  state.totemPulseTimer -= DT;
  if (state.totemPulseTimer > 0) return;
  state.totemPulseTimer += HOARD_TOTEM_PULSE_SEC;
  ctx.applyHeal(
    totem,
    boss,
    Math.max(1, Math.round(boss.maxHp * HOARD_TOTEM_HEAL_FRACTION)),
    'Healing Tide',
    null,
    false,
    false,
    false,
  );
  ctx.emit({
    type: 'spellfx',
    sourceId: totem.id,
    targetId: boss.id,
    school: 'nature',
    fx: 'projectile',
    ability: 'healing_wave',
  });
  ctx.emit({
    type: 'spellfxAt',
    x: totem.pos.x,
    z: totem.pos.z,
    school: 'frost',
    fx: 'burst',
    ability: 'healing_wave',
    radius: 4.5,
    sourceId: totem.id,
  });
}

function tickSpecialKit(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
): void {
  const kit = hoardBossKit(boss.templateId);
  const hpFraction = boss.hp / Math.max(1, boss.maxHp);
  if (kit === 'brood') {
    ensureBroodEggs(ctx, inst, boss);
    if (boss.firedSummons === 0 && hpFraction <= HOARD_BROOD_HATCH_HP)
      hatchBroodEggs(ctx, inst, boss);
    return;
  }
  if (kit === 'bone-legion') {
    while (
      boss.firedSummons < BONE_WAVE_THRESHOLDS.length &&
      hpFraction <= BONE_WAVE_THRESHOLDS[boss.firedSummons]
    ) {
      boss.firedSummons++;
      summonBoneLegion(ctx, boss);
    }
    return;
  }
  if (kit === 'tide') {
    const wavesClear = state.sequenceStep === 0 && !state.cues.some((cue) => cue.kind === 'sweep');
    if (!state.specialTriggered && hpFraction <= HOARD_TOTEM_TRIGGER_HP && wavesClear) {
      spawnHealingTideTotem(ctx, inst, boss, state);
    }
    tickHealingTideTotem(ctx, boss, state);
  }
}

function hitPlayersInTideWave(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  cue: Extract<HoardBossCue, { kind: 'sweep' }>,
): void {
  cue.hitIds ??= new Set<number>();
  for (const player of instancePlayers(ctx, inst)) {
    if (
      player.dead ||
      cue.hitIds.has(player.id) ||
      !pointInHoardTideWave(cue, cue.facing, player.pos, cue.radius, cue.remaining, cue.total)
    )
      continue;
    cue.hitIds.add(player.id);
    ctx.dealDamage(
      boss,
      player,
      Math.max(1, Math.round(player.maxHp * HOARD_TIDE_WAVE.damageFraction)),
      false,
      HOARD_TIDE_WAVE.school,
      HOARD_TIDE_WAVE.ability,
      'hit',
      true,
    );
    const waveCenter = {
      ...boss,
      pos: {
        ...boss.pos,
        x: player.pos.x - Math.sin(cue.facing),
        z: player.pos.z - Math.cos(cue.facing),
      },
    };
    ctx.applyKnockback(waveCenter, player, HOARD_TIDE_WAVE.knockback);
  }
}

function sweepSpec(cue: Extract<HoardBossCue, { kind: 'sweep' }>): HoardSweepSpec {
  if (cue.variant === 'frost-gust') return HOARD_FROST_GUST;
  if (cue.variant === 'tide-wave') return HOARD_TIDE_WAVE;
  return HOARD_BRUTE_COMBO.find((spec) => spec.variant === cue.variant) ?? EMBER_SWEEP;
}

function hitPlayersInSweep(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  cue: Extract<HoardBossCue, { kind: 'sweep' }>,
): void {
  const spec = sweepSpec(cue);
  for (const player of instancePlayers(ctx, inst)) {
    if (player.dead || !pointInHoardSweep(cue, cue.facing, player.pos, cue.radius, cue.halfAngle))
      continue;
    ctx.dealDamage(
      boss,
      player,
      Math.max(1, Math.round(player.maxHp * spec.damageFraction)),
      false,
      spec.school,
      spec.ability,
      'hit',
      true,
    );
    if (spec.knockback > 0) ctx.applyKnockback(boss, player, spec.knockback);
  }
  if (cue.variant === 'ember-frontal' || cue.variant === undefined) {
    for (const [index, impact] of hoardSweepMeteorPoints(cue).entries()) {
      ctx.emit({
        type: 'spellfxAt',
        x: impact.x,
        z: impact.z,
        school: 'fire',
        fx: 'meteorImpact',
        ability: 'Hoard Sweep',
        radius: IGNIVAR_METEOR_RADIUS,
        persistentId: `hoard-sweep:${inst.instanceId}:${cue.id}:${index}`,
        sourceId: boss.id,
      });
    }
  }
  riftFx(ctx, cue.x, cue.z, spec.school, 'nova');
}

function emitSweepMeteors(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  cue: Extract<HoardBossCue, { kind: 'sweep' }>,
): void {
  if (cue.variant !== 'ember-frontal') return;
  for (const [index, impact] of hoardSweepMeteorPoints(cue).entries()) {
    ctx.emit({
      type: 'spellfxAt',
      x: impact.x,
      z: impact.z,
      school: 'fire',
      fx: 'meteorFall',
      ability: 'Hoard Sweep',
      radius: IGNIVAR_METEOR_RADIUS,
      duration: cue.total,
      warningLead: Math.min(IGNIVAR_METEOR_REVEAL_DELAY_SECONDS, cue.total * 0.3),
      persistentId: `hoard-sweep:${inst.instanceId}:${cue.id}:${index}`,
      sourceId: boss.id,
    });
  }
}

function playerInsideMark(player: Entity, cue: Extract<HoardBossCue, { kind: 'mark' }>): boolean {
  if (cue.innerRadius !== undefined) {
    return pointInHoardAnnulus(cue, player.pos, cue.innerRadius, cue.radius);
  }
  const dx = player.pos.x - cue.x;
  const dz = player.pos.z - cue.z;
  return dx * dx + dz * dz <= cue.radius * cue.radius;
}

function hitPlayersInMark(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  cue: Extract<HoardBossCue, { kind: 'mark' }>,
  fraction: number,
): void {
  const spec = hoardMarkSpec(cue.variant ?? 'buried-mark');
  for (const player of instancePlayers(ctx, inst)) {
    if (player.dead || !playerInsideMark(player, cue)) continue;
    if (fraction > 0) {
      ctx.dealDamage(
        boss,
        player,
        Math.max(1, Math.round(player.maxHp * fraction)),
        false,
        spec.school,
        spec.ability,
        'hit',
        true,
      );
    }
    if (cue.variant === 'frost-ice') {
      ctx.applyAura(player, {
        id: `hoard_ice_${boss.id}`,
        name: 'Treacherous Ice',
        kind: 'slow',
        remaining: 1.1,
        duration: 1.1,
        value: 0.9,
        sourceId: boss.id,
        school: 'frost',
        encounterOwned: true,
      });
      const slideX = player.pos.x - player.prevPos.x;
      const slideZ = player.pos.z - player.prevPos.z;
      const slideLength = Math.hypot(slideX, slideZ);
      if (slideLength > 0.02) {
        const slideSource = {
          ...boss,
          pos: {
            ...boss.pos,
            x: player.pos.x - slideX / slideLength,
            z: player.pos.z - slideZ / slideLength,
          },
        };
        ctx.applyKnockback(slideSource, player, 0.7);
      }
    }
    if (cue.variant === 'arcane-blizzard') {
      ctx.applyAura(player, {
        id: `hoard_blizzard_${boss.id}`,
        name: 'Nyxaris Blizzard',
        kind: 'slow',
        remaining: 1.2,
        duration: 1.2,
        value: 0.7,
        sourceId: boss.id,
        school: 'frost',
        encounterOwned: true,
      });
    }
    if (cue.variant === 'arcane-ring') {
      ctx.applyRootAura(boss, player, 'Ring of Frost', 'hoard_arcane_ring', 2.2, 'frost');
    }
  }
  riftFx(ctx, cue.x, cue.z, spec.school, fraction > 0.1 ? 'nova' : 'burst');
}

function emitHazardVisual(
  ctx: SimContext,
  boss: Entity,
  cue: Extract<HoardBossCue, { kind: 'mark' }>,
): void {
  if (cue.variant === 'frost-ice' || cue.variant === 'arcane-blizzard') {
    ctx.emit({
      type: 'spellfxAt',
      x: cue.x,
      z: cue.z,
      school: 'frost',
      fx: 'snowZone',
      ability: cue.variant === 'arcane-blizzard' ? 'blizzard' : 'frost_nova',
      radius: cue.radius,
      duration: cue.total,
      sourceId: boss.id,
    });
  } else if (cue.variant === 'storm-field') {
    ctx.emit({
      type: 'spellfxAt',
      x: cue.x,
      z: cue.z,
      school: 'nature',
      fx: 'nova',
      ability: 'chain_lightning',
      radius: cue.radius,
      sourceId: boss.id,
    });
  } else if (cue.variant === 'ember-fire') {
    ctx.emit({
      type: 'spellfxAt',
      x: cue.x,
      z: cue.z,
      school: 'fire',
      fx: 'nova',
      ability: 'meteor',
      radius: cue.radius,
      sourceId: boss.id,
    });
  }
}

function finishSequence(
  state: HoardBossState,
  cue: Extract<HoardBossCue, { kind: 'sweep' }>,
): void {
  if (cue.variant?.startsWith('brute-')) {
    if (cue.variant === 'brute-long') {
      state.sequenceStep = 0;
      state.sweepTimer = BRUTE_COMBO_EVERY_SEC + HOARD_BRUTE_EXHAUSTED_SEC;
    } else {
      state.sequenceTimer = 0.22;
    }
  }
  if (cue.variant === 'tide-wave') {
    if (state.sequenceStep >= 2) {
      state.sequenceStep = 0;
      state.sweepTimer = TIDE_WAVE_EVERY_SEC;
    } else {
      state.sequenceTimer = 0.45;
    }
  }
}

function tickCues(ctx: SimContext, inst: RiftInstance, boss: Entity, state: HoardBossState): void {
  const live: HoardBossCue[] = [];
  for (const cue of state.cues) {
    cue.remaining = Math.max(0, cue.remaining - DT);
    if (cue.kind === 'sweep' && cue.variant === 'tide-tether') {
      const totem = state.totemId === null ? undefined : ctx.entities.get(state.totemId);
      if (!totem || totem.dead || totem.hp <= 0) {
        removeTotem(ctx, inst, state, boss);
        for (const player of instancePlayers(ctx, inst)) {
          ctx.emit({ type: 'hoardBossCueClear', pid: player.id });
        }
        continue;
      }
      if (cue.remaining <= 0) {
        cue.remaining = HOARD_TOTEM_PULSE_SEC + 0.1;
        cue.total = HOARD_TOTEM_PULSE_SEC + 0.1;
        emitCue(ctx, inst, cue);
      }
      live.push(cue);
      continue;
    }
    if (cue.kind === 'sweep' && cue.variant === 'tide-wave' && cue.remaining > 0) {
      hitPlayersInTideWave(ctx, inst, boss, cue);
    }
    if (cue.kind === 'mark' && cue.phase === 'hazard' && cue.remaining > 0) {
      const spec = hoardMarkSpec(cue.variant ?? 'buried-mark');
      cue.pulseTimer = (cue.pulseTimer ?? spec.pulseEvery) - DT;
      if (cue.pulseTimer <= 0) {
        hitPlayersInMark(ctx, inst, boss, cue, spec.pulseFraction);
        cue.pulseTimer += spec.pulseEvery;
      }
    }
    if (cue.remaining > 0) {
      live.push(cue);
      continue;
    }
    if (cue.kind === 'sweep') {
      if (cue.variant !== 'tide-wave') hitPlayersInSweep(ctx, inst, boss, cue);
      finishSequence(state, cue);
      continue;
    }
    if (cue.phase !== 'warning') continue;
    const spec = hoardMarkSpec(cue.variant ?? 'buried-mark');
    hitPlayersInMark(ctx, inst, boss, cue, spec.impactFraction);
    if (spec.hazardDuration <= 0) continue;
    cue.phase = 'hazard';
    cue.variant = cue.variant === 'storm-charge' ? 'storm-field' : cue.variant;
    cue.remaining = spec.hazardDuration;
    cue.total = spec.hazardDuration;
    cue.pulseTimer = spec.pulseEvery;
    emitCue(ctx, inst, cue);
    emitHazardVisual(ctx, boss, cue);
    live.push(cue);
  }
  state.cues = live;
}

function startSweep(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
  spec: HoardSweepSpec,
  facing = boss.facing,
  enraged = false,
): void {
  const duration =
    spec.variant === 'ember-frontal' && enraged ? HOARD_SWEEP_ENRAGED_WINDUP_SEC : spec.windup;
  const cue: HoardBossCue = {
    id: state.nextCueId++,
    kind: 'sweep',
    variant: spec.variant,
    x: boss.pos.x,
    z: boss.pos.z,
    facing,
    radius: spec.radius,
    halfAngle: spec.halfAngle,
    remaining: duration,
    total: duration,
    hitIds: spec.variant === 'tide-wave' ? new Set<number>() : undefined,
  };
  state.cues.push(cue);
  emitCue(ctx, inst, cue);
  emitSweepMeteors(ctx, inst, boss, cue);
  if (spec.variant === 'frost-gust') {
    const distance = spec.radius * 0.45;
    ctx.emit({
      type: 'spellfxAt',
      x: cue.x + Math.sin(facing) * distance,
      z: cue.z + Math.cos(facing) * distance,
      school: 'frost',
      fx: 'snowZone',
      ability: 'blizzard',
      radius: 7,
      duration: cue.total,
      sourceId: boss.id,
    });
  }
}

function startMarks(
  ctx: SimContext,
  inst: RiftInstance,
  livingPlayers: readonly Entity[],
  state: HoardBossState,
  variant: HoardBossCueVariant,
  maxTargets = 3,
  enraged = false,
): void {
  const selection = hoardMarkTargets(
    livingPlayers.map((player) => player.id),
    state.targetCursor,
  );
  state.targetCursor = selection.nextCursor;
  const authored = hoardMarkSpec(variant);
  const duration =
    (variant === 'buried-mark' || variant === 'ember-fire') && enraged
      ? HOARD_MARK_ENRAGED_WINDUP_SEC
      : authored.windup;
  for (const id of selection.ids.slice(0, maxTargets)) {
    const player = livingPlayers.find((candidate) => candidate.id === id);
    if (!player) continue;
    const cue: HoardBossCue = {
      id: state.nextCueId++,
      kind: 'mark',
      variant,
      phase: 'warning',
      x: player.pos.x,
      z: player.pos.z,
      radius: authored.radius,
      innerRadius: authored.innerRadius,
      remaining: duration,
      total: duration,
    };
    state.cues.push(cue);
    emitCue(ctx, inst, cue);
  }
}

function startCenteredMark(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
  variant: HoardBossCueVariant,
): void {
  const spec = hoardMarkSpec(variant);
  const cue: HoardBossCue = {
    id: state.nextCueId++,
    kind: 'mark',
    variant,
    phase: 'warning',
    x: boss.pos.x,
    z: boss.pos.z,
    radius: spec.radius,
    innerRadius: spec.innerRadius,
    remaining: spec.windup,
    total: spec.windup,
  };
  state.cues.push(cue);
  emitCue(ctx, inst, cue);
}

function tickBrute(ctx: SimContext, inst: RiftInstance, boss: Entity, state: HoardBossState): void {
  if (state.sequenceStep > 0) {
    state.sequenceTimer -= DT;
    if (state.sequenceTimer <= 0 && state.sequenceStep < HOARD_BRUTE_COMBO.length) {
      startSweep(
        ctx,
        inst,
        boss,
        state,
        HOARD_BRUTE_COMBO[state.sequenceStep],
        state.sequenceFacing + HOARD_BRUTE_FACING_OFFSETS[state.sequenceStep],
      );
      state.sequenceStep++;
    }
    return;
  }
  state.sweepTimer -= DT;
  if (state.sweepTimer > 0) return;
  state.sequenceFacing = boss.facing;
  startSweep(
    ctx,
    inst,
    boss,
    state,
    HOARD_BRUTE_COMBO[0],
    state.sequenceFacing + HOARD_BRUTE_FACING_OFFSETS[0],
  );
  state.sequenceStep = 1;
}

function tickTideWaves(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
): void {
  if (state.sequenceStep > 0) {
    state.sequenceTimer -= DT;
    if (state.sequenceTimer <= 0 && state.sequenceStep === 1) {
      startSweep(ctx, inst, boss, state, HOARD_TIDE_WAVE, state.sequenceFacing + Math.PI);
      state.sequenceStep = 2;
    }
    return;
  }
  state.sweepTimer -= DT;
  if (state.sweepTimer > 0) return;
  state.sequenceFacing = boss.facing;
  startSweep(ctx, inst, boss, state, HOARD_TIDE_WAVE, state.sequenceFacing);
  state.sequenceStep = 1;
}

function tickKit(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
  kit: HoardBossKit,
): void {
  const living = instancePlayers(ctx, inst).filter((player) => !player.dead);
  const enraged = boss.hp / Math.max(1, boss.maxHp) <= 0.3;
  if (kit === 'brute') {
    tickBrute(ctx, inst, boss, state);
    return;
  }
  if (kit === 'tide') {
    tickTideWaves(ctx, inst, boss, state);
    return;
  }
  if (
    kit === 'arcane' &&
    !state.specialTriggered &&
    boss.hp / Math.max(1, boss.maxHp) <= HOARD_ARCANE_RING_HP
  ) {
    startCenteredMark(ctx, inst, boss, state, 'arcane-ring');
    state.specialTriggered = true;
    return;
  }
  if (kit === 'storm') {
    state.markTimer -= DT;
    if (state.markTimer <= 0) {
      startCenteredMark(ctx, inst, boss, state, 'storm-charge');
      state.markTimer = STORM_EVERY_SEC;
    }
    return;
  }
  if (kit === 'arcane') {
    state.markTimer -= DT;
    if (state.markTimer <= 0 && living.length > 0) {
      startMarks(ctx, inst, living, state, 'arcane-blizzard', 1);
      state.markTimer = ARCANE_BLIZZARD_EVERY_SEC;
    }
    return;
  }
  if (kit === 'frost') {
    state.sweepTimer -= DT;
    state.markTimer -= DT;
    const mechanic = nextHoardBossMechanic(state.sweepTimer, state.markTimer);
    if (mechanic === 'sweep') {
      startSweep(ctx, inst, boss, state, HOARD_FROST_GUST);
      state.sweepTimer = FROST_GUST_EVERY_SEC;
    } else if (mechanic === 'mark' && living.length > 0) {
      startMarks(ctx, inst, living, state, 'frost-ice', 2);
      state.markTimer = FROST_ICE_EVERY_SEC;
    }
    return;
  }
  if (kit === 'ember') {
    state.sweepTimer -= DT;
    state.markTimer -= DT;
    const mechanic = nextHoardBossMechanic(state.sweepTimer, state.markTimer);
    if (mechanic === 'sweep') {
      startSweep(ctx, inst, boss, state, EMBER_SWEEP, boss.facing, enraged);
      state.sweepTimer = enraged ? HOARD_SWEEP_ENRAGED_EVERY_SEC : HOARD_SWEEP_EVERY_SEC;
    } else if (mechanic === 'mark' && living.length > 0) {
      startMarks(ctx, inst, living, state, 'ember-fire', 3, enraged);
      state.markTimer = enraged ? HOARD_MARK_ENRAGED_EVERY_SEC : HOARD_MARK_EVERY_SEC;
    }
    return;
  }
  state.markTimer -= DT;
  if (state.markTimer <= 0 && living.length > 0) {
    startMarks(ctx, inst, living, state, 'buried-mark', 3, enraged);
    state.markTimer = enraged ? HOARD_MARK_ENRAGED_EVERY_SEC : HOARD_MARK_EVERY_SEC;
  }
}

/** Tick the deterministic boss kits used only by Buried Hoards. */
export function tickHoardBossMechanics(ctx: SimContext): void {
  for (const inst of ctx.riftInstances) {
    if (!inst.vault || inst.partyKey === null || inst.bossId === null) continue;
    const boss = ctx.entities.get(inst.bossId);
    if (!boss) {
      clearState(ctx, inst);
      continue;
    }
    const kit = hoardBossKit(boss.templateId);
    if (boss.dead || boss.hp <= 0) {
      if (kit === 'brood') removeBroodEggs(ctx, inst, boss);
      clearState(ctx, inst, boss);
      continue;
    }
    if (kit === 'brood') ensureBroodEggs(ctx, inst, boss);
    const engaged = boss.aiState === 'attack' || boss.aiState === 'chase';
    if (!engaged) {
      clearState(ctx, inst, boss);
      continue;
    }
    if (!inst.hoardBoss) inst.hoardBoss = createState();
    const state = inst.hoardBoss;
    tickCues(ctx, inst, boss, state);
    tickSpecialKit(ctx, inst, boss, state);
    if (state.cues.some((cue) => cue.kind === 'sweep' || cue.phase === 'warning')) continue;
    tickKit(ctx, inst, boss, state, kit);
  }
}
