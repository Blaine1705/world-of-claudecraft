// Bank Storage phase 11: the EXECUTED proof for storage_purchase_db.ts
// against a real PostgreSQL (the novel-SQL rule: a fake pool cannot tell
// whether SQL parses, whether ON CONFLICT actually converges, or whether a
// partial index is accepted). Gated on TEST_DATABASE_URL and therefore NOT
// CI coverage: the game repo's CI has NO postgres job today, so this suite
// skips green there and the executed proof is developer-local only (run it
// against the user-space PG16 harness and say so in the change record; the
// fake-pool twin storage_purchase_db.test.ts carries the always-on text
// pins). Wiring a postgres job is a maintainer call recorded in the packet
// ledger.
//
// The FK parents are MINIMAL STAND-INS (id-only accounts/characters): this
// suite proves the storage_purchases DDL and queries, not the core schema,
// and the production parents exist long before ensureSchema reaches this
// module.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.TEST_DATABASE_URL ?? '';
const d = url === '' ? describe.skip : describe;

// A PRIVATE schema, the repo idiom for every other database-gated suite
// (tests/discord_db_integration.test.ts, admin_account_db_integration.test.ts,
// daily_rewards_db_integration.test.ts). It is not tidiness: this suite
// DROPS its table in both beforeAll and afterAll, and the module functions it
// drives issue UNQUALIFIED SQL, so without an isolated search_path a developer
// who points TEST_DATABASE_URL at a database that already carries the game
// schema (the documented local dev database is on the same 127.0.0.1:5433 the
// user-space Postgres harness uses) destroys the REAL storage_purchases table.
// That table is the only durable record of a paid-but-unapplied grant, and
// 'unresolved' rows are documented as kept forever for operator attention, so
// dropping it loses money records that nothing can reconstruct. Proven on a
// live database during the Bank Storage phase 11 QA go-live pass: the suite
// dropped 13 real rows and then failed anyway, because CREATE TABLE IF NOT
// EXISTS accounts found the real accounts table and the id-only INSERT
// violated its NOT NULL columns.
const SCHEMA = 'storage_purchase_pg_test';

