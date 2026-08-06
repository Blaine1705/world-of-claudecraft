// $WOC Exchange service lifecycle, driven end to end through the in-memory
// FakeWocMarketDb (tests/server/helpers/fake_woc_market_db.ts), the dev
// economy (createDevWocMarketEconomy on an injected fake clock: fixed price,
// instant finality, always-successful bond refunds), and a hand-rolled
// custody bridge backed by real extractTradableCopy inventory math. Pins the
// money-critical paths of server/woc_market.ts: escrow-by-removal listing
// custody (extract, persist, compensate-on-refusal), the bid refusal ladder
// and the bond lifecycle (pending -> held -> refund/forfeit), anti-snipe
// extension and its cap, the sweep's close / settle / expire / cascade /
// return arms, buy-now locking over a standing auction, crash-safe delivery
// reconciliation (book-once by custodyRef), and the admin suspension
// teardown. Also the fail-closed and recovery arms either side of those: quote
// expiry and signature replay on both the bond and the settlement leg, the
// seller cancel ladder, the abandoned buy-now lock, the guard ALLOW arms
// (lapsed suspension, unreadable balance), stranded-listing reclaim, the
// durable custody claim ledger, and the account-scoped owned loaders behind
// the requireOwned 404. Every scenario asserts BOTH the returned values and
// the resulting fake-db/custody state.

import { describe, expect, it } from 'vitest';
import type {
  Refused,
  WocBidRow,
  WocBrowseQuery,
  WocCustodyExtract,
  WocListingRow,
  WocMarketCustody,
  WocMarketDeps,
  WocMarketEconomy,
  WocSettlementRow,
} from '../../server/woc_market';
import { WocMarketService } from '../../server/woc_market';
import { createDevWocMarketEconomy } from '../../server/woc_market_proxy';
import type { WocListingParams } from '../../server/woc_market_rules';
import {
  bondCents,
  listingReturnCustodyRef,
  listingSoldNoticeCustodyRef,
  settlementCustodyRef,
  WOC_MARKET_ANTI_SNIPE_CAP_SECONDS,
  WOC_MARKET_ANTI_SNIPE_EXTENSION_SECONDS,
  WOC_MARKET_BOND_PENDING_TTL_SECONDS,
  WOC_MARKET_BUY_NOW_LOCK_SECONDS,
  WOC_MARKET_MAX_ACTIVE_LISTINGS,
  WOC_MARKET_QUOTE_TTL_SECONDS,
  WOC_MARKET_RESTRICTED_POLICY,
  WOC_MARKET_SETTLEMENT_WINDOW_SECONDS,
  WOC_MARKET_STRANDED_RECLAIM_SECONDS,
} from '../../server/woc_market_rules';
import { ITEMS } from '../../src/sim/data';
import type { ExtractRef } from '../../src/sim/inventory_extract';
import { extractTradableCopy } from '../../src/sim/inventory_extract';
import type { CharacterState } from '../../src/sim/sim';
import type { InvSlot } from '../../src/sim/types';
import { FakeWocMarketDb } from './helpers/fake_woc_market_db';

// ---------------------------------------------------------------------------
// Fixture: a real eligible item from the content tables
// ---------------------------------------------------------------------------

function eligibleEquipmentId(quality: 'epic' | 'rare'): string {
  const id = Object.keys(ITEMS).find((candidate) => {
    const def = ITEMS[candidate];
    return (
      def.quality === quality &&
      !def.soulbound &&
      def.slot !== undefined &&
      !def.noMarketList &&
      def.kind !== 'quest'
    );
  });
  if (!id) throw new Error(`no eligible ${quality} equipment def in ITEMS`);
  return id;
}

const EPIC_ITEM = eligibleEquipmentId('epic');
const RARE_ITEM = eligibleEquipmentId('rare');

// ---------------------------------------------------------------------------
// Fake custody: a Map of bags plus a book-once parcel ledger
// ---------------------------------------------------------------------------

interface BookedParcel {
  recipientKey: string;
  letter: 'delivery' | 'return' | 'sold_notice';
  items: InvSlot[];
  custodyRef: string;
}

class FakeCustody implements WocMarketCustody {
  readonly bags = new Map<number, InvSlot[]>();
  readonly owners = new Map<number, number>();
  readonly names = new Map<number, string>();
  readonly parcels: BookedParcel[] = [];
  /** Every persistMailParcel ATTEMPT's custodyRef, failures included: the
   *  durable-claim tests assert on call counts, because the fake's own
   *  book-once dedupe below would mask a second booking in `parcels`. */
  readonly persistCalls: string[] = [];
  /** Throw ONCE on the next persistMailParcel (the crash-retry scenario). */
  failNextPersist = false;

  extractCopy(accountId: number, characterId: number, ref: ExtractRef): WocCustodyExtract {
    const inventory = this.bags.get(characterId);
    if (!inventory) return { ok: false, reason: 'offline' };
    if (this.owners.get(characterId) !== accountId) return { ok: false, reason: 'not_yours' };
    const out = extractTradableCopy(inventory, ref, ITEMS[ref.itemId]);
    if (!out.ok) return out;
    return {
      ok: true,
      extracted: out.extracted,
      characterName: this.names.get(characterId) ?? `char-${characterId}`,
      save: {
        characterId,
        level: 10,
        // The service never reads the state blob; it only hands it to the db.
        state: {} as unknown as CharacterState,
        leaseNonce: 'nonce',
      },
    };
  }

  restoreCopy(characterId: number, slot: InvSlot): void {
    this.bags.get(characterId)?.push(slot);
  }

