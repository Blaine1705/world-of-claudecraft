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
// Applied purchases have a second, append-only receipt outside the character
// FK lifecycle. The operational row still cascades when its character is
// deleted, but the receipt keeps the original character id and purchase
// fingerprint so a recreated character can never replay the paid key. The
// character-save transaction writes the receipt, Claudium audit row, and
// operational-row deletion together. The archive trigger protects a
// mixed-version writer that still transitions a row to `applied`; the insert
// guard also makes that older writer fail closed on a consumed key it does not
// know how to query.
//
// Retention (the deliberate asymmetry with bank_ledger): the operational table
// is not an audit ledger, so REFUSED rows are swept by the
// nightly retention sweep after the configured window (server/http/config.ts
// storagePurchaseRetentionDays). Nothing else is: pending rows are recoverable
// work, unresolved rows are open operator cases, and applied rows are the
// rollback dedupe backstop below. bank_ledger, where the per-character audit of
// the applied slots lives, stays append-only with NO sweep by ruling (see its
// header); the two rules point opposite ways on purpose.
//
// WHAT BOUNDS THE TABLE, status by status (Bank Storage phase 14, closing the
// ruling the paragraph below used to carry), stated rather than asserted:
//   applied     removed from this operational table by the character-save
//               transaction. Its immutable receipt is bounded to at most the
//               whole ladder per character generation, but character churn
//               means receipt history is not globally constant-bounded. It is
//               paid exactly-once evidence, with the same deliberate
//               append-only growth posture as bank_ledger.
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
// applied receipt here is the only thing refusing a hoarded-key replay. Keeping
// receipts forever is therefore not a retention exception, it is the backstop
// working.
//
// The exact release base predates this table and its retention sweep entirely,
// so rollback cannot delete these receipts. The database-level insert guard
// continues protecting consumed keys even while an older binary is running.
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

-- Paid-and-applied tombstones deliberately retain the original character id
-- as a scalar, not an FK. Account deletion still removes the account's entire
-- history, while character deletion cannot erase the exactly-once guard.
CREATE TABLE IF NOT EXISTS storage_purchase_applied_receipts (
  source_purchase_id BIGINT NOT NULL UNIQUE,
  realm TEXT NOT NULL,
  account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  character_id INT NOT NULL,
  item_id TEXT NOT NULL,
  expected_cost_claudium INT NOT NULL,
  idempotency_key TEXT PRIMARY KEY,
  -- Null only on the one-time legacy backfill or a mixed-version trigger
  -- archive, whose historical before/after pair cannot be reconstructed.
  purchased_slots_before INT,
  purchased_slots_after INT,
  applied_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT storage_purchase_receipt_slot_progression CHECK (
    (purchased_slots_before IS NULL AND purchased_slots_after IS NULL)
    OR
    (purchased_slots_before IS NOT NULL AND purchased_slots_after IS NOT NULL
     AND purchased_slots_after > purchased_slots_before)
  )
);
CREATE INDEX IF NOT EXISTS storage_purchase_applied_receipts_account
  ON storage_purchase_applied_receipts (account_id);

CREATE TABLE IF NOT EXISTS storage_purchase_schema_migrations (
  name TEXT PRIMARY KEY,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION archive_storage_purchase_applied_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $storage_purchase_receipt$
BEGIN
  INSERT INTO storage_purchase_applied_receipts
    (source_purchase_id, realm, account_id, character_id, item_id,
     expected_cost_claudium, idempotency_key, applied_at)
  VALUES
    (NEW.id, NEW.realm, NEW.account_id, NEW.character_id, NEW.item_id,
     NEW.expected_cost_claudium, NEW.idempotency_key, COALESCE(NEW.resolved_at, now()))
  ON CONFLICT (idempotency_key) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
      FROM storage_purchase_applied_receipts receipt
     WHERE receipt.idempotency_key = NEW.idempotency_key
       AND receipt.source_purchase_id = NEW.id
       AND receipt.realm = NEW.realm
       AND receipt.account_id = NEW.account_id
       AND receipt.character_id = NEW.character_id
       AND receipt.item_id = NEW.item_id
       AND receipt.expected_cost_claudium = NEW.expected_cost_claudium
  ) THEN
    RAISE EXCEPTION 'storage purchase receipt fingerprint conflict for key %',
      NEW.idempotency_key USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$storage_purchase_receipt$;

DROP TRIGGER IF EXISTS storage_purchase_archive_applied ON storage_purchases;
CREATE TRIGGER storage_purchase_archive_applied
AFTER INSERT OR UPDATE OF status ON storage_purchases
FOR EACH ROW WHEN (NEW.status = 'applied')
EXECUTE FUNCTION archive_storage_purchase_applied_receipt();

-- Backfill exactly once. The marker and copy share ensureSchema's transaction,
-- so a failed copy rolls the marker back and the next boot safely retries.
DO $storage_purchase_receipt_migration$
DECLARE
  first_run bigint;
