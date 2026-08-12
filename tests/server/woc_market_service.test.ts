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

import { describe, expect, it, vi } from 'vitest';
import type {
  Refused,
  WocBidRow,
  WocBrowseQuery,
  WocCustodyExtract,
  WocCustodyGrant,
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
  /** How many times grantCopy actually granted: the double-copy pins count
   *  grants, because the bag length alone can mask a grant-then-restore. */
  grantCalls = 0;
  /** The live session identity grant/snapshot saves carry; a test rotates it
   *  to model a relog (a takeover mints a new lease nonce). */
  leaseNonce: string | undefined = 'nonce';

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

  /** Characters whose bags are full: grantCopy refuses them, so a test can
   *  drive the mail fallback without modelling real capacity. */
  readonly fullBags = new Set<number>();
  /** Force the NEXT grantCopy to report the AMBIGUOUS refusal (consumed on
   *  use): the copy reaches the LIVE bags and only the re-serialize fails, so
   *  the caller may neither mail over it nor treat the grant as refused. */
  failNextGrantAmbiguous = false;

  grantCopy(accountId: number, characterId: number, slot: InvSlot): WocCustodyGrant {
    const inventory = this.bags.get(characterId);
    // Same three refusals, in the same order, as the real bridge: offline (no
    // live session), wrong owner, no room.
    if (!inventory) return { ok: false, reason: 'offline' };
    if (this.owners.get(characterId) !== accountId) return { ok: false, reason: 'not_yours' };
    if (this.fullBags.has(characterId)) return { ok: false, reason: 'no_space' };
    inventory.push(slot);
    this.grantCalls++;
    if (this.failNextGrantAmbiguous) {
      this.failNextGrantAmbiguous = false;
      // Mirrors the real bridge's ordering: grantTradableCopy already mutated
      // the bags above, and only serializeCharacter came back empty.
      return { ok: false, reason: 'ambiguous' };
    }
    return {
      ok: true,
      save: {
        characterId,
        level: 10,
        state: {} as unknown as CharacterState,
        leaseNonce: this.leaseNonce,
      },
    };
  }

  snapshotCopy(accountId: number, characterId: number): WocCustodyGrant {
    // The resume arm: same session checks as grantCopy, but the bags are
    // untouched (they already hold the earlier grant).
    const inventory = this.bags.get(characterId);
    if (!inventory) return { ok: false, reason: 'offline' };
    if (this.owners.get(characterId) !== accountId) return { ok: false, reason: 'not_yours' };
    return {
      ok: true,
      save: {
        characterId,
        level: 10,
        state: {} as unknown as CharacterState,
        leaseNonce: this.leaseNonce,
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
    // Book-once by custodyRef, LIVE-BOOK semantics: the marker exists only
    // while the parcel does, exactly like the real post office (a collected
    // letter forgets its ref, so a replay would re-mail; that hazard is what
    // the durable mail intent exists to catch).
    if (!this.parcels.some((p) => p.custodyRef === custodyRef)) {
      this.parcels.push({
        recipientKey: recipient.key,
        letter,
        items: structuredClone(items),
        custodyRef,
      });
    }
    // The transient failure this hook models is the BLOB persist failing
    // AFTER the parcel entered the live book (the real bridge's in-memory
    // mailSystemParcel cannot throw transiently), which is exactly the shape
    // the resume rules must survive: parcel live, nothing durable.
    if (this.failNextPersist) {
      this.failNextPersist = false;
      throw new Error('persist failed');
    }
  }

  hasParcel(custodyRef: string): boolean {
    return this.parcels.some((p) => p.custodyRef === custodyRef);
  }

  /** The buyer collects the attachment and deletes the emptied letter: the
   *  in-book marker is destroyed, exactly like production. */
  collect(custodyRef: string): void {
    const i = this.parcels.findIndex((p) => p.custodyRef === custodyRef);
    if (i >= 0) this.parcels.splice(i, 1);
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
  /** Every per-arm isolation report the sweep made (deps.onSweepError). */
  sweepErrors: [string, unknown][];
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
  const sweepErrors: [string, unknown][] = [];
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
    onSweepError: (arm, err) => {
      sweepErrors.push([arm, err]);
    },
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
    sweepErrors,
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

  it('refuses while a buy-now payment is in flight and never mails the copy home', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { format: 'buy_now', buyNowCents: 8000 });
    const buy = unwrap(
      await h.service.buyNow({
        account: BUYER_A,
        characterId: CHAR_A,
        listingId: listing.id,
        acceptTerms: true,
      }),
      'buyNow',
    );
    // Inside the lock window the lock itself refuses the cancel.
    expect(await h.service.cancelListing(SELLER, listing.id)).toEqual({
      ok: false,
      reason: 'buy_now_locked',
    });
    // The buyer signs, then the lock expires with the payment still settling.
    // This is the dupe shape the guard exists for: the old cancel mailed the
    // copy home here while the broadcast payment went on to deliver it too.
    expect(await h.db.submitSettlementSignature(buy.settlement.id, 'sig-cancel-race')).toBe('ok');
    h.setNow(BASE_MS + WOC_MARKET_BUY_NOW_LOCK_SECONDS * 1000 + 1);
    expect(await h.service.cancelListing(SELLER, listing.id)).toEqual({
      ok: false,
      reason: 'settlement_in_flight',
    });
    // Delivered-but-unclosed is still in flight: the listing row has not
    // resolved, so the cancel keeps refusing rather than re-opening custody.
    await h.db.transitionSettlement(buy.settlement.id, ['confirming'], 'confirmed');
    await h.db.transitionSettlement(buy.settlement.id, ['confirmed'], 'delivering');
    await h.db.transitionSettlement(buy.settlement.id, ['delivering'], 'delivered');
    expect(await h.service.cancelListing(SELLER, listing.id)).toEqual({
      ok: false,
      reason: 'settlement_in_flight',
    });
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('active');
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

  it('abandoning a pending bid frees the seat it was holding', async () => {
    // The dead end this closes: declining the wallet left the bid pending, and
    // every further bid on that listing was refused with a message telling the
    // player to abandon it, through a control that did not exist. Their only
    // escape was waiting out the five-minute TTL.
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
    expect(
      await h.service.abandonBid(BUYER_A, first.bid.id),
      'the bidder may withdraw their own unfunded bid',
    ).toEqual({ ok: true });
    expect((await getBid(h, first.bid.id)).status).toBe('cancelled');
    // Nothing was ever transferred for a pending bond, so there is no refund leg.
    expect((await getBid(h, first.bid.id)).bondState).toBe('void');
    // And the seat is genuinely free again: the SAME account can bid once more.
    const again = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 6000,
    });
    expect(again.ok, 'a fresh bid must now be accepted').toBe(true);
  });

  it('refuses to let one player abandon another player’s bid', async () => {
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
    expect(await h.service.abandonBid(BUYER_B, first.bid.id)).toEqual({
      ok: false,
      reason: 'not_yours',
    });
    expect((await getBid(h, first.bid.id)).status).toBe('pending_bond');
  });

  it('refuses to abandon a bid that is no longer pending', async () => {
    // The race the status arm exists for: a bond that lands while the player is
    // reaching for "Not now" must keep its bid, not lose it to the click.
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
    unwrap(
      await h.service.confirmBond(BUYER_A, first.bid.id, `sig-bond-${first.bid.id}`),
      'confirmBond',
    );
    expect((await getBid(h, first.bid.id)).status).toBe('active');
    expect(await h.service.abandonBid(BUYER_A, first.bid.id)).toEqual({
      ok: false,
      reason: 'not_pending',
    });
    expect((await getBid(h, first.bid.id)).status, 'the live bid survives').toBe('active');
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

  it('a buy-now landing just before the close wins it: bid outbid, bond refunded, one settlement', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { format: 'auction_buy_now', buyNowCents: 8000 });
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    // The buy-now lands one second before the hammer falls, so its settlement
    // is live (and not yet overdue) when the close arm reaches the listing.
    h.setNow(listing.endsAtMs - 1000);
    const buy = unwrap(
      await h.service.buyNow({
        account: BUYER_C,
        characterId: CHAR_C,
        listingId: listing.id,
        acceptTerms: true,
      }),
      'buyNow',
    );
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    // Exactly one winner. The standing bid never sits 'won' with no settlement
    // behind it, and its bond rides the refund pipeline inside the same pass.
    const bid = await getBid(h, standing.bidId);
    expect(bid.status).toBe('outbid');
    expect(bid.bondState).toBe('refunded');
    const settlement = await liveSettlement(h, listing.id);
    expect(settlement?.id).toBe(buy.settlement.id);
    expect((await getListing(h, listing.id)).status).toBe('settling');
  });

  it('the close race queues the loser bond as refund_due even when the refund cannot settle yet', async () => {
    const h = makeHarness();
    // A refund pipeline that cannot finish (chain RPC down) must still show
    // the close arm's own stamp: the queue entry, not the terminal state.
    const stalledRefunds = new WocMarketService({
      ...h.deps,
      economy: { ...h.economy, refundBond: async () => ({ done: false, reason: 'rpc_down' }) },
    });
    const listing = await listEpic(h, { format: 'auction_buy_now', buyNowCents: 8000 });
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs - 1000);
    unwrap(
      await stalledRefunds.buyNow({
        account: BUYER_C,
        characterId: CHAR_C,
        listingId: listing.id,
        acceptTerms: true,
      }),
      'buyNow',
    );
    h.setNow(listing.endsAtMs + 1);
    await stalledRefunds.sweepPass();
    const bid = await getBid(h, standing.bidId);
    expect(bid.status).toBe('outbid');
    expect(bid.bondState).toBe('refund_due');
  });
});

