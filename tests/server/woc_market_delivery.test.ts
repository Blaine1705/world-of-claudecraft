// Direct-rig pins for the extracted delivery arms
// (server/woc_market_delivery.ts) where the service suites cannot reach the
// behavior decisively: the stamp-ledger high-water (the maps hold
// exactly-once intents nothing may drop, so the bound is a counted,
// re-arming warn rather than a cap). The park-cap arithmetic lives in
// tests/server/woc_market_local_ledgers.test.ts; the flow behavior rides the
// service and escrow-queue suites.
import { describe, expect, it, vi } from 'vitest';
import type { WocListingRow, WocSweepErrorTag } from '../../server/woc_market';
import {
  createWocMarketDeliveryArms,
  type WocDeliveryCtx,
  wocStampHighWaterCount,
} from '../../server/woc_market_delivery';
import { WOC_LOCAL_STAMP_HIGH_WATER } from '../../server/woc_market_local_ledgers';

/** A minimal ctx whose mail persist FAILS after the intent stamp, so every
 *  drive adds one retained pendingMail entry (the stamp survives a persist
 *  failure by design: it is the resume evidence). */
function makeCtx(): { ctx: WocDeliveryCtx; sweepErrors: [WocSweepErrorTag, unknown][] } {
  const sweepErrors: [WocSweepErrorTag, unknown][] = [];
  const ctx = {
    db: {
      deliveryTarget: async () => ({ characterId: 21, name: 'Aldan' }),
      claimCustodyRef: async () => true,
      markCustodyMailIntent: async () => true,
      markCustodyRefBooked: async () => {},
      markItemDisposed: async () => {},
    },
    custody: {
      persistMailParcel: async () => {
        throw new Error('post office down');
      },
      hasParcel: () => false,
    },
    realm: 'test-realm',
    now: () => 1_000_000,
    sweepError: (arm: WocSweepErrorTag, err: unknown) => {
      sweepErrors.push([arm, err]);
    },
    pruneLocalLedgers: () => {},
    parkedDeliveries: new Map<number, number>(),
    parkedReturns: new Map<number, number>(),
    pendingGrants: new Map<
      string,
      { characterId: number; leaseNonce: string | undefined; stampMs: number }
    >(),
    pendingMail: new Map<string, { stampMs: number; written: boolean }>(),
    parkRetryMs: 60_000,
    sweepBatch: 25,
  } as unknown as WocDeliveryCtx;
  return { ctx, sweepErrors };
}

const listing = (id: number): WocListingRow =>
  ({
    id,
    sellerAccount: 4,
    sellerCharacter: 11,
    resolution: 'no_bids',
    item: { itemId: 'iron_sword', count: 1 },
  }) as unknown as WocListingRow;

describe('the stamp-ledger high-water (counted, re-arming, never shedding)', () => {
  it('warns once per crossing, counts it, and never drops an intent', async () => {
    const { ctx } = makeCtx();
    const arms = createWocMarketDeliveryArms(ctx);
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // One below the mark: the next stamp is the crossing.
      for (let i = 0; i < WOC_LOCAL_STAMP_HIGH_WATER - 1; i++) {
        ctx.pendingMail.set(`seed-${i}`, { stampMs: 1, written: true });
      }
      const before = wocStampHighWaterCount();
      await expect(arms.returnListingItem(listing(1))).rejects.toThrow('post office down');
      // The stamp SURVIVED the failed persist (grew, never shed), the
      // crossing warned exactly once, and the counter dates it.
      expect(ctx.pendingMail.size).toBe(WOC_LOCAL_STAMP_HIGH_WATER);
      expect(wocStampHighWaterCount()).toBe(before + 1);
      const highWaterWarns = () =>
        warns.mock.calls.filter((c) => String(c[0]).includes('intent ledger high water'));
      expect(highWaterWarns()).toHaveLength(1);
      // Above the mark, the latch holds: a second stamp is not a second line.
      await expect(arms.returnListingItem(listing(2))).rejects.toThrow('post office down');
      expect(ctx.pendingMail.size).toBe(WOC_LOCAL_STAMP_HIGH_WATER + 1);
      expect(wocStampHighWaterCount()).toBe(before + 1);
      expect(highWaterWarns()).toHaveLength(1);
      // Drain below the mark (the TTL prune's job in production), stamp
      // again: the latch re-armed and the NEXT crossing warns and counts.
      for (let i = 0; i < 10; i++) ctx.pendingMail.delete(`seed-${i}`);
      await expect(arms.returnListingItem(listing(3))).rejects.toThrow('post office down');
      expect(highWaterWarns()).toHaveLength(1);
      for (let i = 10; i < 10 + 12; i++) {
        ctx.pendingMail.set(`refill-${i}`, { stampMs: 1, written: true });
      }
      await expect(arms.returnListingItem(listing(4))).rejects.toThrow('post office down');
      expect(wocStampHighWaterCount()).toBe(before + 2);
      expect(highWaterWarns()).toHaveLength(2);
    } finally {
      warns.mockRestore();
    }
  });

  it('the total across BOTH stamp maps is what crosses the mark', async () => {
    // The review round: per-map comparison let 400 grants plus 400 mail
    // intents sit silent; the incident is entries HELD, wherever they sit.
    const { ctx } = makeCtx();
    const arms = createWocMarketDeliveryArms(ctx);
    const warns = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const half = Math.floor(WOC_LOCAL_STAMP_HIGH_WATER / 2);
      for (let i = 0; i < half; i++) {
        ctx.pendingGrants.set(`g-${i}`, { characterId: 1, leaseNonce: 'n', stampMs: 1 });
        ctx.pendingMail.set(`m-${i}`, { stampMs: 1, written: true });
      }
      const before = wocStampHighWaterCount();
      await expect(arms.returnListingItem(listing(9))).rejects.toThrow('post office down');
      expect(wocStampHighWaterCount()).toBe(before + 1);
      expect(
        warns.mock.calls.filter((c) => String(c[0]).includes('intent ledger high water')),
      ).toHaveLength(1);
    } finally {
      warns.mockRestore();
    }
  });
});
