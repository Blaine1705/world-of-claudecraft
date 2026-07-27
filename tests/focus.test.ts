import { describe, expect, it } from 'vitest';
import { HARVEST_COMPONENT_ITEMS } from '../src/sim/content/professions';
import { ZONES } from '../src/sim/data';
import {
  applyFocusBonus,
  applyFocusTierBonus,
  computeRespecCost,
  EMPTY_FOCUS_ALLOCATION,
  FOCUS_POINT_BUDGET,
  isInTownZone,
  isTownFocusComponent,
  normalizeTownFocusOnLoad,
  POINTS_PER_TIER_BONUS,
  RESPEC_TIER_CONFIG,
  setTownFocus,
  TOWN_FOCUS_COMPONENTS,
} from '../src/sim/professions/focus';
import { TOWN_FOCUS_COMPONENTS as PANEL_COMPONENTS } from '../src/ui/town_focus_view';

const ZONE1 = ZONES[0];

describe('applyFocusBonus: additive, never lowers the baseline', () => {
  it('returns the baseline unchanged for an unfocused component', () => {
    expect(applyFocusBonus(10, 'hide', EMPTY_FOCUS_ALLOCATION)).toBe(10);
    expect(applyFocusBonus(10, 'hide', { fang: 5 })).toBe(10);
  });

  it('adds a strictly positive bonus for a focused component', () => {
    const bonus = applyFocusBonus(10, 'hide', { hide: 2 });
    expect(bonus).toBeGreaterThan(10);
  });

  it('more focus points on a component only ever increases its result', () => {
    const low = applyFocusBonus(10, 'hide', { hide: 1 });
    const high = applyFocusBonus(10, 'hide', { hide: 5 });
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(10);
  });

  it('never affects a different component, however heavily another is focused', () => {
    const unfocusedWithNoAllocation = applyFocusBonus(10, 'silk', EMPTY_FOCUS_ALLOCATION);
    const unfocusedWithOtherFullyFocused = applyFocusBonus(10, 'silk', {
      hide: FOCUS_POINT_BUDGET,
    });
    expect(unfocusedWithOtherFullyFocused).toBe(unfocusedWithNoAllocation);
  });
});

describe('applyFocusTierBonus: shifts the #1142 harvest tier ladder upward only', () => {
  it('leaves an unfocused component tier unchanged', () => {
    expect(applyFocusTierBonus('common', 'hide', EMPTY_FOCUS_ALLOCATION)).toBe('common');
    expect(applyFocusTierBonus('common', 'hide', { fang: POINTS_PER_TIER_BONUS })).toBe('common');
  });

  it('raises the tier by one step at POINTS_PER_TIER_BONUS points', () => {
    expect(applyFocusTierBonus('common', 'hide', { hide: POINTS_PER_TIER_BONUS })).toBe('uncommon');
  });

  it('a focused component measurably outperforms the same component unfocused, all else equal', () => {
    const unfocused = applyFocusTierBonus('poor', 'hide', EMPTY_FOCUS_ALLOCATION);
    const focused = applyFocusTierBonus('poor', 'hide', { hide: POINTS_PER_TIER_BONUS });
    expect(focused).not.toBe(unfocused);
  });

  it('caps the shift at MAX_FOCUS_TIER_BONUS steps even with the full budget on one component', () => {
    // poor(0) + budget(10)/5 = 2 steps -> uncommon(2), never legendary.
    expect(applyFocusTierBonus('poor', 'hide', { hide: FOCUS_POINT_BUDGET })).toBe('uncommon');
  });

  it('never pushes past the top of the tier ladder', () => {
    expect(applyFocusTierBonus('legendary', 'hide', { hide: FOCUS_POINT_BUDGET })).toBe(
      'legendary',
    );
  });
});

describe('isInTownZone: the town-tag stand-in (zone hub circle)', () => {
  it('is true at the hub center', () => {
    expect(isInTownZone({ x: ZONE1.hub.x, z: ZONE1.hub.z }, ZONE1)).toBe(true);
  });

  it('is false far outside the hub radius', () => {
    expect(isInTownZone({ x: ZONE1.hub.x + ZONE1.hub.radius * 10, z: ZONE1.hub.z }, ZONE1)).toBe(
      false,
    );
  });
});