  async persistMailParcel(
    recipient: { key: string; name: string },
    letter: 'delivery' | 'return' | 'sold_notice',
    items: InvSlot[],
    custodyRef: string,
  ): Promise<void> {
    this.persistCalls.push(custodyRef);
    if (this.failNextPersist) {
      this.failNextPersist = false;
      throw new Error('persist failed');
    }
    // Book-once by custodyRef: a reconciliation replay never double-mails.
    if (this.parcels.some((p) => p.custodyRef === custodyRef)) return;
    this.parcels.push({
      recipientKey: recipient.key,
      letter,
      items: structuredClone(items),
      custodyRef,
    });
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const REALM = 'Claudemoon';
const BASE_MS = 1_800_000_000_000;
const HOUR_MS = 3600 * 1000;

const SELLER = 1;
const BUYER_A = 2;
const BUYER_B = 3;
const BUYER_C = 4;
const WALLET_TWIN = 5; // a second account sharing the seller's payout wallet

const SELLER_CHAR = 11;
/** A second character on the SELLER account: an alt is still yourself. */
const SELLER_ALT_CHAR = 12;
const CHAR_A = 21;
const CHAR_B = 31;
const CHAR_C = 41;
const CHAR_TWIN = 51;

// Extra bidder accounts for the anti-snipe cap ladder.
const SNIPER_COUNT = 40;
const SNIPER_ACCOUNT_BASE = 200;
const SNIPER_CHAR_BASE = 9000;

interface Harness {
  db: FakeWocMarketDb;
  custody: FakeCustody;
  economy: WocMarketEconomy;
  service: WocMarketService;
  deps: WocMarketDeps;
  wallets: Map<number, string>;
  balances: Map<string, number>;
  now: () => number;
  setNow: (ms: number) => void;
}

function makeHarness(): Harness {
  let clockMs = BASE_MS;
  const now = (): number => clockMs;
  const db = new FakeWocMarketDb({
    now,
    characters: [
      { characterId: SELLER_CHAR, accountId: SELLER, name: 'Selara', realm: REALM },
      { characterId: SELLER_ALT_CHAR, accountId: SELLER, name: 'Selara Alt', realm: REALM },
      { characterId: CHAR_A, accountId: BUYER_A, name: 'Aldan', realm: REALM },
      { characterId: CHAR_B, accountId: BUYER_B, name: 'Brint', realm: REALM },
      { characterId: CHAR_C, accountId: BUYER_C, name: 'Corvo', realm: REALM },
      { characterId: CHAR_TWIN, accountId: WALLET_TWIN, name: 'Twinja', realm: REALM },
      ...Array.from({ length: SNIPER_COUNT }, (_, i) => ({
        characterId: SNIPER_CHAR_BASE + i,
        accountId: SNIPER_ACCOUNT_BASE + i,
        name: `Sniper${i}`,
        realm: REALM,
      })),
    ],
  });
  const custody = new FakeCustody();
  custody.owners.set(SELLER_CHAR, SELLER);
  custody.names.set(SELLER_CHAR, 'Selara');
  custody.bags.set(SELLER_CHAR, [
    { itemId: EPIC_ITEM, count: 1 },
    { itemId: RARE_ITEM, count: 1 },
  ]);
  const wallets = new Map<number, string>([
    [SELLER, 'wallet-seller'],
    [BUYER_A, 'wallet-a'],
    [BUYER_B, 'wallet-b'],
    [BUYER_C, 'wallet-c'],
    [WALLET_TWIN, 'wallet-seller'],
  ]);
  const balances = new Map<string, number>([
    ['wallet-seller', 100_000_000],
    ['wallet-a', 100_000_000],
    ['wallet-b', 100_000_000],
    ['wallet-c', 100_000_000],
  ]);
  // BUYER_B stays deliberately unenrolled (the enroll-first TOTP refusal arm).
  const economy = createDevWocMarketEconomy(now);
  const deps: WocMarketDeps = {
    db,
    economy,
    custody,
    verifiedWallet: async (account) => wallets.get(account) ?? null,
    balanceTokens: async (pubkey) => balances.get(pubkey) ?? null,
    config: {
      enabled: true,
      realm: REALM,
      policy: WOC_MARKET_RESTRICTED_POLICY,
    },
    now,
  };
  const service = new WocMarketService(deps);
  return {
    db,
    custody,
    economy,
    service,
    deps,
    wallets,
    balances,
    now,
    setNow: (ms) => {
      clockMs = ms;
    },
  };
}

function unwrap<T extends { ok: true }>(res: T | Refused, label: string): T {
  if (!res.ok) throw new Error(`${label} refused: ${res.reason}`);
  return res;
}

function listingParams(over: Partial<WocListingParams> = {}): WocListingParams {
  return {
    format: 'auction',
    directedBuyerAccount: null,
    startCents: 5000,
    reserveCents: null,
    buyNowCents: null,
    durationHours: 12,
    offerNext: false,
    ...over,
  };
}

async function listEpic(h: Harness, over: Partial<WocListingParams> = {}): Promise<WocListingRow> {
  const res = await h.service.createListing({
    account: SELLER,
    characterId: SELLER_CHAR,
    itemRef: { index: 0, itemId: EPIC_ITEM },
    params: listingParams(over),
  });
  return unwrap(res, 'createListing').listing;
}

interface BidArgs {
  account: number;
  characterId: number;
  listingId: number;
  amountCents: number;
  acceptTerms?: boolean;
}

function placeBid(h: Harness, args: BidArgs) {
  return h.service.placeBid({
    account: args.account,
    characterId: args.characterId,
    listingId: args.listingId,
    amountCents: args.amountCents,
    acceptTerms: args.acceptTerms ?? true,
  });
}

/** Place a bid and confirm its bond in one step. */
async function confirmedBid(
  h: Harness,
  account: number,
  characterId: number,
  listingId: number,
  amountCents: number,
): Promise<{ bidId: number; standing: boolean }> {
  const placed = unwrap(
    await placeBid(h, { account, characterId, listingId, amountCents }),
    'placeBid',
  );
  const confirmed = unwrap(
    await h.service.confirmBond(account, placed.bid.id, `sig-bond-${placed.bid.id}`),
    'confirmBond',
  );
  return { bidId: placed.bid.id, standing: confirmed.standing };
}

function bagsOf(h: Harness, characterId: number): InvSlot[] {
  return h.custody.bags.get(characterId) ?? [];
}

async function getListing(h: Harness, id: number): Promise<WocListingRow> {
  const row = await h.db.listingById(REALM, id);
  if (!row) throw new Error(`listing ${id} missing`);
  return row;
}

async function getBid(h: Harness, id: number): Promise<WocBidRow> {
  const row = await h.db.bidById(id);
  if (!row) throw new Error(`bid ${id} missing`);
  return row;
}

async function getSettlement(h: Harness, id: number): Promise<WocSettlementRow> {
  const row = await h.db.settlementById(id);
  if (!row) throw new Error(`settlement ${id} missing`);
  return row;
}

async function liveSettlement(h: Harness, listingId: number): Promise<WocSettlementRow> {
  const row = await h.db.liveSettlementForListing(listingId);
  if (!row) throw new Error(`no live settlement for listing ${listingId}`);
  return row;
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

describe('woc market fixtures', () => {
  it('resolves real epic and rare tradable equipment defs from ITEMS', () => {
    expect(ITEMS[EPIC_ITEM].quality).toBe('epic');
    expect(ITEMS[EPIC_ITEM].soulbound).toBeFalsy();
    expect(ITEMS[EPIC_ITEM].slot).toBeDefined();
    expect(ITEMS[RARE_ITEM].quality).toBe('rare');
    expect(ITEMS[RARE_ITEM].slot).toBeDefined();
  });
});

describe('createListing', () => {
  it('escrows the copy out of the bags and persists the listing row', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    expect(listing.sellerAccount).toBe(SELLER);
    expect(listing.sellerCharacter).toBe(SELLER_CHAR);
    expect(listing.sellerName).toBe('Selara'); // custody-resolved, never client-named
    expect(listing.sellerWallet).toBe('wallet-seller');
    expect(listing.itemId).toBe(EPIC_ITEM);
    expect(listing.item.itemId).toBe(EPIC_ITEM);
    expect(listing.quality).toBe('epic');
    expect(listing.status).toBe('active');
    expect(listing.endsAtMs).toBe(BASE_MS + 12 * HOUR_MS);
    expect(listing.baseEndsAtMs).toBe(BASE_MS + 12 * HOUR_MS);
    // The epic copy left the bags; the rare stayed behind.
    expect(bagsOf(h, SELLER_CHAR).map((s) => s.itemId)).toEqual([RARE_ITEM]);
    // The character save rode the escrow edge.
    expect(h.db.escrowSaves).toHaveLength(1);
    expect(h.db.escrowSaves[0]).toMatchObject({
      characterId: SELLER_CHAR,
      level: 10,
      leaseNonce: 'nonce',
    });
  });

  it('refuses wallet_required when the account has no verified wallet', async () => {
    const h = makeHarness();
    h.wallets.delete(SELLER);
    const res = await h.service.createListing({
      account: SELLER,
      characterId: SELLER_CHAR,
      itemRef: { index: 0, itemId: EPIC_ITEM },
      params: listingParams(),
    });
    expect(res).toEqual({ ok: false, reason: 'wallet_required' });
    expect(bagsOf(h, SELLER_CHAR)).toHaveLength(2);
  });

  it('refuses below_quality_floor for a rare item before any custody action', async () => {
    const h = makeHarness();
    const res = await h.service.createListing({
      account: SELLER,
      characterId: SELLER_CHAR,
      itemRef: { index: 1, itemId: RARE_ITEM },
      params: listingParams(),
    });
    expect(res).toEqual({ ok: false, reason: 'below_quality_floor' });
    expect(bagsOf(h, SELLER_CHAR)).toHaveLength(2);
    expect(h.db.escrowSaves).toHaveLength(0);
  });

  it('refuses bad_reserve when the reserve sits below the starting bid', async () => {
    const h = makeHarness();
    const res = await h.service.createListing({
      account: SELLER,
      characterId: SELLER_CHAR,
      itemRef: { index: 0, itemId: EPIC_ITEM },
      params: listingParams({ reserveCents: 4000 }),
    });
    expect(res).toEqual({ ok: false, reason: 'bad_reserve' });
    expect(bagsOf(h, SELLER_CHAR)).toHaveLength(2);
  });

  it('refuses cap_reached at the per-account active cap without extracting', async () => {
    const h = makeHarness();
    h.custody.bags.set(
      SELLER_CHAR,
      Array.from({ length: WOC_MARKET_MAX_ACTIVE_LISTINGS + 1 }, () => ({
        itemId: EPIC_ITEM,
        count: 1,
      })),
    );
    for (let i = 0; i < WOC_MARKET_MAX_ACTIVE_LISTINGS; i++) await listEpic(h);
    expect(await h.db.countActiveBySeller(REALM, SELLER)).toBe(WOC_MARKET_MAX_ACTIVE_LISTINGS);
    const res = await h.service.createListing({
      account: SELLER,
      characterId: SELLER_CHAR,
      itemRef: { index: 0, itemId: EPIC_ITEM },
      params: listingParams(),
    });
    expect(res).toEqual({ ok: false, reason: 'cap_reached' });
    // The pre-check refused before extraction: the last copy never moved.
    expect(bagsOf(h, SELLER_CHAR)).toHaveLength(1);
  });

  it('restores the extracted copy when the escrow transaction reports cap_reached', async () => {
    const h = makeHarness();
    h.db.failNextEscrow = 'cap_reached';
    const res = await h.service.createListing({
      account: SELLER,
      characterId: SELLER_CHAR,
      itemRef: { index: 0, itemId: EPIC_ITEM },
      params: listingParams(),
    });
    expect(res).toEqual({ ok: false, reason: 'cap_reached' });
    const ids = bagsOf(h, SELLER_CHAR).map((s) => s.itemId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(EPIC_ITEM);
    expect(await h.db.listingsBySeller(REALM, SELLER)).toHaveLength(0);
  });

  it('restores the extracted copy when the escrow save loses the lease', async () => {
    const h = makeHarness();
    h.db.failNextEscrow = 'lease_lost';
    const res = await h.service.createListing({
      account: SELLER,
      characterId: SELLER_CHAR,
      itemRef: { index: 0, itemId: EPIC_ITEM },
      params: listingParams(),
    });
    expect(res).toEqual({ ok: false, reason: 'lease_lost' });
    const ids = bagsOf(h, SELLER_CHAR).map((s) => s.itemId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(EPIC_ITEM);
  });
});

describe('cancelListing', () => {
  it('closes an unbid listing as cancelled and mails the escrowed copy home', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const res = await h.service.cancelListing(SELLER, listing.id);
    expect(res.ok, 'a public buy-now must not be caught by the directed guard').toBe(true);
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('closed');
    expect(row.resolution).toBe('cancelled');
    expect(row.itemDisposed).toBe(true);
    // Escrow-by-removal: the copy comes back as a durable mail parcel, never
    // straight into the live bags (the seller may be offline or elsewhere).
    expect(bagsOf(h, SELLER_CHAR).map((s) => s.itemId)).toEqual([RARE_ITEM]);
    expect(h.custody.parcels).toEqual([
      {
        recipientKey: String(SELLER_CHAR),
        letter: 'return',
        items: [expect.objectContaining({ itemId: EPIC_ITEM })],
        custodyRef: listingReturnCustodyRef(listing.id),
      },
    ]);
    expect(h.db.custodyClaims.get(listingReturnCustodyRef(listing.id))?.bookedAtMs).toBe(BASE_MS);
  });

  it('refuses has_bids once a bond has been confirmed against the listing', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    // Cancelling under a standing bid would let a seller walk away from a price
    // they no longer like while the bidder's bond sits held.
    const res = await h.service.cancelListing(SELLER, listing.id);
    expect(res).toEqual({ ok: false, reason: 'has_bids' });
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('active');
    expect(row.resolution).toBeNull();
    expect(row.itemDisposed).toBe(false);
    expect(row.currentBidId).toBe(standing.bidId);
    expect(h.custody.parcels).toHaveLength(0);
  });

  it('refuses not_yours for an account that does not own the listing', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    // Cancel is the one seller verb that disposes of custody, so a foreign
    // account reaching it would be an item-theft primitive.
    const res = await h.service.cancelListing(BUYER_A, listing.id);
    expect(res).toEqual({ ok: false, reason: 'not_yours' });
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('active');
    expect(row.resolution).toBeNull();
    expect(row.itemDisposed).toBe(false);
    expect(h.custody.parcels).toHaveLength(0);
  });

  it('refuses not_active on a second cancel and books no second return', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    expect(await h.service.cancelListing(SELLER, listing.id)).toEqual({ ok: true });
    // A retried cancel (double click, replayed request) must not mint a second
    // return flight: that is one escrowed copy delivered twice.
    const again = await h.service.cancelListing(SELLER, listing.id);
    expect(again).toEqual({ ok: false, reason: 'not_active' });
    expect((await getListing(h, listing.id)).resolution).toBe('cancelled');
    expect(h.custody.persistCalls).toEqual([listingReturnCustodyRef(listing.id)]);
    expect(h.custody.parcels).toHaveLength(1);
  });
});

