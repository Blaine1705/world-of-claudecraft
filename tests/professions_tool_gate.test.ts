// Proficiency gates on the gathering-tool vendor rows: the side table and its
// one resolver (src/sim/content/vendor_row_gates.ts), the authoritative refusal
// in the buy path, and the advisory locked row in the vendor view core.
//
// The suite's centrepiece is the DERIVED-CEILING arm: it recomputes, from the
// live gain constants rather than a copied number, the proficiency at which a
// tier-1 node stops teaching, and asserts every threshold sits strictly under
// it. The first zone is all tier-1 ground and the gather quests grant only the
// tier-1 tool, so a threshold at or above that ceiling is unreachable by the
// only means a new player has: the ladder would dead-end with no test failing.

import { describe, expect, it } from 'vitest';
import { GATHERING_PROFESSIONS, type GatheringProfessionId } from '../src/sim/content/professions';
import {
  resolveVendorRowGate,
  TIER2_TOOL_GATE_PROFICIENCY,
  TIER3_TOOL_GATE_PROFICIENCY,
  VENDOR_ROW_GATES,
} from '../src/sim/content/vendor_row_gates';
import { GATHER_NODES, ITEMS, NPCS } from '../src/sim/data';
import * as items from '../src/sim/items';
import { GATHER_GAIN_TIER_STEP, gatherNodeGainMultiplier } from '../src/sim/professions/gathering';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import { type Entity, INTERACT_RANGE, type SimEvent } from '../src/sim/types';
import { buildVendorView } from '../src/ui/hud/vendor/vendor_view';

function ctxOf(sim: Sim): SimContext {
  return (sim as unknown as { ctx: SimContext }).ctx;
}

function errorTexts(events: SimEvent[]): string[] {
  return events
    .filter((e): e is Extract<SimEvent, { type: 'error' }> => e.type === 'error')
    .map((e) => e.text);
}

// A warrior standing at the Fenbridge provisioner, the zone-2 hub that stocks
// the tier-2 land tools once Eastbrook stops over-stocking them. Bags emptied so
// the counts below are absolute.
function shopper(sim: Sim) {
  const anySim = sim as unknown as {
    entities: Map<number, Entity>;
    players: Map<number, { copper: number; inventory: { itemId: string; count: number }[] }>;
    rebucket(e: Entity): void;
  };
  const pid = sim.addPlayer('warrior', 'Prospector');
  const hale = [...anySim.entities.values()].find(
    (e) => (e as unknown as { templateId?: string }).templateId === 'provisioner_hale',
  ) as Entity;
  const p = anySim.entities.get(pid) as Entity;
  p.pos.x = hale.pos.x + 2;
  p.pos.z = hale.pos.z;
  anySim.rebucket(p);
  const meta = sim.meta(pid)!;
  meta.inventory.length = 0;
  meta.copper = 1_000_000;
  return { pid, hale, meta };
}

