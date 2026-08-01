// Unit coverage for the internal route layer (server/internal.ts).
//
// The migration moved all 11 /internal endpoints (the deploy-gated restart-countdown
// plus the 10 Discord-bot-gated routes) off the inline handleInternalApi ladder
// onto RouteDefs the shared dispatcher serves under API_DISPATCH 'new'. It is a
// PARITY-FIRST migration: each thin handler REPRODUCES its frozen legacy branch
// byte-for-byte, writing the SAME { success, data, error } envelope via the
// module's ok()/fail() helpers (the internal envelope IS the admin shape, so the
// routes carry surface 'internal' + meta.envelope 'admin'). The secret gates move
// to the requireInternalSecret middleware.
//
// POST /internal/discord/flex-batch is the exception and is NOT part of that
// migration: it was born afterwards, so it is RouteDef-ONLY with no legacy ladder
// arm and nothing to keep byte-identical (the new-route rule in
// server/http/CLAUDE.md). Its "no legacy twin" shape is pinned below rather than
// assumed.
//
// This file pins HANDLER behavior behind a PASSING gate (the exhaustive
// unset-env-404 / wrong-secret-401 gate sweep lives in
// tests/server/http/ownership_coverage.test.ts, so only one representative gate
// case per family is repeated here to prove the gates ride the RouteDef
// middleware). It also pins the frozen { success, data, error } envelope, the
// game.startRestartCountdown injection seam (configureInternalRuntime), and the
// internalBodyValidationRemap 500 (a handler/DB throw serializes through
// withErrors/serializeAdmin as { success:false, data:null, error:'internal.error' }).
//
// server/db builds a pg Pool at module load and throws when DATABASE_URL is unset;
// it is fully mocked here (a bare pool token), so the real db never loads. A dummy
// URL is set defensively before the module graph evaluates all the same.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5433/wocc_phase18_internal';
});

// Hoisted module mocks. The real server/db and the Discord persistence/IO layers
// never load: internal.ts touches them only through these fakes. src/sim stays
// REAL (discordStatusIndexForPoints, DISCORD_REWARD_GRANTS, specialRoleByKey).
vi.mock('../../server/db', () => ({ pool: { __fake: 'internal-pool' } }));
vi.mock('../../server/discord_db', () => ({
  accountForDiscord: vi.fn(),
  discordForAccount: vi.fn(),
  discordIdsWithGuildFlair: vi.fn(),
  grantRewardPoints: vi.fn(),
  loadRewardState: vi.fn(),
  setDiscordGuildMember: vi.fn(),
  setDiscordMemberMetaBulk: vi.fn(),
}));
vi.mock('../../server/discord', () => ({
  discordFlexForAccount: vi.fn(),
  discordFlexForAccounts: vi.fn(),
  setDiscordPresenceCache: vi.fn(),
}));
vi.mock('../../server/discord_activity', () => ({ drainActivity: vi.fn() }));
vi.mock('../../server/discord_relay', () => ({ drainRelay: vi.fn() }));
vi.mock('../../server/daily_rewards', () => ({
  dailyRewardService: {
    discordWinnerAnnouncements: vi.fn(),
    markDiscordWinnersAnnounced: vi.fn(),
  },
}));

import type * as http from 'node:http';
import { MEMBERS_META_BATCH } from '../../bot/logic';
import { dailyRewardService } from '../../server/daily_rewards';
import { pool } from '../../server/db';
import {
  type DiscordFlex,
  type DiscordFlexBatchEntry,
  discordFlexForAccount,
  discordFlexForAccounts,
  setDiscordPresenceCache,
} from '../../server/discord';
import type { QueuedActivity } from '../../server/discord_activity';
import { drainActivity } from '../../server/discord_activity';
import type { DiscordLinkRow, DiscordMemberMetaRecord } from '../../server/discord_db';
import {
  accountForDiscord,
  discordForAccount,
  discordIdsWithGuildFlair,
  grantRewardPoints,
  loadRewardState,
  setDiscordGuildMember,
  setDiscordMemberMetaBulk,
} from '../../server/discord_db';
import type { QueuedRelay } from '../../server/discord_relay';
import { drainRelay } from '../../server/discord_relay';
import { compose } from '../../server/http/compose';
import { withErrors } from '../../server/http/middleware/with_errors';
import type { Method, Middleware } from '../../server/http/types';
import {
  configureInternalRuntime,
  handleInternalApi,
  type InternalRuntime,
  resetInternalRuntimeForTests,
  routes,
} from '../../server/internal';
import { FakeRes, fakeCtx, makeReq } from './helpers';

// The two shared secrets and their matching headers. The gate reads the env var
// PER REQUEST, so each test sets the one it needs and passes the header.
const DEPLOY_SECRET = 'deploy-secret';
const DISCORD_SECRET = 'discord-secret';
const DEPLOY_HEADERS = { 'x-woc-deploy-secret': DEPLOY_SECRET };
const DISCORD_HEADERS = { 'x-woc-discord-secret': DISCORD_SECRET };

// The 13 routes as [method, path]: the legacy handleInternalApi ladder order
// (the 11 migrated routes plus flaired-ids, added after the migration on both
// arms per the dual-edit rule), then flex-batch, which is RouteDef-ONLY and has
// no legacy arm by design (a route born after the migration never gets one).
const EXPECTED_ROUTES: ReadonlyArray<readonly [Method, string]> = [
  ['POST', '/internal/restart-countdown'],
  ['GET', '/internal/discord/flex'],
  ['GET', '/internal/discord/roles'],
  ['POST', '/internal/discord/presence'],
  ['POST', '/internal/discord/grant'],
  ['POST', '/internal/discord/member'],
  ['GET', '/internal/discord/relay'],
  ['GET', '/internal/discord/activity'],
  ['GET', '/internal/discord/daily-rewards-winners'],
  ['POST', '/internal/discord/daily-rewards-winners/mark'],
  ['POST', '/internal/discord/members-meta'],
  ['GET', '/internal/discord/flaired-ids'],
  ['POST', '/internal/discord/flex-batch'],
];