d('storage_purchases against real PostgreSQL', () => {
  // Imported lazily so the suite skips clean without pg installed state.
  let pool: import('pg').Pool;
  let db: {
    beginStoragePurchase: typeof import('../../server/storage_purchase_db').beginStoragePurchase;
    storagePurchaseByKey: typeof import('../../server/storage_purchase_db').storagePurchaseByKey;
    settleStoragePurchase: typeof import('../../server/storage_purchase_db').settleStoragePurchase;
    reopenStoragePurchase: typeof import('../../server/storage_purchase_db').reopenStoragePurchase;
    pendingStoragePurchasesForCharacter: typeof import('../../server/storage_purchase_db').pendingStoragePurchasesForCharacter;
    pruneRefusedStoragePurchasesBatch: typeof import('../../server/storage_purchase_db').pruneRefusedStoragePurchasesBatch;
    STORAGE_PURCHASE_SCHEMA: string;
  };

  const ROW = {
    realm: 'pgtest',
    accountId: 1,
    characterId: 1,
    itemId: 'strongbox_rung_01',
    expectedCostClaudium: 100,
    idempotencyKey: 'pg-key-1',
  };

  beforeAll(async () => {
    const { Pool } = await import('pg');
    db = await import('../../server/storage_purchase_db');
    // search_path is a STARTUP option so the module functions, which take the
    // pool and issue unqualified SQL, land in the private schema.
    pool = new Pool({ connectionString: url, max: 2, options: `-c search_path=${SCHEMA}` });
    const admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();
    await pool.query('CREATE TABLE accounts (id SERIAL PRIMARY KEY)');
    await pool.query('CREATE TABLE characters (id SERIAL PRIMARY KEY)');
    await pool.query('INSERT INTO accounts (id) VALUES (1), (2)');
    await pool.query('INSERT INTO characters (id) VALUES (1), (2)');
    // The DDL executes for real, twice: idempotency is part of the contract
    // (ensureSchema re-runs it at every boot).
    await pool.query(db.STORAGE_PURCHASE_SCHEMA);
    await pool.query(db.STORAGE_PURCHASE_SCHEMA);
  }, 30_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.end();
    // Drop the whole private schema, never a bare table name: a DROP TABLE
    // here would resolve through whatever search_path the connection ended up
    // with and could take the real table with it.
    const { Pool } = await import('pg');
    const admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  it("runs entirely inside its private schema, never the caller's default", async () => {
    // The isolation IS the safety property, so it gets its own decisive pin:
    // every unqualified write the module makes must land in SCHEMA. A regression
    // that drops the search_path option shows up here rather than as a silently
    // destroyed production table.
    const where = await pool.query('SELECT current_schema() AS s');
    expect(where.rows[0].s).toBe(SCHEMA);
    const owner = await pool.query(
      "SELECT schemaname FROM pg_tables WHERE tablename = 'storage_purchases'",
    );
    expect(owner.rows.map((r: { schemaname: string }) => r.schemaname)).toContain(SCHEMA);
  });

  it('materialized the table, both FULL FK indexes, and the partial sweep index', async () => {
    const reg = await pool.query(`SELECT to_regclass('${SCHEMA}.storage_purchases') AS reg`);
    expect(reg.rows[0].reg).toBe('storage_purchases');
    const idx = await pool.query(
      'SELECT indexname, indexdef FROM pg_indexes ' +
        `WHERE schemaname = '${SCHEMA}' AND tablename = 'storage_purchases' ORDER BY indexname`,
    );
    const defs = new Map<string, string>(
      idx.rows.map((r: { indexname: string; indexdef: string }) => [r.indexname, r.indexdef]),
    );
    // The FK indexes are FULL (no WHERE): they must serve the ON DELETE
    // CASCADE lookups, which a partial index cannot.
    expect(defs.has('storage_purchases_character')).toBe(true);
    expect(defs.get('storage_purchases_character')).not.toContain('WHERE');
    expect(defs.has('storage_purchases_account')).toBe(true);
    expect(defs.get('storage_purchases_account')).not.toContain('WHERE');
    expect(defs.has('storage_purchases_refused')).toBe(true);
    // Executed against the real catalog: the partial predicate is the sweep's
    // own, so the index cannot carry the statuses retention must never delete.
    const refusedDef = defs.get('storage_purchases_refused') ?? '';
    expect(refusedDef).toContain('WHERE');
    expect(refusedDef).toContain("'refused'");
    expect(refusedDef).not.toContain("'applied'");
  });

  it('the sweep never walks the statuses retention must keep, measured', async () => {
    // Phase 14 narrowed the sweep predicate to 'refused' and kept applied rows
    // FOREVER, which puts a permanently growing body of aged applied rows in
    // the table. `status` is not an index column, so a partial index merely
    // WIDER than the predicate cannot separate them by index alone. This is the
    // executed proof that the shipped index does, and it is pinned by PROPERTY
    // rather than by node type: what matters is that the plan discards NOTHING,
    // which stays true whether the planner picks an index or a bitmap scan.
    //
    // Measured on this shape before the fix: the wide index was not merely
    // wasteful, the planner declined it outright and fell back to a sequential
    // scan plus a sort, discarding every aged applied row (50000 rows removed,
    // 2040 buffer blocks) against 0 removed and 32 blocks now. That is the
    // shape that eventually exceeds the pool statement timeout and stalls
    // retention for this table silently.
    //
    // The rows below go into the suite's SHARED table, so this case restores it
    // completely before it returns: later cases pin a sweep count and a planner
    // shape that 5200 extra rows would otherwise change, which is exactly how
    // this pin first announced itself.
    const AGED_KEPT = 5000;
    const AGED_REFUSED = 200;
    try {
      await pool.query(
        `INSERT INTO storage_purchases
         (realm, account_id, character_id, item_id, expected_cost_claudium, idempotency_key, status, resolved_at)
       SELECT 'Claudemoon', 1, 1, 'strongbox_rung_01', 100, 'plan-a'||g, 'applied',
              now() - interval '400 days' - (g || ' seconds')::interval
         FROM generate_series(1, $1) g`,
        [AGED_KEPT],
      );
      await pool.query(
        `INSERT INTO storage_purchases
         (realm, account_id, character_id, item_id, expected_cost_claudium, idempotency_key, status, resolved_at)
       SELECT 'Claudemoon', 1, 1, 'strongbox_rung_01', 100, 'plan-r'||g, 'refused',
              now() - interval '100 days'
         FROM generate_series(1, $1) g`,
        [AGED_REFUSED],
      );
      await pool.query('ANALYZE storage_purchases');
      const explained = await pool.query(
        `EXPLAIN (ANALYZE, FORMAT JSON) SELECT id FROM storage_purchases
         WHERE status = 'refused' AND resolved_at < now() - ('90' || ' days')::interval
         ORDER BY resolved_at LIMIT $1`,
        [AGED_REFUSED],
      );
      const nodes: Record<string, unknown>[] = [];
      const walk = (node: Record<string, unknown>): void => {
        nodes.push(node);
        for (const child of (node.Plans as Record<string, unknown>[]) ?? []) walk(child);
      };
      walk((explained.rows[0]['QUERY PLAN'] as { Plan: Record<string, unknown> }[])[0].Plan);
      const discarded = nodes.reduce((sum, n) => sum + Number(n['Rows Removed by Filter'] ?? 0), 0);
      // THE PROPERTY: the aged rows retention must keep are never visited.
      expect(discarded).toBe(0);
      // ... and at this sample size the shipped index is the one serving it.
      expect(JSON.stringify(explained.rows[0])).toContain('storage_purchases_refused');
      // The kept rows really were there to be walked, so the pin above is not
      // vacuous.
      const kept = await pool.query(
        "SELECT count(*)::int AS n FROM storage_purchases WHERE status = 'applied'",
      );
      expect(kept.rows[0].n).toBeGreaterThanOrEqual(AGED_KEPT);
    } finally {
      await pool.query("DELETE FROM storage_purchases WHERE idempotency_key LIKE 'plan-%'");
      await pool.query('ANALYZE storage_purchases');
    }
  });

  it('rejects an incompressible key past the btree tuple bound at the raw layer', async () => {
    // The wire gate (STORAGE_KEY_PATTERN, 200 chars) refuses long before
    // this, but the raw-layer behavior is worth an executed pin: a ~2800
    // byte random key overflows the unique index tuple and the INSERT
    // throws instead of silently truncating. crypto hex is incompressible,
    // which is what actually trips the bound.
    const { randomBytes } = await import('node:crypto');
    const longKey = randomBytes(1400).toString('hex');
    await expect(
      db.beginStoragePurchase(pool, { ...ROW, idempotencyKey: longKey }),
    ).rejects.toThrow(/index row/);
  });

  it('runs the whole lifecycle: upsert convergence, guards, recovery scan, sweep', async () => {
    // Fresh insert.
    const first = await db.beginStoragePurchase(pool, ROW);
    expect(first.inserted).toBe(true);
    expect(first.existing?.status).toBe('pending');
    // Same-key retry converges on the SAME row (ON CONFLICT for real).
    const retry = await db.beginStoragePurchase(pool, { ...ROW, accountId: 2 });
    expect(retry.inserted).toBe(false);
    expect(retry.existing?.accountId).toBe(1);
    // The recovery scan sees the pending row.
    const pending = await db.pendingStoragePurchasesForCharacter(pool, 1);
    expect(pending.map((r) => r.idempotencyKey)).toEqual(['pg-key-1']);
    // Settle from pending works once; a second settle is refused by the
    // status guard (monotone), as is settling a fresh status over it.
    expect(await db.settleStoragePurchase(pool, 'pg-key-1', 'refused')).toBe(true);
    expect(await db.settleStoragePurchase(pool, 'pg-key-1', 'applied')).toBe(false);
    expect((await db.storagePurchaseByKey(pool, 'pg-key-1'))?.status).toBe('refused');
    // Reopen only moves refused rows; then settle applied.
    expect(await db.reopenStoragePurchase(pool, 'pg-key-1')).toBe(true);
    expect(await db.reopenStoragePurchase(pool, 'pg-key-1')).toBe(false);
    expect(await db.settleStoragePurchase(pool, 'pg-key-1', 'applied')).toBe(true);
    // The recovery scan no longer returns it.
    expect(await db.pendingStoragePurchasesForCharacter(pool, 1)).toEqual([]);
    // The sweep takes REFUSED rows past the window and NOTHING else, executed
    // against a real planner: one row per surviving status, all backdated to the
    // same ancient resolved_at, so the only thing separating them is the
    // predicate under test (Bank Storage phase 14 closed the applied arm, which
    // is the rollback dedupe backstop).
    await db.beginStoragePurchase(pool, { ...ROW, idempotencyKey: 'pg-key-2' });
    await db.settleStoragePurchase(pool, 'pg-key-2', 'unresolved');
    await db.beginStoragePurchase(pool, { ...ROW, idempotencyKey: 'pg-key-3' });
    await db.settleStoragePurchase(pool, 'pg-key-3', 'refused');
    await db.beginStoragePurchase(pool, { ...ROW, idempotencyKey: 'pg-key-4' });
    await pool.query(
      "UPDATE storage_purchases SET resolved_at = now() - interval '400 days' WHERE idempotency_key IN ('pg-key-1', 'pg-key-2', 'pg-key-3', 'pg-key-4')",
    );
    const deleted = await db.pruneRefusedStoragePurchasesBatch(pool, 90, 100);
    expect(deleted).toBe(1);
    expect(await db.storagePurchaseByKey(pool, 'pg-key-3')).toBeNull();
    // The applied row survives: it is the only replay refusal after a rollback
    // strips the in-blob dedupe keys.
    expect((await db.storagePurchaseByKey(pool, 'pg-key-1'))?.status).toBe('applied');
    expect((await db.storagePurchaseByKey(pool, 'pg-key-2'))?.status).toBe('unresolved');
    expect((await db.storagePurchaseByKey(pool, 'pg-key-4'))?.status).toBe('pending');
    // Keep-forever (0) touches nothing even with ancient rows present.
    expect(await db.pruneRefusedStoragePurchasesBatch(pool, 0, 100)).toBe(0);
  });

  it('both ON DELETE CASCADE arms actually fire, and the FK indexes serve them', async () => {
    // The two REFERENCES clauses were declared and never executed by either
    // suite, so a cascade dropped in a future edit (or a FK pointed at the
    // wrong parent) would ship green. This matters beyond tidiness: the whole
    // reason the FK indexes are FULL rather than partial is that a cascade
    // cannot use a partial index, and ruling 9 turns on what a character
    // delete actually erases.
    await pool.query('INSERT INTO accounts (id) VALUES (3)');
    await pool.query('INSERT INTO characters (id) VALUES (3)');
    // A control row on the parents this test never deletes, minted here rather
    // than relying on an earlier case's leftovers (the lifecycle case sweeps
    // its own rows, so borrowing one makes this assertion order-dependent).
    await db.beginStoragePurchase(pool, { ...ROW, idempotencyKey: 'pg-cascade-control' });
    await db.beginStoragePurchase(pool, {
      ...ROW,
      accountId: 3,
      characterId: 3,
      idempotencyKey: 'pg-cascade-character',
    });
    // A CHARACTER delete takes its rows with it.
    await pool.query('DELETE FROM characters WHERE id = 3');
    expect(await db.storagePurchaseByKey(pool, 'pg-cascade-character')).toBeNull();

    await pool.query('INSERT INTO characters (id) VALUES (4)');
    await db.beginStoragePurchase(pool, {
      ...ROW,
      accountId: 3,
      characterId: 4,
      idempotencyKey: 'pg-cascade-account',
    });
    // ... and so does an ACCOUNT delete, through the other reference.
    await pool.query('DELETE FROM accounts WHERE id = 3');
    expect(await db.storagePurchaseByKey(pool, 'pg-cascade-account')).toBeNull();

    // Unrelated rows are untouched: the cascade is scoped, not a wipe.
    expect(await db.storagePurchaseByKey(pool, 'pg-cascade-control')).not.toBeNull();
  });

  it('the login-recovery scan is served by an index, not a sequential scan', async () => {
    // The module comment claims storage_purchases_character serves this read.
    // Ask the planner rather than trusting the prose: pin the ACCESS SHAPE (no
    // Seq Scan on the table) rather than a plan string, which drifts across
    // versions and row counts.
    await pool.query('SET LOCAL enable_seqscan = off');
    const plan = await pool.query(
      'EXPLAIN (FORMAT JSON) SELECT id FROM storage_purchases ' +
        "WHERE character_id = 1 AND status = 'pending' ORDER BY created_at",
    );
    const text = JSON.stringify(plan.rows[0]);
    expect(text).toContain('storage_purchases_character');
  });
  it('the sweep cannot delete a row a concurrent same-key retry reopened', async () => {
    // THE EXECUTED PROOF for the QA round's central new claim. The fake-pool
    // twin can only count that "status = 'refused'" appears twice in the text;
    // it cannot tell whether the second occurrence is on the clause that makes
    // the DELETE re-check the row's CURRENT status. Only two real sessions can.
    //
    // The race: the sweep's inner SELECT chooses ids, and reopenStoragePurchase
    // (a same-key retry, on the request path) can move one of them back to
    // 'pending' before the DELETE reaches it. Deleting by id alone destroys a
    // row that is once again recoverable work, over a spend that may be about
    // to debit.
    const aged = "now() - interval '400 days'";
    for (let i = 0; i < 4; i++) {
      await pool.query(
        `INSERT INTO storage_purchases
           (realm, account_id, character_id, item_id, expected_cost_claudium,
            idempotency_key, status, resolved_at)
         VALUES ('r', 1, 1, 'strongbox_rung_01', 100, $1, 'refused', ${aged})`,
        [`pg-race-${i}`],
      );
    }

    // Session A reopens one of them and HOLDS the row lock uncommitted.
    const holder = await pool.connect();
    let deleted: number;
    try {
      await holder.query('BEGIN');
      await holder.query(
        "UPDATE storage_purchases SET status = 'pending', resolved_at = NULL " +
          "WHERE idempotency_key = 'pg-race-2'",
      );
      // Session B sweeps. It blocks on the reopened row, then re-checks the
      // status the commit reveals.
      const sweeping = db.pruneRefusedStoragePurchasesBatch(pool, 90, 4);
      await new Promise((r) => setTimeout(r, 200));
      await holder.query('COMMIT');
      deleted = await sweeping;
    } finally {
      holder.release();
    }

    // The reopened row SURVIVED, still pending and still recoverable ...
    const survivor = await db.storagePurchaseByKey(pool, 'pg-race-2');
    expect(survivor?.status).toBe('pending');
    // ... and the other three aged refused rows were taken.
    for (const key of ['pg-race-0', 'pg-race-1', 'pg-race-3']) {
      expect(await db.storagePurchaseByKey(pool, key)).toBeNull();
    }
    // The COUNT is the batch the sweep CHOSE, not the rows it managed to
    // delete. server/retention_sweep.ts reads a short batch as proof the table
    // is caught up, so returning 3 here would end the night's sweep with every
    // remaining aged row stranded.
    expect(deleted).toBe(4);

    // Clean up so the later cases' counts and planner shapes are unaffected:
    // this suite shares one table and two arms downstream pin both.
    await pool.query("DELETE FROM storage_purchases WHERE idempotency_key LIKE 'pg-race-%'");
  });

  it('an open-row index would steal the login scan, which is why there is none', () => {
    // Pins the DECISION, not a plan: the audit's open-row predicate has no
    // index because building one measurably took the login-recovery scan's plan
    // (a bitmap scan over every open row with a character_id FILTER, instead of
    // the character-scoped index). If a future change adds one, it must give the
    // login path a better-matching index first, and this arm is where that gets
    // re-argued.
    expect(db.STORAGE_PURCHASE_SCHEMA).not.toContain('storage_purchases_open');
  });
});
