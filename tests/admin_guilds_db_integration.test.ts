// Opt-in PostgreSQL 16 proof for the guild-name rollout and concurrency rules.
// The default suite stays DB-free; set TEST_DATABASE_URL to exercise real locks,
// triggers, and transaction visibility.

import type { PoolClient } from 'pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_GUILDS_SCHEMA } from '../server/admin_guilds_schema';
import {
  GUILD_NAME_ADVISORY_LOCK_SQL,
  GUILD_NAME_COLLISION_SQL,
  guildNameLockKey,
} from '../server/guild_name_db';

const DB_URL = process.env.TEST_DATABASE_URL;
const SCHEMA = 'admin_guilds_integration_test';
const REALM = 'integration';
const describeDb = DB_URL ? describe : describe.skip;

async function begin(client: PoolClient): Promise<void> {
  await client.query(`SET search_path TO ${SCHEMA}`);
  await client.query('BEGIN');
}

async function lockAndCheck(
  client: PoolClient,
  name: string,
  excludedGuildId: number | null,
): Promise<boolean> {
  await client.query(GUILD_NAME_ADVISORY_LOCK_SQL, [guildNameLockKey(REALM, name)]);
  const collision = await client.query(GUILD_NAME_COLLISION_SQL, [REALM, name, excludedGuildId]);
  return collision.rowCount !== 0;
}

describeDb('admin guild name integrity (real Postgres)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DB_URL, max: 4 });
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pool.query(`CREATE SCHEMA ${SCHEMA}`);
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${SCHEMA}`);
      await client.query(`
        CREATE TABLE accounts (id INT PRIMARY KEY);
        CREATE TABLE guilds (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          realm TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX guilds_realm_name ON guilds(realm, name);
        INSERT INTO accounts VALUES (1);
        INSERT INTO guilds (name, realm) VALUES
          ('Historical Name', '${REALM}'),
          ('HISTORICAL NAME', '${REALM}');
      `);
      await client.query(ADMIN_GUILDS_SCHEMA);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await pool.end();
  });

  it('installs over historical case collisions and guards old-binary writes', async () => {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO ${SCHEMA}`);
      const collisions = await client.query(
        `SELECT count(*)::int AS count
           FROM guilds
          WHERE realm = $1 AND lower(name) = lower($2)`,
        [REALM, 'Historical Name'],
      );
      expect(collisions.rows[0].count).toBe(2);

      await expect(
        client.query('INSERT INTO guilds (name, realm) VALUES ($1, $2)', [
          'historical NAME',
          REALM,
        ]),
      ).rejects.toMatchObject({ code: '23505', constraint: 'guilds_realm_lower_name_guard' });

      await client.query(
        `UPDATE guilds SET name = 'Remediated Name'
          WHERE name = 'HISTORICAL NAME' AND realm = $1`,
        [REALM],
      );
      const remaining = await client.query(
        'SELECT name FROM guilds WHERE realm = $1 ORDER BY name',
        [REALM],
      );
      expect(remaining.rows.map((row) => row.name)).toEqual(['Historical Name', 'Remediated Name']);
    } finally {
      client.release();
    }
  });

  it('serializes a trigger-only legacy insert behind a new-writer transaction', async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    const name = 'Mixed Version Race';
    try {
      await begin(first);
      expect(await lockAndCheck(first, name, null)).toBe(false);
      await first.query('INSERT INTO guilds (name, realm) VALUES ($1, $2)', [name, REALM]);

      await begin(second);
      let legacySettled = false;
      const legacyInsert = second
        .query('INSERT INTO guilds (name, realm) VALUES ($1, $2)', [
          name.toLocaleUpperCase('en-US'),
          REALM,
        ])
        .then(
          () => ({ error: null }),
          (error: unknown) => ({ error }),
        )
        .finally(() => {
          legacySettled = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(legacySettled).toBe(false);

      await first.query('COMMIT');
      const legacyOutcome = await legacyInsert;
      expect(legacyOutcome.error).toMatchObject({
        code: '23505',
        constraint: 'guilds_realm_lower_name_guard',
      });
      await second.query('ROLLBACK');

      const rows = await first.query(
        `SELECT count(*)::int AS count
           FROM guilds
          WHERE realm = $1 AND lower(name) = lower($2)`,
        [REALM, name],
      );
      expect(rows.rows[0].count).toBe(1);
    } finally {
      await first.query('ROLLBACK').catch(() => {});
      await second.query('ROLLBACK').catch(() => {});
      first.release();
      second.release();
    }
  });

  it('serializes competing create, create-vs-rename, and rename transactions', async () => {
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await begin(first);
      expect(await lockAndCheck(first, 'Create Race', null)).toBe(false);
      await first.query('INSERT INTO guilds (name, realm) VALUES ($1, $2)', ['Create Race', REALM]);

      await begin(second);
      const competingCreate = lockAndCheck(second, 'CREATE RACE', null);
      await first.query('COMMIT');
      expect(await competingCreate).toBe(true);
      await second.query('ROLLBACK');

      const seeded = await first.query(
        `INSERT INTO guilds (name, realm) VALUES
           ('Rename Source', $1),
           ('Other Source', $1)
         RETURNING id, name`,
        [REALM],
      );
      const renameSourceId = Number(seeded.rows.find((row) => row.name === 'Rename Source')?.id);
      const otherSourceId = Number(seeded.rows.find((row) => row.name === 'Other Source')?.id);

      await begin(first);
      expect(await lockAndCheck(first, 'Rename Target', renameSourceId)).toBe(false);
      await first.query('UPDATE guilds SET name = $1 WHERE id = $2', [
        'Rename Target',
        renameSourceId,
      ]);

      await begin(second);
      const createVsRename = lockAndCheck(second, 'RENAME TARGET', null);
      await first.query('COMMIT');
      expect(await createVsRename).toBe(true);
      await second.query('ROLLBACK');

      await begin(first);
      expect(await lockAndCheck(first, 'Shared Target', renameSourceId)).toBe(false);
      await first.query('UPDATE guilds SET name = $1 WHERE id = $2', [
        'Shared Target',
        renameSourceId,
      ]);

      await begin(second);
      const renameVsRename = lockAndCheck(second, 'SHARED TARGET', otherSourceId);
      await first.query('COMMIT');
      expect(await renameVsRename).toBe(true);
      await second.query('ROLLBACK');

      const duplicateGroups = await first.query(
        `SELECT count(*)::int AS count
           FROM (
             SELECT realm, lower(name)
               FROM guilds
              WHERE realm = $1
                AND lower(name) IN ('create race', 'rename target', 'shared target')
              GROUP BY realm, lower(name)
             HAVING count(*) > 1
           ) collisions`,
        [REALM],
      );
      expect(duplicateGroups.rows[0].count).toBe(0);
    } finally {
      await first.query('ROLLBACK').catch(() => {});
      await second.query('ROLLBACK').catch(() => {});
      first.release();
      second.release();
    }
  });
});
