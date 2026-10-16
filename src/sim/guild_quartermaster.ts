// Garrick Holt, Lantern Hall's quartermaster (content/guild_contracts.ts
// GUILD_QUARTERMASTER_STOCK): Lantern Seals for cosmetics only. Each offer is a Book of Deeds
// feat whose reward is a title, granted through the one grant path (deeds.ts grantDeed), so the
// Book and the title picker follow.
//
// Server-authoritative like the Heroic Quartermaster (instances/heroic_vendor.ts): the client
// only sends intent; everything re-validates here. The price debits the buyer's bags. Refusals
// are structured events (the client owns every visible string). Draws no rng.

import { DEEDS } from './content/deeds';
import { GUILD_QUARTERMASTER_STOCK_BY_ID, LANTERN_SEAL_ITEM_ID } from './content/guild_contracts';
import {
  GUILD_QUARTERMASTER_NPC_ID,
  HIGHWATCH_GUILD_ENTITY_IDS,
  HIGHWATCH_GUILD_TALK_RANGE,
} from './content/highwatch_guild';
import { grantDeed } from './deeds';
import type { SimContext } from './sim_context';
import type { Entity } from './types';

/** The quartermaster within reach of the player (alive, beside him, on his floor). */
export function guildQuartermasterInRange(ctx: SimContext, player: Entity): boolean {
  const npc = ctx.entities.get(HIGHWATCH_GUILD_ENTITY_IDS[GUILD_QUARTERMASTER_NPC_ID]);
  if (!npc || npc.dead || npc.kind !== 'npc' || npc.templateId !== GUILD_QUARTERMASTER_NPC_ID)
    return false;
  if (Math.hypot(player.pos.x - npc.pos.x, player.pos.z - npc.pos.z) > HIGHWATCH_GUILD_TALK_RANGE)
    return false;
  return Math.abs(player.pos.y - npc.pos.y) <= 3;
}

export function buyGuildCosmetic(ctx: SimContext, offerId: string, pid?: number): void {
  const resolved = ctx.resolve(pid);
  if (!resolved) return;
  const { meta, e: player } = resolved;
  if (!Object.hasOwn(GUILD_QUARTERMASTER_STOCK_BY_ID, offerId)) return;
  const offer = GUILD_QUARTERMASTER_STOCK_BY_ID[offerId];
  // never take the seals for a title the Book cannot grant
  if (!Object.hasOwn(DEEDS, offer.deedId)) return;
  if (player.dead) return;
  const refuse = (reason: 'owned' | 'seals' | 'range') =>
    ctx.emit({ type: 'guildCosmeticRefused', offerId, reason, pid: meta.entityId });
  if (!guildQuartermasterInRange(ctx, player)) return refuse('range');
  if (meta.deedsEarned.has(offer.deedId)) return refuse('owned');
  if (ctx.countItem(LANTERN_SEAL_ITEM_ID, meta.entityId) < offer.seals) return refuse('seals');
  if (!grantDeed(ctx, meta, offer.deedId)) return;
  ctx.removeItem(LANTERN_SEAL_ITEM_ID, offer.seals, meta.entityId);
  ctx.emit({ type: 'guildCosmeticBought', offerId, pid: meta.entityId });
}
