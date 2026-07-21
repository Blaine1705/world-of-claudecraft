import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { grantDevotion } from '../src/sim/paladin_devotion';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

type TestSim = Sim & {
  nextId: number;
  addEntity(entity: Entity): void;
};

function makeProtection(): TestSim {
  const sim = new Sim({ seed: 7171, playerClass: 'paladin', autoEquip: true }) as TestSim;
  sim.setPlayerLevel(20);
  expect(sim.setSpec('protection')).toBe(true);
  sim.player.resource = sim.player.maxResource;
  return sim;
}

function targetAt(sim: TestSim, distance: number, xOffset = 0): Entity {
  const mob = createMob(sim.nextId++, MOBS.forest_wolf, 20, {
    x: sim.player.pos.x + xOffset,
    y: sim.player.pos.y,
    z: sim.player.pos.z + distance,
  });
  mob.maxHp = 50_000;
  mob.hp = mob.maxHp;
  mob.hostile = true;
  mob.aiState = 'idle';
  sim.addEntity(mob);
  return mob;
}

function root(target: Entity): void {
  target.auras.push({
    id: 'test_root',
    name: 'Test Root',
    kind: 'root',
    remaining: 60,
    duration: 60,
    value: 0,
    sourceId: -1,
    school: 'holy',
  });
}

describe('Paladin Protection abilities', () => {
  it('Bastion Sweep damages nearby enemies, generates Devotion, and creates high threat', () => {
    const sim = makeProtection();
    const first = targetAt(sim, 2);
    const second = targetAt(sim, 3, 2);
    const outside = targetAt(sim, 10);
    sim.player.facing = 0;
    sim.targetEntity(first.id);

    sim.castAbility('bastion_sweep');

    expect(first.hp).toBeLessThan(first.maxHp);
    expect(second.hp).toBeLessThan(second.maxHp);
    expect(outside.hp).toBe(outside.maxHp);
    expect(sim.player.paladinDevotion?.value).toBe(1);
    expect(first.threat.get(sim.playerId) ?? 0).toBeGreaterThan(first.maxHp - first.hp);
    expect(sim.player.cooldowns.get('bastion_sweep')).toBe(6);
  });

  it('Oath Chain pulls a distant enemy into the pack and slows it', () => {
    const sim = makeProtection();
    const target = targetAt(sim, 24);
    sim.player.facing = 0;
    sim.targetEntity(target.id);
    const before = Math.hypot(target.pos.x - sim.player.pos.x, target.pos.z - sim.player.pos.z);

    sim.castAbility('oath_chain');

    expect(
      Math.hypot(target.pos.x - sim.player.pos.x, target.pos.z - sim.player.pos.z),
    ).toBeLessThan(before - 5);
    expect(target.auras).toContainEqual(
      expect.objectContaining({ id: 'oath_chain_slow', kind: 'slow', value: 0.5 }),
    );
  });

  it('reindexes an Oath Chain pull before an immediate Bastion Sweep', () => {
    const sim = makeProtection();
    sim.player.pos.x = 0;
    sim.player.pos.z = 24;
    sim.player.prevPos = { ...sim.player.pos };
    sim.grid.update(sim.player);
    sim.playerGrid.update(sim.player);
    const target = targetAt(sim, 24);
    sim.targetEntity(target.id);

    sim.castAbility('oath_chain');
    const afterPull = target.hp;
    sim.castAbility('bastion_sweep');

    expect(target.hp).toBeLessThan(afterPull);
  });

  it('Holy Shield requires and spends three Devotion, then grants block and absorb', () => {
    const blocked = makeProtection();
    grantDevotion(blocked.player, 2);
    blocked.castAbility('holy_shield');
    expect(blocked.player.paladinDevotion?.value).toBe(2);
    expect(blocked.player.cooldowns.has('holy_shield')).toBe(false);
    expect(blocked.player.auras.some((aura) => aura.id.startsWith('holy_shield'))).toBe(false);

    const sim = makeProtection();
    const target = targetAt(sim, 2);
    grantDevotion(sim.player, 3);
    sim.castAbility('holy_shield');

    expect(sim.player.paladinDevotion?.value).toBe(0);
    expect(sim.player.auras).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'holy_shield', kind: 'buff_block', value: 0.3 }),
        expect.objectContaining({ kind: 'absorb' }),
      ]),
    );
    expect(target.threat.get(sim.playerId) ?? 0).toBeGreaterThan(0);
  });

  it('Consecration ticks once per second for nine seconds with threat only inside its radius', () => {
    const sim = makeProtection();
    const inside = targetAt(sim, 2);
    const outside = targetAt(sim, 9);
    root(inside);
    root(outside);

    sim.castAbility('consecration');
    const events = [...sim.drainEvents()];
    expect(sim.activeConsecrations).toEqual([
      expect.objectContaining({ radius: 8, duration: 9, remaining: 9 }),
    ]);
    for (let tick = 0; tick < 9 * 20; tick++) events.push(...sim.tick());

    const insideHits = events.filter(
      (event) =>
        event.type === 'damage' && event.ability === 'Consecration' && event.targetId === inside.id,
    );
    const outsideHits = events.filter(
      (event) =>
        event.type === 'damage' &&
        event.ability === 'Consecration' &&
        event.targetId === outside.id,
    );
    expect(insideHits).toHaveLength(9);
    expect(outsideHits).toHaveLength(0);
    expect(inside.threat.get(sim.playerId) ?? 0).toBeGreaterThan(
      insideHits.reduce((total, event) => total + (event.type === 'damage' ? event.amount : 0), 0),
    );
    expect(outside.threat.get(sim.playerId) ?? 0).toBeLessThanOrEqual(1);
    expect(sim.player.paladinDevotion?.value).toBe(1);
  });
});
