import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  accountForDiscord,
  claimSwag,
  consumeDiscordOAuthState,
  consumeDiscordPendingLogin,
  createDiscordPendingLogin,
  type DiscordMemberMetaRecord,
  discordFlexRowsForDiscordIds,
  discordIdsWithGuildFlair,
  grantRewardPoints,
  linkDiscordToAccount,
  loadRewardState,
  peekDiscordPendingLogin,
  setDiscordLinkEmail,
  setDiscordMemberMetaBulk,
} from '../server/discord_db';

// discord_db functions take the pg `pool` as an argument, so a fake pool (no
// vi.mock needed) drives every branch. The fake routes by normalized SQL and
// lets each test script row results; pool.connect() returns a client sharing the
// same router so the transactional paths (grant/claim) run for real.
type Result = { rows: any[]; rowCount: number };
type Handler = (sql: string, params: any[]) => Result;

function makePool(handler: Handler) {
  const calls: { sql: string; params: any[] }[] = [];
  const query = (sql: string, params: any[] = []) => {
    const s = String(sql).replace(/\s+/g, ' ').trim();
    calls.push({ sql: s, params });
    return Promise.resolve(handler(s, params));
  };
  const client = { query, release: () => {} };
  const pool: any = { query, connect: () => Promise.resolve(client) };
  return { pool, calls, didRun: (frag: string) => calls.some((c) => c.sql.includes(frag)) };
}

const NONE: Result = { rows: [], rowCount: 0 };

describe('linkDiscordToAccount', () => {
  it('refuses when the discord id already belongs to a different account', async () => {
    const { pool, didRun } = makePool((s) => {
      if (s.includes('SELECT account_id FROM discord_links WHERE discord_user_id'))
        return { rows: [{ account_id: 99 }], rowCount: 1 };
      return NONE;
    });
    const ok = await linkDiscordToAccount(pool, 1, {
      discordUserId: '80351110224678912',
      username: 'x',
      avatar: null,
      email: null,
      guildMember: true,
    });
    expect(ok).toBe(false);
    // No INSERT attempted once a foreign owner is detected.
    expect(didRun('INSERT INTO discord_links')).toBe(false);
  });

  it('links when the discord id is free (or already this account)', async () => {
    const { pool, didRun } = makePool((s) => {
      if (s.includes('SELECT account_id FROM discord_links WHERE discord_user_id')) return NONE;
      if (s.includes('INSERT INTO discord_links')) return { rows: [], rowCount: 1 };
      return NONE;
    });
    const ok = await linkDiscordToAccount(pool, 1, {
      discordUserId: '80351110224678912',
      username: 'maxp',
      avatar: 'abc',
      email: null,
      guildMember: true,
    });
    expect(ok).toBe(true);
    expect(didRun('INSERT INTO discord_links')).toBe(true);
  });

  it('treats a unique-violation race as already-owned (false, not a throw)', async () => {
    const { pool } = makePool((s) => {
      if (s.includes('SELECT account_id FROM discord_links WHERE discord_user_id')) return NONE;
      if (s.includes('INSERT INTO discord_links')) {
        const err: any = new Error('dup');
        err.code = '23505';
        throw err;
      }
      return NONE;
    });
    await expect(
      linkDiscordToAccount(pool, 1, {
        discordUserId: '80351110224678912',
        username: 'x',
        avatar: null,
        email: null,
        guildMember: false,
      }),
    ).resolves.toBe(false);
  });

  it('persists the captured Discord email in the INSERT + upsert', async () => {
    const { pool, calls } = makePool((s) => {
      if (s.includes('SELECT account_id FROM discord_links WHERE discord_user_id')) return NONE;
      if (s.includes('INSERT INTO discord_links')) return { rows: [], rowCount: 1 };
      return NONE;
    });
    await linkDiscordToAccount(pool, 1, {
      discordUserId: '80351110224678912',
      username: 'maxp',
      avatar: 'abc',
      email: 'maxp@example.com',
      guildMember: true,
    });
    const insert = calls.find((c) => c.sql.includes('INSERT INTO discord_links'));
    expect(insert).toBeTruthy();
    // The column list carries discord_email, the upsert COALESCEs it so a later
    // no-email grant cannot wipe a stored address, and the address is a bound param.
    expect(insert!.sql).toContain('discord_email');
    expect(insert!.sql).toContain('COALESCE(EXCLUDED.discord_email, discord_links.discord_email)');
    expect(insert!.params).toContain('maxp@example.com');
  });

  it('resets the bot-pushed guild meta when the link repoints at a different Discord id', async () => {
    const { pool, calls } = makePool((s) => {
      if (s.includes('SELECT account_id FROM discord_links WHERE discord_user_id')) return NONE;
      if (s.includes('INSERT INTO discord_links')) return { rows: [], rowCount: 1 };
      return NONE;
    });
    await linkDiscordToAccount(pool, 1, {
      discordUserId: '80351110224678912',
      username: 'maxp',
      avatar: null,
      email: null,
      guildMember: true,
    });
    const insert = calls.find((c) => c.sql.includes('INSERT INTO discord_links'));
    // discord_role and discord_joined_at belong to the OLD Discord identity, so
    // the upsert must reset both to NULL when the id changes (a same-id relink
    // keeps them). Without this a relinked account keeps the previous user's
    // staff flair until the next bot sync happens to cover the new id.
    expect(insert!.sql).toContain(
      'discord_role = CASE WHEN discord_links.discord_user_id = EXCLUDED.discord_user_id THEN discord_links.discord_role ELSE NULL END',
    );
    expect(insert!.sql).toContain(
      'discord_joined_at = CASE WHEN discord_links.discord_user_id = EXCLUDED.discord_user_id THEN discord_links.discord_joined_at ELSE NULL END',
    );
  });
});