describe('a bond payment awaiting finality', () => {
  /** An economy whose confirm is UNDECIDED: paid, but the chain has not said so
   *  yet. Exactly what a real confirm returns for tens of seconds after a
   *  mainnet broadcast. */
  function undecided(h: Harness): WocMarketEconomy {
    return {
      ...h.economy,
      confirm: async () => ({ settled: false, pending: true, reason: 'awaiting_finality' }),
    };
  }

  it('does NOT refuse it: the money has already left the wallet', async () => {
    // The defect this pins cost a real settlement its money once, and the same
    // shape survived in the bid leg: an undecided verdict was reported as
    // confirm_failed, so a good payment was answered with "could not be
    // confirmed" while the tokens were gone.
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
    const svc = new WocMarketService({ ...h.deps, economy: undecided(h) });
    const out = await svc.confirmBond(BUYER_A, placed.bid.id, 'sig-bond-pending');
    expect(out, 'accepted, and honestly reported as not yet standing').toEqual({
      ok: true,
      standing: false,
      pending: true,
    });
    const bid = await getBid(h, placed.bid.id);
    expect(bid.status, 'the bid stays alive to be resolved').toBe('pending_bond');
    expect(bid.bondSignature, 'with the signature kept for the re-check').toBe('sig-bond-pending');
  });

  it('activates the bid once the sweep sees the chain decide', async () => {
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
    const svc = new WocMarketService({ ...h.deps, economy: undecided(h) });
    await svc.confirmBond(BUYER_A, placed.bid.id, 'sig-bond-pending');
    // The chain decides in the player's favour; the ordinary sweep finishes it.
    await h.service.sweepPass();
    const bid = await getBid(h, placed.bid.id);
    expect(bid.status).toBe('active');
    expect(bid.bondState).toBe('held');
    expect((await getListing(h, listing.id)).currentBidId).toBe(placed.bid.id);
  });

  it('lapses the bid when the chain decides AGAINST it', async () => {
    // Only a DECIDED verdict may end it. A refusal is a real answer and the bid
    // must not linger holding a seat it never paid for.
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
    const svc = new WocMarketService({ ...h.deps, economy: undecided(h) });
    await svc.confirmBond(BUYER_A, placed.bid.id, 'sig-bond-pending');
    const refusing = new WocMarketService({
      ...h.deps,
      economy: {
        ...h.economy,
        confirm: async () => ({ settled: false, pending: false, reason: 'refused' }),
      },
    });
    await refusing.sweepPass();
    const bid = await getBid(h, placed.bid.id);
    expect(bid.status).toBe('lapsed');
    expect(bid.bondState).toBe('void');
  });

  it('never lapses a PAID bond on the TTL sweep while it awaits finality', async () => {
    // The lapse arm reaps unconfirmed bonds past their TTL. A bond with a
    // signature is funded, so reaping it would void money the bidder has
    // already spent while the chain was still thinking.
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
    const svc = new WocMarketService({ ...h.deps, economy: undecided(h) });
    await svc.confirmBond(BUYER_A, placed.bid.id, 'sig-bond-pending');
    // Well past the pending-bond TTL.
    h.setNow(BASE_MS + WOC_MARKET_BOND_PENDING_TTL_SECONDS * 1000 + 60_000);
    await svc.sweepPass();
    expect((await getBid(h, placed.bid.id)).status, 'still awaiting the chain').toBe(
      'pending_bond',
    );
  });

  it('refuses a signature already spent on another bid', async () => {
    // One broadcast pays for one thing. Replaying it must not fund a second
    // bond, which is what the unique index on the column enforces.
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
    const second = unwrap(
      await placeBid(h, {
        account: BUYER_B,
        characterId: CHAR_B,
        listingId: listing.id,
        amountCents: 6000,
      }),
      'placeBid',
    );
    const svc = new WocMarketService({ ...h.deps, economy: undecided(h) });
    await svc.confirmBond(BUYER_A, first.bid.id, 'sig-shared');
    expect(await svc.confirmBond(BUYER_B, second.bid.id, 'sig-shared')).toEqual({
      ok: false,
      reason: 'signature_reused',
    });
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
    // The failing row is ISOLATED and reported, never thrown out of the pass,
    // and the arm counts rows ADVANCED, so this failing one scores zero.
    const stats = await h.service.sweepPass();
    expect(stats?.reconciled).toBe(0);
    expect(h.sweepErrors.map(([arm]) => arm)).toContain('reconciled');
    expect((await getSettlement(h, settlement.id)).state).toBe('delivering');
    // The parcel entered the LIVE book before the blob failure; nothing is
    // durable or booked yet, and the claim stays visible for the resume.
    expect(h.custody.parcels).toHaveLength(1);
    expect(h.db.custodyClaims.get(settlementCustodyRef(settlement.id))?.bookedAtMs).toBeNull();

    // The next pass resumes the stuck row and books the parcel exactly once
    // (a THROWN attempt takes no park backoff: the very next pass retries).
    const retry = await h.service.sweepPass();
    expect(retry?.reconciled).toBe(1);
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
  it('keeps a failed booking VISIBLE and books exactly once on the retry', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    expect(await h.service.adminSuspendListing(listing.id)).toEqual({ ok: true });
    const ref = listingReturnCustodyRef(listing.id);
    // The mail persist fails after the claim landed. The claim STAYS, unbooked
    // (releasing it hid a repeatedly failing write from the operator); the
    // resume path re-reads booked_at, so a kept claim can never masquerade as
    // a booked one.
    h.custody.failNextPersist = true;
    await h.service.sweepPass();
    expect(h.custody.persistCalls).toEqual([ref]);
    expect(h.custody.parcels, 'live but not durable').toHaveLength(1);
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBeNull();
    expect(h.db.custodyClaims.get(ref)?.mailIntentAtMs, 'the mail rail owns it').not.toBeNull();
    expect((await getListing(h, listing.id)).itemDisposed).toBe(false);
    expect(
      h.sweepErrors.map(([arm]) => arm),
      'the failure is reported',
    ).toContain('returned');

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

    // While the buy-now lock is unexpired a payment may be mid-flight, so the
    // suspend takes the safe path: refuse and change nothing.
    const blocked = await h.service.adminSuspendListing(listing.id);
    expect(blocked).toEqual({ ok: false, reason: 'settlement_in_flight' });
    expect((await getListing(h, listing.id)).status).toBe('active');
    expect((await getBid(h, standing.bidId)).status).toBe('active');
    expect((await getSettlement(h, buy.settlement.id)).state).toBe('offered');

    // Past the lock window with a SIGNED payment still confirming, the other
    // guard arm takes over: the broadcast may still land, so the suspend
    // keeps refusing and still changes nothing.
    expect(await h.db.submitSettlementSignature(buy.settlement.id, 'sig-suspend-race')).toBe('ok');
    h.setNow(BASE_MS + WOC_MARKET_BUY_NOW_LOCK_SECONDS * 1000 + 1);
    const confirming = await h.service.adminSuspendListing(listing.id);
    expect(confirming).toEqual({ ok: false, reason: 'settlement_in_flight' });
    expect((await getSettlement(h, buy.settlement.id)).state).toBe('confirming');
    expect((await getBid(h, standing.bidId)).status).toBe('active');

    // The chain refuses the payment: a 'failed' settlement has nothing in
    // flight any more, which the suspend may safely expire.
    expect(
      await h.db.transitionSettlement(buy.settlement.id, ['confirming'], 'failed', 'refused'),
    ).toBe(true);
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
  // BUYER_A opens the deal by naming a price to the seller; SELLER accepts by
  // staging a copy. The buyer holds no items in a $WOC deal.
  const offerArgs = (over: Record<string, unknown> = {}) => ({
    account: BUYER_A,
    characterId: CHAR_A,
    sellerCharacterName: 'Selara',
    usdCents: 5000,
    ...over,
  });
  /** The seller's half: names the copy. */
  const sellerAccepts = (h: Harness, id: number) =>
    h.service.acceptDirectedOffer(SELLER, id, { index: 0, itemId: EPIC_ITEM }, SELLER_CHAR);
  /** The buyer's half: money only, no item. */
  const buyerAccepts = (h: Harness, id: number) =>
    h.service.acceptDirectedOffer(BUYER_A, id, null, CHAR_A);
  /** Both, buyer first, so the SELLER's is the one that escrows. */
  const acceptWith = async (h: Harness, id: number) => {
    const first = await buyerAccepts(h, id);
    if (!first.ok) return first;
    return sellerAccepts(h, id);
  };

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

  it('refuses when the SELLER has no wallet to be paid into', async () => {
    // The refusal the buyer's window turns into "that player must connect a
    // wallet", so it must be its own reason and not a generic wallet_required
    // (which means YOUR wallet and is actionable by a different person).
    const h = stocked();
    h.wallets.delete(SELLER);
    expect(await h.service.createDirectedOffer(offerArgs())).toEqual({
      ok: false,
      reason: 'recipient_wallet_required',
    });
  });

  it('refuses when the BUYER has no wallet to pay from', async () => {
    const h = stocked();
    h.wallets.delete(BUYER_A);
    expect(await h.service.createDirectedOffer(offerArgs())).toEqual({
      ok: false,
      reason: 'wallet_required',
    });
  });

  it('refuses an offer addressed to yourself', async () => {
    const h = stocked();
    const res = await h.service.createDirectedOffer(offerArgs({ sellerCharacterName: 'Aldan' }));
    expect(res).toEqual({ ok: false, reason: 'self_offer' });
  });

  it('accepting escrows the item and produces a directed listing at the agreed price', async () => {
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    const before = bagsOf(h, SELLER_CHAR).length;
    const accepted = await acceptWith(h, offer.offer.id);
    if (!accepted.ok) throw new Error(`accept refused: ${(accepted as { reason: string }).reason}`);
    expect(bagsOf(h, SELLER_CHAR), 'the copy left the bags').toHaveLength(before - 1);
    expect(accepted.listing?.directedBuyerAccount).toBe(BUYER_A);
    // One agreed price, carried onto both price fields.
    expect(accepted.listing?.buyNowCents).toBe(5000);
    expect(accepted.listing?.startCents).toBe(5000);
  });

  /** Put the buyer online with room to spare. Without this every hand-off
   *  refuses as 'offline' and the mail tests below pass for the wrong reason. */
  function buyerOnline(h: Harness): void {
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
  }

  /** Drive an accepted directed offer all the way to a delivered settlement. */
  async function settleDirected(h: Harness): Promise<{ listingId: number }> {
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    const accepted = await acceptWith(h, offer.offer.id);
    if (!accepted.ok || !accepted.listing) throw new Error('accept refused');
    const listingId = accepted.listing.id;
    const bought = unwrap(
      await h.service.buyNow({
        account: BUYER_A,
        characterId: CHAR_A,
        listingId,
        acceptTerms: true,
      }),
      'buyNow',
    );
    unwrap(await h.service.settlementQuote(BUYER_A, bought.settlement.id), 'settlementQuote');
    unwrap(
      await h.service.confirmSettlement(BUYER_A, bought.settlement.id, 'sig-directed-1'),
      'confirmSettlement',
    );
    return { listingId };
  }

  it('hands a p2p purchase STRAIGHT to the buyer, with no parcel at all', async () => {
    // The whole point of the trade window: the two players are standing in front
    // of each other, so the goods go in the bag, not in the post.
    const h = stocked();
    buyerOnline(h);
    const before = bagsOf(h, CHAR_A).length;
    await settleDirected(h);
    expect(bagsOf(h, CHAR_A), 'the item lands in the buyer bags').toHaveLength(before + 1);
    expect(
      h.custody.parcels.filter((p) => p.letter === 'delivery'),
      'and no delivery parcel is booked',
    ).toHaveLength(0);
  });

  it('still MAILS an Exchange purchase, which is anonymous and asynchronous', async () => {
    // The other half of the rule, and the reason this is a branch rather than a
    // replacement: a public auction winner may be offline, in another zone, or
    // simply not expecting it.
    const h = makeHarness();
    // Online and roomy ON PURPOSE: the branch must key on the sale being
    // ANONYMOUS, not on the buyer happening to be unreachable. Without this the
    // case passes whatever deliverOne does, which is how it was first written.
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    const before = bagsOf(h, CHAR_A).length;
    unwrap(
      await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-exchange-1'),
      'confirmSettlement',
    );
    expect(
      h.custody.parcels.filter((p) => p.letter === 'delivery'),
      'the exchange route is unchanged',
    ).toHaveLength(1);
    expect(bagsOf(h, CHAR_A), 'nothing goes straight into the bags').toHaveLength(before);
  });

  it('falls back to MAIL when the buyer has no room', async () => {
    // Full bags must never drop the item, and must never wedge the settlement.
    const h = stocked();
    buyerOnline(h);
    h.custody.fullBags.add(CHAR_A);
    const before = bagsOf(h, CHAR_A).length;
    await settleDirected(h);
    expect(bagsOf(h, CHAR_A), 'nothing forced into full bags').toHaveLength(before);
    expect(h.custody.parcels.filter((p) => p.letter === 'delivery')).toHaveLength(1);
  });

  it('falls back to MAIL when the buyer has logged out', async () => {
    const h = stocked();
    buyerOnline(h);
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    const accepted = await acceptWith(h, offer.offer.id);
    if (!accepted.ok || !accepted.listing) throw new Error('accept refused');
    const listingId = accepted.listing.id;
    const bought = unwrap(
      await h.service.buyNow({
        account: BUYER_A,
        characterId: CHAR_A,
        listingId,
        acceptTerms: true,
      }),
      'buyNow',
    );
    unwrap(await h.service.settlementQuote(BUYER_A, bought.settlement.id), 'settlementQuote');
    // Gone between paying and delivery: no live session to hand anything to.
    h.custody.bags.delete(CHAR_A);
    unwrap(
      await h.service.confirmSettlement(BUYER_A, bought.settlement.id, 'sig-directed-2'),
      'confirmSettlement',
    );
    expect(h.custody.parcels.filter((p) => p.letter === 'delivery')).toHaveLength(1);
  });

  it('PARKS on a lease-fence rejection: no mail, ever, without an operator', async () => {
    // The fence proves THIS write lost, not that an earlier autosave under
    // the then-valid nonce did: the granted bags may already be durable, so
    // mailing (the old same-breath fallback, and the first fix round's
    // next-pass fallback) risks a second copy. The claim keeps its grant
    // intent and stays visible; only an operator can attribute the item.
    const h = stocked();
    buyerOnline(h);
    h.db.failNextDeliveredSave = 'lease_lost';
    const { listingId } = await settleDirected(h);
    const ref = settlementCustodyRef((await liveSettlement(h, listingId)).id);
    expect(
      h.custody.parcels.filter((p) => p.letter === 'delivery'),
      'no mail on the fence pass',
    ).toHaveLength(0);
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
    // Past the park backoff, and again: still parked, still no mail.
    h.setNow(h.now() + 61_000);
    await h.service.sweepPass();
    h.setNow(h.now() + 61_000);
    await h.service.sweepPass();
    expect(h.custody.parcels.filter((p) => p.letter === 'delivery')).toHaveLength(0);
    expect(h.custody.grantCalls, 'the zombie grant is never repeated').toBe(1);
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
    expect(h.db.custodyClaims.get(ref)?.grantCharacterId, 'the intent survives').toBe(CHAR_A);
    const readout = await h.db.stuckCustodyReadout(REALM, h.now() + 1, 10, 1000);
    expect(readout.unbookedClaims.count, 'visible to the operator').toBe(1);
  });

  it('retries a THROWING save on the same custody ref, and never mails (B2b)', async () => {
    // Pool exhaustion at the worst moment: the grant already sits in the live
    // bags and an autosave may persist it. The old code fell through to mail
    // in the same pass, which was the second copy.
    const h = stocked();
    buyerOnline(h);
    h.db.failNextDeliveredSave = 'throw';
    const before = bagsOf(h, CHAR_A).length;
    const { listingId } = await settleDirected(h);
    const ref = settlementCustodyRef((await liveSettlement(h, listingId)).id);
    expect(
      h.custody.parcels.filter((p) => p.letter === 'delivery'),
      'a throwing save never produces mail',
    ).toHaveLength(0);
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs, 'unbooked and visible').toBeNull();
    expect(h.db.custodyClaims.get(ref)?.grantCharacterId).toBe(CHAR_A);
    expect(
      h.sweepErrors.map(([arm]) => arm),
      'the throw is reported',
    ).toContain('deliver_grant');
    // Past the park backoff, the SAME live session retries the SAME ref: one
    // snapshot save, no second grant, no mail, and the tail completes.
    h.setNow(h.now() + 61_000);
    await h.service.sweepPass();
    expect(bagsOf(h, CHAR_A), 'one copy').toHaveLength(before + 1);
    expect(h.custody.grantCalls, 'granted once, snapshot-retried after').toBe(1);
    expect(h.custody.parcels.filter((p) => p.letter === 'delivery')).toHaveLength(0);
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).not.toBeNull();
    expect((await h.db.listingById(REALM, listingId))?.status).toBe('closed');
    // Both saves crossed the delivery edge for the same session: the grant
    // save and the snapshot retry, never a third.
    expect(h.db.deliveredSaves.map((s) => s.characterId)).toEqual([CHAR_A, CHAR_A]);
    expect(h.db.deliveredSaves.map((s) => s.leaseNonce)).toEqual(['nonce', 'nonce']);
  });

  it('resolves an AMBIGUOUS commit (reply lost after booking) without a second copy', async () => {
    // The save-and-book transaction COMMITTED but the reply was lost: the
    // one case a separate booking statement could never untangle, and the
    // reason booking rides the save transaction.
    const h = stocked();
    buyerOnline(h);
    h.db.failNextDeliveredSave = 'throw_after_commit';
    const before = bagsOf(h, CHAR_A).length;
    const { listingId } = await settleDirected(h);
    expect((await liveSettlement(h, listingId)).state, 'no blind advance').toBe('delivering');
    expect(h.custody.parcels.filter((p) => p.letter === 'delivery')).toHaveLength(0);
    // Past the park backoff, the retry reads booked_at, sees the commit, and
    // only finalizes.
    h.setNow(h.now() + 61_000);
    await h.service.sweepPass();
    expect(bagsOf(h, CHAR_A)).toHaveLength(before + 1);
    expect(h.custody.grantCalls).toBe(1);
    expect(h.custody.parcels.filter((p) => p.letter === 'delivery')).toHaveLength(0);
    expect((await h.db.listingById(REALM, listingId))?.status).toBe('closed');
  });

  it('PARKS an unbooked grant claim after a restart: no mail, no re-grant, visible to ops', async () => {
    // A restart loses the in-process session ledger, so the "the live bags
    // hold my grant" proof is gone: the ONLY safe automatic action is none.
    const h = stocked();
    buyerOnline(h);
    h.db.failNextDeliveredSave = 'throw';
    const { listingId } = await settleDirected(h);
    const restarted = new WocMarketService(h.deps);
    await restarted.sweepPass();
    h.setNow(h.now() + 61_000);
    await restarted.sweepPass();
    expect(
      h.custody.parcels.filter((p) => p.letter === 'delivery'),
      'never mails',
    ).toHaveLength(0);
    expect(h.custody.grantCalls, 'never re-grants').toBe(1);
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
    const readout = await h.db.stuckCustodyReadout(REALM, h.now() + 1, 10, 1000);
    expect(readout.unbookedClaims.count).toBe(1);
    expect(readout.unbookedClaims.sample[0]?.grantCharacterId).toBe(CHAR_A);
    expect(readout.stuckDelivering.count).toBe(1);
  });

  it('PARKS an unbooked grant claim after a relog: the retry is no longer provable', async () => {
    const h = stocked();
    buyerOnline(h);
    h.db.failNextDeliveredSave = 'throw';
    const { listingId } = await settleDirected(h);
    // Same process, new session: the lease nonce rotated, so the pending
    // entry no longer matches and the claim parks for the operator.
    h.custody.leaseNonce = 'nonce-after-relog';
    h.setNow(h.now() + 61_000);
    await h.service.sweepPass();
    h.setNow(h.now() + 61_000);
    await h.service.sweepPass();
    expect(h.custody.parcels.filter((p) => p.letter === 'delivery')).toHaveLength(0);
    expect(h.custody.grantCalls).toBe(1);
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
  });

  it('PARKS an unbooked grant claim when the buyer logs out before the retry', async () => {
    // The realistic loss of the resume proof: the session simply ends.
    // snapshotCopy answers offline, and the claim parks rather than mails.
    const h = stocked();
    buyerOnline(h);
    h.db.failNextDeliveredSave = 'throw';
    const { listingId } = await settleDirected(h);
    h.custody.bags.delete(CHAR_A);
    h.setNow(h.now() + 61_000);
    await h.service.sweepPass();
    h.setNow(h.now() + 61_000);
    await h.service.sweepPass();
    expect(h.custody.parcels.filter((p) => p.letter === 'delivery')).toHaveLength(0);
    expect(h.custody.grantCalls).toBe(1);
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
  });

  it('PARKS a bare claim with no rail intent: unattributable, never mailed (B2c)', async () => {
    // The claim-then-die residue (and every legacy row from before the intent
    // columns): the OLD code adopted it as booked and advanced with the item
    // destroyed; the first fix mailed it, which a collected-and-deleted letter
    // turns into a second copy. Neither is provable, so it parks.
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    const ref = settlementCustodyRef(settlement.id);
    expect(await h.db.claimCustodyRef(REALM, ref)).toBe(true);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    unwrap(
      await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-resume-1'),
      'confirmSettlement',
    );
    expect(h.custody.parcels, 'nothing mailed').toHaveLength(0);
    expect((await liveSettlement(h, listing.id)).state, 'held visibly').toBe('delivering');
    const readout = await h.db.stuckCustodyReadout(REALM, h.now() + 1, 10, 1000);
    expect(readout.unbookedClaims.count).toBe(1);
    expect(readout.unbookedClaims.sample[0]?.mailIntent).toBe(false);
  });

  it('resumes a mail claim whose pass died before the BOOKING: one parcel, then done (B2c)', async () => {
    // The provable resume: the intent is stamped AND the parcel still sits in
    // the live book, so booking it completes the delivery without a re-mail.
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    const ref = settlementCustodyRef(settlement.id);
    // A prior pass claimed, stamped the mail intent, wrote the parcel, and
    // died before markCustodyRefBooked (a restart: pendingMail is empty).
    expect(await h.db.claimCustodyRef(REALM, ref)).toBe(true);
    expect(await h.db.markCustodyMailIntent(ref)).toBe(true);
    await h.custody.persistMailParcel(
      { key: String(CHAR_A), name: 'Aldan' },
      'delivery',
      [{ itemId: EPIC_ITEM, count: 1 }],
      ref,
    );
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    unwrap(
      await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-resume-2'),
      'confirmSettlement',
    );
    expect(
      h.custody.parcels.filter((p) => p.custodyRef === ref),
      'exactly one parcel',
    ).toHaveLength(1);
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).not.toBeNull();
    expect((await h.db.listingById(REALM, listing.id))?.status).toBe('closed');
  });

  it('PARKS a mail claim whose letter was collected and deleted: never a second copy', async () => {
    // The regression the durable intent exists to stop: parcel written,
    // booking lost, buyer takes the item and deletes the emptied letter. The
    // in-book marker is gone, so a blind resume would mail copy two.
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    const ref = settlementCustodyRef(settlement.id);
    expect(await h.db.claimCustodyRef(REALM, ref)).toBe(true);
    expect(await h.db.markCustodyMailIntent(ref)).toBe(true);
    await h.custody.persistMailParcel(
      { key: String(CHAR_A), name: 'Aldan' },
      'delivery',
      [{ itemId: EPIC_ITEM, count: 1 }],
      ref,
    );
    h.custody.collect(ref);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    unwrap(
      await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-resume-3'),
      'confirmSettlement',
    );
    expect(h.custody.parcels, 'no second copy, ever').toHaveLength(0);
    expect((await liveSettlement(h, listing.id)).state, 'parked visibly').toBe('delivering');
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBeNull();
  });

  it('keeps a failed mail booking VISIBLE and resumes it: one parcel, then done', async () => {
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    const ref = settlementCustodyRef(settlement.id);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    h.custody.failNextPersist = true;
    unwrap(
      await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-mail-keep-1'),
      'confirmSettlement',
    );
    // The write threw: the claim STAYS, unbooked and visible (releasing it
    // made a repeatedly failing mail write invisible), and nothing advanced.
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBeNull();
    expect((await liveSettlement(h, listing.id)).state).toBe('delivering');
    expect(h.sweepErrors.map(([arm]) => arm)).toContain('delivered');
    // The next pass resumes the SAME claim: one parcel, booked, finalized.
    await h.service.sweepPass();
    expect(h.custody.parcels.filter((p) => p.custodyRef === ref)).toHaveLength(1);
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).not.toBeNull();
    expect((await h.db.listingById(REALM, listing.id))?.status).toBe('closed');
  });

  it('PARKS a same-process retry once the written letter was collected', async () => {
    // The in-process twin of the collected-letter hazard: the parcel was
    // written, the BOOKING threw, and the buyer collected and deleted the
    // letter before the retry. The process's own memory of the attempt must
    // not authorize a re-mail (only the parcel still being in the book may),
    // or every booking brownout longer than one collection becomes copy two.
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    const ref = settlementCustodyRef(settlement.id);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    h.db.failNextMarkBooked = true;
    unwrap(
      await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-collect-1'),
      'confirmSettlement',
    );
    expect(
      h.custody.parcels.filter((p) => p.custodyRef === ref),
      'written once',
    ).toHaveLength(1);
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBeNull();
    // The buyer takes the item and deletes the emptied letter.
    h.custody.collect(ref);
    await h.service.sweepPass();
    await h.service.sweepPass();
    expect(
      h.custody.parcels.filter((p) => p.custodyRef === ref),
      'never re-mailed',
    ).toHaveLength(0);
    expect((await liveSettlement(h, listing.id)).state, 'parked visibly').toBe('delivering');
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBeNull();
  });

  it('PARKS after a blob-half throw once the letter was collected: written flips BEFORE the call', async () => {
    // The interleaving the flip-before-persist rule exists for: the persist
    // THREW after the parcel entered the live book (the blob half failing),
    // so the attempt never returned, and the buyer collected and deleted the
    // letter before the retry. Only an entry marked written AT ATTEMPT TIME
    // parks here; an entry flipped after the call would still read unwritten
    // and authorize the re-mail, which is copy two. The booking twins above
    // cannot see this: their persist SUCCEEDS, so the flip order is
    // indistinguishable there.
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    const ref = settlementCustodyRef(settlement.id);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    h.custody.failNextPersist = true;
    unwrap(
      await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-blobhalf-1'),
      'confirmSettlement',
    );
    expect(
      h.custody.parcels.filter((p) => p.custodyRef === ref),
      'the parcel reached the live book before the throw',
    ).toHaveLength(1);
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBeNull();
    h.custody.collect(ref);
    await h.service.sweepPass();
    await h.service.sweepPass();
    expect(
      h.custody.persistCalls.filter((r) => r === ref),
      'exactly one attempt ever reached the post office',
    ).toHaveLength(1);
    expect(h.custody.parcels.filter((p) => p.custodyRef === ref)).toHaveLength(0);
    expect((await liveSettlement(h, listing.id)).state, 'parked visibly').toBe('delivering');
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBeNull();
  });

  it('resumes a same-process retry while the written letter stays uncollected', async () => {
    // The positive twin: booking threw, nobody collected, so the parcel in
    // the book authorizes the resume and the booking completes, exactly once.
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    const ref = settlementCustodyRef(settlement.id);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    h.db.failNextMarkBooked = true;
    unwrap(
      await h.service.confirmSettlement(BUYER_A, settlement.id, 'sig-collect-2'),
      'confirmSettlement',
    );
    await h.service.sweepPass();
    expect(h.custody.parcels.filter((p) => p.custodyRef === ref)).toHaveLength(1);
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).not.toBeNull();
    expect((await h.db.listingById(REALM, listing.id))?.status).toBe('closed');
  });

  it('books a seller notice over a stale bare claim: item-free letters skip the ledger', async () => {
    // A sold notice carries no items, so nothing it does can duplicate or
    // destroy; minting durable claims for it only polluted the operator
    // queue (a transiently failed notice parked forever, since nothing ever
    // re-notifies). The notice mails regardless of leftover claim rows.
    const h = stocked();
    buyerOnline(h);
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    const accepted = await acceptWith(h, offer.offer.id);
    if (!accepted.ok || !accepted.listing) throw new Error('accept refused');
    const listingId = accepted.listing.id;
    const noticeRef = listingSoldNoticeCustodyRef(listingId);
    // A stale bare claim under the notice ref (hand intervention residue).
    expect(await h.db.claimCustodyRef(REALM, noticeRef)).toBe(true);
    const bought = unwrap(
      await h.service.buyNow({
        account: BUYER_A,
        characterId: CHAR_A,
        listingId,
        acceptTerms: true,
      }),
      'buyNow',
    );
    unwrap(await h.service.settlementQuote(BUYER_A, bought.settlement.id), 'settlementQuote');
    unwrap(
      await h.service.confirmSettlement(BUYER_A, bought.settlement.id, 'sig-notice-1'),
      'confirmSettlement',
    );
    expect((await h.db.listingById(REALM, listingId))?.status).toBe('closed');
    expect(
      h.custody.parcels.map((p) => p.custodyRef),
      'the notice still lands',
    ).toContain(noticeRef);
    // And no delivery-side claim state changed for the notice ref.
    expect(h.db.custodyClaims.get(noticeRef)?.bookedAtMs).toBeNull();
  });

  it('re-drives delivered-but-unclosed residue FORWARD to the finished sale', async () => {
    // The residue shape an older binary's crash leaves: custody booked,
    // settlement 'delivered', close tail never ran. The reclaim arm used to
    // skip it silently forever; it must now converge it to the finished sale.
    const h = stocked();
    buyerOnline(h);
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    const accepted = await acceptWith(h, offer.offer.id);
    if (!accepted.ok || !accepted.listing) throw new Error('accept refused');
    const listingId = accepted.listing.id;
    const bought = unwrap(
      await h.service.buyNow({
        account: BUYER_A,
        characterId: CHAR_A,
        listingId,
        acceptTerms: true,
      }),
      'buyNow',
    );
    unwrap(await h.service.settlementQuote(BUYER_A, bought.settlement.id), 'settlementQuote');
    // Custody books, then the tail refuses once (standing in for the old
    // binary crashing between its delivered CAS and its close statements).
    h.db.failNextFinalize = 'contended';
    unwrap(
      await h.service.confirmSettlement(BUYER_A, bought.settlement.id, 'sig-redrive-1'),
      'confirmSettlement',
    );
    await h.db.transitionSettlement(bought.settlement.id, ['delivering'], 'delivered');
    // A buy-now residue keeps the listing 'active': the re-drive must find it
    // by the delivered settlement itself, not by a stranded listing status.
    expect((await h.db.listingById(REALM, listingId))?.status).toBe('active');
    const stats = await h.service.sweepPass();
    expect(stats?.redriven).toBe(1);
    const listing = await h.db.listingById(REALM, listingId);
    expect(listing?.status).toBe('closed');
    expect(listing?.resolution).toBe('sold');
    expect(listing?.itemDisposed).toBe(true);
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10)).toHaveLength(1);
    // The seller still hears about the completed sale on the re-driven path.
    expect(h.custody.parcels.map((p) => p.custodyRef)).toContain(
      listingSoldNoticeCustodyRef(listingId),
    );
    // A second pass changes nothing: converged, and never counted again. The
    // clock has to cross the beat interval first, or the arm returns 0 from
    // its minute gate without reading anything and this pins nothing.
    h.setNow(h.now() + 61_000);
    const again = await h.service.sweepPass();
    expect(again?.redriven).toBe(0);
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10)).toHaveLength(1);
  });

  it('converges an old sold-but-undisposed residue when its sale row stands', async () => {
    // The other close-tail residue: closed 'sold', sale row present, dispose
    // flag never landed. The standing sale proves delivery completed, so the
    // flag is bookkeeping the redriven beat settles; without a sale row the
    // row would stay parked for the operator instead.
    const h = stocked();
    buyerOnline(h);
    h.db.failNextFinalize = 'contended';
    const { listingId } = await settleDirected(h);
    // Craft the residue the old binary left: sale + close landed, dispose did
    // not. The sale insert is the primitive the old tail used.
    await h.db.insertSale({
      realm: REALM,
      listingId,
      itemId: EPIC_ITEM,
      item: { itemId: EPIC_ITEM, count: 1 },
      priceCents: 1000,
      amountBase: null,
      sellerAccount: SELLER,
      buyerAccount: BUYER_A,
      sellerName: 'Selara',
      buyerName: 'Aldan',
    });
    await h.db.transitionSettlement(
      (await liveSettlement(h, listingId)).id,
      ['delivering'],
      'delivered',
    );
    const stats = await h.service.sweepPass();
    expect(stats?.redriven).toBeGreaterThanOrEqual(1);
    const listing = await h.db.listingById(REALM, listingId);
    expect(listing?.status).toBe('closed');
    expect(listing?.itemDisposed).toBe(true);
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10), 'still exactly one sale').toHaveLength(1);
  });

  it('refuses to deliver over an already-disposed listing: parked, not duplicated', async () => {
    // The return-then-deliver belt: once the escrowed copy left custody, a
    // late delivery attempt must do NOTHING (an operator resolves it), and
    // the settlement stays visible in 'delivering'.
    const h = stocked();
    buyerOnline(h);
    h.db.failNextFinalize = 'contended';
    const { listingId } = await settleDirected(h);
    const settlement = await liveSettlement(h, listingId);
    expect(settlement.state).toBe('delivering');
    await h.db.markItemDisposed(listingId);
    const grantsBefore = h.custody.grantCalls;
    const parcelsBefore = h.custody.parcels.length;
    await h.service.sweepPass();
    h.setNow(h.now() + 61_000);
    await h.service.sweepPass();
    expect((await liveSettlement(h, listingId)).state, 'parked').toBe('delivering');
    expect(h.custody.grantCalls).toBe(grantsBefore);
    expect(h.custody.parcels.length).toBe(parcelsBefore);
    const readout = await h.db.stuckCustodyReadout(REALM, h.now() + 1, 10, 1000);
    expect(readout.stuckDelivering.count).toBe(1);
  });

  it('refuses a disposed listing on the MAIL route too: zero parcels, decisive', async () => {
    // The Exchange shape of the same belt, with NO custody claim yet: without
    // the itemDisposed guard the mail route would write a parcel here, so a
    // zero-parcel assertion is what actually pins the guard.
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    expect(await h.db.transitionSettlement(settlement.id, ['offered'], 'confirming')).toBe(true);
    expect(await h.db.transitionSettlement(settlement.id, ['confirming'], 'confirmed')).toBe(true);
    await h.db.markItemDisposed(listing.id);
    await h.service.sweepPass();
    expect(h.custody.parcels, 'no parcel over a disposed listing').toHaveLength(0);
    expect((await getSettlement(h, settlement.id)).state).toBe('delivering');
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10)).toHaveLength(0);
  });

  it('PARKS the mail route over a grant-intent claim: the hand-off may have landed', async () => {
    // A public listing whose ref carries a grant intent (hand intervention or
    // cross-shape residue): mailing over it risks the second copy, so the
    // mail rail refuses and the row stays visible.
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlement = await liveSettlement(h, listing.id);
    const ref = settlementCustodyRef(settlement.id);
    expect(await h.db.claimCustodyRef(REALM, ref)).toBe(true);
    expect(await h.db.markCustodyGrantIntent(ref, CHAR_A)).toBe(true);
    unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
    expect(await h.db.transitionSettlement(settlement.id, ['offered'], 'confirming')).toBe(true);
    expect(await h.db.transitionSettlement(settlement.id, ['confirming'], 'confirmed')).toBe(true);
    await h.service.sweepPass();
    expect(h.custody.parcels, 'never mails over a grant intent').toHaveLength(0);
    expect((await getSettlement(h, settlement.id)).state).toBe('delivering');
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBeNull();
  });

  it('PARKS a refused return with backoff instead of busy-looping the backlog', async () => {
    // The return-arm twin of the delivery park machinery: a return whose
    // claim carries a grant intent can never proceed on its own, so it must
    // back off (no per-pass persist attempts) and score zero, not saturate.
    const h = makeHarness();
    const listing = await listEpic(h);
    const ref = listingReturnCustodyRef(listing.id);
    expect(await h.db.claimCustodyRef(REALM, ref)).toBe(true);
    expect(await h.db.markCustodyGrantIntent(ref, CHAR_A)).toBe(true);
    expect(await h.service.adminSuspendListing(listing.id)).toEqual({ ok: true });
    const stats = await h.service.sweepPass();
    expect(stats?.returned, 'parked rows do not count as work').toBe(0);
    expect(h.custody.persistCalls, 'nothing was mailed').toHaveLength(0);
    expect((await getListing(h, listing.id)).itemDisposed).toBe(false);
    // Within the backoff window the parked row costs NO further attempts.
    await h.service.sweepPass();
    expect(h.custody.persistCalls).toHaveLength(0);
    // Past the backoff it retries (and parks again: the intent still stands).
    h.setNow(h.now() + 61_000);
    const later = await h.service.sweepPass();
    expect(later?.returned).toBe(0);
    expect((await getListing(h, listing.id)).itemDisposed).toBe(false);
  });

  it('one CONTENDED finalize stops ALL delivery work for the rest of the pass', async () => {
    // Without the pass-wide stop, rows a contended break left in 'delivering'
    // were re-attempted by the reconcile arm seconds later in the SAME pass,
    // spending the lock_timeout budget the break existed to conserve.
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    h.custody.bags.set(CHAR_B, []);
    h.custody.owners.set(CHAR_B, BUYER_B);
    h.custody.owners.set(CHAR_TWIN, WALLET_TWIN);
    h.custody.bags.set(CHAR_TWIN, [{ itemId: EPIC_ITEM, count: 1 }]);
    const first = await listEpic(h);
    const second = unwrap(
      await h.service.createListing({
        account: WALLET_TWIN,
        characterId: CHAR_TWIN,
        itemRef: { index: 0, itemId: EPIC_ITEM },
        params: listingParams({ startCents: 6000 }),
      }),
      'createListing',
    ).listing;
    await confirmedBid(h, BUYER_A, CHAR_A, first.id, 5000);
    await confirmedBid(h, BUYER_B, CHAR_B, second.id, 7000);
    h.setNow(Math.max(first.endsAtMs, second.endsAtMs) + 1);
    await h.service.sweepPass();
    for (const [buyer, listingId] of [
      [BUYER_A, first.id],
      [BUYER_B, second.id],
    ] as const) {
      const s = await liveSettlement(h, listingId);
      unwrap(await h.service.settlementQuote(buyer, s.id), 'settlementQuote');
      expect(await h.db.transitionSettlement(s.id, ['offered'], 'confirming')).toBe(true);
      expect(await h.db.transitionSettlement(s.id, ['confirming'], 'confirmed')).toBe(true);
    }
    h.db.failNextFinalize = 'contended';
    const blocked = await h.service.sweepPass();
    // The first row's contention stops the pass: the second claimed row is
    // NOT re-attempted by the reconcile arm in the same pass.
    expect(blocked?.delivered).toBe(0);
    expect(blocked?.reconciled, 'the reconcile arm honors the pass stop').toBe(0);
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10)).toHaveLength(0);
    const converge = await h.service.sweepPass();
    expect(converge?.reconciled).toBe(2);
    expect((await h.db.listingById(REALM, first.id))?.status).toBe('closed');
    expect((await h.db.listingById(REALM, second.id))?.status).toBe('closed');
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10)).toHaveLength(2);
  });

  it('retries a CONTENDED finalize on the next pass and converges, hands off', async () => {
    // The plain contended story with no surgery: the tail refuses once (a
    // guard held the listing row), the batch stops, and the very next pass
    // finishes the sale exactly once.
    const h = stocked();
    buyerOnline(h);
    h.db.failNextFinalize = 'contended';
    const { listingId } = await settleDirected(h);
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
    const stats = await h.service.sweepPass();
    expect(stats?.reconciled).toBe(1);
    const listing = await h.db.listingById(REALM, listingId);
    expect(listing?.status).toBe('closed');
    expect(listing?.resolution).toBe('sold');
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10)).toHaveLength(1);
  });

  it('isolates one poisoned ROW: the rest of the delivery batch still lands', async () => {
    // Per-row isolation inside the batch loop, distinct from the per-arm
    // isolation below: the first settlement's listing read throws once and
    // the second settlement must still deliver in the SAME pass.
    const h = makeHarness();
    h.custody.bags.set(CHAR_A, []);
    h.custody.owners.set(CHAR_A, BUYER_A);
    h.custody.bags.set(CHAR_B, []);
    h.custody.owners.set(CHAR_B, BUYER_B);
    const first = await listEpic(h);
    // A second seller (the wallet twin) lists its own epic, so two deliveries
    // share one batch.
    h.custody.owners.set(CHAR_TWIN, WALLET_TWIN);
    h.custody.bags.set(CHAR_TWIN, [{ itemId: EPIC_ITEM, count: 1 }]);
    const second = unwrap(
      await h.service.createListing({
        account: WALLET_TWIN,
        characterId: CHAR_TWIN,
        itemRef: { index: 0, itemId: EPIC_ITEM },
        params: listingParams({ startCents: 6000 }),
      }),
      'createListing',
    ).listing;
    await confirmedBid(h, BUYER_A, CHAR_A, first.id, 5000);
    await confirmedBid(h, BUYER_B, CHAR_B, second.id, 7000);
    h.setNow(Math.max(first.endsAtMs, second.endsAtMs) + 1);
    await h.service.sweepPass();
    const settlementA = await liveSettlement(h, first.id);
    const settlementB = await liveSettlement(h, second.id);
    for (const [buyer, s] of [
      [BUYER_A, settlementA],
      [BUYER_B, settlementB],
    ] as const) {
      unwrap(await h.service.settlementQuote(buyer, s.id), 'settlementQuote');
      expect(await h.db.transitionSettlement(s.id, ['offered'], 'confirming')).toBe(true);
      expect(await h.db.transitionSettlement(s.id, ['confirming'], 'confirmed')).toBe(true);
    }
    const original = h.db.listingById.bind(h.db);
    let poisoned = true;
    h.db.listingById = async (realm, id) => {
      if (poisoned && id === first.id) {
        poisoned = false;
        throw new Error('poisoned row');
      }
      return original(realm, id);
    };
    const stats = await h.service.sweepPass();
    expect(h.sweepErrors.map(([arm]) => arm)).toContain('delivered');
    expect(stats?.delivered, 'the healthy row advanced past the poison').toBe(1);
    expect((await getSettlement(h, settlementB.id)).state).toBe('delivered');
    expect((await h.db.listingById(REALM, second.id))?.status).toBe('closed');
    // The poisoned row is not lost either: the reconcile arm, later in the
    // SAME pass, re-reads 'delivering' rows and lands it (poison consumed).
    expect(stats?.reconciled).toBe(1);
    expect((await getSettlement(h, settlementA.id)).state).toBe('delivered');
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10), 'both sales, once each').toHaveLength(2);
  });

  it('isolates one poisoned sweep arm: later arms still run and the failure is reported', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    h.setNow(listing.endsAtMs + 1);
    const original = h.db.lapsePendingBids.bind(h.db);
    let poisoned = true;
    h.db.lapsePendingBids = async (realm, cutoffMs, limit) => {
      if (poisoned) {
        poisoned = false;
        throw new Error('poisoned arm');
      }
      return original(realm, cutoffMs, limit);
    };
    const stats = await h.service.sweepPass();
    // The poisoned arm scores zero and is reported; the close arm, which runs
    // AFTER it, still resolves the due listing in the same pass (the old
    // shape aborted the whole pass at the first throw).
    expect(stats?.lapsedBids).toBe(0);
    expect(h.sweepErrors.map(([arm]) => arm)).toContain('lapsedBids');
    expect(stats?.closed).toBe(1);
    expect((await h.db.listingById(REALM, listing.id))?.status).toBe('closed');
  });

  it('delivers exactly once even if the sweep runs the settlement again', async () => {
    // The custodyRef claim is shared by both routes precisely so no sequence of
    // retries can hand over a copy AND post one.
    const h = stocked();
    buyerOnline(h);
    const before = bagsOf(h, CHAR_A).length;
    await settleDirected(h);
    await h.service.sweepPass();
    await h.service.sweepPass();
    expect(bagsOf(h, CHAR_A), 'one copy, not three').toHaveLength(before + 1);
    expect(h.custody.parcels.filter((p) => p.letter === 'delivery')).toHaveLength(0);
  });

  it('refuses acceptance by anyone but the named buyer, as not_found', async () => {
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    const res = await h.service.acceptDirectedOffer(
      BUYER_B,
      offer.offer.id,
      { index: 0, itemId: EPIC_ITEM },
      CHAR_B,
    );
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
    await buyerAccepts(h, offer.offer.id);
    const [first, second] = await Promise.all([
      sellerAccepts(h, offer.offer.id),
      sellerAccepts(h, offer.offer.id),
    ]);
    // Exactly one produces a LISTING: the other loses the compare-and-set. Both
    // may report ok, which is why the assertion is on the escrow, not the flag.
    const listings = [first, second].filter((r) => r.ok && r.listing !== null);
    expect(listings, 'exactly one accept may escrow').toHaveLength(1);
    expect(bagsOf(h, SELLER_CHAR), 'exactly one copy escrowed').toHaveLength(1);
  });

  it('escrows on the SECOND acceptance, never the first, from either order', async () => {
    // Both sides agree through the trade window's ordinary Accept, so one side
    // alone must move nothing. Order must not matter: whoever presses last is
    // the one that escrows.
    for (const sellerFirst of [false, true]) {
      const h = stocked();
      const offer = await h.service.createDirectedOffer(offerArgs());
      if (!offer.ok) throw new Error('offer refused');
      const before = bagsOf(h, SELLER_CHAR).length;

      const first = sellerFirst
        ? await sellerAccepts(h, offer.offer.id)
        : await buyerAccepts(h, offer.offer.id);
      expect(first.ok, `first accept (sellerFirst=${sellerFirst})`).toBe(true);
      expect((first as { listing: unknown }).listing, 'one side alone escrows nothing').toBeNull();
      expect(bagsOf(h, SELLER_CHAR)).toHaveLength(before);

      const second = sellerFirst
        ? await buyerAccepts(h, offer.offer.id)
        : await sellerAccepts(h, offer.offer.id);
      expect(second.ok).toBe(true);
      expect((second as { listing: unknown }).listing, 'the second escrows').not.toBeNull();
      expect(bagsOf(h, SELLER_CHAR)).toHaveLength(before - 1);
    }
  });

  it('refuses a seller acceptance that names no item', async () => {
    // The seller's acceptance is the only place the goods are named, so an
    // itemless one would agree to sell nothing.
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    const res = await h.service.acceptDirectedOffer(SELLER, offer.offer.id, null, SELLER_CHAR);
    expect(res.ok).toBe(false);
  });

  it('a sequential second accept is also refused', async () => {
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    expect((await acceptWith(h, offer.offer.id)).ok).toBe(true);
    expect(await acceptWith(h, offer.offer.id)).toEqual({
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
    await buyerAccepts(h, offer.offer.id);
    const failed = await sellerAccepts(h, offer.offer.id);
    expect(failed.ok).toBe(false);
    expect(bagsOf(h, SELLER_CHAR), 'the copy came back').toHaveLength(2);
    // Still pending, so the buyer can simply try again.
    const retried = await sellerAccepts(h, offer.offer.id);
    expect(retried.ok, 'the reopened offer accepts on retry').toBe(true);
  });

  it('refuses acceptance after the TTL, and never escrows for an expired offer', async () => {
    const h = stocked();
    const offer = await h.service.createDirectedOffer(offerArgs());
    if (!offer.ok) throw new Error('offer refused');
    h.setNow(offer.offer.expiresAtMs);
    const res = await acceptWith(h, offer.offer.id);
    expect(res).toEqual({ ok: false, reason: 'offer_expired' });
    expect(bagsOf(h, SELLER_CHAR)).toHaveLength(2);
  });

  it('lets the seller decline and the buyer withdraw, but not the reverse', async () => {
    const h = stocked();
    const a = await h.service.createDirectedOffer(offerArgs());
    const b = await h.service.createDirectedOffer(offerArgs({ usdCents: 6000 }));
    if (!a.ok || !b.ok) throw new Error('offer refused');
    // The verbs belong to opposite sides: the SELLER declines an offer made to
    // them, the BUYER withdraws one they made. Using the other side's verb reads
    // as not_found, the same anti-enumeration shape as everything else here.
    expect(await h.service.resolveDirectedOffer(BUYER_A, a.offer.id, 'decline')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await h.service.resolveDirectedOffer(SELLER, b.offer.id, 'withdraw')).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(await h.service.resolveDirectedOffer(SELLER, a.offer.id, 'decline')).toEqual({
      ok: true,
    });
    expect(await h.service.resolveDirectedOffer(BUYER_A, b.offer.id, 'withdraw')).toEqual({
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

  /** Buyer offers -> seller accepts with an item -> the buyer owes payment. */
  async function acceptedOffer(h: Harness): Promise<WocListingRow> {
    const offer = await h.service.createDirectedOffer({
      account: BUYER_A,
      characterId: CHAR_A,
      sellerCharacterName: 'Selara',
      usdCents: 5000,
    });
    if (!offer.ok) throw new Error('offer refused');
    const first = await h.service.acceptDirectedOffer(BUYER_A, offer.offer.id, null, CHAR_A);
    if (!first.ok) throw new Error('buyer accept refused');
    const accepted = await h.service.acceptDirectedOffer(
      SELLER,
      offer.offer.id,
      { index: 0, itemId: EPIC_ITEM },
      SELLER_CHAR,
    );
    if (!accepted.ok || accepted.listing === null) throw new Error('seller accept refused');
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
    const partner = await h.service.tradePartner(SELLER, 'Aldan');
    expect(partner).toEqual({ name: 'Aldan', walletVerified: true });
    // The response shape is the contract: leaking an account id here would put
    // one on the wire for every player you open a trade with.
    expect(Object.keys(partner ?? {}).sort()).toEqual(['name', 'walletVerified']);
  });

  it('reports an unlinked player as not payable, which is what drives the copy', async () => {
    const h = makeHarness();
    h.wallets.delete(BUYER_A);
    expect((await h.service.tradePartner(SELLER, 'Aldan'))?.walletVerified).toBe(false);
  });

  it('reports YOUR OWN character as not payable', async () => {
    // So the window never offers an arm that createDirectedOffer would refuse.
    const h = makeHarness();
    expect((await h.service.tradePartner(SELLER, 'Selara'))?.walletVerified).toBe(false);
  });

  it('reads as absent for a character that is not on this realm', async () => {
    const h = makeHarness();
    expect(await h.service.tradePartner(SELLER, 'Nobody')).toBeNull();
  });

  it('refuses an offer to another character of your OWN account', async () => {
    // Same account, different character: an alt is still yourself, and the
    // check must be on the resolved ACCOUNT rather than the character id.
    const h = makeHarness();
    h.custody.bags.set(SELLER_CHAR, [{ itemId: EPIC_ITEM, count: 1 }]);
    const res = await h.service.createDirectedOffer({
      account: SELLER,
      characterId: SELLER_CHAR,
      sellerCharacterName: 'Selara Alt',
      usdCents: 5000,
    });
    expect(res).toEqual({ ok: false, reason: 'self_offer' });
  });
});

describe('the sweep expires unanswered directed offers', () => {
  // The gap this pins: expireDueDirectedOffers existed and nothing called it, so
  // a pending offer never resolved. It escrows nothing, but it stayed visible in
  // both players' trade windows as a deal that could never be accepted, and the
  // retention prune only reaches resolved rows, so the table grew without bound.
  it('flips a lapsed offer to expired, and leaves a live one alone', async () => {
    const h = makeHarness();
    h.custody.bags.set(SELLER_CHAR, [{ itemId: EPIC_ITEM, count: 1 }]);
    const made = await h.service.createDirectedOffer({
      account: BUYER_A,
      characterId: CHAR_A,
      sellerCharacterName: 'Selara',
      usdCents: 5000,
    });
    if (!made.ok) throw new Error('offer refused');

    // Still inside the window: the sweep must not touch it.
    await h.service.sweepPass();
    expect((await h.db.directedOfferById(REALM, made.offer.id))?.status).toBe('pending');

    h.setNow(made.offer.expiresAtMs + 1);
    const stats = await h.service.sweepPass();
    expect(stats?.expiredOffers).toBe(1);
    expect((await h.db.directedOfferById(REALM, made.offer.id))?.status).toBe('expired');
  });

  it('refuses acceptance of an expired offer without escrowing', async () => {
    const h = makeHarness();
    h.custody.bags.set(SELLER_CHAR, [{ itemId: EPIC_ITEM, count: 1 }]);
    const made = await h.service.createDirectedOffer({
      account: BUYER_A,
      characterId: CHAR_A,
      sellerCharacterName: 'Selara',
      usdCents: 5000,
    });
    if (!made.ok) throw new Error('offer refused');
    h.setNow(made.offer.expiresAtMs + 1);
    await h.service.sweepPass();
    const res = await h.service.acceptDirectedOffer(
      SELLER,
      made.offer.id,
      { index: 0, itemId: EPIC_ITEM },
      SELLER_CHAR,
    );
    expect(res.ok).toBe(false);
    expect(bagsOf(h, SELLER_CHAR), 'nothing may leave the bags').toHaveLength(1);
  });
});

describe('the insert refusal arms at the service seam', () => {
  it('buyNow answers not_active and releases the lock when the listing closed under the claim', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { format: 'buy_now', buyNowCents: 8000 });
    vi.spyOn(h.db, 'insertSettlement').mockResolvedValueOnce('listing_closed');
    const out = await h.service.buyNow({
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      acceptTerms: true,
    });
    // Honest answer, no phantom lock: the refusal names the closed listing,
    // and the claimed lock is released so the seller-side resolution can run.
    expect(out).toEqual({ ok: false, reason: 'not_active' });
    const row = await getListing(h, listing.id);
    expect(row.buyNowLockAccount).toBeNull();
  });

  it('buyNow answers contended and releases the lock on plain row contention', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { format: 'buy_now', buyNowCents: 8000 });
    vi.spyOn(h.db, 'insertSettlement').mockResolvedValueOnce('contended');
    const out = await h.service.buyNow({
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      acceptTerms: true,
    });
    expect(out).toEqual({ ok: false, reason: 'contended' });
    expect((await getListing(h, listing.id)).buyNowLockAccount).toBeNull();
  });

  it('a due auction with no bids parks settling instead of closing under a live buy-now settlement', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { format: 'buy_now', buyNowCents: 8000 });
    const inserted = await h.db.insertSettlement({
      listingId: listing.id,
      bidId: null,
      attempt: 0,
      buyerAccount: BUYER_A,
      buyerCharacter: CHAR_A,
      buyerName: 'Aldan',
      buyerWallet: 'wallet-a',
      amountCents: 8000,
      deadlineAtMs: listing.endsAtMs + 60_000,
      nowMs: h.now(),
    });
    if (typeof inserted === 'string') throw new Error(`fixture refused: ${inserted}`);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    // The old unguarded close here was the item-dupe hole: closed 'no_bids'
    // mails the escrow home while the buyer can still pay and be delivered.
    const row = await getListing(h, listing.id);
    expect(row.status).toBe('settling');
    expect(row.resolution).toBeNull();
  });

  it('the close arm leaves a claimed listing alone when a suspend closed it underneath', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    vi.spyOn(h.db, 'insertSettlement').mockResolvedValueOnce('listing_closed');
    await h.service.sweepPass();
    // The arm must CONTINUE: the suspend that closed the listing already
    // resolved the bid book, so there is nothing to settle and the claim must
    // not be flipped to 'settling' (the fall-through would do exactly that).
    expect((await getListing(h, listing.id)).status).toBe('ending');
    const bid = await getBid(h, standing.bidId);
    expect(bid.status).toBe('active');
    expect(bid.bondState).toBe('held');
  });

  it('the cascade unwinds its bond re-hold when the listing closed under it', async () => {
    const h = makeHarness();
    // Refunds that cannot settle keep the runner-up's queue entry visible, so
    // the re-hold and its unwind are observable states rather than a blur.
    const stalledRefunds = new WocMarketService({
      ...h.deps,
      economy: { ...h.economy, refundBond: async () => ({ done: false, reason: 'rpc_down' }) },
    });
    const listing = await listEpic(h);
    const runnerUp = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    const winner = await confirmedBid(h, BUYER_C, CHAR_C, listing.id, 6000);
    h.setNow(listing.endsAtMs + 1);
    await stalledRefunds.sweepPass();
    // The close-time winner defaults; the cascade re-holds the runner-up's
    // bond and tries to insert the next settlement, which loses to a
    // concurrent close.
    const settled = await liveSettlement(h, listing.id);
    expect(settled.bidId).toBe(winner.bidId);
    h.setNow(settled.deadlineAtMs + 1);
    vi.spyOn(h.db, 'insertSettlement').mockResolvedValueOnce('listing_closed');
    await stalledRefunds.sweepPass();
    const after = await getBid(h, runnerUp.bidId);
    // The unwind: never 'held' on a bid with no claim, and never 'won'.
    expect(after.status).toBe('outbid');
    expect(after.bondState).toBe('refund_due');
  });

  it('an admin suspend refuses a delivered-but-unclosed listing', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { format: 'buy_now', buyNowCents: 8000 });
    const inserted = await h.db.insertSettlement({
      listingId: listing.id,
      bidId: null,
      attempt: 0,
      buyerAccount: BUYER_A,
      buyerCharacter: CHAR_A,
      buyerName: 'Aldan',
      buyerWallet: 'wallet-a',
      amountCents: 8000,
      deadlineAtMs: h.now() + 60_000,
      nowMs: h.now(),
    });
    if (typeof inserted === 'string') throw new Error(`fixture refused: ${inserted}`);
    await h.db.transitionSettlement(inserted.id, ['offered'], 'confirming');
    await h.db.transitionSettlement(inserted.id, ['confirming'], 'confirmed');
    await h.db.transitionSettlement(inserted.id, ['confirmed'], 'delivering');
    await h.db.transitionSettlement(inserted.id, ['delivering'], 'delivered');
    const out = await h.service.adminSuspendListing(listing.id);
    expect(out).toEqual({ ok: false, reason: 'settlement_in_flight' });
    expect((await getListing(h, listing.id)).status).toBe('active');
  });

  it('a buyer may retry the SAME signature after a failed confirmation', async () => {
    const h = makeHarness();
    const listing = await listEpic(h, { format: 'buy_now', buyNowCents: 8000 });
    const inserted = await h.db.insertSettlement({
      listingId: listing.id,
      bidId: null,
      attempt: 0,
      buyerAccount: BUYER_A,
      buyerCharacter: CHAR_A,
      buyerName: 'Aldan',
      buyerWallet: 'wallet-a',
      amountCents: 8000,
      deadlineAtMs: h.now() + 60_000,
      nowMs: h.now(),
    });
    if (typeof inserted === 'string') throw new Error(`fixture refused: ${inserted}`);
    expect(await h.db.submitSettlementSignature(inserted.id, 'sig-retry-1')).toBe('ok');
    // A refused confirm sends the row failed, the retry revives it, and the
    // SAME signature must be accepted: the unique index adds no new entry for
    // re-writing the same value onto the same row. Only ANOTHER settlement
    // carrying the signature refuses.
    await h.db.transitionSettlement(inserted.id, ['confirming'], 'failed', 'refused');
    await h.db.transitionSettlement(inserted.id, ['failed'], 'offered');
    expect(await h.db.submitSettlementSignature(inserted.id, 'sig-retry-1')).toBe('ok');
    // listEpic extracts by bag index 0, so the replacement copy goes FIRST.
    h.custody.bags.get(SELLER_CHAR)?.unshift({ itemId: EPIC_ITEM, count: 1 });
    const secondListing = await listEpic(h, { format: 'buy_now', buyNowCents: 8000 });
    const other = await h.db.insertSettlement({
      listingId: secondListing.id,
      bidId: null,
      attempt: 0,
      buyerAccount: BUYER_C,
      buyerCharacter: CHAR_C,
      buyerName: 'Corvo',
      buyerWallet: 'wallet-c',
      amountCents: 8000,
      deadlineAtMs: h.now() + 60_000,
      nowMs: h.now(),
    });
    if (typeof other === 'string') throw new Error(`fixture refused: ${other}`);
    expect(await h.db.submitSettlementSignature(other.id, 'sig-retry-1')).toBe('signature_reused');
  });

  it('the reclaim parks a failed settlement for the overdue pass instead of expiring it', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settled = await liveSettlement(h, listing.id);
    expect(settled.bidId).toBe(standing.bidId);
    // The buyer's confirmation is refused inside the window: retry-eligible.
    await h.db.transitionSettlement(settled.id, ['offered'], 'failed', 'refused');
    // Past the stranded grace but INSIDE the settlement deadline: the reclaim
    // must leave everything alone (expiring here would skip the deadline
    // pass's default, forfeit, strike, and cascade, stranding the held bond).
    h.setNow(listing.endsAtMs + 1 + WOC_MARKET_STRANDED_RECLAIM_SECONDS * 1000 + 1000);
    await h.service.sweepPass();
    expect((await getListing(h, listing.id)).status).toBe('settling');
    const parked = await getBid(h, standing.bidId);
    expect(parked.status).toBe('won');
    expect(parked.bondState).toBe('held');
    // At the deadline the overdue pass runs its FULL consequence set.
    h.setNow(settled.deadlineAtMs + 1);
    await h.service.sweepPass();
    const defaulted = await getBid(h, standing.bidId);
    expect(defaulted.status).toBe('defaulted');
    expect(defaulted.bondState).not.toBe('held');
    expect((await getListing(h, listing.id)).status).toBe('closed');
  });

  it('the cascade pick breaks ties by placement time, then by id', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const place = async (account: number, characterId: number, name: string, amount: number) => {
      const out = await h.db.insertPendingBid({
        realm: REALM,
        listingId: listing.id,
        account,
        characterId,
        characterName: name,
        wallet: `wallet-${name}`,
        amountCents: amount,
        bondCents: 100,
        nowMs: h.now(),
        extendEndsToMs: () => null,
        minNext: () => 0,
      });
      if (!out.ok) throw new Error(`fixture bid refused: ${out.reason}`);
      await h.db.markBidStatus(out.bid.id, 'outbid');
      return out.bid.id;
    };
    const early = await place(BUYER_A, CHAR_A, 'Aldan', 5000);
    h.setNow(BASE_MS + 60_000);
    const late = await place(BUYER_B, CHAR_B, 'Brint', 5000);
    const lateTwin = await place(BUYER_C, CHAR_C, 'Corvo', 5000);
    // Equal amounts: the EARLIEST placement wins the cascade pick.
    expect((await h.db.nextCascadeBidder(listing.id, 0, []))?.id).toBe(early);
    // Equal amount AND time: the lowest id wins (a total, deterministic order).
    expect((await h.db.nextCascadeBidder(listing.id, 0, [BUYER_A]))?.id).toBe(late);
    expect(lateTwin).toBeGreaterThan(late);
  });
});

