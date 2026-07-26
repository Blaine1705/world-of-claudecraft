// Pure pins for the economy telemetry vocabulary (server/economy_telemetry.ts):
// the copper-flow source classifier and the harvest band classifier. Both feed
// Prometheus label values, so the property that matters most is that the label
// set is CLOSED: an unrecognized command must fall into 'other', never become
// its own series.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COPPER_FLOW_COMMANDS,
  COPPER_FLOW_SOURCES,
  type CopperFlowSource,
  copperFlowSourceForCommand,
  HARVEST_BANDS,
  harvestBandForItem,
} from '../server/economy_telemetry';
import { ITEMS } from '../src/sim/data';
import { NODE_MATERIAL_TABLE } from '../src/sim/professions/gathering';
import { MATERIAL_TIER_BY_ITEM } from '../src/sim/professions/material_tier';

describe('copper flow source classification', () => {
  it('maps each economic surface to its own label', () => {
    const expected: Record<string, CopperFlowSource> = {
      turnin: 'quest',
      buy: 'vendor',
      sell: 'vendor',
      sell_all_junk: 'vendor',
      buyback: 'vendor',
      loot: 'loot',
      lootRoll: 'loot',
      market_buy: 'market',
      market_collect: 'market',
      mail_send: 'mail',
      mail_take: 'mail',
      bank_buy_slots: 'bank',
      delve_buy: 'delve',
      craft_item: 'craft',
      train_recipe: 'craft',
      trade_accept: 'trade',
      vcup_bet: 'wager',
      dev_give: 'dev',
    };
    for (const [command, source] of Object.entries(expected)) {
      expect(copperFlowSourceForCommand(command), command).toBe(source);
    }
  });

  it('closes the label set: anything unrecognized is other, never a new series', () => {
    for (const command of ['input', 'chat', 'cast', 'target', '', 'toString', '__proto__']) {
      expect(copperFlowSourceForCommand(command), command).toBe('other');
    }
    // Prototype keys deserve the explicit arm above: a plain object lookup
    // would resolve 'toString' to a function and classify it as a live source.
    expect(COPPER_FLOW_SOURCES).toContain(copperFlowSourceForCommand('toString'));
  });

  it('every produced label is a member of the exported set (the exporter pre-touches these)', () => {
    const members = new Set<string>(COPPER_FLOW_SOURCES);
    for (const command of ['turnin', 'buy', 'loot', 'unknown_command_xyz']) {
      expect(members.has(copperFlowSourceForCommand(command)), command).toBe(true);
    }
    // The vocabulary is fixed: a silent addition changes the exported series
    // count, so it is pinned as a sorted literal.
    expect([...COPPER_FLOW_SOURCES].sort()).toEqual([
      'bank',
      'craft',
      'delve',
      'dev',
      'loot',
      'mail',
      'market',
      'other',
      'quest',
      'trade',
      'vendor',
      'wager',
    ]);
  });
});

