import { describe, expect, it } from 'vitest';
import {
  effectiveFocusComponents,
  harvestTierQuantity,
  isHarvestableCorpse,
  resolveCorpseFocusHarvest,
  resolveCorpseHarvest,
} from '../src/sim/professions/gathering';
import { Rng } from '../src/sim/rng';

const TIER_INDEX: Record<string, number> = {
  poor: 0,
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

describe('resolveCorpseHarvest: single-use, first-come corpse claim', () => {
  it('lets the first attempt against an unclaimed corpse succeed', () => {
    const claim = resolveCorpseHarvest(null, 1);
    expect(claim).toEqual({ success: true, claimedBy: 1 });
  });

  it('denies a second attempt once the corpse is claimed', () => {
    const first = resolveCorpseHarvest(null, 1);
    const second = resolveCorpseHarvest(first.claimedBy, 2);
    expect(second).toEqual({ success: false, claimedBy: 1 });
  });

  it('denies a later solo attempt against an already-claimed corpse', () => {
    const claim = resolveCorpseHarvest(7, 42);
    expect(claim).toEqual({ success: false, claimedBy: 7 });
  });

  it('is deterministic regardless of call order for the same starting state', () => {
    // Two independent resolutions against the SAME unclaimed state, in either
    // order, always produce "first caller wins, second caller denied": the
    // function itself has no hidden state to make order matter beyond whichever
    // caller happens to run it first against the still-null corpse.
    const runA = () => {
      const a = resolveCorpseHarvest(null, 10);
      const b = resolveCorpseHarvest(a.claimedBy, 20);
      return [a, b];
    };
    const runB = () => {
      const a = resolveCorpseHarvest(null, 10);
      const b = resolveCorpseHarvest(a.claimedBy, 20);
      return [a, b];
    };
    expect(runA()).toEqual(runB());
  });

  it('the claiming player is always the one recorded, never the denied one', () => {
    const claim = resolveCorpseHarvest(null, 99);
    expect(claim.claimedBy).toBe(99);
    const denied = resolveCorpseHarvest(claim.claimedBy, 100);
    expect(denied.claimedBy).toBe(99);
  });
});

describe('isHarvestableCorpse', () => {
  it('is false with no component tags', () => {
    expect(isHarvestableCorpse(undefined)).toBe(false);
    expect(isHarvestableCorpse([])).toBe(false);
  });

  it('is true with at least one component tag', () => {
    expect(isHarvestableCorpse(['hide'])).toBe(true);
  });
});

describe('resolveCorpseFocusHarvest: concentrate vs spread tradeoff (#1142)', () => {
  const TAGS = ['hide', 'fang', 'claw', 'horn'];

  function meanTierIndex(componentTags: string[], chosen: string[], seed: number, trials: number) {
    const rng = new Rng(seed);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < trials; i++) {
      const yields = resolveCorpseFocusHarvest(componentTags, chosen, rng);
      for (const y of yields) {
        sum += TIER_INDEX[y.tier];
        count++;
      }
    }
    return sum / count;
  }

  it('focusing on 1 of 4 tagged components yields a strictly higher average tier than spreading across all 4', () => {
    const trials = 2000;
    const focusedMean = meanTierIndex(TAGS, ['hide'], 1, trials);
    const spreadMean = meanTierIndex(TAGS, TAGS, 2, trials);
    expect(focusedMean).toBeGreaterThan(spreadMean);
  });

  it('draws from the passed-in Rng (deterministic for a fixed seed)', () => {
    const runA = resolveCorpseFocusHarvest(TAGS, ['hide'], new Rng(7));
    const runB = resolveCorpseFocusHarvest(TAGS, ['hide'], new Rng(7));
    expect(runA).toEqual(runB);
  });

  it('an empty selection spreads across every tagged component (back-compat default)', () => {
    const rng1 = new Rng(5);
    const rng2 = new Rng(5);
    const empty = resolveCorpseFocusHarvest(TAGS, [], rng1);
    const all = resolveCorpseFocusHarvest(TAGS, TAGS, rng2);
    expect(empty).toEqual(all);
  });

  it('selecting every tagged component behaves identically to the pre-#1142 spread (zero bonus)', () => {
    const rng = new Rng(3);
    const yields = resolveCorpseFocusHarvest(TAGS, TAGS, rng);
    expect(yields.map((y) => y.component)).toEqual(TAGS);
  });

  it('ignores a chosen tag that is not actually on the corpse', () => {
    const rng = new Rng(9);
    const yields = resolveCorpseFocusHarvest(TAGS, ['hide', 'not_a_real_tag'], rng);
    expect(yields.map((y) => y.component)).toEqual(['hide']);
  });

  it('is monotonic: for the SAME underlying rng draw, choosing fewer components never lowers the tier', () => {
    // Both calls draw from a fresh Rng seeded identically, so the first draw
    // (and thus the unshifted rolled index) is identical for 'hide' in both
    // calls; only the concentration bonus differs. The focused (1-of-4) tier
    // can only be >= the spread (4-of-4) tier, never lower.
    for (let seed = 1; seed <= 50; seed++) {
      const spread = resolveCorpseFocusHarvest(TAGS, TAGS, new Rng(seed));
      const focused = resolveCorpseFocusHarvest(TAGS, ['hide'], new Rng(seed));
      const spreadHide = spread.find((y) => y.component === 'hide');
      const focusedHide = focused.find((y) => y.component === 'hide');
      expect(spreadHide).toBeDefined();
      expect(focusedHide).toBeDefined();
      expect(TIER_INDEX[focusedHide?.tier ?? '']).toBeGreaterThanOrEqual(
        TIER_INDEX[spreadHide?.tier ?? ''],
      );
    }
  });
});