// ---------------------------------------------------------------------------
// Park rotation, the residue beats, and the resume ledgers.
//
// The shared theme: work that CANNOT proceed must stay visible and stay
// bounded. A parked row rotates out of the batch head without refreshing the
// age the monitor watches, the residue beats converge over resumable pages
// rather than one unbounded burst, and a resume that cannot prove the item is
// undelivered stops instead of guessing. The directed-offer block above scopes
// its own copies of these fixtures; they are re-stated here so each block reads
// on its own.
// ---------------------------------------------------------------------------

/** The stuck-custody horizon the operator readout is queried with. */
const STUCK_HORIZON_MS = 600_000;
/** One tick past the in-process park backoff (PARK_RETRY_MS). */
const PAST_BACKOFF_MS = 61_000;

/** Two epics in the seller's bags, so one harness can stage a directed sale
 *  and still have a copy left for a second listing. */
function twoEpics(h: Harness): Harness {
  h.custody.bags.set(SELLER_CHAR, [
    { itemId: EPIC_ITEM, count: 1 },
    { itemId: EPIC_ITEM, count: 1 },
  ]);
  return h;
}

/** The buyer online with room to spare. Without it every hand-off refuses as
 *  'offline' and the park assertions below pass for the wrong reason. */
function putBuyerOnline(h: Harness): void {
  h.custody.bags.set(CHAR_A, []);
  h.custody.owners.set(CHAR_A, BUYER_A);
}

