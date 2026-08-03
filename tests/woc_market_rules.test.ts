import { describe, expect, it } from 'vitest';
import {
  antiSnipeExtendedEndMs,
  bondCents,
  listingEligibility,
  listingReturnCustodyRef,
  listingSoldNoticeCustodyRef,
  minIncrementCents,
  minNextBidCents,
  settlementCustodyRef,
  strikeSuspensionMs,
  validListingParams,
  validSettlementTransition,
  WOC_MARKET_BOND_PENDING_TTL_SECONDS,
  WOC_MARKET_BUY_NOW_LOCK_SECONDS,
  WOC_MARKET_MAX_ACTIVE_LISTINGS,
  WOC_MARKET_MAX_PRICE_CENTS,
  WOC_MARKET_MIN_PRICE_CENTS,
  WOC_MARKET_QUOTE_TTL_SECONDS,
  WOC_MARKET_RESTRICTED_POLICY,
  WOC_MARKET_SETTLEMENT_WINDOW_SECONDS,
  WOC_MARKET_STRANDED_RECLAIM_SECONDS,
  type WocEligibilityPolicy,
  type WocListingParams,
  type WocSettlementState,
} from '../server/woc_market_rules';
import type { ItemDef, ItemInstancePayload } from '../src/sim/types';

// Pure, IO-free decision core: every case here is a plain input-to-output pin,
// no clocks, no DB, no fetch (the module takes injected timestamps).

const DAY_MS = 24 * 3600 * 1000;

describe('tunables: literal pins', () => {
  // A constant compared against itself proves nothing (the retention-sweep
  // pin rationale), so every tunable is pinned to its literal: changing one
  // must be a deliberate edit that reddens this block.
  it('pins the quote TTL to 90 s, inside the PRD 60 to 120 second band', () => {
    expect(WOC_MARKET_QUOTE_TTL_SECONDS).toBe(90);
    expect(WOC_MARKET_QUOTE_TTL_SECONDS).toBeGreaterThanOrEqual(60);
    expect(WOC_MARKET_QUOTE_TTL_SECONDS).toBeLessThanOrEqual(120);
  });

  it('pins the settlement window, bond TTL, listing cap, price rails, and reclaim grace', () => {
    expect(WOC_MARKET_SETTLEMENT_WINDOW_SECONDS).toBe(600);
    expect(WOC_MARKET_BOND_PENDING_TTL_SECONDS).toBe(300);
    expect(WOC_MARKET_MAX_ACTIVE_LISTINGS).toBe(12);
    expect(WOC_MARKET_MIN_PRICE_CENTS).toBe(25);
    expect(WOC_MARKET_MAX_PRICE_CENTS).toBe(5_000_000);
    expect(WOC_MARKET_STRANDED_RECLAIM_SECONDS).toBe(300);
  });

  it('keeps the buy-now lock STRICTLY longer than one quote lifetime', () => {
    // An honest buyer whose first quote expires must still have lock window
    // left to request a fresh one; an equal or shorter lock silently strands
    // every first-quote-expired buy-now.
    expect(WOC_MARKET_BUY_NOW_LOCK_SECONDS).toBeGreaterThan(WOC_MARKET_QUOTE_TTL_SECONDS);
  });
});

describe('minIncrementCents: the increment ladder band edges', () => {
  // Band edges belong to the HIGHER band (the doc comment's contract), so both
  // sides of every boundary are pinned.
  it.each([
    [999, 25],
    [1000, 100],
    [4999, 100],
    [5000, 500],
    [19999, 500],
    [20000, 1000],
  ])('current %i cents steps by %i cents', (current, step) => {
    expect(minIncrementCents(current)).toBe(step);
  });
});

describe('minNextBidCents', () => {
  it('is the start price when no bid is standing', () => {
    expect(minNextBidCents(null, 2500)).toBe(2500);
  });

  it('is the standing bid plus its own ladder increment', () => {
    expect(minNextBidCents(999, 25)).toBe(999 + 25);
    expect(minNextBidCents(5000, 25)).toBe(5000 + 500);
    expect(minNextBidCents(20000, 25)).toBe(20000 + 1000);
  });
});