describe('discordIdsWithGuildFlair', () => {
  it('selects only links still flagged as guild member or carrying a role key', async () => {
    const { pool, calls } = makePool((s) =>
      s.includes('SELECT discord_user_id FROM discord_links')
        ? { rows: [{ discord_user_id: 'u1' }, { discord_user_id: 'u2' }], rowCount: 2 }
        : NONE,
    );
    expect(await discordIdsWithGuildFlair(pool)).toEqual(['u1', 'u2']);
    const q = calls.find((c) => c.sql.includes('SELECT discord_user_id FROM discord_links'));
    // The WHERE is what keeps the list small AND what scopes the bot's
    // departed-member clearing to links that actually have something to clear.
    expect(q!.sql).toContain('WHERE guild_member = TRUE OR discord_role IS NOT NULL');
  });

  it('returns an empty list when nothing is flagged', async () => {
    const { pool } = makePool(() => NONE);
    expect(await discordIdsWithGuildFlair(pool)).toEqual([]);
  });
});

describe('setDiscordLinkEmail', () => {
  it('updates the stored Discord email when a fresh grant provides one', async () => {
    const { pool, calls, didRun } = makePool(() => ({ rows: [], rowCount: 1 }));
    await setDiscordLinkEmail(pool, 7, 'user@example.com');
    expect(didRun('UPDATE discord_links SET discord_email')).toBe(true);
    const update = calls.find((c) => c.sql.includes('UPDATE discord_links SET discord_email'));
    expect(update!.params).toEqual([7, 'user@example.com']);
  });

  it('is a no-op when the grant carried no email (never wipes a stored one)', async () => {
    const { pool, didRun } = makePool(() => ({ rows: [], rowCount: 1 }));
    await setDiscordLinkEmail(pool, 7, null);
    expect(didRun('UPDATE discord_links')).toBe(false);
  });
});

describe('accountForDiscord', () => {
  it('returns the owning account or null', async () => {
    const { pool } = makePool((s) =>
      s.includes('SELECT account_id FROM discord_links WHERE discord_user_id')
        ? { rows: [{ account_id: 7 }], rowCount: 1 }
        : NONE,
    );
    expect(await accountForDiscord(pool, '80351110224678912')).toBe(7);
    const empty = makePool(() => NONE);
    expect(await accountForDiscord(empty.pool, '80351110224678912')).toBeNull();
  });
});

describe('consumeDiscordOAuthState', () => {
  it('returns the row on a live state and null on a missing/expired one', async () => {
    const row = {
      state: 'st',
      code_verifier: 'v',
      mode: 'login',
      account_id: null,
      redirect_to: null,
    };
    const live = makePool((s) =>
      s.includes('DELETE FROM discord_oauth_states') ? { rows: [row], rowCount: 1 } : NONE,
    );
    expect(await consumeDiscordOAuthState(live.pool, 'st')).toEqual(row);
    const dead = makePool(() => NONE);
    expect(await consumeDiscordOAuthState(dead.pool, 'st')).toBeNull();
  });
});