/** A directed p2p deal driven from offer to a delivery attempt: both sides
 *  accept (buyer first, so the SELLER's acceptance escrows), the buyer takes
 *  the buy-now price, and confirmSettlement delivers eagerly. */
async function directedSale(h: Harness, signature: string): Promise<{ listingId: number }> {
  const offer = unwrap(
    await h.service.createDirectedOffer({
      account: BUYER_A,
      characterId: CHAR_A,
      sellerCharacterName: 'Selara',
      usdCents: 5000,
    }),
    'createDirectedOffer',
  );
  unwrap(
    await h.service.acceptDirectedOffer(BUYER_A, offer.offer.id, null, CHAR_A),
    'buyer accept',
  );
  const accepted = unwrap(
    await h.service.acceptDirectedOffer(
      SELLER,
      offer.offer.id,
      { index: 0, itemId: EPIC_ITEM },
      SELLER_CHAR,
    ),
    'seller accept',
  );
  if (!accepted.listing) throw new Error('the seller acceptance produced no listing');
  const listingId = accepted.listing.id;
  const bought = unwrap(
    await h.service.buyNow({ account: BUYER_A, characterId: CHAR_A, listingId, acceptTerms: true }),
    'buyNow',
  );
  unwrap(await h.service.settlementQuote(BUYER_A, bought.settlement.id), 'settlementQuote');
  unwrap(
    await h.service.confirmSettlement(BUYER_A, bought.settlement.id, signature),
    'confirmSettlement',
  );
  return { listingId };
}

