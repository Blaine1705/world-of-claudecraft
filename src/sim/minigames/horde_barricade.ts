import { Rng } from '../rng';

export const HORDE_DURATION_TICKS = 1800;
export const HORDE_COUNTDOWN_TICKS = 60;
export const HORDE_HALF_WIDTH = 8;
export const HORDE_DEPTH = 46;
export const HORDE_MAX_UNITS = 96;
export const HORDE_MAX_SHOTS = 96;
export const HORDE_MAX_PROJECTILES = 8;
export const HORDE_PROJECTILE_SPACING = 0.6;
const MOVE_PER_TICK = 0.4;
const BRUTE_HEALTH = 120;
const BOSS_HEALTH = 1800;
const SHOT_SPEED = 1.8;
export type HordeUpgrade = 'projectile' | 'haste' | 'pierce' | 'explosive' | 'double';

export interface HordeUnit {
  id: number;
  kind: 'zombie' | 'runner' | 'brute' | 'boss' | 'crate';
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  reward?: HordeUpgrade;
  choiceId?: number;
}
export interface HordeShot {
  id: number;
  x: number;
  z: number;
  age: number;
  damage: number;
  pierce: number;
}
export interface HordeResult {
  rating: 'bronze' | 'silver' | 'gold';
  kills: number;
  barrier: number;
  score: number;
}
export interface HordeState {
  phase: 'countdown' | 'active' | 'won' | 'failed';
  tick: number;
  playerX: number;
  barrier: number;
  kills: number;
  upgrade: 0 | 1 | 2 | 3;
  projectiles: number;
  haste: number;
  lastUpgrade?: { kind: HordeUpgrade; tick: number };
  units: HordeUnit[];
  shots: HordeShot[];
  result?: HordeResult;
  seed: number;
  nextId: number;
  bossSpawned: boolean;
  bossKilled: boolean;
}

export function createHordeBarricade(seed: number): HordeState {
  return {
    phase: 'countdown',
    tick: 0,
    playerX: 0,
    barrier: 100,
    kills: 0,
    upgrade: 0,
    projectiles: 1,
    haste: 0,
    units: [],
    shots: [],
    seed: seed >>> 0,
    nextId: 1,
    bossSpawned: false,
    bossKilled: false,
  };
}

function spawn(state: HordeState, kind: HordeUnit['kind'], x: number, z: number): void {
  if (state.units.length >= HORDE_MAX_UNITS) return;
  const hp =
    kind === 'boss'
      ? BOSS_HEALTH
      : kind === 'brute'
        ? BRUTE_HEALTH
        : kind === 'crate'
          ? 16
          : kind === 'runner'
            ? 4
            : 6;
  state.units.push({ id: state.nextId++, kind, x, z, hp, maxHp: hp });
}

function spawnWave(state: HordeState, elapsed: number): void {
  // Isolated per-wave streams remain serializable and never consume world RNG.
  const rng = new Rng(state.seed ^ Math.imul(elapsed + 1, 7919));
  if (elapsed <= 1760 && elapsed % 20 === 0) {
    const count = elapsed < 300 ? 4 : elapsed < 800 ? 10 : elapsed < 1300 ? 15 : 20;
    for (let i = 0; i < count; i++) {
      spawn(
        state,
        elapsed > 300 && i % 4 === 0
          ? 'runner'
          : i === 1 && elapsed > 800 && elapsed % 60 === 0
            ? 'brute'
            : 'zombie',
        elapsed < 300
          ? rng.range(-5, 5)
          : Math.max(-7.5, Math.min(7.5, (i % 2 ? -1 : 1) * rng.range(2, 7))),
        elapsed > 300 && i % 4 === 0 ? 20 + rng.range(0, 3) : HORDE_DEPTH - rng.range(0, 3),
      );
    }
  }
  if ([60, 220, 440, 600, 760, 900, 1060, 1220, 1400, 1560, 1720].includes(elapsed)) {
    state.units = state.units.filter((unit) => unit.kind !== 'crate');
    let rewards: HordeUpgrade[] =
      elapsed === 900 || elapsed === 1400
        ? ['double', 'projectile']
        : elapsed === 440 || elapsed === 1060
          ? ['pierce', 'explosive']
          : ['projectile', 'haste'];
    // A capped stat should not turn a late supply choice into an empty reward.
    if (state.projectiles >= HORDE_MAX_PROJECTILES && state.haste >= 3)
      rewards = ['pierce', 'explosive'];
    else if (
      state.projectiles >= HORDE_MAX_PROJECTILES &&
      rewards.some((reward) => reward === 'projectile' || reward === 'double')
    ) {
      rewards = [state.upgrade === 2 ? 'explosive' : 'pierce', 'haste'];
    } else if (state.haste >= 3 && rewards.includes('haste')) {
      rewards = ['projectile', state.upgrade === 2 ? 'explosive' : 'pierce'];
    }
    // The boss can be the farthest (last) actor after shot sorting. Crate
    // admission may retire ordinary crowd members, never the required boss.
    for (let i = state.units.length - 1; i >= 0 && state.units.length > HORDE_MAX_UNITS - 2; i--) {
      if (state.units[i].kind !== 'boss') state.units.splice(i, 1);
    }
    if (state.units.length > HORDE_MAX_UNITS - 2) return;
    for (let i = 0; i < rewards.length; i++) {
      spawn(state, 'crate', i === 0 ? -5 : 5, 20);
      Object.assign(state.units[state.units.length - 1], { reward: rewards[i], choiceId: elapsed });
    }
  }
  if (elapsed === 1300) {
    // Reserve admission even if a neglected crowd has reached its hard bound.
    if (state.units.length >= HORDE_MAX_UNITS) state.units.pop();
    spawn(state, 'boss', 0, 37);
    state.bossSpawned = true;
  }
}