describe('grantRewardPoints idempotency', () => {
  it('skips the balance update when the dedupe key was already granted', async () => {
    const { pool, didRun } = makePool((s) => {
      if (s.includes('INSERT INTO reward_ledger') && s.includes('ON CONFLICT')) return NONE; // already granted
      if (s.includes('SELECT points, lifetime_points FROM reward_points'))
        return { rows: [{ points: '250', lifetime_points: '250' }], rowCount: 1 };
      return NONE;
    });
    const state = await grantRewardPoints(pool, 1, 250, 'link', 'link:1');
    expect(state).toEqual({ points: 250, lifetimePoints: 250 });
    // The UPSERT into reward_points must NOT run on a duplicate grant.
    expect(didRun('INSERT INTO reward_points')).toBe(false);
  });

  it('credits both spendable and lifetime on a fresh grant', async () => {
    const { pool, didRun } = makePool((s) => {
      if (s.includes('INSERT INTO reward_ledger') && s.includes('ON CONFLICT'))
        return { rows: [{ id: 1 }], rowCount: 1 };
      if (s.includes('INSERT INTO reward_points'))
        return { rows: [{ points: '300', lifetime_points: '300' }], rowCount: 1 };
      return NONE;
    });
    const state = await grantRewardPoints(pool, 1, 300, 'guild_member', 'guild:1');
    expect(state).toEqual({ points: 300, lifetimePoints: 300 });
    expect(didRun('INSERT INTO reward_points')).toBe(true);
  });
});

describe('claimSwag', () => {
  it('reports already-claimed when the unique claim row conflicts', async () => {
    const { pool } = makePool(
      (s) => (s.includes('INSERT INTO swag_claims') ? NONE : NONE), // ON CONFLICT DO NOTHING -> 0 rows
    );
    expect(await claimSwag(pool, 1, 'title_discordian', 0)).toEqual({
      ok: false,
      reason: 'claimed',
    });
  });

  it('reports insufficient points when the guarded deduction fails', async () => {
    const { pool } = makePool((s) => {
      if (s.includes('INSERT INTO swag_claims')) return { rows: [{ id: 1 }], rowCount: 1 };
      if (s.includes('UPDATE reward_points SET points = points -')) return NONE; // points < cost
      return NONE;
    });
    expect(await claimSwag(pool, 1, 'chroma_blurple', 1000)).toEqual({
      ok: false,
      reason: 'points',
    });
  });

  it('succeeds when the claim is new and points cover the cost', async () => {
    const { pool, didRun } = makePool((s) => {
      if (s.includes('INSERT INTO swag_claims')) return { rows: [{ id: 1 }], rowCount: 1 };
      if (s.includes('UPDATE reward_points SET points = points -'))
        return { rows: [{ points: '500' }], rowCount: 1 };
      return NONE;
    });
    const res = await claimSwag(pool, 1, 'chroma_blurple', 1000);
    expect(res).toEqual({ ok: true, reason: 'ok', points: 500 });
    expect(didRun('INSERT INTO reward_ledger')).toBe(true); // spend is audited
  });

  it('claims a free item without touching the points balance', async () => {
    const { pool, didRun } = makePool((s) => {
      if (s.includes('INSERT INTO swag_claims')) return { rows: [{ id: 1 }], rowCount: 1 };
      if (s.includes('SELECT points FROM reward_points'))
        return { rows: [{ points: '0' }], rowCount: 1 };
      return NONE;
    });
    const res = await claimSwag(pool, 1, 'title_discordian', 0);
    expect(res.ok).toBe(true);
    expect(didRun('UPDATE reward_points SET points = points -')).toBe(false);
  });
});

describe('loadRewardState', () => {
  it('defaults to zeros when no row exists', async () => {
    const { pool } = makePool(() => NONE);
    expect(await loadRewardState(pool, 1)).toEqual({ points: 0, lifetimePoints: 0 });
  });
});

// ---------------------------------------------------------------------------
// The two Phase 4 set-based reads/writes. Both exist to make the bot's sweep
// cost O(1) statements per request instead of O(members), so the statement COUNT
// off makePool's `calls` array is the load-bearing assertion in each block: a
// hidden per-item loop dressed up as "batched" fails these, not just a text pin.
// ---------------------------------------------------------------------------

