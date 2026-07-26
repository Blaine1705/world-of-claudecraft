// Economy telemetry vocabulary: the bounded label sets the /metrics exporter
// uses for copper flow and for harvest counts, plus the two pure classifiers
// that produce them. Kept out of game.ts and out of the exporter so both can be
// unit-tested with no registry, no socket, and no running world.
//
// Why these two signals exist: the gathered materials came off every vendor
// counter in one move, so a player who used to buy a stack of ore now has to go
// and mine it. Both halves of that need watching. Copper flow answers whether
// the faucet still covers what a player must buy (tools, training, fees) once
// materials are no longer a copper sink; harvest counts by band answer whether
// players actually reach the mid and premium nodes or stall on the starter
// band. Neither reads back into gameplay: this is observability only.
//
// COPPER FLOW IS A TREND, NOT A LEDGER. It is sampled as the acting player's
// copper delta across one command dispatch, so it books nothing for a credit
// that lands on a third party, and it MISATTRIBUTES a tick-driven payout to
// whichever command is sampled next. Do not sum these series and expect them
// to reconcile against total coin in the world.
//
// CARDINALITY IS BOUNDED BY CONSTRUCTION, the same contract as
// server/http/game_signals.ts. A client command outside the allowlist below
// classifies as 'other' rather than becoming its own series, so the label set
// can never grow with the message vocabulary, and nothing per-player (account
// id, character id, name, ip) is ever a label.

import { materialTierForItem } from '../src/sim/professions/material_tier';

/**
 * The fixed sources copper is attributed to. One label per economic surface,
 * NOT one per client command: the map below is many-to-one on purpose.
 */
export const COPPER_FLOW_SOURCES = [
  'quest',
  'vendor',
  'loot',
  'market',
  'mail',
  'bank',
  'delve',
  'craft',
  'trade',
  'wager',
  'dev',
  'other',
] as const;

export type CopperFlowSource = (typeof COPPER_FLOW_SOURCES)[number];

/**
 * Client command to economic surface. Every command that can move the acting
 * player's copper belongs here; anything else falls through to 'other', which
 * is also where a genuinely uncategorized move shows up rather than vanishing.
 *
 * A Map, NOT an object literal: the key is a CLIENT-SUPPLIED string, and a
 * plain-object lookup resolves 'toString' or 'constructor' to an inherited
 * function, which would then be handed to prom-client as a label value.
 */
const SOURCE_BY_COMMAND: ReadonlyMap<string, CopperFlowSource> = new Map(
  Object.entries({
    turnin: 'quest',
    buy: 'vendor',
    sell: 'vendor',
    sell_all_junk: 'vendor',
    buyback: 'vendor',
    loot: 'loot',
    autoloot: 'loot',
    lootRoll: 'loot',
    pickup: 'loot',
    harvestCorpse: 'loot',
    harvest_node: 'loot',
    market_buy: 'market',
    market_list: 'market',
    market_collect: 'market',
    market_cancel: 'market',
    mail_send: 'mail',
    mail_take: 'mail',
    bank_buy_slots: 'bank',
    delve_buy: 'delve',
    delve_interact: 'delve',
    delve_rite_choose: 'delve',
    collect_delve_chest_loot: 'delve',
    lockpick_action: 'delve',
    craft_item: 'craft',
    train_recipe: 'craft',
    apply_enchant: 'craft',
    disenchant_item: 'craft',
    salvage_item: 'craft',
    unbind_item: 'craft',
    place_mobile_station: 'craft',
    respec: 'craft',
    trade_accept: 'trade',
    trade_confirm: 'trade',
    vcup_bet: 'wager',
    play_card: 'wager',
    dev_give: 'dev',
    dev_level: 'dev',
  } satisfies Record<string, CopperFlowSource>),
);

/**
 * Every command the map classifies, exposed so a test can pin the WHOLE mapping
 * and check the keys are commands the dispatcher actually routes. A key that
 * stops matching a real command downgrades its surface to 'other' silently,
 * which leaves the metric reporting the wrong thing rather than nothing.
 */
export const COPPER_FLOW_COMMANDS: readonly string[] = Object.freeze([...SOURCE_BY_COMMAND.keys()]);

/** The economic surface a client command's copper move is attributed to. */
export function copperFlowSourceForCommand(command: string): CopperFlowSource {
  return SOURCE_BY_COMMAND.get(command) ?? 'other';
}

/**
 * The three material bands a harvest is counted under, named after what a
 * player experiences rather than after the tier integer: 'starter' is the first
 * zone's yields, 'mid' the second zone's plus thorium, 'premium' the top pair.
 */
export const HARVEST_BANDS = ['starter', 'mid', 'premium'] as const;

export type HarvestBand = (typeof HARVEST_BANDS)[number];

/**
 * The band one harvested item id falls in, read off the sim's own material
 * tier table (materialTierForItem) rather than a second copy of the grouping,
 * so a tier re-grouping moves both together. An unknown id is tier 0, which is
 * 'starter': the safe direction for a counter.
 */
export function harvestBandForItem(itemId: string): HarvestBand {
  const tier = materialTierForItem(itemId);
  if (tier >= 2) return 'premium';
  if (tier === 1) return 'mid';
  return 'starter';
}
