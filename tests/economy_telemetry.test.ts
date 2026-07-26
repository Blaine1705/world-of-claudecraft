// Pure pins for the economy telemetry vocabulary (server/economy_telemetry.ts):
// the copper-flow source classifier and the harvest band classifier. Both feed
// Prometheus label values, so the property that matters most is that the label
// set is CLOSED: an unrecognized command must fall into 'other', never become
// its own series.
import { describe, expect, it } from 'vitest';
import {
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
