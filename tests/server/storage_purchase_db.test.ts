// Bank Storage phase 11: text-level pins for server/storage_purchase_db.ts
// against a capturing fake pool. A fake pool cannot tell whether SQL parses
// (that executed proof is the TEST_DATABASE_URL-gated twin,
// storage_purchase_db.pg.test.ts), so these pins anchor the load-bearing
// CLAUSES: the unique-key upsert, the status guards that make settle and
// reopen monotone, the sweep's resolved-only predicate, and the DDL's
// partial indexes. Each anchor is a contiguous clause with its occurrence
// pinned, never a lone keyword.
import { describe, expect, it } from 'vitest';
import {
  beginStoragePurchase,
  pendingStoragePurchasesForCharacter,
  pruneRefusedStoragePurchasesBatch,
  reopenStoragePurchase,
  STORAGE_PURCHASE_SCHEMA,
  settleStoragePurchase,
  storagePurchaseByKey,
} from '../../server/storage_purchase_db';

interface Captured {
  text: string;
  values: unknown[] | undefined;
}

function makeCapture(results: { rows?: Record<string, unknown>[]; rowCount?: number }[] = []) {
  const calls: Captured[] = [];
  return {
    calls,
    db: {
      query: async (text: string, values?: unknown[]) => {
        calls.push({ text, values });
        const next = results.shift() ?? {};
        return { rows: next.rows ?? [], rowCount: next.rowCount ?? 0 };
      },
    },
  };
}

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe('the DDL', () => {
  it('creates the table with the unique key and both partial indexes', () => {
    expect(count(STORAGE_PURCHASE_SCHEMA, 'CREATE TABLE IF NOT EXISTS storage_purchases')).toBe(1);
    expect(count(STORAGE_PURCHASE_SCHEMA, 'idempotency_key TEXT NOT NULL UNIQUE')).toBe(1);
    expect(count(STORAGE_PURCHASE_SCHEMA, 'expected_cost_claudium INT NOT NULL')).toBe(1);
    expect(count(STORAGE_PURCHASE_SCHEMA, "status TEXT NOT NULL DEFAULT 'pending'")).toBe(1);
    // The FK indexes must stay FULL (they serve the ON DELETE CASCADE
    // lookups as well as the login-recovery scan; a partial index cannot
    // serve a cascade), and the sweep index stays PARTIAL with its
    // load-bearing WHERE.
    expect(
      count(
        STORAGE_PURCHASE_SCHEMA,
        'CREATE INDEX IF NOT EXISTS storage_purchases_character ON storage_purchases (character_id);',
      ),
    ).toBe(1);
    expect(
      count(
        STORAGE_PURCHASE_SCHEMA,
        'CREATE INDEX IF NOT EXISTS storage_purchases_account ON storage_purchases (account_id);',
      ),
    ).toBe(1);
    // Both delete cascades, pinned as TEXT here because the executed proof for
    // them lives in the pg suite, which skips without TEST_DATABASE_URL and is
    // not CI coverage (this repo has no postgres job). Dropping either
    // REFERENCES clause kills the pg test and, without this pin, nothing in
    // CI: a character delete would then strand its purchase rows forever.
    expect(STORAGE_PURCHASE_SCHEMA).toContain(
      'account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE',
    );
    expect(STORAGE_PURCHASE_SCHEMA).toContain(
      'character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE',
    );
    // The sweep index is pinned as ONE contiguous clause, whitespace-folded:
    // counting the name and the WHERE separately over the whole schema proves
    // only that both strings exist somewhere, not that the partial predicate
    // belongs to THIS index. A WHERE that drifted onto a different index, or a
    // column swapped from resolved_at to created_at, would pass the split form.
    const folded = STORAGE_PURCHASE_SCHEMA.replace(/\s+/g, ' ');
    expect(
      count(
        folded,
        'CREATE INDEX IF NOT EXISTS storage_purchases_refused ON storage_purchases ' +
          "(resolved_at) WHERE status = 'refused';",
      ),
    ).toBe(1);
    // Pending and unresolved must stay OUT of the sweep predicate: they are the
    // recoverable and operator-owned states the retention story keeps forever.
    // Sliced to the index's OWN clause: 'pending' also appears as the status
    // column's DEFAULT, so a schema-wide absence check is not available here
    // and a schema-wide presence check would prove nothing.
    const sweepStart = folded.indexOf('CREATE INDEX IF NOT EXISTS storage_purchases_refused');
    expect(sweepStart).toBeGreaterThan(-1);
    const sweepClause = folded.slice(sweepStart, folded.indexOf(';', sweepStart));
    // EXACTLY the sweep's own predicate, not a superset. `status` is not an
    // index column, so a wider partial index would still be usable and would
    // still make the ordered walk heap-fetch and discard every aged row of the
    // statuses the sweep must never take, forever, since those are now kept.
    expect(sweepClause).toContain("WHERE status = 'refused'");
    for (const kept of ["'pending'", "'unresolved'", "'applied'"]) {
      expect(sweepClause).not.toContain(kept);
    }
    expect(sweepClause).not.toContain("'unresolved'");
    // Both FK indexes stay FULL: a partial index cannot serve a delete cascade.
    expect(folded).not.toContain(
      'storage_purchases_character ON storage_purchases (character_id) WHERE',
    );
    expect(folded).not.toContain(
      'storage_purchases_account ON storage_purchases (account_id) WHERE',
    );
    // Idempotent and additive throughout: every CREATE carries IF NOT EXISTS.
    expect(count(STORAGE_PURCHASE_SCHEMA, 'CREATE TABLE')).toBe(
      count(STORAGE_PURCHASE_SCHEMA, 'CREATE TABLE IF NOT EXISTS'),
    );
    expect(count(STORAGE_PURCHASE_SCHEMA, 'CREATE INDEX')).toBe(
      count(STORAGE_PURCHASE_SCHEMA, 'CREATE INDEX IF NOT EXISTS'),
    );
  });
});

