import { describe, expect, it } from 'vitest';
import { ABILITIES, abilitiesKnownAt } from '../src/sim/content/classes';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

// Iron Bellow (battle_shout) is a GROUP buff: the caster and every nearby
// friendly player gain the attack-power aura for 1 hour, riding the same
// aoeAllyAttackPower effect Trueshot Aura uses (radius 40). Batch 2026-07-08:
// Bolstering Cry left the 'warrior_shout' group, so Iron Bellow and Bolstering
// Cry now COEXIST (both auras stay up at once).

const makeWarrior = (seed = 42) => {
  const sim = new Sim({ seed, playerClass: 'warrior', autoEquip: true });
  sim.setPlayerLevel(7); // Iron Bellow (battle_shout) rank 1 is learned at level 7
  sim.player.resource = 100;
  return sim;
};

const settleGcd = (sim: Sim) => {
  for (let i = 0; i < 32; i++) sim.tick();
};

const shoutAura = (e: Entity) => e.auras.find((a) => a.id === 'battle_shout_ap');

describe('Iron Bellow (battle_shout) group buff', () => {
  it('is a 1-hour, 40-yd group attack-power buff with era rank values 20/35/50', () => {
    const def = ABILITIES.battle_shout;
    expect(def.exclusiveGroup).toBe('warrior_shout');
    expect(def.learnLevel).toBe(7); // learned at level 7
    expect(def.cost).toBe(0); // free
    for (const r of def.ranks ?? []) expect(r.cost).toBe(0);
    expect(def.effects).toEqual([
      { type: 'aoeAllyAttackPower', amount: 20, duration: 3600, radius: 40 },
    ]);
    const amountAt = (level: number) => {
      const known = abilitiesKnownAt('warrior', level).find((k) => k.def.id === 'battle_shout');
      const eff = known?.effects[0];
      return eff && eff.type === 'aoeAllyAttackPower' ? eff.amount : 0;
    };
    expect(amountAt(6)).toBe(0); // not learned until level 7
    expect(amountAt(7)).toBe(20);
    expect(amountAt(12)).toBe(35);
    expect(amountAt(20)).toBe(50);
  });

  it('buffs the caster AND a nearby friendly player for 1 hour, but not one out of range', () => {
    const sim = makeWarrior();
    const p = sim.player;
    const baseAp = p.attackPower;
    const nearId = sim.addPlayer('priest', 'Nearby');
    const near = sim.entities.get(nearId)!;
    near.pos = { x: p.pos.x + 5, y: p.pos.y, z: p.pos.z };
    near.prevPos = { ...near.pos };
    const farId = sim.addPlayer('mage', 'Faraway');
    const far = sim.entities.get(farId)!;
    far.pos = { x: p.pos.x + 60, y: p.pos.y, z: p.pos.z };
    far.prevPos = { ...far.pos };

    sim.castAbility('battle_shout');

    const own = shoutAura(p);
    expect(own).toBeTruthy();
    expect(own!.kind).toBe('buff_ap');
    expect(own!.duration).toBe(3600);
    expect(own!.value).toBe(20);
    expect(p.attackPower).toBe(baseAp + 20);

    const ally = shoutAura(near);
    expect(ally).toBeTruthy();
    expect(ally!.kind).toBe('buff_ap');
    expect(ally!.duration).toBe(3600);

    expect(shoutAura(far)).toBeUndefined();
  });

  // The Bolstering Cry (commanding_shout) coexistence test was removed 2026-07-08:
  // that shout was retired from the warrior kit, so there is no second warrior
  // self-buff left to test against Iron Bellow's exclusive group.

  it('is deterministic for a fixed seed', () => {
    const run = () => {
      const sim = makeWarrior(7);
      const friendId = sim.addPlayer('priest', 'Friend');
      const friend = sim.entities.get(friendId)!;
      friend.pos = { x: sim.player.pos.x + 3, y: sim.player.pos.y, z: sim.player.pos.z };
      friend.prevPos = { ...friend.pos };
      sim.castAbility('battle_shout');
      settleGcd(sim);
      return [sim.player.auras.map((a) => a.id), friend.auras.map((a) => a.id)];
    };
    expect(run()).toEqual(run());
  });
});
