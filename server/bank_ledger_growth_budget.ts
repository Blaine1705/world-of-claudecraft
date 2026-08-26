// Cross-process hard ceiling for the keep-forever bank_ledger table.
//
// A statement-level database trigger counts the rows PostgreSQL actually
// inserts into one transaction-local accumulator. A deferred constraint
// trigger applies that accumulator to the shared ceiling during COMMIT, after
// application queries have finished, so the singleton row never stays locked
// across a save transaction's storage or guild tail. This covers current
// writers, mixed-release processes, and raw SQL; rollback restores both the
// ledger and accumulator, while an idempotent receipt retry that inserts no
// ledger rows consumes nothing. The first migration locks ledger inserts while
// it seeds an exact COUNT(*), then publishes both triggers and the counter
// together when ensureSchema commits.

export const BANK_LEDGER_GROWTH_DEFAULT_HARD_LIMIT_ROWS = 10_000_000;
export const BANK_LEDGER_GROWTH_LIMIT_ENV = 'BANK_LEDGER_GROWTH_HARD_LIMIT_ROWS';
export const BANK_LEDGER_GROWTH_LIMIT_SQLSTATE = 'P0001';
export const BANK_LEDGER_GROWTH_LIMIT_CONSTRAINT = 'bank_ledger_growth_hard_limit';

export function bankLedgerGrowthHardLimitFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = env[BANK_LEDGER_GROWTH_LIMIT_ENV];
  if (raw === undefined || raw === '') return BANK_LEDGER_GROWTH_DEFAULT_HARD_LIMIT_ROWS;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${BANK_LEDGER_GROWTH_LIMIT_ENV} must be a positive safe integer`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${BANK_LEDGER_GROWTH_LIMIT_ENV} must be a positive safe integer`);
  }
  return parsed;
}

export const BANK_LEDGER_GROWTH_HARD_LIMIT_ROWS = bankLedgerGrowthHardLimitFromEnv();

/**
 * Applied once per boot under the schema advisory lock. The bootstrap lock is
 * taken only before the durable singleton is initialized, and excludes inserts
 * while COUNT(*) establishes the exact starting point. Later boots do not scan
 * or lock bank_ledger; a missing trigger or split hard-limit config fails boot.
 * An existing ledger already above the first configured ceiling is seeded at
 * its exact count and serves with all later ledger inserts refused, preserving
 * non-ledger access while operators raise or reconcile the limit.
 */
