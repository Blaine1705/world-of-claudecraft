// World PvP spoils: what a paid world kill leaves on the loser's body.
//
// When both the victim and the killing blow carry the /pvp flag, the killing
// blow's share of the gold stake does not vanish into their purse with a chat
// line: it DROPS onto the victim's body next to a trophy skull named for the
// victim ("Bet's Skull"), and the killer loots both like any corpse
// (interaction.ts lootCorpse, the loot window, the same take-loot path). Every
// other contributor's share still moves purse to purse inside the kill
// resolution (world_pvp.ts), exactly as before: the body carries only what
// the killing blow earned, so nobody's split changes.
//
// A player's body is not a mob corpse that decays on a clock: it lies where
// it fell until its owner releases or is resurrected, and then the entity
// itself moves. So the spoils are SETTLED the moment the body stops being a
// body (release and every revive route through spirit.ts, and the zone pass
// sweeps any other way out): whatever is still on it goes to the killer
// straight away, or, if the killer has left the world, the gold goes back to
// the victim's purse. The victim can never deny the drop by releasing, and no
// gold is ever destroyed by an unlooted body.
//
// The books row (`ctx.worldPvpBooks.spoils`, victim pid -> killer pid) lives
// on the Sim beside the other World PvP books; it is bounded by the flagged
// players lying dead with spoils on them right now.
//
// Host-agnostic: no DOM, no rng, no wall clock.

import { formatMoney } from '../format_money';
import type { SimContext } from '../sim_context';
import type { Entity, ItemInstancePayload, LootSlot } from '../types';

/** The trophy a flagged killing blow takes from a flagged victim's body. The
 *  victim's name rides the copy's `signer` (the one per-copy player-name field:
 *  load-validated, rename-aware, carried by every inventory projection), and
 *  the client renders the copy as "<name>'s Skull". */
export const WORLD_PVP_SKULL_ITEM_ID = 'pvp_trophy_skull';

/** A player's corpse clock never ticks (only mobs decay), so a body holding
 *  spoils just needs a non-zero clock to read as "not decayed" to the shared
 *  corpse predicates; settling puts it back to 0. */
const SPOILS_CORPSE_CLOCK = 1;

/** The per-copy payload of one trophy skull. */
export function worldPvpSkullInstance(victimName: string): ItemInstancePayload {
  return { signer: victimName };
}

/** Is this copy a named trophy skull? The UI keys its "<name>'s Skull" label
 *  off this, never off the item id alone (an unsigned copy keeps the def name). */
export function isWorldPvpSkullCopy(
  itemId: string,
  instance: ItemInstancePayload | undefined,
): instance is ItemInstancePayload & { signer: string } {
  return itemId === WORLD_PVP_SKULL_ITEM_ID && typeof instance?.signer === 'string';
}

/** What the killing blow is told when their spoils drop. Matched by the client
 *  (src/ui/sim_i18n.ts `worldPvp.spoilsOnBody`). */
export function worldPvpSpoilsLine(victimName: string): string {
  return `Loot ${victimName}'s body to claim your spoils.`;
}

/**
 * Drop the killing blow's spoils on the victim's body: `copper` (their share
 * of the stake, already charged to the victim's purse by the caller) and one
 * skull only the killer can take. The body is tapped to the killer, so the
 * loot rights, the popup and the take path are the corpse ones unchanged.
 */
export function placeWorldPvpSpoils(
  ctx: SimContext,
  victim: Entity,
  killer: Entity,
  copper: number,
): void {
  // A body that stood up by a route that did not settle it (and the zone pass
  // has not seen yet) still owes its earlier killer: pay that first, never
  // overwrite it.
  settleWorldPvpSpoils(ctx, victim.id);
  const skull: LootSlot = {
    itemId: WORLD_PVP_SKULL_ITEM_ID,
    count: 1,
    instance: worldPvpSkullInstance(victim.name),
    personalFor: [killer.id],
  };
  victim.loot = { copper: Math.max(0, Math.floor(copper)), items: [skull] };
  victim.lootable = true;
  victim.tappedById = killer.id;
  victim.lootRecipientIds = [killer.id];
  victim.lootFfaTimer = Number.POSITIVE_INFINITY;
  victim.corpseTimer = SPOILS_CORPSE_CLOCK;
  ctx.worldPvpBooks.spoils.set(victim.id, killer.id);
}

function clearSpoils(victim: Entity): void {
  victim.loot = null;
  victim.lootable = false;
  victim.tappedById = null;
  delete victim.lootRecipientIds;
  victim.lootFfaTimer = Number.POSITIVE_INFINITY;
  victim.corpseTimer = 0;
}

/**
 * Settle a body's spoils: whatever the killer has not looted yet goes to them
 * now (the gold with the ordinary loot line, the skull when it fits their
 * bags), or, with the killer gone from the world, the gold returns to the
 * victim. A no-op for a player with no spoils row. Idempotent.
 */
export function settleWorldPvpSpoils(ctx: SimContext, victimId: number): void {
  const books = ctx.worldPvpBooks;
  const killerId = books.spoils.get(victimId);
  if (killerId === undefined) return;
  books.spoils.delete(victimId);
  const victim = ctx.entities.get(victimId);
  if (!victim) return;
  const loot = victim.loot;
  clearSpoils(victim);
  if (!loot) return;
  const killerMeta = ctx.players.get(killerId);
  if (!killerMeta || !ctx.entities.has(killerId)) {
    const victimMeta = ctx.players.get(victimId);
    if (victimMeta && loot.copper > 0) victimMeta.copper += loot.copper;
    return;
  }
  if (loot.copper > 0) {
    killerMeta.copper += loot.copper;
    ctx.emit({ type: 'loot', text: `You loot ${formatMoney(loot.copper)}.`, pid: killerId });
  }
  let bagsFull = false;
  for (const slot of loot.items) {
    if (slot.count <= 0 || (slot.personalFor && !slot.personalFor.includes(killerId))) continue;
    // The plain room check: a trophy copy never merges into a plain stack, so
    // free slots are what it needs. (bags.ts itself is not imported here: it
    // would load the material tables before the content they derive from.)
    const instance = slot.instance ?? {};
    if (!ctx.canAddItem(slot.itemId, slot.count, killerId)) {
      bagsFull = true;
      continue;
    }
    ctx.addItemInstance(slot.itemId, instance, killerId, slot.count);
  }
  if (bagsFull) ctx.error(killerId, 'Your bags are full.');
}

/** The zone-pass safety net: settle every body that stopped being one by a
 *  route that did not settle it itself (a revive path outside spirit.ts, a
 *  body removed from the world). Bounded by the bodies holding spoils. */
export function sweepWorldPvpSpoils(ctx: SimContext): void {
  const books = ctx.worldPvpBooks;
  if (books.spoils.size === 0) return;
  for (const victimId of [...books.spoils.keys()]) {
    const victim = ctx.entities.get(victimId);
    if (!victim || !victim.dead || victim.ghost || !victim.lootable) {
      settleWorldPvpSpoils(ctx, victimId);
    }
  }
}