describe('harvest band classification', () => {
  it('reads the sim material tier table rather than a second copy of the grouping', () => {
    // Derived, not restated: every tier row must land in the band its tier
    // implies, so a tier re-grouping in the sim moves this classifier with it.
    for (const [itemId, tier] of Object.entries(MATERIAL_TIER_BY_ITEM)) {
      const expected = tier >= 2 ? 'premium' : tier === 1 ? 'mid' : 'starter';
      expect(harvestBandForItem(itemId), `${itemId} (tier ${tier})`).toBe(expected);
    }
    // Non-vacuity: the table must actually populate both non-starter bands, or
    // the loop above proves nothing about the branch it is meant to cover.
    const bands = new Set(Object.keys(MATERIAL_TIER_BY_ITEM).map(harvestBandForItem));
    expect(bands).toEqual(new Set(['mid', 'premium']));
  });

  it('puts the starter-zone yields in starter and an unknown id there too', () => {
    for (const itemId of ['copper_ore', 'ironbark_log', 'silverleaf_herb']) {
      expect(ITEMS[itemId], itemId).toBeDefined();
      expect(harvestBandForItem(itemId), itemId).toBe('starter');
    }
    // The safe direction for a counter: an id nobody has classified is counted,
    // in the lowest band, rather than dropped or crashing the event pass.
    expect(harvestBandForItem('not_a_real_item')).toBe('starter');
    // Prototype keys degrade safely too. materialTierForItem indexes a plain
    // object, so 'toString' resolves to an inherited FUNCTION rather than 0;
    // both numeric comparisons are then false and the band falls through to
    // 'starter'. Pinned because that safety is incidental, not designed, and a
    // future band added above 'premium' could turn it into a wrong label.
    for (const key of ['toString', 'constructor', 'valueOf', '__proto__']) {
      expect(harvestBandForItem(key), key).toBe('starter');
    }
  });

  it('classifies every live node yield into the exported band set', () => {
    const yields = new Set<string>();
    for (const byZone of Object.values(NODE_MATERIAL_TABLE)) {
      for (const row of Object.values(byZone)) yields.add(row.itemId);
    }
    expect(yields.size).toBe(9);
    const members = new Set<string>(HARVEST_BANDS);
    const seen = new Set<string>();
    for (const itemId of yields) {
      const band = harvestBandForItem(itemId);
      expect(members.has(band), `${itemId} -> ${band}`).toBe(true);
      seen.add(band);
    }
    // All three bands are actually reachable from live content, so no exported
    // series is permanently dead.
    expect(seen).toEqual(new Set(HARVEST_BANDS));
  });
});

describe('the classifier map is complete and its keys are real commands', () => {
  it('pins every mapped command, not a sample of them', () => {
    // A sampled pin lets a wrong label on any unsampled key ship silently, and
    // a mislabeled surface is worse than a missing one: the series still moves,
    // just under the wrong name. The whole map is spelled out.
    const mapped = Object.fromEntries(
      [...COPPER_FLOW_COMMANDS]
        .sort()
        .map((command) => [command, copperFlowSourceForCommand(command)]),
    );
    expect(mapped).toEqual({
      apply_enchant: 'craft',
      autoloot: 'loot',
      bank_buy_slots: 'bank',
      buy: 'vendor',
      buyback: 'vendor',
      collect_delve_chest_loot: 'delve',
      craft_item: 'craft',
      delve_buy: 'delve',
      delve_interact: 'delve',
      delve_rite_choose: 'delve',
      dev_give: 'dev',
      dev_level: 'dev',
      disenchant_item: 'craft',
      harvestCorpse: 'loot',
      harvest_node: 'loot',
      lockpick_action: 'delve',
      loot: 'loot',
      lootRoll: 'loot',
      mail_send: 'mail',
      mail_take: 'mail',
      market_buy: 'market',
      market_cancel: 'market',
      market_collect: 'market',
      market_list: 'market',
      pickup: 'loot',
      place_mobile_station: 'craft',
      play_card: 'wager',
      respec: 'craft',
      salvage_item: 'craft',
      sell: 'vendor',
      sell_all_junk: 'vendor',
      train_recipe: 'craft',
      trade_accept: 'trade',
      trade_confirm: 'trade',
      turnin: 'quest',
      unbind_item: 'craft',
      vcup_bet: 'wager',
    });
  });

  it('every mapped key is a command the dispatcher actually routes', () => {
    // The silent-degradation guard. A command rename (or a typo in a future
    // addition) downgrades that surface to 'other' with every other test still
    // green: the metric keeps reporting, just wrong, which is the worst failure
    // mode observability has. Read the dispatch vocabulary out of the source.
    const source = readFileSync(new URL('../server/game.ts', import.meta.url), 'utf8');
    // Strip line comments first, so a commented-out case cannot vouch for a key.
    const live = source.replace(/^\s*\/\/.*$/gm, '');
    const dispatched = new Set(
      [...live.matchAll(/case '([A-Za-z_][A-Za-z0-9_]*)':/g)].map((m) => m[1]),
    );
    // Non-vacuity: the scrape must have found a real switch, or every key below
    // would "pass" against an empty set.
    expect(dispatched.size).toBeGreaterThan(100);
    expect(dispatched.has('sell')).toBe(true);
    const unknown = [...COPPER_FLOW_COMMANDS].filter((command) => !dispatched.has(command)).sort();
    expect(unknown).toEqual([]);
  });
});
