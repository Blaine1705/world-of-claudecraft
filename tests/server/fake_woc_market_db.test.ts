// Fidelity pins on FakeWocMarketDb where a divergence from the real Pg
// queries would let a service test pass against the fake and fail against
// Postgres. The SQL half lives in tests/server/woc_market_directed_sql.test.ts
// and the live half in tests/woc_market_directed_pg_integration.test.ts; this
// file pins the FAKE to the same contracts.
import { describe, expect, it } from 'vitest';
import { SETTLED_OFFER_GRACE_MS } from '../../server/woc_market_db';
import type { CharacterState } from '../../src/sim/sim';
import { FakeWocMarketDb } from './helpers/fake_woc_market_db';

const REALM = 'Claudemoon';
const BASE_MS = 1_820_000_000_000;

describe('directedOffersForAccount mirrors the Pg ordering contract', () => {
  it('returns newest-first by creation and truncates at the Pg LIMIT of 50', async () => {
    let clockMs = BASE_MS;
    const db = new FakeWocMarketDb({ characters: [], now: () => clockMs });
    // 55 offers from 55 distinct sellers (one live deal per pair), each a
    // second apart, so created-at order is real rather than an id accident.
    for (let i = 0; i < 55; i++) {
      clockMs += 1_000;
      const row = await db.insertDirectedOffer({
        realm: REALM,
        sellerAccount: 100 + i,
        sellerCharacter: 1_000 + i,
        sellerName: `Seller${i}`,
        buyerAccount: 7,
        buyerName: 'Buyer',
        usdCents: 100,
        expiresAtMs: clockMs + 3_600_000,
        itemId: 'itm_test',
        itemPin: `pin-${i}`,
      });
      expect(row).not.toBe('offer_pending');
    }
    const rows = await db.directedOffersForAccount(REALM, 7);
    expect(rows).toHaveLength(50);
    const created = rows.map((o) => o.createdAtMs);
    expect(created).toEqual([...created].sort((a, b) => b - a));
    // The five OLDEST fell off, exactly as ORDER BY created_at DESC LIMIT 50
    // truncates; a fake that kept everything, or dropped the newest, fails.
    expect(Math.min(...created)).toBe(BASE_MS + 6_000);
    expect(Math.max(...created)).toBe(BASE_MS + 55_000);
  });
});

describe('directedOffersForAccount mirrors the two Pg grace clauses', () => {
  // The twins of the live pg suite's grace cases: without them a fake edit
  // could drop either arm and every fake-driven service test would keep
  // passing while behaving unlike production (both arms survived a mutation
  // battery before these landed). The clock is the seam's nowMs argument,
  // exactly as the service passes it, so the cutoff is a real moment and not
  // the fake's default zero clock (under which every row lingered forever).
  const offerFor = (db: FakeWocMarketDb, seller: number) =>
    db.insertDirectedOffer({
      realm: REALM,
      sellerAccount: seller,
      sellerCharacter: 21,
      sellerName: 'Selara',
      buyerAccount: 9,
      buyerName: 'Buyer',
      usdCents: 5000,
      expiresAtMs: BASE_MS + 3_600_000,
      itemId: 'crown_of_embers',
      itemPin: 'pin-crown',
    });

  it('a just-DECLINED offer lingers for the grace window and leaves after it', async () => {
    let clockMs = BASE_MS;
    const db = new FakeWocMarketDb({ characters: [], now: () => clockMs });
    const row = await offerFor(db, 4);
    if (row === 'offer_pending') throw new Error('unexpected pending refusal');
    clockMs = BASE_MS + 10_000;
    expect(await db.resolveDirectedOffer(REALM, row.id, 'declined')).not.toBeNull();
    const within = await db.directedOffersForAccount(REALM, 9, clockMs + 1_000);
    expect(
      within.map((o) => o.id),
      'inside the window the verdict is readable',
    ).toContain(row.id);
    expect(within.find((o) => o.id === row.id)?.status).toBe('declined');
    const after = await db.directedOffersForAccount(
      REALM,
      9,
      clockMs + SETTLED_OFFER_GRACE_MS + 1_000,
    );
    expect(
      after.map((o) => o.id),
      'past the window the row is gone',
    ).not.toContain(row.id);
  });

  it('a just-CLOSED sale lingers for the grace window and leaves after it', async () => {
    let clockMs = BASE_MS;
    const db = new FakeWocMarketDb({ characters: [], now: () => clockMs });
    const row = await offerFor(db, 5);
    if (row === 'offer_pending') throw new Error('unexpected pending refusal');
    expect(await db.resolveDirectedOffer(REALM, row.id, 'accepted')).not.toBeNull();
    const escrow = await db.escrowInsertListing(
      {
        characterId: 21,
        level: 10,
        state: { questLog: [], questsDone: [], inventory: [] } as unknown as CharacterState,
        leaseNonce: 'nonce',
      },
      {
        realm: REALM,
        sellerAccount: 5,
        sellerCharacter: 21,
        sellerName: 'Selara',
        sellerWallet: 'wallet-seller',
        item: { itemId: 'crown_of_embers', count: 1 },
        itemId: 'crown_of_embers',
        quality: 'epic',
        params: {
          format: 'buy_now',
          directedBuyerAccount: 9,
          startCents: 5000,
          reserveCents: null,
          buyNowCents: 5000,
          durationHours: 12,
          offerNext: false,
        },
        endsAtMs: BASE_MS + 600_000,
        directedOfferId: row.id,
      },
    );
    if (!escrow.ok) throw new Error(`escrow refused: ${escrow.reason}`);
    clockMs = BASE_MS + 20_000;
    expect(await db.closeListingIfNoOpenSettlement(escrow.id, 'sold')).toBe(true);
    const within = await db.directedOffersForAccount(REALM, 9, clockMs + 1_000);
    expect(within.find((o) => o.id === row.id)?.listingResolution, 'the sale is observable').toBe(
      'sold',
    );
    const after = await db.directedOffersForAccount(
      REALM,
      9,
      clockMs + SETTLED_OFFER_GRACE_MS + 1_000,
    );
    expect(
      after.map((o) => o.id),
      'then it is history',
    ).not.toContain(row.id);
  });
});

