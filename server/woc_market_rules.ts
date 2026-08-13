// $WOC Exchange rules: the pure, IO-free decision core of the server-side
// marketplace (docs/prd/woc/marketplace.md). Increment ladder, anti-snipe
// extension, bid bonds, the strike ladder, listing-parameter validation,
// eligibility policy, and the settlement state machine, all as functions of
// their inputs (injected clocks, no Date.now, no DB), the wallet_link.ts /
// deeds_board.ts split. Every USD value is INTEGER CENTS; token amounts never
// appear here (the economy service owns all token math).

import {
  exchangeCategoryUsesQualityFloor,
  exchangeHardLock,
  exchangeItemCategory,
} from '../src/sim/exchange_eligibility';
import type { ItemDef, ItemInstancePayload } from '../src/sim/types';

// ---------------------------------------------------------------------------
// Tunables (named levers, the MARKET_CUT convention). USD values are cents.
// ---------------------------------------------------------------------------

/** Quote lifetime; the PRD's 60 to 120 second band. */
export const WOC_MARKET_QUOTE_TTL_SECONDS = 90;
/** The winner's settlement window after an auction ends. */
export const WOC_MARKET_SETTLEMENT_WINDOW_SECONDS = 600;
/** A bid whose bond is not confirmed within this window lapses. */
export const WOC_MARKET_BOND_PENDING_TTL_SECONDS = 300;
/** How long the chain may leave a SIGNED bond undecided (aged from the
 *  signature recording) before the poll parks it into the 60s rotation. Its
 *  own knob, deliberately not the lapse TTL above: changing the unsigned
 *  lapse deadline must not silently retune poll cadence. */
export const WOC_MARKET_BOND_POLL_PARK_SECONDS = 300;
/** Bid bond: 5% of the bid, clamped to $1 .. $50, never above the bid. */
export const WOC_MARKET_BOND_RATE_BPS = 500;
export const WOC_MARKET_BOND_MIN_CENTS = 100;
export const WOC_MARKET_BOND_MAX_CENTS = 5000;
/** Anti-snipe: a bid inside the final window extends the auction. */
export const WOC_MARKET_ANTI_SNIPE_WINDOW_SECONDS = 120;
export const WOC_MARKET_ANTI_SNIPE_EXTENSION_SECONDS = 120;
/** Total extension budget past the seller's chosen end (30 minutes). */
export const WOC_MARKET_ANTI_SNIPE_CAP_SECONDS = 1800;
/**
 * Seller-selectable auction durations, capped at 48 HOURS.
 *
 * The cap is the point, not the list: a listing holds the seller's item in
 * escrow for its whole life, so a longer auction is a longer period where the
 * item is neither usable nor sellable elsewhere, and where a price quoted in USD
 * rides a token whose rate moves. Two days is the longest that stays reasonable
 * on both counts. The retired 72-hour and one-week options are refused at
 * creation only: listings already running keep their own end time, exactly like
 * the retired combined format, so no data migration is implied.
 */
export const WOC_MARKET_DURATION_HOURS = [12, 24, 48] as const;
/** Active listings per account (the World Market's 12-listing precedent). */
export const WOC_MARKET_MAX_ACTIVE_LISTINGS = 12;
/** Price floor and ceiling for every USD field. */
export const WOC_MARKET_MIN_PRICE_CENTS = 25;
/**
 * The per-field USD ceiling, sized against the REAL $WOC market rather than
 * chosen as a round number.
 *
 * Measured 2026-08-05 from the only pool with meaningful volume (WOC/SOL on
 * pumpswap): total pool liquidity about $38,000, of which the $WOC side is about
 * $18,900, and a fully diluted market cap of about $160,000. The previous ceiling
 * of $50,000 was 31% of the entire token's market cap for ONE item sale, and
 * larger than every pool that prices the token put together.
 *
 * $1,000 is the largest figure that stays defensible on three independent counts:
 *
 *  - about 0.6% of market cap, so a single sale can never be a material fraction
 *    of the token's total value;
 *  - about 5% of the $WOC-side pool reserve, so a buyer who has to market-buy to
 *    pay moves the price noticeably but not catastrophically (most will already
 *    hold the tokens, which is why this is the loosest of the three bounds);
 *  - exactly where the bond ladder already stops scaling. bondCents is 5% capped
 *    at $50, so $1,000 is the point the existing design already treated as the
 *    top of the range.
 *
 * REVISIT THIS as liquidity grows: it is deliberately a measured number and it
 * will go stale. The measurement above is recorded so the next person knows what
 * it was sized against rather than guessing why it is 1000.
 */
