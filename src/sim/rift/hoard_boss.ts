import { RIFT_REGION_HALF_X, RIFT_REGION_HALF_Z, riftInstanceOrigin } from '../data';
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
  riftFx(ctx, cue.x, cue.z, 'physical', 'nova');
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
    if (!boss || boss.dead || boss.hp <= 0) {
      clearState(ctx, inst);
      continue;
    }
    const engaged = boss.aiState === 'attack' || boss.aiState === 'chase';
    if (!engaged) {
      clearState(ctx, inst);
      continue;
    }
    if (!inst.hoardBoss) inst.hoardBoss = createState();
    const state = inst.hoardBoss;
    tickCues(ctx, inst, boss, state);
    if (state.cues.some((cue) => cue.kind === 'sweep' || cue.phase === 'warning')) continue;
    state.sweepTimer -= DT;
    state.markTimer -= DT;
    const mechanic = nextHoardBossMechanic(state.sweepTimer, state.markTimer);
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