describe('antiSnipeExtendedEndMs', () => {
  it('does not extend for a bid outside the final window', () => {
    // 120_001 ms before the end: one ms outside the 120 s window.
    expect(antiSnipeExtendedEndMs(879_999, 1_000_000, 1_000_000)).toBeNull();
  });

  it('extends an in-window bid to bidAtMs + 120 s', () => {
    expect(antiSnipeExtendedEndMs(940_000, 1_000_000, 1_000_000)).toBe(940_000 + 120_000);
  });

  it('caps the extension at exactly baseEndsAtMs + 1800 s', () => {
    // The auction has already been extended to 2_750_000; a late bid would
    // reach 2_820_000 but the cap from the ORIGINAL end (1_000_000) clamps it.
    expect(antiSnipeExtendedEndMs(2_700_000, 2_750_000, 1_000_000)).toBe(1_000_000 + 1_800_000);
  });

  it('does not extend a bid landing at or after the end', () => {
    expect(antiSnipeExtendedEndMs(1_000_000, 1_000_000, 1_000_000)).toBeNull();
    expect(antiSnipeExtendedEndMs(1_000_001, 1_000_000, 1_000_000)).toBeNull();
  });

  it('does not move the end backward when the cap is already spent', () => {
    // endsAtMs already sits at the cap; the would-be extension clamps to the
    // same instant, which is not forward, so the bid does not extend.
    expect(antiSnipeExtendedEndMs(2_750_000, 2_800_000, 1_000_000)).toBeNull();
  });

  it('does not re-issue an end the auction already has (bid + 120 s == end)', () => {
    // The window admits a bid exactly 120 s out, but its extension lands
    // exactly ON the current end: equal is not forward, so null.
    expect(antiSnipeExtendedEndMs(880_000, 1_000_000, 5_000_000)).toBeNull();
  });
});

describe('bondCents: 5% clamped to $1 .. $50, never above the bid', () => {
  it('takes 5% mid-range', () => {
    expect(bondCents(10_000)).toBe(500);
  });

  it('clamps up to the $1 minimum', () => {
    expect(bondCents(1000)).toBe(100);
  });

  it('clamps down to the $50 maximum', () => {
    expect(bondCents(2_000_000)).toBe(5000);
  });

  it('never exceeds the bid itself', () => {
    expect(bondCents(50)).toBe(50);
  });
});

describe('strikeSuspensionMs: the progressive suspension ladder', () => {
  it.each([
    [1, 0],
    [2, 3 * DAY_MS],
    [3, 14 * DAY_MS],
    [4, 90 * DAY_MS],
    [5, 365 * DAY_MS],
    [9, 365 * DAY_MS],
  ])('strike %i suspends for %i ms', (strikes, ms) => {
    expect(strikeSuspensionMs(strikes)).toBe(ms);
  });
});