describe('setTownFocus: gated on town, budget-capped, rejects leave prior state untouched', () => {
  it('denies setting focus while not in town, leaving the previous allocation', () => {
    const previous = { hide: 3 };
    const result = setTownFocus(previous, { fang: 5 }, false);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_in_town');
    expect(result.allocation).toEqual(previous);
  });

  it('accepts a valid in-budget allocation while in town', () => {
    const result = setTownFocus({}, { hide: 4, fang: 3 }, true);
    expect(result.ok).toBe(true);
    expect(result.allocation).toEqual({ hide: 4, fang: 3 });
  });

  it('rejects an allocation whose total exceeds FOCUS_POINT_BUDGET, keeping the previous state', () => {
    const previous = { hide: 2 };
    const result = setTownFocus(previous, { hide: FOCUS_POINT_BUDGET + 1 }, true);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('over_budget');
    expect(result.allocation).toEqual(previous);
  });

  it('rejects negative or non-integer points', () => {
    const previous = {};
    expect(setTownFocus(previous, { hide: -1 }, true).ok).toBe(false);
    expect(setTownFocus(previous, { hide: 1.5 }, true).ok).toBe(false);
  });

  it('drops zero-point entries from the resulting allocation', () => {
    const result = setTownFocus({}, { hide: 3, fang: 0 }, true);
    expect(result.ok).toBe(true);
    expect(result.allocation).toEqual({ hide: 3 });
  });
});

