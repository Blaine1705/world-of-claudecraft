// The $WOC Exchange sweep shell (server/woc_market_sweep.ts): the timing and
// locking wrapper around WocMarketService.sweepPass. Modeled on
// tests/retention_sweep.test.ts, which pins the sibling sweep's identical
// hazards.
//
// Why the lock-key pin matters: a key that collides with the boot-DDL lock
// (0x57_4f_43_01) or the retention lock (0x57_4f_43_02) makes this realm's
// sweep lose the try-lock on every pass, forever and silently. Auctions would
// never close, settlement windows never expire, and escrowed items never fly
// home, all while the process looks healthy. The module claims distinctness in
// prose; this asserts it.

import { describe, expect, it, vi } from 'vitest';
import { RETENTION_SWEEP_ADVISORY_LOCK_KEY } from '../server/retention_sweep';
import {
  createWocMarketSweep,
  WOC_MARKET_SWEEP_ADVISORY_LOCK_KEY,
  WOC_MARKET_SWEEP_POLL_MS,
  type WocMarketSweepLockClient,
} from '../server/woc_market_sweep';

const REALM = 'Claudemoon';

interface FakeClient extends WocMarketSweepLockClient {
  queries: { sql: string; params: unknown[] }[];
  releases: (boolean | undefined)[];
}

function fakeClient(
  opts: { lockOk?: boolean; lockThrows?: boolean; unlockThrows?: boolean } = {},
): FakeClient {
  const queries: { sql: string; params: unknown[] }[] = [];
  const releases: (boolean | undefined)[] = [];
  return {
    queries,
    releases,
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) {
        if (opts.lockThrows) throw new Error('lock query failed');
        return { rows: [{ ok: opts.lockOk !== false }] };
      }
      if (sql.includes('pg_advisory_unlock')) {
        if (opts.unlockThrows) throw new Error('unlock query failed');
        return { rows: [{}] };
      }
      return { rows: [] };
    },
    release(destroy?: boolean) {
      releases.push(destroy);
    },
  };
}

describe('the advisory lock key', () => {
  it('is the literal WOC\\x03 key and collides with neither sibling lock', () => {
    // Pinned to the literal, not to itself: the whole point is that these three
    // numbers stay different, so a self-comparison would prove nothing.
    expect(WOC_MARKET_SWEEP_ADVISORY_LOCK_KEY).toBe(0x57_4f_43_03);
    // The retention key is EXPORTED, so compare the live symbol: a hand copy
    // would stay green if retention itself moved onto 0x57_4f_43_03, which is
    // the exact collision this test exists to prevent.
    expect(WOC_MARKET_SWEEP_ADVISORY_LOCK_KEY).not.toBe(RETENTION_SWEEP_ADVISORY_LOCK_KEY);
    expect(RETENTION_SWEEP_ADVISORY_LOCK_KEY).toBe(0x57_4f_43_02);
    // db.ts's boot-DDL key is module-private, so that literal is unavoidable.
    expect(WOC_MARKET_SWEEP_ADVISORY_LOCK_KEY).not.toBe(0x57_4f_43_01);
  });

  it('polls on a seconds-scale cadence (auction ends are minute-scale deadlines)', () => {
    expect(WOC_MARKET_SWEEP_POLL_MS).toBe(5_000);
  });
});