BEGIN
  INSERT INTO storage_purchase_schema_migrations (name)
  VALUES ('applied-receipts-v1')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS first_run = ROW_COUNT;

  IF first_run > 0 THEN
    INSERT INTO storage_purchase_applied_receipts
      (source_purchase_id, realm, account_id, character_id, item_id,
       expected_cost_claudium, idempotency_key, applied_at)
    SELECT p.id, p.realm, p.account_id, p.character_id, p.item_id,
           p.expected_cost_claudium, p.idempotency_key, COALESCE(p.resolved_at, now())
      FROM storage_purchases p
     WHERE p.status = 'applied'
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF EXISTS (
      SELECT 1
        FROM storage_purchases p
        JOIN storage_purchase_applied_receipts receipt
          ON receipt.idempotency_key = p.idempotency_key
       WHERE p.status = 'applied'
         AND (receipt.source_purchase_id, receipt.realm, receipt.account_id,
              receipt.character_id, receipt.item_id, receipt.expected_cost_claudium)
             IS DISTINCT FROM
             (p.id, p.realm, p.account_id, p.character_id, p.item_id,
              p.expected_cost_claudium)
    ) THEN
      RAISE EXCEPTION 'storage purchase receipt backfill fingerprint conflict'
        USING ERRCODE = '23514';
    END IF;
  END IF;
END;
$storage_purchase_receipt_migration$;

CREATE OR REPLACE FUNCTION guard_storage_purchase_consumed_key()
RETURNS trigger
LANGUAGE plpgsql
AS $storage_purchase_guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage_purchase_applied_receipts
     WHERE idempotency_key = NEW.idempotency_key
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$storage_purchase_guard$;

DROP TRIGGER IF EXISTS storage_purchase_guard_consumed_key ON storage_purchases;
CREATE TRIGGER storage_purchase_guard_consumed_key
BEFORE INSERT ON storage_purchases
FOR EACH ROW
EXECUTE FUNCTION guard_storage_purchase_consumed_key();
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

/** A paid slot grant staged on the live session until the character save that
 * carries its bank blob commits. The save transaction consumes this effect by
 * writing the immutable receipt and its one Claudium audit row, then removing
 * the operational pending row. */