describe('harvestTierQuantity', () => {
  it('increases monotonically from poor (1) to legendary (6)', () => {
    expect(harvestTierQuantity('poor')).toBe(1);
    expect(harvestTierQuantity('common')).toBe(2);
    expect(harvestTierQuantity('uncommon')).toBe(3);
    expect(harvestTierQuantity('rare')).toBe(4);
    expect(harvestTierQuantity('epic')).toBe(5);
    expect(harvestTierQuantity('legendary')).toBe(6);
  });
});

describe('resolveCorpseFocusHarvest: concentrate vs spread tradeoff (#1142)', () => {
  const TAGS = ['hide', 'fang', 'claw', 'horn'];

  function meanTierIndex(componentTags: string[], chosen: string[], seed: number, trials: number) {
    const rng = new Rng(seed);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < trials; i++) {
      const yields = resolveCorpseFocusHarvest(componentTags, chosen, rng);
      for (const y of yields) {
        sum += TIER_INDEX[y.tier];
        count++;
      }
    }
    return sum / count;
  }

  it('focusing on 1 of 4 tagged components yields a strictly higher average tier than spreading across all 4', () => {
    const trials = 2000;
    const focusedMean = meanTierIndex(TAGS, ['hide'], 1, trials);
    const spreadMean = meanTierIndex(TAGS, TAGS, 2, trials);
    expect(focusedMean).toBeGreaterThan(spreadMean);
  });

  it('draws from the passed-in Rng (deterministic for a fixed seed)', () => {
    const runA = resolveCorpseFocusHarvest(TAGS, ['hide'], new Rng(7));
    const runB = resolveCorpseFocusHarvest(TAGS, ['hide'], new Rng(7));
    expect(runA).toEqual(runB);
  });

  it('an empty selection spreads across every tagged component (back-compat default)', () => {
    const rng1 = new Rng(5);
    const rng2 = new Rng(5);
    const empty = resolveCorpseFocusHarvest(TAGS, [], rng1);
    const all = resolveCorpseFocusHarvest(TAGS, TAGS, rng2);
    expect(empty).toEqual(all);
  });

  it('selecting every tagged component behaves identically to the pre-#1142 spread (zero bonus)', () => {
    const rng = new Rng(3);
    const yields = resolveCorpseFocusHarvest(TAGS, TAGS, rng);
    expect(yields.map((y) => y.component)).toEqual(TAGS);
  });

  it('ignores a chosen tag that is not actually on the corpse', () => {
    const rng = new Rng(9);
    const yields = resolveCorpseFocusHarvest(TAGS, ['hide', 'not_a_real_tag'], rng);
    expect(yields.map((y) => y.component)).toEqual(['hide']);
  });

  it('is monotonic: for the SAME underlying rng draw, choosing fewer components never lowers the tier', () => {
    // Both calls draw from a fresh Rng seeded identically, so the first draw
    // (and thus the unshifted rolled index) is identical for 'hide' in both
    // calls; only the concentration bonus differs. The focused (1-of-4) tier
    // can only be >= the spread (4-of-4) tier, never lower.
    for (let seed = 1; seed <= 50; seed++) {
      const spread = resolveCorpseFocusHarvest(TAGS, TAGS, new Rng(seed));
      const focused = resolveCorpseFocusHarvest(TAGS, ['hide'], new Rng(seed));
      const spreadHide = spread.find((y) => y.component === 'hide');
      const focusedHide = focused.find((y) => y.component === 'hide');
      expect(spreadHide).toBeDefined();
      expect(focusedHide).toBeDefined();
      expect(TIER_INDEX[focusedHide?.tier ?? '']).toBeGreaterThanOrEqual(
        TIER_INDEX[spreadHide?.tier ?? ''],
      );
    }
  });
});