describe('fidelity fixes: twin guard, signature order, cap clamp, copies', () => {
  const SAVE = {
    characterId: 1,
    level: 10,
    state: {} as CharacterState,
    leaseNonce: undefined,
  };
  function listingArgs(sellerAccount: number, wallet: string) {
    return {
      realm: REALM,
      sellerAccount,
      sellerCharacter: 1,
      sellerName: 'S',
      sellerWallet: wallet,
      item: { itemId: 'itm_test', count: 1 },
      itemId: 'itm_test',
      quality: 'epic',
      params: {
        format: 'buy_now' as const,
        directedBuyerAccount: null,
        startCents: 100,
        reserveCents: null,
        buyNowCents: 100,
        durationHours: 12,
        offerNext: false,
      },
      endsAtMs: BASE_MS + 3_600_000,
      directedOfferId: null,
    };
  }
  function bidArgs(listingId: number, account: number) {
    return {
      realm: REALM,
      listingId,
      account,
      characterId: account,
      characterName: `C${account}`,
      wallet: `w-${account}`,
      amountCents: 200,
      bondCents: 20,
      nowMs: BASE_MS,
      minNext: () => 0,
    };
  }

  it('the claim refuses a relinked wallet twin like the Pg NOT EXISTS', async () => {
    const db = new FakeWocMarketDb({ characters: [], now: () => BASE_MS });
    const out = await db.escrowInsertListing(SAVE, listingArgs(1, 'twin-wallet'));
    if (!out.ok) throw new Error(out.reason);
    db.walletLinks.set(2, 'twin-wallet');
    expect(await db.claimBuyNowLock(REALM, out.id, 2, BASE_MS, BASE_MS + 300_000)).toBe(
      'own_listing',
    );
    db.walletLinks.set(2, 'other-wallet');
    const claimed = await db.claimBuyNowLock(REALM, out.id, 2, BASE_MS, BASE_MS + 300_000);
    expect(typeof claimed === 'object' && 'id' in claimed).toBe(true);
  });

  it('a dead bid answers not_pending even when its signature is spent elsewhere (the Pg order)', async () => {
    const db = new FakeWocMarketDb({ characters: [], now: () => BASE_MS });
    const listing = await db.escrowInsertListing(SAVE, listingArgs(1, 'w-order'));
    if (!listing.ok) throw new Error(listing.reason);
    const first = await db.insertPendingBid(bidArgs(listing.id, 2));
    const second = await db.insertPendingBid(bidArgs(listing.id, 3));
    const third = await db.insertPendingBid(bidArgs(listing.id, 4));
    if (!first.ok || !second.ok || !third.ok) throw new Error('fixture bids refused');
    expect(await db.submitBondSignature(first.bid.id, 'shared-sig', BASE_MS)).toMatchObject({
      signatureAtMs: BASE_MS,
    });
    expect(await db.abandonPendingBid(REALM, second.bid.id, 3)).toBe(true);
    expect(
      await db.submitBondSignature(second.bid.id, 'shared-sig', BASE_MS),
      'the guarded UPDATE misses first; the unique index is never consulted',
    ).toBe('not_pending');
    expect(await db.submitBondSignature(third.bid.id, 'shared-sig', BASE_MS)).toBe(
      'signature_reused',
    );
  });

  it('the readout cap fails closed to 1 and reads hand back copies', async () => {
    const db = new FakeWocMarketDb({ characters: [], now: () => BASE_MS });
    expect(await db.claimCustodyRef(REALM, 'cap-a')).toBe(true);
    expect(await db.claimCustodyRef(REALM, 'cap-b')).toBe(true);
    const out = await db.stuckCustodyReadout(REALM, BASE_MS + 1, 10, 0, BASE_MS + 1);
    expect(out.unbookedClaims).toMatchObject({ count: 1, saturated: true });
    const offer = await db.insertDirectedOffer({
      realm: REALM,
      sellerAccount: 1,
      sellerCharacter: 1,
      sellerName: 'S',
      buyerAccount: 2,
      buyerName: 'B',
      usdCents: 100,
      expiresAtMs: BASE_MS + 60_000,
      itemId: 'itm_test',
      itemPin: 'p',
    });
    expect(offer).not.toBe('offer_pending');
    if (offer !== 'offer_pending') {
      const read = await db.directedOfferById(REALM, offer.id);
      if (read) read.status = 'declined' as typeof read.status;
      expect((await db.directedOfferById(REALM, offer.id))?.status).toBe('pending');
    }
  });
});