describe('beginStoragePurchase', () => {
  const ROW = {
    realm: 'r1',
    accountId: 7,
    characterId: 42,
    itemId: 'strongbox_rung_01',
    expectedCostClaudium: 100,
    idempotencyKey: 'k-1',
  };

  it('upserts under the unique key and returns the inserted row', async () => {
    const cap = makeCapture([
      {
        rows: [
          {
            id: 5,
            realm: 'r1',
            account_id: 7,
            character_id: 42,
            item_id: 'strongbox_rung_01',
            expected_cost_claudium: 100,
            idempotency_key: 'k-1',
            status: 'pending',
          },
        ],
      },
    ]);
    const res = await beginStoragePurchase(cap.db, ROW);
    expect(cap.calls).toHaveLength(1);
    expect(count(cap.calls[0].text, 'INSERT INTO storage_purchases')).toBe(1);
    expect(count(cap.calls[0].text, 'ON CONFLICT (idempotency_key) DO NOTHING')).toBe(1);
    expect(count(cap.calls[0].text, 'RETURNING')).toBe(1);
    expect(cap.calls[0].values).toEqual(['r1', 7, 42, 'strongbox_rung_01', 100, 'k-1']);
    expect(res).toEqual({
      inserted: true,
      existing: {
        id: 5,
        realm: 'r1',
        accountId: 7,
        characterId: 42,
        itemId: 'strongbox_rung_01',
        expectedCostClaudium: 100,
        idempotencyKey: 'k-1',
        status: 'pending',
      },
    });
  });

  it('on conflict re-reads the existing row instead of inserting', async () => {
    const cap = makeCapture([
      { rows: [] },
      {
        rows: [
          {
            id: 4,
            realm: 'r1',
            account_id: 8,
            character_id: 43,
            item_id: 'strongbox_charter_1',
            expected_cost_claudium: 500,
            idempotency_key: 'k-1',
            status: 'applied',
          },
        ],
      },
    ]);
    const res = await beginStoragePurchase(cap.db, ROW);
    expect(cap.calls).toHaveLength(2);
    expect(count(cap.calls[1].text, 'SELECT')).toBe(1);
    expect(count(cap.calls[1].text, 'WHERE idempotency_key = $1')).toBe(1);
    expect(cap.calls[1].values).toEqual(['k-1']);
    expect(res.inserted).toBe(false);
    expect(res.existing?.status).toBe('applied');
    expect(res.existing?.accountId).toBe(8);
  });
});

describe('storagePurchaseByKey', () => {
  it('is a pure read on the unique key', async () => {
    const cap = makeCapture([{ rows: [] }]);
    const res = await storagePurchaseByKey(cap.db, 'k-2');
    expect(cap.calls).toHaveLength(1);
    expect(count(cap.calls[0].text, 'SELECT')).toBe(1);
    expect(count(cap.calls[0].text, 'INSERT')).toBe(0);
    expect(count(cap.calls[0].text, 'WHERE idempotency_key = $1')).toBe(1);
    expect(cap.calls[0].values).toEqual(['k-2']);
    expect(res).toBeNull();
  });
});

