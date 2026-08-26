// Opt-in PostgreSQL planner proof for the admin large-gold reader. The mocked
// SQL-shape suite proves the literal and parameter list; only PostgreSQL can
// prove that a generic prepared plan actually selects the matching partial
// index. Set TEST_DATABASE_URL to run it. Without that variable this file
// skips cleanly.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BANK_LEDGER_ACCOUNT_FK_INDEX_SQL,
  BANK_LEDGER_ACCOUNT_LARGE_INDEX_SQL,
} from '../server/bank_ledger_indexes';

const DB_URL = process.env.TEST_DATABASE_URL ?? '';
const describeDb = DB_URL === '' ? describe.skip : describe;
const SCHEMA = 'account_wealth_planner_pg_test';

describeDb('account wealth large-movement planner (real PostgreSQL)', () => {
  let pool: import('pg').Pool;

  beforeAll(async () => {
    const { Pool } = await import('pg');
    const admin = new Pool({ connectionString: DB_URL, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();

    pool = new Pool({
      connectionString: DB_URL,
      max: 1,
      options: `-c search_path=${SCHEMA}`,
    });
    await pool.query(`CREATE TABLE characters (
      id INT PRIMARY KEY,
      name TEXT NOT NULL
    )`);
    await pool.query(`CREATE TABLE bank_ledger (
      id BIGSERIAL PRIMARY KEY,
      account_id INT NOT NULL,
      character_id INT NOT NULL,
      op TEXT NOT NULL,
      container TEXT NOT NULL,
      copper_delta BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(
      `INSERT INTO characters (id, name)
       SELECT g, 'Character ' || g FROM generate_series(1, 5) AS g`,
    );
    await pool.query(
      `INSERT INTO bank_ledger
         (account_id, character_id, op, container, copper_delta)
       SELECT (g % 5) + 1,
              (g % 5) + 1,
              'deposit_gold',
              'personal',
              CASE WHEN g % 100 = 0 THEN 100000 ELSE 1 END
         FROM generate_series(1, 10000) AS g`,
    );
    // Phase-one rollout competitor: old binaries and FK cascades keep using
    // this broad ordered index until the next release's compact replacement.
    await pool.query('CREATE INDEX bank_ledger_account_recent ON bank_ledger(account_id, id DESC)');
    await pool.query(BANK_LEDGER_ACCOUNT_LARGE_INDEX_SQL);
    await pool.query('ANALYZE bank_ledger');
  }, 30_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.end();
    const { Pool } = await import('pg');
    const admin = new Pool({ connectionString: DB_URL, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  it('uses the partial account index under a forced generic prepared plan', async () => {
    await pool.query(`SET plan_cache_mode = force_generic_plan`);
    await pool.query('SET enable_seqscan = off');
    await pool.query('SET enable_bitmapscan = off');
    await pool.query(`PREPARE account_large_movements(int, int) AS
      SELECT l.id, l.character_id, c.name, l.op, l.container,
             l.copper_delta, l.created_at
        FROM bank_ledger l
        LEFT JOIN characters c ON c.id = l.character_id
       WHERE l.account_id = $1 AND abs(copper_delta) >= 100000
       ORDER BY l.id DESC
       LIMIT $2`);
    try {
      const explained = await pool.query(
        'EXPLAIN (COSTS OFF) EXECUTE account_large_movements(1, 25)',
      );
      const plan = explained.rows
        .map((row: { 'QUERY PLAN': string }) => row['QUERY PLAN'])
        .join('\n');
      expect(plan).toContain('bank_ledger_account_large_recent');
    } finally {
      await pool.query('DEALLOCATE account_large_movements');
    }
  });

  it('keeps an unqualified account index for full FK cascade lookups', async () => {
    // Phase-two DDL executes independently before its catalog shape is pinned.
    await pool.query(BANK_LEDGER_ACCOUNT_FK_INDEX_SQL);
    const index = await pool.query(
      `SELECT i.indisvalid, i.indpred IS NULL AS full_index
         FROM pg_index i
        WHERE i.indexrelid = to_regclass('bank_ledger_account_fk')`,
    );
    expect(index.rows).toEqual([{ indisvalid: true, full_index: true }]);
  });
});
