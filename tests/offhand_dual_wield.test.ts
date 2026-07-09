import { describe, expect, it } from 'vitest';
import { meleeSwing, updatePlayerAutoAttack } from '../src/sim/combat/auto_attack';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';

type TestSim = Sim & {
  nextId: number;
  addEntity(entity: Entity): void;
  emit(event: SimEvent): void;
};
type Ev = {
  type?: string;
  amount?: number;
  kind?: string;
  sourceId?: number;
  targetId?: number;
};

function capture(sim: TestSim): Ev[] {
  const events: Ev[] = [];
  const orig = sim.emit.bind(sim);
  sim.emit = (e: SimEvent) => {
    events.push(e);
    orig(e);
  };
  return events;
}

function requireEntity(sim: Sim, id: number): Entity {
  const entity = sim.entities.get(id);
  if (!entity) {
    throw new Error(`Missing entity ${id}`);
  }
  return entity;
}

function requirePlayerMeta(sim: Sim, id: number) {
  const meta = sim.players.get(id);
  if (!meta) {
    throw new Error(`Missing player meta ${id}`);
  }
  return meta;
}

function spawnDummy(sim: TestSim, p: Entity, level = 1): Entity {
  const mob = createMob(sim.nextId++, MOBS.forest_wolf, level, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z + 2,
  });
  mob.maxHp = 500000;
  mob.hp = 500000;
  mob.hostile = true;
  mob.aiState = 'idle';
  sim.addEntity(mob);
  p.facing = Math.atan2(mob.pos.x - p.pos.x, mob.pos.z - p.pos.z);
  sim.targetEntity(mob.id, p.id);
  return mob;
}

describe('offhand equip routing', () => {
  it('a Fury warrior equips a second one-hand weapon into offhand', () => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true });
    sim.setPlayerLevel(10);
    expect(sim.setSpec('fury')).toBe(true);
    sim.addItem('redbrook_blade', 1);
    sim.equipItem('redbrook_blade');
    expect(sim.equipment.mainhand).toBe('worn_sword');
    expect(sim.equipment.offhand).toBe('redbrook_blade');
  });

  it('a non-dual-wield warrior replaces mainhand instead of filling offhand', () => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true });
    sim.setPlayerLevel(10);
    expect(sim.setSpec('prot')).toBe(true);
    sim.addItem('redbrook_blade', 1);
    sim.equipItem('redbrook_blade');
    expect(sim.equipment.mainhand).toBe('redbrook_blade');
    expect(sim.equipment.offhand).toBeUndefined();
  });
});

describe('offhand combat rules', () => {
  it('an offhand weapon swing deals half the resolved mainhand damage with the same weapon', () => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true }) as TestSim;
    const p = sim.player;
    const targetId = sim.addPlayer('mage', 'Target');
    const target = requireEntity(sim, targetId);
    p.weapon = { min: 20, max: 20, speed: 2 };
    p.attackPower = 0;
    p.critChance = 0;
    target.stats.armor = 0;
    target.dodgeChance = 0;
    const events = capture(sim);
    expect(meleeSwing(sim.ctx, p, target, 0, null, { cannotBeDodged: true })).toBe(true);
    expect(
      meleeSwing(sim.ctx, p, target, 0, null, {
        cannotBeDodged: true,
        weapon: { min: 20, max: 20, speed: 2 },
        weaponMult: 0.5,
        apSwingSpeed: 2,
      }),
    ).toBe(true);
    const hits = events.filter((e) => e.type === 'damage' && e.kind === 'hit').map((e) => e.amount);
    expect(hits).toEqual([20, 10]);
  });

  it('the dual-wield white-hit penalty can turn a hit into a miss', () => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true }) as TestSim;
    const p = sim.player;
    const targetId = sim.addPlayer('mage', 'Target');
    const target = requireEntity(sim, targetId);
    p.critChance = 0;
    p.attackPower = 0;
    target.stats.armor = 0;
    target.dodgeChance = 0;
    sim.rng.next = () => 0.1;
    const events = capture(sim);
    expect(meleeSwing(sim.ctx, p, target, 0, null, { cannotBeDodged: true })).toBe(true);
    expect(
      meleeSwing(sim.ctx, p, target, 0, null, {
        cannotBeDodged: true,
        whiteDualWieldPenalty: true,
      }),
    ).toBe(false);
    expect(events.filter((e) => e.type === 'damage').map((e) => e.kind)).toEqual(['hit', 'miss']);
  });

  it('dual wielding arms both swing timers and emits both hands over auto-attack', () => {
    const sim = new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true }) as TestSim;
    sim.setPlayerLevel(10);
    expect(sim.setSpec('fury')).toBe(true);
    sim.addItem('redbrook_blade', 1);
    sim.equipItem('redbrook_blade');
    const p = sim.player;
    const meta = requirePlayerMeta(sim, p.id);
    const dummy = spawnDummy(sim, p);
    const events = capture(sim);
    p.autoAttack = true;
    p.swingTimer = 0;
    p.offhandSwingTimer = 0;
    updatePlayerAutoAttack(sim.ctx, p, meta);
    const swings = events.filter(
      (e) => e.type === 'damage' && e.sourceId === p.id && e.targetId === dummy.id,
    );
    expect(swings).toHaveLength(2);
    expect(p.swingTimer).toBeGreaterThan(0);
    expect(p.offhandSwingTimer).toBeGreaterThan(0);
  });
});
