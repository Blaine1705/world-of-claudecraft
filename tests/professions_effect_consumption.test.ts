import { describe, expect, it } from 'vitest';
import { TOOL_EFFECT_IDS, TOOL_EFFECTS } from '../src/sim/content/professions';
import type { MaterialRarity } from '../src/sim/professions/gathering';
import {
  depleteEffect,
  RARITY_DURABILITY_BONUS,
  rechargeEffect,
  resolveToolEffectUse,
  slotEffect,
  startingDurabilityFor,
} from '../src/sim/professions/tools';

// Effect charge consumption. This file used to pin a PROBABILISTIC curve: a
// slotted effect rolled `Rng.chance` per use at a rate scaled by how far the
// tool's rarity outclassed the target's, and the roll happened even at zero
// durability so the depletion sequence stayed independent of remaining
// charges.
//
// That model could not be wired. The live harvest path draws exactly twice per
// granted harvest and is golden-pinned there, so a depletion roll would have
// been a THIRD draw for every player who owned a slot, and the pinned contract
// would have held only for players who owned none. The rarity intent moved to
// where it costs nothing: rarity now buys CHARGES up front instead of
// discounting a hidden per-use rate.
//
// So the assertions below are about a deterministic ladder and a draw-free
// decrement. The draw-count contract itself is pinned where it can actually be
// observed, against the real harvest path, in tests/gathering.test.ts.
const RARITY_LADDER: readonly MaterialRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

describe('rarity buys charges, and spending one draws nothing', () => {
  it('starting charges are the catalog base plus one rarity step per rung', () => {
    for (const effectId of TOOL_EFFECT_IDS) {
      const base = TOOL_EFFECTS[effectId].startingDurability;
      RARITY_LADDER.forEach((rarity, rung) => {
        expect(startingDurabilityFor(effectId, rarity), `${effectId} at ${rarity}`).toBe(
          base + RARITY_DURABILITY_BONUS * rung,
        );
      });
    }
  });

  it('the ladder is strictly increasing, so a rarer tool is never a downgrade', () => {
    for (const effectId of TOOL_EFFECT_IDS) {
      for (let i = 1; i < RARITY_LADDER.length; i++) {
        expect(
          startingDurabilityFor(effectId, RARITY_LADDER[i]),
          `${effectId}: ${RARITY_LADDER[i]} vs ${RARITY_LADDER[i - 1]}`,
        ).toBeGreaterThan(startingDurabilityFor(effectId, RARITY_LADDER[i - 1]));
      }
    }
    // The step is load-bearing rather than decorative: a zero bonus would
    // satisfy every "is a number" check above while flattening the ladder.
    expect(RARITY_DURABILITY_BONUS).toBeGreaterThan(0);
  });

  it('slotEffect mints at the tool rarity it was given, and defaults to common', () => {
    const epic = slotEffect('gatherers_cache', { toolRarity: 'epic' });
    expect(epic.durability).toBe(startingDurabilityFor('gatherers_cache', 'epic'));
    expect(epic.maxDurability).toBe(epic.durability);
    const defaulted = slotEffect('gatherers_cache');
    expect(defaulted.durability).toBe(startingDurabilityFor('gatherers_cache', 'common'));
    // The default is the BOTTOM of the ladder, not merely some rung: a default
    // of 'epic' would also pass a "has a default" check.
    expect(defaulted.durability).toBeLessThan(epic.durability);
  });

  it('spends exactly one charge per fire, with no rng parameter to spend', () => {
    const slot = slotEffect('gatherers_cache', { toolRarity: 'rare' });
    const start = slot.durability;
    // depleteEffect takes ONE argument. A depletion roll cannot be
    // reintroduced without changing this call, which is the point: the
    // draw-free contract is enforced by the signature, not by discipline.
    expect(depleteEffect.length).toBe(1);
    for (let i = 1; i <= 5; i++) {
      expect(depleteEffect(slot)).toBe(true);
      expect(slot.durability).toBe(start - i);
    }
  });

  it('a depleted slot stops decrementing and reports that it did not', () => {
    const slot = slotEffect('gatherers_cache');
    slot.durability = 1;
    expect(depleteEffect(slot)).toBe(true);
    expect(slot.durability).toBe(0);
    expect(depleteEffect(slot)).toBe(false);
    expect(slot.durability).toBe(0); // never negative
    expect(depleteEffect(undefined)).toBe(false);
  });

  it('an unconfirmed prompt slot spends nothing and changes nothing', () => {
    const slot = slotEffect('gatherers_cache', { confirmMode: 'prompt', toolRarity: 'epic' });
    const before = slot.durability;
    const outcome = { quantity: 2, gradeToolTier: 3 };
    const result = resolveToolEffectUse(slot, outcome, false);
    expect(result.applied).toBe(false);
    expect(result.depleted).toBe(false);
    expect(result.outcome).toEqual(outcome);
    expect(slot.durability).toBe(before);
    // Confirming it fires and spends, so the arm above is a refusal rather
    // than a slot that never worked at all.
    const confirmed = resolveToolEffectUse(slot, outcome, true);
    expect(confirmed.applied).toBe(true);
    expect(confirmed.depleted).toBe(true);
    expect(slot.durability).toBe(before - 1);
  });

  it('a recharge restores the charges THIS slot was minted with, not the catalog base', () => {
    // The trap this pins: restoring to TOOL_EFFECTS[id].startingDurability
    // would silently demote an epic tool's slot to a common one's count on its
    // first recharge, and every assertion about "full again" would still pass.
    const slot = slotEffect('gatherers_cache', { toolRarity: 'epic', craftedBy: 'p1' });
    const minted = slot.durability;
    expect(minted).toBeGreaterThan(TOOL_EFFECTS.gatherers_cache.startingDurability);
    slot.durability = 0;
    const result = rechargeEffect(slot, 'p1', 99);
    expect(result.success).toBe(true);
    expect(slot.durability).toBe(minted);
    expect(slot.durability).not.toBe(TOOL_EFFECTS.gatherers_cache.startingDurability);
  });

  it('a failed recharge leaves the slot untouched', () => {
    const slot = slotEffect('gatherers_cache', { toolRarity: 'rare', craftedBy: 'p1' });
    slot.durability = 3;
    const result = rechargeEffect(slot, 'p1', 0);
    expect(result.success).toBe(false);
    expect(slot.durability).toBe(3);
  });
});