// #2511: the allocation's point VALUES were validated but its KEYS were not
// (only an empty string was refused), so every surviving key was copied into
// the returned allocation, stored on PlayerMeta.townFocus, saved, and reloaded.
// A hand-crafted set_town_focus frame could therefore park arbitrary strings in
// a character save and keep them there across sessions.
//
// The ruling, and the reason it is REJECT rather than drop-the-unknown-keys:
// the check widens the empty-string refusal that already sat on this exact
// line, so it is the same shape and the same reason code rather than a new
// partial-accept mode. Nothing is consumed by a refused request, so retrying is
// free (unlike the #2504 harvest pick, where a single-use corpse was at stake
// and "ignored entirely" was therefore the kinder rule).
describe('setTownFocus rejects a key that is not a real component family (#2511)', () => {
  const PREVIOUS = { hide: 2 } as const;

  function rejects(requested: Record<string, number>): void {
    const result = setTownFocus(PREVIOUS, requested, true);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_allocation');
    // The whole point of the issue: nothing from the request reaches the
    // allocation that gets persisted.
    expect(result.allocation).toEqual(PREVIOUS);
  }

  it('refuses the issue frame, and the previous allocation survives it', () => {
    rejects({ not_a_real_tag: 5 });
  });

  it('refuses a real tag vocabulary word that no harvest item maps', () => {
    // claw/tusk/gills/horn are carried by shipped mobs but map to no item. They
    // are the narrow-vs-wide allowlist call: allowed here, a persisted
    // `{ gills: 1 }` would make the omitted-components harvest default derive
    // an all-unmapped pick and take the #2509 refusal on every plain interact
    // press (tests/corpse_harvest_sim.test.ts measures that on old_greyjaw).
    for (const tag of ['claw', 'tusk', 'gills', 'horn']) rejects({ [tag]: 3 });
  });

  it('refuses an unknown key sitting beside a perfectly good one', () => {
    rejects({ hide: 3, not_a_real_tag: 1 });
  });

  it('refuses an ALL-unknown allocation too: one rule, no boundary exception', () => {
    rejects({ not_a_real_tag: 1, another_fake: 2 });
  });

  it('still refuses the empty-string key this check subsumes', () => {
    // The pre-#2511 body rejected '' explicitly. Deleting that line in favor of
    // the allowlist must not quietly re-open it, and nothing else covered it.
    rejects({ '': 3 });
    rejects({ '': 0 });
  });

  it('refuses an inherited Object.prototype name, which a truthy map lookup would accept', () => {
    // The reason the allowlist is a Set and not `!!HARVEST_COMPONENT_ITEMS[k]`:
    // the map is a plain object literal, so all four of these read back truthy
    // off the prototype. They reach the sim as real own keys (the server's wire
    // loop copies entries onto a fresh object), unlike `__proto__`, which that
    // same loop swallows through the prototype setter.
    for (const name of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(!!(HARVEST_COMPONENT_ITEMS as Record<string, unknown>)[name]).toBe(true);
      expect(isTownFocusComponent(name)).toBe(false);
      rejects({ [name]: 1 });
    }
  });

  it('refuses the numeric-string keys an array payload decays to', () => {
    // server/game.ts admits any `typeof msg.allocation === 'object'`, and
    // Object.entries([7]) is [['0', 7]].
    rejects(Object.fromEntries(Object.entries([7, 3])));
  });

  it('refuses a zero-valued unknown key, though the commit loop would have dropped it', () => {
    // Stated because it IS a widening past the security bug: `{ hide: 3,
    // junk: 0 }` was accepted before. One rule reading the same at every value
    // is worth more than the exception, and no shipped client can send this
    // (stepTownFocus deletes a component when it reaches zero).
    rejects({ hide: 3, junk: 0 });
  });

  it('answers invalid_allocation, not over_budget, when a bad key is also over budget', () => {
    // Precedence is decided, not incidental: the key check returns from inside
    // the entry loop and the budget test runs after it. Pinned so a future
    // reorder has to argue with a test.
    const result = setTownFocus(PREVIOUS, { leather: FOCUS_POINT_BUDGET + 999 }, true);
    expect(result.reason).toBe('invalid_allocation');
    // Contrast, same shape and the same over-budget total on a REAL family, so
    // this pin cannot pass by answering invalid_allocation to everything.
    expect(setTownFocus(PREVIOUS, { hide: FOCUS_POINT_BUDGET + 999 }, true).reason).toBe(
      'over_budget',
    );
  });

  it('answers not_in_town first: the town gate still outranks a bad key', () => {
    const result = setTownFocus(PREVIOUS, { not_a_real_tag: 5 }, false);
    expect(result.reason).toBe('not_in_town');
    expect(result.allocation).toEqual(PREVIOUS);
  });

  it('accepts every component the shipped panel can offer', () => {
    // The contract that matters to a real player, and the reason the allowlist
    // has ONE definition (src/ui/town_focus_view.ts re-exports the sim's):
    // no row the panel renders can be a key the command boundary refuses.
    // Driven from the PANEL's export against the real validator, so a future
    // change that re-derives the list separately has to red this rather than
    // compare a constant with itself.
    expect(PANEL_COMPONENTS.length).toBeGreaterThan(1);
    expect([...PANEL_COMPONENTS]).toEqual([...TOWN_FOCUS_COMPONENTS]);
    for (const component of PANEL_COMPONENTS) {
      expect(isTownFocusComponent(component)).toBe(true);
      const result = setTownFocus({}, { [component]: 1 }, true);
      expect(result.ok, component).toBe(true);
      expect(result.allocation).toEqual({ [component]: 1 });
    }
    // A full-budget spread over real families still commits unchanged, and a
    // budget-exact re-spec off a previous allocation is untouched.
    const spread = { hide: 4, fang: 3, silk: 3 };
    expect(setTownFocus({ meat: 10 }, spread, true)).toEqual({ ok: true, allocation: spread });
  });

  it('has no key the allowlist admits that the item table does not map', () => {
    // The other direction, so the allowlist cannot quietly widen: every member
    // maps to a real harvest item, which is what makes focus on it do anything.
    for (const component of TOWN_FOCUS_COMPONENTS) {
      expect(HARVEST_COMPONENT_ITEMS[component], component).toBeTruthy();
    }
    expect(isTownFocusComponent('__proto__')).toBe(false);
  });
});

