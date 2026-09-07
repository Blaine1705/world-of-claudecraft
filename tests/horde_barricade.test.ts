import { describe, expect, it } from 'vitest';
import {
  createHordeBarricade,
  HORDE_COUNTDOWN_TICKS,
  HORDE_DURATION_TICKS,
  HORDE_MAX_PROJECTILES,
  HORDE_MAX_SHOTS,
  HORDE_MAX_UNITS,
  type HordeState,
  type HordeUnit,
  type HordeUpgrade,
  tickHordeBarricade,
} from '../src/sim/minigames/horde_barricade';

function unit(kind: HordeUnit['kind'], x: number, z: number, hp = 6, id = 9999): HordeUnit {
  return { id, kind, x, z, hp, maxHp: hp };
}

function aim(state: HordeState): number {
  const crate = state.units.find(
    (enemy) => enemy.kind === 'crate' && enemy.reward !== 'haste' && enemy.reward !== 'pierce',
  );
  const boss = state.units.find((enemy) => enemy.kind === 'boss');
  const danger = state.units.filter((enemy) => enemy.kind !== 'crate').sort((a, b) => a.z - b.z)[0];
  const target = crate ?? (danger && danger.z < 12 ? danger : (boss ?? danger));
  return target ? Math.max(-1, Math.min(1, (target.x - state.playerX) / 0.4)) : 0;
}

function play(seed: number, policy = aim): HordeState {
  const state = createHordeBarricade(seed);
  for (let i = 0; i < HORDE_COUNTDOWN_TICKS + HORDE_DURATION_TICKS; i++) {
    tickHordeBarricade(state, policy(state));
    expect(state.units.length).toBeLessThanOrEqual(HORDE_MAX_UNITS);
    expect(state.shots.length).toBeLessThanOrEqual(HORDE_MAX_SHOTS);
  }
  return state;
}

