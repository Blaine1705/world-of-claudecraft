// Abyssal Maw's TENTACLES OF THE ABYSS (the Buried Hoard tide boss), the
// authoritative half: when they rise and where, that each is a real mob the
// party can kill, which attack each makes and at whom, whom it hits, that a
// telegraph is only ever laid where its targets can still get out, and that
// nothing outlives the fight. Counts, clocks, hitboxes and the escape check are
// pure and shared with the renderer (hoard_tentacles_core.ts).
//
// State rides HoardBossState.tentacles; what the client needs rides ordinary
// hoard cues (the variants are listed in the core). Every tentacle cue is a
// SWEEP, so the boss engine's busy gate holds his Crashing Tide back while a
// tentacle stands: the floor asks one thing of the party at a time. Draws no rng.

import { MOBS } from '../data';
import { createMob } from '../entity';
import type { SimContext } from '../sim_context';
import { DT, type Entity } from '../types';
import { measureHoardRoom } from './hoard_room';
import {
  HOARD_DOUBLE_MECHANIC_INTENSITY,
  hoardIntensity,
  hoardMechanicDamage,
  hoardPressure,
} from './hoard_scaling';
import {
  HOARD_TENTACLE_TEMPLATE,
  hasEscape,
  isTentacleVariant,
  pointInWhip,
  SWEEP_TOTAL_SEC,
  sweepPasses,
  sweepProgress,
  TENTACLE_TOTAL_SEC,
  TENTACLES,
  type TentacleAttack,
  type TentacleTelegraph,
  tentacleAttackKind,
  tentacleCount,
  tentacleHealth,
  tentacleOffsets,
  WHIP_TOTAL_SEC,
} from './hoard_tentacles_core';
import { capRiftNonLethalMechanicDamage } from './ranks';
import type { HoardBossCue, HoardBossState, RiftInstance } from './types';

export const HOARD_TENTACLES_ABILITY = 'Tentacles of the Abyss';
export const HOARD_TENTACLE_WHIP_ABILITY = 'Abyssal Lash';
export const HOARD_TENTACLE_SWEEP_ABILITY = 'Drowning Sweep';

/** Cadence, counted from when the last set is gone. The hoard's rarity presses
 *  it like every other boss's clock. */
export const TENTACLES_FIRST_SEC = 16;
export const TENTACLES_EVERY_SEC = 26;

interface LiveAttack {
  cueId: number;
  kind: TentacleAttack;
  facing: number;
  direction: 1 | -1;
  struck: boolean;
  progress: number;
  hit: Set<number>;
}

interface Tentacle {
  index: number;
  cueId: number;
  entityId: number | null;
  x: number;
  z: number;
  erupted: boolean;
  falling: boolean;
  attackTimer: number;
  attacks: number;
  attack: LiveAttack | null;
}

export interface HoardTentacleState {
  timer: number;
  tentacles: Tentacle[];
  /** Seconds until a second telegraph may join a live one (double patterns). */
  stagger: number;
}

type Emit = (ctx: SimContext, inst: RiftInstance, cue: HoardBossCue) => void;
type SweepCue = Extract<HoardBossCue, { kind: 'sweep' }>;

export function isTentacleCue(cue: HoardBossCue): boolean {
  return isTentacleVariant(cue.variant);
}

function tentacleState(state: HoardBossState): HoardTentacleState {
  state.tentacles ??= { timer: TENTACLES_FIRST_SEC, tentacles: [], stagger: 0 };
  return state.tentacles;
}

function findCue(state: HoardBossState, id: number): HoardBossCue | undefined {
  for (const cue of state.cues) if (cue.id === id) return cue;
  return undefined;
}

function withdraw(ctx: SimContext, inst: RiftInstance, cue: HoardBossCue, emit: Emit): void {
  // A zero-length cue clears its mirror on every client, now.
  cue.remaining = 0;
  cue.total = 0;
  emit(ctx, inst, cue);
}