/** Take a closed public auction's settlement to 'confirmed' WITHOUT
 *  confirmSettlement, whose eager arm would deliver it in the same breath. */
async function confirmedAwaitingDelivery(h: Harness, listingId: number): Promise<number> {
  const settlement = await liveSettlement(h, listingId);
  unwrap(await h.service.settlementQuote(BUYER_A, settlement.id), 'settlementQuote');
  expect(await h.db.transitionSettlement(settlement.id, ['offered'], 'confirming')).toBe(true);
  expect(await h.db.transitionSettlement(settlement.id, ['confirming'], 'confirmed')).toBe(true);
  return settlement.id;
}

/** One delivered-but-unclosed residue row, the shape an older binary left when
 *  it died between its delivered CAS and its close tail. Written straight
 *  through the db primitives: the current binary cannot produce this state, and
 *  a DIRECTED listing is exempt from the per-seller active cap, which is the
 *  only way to stage more residue than a seller may hold public listings. */
async function seedDeliveredResidue(h: Harness): Promise<{ listingId: number }> {
  const inserted = await h.db.escrowInsertListing(
    {
      characterId: SELLER_CHAR,
      level: 10,
      state: {} as unknown as CharacterState,
      leaseNonce: 'nonce',
    },
    {
      realm: REALM,
      sellerAccount: SELLER,
      sellerCharacter: SELLER_CHAR,
      sellerName: 'Selara',
      sellerWallet: 'wallet-seller',
      item: { itemId: EPIC_ITEM, count: 1 },
      itemId: EPIC_ITEM,
      quality: 'epic',
      params: listingParams({ directedBuyerAccount: BUYER_A, buyNowCents: 5000 }),
      endsAtMs: h.now() + 24 * HOUR_MS,
    },
  );
  if (!inserted.ok) throw new Error(`residue listing refused: ${inserted.reason}`);
  const settlement = await h.db.insertSettlement({
    listingId: inserted.id,
    bidId: null,
    attempt: 0,
    buyerAccount: BUYER_A,
    buyerCharacter: CHAR_A,
    buyerName: 'Aldan',
    buyerWallet: 'wallet-a',
    amountCents: 5000,
    deadlineAtMs: h.now() + HOUR_MS,
    nowMs: h.now(),
  });
  if (typeof settlement === 'string') throw new Error(`residue settlement refused: ${settlement}`);
  expect(await h.db.transitionSettlement(settlement.id, ['offered'], 'delivered')).toBe(true);
  return { listingId: inserted.id };
}

