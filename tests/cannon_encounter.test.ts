import { describe, expect, it } from 'vitest';
import { CANNON_ACTIONS, CANNON_ENEMIES, CANNON_WAVES } from '../src/sim/content/cannon_encounter';
import {
  CANNON_COUNTDOWN_TICKS,
  CANNON_INTERMISSION_TICKS,
  CANNON_RECOVERY_TICKS,
  cannonAimValid,
  createCannonEncounter,
  fireCannon,
  tickCannonEncounter,
} from '../src/sim/minigames/cannon_encounter';
import { type CannonActionId, type CannonEncounterState, TICK_RATE } from '../src/sim/types';

const field = { minX: 0, maxX: 40, minZ: 0, maxZ: 40 };
function advance(state: CannonEncounterState, ticks: number): void {
  for (let i = 0; i < ticks; i++) tickCannonEncounter(state, field);
}
function active(): CannonEncounterState {
  const state = createCannonEncounter();
  advance(state, CANNON_COUNTDOWN_TICKS);
  return state;
}

describe('private cannon encounter', () => {
  it('starts with a three-second countdown and spawns the first group on GO', () => {
    const state = createCannonEncounter();
    expect(fireCannon(state, field, 'cannonball', { x: 20, z: 1 })).toBe(false);
    advance(state, CANNON_COUNTDOWN_TICKS - 1);
    expect(state.phase).toBe('countdown');
    expect(state.enemies).toEqual([]);
    advance(state, 1);
    expect(state.phase).toBe('wave');
    expect(state.enemies).toHaveLength(6);
    expect(state.integrity).toBe(100);
  });

  it.each([
    { x: Number.NaN, z: 1 },
    { x: 1, z: Infinity },
    { x: -0.01, z: 20 },
    { x: 20, z: 40.01 },
  ])('rejects invalid aim without consuming anything: %j', (point) => {
    const state = active();
    const before = structuredClone(state);
    expect(cannonAimValid(field, point)).toBe(false);
    expect(fireCannon(state, field, 'cannonball', point)).toBe(false);
    expect(state).toEqual(before);
  });

  it('accepts field edges and rejects prototype property names as actions', () => {
    expect(cannonAimValid(field, { x: 0, z: 40 })).toBe(true);
    const state = active();
    for (const action of ['constructor', '__proto__', 'toString', 'fireball']) {
      expect(fireCannon(state, field, action as CannonActionId, { x: 20, z: 1 })).toBe(false);
    }
    expect(state.shots).toEqual([]);
  });

  it('resolves damage after flight, never at click time, and counts each death once', () => {
    const state = active();
    expect(fireCannon(state, field, 'cannonball', { x: 20, z: 2 })).toBe(true);
    advance(state, CANNON_ACTIONS.cannonball.flightTicks - 1);
    expect(state.killed).toBe(0);
    advance(state, 1);
    expect(state.killed).toBe(6);
    expect(state.enemies).toEqual([]);
    advance(state, 20);
    expect(state.killed).toBe(6);
  });

  it('enforces both the shared recovery and independent action cooldowns', () => {
    const state = active();
    const aim = { x: 1, z: 1 };
    expect(fireCannon(state, field, 'cannonball', aim)).toBe(true);
    expect(fireCannon(state, field, 'grapeshot', aim)).toBe(false);
    advance(state, CANNON_RECOVERY_TICKS);
    expect(fireCannon(state, field, 'grapeshot', aim)).toBe(true);
    expect(fireCannon(state, field, 'cannonball', aim)).toBe(false);
    advance(state, CANNON_ACTIONS.cannonball.cooldownTicks - CANNON_RECOVERY_TICKS);
    expect(fireCannon(state, field, 'cannonball', aim)).toBe(true);
  });

  it('hits the exact radius boundary, misses just outside it, and spends missed shots', () => {
    const state = active();
    const radius = CANNON_ACTIONS.cannonball.radius;
    state.enemies = [
      { id: 900, kind: 'infantry', hp: 100, x: 20 + radius, z: 10, slowUntilTick: 0 },
      { id: 901, kind: 'infantry', hp: 100, x: 20 + radius + 0.001, z: 10, slowUntilTick: 0 },
    ];
    state.shots = [
      {
        id: 902,
        action: 'cannonball',
        x: 20,
        z: 10,
        firedTick: state.tick - 15,
        impactTick: state.tick + 1,
      },
    ];
    advance(state, 1);
    expect(state.killed).toBe(1);
    expect(state.enemies.map((enemy) => enemy.id)).toEqual([901]);
    expect(state.enemies[0].hp).toBe(100);
    expect(fireCannon(state, field, 'cannonball', { x: 0, z: 0 })).toBe(true);
    const readyAt = state.readyAt.cannonball;
    advance(state, CANNON_ACTIONS.cannonball.flightTicks);
    expect(state.killed).toBe(1);
    expect(state.readyAt.cannonball).toBe(readyAt);
    expect(fireCannon(state, field, 'cannonball', { x: 0, z: 0 })).toBe(false);
  });

  it('fails at zero integrity from ordinary troops and clears outstanding effects', () => {
    const state = active();
    state.integrity = 10;
    state.enemies[0].z = field.maxZ - 0.001;
    fireCannon(state, field, 'incendiary', { x: 0, z: 0 });
    state.fires.push({
      id: 901,
      x: 0,
      z: 0,
      nextPulseTick: state.tick + TICK_RATE,
      expiresTick: state.tick + 5 * TICK_RATE,
    });
    advance(state, 1);
    expect(state.phase).toBe('failed');
    expect(state.integrity).toBe(0);
    expect(state.breached).toBe(1);
    expect(state.shots).toEqual([]);
    expect(state.fires).toEqual([]);
  });

  it('keeps differently commanded interleaved sessions equal to their solo replays each tick', () => {
    const left = createCannonEncounter();
    const right = createCannonEncounter();
    const leftReplay = createCannonEncounter();
    const rightReplay = createCannonEncounter();
    function step(state: CannonEncounterState, action: CannonActionId): void {
      fireCannon(state, field, action, { x: 20, z: 5 });
      tickCannonEncounter(state, field);
    }
    for (let tick = 0; tick < 20 * TICK_RATE; tick++) {
      step(left, 'cannonball');
      step(right, 'grapeshot');
      step(rightReplay, 'grapeshot');
      step(leftReplay, 'cannonball');
      expect(left).toEqual(leftReplay);
      expect(right).toEqual(rightReplay);
    }
    expect(left).not.toEqual(right);
  });

  it('grapeshot slows surviving enemies by half, then restores their speed', () => {
    const state = active();
    fireCannon(state, field, 'grapeshot', { x: 20, z: 2 });
    advance(state, CANNON_ACTIONS.grapeshot.flightTicks);
    const enemy = state.enemies[0];
    expect(enemy.hp).toBe(40);
    const startZ = enemy.z;
    advance(state, TICK_RATE);
    expect(enemy.z - startZ).toBeCloseTo(CANNON_ENEMIES.infantry.speed * 0.5);
    advance(state, 2 * TICK_RATE);
    const afterSlow = enemy.z;
    advance(state, TICK_RATE);
    expect(enemy.z - afterSlow).toBeCloseTo(CANNON_ENEMIES.infantry.speed);
  });

  it('incendiary applies initial damage and exactly five one-second ground pulses', () => {
    const state = active();
    state.enemies = [{ id: 999, kind: 'commander', hp: 800, x: 20, z: 2, slowUntilTick: 0 }];
    fireCannon(state, field, 'incendiary', { x: 20, z: 4 });
    advance(state, CANNON_ACTIONS.incendiary.flightTicks);
    expect(state.enemies[0].hp).toBe(770);
    advance(state, 5 * TICK_RATE);
    expect(state.enemies[0].hp).toBe(670);
    expect(state.fires).toEqual([]);
    advance(state, TICK_RATE);
    expect(state.enemies[0].hp).toBe(670);
  });

  it('damages only cannon integrity when an enemy breaches and counts it once', () => {
    const state = active();
    state.enemies = [{ id: 999, kind: 'runner', hp: 80, x: 20, z: 39.99, slowUntilTick: 0 }];
    advance(state, 1);
    expect(state.integrity).toBe(88);
    expect(state.breached).toBe(1);
    expect(state.killed).toBe(0);
    advance(state, TICK_RATE);
    expect(state.integrity).toBe(88);
  });

  it('lets an impact at the defense line save the cannon before breach movement', () => {
    const state = active();
    state.enemies = [{ id: 999, kind: 'infantry', hp: 100, x: 20, z: 39.99, slowUntilTick: 0 }];
    state.shots = [
      {
        id: 1000,
        action: 'cannonball',
        x: 20,
        z: 40,
        firedTick: state.tick - 15,
        impactTick: state.tick + 1,
      },
    ];
    advance(state, 1);
    expect(state.integrity).toBe(100);
    expect(state.killed).toBe(1);
  });

  it('waits for the whole authored wave and inserts the full five-second gap', () => {
    const state = active();
    state.spawnCursor = CANNON_WAVES[0].length;
    state.enemies = [];
    advance(state, 1);
    expect(state.phase).toBe('intermission');
    expect(fireCannon(state, field, 'cannonball', { x: 20, z: 1 })).toBe(false);
    advance(state, CANNON_INTERMISSION_TICKS - 1);
    expect(state.wave).toBe(0);
    advance(state, 1);
    expect(state.phase).toBe('wave');
    expect(state.wave).toBe(1);
  });

  it('fails on a commander breach, never grants victory for an empty field', () => {
    const state = active();
    state.wave = 2;
    state.spawnCursor = CANNON_WAVES[2].length;
    state.enemies = [{ id: 999, kind: 'commander', hp: 1, x: 20, z: 39.999, slowUntilTick: 0 }];
    advance(state, 1);
    expect(state.phase).toBe('failed');
    expect(state.integrity).toBe(0);
    expect(state.commanderKilled).toBe(false);
    const terminal = structuredClone(state);
    advance(state, 100);
    expect(fireCannon(state, field, 'incendiary', { x: 20, z: 1 })).toBe(false);
    expect(state).toEqual(terminal);
  });

  it('runs deterministic independent sessions and can win through real firing commands', () => {
    function run(): CannonEncounterState {
      const state = createCannonEncounter();
      for (
        let tick = 0;
        tick < 240 * TICK_RATE && state.phase !== 'won' && state.phase !== 'failed';
        tick++
      ) {
        const enemy = [...state.enemies].sort((a, b) => b.z - a.z)[0];
        if (enemy) {
          const aim = { x: enemy.x, z: Math.min(field.maxZ, enemy.z + 1) };
          for (const action of ['cannonball', 'incendiary', 'grapeshot'] as const) {
            if (fireCannon(state, field, action, aim)) break;
          }
        }
        tickCannonEncounter(state, field);
      }
      return state;
    }
    const untouched = createCannonEncounter();
    const winner = run();
    expect(winner.phase).toBe('won');
    expect(winner.commanderKilled).toBe(true);
    expect(winner.killed + winner.breached).toBe(CANNON_WAVES.flat().length);
    expect(winner.tick / TICK_RATE).toBeGreaterThan(120);
    expect(winner.tick / TICK_RATE).toBeLessThan(240);
    expect(run()).toEqual(winner);
    expect(untouched).toEqual(createCannonEncounter());
    const terminal = structuredClone(winner);
    advance(winner, 100);
    expect(fireCannon(winner, field, 'cannonball', { x: 20, z: 1 })).toBe(false);
    expect(winner).toEqual(terminal);
  });
});
