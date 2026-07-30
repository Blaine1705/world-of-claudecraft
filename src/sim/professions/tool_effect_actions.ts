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
//
// Throttling is deliberately ASYMMETRIC: the recharge draws the shared
// craft-action window (it consumes fungible materials, the same pacing every
// enchanting action pays), while the slot draws none, because every
// successful slot burns a whole crafted charm (the mint IS the price, and it
// self-limits harder than any window would) and a denied slot mutates
// nothing. Both are still under the wire command lane, and the deny events
// forcing a heavy self re-diff is the accepted amplification (neither
// command is a HEAVY_SELF_CMDS member; toolEffectResult's HEAVY_SELF_EVENTS
// membership is what drives the re-diff, and the dispatch comment in
// server/game.ts records that acceptance).

import { GATHERING_PROFESSION_IDS, type GatheringProfessionId } from '../content/professions';
import { ITEMS } from '../data';
import type { SimContext } from '../sim_context';
import { recordAction, withinActionThrottle } from './action_throttle';
import { gatherNodeById, NODE_HARVEST_TABLE } from './gathering';
import {
  resolveRechargeToolEffect,
  resolveSlotToolEffect,
  type ToolEffectConfirmMode,
} from './tools';

/**
 * Slot `effectId` onto `professionId`, consuming one charm copy from bags.
 * The resolver owns all seven refusals plus WHICH copy is consumed (self-signed
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
    // The live slot, so the resolver can refuse a re-slot that would change
    // nothing. Read through hasOwn-safe indexing: professionId is a wire
    // string and toolEffectSlots is a plain object literal.
    (GATHERING_PROFESSION_IDS as readonly string[]).includes(professionId)
      ? r.meta.toolEffectSlots?.[professionId as GatheringProfessionId]
      : undefined,
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
  // The hub's own post-removal duty, which a targeted splice would otherwise
  // skip: bump wireRev and re-derive collect-quest counts from live bags
  // (sim.ts removeItem and the enchanting targeted removals all do this). No
  // shipped quest collects a charm today; the seam contract is what matters,
  // so the first one that does cannot be quietly stale.
  ctx.onInventoryChangedForQuests(r.meta);
  // Created lazily HERE, never in makeMeta: the absent-by-default field is
  // what keeps a player who has never slotted an effect byte-identical in
  // the parity digest (every deny arm above returns before this line).
  r.meta.toolEffectSlots ??= {};
  r.meta.toolEffectSlots[resolved.professionId] = resolved.slot;
  // A fresh mint retires a live gather cast's R47 start-capture and R40
  // consent, but ONLY for the profession this mint touches: the re-slot
  // toll (this whole charm) is the sanctioned way DOWN off a price rung, so
  // a stale capture from the OLD slot's cast must not re-latch the new
  // slot's ceiling at completion. A cast on a DIFFERENT profession is
  // untouched by this mint (its slot, its consent, and its rarity capture
  // all belong to the other profession), so revoking its captures here
  // would silently strip a confirmed prompt use mid-cast (the phase 14 QA
  // finding). No live cast means the fields are already inert and the
  // clear is a no-op kept for the defensive arm (an unknown cast node id).
  // Draw-free field writes; '' / false are the inert values.
  const castNode = r.e.gatherCastNodeId !== '' ? gatherNodeById(r.e.gatherCastNodeId) : undefined;
  const castProfession = castNode ? NODE_HARVEST_TABLE[castNode.type].professionId : undefined;
  if (castProfession === undefined || castProfession === resolved.professionId) {
    r.e.gatherCastToolRarity = '';
    r.e.gatherCastEffectConfirmed = false;
  }
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
 * (the arcane material of the resolved rarity rung, count scaled to the
 * charges restored, the original-crafter and specialization discounts
 * composed into the count) and the R30 fill (sized by the best tool owned
 * NOW, so a borrowed epic pick's inflated mint buys one fill at most). The
 * price rung is floored at the slot's own ceiling per R47, so stashing a
 * good tool cannot buy a cheap fill; the resolver owns that whole decision.
 * Owner-performed and instant behind the shared crafting-action window: the
 * same pacing every enchanting action pays, with the window spent on success
 * only.
 */
export function rechargeToolEffectAction(
  ctx: SimContext,
  professionId: string,
  pid?: number,
): void {
  const r = ctx.resolve(pid);
  if (!r) return;
  // `effectId` rides every deny that HAS a slot resolved: the client renders
  // the effect's name into the line, and an omitted id renders an empty
  // name ("  is already fully charged.").
  const deny = (
    reason:
      | 'invalid_request'
      | 'no_slot'
      | 'no_tool'
      | 'already_full'
      | 'tool_capped'
      | 'throttled',
    effectId?: string,
  ): void => {
    ctx.emit({
      type: 'toolEffectResult',
      action: 'recharge',
      ok: false,
      professionId,
      ...(effectId === undefined ? {} : { effectId }),
      reason,
      pid: r.meta.entityId,
    });
  };
  // Validate the profession id BEFORE indexing the slot record:
  // toolEffectSlots is a plain object literal, so a wire string like
  // 'constructor' would otherwise resolve a prototype member as a truthy
  // slot and carry it into the resolver (harmless only by the resolver's
  // internal check order). The repo's hasOwn doctrine for plain-object
  // tables, applied structurally.
  if (!(GATHERING_PROFESSION_IDS as readonly string[]).includes(professionId)) {
    deny('invalid_request');
    return;
  }
  const slot = r.meta.toolEffectSlots?.[professionId as GatheringProfessionId];
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
    deny(resolved.reason, slot.effectId);
    return;
  }
  // Materials BEFORE the throttle, the family order (crafting.ts,
  // enchanting.ts, salvage.ts all validate the action's own inputs first and
  // check the shared window last, right before consumption): a player who is
  // both throttled and short still gets the insufficient_materials deny,
  // which is the one surface carrying the price.
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
  // The shared action window, checked before any consumption and spent on
  // success only; a denied recharge never paces the player's next craft.
  if (!withinActionThrottle(r.meta, ctx.time)) {
    deny('throttled', slot.effectId);
    return;
  }
  ctx.removeItem(resolved.materialItemId, resolved.count, r.meta.entityId);
  // The fill is the R30 re-derive (the tool held right now); the ceiling is
  // the R47 high-water mark, raised by a better tool and never lowered by a
  // lesser one, which is what keeps the price rung from resetting on every
  // cheap fill.
  slot.durability = resolved.newMax;
  slot.maxDurability = resolved.ceiling;
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
