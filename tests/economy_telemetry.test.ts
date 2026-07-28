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
  harvestBandForNode,
} from '../server/economy_telemetry';
import { GATHER_NODES, ZONES } from '../src/sim/data';

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

describe('harvest band classification (zone-keyed, R3)', () => {
  it('the band set IS the shipped zone list, in zone order', () => {
    // Derived, not restated: a fourth zone extends the label set by
    // construction (the V3 scaling R3 asked for), and the exporter pre-seeds
    // whatever this exports, so the two cannot drift apart.
    expect([...HARVEST_BANDS]).toEqual(ZONES.map((zone) => zone.id));
    // Non-vacuity, and the concrete members external dashboards must
    // re-point to at deploy: the old material-band series stop moving.
    expect(HARVEST_BANDS).toEqual(['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights']);
  });

  it('classifies every live node into its own zone band', () => {
    expect(GATHER_NODES.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const node of GATHER_NODES) {
      expect(harvestBandForNode(node.id), node.id).toBe(node.zoneId);
      seen.add(harvestBandForNode(node.id));
    }
    // All three bands are reachable from live content, so no exported series
    // is permanently dead. This is the arm the old material keying failed:
    // Thornpeak's ore priced mid, so the premium band could not see it.
    expect(seen).toEqual(new Set(HARVEST_BANDS));
  });

  it('counts an unknown node id in the first zone rather than dropping it', () => {
    // The safe direction for a counter: a retired node named by a stale event
    // is counted, in the first band, never dropped and never a new series.
    expect(harvestBandForNode('not_a_real_node')).toBe(HARVEST_BANDS[0]);
    // Prototype keys degrade the same way: the map is a real Map, so
    // 'constructor' and friends miss and take the fallback.
    for (const key of ['toString', 'constructor', 'valueOf', '__proto__']) {
      expect(harvestBandForNode(key), key).toBe(HARVEST_BANDS[0]);
    }
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
