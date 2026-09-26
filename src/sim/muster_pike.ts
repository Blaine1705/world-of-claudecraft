// The muster pike: a Shardpike LENT off the weapon rack at the command camp, for one fight.
//
// Skerrit's quest hands his own pike to a level 6 who walks into Fenbridge and asks. The
// muster does it for anyone, any level, no quest: whoever walks up to the rack below the
// Starfall Crater and takes one gets a Muster Shardpike in their hands (the same trial,
// lance_trial.ts, reads both through isShardpikeItem). What makes it LENT rather than loot:
//
//   - Taking it swaps it into the main hand and REMEMBERS what it displaced (the main hand
//     weapon, and the off hand if the two-hander benched it). Nothing is lost: the displaced
//     pieces go to the bags through the ordinary equip swap, which refuses outright when the
//     bags cannot take them, so the rack refuses too.
//   - It is reclaimed when the pull ends, when its bearer walks out of the muster's reach
//     (MUSTER_PIKE_LEASH), or dies. Reclaiming removes it from the hands AND the bags, and
//     puts the remembered weapons back in the hands if those slots are free.
//   - It is never saved: savedGearFor folds a lent pike back out of every character save,
//     autosave and logout alike, with the displaced weapons back in their slots, so a relog
//     (or a crash) always comes back holding what the player walked up with.
//   - Every other exit is closed on the item itself (content/zone2.ts muster_shardpike):
//     soulbound (trade, mail, market, vendor, guild bank), lentGear (the personal bank),
//     noDiscard, noVendorSell, noMarketList.
//
// State: the lent records live on the muster army state (src/sim/mirefen_muster.ts), which
// Sim owns and hands to the modules as a live view. Draws no rng anywhere.

import { MUSTER_PIKE_LEASH } from './content/mirefen_muster';
import { ITEMS } from './data';
import { recalcPlayerStats } from './entity';
import { equipItem } from './items';
import { isShardpikeItem, MUSTER_SHARDPIKE_ID } from './lance_balance_core';
import { refreshModsForEquipmentChange } from './progression/talents';
import type { PlayerMeta } from './sim';
import type { SimContext } from './sim_context';
import {
  cloneInvSlot,
  cloneItemInstancePayload,
  dist2d,
  type EquipSlot,
  type InvSlot,
  type ItemInstancePayload,
} from './types';

export { MUSTER_SHARDPIKE_ID };

/** What a lent pike displaced, to be handed back when the muster takes it again. */
export interface LentPikeRecord {
  mainhand: string | null;
  offhand: string | null;
}

/** Every live loan, keyed by the borrower's player id. */
export type LentPikes = Map<number, LentPikeRecord>;

/** The reasons a loan ends. Only the log line cares, and only whether to speak at all. */
export type PikeReclaimReason = 'pullEnded' | 'leash' | 'death';

/** Is this item one the muster only ever lends? */
export function isLentGear(itemId: string | null | undefined): boolean {
  return !!itemId && ITEMS[itemId]?.lentGear === true;
}

/**
 * Take a pike from the rack. Any class, any level, no quest.
 *
 * Refuses (with the player's own line) while dead, while a Shardpike is already in hand
 * (either one: Skerrit's quest pike drives the same trial, so a second would be clutter),
 * and when the bags cannot take the pike or the weapons it would displace.
 */
export function takeMusterPike(ctx: SimContext, lent: LentPikes, pid: number): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const { meta, e: p } = r;
  if (p.dead) {
    ctx.error(pid, "You can't do that while dead.");
    return;
  }
  if (isShardpikeItem(meta.equipment.mainhand)) {
    ctx.error(pid, 'You already hold a Shardpike.');
    return;
  }
  const record: LentPikeRecord = {
    mainhand: meta.equipment.mainhand ?? null,
    offhand: meta.equipment.offhand ?? null,
  };
  // A pike already in the bags (taken, then swapped out by hand) is re-equipped rather
  // than joined by a second one.
  const minted = ctx.countItem(MUSTER_SHARDPIKE_ID, pid) <= 0;
  if (minted) {
    if (!ctx.canAddItem(MUSTER_SHARDPIKE_ID, 1, pid)) {
      ctx.error(pid, 'Your bags are full.');
      return;
    }
    // movement: a loan is not an acquisition, so no Reliquary obtain count moves (the
    // item still counts as SEEN in the discovered-items ledger, like any item held); the
    // take line below is the caller-owned log for it.
    ctx.addItem(MUSTER_SHARDPIKE_ID, 1, pid, { silent: true, callerLogs: true, movement: true });
  }
  equipItem(ctx, MUSTER_SHARDPIKE_ID, pid, 'mainhand');
  if (meta.equipment.mainhand !== MUSTER_SHARDPIKE_ID) {
    // The swap refused (it has already said why, e.g. no room for the benched off hand):
    // hand nothing out rather than leave a pike loose in the bags.
    if (minted) ctx.removeItem(MUSTER_SHARDPIKE_ID, 1, pid);
    return;
  }
  lent.set(pid, record);
  ctx.notice(pid, 'You take a Shardpike from the muster rack.');
}

/**
 * The muster takes its pike back: out of the hands and the bags, and the weapons it
 * displaced go back in the hands (only into a slot that is free now: a player who wielded
 * something else by hand meanwhile keeps it). A live brace ends with it.
 */
