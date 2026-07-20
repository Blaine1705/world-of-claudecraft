import { describe, expect, it } from 'vitest';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

type DealDamage = (
  source: Entity | null,
  target: Entity,
  amount: number,
  crit: boolean,
  school: string,
  ability: string | null,
  kind: 'hit' | 'miss' | 'dodge',
  noRage?: boolean,
  threatOpts?: { flat?: number; mult?: number },
  direct?: boolean,
  attackAnimationStarted?: boolean,
  alreadyFinal?: boolean,
  abilityId?: string | null,
  aoe?: boolean,
) => void;

function doctrinePriest(): { sim: Sim; priest: Entity } {
  const sim = new Sim({ seed: 2801, playerClass: 'priest', autoEquip: true });
  sim.setPlayerLevel(20);
  expect(sim.setSpec('discipline')).toBe(true);
  sim.tick();
  sim.player.resource = sim.player.maxResource;
  return { sim, priest: sim.player };
}

function addAlly(sim: Sim, name: string, distance: number): Entity {
  const id = sim.addPlayer('warrior', name);
  sim.setPlayerLevel(20, id);
  const ally = sim.entities.get(id);
  if (!ally) throw new Error('ally missing');
  ally.pos.x = sim.player.pos.x + distance;
  ally.pos.z = sim.player.pos.z;
  return ally;
}

function addDummy(sim: Sim): Entity {
  const mob = createMob(9800, MOBS.training_dummy, 20, {
    x: sim.player.pos.x,
    y: sim.player.pos.y,
    z: sim.player.pos.z + 8,
  });
  mob.hostile = true;
  mob.maxHp = mob.hp = 100000;
  (sim as unknown as { addEntity(entity: Entity): void }).addEntity(mob);
  return mob;
}

function castOn(sim: Sim, caster: Entity, target: Entity, abilityId: string): void {
  caster.gcdRemaining = 0;
  caster.resource = caster.maxResource;
  caster.cooldowns.delete(abilityId);
  sim.targetEntity(target.id, caster.id);
  sim.castAbility(abilityId, caster.id);
  sim.tick();
}

function deal(sim: Sim, ...args: Parameters<DealDamage>): void {
  (sim as unknown as { dealDamage: DealDamage }).dealDamage(...args);
}

describe('Doctrine baseline loop', () => {
  it('moves the source-owned Doctrine link when Psalm of Warding changes ally', () => {
    const { sim, priest } = doctrinePriest();
    const first = addAlly(sim, 'First Psalm', 4);
    const second = addAlly(sim, 'Second Psalm', 6);

    castOn(sim, priest, first, 'power_word_shield');
    expect(first.auras.some((a) => a.id === 'priest_doctrine' && a.sourceId === priest.id)).toBe(
      true,
    );

    castOn(sim, priest, second, 'power_word_shield');
    expect(first.auras.some((a) => a.id === 'priest_doctrine' && a.sourceId === priest.id)).toBe(
      false,
    );
    expect(second.auras.some((a) => a.id === 'priest_doctrine' && a.sourceId === priest.id)).toBe(
      true,
    );
  });

  it('converts landed Scouring Hymn damage into healing on the linked ally', () => {
    const { sim, priest } = doctrinePriest();
    const ally = addAlly(sim, 'Linked Ally', 4);
    const dummy = addDummy(sim);
    castOn(sim, priest, ally, 'power_word_shield');
    ally.hp = Math.floor(ally.maxHp * 0.5);
    const before = ally.hp;

    deal(
      sim,
      priest,
      dummy,
      100,
      false,
      'holy',
      'Scouring Hymn',
      'hit',
      false,
      undefined,
      true,
      false,
      true,
      'smite',
      false,
    );

    expect(ally.hp - before).toBe(30);
  });

  it('lets Scouring Mercy directly heal a friendly target', () => {
    const { sim, priest } = doctrinePriest();
    const ally = addAlly(sim, 'Mercy Ally', 4);
    ally.hp = Math.floor(ally.maxHp * 0.5);
    const before = ally.hp;

    castOn(sim, priest, ally, 'scouring_mercy');

    expect(ally.hp).toBeGreaterThan(before);
  });
});