/** A member-meta record, built fresh per call (never reuse one across assertions). */
function metaRecord(overrides: Partial<DiscordMemberMetaRecord> = {}): DiscordMemberMetaRecord {
  return {
    discordUserId: 'u1',
    nickname: 'Nick',
    joinedAtMs: 1_700_000_000_000,
    roleKey: 'mods',
    ...overrides,
  };
}

describe('setDiscordMemberMetaBulk', () => {
  const counted = (changed: string, skipped: string, unapplied: string[]): Result => ({
    rows: [{ changed, skipped, unapplied }],
    rowCount: 1,
  });

  it('issues exactly ONE statement for one record and ONE for a thousand', async () => {
    // The whole point of the phase: a 1000-member push used to be 1000 serial
    // UPDATEs. Counting off `calls` is what makes this claim real; a text pin on
    // the unnest would still pass if the function looped and ran it per record.
    const one = makePool(() => counted('1', '0', []));
    await setDiscordMemberMetaBulk(one.pool, [metaRecord()]);
    expect(one.calls).toHaveLength(1);

    const many = makePool(() => counted('1000', '0', []));
    const records = Array.from({ length: 1000 }, (_, i) => metaRecord({ discordUserId: `u${i}` }));
    await setDiscordMemberMetaBulk(many.pool, records);
    expect(many.calls).toHaveLength(1);
    // Non-vacuous: the single statement really did carry all thousand ids.
    expect((many.calls[0].params[0] as string[]).length).toBe(1000);
    expect((many.calls[0].params[0] as string[])[999]).toBe('u999');
  });

  it('issues NO statement at all for an empty record list', async () => {
    const { pool, calls } = makePool(() => counted('0', '0', []));
    expect(await setDiscordMemberMetaBulk(pool, [])).toEqual({
      changed: 0,
      skipped: 0,
      unapplied: [],
    });
    expect(calls).toHaveLength(0);
  });

  it('binds four parallel arrays and converts joinedAtMs to an ISO timestamp', async () => {
    const { pool, calls } = makePool(() => counted('2', '0', []));
    await setDiscordMemberMetaBulk(pool, [
      metaRecord({ discordUserId: 'a', nickname: 'A', joinedAtMs: 0, roleKey: 'mods' }),
      metaRecord({ discordUserId: 'b', nickname: null, joinedAtMs: null, roleKey: null }),
    ]);
    // Four positional arrays, index-aligned. joinedAtMs 0 is a REAL timestamp
    // (the epoch), not a missing value, so it must survive as a timestamp rather
    // than collapsing to null the way a truthiness check would have made it.
    expect(calls[0].params).toEqual([
      ['a', 'b'],
      ['A', null],
      ['1970-01-01T00:00:00.000Z', null],
      ['mods', null],
    ]);
  });

  it('skips unchanged rows via a NULL-safe row comparison in ONE statement', async () => {
    const { pool, calls } = makePool(() => counted('0', '1', []));
    await setDiscordMemberMetaBulk(pool, [metaRecord()]);
    const sql = calls[0].sql;
    // unnest of four parallel arrays is what makes it one statement...
    expect(sql).toContain(
      'unnest($1::text[], $2::text[], $3::timestamptz[], $4::text[]) AS t(discord_user_id, nickname, joined_at, role_key)',
    );
    // ...and IS DISTINCT FROM (not <>) is what makes a NULL-to-NULL column count
    // as unchanged rather than as a difference that rewrites the row forever.
    expect(sql).toContain('IS DISTINCT FROM');
    expect(sql).not.toContain('<>');
    // The comparison must be against the value that would actually be STORED, so
    // the COALESCE rules appear on both the write and the compare.
    expect(sql).toContain(
      'SET discord_username = COALESCE(i.nickname, dl.discord_username), discord_joined_at = COALESCE(i.joined_at, dl.discord_joined_at), discord_role = i.role_key',
    );
  });

  it('drops an out-of-range joinedAtMs to null instead of poisoning the whole batch', async () => {
    // Number.isFinite admits values far past the JS Date range (+/-8.64e15 ms),
    // and new Date(1e20).toISOString() THROWS. The conversion now happens once,
    // up front, for every record, so an unguarded throw would abort all 1000
    // records BEFORE any SQL ran, and the bot would re-send the same poisoned set
    // every sweep forever. The old per-member loop lost only the bad record.
    //
    // THREE records with the bad one in the MIDDLE, on purpose: with the bad
    // record last, "aborts everything" and "skips the bad one" look identical.
    const { pool, calls } = makePool(() => counted('2', '0', []));
    const result = await setDiscordMemberMetaBulk(pool, [
      metaRecord({ discordUserId: 'aaa-first', joinedAtMs: 1_700_000_000_000 }),
      metaRecord({ discordUserId: 'mmm-bad', joinedAtMs: 1e20 }),
      metaRecord({ discordUserId: 'zzz-last', joinedAtMs: 1_700_000_000_001 }),
    ]);

    // It did not throw, the statement still ran, and both good records survived
    // with their real timestamps; only the unusable one became null. Null is the
    // right answer, not a clear: the column is written through COALESCE, so it
    // leaves whatever join date is already stored alone. (Ids are chosen so the
    // deadlock-guard sort keeps the bad one in the middle.)
    expect(calls).toHaveLength(1);
    expect(calls[0].params[0]).toEqual(['aaa-first', 'mmm-bad', 'zzz-last']);
    expect(calls[0].params[2]).toEqual([
      '2023-11-14T22:13:20.000Z',
      null,
      '2023-11-14T22:13:20.001Z',
    ]);
    expect(result).toEqual({ changed: 2, skipped: 0, unapplied: [] });
  });

  it('reports changed, skipped and the unapplied ids, coercing bigint counts', async () => {
    // Postgres hands count(*) back as a bigint STRING through pg; a caller
    // comparing that to a number would silently always disagree.
    const { pool } = makePool(() => counted('3', '2', ['nolink1', 'nolink2']));
    expect(await setDiscordMemberMetaBulk(pool, [metaRecord()])).toEqual({
      changed: 3,
      skipped: 2,
      unapplied: ['nolink1', 'nolink2'],
    });
  });

  it('offers the same id order whatever order the caller supplied (deadlock guard)', async () => {
    // A multi-row UPDATE takes row locks in the order its plan feeds it, so two
    // overlapping pushes presenting the same ids in opposite orders can deadlock
    // and Postgres aborts one. The old per-member loop held one lock per
    // autocommitted statement and could never form a cycle, so this failure mode
    // is one THIS change introduces; sorting is what removes it again.
    const forward = makePool(() => counted('3', '0', []));
    await setDiscordMemberMetaBulk(forward.pool, [
      metaRecord({ discordUserId: 'alpha' }),
      metaRecord({ discordUserId: 'bravo' }),
      metaRecord({ discordUserId: 'charlie' }),
    ]);

    const reversed = makePool(() => counted('3', '0', []));
    await setDiscordMemberMetaBulk(reversed.pool, [
      metaRecord({ discordUserId: 'charlie' }),
      metaRecord({ discordUserId: 'bravo' }),
      metaRecord({ discordUserId: 'alpha' }),
    ]);

    // Same order out of both, and pinned to the literal so "both sorted" cannot
    // be satisfied by both being left in caller order.
    expect(forward.calls[0].params[0]).toEqual(['alpha', 'bravo', 'charlie']);
    expect(reversed.calls[0].params[0]).toEqual(['alpha', 'bravo', 'charlie']);
    // And the SQL keeps the order through to the UPDATE that takes the locks.
    expect(forward.calls[0].sql).toContain('FROM (SELECT * FROM input ORDER BY discord_user_id) i');
  });

  it('de-duplicates repeated ids keeping the LAST occurrence', async () => {
    // The old sequential loop applied every record in order, so the row ended up
    // holding the LAST write. Collapsing to the first would silently change that.
    const { pool, calls } = makePool(() => counted('1', '0', []));
    await setDiscordMemberMetaBulk(pool, [
      metaRecord({ discordUserId: 'dup', nickname: 'first', roleKey: null }),
      metaRecord({ discordUserId: 'other', nickname: 'other' }),
      metaRecord({ discordUserId: 'dup', nickname: 'last', roleKey: 'mods' }),
    ]);
    expect(calls[0].params[0]).toEqual(['dup', 'other']);
    expect(calls[0].params[1]).toEqual(['last', 'other']);
    expect(calls[0].params[3]).toEqual(['mods', 'mods']);
  });
});

