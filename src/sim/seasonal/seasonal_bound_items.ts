// Event-bound items (ItemDef.seasonalEvent): things that exist only while their seasonal
// event runs, Gourdlight Eve's broom first. When the running event is not theirs (the
// event closed, or another one opened) they leave the character's bags, bank and courier
// cargo, and a rider on the broom is set down at once.
//
// When the sweep runs:
//   - on every open/close edge, for every character in the world;
//   - once for each character the first tick it spends in a world whose running event
//     is not the item's: a login after the event ended (the broom is already gone from
//     every character online at the close; this catches the ones who were offline).
// A character swept since the last edge is remembered in a WeakSet on the world state,
// so a quiet tick costs one set lookup per character and no container scan.
//
// Draws no rng and reads no clock: the running event is the seasonal state's one field.
import { ITEMS } from '../data';
import { forceDismount } from '../mounts';
import type { PlayerMeta } from '../sim';
import type { SimContext } from '../sim_context';
import type { InvSlot } from '../types';

/** The event an item is bound to, or null for an ordinary item. */
export function itemSeasonalEvent(itemId: string): string | null {
  return ITEMS[itemId]?.seasonalEvent ?? null;
}

/** Whether a stack is event-bound to an event other than the running one. */
function outOfSeason(slot: InvSlot, active: string | null): boolean {
  const bound = itemSeasonalEvent(slot.itemId);
  return bound !== null && bound !== active;
}

/** Remove every out-of-season stack from `slots` in place; the ids removed, in order. */
function strip(slots: InvSlot[], active: string | null, gone: string[]): boolean {
  let changed = false;
  for (let i = slots.length - 1; i >= 0; i--) {
    if (!outOfSeason(slots[i], active)) continue;
    if (!gone.includes(slots[i].itemId)) gone.push(slots[i].itemId);
    slots.splice(i, 1);
    changed = true;
  }
  return changed;
}

/** Sweep one character now. The item ids that left, in container order (bags, bank,
 *  courier). Emits one line per item and sets down a rider whose mount just went. */
export function sweepEventBoundItems(
  ctx: SimContext,
  meta: PlayerMeta,
  active: string | null,
): string[] {
  const gone: string[] = [];
  const bags = strip(meta.inventory, active, gone);
  const bank = strip(meta.bank.inventory, active, gone);
  const cargo = meta.courier ? strip(meta.courier.cargo, active, gone) : false;
  if (gone.length === 0) return gone;
  if (bags || cargo) meta.wireRev++;
  if (bank) meta.bankWireRev++;
  ctx.onInventoryChangedForQuests(meta);
  const e = ctx.entities.get(meta.entityId);
  if (e?.mountKey) {
    for (const id of gone) {
      const def = ITEMS[id];
      if (def?.kind === 'mount' && def.mount === e.mountKey) forceDismount(ctx, e);
    }
  }
  for (const id of gone) {
    ctx.emit({ type: 'seasonal', what: 'boundItemGone', trick: id, pid: meta.entityId });
  }
  return gone;
}

/** The per-tick driver (seasonal_tick.ts): `edge` is true on the tick the running event
 *  changed, which forgets who was swept so everyone is checked against the new event. */
export function updateEventBoundItems(ctx: SimContext, active: string | null, edge: boolean): void {
  const state = ctx.seasonal;
  if (edge) state.boundSwept = new WeakSet();
  for (const meta of ctx.players.values()) {
    if (state.boundSwept.has(meta)) continue;
    state.boundSwept.add(meta);
    sweepEventBoundItems(ctx, meta, active);
  }
}
