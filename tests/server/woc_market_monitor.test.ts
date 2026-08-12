// The stuck-custody monitor (server/woc_market_monitor.ts): the consumer of
// the marketplace's "visible and stuck" failure direction. These tests pin
// the cached-read cost model (one refresh per TTL window, shared by every
// caller), the cutoff math the db read receives, and the only-when-stuck log
// contract.

import { describe, expect, it, vi } from 'vitest';
import type { WocStuckCustodyReadout } from '../../server/woc_market';
import { createWocMarketMonitor, WOC_MONITOR_COUNT_CAP } from '../../server/woc_market_monitor';

const emptyReadout = (): WocStuckCustodyReadout => ({
  unbookedClaims: { count: 0, sample: [] },
  stuckDelivering: { count: 0, sample: [] },
  undisposedListings: { count: 0, sample: [] },
});

describe('woc market stuck-custody monitor', () => {
  it('serves every caller through ONE cached refresh per TTL window', async () => {
    let calls = 0;
    let clock = 1_000_000;
    const monitor = createWocMarketMonitor({
      db: {
        stuckCustodyReadout: async () => {
          calls++;
          return emptyReadout();
        },
      },
      realm: 'r',
      log: () => {},
      now: () => clock,
      ttlMs: 30_000,
    });
    await Promise.all([monitor.read(), monitor.read(), monitor.read()]);
    expect(calls, 'concurrent misses collapse into one flight').toBe(1);
    clock += 29_999;
    await monitor.read();
    expect(calls, 'inside the TTL the installed value serves').toBe(1);
    clock += 2;
    await monitor.read();
    expect(calls, 'past the TTL exactly one refresh runs').toBe(2);
  });

  it('passes the realm, the stuck-age cutoff, the sample cap and the count cap', async () => {
    let seen: {
      realm: string;
      olderThanMs: number;
      limit: number;
      countCap: number;
    } | null = null;
    const clock = 5_000_000;
    const monitor = createWocMarketMonitor({
      db: {
        stuckCustodyReadout: async (realm, olderThanMs, limit, countCap) => {
          seen = { realm, olderThanMs, limit, countCap };
          return emptyReadout();
        },
      },
      realm: 'the-realm',
      log: () => {},
      now: () => clock,
      stuckAgeMs: 600_000,
      sampleLimit: 7,
    });
    await monitor.read();
    expect(seen).toEqual({
      realm: 'the-realm',
      olderThanMs: clock - 600_000,
      limit: 7,
      countCap: WOC_MONITOR_COUNT_CAP,
    });
  });

  it('hands out a FROZEN readout: one consumer cannot corrupt the shared value', async () => {
    const readout = emptyReadout();
    readout.unbookedClaims = {
      count: 1,
      sample: [{ custodyRef: 'r', claimedAtMs: 1, grantCharacterId: null, mailIntent: false }],
    };
    const monitor = createWocMarketMonitor({
      db: { stuckCustodyReadout: async () => structuredClone(readout) },
      realm: 'r',
      log: () => {},
      now: () => 0,
    });
    const served = await monitor.read();
    expect(Object.isFrozen(served)).toBe(true);
    expect(Object.isFrozen(served.unbookedClaims.sample)).toBe(true);
    expect(Object.isFrozen(served.unbookedClaims.sample[0])).toBe(true);
  });

  it('logs ONLY when something is stuck, one line with the three counts', async () => {
    const lines: string[] = [];
    let readout = emptyReadout();
    let clock = 0;
    const monitor = createWocMarketMonitor({
      db: { stuckCustodyReadout: async () => structuredClone(readout) },
      realm: 'r',
      log: (line) => lines.push(line),
      now: () => clock,
      ttlMs: 5,
    });
    await monitor.logTick();
    expect(lines, 'a healthy marketplace stays silent').toHaveLength(0);
    readout = emptyReadout();
    readout.stuckDelivering = { count: 2, sample: [] };
    readout.unbookedClaims = { count: 1, sample: [] };
    clock += 10;
    await monitor.logTick();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[woc_market] stuck custody');
    expect(lines[0]).toContain('"unbookedClaims":1');
    expect(lines[0]).toContain('"stuckDelivering":2');
    expect(lines[0]).toContain('"undisposedListings":0');
  });

  it('logs on each stuck class ALONE: every predicate arm carries the line', async () => {
    // One case per class on purpose: a combined fixture would keep this green
    // with an arm deleted from the stuck predicate.
    for (const cls of ['unbookedClaims', 'stuckDelivering', 'undisposedListings'] as const) {
      const lines: string[] = [];
      const readout = emptyReadout();
      readout[cls] = { count: 3, sample: [] };
      const monitor = createWocMarketMonitor({
        db: { stuckCustodyReadout: async () => structuredClone(readout) },
        realm: 'r',
        log: (line) => lines.push(line),
        now: () => 0,
      });
      await monitor.logTick();
      expect(lines, cls).toHaveLength(1);
      expect(lines[0], cls).toContain(`"${cls}":3`);
    }
  });

  it('warns once per failure streak, even from a cold cache, then recovers', async () => {
    // The cached read's own stale-serve warning needs a first success; a
    // monitor failing from boot (migration lag, revoked grant) must still say
    // so ONCE, not flood, and must recover silently.
    const lines: string[] = [];
    let fail = true;
    let clock = 0;
    const stuck = emptyReadout();
    stuck.unbookedClaims = { count: 1, sample: [] };
    const monitor = createWocMarketMonitor({
      db: {
        stuckCustodyReadout: async () => {
          if (fail) throw new Error('db down');
          return structuredClone(stuck);
        },
      },
      realm: 'r',
      log: (line) => lines.push(line),
      now: () => clock,
      ttlMs: 5,
    });
    await expect(monitor.logTick()).resolves.toBeUndefined();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('stuck custody readout failing');
    clock += 10;
    await monitor.logTick();
    expect(lines, 'the streak warns once').toHaveLength(1);
    fail = false;
    clock += 10;
    await monitor.logTick();
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"unbookedClaims":1');
  });

  it('start is idempotent and stop really clears the beat', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const monitor = createWocMarketMonitor({
        db: {
          stuckCustodyReadout: async () => {
            calls++;
            return emptyReadout();
          },
        },
        realm: 'r',
        log: () => {},
        ttlMs: 1,
        logIntervalMs: 1000,
      });
      monitor.start();
      monitor.start();
      await vi.advanceTimersByTimeAsync(3000);
      expect(calls, 'one beat per interval, not two').toBe(3);
      monitor.stop();
      await vi.advanceTimersByTimeAsync(3000);
      expect(calls, 'no beats after stop').toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