describe('placeBid', () => {
  it('returns the pending bid plus a dev bond intent and stores the bond reference', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const res = unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
      }),
      'placeBid',
    );
    expect(res.bid.status).toBe('pending_bond');
    expect(res.bid.bondState).toBe('pending');
    expect(res.bid.amountCents).toBe(5000);
    expect(res.bid.bondCents).toBe(bondCents(5000));
    expect(res.bid.characterName).toBe('Aldan'); // db-resolved, never client-named
    expect(res.bond.ok).toBe(true);
    expect(res.bond.reference).toMatch(/^dev_woc_/);
    expect(res.bid.bondReference).toBe(res.bond.reference);
    const stored = await getBid(h, res.bid.id);
    expect(stored.bondReference).toBe(res.bond.reference);
    expect(stored.bondQuoteExpiresAtMs).toBe(BASE_MS + WOC_MARKET_QUOTE_TTL_SECONDS * 1000);
  });

  it('refuses own_listing for the seller account and for a wallet twin', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const own = await placeBid(h, {
      account: SELLER,
      characterId: SELLER_CHAR,
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(own).toEqual({ ok: false, reason: 'own_listing' });
    const twin = await placeBid(h, {
      account: WALLET_TWIN,
      characterId: CHAR_TWIN,
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(twin).toEqual({ ok: false, reason: 'own_listing' });
    expect(await h.db.bidsForListing(listing.id)).toHaveLength(0);
  });

  it('refuses character_invalid when the named character is not the account delivery target', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const res = await placeBid(h, {
      account: BUYER_A,
      characterId: 999, // not a character of BUYER_A
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(res).toEqual({ ok: false, reason: 'character_invalid' });
    expect(await h.db.bidsForListing(listing.id)).toHaveLength(0);
  });

  it('refuses bid_too_low below the minimum next bid', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const res = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 4900,
    });
    expect(res).toEqual({ ok: false, reason: 'bid_too_low' });
  });

  it('requires terms once and records acceptance exactly once', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const refused = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
      acceptTerms: false,
    });
    expect(refused).toEqual({ ok: false, reason: 'terms_required' });
    expect(await h.db.termsAcceptedAt(BUYER_A)).toBeNull();
    unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
        acceptTerms: true,
      }),
      'placeBid',
    );
    expect(await h.db.termsAcceptedAt(BUYER_A)).toBe(BASE_MS);
    h.setNow(BASE_MS + 60_000);
    const second = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 6000,
      acceptTerms: true,
    });
    // The first bid is still pending, so the second refuses AFTER the guards
    // ran; the recorded acceptance stays the first one (first write wins).
    expect(second).toEqual({ ok: false, reason: 'already_pending' });
    expect(await h.db.termsAcceptedAt(BUYER_A)).toBe(BASE_MS);
  });

  it('refuses already_pending for a second bid from one account, per account not per listing', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const first = unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
      }),
      'placeBid',
    );
    // One unconfirmed bond per account per listing. Stacking pending bids would
    // issue a second bond quote for a seat the account already holds, so a
    // bidder could hold two bonds against one auction.
    const stacked = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 7000,
    });
    expect(stacked).toEqual({ ok: false, reason: 'already_pending' });
    const mine = (await h.db.bidsForListing(listing.id)).filter((b) => b.account === BUYER_A);
    expect(mine.map((b) => b.amountCents)).toEqual([5000]);
    expect((await getBid(h, first.bid.id)).status).toBe('pending_bond');
    // The block is scoped to the account: a rival still gets their own seat.
    const rival = await placeBid(h, {
      account: BUYER_B,
      characterId: CHAR_B,
      listingId: listing.id,
      amountCents: 5500,
    });
    expect(rival.ok).toBe(true);
    expect(await h.db.bidsForListing(listing.id)).toHaveLength(2);
    // Neither bond is confirmed, so nothing stands on the listing yet.
    expect((await getListing(h, listing.id)).currentBidId).toBeNull();
  });

  it('refuses insufficient_balance when the wallet cannot cover bid plus bond', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    // 5000 cents bid + 250 cents bond = 5250 cents = 52,500 dev tokens.
    h.balances.set('wallet-a', 52_499);
    const short = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(short).toEqual({ ok: false, reason: 'insufficient_balance' });
    h.balances.set('wallet-a', 52_500);
    const exact = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(exact.ok).toBe(true);
  });

  it('refuses insufficient_balance when the wallet balance read is unavailable', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    // The chain read degrades to null instead of throwing (the graceful
    // degradation contract), and the gate must read that as "cannot tell", never
    // as "rich enough": otherwise every RPC outage opens bidding to empty
    // wallets, and the bond is the only thing left holding the auction honest.
    h.balances.delete('wallet-a');
    const res = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(res).toEqual({ ok: false, reason: 'insufficient_balance' });
    expect(await h.db.bidsForListing(listing.id)).toHaveLength(0);
    expect((await getListing(h, listing.id)).currentBidCents).toBeNull();
  });

  it('refuses market_paused when the token estimate is unavailable under a healthy price', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    // Price healthy but the estimate leg unreadable: the gate has no required
    // token figure to compare the balance against, so it pauses rather than
    // skipping the comparison and admitting the bid unchecked.
    const noEstimate: WocMarketEconomy = {
      ...h.economy,
      estimate: async (usdCents) => ({
        available: false,
        split: null,
        usdCents,
        amount: null,
        asOfMs: null,
      }),
    };
    const paused = new WocMarketService({ ...h.deps, economy: noEstimate });
    // The premise, so this pins the BALANCE gate and not the pre-gate that
    // shares the reason: the oracle itself is healthy here.
    expect((await paused.status()).price).toMatchObject({ available: true, healthy: true });
    const res = await paused.placeBid({
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
      acceptTerms: true,
    });
    expect(res).toEqual({ ok: false, reason: 'market_paused' });
    expect(await h.db.bidsForListing(listing.id)).toHaveLength(0);
  });

  it('refuses insufficient_balance when the wallet covers the bid but not its bond', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    // The gate prices bid PLUS bond (5000 + 250 cents = 52,500 dev tokens); a
    // wallet holding only the 50,000 for the bid itself could never post the
    // bond that backs the seat.
    h.balances.set('wallet-a', 50_000);
    const res = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(res).toEqual({ ok: false, reason: 'insufficient_balance' });
    expect(await h.db.bidsForListing(listing.id)).toHaveLength(0);
  });

  it('refuses account_suspended while a strike suspension is in force', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    await h.db.addStrike(BUYER_A, BASE_MS + 24 * HOUR_MS);
    const res = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(res).toEqual({ ok: false, reason: 'account_suspended' });
  });

  it('allows a bid once the strike suspension has run out, keeping the strike row', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    await h.db.addStrike(BUYER_A, BASE_MS + HOUR_MS);
    // The hold ends AT its own timestamp. A suspension that outlived it would be
    // a permanent bidding ban the progressive strike ladder never intended.
    h.setNow(BASE_MS + HOUR_MS);
    const res = unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
      }),
      'placeBid',
    );
    expect(res.bid.status).toBe('pending_bond');
    expect(res.bid.bondState).toBe('pending');
    // Serving the bid does not forgive the ladder: the next default escalates
    // from strike 1, not from zero.
    expect(await h.db.strikeInfo(BUYER_A)).toEqual({
      accountId: BUYER_A,
      strikes: 1,
      suspendedUntilMs: BASE_MS + HOUR_MS,
    });
  });

  it('allows bidders with no strike row and with a strike carrying no suspension', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    // The absent-row shape: a clean account has no strikes row at all, and
    // reading that as a suspension would close the marketplace to everyone.
    expect(await h.db.strikeInfo(BUYER_A)).toBeNull();
    const clean = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(clean.ok).toBe(true);
    // A first default records a strike with a NULL suspension
    // (strikeSuspensionMs(1) is 0), so the null must read as "no hold in force"
    // rather than as an open-ended one.
    await h.db.addStrike(BUYER_C, null);
    expect(await h.db.strikeInfo(BUYER_C)).toEqual({
      accountId: BUYER_C,
      strikes: 1,
      suspendedUntilMs: null,
    });
    const struck = await placeBid(h, {
      account: BUYER_C,
      characterId: CHAR_C,
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(struck.ok).toBe(true);
    const accounts = (await h.db.bidsForListing(listing.id)).map((b) => b.account);
    expect([...accounts].sort((a, b) => a - b)).toEqual([BUYER_A, BUYER_C]);
  });

  it('refuses disabled when the feature flag is off', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const disabled = new WocMarketService({
      ...h.deps,
      config: { ...h.deps.config, enabled: false },
    });
    const res = await disabled.placeBid({
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
      acceptTerms: true,
    });
    expect(res).toEqual({ ok: false, reason: 'disabled' });
  });

  it('refuses market_paused when the price oracle reports unhealthy', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const unhealthy: WocMarketEconomy = {
      ...h.economy,
      price: async () => ({
        available: true,
        healthy: false,
        reason: 'stale_oracle',
        tokensPerUsd: null,
        asOfMs: h.now(),
      }),
    };
    const paused = new WocMarketService({ ...h.deps, economy: unhealthy });
    const res = await paused.placeBid({
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
      acceptTerms: true,
    });
    expect(res).toEqual({ ok: false, reason: 'market_paused' });
  });
});

