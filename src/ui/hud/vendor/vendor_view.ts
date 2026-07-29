// Pure, host-agnostic view model for the vendor window.
//
// This is the pure-core half of the pure-core + thin-consumer split (root
// CLAUDE.md Conventions; reference unit_portrait.ts / stat_tooltip.ts). It owns
// the one thing the vendor window decides that is worth testing without a DOM:
// which rows are sellable goods and which buyback slots are still redeemable,
// and at what price. The DOM/i18n side lives in vendor_window.ts; rendering is
// driven entirely off the structure returned here.
//
// DOM-free and i18n-free so tests/vendor_view.test.ts can drive it directly.

import { resolveVendorRowGate, type VendorRowGate } from '../../../sim/content/vendor_row_gates';
import { junkSellableSlot } from '../../../sim/items';
import type { InvSlot, ItemDef, ItemInstancePayload } from '../../../sim/types';
import { vendorStackSize } from '../../../sim/vendor_stack';
import { knownItemDef } from '../../known_item';

export interface VendorGoodsRow {
  itemId: string;
  item: ItemDef;
  /** Server-matching price for one purchase. Either component may be zero. */
  price: VendorPrice;
  /** Units handed over per purchase: food/drink come in a stack, the rest are 1. */
  quantity: number;
  /** Advisory UI state only; the authoritative buy path rechecks both balances. */
  affordable: boolean;
  /** True when a proficiency gate on this row is unmet (content/vendor_row_gates.ts).
   *  Advisory only, exactly like `affordable`: buyItem re-runs the same resolver.
   *  A locked row still renders, greyed with its requirement, never dropped. */
  locked: boolean;
  /** The row's gate when it carries one, met or not, so the painter can name
   *  the requirement. Ids and numbers only; this core stays i18n-free. */
  requirement?: VendorRowGate;
}

export interface VendorPrice {
  /** Total copper: the per-unit buyValue multiplied by vendor quantity. */
  copper: number;
  /** Honor is authored as a per-purchase price and is not stack-multiplied. */
  honor: number;
}

export interface VendorBalances {
  copper: number;
  honor: number;
  /** The viewer's gathering counters, for the advisory row gate.
   *
   *  REQUIRED, deliberately. Defaulting it would be safe against the sim (an
   *  empty map locks rather than opens), but the failure it hides is worse than
   *  the one it prevents: forgetting to pass it shows every player a lock that
   *  is not real, and a capped gatherer silently loses the ability to buy the
   *  tool they earned, with nothing red anywhere. Required turns that into a
   *  compile error naming every call site. */
  gatheringProficiency: Readonly<Record<string, number>>;
}

export interface VendorBuybackRow {
  itemId: string;
  item: ItemDef;
  count: number;
  /** Copper the player pays to buy the item back (the vendor sell value). */
  price: number;
  /** Position of this row in the source vendorBuyback array: pass back to
   *  onBuyBack so the server redeems this exact row (see buyBackItem, #2398). */
  index: number;
  /** Present when this row carries a masterwork/signed payload the buyback
   *  will restore, so it can be told apart from a plain row of the same item. */
  instance?: ItemInstancePayload;
  /** Present when this row carries crafted provenance used by disenchant. */
  craftedRecipeId?: string;
}

export interface VendorView {
  goods: VendorGoodsRow[];
  buyback: VendorBuybackRow[];
  honorBalance: number;
  hasHonorGoods: boolean;
}

/**
 * Build the structured vendor view from raw inputs.
 *
 * Goods: a vendor item is offered only if it exists in the item table and has a
 * positive copper or Honor price (vendors never list a priceless item). Buyback:
 * a stored slot is redeemable only if the item still exists and the stack count
 * is positive.
 *
 * A row whose proficiency gate is unmet is still OFFERED, carrying `locked` and
 * its `requirement`: the two drop rules above are about rows that could never be
 * bought by anyone, while a gate is a row you cannot buy YET, and hiding those
 * would leave a player unable to learn that the next tool exists or what opens
 * it. Same reasoning as the trainer's locked recipes (train_view.ts) and the
 * delve shop's locked offers.
 */
export function buildVendorView(
  vendorItemIds: readonly string[],
  buybackSlots: readonly InvSlot[],
  items: Record<string, ItemDef>,
  balances: VendorBalances,
): VendorView {
  const goods: VendorGoodsRow[] = [];
  for (const itemId of vendorItemIds) {
    const item = items[itemId];
    if (!item) continue;
    const quantity = vendorStackSize(item);
    const price: VendorPrice = {
      copper: Math.max(0, item.buyValue ?? 0) * quantity,
      honor: Math.max(0, Math.floor(item.priceHonor ?? 0)),
    };
    if (price.copper <= 0 && price.honor <= 0) continue;
    // The SAME resolver items.ts buyItem runs, never a mirror of its rule, so
    // the lock the player sees cannot drift from what the purchase allows.
    const gate = resolveVendorRowGate(itemId, balances.gatheringProficiency);
    goods.push({
      itemId,
      item,
      price,
      quantity,
      affordable: balances.copper >= price.copper && balances.honor >= price.honor,
      locked: gate.locked,
      ...(gate.requirement ? { requirement: gate.requirement } : {}),
    });
  }
  const buyback: VendorBuybackRow[] = [];
  buybackSlots.forEach((slot, index) => {
    const item = items[slot.itemId];
    if (!item || slot.count <= 0) return;
    buyback.push({
      itemId: slot.itemId,
      item,
      count: slot.count,
      price: item.sellValue,
      index,
      ...(slot.instance && { instance: slot.instance }),
      ...(slot.craftedRecipeId === undefined ? {} : { craftedRecipeId: slot.craftedRecipeId }),
    });
  });
  return {
    goods,
    buyback,
    honorBalance: Math.max(0, Math.floor(balances.honor)),
    hasHonorGoods: goods.some((row) => row.price.honor > 0),
  };
}

/**
 * The Sell Junk button's enablement and quote as ONE pure decision. The two
 * halves deliberately diverge on unknown-id slots (a bundle behind the
 * server, R34): the server resolves sell_all_junk against ITS OWN table, so
 * grays this bundle cannot classify still sell, and the button stays live
 * whenever such a slot exists, while the quoted total keeps counting only
 * what this bundle can price. A player holding ONLY unknown non-gray items
 * therefore sees a live button quoting zero that sells nothing, the accepted
 * cosmetic cost of never stranding real junk unsellable on a stale bundle.
 */
export function sellJunkButtonState(
  inventory: readonly InvSlot[],
  items: Readonly<Record<string, ItemDef>>,
): { enabled: boolean; proceeds: number } {
  const junk = inventory.filter((slot) => junkSellableSlot(items[slot.itemId], slot));
  const hasUnknownSlots = inventory.some((slot) => knownItemDef(items, slot.itemId) === undefined);
  return {
    enabled: junk.length > 0 || hasUnknownSlots,
    // junkSellableSlot only passes defs that carry a sell value, so the ?? 0
    // is unreachable belt-and-braces, never a quote change.
    proceeds: junk.reduce(
      (sum, slot) => sum + (items[slot.itemId]?.sellValue ?? 0) * slot.count,
      0,
    ),
  };
}
