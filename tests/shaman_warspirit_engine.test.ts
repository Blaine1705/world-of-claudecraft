import { describe, expect, it } from 'vitest';
import {
  advanceWarspiritCadence,
  applyStoneboundJolt,
  applyWarspiritPosture,
  clearWarspiritState,
  STONEBOUND_ARMOR_ID,
  STONEBOUND_DR_ID,
  STORMCAST_CHEAP_ID,
  STORMCAST_ID,
  warspiritCadence,
  warspiritPosture,
} from '../src/sim/combat/shaman_warspirit';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

function setup(): { sim: Sim; shaman: Entity; target: Entity } {
  const sim = new Sim({ seed: 2821, playerClass: 'shaman', noPlayer: true });
  const pid = sim.addPlayer('shaman', 'Engine');
  sim.setPlayerLevel(20, pid);
  expect(sim.setSpec('enhancement', pid)).toBe(true);
  const shaman = sim.entities.get(pid);
  if (!shaman) throw new Error('missing shaman');
  const target = createMob(91_021, MOBS.training_dummy, 20, sim.groundPos(0, 3));
  target.hostile = true;
  target.hp = target.maxHp = 10_000;
  sim.entities.set(target.id, target);
  sim.drainEvents();
  return { sim, shaman, target };
}

describe('Warspirit engine', () => {
  it('triggers exactly two deterministic echoes and one Stormcast at three steps', () => {
    const { sim, shaman, target } = setup();
    applyWarspiritPosture(sim.ctx, shaman, 'galeheart');
    expect(advanceWarspiritCadence(sim.ctx, shaman, target, 100)).toBe(false);
    expect(advanceWarspiritCadence(sim.ctx, shaman, target, 100)).toBe(false);
    expect(advanceWarspiritCadence(sim.ctx, shaman, target, 100)).toBe(true);
    expect(warspiritCadence(shaman)).toBe(0);
    const echoes = sim
      .drainEvents()
      .filter((event) => event.type === 'damage' && event.ability === 'Galeheart Echo');
    expect(echoes).toHaveLength(2);
    expect(echoes.map((event) => (event.type === 'damage' ? event.amount : 0))).toEqual([50, 50]);
    expect(shaman.auras.find((aura) => aura.id === STORMCAST_ID)?.duration).toBe(12);
    expect(shaman.auras.find((aura) => aura.id === STORMCAST_CHEAP_ID)?.value).toBe(0.5);
  });

  it('allows two-step overflow but at most one cadence trigger', () => {
    const { sim, shaman, target } = setup();
    applyWarspiritPosture(sim.ctx, shaman, 'galeheart');
    advanceWarspiritCadence(sim.ctx, shaman, target, 100);
    advanceWarspiritCadence(sim.ctx, shaman, target, 100, 2);
    expect(warspiritCadence(shaman)).toBe(0);
    advanceWarspiritCadence(sim.ctx, shaman, target, 100, 2);
    expect(warspiritCadence(shaman)).toBe(2);
  });

  it('makes Stonebound exclusive, forces its Jolt target, and cleans every rider', () => {
    const { sim, shaman, target } = setup();
    applyWarspiritPosture(sim.ctx, shaman, 'stonebound', 14);
    expect(warspiritPosture(shaman)).toBe('stonebound');
    expect(shaman.auras.find((aura) => aura.id === STONEBOUND_ARMOR_ID)?.value).toBe(0.3);
    expect(shaman.auras.find((aura) => aura.id === STONEBOUND_DR_ID)?.value).toBe(0.1);
    applyStoneboundJolt(sim.ctx, shaman, target);
    expect(target.forcedTargetId).toBe(shaman.id);

    clearWarspiritState(sim.ctx, shaman);
    expect(warspiritPosture(shaman)).toBeNull();
    expect(target.forcedTargetId).toBeNull();
    expect(target.forcedTargetTimer).toBe(0);
  });
});
