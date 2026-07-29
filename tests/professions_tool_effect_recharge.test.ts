// The recharge_tool_effect command end to end (the acquisition craft's
// second half): R39 pricing and R30 refills driven through the real Sim
// command, plus the economics inequality that keeps re-slotting from ever
// bypassing recharges (the craft's mint reagents must out-cost the most
// expensive generic recharge any shipped tool can price).

import { describe, expect, it } from 'vitest';
import type { TOOL_EFFECT_IDS } from '../src/sim/content/professions';
import { TOOL_EFFECT_RECIPES } from '../src/sim/content/recipes';
import { ITEMS } from '../src/sim/data';
import { DISENCHANT_MATERIAL_BY_QUALITY } from '../src/sim/professions/disenchant_reagents';
import {
  RECHARGE_CHARGES_PER_MATERIAL,
  rarityLadderIndex,
  startingDurabilityFor,
} from '../src/sim/professions/tools';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';

const makeSim = (seed = 11) => new Sim({ seed, playerClass: 'warrior', autoEquip: false });
const metaOf = (sim: Sim): PlayerMeta => sim.meta(sim.playerId) as PlayerMeta;

/** Slot a self-crafted charm onto mining with the given pick carried. */
function simWithSlot(pickId = 'copper_mining_pick'): Sim {
  const sim = makeSim();
  sim.addItem(pickId, 1);
  sim.addItemInstance('gatherers_cache', { signer: metaOf(sim).name }, sim.playerId, 1);
  sim.slotToolEffect('mining', 'gatherers_cache');
  return sim;
}

function lastToolEffectResult(events: SimEvent[]): SimEvent | undefined {
  return events.filter((ev) => ev.type === 'toolEffectResult').at(-1);
}

describe('the recharge command: price, consume, refill', () => {
  it('a depleted slot refills to the re-derived max, consuming the priced materials exactly', () => {
    const sim = simWithSlot();
    const slot = metaOf(sim).toolEffectSlots?.mining;
    if (!slot) throw new Error('slot minted');
    slot.durability = 0;
    sim.addItem('arcane_dust', 10);
    sim.rechargeToolEffect('mining');
    const events = sim.tick();
    // Common pick: 20-charge fill, self-crafted slot: ceil((20/10) * 0.5) = 1.
    expect(slot.durability).toBe(20);
    expect(slot.maxDurability).toBe(20);
    expect(sim.countItem('arcane_dust')).toBe(9);
    // craftedBy survives the recharge: provenance is permanent.
    expect(slot.craftedBy).toBe(metaOf(sim).name);
    expect(lastToolEffectResult(events)).toMatchObject({
      action: 'recharge',
      ok: true,
      materialItemId: 'arcane_dust',
      count: 1,
    });
  });

  it('a foreign-crafted slot pays the full generic count', () => {
    const sim = makeSim();
    sim.addItem('copper_mining_pick', 1);
    sim.addItemInstance('gatherers_cache', { signer: 'Elsewhere' }, sim.playerId, 1);
    sim.slotToolEffect('mining', 'gatherers_cache');
    const slot = metaOf(sim).toolEffectSlots?.mining;
    if (!slot) throw new Error('slot minted');
    expect(slot.craftedBy).toBe('Elsewhere');
    slot.durability = 0;
    sim.addItem('arcane_dust', 10);
    sim.rechargeToolEffect('mining');
    sim.tick();
    // Generic rate: ceil(20/10) = 2 dust, no discount for a buyer.
    expect(slot.durability).toBe(20);
    expect(sim.countItem('arcane_dust')).toBe(8);
  });

  it('every deny arm consumes nothing and names itself on the event', () => {
    // no_slot: nothing slotted at all.
    const bare = makeSim();
    bare.addItem('arcane_dust', 10);
    bare.rechargeToolEffect('mining');
    expect(lastToolEffectResult(bare.tick())).toMatchObject({ ok: false, reason: 'no_slot' });
    expect(bare.countItem('arcane_dust')).toBe(10);

    // no_tool: the pick left the bags after slotting, so the R30 rarity
    // cannot resolve (mirrors the slot gate).
    const toolless = simWithSlot();
    toolless.removeItem('copper_mining_pick', 1);
    const tSlot = metaOf(toolless).toolEffectSlots?.mining;
    if (!tSlot) throw new Error('slot minted');
    tSlot.durability = 0;
    toolless.addItem('arcane_dust', 10);
    toolless.rechargeToolEffect('mining');
    expect(lastToolEffectResult(toolless.tick())).toMatchObject({ ok: false, reason: 'no_tool' });
    expect(toolless.countItem('arcane_dust')).toBe(10);

    // already_full: a fresh slot has nothing to restore.
    const full = simWithSlot();
    full.addItem('arcane_dust', 10);
    full.rechargeToolEffect('mining');
    expect(lastToolEffectResult(full.tick())).toMatchObject({ ok: false, reason: 'already_full' });
    expect(full.countItem('arcane_dust')).toBe(10);

    // insufficient_materials: the event carries the price so the player
    // learns the cost from the refusal itself.
    const broke = simWithSlot();
    const bSlot = metaOf(broke).toolEffectSlots?.mining;
    if (!bSlot) throw new Error('slot minted');
    bSlot.durability = 0;
    broke.rechargeToolEffect('mining');
    expect(lastToolEffectResult(broke.tick())).toMatchObject({
      ok: false,
      reason: 'insufficient_materials',
      materialItemId: 'arcane_dust',
      count: 1,
    });

    // throttled: the shared crafting-action window refuses before pricing
    // materials (and spends nothing).
    const paced = simWithSlot();
    const pSlot = metaOf(paced).toolEffectSlots?.mining;
    if (!pSlot) throw new Error('slot minted');
    pSlot.durability = 0;
    paced.addItem('arcane_dust', 10);
    metaOf(paced).craftThrottle = { windowStart: 0, count: 1000 };
    paced.rechargeToolEffect('mining');
    expect(lastToolEffectResult(paced.tick())).toMatchObject({ ok: false, reason: 'throttled' });
    expect(paced.countItem('arcane_dust')).toBe(10);
    expect(pSlot.durability).toBe(0);
  });

  it('R30 at the command: the inflated mint refuses until spent below the honest max', () => {
    // Minted on an epic pick (50 charges), pick then traded away for a common
    // one: while charges sit above 20 the recharge refuses, and the fill that
    // finally lands restores to 20, shrinking maxDurability with it.
    const sim = makeSim();
    sim.addItem('arcanite_mining_pick', 1);
    sim.addItemInstance('artisans_eye', { signer: metaOf(sim).name }, sim.playerId, 1);
    sim.slotToolEffect('mining', 'artisans_eye');
    const slot = metaOf(sim).toolEffectSlots?.mining;
    if (!slot) throw new Error('slot minted');
    expect(slot.maxDurability).toBe(50);
    sim.removeItem('arcanite_mining_pick', 1);
    sim.addItem('copper_mining_pick', 1);
    sim.addItem('arcane_dust', 10);
    slot.durability = 30;
    sim.rechargeToolEffect('mining');
    expect(lastToolEffectResult(sim.tick())).toMatchObject({ ok: false, reason: 'already_full' });
    expect(slot.durability).toBe(30);
    expect(slot.maxDurability).toBe(50);
    slot.durability = 5;
    sim.rechargeToolEffect('mining');
    sim.tick();
    expect(slot.durability).toBe(20);
    expect(slot.maxDurability).toBe(20);
  });

  it('slotting and recharging draw no rng at all', () => {
    const sim = makeSim();
    sim.addItem('copper_mining_pick', 1);
    sim.addItemInstance('gatherers_cache', { signer: metaOf(sim).name }, sim.playerId, 1);
    sim.addItem('arcane_dust', 10);
    const rng = (sim as unknown as { rng: { observer?: (v: number) => void } }).rng;
    const drawn: number[] = [];
    rng.observer = (v: number) => drawn.push(v);
    sim.slotToolEffect('mining', 'gatherers_cache');
    const slot = metaOf(sim).toolEffectSlots?.mining;
    if (!slot) throw new Error('slot minted');
    slot.durability = 0;
    sim.rechargeToolEffect('mining');
    rng.observer = undefined;
    expect(drawn).toEqual([]);
    expect(slot.durability).toBe(20);
  });
});

