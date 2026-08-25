// The pending-purchase table behind the Claudium storage flow (Bank Storage
// phase 11, server/storage_purchases.ts). One row per purchase attempt,
// keyed by the client-minted idempotency key, written and DURABLE before any
// money moves: the row is what makes a purchase recoverable across a dropped
// session or a process restart, queryable while the character is OFFLINE
// (which is exactly why this is a dedicated table and not character state).
//
// Status vocabulary (single-writer per key under the per-character mutex):
//   pending    - persisted; the spend outcome or the durable apply is still
//                open. Recovered at the character's next login by retrying
//                the SAME key against the service.
//   applied    - slots applied AND the character save carrying them (and the
//                dedupe key) confirmed durable. Terminal.
//   refused    - the service answered definitively without debiting.
//                Terminal, but a same-key retry may reopen it: the service
//                keeps no record of a refused spend, so retrying is a fresh
//                attempt.
//   unresolved - the spend debited but the apply-time re-check refused
//                (impossible-state territory: a bug or a restore from
//                backup). Never swept and never regressed; kept for
//                operator attention (the one bulk remover is the FK
//                cascade when the character or account itself is deleted,
//                which also removes the case). Never a clawback, never a
//                partial apply.
//
// Retention (the deliberate asymmetry with bank_ledger): this is an
// OPERATIONAL table, not an audit ledger, so REFUSED rows are swept by the
// nightly retention sweep after the configured window (server/http/config.ts
// storagePurchaseRetentionDays). Nothing else is: pending rows are recoverable
// work, unresolved rows are open operator cases, and applied rows are the
// rollback dedupe backstop below. bank_ledger, where the per-character audit of
// the applied slots lives, stays append-only with NO sweep by ruling (see its
// header); the two rules point opposite ways on purpose.
//
// WHAT BOUNDS THE TABLE, status by status (Bank Storage phase 14, closing the
// ruling the paragraph below used to carry), stated rather than asserted:
//   applied     bounded BY CONSTRUCTION at the catalog: a character can apply
//               at most the whole ladder, once each, because the next-rung gate
//               and the in-blob dedupe both refuse a repeat.
//   unresolved  NOT catalog-bounded, and the earlier wording claiming so was
//               wrong: an unresolved row leaves its rung UNGRANTED, so a later
//               key can pre-check 'fits' and go unresolved again. What bounds
//               it is real money, since every such row cost a real debit, and
//               it is the status the audit script exists to surface. Expected
//               near zero; a rising count is an incident, not growth.
//   pending     no per-character cap, but self-healing: the character's next
//               login drives every open row to a terminal status.
//   refused     the only status a player can accumulate freely, and the only
//               one the sweep takes. Its steady state is therefore
//               (fleet refusal rate x the retention window), not a constant:
//               at the spend rate limit a single determined account can hold a
//               large backlog for the whole window. That is unchanged from
//               before this phase, but it is now the load-bearing half of the
//               retention story, so it is written down rather than waved at. If
//               the backlog ever matters, the lever is a SHORTER window for
//               refused rows specifically: a refused row has no forensic value
//               past its same-key retry horizon, because the service kept no
//               record of it either. Queued as a maintainer tuning call.
//
// ROLLBACK, and be precise about what this phase did and did not remove: the
// primary exactly-once guard is the in-blob appliedStorageKeys entry, but a
// PRE-phase-11 server strips that field on the first save after a version
// rollback (its bank writer does not know the key). After such a rollback the
// applied row here is the only thing refusing a hoarded-key replay. Keeping
// applied rows forever is therefore not a retention exception, it is the
// backstop working.
//
// What that buys is that THIS binary can no longer sweep the backstop away. It
// does NOT make the operator step unnecessary, because the sweep that would
// delete an applied row is the OLD binary's, and whichever binary wins the
// nightly run is the one that runs: rolling the fleet back past this release
// still needs STORAGE_PURCHASE_RETENTION_DAYS=0 for the duration. DEPLOY.md
// carries that instruction and is the authority; an earlier version of this
// paragraph claimed the requirement was gone, which would have talked an
// operator out of the one step that protects the replay guard.
//
// `realm` is operator forensics only: character ids are globally unique
// across realms (characters.id is the one sequence), so the recovery scan
// and the sweep are deliberately realm-blind.