export const WOC_MARKET_MAX_PRICE_CENTS = 100_000;
/** The buy-now server lock: one pending buyer at a time. Longer than one quote
 *  lifetime on purpose, so an honest buyer whose first quote expires still has
 *  window left to request a fresh one. */
export const WOC_MARKET_BUY_NOW_LOCK_SECONDS = WOC_MARKET_QUOTE_TTL_SECONDS * 3;
/**
 * The buy-now abandon-loop cooldowns (both arms, no strikes, per the resolved
 * ruling; these NUMBERS are this change's proposal and the QA round re-judges
 * them). A public buy-now lock is free to claim, so claim-then-abandon in a
 * loop denied the seller a sale at no cost to the griefer.
 *
 * Per-listing: after an account abandons (times out) a public lock, it cannot
 * re-claim THAT listing for 30 minutes, about seven lock windows, long enough
 * that a solo looper holds a listing under 14 percent of the time instead of
 * 100.
 *
 * Account-wide: three abandons in a rolling hour refuse ALL further public
 * claims until the oldest ages out (the "broader claim cooldown": the rolling
 * window expires on its own, no operator action). An honest buyer who times
 * out three separate purchases in one hour is rare; a rotation of griefing
 * accounts pays a verified wallet plus a passing balance check per seat.
 */
export const WOC_MARKET_BUY_NOW_RECLAIM_COOLDOWN_SECONDS = 1800;
export const WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR = 3;
export const WOC_MARKET_BUY_NOW_ABANDON_WINDOW_SECONDS = 3600;
/**
 * The confirm() reason the economy proxy returns when the service itself was
 * unreachable (an infrastructure verdict, not a chain verdict). Byte-identical
 * with the proxy's emit ON PURPOSE: the anti-snipe extension and the abandon
 * exemption both branch on it, and a drifted literal fails open.
 */
export const WOC_MARKET_CONFIRM_UNAVAILABLE_REASON = 'service_unavailable';
/**
 * Refusal classes that EXEMPT an expired buy-now window from the abandon
 * ledger. Deliberately NOT "any recorded signature" (a signature proves only
 * that a string was POSTED; one fabricated request would bypass the whole
 * cooldown arm), and deliberately NOT 'quote_expired' either: that verdict
 * is ATTACKER-MINTABLE by waiting out the 90s quote TTL and posting any
 * string (the signature-first intake records it, the service answers
 * quote_expired, and the wait costs a griefer nothing since burning the
 * window is the point). Only the infrastructure verdict remains: a real
 * outage is not mintable on demand. The cost is that a genuinely late honest
 * buyer eats ONE recoverable abandon row (a 30-minute block on that listing,
 * one of three hourly slots); the alternative was a cooldown arm any griefer
 * bypassed unconditionally. Restoring a late-payment exemption requires a
 * verdict that distinguishes a real transfer from a posted string: ruling
 * R5 / the verifier work owns that, and must keep this string stable.
 */