/** Read status/body/content-type/headers off the fakeCtx's FakeRes. */
function readRes(res: http.ServerResponse): {
  status: number;
  body: unknown;
  raw: string;
  contentType: string | undefined;
  headers: Record<string, string | number | string[]>;
} {
  const fake = res as unknown as FakeRes;
  const raw = fake.body;
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    body = undefined;
  }
  return {
    status: fake.statusCode,
    body,
    raw,
    contentType: fake.headers['content-type'] as string | undefined,
    headers: fake.headers,
  };
}

/** Grab a route by method + path (paths repeat across methods, so both are needed). */
function routeFor(method: Method, path: string) {
  const route = routes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`no route ${method} ${path}`);
  return route;
}

/** Drive a full route chain (its real gate middleware + handler) under withErrors. */
async function runRoute(
  method: Method,
  path: string,
  opts: { url?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const route = routeFor(method, path);
  let reached = false;
  const terminal: Middleware = async (c) => {
    reached = true;
    await route.handler(c);
  };
  const ctx = fakeCtx({
    method,
    url: opts.url ?? path,
    headers: opts.headers,
    body: opts.body,
  });
  const stack: Middleware[] = [
    withErrors({ surface: route.meta?.envelope }),
    ...(route.middleware ?? []),
    terminal,
  ];
  await compose(stack)(ctx);
  return { reached, ...readRes(ctx.res) };
}

/** A full DiscordLinkRow for a linked account id (du<id>/un<id>/av<id>). */
function linkRow(accountId: number): DiscordLinkRow {
  return {
    account_id: accountId,
    discord_user_id: `du${accountId}`,
    discord_username: `un${accountId}`,
    discord_avatar: `av${accountId}`,
    discord_email: null,
    guild_member: false,
    linked_at: 'x',
  };
}

/** A full QueuedRelay item (the handler spreads it, so every field flows through). */
function relayItem(accountId: number, message: string): QueuedRelay {
  return {
    commandId: 'lfg',
    tag: 'LFG',
    label: 'Looking for Group',
    color: 1,
    accountId,
    characterName: 'Char',
    level: 10,
    className: 'Hunter',
    realm: 'R',
    zone: 'Z',
    message,
    profileUrl: null,
  };
}

/** A QueuedActivity item with one participant account id and a parallel name. */
function activityItem(accountId: number, name: string): QueuedActivity {
  return {
    kind: 'levelup',
    accountIds: [accountId],
    names: [name],
    realm: 'R',
    profileUrl: null,
    level: 10,
  };
}

const ORIGINAL_DEPLOY_SECRET = process.env.RESTART_COUNTDOWN_SECRET;
const ORIGINAL_DISCORD_SECRET = process.env.DISCORD_BOT_SECRET;

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

beforeEach(() => {
  vi.resetAllMocks();
  delete process.env.RESTART_COUNTDOWN_SECRET;
  delete process.env.DISCORD_BOT_SECRET;
  resetInternalRuntimeForTests();
});

afterEach(() => {
  restoreEnv('RESTART_COUNTDOWN_SECRET', ORIGINAL_DEPLOY_SECRET);
  restoreEnv('DISCORD_BOT_SECRET', ORIGINAL_DISCORD_SECRET);
  resetInternalRuntimeForTests();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Registration shape.
// ---------------------------------------------------------------------------

describe('internal route registration', () => {
  it('registers exactly 13 routes matching the legacy ladder plus RouteDef-only flex-batch', () => {
    expect(routes).toHaveLength(13);
    const actual = routes.map((r) => `${r.method} ${r.path}`).sort();
    const expected = EXPECTED_ROUTES.map(([m, p]) => `${m} ${p}`).sort();
    expect(actual).toEqual(expected);
  });

  it('every route is surface internal, envelope admin, with a non-empty gate middleware', () => {
    for (const r of routes) {
      expect(r.surface, r.path).toBe('internal');
      expect(r.meta?.envelope, r.path).toBe('admin');
      expect(Array.isArray(r.middleware) && r.middleware.length > 0, r.path).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. restart-countdown (deploy gate + injected runtime).
// ---------------------------------------------------------------------------

describe('restart-countdown', () => {
  it('200s with the status payload when the countdown starts', async () => {
    process.env.RESTART_COUNTDOWN_SECRET = DEPLOY_SECRET;
    const status = { started: true, active: true, totalSeconds: 600, remainingSeconds: 600 };
    const startRestartCountdown = vi.fn(() => status);
    configureInternalRuntime({ startRestartCountdown } as unknown as InternalRuntime);

    const r = await runRoute('POST', '/internal/restart-countdown', { headers: DEPLOY_HEADERS });

    expect(r.reached).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: status, error: null });
    expect(startRestartCountdown).toHaveBeenCalledTimes(1);
  });

  it('409s carrying the status payload when a countdown is already active', async () => {
    process.env.RESTART_COUNTDOWN_SECRET = DEPLOY_SECRET;
    const status = { started: false, active: true, totalSeconds: 600, remainingSeconds: 540 };
    configureInternalRuntime({
      startRestartCountdown: vi.fn(() => status),
    } as unknown as InternalRuntime);

    const r = await runRoute('POST', '/internal/restart-countdown', { headers: DEPLOY_HEADERS });

    expect(r.status).toBe(409);
    expect(r.body).toEqual({
      success: false,
      data: status,
      error: 'restart countdown already active',
    });
  });

  it('500s internal.error when the runtime was never configured', async () => {
    process.env.RESTART_COUNTDOWN_SECRET = DEPLOY_SECRET;
    resetInternalRuntimeForTests();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await runRoute('POST', '/internal/restart-countdown', { headers: DEPLOY_HEADERS });

    expect(r.status).toBe(500);
    expect(r.body).toEqual({ success: false, data: null, error: 'internal.error' });
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 3. discord/flex (link lookup + flex merge).
// ---------------------------------------------------------------------------

describe('discord/flex', () => {
  it('returns { linked: false } for an unlinked discord id', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(accountForDiscord).mockResolvedValue(null);

    const r = await runRoute('GET', '/internal/discord/flex', {
      url: '/internal/discord/flex?discord_user_id=u1',
      headers: DISCORD_HEADERS,
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { linked: false }, error: null });
    expect(vi.mocked(accountForDiscord)).toHaveBeenCalledWith(pool, 'u1');
    expect(vi.mocked(discordFlexForAccount)).not.toHaveBeenCalled();
  });

  it('merges the flex payload for a linked account and reads the id from the query', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    const flex: DiscordFlex = {
      found: true,
      username: 'coolguy',
      statusTier: 3,
      points: 500,
      character: { name: 'Hero', class: 'Warrior', level: 40, profileUrl: 'https://x/p' },
    };
    vi.mocked(accountForDiscord).mockResolvedValue(77);
    vi.mocked(discordFlexForAccount).mockResolvedValue(flex);

    const r = await runRoute('GET', '/internal/discord/flex', {
      url: '/internal/discord/flex?discord_user_id=u1',
      headers: DISCORD_HEADERS,
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { linked: true, ...flex }, error: null });
    expect(vi.mocked(accountForDiscord)).toHaveBeenCalledWith(pool, 'u1');
    expect(vi.mocked(discordFlexForAccount)).toHaveBeenCalledWith(77);
  });
});

// ---------------------------------------------------------------------------
// 4. discord/roles (status tier via the REAL discordStatusIndexForPoints).
// ---------------------------------------------------------------------------

describe('discord/roles', () => {
  it('returns { linked: false, statusTier: 0, points: 0 } for an unlinked id', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(accountForDiscord).mockResolvedValue(null);

    const r = await runRoute('GET', '/internal/discord/roles', {
      url: '/internal/discord/roles?discord_user_id=u1',
      headers: DISCORD_HEADERS,
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: { linked: false, statusTier: 0, points: 0 },
      error: null,
    });
    expect(vi.mocked(loadRewardState)).not.toHaveBeenCalled();
  });

  it('computes the status tier from lifetime points for a linked account', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(accountForDiscord).mockResolvedValue(42);
    // 2000 lifetime points is exactly the "knight" rung (index 4).
    vi.mocked(loadRewardState).mockResolvedValue({ points: 1500, lifetimePoints: 2000 });

    const r = await runRoute('GET', '/internal/discord/roles', {
      url: '/internal/discord/roles?discord_user_id=u1',
      headers: DISCORD_HEADERS,
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: { linked: true, statusTier: 4, points: 1500, lifetimePoints: 2000 },
      error: null,
    });
  });
});

// ---------------------------------------------------------------------------
// 5. discord/presence (clamp + truncate + sanitize).
// ---------------------------------------------------------------------------

describe('discord/presence', () => {
  it('trunc/clamps counts, truncates the channel name, and sanitizes the voice roster', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    const voice: unknown[] = [
      'malformed',
      { id: 'v1', name: 'Voice One', speaking: true, selfMute: true },
    ];
    for (let i = 2; i < 51; i++) {
      voice.push({ id: `v${i}`, name: `Name ${i}`, speaking: false, selfMute: false });
    }

    const r = await runRoute('POST', '/internal/discord/presence', {
      headers: DISCORD_HEADERS,
      body: {
        onlineCount: 5.7,
        memberTotal: -3,
        voiceChannelName: 'a'.repeat(81),
        voice,
      },
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { received: true }, error: null });
    expect(vi.mocked(setDiscordPresenceCache)).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(setDiscordPresenceCache).mock.calls[0][0];
    expect(arg.onlineCount).toBe(5);
    expect(arg.memberTotal).toBe(0);
    expect(arg.voiceChannelName).toBe('a'.repeat(80));
    expect(arg.voice).toHaveLength(50);
    expect(arg.voice[0]).toEqual({ id: '', name: '', speaking: false, selfMute: false });
    expect(arg.voice[1]).toEqual({ id: 'v1', name: 'Voice One', speaking: true, selfMute: true });
  });
});

// ---------------------------------------------------------------------------
// 6. discord/grant (validation + clamp + reason truncation + tier).
// ---------------------------------------------------------------------------

describe('discord/grant', () => {
  it('400s when the reason is missing or the points are zero', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;

    const missingReason = await runRoute('POST', '/internal/discord/grant', {
      headers: DISCORD_HEADERS,
      body: { discord_user_id: 'u1', points: 5 },
    });
    expect(missingReason.status).toBe(400);
    expect(missingReason.body).toEqual({
      success: false,
      data: null,
      error: 'reason and non-zero points required',
    });

    const zeroPoints = await runRoute('POST', '/internal/discord/grant', {
      headers: DISCORD_HEADERS,
      body: { discord_user_id: 'u1', reason: 'daily', points: 0 },
    });
    expect(zeroPoints.status).toBe(400);
    expect(zeroPoints.body).toEqual({
      success: false,
      data: null,
      error: 'reason and non-zero points required',
    });
    expect(vi.mocked(grantRewardPoints)).not.toHaveBeenCalled();
  });

  it('404s when the discord id is not linked', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(accountForDiscord).mockResolvedValue(null);

    const r = await runRoute('POST', '/internal/discord/grant', {
      headers: DISCORD_HEADERS,
      body: { discord_user_id: 'u1', reason: 'daily', points: 5 },
    });

    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, data: null, error: 'discord id not linked' });
  });

  it('grants clamped points with a 64-char reason and returns the derived tier', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(accountForDiscord).mockResolvedValue(42);
    vi.mocked(grantRewardPoints).mockResolvedValue({ points: 1234, lifetimePoints: 5000 });

    const r = await runRoute('POST', '/internal/discord/grant', {
      headers: DISCORD_HEADERS,
      body: { discord_user_id: 'u1', reason: 'r'.repeat(70), points: 200_000, dedupeKey: 'dk' },
    });

    expect(r.status).toBe(200);
    // 5000 lifetime points is exactly the "champion" rung (index 5).
    expect(r.body).toEqual({
      success: true,
      data: { points: 1234, lifetimePoints: 5000, statusTier: 5 },
      error: null,
    });
    expect(vi.mocked(grantRewardPoints)).toHaveBeenCalledWith(
      pool,
      42,
      100_000,
      'r'.repeat(64),
      'dk',
    );
  });
});