export function bankLedgerGrowthBudgetSchema(schemaName = 'public'): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(schemaName)) {
    throw new Error('bank ledger growth budget schema must be a simple lowercase identifier');
  }
  const schema = `"${schemaName}"`;
  const ledgerRegclass = `${schema}.bank_ledger`;
  const pendingRegclass = `${schema}.bank_ledger_growth_pending`;
  const accumulatorRegprocedure = `${schema}.accumulate_bank_ledger_growth_budget()`;
  const enforcerRegprocedure = `${schema}.enforce_bank_ledger_growth_budget()`;
  return `
CREATE TABLE IF NOT EXISTS "__woc_bank_ledger_growth_schema__".bank_ledger_growth_budget (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  committed_rows BIGINT NOT NULL CHECK (committed_rows >= 0),
  hard_limit_rows BIGINT NOT NULL CHECK (hard_limit_rows > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- This table has no committed rows in healthy operation. Its one row per
-- ledger-writing transaction exists only until the deferred trigger consumes
-- it during COMMIT; rollback removes it together with the ledger insert.
CREATE TABLE IF NOT EXISTS "__woc_bank_ledger_growth_schema__".bank_ledger_growth_pending (
  transaction_id xid8 PRIMARY KEY,
  inserted_rows BIGINT NOT NULL CHECK (inserted_rows > 0)
);

CREATE OR REPLACE FUNCTION "__woc_bank_ledger_growth_schema__".accumulate_bank_ledger_growth_budget()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, "__woc_bank_ledger_growth_schema__", pg_temp
AS $$
DECLARE
  inserted_rows BIGINT;
BEGIN
  SELECT count(*)::bigint INTO inserted_rows FROM inserted_bank_ledger_rows;
  IF inserted_rows = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO "__woc_bank_ledger_growth_schema__".bank_ledger_growth_pending (transaction_id, inserted_rows)
  VALUES (pg_catalog.pg_current_xact_id(), inserted_rows)
  ON CONFLICT (transaction_id) DO UPDATE
    SET inserted_rows = "__woc_bank_ledger_growth_schema__".bank_ledger_growth_pending.inserted_rows
                      + EXCLUDED.inserted_rows;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION "__woc_bank_ledger_growth_schema__".enforce_bank_ledger_growth_budget()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, "__woc_bank_ledger_growth_schema__", pg_temp
AS $$
DECLARE
  attempted_rows BIGINT;
  before_rows BIGINT;
  stored_limit BIGINT;
BEGIN
  -- Several ledger statements queue several deferred trigger events for the
  -- same transaction. Exactly one event wins this DELETE and applies the
  -- final accumulated count; every later event observes no row and is inert.
  DELETE FROM "__woc_bank_ledger_growth_schema__".bank_ledger_growth_pending
   WHERE transaction_id = NEW.transaction_id
  RETURNING inserted_rows INTO attempted_rows;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE "__woc_bank_ledger_growth_schema__".bank_ledger_growth_budget
     SET committed_rows = committed_rows + attempted_rows,
         updated_at = now()
   WHERE singleton = TRUE
     AND hard_limit_rows = ${BANK_LEDGER_GROWTH_HARD_LIMIT_ROWS}
     AND committed_rows + attempted_rows <= hard_limit_rows
  RETURNING hard_limit_rows INTO stored_limit;
  IF FOUND THEN
    RETURN NULL;
  END IF;

  SELECT committed_rows, hard_limit_rows
    INTO before_rows, stored_limit
    FROM "__woc_bank_ledger_growth_schema__".bank_ledger_growth_budget
   WHERE singleton = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'bank ledger growth budget is not initialized';
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '${BANK_LEDGER_GROWTH_LIMIT_SQLSTATE}',
    MESSAGE = 'bank ledger growth limit exceeded',
    CONSTRAINT = '${BANK_LEDGER_GROWTH_LIMIT_CONSTRAINT}',
    DETAIL = pg_catalog.json_build_object(
      'committed_rows', before_rows,
      'attempted_rows', attempted_rows,
      'hard_limit_rows', stored_limit
    )::text;
END
$$;

DO $$
DECLARE
  named_insert_trigger BOOLEAN;
  valid_insert_trigger BOOLEAN;
  named_commit_trigger BOOLEAN;
  valid_commit_trigger BOOLEAN;
  budget_initialized BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM "__woc_bank_ledger_growth_schema__".bank_ledger_growth_budget WHERE singleton = TRUE
  ) INTO budget_initialized;
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger
     WHERE tgrelid = '${ledgerRegclass}'::pg_catalog.regclass
       AND tgname = 'bank_ledger_growth_budget_insert'
       AND NOT tgisinternal
  ) INTO named_insert_trigger;
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger
     WHERE tgrelid = '${ledgerRegclass}'::pg_catalog.regclass
       AND tgname = 'bank_ledger_growth_budget_insert'
       AND NOT tgisinternal
       AND tgenabled = 'O'
       AND tgtype = 4
       AND tgfoid = '${accumulatorRegprocedure}'::pg_catalog.regprocedure
       AND tgnargs = 0
       AND pg_catalog.octet_length(tgargs) = 0
       AND tgattr::text = ''
       AND tgqual IS NULL
       AND tgnewtable = 'inserted_bank_ledger_rows'
       AND tgoldtable IS NULL
  ) INTO valid_insert_trigger;

  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger
     WHERE tgrelid = '${pendingRegclass}'::pg_catalog.regclass
       AND tgname = 'bank_ledger_growth_budget_commit'
       AND NOT tgisinternal
  ) INTO named_commit_trigger;
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger
     WHERE tgrelid = '${pendingRegclass}'::pg_catalog.regclass
       AND tgname = 'bank_ledger_growth_budget_commit'
       AND NOT tgisinternal
       AND tgenabled = 'O'
       AND tgtype = 21
       AND tgfoid = '${enforcerRegprocedure}'::pg_catalog.regprocedure
       AND tgnargs = 0
       AND pg_catalog.octet_length(tgargs) = 0
       AND tgattr::text = ''
       AND tgqual IS NULL
       AND tgconstraint <> 0
       AND tgdeferrable
       AND tginitdeferred
       AND tgnewtable IS NULL
       AND tgoldtable IS NULL
  ) INTO valid_commit_trigger;

  IF named_insert_trigger AND NOT valid_insert_trigger THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'bank_ledger_growth_budget_insert has an unsafe definition';
  END IF;
  IF named_commit_trigger AND NOT valid_commit_trigger THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'bank_ledger_growth_budget_commit has an unsafe definition';
  END IF;

  -- After initialization, an absent trigger is evidence of an unaudited write
  -- window. Recreating it without an exact reconciliation would permanently
  -- undercount rows inserted during that gap, so fail boot for an operator.
  IF budget_initialized AND (NOT valid_insert_trigger OR NOT valid_commit_trigger) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'initialized bank ledger growth budget is missing an enforcement trigger';
  END IF;
  IF budget_initialized AND EXISTS (
    SELECT 1 FROM "__woc_bank_ledger_growth_schema__".bank_ledger_growth_pending
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'bank ledger growth budget has orphaned pending rows';
  END IF;

  IF NOT budget_initialized THEN
    -- CREATE TRIGGER holds this lock too, but spelling it before COUNT makes
    -- the mixed-release bootstrap boundary explicit and independent of DDL
    -- lock implementation details.
    LOCK TABLE "__woc_bank_ledger_growth_schema__".bank_ledger IN SHARE ROW EXCLUSIVE MODE;
    DELETE FROM "__woc_bank_ledger_growth_schema__".bank_ledger_growth_pending;

    IF NOT valid_commit_trigger THEN
      EXECUTE 'CREATE CONSTRAINT TRIGGER bank_ledger_growth_budget_commit
        AFTER INSERT OR UPDATE ON "__woc_bank_ledger_growth_schema__".bank_ledger_growth_pending
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW
        EXECUTE FUNCTION "__woc_bank_ledger_growth_schema__".enforce_bank_ledger_growth_budget()';
    END IF;

    IF NOT valid_insert_trigger THEN
      EXECUTE 'CREATE TRIGGER bank_ledger_growth_budget_insert
        AFTER INSERT ON "__woc_bank_ledger_growth_schema__".bank_ledger
        REFERENCING NEW TABLE AS inserted_bank_ledger_rows
        FOR EACH STATEMENT
        EXECUTE FUNCTION "__woc_bank_ledger_growth_schema__".accumulate_bank_ledger_growth_budget()';
    END IF;

    INSERT INTO "__woc_bank_ledger_growth_schema__".bank_ledger_growth_budget
      (singleton, committed_rows, hard_limit_rows)
    -- Deliberately allow committed_rows to start above the ceiling. The
    -- enforcement predicate then refuses every future insert without making
    -- unrelated gameplay unavailable during an emergency cap rollout.
    SELECT TRUE, COUNT(*)::bigint, ${BANK_LEDGER_GROWTH_HARD_LIMIT_ROWS}
      FROM "__woc_bank_ledger_growth_schema__".bank_ledger;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "__woc_bank_ledger_growth_schema__".bank_ledger_growth_budget
     WHERE singleton = TRUE
       AND hard_limit_rows <> ${BANK_LEDGER_GROWTH_HARD_LIMIT_ROWS}
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = '${BANK_LEDGER_GROWTH_LIMIT_ENV} disagrees with the durable bank-ledger limit';
  END IF;
END
$$;

SELECT committed_rows, hard_limit_rows
  FROM "__woc_bank_ledger_growth_schema__".bank_ledger_growth_budget
 WHERE singleton = TRUE;
`.replaceAll('"__woc_bank_ledger_growth_schema__"', schema);
}