describe('normalizeTownFocusOnLoad: an older save self-heals (#2511)', () => {
  it('drops unknown keys and keeps the real ones, at their points', () => {
    expect(normalizeTownFocusOnLoad({ hide: 4, eastbrook: 4, fang: 2 })).toEqual({
      hide: 4,
      fang: 2,
    });
  });

  it('drops every key when the whole saved allocation is junk', () => {
    expect(normalizeTownFocusOnLoad({ eastbrook: 4, claw: 1 })).toEqual({});
  });

  it('returns a fresh empty allocation for a missing or empty save', () => {
    expect(normalizeTownFocusOnLoad(undefined)).toEqual({});
    expect(normalizeTownFocusOnLoad(null)).toEqual({});
    expect(normalizeTownFocusOnLoad({})).toEqual({});
  });

  it('normalizes to the shape setTownFocus commits: positive integers only', () => {
    const loaded = normalizeTownFocusOnLoad({
      hide: 0,
      fang: -2,
      silk: 1.5,
      meat: Number.NaN,
      cloth: 3,
    } as Record<string, number>);
    expect(loaded).toEqual({ cloth: 3 });
  });

  it('leaves an over-budget total alone: only the command boundary owns the budget', () => {
    // Deliberate. A budget lowered by later tuning must not silently delete a
    // legitimate allocation, and the next set_town_focus re-validates the whole
    // request anyway.
    const saved = { hide: FOCUS_POINT_BUDGET, fang: FOCUS_POINT_BUDGET };
    expect(normalizeTownFocusOnLoad(saved)).toEqual(saved);
  });

  it('copies rather than aliases, so a later edit cannot write back into the save', () => {
    const saved = { hide: 4 };
    const loaded = normalizeTownFocusOnLoad(saved);
    loaded.hide = 9;
    expect(saved.hide).toBe(4);
  });

  it('never returns a key setTownFocus would then refuse', () => {
    // The two halves of the fix agree by construction, pinned by driving both.
    const junked = { hide: 3, eastbrook: 4, '': 1, constructor: 2, gills: 5 };
    const loaded = normalizeTownFocusOnLoad(junked);
    expect(setTownFocus({}, loaded, true).ok).toBe(true);
    // ...and the raw save would NOT have been accepted, so this is not vacuous.
    expect(setTownFocus({}, junked, true).ok).toBe(false);
  });
});

describe('computeRespecCost (#1144): three payment tiers for the same reallocation', () => {
  it('costs nothing at any tier for a no-op reallocation', () => {
    const previous = { hide: 4 };
    for (const tier of Object.keys(RESPEC_TIER_CONFIG) as (keyof typeof RESPEC_TIER_CONFIG)[]) {
      const cost = computeRespecCost(previous, previous, tier);
      expect(cost).toEqual({ durationMs: 0, coin: 0, materials: 0 });
    }
  });

  it('an instant, coin-and-materials re-spec completes faster than a time-only one', () => {
    const previous = { hide: 2 };
    const requested = { hide: 6, fang: 1 };
    const timeOnly = computeRespecCost(previous, requested, 'time');
    const partial = computeRespecCost(previous, requested, 'timeAndPartial');
    const instant = computeRespecCost(previous, requested, 'instant');
    expect(instant.durationMs).toBeLessThan(partial.durationMs);
    expect(partial.durationMs).toBeLessThan(timeOnly.durationMs);
  });

  it('coin and material cost rise as duration falls, tier by tier', () => {
    const previous = { hide: 2 };
    const requested = { hide: 6 };
    const timeOnly = computeRespecCost(previous, requested, 'time');
    const partial = computeRespecCost(previous, requested, 'timeAndPartial');
    const instant = computeRespecCost(previous, requested, 'instant');
    expect(timeOnly.coin).toBe(0);
    expect(timeOnly.materials).toBe(0);
    expect(partial.coin).toBeGreaterThan(0);
    expect(instant.coin).toBeGreaterThan(partial.coin);
    expect(instant.materials).toBeGreaterThan(partial.materials);
  });

  it('scales linearly with the number of points actually moved', () => {
    const previous = { hide: 0 };
    const small = computeRespecCost(previous, { hide: 2 }, 'time');
    const large = computeRespecCost(previous, { hide: 4 }, 'time');
    expect(large.durationMs).toBe(small.durationMs * 2);
  });

  it('counts points moved away from a component the same as points moved onto one', () => {
    const previous = { hide: 5, fang: 0 };
    const cost = computeRespecCost(previous, { hide: 0, fang: 5 }, 'time');
    expect(cost.durationMs).toBe(10 * RESPEC_TIER_CONFIG.time.durationMsPerPoint);
  });
});