// ---------------------------------------------------------------------------
// 7. discord/member (guild-membership sync + the guild-member reward grant).
// ---------------------------------------------------------------------------

describe('discord/member', () => {
  it('404s when the discord id is not linked', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(accountForDiscord).mockResolvedValue(null);

    const r = await runRoute('POST', '/internal/discord/member', {
      headers: DISCORD_HEADERS,
      body: { discord_user_id: 'u1', guildMember: true },
    });

    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, data: null, error: 'discord id not linked' });
    expect(vi.mocked(setDiscordGuildMember)).not.toHaveBeenCalled();
  });

  it('sets membership true and grants the guild-member reward with a keyed dedupe', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(accountForDiscord).mockResolvedValue(42);
    vi.mocked(grantRewardPoints).mockResolvedValue({ points: 250, lifetimePoints: 250 });

    const r = await runRoute('POST', '/internal/discord/member', {
      headers: DISCORD_HEADERS,
      body: { discord_user_id: 'u1', guildMember: true },
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { updated: true }, error: null });
    expect(vi.mocked(setDiscordGuildMember)).toHaveBeenCalledWith(pool, 42, true);
    // DISCORD_REWARD_GRANTS.guildMember: reason 'guild_member', 250 points; dedupe `${reason}:${id}`.
    expect(vi.mocked(grantRewardPoints)).toHaveBeenCalledWith(
      pool,
      42,
      250,
      'guild_member',
      'guild_member:42',
    );
  });

  it('sets membership false and grants nothing when guildMember is absent', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(accountForDiscord).mockResolvedValue(42);

    const r = await runRoute('POST', '/internal/discord/member', {
      headers: DISCORD_HEADERS,
      body: { discord_user_id: 'u1' },
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { updated: true }, error: null });
    expect(vi.mocked(setDiscordGuildMember)).toHaveBeenCalledWith(pool, 42, false);
    expect(vi.mocked(grantRewardPoints)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8. discord/relay (drain + per-item Discord-identity enrichment).
// ---------------------------------------------------------------------------

describe('discord/relay', () => {
  it('enriches each drained item, leaving nulls for an unlinked issuer', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(drainRelay).mockReturnValue([relayItem(1, 'a'), relayItem(2, 'b')]);
    vi.mocked(discordForAccount).mockImplementation(async (_pool, accountId) =>
      accountId === 1 ? linkRow(1) : null,
    );

    const r = await runRoute('GET', '/internal/discord/relay', { headers: DISCORD_HEADERS });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: {
        items: [
          {
            ...relayItem(1, 'a'),
            discordUserId: 'du1',
            discordUsername: 'un1',
            discordAvatar: 'av1',
          },
          {
            ...relayItem(2, 'b'),
            discordUserId: null,
            discordUsername: null,
            discordAvatar: null,
          },
        ],
      },
      error: null,
    });
  });
});

