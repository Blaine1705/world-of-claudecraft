import { describe, expect, it } from 'vitest';
import { ABILITIES, abilitiesKnownAt } from '../src/sim/content/classes';
import {
  computeTalentModifiers,
  emptyAllocation,
  type TalentAllocation,
} from '../src/sim/content/talents';
import { Sim } from '../src/sim/sim';

// Spec-gated base kit (operator design, 2026-07-07): some warrior base
// abilities belong to specific specializations. A player who has not yet
// committed to a spec keeps the full kit; once a spec is chosen, abilities
// whose `specs` list excludes it drop out of the known list (and with it the
// spellbook, the action bar resolve, and the server cast path, which all read
// meta.known). Talent/row GRANTS are never spec-filtered here: the tree they
// come from is already spec-scoped.

const alloc = (spec: string | null): TalentAllocation => ({
  ...emptyAllocation(),
  spec,
});

const mods = (spec: string | null) => computeTalentModifiers('warrior', alloc(spec));

const knownIds = (spec: string | null, level = 20): Set<string> =>
  new Set(abilitiesKnownAt('warrior', level, mods(spec)).map((k) => k.def.id));

// The locked gating table: ability id -> specs that keep it.
const GATED: Record<string, string[]> = {
  defensive_stance: ['arms', 'prot'],
  sunder_armor: ['arms', 'prot'],
  commanding_shout: ['prot'],
  demoralizing_shout: ['prot'],
  rend: ['arms'],
  overpower: ['arms'],
  slam: ['arms', 'prot'],
  cleave: ['arms'], // removed from prot 2026-07-08; prot uses Revenge
  revenge: ['prot'], // prot-only, replaces Reaver Strike (heroic_strike) for prot
  bloodrage: ['arms', 'prot'], // Fury replaces it with its signature (Bloodletting)
};

describe('spec-gated warrior base kit (content table)', () => {
  it('every gated ability declares exactly the approved specs', () => {
    for (const [id, specs] of Object.entries(GATED)) {
      expect(ABILITIES[id]?.specs, id).toEqual(specs);
    }
  });

  it('ungated staples carry no specs field', () => {
    for (const id of ['heroic_strike', 'battle_shout', 'charge', 'execute', 'taunt']) {
      expect(ABILITIES[id]?.specs, id).toBeUndefined();
    }
  });

  it('Reaver Strike is excluded from prot via excludeSpecs, and Revenge is prot-only', () => {
    // heroic_strike stays ungated (no `specs`) but drops out for committed prot.
    expect(ABILITIES.heroic_strike?.specs).toBeUndefined();
    expect(ABILITIES.heroic_strike?.excludeSpecs).toEqual(['prot']);
    // revenge is the prot replacement.
    expect(ABILITIES.revenge?.specs).toEqual(['prot']);
    expect(ABILITIES.revenge?.excludeSpecs).toBeUndefined();
  });
});

describe('abilitiesKnownAt spec filter', () => {
  it('no spec chosen: only the shared base kit, every spec-exclusive is hidden', () => {
    const ids = knownIds(null);
    for (const id of Object.keys(GATED)) expect(ids.has(id), id).toBe(false);
    // the ungated base kit stays available before a spec is committed
    for (const id of ['heroic_strike', 'battle_shout', 'charge', 'execute', 'taunt']) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('fury loses every arms/prot exclusive (incl. Blood Toll, replaced by its signature)', () => {
    const ids = knownIds('fury');
    for (const id of Object.keys(GATED)) expect(ids.has(id), id).toBe(false);
    expect(ids.has('heroic_strike')).toBe(true);
    expect(ids.has('bloodthirst')).toBe(true); // the signature grant is untouched
  });

  it('arms keeps its exclusives (incl. the shared strikes) but not the prot-only kit', () => {
    const ids = knownIds('arms');
    for (const id of ['defensive_stance', 'sunder_armor', 'rend', 'overpower', 'slam', 'cleave']) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const id of ['commanding_shout', 'demoralizing_shout', 'revenge']) {
      expect(ids.has(id), id).toBe(false);
    }
    // Arms keeps Reaver Strike (only prot excludes it).
    expect(ids.has('heroic_strike')).toBe(true);
    expect(ids.has('bloodrage')).toBe(true);
  });

  it('prot keeps tank staples and Revenge but not Reaver Strike, Reaping Arc, or arms strikes', () => {
    const ids = knownIds('prot');
    for (const id of [
      'defensive_stance',
      'sunder_armor',
      'commanding_shout',
      'demoralizing_shout',
      'slam',
      'revenge',
      'bloodrage',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    // Reaver Strike (excludeSpecs prot), Reaping Arc (arms-only now), and the
    // arms-only strikes all drop out for committed prot.
    for (const id of ['heroic_strike', 'cleave', 'rend', 'overpower']) {
      expect(ids.has(id), id).toBe(false);
    }
  });

  it('excludeSpecs: only committed prot swaps Reaver Strike for Revenge', () => {
    // No spec, arms, and fury all keep Reaver Strike and none see Revenge.
    for (const spec of [null, 'arms', 'fury'] as const) {
      const ids = knownIds(spec);
      expect(ids.has('heroic_strike'), `${spec} heroic_strike`).toBe(true);
      expect(ids.has('revenge'), `${spec} revenge`).toBe(false);
    }
    // Committed prot is the mirror image: Revenge in, Reaver Strike out.
    const prot = knownIds('prot');
    expect(prot.has('heroic_strike')).toBe(false);
    expect(prot.has('revenge')).toBe(true);
  });

  it('a talent grant bypasses the spec filter (grants are already spec-scoped)', () => {
    // Simulate a grant of a gated ability: even under fury, a grant wins.
    const m = mods('fury');
    m.grants.push({ ability: 'rend', rank: 1 });
    const ids = new Set(abilitiesKnownAt('warrior', 20, m).map((k) => k.def.id));
    expect(ids.has('rend')).toBe(true);
  });
});

describe('spec gating end to end in the sim', () => {
  it('a no-spec warrior lacks Deep Gash; arms grants it in the known list and cast resolve, fury never does', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
    sim.setPlayerLevel(20);
    // No committed spec: the arms-only Deep Gash (rend) is hidden and unresolvable.
    expect(sim.known.some((k) => k.def.id === 'rend')).toBe(false);
    expect(sim.resolvedAbility('rend')).toBeNull();
    // Committing arms reveals it in the known list AND the cast resolve.
    expect(sim.setSpec('arms')).toBe(true);
    expect(sim.known.some((k) => k.def.id === 'rend')).toBe(true);
    expect(sim.resolvedAbility('rend')).not.toBeNull();
    // Switching to fury drops it again (fury never keeps the arms-only bleed).
    expect(sim.setSpec('fury')).toBe(true);
    expect(sim.known.some((k) => k.def.id === 'rend')).toBe(false);
    expect(sim.resolvedAbility('rend')).toBeNull();
    // Staples survive every spec choice.
    expect(sim.known.some((k) => k.def.id === 'heroic_strike')).toBe(true);
  });

  it('choosing prot keeps the tank kit and stays deterministic', () => {
    const run = () => {
      const sim = new Sim({ seed: 7, playerClass: 'warrior', autoEquip: true });
      sim.setPlayerLevel(20);
      sim.setSpec('prot');
      for (let i = 0; i < 20 * 3; i++) sim.tick();
      return sim.known.map((k) => k.def.id).join(',');
    };
    const a = run();
    expect(a).toContain('commanding_shout');
    expect(a).not.toContain('overpower');
    expect(run()).toBe(a);
  });
});