describe('the R39 economics inequality: a fresh mint always out-costs a generic recharge', () => {
  // The same price basis recipe_economy.test.ts uses: buyValue when a vendor
  // sells the reagent for copper, else sellValue.
  const unitValue = (itemId: string): number => {
    const def = ITEMS[itemId];
    if (!def) throw new Error(`no ItemDef for ${itemId}`);
    return typeof def.buyValue === 'number' && def.buyValue > 0 ? def.buyValue : def.sellValue;
  };

  // Every rarity rung a SHIPPED gathering tool can resolve at recharge time:
  // derived from the live item table, so the day a legendary tool ships, its
  // rung joins this set and the inequality below must survive the retune.
  const reachableRungs = [
    ...new Set(
      Object.values(ITEMS)
        .filter((def) => def.use?.type === 'gatherTool')
        .map((def) => def.quality ?? 'common'),
    ),
  ];

  it('holds for every craftable effect at every reachable rung', () => {
    expect(reachableRungs.length).toBeGreaterThanOrEqual(3); // non-vacuity
    for (const recipe of TOOL_EFFECT_RECIPES) {
      const mintValue = recipe.reagents.reduce(
        (total, reagent) => total + reagent.count * unitValue(reagent.itemId),
        0,
      );
      for (const rung of reachableRungs) {
        const fill = startingDurabilityFor(
          recipe.resultItemId as (typeof TOOL_EFFECT_IDS)[number],
          rung,
        );
        const genericCount = Math.ceil(fill / RECHARGE_CHARGES_PER_MATERIAL);
        const ladderRung = ['common', 'uncommon', 'rare', 'epic', 'legendary'][
          rarityLadderIndex(rung)
        ];
        const rechargeValue = genericCount * unitValue(DISENCHANT_MATERIAL_BY_QUALITY[ladderRung]);
        expect(
          mintValue,
          `${recipe.id} at the ${String(rung)} rung: mint ${mintValue} must exceed ` +
            `the generic full-fill recharge ${rechargeValue}, or re-slotting a fresh ` +
            `charm becomes the cheap recharge`,
        ).toBeGreaterThan(rechargeValue);
      }
    }
  });

  it('pins the shipped constants so a one-sided retune cannot drift silently', () => {
    // 4 shards (55) + 3 essence (18) + 5 dust (6) = 304 copper of reagents.
    for (const recipe of TOOL_EFFECT_RECIPES) {
      const mintValue = recipe.reagents.reduce(
        (total, reagent) => total + reagent.count * unitValue(reagent.itemId),
        0,
      );
      expect(mintValue).toBe(304);
    }
    // The worst generic recharge a shipped tool can price: an epic tool's
    // 50-charge fill at 5 shards.
    const worstFill = startingDurabilityFor('gatherers_cache', 'epic');
    expect(worstFill).toBe(50);
    expect(Math.ceil(worstFill / RECHARGE_CHARGES_PER_MATERIAL) * unitValue('arcane_shard')).toBe(
      275,
    );
  });
});