describe('confirmBond', () => {
  it('holds the bond and stands the bid on the listing', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const placed = unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
      }),
      'placeBid',
    );
    const confirmed = unwrap(
      await h.service.confirmBond(BUYER_A, placed.bid.id, 'sig-hold'),
      'confirmBond',
    );
    expect(confirmed.standing).toBe(true);
    const bid = await getBid(h, placed.bid.id);
    expect(bid.status).toBe('active');
    expect(bid.bondState).toBe('held');
    const row = await getListing(h, listing.id);
    expect(row.currentBidCents).toBe(5000);
    expect(row.currentBidId).toBe(placed.bid.id);
  });

  it('a lower bid confirming second is superseded and its bond flips to refund_due', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const high = unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 6000,
      }),
      'placeBid',
    );
    const low = unwrap(
      await placeBid(h, {
        account: BUYER_B,
        characterId: CHAR_B,
        listingId: listing.id,
        amountCents: 5500,
      }),
      'placeBid',
    );
    unwrap(await h.service.confirmBond(BUYER_A, high.bid.id, 'sig-high'), 'confirmBond');
    const second = unwrap(
      await h.service.confirmBond(BUYER_B, low.bid.id, 'sig-low'),
      'confirmBond',
    );
    expect(second.standing).toBe(false);
    const lowRow = await getBid(h, low.bid.id);
    expect(lowRow.status).toBe('outbid');
    expect(lowRow.bondState).toBe('refund_due');
    const highRow = await getBid(h, high.bid.id);
    expect(highRow.status).toBe('active');
    expect(highRow.bondState).toBe('held');
    const row = await getListing(h, listing.id);
    expect(row.currentBidCents).toBe(6000);
    expect(row.currentBidId).toBe(high.bid.id);
  });

  it('a higher bid confirming outbids the standing bid and updates the listing', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const first = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    const higher = unwrap(
      await placeBid(h, {
        account: BUYER_B,
        characterId: CHAR_B,
        listingId: listing.id,
        amountCents: 7000,
      }),
      'placeBid',
    );
    const res = unwrap(
      await h.service.confirmBond(BUYER_B, higher.bid.id, 'sig-higher'),
      'confirmBond',
    );
    expect(res.standing).toBe(true);
    const firstRow = await getBid(h, first.bidId);
    expect(firstRow.status).toBe('outbid');
    expect(firstRow.bondState).toBe('refund_due');
    const row = await getListing(h, listing.id);
    expect(row.currentBidCents).toBe(7000);
    expect(row.currentBidId).toBe(higher.bid.id);
  });

  it('refuses quote_expired past the bond quote TTL, then stands the bid on a refreshed quote', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const placed = unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
      }),
      'placeBid',
    );
    // A signature against a dead quote is unpriceable: the token amount the
    // bidder authorized is no longer what the bond is worth, so accepting it
    // would hold the wrong amount against the seat.
    h.setNow(BASE_MS + WOC_MARKET_QUOTE_TTL_SECONDS * 1000);
    const stale = await h.service.confirmBond(BUYER_A, placed.bid.id, 'sig-stale-bond');
    expect(stale).toEqual({ ok: false, reason: 'quote_expired' });
    const pending = await getBid(h, placed.bid.id);
    expect(pending.status).toBe('pending_bond');
    expect(pending.bondState).toBe('pending');
    const untouched = await getListing(h, listing.id);
    expect(untouched.currentBidId).toBeNull();
    expect(untouched.currentBidCents).toBeNull();
    // The refusal is recoverable, not terminal: the seat survives inside the
    // bond TTL and a fresh quote confirms it.
    const refreshed = unwrap(
      await h.service.refreshBondQuote(BUYER_A, placed.bid.id),
      'refreshBondQuote',
    );
    expect(refreshed.bond.reference).not.toBe(placed.bond.reference);
    const confirmed = unwrap(
      await h.service.confirmBond(BUYER_A, placed.bid.id, 'sig-fresh-bond'),
      'confirmBond',
    );
    expect(confirmed.standing).toBe(true);
    expect((await getBid(h, placed.bid.id)).bondState).toBe('held');
    expect((await getListing(h, listing.id)).currentBidId).toBe(placed.bid.id);
  });

  it('refuses not_pending when the same bond signature is presented a second time', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const placed = unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
      }),
      'placeBid',
    );
    const first = unwrap(
      await h.service.confirmBond(BUYER_A, placed.bid.id, 'sig-one-bond'),
      'confirmBond',
    );
    expect(first.standing).toBe(true);
    // One signed transfer is one hold. A retried request or a double-clicked
    // wallet replays the same signature, and the pending-state check is what
    // stops it re-running hold-and-activate (the transfer's own uniqueness is
    // the memo reference, which the economy service owns).
    const replay = await h.service.confirmBond(BUYER_A, placed.bid.id, 'sig-one-bond');
    expect(replay).toEqual({ ok: false, reason: 'not_pending' });
    const bid = await getBid(h, placed.bid.id);
    expect(bid.status).toBe('active');
    expect(bid.bondState).toBe('held');
    const row = await getListing(h, listing.id);
    expect(row.currentBidId).toBe(placed.bid.id);
    expect(row.currentBidCents).toBe(5000);
    // No bond churn either: the replay owes neither a refund nor a forfeit.
    expect(await h.db.bondsDue(REALM, 10)).toHaveLength(0);
  });

  it('refuses not_pending for a bid whose bond lapsed before the signature arrived', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const placed = unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
      }),
      'placeBid',
    );
    h.setNow(BASE_MS + WOC_MARKET_BOND_PENDING_TTL_SECONDS * 1000);
    await h.service.sweepPass();
    expect((await getBid(h, placed.bid.id)).status).toBe('lapsed');
    // A lapsed seat is gone for good: re-animating it on a late signature would
    // insert a stale amount ahead of bidders who placed after the lapse.
    const late = await h.service.confirmBond(BUYER_A, placed.bid.id, 'sig-late-bond');
    expect(late).toEqual({ ok: false, reason: 'not_pending' });
    const bid = await getBid(h, placed.bid.id);
    expect(bid.status).toBe('lapsed');
    expect(bid.bondState).toBe('void');
    expect((await getListing(h, listing.id)).currentBidId).toBeNull();
  });
});

describe('anti-snipe extension', () => {
  it('a final-window bid extends the close to the bid time plus the extension', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const bidAt = listing.endsAtMs - 60_000;
    h.setNow(bidAt);
    unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
      }),
      'placeBid',
    );
    const row = await getListing(h, listing.id);
    expect(row.endsAtMs).toBe(bidAt + WOC_MARKET_ANTI_SNIPE_EXTENSION_SECONDS * 1000);
    expect(row.baseEndsAtMs).toBe(listing.endsAtMs);
  });

  it('extensions never push the close past baseEndsAtMs plus the cap', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const capMs = listing.baseEndsAtMs + WOC_MARKET_ANTI_SNIPE_CAP_SECONDS * 1000;
    // Each final-window bid moves the end 60s forward; ride the ladder past
    // where the cap must clamp it (30 steps reach the cap; 40 overshoots).
    for (let i = 0; i < SNIPER_COUNT; i++) {
      const account = SNIPER_ACCOUNT_BASE + i;
      h.wallets.set(account, `wallet-snipe-${i}`);
      h.balances.set(`wallet-snipe-${i}`, 100_000_000);
      const before = await getListing(h, listing.id);
      h.setNow(before.endsAtMs - 60_000);
      unwrap(
        await placeBid(h, {
          account,
          characterId: SNIPER_CHAR_BASE + i,
          listingId: listing.id,
          amountCents: 5000,
        }),
        'placeBid',
      );
      const after = await getListing(h, listing.id);
      expect(after.endsAtMs).toBeLessThanOrEqual(capMs);
    }
    const final = await getListing(h, listing.id);
    expect(final.endsAtMs).toBe(capMs);
    expect(final.baseEndsAtMs).toBe(listing.baseEndsAtMs);
  });
});

describe('sweep close', () => {
  it('closes a no-bid auction as no_bids and flies the copy home', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('closed');
    expect(row.resolution).toBe('no_bids');
    expect(row.itemDisposed).toBe(true);
    expect(h.custody.parcels).toEqual([
      {
        recipientKey: String(SELLER_CHAR),
        letter: 'return',
        items: [expect.objectContaining({ itemId: EPIC_ITEM })],
        custodyRef: listingReturnCustodyRef(listing.id),
      },
    ]);
  });

  it('closes below reserve: standing bid outbid, bond refunded, copy returned', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { reserveCents: 6000 });
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('closed');
    expect(row.resolution).toBe('reserve_not_met');
    expect(row.itemDisposed).toBe(true);
    const bid = await getBid(h, standing.bidId);
    expect(bid.status).toBe('outbid');
    // The close flips the bond to refund_due; the same pass's bond arm then
    // refunds it through the dev economy, so the guarded refund_due ->
    // refunded transition is what proves the intermediate state.
    expect(bid.bondState).toBe('refunded');
    expect(h.custody.parcels.map((p) => p.custodyRef)).toEqual([
      listingReturnCustodyRef(listing.id),
    ]);
    expect(await h.db.liveSettlementForListing(listing.id)).toBeNull();
  });

  it('closes with a winner: bid won, settlement offered at attempt 1, listing settling', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    const sweepAt = listing.endsAtMs + 1;
    h.setNow(sweepAt);
    await h.service.sweepPass();
    const bid = await getBid(h, standing.bidId);
    expect(bid.status).toBe('won');
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('settling');
    const settlement = await liveSettlement(h, listing.id);
    expect(settlement).toMatchObject({
      listingId: listing.id,
      bidId: standing.bidId,
      attempt: 1,
      buyerAccount: BUYER_A,
      buyerCharacter: CHAR_A,
      buyerName: 'Aldan',
      amountCents: 5000,
      state: 'offered',
      deadlineAtMs: sweepAt + WOC_MARKET_SETTLEMENT_WINDOW_SECONDS * 1000,
    });
    // The copy stays in escrow while the settlement is live.
    expect(h.custody.parcels).toHaveLength(0);
  });
});

