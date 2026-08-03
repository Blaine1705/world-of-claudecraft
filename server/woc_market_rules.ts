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
export const WOC_MARKET_MAX_PRICE_CENTS = 5_000_000;
/** The buy-now server lock: one pending buyer at a time. Longer than one quote
 *  lifetime on purpose, so an honest buyer whose first quote expires still has
 *  window left to request a fresh one. */
export const WOC_MARKET_BUY_NOW_LOCK_SECONDS = WOC_MARKET_QUOTE_TTL_SECONDS * 3;
/** How long a listing may sit mid-resolution before the sweep reclaims it. */
export const WOC_MARKET_STRANDED_RECLAIM_SECONDS = 300;

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
  | 'bad_duration';

export interface WocListingParams {
  format: WocListingFormat;
  startCents: number;
  reserveCents: number | null;
  buyNowCents: number | null;
  durationHours: number;
  offerNext: boolean;
}

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
  // 'auction_buy_now' is NOT creatable. A combined listing was redundant: an
  // auction already ends early on a buy-now, and a plain buy-now covers the
  // fixed-price case. Existing rows keep their format and continue to render,
  // bid, and settle; only creation is refused, so no data migration is implied
  // and the database CHECK deliberately stays permissive.
  if (p.format !== 'auction' && p.format !== 'buy_now') {
    return { ok: false, reason: 'bad_format' };
  }
  if (!isCents(p.startCents)) return { ok: false, reason: 'bad_start' };
  if (!(WOC_MARKET_DURATION_HOURS as readonly number[]).includes(p.durationHours)) {
    return { ok: false, reason: 'bad_duration' };
  }
  const wantsBuyNow = p.format === 'buy_now';
  if (wantsBuyNow !== (p.buyNowCents !== null)) return { ok: false, reason: 'bad_buy_now' };
  if (p.format === 'buy_now' && p.reserveCents !== null)
    return { ok: false, reason: 'bad_reserve' };
  if (p.reserveCents !== null) {
    if (!isCents(p.reserveCents) || p.reserveCents < p.startCents) {
      return { ok: false, reason: 'bad_reserve' };
    }
  }
  if (p.buyNowCents !== null) {
    const floor = Math.max(p.startCents, p.reserveCents ?? 0);
    // STRICTLY above the floor, not at it. A buy-now equal to the starting bid
    // is not a price, it is the same number twice: the first bid would match it
    // and the listing's two prices would say different things about one sale.
    if (!isCents(p.buyNowCents) || p.buyNowCents <= floor) {
      return { ok: false, reason: 'bad_buy_now' };
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
 * locks (soulbound / quest / noMarketList / boundTo) are re-checked by the
 * sim at extraction time (inventory_extract.ts); repeating them here means a
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
  | 'confirmed' // finality reached, delivery owed
  | 'delivering' // delivery claimed by a worker (crash-retry marker)
  | 'delivered' // custody parcel booked and persisted
  | 'expired' // window elapsed unpaid
  | 'failed'; // confirmation refused

const SETTLEMENT_TRANSITIONS: Record<WocSettlementState, readonly WocSettlementState[]> = {
  offered: ['confirming', 'expired'],
  // A refused signature returns to `offered`: the winner may retry with a
  // fresh quote inside their window.
  confirming: ['confirmed', 'failed', 'offered'],
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
