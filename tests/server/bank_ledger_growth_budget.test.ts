import { describe, expect, it } from 'vitest';
import {
  BANK_LEDGER_GROWTH_BUDGET_SCHEMA,
  BANK_LEDGER_GROWTH_DEFAULT_HARD_LIMIT_ROWS,
  BANK_LEDGER_GROWTH_LIMIT_CONSTRAINT,
  BANK_LEDGER_GROWTH_LIMIT_ENV,
  BANK_LEDGER_GROWTH_LIMIT_SQLSTATE,
  BankLedgerGrowthLimitExceeded,
  bankLedgerGrowthBudgetReadout,
  bankLedgerGrowthBudgetSchema,
  bankLedgerGrowthHardLimitFromEnv,
  bankLedgerGrowthLimitFromError,
  observeBankLedgerGrowthBudget,
} from '../../server/bank_ledger_growth_budget';

describe('bank ledger durable growth budget', () => {
  it('parses one shared positive safe-integer hard limit and pins its default', () => {
    expect(BANK_LEDGER_GROWTH_DEFAULT_HARD_LIMIT_ROWS).toBe(10_000_000);
    expect(BANK_LEDGER_GROWTH_LIMIT_ENV).toBe('BANK_LEDGER_GROWTH_HARD_LIMIT_ROWS');
    expect(bankLedgerGrowthHardLimitFromEnv({})).toBe(10_000_000);
    expect(bankLedgerGrowthHardLimitFromEnv({ [BANK_LEDGER_GROWTH_LIMIT_ENV]: '37' })).toBe(37);

    for (const invalid of ['0', '-1', ' 4', '4 ', '01', '1.5', '9007199254740992']) {
      expect(() =>
        bankLedgerGrowthHardLimitFromEnv({ [BANK_LEDGER_GROWTH_LIMIT_ENV]: invalid }),
      ).toThrow(/positive safe integer/);
    }
  });

  it('installs an exact accumulator and deferred commit ceiling under the bootstrap lock', () => {
    const folded = BANK_LEDGER_GROWTH_BUDGET_SCHEMA.replace(/\s+/g, ' ');
    const lock = folded.indexOf('LOCK TABLE "public".bank_ledger IN SHARE ROW EXCLUSIVE MODE');
    const createCommitTrigger = folded.indexOf(
      'CREATE CONSTRAINT TRIGGER bank_ledger_growth_budget_commit',
    );
    const createInsertTrigger = folded.indexOf('CREATE TRIGGER bank_ledger_growth_budget_insert');
    const exactSeed = folded.indexOf('SELECT TRUE, COUNT(*)::bigint');

    expect(folded).toContain('CREATE TABLE IF NOT EXISTS "public".bank_ledger_growth_budget');
    expect(folded).toContain('CREATE TABLE IF NOT EXISTS "public".bank_ledger_growth_pending');
    expect(folded).toContain(
      'CREATE OR REPLACE FUNCTION "public".accumulate_bank_ledger_growth_budget()',
    );
    expect(folded).toContain(
      'CREATE OR REPLACE FUNCTION "public".enforce_bank_ledger_growth_budget()',
    );
    expect(folded.split('SET search_path = pg_catalog, "public", pg_temp')).toHaveLength(3);
    expect(folded).toContain('REFERENCING NEW TABLE AS inserted_bank_ledger_rows');
    expect(folded).toContain('FOR EACH STATEMENT');
    expect(folded).toContain('SELECT count(*)::bigint INTO inserted_rows');
    expect(folded).toContain('VALUES (pg_catalog.pg_current_xact_id(), inserted_rows)');
    expect(folded).toContain('DEFERRABLE INITIALLY DEFERRED');
    expect(folded).toContain('DELETE FROM "public".bank_ledger_growth_pending');
    expect(folded).toContain('committed_rows + attempted_rows <= hard_limit_rows');
    expect(folded).toContain('tgrelid = \'"public".bank_ledger\'::pg_catalog.regclass');
    expect(folded).toContain("AND tgenabled = 'O' AND tgtype = 4");
    expect(folded).toContain(
      "AND tgnargs = 0 AND pg_catalog.octet_length(tgargs) = 0 AND tgattr::text = '' AND tgqual IS NULL",
    );
    expect(folded).toContain("AND tgnewtable = 'inserted_bank_ledger_rows'");
    expect(folded).toContain(
      'tgrelid = \'"public".bank_ledger_growth_pending\'::pg_catalog.regclass',
    );
    expect(folded).toContain("AND tgenabled = 'O' AND tgtype = 21");
    expect(folded.split('AND tgqual IS NULL')).toHaveLength(3);
    expect(folded).toContain('AND tgconstraint <> 0 AND tgdeferrable AND tginitdeferred');
    expect(folded).toContain(
      'IF budget_initialized AND (NOT valid_insert_trigger OR NOT valid_commit_trigger)',
    );
    expect(folded).toContain(
      "MESSAGE = 'initialized bank ledger growth budget is missing an enforcement trigger'",
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(createCommitTrigger);
    expect(createCommitTrigger).toBeLessThan(createInsertTrigger);
    expect(createInsertTrigger).toBeLessThan(exactSeed);
    expect(folded).toContain("ERRCODE = 'P0001'");
    expect(folded).toContain("CONSTRAINT = 'bank_ledger_growth_hard_limit'");
    expect(folded).not.toMatch(/nextval|currval|last_value/i);

    expect(bankLedgerGrowthBudgetSchema('isolated_test')).toContain(
      '"isolated_test".bank_ledger_growth_budget',
    );
    expect(() => bankLedgerGrowthBudgetSchema('public; DROP TABLE bank_ledger')).toThrow(
      /simple lowercase identifier/,
    );
  });

  it('converts only the trigger fixed identity and exact JSON evidence', () => {
    expect(BANK_LEDGER_GROWTH_LIMIT_SQLSTATE).toBe('P0001');
    expect(BANK_LEDGER_GROWTH_LIMIT_CONSTRAINT).toBe('bank_ledger_growth_hard_limit');
    const pgError = {
      code: BANK_LEDGER_GROWTH_LIMIT_SQLSTATE,
      constraint: BANK_LEDGER_GROWTH_LIMIT_CONSTRAINT,
      detail: JSON.stringify({
        committed_rows: '9999999',
        attempted_rows: '2',
        hard_limit_rows: '10000000',
      }),
    };

    const converted = bankLedgerGrowthLimitFromError(pgError);
    expect(converted).toBeInstanceOf(BankLedgerGrowthLimitExceeded);
    expect(converted).toMatchObject({
      committedRows: 9_999_999,
      attemptedRows: 2,
      hardLimitRows: 10_000_000,
      cause: pgError,
    });
    expect(bankLedgerGrowthBudgetReadout()).toEqual({
      committedRows: 9_999_999,
      hardLimitRows: 10_000_000,
    });

    expect(bankLedgerGrowthLimitFromError({ ...pgError, code: '23505' })).toBeNull();
    expect(bankLedgerGrowthLimitFromError({ ...pgError, constraint: 'other' })).toBeNull();
    expect(() => bankLedgerGrowthLimitFromError({ ...pgError, detail: '{}' })).toThrow(
      /malformed trigger evidence/,
    );
    for (const malformedDetail of [
      { committed_rows: '-1', attempted_rows: '2', hard_limit_rows: '10000000' },
      { committed_rows: '9999999', attempted_rows: 'not-an-integer', hard_limit_rows: '10000000' },
      { committed_rows: '9999999', attempted_rows: '2', hard_limit_rows: '1.5' },
    ]) {
      expect(() =>
        bankLedgerGrowthLimitFromError({
          ...pgError,
          detail: JSON.stringify(malformedDetail),
        }),
      ).toThrow(/malformed trigger evidence/);
    }
  });

  it('ignores observations that do not match the configured durable limit', () => {
    observeBankLedgerGrowthBudget(21);
    observeBankLedgerGrowthBudget(99, 101);
    expect(bankLedgerGrowthBudgetReadout().committedRows).toBe(21);
  });
});