describe('one guarded pass', () => {
  it('takes the per-realm lock, runs the pass, then unlocks and pools the client', async () => {
    const client = fakeClient();
    const pass = vi.fn(async () => {});
    const sweep = createWocMarketSweep({
      realm: REALM,
      connect: async () => client,
      pass,
      onError: () => {},
    });
    await sweep.runOnce();
    expect(pass).toHaveBeenCalledTimes(1);
    expect(client.queries[0].sql).toContain('pg_try_advisory_lock');
    // Both lock statements carry the key AND the realm, so two realms never
    // serialize against each other.
    expect(client.queries[0].params).toEqual([WOC_MARKET_SWEEP_ADVISORY_LOCK_KEY, REALM]);
    expect(client.queries[1].sql).toContain('pg_advisory_unlock');
    expect(client.queries[1].params).toEqual([WOC_MARKET_SWEEP_ADVISORY_LOCK_KEY, REALM]);
    // Healthy pass: the client goes back to the pool, never destroyed.
    expect(client.releases).toEqual([undefined]);
  });

  it('skips the pass entirely when a peer holds the realm lock', async () => {
    const client = fakeClient({ lockOk: false });
    const pass = vi.fn(async () => {});
    const sweep = createWocMarketSweep({
      realm: REALM,
      connect: async () => client,
      pass,
      onError: () => {},
    });
    await sweep.runOnce();
    expect(pass).not.toHaveBeenCalled();
    // No unlock: this process never held the lock.
    expect(client.queries.map((q) => q.sql).join()).not.toContain('pg_advisory_unlock');
    expect(client.releases).toEqual([undefined]);
  });

  it('still unlocks and releases when the pass throws, and reports the error', async () => {
    const client = fakeClient();
    const onError = vi.fn();
    const boom = new Error('pass exploded');
    const sweep = createWocMarketSweep({
      realm: REALM,
      connect: async () => client,
      pass: async () => {
        throw boom;
      },
      onError,
    });
    await sweep.runOnce();
    // A thrown pass must not leak the lock: the next pass has to be able to
    // take it, or this realm's sweep is dead until the connection dies.
    expect(client.queries[1].sql).toContain('pg_advisory_unlock');
    expect(client.releases).toEqual([undefined]);
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('DESTROYS the client when the lock query itself fails', async () => {
    const client = fakeClient({ lockThrows: true });
    const onError = vi.fn();
    const sweep = createWocMarketSweep({
      realm: REALM,
      connect: async () => client,
      pass: async () => {},
      onError,
    });
    await sweep.runOnce();
    // The lock state on this connection is unknown, so pooling it could park a
    // held lock in the pool for hours and wedge every future pass.
    expect(client.releases).toEqual([true]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('DESTROYS the client when the unlock query fails', async () => {
    const client = fakeClient({ unlockThrows: true });
    const pass = vi.fn(async () => {});
    const sweep = createWocMarketSweep({
      realm: REALM,
      connect: async () => client,
      pass,
      onError: () => {},
    });
    await sweep.runOnce();
    expect(pass).toHaveBeenCalledTimes(1);
    // The pass succeeded but the lock may still be held: same hazard, same fix.
    expect(client.releases).toEqual([true]);
  });
});

describe('re-entrancy and shutdown', () => {
  it('never overlaps passes: a runOnce during an in-flight pass is a no-op', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Counted on CONNECT, not on pass: the guard rejects the second call the
    // moment the first is in flight, which is before the first has awaited its
    // way to pass(). Asserting on pass would race the pass's own startup.
    let connects = 0;
    const pass = vi.fn(async () => {
      await gate;
    });
    const sweep = createWocMarketSweep({
      realm: REALM,
      connect: async () => {
        connects++;
        return fakeClient();
      },
      pass,
      onError: () => {},
    });
    const first = sweep.runOnce();
    await sweep.runOnce(); // lands while the first pass is still in flight
    expect(connects).toBe(1);
    release();
    await first;
    // And the rejected call never queued: no second pass runs on drain.
    expect(connects).toBe(1);
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it('stop() awaits the in-flight pass and refuses every later one', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let finished = false;
    const pass = vi.fn(async () => {
      await gate;
      finished = true;
    });
    const sweep = createWocMarketSweep({
      realm: REALM,
      connect: async () => fakeClient(),
      pass,
      onError: () => {},
    });
    const first = sweep.runOnce();
    const stopping = sweep.stop();
    release();
    await stopping;
    // stop() must not resolve before the pass it is draining: the pool closes
    // right after it in main.ts's shutdown.
    expect(finished).toBe(true);
    await first;
    await sweep.runOnce();
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it('start() arms an unref-ed timer and stop() clears it', async () => {
    const sweep = createWocMarketSweep({
      realm: REALM,
      connect: async () => fakeClient(),
      pass: async () => {},
      onError: () => {},
      pollMs: 50,
    });
    const spy = vi.spyOn(globalThis, 'setInterval');
    sweep.start();
    expect(spy).toHaveBeenCalledTimes(1);
    // hasRef(), not typeof unref: every Node Timeout HAS an unref method
    // whether or not anyone called it, so the old assertion stayed green with
    // the unref deleted and the interval holding the process open through
    // every shutdown.
    const handle = spy.mock.results[0].value as NodeJS.Timeout;
    expect(handle.hasRef()).toBe(false);
    sweep.start(); // idempotent
    expect(spy).toHaveBeenCalledTimes(1);
    await sweep.stop();
    spy.mockRestore();
  });
});