describe('harvestTierQuantity', () => {
  it('increases monotonically from poor (1) to legendary (6)', () => {
    expect(harvestTierQuantity('poor')).toBe(1);
    expect(harvestTierQuantity('common')).toBe(2);
    expect(harvestTierQuantity('uncommon')).toBe(3);
    expect(harvestTierQuantity('rare')).toBe(4);
    expect(harvestTierQuantity('epic')).toBe(5);
    expect(harvestTierQuantity('legendary')).toBe(6);
  });
});

// #2474: the focus pick is a SET of component families. `chosen` arrives
// straight off the wire (server/game.ts type-filters the array and forwards it),
// so a repeated tag is a client-supplied value the authoritative sim must not
// act on twice: a corpse is single-use, and a repeat that survived harvested the
// same family once per repeat off one claim.
describe('effectiveFocusComponents collapses a repeated tag (#2474)', () => {
  const TAGS = ['hide', 'fang', 'claw', 'horn'];

  // The pre-#2474 body, verbatim, kept as an independent reference so the
  // "unchanged for a duplicate-free pick" sweep below compares against real
  // prior behavior rather than against the function under test.
  function legacyEffective(
    tagged: readonly string[],
    chosen: readonly string[],
  ): readonly string[] {
    return chosen.length === 0 || chosen.length >= tagged.length
      ? tagged
      : chosen.filter((c) => tagged.includes(c));
  }

  function subsets<T>(items: readonly T[]): T[][] {
    return items.reduce<T[][]>((acc, item) => acc.concat(acc.map((s) => [...s, item])), [[]]);
  }

  it('a repeat on the CONCENTRATE arm harvests the family once, not once per repeat', () => {
    // The plain doubling: 2 raw entries against 4 tags stays under the spread
    // threshold, so the old filter arm handed back ['hide','hide'] and the
    // command rolled, granted and logged the hide family twice.
    expect(legacyEffective(TAGS, ['hide', 'hide'])).toEqual(['hide', 'hide']);
    expect(effectiveFocusComponents(TAGS, ['hide', 'hide'])).toEqual(['hide']);
    expect(effectiveFocusComponents(TAGS, ['hide', 'hide', 'hide', 'hide'])).toEqual(['hide']);
  });

  it('a repeat can no longer pad the pick past the SPREAD threshold', () => {
    // The second, quieter half of the same bug: `chosen.length` was the raw
    // count, so on a two-tag corpse ['hide','hide'] cleared `>= tagged.length`
    // and spread across every tag, harvesting fang the caller never asked for
    // (and at bonus 0 instead of the concentration bonus a real one-tag pick
    // earns). Both halves are decided by the dedupe running BEFORE the tests.
    expect(legacyEffective(['hide', 'fang'], ['hide', 'hide'])).toEqual(['hide', 'fang']);
    expect(effectiveFocusComponents(['hide', 'fang'], ['hide', 'hide'])).toEqual(['hide']);
    expect(effectiveFocusComponents(['hide', 'fang'], ['hide'])).toEqual(['hide']);
  });

  it('a pick of repeated JUNK harvests nothing, as a single junk tag already did', () => {
    // The knock-on the padding fix carries, pinned so it reads as intended
    // rather than as a side effect: repeats of a tag that is not on the corpse
    // also used to clear the threshold and spread the whole corpse. One junk
    // tag has always yielded nothing (the arm above it), so collapsing the
    // repeat is what makes the two agree.
    expect(legacyEffective(['hide', 'fang'], ['zzz', 'zzz'])).toEqual(['hide', 'fang']);
    expect(effectiveFocusComponents(['hide', 'fang'], ['zzz', 'zzz'])).toEqual([]);
    expect(effectiveFocusComponents(['hide', 'fang'], ['zzz'])).toEqual([]);
  });

  it('keeps first-occurrence ORDER, the order yields, grants and ledger entries land in', () => {
    // Order is load-bearing (#2457): tag order is yield order is chat-line
    // order. A dedupe that sorted, or that kept the LAST occurrence, would
    // silently reorder the harvest ledger.
    expect(effectiveFocusComponents(TAGS, ['fang', 'hide', 'fang'])).toEqual(['fang', 'hide']);
    expect(effectiveFocusComponents(TAGS, ['claw', 'hide', 'claw', 'fang'])).toEqual([
      'claw',
      'hide',
      'fang',
    ]);
  });

  it('is identical to the pre-#2474 result for EVERY duplicate-free pick', () => {
    // The no-regression half of the acceptance criteria, swept rather than
    // sampled: every subset of a four-tag corpse, in two orders, plus the
    // off-corpse tag and the empty pick. A dedupe that touched a
    // duplicate-free array at all would fail here.
    const picks = subsets(TAGS).flatMap((s) => [s, [...s].reverse()]);
    picks.push(['hide', 'not_a_real_tag'], ['not_a_real_tag'], []);
    for (const pick of picks) {
      expect(effectiveFocusComponents(TAGS, pick), `pick ${JSON.stringify(pick)}`).toEqual(
        legacyEffective(TAGS, pick),
      );
    }
  });

  it('makes a repeated pick draw and yield EXACTLY what its deduped twin does', () => {
    // End of the pure path: same seed, same yields, same number of draws. The
    // draw count is the decisive half, since the rolls are what a doubled
    // harvest spent twice.
    const pairs: [string[], string[]][] = [
      [['hide', 'hide'], ['hide']],
      [
        ['hide', 'hide', 'fang'],
        ['hide', 'fang'],
      ],
      [
        ['fang', 'hide', 'fang'],
        ['fang', 'hide'],
      ],
      [
        ['hide', 'fang', 'hide', 'claw', 'horn'],
        ['hide', 'fang', 'claw', 'horn'],
      ],
    ];
    for (const [dup, deduped] of pairs) {
      for (let seed = 1; seed <= 20; seed++) {
        const label = `${JSON.stringify(dup)} @${seed}`;
        expect(resolveCorpseFocusHarvest(TAGS, dup, new Rng(seed)), label).toEqual(
          resolveCorpseFocusHarvest(TAGS, deduped, new Rng(seed)),
        );
        expect(drawCount(TAGS, dup, seed), `${label} draws`).toBe(drawCount(TAGS, deduped, seed));
      }
    }
    // And the count is genuinely the one a single family costs, so the
    // comparison above is not two equal-but-wrong numbers.
    expect(drawCount(TAGS, ['hide', 'hide'], 3)).toBe(1);
    expect(drawCount(TAGS, ['hide', 'fang'], 3)).toBe(2);
  });

  function drawCount(tagged: string[], chosen: string[], seed: number): number {
    const rng = new Rng(seed);
    let draws = 0;
    rng.setObserver(() => {
      draws++;
    });
    resolveCorpseFocusHarvest(tagged, chosen, rng);
    return draws;
  }
});
