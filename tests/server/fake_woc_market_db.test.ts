// Fidelity pins on FakeWocMarketDb where a divergence from the real Pg
// queries would let a service test pass against the fake and fail against
// Postgres. The SQL half lives in tests/server/woc_market_directed_sql.test.ts
// and the live half in tests/woc_market_directed_pg_integration.test.ts; this
// file pins the FAKE to the same contracts.
import { describe, expect, it } from 'vitest';
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
