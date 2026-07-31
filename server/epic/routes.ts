// The Epic link surface: three registry-only RouteDefs (no legacy-ladder twin,
// by design, like server/steam/routes.ts). Everything answers epic.disabled
// until EPIC_ENABLED=1.
//
// THE HARD RULE, pinned by tests/server/epic_routes.test.ts: linking is
// allowed, LOGIN WITH EPIC DOES NOT EXIST. Nothing in server/epic/ calls
// newToken, reads or writes auth_tokens, or mints any credential; a
// epic_links row is a cosmetic-mirror pointer for the deeds achievement
// mirror, never an identity or session source. Login stays email + Discord
// only, everywhere, always.
//
// POST /api/epic/link { proof }: the client (desktop shell only in v1) obtains
// a short-lived link proof and posts it; Phase 5 will have the SERVER verify
// it upstream and extract the Epic account id from the verified response. The
// client is never trusted to name its own Epic id. Until Phase 5 lands real
// verification, a provisioned server still answers epic.upstream on link (the
// dark-safe stub).

import { ctxAccountId } from '../http/context';
import { HttpError } from '../http/errors';
import { withBody } from '../http/middleware/body';
import { EPIC_LINK_POLICY, rateLimit } from '../http/middleware/rate_limit';
import { requireAccount } from '../http/middleware/require_account';
import type { Ctx, Middleware, RouteDef } from '../http/types';
import { json } from '../http_util';
import { epicEnabled, epicProvisioned } from './config';
import { deleteEpicLink, epicLinkForAccount } from './epic_db';
import { onLinkChanged } from './mirror';

/** Loose proof shape clamp until Phase 5 pins the real EOS proof form. A
 *  non-empty string under this cap is admitted; everything else is
 *  epic.invalid_token before any upstream work. */
export const MAX_PROOF_CHARS = 16_384;

/** True when the body field is a non-empty string inside the size clamp. */
export function isProofShape(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PROOF_CHARS;
}

/** The feature gate, FIRST on every route (before auth): with the flag off
 *  the whole surface answers the stable epic.disabled 503, bearer or not. */
const epicDisabledGuard: Middleware = async (_ctx, next) => {
  if (!epicEnabled()) throw new HttpError(503, 'epic.disabled');
  await next();
};

/** POST /api/epic/link { proof }: verify and store the caller's link.
 *  Phase 3: shape + provisioning + already-linked pre-checks only; real
 *  upstream verification and insert/displace land in Phase 5. */
async function linkHandler(ctx: Ctx): Promise<void> {
  const accountId = ctxAccountId(ctx);
  const proof = (ctx.body as Record<string, unknown> | null | undefined)?.proof;
  if (!isProofShape(proof)) throw new HttpError(400, 'epic.invalid_token');

  // Enabled but not provisioned (missing product / deployment / client ids or
  // secret) reads as the upstream being unreachable: a 503 the player can
  // retry, never a 500.
  if (!epicProvisioned()) throw new HttpError(503, 'epic.upstream');

  // Cheap conflict first: an already-linked account never burns an upstream
  // verification call (Phase 5 will keep this order).
  if ((await epicLinkForAccount(accountId)) !== null) {
    throw new HttpError(409, 'epic.already_linked');
  }

  // Phase 5 replaces this stub with real EOS verification, reclaim-by-proof
  // displace, insert, and reconcile. Until then a provisioned surface still
  // refuses to link so a half-lit deploy never writes an unproven row.
  throw new HttpError(503, 'epic.upstream');
}

/** DELETE /api/epic/link: drop the caller's link. Idempotent. */
async function unlinkHandler(ctx: Ctx): Promise<void> {
  const accountId = ctxAccountId(ctx);
  await deleteEpicLink(accountId);
  onLinkChanged(accountId, null);
  json(ctx.res, 200, { unlinked: true });
}

/** GET /api/epic/status: the caller's link state (enabled is always true
 *  here; with the flag off the guard answered first). */
async function statusHandler(ctx: Ctx): Promise<void> {
  const row = await epicLinkForAccount(ctxAccountId(ctx));
  json(ctx.res, 200, {
    enabled: true,
    linked: row !== null,
    ...(row === null ? {} : { epicAccountId: row.epicAccountId }),
  });
}

/** Mutation-tier bearer gate for link/unlink. */
const activeAccount = requireAccount({ scope: 'active' });
/** Read-tier bearer gate for the status read. */
const readAccount = requireAccount({ scope: 'read' });

export const routes: RouteDef[] = [
  {
    method: 'POST',
    path: '/api/epic/link',
    surface: 'api',
    // Order matters: the feature gate answers before auth (epic.disabled on
    // every call while dark), the limiter needs ctx.account so it mounts
    // behind the guard, and the body reader feeds the handler last.
    middleware: [epicDisabledGuard, activeAccount, rateLimit(EPIC_LINK_POLICY), withBody()],
    handler: linkHandler,
  },
  {
    method: 'DELETE',
    path: '/api/epic/link',
    surface: 'api',
    middleware: [epicDisabledGuard, activeAccount],
    handler: unlinkHandler,
  },
  {
    method: 'GET',
    path: '/api/epic/status',
    surface: 'api',
    middleware: [epicDisabledGuard, readAccount],
    handler: statusHandler,
  },
];
