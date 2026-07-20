import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/content/classes';
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
) => void;

function benisonPriest(): { sim: Sim; priest: Entity } {
  const sim = new Sim({ seed: 2802, playerClass: 'priest', autoEquip: true });
  sim.setPlayerLevel(20);
  expect(sim.setSpec('holy')).toBe(true);
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

function castVigil(sim: Sim, priest: Entity, ally: Entity): void {
  priest.gcdRemaining = 0;
  priest.resource = priest.maxResource;
  priest.cooldowns.delete('seraphic_vigil');
  sim.targetEntity(ally.id, priest.id);
  sim.castAbility('seraphic_vigil', priest.id);
  sim.tick();
}

describe('Benison baseline loop', () => {
  it('pins Choirmend and Sunburst Canticle as group recovery spells', () => {
    expect(ABILITIES.prayer_of_healing.name).toBe('Choirmend');
    expect(ABILITIES.prayer_of_healing.effects.some((effect) => effect.type === 'aoeHeal')).toBe(
      true,
    );
    expect(ABILITIES.holy_nova.name).toBe('Sunburst Canticle');
    expect(ABILITIES.holy_nova.effects.some((effect) => effect.type === 'aoeHeal')).toBe(true);
  });

  it('moves one source-owned Seraphic Vigil between allies', () => {
    const { sim, priest } = benisonPriest();
    const first = addAlly(sim, 'First Vigil', 4);
    const second = addAlly(sim, 'Second Vigil', 6);

    castVigil(sim, priest, first);
    expect(first.auras.some((a) => a.id === 'seraphic_vigil' && a.sourceId === priest.id)).toBe(
      true,
    );

    castVigil(sim, priest, second);
    expect(first.auras.some((a) => a.id === 'seraphic_vigil' && a.sourceId === priest.id)).toBe(
      false,
    );
    expect(second.auras.some((a) => a.id === 'seraphic_vigil' && a.sourceId === priest.id)).toBe(
      true,
    );
  });

  it('consumes Vigil to restore an ally who crosses its unsafe threshold', () => {
    const { sim, priest } = benisonPriest();
    const ally = addAlly(sim, 'Watched Ally', 4);
    castVigil(sim, priest, ally);
    ally.hp = Math.ceil(ally.maxHp * 0.36);
    const before = ally.hp;

    (sim as unknown as { dealDamage: DealDamage }).dealDamage(
      priest,
      ally,
      Math.ceil(ally.maxHp * 0.03),
      false,
      'shadow',
      'Test Hit',
      'hit',
    );

    expect(ally.hp).toBeGreaterThan(before);
    expect(ally.auras.some((a) => a.id === 'seraphic_vigil' && a.sourceId === priest.id)).toBe(
      false,
    );
  });
});