/** The readout an operator actually gets: a cutoff BEHIND now by the stuck
 *  horizon. A cutoff in the FUTURE (now + 1) satisfies the age predicate for
 *  every row, so it would stay green over an age column the park rotation
 *  re-stamped, which is the exact defect this group exists to catch. */
function stuckReadout(h: Harness) {
  return h.db.stuckCustodyReadout(REALM, h.now() - STUCK_HORIZON_MS, 10, 1000);
}

/** Sweep once a minute until more than the stuck horizon has passed, which is
 *  what a permanently parked row really lives through before anyone looks. */
async function rotatePastStuckHorizon(h: Harness): Promise<void> {
  const start = h.now();
  while (h.now() - start <= STUCK_HORIZON_MS) {
    h.setNow(h.now() + PAST_BACKOFF_MS);
    await h.service.sweepPass();
  }
}

/** Stage a return that can never proceed: a claim already attributed to the
 *  grant rail refuses the return rail forever, so the backlog parks it on
 *  every pass. Returns the suspended listing. */
async function parkedReturn(h: Harness): Promise<WocListingRow> {
  const listing = await listEpic(h);
  const ref = listingReturnCustodyRef(listing.id);
  expect(await h.db.claimCustodyRef(REALM, ref)).toBe(true);
  expect(await h.db.markCustodyGrantIntent(ref, CHAR_A)).toBe(true);
  expect(await h.service.adminSuspendListing(listing.id)).toEqual({ ok: true });
  return listing;
}

