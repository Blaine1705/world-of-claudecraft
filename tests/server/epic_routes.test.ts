// The Epic link surface (server/epic/routes.ts): the env gate, the dark-default
// arms, the rate-limit policy, the epic_links DDL pins, and the forbidden-login
// rule (linking never mints credentials; login with Epic does not exist).
process.env.DATABASE_URL ||= 'postgres://test:test@127.0.0.1:5433/wocc_epic_units';

import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tsFilesUnder } from '../helpers/ts_files_under';

// Isolate the route layer: SQL boundary and the mirror are mocked (the mirror
// is inert stubs in Phase 3; the routes only owe it the cache-invalidation
// call on unlink).
vi.mock('../../server/epic/epic_db', () => ({
  epicLinkForAccount: vi.fn(async () => null),
  accountForEpicId: vi.fn(async () => null),
  insertEpicLink: vi.fn(async () => 'ok'),
  displaceEpicLink: vi.fn(async () => ({ result: 'ok', displacedAccountId: null })),
  deleteEpicLink: vi.fn(async () => {}),
}));
vi.mock('../../server/epic/mirror', () => ({
  onDeedRecorded: vi.fn(),
  onLinkChanged: vi.fn(),
  reconcileOnLogin: vi.fn(),
}));
// Partial db mock: keep SCHEMA (and everything else) real, stub only the two
// reads requireAccount resolves at call time, so the full-chain tests below can
// run the route's REAL middleware (gate -> auth -> limiter -> body) without a
// live database.
vi.mock('../../server/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/db')>();
  return {
    ...actual,
    accountAndScopeForToken: vi.fn(async () => ({ accountId: 7, scope: 'full' as const })),
    moderationStatusForAccount: vi.fn(async () => ({
      locked: false,
      banned: false,
      suspendedUntil: null,
    })),
  };
});

import type * as http from 'node:http';
import { SCHEMA } from '../../server/db';
import { deleteEpicLink, epicLinkForAccount, insertEpicLink } from '../../server/epic/epic_db';
import { onLinkChanged } from '../../server/epic/mirror';
import { isProofShape, MAX_PROOF_CHARS, routes } from '../../server/epic/routes';
import { HttpError } from '../../server/http/errors';
import { EPIC_LINK_POLICY, rateLimit } from '../../server/http/middleware/rate_limit';
import type { Ctx, RouteDef } from '../../server/http/types';
import { EPIC_LINK_MAX_PER_MINUTE, resetEpicLinkRateLimits } from '../../server/ratelimit';
import { type FakeRes, fakeCtx } from './helpers';

const linkForAccountMock = vi.mocked(epicLinkForAccount);
const insertMock = vi.mocked(insertEpicLink);
const deleteMock = vi.mocked(deleteEpicLink);
const onLinkChangedMock = vi.mocked(onLinkChanged);

const ACCOUNT = { accountId: 7, scope: 'full' as const };
const GOOD_PROOF = 'epic-link-proof-placeholder';

/** Read a handler's response off the fakeCtx's FakeRes. */
function captured(res: http.ServerResponse): { status: number; body: unknown } {
  const fake = res as unknown as FakeRes;
  return { status: fake.statusCode, body: fake.body ? JSON.parse(fake.body) : undefined };
}

/** Grab a registered route by method + path. */
function routeFor(method: string, routePath: string): RouteDef {
  const route = routes.find((r) => r.method === method && r.path === routePath);
  if (!route) throw new Error(`no route registered for ${method} ${routePath}`);
  return route;
}

/** Run a route's full middleware chain then its handler, the onion order. */
async function runRoute(route: RouteDef, ctx: Ctx): Promise<void> {
  const chain = route.middleware ?? [];
  let i = -1;
  const next = async (): Promise<void> => {
    i++;
    if (i < chain.length) await chain[i](ctx, next);
    else await route.handler(ctx);
  };
  await next();
}

const savedEnv: Record<string, string | undefined> = {};
const EPIC_ENV_KEYS = [
  'EPIC_ENABLED',
  'EPIC_PRODUCT_ID',
  'EPIC_SANDBOX_ID',
  'EPIC_DEPLOYMENT_ID',
  'EPIC_CLIENT_ID',
  'EPIC_CLIENT_SECRET',
] as const;

