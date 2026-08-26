// Transaction wiring for the bounded bank-ledger outbox. The pg pool and boot
// client are recording fakes, while the real receipt writer runs so ordering,
// lost-COMMIT verification, fencing, and boot DDL stay pinned end to end.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgres://test/test';
  const pool = { query: vi.fn(), connect: vi.fn() };
  const bootCalls: string[] = [];
  const bootQuery = vi.fn((sql: string, values?: unknown[]) => {
    bootCalls.push(String(sql));
    if (String(sql).includes("to_regclass('public.rate_limits')")) {
      return Promise.resolve({ rows: [{ reg: 'public.rate_limits' }], rowCount: 1 });
    }
    if (
      String(sql).includes('SELECT data FROM world_state WHERE key = $1') &&
      values?.[0] === 'market_backfill_done'
    ) {
      return Promise.resolve({ rows: [{ data: {} }], rowCount: 1 });
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
  return { pool, bootCalls, bootQuery };
});

vi.mock('pg', () => ({
  Pool: vi.fn(function Pool() {
    return h.pool;
  }),
  Client: vi.fn(function Client() {
    return {
      connect: vi.fn(() => Promise.resolve()),
      query: h.bootQuery,
      end: vi.fn(() => Promise.resolve()),
    };
  }),
}));

import { BANK_LEDGER_BATCH_RECEIPTS_SCHEMA } from '../../server/bank_ledger_batch_db';
import type { SerializedBankLedgerOutboxRow } from '../../server/bank_ledger_outbox';
import {
  type CharacterSaveAccountLockProof,
  lockCharacterSaveAccountParentOnClient,
} from '../../server/bank_ledger_save_effects_db';
import {
  type BankLedgerSaveEffects,
  ensureSchema,
  openMarketWriteGate,
  saveCharacterAndGuildBankState,
  saveCharacterAndMarketState,
  saveCharacterState,
  saveCharacterStateOnClient,
} from '../../server/db';
import { REALM } from '../../server/realm';
import type { StorageAppliedEffect } from '../../server/storage_purchase_db';
import type { CharacterState, MailSave, MarketSave } from '../../src/sim/sim';

const OWNER = { realm: REALM, characterId: 42, accountId: 7 } as const;
const ROW: SerializedBankLedgerOutboxRow = {
  realm: OWNER.realm,
  characterId: OWNER.characterId,
  accountId: OWNER.accountId,
  op: 'deposit',
  itemId: 'linen_cloth',
  count: 3,
  instanceJson: null,
  copperDelta: 0,
  purchasedSlotsAfter: 0,
  container: 'personal',
  containerId: null,
  counterpartyCopperDelta: null,
  counterpartyCount: null,
};
const EFFECTS: BankLedgerSaveEffects = {
  owner: OWNER,
  batches: [{ batchKey: 'save.session.1', rows: [ROW], encodedBytes: 256 }],
};
const GUILD_EFFECTS: BankLedgerSaveEffects = {
  owner: OWNER,
  batches: [
    {
      batchKey: 'save.guild.1',
      rows: [{ ...ROW, container: 'guild', containerId: 19 }],
      encodedBytes: 256,
    },
  ],
};
const STORAGE_EFFECT: StorageAppliedEffect = {
  realm: REALM,
  accountId: OWNER.accountId,
  characterId: OWNER.characterId,
  itemId: 'strongbox_rung_01',
  expectedCostClaudium: 100,
  idempotencyKey: 'storage-and-ledger-save',
  spendClaimToken: '00000000-0000-4000-8000-000000000001',
  purchasedSlotsBefore: 0,
  purchasedSlotsAfter: 6,
};
const STATE = {
  level: 7,
  questLog: [],
  questsDone: [],
  inventory: [],
} as unknown as CharacterState;
const MARKET = { listings: [], collections: [], nextListingId: 1 } as MarketSave;
const MAIL = { mail: [], nextMailId: 1 } as unknown as MailSave;

interface ClientOptions {
  characterRows?: number;
  lostCommit?: boolean;
}

function clientStub(options: ClientOptions = {}) {
  const characterRows = options.characterRows ?? 1;
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (/SELECT id FROM accounts/i.test(sql)) {
      const requested = Array.isArray(values?.[0]) ? OWNER.accountId : Number(values?.[0]);
      return { rows: [{ id: requested }], rowCount: 1 };
    }
    if (/UPDATE characters/i.test(sql)) return { rows: [], rowCount: characterRows };
    if (/FROM storage_purchase_applied_receipts/i.test(sql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/FROM storage_purchases[\s\S]*FOR UPDATE/i.test(sql)) {
      return {
        rows: [
          {
            id: 81,
            realm: STORAGE_EFFECT.realm,
            account_id: STORAGE_EFFECT.accountId,
            character_id: STORAGE_EFFECT.characterId,
            item_id: STORAGE_EFFECT.itemId,
            expected_cost_claudium: STORAGE_EFFECT.expectedCostClaudium,
            idempotency_key: STORAGE_EFFECT.idempotencyKey,
            spend_claim_token: STORAGE_EFFECT.spendClaimToken,
            status: 'pending',
          },
        ],
        rowCount: 1,
      };
    }
    if (/INSERT INTO storage_purchase_applied_receipts/i.test(sql)) {
      return { rows: [{ source_purchase_id: 81 }], rowCount: 1 };
    }
    if (/WITH receipt_input AS/i.test(sql)) {
      const params = values as unknown[];
      const ordinals = params[0] as number[];
      const keys = params[1] as string[];
      const realms = params[2] as string[];
      const characterIds = params[3] as number[];
      const accountIds = params[4] as number[];
      const rowCounts = params[5] as number[];
      const hashes = params[6] as string[];
      const inserted = options.lostCommit ? 0 : rowCounts.reduce((sum, count) => sum + count, 0);
      return {
        rows: ordinals.map((ordinal, index) => ({
          batch_ordinal: ordinal,
          batch_key: keys[index],
          newly_claimed: !options.lostCommit,
          stored_batch_key: keys[index],
          stored_realm: realms[index],
          stored_character_id: characterIds[index],
          stored_account_id: accountIds[index],
          stored_row_count: rowCounts[index],
          stored_payload_sha256: hashes[index],
          inserted_row_count: inserted,
        })),
        rowCount: ordinals.length,
      };
    }
    return { rows: [], rowCount: 1 };
  });
  return { query, release: vi.fn() };
}

