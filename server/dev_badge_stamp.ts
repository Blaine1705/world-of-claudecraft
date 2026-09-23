// One player's developer-badge stamp, moved out of GameServer.refreshDevBadge
// (the monolith ratchet): the entity flair fields plus the matching title
// deeds. Cosmetic only: the sim never reads the flair back, and no client
// command can set it, so the rung is server-resolved or it does not exist.
//
// Only an actual contributor (tier > 0, so >= 1 merged PR) carries the flair on
// the wire; a linked non-contributor reads as no badge. Assigning only on a real
// change keeps the identity diff (and so the nearby re-broadcast) quiet.
//
// The title grant runs every refresh, not only on a tier change: it is
// idempotent, and a rung reached before the title deeds shipped (flair already
// stamped, so no change) still has to unlock its titles.
import { grantDevBadgeTitles } from '../src/sim/dev_badge_deeds';
import type { PlayerMeta } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import type { Entity } from '../src/sim/types';

/** Stamp the resolved rung on the entity; returns true when the flair changed. */
export function stampDevBadge(
  ctx: SimContext,
  e: Entity,
  meta: PlayerMeta | null,
  tier: number,
  login: string | null,
  mergedPrs: number,
): boolean {
  if (meta && tier > 0) grantDevBadgeTitles(ctx, meta, tier);
  const githubLogin = tier > 0 ? (login ?? undefined) : undefined;
  const devMergedPrs = tier > 0 ? mergedPrs : undefined;
  if (
    (e.devTier ?? 0) === tier &&
    (e.devMergedPrs ?? 0) === (devMergedPrs ?? 0) &&
    e.githubLogin === githubLogin
  ) {
    return false;
  }
  e.devTier = tier;
  e.devMergedPrs = devMergedPrs;
  e.githubLogin = githubLogin;
  return true;
}