describe('settlement happy path', () => {
  it('quote then confirm delivers eagerly, records the sale, and refunds the bond on the next sweep', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    const sweepAt = listing.endsAtMs + 1;
    h.setNow(sweepAt);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);

    const quoted = unwrap(
      await h.service.settlementQuote(BUYER_A, settlement.id),
      'settlementQuote',
    );
    expect(quoted.quote.ok).toBe(true);
    expect(quoted.quote.reference).toMatch(/^dev_woc_/);
    expect(quoted.quote.seller).not.toBeNull(); // the split legs of a settlement quote
    const stamped = await getSettlement(h, settlement.id);
    expect(stamped.quoteReference).toBe(quoted.quote.reference);
    expect(stamped.quoteExpiresAtMs).toBe(sweepAt + WOC_MARKET_QUOTE_TTL_SECONDS * 1000);

    const confirmed = unwrap(
      await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-settle-1'),
      'confirmSettlement',
    );
    expect(confirmed.state).toBe('delivered');
    const after = await getSettlement(h, settlement.id);
    expect(after.state).toBe('delivered');
    expect(after.txSignature).toBe('sig-settle-1');

    const sales = await h.db.salesForItem(REALM, EPIC_ITEM, 10);
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({
      listingId: listing.id,
      itemId: EPIC_ITEM,
      priceCents: 5000,
      sellerAccount: SELLER,
      buyerAccount: BUYER_A,
      sellerName: 'Selara',
      buyerName: 'Aldan',
    });

    const row = await getListing(h, listing.id);
    expect(row.status).toBe('closed');
    expect(row.resolution).toBe('sold');
    expect(row.itemDisposed).toBe(true);

    const delivery = h.custody.parcels.find((p) => p.letter === 'delivery');
    expect(delivery).toEqual({
      recipientKey: String(CHAR_A),
      letter: 'delivery',
      items: [expect.objectContaining({ itemId: EPIC_ITEM })],
      custodyRef: settlementCustodyRef(settlement.id),
    });
    const notice = h.custody.parcels.find((p) => p.letter === 'sold_notice');
    expect(notice).toEqual({
      recipientKey: String(SELLER_CHAR),
      letter: 'sold_notice',
      items: [],
      custodyRef: listingSoldNoticeCustodyRef(listing.id),
    });

    // The winner's bond is owed back after delivery; the next sweep moves it.
    let bid = await getBid(h, standing.bidId);
    expect(bid.status).toBe('won');
    expect(bid.bondState).toBe('refund_due');
    await h.service.sweepPass();
    bid = await getBid(h, standing.bidId);
    expect(bid.bondState).toBe('refunded');
  });
});

describe('settlement quote expiry and signature reuse', () => {
  it('refuses quote_expired when the settlement quote died inside a still-live window', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    const sweepAt = listing.endsAtMs + 1;
    h.setNow(sweepAt);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    // The quote (90s) dies long before the settlement window (600s), so the
    // winner still has time to re-quote. Honouring the stale signature would
    // settle at a token amount the oracle no longer stands behind, which is a
    // direct transfer of the price move onto the seller.
    h.setNow(sweepAt + WOC_MARKET_QUOTE_TTL_SECONDS * 1000);
    const res = await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-stale-settle');
    expect(res).toEqual({ ok: false, reason: 'quote_expired' });
    const after = await getSettlement(h, settlement.id);
    expect(after.state).toBe('offered');
    expect(after.txSignature).toBeNull();
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10)).toHaveLength(0);
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('settling');
    expect(row.itemDisposed).toBe(false);
    expect(h.custody.parcels).toHaveLength(0);
    // The winner keeps their seat: the bond stays held against the live offer,
    // neither forfeited nor refunded by a refused confirmation.
    const bid = await getBid(h, standing.bidId);
    expect(bid.status).toBe('won');
    expect(bid.bondState).toBe('held');
  });

  it('refuses signature_reused when one transfer is replayed on a second settlement', async () => {
    const h = makeHarness();
    // Two escrowed copies, because the replay only matters ACROSS settlements:
    // the tx_signature uniqueness is what stops one paid transfer from claiming
    // two items.
    h.custody.bags.set(SELLER_CHAR, [
      { itemId: EPIC_ITEM, count: 1 },
      { itemId: EPIC_ITEM, count: 1 },
    ]);
    const paidListing = await listEpic(h);
    const replayListing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, paidListing.id, 5000);
    const replayBid = await confirmedBid(h, BUYER_A, CHAR_A, replayListing.id, 5000);
    h.setNow(paidListing.endsAtMs + 1);
    await h.service.sweepPass();
    const paid = await liveSettlement(h, paidListing.id);
    const replay = await liveSettlement(h, replayListing.id);

    unwrap(await h.service.settlementQuote(BUYER_A, paid.id), 'settlementQuote');
    const settled = unwrap(
      await h.service.confirmSettlement(BUYER_A, paid.id, 'sig-one-transfer'),
      'confirmSettlement',
    );
    expect(settled.state).toBe('delivered');

    unwrap(await h.service.settlementQuote(BUYER_A, replay.id), 'settlementQuote');
    const res = await h.service.confirmSettlement(BUYER_A, replay.id, 'sig-one-transfer');
    expect(res).toEqual({ ok: false, reason: 'signature_reused' });
    const stillOffered = await getSettlement(h, replay.id);
    expect(stillOffered.state).toBe('offered');
    expect(stillOffered.txSignature).toBeNull();
    // The stamped quote survives the refusal, so the buyer can retry with a real
    // transfer inside the same window.
    expect(stillOffered.quoteReference).not.toBeNull();
    // Exactly one sale, for the settlement that actually paid.
    const sales = await h.db.salesForItem(REALM, EPIC_ITEM, 10);
    expect(sales.map((s) => s.listingId)).toEqual([paidListing.id]);
    const row = await getListing(h, replayListing.id);
    expect(row.status).toBe('settling');
    expect(row.itemDisposed).toBe(false);
    // One delivery only: the second copy is still in escrow.
    const deliveries = h.custody.parcels.filter((p) => p.letter === 'delivery');
    expect(deliveries.map((p) => p.custodyRef)).toEqual([settlementCustodyRef(paid.id)]);
    const bid = await getBid(h, replayBid.bidId);
    expect(bid.status).toBe('won');
    expect(bid.bondState).toBe('held');
  });
});

describe('settlement expiry', () => {
  it('expires an unpaid settlement: defaulted winner, forfeited bond, one strike, unsettled return', async () => {
    const h = makeHarness();
    const listing = await listEpic(h); // offerNext false
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);

    h.setNow(settlement.deadlineAtMs + 1);
    await h.service.sweepPass();

    const after = await getSettlement(h, settlement.id);
    expect(after.state).toBe('expired');
    expect(after.failReason).toBe('window_elapsed');
    const bid = await getBid(h, standing.bidId);
    expect(bid.status).toBe('defaulted');
    // forfeit_due was processed by the same pass's bond arm (guarded
    // forfeit_due -> forfeited proves the intermediate state).
    expect(bid.bondState).toBe('forfeited');
    // First strike earns no suspension (strikeSuspensionMs(1) is 0), so the
    // service passes null and the insert arm stores null.
    expect(await h.db.strikeInfo(BUYER_A)).toEqual({
      accountId: BUYER_A,
      strikes: 1,
      suspendedUntilMs: null,
    });
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('closed');
    expect(row.resolution).toBe('unsettled');
    expect(row.itemDisposed).toBe(true);
    expect(h.custody.parcels.map((p) => p.custodyRef)).toEqual([
      listingReturnCustodyRef(listing.id),
    ]);
  });

  it('offerNext cascades to the outbid bidder at their own amount, attempt 2', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { offerNext: true });
    const under = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    const over = await confirmedBid(h, BUYER_B, CHAR_B, listing.id, 5500);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const first = await liveSettlement(h, listing.id);
    expect(first).toMatchObject({ bidId: over.bidId, attempt: 1, amountCents: 5500 });

    h.setNow(first.deadlineAtMs + 1);
    await h.service.sweepPass();
    expect((await getSettlement(h, first.id)).state).toBe('expired');
    expect((await getBid(h, over.bidId)).status).toBe('defaulted');
    const cascade = await liveSettlement(h, listing.id);
    expect(cascade.id).not.toBe(first.id);
    expect(cascade).toMatchObject({
      listingId: listing.id,
      bidId: under.bidId,
      attempt: 2,
      buyerAccount: BUYER_A,
      buyerCharacter: CHAR_A,
      // The cascade offer is at the OUTBID BIDDER'S OWN amount, never the
      // defaulted winner's price.
      amountCents: 5000,
      state: 'offered',
    });
    expect((await getBid(h, under.bidId)).status).toBe('won');
    // The listing stays in settlement, not closed, and the copy stays escrowed.
    expect((await getListing(h, listing.id)).status).toBe('settling');
    expect(h.custody.parcels).toHaveLength(0);
  });
});