// ---------------------------------------------------------------------------
// 9. discord/activity (drain + participant enrichment; drop items with none linked).
// ---------------------------------------------------------------------------

describe('discord/activity', () => {
  it('drops items with no linked participant and strips accountIds/names', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(drainActivity).mockReturnValue([activityItem(1, 'Alice'), activityItem(2, 'Bob')]);
    vi.mocked(discordForAccount).mockImplementation(async (_pool, accountId) =>
      accountId === 1 ? linkRow(1) : null,
    );

    const r = await runRoute('GET', '/internal/discord/activity', { headers: DISCORD_HEADERS });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: {
        items: [
          {
            kind: 'levelup',
            realm: 'R',
            profileUrl: null,
            level: 10,
            participants: [{ name: 'Alice', discordUserId: 'du1', discordAvatar: 'av1' }],
          },
        ],
      },
      error: null,
    });
  });
});

// ---------------------------------------------------------------------------
// 10. discord/daily-rewards-winners (GET limit coercion + POST mark).
// ---------------------------------------------------------------------------

describe('discord/daily-rewards-winners', () => {
  it('clamps the GET limit (99 -> 5, absent -> 1, 0 -> 1) and ok-wraps the service return', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    const service = vi.mocked(dailyRewardService.discordWinnerAnnouncements);
    service.mockResolvedValue({ days: [] });

    const r = await runRoute('GET', '/internal/discord/daily-rewards-winners', {
      url: '/internal/discord/daily-rewards-winners?limit=99',
      headers: DISCORD_HEADERS,
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { days: [] }, error: null });
    expect(service).toHaveBeenLastCalledWith(5);

    await runRoute('GET', '/internal/discord/daily-rewards-winners', { headers: DISCORD_HEADERS });
    expect(service).toHaveBeenLastCalledWith(1);

    await runRoute('GET', '/internal/discord/daily-rewards-winners', {
      url: '/internal/discord/daily-rewards-winners?limit=0',
      headers: DISCORD_HEADERS,
    });
    expect(service).toHaveBeenLastCalledWith(1);
  });

  it('mark returns the service fail body on error and ok-wraps success', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    const mark = vi.mocked(dailyRewardService.markDiscordWinnersAnnounced);

    mark.mockResolvedValue({ error: 'nope', status: 400 });
    const failed = await runRoute('POST', '/internal/discord/daily-rewards-winners/mark', {
      headers: DISCORD_HEADERS,
      body: { day: 'not-a-day' },
    });
    expect(failed.status).toBe(400);
    expect(failed.body).toEqual({ success: false, data: null, error: 'nope' });

    mark.mockResolvedValue({ marked: 2 } as unknown as { ok: true });
    const ok = await runRoute('POST', '/internal/discord/daily-rewards-winners/mark', {
      headers: DISCORD_HEADERS,
      body: {},
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ success: true, data: { marked: 2 }, error: null });
  });
});

// ---------------------------------------------------------------------------
// 11. discord/members-meta (per-member id/name slice, finite joinedAt, role validation).
// ---------------------------------------------------------------------------

