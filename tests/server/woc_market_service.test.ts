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
// teardown. Every scenario asserts BOTH the returned values and the resulting
// fake-db/custody state.

import { describe, expect, it } from 'vitest';
import type {
  Refused,
  WocBidRow,
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
  totpEnrolled: Set<number>;
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
  const totpEnrolled = new Set<number>([SELLER, BUYER_A, BUYER_C, WALLET_TWIN]);
  const economy = createDevWocMarketEconomy(now);
  const deps: WocMarketDeps = {
    db,
    economy,
    custody,
    verifiedWallet: async (account) => wallets.get(account) ?? null,
    balanceTokens: async (pubkey) => balances.get(pubkey) ?? null,
    totpEnabled: async (account) => totpEnrolled.has(account),
    totpVerify: async (_account, code) => code === 'OTP-OK',
    config: {
      enabled: true,
      realm: REALM,
      policy: WOC_MARKET_RESTRICTED_POLICY,
      totpThresholdCents: 10_000,
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
    totpEnrolled,
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
  totpCode?: string | null;
  acceptTerms?: boolean;
}

function placeBid(h: Harness, args: BidArgs) {
  return h.service.placeBid({
    account: args.account,
    characterId: args.characterId,
    listingId: args.listingId,
    amountCents: args.amountCents,
    totpCode: args.totpCode ?? null,
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

  it('enforces TOTP at the threshold: missing code, unenrolled account, bad code, good code', async () => {
    const h = makeHarness();
    const listing = await listEpic(h);
    const noCode = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 10_000,
    });
    expect(noCode).toEqual({ ok: false, reason: 'totp_required' });
    const unenrolled = await placeBid(h, {
      account: BUYER_B,
      characterId: CHAR_B,
      listingId: listing.id,
      amountCents: 10_000,
      totpCode: 'OTP-OK',
    });
    expect(unenrolled).toEqual({ ok: false, reason: 'totp_required' });
    const badCode = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 10_000,
      totpCode: 'OTP-BAD',
    });
    expect(badCode).toEqual({ ok: false, reason: 'totp_invalid' });
    const good = await placeBid(h, {
      account: BUYER_A,
      characterId: CHAR_A,
      listingId: listing.id,
      amountCents: 10_000,
      totpCode: 'OTP-OK',
    });
    expect(good.ok).toBe(true);
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
      totpCode: null,
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
      totpCode: null,
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
    const listing = await listEpic(h, { format: 'auction_buy_now', buyNowCents: 8000 });
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);

    const buy = unwrap(
      await h.service.buyNow({
        account: BUYER_B,
        characterId: CHAR_B,
        listingId: listing.id,
        totpCode: null,
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
      totpCode: null,
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
    const listing = await listEpic(h, { format: 'auction_buy_now', buyNowCents: 8000 });
    const standing = await confirmedBid(h, BUYER_A, CHAR_A, listing.id, 5000);
    const buy = unwrap(
      await h.service.buyNow({
        account: BUYER_B,
        characterId: CHAR_B,
        listingId: listing.id,
        totpCode: null,
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
