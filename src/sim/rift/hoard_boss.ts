import { MOBS, RIFT_REGION_HALF_X, RIFT_REGION_HALF_Z, riftInstanceOrigin } from '../data';
import { createMob } from '../entity';
import { IGNIVAR_METEOR_RADIUS, IGNIVAR_METEOR_REVEAL_DELAY_SECONDS } from '../ignivar_meteors';
import type { SimContext } from '../sim_context';
import { DT, type Entity } from '../types';
import { riftFx } from './fx';
import type { HoardBossCue, HoardBossState, RiftInstance } from './types';

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

export type HoardBossKit = 'frontal' | 'bone-legion' | 'brood';

export function hoardBossKit(templateId: string): HoardBossKit {
  if (templateId === 'rift_boss_necro') return 'bone-legion';
  if (templateId === 'rift_boss_venom') return 'brood';
  return 'frontal';
}

const SWEEP_FIRST_SEC = 3.5;
const MARK_FIRST_SEC = 6;
export const HOARD_SWEEP_EVERY_SEC = 9;
export const HOARD_SWEEP_ENRAGED_EVERY_SEC = 6.5;
export const HOARD_MARK_EVERY_SEC = 11;
export const HOARD_MARK_ENRAGED_EVERY_SEC = 7.5;

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
  if (sweepTimer <= markTimer) return 'sweep';
  return 'mark';
}

export function hoardBossCueViews(inst: RiftInstance) {
  return (inst.hoardBoss?.cues ?? []).map((cue) => ({
    instanceId: inst.instanceId,
    cueId: cue.id,
    kind: cue.kind,
    phase: cue.kind === 'mark' ? cue.phase : ('warning' as const),
    x: cue.x,
    z: cue.z,
    radius: cue.radius,
    remaining: cue.remaining,
    total: cue.total,
    facing: cue.kind === 'sweep' ? cue.facing : undefined,
    halfAngle: cue.kind === 'sweep' ? cue.halfAngle : undefined,
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
      phase: cue.kind === 'mark' ? cue.phase : 'warning',
      x: cue.x,
      z: cue.z,
      radius: cue.radius,
      durationSecs: cue.total,
      facing: cue.kind === 'sweep' ? cue.facing : undefined,
      halfAngle: cue.kind === 'sweep' ? cue.halfAngle : undefined,
    });
  }
}

function clearState(ctx: SimContext, inst: RiftInstance): void {
  if (!inst.hoardBoss) return;
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
  };
}

const BONE_WAVE_THRESHOLDS = [0.7, 0.35] as const;

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
  const existing = boss.summonedIds.some(
    (id) => ctx.entities.get(id)?.templateId === 'spider_egg_sac',
  );
  if (existing) return;
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

function tickSpecialKit(ctx: SimContext, inst: RiftInstance, boss: Entity): void {
  const kit = hoardBossKit(boss.templateId);
  if (kit === 'brood') {
    ensureBroodEggs(ctx, inst, boss);
    if (boss.firedSummons === 0 && boss.hp / Math.max(1, boss.maxHp) <= HOARD_BROOD_HATCH_HP) {
      hatchBroodEggs(ctx, inst, boss);
    }
    return;
  }
  if (kit !== 'bone-legion') return;
  const hpFraction = boss.hp / Math.max(1, boss.maxHp);
  while (
    boss.firedSummons < BONE_WAVE_THRESHOLDS.length &&
    hpFraction <= BONE_WAVE_THRESHOLDS[boss.firedSummons]
  ) {
    boss.firedSummons++;
    summonBoneLegion(ctx, boss);
  }
}

function hitPlayersInSweep(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  cue: Extract<HoardBossCue, { kind: 'sweep' }>,
): void {
  for (const player of instancePlayers(ctx, inst)) {
    if (player.dead || !pointInHoardSweep(cue, cue.facing, player.pos, cue.radius, cue.halfAngle)) {
      continue;
    }
    ctx.dealDamage(
      boss,
      player,
      Math.max(1, Math.round(player.maxHp * 0.24)),
      false,
      'physical',
      'Hoard Sweep',
      'hit',
      true,
    );
  }
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
  riftFx(ctx, cue.x, cue.z, 'physical', 'nova');
}