function rise(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
  living: number,
  emit: Emit,
): void {
  const held = tentacleState(state);
  const pressure = hoardPressure(inst.vault);
  const count = tentacleCount(living, pressure.extra);
  const room = measureHoardRoom(
    inst,
    boss,
    TENTACLES.wallMargin + 2,
    TENTACLES.maxBossDistance + TENTACLES.wallMargin,
  );
  const offsets = tentacleOffsets(count, state.nextCueId, room.halfWidth, room.clearDepth);
  held.tentacles = [];
  held.stagger = 0;
  for (let index = 0; index < offsets.length; index++) {
    const at = ctx.groundPos(
      boss.pos.x + offsets[index].x,
      boss.pos.z + room.forwardSign * offsets[index].f,
    );
    const cue: SweepCue = {
      id: state.nextCueId++,
      kind: 'sweep',
      variant: 'tide-tentacle',
      x: at.x,
      z: at.z,
      // It rises facing him, and leans out over the room from there.
      facing: Math.atan2(boss.pos.x - at.x, boss.pos.z - at.z),
      radius: TENTACLES.eruptRadius,
      halfAngle: index,
      remaining: TENTACLE_TOTAL_SEC,
      total: TENTACLE_TOTAL_SEC,
    };
    state.cues.push(cue);
    emit(ctx, inst, cue);
    held.tentacles.push({
      index,
      cueId: cue.id,
      entityId: null,
      x: at.x,
      z: at.z,
      erupted: false,
      falling: false,
      // Out of step with each other from the first.
      attackTimer: TENTACLES.firstAttackSec + index * TENTACLES.doubleStaggerSec,
      attacks: 0,
      attack: null,
    });
  }
  ctx.emit({
    type: 'spellfxAt',
    x: boss.pos.x,
    z: boss.pos.z,
    school: 'shadow',
    fx: 'burst',
    ability: HOARD_TENTACLES_ABILITY,
    duration: TENTACLES.spawnWarningSec,
    sourceId: boss.id,
  });
  ctx.emit({
    type: 'log',
    text: `${boss.name} calls tentacles up from the abyss. Cut them down!`,
    color: '#7fd6c8',
    entityId: boss.id,
  });
}

function erupt(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  tentacle: Tentacle,
  count: number,
  players: readonly Entity[],
): void {
  tentacle.erupted = true;
  ctx.emit({
    type: 'spellfxAt',
    x: tentacle.x,
    z: tentacle.z,
    school: 'shadow',
    fx: 'burst',
    ability: HOARD_TENTACLES_ABILITY,
    radius: TENTACLES.eruptRadius,
    sourceId: boss.id,
  });
  const from = { ...boss, pos: { ...boss.pos, x: tentacle.x, z: tentacle.z } };
  for (const player of players) {
    if (player.dead) continue;
    if (Math.hypot(player.pos.x - tentacle.x, player.pos.z - tentacle.z) > TENTACLES.eruptRadius)
      continue;
    ctx.dealDamage(
      boss,
      player,
      capRiftNonLethalMechanicDamage(
        hoardMechanicDamage(inst, player, TENTACLES.eruptDamageFraction),
        player.maxHp,
      ),
      false,
      'shadow',
      HOARD_TENTACLES_ABILITY,
      'hit',
      true,
    );
    // Thrown off the ground it broke. applyKnockback reads only its source's `pos`.
    ctx.applyKnockback(from, player, TENTACLES.eruptKnockback);
  }
  const template = MOBS[HOARD_TENTACLE_TEMPLATE];
  if (!template) return;
  const mob = createMob(ctx.nextId++, template, boss.level, ctx.groundPos(tentacle.x, tentacle.z));
  mob.maxHp = tentacleHealth(boss.maxHp, count);
  mob.hp = mob.maxHp;
  mob.summonedAdd = true;
  mob.facing = Math.atan2(boss.pos.x - tentacle.x, boss.pos.z - tentacle.z);
  mob.prevFacing = mob.facing;
  ctx.addEntity(mob);
  boss.summonedIds.push(mob.id);
  inst.mobIds.push(mob.id);
  tentacle.entityId = mob.id;
}

