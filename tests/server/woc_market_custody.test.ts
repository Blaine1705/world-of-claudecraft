// The $WOC Exchange custody bridge (server/woc_market_custody.ts): the ONE
// place marketplace code touches the live Sim. Driven against a REAL Sim with a
// fake GameServer host, because the thing worth pinning here is precisely what a
// fake PostOffice would paper over.
//
// Why this file exists: persistMailParcel used to DISCARD the boolean
// mailSystemParcel returns. The escrowed copy is already gone from the seller's
// bags by the time a parcel is booked, so a refused parcel that reports success
// let bookCustodyOnce mark the custody ref booked and advance the settlement to
// 'delivered' against a letter carrying nothing: a silently destroyed item, with
// every test green. The refusal now throws, which lands in the caller's existing
// failure path (release the claim, retry on a later sweep pass).

process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_woc_market_custody';

import { describe, expect, it } from 'vitest';
import { createWocMarketCustody, type WocCustodyGameHost } from '../../server/woc_market_custody';
import { Sim } from '../../src/sim/sim';
import type { InvSlot } from '../../src/sim/types';

const RECIPIENT = { key: '4242', name: 'Buyer' };
const REF = 'settlement:9';

/** A host over a real Sim: no live session (deliveries never need one) and a
 *  persist hook whose calls are counted so "did it try to persist" is decidable. */
function makeHost(over: Partial<WocCustodyGameHost> = {}): {
  host: WocCustodyGameHost;
  persists: () => number;
} {
  let persists = 0;
  const host: WocCustodyGameHost = {
    sim: new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true }),
    wocCustodySession: () => null,
    persistMailBlob: async () => {
      persists++;
    },
    ...over,
  };
  return { host, persists: () => persists };
}

const GOOD: InvSlot = { itemId: 'rusty_hatchet', count: 1 };
const UNKNOWN: InvSlot = { itemId: 'no_such_item_id', count: 1 };

describe('persistMailParcel propagates a refused parcel', () => {
  it('throws, and does NOT persist, when no offered slot survives validation', async () => {
    const { host, persists } = makeHost();
    const custody = createWocMarketCustody(host);
    await expect(custody.persistMailParcel(RECIPIENT, 'delivery', [UNKNOWN], REF)).rejects.toThrow(
      /refused/,
    );
    // Persisting a blob that holds no parcel is the step that would make the
    // loss durable, so the throw has to come first.
    expect(persists()).toBe(0);
    expect(host.sim.postOffice.mail).toHaveLength(0);
  });

  it('names the custody ref in the error so the stuck row is findable in a log', async () => {
    const { host } = makeHost();
    const custody = createWocMarketCustody(host);
    await expect(
      custody.persistMailParcel(RECIPIENT, 'delivery', [UNKNOWN], 'settlement:777'),
    ).rejects.toThrow(/settlement:777/);
  });

  it('books and persists exactly once on the happy path', async () => {
    const { host, persists } = makeHost();
    const custody = createWocMarketCustody(host);
    await custody.persistMailParcel(RECIPIENT, 'delivery', [GOOD], REF);
    expect(persists()).toBe(1);
    expect(host.sim.postOffice.mail).toHaveLength(1);
    expect(host.sim.postOffice.mail[0].items.map((s) => s.itemId)).toEqual(['rusty_hatchet']);
    expect(host.sim.postOffice.mail[0].custodyRef).toBe(REF);
  });

  it('resolves on the SECOND call for the same ref without booking twice', async () => {
    // The book-once dedupe answers "already booked" as success, which must not
    // be confused with the refusal above: a retry after a crash has to be able
    // to complete rather than throwing forever.
    const { host, persists } = makeHost();
    const custody = createWocMarketCustody(host);
    await custody.persistMailParcel(RECIPIENT, 'delivery', [GOOD], REF);
    await custody.persistMailParcel(RECIPIENT, 'delivery', [GOOD], REF);
    expect(host.sim.postOffice.mail).toHaveLength(1);
    expect(persists()).toBe(2);
  });

  it('propagates a persist failure too, so nothing advances on a dead blob write', async () => {
    const { host } = makeHost({
      persistMailBlob: async () => {
        throw new Error('db down');
      },
    });
    const custody = createWocMarketCustody(host);
    await expect(custody.persistMailParcel(RECIPIENT, 'delivery', [GOOD], REF)).rejects.toThrow(
      'db down',
    );
  });

  it('carries a goods-free notice through, which legitimately attaches nothing', async () => {
    // The sold_notice arm passes no items on purpose. "Nothing booked" must not
    // read as a refusal when nothing was offered, or every sale notice throws.
    const { host, persists } = makeHost();
    const custody = createWocMarketCustody(host);
    await custody.persistMailParcel(RECIPIENT, 'sold_notice', [], 'sold:9');
    expect(persists()).toBe(1);
    expect(host.sim.postOffice.mail).toHaveLength(1);
    expect(host.sim.postOffice.mail[0].items).toEqual([]);
  });
});

describe('extractCopy requires the seller live in this realm process', () => {
  it('refuses offline rather than touching a saved blob', () => {
    const { host } = makeHost();
    const custody = createWocMarketCustody(host);
    expect(custody.extractCopy(1, 2, { index: 0, itemId: 'rusty_hatchet' })).toEqual({
      ok: false,
      reason: 'offline',
    });
  });

  it('refuses not_yours when the live character belongs to another account', () => {
    // The account check happens BEFORE any bag mutation: a mismatched pair must
    // never reach extractTradableCopy.
    const { host } = makeHost({
      wocCustodySession: () => ({
        pid: 1,
        accountId: 99,
        name: 'Someone',
        leaseNonce: 'nonce',
      }),
    });
    const custody = createWocMarketCustody(host);
    expect(custody.extractCopy(7, 2, { index: 0, itemId: 'rusty_hatchet' })).toEqual({
      ok: false,
      reason: 'not_yours',
    });
  });
});