export const WOC_MARKET_ABANDON_EXEMPT_FAIL_REASONS = [
  WOC_MARKET_CONFIRM_UNAVAILABLE_REASON,
] as const;
/** How long a listing may sit mid-resolution before the sweep reclaims it. */
export const WOC_MARKET_STRANDED_RECLAIM_SECONDS = 300;
/**
 * How long a directed p2p offer waits for its named buyer.
 *
 * Short on purpose, and short for a different reason than the settlement
 * window. A pending offer escrows NOTHING, so it costs the seller no custody;
 * what it does cost is certainty, because the referenced copy must still be in
 * the seller's bags when the buyer accepts. Ten minutes is about as long as two
 * players stand at a trade window, and a stale offer that refuses cleanly is
 * better than one that lingers and fails at acceptance.
 */
export const WOC_MARKET_DIRECTED_OFFER_TTL_SECONDS = 600;

// ---------------------------------------------------------------------------
// Bidding math
// ---------------------------------------------------------------------------

/** The proposal's increment ladder: under $10: $0.25, $10 to $50: $1, $50 to
 *  $200: $5, over $200: $10. Band edges belong to the higher band. */
export function minIncrementCents(currentBidCents: number): number {
  if (currentBidCents < 1000) return 25;
  if (currentBidCents < 5000) return 100;
  if (currentBidCents < 20000) return 500;
  return 1000;
}

/** The lowest acceptable next bid: the start with no standing bid, otherwise
 *  the standing bid plus its ladder increment. */
export function minNextBidCents(currentBidCents: number | null, startCents: number): number {
  if (currentBidCents === null) return startCents;
  return currentBidCents + minIncrementCents(currentBidCents);
}

/**
 * Anti-snipe extension. A qualifying bid (inside the final window) moves the
 * end to bidAtMs + extension, but never past the cap measured from the
 * seller's ORIGINAL end (baseEndsAtMs), and never backwards. Returns the new
 * end, or null when the bid does not extend (outside the window, or the cap
 * is already spent).
 */
export function antiSnipeExtendedEndMs(
  bidAtMs: number,
  endsAtMs: number,
  baseEndsAtMs: number,
): number | null {
  if (bidAtMs >= endsAtMs) return null; // the auction is already over
  if (endsAtMs - bidAtMs > WOC_MARKET_ANTI_SNIPE_WINDOW_SECONDS * 1000) return null;
  const cap = baseEndsAtMs + WOC_MARKET_ANTI_SNIPE_CAP_SECONDS * 1000;
  const extended = Math.min(bidAtMs + WOC_MARKET_ANTI_SNIPE_EXTENSION_SECONDS * 1000, cap);
  return extended > endsAtMs ? extended : null;
}

/** The refundable bid bond for a bid: 5% clamped to $1 .. $50, never above
 *  the bid itself. */
export function bondCents(bidCents: number): number {
  const raw = Math.round((bidCents * WOC_MARKET_BOND_RATE_BPS) / 10_000);
  const clamped = Math.min(Math.max(raw, WOC_MARKET_BOND_MIN_CENTS), WOC_MARKET_BOND_MAX_CENTS);
  return Math.min(clamped, bidCents);
}

// ---------------------------------------------------------------------------
// Strikes: progressive bidding suspensions for settlement defaults
// ---------------------------------------------------------------------------

const STRIKE_SUSPENSION_DAYS = [0, 3, 14, 90] as const;
const STRIKE_SUSPENSION_MAX_DAYS = 365;

/** Suspension earned by the Nth strike (1-based): none on the first, then 3
 *  days, 14 days, 90 days, and a year from the fifth on. */
export function strikeSuspensionMs(strikes: number): number {
  if (strikes <= 0) return 0;
  const days =
    strikes <= STRIKE_SUSPENSION_DAYS.length
      ? STRIKE_SUSPENSION_DAYS[strikes - 1]
      : STRIKE_SUSPENSION_MAX_DAYS;
  return days * 24 * 3600 * 1000;
}

// ---------------------------------------------------------------------------
// Listing parameters
// ---------------------------------------------------------------------------

export type WocListingFormat = 'auction' | 'buy_now' | 'auction_buy_now';

export type ListingParamsRefusal =
  | 'bad_format'
  | 'bad_start'
  | 'bad_reserve'
  | 'bad_buy_now'
  | 'bad_duration'
  | 'bad_directed_buyer';