export interface StorageAppliedEffect {
  realm: string;
  accountId: number;
  characterId: number;
  itemId: string;
  expectedCostClaudium: number;
  idempotencyKey: string;
  purchasedSlotsBefore: number;
  purchasedSlotsAfter: number;
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

const RECEIPT_COLUMNS =
  'source_purchase_id, realm, account_id, character_id, item_id, expected_cost_claudium, ' +
  'idempotency_key, purchased_slots_before, purchased_slots_after';

function assertReceiptMatches(
  receipt: Record<string, unknown>,
  effect: StorageAppliedEffect,
): void {
  const before = receipt.purchased_slots_before;
  const after = receipt.purchased_slots_after;
  const legacyAuditUnknown = before === null && after === null;
  const hasAuditPair = before != null && after != null;
  const matches =
    String(receipt.realm) === effect.realm &&
    Number(receipt.account_id) === effect.accountId &&
    Number(receipt.character_id) === effect.characterId &&
    String(receipt.item_id) === effect.itemId &&
    Number(receipt.expected_cost_claudium) === effect.expectedCostClaudium &&
    String(receipt.idempotency_key) === effect.idempotencyKey &&
    (legacyAuditUnknown ||
      (hasAuditPair &&
        Number(before) === effect.purchasedSlotsBefore &&
        Number(after) === effect.purchasedSlotsAfter));
  if (!matches) {
    throw new Error(
      `storage purchase receipt fingerprint conflict for key ${effect.idempotencyKey}`,
    );
  }
}

function assertPendingMatches(row: StoragePurchaseRow, effect: StorageAppliedEffect): void {
  if (
    row.status !== 'pending' ||
    row.realm !== effect.realm ||
    row.accountId !== effect.accountId ||
    row.characterId !== effect.characterId ||
    row.itemId !== effect.itemId ||
    row.expectedCostClaudium !== effect.expectedCostClaudium ||
    row.idempotencyKey !== effect.idempotencyKey
  ) {
    throw new Error(
      `storage purchase pending fingerprint conflict for key ${effect.idempotencyKey}`,
    );
  }
}

async function readAppliedReceipt(
  db: Queryable,
  idempotencyKey: string,
): Promise<Record<string, unknown> | null> {
  const res = await db.query(
    `SELECT ${RECEIPT_COLUMNS}
       FROM storage_purchase_applied_receipts
      WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  return res.rows[0] ?? null;
}

/**
 * Acquire parent-account key locks before an effect-bearing character write.
 * Account deletion locks the same parents before cascading to characters, so
 * taking these locks first preserves that lifecycle order and prevents a
 * character-update -> receipt-FK inversion from deadlocking with deletion.
 */
export async function lockStorageAppliedEffectAccountsOnClient(
  db: Queryable,
  effects: readonly StorageAppliedEffect[],
): Promise<void> {
  const accountIds = [...new Set(effects.map((effect) => effect.accountId))].sort((a, b) => a - b);
  if (accountIds.length === 0) return;

  const locked = await db.query(
    `SELECT id FROM accounts
      WHERE id = ANY($1::int[])
      ORDER BY id
      FOR KEY SHARE`,
    [accountIds],
  );
  const lockedIds = locked.rows.map((row) => Number(row.id));
  if (
    lockedIds.length !== accountIds.length ||
    lockedIds.some((accountId, index) => accountId !== accountIds[index])
  ) {
    throw new Error('storage purchase account disappeared before character save');
  }
}

/**
 * Write the durable effects that must commit with a character blob. The caller
 * owns BEGIN/COMMIT. A newly archived effect writes exactly one Claudium
 * bank_ledger row; a retry after an ambiguous COMMIT sees the matching receipt
 * and writes neither a second receipt nor a second audit row.
 */
export async function writeStorageAppliedEffectsOnClient(
  db: Queryable,
  effects: readonly StorageAppliedEffect[],
): Promise<void> {
  for (const effect of effects) {
    const existing = await readAppliedReceipt(db, effect.idempotencyKey);
    if (existing) {
      assertReceiptMatches(existing, effect);
      await db.query(
        `DELETE FROM storage_purchases
          WHERE id = $1 AND idempotency_key = $2 AND status = 'pending'`,
        [Number(existing.source_purchase_id), effect.idempotencyKey],
      );
      continue;
    }

    const pendingResult = await db.query(
      `SELECT ${ROW_COLUMNS}
         FROM storage_purchases
        WHERE idempotency_key = $1
        FOR UPDATE`,
      [effect.idempotencyKey],
    );
    const pendingRaw = pendingResult.rows[0];
    if (!pendingRaw) {
      throw new Error(`storage purchase pending row missing for key ${effect.idempotencyKey}`);
    }
    const pending = rowFrom(pendingRaw);
    assertPendingMatches(pending, effect);

    const inserted = await db.query(
      `INSERT INTO storage_purchase_applied_receipts
         (source_purchase_id, realm, account_id, character_id, item_id,
          expected_cost_claudium, idempotency_key, purchased_slots_before,
          purchased_slots_after, applied_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING source_purchase_id`,
      [
        pending.id,
        effect.realm,
        effect.accountId,
        effect.characterId,
        effect.itemId,
        effect.expectedCostClaudium,
        effect.idempotencyKey,
        effect.purchasedSlotsBefore,
        effect.purchasedSlotsAfter,
      ],
    );
    if (inserted.rows.length === 0) {
      const raced = await readAppliedReceipt(db, effect.idempotencyKey);
      if (!raced) {
        throw new Error(`storage purchase receipt insert lost for key ${effect.idempotencyKey}`);
      }
      assertReceiptMatches(raced, effect);
    } else {
      await db.query(
        `INSERT INTO bank_ledger
           (realm, character_id, account_id, op, item_id, count, instance,
            copper_delta, purchased_slots_after, container, container_id)
         VALUES ($1, $2, $3, 'buy_slots', $4, NULL, $5, 0, $6, 'personal', NULL)`,
        [
          effect.realm,
          effect.characterId,
          effect.accountId,
          effect.itemId,
          JSON.stringify({ paidWith: 'claudium' }),
          effect.purchasedSlotsAfter,
        ],
      );
    }

    const closed = await db.query(
      `DELETE FROM storage_purchases
        WHERE id = $1 AND idempotency_key = $2 AND status = 'pending'`,
      [pending.id, effect.idempotencyKey],
    );
    if ((closed.rowCount ?? 0) !== 1) {
      throw new Error(`storage purchase pending close failed for key ${effect.idempotencyKey}`);
    }
  }
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
     SELECT $1, $2, $3, $4, $5, $6
      WHERE NOT EXISTS (SELECT 1 FROM storage_purchase_applied_receipts
                         WHERE idempotency_key = $6)
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
  return {
    inserted: false,
    existing: await storagePurchaseByKey(db, row.idempotencyKey),
  };
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
    `SELECT ${ROW_COLUMNS}
       FROM (
         SELECT source_purchase_id AS id, realm, account_id, character_id, item_id,
                expected_cost_claudium, idempotency_key, 'applied'::text AS status,
                0 AS source_rank
           FROM storage_purchase_applied_receipts
          WHERE idempotency_key = $1
         UNION ALL
         SELECT ${ROW_COLUMNS}, 1 AS source_rank
           FROM storage_purchases
          WHERE idempotency_key = $1
       ) recorded_purchase
      ORDER BY source_rank
      LIMIT 1`,
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
