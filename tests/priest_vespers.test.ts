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

type GuardianEntity = Entity & { guardianState?: { key: string } };

function vespersPriest(): { sim: Sim; priest: Entity } {
  const sim = new Sim({ seed: 2803, playerClass: 'priest', autoEquip: true });
  sim.setPlayerLevel(20);
  expect(sim.setSpec('shadow')).toBe(true);
  sim.tick();
  sim.player.resource = sim.player.maxResource;
  return { sim, priest: sim.player };
}

function addDummy(sim: Sim, id: number, x: number, z: number): Entity {
  const mob = createMob(id, MOBS.training_dummy, 20, { x, y: sim.player.pos.y, z });
  mob.hostile = true;
  mob.maxHp = mob.hp = 100000;
  mob.aiState = 'idle';
  (sim as unknown as { addEntity(entity: Entity): void }).addEntity(mob);
  return mob;
}

function castAndSettle(sim: Sim, priest: Entity, target: Entity, abilityId: string): void {
  priest.gcdRemaining = 0;
  priest.resource = priest.maxResource;
  priest.cooldowns.delete(abilityId);
  sim.targetEntity(target.id, priest.id);
  sim.castAbility(abilityId, priest.id);
  for (let tick = 0; tick < 100; tick++) sim.tick();
}

function prepareEffigy(sim: Sim, priest: Entity, primary: Entity, secondary?: Entity): void {
  castAndSettle(sim, priest, primary, 'shadow_word_pain');
  if (secondary) castAndSettle(sim, priest, secondary, 'shadow_word_pain');
  castAndSettle(sim, priest, primary, 'mind_blast');
}

describe('Vespers baseline loop', () => {
  it('binds Effigy only through Mindfracture on the priest own Dirge', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9900, priest.pos.x, priest.pos.z + 8);

    castAndSettle(sim, priest, primary, 'mind_blast');
    expect(primary.auras.some((a) => a.id === 'priest_effigy')).toBe(false);

    prepareEffigy(sim, priest, primary);
    expect(primary.auras.some((a) => a.id === 'priest_effigy' && a.sourceId === priest.id)).toBe(
      true,
    );
    expect(priest.auras.find((a) => a.id === 'priest_gloomtithe')?.stacks).toBeGreaterThanOrEqual(
      1,
    );
  });

  it('echoes landed Mindfracture damage to other own-Dirge enemies without recursion', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9910, priest.pos.x, priest.pos.z + 8);
    const secondary = addDummy(sim, 9911, priest.pos.x + 3, priest.pos.z + 9);
    prepareEffigy(sim, priest, primary, secondary);
    const before = secondary.hp;

    (sim as unknown as { dealDamage: DealDamage }).dealDamage(
      priest,
      primary,
      100,
      false,
      'shadow',
      'Mindfracture',
      'hit',
      false,
      undefined,
      true,
      false,
      true,
      'mind_blast',
      false,
    );

    expect(before - secondary.hp).toBe(30);
  });

  it('consumes Gloomtithe to summon a temporary guardian, not a command pet', () => {
    const { sim, priest } = vespersPriest();
    const primary = addDummy(sim, 9920, priest.pos.x, priest.pos.z + 8);
    prepareEffigy(sim, priest, primary);
    const before = primary.hp;

    priest.gcdRemaining = 0;
    priest.resource = priest.maxResource;
    priest.cooldowns.delete('summon_tithefiend');
    sim.castAbility('summon_tithefiend', priest.id);
    sim.tick();

    const guardian = [...sim.entities.values()].find(
      (entity): entity is GuardianEntity =>
        entity.ownerId === priest.id && entity.guardianState?.key === 'tithefiend',
    );
    expect(guardian).toBeDefined();
    expect(sim.petOf(priest.id)).toBeNull();
    expect(priest.auras.some((a) => a.id === 'priest_gloomtithe')).toBe(false);

    for (let tick = 0; tick < 60; tick++) sim.tick();
    expect(primary.hp).toBeLessThan(before);
  });
});