describe('vendor row gate resolver', () => {
  it('leaves an ungated row open regardless of proficiency, and reports no requirement', () => {
    // The tier-1 tool the gather quests grant: it must never carry a gate,
    // because the #2343 rule makes it mandatory for any harvest at all.
    expect(resolveVendorRowGate('copper_mining_pick', {})).toEqual({ locked: false });
    expect(resolveVendorRowGate('baked_bread', { mining: 0 })).toEqual({ locked: false });
  });

  it('locks a gated row below its threshold and opens it exactly at the threshold', () => {
    const below = resolveVendorRowGate('iron_mining_pick', {
      mining: TIER2_TOOL_GATE_PROFICIENCY - 1,
    });
    expect(below.locked).toBe(true);
    expect(below.requirement).toEqual({
      professionId: 'mining',
      proficiency: TIER2_TOOL_GATE_PROFICIENCY,
    });

    // At-or-above, so the boundary point itself opens the row.
    expect(
      resolveVendorRowGate('iron_mining_pick', { mining: TIER2_TOOL_GATE_PROFICIENCY }).locked,
    ).toBe(false);
    expect(
      resolveVendorRowGate('iron_mining_pick', { mining: TIER2_TOOL_GATE_PROFICIENCY + 1 }).locked,
    ).toBe(false);
  });

  it('reads a missing or untracked profession as 0, which LOCKS rather than opens', () => {
    // The safe direction: a caller that hands over an incomplete map
    // under-promises instead of offering a purchase the sim would refuse.
    expect(resolveVendorRowGate('mithril_mining_pick', {}).locked).toBe(true);
    expect(resolveVendorRowGate('mithril_mining_pick', { logging: 100 }).locked).toBe(true);
    // A gated row still reports its requirement when locked by absence.
    expect(resolveVendorRowGate('mithril_mining_pick', {}).requirement?.proficiency).toBe(
      TIER3_TOOL_GATE_PROFICIENCY,
    );
  });

  it('gates each tool on its OWN profession, never on another counter', () => {
    // Capped mining opens no axe and no sickle: three separate ladders.
    for (const itemId of ['felling_axe', 'ironbark_axe', 'bronze_sickle', 'silverleaf_sickle']) {
      expect(resolveVendorRowGate(itemId, { mining: 100 }).locked, itemId).toBe(true);
    }
    expect(resolveVendorRowGate('felling_axe', { logging: 100 }).locked).toBe(false);
    expect(resolveVendorRowGate('bronze_sickle', { herbalism: 100 }).locked).toBe(false);
  });
});

describe('gate thresholds against the live gain curve', () => {
  // The derived ceiling: the LOWEST proficiency at which a tier-1 node's gain
  // multiplier has fallen to zero, computed by walking the real function rather
  // than restating 75. If the gain curve, the tier step, or the node-tier
  // mapping is ever retuned, this number moves with them and the assertion
  // below is what fails.
  function tier1TeachingCeiling(): number {
    const cap = GATHERING_PROFESSIONS.mining.maxSkill;
    for (let proficiency = 0; proficiency <= cap; proficiency++) {
      if (gatherNodeGainMultiplier(proficiency, 1) === 0) return proficiency;
    }
    return Number.POSITIVE_INFINITY;
  }

  it('the derivation finds a real ceiling inside the cap, and it is where the curve grays out', () => {
    const ceiling = tier1TeachingCeiling();
    // Non-vacuity: a ceiling of Infinity would make the gap assertion below
    // pass for any threshold whatsoever.
    expect(Number.isFinite(ceiling)).toBe(true);
    expect(ceiling).toBeLessThanOrEqual(GATHERING_PROFESSIONS.mining.maxSkill);
    // It really is a boundary: teaching just under it, nothing at it.
    expect(gatherNodeGainMultiplier(ceiling - 1, 1)).toBeGreaterThan(0);
    expect(gatherNodeGainMultiplier(ceiling, 1)).toBe(0);
    // And it is the third gain tier, the shape the curve documents. Stated as
    // the product of the two live constants, not as the literal it evaluates
    // to, so a step change carries this arm with it.
    expect(ceiling).toBe(GATHER_GAIN_TIER_STEP * 3);
  });

  it('every gate threshold sits strictly below the tier-1 teaching ceiling', () => {
    const ceiling = tier1TeachingCeiling();
    for (const [itemId, gate] of Object.entries(VENDOR_ROW_GATES)) {
      expect(gate.proficiency, `${itemId} gate must stay reachable on tier-1 ground`).toBeLessThan(
        ceiling,
      );
    }
    // The margin is the point of picking 70 over the ceiling-hugging 75: name
    // it, so shrinking it to zero is a deliberate edit rather than a drift.
    expect(ceiling - TIER3_TOOL_GATE_PROFICIENCY).toBeGreaterThanOrEqual(5);
    expect(TIER2_TOOL_GATE_PROFICIENCY).toBeLessThan(TIER3_TOOL_GATE_PROFICIENCY);
  });

  it('the first zone is all tier-1 ground, which is WHY the ceiling bounds the thresholds', () => {
    // The premise the arm above rests on, asserted rather than assumed: if a
    // tier-2 node ever lands in Eastbrook, a player could out-climb tier 1
    // there and the ceiling would stop being the binding constraint.
    const eastbrook = GATHER_NODES.filter((n) => n.zoneId === 'eastbrook_vale');
    expect(eastbrook.length).toBeGreaterThan(0);
    expect([...new Set(eastbrook.map((n) => n.tier))]).toEqual([1]);
  });
});

