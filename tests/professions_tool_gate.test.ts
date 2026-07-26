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

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GATHERING_PROFESSIONS, type GatheringProfessionId } from '../src/sim/content/professions';
import {
  resolveVendorRowGate,
  TIER2_TOOL_GATE_PROFICIENCY,
  TIER3_TOOL_GATE_PROFICIENCY,
  VENDOR_ROW_GATES,
} from '../src/sim/content/vendor_row_gates';
import { GATHER_NODES, ITEMS, NPCS, zoneAt } from '../src/sim/data';
import * as items from '../src/sim/items';
import { GATHER_GAIN_TIER_STEP, gatherNodeGainMultiplier } from '../src/sim/professions/gathering';
import { Sim } from '../src/sim/sim';
import type { SimContext } from '../src/sim/sim_context';
import { type Entity, INTERACT_RANGE, type SimEvent } from '../src/sim/types';
import { buildVendorView } from '../src/ui/hud/vendor/vendor_view';
import { NPC_WINDOW_CLOSE_RANGE } from '../src/ui/npc_service_range';

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

  it('treats a MALFORMED proficiency value as 0, which locks, exactly like an absent one', () => {
    // A bare `held < threshold` comparison lets NaN through: NaN < 40 is false,
    // so the row would OPEN. The sim's own map is sanitized on load, but the
    // online client mirrors gprof straight off the wire with no shape check and
    // hands that map to the view, so this is the one direction the resolver
    // must not fail open in.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null, '99', {}]) {
      const map = { mining: bad } as unknown as Record<string, number>;
      expect(resolveVendorRowGate('iron_mining_pick', map).locked, String(bad)).toBe(true);
    }
    // Of the values above, NaN / +Infinity / '99' / {} are the ones that
    // DISCRIMINATE: each opens the row under a bare `held < threshold` and
    // locks it under the shipped coercion. undefined and null pass either way
    // and are carried by the absent-value case above, so they are breadth, not
    // the guard. A -Infinity arm was dropped for exactly that reason: it locks
    // under both, so it proved nothing while reading like a second check.
  });

  it('never resolves a prototype key as a gate', () => {
    // The table is an object literal, so a bare lookup answers `constructor`
    // and friends with a truthy non-gate. A custom world document can put an
    // arbitrary string into an NPC's vendorItems, so the ids reaching this
    // resolver are not all content-authored.
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(resolveVendorRowGate(key, {}), key).toEqual({ locked: false });
    }
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

describe('the threshold values themselves', () => {
  it('are 40 and 70, pinned as literals', () => {
    // Everything else in this file compares the constants to THEMSELVES, which
    // proves the wiring and proves nothing about the numbers: a mutation to
    // 45 / 65 keeps the whole suite green while staying under the ceiling and
    // inside the margin. These two numbers are published player copy (the wiki
    // tools note interpolates them, and the vendor row renders them), so a
    // rebalance has to touch this claim rather than drift past it. Same
    // reasoning and same shape as the tier-1 price pin in
    // tests/professions_tools.test.ts.
    expect(TIER2_TOOL_GATE_PROFICIENCY).toBe(40);
    expect(TIER3_TOOL_GATE_PROFICIENCY).toBe(70);
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
    // Non-vacuity, asserted AFTER the loop so a newly added ungated tool is
    // named by its own arm first rather than reported as a bare count change.
    expect(tools.length).toBe(9);
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

  it('the gated tools stay transferable, which is what the open-routes note rests on', () => {
    // The scope comment and the design doc both record player-to-player
    // transfer as an OPEN route. That claim is load-bearing (it is the reason
    // the gate is described as purchase-time rather than access-gating), and it
    // rests entirely on the ABSENCE of three flags, which nothing pinned. If a
    // future change adds noMarketList/soulbound/bindOnTrade to these six, that
    // is the maintainer ruling being taken, and this arm is where it surfaces.
    for (const itemId of Object.keys(VENDOR_ROW_GATES)) {
      const def = ITEMS[itemId] as unknown as Record<string, unknown>;
      expect(def.noMarketList, `${itemId} noMarketList`).toBeFalsy();
      expect(def.soulbound, `${itemId} soulbound`).toBeFalsy();
      expect(def.bindOnTrade, `${itemId} bindOnTrade`).toBeFalsy();
      // And sellable, which is what makes the buyback route reachable at all.
      expect(def.noVendorSell, `${itemId} noVendorSell`).toBeFalsy();
    }
  });

  it('gates only ever name a gathering profession that exists', () => {
    for (const [itemId, gate] of Object.entries(VENDOR_ROW_GATES)) {
      // The gated id must be a real land gathering tool. Without this a gate
      // on, say, baked_bread would satisfy every other arm in this file.
      const use = ITEMS[itemId]?.use;
      expect(use?.type, itemId).toBe('gatherTool');
      expect(
        use?.type === 'gatherTool' ? use.professionId : undefined,
        `${itemId} gate profession matches the tool`,
      ).toBe(gate.professionId);
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

  it('leaves BUYBACK ungated, the documented ruling', () => {
    // The scope comment and docs/design/professions.md both state buyback is
    // deliberately not gated, because returning a player their own sold item is
    // not a new acquisition. Nothing pinned it, so gating buyBackItem later, or
    // hoisting the check into a helper both paths call, would flip a recorded
    // ruling with nothing red.
    const sim = new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
    const { pid, hale, meta } = shopper(sim);
    meta.gatheringProficiency.mining = TIER2_TOOL_GATE_PROFICIENCY;
    items.buyItem(ctxOf(sim), hale.id, 'iron_mining_pick', pid);
    expect(sim.countItem('iron_mining_pick', pid)).toBe(1);

    // Sell it back, then lose the proficiency (the mastery-reset shape).
    items.sellItem(ctxOf(sim), 'iron_mining_pick', 1, pid);
    expect(sim.countItem('iron_mining_pick', pid)).toBe(0);
    meta.gatheringProficiency.mining = 0;
    sim.drainEvents();

    items.buyBackItem(ctxOf(sim), 'iron_mining_pick', pid);

    expect(sim.countItem('iron_mining_pick', pid)).toBe(1);
    expect(errorTexts(sim.drainEvents())).toEqual([]);
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

  it('unlocks the row at the threshold the shared resolver uses', () => {
    const view = buildVendorView(stock, [], ITEMS, {
      ...balances,
      gatheringProficiency: { mining: TIER2_TOOL_GATE_PROFICIENCY },
    });
    expect(view.goods.find((g) => g.itemId === 'iron_mining_pick')?.locked).toBe(false);
  });

  it('an EMPTY proficiency map locks every gated row rather than opening it', () => {
    // The map is a required field, so it can no longer be forgotten silently;
    // what remains reachable is a caller satisfying the type with an empty
    // object. That must lock (the under-promising direction), never open.
    const view = buildVendorView(stock, [], ITEMS, { ...balances, gatheringProficiency: {} });
    expect(view.goods.find((g) => g.itemId === 'iron_mining_pick')?.locked).toBe(true);
    expect(view.goods.find((g) => g.itemId === 'copper_mining_pick')?.locked).toBe(false);
  });

  it('agrees with the SHARED RESOLVER on every stocked tool across a proficiency sweep', () => {
    // Named for what it actually drives. The view and the sim cannot disagree
    // because they call one resolver, and this sweeps that agreement across
    // the whole stocked ladder; the buy path's own enforcement is driven
    // directly in the buy-path describe above, which is where deleting the
    // guard from items.ts turns red.
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

describe('the HUD actually feeds the viewer proficiency into the view', () => {
  it('passes gatheringProficiency into buildVendorView', () => {
    // The one line the rest of this file cannot reach: every other arm hands
    // the map in by hand, and no test constructs a real Hud. Deleting that
    // argument is now a compile error (VendorBalances requires the field), but
    // a caller could still satisfy the type with an empty literal, which the
    // resolver reads as 0 and which therefore LOCKS every gated row for every
    // player at any proficiency, silently, in the safe-looking direction.
    // Comments are stripped first so a mention in prose cannot satisfy it.
    const source = readFileSync(path.resolve(process.cwd(), 'src/ui/hud.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    const call = source.slice(source.indexOf('buildVendorView('));
    expect(call.startsWith('buildVendorView(')).toBe(true);
    const args = call.slice(0, call.indexOf('),\n'));
    expect(args).toContain('gatheringProficiency:');
    // and it comes from the world, not from a literal.
    expect(args).toMatch(/gatheringProficiency:\s*this\.sim\.gatheringProficiency/);
  });

  it('closes its service windows on the shared constant, never on an inlined number', () => {
    // The geometry arm below reads NPC_WINDOW_CLOSE_RANGE, so it only guards
    // the separation while the HUD still reads it too. Replacing the proximity
    // literals with a bare number leaves the constant at 8, the arm green, and
    // the stale-lock hole re-opened, so pin the read itself.
    const source = readFileSync(path.resolve(process.cwd(), 'src/ui/hud.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/.*$/gm, '$1');
    // Every service-window proximity check compares against the constant.
    const checks = [...source.matchAll(/dist2d\(p\.pos, npc\.pos\) > ([A-Za-z_0-9.]+)/g)];
    expect(checks.length, 'the proximity checks are still there').toBeGreaterThanOrEqual(4);
    for (const [, operand] of checks) {
      expect(operand, 'proximity check compares against the shared constant').toBe(
        'NPC_WINDOW_CLOSE_RANGE',
      );
    }
    // Invariant-shaped, not spelling-shaped: the loop above only sees the
    // `(p.pos, npc.pos)` spelling and a count floor cannot notice an extra
    // check, so a fifth window closing on `dist2d(p.pos, merchant.pos) > 30`
    // would sail past it. No dist2d comparison in this file may use a numeric
    // literal at all; the shipped file has none.
    expect(
      [...source.matchAll(/dist2d\([^)]*\)\s*>=?\s*[0-9]/g)].map((m) => m[0]),
      'a dist2d range compared against a bare number',
    ).toEqual([]);
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

  it('no hub anywhere stocks a land tool above its own zone node tier', () => {
    // The rule that justifies taking six rows off Eastbrook, DERIVED rather
    // than enumerated. The hand-written arms in tests/professions_tools.test.ts
    // are a lower bound per zone ("Fenbridge stocks at least these"), so they
    // could not have caught the bug this change fixes: Eastbrook broke this
    // rule for its whole life and shipped green, and dropping a tier-3 axe onto
    // the Fenbridge counter would still ship green today. This arm is the upper
    // bound, and it holds for every current and future tool-stocking NPC.
    const maxNodeTierInZone = new Map<string, number>();
    for (const node of GATHER_NODES) {
      maxNodeTierInZone.set(
        node.zoneId,
        Math.max(maxNodeTierInZone.get(node.zoneId) ?? 0, node.tier),
      );
    }
    expect(maxNodeTierInZone.size).toBeGreaterThan(0);

    // NPC z coordinates map to zones the way the world does; resolve each
    // stocking NPC to its zone through the shipped zone lookup rather than by
    // hand, so a relocated merchant is judged against its new ground.
    let gatedRowsChecked = 0;
    const ceilingsExercised = new Set<string>();
    for (const npc of Object.values(NPCS)) {
      for (const itemId of npc.vendorItems ?? []) {
        const use = ITEMS[itemId]?.use;
        // Land tools only: fishing has no nodes, so the rule cannot be stated
        // for rods and they are a documented standing exception.
        if (use?.type !== 'gatherTool' || use.professionId === 'fishing') continue;
        const zone = zoneAt(npc.pos.z);
        // zoneAt SATURATES: it walks bands by zMax and falls back to the last
        // zone, so an NPC past the final band (or at a NaN z) silently resolves
        // to the highest-ceilinged zone in the world and would be judged against
        // the most permissive ground there is. Assert the resolved zone really
        // contains the merchant, so a fallback fails instead of passing free.
        expect(
          npc.pos.z >= zone.zMin && npc.pos.z < zone.zMax,
          `${npc.id} at z=${npc.pos.z} resolved to ${zone.id} (${zone.zMin}..${zone.zMax}) by fallback`,
        ).toBe(true);
        const nodeCeiling = maxNodeTierInZone.get(zone.id) ?? 0;
        expect(
          use.tier,
          `${npc.id} (${zone.id}) stocks ${itemId} at tier ${use.tier} above its ground's ${nodeCeiling}`,
        ).toBeLessThanOrEqual(nodeCeiling);
        if (use.tier >= 2) gatedRowsChecked++;
        ceilingsExercised.add(zone.id);
      }
    }
    // Non-vacuity, counting only the rows this rule can actually constrain: a
    // tier-1 row satisfies `tier <= ceiling` in every zone trivially, so a
    // count over ALL tool rows is met by the tier-1 rows alone and the sweep
    // could pass having seen no gated row at all.
    expect(gatedRowsChecked, 'the sweep must see the tier-2 and tier-3 rows').toBe(9);
    // And it must have judged every zone that stocks tools, not just one.
    expect(ceilingsExercised.size).toBe(3);
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
    // Imported, never re-stated: a hand-copied 8 made this arm one-sided, so
    // widening the HUD's close range left it green while the stale-lock case
    // it guards became real.
    const reach = NPC_WINDOW_CLOSE_RANGE + INTERACT_RANGE;
    const gatedStockists = Object.values(NPCS).filter((npc) =>
      (npc.vendorItems ?? []).some((itemId) => VENDOR_ROW_GATES[itemId]),
    );
    // Non-vacuity on BOTH dimensions: an empty stockist list or an empty node
    // table would leave `closest` at Infinity and pass without comparing a
    // single pair.
    expect(gatedStockists.length).toBeGreaterThan(0);
    expect(GATHER_NODES.length).toBeGreaterThan(0);
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