describe('a parked row rotates to the batch tail without hiding from the monitor', () => {
  it('keeps a parked RETURN visible in the readout across ten minutes of rotations', async () => {
    // The rotation column and the age column are deliberately different
    // columns. Rotating the AGE column instead re-stamped every parked row once
    // a minute against a ten-minute threshold, so the operator queue read empty
    // forever precisely while nothing was being delivered.
    const h = makeHarness();
    const listing = await parkedReturn(h);
    await rotatePastStuckHorizon(h);
    const readout = await stuckReadout(h);
    expect(readout.undisposedListings.count, 'still standing, still visible').toBe(1);
    expect(readout.undisposedListings.sample[0]?.id).toBe(listing.id);
    expect((await getListing(h, listing.id)).itemDisposed, 'and nothing was disposed').toBe(false);
    expect(h.custody.persistCalls, 'and nothing was ever mailed').toHaveLength(0);
  });

  it('keeps a parked DELIVERY visible in the readout across ten minutes of rotations', async () => {
    // The delivering twin, aged on the updated_at stamped when the row entered
    // 'delivering'. Same hazard, same proof.
    const h = twoEpics(makeHarness());
    putBuyerOnline(h);
    h.db.failNextDeliveredSave = 'lease_lost';
    const { listingId } = await directedSale(h, 'sig-rotate-delivery-1');
    const settlementId = (await liveSettlement(h, listingId)).id;
    await rotatePastStuckHorizon(h);
    const readout = await stuckReadout(h);
    expect(readout.stuckDelivering.count).toBe(1);
    expect(readout.stuckDelivering.sample[0]?.id).toBe(settlementId);
    expect(
      h.custody.parcels.filter((p) => p.letter === 'delivery'),
      'a fenced grant is never mailed over',
    ).toHaveLength(0);
  });

  it('counts park EVENTS as work, and counts a backoff skip as none', async () => {
    const h = makeHarness();
    await parkedReturn(h);
    const parking = await h.service.sweepPass();
    // A pass that parks everything used to score zero on every arm and read as
    // idle exactly when the marketplace was wedged.
    expect(parking?.returned, 'a parked row is not a returned row').toBe(0);
    expect(parking?.parked).toBe(1);
    // The very next pass is inside the backoff window: nothing NEW parked, so a
    // standing parked set cannot flood the saturation warning either.
    const skipping = await h.service.sweepPass();
    expect(skipping?.parked).toBe(0);
    expect(skipping?.returned).toBe(0);
  });

  it('rotates a parked RETURN once and then EXCLUDES it from the backlog read', async () => {
    // The starvation half: a parked row must neither own the head of every
    // batch (the rotation moves it to the tail) nor keep costing batch slots
    // and writes while it waits out its backoff (the read excludes it).
    const h = makeHarness();
    const listing = await parkedReturn(h);
    const rotations: number[] = [];
    const rotate = h.db.touchListingRow.bind(h.db);
    h.db.touchListingRow = async (id) => {
      rotations.push(id);
      await rotate(id);
    };
    const reads: number[][] = [];
    const backlog = h.db.undisposedClosedListings.bind(h.db);
    h.db.undisposedClosedListings = async (realm, limit, excludeIds) => {
      reads.push([...excludeIds]);
      return backlog(realm, limit, excludeIds);
    };
    await h.service.sweepPass();
    expect(rotations, 'the park rotates ONCE').toEqual([listing.id]);
    expect(reads[0], 'nothing was excluded before the park').toEqual([]);
    await h.service.sweepPass();
    expect(rotations, 'the backoff window costs no further writes').toEqual([listing.id]);
    expect(reads[1], 'the backing-off row is excluded from the read').toEqual([listing.id]);
  });

  it('rotates a parked DELIVERY once and then EXCLUDES it from the reconcile read', async () => {
    const h = twoEpics(makeHarness());
    putBuyerOnline(h);
    h.db.failNextDeliveredSave = 'lease_lost';
    const { listingId } = await directedSale(h, 'sig-rotate-spy-1');
    const settlementId = (await liveSettlement(h, listingId)).id;
    const rotations: number[] = [];
    const rotate = h.db.touchSettlementRow.bind(h.db);
    h.db.touchSettlementRow = async (id) => {
      rotations.push(id);
      await rotate(id);
    };
    const reads: number[][] = [];
    const stuck = h.db.deliveringSettlements.bind(h.db);
    h.db.deliveringSettlements = async (realm, limit, excludeIds) => {
      reads.push([...excludeIds]);
      return stuck(realm, limit, excludeIds);
    };
    h.setNow(h.now() + PAST_BACKOFF_MS);
    const parking = await h.service.sweepPass();
    expect(rotations).toEqual([settlementId]);
    expect(parking?.reconciled, 'a parked delivery is not a reconciled one').toBe(0);
    expect(parking?.parked).toBe(1);
    const skipping = await h.service.sweepPass();
    expect(rotations, 'the backoff window costs no further writes').toEqual([settlementId]);
    expect(reads[1], 'the backing-off row is excluded from the read').toEqual([settlementId]);
    expect(skipping?.parked, 'a skip is not a new park event').toBe(0);
  });
});

describe('the residue beats converge over bounded, resumable pages', () => {
  it('finalizes at most one batch per beat and resumes behind the last row it took', async () => {
    // Every converged row costs a finalize transaction plus a realm mail-book
    // write on the shared serial writer, and the one moment residue is
    // plentiful (the first boot after a legacy upgrade) is exactly when the
    // realm can least absorb an unbounded burst.
    const h = makeHarness();
    const listingIds: number[] = [];
    for (let i = 0; i < 27; i++) listingIds.push((await seedDeliveredResidue(h)).listingId);
    const first = await h.service.sweepPass();
    expect(first?.redriven, 'one batch, never the whole backlog').toBe(25);
    // The truncated page's cursor sits on the last RETURNED row, so the two it
    // could not reach are the very next beat's work rather than waiting out a
    // full cursor wrap.
    h.setNow(h.now() + PAST_BACKOFF_MS);
    const second = await h.service.sweepPass();
    expect(second?.redriven).toBe(2);
    for (const id of listingIds) {
      const listing = await getListing(h, id);
      expect(listing.status, `listing ${id} converged`).toBe('closed');
      expect(listing.resolution).toBe('sold');
      expect(listing.itemDisposed).toBe(true);
    }
  });

  it('never re-notifies a seller once the residue beat converged its sale', async () => {
    // 'already_final' exists so a converged tail is neither re-counted nor
    // re-mailed. The notice is item-free, but a seller who read and deleted it
    // would still watch it re-appear on every beat.
    const h = makeHarness();
    const { listingId } = await seedDeliveredResidue(h);
    const noticeRef = listingSoldNoticeCustodyRef(listingId);
    const first = await h.service.sweepPass();
    expect(first?.redriven).toBe(1);
    expect(
      h.custody.persistCalls.filter((r) => r === noticeRef),
      'the seller hears exactly once',
    ).toHaveLength(1);
    // The seller reads it and deletes the emptied letter, so the in-book marker
    // is gone: nothing but the beat's own honesty stops a second one.
    h.custody.collect(noticeRef);
    h.setNow(h.now() + PAST_BACKOFF_MS);
    const second = await h.service.sweepPass();
    expect(second?.redriven, 'a beat that really ran, and found nothing left').toBe(0);
    expect(h.custody.persistCalls.filter((r) => r === noticeRef)).toHaveLength(1);
    expect(h.custody.parcels.filter((p) => p.custodyRef === noticeRef)).toHaveLength(0);
  });
});

