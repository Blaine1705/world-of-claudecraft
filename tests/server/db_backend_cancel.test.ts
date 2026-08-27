import { beforeEach, describe, expect, it, vi } from 'vitest';

// The module builds its Pool lazily through a dynamic import of ./db, so stub
// both: pg with a constructor spy, and db with just the connection string.
const rig = vi.hoisted(() => ({
  pools: [] as Array<{
    options: Record<string, unknown>;
    query: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  }>,
  queryImpl: vi.fn(async () => ({ rows: [] })),
}));
vi.mock('pg', () => ({
  Pool: function Pool(options: Record<string, unknown>) {
    const pool = {
      options,
      query: vi.fn((...args: unknown[]) => rig.queryImpl(...(args as []))),
      end: vi.fn(async () => {}),
      on: vi.fn(),
    };
    rig.pools.push(pool);
    return pool;
  },
}));
vi.mock('../../server/db', () => ({ DATABASE_URL: 'postgres://cancel-test/db' }));

import {
  cancelDetachedBackend,
  closeBackendCancelPool,
  DB_CANCEL_POOL_CONNECT_TIMEOUT_MS,
  DB_CANCEL_QUERY_TIMEOUT_MS,
  DB_CANCEL_STATEMENT_TIMEOUT_MS,
  getBackendCancelCounts,
} from '../../server/db_backend_cancel';

describe('the dedicated deadline-cancel side pool', () => {
  beforeEach(() => {
    rig.queryImpl.mockReset();
    rig.queryImpl.mockResolvedValue({ rows: [] });
  });

  it('constructs ONE max-1 sub-second pool even under two same-tick first cancels', async () => {
    // Deadline expiries cluster at exactly the saturation moment that
    // produces them, so the double-first-cancel shape is the expected case,
    // not a rare one: a resolved-value memo would let both construct a Pool
    // across the dynamic-import await and orphan one outside teardown.
    const before = rig.pools.length;
    await Promise.all([cancelDetachedBackend(41), cancelDetachedBackend(42)]);
    expect(rig.pools.length).toBe(before + 1);
    const pool = rig.pools[rig.pools.length - 1];
    // The pool must never ride the main pool's budget or bounds: max 1 and
    // sub-second everything, so a cancel that cannot run promptly is dropped
    // rather than queued behind login checkouts.
    expect(pool.options).toMatchObject({
      connectionString: 'postgres://cancel-test/db',
      max: 1,
      connectionTimeoutMillis: DB_CANCEL_POOL_CONNECT_TIMEOUT_MS,
      statement_timeout: DB_CANCEL_STATEMENT_TIMEOUT_MS,
      query_timeout: DB_CANCEL_QUERY_TIMEOUT_MS,
    });
    expect(DB_CANCEL_POOL_CONNECT_TIMEOUT_MS).toBe(500);
    expect(DB_CANCEL_STATEMENT_TIMEOUT_MS).toBe(750);
    expect(DB_CANCEL_QUERY_TIMEOUT_MS).toBe(1_000);
    // Both cancels went through pg_cancel_backend on the ACTIVE-state guard.
    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toContain('pg_cancel_backend');
    expect(pool.query.mock.calls[0][0]).toContain("state = 'active'");
    expect(pool.query.mock.calls[0][1]).toEqual([41]);
  });

  it('counts requests and failures, rethrowing so the deadline owner can swallow', async () => {
    const start = getBackendCancelCounts();
    await cancelDetachedBackend(7);
    expect(getBackendCancelCounts()).toEqual({
      requested: start.requested + 1,
      failed: start.failed,
    });
    rig.queryImpl.mockRejectedValueOnce(new Error('cancel pool saturated'));
    await expect(cancelDetachedBackend(8)).rejects.toThrow('cancel pool saturated');
    expect(getBackendCancelCounts()).toEqual({
      requested: start.requested + 2,
      failed: start.failed + 1,
    });
  });

  it('closeBackendCancelPool ends the one constructed pool', async () => {
    await cancelDetachedBackend(9);
    const pool = rig.pools[rig.pools.length - 1];
    await closeBackendCancelPool();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