describe('validListingParams', () => {
  const params = (over: Partial<WocListingParams> = {}): WocListingParams => ({
    format: 'auction',
    startCents: 1000,
    reserveCents: null,
    buyNowCents: null,
    durationHours: 24,
    offerNext: false,
    ...over,
  });

  it('refuses an unknown format', () => {
    expect(validListingParams(params({ format: 'dutch' as WocListingParams['format'] }))).toEqual({
      ok: false,
      reason: 'bad_format',
    });
  });

  it('refuses a start below the price floor', () => {
    expect(validListingParams(params({ startCents: WOC_MARKET_MIN_PRICE_CENTS - 1 }))).toEqual({
      ok: false,
      reason: 'bad_start',
    });
  });

  it('refuses a start above the price ceiling', () => {
    expect(validListingParams(params({ startCents: WOC_MARKET_MAX_PRICE_CENTS + 1 }))).toEqual({
      ok: false,
      reason: 'bad_start',
    });
  });

  it('refuses a non-integer start (values are integer cents)', () => {
    expect(validListingParams(params({ startCents: 100.5 }))).toEqual({
      ok: false,
      reason: 'bad_start',
    });
  });

  it('refuses a duration off the fixed allowlist', () => {
    expect(validListingParams(params({ durationHours: 10 }))).toEqual({
      ok: false,
      reason: 'bad_duration',
    });
  });

  it('refuses a buy-now format with no buy-now price', () => {
    expect(validListingParams(params({ format: 'buy_now', buyNowCents: null }))).toEqual({
      ok: false,
      reason: 'bad_buy_now',
    });
  });

  it('refuses the retired combined format outright', () => {
    // 'auction_buy_now' is no longer creatable: an auction already ends early on
    // a buy-now and a plain buy-now covers the fixed-price case. Refused at the
    // FORMAT gate, before any price check, so the seller is told the format is
    // gone rather than being sent to fix prices on a listing they cannot make.
    expect(
      validListingParams(
        params({
          format: 'auction_buy_now' as never,
          startCents: 1000,
          reserveCents: 2000,
          buyNowCents: 3000,
        }),
      ),
    ).toEqual({ ok: false, reason: 'bad_format' });
    // Even a perfectly formed one.
    expect(validListingParams(params({ format: 'auction_buy_now' as never }))).toEqual({
      ok: false,
      reason: 'bad_format',
    });
  });

  it('refuses a buy-now price on a plain auction', () => {
    expect(validListingParams(params({ format: 'auction', buyNowCents: 2000 }))).toEqual({
      ok: false,
      reason: 'bad_buy_now',
    });
  });

  it('refuses a buy-now price at or below the starting bid', () => {
    // STRICTLY above, not merely at it. A buy-now equal to the start is not a
    // price, it is the same number twice: the opening bid would already match it.
    expect(
      validListingParams(params({ format: 'buy_now', startCents: 1000, buyNowCents: 1000 })),
    ).toEqual({ ok: false, reason: 'bad_buy_now' });
    expect(
      validListingParams(params({ format: 'buy_now', startCents: 1000, buyNowCents: 999 })),
    ).toEqual({ ok: false, reason: 'bad_buy_now' });
    expect(
      validListingParams(params({ format: 'buy_now', startCents: 1000, buyNowCents: 500 })),
    ).toEqual({ ok: false, reason: 'bad_buy_now' });
    // One cent above is the boundary, and it is accepted.
    expect(
      validListingParams(params({ format: 'buy_now', startCents: 1000, buyNowCents: 1001 })),
    ).toEqual({ ok: true });
  });

  it('refuses a reserve below the starting bid', () => {
    expect(validListingParams(params({ startCents: 1000, reserveCents: 500 }))).toEqual({
      ok: false,
      reason: 'bad_reserve',
    });
  });

  it('refuses a reserve on a pure buy-now listing', () => {
    expect(
      validListingParams(params({ format: 'buy_now', reserveCents: 1000, buyNowCents: 1000 })),
    ).toEqual({ ok: false, reason: 'bad_reserve' });
  });

  it('accepts a plain auction, with and without a reserve at or above the start', () => {
    expect(validListingParams(params())).toEqual({ ok: true });
    expect(validListingParams(params({ reserveCents: 1000 }))).toEqual({ ok: true });
    expect(validListingParams(params({ reserveCents: 2500 }))).toEqual({ ok: true });
  });

  it('accepts a pure buy-now listing priced above the start', () => {
    expect(
      validListingParams(
        params({ format: 'buy_now', startCents: 1000, buyNowCents: 2500, durationHours: 12 }),
      ),
    ).toEqual({ ok: true });
  });

  it('only auction and buy_now are creatable', () => {
    // The whole creatable set, pinned. A third format reappearing (or one of
    // these disappearing) should fail here rather than in a UI review.
    for (const format of ['auction', 'buy_now'] as const) {
      const p =
        format === 'buy_now'
          ? params({ format, startCents: 1000, buyNowCents: 2000 })
          : params({ format, startCents: 1000 });
      expect(validListingParams(p), format).toEqual({ ok: true });
    }
    for (const format of ['auction_buy_now', 'dutch', '', 'AUCTION']) {
      expect(validListingParams(params({ format: format as never })), format).toEqual({
        ok: false,
        reason: 'bad_format',
      });
    }
  });
});