describe('discord/members-meta', () => {
  /** The records the handler handed the bulk upsert on the most recent call. */
  function pushedRecords(): DiscordMemberMetaRecord[] {
    const calls = vi.mocked(setDiscordMemberMetaBulk).mock.calls;
    return calls[calls.length - 1][1] as DiscordMemberMetaRecord[];
  }

  it('slices id/name, keeps only a known role key, and skips entries with no id', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 2,
      skipped: 0,
      unapplied: [],
    });

    const r = await runRoute('POST', '/internal/discord/members-meta', {
      headers: DISCORD_HEADERS,
      body: {
        members: [
          {
            discord_user_id: 'd'.repeat(40),
            name: 'n'.repeat(70),
            joinedAtMs: 1_700_000_000_000,
            role: 'mods',
          },
          { discord_user_id: 'u2', role: 'not-a-role' },
          { name: 'no id here' },
        ],
      },
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: { updated: 2, changed: 2, skipped: 0, unapplied: [] },
      error: null,
    });
    // ONE call carrying BOTH records, not one call per record.
    expect(vi.mocked(setDiscordMemberMetaBulk)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(setDiscordMemberMetaBulk).mock.calls[0][0]).toBe(pool);
    expect(pushedRecords()).toEqual([
      // 'mods' is a real special-role key; id/name slice to 32/64; finite joinedAt kept.
      {
        discordUserId: 'd'.repeat(32),
        nickname: 'n'.repeat(64),
        joinedAtMs: 1_700_000_000_000,
        roleKey: 'mods',
      },
      // 'not-a-role' clears to null; no name/joinedAt provided -> nulls.
      { discordUserId: 'u2', nickname: null, joinedAtMs: null, roleKey: null },
    ]);
  });

  it('slices each request at 1000 entries, at or above the bot batch size', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 1000,
      skipped: 0,
      unapplied: [],
    });

    // The bot splits its roster into MEMBERS_META_BATCH-sized requests on the
    // promise that the server processes AT LEAST that many entries per request;
    // anything past the server's slice is silently dropped. Pin the slice cap
    // to its literal and the bot batch at or under it, so a drift on either
    // side fails here instead of silently re-dropping the roster tail. (The
    // records are id-only on purpose: full records at this count would trip
    // the 64 KiB readBody cap FIRST, which is why the bot batch is byte-sized;
    // that bound is pinned in tests/discord_bot.test.ts.)
    expect(MEMBERS_META_BATCH).toBeLessThanOrEqual(1000);
    const members = Array.from({ length: 1001 }, (_, i) => ({ discord_user_id: `u${i}` }));

    const r = await runRoute('POST', '/internal/discord/members-meta', {
      headers: DISCORD_HEADERS,
      body: { members },
    });

    expect(r.status).toBe(200);
    // Exactly the first 1000 process; the 1001st is sliced off by the cap.
    expect(r.body).toEqual({
      success: true,
      data: { updated: 1000, changed: 1000, skipped: 0, unapplied: [] },
      error: null,
    });
    // The cap holds and the whole push is still ONE database call, which is the
    // property the phase bought: 1000 members used to be 1000 serial UPDATEs.
    expect(vi.mocked(setDiscordMemberMetaBulk)).toHaveBeenCalledTimes(1);
    const records = pushedRecords();
    expect(records).toHaveLength(1000);
    expect(records[0].discordUserId).toBe('u0');
    expect(records[999].discordUserId).toBe('u999');
  });

  it('issues the same single database call for one member as for a thousand', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 1,
      skipped: 0,
      unapplied: [],
    });

    await runRoute('POST', '/internal/discord/members-meta', {
      headers: DISCORD_HEADERS,
      body: { members: [{ discord_user_id: 'u1' }] },
    });
    expect(vi.mocked(setDiscordMemberMetaBulk)).toHaveBeenCalledTimes(1);

    await runRoute('POST', '/internal/discord/members-meta', {
      headers: DISCORD_HEADERS,
      body: {
        members: Array.from({ length: 1000 }, (_, i) => ({ discord_user_id: `u${i}` })),
      },
    });
    // Two requests, two calls: the member count did not add any.
    expect(vi.mocked(setDiscordMemberMetaBulk)).toHaveBeenCalledTimes(2);
  });

  it('turns a request of unusable entries into an empty record list, not a write', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 0,
      skipped: 0,
      unapplied: [],
    });

    const r = await runRoute('POST', '/internal/discord/members-meta', {
      headers: DISCORD_HEADERS,
      body: { members: [{ name: 'no id' }, 'not an object', 42] },
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: { updated: 0, changed: 0, skipped: 0, unapplied: [] },
      error: null,
    });
    // Not one of the three entries survived validation, so nothing reaches the
    // database even though the upsert is still called: it owns the empty answer
    // and short-circuits before any SQL (pinned as zero statements in
    // tests/discord_db.test.ts, which is the layer that can count statements).
    expect(pushedRecords()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 11b. members-meta reports what it APPLIED, not what it read (ledger item L14).
//
// The old handler counted `updated++` once per record it iterated, so a push for
// a Discord member with no discord_links row (every unlinked guild member) was
// answered as accepted. The bot cached it as pushed and never re-sent it, so the
// member's join date and staff flair never reached the game after they linked.
//
// The fix names the three outcomes separately. `updated` deliberately KEEPS its
// old meaning (records accepted for application) because the bot's client turns
// `updated === 0` on a non-empty push into a hard refusal that aborts the whole
// sweep; the new `changed` / `skipped` / `unapplied` fields carry the truth, and
// Phase 6 rewires the bot onto `unapplied`.
// ---------------------------------------------------------------------------

describe('discord/members-meta applied-vs-read reporting', () => {
  const THREE_MEMBERS = [
    { discord_user_id: 'changed1', name: 'New Name' },
    { discord_user_id: 'identical1', name: 'Same Name' },
    { discord_user_id: 'nolink1', name: 'Never Linked' },
  ];

  async function push(members: unknown[]) {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    return runRoute('POST', '/internal/discord/members-meta', {
      headers: DISCORD_HEADERS,
      body: { members },
    });
  }

  it('names an id with no link row as unapplied and never counts it as changed', async () => {
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 1,
      skipped: 1,
      unapplied: ['nolink1'],
    });

    const r = await push(THREE_MEMBERS);

    expect(r.status).toBe(200);
    // Built as a fresh literal, not spread from the mock's own return value.
    expect(r.body).toEqual({
      success: true,
      data: { updated: 3, changed: 1, skipped: 1, unapplied: ['nolink1'] },
      error: null,
    });
    // The whole point of L14: the id is NAMED, so the pusher can leave exactly
    // that record dirty instead of caching a write that reached no row.
    const data = (r.body as { data: { changed: number; unapplied: string[] } }).data;
    expect(data.unapplied).toEqual(['nolink1']);
    expect(data.changed).toBe(1);
  });

  it('relays a zero-changed non-zero-skipped upsert report without rewriting it', async () => {
    // The post-restart case: the bot's diff cache is empty so it re-sends the
    // whole roster, and nothing moved while it was down.
    //
    // TITLE SCOPE: setDiscordMemberMetaBulk is mocked here, so this layer cannot
    // and does not DECIDE that nothing moved; it pins that the handler relays the
    // upsert's own classification untouched and computes `updated` independently
    // of it (2 accepted against 0 changed). The real classification, where a
    // genuinely identical re-push produces those numbers, is executed against
    // Postgres in tests/discord_db_integration.test.ts.
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 0,
      skipped: 2,
      unapplied: [],
    });

    const r = await push([
      { discord_user_id: 'identical1', name: 'Same Name' },
      { discord_user_id: 'identical2', name: 'Also Same' },
    ]);

    expect(r.body).toEqual({
      success: true,
      data: { updated: 2, changed: 0, skipped: 2, unapplied: [] },
      error: null,
    });
  });

  it('relays changed and skipped untouched while deriving updated itself', async () => {
    // Same title scope as above: the 2/1 split is the mocked upsert's answer, and
    // what this pins is that the handler passes it through unaltered while
    // `updated` (3) comes from the accepted-record count, not from `changed`.
    // Narrowing `updated` to applied.changed is the exact L14 regression, and the
    // three differing numbers below are what make it fail here.
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 2,
      skipped: 1,
      unapplied: [],
    });

    const r = await push([
      { discord_user_id: 'changed1', name: 'A' },
      { discord_user_id: 'changed2', name: 'B' },
      { discord_user_id: 'identical1', name: 'Same' },
    ]);

    expect(r.body).toEqual({
      success: true,
      data: { updated: 3, changed: 2, skipped: 1, unapplied: [] },
      error: null,
    });
  });

  it('accounts for every accepted record exactly once across the three outcomes', async () => {
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 1,
      skipped: 1,
      unapplied: ['nolink1'],
    });

    const r = await push(THREE_MEMBERS);
    const data = (
      r.body as {
        data: { updated: number; changed: number; skipped: number; unapplied: string[] };
      }
    ).data;

    // updated === changed + skipped + unapplied.length is the invariant that says
    // no record was double-counted and none went missing between the classes.
    expect(data.changed + data.skipped + data.unapplied.length).toBe(data.updated);
  });

  it('never answers a non-empty push with updated 0, which the bot reads as a refusal', async () => {
    // REGRESSION PIN, the load-bearing one. bot/server_client.ts pushMembersMeta
    // turns `updated === 0` on a non-empty push into null, and
    // bot/member_writes.ts pushChangedMemberMeta ABORTS the whole run on a
    // refusal, skipping every later batch. Both cases below are ordinary (a
    // post-restart full re-push; a batch of guild members who never linked), so
    // narrowing `updated` to rows-actually-written would make the bot stop
    // pushing, re-send the same roster every sweep, and never populate its cache.
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 0,
      skipped: 0,
      unapplied: ['nolink1', 'nolink2'],
    });
    const allUnlinked = await push([
      { discord_user_id: 'nolink1' },
      { discord_user_id: 'nolink2' },
    ]);
    expect((allUnlinked.body as { data: { updated: number } }).data.updated).toBe(2);

    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 0,
      skipped: 2,
      unapplied: [],
    });
    const nothingMoved = await push([
      { discord_user_id: 'identical1' },
      { discord_user_id: 'identical2' },
    ]);
    expect((nothingMoved.body as { data: { updated: number } }).data.updated).toBe(2);

    // And the one case that legitimately SHOULD answer 0 still does, so the bot's
    // guard keeps the meaning it was added with: a body carrying no usable member
    // at all. (This arm is an empty list, not the over-64-KiB body readBody
    // rejects into {}; both reach parseMemberMetaRecords with nothing to accept
    // and are the same code path from here on, but only the empty list is what is
    // exercised below, so the comment says so rather than claiming the other.)
    const emptyPush = await push([]);
    expect((emptyPush.body as { data: { updated: number } }).data.updated).toBe(0);
    const allJunk = await push([null, 42, { name: 'no id' }]);
    expect((allJunk.body as { data: { updated: number } }).data.updated).toBe(0);
  });

  it('counts a repeated discord_user_id once, so updated matches what was applied', async () => {
    // parseMemberMetaRecords collapses repeats keeping the LAST occurrence, and
    // `updated` is read off the POST-dedupe array, so the de-duplication is
    // OBSERVABLE at the route and had no test at any layer. It is also the one
    // documented behavior change L14 made to `updated` (the old loop incremented
    // once per entry, so a doubled id counted twice while only one row was ever
    // written). Three entries, two of them the same id: the push must report two
    // records and hand the upsert two, carrying the LAST values for the repeat.
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 2,
      skipped: 0,
      unapplied: [],
    });

    const r = await push([
      { discord_user_id: 'dup', name: 'first', role: 'mods' },
      { discord_user_id: 'other', name: 'other' },
      { discord_user_id: 'dup', name: 'last' },
    ]);

    expect((r.body as { data: { updated: number } }).data.updated).toBe(2);
    const records = vi.mocked(setDiscordMemberMetaBulk).mock.calls[0][1];
    // Pinned by VALUE, not by length: last-wins is what makes the stored row match
    // what the old sequential loop left behind, and a first-wins collapse would
    // keep the same count while storing the wrong name and a stale role.
    expect(records).toEqual([
      { discordUserId: 'dup', nickname: 'last', joinedAtMs: null, roleKey: null },
      { discordUserId: 'other', nickname: 'other', joinedAtMs: null, roleKey: null },
    ]);
  });

  it('answers identically on the frozen legacy ladder arm and the RouteDef arm', async () => {
    // members-meta is a MIGRATED route, so a behavior edit must land on both arms
    // (the dual-edit rule). They share applyMemberMetaPush, and this is what says
    // so from the outside: an edit that reaches only one arm fails here.
    vi.mocked(setDiscordMemberMetaBulk).mockResolvedValue({
      changed: 1,
      skipped: 1,
      unapplied: ['nolink1'],
    });

    const viaRouteDef = await push(THREE_MEMBERS);
    expect(viaRouteDef.status).toBe(200);

    const req = makeReq({
      method: 'POST',
      url: '/internal/discord/members-meta',
      headers: DISCORD_HEADERS,
      body: { members: THREE_MEMBERS },
    });
    const res = new FakeRes();
    await handleInternalApi(req, res as unknown as http.ServerResponse, null as never);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(viaRouteDef.body);
    // Non-vacuous: both arms really ran the upsert, and with the same records.
    const calls = vi.mocked(setDiscordMemberMetaBulk).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][1]).toEqual(calls[0][1]);
  });
});