describe('discordFlexRowsForDiscordIds', () => {
  const flexRow = (discordUserId: string) => ({
    discord_user_id: discordUserId,
    account_id: 7,
    discord_username: 'coolguy',
    points: '500',
    lifetime_points: '2000',
    character_name: 'Hero',
    character_class: 'warrior',
    character_level: 40,
  });

  it('issues exactly ONE statement for a 1-id batch and ONE for a 200-id batch', async () => {
    // The per-account path costs FOUR round trips per user (link lookup, top
    // character, reward state, link row). This is the pin that says the batch
    // read did not just move that loop server-side.
    const one = makePool(() => ({ rows: [flexRow('u0')], rowCount: 1 }));
    await discordFlexRowsForDiscordIds(one.pool, ['u0'], 'eastbrook');
    expect(one.calls).toHaveLength(1);

    const ids = Array.from({ length: 200 }, (_, i) => `u${i}`);
    const many = makePool(() => ({ rows: ids.map(flexRow), rowCount: ids.length }));
    await discordFlexRowsForDiscordIds(many.pool, ids, 'eastbrook');
    expect(many.calls).toHaveLength(1);
    expect(many.calls[0].params).toEqual([ids, 'eastbrook']);
  });

  it('issues NO statement for an empty id list', async () => {
    const { pool, calls } = makePool(() => ({ rows: [flexRow('u0')], rowCount: 1 }));
    expect(await discordFlexRowsForDiscordIds(pool, [], 'eastbrook')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('resolves the whole batch through one ANY() pass with the reward join', async () => {
    const { pool, calls } = makePool(() => ({ rows: [], rowCount: 0 }));
    await discordFlexRowsForDiscordIds(pool, ['u1'], 'eastbrook');
    const sql = calls[0].sql;
    // One set-based membership test, not an id-per-statement lookup.
    expect(sql).toContain('WHERE dl.discord_user_id = ANY($1::text[])');
    // A LEFT JOIN so a linked account with no reward row still answers (zeroed).
    expect(sql).toContain('LEFT JOIN reward_points rp ON rp.account_id = dl.account_id');
    // The top-character rule must stay in lockstep with highestCharacterForAccount
    // in server/db.ts: both endpoints are live, and if they disagree the bot shows
    // a different character depending on which one it called. Pinned on BOTH sides
    // below, not just here.
    expect(sql).toContain(
      "ORDER BY c.level DESC, ((c.state->>'lifetimeXp')::bigint) DESC NULLS LAST, c.id ASC",
    );
    // Only the level is projected out of the character state blob. Selecting
    // `state` itself would drag megabytes of JSONB across for one integer.
    // The jsonb_typeof guard makes the projection TOTAL: a bare ::int cast raises
    // on any character whose state.level is not numeric, and that one corrupt row
    // would fail the read for every OTHER member in the batch. The per-account
    // path tolerates it in TypeScript, so the batch must not be more brittle.
    // All three parts are pinned because each one alone is insufficient:
    // jsonb_typeof still admits a float, and numeric::int still overflows.
    expect(sql).toContain(
      "CASE WHEN jsonb_typeof(c.state->'level') = 'number' AND (c.state->>'level')::numeric BETWEEN -2147483648 AND 2147483647 THEN (c.state->>'level')::numeric::int ELSE c.level END AS level",
    );
  });

  it('maps bigint strings to numbers and leaves an account with no character null', async () => {
    const { pool } = makePool(() => ({
      rows: [
        flexRow('u1'),
        {
          discord_user_id: 'u2',
          account_id: 8,
          discord_username: null,
          points: '0',
          lifetime_points: '0',
          character_name: null,
          character_class: null,
          character_level: null,
        },
      ],
      rowCount: 2,
    }));
    // Built as fresh literals rather than reusing the flexRow() object: the pg
    // fake hands the same object through, so asserting against it would compare
    // the mapped result with its own source.
    expect(await discordFlexRowsForDiscordIds(pool, ['u1', 'u2'], 'eastbrook')).toEqual([
      {
        discord_user_id: 'u1',
        account_id: 7,
        discord_username: 'coolguy',
        points: 500,
        lifetime_points: 2000,
        character_name: 'Hero',
        character_class: 'warrior',
        character_level: 40,
      },
      {
        discord_user_id: 'u2',
        account_id: 8,
        discord_username: null,
        points: 0,
        lifetime_points: 0,
        character_name: null,
        character_class: null,
        character_level: null,
      },
    ]);
  });

  it('orders top-character identically to highestCharacterForAccount in server/db.ts', async () => {
    // A ONE-SIDED pin would be near worthless here. Asserting only that this
    // module still carries the clause leaves an edit on the db.ts side green while
    // the two live endpoints silently disagree about which character is "top", and
    // db.ts is the side more likely to be edited (it owns the characters table).
    // So read both sources and require the SAME ordering, modulo the table alias
    // the batched query has to carry and the per-account query does not.
    //
    // A source-text pin because that is exactly what the claim is: two SQL strings
    // must say the same thing, and server/db.ts cannot be imported into
    // server/discord_db.ts to share a constant (db.ts imports DISCORD_SCHEMA from
    // it, so the dependency runs one way only).
    const { pool, calls } = makePool(() => ({ rows: [], rowCount: 0 }));
    await discordFlexRowsForDiscordIds(pool, ['u1'], 'eastbrook');
    const batchedOrderBy = calls[0].sql
      .slice(calls[0].sql.indexOf('ORDER BY c.level'))
      .slice(
        0,
        "ORDER BY c.level DESC, ((c.state->>'lifetimeXp')::bigint) DESC NULLS LAST, c.id ASC"
          .length,
      )
      .replace(/\bc\./g, '');

    const perAccountSource = readFileSync(
      new URL('../server/db.ts', import.meta.url),
      'utf8',
    ).replace(/\s+/g, ' ');

    expect(batchedOrderBy).toBe(
      "ORDER BY level DESC, ((state->>'lifetimeXp')::bigint) DESC NULLS LAST, id ASC",
    );
    // Non-vacuous on the db.ts side: the same de-aliased clause is really present
    // there, so deleting or reordering it on either side fails this test.
    expect(perAccountSource).toContain(batchedOrderBy);
  });

  it('returns nothing for an id with no link row (never a fabricated payload)', async () => {
    // The query selects FROM discord_links, so an unlinked id contributes no row.
    // Absence IS the unlinked answer; the caller must not receive a zeroed entry.
    const { pool } = makePool(() => ({ rows: [flexRow('linked')], rowCount: 1 }));
    const rows = await discordFlexRowsForDiscordIds(pool, ['linked', 'unlinked'], 'eastbrook');
    expect(rows.map((r) => r.discord_user_id)).toEqual(['linked']);
  });
});

describe('discord pending logins', () => {
  const ROW = {
    token: 'tok',
    discord_user_id: '80351110224678912',
    discord_username: 'Maxp',
    discord_avatar: null,
    guild_member: true,
  };

  it('createDiscordPendingLogin inserts with the verified identity + TTL', async () => {
    const { pool, calls, didRun } = makePool(() => NONE);
    await createDiscordPendingLogin(pool, {
      token: 'tok',
      discordUserId: '80351110224678912',
      username: 'Maxp',
      avatar: null,
      email: 'maxp@example.com',
      emailVerified: true,
      guildMember: true,
      ttlMinutes: 15,
    });
    expect(didRun('INSERT INTO discord_pending_logins')).toBe(true);
    const insert = calls.find((c) => c.sql.includes('INSERT INTO discord_pending_logins'));
    expect(insert?.params).toEqual([
      'tok',
      '80351110224678912',
      'Maxp',
      null,
      'maxp@example.com',
      true,
      true,
      '15',
    ]);
  });

  it('peekDiscordPendingLogin reads WITHOUT deleting (live row, then null)', async () => {
    const live = makePool((s) =>
      s.includes('SELECT') && s.includes('FROM discord_pending_logins')
        ? { rows: [ROW], rowCount: 1 }
        : NONE,
    );
    expect(await peekDiscordPendingLogin(live.pool, 'tok')).toEqual(ROW);
    // A peek must never delete the row (it stays reusable for the retry).
    expect(live.didRun('DELETE FROM discord_pending_logins')).toBe(false);
    const dead = makePool(() => NONE);
    expect(await peekDiscordPendingLogin(dead.pool, 'tok')).toBeNull();
  });

  it('consumeDiscordPendingLogin deletes-and-returns (single use)', async () => {
    const live = makePool((s) =>
      s.includes('DELETE FROM discord_pending_logins') ? { rows: [ROW], rowCount: 1 } : NONE,
    );
    expect(await consumeDiscordPendingLogin(live.pool, 'tok')).toEqual(ROW);
    expect(live.didRun('DELETE FROM discord_pending_logins')).toBe(true);
    const dead = makePool(() => NONE);
    expect(await consumeDiscordPendingLogin(dead.pool, 'tok')).toBeNull();
  });
});