export interface WocListingParams {
  format: WocListingFormat;
  startCents: number;
  reserveCents: number | null;
  buyNowCents: number | null;
  durationHours: number;
  offerNext: boolean;
  /**
   * The account a DIRECTED sale is addressed to, or null for a public listing.
   *
   * A directed sale is the p2p trade agreed in the trade window, sold on this
   * rail so it inherits custody escrow, the fee split, settlement and strikes
   * unchanged (docs/prd/woc/p2p-woc-trade.md). It is deliberately part of the
   * same params object rather than a parallel creation path: everything a public
   * buy-now validates, a directed sale validates identically.
   */
  directedBuyerAccount: number | null;
}

/** The accounts.id ceiling: a signed 32-bit Postgres INT. */
const PG_INT_MAX = 2_147_483_647;

const isCents = (v: number): boolean =>
  Number.isInteger(v) && v >= WOC_MARKET_MIN_PRICE_CENTS && v <= WOC_MARKET_MAX_PRICE_CENTS;

/**
 * Validates a seller's listing parameters. The reserve sits at or above the
 * starting bid (proposal section 7); a buy-now price sits at or above both
 * the start and the reserve; a pure buy-now listing carries no reserve; and
 * the duration comes from the fixed allowlist.
 */
export function validListingParams(
  p: WocListingParams,
): { ok: true } | { ok: false; reason: ListingParamsRefusal } {
  // All three formats are creatable. 'auction_buy_now' is an auction that also
  // names a price ending it early: sellers asked for it back, and nothing
  // downstream ever branched on the format (claimBuyNowLock gates on the PRICE
  // being non-null, not on the format), so re-allowing it here is the whole
  // change. The database CHECK has carried all three throughout.
  if (p.format !== 'auction' && p.format !== 'buy_now' && p.format !== 'auction_buy_now') {
    return { ok: false, reason: 'bad_format' };
  }
  // A directed sale is a fixed price to one named account. It may not be an
  // AUCTION, and the reason is structural rather than a policy choice: an
  // auction's whole mechanism is competing bidders, and there is exactly one
  // permitted buyer here, so an auction form would be a bidding war a single
  // account holds with itself. The account id must also be a real positive
  // integer, since it is about to become the sole key deciding who may buy.
  if (p.directedBuyerAccount !== null) {
    // The ceiling is the accounts.id column's, not a safe-integer check:
    // directed_buyer_account is a Postgres INT, so a larger value is refused by
    // the database at INSERT time as a 500 rather than here as a clean 400.
    if (
      !Number.isInteger(p.directedBuyerAccount) ||
      p.directedBuyerAccount <= 0 ||
      p.directedBuyerAccount > PG_INT_MAX
    ) {
      return { ok: false, reason: 'bad_directed_buyer' };
    }
    if (p.format !== 'buy_now') return { ok: false, reason: 'bad_directed_buyer' };
  }
  if (!isCents(p.startCents)) return { ok: false, reason: 'bad_start' };
  if (!(WOC_MARKET_DURATION_HOURS as readonly number[]).includes(p.durationHours)) {
    return { ok: false, reason: 'bad_duration' };
  }
  // Both buy-now-bearing formats REQUIRE a price and a plain auction forbids
  // one, so the format and the field can never disagree in either direction:
  // an 'auction_buy_now' with no price is as refused as an 'auction' with one.
  const wantsBuyNow = p.format === 'buy_now' || p.format === 'auction_buy_now';
  if (wantsBuyNow !== (p.buyNowCents !== null)) return { ok: false, reason: 'bad_buy_now' };
  // Only a PURE buy-now forbids a reserve: with no bidding there is nothing for
  // a reserve to describe. The combined format still has an auction underneath
  // it, so it keeps the reserve, and the buy-now floor below accounts for it.
  if (p.format === 'buy_now' && p.reserveCents !== null)
    return { ok: false, reason: 'bad_reserve' };
  if (p.reserveCents !== null) {
    if (!isCents(p.reserveCents) || p.reserveCents < p.startCents) {
      return { ok: false, reason: 'bad_reserve' };
    }
  }
  if (p.buyNowCents !== null) {
    if (!isCents(p.buyNowCents)) return { ok: false, reason: 'bad_buy_now' };
    if (p.directedBuyerAccount !== null) {
      // A directed sale is ONE agreed price, so its two price fields must be the
      // same number. The strict inequality below exists because a public listing
      // with buy-now equal to the start would have its first bid match the
      // buy-now, leaving two prices describing one sale. A directed sale has no
      // bidding and exactly one permitted buyer, so that ambiguity cannot arise,
      // and requiring equality is what stops a caller smuggling a second price
      // past the number the two players actually agreed on.
      if (p.buyNowCents !== p.startCents) return { ok: false, reason: 'bad_buy_now' };
    } else {
      const floor = Math.max(p.startCents, p.reserveCents ?? 0);
      // STRICTLY above the floor, not at it. A buy-now equal to the starting bid
      // is not a price, it is the same number twice: the first bid would match it
      // and the listing's two prices would say different things about one sale.
      if (p.buyNowCents <= floor) return { ok: false, reason: 'bad_buy_now' };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Eligibility policy (configurable by server; the PRD's restricted default)
// ---------------------------------------------------------------------------

export type WocEligibilityRefusal =
  | 'unknown_item'
  | 'not_eligible_category'
  | 'below_quality_floor'
  | 'soulbound'
  | 'quest_item'
  | 'no_market_list'
  | 'bound_copy'
  | 'bind_armed'
  | 'excluded_item';

export interface WocEligibilityPolicy {
  /** Equipment (any def carrying an equip slot) at or above the floor. */
  allowEquipment: boolean;
  equipmentQualityFloor: 'epic' | 'rare' | 'uncommon';
  /**
   * Rideable mounts (the reins/ignition items, `kind: 'mount'`), at EVERY
   * rarity. Deliberately not floored: a mount's rarity is a look and a speed
   * tier, not item power, and the whole collection trades or none of it does.
   * Applying the equipment floor here would hide every common, uncommon and
   * rare mount while reporting it ineligible.
   */
  allowMounts: boolean;
  /**
   * Mech chroma plates (the suit skins, `use.type === 'mechChroma'`), at every
   * rarity, for the same reason. A plate is consumed on use and grants a
   * permanent ACCOUNT cosmetic, so only an unused plate is ever tradable: once
   * applied there is no item left to list, which needs no rule of its own.
   */
  allowMechChromas: boolean;
  /**
   * Item ids barred regardless of category: anything currently sold for
   * Claudium (merged from the store catalog when the service is reachable)
   * plus operator additions.
   */
  excludedItemIds: ReadonlySet<string>;
}

/** The existing server's policy: non-soulbound equipment of epic quality or
 *  higher, plus the two collectible categories the PRD defined and left dark
 *  ("no tradable assets behind them yet"). v0.34.0 shipped the assets: eight
 *  rideable mounts and fifteen mech chroma plates, so both arms are on. The
 *  remaining dark category is serialized collectibles, which still have none. */
export const WOC_MARKET_RESTRICTED_POLICY: WocEligibilityPolicy = {
  allowEquipment: true,
  equipmentQualityFloor: 'epic',
  allowMounts: true,
  allowMechChromas: true,
  excludedItemIds: new Set(),
};

const QUALITY_RANK: Record<string, number> = {
  poor: 0,
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

/**
 * Whether one exact copy may be listed under `policy`. The hard transfer
 * locks (soulbound / quest / noMarketList / boundTo / an unstamped bindOnTrade)
 * are re-checked by the sim at extraction time (inventory_extract.ts);
 * repeating them here means a
 * refusal is decided BEFORE any custody action, and policy alone can never
 * unlock a copy the sim would refuse. The instance's rolled quality beats the
 * def quality when present (the discovery-ledger convention).
 */
export function listingEligibility(
  def: ItemDef | undefined,
  instance: ItemInstancePayload | undefined,
  policy: WocEligibilityPolicy,
): { ok: true } | { ok: false; reason: WocEligibilityRefusal } {
  if (!def) return { ok: false, reason: 'unknown_item' };
  // The shared lock predicate (src/sim/exchange_eligibility.ts), which the sim's
  // escrow extraction and the client's Sell picker also consult, so all three
  // agree on which locks a category tolerates.
  const lock = exchangeHardLock(def, instance);
  if (lock) return { ok: false, reason: lock };
  if (policy.excludedItemIds.has(def.id)) return { ok: false, reason: 'excluded_item' };
  const category = exchangeItemCategory(def);
  const categoryAllowed =
    category === 'equipment'
      ? policy.allowEquipment
      : category === 'mount'
        ? policy.allowMounts
        : category === 'mech_chroma'
          ? policy.allowMechChromas
          : false;
  if (!categoryAllowed) return { ok: false, reason: 'not_eligible_category' };
  // The floor is the EQUIPMENT floor and reaches only equipment; the collectible
  // categories trade at every tier (see the policy fields).
  if (exchangeCategoryUsesQualityFloor(category)) {
    const quality = instance?.rolled?.quality ?? def.quality ?? 'common';
    const floor = QUALITY_RANK[policy.equipmentQualityFloor];
    if ((QUALITY_RANK[quality] ?? 0) < floor) {
      return { ok: false, reason: 'below_quality_floor' };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// State machines (listing / bid / settlement)
// ---------------------------------------------------------------------------

export type WocBidStatus =
  | 'pending_bond' // placed, bond intent issued, unconfirmed
  | 'active' // bond confirmed, standing
  | 'outbid' // superseded (bond refund owed)
  | 'lapsed' // bond never confirmed in time
  | 'won' // selected at close
  | 'defaulted' // won and failed to settle (bond forfeited)
  | 'cancelled'; // listing cancelled/suspended (bond refund owed)

export type WocSettlementState =
  | 'offered' // winner notified, awaiting quote + signature
  | 'confirming' // signature submitted, awaiting finality
  | 'review' // confirming past the age bound: parked for an operator verdict
  | 'confirmed' // finality reached, delivery owed
  | 'delivering' // delivery claimed by a worker (crash-retry marker)
  | 'delivered' // custody parcel booked and persisted
  | 'expired' // window elapsed unpaid
  | 'failed'; // confirmation refused

const SETTLEMENT_TRANSITIONS: Record<WocSettlementState, readonly WocSettlementState[]> = {
  offered: ['confirming', 'expired'],
  // A refused signature returns to `offered`: the winner may retry with a
  // fresh quote inside their window. 'review' is the overdue sweep's exit for
  // a row the chain never decides: it leaves the polling set but stays OPEN
  // (the payment may have landed, so the listing must not re-auction).
  confirming: ['confirmed', 'failed', 'offered', 'review'],
  // Operator arms only (the ops tooling drives these once the chain state is
  // verified by hand): paid resumes delivery, unpaid rejoins the overdue
  // sweep's default pass through 'failed'.
  review: ['confirmed', 'failed'],
  confirmed: ['delivering'],
  delivering: ['delivered'],
  delivered: [],
  expired: [],
  failed: ['offered', 'expired'],
};

export function validSettlementTransition(
  from: WocSettlementState,
  to: WocSettlementState,
): boolean {
  return SETTLEMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Custody references (the PostOffice book-once dedupe keys)
// ---------------------------------------------------------------------------

export function settlementCustodyRef(settlementId: number): string {
  return `woc_settlement:${settlementId}`;
}

export function listingReturnCustodyRef(listingId: number): string {
  return `woc_listing_return:${listingId}`;
}

export function listingSoldNoticeCustodyRef(listingId: number): string {
  return `woc_listing_sold:${listingId}`;
}