describe('settle and reopen stay monotone through their status guards', () => {
  it('settle moves ONLY a pending row and stamps resolved_at', async () => {
    const cap = makeCapture([{ rowCount: 1 }]);
    expect(await settleStoragePurchase(cap.db, 'k-3', 'applied')).toBe(true);
    expect(count(cap.calls[0].text, 'UPDATE storage_purchases SET status = $2')).toBe(1);
    expect(count(cap.calls[0].text, 'resolved_at = now()')).toBe(1);
    expect(count(cap.calls[0].text, "AND status = 'pending'")).toBe(1);
    expect(cap.calls[0].values).toEqual(['k-3', 'applied']);
    const missed = makeCapture([{ rowCount: 0 }]);
    expect(await settleStoragePurchase(missed.db, 'k-3', 'refused')).toBe(false);
  });

  it('reopen moves ONLY a refused row back to pending', async () => {
    const cap = makeCapture([{ rowCount: 1 }]);
    expect(await reopenStoragePurchase(cap.db, 'k-4')).toBe(true);
    expect(count(cap.calls[0].text, "SET status = 'pending', resolved_at = NULL")).toBe(1);
    expect(count(cap.calls[0].text, "AND status = 'refused'")).toBe(1);
    expect(cap.calls[0].values).toEqual(['k-4']);
  });
});

describe('pendingStoragePurchasesForCharacter', () => {
  it('scans exactly the pending rows for one character, oldest first', async () => {
    const cap = makeCapture([{ rows: [] }]);
    await pendingStoragePurchasesForCharacter(cap.db, 42);
    expect(count(cap.calls[0].text, 'WHERE character_id = $1')).toBe(1);
    expect(count(cap.calls[0].text, "status = 'pending'")).toBe(1);
    expect(count(cap.calls[0].text, 'ORDER BY created_at')).toBe(1);
    expect(cap.calls[0].values).toEqual([42]);
  });
});

describe('pruneRefusedStoragePurchasesBatch', () => {
  it('keep-forever inputs never query', async () => {
    for (const days of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const cap = makeCapture();
      expect(await pruneRefusedStoragePurchasesBatch(cap.db, days, 100)).toBe(0);
      expect(cap.calls).toHaveLength(0);
    }
  });

  it('deletes ONE bounded batch of REFUSED rows past the window, oldest first', async () => {
    // The statement RETURNS its counts rather than relying on rowCount, and the
    // one the retention shell needs is the batch the sweep CHOSE, not the rows
    // it deleted: a row a same-key retry reopened between the two is correctly
    // skipped, and reporting that as a SHORT batch would read as "the table is
    // caught up" and strand every remaining aged row until the next night.
    const cap = makeCapture([{ rows: [{ picked: 7, deleted: 6 }], rowCount: 1 }]);
    expect(await pruneRefusedStoragePurchasesBatch(cap.db, 90, 1000)).toBe(7);
    const q = cap.calls[0];
    expect(count(q.text, 'WITH picked AS (')).toBe(1);
    expect(count(q.text, 'DELETE FROM storage_purchases t USING picked p')).toBe(1);
    // The sweep may only ever touch REFUSED rows: pending rows are recoverable
    // work, unresolved rows are open operator cases, and applied rows are the
    // rollback dedupe backstop. This is the CI-side structural pin for that
    // rule, because the executed arm lives in a database-gated suite CI never
    // runs (the fake pool cannot tell whether SQL means what it says, but it
    // can tell whether a status the sweep must never name appears at all).
    //
    // TWICE, and that is the point rather than an accident: the inner SELECT
    // chooses ids and the outer DELETE re-asserts the status, so a row a
    // same-key retry reopened to 'pending' between the two survives the sweep
    // instead of being deleted by id over a spend that may be about to debit.
    expect(count(q.text, "status = 'refused'")).toBe(2);
    expect(count(q.text, 'applied')).toBe(0);
    expect(count(q.text, 'pending')).toBe(0);
    expect(count(q.text, 'unresolved')).toBe(0);
    expect(count(q.text, "resolved_at < now() - ($1 || ' days')::interval")).toBe(1);
    expect(count(q.text, 'ORDER BY resolved_at')).toBe(1);
    expect(count(q.text, 'LIMIT $2')).toBe(1);
    expect(q.values).toEqual(['90', 1000]);
  });

  it('clamps a fractional window up to one day instead of flooring to zero days', async () => {
    const cap = makeCapture([{ rowCount: 0 }]);
    await pruneRefusedStoragePurchasesBatch(cap.db, 0.5, 10);
    expect(cap.calls[0].values).toEqual(['1', 10]);
  });
});
