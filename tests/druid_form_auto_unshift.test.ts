// Auto-unshift: a druid who presses a healing or damaging spell while wearing
// Bruin, Wolf, or Fleet Form leaves the form and casts, instead of eating
// "You can't do that while shapeshifted."
//
// The behavior spans three seams, so the cases below pin all three: the cast
// gate (src/sim/combat/casting_lifecycle.ts), the shift itself
// (src/sim/combat/form_auto_unshift.ts), and the parked-mana pool the shift
// hands back (recalcPlayerStats in src/sim/entity.ts). The negative cases
// matter as much as the positive ones: a druid must never lose a form to a
// buff, a taunt, a form button, or a cast they could not afford anyway.

import { describe, expect, it } from 'vitest';
import { ABILITIES, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { Sim } from '../src/sim/sim';
import type { Entity, SimEvent } from '../src/sim/types';
import { placePlayerInOpenField } from './helpers/open_field';

const FORM_COST = 30;
const GCD_SETTLE_TICKS = 32;

function makeDruid(level = 20): Sim {
  const sim = new Sim({ seed: 17, playerClass: 'druid', autoEquip: true });
  sim.setPlayerLevel(level);
  placePlayerInOpenField(sim);
  sim.tick();
  sim.player.resource = sim.player.maxResource;
  return sim;
}

function addDummy(sim: Sim, id = 94001): Entity {
  const p = sim.player;
  const mob = createMob(id, MOBS.training_dummy, 20, {
    x: p.pos.x,
    y: p.pos.y,
    z: p.pos.z + 4,
  });
  (sim as unknown as { addEntity(entity: Entity): void }).addEntity(mob);
  sim.targetEntity(mob.id);
  return mob;
}

function settle(sim: Sim): void {
  for (let i = 0; i < GCD_SETTLE_TICKS; i++) sim.tick();
}

/** Enter a form through the real cast path, then let the GCD it billed lapse. */
function enterForm(sim: Sim, abilityId: 'bear_form' | 'cat_form' | 'travel_form'): void {
  sim.castAbility(abilityId);
  sim.tick();
  settle(sim);
  sim.drainEvents();
}

function errorTexts(sim: Sim): string[] {
  return sim
    .drainEvents()
    .filter((e): e is Extract<SimEvent, { type: 'error' }> => e.type === 'error')
    .map((e) => e.text);
}

function wearsAnyForm(p: Entity): boolean {
  return p.auras.some((a) => a.kind.startsWith('form_'));
}

describe('druid auto-unshift on a healing or damaging cast', () => {
  it('drops Bruin Form and casts Wildbolt, paying the parked mana', () => {
    // Arrange: a bear runs on rage, with the real mana pool parked in savedMana.
    const sim = makeDruid();
    const p = sim.player;
    const manaBefore = p.resource;
    addDummy(sim);
    enterForm(sim, 'bear_form');
    expect(p.resourceType).toBe('rage');
    expect(p.savedMana).toBe(manaBefore - FORM_COST);
    expect(p.resource).toBe(0); // no rage banked: the old gate refused here first

    // Act.
    sim.castAbility('wrath');

    // Assert: the form is gone, the mana bar is back, and the cast is running.
    expect(errorTexts(sim)).toEqual([]);
    expect(wearsAnyForm(p)).toBe(false);
    expect(p.resourceType).toBe('mana');
    expect(p.castingAbility).toBe('wrath');
  });

  it('drops Wolf Form and casts Wildmend', () => {
    const sim = makeDruid();
    const p = sim.player;
    enterForm(sim, 'cat_form');
    expect(p.resourceType).toBe('energy');

    sim.castAbility('healing_touch');

    expect(errorTexts(sim)).toEqual([]);
    expect(wearsAnyForm(p)).toBe(false);
    expect(p.resourceType).toBe('mana');
    expect(p.castingAbility).toBe('healing_touch');
  });

  it('drops Fleet Form and lands Lunar Tempest on the same press, off the GCD', () => {
    // Fleet Form is the case the shift-out cost matters most for: it never
    // swapped the bar, and Lunar Tempest is instant, so the whole press must
    // resolve in one tick with only the SPELL's own GCD charged.
    const sim = makeDruid();
    const p = sim.player;
    const mob = addDummy(sim);
    enterForm(sim, 'travel_form');
    expect(p.resourceType).toBe('mana');
    expect(p.gcdRemaining).toBe(0);
    const hpBefore = mob.hp;

    sim.castAbility('moonfire');

    // The shift and the spell both resolved inside the press: the form is
    // gone, nothing is left casting, and Lunar Tempest is already in flight.
    const events = sim.drainEvents();
    expect(events.filter((e) => e.type === 'error')).toEqual([]);
    expect(wearsAnyForm(p)).toBe(false);
    expect(p.castingAbility).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'spellfx', ability: 'moonfire', targetId: mob.id }),
    );
    // The shift added no GCD of its own: what is left is Lunar Tempest's.
    expect(p.gcdRemaining).toBeGreaterThan(0);
    expect(p.gcdRemaining).toBeLessThanOrEqual(1.5);
    // ...and the bolt lands, so the press was a real cast and not a no-op.
    settle(sim);
    expect(mob.hp).toBeLessThan(hpBefore);
  });

  it('still bills cost and GCD for shifting back INTO a form', () => {
    const sim = makeDruid();
    const p = sim.player;
    addDummy(sim);
    enterForm(sim, 'bear_form');
    sim.castAbility('wrath');
    while (p.castingAbility !== null || p.gcdRemaining > 0) sim.tick();
    sim.drainEvents();
    const manaBefore = p.resource;

    sim.castAbility('bear_form');
    sim.tick();

    expect(p.auras.some((a) => a.kind === 'form_bear')).toBe(true);
    expect(p.savedMana).toBe(manaBefore - FORM_COST);
    expect(p.gcdRemaining).toBeGreaterThan(0);
  });

  it('refuses an unaffordable cast WITHOUT stripping the form, naming mana', () => {
    // The parked pool is what an auto-unshifting cast is billed against, so it
    // is what the refusal must weigh: burning the form and then reporting
    // "Not enough mana!" would cost the druid their form for nothing.
    const sim = makeDruid();
    const p = sim.player;
    addDummy(sim);
    enterForm(sim, 'bear_form');
    p.savedMana = 1;
    p.resource = 100; // a full RAGE bar must not pay for a mana spell

    sim.castAbility('wrath');

    expect(errorTexts(sim)).toEqual(['Not enough mana!']);
    expect(p.auras.some((a) => a.kind === 'form_bear')).toBe(true);
    expect(p.castingAbility).toBeNull();
  });

  it('leaves non-damaging, non-healing spells refused in form', () => {
    // Wildward is a party buff: a stray press must not cost a tank their form.
    const sim = makeDruid();
    const p = sim.player;
    enterForm(sim, 'bear_form');
    p.resource = 100; // full rage, so the refusal below is about the FORM

    sim.castAbility('mark_of_the_wild');

    expect(errorTexts(sim)).toEqual(["You can't do that while shapeshifted."]);
    expect(p.auras.some((a) => a.kind === 'form_bear')).toBe(true);
  });

  it('leaves form-locked and form-usable abilities alone', () => {
    const sim = makeDruid();
    const p = sim.player;
    addDummy(sim);
    enterForm(sim, 'bear_form');

    // requiresForm: Maul is a bear ability and must not unshift the bear.
    p.resource = 50; // rage
    sim.castAbility('maul');
    expect(errorTexts(sim)).toEqual([]);
    expect(p.auras.some((a) => a.kind === 'form_bear')).toBe(true);

    // usableInForm: Oakhide is authored to fire mid-fight from bear.
    settle(sim);
    sim.drainEvents();
    sim.castAbility('barkskin');
    expect(errorTexts(sim)).toEqual([]);
    expect(p.auras.some((a) => a.kind === 'form_bear')).toBe(true);
  });

  it('leaves the form toggle itself a plain toggle', () => {
    const sim = makeDruid();
    const p = sim.player;
    enterForm(sim, 'cat_form');
    const parked = p.savedMana;

    sim.castAbility('cat_form');
    sim.tick();

    // Toggling off is free (no cost billed), which is what tells this apart
    // from an auto-unshift plus a re-entry.
    expect(wearsAnyForm(p)).toBe(false);
    expect(p.resourceType).toBe('mana');
    expect(p.resource).toBe(parked);
  });

  it('emits the form fade so both worlds drop the shapeshift visual', () => {
    const sim = makeDruid();
    addDummy(sim);
    enterForm(sim, 'bear_form');

    sim.castAbility('wrath');

    expect(sim.drainEvents()).toContainEqual(
      expect.objectContaining({
        type: 'aura',
        targetId: sim.player.id,
        name: ABILITIES.bear_form.name,
        gained: false,
      }),
    );
  });
});