// ---------------------------------------------------------------------------
// 11c. discord/flex-batch (RouteDef-only): one batched read for many ids.
// ---------------------------------------------------------------------------

describe('discord/flex-batch', () => {
  /** A batch entry, built fresh per call so no assertion compares an object to itself. */
  function batchEntry(discordUserId: string): DiscordFlexBatchEntry {
    return {
      discord_user_id: discordUserId,
      linked: true,
      found: true,
      username: 'coolguy',
      statusTier: 3,
      points: 500,
      character: { name: 'Hero', class: 'Warrior', level: 40, profileUrl: 'https://x/p' },
    };
  }

  /** The id list the handler passed to the batched read on its last call. */
  function requestedIds(): string[] {
    const calls = vi.mocked(discordFlexForAccounts).mock.calls;
    return calls[calls.length - 1][0] as string[];
  }

  it('answers the whole batch with ONE read and echoes each linked payload', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(discordFlexForAccounts).mockResolvedValue([batchEntry('u1'), batchEntry('u2')]);

    const r = await runRoute('POST', '/internal/discord/flex-batch', {
      headers: DISCORD_HEADERS,
      body: { discord_user_ids: ['u1', 'u2'] },
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      data: { requested: 2, members: [batchEntry('u1'), batchEntry('u2')] },
      error: null,
    });
    expect(vi.mocked(discordFlexForAccounts)).toHaveBeenCalledTimes(1);
    expect(requestedIds()).toEqual(['u1', 'u2']);
    // The per-id route must not be reached: the batch is the whole point.
    expect(vi.mocked(discordFlexForAccount)).not.toHaveBeenCalled();
  });

  it('yields no payload for an unlinked id rather than a fabricated one', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    // 'unlinked' has no discord_links row, so the batched read returns no row for
    // it. Absence IS the answer (the per-id route's { linked: false } equivalent).
    vi.mocked(discordFlexForAccounts).mockResolvedValue([batchEntry('linked')]);

    const r = await runRoute('POST', '/internal/discord/flex-batch', {
      headers: DISCORD_HEADERS,
      body: { discord_user_ids: ['linked', 'unlinked'] },
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      // requested 2 against members 1 is exactly how a caller learns the missing
      // id was unlinked rather than never asked about.
      data: { requested: 2, members: [batchEntry('linked')] },
      error: null,
    });
    // Both ids WERE asked about, so the absence is the database's answer and not
    // the handler quietly dropping one before the read.
    expect(requestedIds()).toEqual(['linked', 'unlinked']);
  });

  it('clamps the array, slices over-long ids, and drops non-strings like members-meta', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(discordFlexForAccounts).mockResolvedValue([]);

    await runRoute('POST', '/internal/discord/flex-batch', {
      headers: DISCORD_HEADERS,
      body: { discord_user_ids: ['d'.repeat(40), 42, null, { id: 'x' }, '', 'keep', 'keep'] },
    });

    // 32-char slice, non-strings and empties dropped, repeats collapsed. Same
    // rules as the members-meta member list, so the two cannot drift.
    expect(requestedIds()).toEqual(['d'.repeat(32), 'keep']);

    await runRoute('POST', '/internal/discord/flex-batch', {
      headers: DISCORD_HEADERS,
      body: { discord_user_ids: Array.from({ length: 1001 }, (_, i) => `u${i}`) },
    });

    // The array cap is applied BEFORE per-entry validation, exactly like
    // members-meta: the first 1000 survive and the 1001st is sliced off.
    const capped = requestedIds();
    expect(capped).toHaveLength(1000);
    expect(capped[0]).toBe('u0');
    expect(capped[999]).toBe('u999');
    expect(capped).not.toContain('u1000');
  });

  it('reads nothing and answers an empty batch when the body carries no id list', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(discordFlexForAccounts).mockResolvedValue([]);

    const r = await runRoute('POST', '/internal/discord/flex-batch', {
      headers: DISCORD_HEADERS,
      body: { discord_user_ids: 'not-an-array' },
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      success: true,
      // requested 0 is the signal that separates a DROPPED request from a real
      // empty answer. readBody turns an over-64-KiB or malformed body into {},
      // which lands here, so without the echo this response is byte-identical to
      // "all of your ids are unlinked" and a caller that strips flair for missing
      // ids would mass-clear on a truncated push.
      data: { requested: 0, members: [] },
      error: null,
    });
    expect(requestedIds()).toEqual([]);
  });

  it('reports how many ids it accepted, so a caller can detect a dropped request', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(discordFlexForAccounts).mockResolvedValue([batchEntry('u1')]);

    // Three ids sent, three accepted, one linked. A caller comparing `requested`
    // against what it sent sees 3 === 3 and trusts the two absences.
    const honest = await runRoute('POST', '/internal/discord/flex-batch', {
      headers: DISCORD_HEADERS,
      body: { discord_user_ids: ['u1', 'u2', 'u3'] },
    });
    expect((honest.body as { data: { requested: number } }).data.requested).toBe(3);

    // Same caller, body lost on the way in. requested 0 against 3 sent is the
    // mismatch that tells it not to act on the absences.
    vi.mocked(discordFlexForAccounts).mockResolvedValue([]);
    const dropped = await runRoute('POST', '/internal/discord/flex-batch', {
      headers: DISCORD_HEADERS,
      body: {},
    });
    expect((dropped.body as { data: { requested: number } }).data.requested).toBe(0);
    expect((dropped.body as { data: { members: unknown[] } }).data.members).toEqual([]);
  });

  it('is gated: a wrong secret is a 401 that never reaches the handler', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;

    const r = await runRoute('POST', '/internal/discord/flex-batch', {
      headers: { 'x-woc-discord-secret': 'wrong' },
      body: { discord_user_ids: ['u1'] },
    });

    expect(r.status).toBe(401);
    expect(r.reached).toBe(false);
    expect(vi.mocked(discordFlexForAccounts)).not.toHaveBeenCalled();
  });

  it('has NO arm on the frozen legacy ladder (RouteDef-only by design)', async () => {
    // D9: a route born after the pipeline migration never gets a legacy twin, so
    // the legacy dispatcher must fall through to its terminal 404. If someone
    // later adds a legacy arm, this fails and the dual-edit obligation is caught.
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;

    const req = makeReq({
      method: 'POST',
      url: '/internal/discord/flex-batch',
      headers: DISCORD_HEADERS,
      body: { discord_user_ids: ['u1'] },
    });
    const res = new FakeRes();
    await handleInternalApi(req, res as unknown as http.ServerResponse, null as never);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({
      success: false,
      data: null,
      error: 'unknown endpoint',
    });
    expect(vi.mocked(discordFlexForAccounts)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// discord/flaired-ids (the stored-flair id list the bot diffs against the live
// roster to clear members who left while it was offline).
// ---------------------------------------------------------------------------

describe('discord/flaired-ids', () => {
  it('returns the flagged id list in the { success, data, error } envelope', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(discordIdsWithGuildFlair).mockResolvedValue(['u1', 'u2']);

    const r = await runRoute('GET', '/internal/discord/flaired-ids', {
      headers: DISCORD_HEADERS,
    });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, data: { ids: ['u1', 'u2'] }, error: null });
    expect(vi.mocked(discordIdsWithGuildFlair)).toHaveBeenCalledWith(pool);
  });

  it('is gated: a wrong secret is a 401 that never reaches the handler', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;

    const r = await runRoute('GET', '/internal/discord/flaired-ids', {
      headers: { 'x-woc-discord-secret': 'wrong' },
    });

    expect(r.status).toBe(401);
    expect(r.reached).toBe(false);
    expect(vi.mocked(discordIdsWithGuildFlair)).not.toHaveBeenCalled();
  });

  it('the legacy ladder arm answers with the same body as the RouteDef arm', async () => {
    // flaired-ids landed AFTER the migration, so it lives on both dispatch arms
    // per the dual-edit rule. The db-touching internal routes are excluded from
    // the parity corpus replay, so pin the twin bodies against each other here:
    // a behavior edit that reaches only one arm fails this test.
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    vi.mocked(discordIdsWithGuildFlair).mockResolvedValue(['u1', 'u2']);

    const viaRouteDef = await runRoute('GET', '/internal/discord/flaired-ids', {
      headers: DISCORD_HEADERS,
    });
    expect(viaRouteDef.status).toBe(200);

    const req = makeReq({
      method: 'GET',
      url: '/internal/discord/flaired-ids',
      headers: DISCORD_HEADERS,
    });
    const res = new FakeRes();
    // The game runtime is only consumed by the restart-countdown arm.
    await handleInternalApi(req, res as unknown as http.ServerResponse, null as never);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(viaRouteDef.body);
  });
});