function dropTentacleEntity(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity | undefined,
  tentacle: Tentacle,
): void {
  if (tentacle.entityId === null) return;
  const id = tentacle.entityId;
  tentacle.entityId = null;
  // Whoever was attacking it is left targeting nothing, never a removed entity
  // (the convention of freeRiftFloorEntities in runs.ts).
  for (const meta of ctx.players.values()) {
    const player = ctx.entities.get(meta.entityId);
    if (player && player.targetId === id) player.targetId = null;
  }
  if (ctx.entities.has(id)) ctx.dropEntity(id);
  inst.mobIds = inst.mobIds.filter((entry) => entry !== id);
  if (boss) boss.summonedIds = boss.summonedIds.filter((entry) => entry !== id);
}

/** Killed, or out of time: its cue becomes the fall, and an attack it had not
 *  finished goes with it (one already landed is left to fade). */
function fall(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
  tentacle: Tentacle,
  killed: boolean,
  emit: Emit,
): void {
  tentacle.falling = true;
  const attack = tentacle.attack;
  if (attack && !attack.struck) {
    const cue = findCue(state, attack.cueId);
    if (cue) withdraw(ctx, inst, cue, emit);
  }
  tentacle.attack = null;
  const held = findCue(state, tentacle.cueId);
  if (held && held.kind === 'sweep') {
    held.variant = 'tide-tentacle-fall';
    held.halfAngle = killed ? 1 : 0;
    held.remaining = TENTACLES.retractSec;
    held.total = TENTACLES.retractSec;
    emit(ctx, inst, held);
  }
  if (killed) {
    ctx.emit({
      type: 'spellfxAt',
      x: tentacle.x,
      z: tentacle.z,
      school: 'shadow',
      fx: 'burst',
      ability: HOARD_TENTACLES_ABILITY,
      radius: 2.5,
      sourceId: boss.id,
    });
  }
  dropTentacleEntity(ctx, inst, boss, tentacle);
}

function telegraphOf(tentacle: Tentacle, attack: LiveAttack): TentacleTelegraph {
  return { kind: attack.kind, x: tentacle.x, z: tentacle.z, facing: attack.facing };
}

function nearest(tentacle: Tentacle, living: readonly Entity[]): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Number.POSITIVE_INFINITY;
  // `living` is id-sorted (instancePlayers sorts): a tie goes to the lower id.
  for (const player of living) {
    const d = Math.hypot(player.pos.x - tentacle.x, player.pos.z - tentacle.z);
    if (d < bestD) {
      bestD = d;
      best = player;
    }
  }
  return best;
}