describe('buy now', () => {
  it('locks, settles at the buy-now price, refuses a rival, cancels the standing bid on delivery', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { format: 'buy_now', buyNowCents: 8000 });
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);

    const buy = unwrap(
      await h.service.buyNow({
        account: BUYER_B,
        characterId: CHAR_B,
        listingId: listing.id,
        acceptTerms: true,
      }),
      'buyNow',
    );
    expect(buy.settlement).toMatchObject({
      listingId: listing.id,
      bidId: null,
      attempt: 0,
      buyerAccount: BUYER_B,
      buyerCharacter: CHAR_B,
      buyerName: 'Brint',
      amountCents: 8000,
      state: 'offered',
      deadlineAtMs: BASE_MS + WOC_MARKET_BUY_NOW_LOCK_SECONDS * 1000,
    });
    expect(buy.quote.ok).toBe(true);
    expect(buy.quote.reference).toMatch(/^dev_woc_/);
    const locked = await getListing(h, listing.id);
    expect(locked.buyNowLockAccount).toBe(BUYER_B);
    expect(locked.buyNowLockExpiresMs).toBe(BASE_MS + WOC_MARKET_BUY_NOW_LOCK_SECONDS * 1000);

    const rival = await h.service.buyNow({
      account: BUYER_C,
      characterId: CHAR_C,
      listingId: listing.id,
      acceptTerms: true,
    });
    expect(rival).toEqual({ ok: false, reason: 'buy_now_locked' });

    const confirmed = unwrap(
      await h.service.confirmSettlement(BUYER_B, buy.settlement.id, 'sig-buy-now'),
      'confirmSettlement',
    );
    expect(confirmed.state).toBe('delivered');
    const sales = await h.db.salesForItem(REALM, EPIC_ITEM, 10);
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ priceCents: 8000, buyerName: 'Brint' });
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('closed');
    expect(row.resolution).toBe('sold');
    expect(row.itemDisposed).toBe(true);
    // The buy-now landed over a standing auction bid: it is cancelled with
    // its held bond owed back.
    const bid = await getBid(h, standing.bidId);
    expect(bid.status).toBe('cancelled');
    expect(bid.bondState).toBe('refund_due');
    const delivery = h.custody.parcels.find((p) => p.letter === 'delivery');
    expect(delivery).toMatchObject({
      recipientKey: String(CHAR_B),
      custodyRef: settlementCustodyRef(buy.settlement.id),
    });
  });

  it('lapses an abandoned buy-now lock on the sweep and leaves the listing live', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { format: 'buy_now', buyNowCents: 8000 });
    const buy = unwrap(
      await h.service.buyNow({
        account: BUYER_B,
        characterId: CHAR_B,
        listingId: listing.id,
        acceptTerms: true,
      }),
      'buyNow',
    );
    // The holder walked away without ever signing. A lock that outlives its
    // deadline takes the listing off the market for good while the auction clock
    // keeps running down, so the item resolves with nobody able to buy it.
    h.setNow(BASE_MS + WOC_MARKET_BUY_NOW_LOCK_SECONDS * 1000);
    await h.service.sweepPass();
    const lapsed = await getSettlement(h, buy.settlement.id);
    expect(lapsed.state).toBe('expired');
    expect(lapsed.failReason).toBe('window_elapsed');
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('active');
    expect(row.buyNowLockAccount).toBeNull();
    expect(row.buyNowLockExpiresMs).toBeNull();
    expect(row.itemDisposed).toBe(false);
    // No bid and no bond was ever at risk, so an abandoned buy-now earns no
    // strike: the strike ladder punishes defaulting WINNERS.
    expect(await h.db.strikeInfo(BUYER_B)).toBeNull();
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10)).toHaveLength(0);
    expect(h.custody.parcels).toHaveLength(0);
    // Still biddable AND still buyable: the next buyer takes a fresh lock.
    const bid = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 5000,
    });
    expect(bid.ok).toBe(true);
    const next = unwrap(
      await h.service.buyNow({
        account: BUYER_C,
        characterId: CHAR_C,
        listingId: listing.id,
        acceptTerms: true,
      }),
      'buyNow',
    );
    expect(next.settlement.buyerAccount).toBe(BUYER_C);
    expect(next.settlement.amountCents).toBe(8000);
    expect((await getListing(h, listing.id)).buyNowLockAccount).toBe(BUYER_C);
  });
});

describe('crash reconciliation', () => {
  it('a delivering settlement survives a persist crash and books exactly once on retry', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    // A worker claimed delivery and crashed mid-flight.
    expect(await h.db.transitionSettlement(settlement.id, ['offered'], 'delivering')).toBe(true);
    h.custody.failNextPersist = true;
    await expect(h.service.sweepPass()).rejects.toThrow('persist failed');
    expect((await getSettlement(h, settlement.id)).state).toBe('delivering');
    expect(h.custody.parcels).toHaveLength(0);

    // The next pass resumes the stuck row and books the parcel exactly once.
    await h.service.sweepPass();
    expect((await getSettlement(h, settlement.id)).state).toBe('delivered');
    const deliveries = h.custody.parcels.filter(
      (p) => p.custodyRef === settlementCustodyRef(settlement.id),
    );
    expect(deliveries).toHaveLength(1);
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10)).toHaveLength(1);
    const row = await getListing(h, listing.id);
    expect(row.resolution).toBe('sold');
    expect(row.itemDisposed).toBe(true);
  });
});

describe('stranded listing reclaim', () => {
  it('reopens a listing stuck in ending past the grace so the close arm resolves it', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    h.setNow(listing.endsAtMs + 1);
    // A worker claimed the due listing and died before resolving it. Nothing
    // else can reach an 'ending' row (claimDueListings only selects 'active'),
    // so without the reclaim the escrowed copy is stranded forever.
    const claimed = await h.db.claimDueListings(REALM, h.now(), 10);
    expect(claimed.map((r) => r.id)).toEqual([listing.id]);
    expect((await getListing(h, listing.id)).status).toBe('ending');

    h.setNow(listing.endsAtMs + 1 + WOC_MARKET_STRANDED_RECLAIM_SECONDS * 1000);
    const stats = await h.service.sweepPass();
    expect(stats?.reclaimed).toBe(1);
    expect(stats?.closed).toBe(1);
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('closed');
    expect(row.resolution).toBe('no_bids');
    expect(row.itemDisposed).toBe(true);
    expect(h.custody.parcels.map((p) => p.custodyRef)).toEqual([
      listingReturnCustodyRef(listing.id),
    ]);
  });

  it('leaves a mid-resolution listing alone one millisecond inside the grace', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    h.setNow(listing.endsAtMs + 1);
    await h.db.claimDueListings(REALM, h.now(), 10);
    // One millisecond short of the grace. Reclaiming early would race a worker
    // that is still resolving the row and resolve the same auction twice.
    h.setNow(listing.endsAtMs + WOC_MARKET_STRANDED_RECLAIM_SECONDS * 1000);
    const stats = await h.service.sweepPass();
    expect(stats?.reclaimed).toBe(0);
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('ending');
    expect(row.resolution).toBeNull();
    expect(row.itemDisposed).toBe(false);
    expect(h.custody.parcels).toHaveLength(0);
  });
});

describe('custody book-once claims', () => {
  it('releases the claim when a booking fails and books exactly once on the retry', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    expect(await h.service.adminSuspendListing(listing.id)).toEqual({ ok: true });
    const ref = listingReturnCustodyRef(listing.id);
    // The mail persist fails after the claim landed. If the claim survived, the
    // ref would look booked forever and the escrowed copy would never fly home.
    h.custody.failNextPersist = true;
    await h.service.sweepPass();
    expect(h.custody.persistCalls).toEqual([ref]);
    expect(h.custody.parcels).toHaveLength(0);
    expect(h.db.custodyClaims.has(ref)).toBe(false);
    expect((await getListing(h, listing.id)).itemDisposed).toBe(false);

    await h.service.sweepPass();
    // Two ATTEMPTS, one booking: the ledger is what makes the retry safe.
    expect(h.custody.persistCalls).toEqual([ref, ref]);
    expect(h.custody.parcels).toEqual([
      {
        recipientKey: String(SELLER_CHAR),
        letter: 'return',
        items: [expect.objectContaining({ itemId: EPIC_ITEM })],
        custodyRef: ref,
      },
    ]);
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBe(BASE_MS);
    expect((await getListing(h, listing.id)).itemDisposed).toBe(true);
  });

  it('never re-mails a custody ref a previous pass already booked', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    await h.service.adminSuspendListing(listing.id);
    const ref = listingReturnCustodyRef(listing.id);
    // A previous pass booked and persisted the parcel but died before marking
    // the item disposed, so the backlog still holds this listing. The Postgres
    // claim (not the mail blob, which a player can delete) is the authority that
    // keeps the reconciliation from mailing the copy a second time.
    expect(await h.db.claimCustodyRef(REALM, ref)).toBe(true);
    await h.db.markCustodyRefBooked(ref);
    h.setNow(BASE_MS + 60_000);
    await h.service.sweepPass();
    expect(h.custody.persistCalls).toEqual([]);
    expect(h.custody.parcels).toHaveLength(0);
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBe(BASE_MS);
    // The flight still settles: the listing leaves the backlog.
    expect((await getListing(h, listing.id)).itemDisposed).toBe(true);
  });
});

describe('bond lapse', () => {
  it('a pending bid past the bond TTL lapses with a void bond', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const placed = unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
      }),
      'placeBid',
    );
    h.setNow(BASE_MS + WOC_MARKET_BOND_PENDING_TTL_SECONDS * 1000);
    await h.service.sweepPass();
    const bid = await getBid(h, placed.bid.id);
    expect(bid.status).toBe('lapsed');
    expect(bid.bondState).toBe('void');
    // Nothing was transferred, so the bond arm never owes a refund.
    expect(await h.db.bondsDue(REALM, 10)).toHaveLength(0);
  });
});