describe('listingEligibility', () => {
  // Minimal synthetic defs: each case flips exactly one property off an
  // otherwise-eligible epic chest piece, so the refusal reason is decisive.
  const equipDef = (over: Record<string, unknown> = {}): ItemDef =>
    ({
      id: 'syn_plate',
      name: 'Synthetic Plate',
      kind: 'armor',
      armorType: 'plate',
      slot: 'chest',
      quality: 'epic',
      sellValue: 10,
      ...over,
    }) as unknown as ItemDef;

  const policy = WOC_MARKET_RESTRICTED_POLICY;

  it('accepts eligible epic equipment', () => {
    expect(listingEligibility(equipDef(), undefined, policy)).toEqual({ ok: true });
  });

  it('refuses an unknown item', () => {
    expect(listingEligibility(undefined, undefined, policy)).toEqual({
      ok: false,
      reason: 'unknown_item',
    });
  });

  it('refuses a soulbound def', () => {
    expect(listingEligibility(equipDef({ soulbound: true }), undefined, policy)).toEqual({
      ok: false,
      reason: 'soulbound',
    });
  });

  it('refuses a quest item', () => {
    expect(listingEligibility(equipDef({ kind: 'quest' }), undefined, policy)).toEqual({
      ok: false,
      reason: 'quest_item',
    });
  });

  it('refuses a def barred from market listing', () => {
    expect(listingEligibility(equipDef({ noMarketList: true }), undefined, policy)).toEqual({
      ok: false,
      reason: 'no_market_list',
    });
  });

  it('refuses a character-bound copy via instance.boundTo', () => {
    const instance: ItemInstancePayload = { boundTo: 7 };
    expect(listingEligibility(equipDef(), instance, policy)).toEqual({
      ok: false,
      reason: 'bound_copy',
    });
  });

  it('refuses an item on the policy exclusion list', () => {
    const excluding: WocEligibilityPolicy = {
      ...WOC_MARKET_RESTRICTED_POLICY,
      excludedItemIds: new Set(['syn_plate']),
    };
    expect(listingEligibility(equipDef(), undefined, excluding)).toEqual({
      ok: false,
      reason: 'excluded_item',
    });
  });

  it('refuses a def with no equip slot as not an eligible category', () => {
    expect(
      listingEligibility(
        equipDef({ kind: 'tool', slot: undefined, armorType: undefined }),
        undefined,
        policy,
      ),
    ).toEqual({ ok: false, reason: 'not_eligible_category' });
  });

  it('refuses rare equipment under an epic floor', () => {
    expect(listingEligibility(equipDef({ quality: 'rare' }), undefined, policy)).toEqual({
      ok: false,
      reason: 'below_quality_floor',
    });
  });

  it('lets a rolled epic quality beat a rare def quality', () => {
    const instance: ItemInstancePayload = { rolled: { quality: 'epic' } };
    expect(listingEligibility(equipDef({ quality: 'rare' }), instance, policy)).toEqual({
      ok: true,
    });
  });

  it('lets a rolled rare quality drop an epic def below the floor', () => {
    const instance: ItemInstancePayload = { rolled: { quality: 'rare' } };
    expect(listingEligibility(equipDef(), instance, policy)).toEqual({
      ok: false,
      reason: 'below_quality_floor',
    });
  });

  // --- the two collectible categories ---------------------------------------
  // Mounts and chroma plates trade at EVERY rarity, and each carries the very
  // flag that keeps it out of the gold economy: a mount is soulbound (holding
  // the reins IS owning the mount) and a plate is noMarketList. Both tolerances
  // are scoped to this policy; the item defs are untouched.

  const mountDef = (over: Record<string, unknown> = {}): ItemDef =>
    ({
      id: 'reins_syn',
      name: 'Reins of the Synthetic Steed',
      kind: 'mount',
      mount: 'valorsteed',
      quality: 'common',
      soulbound: true,
      sellValue: 10,
      ...over,
    }) as unknown as ItemDef;

  const chromaDef = (over: Record<string, unknown> = {}): ItemDef =>
    ({
      id: 'syn_chroma_armor_plate',
      name: 'Synthetic Chroma Plate',
      kind: 'consumable',
      quality: 'uncommon',
      noMarketList: true,
      use: { type: 'mechChroma', chromaId: 'syn_chroma' },
      sellValue: 10,
      ...over,
    }) as unknown as ItemDef;

  it.each(['common', 'uncommon', 'rare', 'epic', 'legendary'])(
    'accepts a soulbound mount at %s, with no floor applied',
    (quality) => {
      expect(listingEligibility(mountDef({ quality }), undefined, policy)).toEqual({ ok: true });
    },
  );

  it.each(['common', 'uncommon', 'rare', 'epic'])(
    'accepts a noMarketList chroma plate at %s, with no floor applied',
    (quality) => {
      expect(listingEligibility(chromaDef({ quality }), undefined, policy)).toEqual({ ok: true });
    },
  );

  it('still refuses BOTH categories when the realm turns them off', () => {
    const off: WocEligibilityPolicy = {
      ...WOC_MARKET_RESTRICTED_POLICY,
      allowMounts: false,
      allowMechChromas: false,
    };
    expect(listingEligibility(mountDef(), undefined, off)).toEqual({
      ok: false,
      reason: 'not_eligible_category',
    });
    expect(listingEligibility(chromaDef(), undefined, off)).toEqual({
      ok: false,
      reason: 'not_eligible_category',
    });
  });

  it('keeps the absolute locks absolute for both categories', () => {
    // The tolerances are scoped to ONE flag each, not a blanket pass. A bound
    // copy and the exclusion list still refuse, and a mount does not inherit the
    // chroma's noMarketList tolerance or the other way round.
    const bound: ItemInstancePayload = { boundTo: 7 };
    expect(listingEligibility(mountDef(), bound, policy)).toEqual({
      ok: false,
      reason: 'bound_copy',
    });
    expect(listingEligibility(chromaDef(), bound, policy)).toEqual({
      ok: false,
      reason: 'bound_copy',
    });
    expect(listingEligibility(mountDef({ noMarketList: true }), undefined, policy)).toEqual({
      ok: false,
      reason: 'no_market_list',
    });
    expect(listingEligibility(chromaDef({ soulbound: true }), undefined, policy)).toEqual({
      ok: false,
      reason: 'soulbound',
    });
    const excluded: WocEligibilityPolicy = {
      ...WOC_MARKET_RESTRICTED_POLICY,
      excludedItemIds: new Set(['reins_syn']),
    };
    expect(listingEligibility(mountDef(), undefined, excluded)).toEqual({
      ok: false,
      reason: 'excluded_item',
    });
  });

  it('turns both categories ON in the shipped policy', () => {
    // The point of the change, pinned against the real exported policy rather
    // than a fixture: flipping either default off silently delists a collection.
    expect(WOC_MARKET_RESTRICTED_POLICY.allowMounts).toBe(true);
    expect(WOC_MARKET_RESTRICTED_POLICY.allowMechChromas).toBe(true);
  });
});

