// The stuck-custody monitor (server/woc_market_monitor.ts): the consumer of
// the marketplace's "visible and stuck" failure direction. These tests pin
// the cached-read cost model (one refresh per TTL window, shared by every
// caller), the cutoff math the db read receives, and the only-when-stuck log
// contract.

import { describe, expect, it } from 'vitest';
import type { WocStuckCustodyReadout } from '../../server/woc_market';
import { createWocMarketMonitor } from '../../server/woc_market_monitor';

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

  it('passes the realm, the stuck-age cutoff, and the sample cap to the db read', async () => {
    let seen: { realm: string; olderThanMs: number; limit: number } | null = null;
    const clock = 5_000_000;
    const monitor = createWocMarketMonitor({
      db: {
        stuckCustodyReadout: async (realm, olderThanMs, limit) => {
          seen = { realm, olderThanMs, limit };
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
    expect(seen).toEqual({ realm: 'the-realm', olderThanMs: clock - 600_000, limit: 7 });
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

  it('logs on an undisposed-listings backlog alone', async () => {
    const lines: string[] = [];
    const readout = emptyReadout();
    readout.undisposedListings = { count: 3, sample: [] };
    const monitor = createWocMarketMonitor({
      db: { stuckCustodyReadout: async () => structuredClone(readout) },
      realm: 'r',
      log: (line) => lines.push(line),
      now: () => 0,
    });
    await monitor.logTick();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"undisposedListings":3');
  });

  it('stays quiet on a cold-cache read failure; the next beat retries', async () => {
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
    expect(lines).toHaveLength(0);
    fail = false;
    clock += 10;
    await monitor.logTick();
    expect(lines).toHaveLength(1);
  });
});