describe('adminSuspendListing', () => {
  it('cancels open bids, refunds held bonds, expires the live settlement, and returns the item', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { format: 'buy_now', buyNowCents: 8000 });
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    const buy = unwrap(
      await h.service.buyNow({
        account: BUYER_B,
        characterId: CHAR_B,
        listingId: listing.id,
        acceptTerms: true,
      }),
      'buyNow',
    );

    const out = await h.service.adminSuspendListing(listing.id);
    expect(out).toEqual({ ok: true });
    const bid = await getBid(h, standing.bidId);
    expect(bid.status).toBe('cancelled');
    expect(bid.bondState).toBe('refund_due');
    const settlement = await getSettlement(h, buy.settlement.id);
    expect(settlement.state).toBe('expired');
    expect(settlement.failReason).toBe('listing_suspended');
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('closed');
    expect(row.resolution).toBe('suspended');
    expect(row.itemDisposed).toBe(false);

    // The sweep's reconciliation arm flies the copy home and pays the refund.
    await h.service.sweepPass();
    const swept = await getListing(h, listing.id);
    expect(swept.itemDisposed).toBe(true);
    expect(h.custody.parcels).toEqual([
      expect.objectContaining({
        recipientKey: String(SELLER_CHAR),
        letter: 'return',
        custodyRef: listingReturnCustodyRef(listing.id),
      }),
    ]);
    expect((await getBid(h, standing.bidId)).bondState).toBe('refunded');
  });
});

describe('owned loaders (the requireOwned 404 seam)', () => {
  it('ownedListing resolves for the seller and returns null for a foreign or absent id', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const mine = await h.service.ownedListing(SELLER, listing.id);
    expect(mine).not.toBeNull();
    expect(mine?.id).toBe(listing.id);
    expect(mine?.sellerAccount).toBe(SELLER);
    // Both misses return the SAME null, which is what lets the middleware answer
    // 404 either way: a distinguishable "exists but not yours" would turn the
    // seller endpoints into a listing-id enumeration oracle.
    expect(await h.service.ownedListing(BUYER_A, listing.id)).toBeNull();
    expect(await h.service.ownedListing(SELLER, listing.id + 999)).toBeNull();
  });

  it('ownedBid resolves for the bidder and returns null for a foreign or absent id', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const placed = unwrap(
      await placeBid(h, {
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        amountCents: 5000,
      }),
      'placeBid',
    );
    const mine = await h.service.ownedBid(BUYER_A, placed.bid.id);
    expect(mine).not.toBeNull();
    expect(mine?.id).toBe(placed.bid.id);
    expect(mine?.account).toBe(BUYER_A);
    expect(mine?.amountCents).toBe(5000);
    // A rival must not be able to read (or confirm against) someone else's bond.
    expect(await h.service.ownedBid(BUYER_B, placed.bid.id)).toBeNull();
    expect(await h.service.ownedBid(BUYER_A, placed.bid.id + 999)).toBeNull();
  });

  it('ownedSettlement resolves for the buyer and returns null for a foreign or absent id', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    const mine = await h.service.ownedSettlement(BUYER_A, settlement.id);
    expect(mine).not.toBeNull();
    expect(mine?.id).toBe(settlement.id);
    expect(mine?.buyerAccount).toBe(BUYER_A);
    expect(mine?.amountCents).toBe(5000);
    // The settlement carries the buyer's wallet and the signed quote, so a
    // foreign read is the one that matters most here.
    expect(await h.service.ownedSettlement(BUYER_C, settlement.id)).toBeNull();
    expect(await h.service.ownedSettlement(BUYER_A, settlement.id + 999)).toBeNull();
  });
});

describe('a directed sale is visible and buyable only to its two parties', () => {
  // The row id is a small integer and therefore guessable, so browse exclusion
  // alone is not a defence. Each test below covers one independent gate.
  const BROWSE: WocBrowseQuery = {
    page: 0,
    pageSize: 50,
    quality: null,
    format: null,
    itemIds: null,
    sort: 'ending',
  };
  const directedParams = (over: Partial<WocListingParams> = {}) =>
    listingParams({
      format: 'buy_now',
      startCents: 5000,
      reserveCents: null,
      buyNowCents: 5000,
      directedBuyerAccount: BUYER_A,
      ...over,
    });
  /** Two epic copies, so one listing does not consume the other's item. */
  function stocked(): Harness {
    const h = makeHarness();
    h.custody.bags.set(
      SELLER_CHAR,
      Array.from({ length: WOC_MARKET_MAX_ACTIVE_LISTINGS + 3 }, () => ({
        itemId: EPIC_ITEM,
        count: 1,
      })),
    );
    return h;
  }

  it('never appears in the public browse result set', async () => {
    const h = stocked();
    const directed = await listEpic(h, directedParams());
    const open = await listEpic(h, { format: 'auction', startCents: 2000 });
    const ids = (await h.service.browse(BROWSE)).rows.map((r) => r.id);
    expect(ids, 'the public listing must still browse').toContain(open.id);
    expect(ids, 'the directed listing must be invisible to everyone').not.toContain(directed.id);
  });

  it('reads as not-found for a stranger, and resolves for either party', async () => {
    const h = stocked();
    const directed = await listEpic(h, directedParams());
    expect(await h.service.listingDetail(directed.id, BUYER_B)).toBeNull();
    // Signed out is the same answer: an absent viewer must not be a bypass.
    expect(await h.service.listingDetail(directed.id, null)).toBeNull();
    expect((await h.service.listingDetail(directed.id, BUYER_A))?.listing.id).toBe(directed.id);
    expect((await h.service.listingDetail(directed.id, SELLER))?.listing.id).toBe(directed.id);
  });

  it('refuses buyNow from anyone but the designated buyer, as not_found', async () => {
    const h = stocked();
    const directed = await listEpic(h, directedParams());
    const res = await h.service.buyNow({
      account: BUYER_B,
      characterId: CHAR_B,
      listingId: directed.id,
      acceptTerms: true,
    });
    expect(res.ok).toBe(false);
    // not_found, NOT a distinct "not for you": a caller probing ids must not be
    // able to tell an empty id from someone else's private trade in flight.
    expect((res as { reason: string }).reason).toBe('not_found');
  });

  it('does not count against the seller 12-listing cap', async () => {
    const h = stocked();
    for (let i = 0; i < WOC_MARKET_MAX_ACTIVE_LISTINGS; i += 1) await listEpic(h);
    const blocked = await h.service.createListing({
      account: SELLER,
      characterId: SELLER_CHAR,
      itemRef: { index: 0, itemId: EPIC_ITEM },
      params: listingParams(),
    });
    expect(blocked, 'a 13th public listing must be refused').toEqual({
      ok: false,
      reason: 'cap_reached',
    });
    const directed = await h.service.createListing({
      account: SELLER,
      characterId: SELLER_CHAR,
      itemRef: { index: 0, itemId: EPIC_ITEM },
      params: directedParams(),
    });
    expect(directed.ok, 'a directed offer must be exempt from the cap').toBe(true);
  });

  it('leaves a PUBLIC buy-now buyable by any account', async () => {
    // The guard must key on the directed field, never on "is this a buy_now".
    const h = stocked();
    const open = await listEpic(h, {
      format: 'buy_now',
      startCents: 2000,
      reserveCents: null,
      buyNowCents: 5000,
    });
    const res = await h.service.buyNow({
      account: BUYER_B,
      characterId: CHAR_B,
      listingId: open.id,
      acceptTerms: true,
    });
    expect(res.ok, 'a public buy-now must not be caught by the directed guard').toBe(true);
  });
});