function emitSweepMeteors(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  cue: Extract<HoardBossCue, { kind: 'sweep' }>,
): void {
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

function hitPlayersInMark(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  cue: Extract<HoardBossCue, { kind: 'mark' }>,
  fraction: number,
): void {
  for (const player of instancePlayers(ctx, inst)) {
    if (player.dead) continue;
    const dx = player.pos.x - cue.x;
    const dz = player.pos.z - cue.z;
    if (dx * dx + dz * dz > cue.radius * cue.radius) continue;
    ctx.dealDamage(
      boss,
      player,
      Math.max(1, Math.round(player.maxHp * fraction)),
      false,
      'physical',
      'Buried Mark',
      'hit',
      true,
    );
  }
  riftFx(ctx, cue.x, cue.z, 'physical', 'burst');
}

function tickCues(ctx: SimContext, inst: RiftInstance, boss: Entity, state: HoardBossState): void {
  const live: HoardBossCue[] = [];
  for (const cue of state.cues) {
    cue.remaining = Math.max(0, cue.remaining - DT);
    if (cue.kind === 'mark' && cue.phase === 'hazard' && cue.remaining > 0) {
      cue.pulseTimer = (cue.pulseTimer ?? HOARD_MARK_HAZARD_TICK_SEC) - DT;
      if (cue.pulseTimer <= 0) {
        hitPlayersInMark(ctx, inst, boss, cue, 0.03);
        cue.pulseTimer += HOARD_MARK_HAZARD_TICK_SEC;
      }
    }
    if (cue.remaining > 0) {
      live.push(cue);
      continue;
    }
    if (cue.kind === 'sweep') {
      hitPlayersInSweep(ctx, inst, boss, cue);
      continue;
    }
    if (cue.phase === 'warning') {
      hitPlayersInMark(ctx, inst, boss, cue, 0.18);
      cue.phase = 'hazard';
      cue.remaining = HOARD_MARK_HAZARD_SEC;
      cue.total = HOARD_MARK_HAZARD_SEC;
      cue.pulseTimer = HOARD_MARK_HAZARD_TICK_SEC;
      emitCue(ctx, inst, cue);
      live.push(cue);
    }
  }
  state.cues = live;
}

function startSweep(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
  enraged: boolean,
): void {
  const duration = enraged ? HOARD_SWEEP_ENRAGED_WINDUP_SEC : HOARD_SWEEP_WINDUP_SEC;
  const cue: HoardBossCue = {
    id: state.nextCueId++,
    kind: 'sweep',
    x: boss.pos.x,
    z: boss.pos.z,
    facing: boss.facing,
    radius: HOARD_SWEEP_RANGE,
    halfAngle: HOARD_SWEEP_HALF_ANGLE,
    remaining: duration,
    total: duration,
  };
  state.cues.push(cue);
  emitCue(ctx, inst, cue);
  emitSweepMeteors(ctx, inst, boss, cue);
}

function startMarks(
  ctx: SimContext,
  inst: RiftInstance,
  livingPlayers: readonly Entity[],
  state: HoardBossState,
  enraged: boolean,
): void {
  const selection = hoardMarkTargets(
    livingPlayers.map((player) => player.id),
    state.targetCursor,
  );
  state.targetCursor = selection.nextCursor;
  const duration = enraged ? HOARD_MARK_ENRAGED_WINDUP_SEC : HOARD_MARK_WINDUP_SEC;
  for (const id of selection.ids) {
    const player = livingPlayers.find((candidate) => candidate.id === id);
    if (!player) continue;
    const cue: HoardBossCue = {
      id: state.nextCueId++,
      kind: 'mark',
      phase: 'warning',
      x: player.pos.x,
      z: player.pos.z,
      radius: HOARD_MARK_RADIUS,
      remaining: duration,
      total: duration,
    };
    state.cues.push(cue);
    emitCue(ctx, inst, cue);
  }
}

/** Tick the simple, repeatable boss kit used only by Buried Hoards. */
export function tickHoardBossMechanics(ctx: SimContext): void {
  for (const inst of ctx.riftInstances) {
    if (!inst.vault || inst.partyKey === null || inst.bossId === null) continue;
    const boss = ctx.entities.get(inst.bossId);
    if (!boss) {
      clearState(ctx, inst);
      continue;
    }
    if (boss.dead || boss.hp <= 0) {
      if (hoardBossKit(boss.templateId) === 'brood') removeBroodEggs(ctx, inst, boss);
      clearState(ctx, inst);
      continue;
    }
    if (hoardBossKit(boss.templateId) === 'brood') ensureBroodEggs(ctx, inst, boss);
    const engaged = boss.aiState === 'attack' || boss.aiState === 'chase';
    if (!engaged) {
      clearState(ctx, inst);
      continue;
    }
    if (!inst.hoardBoss) inst.hoardBoss = createState();
    const state = inst.hoardBoss;
    tickCues(ctx, inst, boss, state);
    tickSpecialKit(ctx, inst, boss);
    if (state.cues.some((cue) => cue.kind === 'sweep' || cue.phase === 'warning')) continue;
    const kit = hoardBossKit(boss.templateId);
    if (kit === 'frontal') state.sweepTimer -= DT;
    state.markTimer -= DT;
    const mechanic =
      kit === 'frontal'
        ? nextHoardBossMechanic(state.sweepTimer, state.markTimer)
        : state.markTimer <= 0
          ? 'mark'
          : null;
    if (!mechanic) continue;
    const enraged = boss.hp / Math.max(1, boss.maxHp) <= 0.3;
    if (mechanic === 'sweep') {
      startSweep(ctx, inst, boss, state, enraged);
      state.sweepTimer = enraged ? HOARD_SWEEP_ENRAGED_EVERY_SEC : HOARD_SWEEP_EVERY_SEC;
      continue;
    }
    const living = instancePlayers(ctx, inst).filter((player) => !player.dead);
    if (living.length > 0) startMarks(ctx, inst, living, state, enraged);
    state.markTimer = enraged ? HOARD_MARK_ENRAGED_EVERY_SEC : HOARD_MARK_EVERY_SEC;
  }
}
