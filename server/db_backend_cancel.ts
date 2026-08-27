// The dedicated deadline-cancel side pool. Deadline-expiry backend cancels
// must NOT ride the main pool they exist to relieve: a cancel fires at the
// exact moment (deadline expiry) that signals pool or lock saturation, so
// through the main pool it could queue behind login checkouts and pin a
// client for up to the full statement timeout. A max-1 side pool with
// sub-second bounds decouples it: idle it holds zero connections (the
// driver's idle timeout releases its one client), and a cancel that cannot
// connect or run inside its budget is dropped, best-effort by contract (the
// caller-installed statement_timeout stays the backstop). The transient
// extra connection is in DEPLOY.md's budget arithmetic; the counters export
// as woc_db_backend_cancels.
//
// The pool is created LAZILY on the first cancel: this module and db.ts
// import each other (db.ts wires the hook, this module needs DATABASE_URL),
// and a module-scope Pool would read DATABASE_URL out of a half-evaluated
// db.ts during a circular import. By the first deadline expiry, db.ts is
// long since evaluated.

import { Pool } from 'pg';
import { backendCancelViaPool } from './db_transaction_deadline';

export const DB_CANCEL_POOL_CONNECT_TIMEOUT_MS = 500;
export const DB_CANCEL_STATEMENT_TIMEOUT_MS = 750;
export const DB_CANCEL_QUERY_TIMEOUT_MS = 1_000;

let cancelPool: Pool | null = null;

async function ensureCancelPool(): Promise<Pool> {
  if (cancelPool) return cancelPool;
  const { DATABASE_URL } = await import('./db');
  cancelPool = new Pool({
    connectionString: DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: DB_CANCEL_POOL_CONNECT_TIMEOUT_MS,
    statement_timeout: DB_CANCEL_STATEMENT_TIMEOUT_MS,
    query_timeout: DB_CANCEL_QUERY_TIMEOUT_MS,
  });
  if (typeof cancelPool.on === 'function') {
    cancelPool.on('error', (err) => {
      console.error('pg cancel pool: idle client error (client discarded)', err);
    });
  }
  return cancelPool;
}

let backendCancelRequestCount = 0;
let backendCancelFailureCount = 0;

/** The one process-wide detached-backend canceller: counted, side-pool-backed,
 * best-effort. Every DbTransactionDeadline cancelBackend hook wires to this. */
export async function cancelDetachedBackend(processId: number): Promise<void> {
  backendCancelRequestCount++;
  try {
    await backendCancelViaPool(await ensureCancelPool())(processId);
  } catch (error) {
    backendCancelFailureCount++;
    throw error;
  }
}

/** Lifetime detached-backend cancel attempts and failures (metrics + tests). */
export function getBackendCancelCounts(): { requested: number; failed: number } {
  return { requested: backendCancelRequestCount, failed: backendCancelFailureCount };
}

/** Shutdown teardown for the cancel side pool (main.ts, beside pool.end()). */
export async function closeBackendCancelPool(): Promise<void> {
  if (cancelPool) await cancelPool.end();
}