describe('directed p2p offers: propose, accept, and the escrow moment', () => {
  function stocked(): Harness {
    const h = makeHarness();
    h.custody.bags.set(SELLER_CHAR, [
      { itemId: EPIC_ITEM, count: 1 },
      { itemId: EPIC_ITEM, count: 1 },
    ]);
    return h;
  }
  const offerArgs = (over: Record<string, unknown> = {}) => ({
    account: SELLER,
    characterId: SELLER_CHAR,
    itemRef: { index: 0, itemId: EPIC_ITEM },
    buyerCharacterId: CHAR_A,
    usdCents: 5000,
    ...over,
  });

  it('escrows NOTHING at offer time: the seller keeps the item until acceptance', async () => {
    // This is the whole reason an offer is not a listing. If proposing escrowed,
    // anyone could lock a chosen player's goods by offering deals they never
    // intend to complete.
    const h = stocked();
    const before = bagsOf(h, SELLER_CHAR).length;
    const res = await h.service.createDirectedOffer(offerArgs());
    expect(res.ok).toBe(true);
    expect(bagsOf(h, SELLER_CHAR)).toHaveLength(before);
  });

  it('refuses when the named recipient has no verified wallet', async () => {
    // The refusal the seller's window turns into "that player must connect a
    // wallet", so it must be its own reason and not a generic wallet_required.
    const h = stocked();
    h.wallets.delete(BUYER_A);
    const res = await h.service.createDirectedOffer(offerArgs());
    expect(res).toEqual({ ok: false, reason: 'recipient_wallet_required' });
  });

  it('refuses an offer addressed to yourself', async () => {
    const h = stocked();
    const res = await h.service.createDirectedOffer(offerArgs({ buyerCharacterId: SELLER_CHAR }));
    expect(res).toEqual({ ok: false, reason: 'self_offer' });
  });

  it('accepting escrows the item and produces a directed listing at the agreed price', async () => {
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    const before = bagsOf(h, SELLER_CHAR).length;
    const accepted = await h.service.acceptDirectedOffer(BUYER_A, offer.offer.id);
    if (!accepted.ok) throw new Error(`accept refused: ${(accepted as { reason: string }).reason}`);
    expect(bagsOf(h, SELLER_CHAR), 'the copy left the bags').toHaveLength(before - 1);
    expect(accepted.listing.directedBuyerAccount).toBe(BUYER_A);
    // One agreed price, carried onto both price fields.
    expect(accepted.listing.buyNowCents).toBe(5000);
    expect(accepted.listing.startCents).toBe(5000);
  });

  it('refuses acceptance by anyone but the named buyer, as not_found', async () => {
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    const res = await h.service.acceptDirectedOffer(BUYER_B, offer.offer.id);
    expect(res).toEqual({ ok: false, reason: 'not_found' });
    expect(bagsOf(h, SELLER_CHAR), 'a refused accept escrows nothing').toHaveLength(2);
  });

  it('accepting twice CONCURRENTLY escrows exactly one copy', async () => {
    // Fired in parallel, deliberately. Awaiting them in sequence proves nothing:
    // the second call would see status 'accepted' and be turned away by the
    // pre-check, so the test passes even with the compare-and-set claim removed.
    // The real shape is a double-click putting two requests in flight together,
    // where both read 'pending' before either writes, and only the claim's
    // compare-and-set stops both reaching createListing and taking two copies.
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    const [first, second] = await Promise.all([
      h.service.acceptDirectedOffer(BUYER_A, offer.offer.id),
      h.service.acceptDirectedOffer(BUYER_A, offer.offer.id),
    ]);
    expect([first.ok, second.ok].filter(Boolean), 'exactly one accept wins').toHaveLength(1);
    expect(bagsOf(h, SELLER_CHAR), 'exactly one copy escrowed').toHaveLength(1);
  });

  it('a sequential second accept is also refused', async () => {
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    expect((await h.service.acceptDirectedOffer(BUYER_A, offer.offer.id)).ok).toBe(true);
    expect(await h.service.acceptDirectedOffer(BUYER_A, offer.offer.id)).toEqual({
      ok: false,
      reason: 'not_pending',
    });
  });

  it('reopens the offer when the escrow fails, so a transient refusal is retryable', async () => {
    // The compensating half of claim-then-escrow. Without it the offer is
    // silently dead while both players still see it as live.
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    h.db.failNextEscrow = 'lease_lost';
    const failed = await h.service.acceptDirectedOffer(BUYER_A, offer.offer.id);
    expect(failed.ok).toBe(false);
    expect(bagsOf(h, SELLER_CHAR), 'the copy came back').toHaveLength(2);
    // Still pending, so the buyer can simply try again.
    const retried = await h.service.acceptDirectedOffer(BUYER_A, offer.offer.id);
    expect(retried.ok, 'the reopened offer accepts on retry').toBe(true);
  });

  it('refuses acceptance after the TTL, and never escrows for an expired offer', async () => {
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    h.setNow(offer.offer.expiresAtMs);
    const res = await h.service.acceptDirectedOffer(BUYER_A, offer.offer.id);
    expect(res).toEqual({ ok: false, reason: 'offer_expired' });
    expect(bagsOf(h, SELLER_CHAR)).toHaveLength(2);
  });

  it('lets the buyer decline and the seller withdraw, but not the reverse', async () => {
    const h = stocked();
    const a = await h.service.createDirectedOffer(offerArgs());
    const b = await h.service.createDirectedOffer(offerArgs({ itemRef: { index: 1, itemId: EPIC_ITEM } }));
    if (!a.ok || !b.ok) throw new Error('offer refused');
    // Wrong actor for each verb reads as not_found, same anti-enumeration shape.
    expect(await h.service.resolveDirectedOffer(SELLER, a.offer.id, 'decline')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await h.service.resolveDirectedOffer(BUYER_A, b.offer.id, 'withdraw')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await h.service.resolveDirectedOffer(BUYER_A, a.offer.id, 'decline')).toEqual({
      ok: true,
    });
    expect(await h.service.resolveDirectedOffer(SELLER, b.offer.id, 'withdraw')).toEqual({
      ok: true,
    });
    // Neither verb touches custody.
    expect(bagsOf(h, SELLER_CHAR)).toHaveLength(2);
  });
});

describe('a directed sale carries the consequences of the rail it rides', () => {
  function stocked(): Harness {
    const h = makeHarness();
    h.custody.bags.set(SELLER_CHAR, [
      { itemId: EPIC_ITEM, count: 1 },
      { itemId: EPIC_ITEM, count: 1 },
    ]);
    return h;
  }

  /** Offer -> accept -> the buyer holds a live settlement they must pay. */
  async function acceptedOffer(h: Harness): Promise<WocListingRow> {
    const offer = await h.service.createDirectedOffer({
      account: SELLER,
      characterId: SELLER_CHAR,
      itemRef: { index: 0, itemId: EPIC_ITEM },
      buyerCharacterId: CHAR_A,
      usdCents: 5000,
    });
    if (!offer.ok) throw new Error('offer refused');
    const accepted = await h.service.acceptDirectedOffer(BUYER_A, offer.offer.id);
    if (!accepted.ok) throw new Error('accept refused');
    return accepted.listing;
  }

  it('strikes a buyer who accepts and then never pays', async () => {
    // The requester's rule: strikes apply to p2p non-payment once both parties
    // have accepted. Acceptance is exactly when the seller's item left their
    // bags, so walking away has a cost to a specific person. There is no bond on
    // a directed sale, which makes the strike the only consequence available.
    const h = stocked();
    const listing = await acceptedOffer(h);
    const bought = await h.service.buyNow({
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      acceptTerms: true,
    });
    expect(bought.ok, 'the designated buyer can buy').toBe(true);
    expect(await h.db.strikeInfo(BUYER_A), 'no strike before the window lapses').toBeNull();

    const settlement = await liveSettlement(h, listing.id);
    h.setNow(settlement.deadlineAtMs + 1);
    await h.service.sweepPass();

    expect(await h.db.strikeInfo(BUYER_A)).toMatchObject({
      accountId: BUYER_A,
      strikes: 1,
    });
  });

  it('does NOT strike an abandoned PUBLIC buy-now', async () => {
    // The other arm, and the reason the strike is keyed on the directed field
    // rather than on "was this a buy-now": a public buy-now buyer committed to
    // nothing, and the listing simply resumes for the next person.
    const h = stocked();
    const open = await listEpic(h, {
      format: 'buy_now',
      startCents: 2000,
      reserveCents: null,
      buyNowCents: 5000,
    });
    const bought = await h.service.buyNow({
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: open.id,
      acceptTerms: true,
    });
    expect(bought.ok).toBe(true);
    const settlement = await liveSettlement(h, open.id);
    h.setNow(settlement.deadlineAtMs + 1);
    await h.service.sweepPass();
    expect(await h.db.strikeInfo(BUYER_A), 'a public buy-now costs no strike').toBeNull();
  });

  it('lands a completed directed sale in the PUBLIC sales history, named on both sides', async () => {
    // The requester asked for public history covering every p2p $WOC trade. It
    // needs no special casing, but "needs none" is worth proving rather than
    // assuming: the row must actually be there, with both player names.
    const h = stocked();
    const listing = await acceptedOffer(h);
    unwrap(
      await h.service.buyNow({
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        acceptTerms: true,
      }),
      'buyNow',
    );
    const settlement = await liveSettlement(h, listing.id);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    unwrap(
      await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-directed'),
      'confirmSettlement',
    );
    await h.service.sweepPass();

    const sales = await h.service.salesHistory(EPIC_ITEM, 20);
    const mine = sales.filter((s) => s.listingId === listing.id);
    expect(mine, 'the directed sale is publicly recorded').toHaveLength(1);
    expect(mine[0].priceCents).toBe(5000);
    expect(mine[0].sellerName).toBeTruthy();
    expect(mine[0].buyerName).toBeTruthy();
  });
});

describe('the trade window asks whether a counterparty can be paid in $WOC', () => {
  it('reports a linked player as payable, by character and with no account id', async () => {
    const h = makeHarness();
    const partner = await h.service.tradePartner(SELLER, CHAR_A);
    expect(partner).toEqual({ characterId: CHAR_A, name: 'Aldan', walletVerified: true });
    // The response shape is the contract: leaking an account id here would put
    // one on the wire for every player you open a trade with.
    expect(Object.keys(partner ?? {}).sort()).toEqual(['characterId', 'name', 'walletVerified']);
  });

  it('reports an unlinked player as not payable, which is what drives the copy', async () => {
    const h = makeHarness();
    h.wallets.delete(BUYER_A);
    expect((await h.service.tradePartner(SELLER, CHAR_A))?.walletVerified).toBe(false);
  });

  it('reports YOUR OWN character as not payable', async () => {
    // So the window never offers an arm that createDirectedOffer would refuse.
    const h = makeHarness();
    expect((await h.service.tradePartner(SELLER, SELLER_CHAR))?.walletVerified).toBe(false);
  });

  it('reads as absent for a character that is not on this realm', async () => {
    const h = makeHarness();
    expect(await h.service.tradePartner(SELLER, 999_999)).toBeNull();
  });

  it('refuses an offer to another character of your OWN account', async () => {
    // Same account, different character: an alt is still yourself, and the
    // check must be on the resolved ACCOUNT rather than the character id.
    const h = makeHarness();
    h.custody.bags.set(SELLER_CHAR, [{ itemId: EPIC_ITEM, count: 1 }]);
    const res = await h.service.createDirectedOffer({
      account: SELLER,
      characterId: SELLER_CHAR,
      itemRef: { index: 0, itemId: EPIC_ITEM },
      buyerCharacterId: SELLER_ALT_CHAR,
      usdCents: 5000,
    });
    expect(res).toEqual({ ok: false, reason: 'self_offer' });
  });
});
