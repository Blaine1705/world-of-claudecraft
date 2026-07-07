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
  cleave: ['arms', 'prot'],
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

  it('arms keeps its exclusives (incl. the shared strikes) but not the prot-only shouts', () => {
    const ids = knownIds('arms');
    for (const id of ['defensive_stance', 'sunder_armor', 'rend', 'overpower', 'slam', 'cleave']) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const id of ['commanding_shout', 'demoralizing_shout']) {
      expect(ids.has(id), id).toBe(false);
    }
    expect(ids.has('bloodrage')).toBe(true);
  });

  it('prot keeps tank staples and the shared strikes but no arms-only strikes', () => {
    const ids = knownIds('prot');
    for (const id of [
      'defensive_stance',
      'sunder_armor',
      'commanding_shout',
      'demoralizing_shout',
      'slam',
      'cleave',
      'bloodrage',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const id of ['rend', 'overpower']) expect(ids.has(id), id).toBe(false);
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
