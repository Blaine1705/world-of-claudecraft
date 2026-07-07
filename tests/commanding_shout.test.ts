import { describe, expect, it } from 'vitest';
import { ABILITIES, abilitiesKnownAt } from '../src/sim/content/classes';
import { computeTalentModifiers, emptyAllocation } from '../src/sim/content/talents';
import { Sim } from '../src/sim/sim';

// Bolstering Cry (commanding_shout) is prot-gated base kit (2026-07-07), so it is
// only in the known list once prot is committed; resolve the kit under prot here.
const protMods = () => computeTalentModifiers('warrior', { ...emptyAllocation(), spec: 'prot' });

describe('Commanding Shout', () => {
  it('is a free warrior physical stamina self-buff (1 hour) learned at level 14', () => {
    const def = ABILITIES['commanding_shout'];
    expect(def).toBeTruthy();
    expect(def.class).toBe('warrior');
    expect(def.learnLevel).toBe(14);
    expect(def.school).toBe('physical');
    expect(def.requiresTarget).toBe(false);
    expect(def.castTime).toBe(0);
    // Batch 2026-07-08: cost 10 -> 0, duration 120 -> 3600 (1 hour), and no
    // longer in the mutually-exclusive `warrior_shout` group.
    expect(def.cost).toBe(0);
    expect(def.exclusiveGroup).toBeUndefined();
    expect(def.effects).toEqual([{ type: 'selfBuff', kind: 'buff_sta', value: 6, duration: 3600 }]);
    // Rank 2 keeps the free cost and the 1-hour duration.
    const rank2 = def.ranks?.[0];
    expect(rank2?.cost).toBe(0);
    expect(rank2?.effects).toEqual([
      { type: 'selfBuff', kind: 'buff_sta', value: 11, duration: 3600 },
    ]);
  });

  it('is unknown at level 13 and known from level 14 in the warrior kit', () => {
    const before = abilitiesKnownAt('warrior', 13, protMods()).map((k) => k.def.id);
    const after = abilitiesKnownAt('warrior', 14, protMods()).map((k) => k.def.id);
    expect(before).not.toContain('commanding_shout');
    expect(after).toContain('commanding_shout');
  });

  it('upgrades to rank 2 (stronger stamina) at level 24', () => {
    const r1 = abilitiesKnownAt('warrior', 14, protMods()).find(
      (k) => k.def.id === 'commanding_shout',
    )!;
    const r2 = abilitiesKnownAt('warrior', 24, protMods()).find(
      (k) => k.def.id === 'commanding_shout',
    )!;
    const sta1 = (r1.effects[0] as { value: number }).value;
    const sta2 = (r2.effects[0] as { value: number }).value;
    expect(sta2).toBeGreaterThan(sta1);
  });

  it('applies the buff aura and raises maximum health when cast (free, no rage spent)', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
    sim.setPlayerLevel(14);
    expect(sim.setSpec('prot')).toBe(true); // Bolstering Cry is prot-gated base kit
    const p = sim.player;
    p.resource = 0; // free cost: castable on an empty rage bar
    const maxHpBefore = p.maxHp;
    sim.castAbility('commanding_shout');
    sim.tick();
    const buff = p.auras.find((a) => a.id === 'commanding_shout');
    expect(buff).toBeTruthy();
    expect(buff!.kind).toBe('buff_sta');
    expect(buff!.duration).toBe(3600);
    expect(p.resource).toBe(0); // nothing was spent
    expect(p.maxHp).toBeGreaterThan(maxHpBefore);
  });

  it('coexists with Iron Bellow (no longer mutually exclusive)', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
    sim.setPlayerLevel(14);
    expect(sim.setSpec('prot')).toBe(true);
    const p = sim.player;
    p.resource = 100;
    sim.castAbility('commanding_shout');
    for (let i = 0; i < 32; i++) sim.tick();
    p.resource = 100;
    sim.castAbility('battle_shout');
    // Both shout auras are present at once.
    expect(p.auras.some((a) => a.id === 'commanding_shout')).toBe(true);
    expect(p.auras.some((a) => a.id === 'battle_shout_ap')).toBe(true);
  });
});