export function reclaimMusterPike(
  ctx: SimContext,
  lent: LentPikes,
  pid: number,
  _reason: PikeReclaimReason,
): void {
  const record = lent.get(pid);
  lent.delete(pid);
  const meta = ctx.players.get(pid);
  const p = ctx.entities.get(pid);
  if (!meta || !p) return;
  let reclaimed = false;
  for (const slot of ['mainhand', 'offhand'] as const) {
    if (!isLentGear(meta.equipment[slot])) continue;
    delete meta.equipment[slot];
    if (meta.equipmentInstance) delete meta.equipmentInstance[slot];
    reclaimed = true;
  }
  const carried = ctx.countItem(MUSTER_SHARDPIKE_ID, pid);
  if (carried > 0) {
    ctx.removeItem(MUSTER_SHARDPIKE_ID, carried, pid);
    reclaimed = true;
  }
  if (!reclaimed) return;
  // A worn copy left without the bag path, so poke the quest-inventory recompute too.
  ctx.onInventoryChangedForQuests(meta);
  if (meta.lance) {
    meta.lance = undefined;
    p.bracing = false;
  }
  refreshModsForEquipmentChange(ctx, meta);
  recalcPlayerStats(p, meta.cls, meta.equipment, ctx.playerMods(meta), meta.equipmentInstance);
  ctx.markDeedsDirty(pid);
  if (record) {
    if (record.mainhand && !meta.equipment.mainhand && ctx.countItem(record.mainhand, pid) > 0)
      equipItem(ctx, record.mainhand, pid, 'mainhand');
    if (record.offhand && !meta.equipment.offhand && ctx.countItem(record.offhand, pid) > 0)
      equipItem(ctx, record.offhand, pid, 'offhand');
  }
  // One line for every way a loan ends (`reason` is for the callers and the tests): what
  // ended it is obvious from what just happened, and one row localizes once.
  ctx.notice(pid, 'The muster reclaims its Shardpike.');
}

/**
 * The per-tick loan sweep, driven by the muster army each world-boss pass.
 *
 * Reclaims on the three live exits (the pull ended, the bearer died, the bearer left the
 * muster's reach) and forgets a loan whose borrower is gone or no longer carries the pike
 * anywhere (a logout: the leave save already folded it back out, see savedGearFor).
 */
export function tickLentPikes(ctx: SimContext, lent: LentPikes, pullEnded: boolean): void {
  if (lent.size === 0) return;
  for (const pid of lent.keys()) {
    const meta = ctx.players.get(pid);
    const p = ctx.entities.get(pid);
    if (!meta || !p) {
      lent.delete(pid);
      continue;
    }
    const holds =
      isLentGear(meta.equipment.mainhand) || ctx.countItem(MUSTER_SHARDPIKE_ID, pid) > 0;
    if (!holds) {
      lent.delete(pid);
      continue;
    }
    if (pullEnded) reclaimMusterPike(ctx, lent, pid, 'pullEnded');
    else if (p.dead) reclaimMusterPike(ctx, lent, pid, 'death');
    else if (
      dist2d(p.pos, { x: MUSTER_PIKE_LEASH.x, y: 0, z: MUSTER_PIKE_LEASH.z }) >
      MUSTER_PIKE_LEASH.radius
    )
      reclaimMusterPike(ctx, lent, pid, 'leash');
  }
}

/** The three gear fields of a character save. */
export interface SavedGear {
  equipment: PlayerMeta['equipment'];
  equipmentInstance: Partial<Record<EquipSlot, ItemInstancePayload>>;
  inventory: InvSlot[];
}

/**
 * The character save's gear, with any lent pike folded back out.
 *
 * For everyone not holding a loan this is exactly the copy the save always made (the same
 * clones in the same shapes), so an ordinary save is byte-for-byte unchanged. For a
 * borrower it is the save as if the muster had already taken its pike back: no pike in the
 * hands or the bags, and each remembered weapon lifted out of the bags into its free slot
 * (the newest copy, the one the live equip would lift). The live character is untouched:
 * this is a pure function of the meta, so an AUTOSAVE mid-fight changes nothing in play.
 */
export function savedGearFor(meta: PlayerMeta, record: LentPikeRecord | undefined): SavedGear {
  const equipment = { ...meta.equipment };
  const equipmentInstance: Partial<Record<EquipSlot, ItemInstancePayload>> = Object.fromEntries(
    Object.entries(meta.equipmentInstance).map(([slot, inst]) => [
      slot,
      cloneItemInstancePayload(inst),
    ]),
  );
  const inventory = meta.inventory.map(cloneInvSlot);
  const lentWorn = Object.values(equipment).some((id) => isLentGear(id));
  const lentCarried = inventory.some((s) => isLentGear(s.itemId));
  if (!lentWorn && !lentCarried) return { equipment, equipmentInstance, inventory };

  for (const [slot, id] of Object.entries(equipment) as [EquipSlot, string | undefined][]) {
    if (!isLentGear(id)) continue;
    delete equipment[slot];
    delete equipmentInstance[slot];
  }
  const kept = inventory.filter((s) => !isLentGear(s.itemId));
  if (record) {
    for (const slot of ['mainhand', 'offhand'] as const) {
      const id = record[slot];
      if (!id || equipment[slot]) continue;
      let at = -1;
      for (let i = kept.length - 1; i >= 0; i--) {
        if (kept[i].itemId === id && kept[i].count > 0) {
          at = i;
          break;
        }
      }
      if (at < 0) continue;
      const stack = kept[at];
      equipment[slot] = id;
      if (stack.count > 1) {
        stack.count -= 1;
      } else {
        kept.splice(at, 1);
        if (stack.instance) equipmentInstance[slot] = stack.instance;
      }
    }
  }
  return { equipment, equipmentInstance, inventory: kept };
}