describe('validSettlementTransition', () => {
  const allowed: Array<[WocSettlementState, WocSettlementState]> = [
    ['offered', 'confirming'],
    ['offered', 'expired'],
    ['confirming', 'confirmed'],
    ['confirming', 'failed'],
    ['confirming', 'offered'],
    ['confirmed', 'delivering'],
    ['delivering', 'delivered'],
    ['failed', 'offered'],
    ['failed', 'expired'],
  ];

  it.each(allowed)('allows %s to %s', (from, to) => {
    expect(validSettlementTransition(from, to)).toBe(true);
  });

  const forbidden: Array<[WocSettlementState, WocSettlementState]> = [
    // delivered is terminal: it may go nowhere.
    ['delivered', 'offered'],
    ['delivered', 'confirming'],
    ['delivered', 'confirmed'],
    ['delivered', 'delivering'],
    ['delivered', 'expired'],
    ['delivered', 'failed'],
    // confirmation cannot be skipped, and expiry is terminal.
    ['offered', 'confirmed'],
    ['expired', 'offered'],
  ];

  it.each(forbidden)('forbids %s to %s', (from, to) => {
    expect(validSettlementTransition(from, to)).toBe(false);
  });
});

describe('custody references: the PostOffice book-once dedupe keys', () => {
  // Pinned as literals: these strings are persisted dedupe keys, so any drift
  // would double-book or orphan a custody parcel.
  it('pins the exact literal shapes for id 7', () => {
    expect(settlementCustodyRef(7)).toBe('woc_settlement:7');
    expect(listingReturnCustodyRef(7)).toBe('woc_listing_return:7');
    expect(listingSoldNoticeCustodyRef(7)).toBe('woc_listing_sold:7');
  });
});
