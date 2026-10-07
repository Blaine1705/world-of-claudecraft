// Hunter mobility pass: Trailbreak leaps 25 yards on a 20 sec cooldown and,
// for every hunter (not only Tactical Retreat), breaks ordinary roots and
// movement slows; encounter-owned unbreakable control is left alone.
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import type { Aura, Entity } from '../src/sim/types';
import { EMPTY_TEST_WORLD } from './sim_shared';

type TestSim = Sim & { nextId: number; addEntity(entity: Entity): void };

function hunter(seed: number): TestSim {
  const sim = new Sim({
    seed,
    playerClass: 'hunter',
    autoEquip: true,
    world: EMPTY_TEST_WORLD,
  }) as TestSim;
  sim.setPlayerLevel(20);
  // A row 5 pick other than Tactical Retreat, so the escape is the base kit's.
  expect(sim.applyTalents({ spec: 'marksmanship', rows: { 5: 'hun_r5_enduring_courser' } })).toBe(
    true,
  );
  return sim;
}

function control(id: string, kind: Aura['kind'], unbreakable = false): Aura {
  return {
    id,
    name: id,
    kind,
    remaining: 10,
    duration: 10,
    value: kind === 'slow' ? 0.5 : 0,
    sourceId: 99,
    school: 'physical',
    ...(unbreakable ? { unbreakableControl: true } : {}),
  };
}

describe('Trailbreak', () => {
  it('leaps 25 yards on a 20 sec cooldown', () => {
    const sim = hunter(4501);
    const resolved = sim.resolvedAbility('trailbreak');
    expect(resolved?.cooldown).toBe(20);
    expect(resolved?.effects).toContainEqual({ type: 'hunterTrailbreak', distance: 25 });
    expect(resolved?.charges ?? 1).toBe(1);

    sim.castAbility('trailbreak');
    expect(sim.player.cooldowns.get('trailbreak')).toBe(20);
  });

  it('breaks free of roots and movement slows without Tactical Retreat', () => {
    const sim = hunter(4502);
    sim.player.auras.push(control('test_root', 'root'), control('test_slow', 'slow'));
    sim.drainEvents();

    sim.castAbility('trailbreak');

    expect(sim.player.auras.some((aura) => aura.kind === 'root')).toBe(false);
    expect(sim.player.auras.some((aura) => aura.kind === 'slow')).toBe(false);
    expect(sim.player.cooldowns.has('trailbreak')).toBe(true);
  });

  it('leaves an unbreakable encounter slow in place', () => {
    const sim = hunter(4503);
    sim.player.auras.push(control('encounter_slow', 'slow', true), control('test_slow', 'slow'));

    sim.castAbility('trailbreak');

    expect(sim.player.auras.map((aura) => aura.id)).toContain('encounter_slow');
    expect(sim.player.auras.map((aura) => aura.id)).not.toContain('test_slow');
  });

  it('is still refused by an unbreakable root, which it does not strip', () => {
    const sim = hunter(4504);
    sim.player.auras.push(control('encounter_root', 'root', true));
    sim.drainEvents();

    sim.castAbility('trailbreak');

    expect(sim.player.auras.map((aura) => aura.id)).toContain('encounter_root');
    expect(sim.player.cooldowns.has('trailbreak')).toBe(false);
  });
});
