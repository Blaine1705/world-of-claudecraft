// The ad-spend ledger admin API (registry-only RouteDefs, the new-route rule:
// no legacy ladder arm, so the legacy rollback answers 404 for these by
// design). Three thin handlers over ad_spend_db.ts:
//
//   GET  /admin/api/ad-spend?days=N   list the trailing window
//   POST /admin/api/ad-spend          upsert one (day, campaign) row
//   POST /admin/api/ad-spend/delete   remove one (day, campaign) row
//   (delete rides POST like the other admin delete arms, e.g.
//   /admin/api/chat-filter/words/:id/delete)
//
// Permissions (admin_routes.ts): the read rides analytics.read like the other
// dashboards; the writes carry the new analytics.manage so a viewer role can
// see spend but never edit the ledger. Bodies use the legacy admin envelope
// ({ success, data, error }) like every /admin/api route.

import {
  type AdminAuthDb,
  ADMIN_META,
  createRequireAdmin,
} from './http/middleware/require_admin';
import type { Ctx, RouteDef } from './http/types';
import { json, readBody } from './http_util';
import { accountAndScopeForToken, pool } from './db';
import {
  type AdSpendRow,
  deleteAdSpend,
  listAdSpend,
  type UpsertAdSpendInput,
  upsertAdSpend,
} from './ad_spend_db';
import { adminRolesForAccount } from './staff_db';

// ---------------------------------------------------------------------------
// Db seam (the auth_routes.ts shape): the real bundle, swappable in tests.
// ---------------------------------------------------------------------------

const REAL_AD_SPEND_DB = {
  accountAndScopeForToken,
  adminRolesForAccount,
  upsertAdSpend: (input: UpsertAdSpendInput): Promise<AdSpendRow> => upsertAdSpend(pool, input),
  listAdSpend: (days: number): Promise<AdSpendRow[]> => listAdSpend(pool, days),
  deleteAdSpend: (day: string, campaign: string): Promise<boolean> =>
    deleteAdSpend(pool, day, campaign),
};
let adSpendDb = REAL_AD_SPEND_DB;

/** Override the ad-spend db bundle with a fake (test-only; merges over the
 *  CURRENT bundle so a test can layer a second override without re-supplying
 *  its auth fakes; resetAdSpendDbForTests restores the real bundle). */
export function setAdSpendDbForTests(overrides: Partial<typeof REAL_AD_SPEND_DB>): void {
  adSpendDb = { ...adSpendDb, ...overrides };
}

/** Restore the real bundle after a setAdSpendDbForTests override (test-only). */
export function resetAdSpendDbForTests(): void {
  adSpendDb = REAL_AD_SPEND_DB;
}

// The admin-auth gate, reading the LIVE bundle per request like admin.ts does.
const requireAdmin = createRequireAdmin(
  (): AdminAuthDb => ({
    accountAndScopeForToken: (token) => adSpendDb.accountAndScopeForToken(token),
    adminRolesForAccount: (accountId) => adSpendDb.adminRolesForAccount(accountId),
  }),
);

const ok = (ctx: Ctx, data: unknown): void => json(ctx.res, 200, { success: true, data, error: null });
const failBody = (ctx: Ctx, status: number, error: string): void =>
  json(ctx.res, status, { success: false, data: null, error });

/** GET /admin/api/ad-spend?days=N: the trailing spend window, newest first. */
async function listHandler(ctx: Ctx): Promise<void> {
  const days = Number(ctx.url.searchParams.get('days') ?? '90');
  ok(ctx, { rows: await adSpendDb.listAdSpend(days) });
}

/** POST /admin/api/ad-spend: upsert one (day, campaign) row. */
async function upsertHandler(ctx: Ctx): Promise<void> {
  const body = await readBody(ctx.req);
  try {
    const row = await adSpendDb.upsertAdSpend({
      day: body.day as string,
      campaign: body.campaign as string,
      spendCents: body.spendCents as number,
      impressions: body.impressions as number | undefined,
      clicks: body.clicks as number | undefined,
      currency: body.currency as string | undefined,
    });
    ok(ctx, { row });
  } catch (err) {
    if (err instanceof TypeError) {
      failBody(ctx, 400, err.message);
      return;
    }
    throw err;
  }
}

/** POST /admin/api/ad-spend/delete: remove one (day, campaign) row. */
async function deleteHandler(ctx: Ctx): Promise<void> {
  const body = await readBody(ctx.req);
  try {
    const deleted = await adSpendDb.deleteAdSpend(body.day as string, body.campaign as string);
    ok(ctx, { deleted });
  } catch (err) {
    if (err instanceof TypeError) {
      failBody(ctx, 400, err.message);
      return;
    }
    throw err;
  }
}

export const routes: RouteDef[] = [
  {
    method: 'GET',
    path: '/admin/api/ad-spend',
    surface: 'admin',
    middleware: [requireAdmin],
    meta: ADMIN_META,
    handler: listHandler,
  },
  {
    method: 'POST',
    path: '/admin/api/ad-spend',
    surface: 'admin',
    middleware: [requireAdmin],
    meta: ADMIN_META,
    handler: upsertHandler,
  },
  {
    method: 'POST',
    path: '/admin/api/ad-spend/delete',
    surface: 'admin',
    middleware: [requireAdmin],
    meta: ADMIN_META,
    handler: deleteHandler,
  },
];
