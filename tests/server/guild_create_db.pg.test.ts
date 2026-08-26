// Executed PostgreSQL proof for the atomic paid-guild transaction. The PG16
// CI shard supplies TEST_DATABASE_URL; local runs without it skip. Everything
// lives in a private search_path because the exercised SQL is intentionally
// unqualified and teardown must never touch a developer's game schema.

import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PaidGuildCreateArgs, PaidGuildCreateResult } from '../../server/guild_create_db';
import type { StorageAppliedEffect } from '../../server/storage_purchase_db';
import type { CharacterState } from '../../src/sim/character_state';

const url = process.env.TEST_DATABASE_URL ?? '';
const d = url === '' ? describe.skip : describe;
const SCHEMA = 'guild_create_pg_test';
const ACCOUNT_ID = 7;
const CHARACTER_ID = 41;
const LEASE_NONCE = 'guild-create-lease';
const TAKEOVER_NONCE = 'guild-create-takeover';
const FEE_BATCH_KEY = 'ledger:guild-create:pg';
const STORAGE_KEY = 'storage:guild-create:pg';
const STORAGE_TOKEN = '00000000-0000-4000-8000-000000000041';

function characterState(copper: number): CharacterState {
  return {
    level: 23,
    xp: 100,
    copper,
    hp: 100,
    resource: 100,
    pos: { x: 1, z: 2 },
    facing: 0,
    equipment: {},
    inventory: [],
    questLog: [],
    questsDone: [],
  } as CharacterState;
}