/** Try to begin this tentacle's next attack. Returns whether a telegraph went down. */
function beginAttack(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
  held: HoardTentacleState,
  tentacle: Tentacle,
  living: readonly Entity[],
  emit: Emit,
): boolean {
  const target = nearest(tentacle, living);
  if (!target) return false;
  const range = Math.hypot(target.pos.x - tentacle.x, target.pos.z - tentacle.z);
  const live: Array<{ tentacle: Tentacle; attack: LiveAttack }> = [];
  for (const other of held.tentacles) {
    if (other.attack && findCue(state, other.attack.cueId))
      live.push({ tentacle: other, attack: other.attack });
  }
  const double = hoardIntensity(inst.vault, living.length) >= HOARD_DOUBLE_MECHANIC_INTENSITY;
  if (live.length >= (double ? 2 : 1)) return false;
  if (live.length === 1 && held.stagger > 0) return false;
  let kind = tentacleAttackKind(tentacle.index, tentacle.attacks);
  // A double pattern is one of each, never two of the same.
  if (live.length === 1) kind = live[0].attack.kind === 'whip' ? 'sweep' : 'whip';
  // A sweep with nobody near is a wasted turn: it lashes out instead (unless the
  // double rule forbids it, in which case it waits).
  if (kind === 'sweep' && range > TENTACLES.sweepRadius + 1.5) {
    if (live.length === 1) return false;
    kind = 'whip';
  }
  if (kind === 'whip' && range > TENTACLES.whipLength + 3) return false;
  const facing = Math.atan2(target.pos.x - tentacle.x, target.pos.z - tentacle.z);
  const attack: LiveAttack = {
    cueId: -1,
    kind,
    facing,
    direction: (tentacle.index + tentacle.attacks) % 4 < 2 ? 1 : -1,
    struck: false,
    progress: 0,
    hit: new Set(),
  };
  // SAFE SPACE: with this telegraph down beside every live one, everyone still
  // has open ground within reach. Otherwise it waits.
  const telegraphs = live.map((entry) => telegraphOf(entry.tentacle, entry.attack));
  telegraphs.push(telegraphOf(tentacle, attack));
  for (const player of living) {
    if (!hasEscape(player.pos.x, player.pos.z, telegraphs)) return false;
  }
  const total = kind === 'whip' ? WHIP_TOTAL_SEC : SWEEP_TOTAL_SEC;
  const cue: SweepCue = {
    id: state.nextCueId++,
    kind: 'sweep',
    variant: kind === 'whip' ? 'tide-whip' : 'tide-sweep',
    x: tentacle.x,
    z: tentacle.z,
    facing,
    radius: kind === 'whip' ? TENTACLES.whipLength : attack.direction * TENTACLES.sweepRadius,
    halfAngle: kind === 'whip' ? TENTACLES.whipHalfWidth : TENTACLES.sweepArmHalfAngle,
    remaining: total,
    total,
  };
  attack.cueId = cue.id;
  state.cues.push(cue);
  emit(ctx, inst, cue);
  tentacle.attack = attack;
  tentacle.attacks++;
  held.stagger = TENTACLES.doubleStaggerSec;
  ctx.emit({
    type: 'spellfxAt',
    x: tentacle.x,
    z: tentacle.z,
    school: 'shadow',
    fx: 'burst',
    ability: kind === 'whip' ? HOARD_TENTACLE_WHIP_ABILITY : HOARD_TENTACLE_SWEEP_ABILITY,
    duration: kind === 'whip' ? TENTACLES.whipTelegraphSec : TENTACLES.sweepTelegraphSec,
    sourceId: boss.id,
  });
  return true;
}

function strike(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  tentacle: Tentacle,
  player: Entity,
  kind: TentacleAttack,
): void {
  ctx.dealDamage(
    boss,
    player,
    capRiftNonLethalMechanicDamage(
      hoardMechanicDamage(
        inst,
        player,
        kind === 'whip' ? TENTACLES.whipDamageFraction : TENTACLES.sweepDamageFraction,
      ),
      player.maxHp,
    ),
    false,
    'shadow',
    kind === 'whip' ? HOARD_TENTACLE_WHIP_ABILITY : HOARD_TENTACLE_SWEEP_ABILITY,
    'hit',
    true,
  );
  ctx.applyKnockback(
    { ...boss, pos: { ...boss.pos, x: tentacle.x, z: tentacle.z } },
    player,
    kind === 'whip' ? TENTACLES.whipKnockback : TENTACLES.sweepKnockback,
  );
}

function tickAttack(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
  tentacle: Tentacle,
  living: readonly Entity[],
): void {
  const attack = tentacle.attack;
  if (!attack) return;
  const cue = findCue(state, attack.cueId);
  if (!cue) {
    tentacle.attack = null;
    return;
  }
  // Decimal second timers must fire on their exact fixed-step boundary.
  const elapsed = cue.total - cue.remaining + 1e-8;
  if (attack.kind === 'whip') {
    if (attack.struck || elapsed < TENTACLES.whipTelegraphSec) return;
    attack.struck = true;
    ctx.emit({
      type: 'spellfxAt',
      x: tentacle.x + Math.sin(attack.facing) * TENTACLES.whipLength * 0.5,
      z: tentacle.z + Math.cos(attack.facing) * TENTACLES.whipLength * 0.5,
      school: 'shadow',
      fx: 'burst',
      ability: HOARD_TENTACLE_WHIP_ABILITY,
      radius: TENTACLES.whipHalfWidth * 2,
      sourceId: boss.id,
    });
    for (const player of living) {
      if (pointInWhip(tentacle.x, tentacle.z, attack.facing, player.pos.x, player.pos.z))
        strike(ctx, inst, boss, tentacle, player, 'whip');
    }
    return;
  }
  const progress = sweepProgress(elapsed);
  if (progress <= attack.progress) return;
  for (const player of living) {
    if (attack.hit.has(player.id)) continue;
    if (
      !sweepPasses(
        tentacle.x,
        tentacle.z,
        attack.facing,
        attack.direction,
        attack.progress,
        progress,
        player.pos.x,
        player.pos.z,
      )
    )
      continue;
    // Once per sweep: an arm that catches you has passed you.
    attack.hit.add(player.id);
    strike(ctx, inst, boss, tentacle, player, 'sweep');
  }
  attack.progress = progress;
  attack.struck = progress >= 1;
}