function fire(state: HordeState, elapsed: number): void {
  const rate = 5 * (1 + state.haste * 0.25);
  if (Math.floor((elapsed * rate) / 20) === Math.floor(((elapsed - 1) * rate) / 20)) return;
  const offsets = Array.from(
    { length: state.projectiles },
    (_, i) => (i - (state.projectiles - 1) / 2) * HORDE_PROJECTILE_SPACING,
  );
  for (const offset of offsets) {
    if (state.shots.length >= HORDE_MAX_SHOTS) break;
    state.shots.push({
      id: state.nextId++,
      x: state.playerX + offset,
      z: 0.5,
      age: 0,
      damage: 8,
      pierce: state.upgrade === 2 ? 4 : 1,
    });
  }
}

function hit(state: HordeState, unit: HordeUnit, damage: number): void {
  if (unit.hp <= 0) return;
  unit.hp = Math.max(0, unit.hp - damage);
  if (unit.hp > 0) return;
  if (unit.kind === 'crate') {
    const reward = unit.reward ?? 'projectile';
    if (reward === 'projectile')
      state.projectiles = Math.min(HORDE_MAX_PROJECTILES, state.projectiles + 1);
    else if (reward === 'double')
      state.projectiles = Math.min(HORDE_MAX_PROJECTILES, state.projectiles * 2);
    else if (reward === 'haste') state.haste = Math.min(3, state.haste + 1);
    else state.upgrade = reward === 'pierce' ? 2 : 3;
    if (state.upgrade === 0 && state.projectiles > 1) state.upgrade = 1;
    state.lastUpgrade = { kind: reward, tick: state.tick };
    if (unit.choiceId !== undefined) {
      for (const other of state.units) {
        if (other.kind === 'crate' && other.choiceId === unit.choiceId) other.hp = 0;
      }
    }
  } else {
    state.kills++;
    if (unit.kind === 'boss') state.bossKilled = true;
  }
}

function advanceShots(state: HordeState): void {
  // Near-to-far order makes interception and piercing independent of spawn order.
  state.units.sort((a, b) => a.z - b.z || a.id - b.id);
  for (const shot of state.shots) {
    const from = shot.z;
    shot.z += SHOT_SPEED;
    shot.age++;
    for (const unit of state.units) {
      if (shot.pierce <= 0) break;
      if (
        unit.hp <= 0 ||
        unit.z < from ||
        unit.z >= shot.z ||
        Math.abs(unit.x - shot.x) > (unit.kind === 'boss' ? 1.7 : 1)
      )
        continue;
      hit(state, unit, shot.damage);
      shot.pierce--;
      if (state.upgrade === 3 && unit.kind !== 'crate') {
        for (const neighbor of state.units) {
          if (
            neighbor.id !== unit.id &&
            neighbor.kind !== 'crate' &&
            Math.hypot(neighbor.x - unit.x, neighbor.z - unit.z) <= 2.4
          ) {
            hit(state, neighbor, 8);
          }
        }
      }
    }
  }
  state.shots = state.shots.filter((shot) => shot.pierce > 0 && shot.z <= HORDE_DEPTH);
}

export function hordeResult(kills: number, barrier: number, won = true): HordeResult {
  const score = kills * 10 + barrier * 5;
  return {
    kills,
    barrier,
    score,
    rating:
      won && score >= 12000 && barrier >= 98
        ? 'gold'
        : won && score >= 2000 && barrier >= 35
          ? 'silver'
          : 'bronze',
  };
}

function finish(state: HordeState, won: boolean): void {
  state.phase = won ? 'won' : 'failed';
  state.result = hordeResult(state.kills, state.barrier, won);
}

/** One authoritative 20 Hz step. Horizontal is signed movement intent, not position. */
export function tickHordeBarricade(state: HordeState, horizontal: number): void {
  if (state.phase === 'won' || state.phase === 'failed') return;
  state.tick++;
  const move = Number.isFinite(horizontal) ? Math.max(-1, Math.min(1, horizontal)) : 0;
  state.playerX = Math.max(
    -HORDE_HALF_WIDTH,
    Math.min(HORDE_HALF_WIDTH, state.playerX + move * MOVE_PER_TICK),
  );
  if (state.tick <= HORDE_COUNTDOWN_TICKS) {
    if (state.tick === HORDE_COUNTDOWN_TICKS) state.phase = 'active';
    return;
  }
  const elapsed = state.tick - HORDE_COUNTDOWN_TICKS;
  spawnWave(state, elapsed);
  fire(state, elapsed);
  advanceShots(state);
  for (const unit of state.units) {
    if (unit.hp <= 0) continue;
    unit.z -=
      unit.kind === 'crate'
        ? 0.035
        : unit.kind === 'boss'
          ? 0.06
          : unit.kind === 'runner'
            ? 0.26
            : unit.kind === 'brute'
              ? 0.08
              : elapsed < 300
                ? 0.07
                : 0.12;
    if (unit.z > 0) continue;
    if (unit.kind !== 'crate') {
      state.barrier = Math.max(
        0,
        state.barrier - (unit.kind === 'boss' ? 100 : unit.kind === 'brute' ? 8 : 2),
      );
    }
    unit.hp = 0;
  }
  state.units = state.units.filter((unit) => unit.hp > 0);
  if (state.barrier <= 0) finish(state, false);
  else if (elapsed >= HORDE_DURATION_TICKS) finish(state, state.bossSpawned && state.bossKilled);
}