d('atomic paid guild creation against real PostgreSQL', () => {
  let pool: Pool;
  let realm: string;
  let leaseHolder: string;
  let guildFeeCopper: number;
  let createPaidGuildWithLeaderAtomic: (
    deps: Parameters<
      typeof import('../../server/guild_create_db').createPaidGuildWithLeaderAtomic
    >[0],
    args: PaidGuildCreateArgs,
  ) => Promise<PaidGuildCreateResult>;

  const storageEffect = (): Readonly<StorageAppliedEffect> =>
    Object.freeze({
      realm,
      accountId: ACCOUNT_ID,
      characterId: CHARACTER_ID,
      itemId: 'strongbox_rung_01',
      expectedCostClaudium: 100,
      idempotencyKey: STORAGE_KEY,
      spendClaimToken: STORAGE_TOKEN,
      purchasedSlotsBefore: 0,
      purchasedSlotsAfter: 1,
    });

  const args = (name: string): PaidGuildCreateArgs => ({
    name,
    characterId: CHARACTER_ID,
    accountId: ACCOUNT_ID,
    level: 23,
    state: characterState(90_000),
    leaseNonce: LEASE_NONCE,
    storageEffects: Object.freeze([storageEffect()]),
    ledgerEffects: undefined,
    fee: Object.freeze({
      batchKey: FEE_BATCH_KEY,
      chargedCopper: guildFeeCopper,
      purseCopperDelta: -guildFeeCopper,
    }),
  });

  const create = (name: string) =>
    createPaidGuildWithLeaderAtomic(
      {
        pool,
        bustGuildRoster: () => {},
      },
      args(name),
    );

  beforeAll(async () => {
    const pg = await import('pg');
    const guildCreate = await import('../../server/guild_create_db');
    const db = await import('../../server/db');
    const { BANK_LEDGER_BATCH_RECEIPTS_SCHEMA } = await import('../../server/bank_ledger_batch_db');
    const { ADMIN_GUILDS_SCHEMA } = await import('../../server/admin_guilds_schema');
    const storage = await import('../../server/storage_purchase_db');
    const guildBank = await import('../../src/sim/guild_bank');
    realm = (await import('../../server/realm')).REALM;
    leaseHolder = db.PROCESS_LEASE_HOLDER;
    guildFeeCopper = guildBank.GUILD_CREATION_FEE_COPPER;
    createPaidGuildWithLeaderAtomic = guildCreate.createPaidGuildWithLeaderAtomic;

    const admin = new pg.Pool({ connectionString: url, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();

    pool = new pg.Pool({
      connectionString: url,
      max: 4,
      options: `-c search_path=${SCHEMA}`,
      application_name: SCHEMA,
    });
    const currentSchema = await pool.query('SELECT current_schema() AS name');
    if (currentSchema.rows[0]?.name !== SCHEMA) {
      throw new Error('guild-create PG test did not enter its private schema');
    }
    await pool.query('CREATE TABLE accounts (id INT PRIMARY KEY)');
    await pool.query(`CREATE TABLE characters (
      id INT PRIMARY KEY,
      account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      level INT NOT NULL,
      state JSONB NOT NULL
    )`);
    await pool.query(`CREATE TABLE character_leases (
      character_id INT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      realm TEXT NOT NULL,
      holder TEXT NOT NULL,
      nonce TEXT NOT NULL,
      account_id INT,
      acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )`);
    await pool.query(`CREATE TABLE guilds (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      realm TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query('CREATE UNIQUE INDEX guilds_realm_name ON guilds(realm, name)');
    await pool.query(`CREATE TABLE guild_members (
      character_id INT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      guild_id INT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      rank TEXT NOT NULL DEFAULT 'member',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE guild_banks (
      guild_id INT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
      realm TEXT NOT NULL,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(`CREATE TABLE bank_ledger (
      id BIGSERIAL PRIMARY KEY,
      realm TEXT NOT NULL,
      character_id INT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
      account_id INT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      op TEXT NOT NULL,
      item_id TEXT,
      count INT,
      instance JSONB,
      copper_delta BIGINT NOT NULL DEFAULT 0,
      purchased_slots_after INT NOT NULL,
      container TEXT NOT NULL DEFAULT 'personal',
      container_id BIGINT,
      counterparty_copper_delta BIGINT,
      counterparty_count INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await pool.query(BANK_LEDGER_BATCH_RECEIPTS_SCHEMA);
    await pool.query(storage.STORAGE_PURCHASE_SCHEMA);
    await pool.query(ADMIN_GUILDS_SCHEMA);
  }, 30_000);

  beforeEach(async () => {
    await pool.query(`TRUNCATE
      guild_moderation_actions,
      bank_ledger_batch_receipts,
      bank_ledger,
      storage_purchase_applied_receipts,
      storage_purchases,
      guild_banks,
      guild_members,
      guilds,
      character_leases,
      characters,
      accounts
      RESTART IDENTITY CASCADE`);
    await pool.query('INSERT INTO accounts (id) VALUES ($1)', [ACCOUNT_ID]);
    await pool.query(
      'INSERT INTO characters (id, account_id, level, state) VALUES ($1, $2, $3, $4::jsonb)',
      [CHARACTER_ID, ACCOUNT_ID, 23, JSON.stringify(characterState(100_000))],
    );
    await pool.query(
      `INSERT INTO character_leases
         (character_id, realm, holder, nonce, account_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + interval '90 seconds')`,
      [CHARACTER_ID, realm, leaseHolder, LEASE_NONCE, ACCOUNT_ID],
    );
    await pool.query(
      `INSERT INTO storage_purchases
         (realm, account_id, character_id, item_id, expected_cost_claudium,
          idempotency_key, spend_claim_token, spend_claim_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '15 seconds')`,
      [realm, ACCOUNT_ID, CHARACTER_ID, 'strongbox_rung_01', 100, STORAGE_KEY, STORAGE_TOKEN],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.end();
    const { Pool: AdminPool } = await import('pg');
    const admin = new AdminPool({ connectionString: url, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  });

  it('commits the founder, fenced state, fee receipt, carried storage effect, and empty bank', async () => {
    const result = await create('PG Iron Vanguard');
    expect(result).toMatchObject({
      durability: 'committed',
      feeBatchKey: FEE_BATCH_KEY,
    });
    if (result.durability !== 'committed') throw new Error('guild create did not commit');

    const guild = await pool.query(
      `SELECT g.id, g.name, g.realm, gm.character_id, gm.rank, gb.data,
              (c.state->>'copper')::int AS copper
         FROM guilds g
         JOIN guild_members gm ON gm.guild_id = g.id
         JOIN guild_banks gb ON gb.guild_id = g.id
         JOIN characters c ON c.id = gm.character_id
        WHERE g.id = $1`,
      [result.guildId],
    );
    expect(guild.rows).toEqual([
      {
        id: result.guildId,
        name: 'PG Iron Vanguard',
        realm,
        character_id: CHARACTER_ID,
        rank: 'leader',
        data: { treasury: 0, inventory: [], purchasedSlots: 0 },
        copper: 90_000,
      },
    ]);

    const ledger = await pool.query(
      `SELECT op, item_id, copper_delta, purchased_slots_after, container,
              container_id, counterparty_copper_delta, counterparty_count
         FROM bank_ledger ORDER BY id`,
    );
    expect(ledger.rows.map((row) => ({ ...row, copper_delta: Number(row.copper_delta) }))).toEqual([
      {
        op: 'create_fee',
        item_id: null,
        copper_delta: -guildFeeCopper,
        purchased_slots_after: 0,
        container: 'guild',
        container_id: String(result.guildId),
        counterparty_copper_delta: String(-guildFeeCopper),
        counterparty_count: 0,
      },
      {
        op: 'buy_slots',
        item_id: 'strongbox_rung_01',
        copper_delta: 0,
        purchased_slots_after: 1,
        container: 'personal',
        container_id: null,
        counterparty_copper_delta: null,
        counterparty_count: null,
      },
    ]);
    expect(
      await pool.query(
        'SELECT batch_key, realm, character_id, account_id, row_count FROM bank_ledger_batch_receipts',
      ),
    ).toMatchObject({
      rows: [
        {
          batch_key: FEE_BATCH_KEY,
          realm,
          character_id: CHARACTER_ID,
          account_id: ACCOUNT_ID,
          row_count: 1,
        },
      ],
    });
    expect(
      await pool.query(
        `SELECT idempotency_key, purchased_slots_before, purchased_slots_after
           FROM storage_purchase_applied_receipts`,
      ),
    ).toMatchObject({
      rows: [
        {
          idempotency_key: STORAGE_KEY,
          purchased_slots_before: 0,
          purchased_slots_after: 1,
        },
      ],
    });
    expect((await pool.query('SELECT count(*)::int AS n FROM storage_purchases')).rows[0].n).toBe(
      0,
    );
  });

  it('rolls every artifact back when a concurrent lease takeover wins before the fence', async () => {
    const blocker = await pool.connect();
    let blockerOpen = false;
    try {
      await blocker.query('BEGIN');
      blockerOpen = true;
      await blocker.query('SELECT id FROM accounts WHERE id = $1 FOR UPDATE', [ACCOUNT_ID]);
      const pending = create('PG Lease Loser');

      let sawAccountWait = false;
      for (let attempt = 0; attempt < 100 && !sawAccountWait; attempt++) {
        const waiting = await pool.query(
          `SELECT EXISTS (
             SELECT 1 FROM pg_stat_activity
              WHERE application_name = $1
                AND wait_event_type = 'Lock'
                AND query LIKE '%SELECT id FROM accounts WHERE id = $1 FOR KEY SHARE%'
           ) AS waiting`,
          [SCHEMA],
        );
        sawAccountWait = waiting.rows[0].waiting === true;
        if (!sawAccountWait) await new Promise<void>((resolve) => setTimeout(resolve, 5));
      }

      await blocker.query('UPDATE character_leases SET nonce = $2 WHERE character_id = $1', [
        CHARACTER_ID,
        TAKEOVER_NONCE,
      ]);
      await blocker.query('COMMIT');
      blockerOpen = false;

      await expect(pending).resolves.toEqual({
        durability: 'not_committed',
        reason: 'lease_lost',
      });
      expect(sawAccountWait).toBe(true);
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK');
      blocker.release();
    }

    const artifactCounts = await pool.query(`
      SELECT
        (SELECT count(*)::int FROM guilds) AS guilds,
        (SELECT count(*)::int FROM guild_members) AS members,
        (SELECT count(*)::int FROM guild_banks) AS banks,
        (SELECT count(*)::int FROM bank_ledger) AS ledger,
        (SELECT count(*)::int FROM bank_ledger_batch_receipts) AS ledger_receipts,
        (SELECT count(*)::int FROM storage_purchase_applied_receipts) AS storage_receipts
    `);
    expect(artifactCounts.rows[0]).toEqual({
      guilds: 0,
      members: 0,
      banks: 0,
      ledger: 0,
      ledger_receipts: 0,
      storage_receipts: 0,
    });
    expect(
      (
        await pool.query("SELECT (state->>'copper')::int AS copper FROM characters WHERE id = $1", [
          CHARACTER_ID,
        ])
      ).rows[0].copper,
    ).toBe(100_000);
    expect((await pool.query('SELECT count(*)::int AS n FROM storage_purchases')).rows[0].n).toBe(
      1,
    );
  }, 15_000);
});
