// ---------------------------------------------------------------------------
// What KIND of thing an item is for the $WOC Exchange, and which transfer locks
// hold for that kind whatever an operator's policy says.
//
// One definition, because there are three enforcement points and they must
// agree: the server's listingEligibility (authoritative), the sim's
// extractTradableCopy (defence in depth at the bags), and the client's
// sellableRows (the Sell picker's pre-filter). Each carried its own copy of the
// same four checks, so a category the server accepted could still be refused at
// escrow, or never offered in the picker at all. Three copies is what earns a
// shared module (the repo's rule of three), and this is the shared one.
//
// The split of responsibility matters and is deliberate: this module owns the
// CONTENT TAXONOMY (a mount is a mount because src/sim/content says so) and the
// locks that are true of a category regardless of configuration. It owns NO
// policy. Whether a category trades at all, what the price floor is, and which
// ids an operator has excluded stay on the server, which is the only layer
// entitled to decide them.
//
// `src/sim`-pure: no DOM/Three/render-ui-game-net imports, no rng, no clock. It
// is a leaf (no SimContext), so a Vitest imports it directly. It carries no
// wallet, token, or settlement vocabulary, so the token firewall over src/sim
// (tests/architecture.test.ts) still holds with this file inside it.
// ---------------------------------------------------------------------------

import type { ItemDef, ItemInstancePayload } from './types';

/**
 * The exchange-facing category of an item def.
 *
 * `other` is the closed default: anything this taxonomy does not recognize is
 * not tradable, so a new content kind is refused until someone decides
 * otherwise rather than silently becoming sellable.
 */
export type ExchangeItemCategory = 'mount' | 'mech_chroma' | 'equipment' | 'other';

/**
 * Classify a def. Order is load-bearing where the tests overlap: a mount item
 * carries no equip slot today, but classifying by the explicit `kind`/`use`
 * discriminators FIRST means a mount or a chroma plate that later gains a slot
 * keeps its own category instead of silently becoming equipment and picking up
 * the equipment quality floor.
 */
export function exchangeItemCategory(def: ItemDef): ExchangeItemCategory {
  if (def.kind === 'mount') return 'mount';
  if (def.use?.type === 'mechChroma') return 'mech_chroma';
  if (def.slot !== undefined) return 'equipment';
  return 'other';
}

/**
 * The locks no configuration may lift.
 *
 * `quest_item` and `bound_copy` are absolute: a quest item is not property, and
 * a copy already bound to a character cannot become someone else's.
 *
 * `soulbound` and `no_market_list` are absolute only for the categories that do
 * not tolerate them, which is where the two collectible categories differ from
 * everything else:
 *
 * - A MOUNT may be soulbound, and the tolerance exists so that a soulbound one
 *   still trades here. This was written when EVERY reins item was soulbound,
 *   because holding the reins IS owning the mount (src/sim/mounts.ts mountOwned
 *   reads the bags and the bank). v0.35.0 then un-soulbound the player reins on
 *   purpose, so ownership now transfers through the ordinary economy too
 *   (MountItemDef in types.ts), and only the developer-only tank stays bound.
 *   The tolerance is kept rather than removed: it is what guarantees the stated
 *   product rule that EVERY mount trades regardless of tier, whichever ones
 *   content decides to bind in future.
 * - A MECH CHROMA plate is flagged noMarketList, which keeps it off the in-game
 *   gold market for the same reason. Tolerated here for the same scope.
 *
 * Everything else keeps both refusals exactly as before.
 */
export type ExchangeLock = 'soulbound' | 'quest_item' | 'no_market_list' | 'bound_copy';

export function exchangeHardLock(
  def: ItemDef,
  instance: ItemInstancePayload | undefined,
): ExchangeLock | null {
  const category = exchangeItemCategory(def);
  if (def.kind === 'quest') return 'quest_item';
  if (instance?.boundTo !== undefined) return 'bound_copy';
  if (def.soulbound && category !== 'mount') return 'soulbound';
  if (def.noMarketList && category !== 'mech_chroma') return 'no_market_list';
  return null;
}

/**
 * True when a category's price floor is the equipment one.
 *
 * Mounts and chromas are collectibles whose rarity is a look, not power, and
 * they are traded at ANY tier by design, so the equipment floor (epic by
 * default) must not reach them: applying it would silently hide every common,
 * uncommon and rare mount from the Exchange while reporting them ineligible.
 */
export function exchangeCategoryUsesQualityFloor(category: ExchangeItemCategory): boolean {
  return category === 'equipment';
}