function sqlCalls(client: ReturnType<typeof clientStub>): string[] {
  return client.query.mock.calls.map((call) => String(call[0]));
}

function indexOf(sql: readonly string[], pattern: RegExp): number {
  return sql.findIndex((statement) => pattern.test(statement));
}

beforeEach(() => {
  h.pool.query.mockReset();
  h.pool.connect.mockReset();
  h.bootCalls.length = 0;
  h.bootQuery.mockClear();
  openMarketWriteGate();
});

describe('fenced character save ledger effects', () => {
  it('forces a plain save through one transaction and locks the parent before the child', async () => {
    const client = clientStub();
    h.pool.connect.mockResolvedValueOnce(client);

    await expect(
      saveCharacterState(OWNER.characterId, 7, STATE, undefined, [], EFFECTS),
    ).resolves.toBe(true);

    const sql = sqlCalls(client);
    expect(sql[0]).toBe('BEGIN');
    expect(indexOf(sql, /SELECT id FROM accounts/)).toBeLessThan(indexOf(sql, /UPDATE characters/));
    expect(indexOf(sql, /UPDATE characters/)).toBeLessThan(indexOf(sql, /WITH receipt_input AS/));
    expect(indexOf(sql, /WITH receipt_input AS/)).toBeLessThan(indexOf(sql, /^COMMIT/));
    expect(sql.at(-1)).toBe('COMMIT');
    expect(h.pool.query).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('accepts a lost-COMMIT receipt retry after market/mail rows and before COMMIT', async () => {
    const client = clientStub({ lostCommit: true });
    h.pool.connect.mockResolvedValueOnce(client);

    await expect(
      saveCharacterAndMarketState(
        OWNER.characterId,
        7,
        STATE,
        MARKET,
        MAIL,
        'nonce-1',
        undefined,
        undefined,
        [],
        EFFECTS,
      ),
    ).resolves.toBe(true);

    const sql = sqlCalls(client);
    const worlds = sql.flatMap((statement, at) =>
      /INSERT INTO world_state/.test(statement) ? [at] : [],
    );
    const ledger = indexOf(sql, /WITH receipt_input AS/);
    expect(worlds).toHaveLength(2);
    expect(worlds.at(-1)).toBeLessThan(ledger);
    expect(ledger).toBeLessThan(indexOf(sql, /^COMMIT/));
    const ledgerCall = client.query.mock.calls.find((call) =>
      /WITH receipt_input AS/.test(call[0]),
    );
    expect(ledgerCall?.[0]).toContain('FROM bank_ledger_batch_receipts AS existing');
    expect(ledgerCall?.[0]).toContain('JOIN claimed AS c');
    expect(ledgerCall?.[1]?.[1]).toEqual(['save.session.1']);
  });

  it('writes a successful guild book before its ledger prefix', async () => {
    const client = clientStub();
    h.pool.connect.mockResolvedValueOnce(client);
    const guildSave = {
      guildId: 19,
      deltas: [
        {
          op: 'deposit_gold' as const,
          itemId: null,
          count: null,
          instance: null,
          craftedRecipeId: null,
          copperDelta: 25,
          purchasedSlotsBefore: 0,
          purchasedSlotsAfter: 0,
        },
      ],
    };

    await expect(
      saveCharacterAndGuildBankState(
        OWNER.characterId,
        7,
        STATE,
        [guildSave],
        'nonce-1',
        undefined,
        [],
        GUILD_EFFECTS,
      ),
    ).resolves.toBe(true);

    const sql = sqlCalls(client);
    const book = sql.reduce(
      (last, statement, at) => (/INSERT INTO guild_banks/.test(statement) ? at : last),
      -1,
    );
    expect(book).toBeGreaterThan(indexOf(sql, /UPDATE characters/));
    expect(book).toBeLessThan(indexOf(sql, /WITH receipt_input AS/));
    expect(indexOf(sql, /WITH receipt_input AS/)).toBeLessThan(indexOf(sql, /^COMMIT/));
  });

  it('rejects a guild ledger prefix unless the same transaction carries its book', async () => {
    const guildSave = {
      guildId: 20,
      deltas: [],
    };

    await expect(
      saveCharacterState(OWNER.characterId, 7, STATE, 'nonce-1', [], GUILD_EFFECTS),
    ).rejects.toThrow(/matching guild bank save/);
    await expect(
      saveCharacterAndGuildBankState(
        OWNER.characterId,
        7,
        STATE,
        [guildSave],
        'nonce-1',
        undefined,
        [],
        GUILD_EFFECTS,
      ),
    ).rejects.toThrow(/matching guild bank save/);
    await expect(
      saveCharacterAndMarketState(
        OWNER.characterId,
        7,
        STATE,
        MARKET,
        MAIL,
        'nonce-1',
        undefined,
        undefined,
        [],
        GUILD_EFFECTS,
      ),
    ).rejects.toThrow(/matching guild bank save/);

    expect(h.pool.connect).not.toHaveBeenCalled();
    expect(h.pool.query).not.toHaveBeenCalled();
  });

  it('reuses the storage parent lock and writes ledger before storage receipts', async () => {
    const client = clientStub();
    h.pool.connect.mockResolvedValueOnce(client);

    await expect(
      saveCharacterState(OWNER.characterId, 7, STATE, 'nonce-1', [STORAGE_EFFECT], EFFECTS),
    ).resolves.toBe(true);

    const sql = sqlCalls(client);
    expect(sql.filter((statement) => /SELECT id FROM accounts/.test(statement))).toHaveLength(1);
    expect(indexOf(sql, /SELECT id FROM accounts/)).toBeLessThan(indexOf(sql, /UPDATE characters/));
    expect(indexOf(sql, /WITH receipt_input AS/)).toBeLessThan(
      indexOf(sql, /INSERT INTO storage_purchase_applied_receipts/),
    );
    expect(indexOf(sql, /INSERT INTO storage_purchase_applied_receipts/)).toBeLessThan(
      indexOf(sql, /^COMMIT/),
    );
  });

  it('rolls a guild save fence miss back before books or ledger receipts', async () => {
    const client = clientStub({ characterRows: 0 });
    h.pool.connect.mockResolvedValueOnce(client);

    await expect(
      saveCharacterAndGuildBankState(
        OWNER.characterId,
        7,
        STATE,
        [],
        'stale-nonce',
        undefined,
        [],
        EFFECTS,
      ),
    ).resolves.toBe(false);

    const sql = sqlCalls(client);
    expect(sql).toContain('ROLLBACK');
    expect(sql.some((statement) => /guild_banks/.test(statement))).toBe(false);
    expect(sql.some((statement) => /receipt_input/.test(statement))).toBe(false);
    expect(sql.some((statement) => /^COMMIT/.test(statement))).toBe(false);
  });

  it('rejects owner and storage identity mismatches before any database query', async () => {
    await expect(saveCharacterState(41, 7, STATE, undefined, [], EFFECTS)).rejects.toThrow(
      /owner does not match/,
    );

    const mismatchedStorage: StorageAppliedEffect = {
      realm: REALM,
      accountId: OWNER.accountId + 1,
      characterId: OWNER.characterId,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: 'storage-owner-mismatch',
      purchasedSlotsBefore: 0,
      purchasedSlotsAfter: 6,
    };
    await expect(
      saveCharacterState(OWNER.characterId, 7, STATE, undefined, [mismatchedStorage], EFFECTS),
    ).rejects.toThrow(/storage save owners do not match/);

    expect(h.pool.connect).not.toHaveBeenCalled();
    expect(h.pool.query).not.toHaveBeenCalled();
  });

  it('writes the same locked and fenced prefix on a caller-owned client', async () => {
    const client = clientStub();

    await expect(
      saveCharacterStateOnClient(
        client as never,
        OWNER.characterId,
        7,
        STATE,
        'nonce-1',
        [],
        EFFECTS,
      ),
    ).resolves.toBe(true);

    const sql = sqlCalls(client);
    expect(indexOf(sql, /SELECT id FROM accounts/)).toBeLessThan(indexOf(sql, /UPDATE characters/));
    expect(indexOf(sql, /UPDATE characters/)).toBeLessThan(indexOf(sql, /WITH receipt_input AS/));
    expect(sql.some((statement) => /^(?:BEGIN|COMMIT|ROLLBACK)/.test(statement))).toBe(false);
  });

  it('consumes a matching same-client parent-lock proof without a redundant KEY SHARE', async () => {
    const client = clientStub();
    const proof = await lockCharacterSaveAccountParentOnClient(client as never, OWNER.accountId);

    await expect(
      saveCharacterStateOnClient(
        client as never,
        OWNER.characterId,
        7,
        STATE,
        'nonce-1',
        [STORAGE_EFFECT],
        EFFECTS,
        proof,
      ),
    ).resolves.toBe(true);

    const accountLocks = sqlCalls(client).filter((sql) => /SELECT id FROM accounts/.test(sql));
    expect(accountLocks).toHaveLength(1);
    expect(accountLocks[0]).toContain('FOR NO KEY UPDATE');
    expect(accountLocks[0]).not.toContain('FOR KEY SHARE');
  });

  it('rejects forged, cross-client, mismatched, and consumed parent-lock proofs', async () => {
    const ownerClient = clientStub();
    const otherClient = clientStub();
    const proof = await lockCharacterSaveAccountParentOnClient(
      ownerClient as never,
      OWNER.accountId,
    );
    const saveWith = (
      client: ReturnType<typeof clientStub>,
      candidate: CharacterSaveAccountLockProof,
    ) =>
      saveCharacterStateOnClient(
        client as never,
        OWNER.characterId,
        7,
        STATE,
        'nonce-1',
        [],
        EFFECTS,
        candidate,
      );

    await expect(saveWith(otherClient, proof)).rejects.toThrow(/invalid or consumed/);
    await expect(
      saveWith(
        ownerClient,
        Object.freeze({ accountId: OWNER.accountId }) as CharacterSaveAccountLockProof,
      ),
    ).rejects.toThrow(/invalid or consumed/);

    const wrongAccountProof = await lockCharacterSaveAccountParentOnClient(
      ownerClient as never,
      OWNER.accountId + 1,
    );
    await expect(saveWith(ownerClient, wrongAccountProof)).rejects.toThrow(/does not match/);

    await expect(saveWith(ownerClient, proof)).resolves.toBe(true);
    await expect(saveWith(ownerClient, proof)).rejects.toThrow(/invalid or consumed/);
  });
});

describe('bank ledger receipt schema boot wiring', () => {
  it('applies the receipt DDL after core identities under the boot transaction', async () => {
    await ensureSchema();

    const core = h.bootCalls.findIndex((sql) =>
      sql.includes('CREATE TABLE IF NOT EXISTS accounts'),
    );
    const receipts = h.bootCalls.indexOf(BANK_LEDGER_BATCH_RECEIPTS_SCHEMA);
    const commit = h.bootCalls.indexOf('COMMIT');
    expect(core).toBeGreaterThanOrEqual(0);
    expect(core).toBeLessThan(receipts);
    expect(receipts).toBeLessThan(commit);
  });
});