describe('gate table completeness', () => {
  function landTools(): [string, number][] {
    const out: [string, number][] = [];
    for (const [itemId, def] of Object.entries(ITEMS)) {
      const use = def.use;
      if (use?.type !== 'gatherTool' || use.professionId === 'fishing') continue;
      if (def.buyValue === undefined) continue;
      out.push([itemId, use.tier]);
    }
    return out;
  }

  it('every vendor-priced land tool above tier 1 carries a gate, and tier 1 carries none', () => {
    const tools = landTools();
    // Non-vacuity: the loop must actually see the shipped ladder.
    expect(tools.length).toBe(9);
    for (const [itemId, tier] of tools) {
      const gate = VENDOR_ROW_GATES[itemId];
      if (tier === 1) {
        expect(gate, `${itemId} is the entry tool and must stay ungated`).toBeUndefined();
        continue;
      }
      expect(gate, `${itemId} is a tier-${tier} vendor tool and must carry a gate`).toBeDefined();
      // The threshold is the one for its tier, so the two constants cannot
      // drift apart per item.
      expect(gate?.proficiency, itemId).toBe(
        tier === 2 ? TIER2_TOOL_GATE_PROFICIENCY : TIER3_TOOL_GATE_PROFICIENCY,
      );
      // And on the tool's own profession.
      expect(gate?.professionId, itemId).toBe(
        (ITEMS[itemId].use as { professionId: GatheringProfessionId }).professionId,
      );
    }
  });

  it('no fishing implement is gated: rods belong to the fishing work, not this ladder', () => {
    // Deliberate, not an oversight. Fishing has no world nodes to express
    // either the threshold derivation or the hub-stocking rule against, and it
    // counts to 200 rather than 100, so these numbers would not mean the same
    // thing on that ladder.
    const rods = Object.entries(ITEMS).filter(
      ([, def]) => def.use?.type === 'gatherTool' && def.use.professionId === 'fishing',
    );
    expect(rods.length).toBe(2);
    for (const [itemId] of rods) expect(VENDOR_ROW_GATES[itemId], itemId).toBeUndefined();
    expect(VENDOR_ROW_GATES.simple_fishing_pole).toBeUndefined();
  });

  it('gates only ever name a gathering profession that exists', () => {
    for (const [itemId, gate] of Object.entries(VENDOR_ROW_GATES)) {
      expect(GATHERING_PROFESSIONS[gate.professionId], itemId).toBeDefined();
      expect(gate.proficiency, itemId).toBeGreaterThan(0);
      expect(gate.proficiency, itemId).toBeLessThanOrEqual(
        GATHERING_PROFESSIONS[gate.professionId].maxSkill,
      );
    }
  });
});