function enableEpic(): void {
  process.env.EPIC_ENABLED = '1';
  process.env.EPIC_PRODUCT_ID = 'prod-test';
  process.env.EPIC_DEPLOYMENT_ID = 'dep-test';
  process.env.EPIC_CLIENT_ID = 'client-test';
  process.env.EPIC_CLIENT_SECRET = 'raw-test-secret-value';
}

beforeEach(() => {
  for (const key of EPIC_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of EPIC_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetEpicLinkRateLimits();
  vi.clearAllMocks();
  linkForAccountMock.mockResolvedValue(null);
  insertMock.mockResolvedValue('ok');
});

// ---------------------------------------------------------------------------
// DDL pins (the epic_links literals in db.ts SCHEMA).
// ---------------------------------------------------------------------------

describe('epic_links DDL', () => {
  it('is additive and idempotent with both uniqueness constraints and the cascade', () => {
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS epic_links');
    expect(SCHEMA).toContain(
      'account_id INT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE',
    );
    expect(SCHEMA).toContain('epic_account_id TEXT NOT NULL UNIQUE');
  });
});

// ---------------------------------------------------------------------------
// The env gate: every route answers epic.disabled while dark, before auth.
// ---------------------------------------------------------------------------

describe('the EPIC_ENABLED gate', () => {
  it('answers 503 epic.disabled on EVERY route when the flag is off, even unauthenticated', async () => {
    for (const route of routes) {
      const ctx = fakeCtx({ method: route.method, url: route.path });
      await expect(runRoute(route, ctx)).rejects.toMatchObject({
        status: 503,
        code: 'epic.disabled',
      });
    }
    // The gate answered before any auth or db work.
    expect(linkForAccountMock).not.toHaveBeenCalled();
  });

  it('exposes exactly the three expected routes, gate first in every chain', () => {
    expect(routes.map((r) => `${r.method} ${r.path}`).sort()).toEqual([
      'DELETE /api/epic/link',
      'GET /api/epic/status',
      'POST /api/epic/link',
    ]);
    for (const route of routes) {
      expect(route.surface).toBe('api');
      expect(route.middleware?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('with the flag ON, an unauthenticated call is rejected by the bearer gate (auth mounts behind the env gate)', async () => {
    enableEpic();
    const route = routeFor('GET', '/api/epic/status');
    const ctx = fakeCtx({ method: 'GET', url: route.path });
    await expect(runRoute(route, ctx)).rejects.toMatchObject({
      status: 401,
      code: 'auth.token_missing',
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/epic/link handler arms (middleware bypassed; ctx.account preset).
// Phase 3: shape, provisioning, already-linked, and the verify stub (upstream).
// ---------------------------------------------------------------------------

describe('POST /api/epic/link', () => {
  const handler = () => routeFor('POST', '/api/epic/link').handler;

  function linkCtx(body: unknown): Ctx {
    return fakeCtx({ method: 'POST', url: '/api/epic/link', account: ACCOUNT, body });
  }

  it.each([
    ['missing', undefined],
    ['not a string', 42],
    ['empty string', ''],
    ['too long', 'a'.repeat(MAX_PROOF_CHARS + 1)],
  ])('rejects a %s proof 400 epic.invalid_token without a db write', async (_name, proof) => {
    enableEpic();
    await expect(handler()(linkCtx({ proof }))).rejects.toMatchObject({
      status: 400,
      code: 'epic.invalid_token',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('answers 503 epic.upstream when enabled but unprovisioned, before any write', async () => {
    process.env.EPIC_ENABLED = '1';
    await expect(handler()(linkCtx({ proof: GOOD_PROOF }))).rejects.toMatchObject({
      status: 503,
      code: 'epic.upstream',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('409 epic.already_linked for a linked account BEFORE burning verify work', async () => {
    enableEpic();
    linkForAccountMock.mockResolvedValue({
      accountId: ACCOUNT.accountId,
      epicAccountId: 'epic-account-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(handler()(linkCtx({ proof: GOOD_PROOF }))).rejects.toMatchObject({
      status: 409,
      code: 'epic.already_linked',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('Phase 3 verify stub: provisioned surface still answers epic.upstream (no unproven write)', async () => {
    enableEpic();
    await expect(handler()(linkCtx({ proof: GOOD_PROOF }))).rejects.toMatchObject({
      status: 503,
      code: 'epic.upstream',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/epic/link + GET /api/epic/status.
// ---------------------------------------------------------------------------

describe('DELETE /api/epic/link', () => {
  it('deletes the link, invalidates the mirror cache, and is idempotent', async () => {
    enableEpic();
    const handler = routeFor('DELETE', '/api/epic/link').handler;
    for (let round = 0; round < 2; round++) {
      const ctx = fakeCtx({ method: 'DELETE', url: '/api/epic/link', account: ACCOUNT });
      await handler(ctx);
      expect(captured(ctx.res)).toEqual({ status: 200, body: { unlinked: true } });
    }
    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenCalledWith(ACCOUNT.accountId);
    expect(onLinkChangedMock).toHaveBeenCalledWith(ACCOUNT.accountId, null);
  });
});

describe('GET /api/epic/status', () => {
  it('reports a linked caller with the epic account id', async () => {
    enableEpic();
    linkForAccountMock.mockResolvedValue({
      accountId: ACCOUNT.accountId,
      epicAccountId: 'epic-account-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const ctx = fakeCtx({ method: 'GET', url: '/api/epic/status', account: ACCOUNT });
    await routeFor('GET', '/api/epic/status').handler(ctx);
    expect(captured(ctx.res)).toEqual({
      status: 200,
      body: { enabled: true, linked: true, epicAccountId: 'epic-account-1' },
    });
  });

  it('reports an unlinked caller with NO epicAccountId key', async () => {
    enableEpic();
    const ctx = fakeCtx({ method: 'GET', url: '/api/epic/status', account: ACCOUNT });
    await routeFor('GET', '/api/epic/status').handler(ctx);
    const { status, body } = captured(ctx.res);
    expect(status).toBe(200);
    expect(body).toEqual({ enabled: true, linked: false });
    expect('epicAccountId' in (body as object)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The rate-limit policy (fused ip+account, tier-1 in-process).
// ---------------------------------------------------------------------------

describe('EPIC_LINK_POLICY', () => {
  it('is ip+account, derives from the limiter constant, and 429s past the cap', async () => {
    expect(EPIC_LINK_POLICY.name).toBe('epic_link');
    expect(EPIC_LINK_POLICY.keyClass).toBe('ip+account');
    expect(EPIC_LINK_POLICY.limit).toBe(EPIC_LINK_MAX_PER_MINUTE);
    expect(EPIC_LINK_POLICY.limit).toBe(5);
    const mw = rateLimit(EPIC_LINK_POLICY);
    const ctx = fakeCtx({ method: 'POST', url: '/api/epic/link', account: ACCOUNT });
    for (let i = 0; i < EPIC_LINK_MAX_PER_MINUTE; i++) {
      await expect(mw(ctx, async () => {})).resolves.toBeUndefined();
    }
    await expect(mw(ctx, async () => {})).rejects.toMatchObject({
      status: 429,
      code: 'rate_limit.exceeded',
    });
  });

  it('is MOUNTED on POST /api/epic/link: the request past the cap 429s through the real chain', async () => {
    enableEpic();
    const bearer = { authorization: `Bearer ${'a'.repeat(64)}` };
    const route = routeFor('POST', '/api/epic/link');
    for (let i = 0; i < EPIC_LINK_MAX_PER_MINUTE; i++) {
      const ctx = fakeCtx({
        method: 'POST',
        url: '/api/epic/link',
        headers: bearer,
        body: { proof: GOOD_PROOF },
      });
      // Phase 3: every allowed attempt ends as epic.upstream (verify stub),
      // which still counts against the rate limit before the handler runs.
      await expect(runRoute(route, ctx)).rejects.toMatchObject({
        status: 503,
        code: 'epic.upstream',
      });
    }
    const capped = fakeCtx({
      method: 'POST',
      url: '/api/epic/link',
      headers: bearer,
      body: { proof: GOOD_PROOF },
    });
    await expect(runRoute(route, capped)).rejects.toMatchObject({
      status: 429,
      code: 'rate_limit.exceeded',
    });
  });
});

// ---------------------------------------------------------------------------
// Pure proof helper.
// ---------------------------------------------------------------------------

describe('proof helpers (pure)', () => {
  it('isProofShape accepts a non-empty string inside the clamp and rejects everything else', () => {
    expect(isProofShape(GOOD_PROOF)).toBe(true);
    expect(isProofShape('a'.repeat(MAX_PROOF_CHARS))).toBe(true);
    expect(isProofShape('')).toBe(false);
    expect(isProofShape(null)).toBe(false);
    expect(isProofShape(42)).toBe(false);
    expect(isProofShape('a'.repeat(MAX_PROOF_CHARS + 1))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The forbidden-login rule: the epic domain can never mint credentials.
// ---------------------------------------------------------------------------

describe('login with Epic does not exist', () => {
  const EPIC_DIR = path.resolve(process.cwd(), 'server/epic');

  // The source files the rule covers, exactly. A new epic module joins this
  // list and the Layout section of server/epic/CLAUDE.md in the same change.
  const EPIC_SOURCE_FILES = ['config.ts', 'epic_db.ts', 'index.ts', 'mirror.ts', 'routes.ts'];

  // The credential-minting surface the epic domain may never reach for.
  // Same widened list as tests/server/steam_routes.test.ts.
  const FORBIDDEN = [
    'newToken',
    'auth_tokens',
    'saveToken',
    'createCompanionToken',
    'createAccount',
  ];

  const codeOnly = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const mintSitesUnder = (root: string): string[] =>
    tsFilesUnder(root).flatMap(({ file, full }) => {
      const code = codeOnly(fs.readFileSync(full, 'utf8'));
      return FORBIDDEN.filter((token) => code.includes(token)).map((token) => `${file}: ${token}`);
    });

  it('the scan reads every source file under server/epic (never passes vacuously)', () => {
    expect(
      tsFilesUnder(EPIC_DIR).map((f) => f.file),
      'server/epic source files: a new module joins this list and stays clear of FORBIDDEN',
    ).toEqual(EPIC_SOURCE_FILES);
    // The strip must still remove the prose that states the rule, or the scan
    // reports the documentation as a violation of itself.
    const routesSource = fs.readFileSync(path.join(EPIC_DIR, 'routes.ts'), 'utf8');
    expect(routesSource).toContain('newToken');
    expect(codeOnly(routesSource)).not.toContain('newToken');
  });

  it('no file under server/epic mints or touches a credential (source scan)', () => {
    expect(
      mintSitesUnder(EPIC_DIR),
      'the epic domain reached for the credential surface; linking never mints a login',
    ).toEqual([]);
  });

  it('the scan descends, so a module in a SUBDIRECTORY is covered too', () => {
    const fixture = fs.mkdtempSync(path.join(tmpdir(), 'woc-epic-scan-'));
    try {
      fs.mkdirSync(path.join(fixture, 'nested', 'deeper'), { recursive: true });
      fs.writeFileSync(path.join(fixture, 'clean.ts'), 'export const ok = true;\n');
      fs.writeFileSync(
        path.join(fixture, 'nested', 'mints.ts'),
        "import { newToken } from '../../auth';\n",
      );
      fs.writeFileSync(
        path.join(fixture, 'nested', 'deeper', 'reads_table.ts'),
        "export const q = 'SELECT 1 FROM auth_tokens';\n",
      );
      fs.writeFileSync(
        path.join(fixture, 'nested', 'deeper', 'wrapper.ts'),
        'export const t = await saveToken(random, accountId);\n',
      );
      fs.writeFileSync(
        path.join(fixture, 'nested', 'documented.ts'),
        '// This module must never call newToken or touch auth_tokens.\n',
      );
      fs.writeFileSync(path.join(fixture, 'nested', 'notes.md'), 'newToken(auth_tokens)\n');

      expect(mintSitesUnder(fixture)).toEqual([
        'nested/deeper/reads_table.ts: auth_tokens',
        'nested/deeper/wrapper.ts: saveToken',
        'nested/mints.ts: newToken',
      ]);
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it('the rule reads the tree through the shared walker, with no flat reader beside it', () => {
    const own = codeOnly(
      fs.readFileSync(path.resolve(process.cwd(), 'tests/server/epic_routes.test.ts'), 'utf8'),
    );
    expect(own.split(`readdir${'Sync('}`).length - 1).toBe(0);
    expect(own).toContain(`helpers/ts_files${'_under'}`);
  });

  it('the disabled surface makes the dark default safe: no env, no route runs a handler', async () => {
    // Belt and braces over the gate test: no EPIC_* env at all (the shipped
    // default), every route rejects with the stable code and zero db traffic.
    for (const route of routes) {
      const ctx = fakeCtx({ method: route.method, url: route.path, account: ACCOUNT });
      await expect(runRoute(route, ctx)).rejects.toSatisfy(
        (err: unknown) => err instanceof HttpError && err.code === 'epic.disabled',
      );
    }
    expect(linkForAccountMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
