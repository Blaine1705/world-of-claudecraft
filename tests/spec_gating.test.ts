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
  sunder_armor: ['prot'], // Arms restructure 2026-07-08: Armor Shear is prot-only now
  thunder_clap: ['prot'], // Quaking Blow gated to prot 2026-07-08 (was ungated)
  commanding_shout: ['prot'],
  demoralizing_shout: ['prot'],
  // rend (Deep Gash) was retired from the warrior kit 2026-07-08; its ABILITIES def
  // still carries specs ['arms'], but no warrior learns it (it is in no kit list), so
  // it stays HIDDEN for every spec below.
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

  it('Reaver Strike is excluded from prot AND arms via excludeSpecs, and Revenge is prot-only', () => {
    // heroic_strike stays ungated (no `specs`) but drops out for committed prot AND
    // arms (Arms restructure 2026-07-08: it leans on Maiming/Brute strikes instead).
    expect(ABILITIES.heroic_strike?.specs).toBeUndefined();
    expect(ABILITIES.heroic_strike?.excludeSpecs).toEqual(['prot', 'arms']);
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

  it('arms keeps its own exclusives but not the prot-only kit or the shared strikes', () => {
    const ids = knownIds('arms');
    for (const id of ['defensive_stance', 'overpower', 'slam', 'cleave']) {
      expect(ids.has(id), id).toBe(true);
    }
    // Armor Shear (sunder) and Quaking Blow (thunder_clap) are prot-only now; Deep
    // Gash (rend) was retired from the kit; and Reaver Strike (heroic_strike) now
    // excludes arms too (excludeSpecs ['prot','arms']).
    for (const id of [
      'commanding_shout',
      'demoralizing_shout',
      'revenge',
      'sunder_armor',
      'thunder_clap',
      'rend',
      'heroic_strike',
    ]) {
      expect(ids.has(id), id).toBe(false);
    }
    expect(ids.has('bloodrage')).toBe(true);
  });

  it('prot keeps tank staples and Revenge but not Reaver Strike, Reaping Arc, or arms strikes', () => {
    const ids = knownIds('prot');
    for (const id of [
      'defensive_stance',
      'sunder_armor',
      'thunder_clap',
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

  it('excludeSpecs: committed prot AND arms lack Reaver Strike; only prot gains Revenge', () => {
    // No spec and fury keep Reaver Strike and neither sees Revenge.
    for (const spec of [null, 'fury'] as const) {
      const ids = knownIds(spec);
      expect(ids.has('heroic_strike'), `${spec} heroic_strike`).toBe(true);
      expect(ids.has('revenge'), `${spec} revenge`).toBe(false);
    }
    // Arms now excludes Reaver Strike too (excludeSpecs ['prot','arms']) but does
    // NOT gain Revenge (that swap is prot-only).
    const arms = knownIds('arms');
    expect(arms.has('heroic_strike')).toBe(false);
    expect(arms.has('revenge')).toBe(false);
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
  it('a no-spec warrior lacks the arms-only Die by the Sword; arms grants it in the known list and cast resolve, fury never does', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: true });
    sim.setPlayerLevel(20);
    // No committed spec: the arms-only Die by the Sword is hidden and unresolvable.
    // (Deep Gash / rend was retired from the kit 2026-07-08, so this exercises the
    // gating through a live arms-only ability instead.)
    expect(sim.known.some((k) => k.def.id === 'die_by_sword')).toBe(false);
    expect(sim.resolvedAbility('die_by_sword')).toBeNull();
    // Committing arms reveals it in the known list AND the cast resolve.
    expect(sim.setSpec('arms')).toBe(true);
    expect(sim.known.some((k) => k.def.id === 'die_by_sword')).toBe(true);
    expect(sim.resolvedAbility('die_by_sword')).not.toBeNull();
    // Switching to fury drops it again (fury never keeps the arms-only kit).
    expect(sim.setSpec('fury')).toBe(true);
    expect(sim.known.some((k) => k.def.id === 'die_by_sword')).toBe(false);
    expect(sim.resolvedAbility('die_by_sword')).toBeNull();
    // Ungated staples survive every spec choice.
    expect(sim.known.some((k) => k.def.id === 'battle_shout')).toBe(true);
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