// Minimal structural seam over pg's Pool/PoolClient query surface (the
// play_session_retention_db.ts idiom), so every function here runs against
// the real pool, the zonky integration harness, and a fake alike.
interface Queryable {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

// Additive and idempotent; applied by ensureSchema (server/db.ts) under the
// boot advisory lock. The two FK indexes are FULL on purpose: they serve
// both their hot read (the login recovery scan rides storage_purchases_character;
// the status filter is a handful of rows per character) and the ON DELETE
// CASCADE lookups a character or account delete runs (a partial index cannot
// serve a cascade, which would otherwise seq-scan the table inside the
// deleting transaction). The refused index is PARTIAL and matches the retention
// sweep's predicate EXACTLY, which matters more since phase 14 than it looks:
// `status` is not an index column, so a partial index merely WIDER than the
// predicate would still be usable and would still force the sweep's
// ordered-by-resolved_at walk to heap-fetch and discard every aged row of the
// other statuses first. Applied rows are now kept forever, so that discarded
// prefix would grow for the life of the realm until a batch finally exceeded
// the pool statement timeout and retention for this table stalled silently.
// THERE IS DELIBERATELY NO INDEX FOR THE OPERATOR AUDIT'S OPEN-ROW READ, and
// that is a measured decision rather than an oversight. scripts/bank_audit.mjs
// reads `status <> 'applied' AND status <> 'refused'` twice, and on PG16 at
// 505,600 rows those are two parallel sequential scans at about 5,800 buffers
// each. The obvious fix, a partial index on (id) over that predicate, was
// built and MEASURED here and then removed: the planner promptly chose it for
// the LOGIN-RECOVERY scan too, planning a bitmap scan over every open row in
// the realm with `Filter: (character_id = N)` instead of the character-scoped
// storage_purchases_character. That trades a hot per-join path for an offline
// tool, and it degrades worst during the restart storm when the open tail is
// large and logins are what matter. The audit is an operator CLI run
// occasionally with its own 300s statement timeout; the login scan runs on
// every fresh join inside a four-wide gate. Queued as a maintainer tuning call
// (state.md): serving both wants a character-scoped partial index for the login
// path FIRST, so the audit's index cannot win that query.
// (A predicate cannot be narrowed under an existing index NAME idempotently,
// which is why this is a differently named index; a developer database booted
// against the older schema keeps an unused storage_purchases_resolved, the same
// harmless drift the maintainer ruling on storage_purchases_character_open
// already covers. This table has never deployed, so no production database has
// either index yet.)
export const STORAGE_PURCHASE_SCHEMA = `
CREATE TABLE IF NOT EXISTS storage_purchases (
  id BIGSERIAL PRIMARY KEY,
  realm TEXT NOT NULL,
  -- BOTH CASCADES ARE AN ACCEPTED DECISION, not a default nobody weighed, and
  -- the reasoning lives here because it lives nowhere else that ships. Deleting
  -- a character (or an account) destroys that character's open purchase rows,
  -- including a pending row whose money may have moved and an unresolved row
  -- the retention policy otherwise keeps forever for operator attention. It was
  -- accepted twice, for four reasons: guarding the delete would let an
  -- unresolved row block a player from deleting their own character
  -- indefinitely; the money trail survives in the payment service's own ledger,
  -- which a character delete does not touch; the outage path no longer leaves a
  -- pending row behind at all; and the audit arm surfaces open rows BEFORE
  -- anyone deletes anything. Do not "fix" this to SET NULL or RESTRICT: that
  -- breaks the character-delete path and also invalidates the full-index
  -- rationale above, which exists precisely so a cascade does not seq-scan.
  account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  expected_cost_claudium INT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS storage_purchases_character ON storage_purchases (character_id);
CREATE INDEX IF NOT EXISTS storage_purchases_account ON storage_purchases (account_id);
CREATE INDEX IF NOT EXISTS storage_purchases_refused
  ON storage_purchases (resolved_at)
  WHERE status = 'refused';
`;

export type StoragePurchaseStatus = 'pending' | 'applied' | 'refused' | 'unresolved';

export interface StoragePurchaseRow {
  id: number;
  realm: string;
  accountId: number;
  characterId: number;
  itemId: string;
  /** The client-declared cost persisted VERBATIM: the service fingerprint
   *  binds item, kind, and cost, so a recovery retry must replay the exact
   *  original number or the service would answer with the already_granted
   *  CONFLICT arm instead of the replay arm. Never a game-authored price. */
  expectedCostClaudium: number;
  idempotencyKey: string;
  status: StoragePurchaseStatus;
}

function rowFrom(r: Record<string, unknown>): StoragePurchaseRow {
  return {
    id: Number(r.id),
    realm: String(r.realm),
    accountId: Number(r.account_id),
    characterId: Number(r.character_id),
    itemId: String(r.item_id),
    expectedCostClaudium: Number(r.expected_cost_claudium),
    idempotencyKey: String(r.idempotency_key),
    status: String(r.status) as StoragePurchaseStatus,
  };
}

const ROW_COLUMNS =
  'id, realm, account_id, character_id, item_id, expected_cost_claudium, idempotency_key, status';

/** Persist the pending record, or surface the row already holding the key.
 *  Returns { inserted: true } when this call created the row, else the
 *  existing row so the caller can distinguish a same-purchase retry from a
 *  cross-purchase key collision. ON CONFLICT DO NOTHING plus a read keeps
 *  two racing same-key requests convergent: exactly one inserts. */
export async function beginStoragePurchase(
  db: Queryable,
  row: {
    realm: string;
    accountId: number;
    characterId: number;
    itemId: string;
    expectedCostClaudium: number;
    idempotencyKey: string;
  },
): Promise<{ inserted: boolean; existing: StoragePurchaseRow | null }> {
  const ins = await db.query(
    `INSERT INTO storage_purchases
       (realm, account_id, character_id, item_id, expected_cost_claudium, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING ${ROW_COLUMNS}`,
    [
      row.realm,
      row.accountId,
      row.characterId,
      row.itemId,
      row.expectedCostClaudium,
      row.idempotencyKey,
    ],
  );
  if (ins.rows.length > 0) return { inserted: true, existing: rowFrom(ins.rows[0]) };
  const existing = await db.query(
    `SELECT ${ROW_COLUMNS} FROM storage_purchases WHERE idempotency_key = $1`,
    [row.idempotencyKey],
  );
  return { inserted: false, existing: existing.rows[0] ? rowFrom(existing.rows[0]) : null };
}

/** Pure lookup by the unique idempotency key (no insert): what the flow
 *  reads BEFORE validating a request, so a retry of a purchase that already
 *  settled (applied / unresolved) or that names a different fingerprint is
 *  answered from its recorded state instead of re-judged as a fresh one. */
export async function storagePurchaseByKey(
  db: Queryable,
  idempotencyKey: string,
): Promise<StoragePurchaseRow | null> {
  const res = await db.query(
    `SELECT ${ROW_COLUMNS} FROM storage_purchases WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  return res.rows[0] ? rowFrom(res.rows[0]) : null;
}

/** Move one purchase to a terminal (or, for 'unresolved', operator-facing)
 *  status. Guarded on the FROM set so a stale writer can never regress a
 *  settled row; returns whether a row actually moved. */
export async function settleStoragePurchase(
  db: Queryable,
  idempotencyKey: string,
  status: 'applied' | 'refused' | 'unresolved',
): Promise<boolean> {
  const res = await db.query(
    `UPDATE storage_purchases SET status = $2, resolved_at = now()
      WHERE idempotency_key = $1 AND status = 'pending'`,
    [idempotencyKey, status],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Reopen a refused purchase for a same-key retry (the service keeps no
 *  record of a refusal, so the retry is a legitimate fresh attempt). Only
 *  'refused' reopens: applied and unresolved rows never regress. */
export async function reopenStoragePurchase(
  db: Queryable,
  idempotencyKey: string,
): Promise<boolean> {
  const res = await db.query(
    `UPDATE storage_purchases SET status = 'pending', resolved_at = NULL
      WHERE idempotency_key = $1 AND status = 'refused'`,
    [idempotencyKey],
  );
  return (res.rowCount ?? 0) > 0;
}

/** The login-recovery scan: every open (pending) purchase for one character,
 *  oldest first. The index is on character_id ALONE, so precisely: it serves
 *  the lookup, and the status filter and the ORDER BY are applied to what it
 *  returns. That is the right shape here rather than a composite or partial
 *  index, because one character's whole history is bounded at roughly a dozen
 *  rows by the 72-slot ladder, and because a partial index could not also
 *  serve the ON DELETE CASCADE the same column needs. Unbounded by LIMIT on
 *  purpose: recovery must see EVERY open row, and the per-character mutex
 *  keeps that at most one in practice. tests/server/storage_purchase_db.pg
 *  pins the access shape against a real planner rather than trusting this
 *  paragraph. */
export async function pendingStoragePurchasesForCharacter(
  db: Queryable,
  characterId: number,
): Promise<StoragePurchaseRow[]> {
  const res = await db.query(
    `SELECT ${ROW_COLUMNS} FROM storage_purchases
      WHERE character_id = $1 AND status = 'pending'
      ORDER BY created_at`,
    [characterId],
  );
  return res.rows.map(rowFrom);
}

/** One bounded retention batch: REFUSED rows only, past the window, oldest
 *  resolutions first. Every other status is deliberately untouchable here:
 *  pending is recoverable work, unresolved is an open operator case, and
 *  applied is the rollback dedupe backstop (see the header). Refused is also
 *  the only status a player can accumulate without bound, so it is the one the
 *  sweep actually needs. 0 or a non-finite retention means keep forever, the
 *  sweep-wide idiom.
 *
 *  storage_purchases_refused matches this predicate EXACTLY. A merely WIDER
 *  partial index is NOT good enough here, which is the opposite of what an
 *  earlier draft of this comment claimed: `status` is not an index column, so a
 *  superset index is still usable and still forces this ordered walk to
 *  heap-fetch and discard every aged row of the other statuses first. Applied
 *  rows are kept forever now, so that discarded prefix would grow for the life
 *  of the realm. Measured on PG16 at the shape retention creates: the wide
 *  index was declined by the planner outright in favour of a seq scan plus a
 *  sort, discarding 50000 aged applied rows over 2040 blocks, against 0
 *  discarded and 32 blocks with the narrow one. The narrowing rode a NEW index
 *  name because a predicate cannot be narrowed under an existing one
 *  idempotently (see the schema header). */
export async function pruneRefusedStoragePurchasesBatch(
  db: Queryable,
  retentionDays: number,
  batchSize: number,
): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  const days = Math.max(1, Math.floor(retentionDays));
  const res = await db.query(
    // The status predicate is repeated on the DELETE on purpose. `picked`
    // chooses ids, and a same-key retry can reopen one of those rows to
    // 'pending' between the choose and the delete (reopenStoragePurchase is
    // exactly that move, and it runs on the request path while this sweep runs
    // nightly). Deleting by id alone would destroy a row that is once again
    // recoverable work, over a spend that may be about to debit. Re-asserting
    // it makes the delete re-check the row's CURRENT status, so a reopened row
    // survives.
    //
    // AND THE COUNT RETURNED IS `picked`, NOT `deleted`, which is not a cosmetic
    // choice. server/retention_sweep.ts reads a batch SHORTER than batchSize as
    // proof the table has no more aged rows and ends that table's whole sweep
    // for the night. Returning the deleted count would make one skipped row
    // (the rare reopen race above) read as caught-up and silently strand every
    // remaining aged row until the next night. `picked` answers the question the
    // shell is actually asking, which is whether a full batch of work was
    // available, and the skipped row genuinely was processed: it was examined
    // and correctly left alone.
    `WITH picked AS (
       SELECT id FROM storage_purchases
        WHERE status = 'refused'
          AND resolved_at < now() - ($1 || ' days')::interval
        ORDER BY resolved_at
        LIMIT $2
     ), deleted AS (
       DELETE FROM storage_purchases t USING picked p
        WHERE t.id = p.id AND t.status = 'refused'
        RETURNING t.id
     )
     SELECT (SELECT count(*) FROM picked)::int AS picked,
            (SELECT count(*) FROM deleted)::int AS deleted`,
    [String(days), Math.max(1, Math.floor(batchSize))],
  );
  const picked = res.rows[0]?.picked;
  return typeof picked === 'number' ? picked : 0;
}
