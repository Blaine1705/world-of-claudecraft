import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/content/classes';
import { Sim } from '../src/sim/sim';

// The three hunter aspects are mutually exclusive: only one may be active at a
// time. They are marked with the shared `exclusiveGroup: 'aspect'` and enforced
// at the self-buff apply site (effect_dispatch).
const makeHunter = (seed = 42) => {
  const sim = new Sim({ seed, playerClass: 'hunter', autoEquip: true });
  sim.setPlayerLevel(14); // hawk(4) + monkey(10) + cheetah(14) all known
  return sim;
};

const aspectAuras = (sim: Sim) =>
  sim.player.auras.filter((a) => a.id.startsWith('aspect_of_the_')).map((a) => a.id);

// Aspects trigger the global cooldown, so a cast must clear the GCD (1.5s = 30
// ticks at 20 Hz) before the next one will land. Cast, then settle past the GCD.
const castAspect = (sim: Sim, id: string) => {
  sim.castAbility(id);
  for (let i = 0; i < 32; i++) sim.tick();
};

const castSelfBuff = (sim: Sim, id: string) => {
  sim.castAbility(id);
  for (let i = 0; i < 32; i++) sim.tick();
};

describe('hunter aspect mutual exclusion', () => {
  it('marks all three aspects with the shared exclusive group', () => {
    expect(ABILITIES.aspect_of_the_hawk.exclusiveGroup).toBe('aspect');
    expect(ABILITIES.aspect_of_the_monkey.exclusiveGroup).toBe('aspect');
    expect(ABILITIES.aspect_of_the_cheetah.exclusiveGroup).toBe('aspect');
  });

  it('keeps only the most recently cast aspect active', () => {
    const sim = makeHunter();
    castAspect(sim, 'aspect_of_the_hawk');
    expect(aspectAuras(sim)).toEqual(['aspect_of_the_hawk']);

    castAspect(sim, 'aspect_of_the_monkey');
    expect(aspectAuras(sim)).toEqual(['aspect_of_the_monkey']);

    castAspect(sim, 'aspect_of_the_cheetah');
    expect(aspectAuras(sim)).toEqual(['aspect_of_the_cheetah']);
  });

  it('returns the swapped-out aspect stat to baseline (no stacking AP)', () => {
    const sim = makeHunter();
    const baseAp = sim.player.attackPower;

    castAspect(sim, 'aspect_of_the_hawk'); // +AP
    expect(sim.player.attackPower).toBeGreaterThan(baseAp);

    // Switching to monkey must drop the hawk AP bonus, not run both at once.
    castAspect(sim, 'aspect_of_the_monkey');
    expect(sim.player.attackPower).toBe(baseAp);
    expect(sim.player.auras.some((a) => a.id === 'aspect_of_the_hawk')).toBe(false);
  });

  it('does not cancel non-aspect buffs when an aspect is cast', () => {
    const sim = makeHunter();
    castAspect(sim, 'aspect_of_the_hawk');
    // Re-casting the same aspect refreshes, never cancels itself.
    castAspect(sim, 'aspect_of_the_hawk');
    expect(aspectAuras(sim)).toEqual(['aspect_of_the_hawk']);
  });

  it('is deterministic for a fixed seed', () => {
    const run = () => {
      const sim = makeHunter(7);
      castAspect(sim, 'aspect_of_the_hawk');
      castAspect(sim, 'aspect_of_the_cheetah');
      return aspectAuras(sim);
    };
    expect(run()).toEqual(run());
  });
});

describe('classic self-buff mutual exclusion groups', () => {
  it('marks paladin auras and warrior shouts with their own exclusive groups', () => {
    expect(ABILITIES.devotion_aura.exclusiveGroup).toBe('paladin_aura');
    expect(ABILITIES.retribution_aura.exclusiveGroup).toBe('paladin_aura');
    expect(ABILITIES.battle_shout.exclusiveGroup).toBe('warrior_shout');
    // Bolstering Cry (commanding_shout) LEFT the warrior_shout group (Batch
    // 2026-07-08) so the two shouts now coexist: it carries no exclusive group.
    expect(ABILITIES.commanding_shout.exclusiveGroup).toBeUndefined();
  });

  it('keeps only one paladin aura active', () => {
    const sim = new Sim({ seed: 42, playerClass: 'paladin', autoEquip: true });
    sim.setPlayerLevel(16); // devotion(1) + retribution(16) known

    castSelfBuff(sim, 'devotion_aura');
    expect(sim.player.auras.filter((a) => a.id.endsWith('_aura')).map((a) => a.id)).toEqual([
      'devotion_aura',
    ]);

    castSelfBuff(sim, 'retribution_aura');
    expect(sim.player.auras.filter((a) => a.id.endsWith('_aura')).map((a) => a.id)).toEqual([
      'retribution_aura',
    ]);
  });

  it('lets the two warrior shouts coexist (Bolstering Cry left the exclusive group)', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
    sim.setPlayerLevel(14); // battle(7) + commanding(14) known
    // Bolstering Cry (commanding_shout) is prot-gated base kit (2026-07-07).
    expect(sim.setSpec('prot')).toBe(true);
    const baseAp = sim.player.attackPower;

    sim.player.resource = 100;
    castSelfBuff(sim, 'battle_shout');
    // Iron Bellow is a group AP buff (aura id 'battle_shout_ap') that includes
    // the caster, so it raises the caster's own attack power.
    expect(sim.player.attackPower).toBeGreaterThan(baseAp);
    const apWithBellow = sim.player.attackPower;

    sim.player.resource = 100;
    castSelfBuff(sim, 'commanding_shout');
    // Bolstering Cry (the stamina self-buff, aura id 'commanding_shout') no longer
    // shares an exclusive group with Iron Bellow, so casting it does NOT cancel the
    // AP buff: both auras are present and Iron Bellow's attack power survives.
    const shoutAuras = sim.player.auras.map((a) => a.id).filter((id) => id.includes('shout'));
    expect(shoutAuras).toContain('battle_shout_ap');
    expect(shoutAuras).toContain('commanding_shout');
    expect(sim.player.attackPower).toBe(apWithBellow);
  });
});