describe('the buy path enforces the gate authoritatively', () => {
  it('refuses a gated tool below the threshold, spending nothing and granting nothing', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const { pid, hale, meta } = shopper(sim);
    meta.copper = 1_000_000;
    sim.drainEvents();

    items.buyItem(ctxOf(sim), hale.id, 'iron_mining_pick', pid);

    expect(sim.countItem('iron_mining_pick', pid)).toBe(0);
    expect(meta.copper).toBe(1_000_000);
    expect(errorTexts(sim.drainEvents())).toContain('You have not unlocked that item yet.');
  });

  it('allows the same purchase once the proficiency is there', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const { pid, hale, meta } = shopper(sim);
    meta.gatheringProficiency.mining = TIER2_TOOL_GATE_PROFICIENCY;
    const before = meta.copper;
    sim.drainEvents();

    items.buyItem(ctxOf(sim), hale.id, 'iron_mining_pick', pid);

    expect(sim.countItem('iron_mining_pick', pid)).toBe(1);
    expect(meta.copper).toBe(before - (ITEMS.iron_mining_pick.buyValue ?? 0));
    expect(errorTexts(sim.drainEvents())).toEqual([]);
  });

  it('refuses the gated tool BEFORE the balance, so the reason given is the real one', () => {
    // Ordering matters: a broke, unskilled player must be told what opens the
    // row, not sent away to find copper that would not have helped.
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const { pid, hale, meta } = shopper(sim);
    meta.copper = 0;
    sim.drainEvents();

    items.buyItem(ctxOf(sim), hale.id, 'iron_mining_pick', pid);

    const errs = errorTexts(sim.drainEvents());
    expect(errs).toContain('You have not unlocked that item yet.');
    expect(errs).not.toContain('Not enough money.');
  });

  it('leaves the ungated tier-1 tool buyable by a player with no proficiency at all', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const { pid, hale, meta } = shopper(sim);
    expect(meta.gatheringProficiency.mining).toBe(0);
    sim.drainEvents();

    items.buyItem(ctxOf(sim), hale.id, 'copper_mining_pick', pid);

    expect(sim.countItem('copper_mining_pick', pid)).toBe(1);
    expect(errorTexts(sim.drainEvents())).toEqual([]);
  });

  it('never confiscates an owned tool, and owning one opens no gated row', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const { pid, hale, meta } = shopper(sim);
    // A grandfathered tier-3 pick in the bags of a player with zero mining:
    // the case a live realm gets the moment the gate ships. Bought at this
    // counter, `iron_mining_pick` is the tier-2 rung Hale actually stocks.
    sim.addItem('mithril_mining_pick', 1, pid);
    sim.drainEvents();

    items.buyItem(ctxOf(sim), hale.id, 'iron_mining_pick', pid);

    // Refused: proficiency is the gate, and owning a BETTER tool is not
    // proficiency. Nothing reads or removes inventory either way, so the
    // grandfathered pick is still there and still works at every tier it did.
    expect(errorTexts(sim.drainEvents())).toContain('You have not unlocked that item yet.');
    expect(sim.countItem('mithril_mining_pick', pid)).toBe(1);
    expect(sim.countItem('iron_mining_pick', pid)).toBe(0);
    expect(meta.gatheringProficiency.mining).toBe(0);
  });
});