describe('one contended finalize stops every later delivery arm from claiming', () => {
  it('leaves a confirmed settlement unclaimed when the residue beat hit contention first', async () => {
    // The claim UPDATE moves rows into 'delivering'. Claiming a batch this pass
    // will not deliver only feeds the stuck-delivering readout for nothing, so
    // the check has to happen BEFORE the claim rather than inside the loop.
    const h = makeHarness();
    putBuyerOnline(h);
    const listing = await listEpic(h);
    await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    h.setNow(listing.endsAtMs + 1);
    await h.service.sweepPass();
    const settlementId = await confirmedAwaitingDelivery(h, listing.id);
    await seedDeliveredResidue(h);
    // Past the beat gate, so the residue arm (which runs BEFORE the delivery
    // arms) really reaches its finalize and really contends.
    h.setNow(h.now() + PAST_BACKOFF_MS);
    h.db.failNextFinalize = 'contended';
    const stats = await h.service.sweepPass();
    expect(stats?.redriven).toBe(0);
    expect(stats?.delivered).toBe(0);
    expect(stats?.reconciled).toBe(0);
    expect((await getSettlement(h, settlementId)).state, 'never claimed').toBe('confirmed');
    // The next pass, with nothing contending, claims and delivers.
    h.setNow(h.now() + PAST_BACKOFF_MS);
    const converge = await h.service.sweepPass();
    expect(converge?.delivered).toBe(1);
    // The residue waits one beat longer BY DESIGN: the contended beat had
    // already advanced its cursor past the page it broke on, so that page comes
    // back around only when the cursor wraps. Slower than the beat interval on
    // a contended cycle, and still convergent.
    expect(converge?.redriven, 'the cursor sits past the broken page').toBe(0);
    h.setNow(h.now() + PAST_BACKOFF_MS);
    expect((await h.service.sweepPass())?.redriven, 'and wraps on the beat after').toBe(1);
  });

  it('clears the contention flag at the eager confirm entry, which runs outside any pass', async () => {
    // The flag is pass-scoped but confirmSettlement is not: a true left over
    // from the previous pass would silently claim-and-drop the buyer who just
    // paid, and the sweep would only pick it up a beat later.
    const h = twoEpics(makeHarness());
    putBuyerOnline(h);
    await seedDeliveredResidue(h);
    h.db.failNextFinalize = 'contended';
    const contended = await h.service.sweepPass();
    expect(contended?.redriven, 'the pass really ended contended').toBe(0);
    const { listingId } = await directedSale(h, 'sig-eager-reset-1');
    expect(
      (await h.db.listingById(REALM, listingId))?.status,
      'the buyer gets their item in the same breath',
    ).toBe('closed');
    expect(bagsOf(h, CHAR_A).map((s) => s.itemId)).toContain(EPIC_ITEM);
  });

  it('reports a settlement that vanished mid-delivery rather than skipping it in silence', async () => {
    // A 'stale' finalize AFTER custody was booked means the row left the shape
    // only a hand edit can produce. It is invisible to every monitor class, so
    // the one pass that saw it is the only chance anyone has to hear about it.
    const h = twoEpics(makeHarness());
    putBuyerOnline(h);
    h.db.failNextFinalize = 'contended';
    const { listingId } = await directedSale(h, 'sig-vanish-1');
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
    h.db.failNextFinalize = 'stale';
    await h.service.sweepPass();
    const vanished = h.sweepErrors.filter(([, err]) =>
      String(err).includes('vanished mid-delivery'),
    );
    expect(vanished, 'reported once, by the arm that saw it').toHaveLength(1);
    expect(vanished[0]?.[0]).toBe('reconciled');
    // The skip CLEARS the park entry instead of backing the row off: on the
    // same clock the next pass looks again rather than waiting out a minute.
    h.db.failNextFinalize = 'stale';
    await h.service.sweepPass();
    expect(
      h.sweepErrors.filter(([, err]) => String(err).includes('vanished mid-delivery')),
    ).toHaveLength(2);
  });
});

describe('an unprovable hand-off parks instead of mailing a second copy', () => {
  it('PARKS an AMBIGUOUS grant refusal, which is not a refusal at all', async () => {
    // grantCopy declining cleanly (offline, full bags) proves the bags are
    // untouched and mail is safe. 'ambiguous' proves the opposite: the copy
    // reached the live bags and an ordinary teardown flush may still persist it,
    // so mailing here is the second copy.
    const h = twoEpics(makeHarness());
    putBuyerOnline(h);
    h.custody.failNextGrantAmbiguous = true;
    const { listingId } = await directedSale(h, 'sig-ambiguous-1');
    const ref = settlementCustodyRef((await liveSettlement(h, listingId)).id);
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
    expect(h.custody.parcels, 'never converts an ambiguous grant to mail').toHaveLength(0);
    expect(h.db.custodyClaims.get(ref)?.grantCharacterId, 'the claim keeps its rail').toBe(CHAR_A);
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBeNull();
    // With the hook off it STILL parks: grantCopy refused before any
    // pendingGrants entry existed, so this process has no session memory to
    // resume from and only an operator can attribute the copy.
    for (let i = 0; i < 2; i++) {
      h.setNow(h.now() + PAST_BACKOFF_MS);
      await h.service.sweepPass();
    }
    expect(h.custody.parcels).toHaveLength(0);
    expect(h.custody.grantCalls, 'and never grants a second time').toBe(1);
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
    expect(await h.db.strikeInfo(BUYER_A), 'the buyer did nothing wrong').toBeNull();
    await rotatePastStuckHorizon(h);
    const readout = await stuckReadout(h);
    expect(readout.unbookedClaims.count, 'visible to the operator').toBe(1);
    expect(readout.unbookedClaims.sample[0]).toMatchObject({
      custodyRef: ref,
      grantCharacterId: CHAR_A,
      mailIntent: false,
    });
  });

  it('refreshes a provable resume on every attempt, so long contention cannot expire it', async () => {
    // The proof of resumability is the session identity plus its nonce, not the
    // ledger entry's age: without the refresh, a slow-database incident longer
    // than the ledger horizon turned a still-live, still-provable retry into a
    // permanent operator-only park.
    const h = twoEpics(makeHarness());
    putBuyerOnline(h);
    const before = bagsOf(h, CHAR_A).length;
    h.db.failNextDeliveredSave = 'throw';
    const { listingId } = await directedSale(h, 'sig-sustained-1');
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
    for (let i = 0; i < 11; i++) {
      h.setNow(h.now() + PAST_BACKOFF_MS);
      h.db.failNextDeliveredSave = 'throw';
      await h.service.sweepPass();
    }
    // Eleven minutes later the database comes back.
    h.setNow(h.now() + PAST_BACKOFF_MS);
    await h.service.sweepPass();
    expect(bagsOf(h, CHAR_A), 'one copy, delivered by the resume').toHaveLength(before + 1);
    expect(h.custody.grantCalls, 'granted once; every retry was a snapshot').toBe(1);
    expect(h.custody.parcels.filter((p) => p.letter === 'delivery')).toHaveLength(0);
    expect((await h.db.listingById(REALM, listingId))?.status).toBe('closed');
  });

  it('PARKS a resume whose session memory aged out of the local ledger', async () => {
    // The other side of the same ledger rule. A process that kept losing the
    // sweep lock makes no attempts at all, so nothing refreshes the entry and
    // the horizon prunes it; from then on the retry is unprovable and parks.
    const h = twoEpics(makeHarness());
    putBuyerOnline(h);
    h.db.failNextDeliveredSave = 'throw';
    const { listingId } = await directedSale(h, 'sig-pruned-1');
    const ref = settlementCustodyRef((await liveSettlement(h, listingId)).id);
    h.setNow(h.now() + 11 * 60_000);
    await h.service.sweepPass();
    expect(h.custody.parcels, 'never mails over a grant intent').toHaveLength(0);
    expect(h.custody.grantCalls).toBe(1);
    expect((await liveSettlement(h, listingId)).state).toBe('delivering');
    expect(h.db.custodyClaims.get(ref)?.bookedAtMs).toBeNull();
    const readout = await stuckReadout(h);
    expect(readout.unbookedClaims.sample[0]).toMatchObject({
      custodyRef: ref,
      grantCharacterId: CHAR_A,
    });
  });
});

describe('the seller notice can fail or be lost without touching the sale', () => {
  it('reports a failed notice under its own tag and still finishes the delivery', async () => {
    // A directed hand-off writes NO delivery parcel, so the only persist in this
    // flow is the notice: this is the blob half failing after the letter already
    // entered the live book, and the delivery must not care.
    const h = twoEpics(makeHarness());
    putBuyerOnline(h);
    h.custody.failNextPersist = true;
    const { listingId } = await directedSale(h, 'sig-notice-fail-1');
    const listing = await getListing(h, listingId);
    expect(listing.status, 'the sale is finished regardless').toBe('closed');
    expect(listing.resolution).toBe('sold');
    expect(await h.db.salesForItem(REALM, EPIC_ITEM, 10)).toHaveLength(1);
    expect(
      h.sweepErrors.map(([arm]) => arm),
      'tagged apart from the delivery arms, so an operator can tell WHERE it failed',
    ).toContain('deliver_notice');
    expect(
      bagsOf(h, CHAR_A).map((s) => s.itemId),
      'the buyer has their item',
    ).toContain(EPIC_ITEM);
  });

  it('loses the notice for good when a crash lands between the finalize and the letter', async () => {
    // Pins the ACCEPTED loss rather than leaving it to be re-discovered: no arm
    // re-notifies, so this seller never hears about the sale. The letter is
    // item-free and the sale itself is durable, which is what makes it
    // acceptable; a silent regression into item loss would not be.
    const h = twoEpics(makeHarness());
    putBuyerOnline(h);
    h.db.failNextFinalize = 'contended';
    const { listingId } = await directedSale(h, 'sig-notice-loss-1');
    const settlement = await liveSettlement(h, listingId);
    expect(
      await h.db.finalizeDeliveredSettlement({
        settlementId: settlement.id,
        listingId,
        bidId: settlement.bidId,
        sale: {
          realm: REALM,
          listingId,
          itemId: EPIC_ITEM,
          item: { itemId: EPIC_ITEM, count: 1 },
          priceCents: settlement.amountCents,
          amountBase: null,
          sellerAccount: SELLER,
          buyerAccount: BUYER_A,
          sellerName: 'Selara',
          buyerName: 'Aldan',
        },
      }),
      'the close tail commits, then the process dies before the notice',
    ).toBe('finalized');
    const noticeRef = listingSoldNoticeCustodyRef(listingId);
    for (let i = 0; i < 3; i++) {
      h.setNow(h.now() + PAST_BACKOFF_MS);
      await h.service.sweepPass();
    }
    expect(
      h.custody.persistCalls.filter((r) => r === noticeRef),
      'nothing ever re-notifies',
    ).toHaveLength(0);
    const listing = await getListing(h, listingId);
    expect(listing.status).toBe('closed');
    expect(listing.resolution).toBe('sold');
    expect(listing.itemDisposed).toBe(true);
    expect((await getSettlement(h, settlement.id)).state).toBe('delivered');
    expect(
      await h.db.salesForItem(REALM, EPIC_ITEM, 10),
      'exactly one sale, unharmed',
    ).toHaveLength(1);
  });
});