export const BANK_LEDGER_GROWTH_BUDGET_SCHEMA = bankLedgerGrowthBudgetSchema();

export class BankLedgerGrowthLimitExceeded extends Error {
  constructor(
    readonly committedRows: number,
    readonly attemptedRows: number,
    readonly hardLimitRows: number,
    options?: ErrorOptions,
  ) {
    super(
      `bank ledger growth limit exceeded: ${committedRows} committed + ${attemptedRows} attempted > ${hardLimitRows}`,
      options,
    );
    this.name = 'BankLedgerGrowthLimitExceeded';
  }
}

export interface BankLedgerGrowthBudgetReadout {
  readonly committedRows: number | null;
  readonly hardLimitRows: number;
  readonly observedAtMs: number | null;
}

let observedCommittedRows: number | null = null;
let observedAtMs: number | null = null;

function safeDbInteger(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Record a database-returned counter value for the scrape-time gauge. */
export function observeBankLedgerGrowthBudget(
  committedRows: unknown,
  hardLimitRows: unknown = BANK_LEDGER_GROWTH_HARD_LIMIT_ROWS,
  nowMs: number = Date.now(),
): boolean {
  const committed = safeDbInteger(committedRows);
  const limit = safeDbInteger(hardLimitRows);
  if (
    committed === null ||
    limit !== BANK_LEDGER_GROWTH_HARD_LIMIT_ROWS ||
    !Number.isFinite(nowMs) ||
    nowMs < 0
  ) {
    return false;
  }
  // The durable counter is monotonic. A refusal can report a newer value while
  // a periodic SELECT that took its snapshot just before that COMMIT is still
  // in flight; never let the late response move the exported gauge backward.
  if (observedCommittedRows !== null && committed < observedCommittedRows) return true;
  observedCommittedRows = committed;
  observedAtMs = nowMs;
  return true;
}

export function bankLedgerGrowthBudgetReadout(): BankLedgerGrowthBudgetReadout {
  return Object.freeze({
    committedRows: observedCommittedRows,
    hardLimitRows: BANK_LEDGER_GROWTH_HARD_LIMIT_ROWS,
    observedAtMs,
  });
}

function growthEvidenceFromDetail(detail: unknown): {
  committedRows: number;
  attemptedRows: number;
  hardLimitRows: number;
} | null {
  if (typeof detail !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const row = parsed as Record<string, unknown>;
  const committedRows = safeDbInteger(row.committed_rows);
  const attemptedRows = safeDbInteger(row.attempted_rows);
  const hardLimitRows = safeDbInteger(row.hard_limit_rows);
  if (committedRows === null || attemptedRows === null || hardLimitRows === null) return null;
  return { committedRows, attemptedRows, hardLimitRows };
}

/** Convert only the trigger's fixed PostgreSQL identity into the domain error. */
export function bankLedgerGrowthLimitFromError(
  error: unknown,
): BankLedgerGrowthLimitExceeded | null {
  if (typeof error !== 'object' || error === null) return null;
  const pgError = error as Record<string, unknown>;
  if (
    pgError.code !== BANK_LEDGER_GROWTH_LIMIT_SQLSTATE ||
    pgError.constraint !== BANK_LEDGER_GROWTH_LIMIT_CONSTRAINT
  ) {
    return null;
  }
  const evidence = growthEvidenceFromDetail(pgError.detail);
  if (!evidence) {
    throw new Error('bank ledger growth refusal returned malformed trigger evidence', {
      cause: error,
    });
  }
  observeBankLedgerGrowthBudget(evidence.committedRows, evidence.hardLimitRows);
  return new BankLedgerGrowthLimitExceeded(
    evidence.committedRows,
    evidence.attemptedRows,
    evidence.hardLimitRows,
    { cause: error },
  );
}
