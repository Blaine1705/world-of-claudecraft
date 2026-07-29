// Tool-effect command bodies (the acquisition craft): the slot and recharge
// actions behind the SimContext seam, with `Sim` keeping thin same-named
// delegates for the IWorld facade and the server dispatch.
//
// The free-grant incident is this module's design constraint: the slot
// command was once its own acquisition path (no item, no copper, no
// cooldown), so BOTH actions here resolve their whole decision through the
// pure resolvers in tools.ts before any mutation, consume their price with no
// partial arm (the charm copy, the arcane materials), and report through the
// one text-free personal `toolEffectResult` event so no refusal is ever
// silent on a player-reachable path. Every arm is draw-free: nothing in this
// module can move the rng stream a harvest walks.

import { ITEMS } from '../data';
import type { SimContext } from '../sim_context';
import { recordAction, withinActionThrottle } from './action_throttle';
import {
  resolveRechargeToolEffect,
  resolveSlotToolEffect,
  type ToolEffectConfirmMode,
} from './tools';

/**
 * Slot `effectId` onto `professionId`, consuming one charm copy from bags.
 * The resolver owns all six refusals plus WHICH copy is consumed (self-signed
 * first, unsigned second, first signed third), and the consumed copy's
 * `signer` becomes the slot's `craftedBy` (the original-crafter recharge
 * discount's identity). Re-slotting consumes another charm and resets to full
 * charges, same as a fresh install.
 */
export function slotToolEffectAction(
  ctx: SimContext,
  professionId: string,
  effectId: string,
  confirmMode: ToolEffectConfirmMode = 'always',
  pid?: number,
): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const resolved = resolveSlotToolEffect(
    r.meta.inventory,
    professionId,
    effectId,
    confirmMode,
    ITEMS,
    r.meta.name,
  );
  if (!resolved.ok) {
    ctx.emit({
      type: 'toolEffectResult',
      action: 'slot',
      ok: false,
      professionId,
      effectId,
      reason: resolved.reason,
      pid: r.meta.entityId,
    });
    return;
  }
  // Consume EXACTLY the copy the resolver chose: a targeted removal, never
  // removeItem's own preference walk, because the chosen copy's signer is
  // already baked into the minted slot's craftedBy and consuming a different
  // copy would record provenance the player still holds.
  const entry = r.meta.inventory[resolved.consumeIndex];
  if (entry.count > 1) entry.count -= 1;
  else r.meta.inventory.splice(resolved.consumeIndex, 1);
  // Created lazily HERE, never in makeMeta: the absent-by-default field is
  // what keeps a player who has never slotted an effect byte-identical in
  // the parity digest (every deny arm above returns before this line).
  r.meta.toolEffectSlots ??= {};
  r.meta.toolEffectSlots[resolved.professionId] = resolved.slot;
  ctx.emit({
    type: 'toolEffectResult',
    action: 'slot',
    ok: true,
    professionId: resolved.professionId,
    effectId,
    pid: r.meta.entityId,
  });
}

/**
 * Recharge `professionId`'s slotted effect for its owner, at the R39 price
 * (the arcane material of the recharge-time best tool's rarity rung, count
 * scaled to the charges restored, the original-crafter and specialization
 * discounts composed into the count) and the R30 fill (the maximum re-derived
 * from the best tool owned NOW, so a borrowed epic pick's inflated mint buys
 * one fill at most). Owner-performed and instant behind the shared
 * crafting-action window: the same pacing every enchanting action pays, with
 * the window spent on success only.
 */
export function rechargeToolEffectAction(
  ctx: SimContext,
  professionId: string,
  pid?: number,
): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  const deny = (
    reason: 'invalid_request' | 'no_slot' | 'no_tool' | 'already_full' | 'throttled',
  ): void => {
    ctx.emit({
      type: 'toolEffectResult',
      action: 'recharge',
      ok: false,
      professionId,
      reason,
      pid: r.meta.entityId,
    });
  };
  const slot = r.meta.toolEffectSlots?.[professionId as keyof typeof r.meta.toolEffectSlots];
  if (!slot) {
    deny('no_slot');
    return;
  }
  const resolved = resolveRechargeToolEffect(
    r.meta.inventory,
    professionId,
    slot,
    r.meta.name,
    r.meta.craftSkills,
    ITEMS,
  );
  if (!resolved.ok) {
    deny(resolved.reason);
    return;
  }
  // The shared action window, checked before any consumption and spent on
  // success only (the crafting.ts order); a denied recharge never paces the
  // player's next craft.
  if (!withinActionThrottle(r.meta, ctx.time)) {
    deny('throttled');
    return;
  }
  if (ctx.countItem(resolved.materialItemId, r.meta.entityId) < resolved.count) {
    ctx.emit({
      type: 'toolEffectResult',
      action: 'recharge',
      ok: false,
      professionId,
      effectId: slot.effectId,
      reason: 'insufficient_materials',
      materialItemId: resolved.materialItemId,
      count: resolved.count,
      pid: r.meta.entityId,
    });
    return;
  }
  ctx.removeItem(resolved.materialItemId, resolved.count, r.meta.entityId);
  // The R30 re-derive lands on BOTH counters: the maximum tracks the tool
  // the owner holds at recharge time, and the fill restores to exactly that.
  slot.maxDurability = resolved.newMax;
  slot.durability = resolved.newMax;
  recordAction(r.meta);
  ctx.emit({
    type: 'toolEffectResult',
    action: 'recharge',
    ok: true,
    professionId,
    effectId: slot.effectId,
    materialItemId: resolved.materialItemId,
    count: resolved.count,
    pid: r.meta.entityId,
  });
}