// ---------------------------------------------------------------------------
// 12. The internalBodyValidationRemap 500 (a handler/DB throw).
// ---------------------------------------------------------------------------

describe('internalBodyValidationRemap', () => {
  it('serializes a handler/DB throw as a bare 500 internal.error admin envelope', async () => {
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(accountForDiscord).mockRejectedValue(new Error('db exploded'));

    const r = await runRoute('GET', '/internal/discord/flex', {
      url: '/internal/discord/flex?discord_user_id=u1',
      headers: DISCORD_HEADERS,
    });

    expect(r.status).toBe(500);
    expect(r.body).toEqual({ success: false, data: null, error: 'internal.error' });
    expect(r.contentType).toBe('application/json');
    expect(r.headers['x-request-id']).toBeDefined();
    errSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 13. The gates ride the RouteDef middleware (one representative case per family).
// ---------------------------------------------------------------------------

describe('the secret gates ride the route middleware', () => {
  it('discord route 404s "unknown endpoint" when the feature secret is unset', async () => {
    // DISCORD_BOT_SECRET deleted in beforeEach: the gate hides the endpoint.
    const r = await runRoute('GET', '/internal/discord/flex', {
      url: '/internal/discord/flex?discord_user_id=u1',
      headers: DISCORD_HEADERS,
    });

    expect(r.reached).toBe(false);
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, data: null, error: 'unknown endpoint' });
    expect(vi.mocked(accountForDiscord)).not.toHaveBeenCalled();
  });

  it('restart-countdown 401s "not authenticated" on a mismatched deploy secret', async () => {
    process.env.RESTART_COUNTDOWN_SECRET = DEPLOY_SECRET;
    configureInternalRuntime({
      startRestartCountdown: vi.fn(() => ({
        started: true,
        active: true,
        totalSeconds: 600,
        remainingSeconds: 600,
      })),
    } as unknown as InternalRuntime);

    const r = await runRoute('POST', '/internal/restart-countdown', {
      headers: { 'x-woc-deploy-secret': 'wrong' },
    });

    expect(r.reached).toBe(false);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, data: null, error: 'not authenticated' });
  });
});