describe('horde barricade', () => {
  it('pins the shared rendering and wire pool budgets', () => {
    expect(HORDE_MAX_UNITS).toBe(96);
    expect(HORDE_MAX_SHOTS).toBe(96);
    expect(HORDE_MAX_PROJECTILES).toBe(8);
  });

  it('has a three-second countdown and clamps movement including hostile numeric input', () => {
    const state = createHordeBarricade(42);
    for (let i = 0; i < 59; i++) tickHordeBarricade(state, 100);
    expect(state.phase).toBe('countdown');
    expect(state.playerX).toBe(8);
    expect(state.units).toEqual([]);
    tickHordeBarricade(state, Number.NaN);
    expect(state.phase).toBe('active');
    expect(state.playerX).toBe(8);
    for (let i = 0; i < 60; i++) tickHordeBarricade(state, -100);
    expect(state.playerX).toBe(-8);
  });

  it('replays identical inputs byte-for-byte and changes waves with the seed', () => {
    const first = play(42);
    expect(play(42)).toEqual(first);
    expect(play(43)).not.toEqual(first);
  });

  it('lets aimed play clear the boss and earn medals across independent seeds', () => {
    for (const seed of [1, 7, 42, 1337, 998]) {
      const state = play(seed);
      expect(
        state.phase,
        JSON.stringify({ seed, result: state.result, upgrade: state.upgrade }),
      ).toBe('won');
      expect(state.tick).toBe(1860);
      expect(state.upgrade).toBeGreaterThanOrEqual(2);
      expect(state.projectiles).toBeGreaterThanOrEqual(4);
      expect(state.kills).toBeGreaterThan(200);
      expect(state.result?.score).toBe(state.kills * 10 + state.barrier * 5);
    }
  });

  it('does not award idle wins and freezes terminal results', () => {
    const state = play(42, () => 0);
    expect(state.phase).toBe('failed');
    const snapshot = structuredClone(state);
    tickHordeBarricade(state, 1);
    expect(state).toEqual(snapshot);
  });

  it('allows half-second target selection without frame-perfect reactions', () => {
    let targetX = 0;
    const state = play(42, (current) => {
      if (current.tick % 10 === 0) {
        const crate = current.units.find(
          (enemy) =>
            enemy.kind === 'crate' && enemy.reward !== 'haste' && enemy.reward !== 'pierce',
        );
        const boss = current.units.find((enemy) => enemy.kind === 'boss');
        const danger = current.units
          .filter((enemy) => enemy.kind !== 'crate')
          .sort((a, b) => a.z - b.z)[0];
        const target = crate ?? (danger && danger.z < 12 ? danger : (boss ?? danger));
        if (target) targetX = target.x;
      }
      return Math.max(-1, Math.min(1, (targetX - current.playerX) / 0.4));
    });
    expect(state.phase).toBe('won');
    expect(['silver', 'gold']).toContain(state.result?.rating);
  });

  it('missed crates expire without damage or an upgrade', () => {
    const state = createHordeBarricade(1);
    state.phase = 'active';
    state.tick = 60;
    state.units = [unit('crate', 5, 0.01, 24)];
    tickHordeBarricade(state, 0);
    expect(state.units).toEqual([]);
    expect(state.upgrade).toBe(0);
    expect(state.barrier).toBe(100);
  });

  it.each([
    ['brute', 840, 120],
    ['boss', 1300, 1800],
  ] as const)('keeps a spawned %s alive through a full upgraded volley', (kind, elapsed, hp) => {
    const state = createHordeBarricade(42);
    Object.assign(state, { phase: 'active', tick: elapsed + 59 });
    tickHordeBarricade(state, 0);
    const target = state.units.find((enemy) => enemy.kind === kind);
    expect(target?.maxHp).toBe(hp);
    if (!target) throw new Error('Missing heavy enemy');
    target.x = 0;
    target.z = 12;
    state.units = [target];
    state.shots = [];
    state.projectiles = 8;
    state.haste = 3;
    state.upgrade = 3;
    for (let i = 0; i < 10; i++) tickHordeBarricade(state, 0);
    expect(target.hp).toBeGreaterThan(0);
    expect(target.hp).toBeLessThan(hp);
  });

  it('admits the mandatory boss even when the crowd is full', () => {
    const state = createHordeBarricade(1);
    state.phase = 'active';
    state.tick = 1359;
    state.units = Array.from({ length: HORDE_MAX_UNITS }, (_, i) =>
      unit('zombie', 6, 30, 6, i + 10000),
    );
    tickHordeBarricade(state, 0);
    expect(state.bossSpawned).toBe(true);
    expect(state.units.some((enemy) => enemy.kind === 'boss')).toBe(true);
    expect(state.units).toHaveLength(HORDE_MAX_UNITS);
  });

  it.each([1400, 1560, 1720])(
    'preserves the boss when a full crowd admits the choice at %i',
    (elapsed) => {
      const state = createHordeBarricade(1);
      Object.assign(state, { phase: 'active', tick: elapsed + 59, bossSpawned: true });
      state.units = Array.from({ length: HORDE_MAX_UNITS - 1 }, (_, i) =>
        unit('zombie', 6, 20, 6, i + 10000),
      );
      state.units.push(unit('boss', 0, 37, 220, 20000));
      tickHordeBarricade(state, 0);
      expect(state.units.find((enemy) => enemy.id === 20000)?.kind).toBe('boss');
      expect(state.units.filter((enemy) => enemy.kind === 'crate')).toHaveLength(2);
      expect(state.units).toHaveLength(HORDE_MAX_UNITS);
      expect(state.bossKilled).toBe(false);
    },
  );

  it('requires destroying a supply crate and upgrades immediately without collection', () => {
    const state = createHordeBarricade(1);
    state.tick = 63;
    state.phase = 'active';
    state.units = [unit('crate', 0, 2, 8)];
    tickHordeBarricade(state, 0);
    expect(state.upgrade).toBe(1);
    expect(state.kills).toBe(0);
    state.tick = 67;
    tickHordeBarricade(state, 0);
    expect(state.shots).toHaveLength(2);
  });

  it('offers readable early alternatives and removes the sibling before a same-tick shot can collect it', () => {
    const state = createHordeBarricade(1);
    for (let i = 0; i < 140; i++) tickHordeBarricade(state, 0);
    const crates = state.units.filter((enemy) => enemy.kind === 'crate');
    expect(crates.map((crate) => crate.reward)).toEqual(['projectile', 'haste']);
    expect(crates.map((crate) => crate.x)).toEqual([-5, 5]);
    expect(crates[0].choiceId).toBe(crates[1].choiceId);
    state.units = crates;
    for (const crate of crates) {
      crate.z = 2;
      crate.hp = 8;
    }
    state.shots = crates.map((crate, i) => ({
      id: 5000 + i,
      x: crate.x,
      z: 1,
      age: 0,
      damage: 8,
      pierce: 1,
    }));
    tickHordeBarricade(state, 0);
    expect(state.projectiles).toBe(2);
    expect(state.haste).toBe(0);
    expect(state.lastUpgrade).toEqual({ kind: 'projectile', tick: 141 });
    expect(state.units).toEqual([]);
  });

  it.each([0, 1, 2, 3])(
    'fires exactly the advertised base plus 25 percent per haste rank (%i)',
    (haste) => {
      const state = createHordeBarricade(1);
      state.phase = 'active';
      state.tick = 60;
      state.haste = haste;
      let fired = 0;
      for (let i = 0; i < 80; i++) {
        tickHordeBarricade(state, 0);
        fired += state.shots.filter((shot) => shot.age === 1).length;
      }
      expect(fired).toBe(20 + haste * 5);
    },
  );

  it('doubles actual projectile count up to eight, keeps haste bounded, and changes ammo mode independently', () => {
    const state = createHordeBarricade(1);
    state.phase = 'active';
    state.tick = 60;
    const choose = (reward: HordeUpgrade) => {
      state.units = [{ ...unit('crate', 0, 2, 8), reward }];
      state.shots = [{ id: 5000, x: 0, z: 1, age: 0, damage: 8, pierce: 1 }];
      tickHordeBarricade(state, 0);
    };
    choose('projectile');
    choose('double');
    expect(state.projectiles).toBe(4);
    choose('double');
    choose('projectile');
    expect(state.projectiles).toBe(8);
    for (let i = 0; i < 4; i++) choose('haste');
    expect(state.haste).toBe(3);
    choose('pierce');
    expect(state.upgrade).toBe(2);
    choose('explosive');
    expect(state.upgrade).toBe(3);
    expect(state.projectiles).toBe(8);
  });

  it('sustains seventy projectiles per second at full power inside the hard pool budget', () => {
    const state = createHordeBarricade(1);
    Object.assign(state, { phase: 'active', tick: 60, projectiles: 8, haste: 3 });
    let fired = 0;
    for (let i = 0; i < 80; i++) {
      state.units = [];
      tickHordeBarricade(state, 0);
      fired += state.shots.filter((shot) => shot.age === 1).length;
      expect(state.shots.length).toBeLessThanOrEqual(96);
    }
    expect(fired).toBe(280);
  });

  it('replaces capped stat offers and makes double shots available before the boss', () => {
    const state = createHordeBarricade(1);
    Object.assign(state, { phase: 'active', tick: 959 });
    tickHordeBarricade(state, 0);
    expect(
      state.units.filter((enemy) => enemy.kind === 'crate').map((crate) => crate.reward),
    ).toEqual(['double', 'projectile']);
    expect(state.bossSpawned).toBe(false);
    Object.assign(state, { tick: 1619, projectiles: 8, haste: 3 });
    tickHordeBarricade(state, 0);
    expect(
      state.units.filter((enemy) => enemy.kind === 'crate').map((crate) => crate.reward),
    ).toEqual(['pierce', 'explosive']);
  });

  it('provides a fifteen-second introduction before fast flankers and supports the boss', () => {
    const state = createHordeBarricade(1);
    for (let i = 0; i < 360; i++) {
      tickHordeBarricade(state, aim(state));
      expect(state.units.some((enemy) => enemy.kind === 'runner')).toBe(false);
    }
    for (let i = 0; i < 20; i++) tickHordeBarricade(state, aim(state));
    const runner = state.units.find((enemy) => enemy.kind === 'runner');
    expect(runner?.maxHp).toBe(4);
    expect(runner?.z).toBeLessThan(24);
    state.tick = 1359;
    tickHordeBarricade(state, 0);
    expect(state.bossSpawned).toBe(true);
    expect(state.units.some((enemy) => enemy.kind === 'runner')).toBe(true);
  });

  it('pierces separate targets once and explosives damage nearby enemies', () => {
    const state = createHordeBarricade(1);
    state.phase = 'active';
    state.tick = 60;
    state.upgrade = 2;
    state.units = [unit('brute', 0, 2, 28), unit('brute', 0, 2.5, 28, 9998)];
    state.shots = [{ id: 1, x: 0, z: 1, age: 0, damage: 12, pierce: 4 }];
    tickHordeBarricade(state, 0);
    expect(state.units.map((enemy) => enemy.hp)).toEqual([16, 16]);
    tickHordeBarricade(state, 0);
    expect(state.units.map((enemy) => enemy.hp)).toEqual([16, 16]);
    state.upgrade = 3;
    state.tick = 63;
    state.units = [unit('zombie', 0, 2), unit('zombie', 2, 2, 6, 9998)];
    state.shots = [{ id: 2, x: 0, z: 1, age: 0, damage: 12, pierce: 4 }];
    tickHordeBarricade(state, 0);
    expect(state.kills).toBe(2);
    expect(state.units).toEqual([]);
  });

  it('fails on a breached barricade or a surviving boss at the deadline', () => {
    const breach = createHordeBarricade(1);
    breach.phase = 'active';
    breach.tick = 60;
    breach.barrier = 2;
    breach.units = [unit('zombie', 5, 0.01)];
    tickHordeBarricade(breach, 0);
    expect(breach.phase).toBe('failed');
    expect(breach.barrier).toBe(0);
    const timeout = createHordeBarricade(1);
    timeout.tick = 1859;
    timeout.phase = 'active';
    timeout.bossSpawned = true;
    tickHordeBarricade(timeout, 0);
    expect(timeout.phase).toBe('failed');
    expect(timeout.result?.rating).toBe('bronze');
  });

  it.each([
    [1150, 100, 'gold'],
    [200, 60, 'silver'],
    [100, 20, 'bronze'],
  ] as const)('rates %i kills and %i barrier as %s', (kills, barrier, rating) => {
    const state = createHordeBarricade(1);
    Object.assign(state, {
      tick: 1859,
      phase: 'active',
      bossSpawned: true,
      bossKilled: true,
      kills,
      barrier,
    });
    tickHordeBarricade(state, 0);
    expect(state.phase).toBe('won');
    expect(state.result?.rating).toBe(rating);
  });
});
