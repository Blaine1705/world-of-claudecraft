import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';

// Where a quest-required item still counts as HELD for the accept-time
// re-grant (finalizeQuestAccept -> questFallbackGrants).
//
// The fallback grant exists so a LOST prerequisite item can never permanently
// block a quest. `ctx.countItem` scans bags only, and bags-only was the
// starter-tool mint (items.ts, the tier-1 tool comment block): bank the tool,
// or leave it escrowed on the market or unclaimed in the mailbox, abandon,
// re-accept, and the fallback hands over another copy every time. Each place
// this predicate adds is one the player can recover the item FROM by
// themselves (bank withdrawal, listing reclaim, mailTake), so the quest stays
// completable without a fresh copy.
//
// A traded-away copy is genuinely gone and DOES re-grant: direct trade stays
// an open transfer route by ruling (R10), bounded by the quest's own repeat
// cadence rather than by this predicate.
//
// The narrow Pick keeps the read surface explicit and the unit tests honest:
// a fake ctx implements exactly these four members and nothing else.
export type QuestItemPresenceCtx = Pick<
  SimContext,
  'countItem' | 'mailboxHoldsItem' | 'marketListings' | 'marketListingBelongsTo'
>;

export function playerHoldsQuestItem(
  ctx: QuestItemPresenceCtx,
  meta: PlayerMeta,
  itemId: string,
): boolean {
  if (ctx.countItem(itemId, meta.entityId) > 0) return true;
  if (meta.bank.inventory.some((s) => s.itemId === itemId && s.count > 0)) return true;
  if (ctx.mailboxHoldsItem(meta, itemId)) return true;
  return ctx.marketListings.some(
    (l) => l.itemId === itemId && l.count > 0 && ctx.marketListingBelongsTo(l, meta),
  );
}