// ---------------------------------------------------------------------------
// 14. The { success, data, error } envelope is frozen on every arm.
// ---------------------------------------------------------------------------

describe('the internal envelope is frozen', () => {
  it('a success, a guard 4xx, and a gate 404 all carry exactly { success, data, error }', async () => {
    const only = ['data', 'error', 'success'];

    // Success arm (restart-countdown started).
    process.env.RESTART_COUNTDOWN_SECRET = DEPLOY_SECRET;
    configureInternalRuntime({
      startRestartCountdown: vi.fn(() => ({
        started: true,
        active: true,
        totalSeconds: 600,
        remainingSeconds: 600,
      })),
    } as unknown as InternalRuntime);
    const success = await runRoute('POST', '/internal/restart-countdown', {
      headers: DEPLOY_HEADERS,
    });
    expect(success.status).toBe(200);
    expect(Object.keys(success.body as object).sort()).toEqual(only);

    // Guard 4xx arm (grant with a missing reason).
    process.env.DISCORD_BOT_SECRET = DISCORD_SECRET;
    const guard = await runRoute('POST', '/internal/discord/grant', {
      headers: DISCORD_HEADERS,
      body: { discord_user_id: 'u1', points: 5 },
    });
    expect(guard.status).toBe(400);
    expect(Object.keys(guard.body as object).sort()).toEqual(only);

    // Gate 404 arm (deploy secret unset).
    delete process.env.RESTART_COUNTDOWN_SECRET;
    const gate = await runRoute('POST', '/internal/restart-countdown', { headers: DEPLOY_HEADERS });
    expect(gate.status).toBe(404);
    expect(Object.keys(gate.body as object).sort()).toEqual(only);
  });
});