describe('the vendor view core renders a gated row locked, never dropped', () => {
  const stock = ['copper_mining_pick', 'iron_mining_pick'];
  const balances = { copper: 1_000_000, honor: 0 } as const;

  it('keeps the locked row in the goods list and carries its requirement', () => {
    const view = buildVendorView(stock, [], ITEMS, { ...balances, gatheringProficiency: {} });
    expect(view.goods.map((g) => g.itemId)).toEqual(stock);
    const [entry, gated] = view.goods;
    expect(entry.locked).toBe(false);
    expect(entry.requirement).toBeUndefined();
    expect(gated.locked).toBe(true);
    expect(gated.requirement).toEqual({
      professionId: 'mining',
      proficiency: TIER2_TOOL_GATE_PROFICIENCY,
    });
    // Affordability is a separate axis and stays true: the row is not refused
    // for money, and the painter must not conflate the two reasons.
    expect(gated.affordable).toBe(true);
  });

  it('unlocks the row at the same threshold the buy path uses', () => {
    const view = buildVendorView(stock, [], ITEMS, {
      ...balances,
      gatheringProficiency: { mining: TIER2_TOOL_GATE_PROFICIENCY },
    });
    expect(view.goods.find((g) => g.itemId === 'iron_mining_pick')?.locked).toBe(false);
  });

  it('omitting the proficiency map locks every gated row rather than opening it', () => {
    const view = buildVendorView(stock, [], ITEMS, balances);
    expect(view.goods.find((g) => g.itemId === 'iron_mining_pick')?.locked).toBe(true);
    expect(view.goods.find((g) => g.itemId === 'copper_mining_pick')?.locked).toBe(false);
  });

  it('agrees with the buy path on every stocked tool at a sweep of proficiencies', () => {
    // The whole point of one shared resolver: no proficiency exists at which
    // the window and the sim disagree about a row.
    const toolStock = Object.keys(ITEMS).filter((id) => {
      const use = ITEMS[id].use;
      return use?.type === 'gatherTool' && ITEMS[id].buyValue !== undefined;
    });
    expect(toolStock.length).toBeGreaterThan(0);
    for (const proficiency of [0, 39, 40, 69, 70, 100]) {
      const map = { mining: proficiency, logging: proficiency, herbalism: proficiency };
      const view = buildVendorView(toolStock, [], ITEMS, {
        ...balances,
        gatheringProficiency: map,
      });
      for (const row of view.goods) {
        expect(row.locked, `${row.itemId} at ${proficiency}`).toBe(
          resolveVendorRowGate(row.itemId, map).locked,
        );
      }
    }
  });
});

describe('the gated tools are stocked somewhere a gated row can be seen', () => {
  it('every gated tool sits in at least one NPC counter', () => {
    // A gate on a row no merchant carries would be unreachable content: the
    // requirement line could never render, and the ladder would have a rung
    // that exists only in the item table.
    for (const itemId of Object.keys(VENDOR_ROW_GATES)) {
      const stockists = Object.values(NPCS).filter((npc) => npc.vendorItems?.includes(itemId));
      expect(stockists.length, `${itemId} is stocked by no NPC`).toBeGreaterThan(0);
    }
  });

  it('no gated counter sits close enough to a node to harvest with its window open', () => {
    // Why this is worth asserting: the vendor row's lock is ADVISORY and is
    // painted when the window opens. Nothing repaints it on a proficiency
    // change, which is only correct because a player cannot cross a threshold
    // while looking at a gated row. The window closes past VENDOR_CLOSE_RANGE
    // of the merchant (hud.ts, the openVendorNpcId proximity check) and a
    // harvest needs the player within INTERACT_RANGE of the node, so the two
    // standing circles have to be disjoint for that to hold.
    //
    // If content ever moves a node or a tool-stocking merchant inside this
    // gap, the stale-lock case becomes real and the vendor window needs a
    // repaint hook. Failing here is the signal to make that call deliberately.
    const VENDOR_CLOSE_RANGE = 8; // hud.ts: dist2d(p.pos, npc.pos) > 8 closes it
    const reach = VENDOR_CLOSE_RANGE + INTERACT_RANGE;
    const gatedStockists = Object.values(NPCS).filter((npc) =>
      (npc.vendorItems ?? []).some((itemId) => VENDOR_ROW_GATES[itemId]),
    );
    // Non-vacuity: if no NPC stocks a gated tool the loop below asserts nothing.
    expect(gatedStockists.length).toBeGreaterThan(0);
    let closest = Number.POSITIVE_INFINITY;
    let closestPair = '';
    for (const npc of gatedStockists) {
      for (const node of GATHER_NODES) {
        const d = Math.hypot(node.pos.x - npc.pos.x, node.pos.z - npc.pos.z);
        if (d < closest) {
          closest = d;
          closestPair = `${npc.id} to ${node.id}`;
        }
      }
    }
    expect(closest, `${closestPair} is inside the vendor-open harvest reach`).toBeGreaterThan(
      reach,
    );
  });
});