/** One tick of the tide kit's tentacle clock. Called only while he is engaged. */
export function tickHoardTentacles(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity,
  state: HoardBossState,
  players: readonly Entity[],
  emit: Emit,
): void {
  const held = tentacleState(state);
  const living = players.filter((p) => !p.dead);
  if (held.tentacles.length === 0) {
    held.timer -= DT;
    if (held.timer > 0 || living.length === 0) return;
    // Only into a clean room, and never into the middle of a set of his waves.
    if (state.cues.length > 0 || state.sequenceStep !== 0) return;
    rise(ctx, inst, boss, state, living.length, emit);
    return;
  }
  held.stagger = Math.max(0, held.stagger - DT);
  const count = held.tentacles.length;
  const interval = TENTACLES.attackIntervalSec / hoardPressure(inst.vault).speed;
  const standing: Tentacle[] = [];
  for (const tentacle of held.tentacles) {
    const cue = findCue(state, tentacle.cueId);
    // Its fall has played out (or its cue was cleared from under it).
    if (!cue) {
      dropTentacleEntity(ctx, inst, boss, tentacle);
      continue;
    }
    standing.push(tentacle);
    if (tentacle.falling) continue;
    const elapsed = cue.total - cue.remaining + 1e-8;
    if (!tentacle.erupted) {
      if (elapsed < TENTACLES.spawnWarningSec) continue;
      erupt(ctx, inst, boss, tentacle, count, players);
    }
    const mob = tentacle.entityId === null ? undefined : ctx.entities.get(tentacle.entityId);
    if (!mob || mob.dead || mob.hp <= 0) {
      fall(ctx, inst, boss, state, tentacle, true, emit);
      continue;
    }
    tickAttack(ctx, inst, boss, state, tentacle, living);
    if (cue.remaining <= DT + 1e-8) {
      // Left standing too long: it goes back under on its own.
      if (!tentacle.attack) fall(ctx, inst, boss, state, tentacle, false, emit);
      else cue.remaining = DT * 2;
      continue;
    }
    if (tentacle.attack) continue;
    tentacle.attackTimer -= DT;
    if (tentacle.attackTimer > 0) continue;
    // No new attack it could not finish before it goes under.
    if (cue.remaining < SWEEP_TOTAL_SEC + 0.5) continue;
    tentacle.attackTimer = beginAttack(ctx, inst, boss, state, held, tentacle, living, emit)
      ? interval
      : TENTACLES.retrySec;
  }
  held.tentacles = standing;
  if (standing.length === 0) held.timer = TENTACLES_EVERY_SEC * hoardPressure(inst.vault).cadence;
}

/** A tentacle cue's tick. The module above owns every beat; a cue only has to
 *  say whether it still lives. */
export function tickHoardTentacleCue(cue: HoardBossCue): boolean {
  return cue.remaining > 1e-8;
}

/** The fight reset or ended: the tentacles go with it (the cues already went). */
export function clearHoardTentacles(
  ctx: SimContext,
  inst: RiftInstance,
  boss: Entity | undefined,
  state: HoardBossState,
): void {
  const held = state.tentacles;
  if (held) for (const tentacle of held.tentacles) dropTentacleEntity(ctx, inst, boss, tentacle);
  delete state.tentacles;
}
