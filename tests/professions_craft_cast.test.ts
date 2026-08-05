// Craft Cast System Phase 1: craft is a gather-style non-spell cast.
// Start validates without consuming; complete runs the resolve body;
// cancel spends nothing and draws no rng. Craft no longer uses the shared
// action throttle.

import { describe, expect, it } from 'vitest';
import { cancelCast, updateCasting } from '../src/sim/combat/casting_lifecycle';
import {
  CRAFT_BATCH_MAX,
  CRAFT_CAST_DURATION_CEILING_SEC,
  CRAFT_CAST_DURATION_FIELD_SEC,
  CRAFT_CAST_DURATION_FLOOR_SEC,
  CRAFT_CAST_DURATION_SKILL_25_SEC,
  CRAFT_CAST_DURATION_SKILL_50_SEC,
  CRAFT_CAST_DURATION_SKILL_75_SEC,
  CRAFT_CAST_DURATION_SKILL_100_OR_COMBO_SEC,
} from '../src/sim/content/professions';
import { COMBO_RECIPES, COMMON_RECIPES, recipeById } from '../src/sim/content/recipes';
import { STATIONS } from '../src/sim/data';
import { craftCastDurationSec } from '../src/sim/professions/craft_cast_duration';
import {
  clampCraftBatchCount,
  craftItem,
  maxCraftCountForRecipe,
} from '../src/sim/professions/crafting';
import { stationsOfType } from '../src/sim/professions/stations';
import type { ProfessionRecipeRecord } from '../src/sim/professions/types';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import {
  CRAFT_CAST_ID,
  DISENCHANT_CAST_ID,
  ENCHANT_CAST_ID,
  type Entity,
  isNonSpellCast,
  SALVAGE_CAST_ID,
  TOOL_RECHARGE_CAST_ID,
} from '../src/sim/types';

function makeSim(seed = 42): Sim {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: false });
}

function grantItem(sim: Sim, itemId: string, count: number, pid: number) {
  for (let i = 0; i < count; i++) sim.addItem(itemId, 1, pid);
}

function grantReagents(sim: Sim, recipe: ProfessionRecipeRecord, pid: number, mult = 1) {
  for (const r of recipe.reagents) {
    grantItem(sim, r.itemId, r.count * mult, pid);
  }
}

function playerOf(sim: Sim): { p: Entity; meta: PlayerMeta; pid: number } {
  const pid = sim.playerId;
  const meta = sim.players.get(pid);
  const p = (sim as unknown as { entities: Map<number, Entity> }).entities.get(pid);
  if (!meta || !p) throw new Error('player missing');
  return { p, meta, pid };
}

function placeAtStationFor(sim: Sim, pid: number, recipeId: string) {
  const stationType = recipeById(recipeId)?.stationType;
  if (!stationType) throw new Error(`${recipeId} is not station-bound`);
  const station = stationsOfType(STATIONS, stationType)[0];
  const entity = (sim as unknown as { entities: Map<number, Entity> }).entities.get(pid)!;
  entity.pos.x = station.pos.x;
  entity.pos.z = station.pos.z;
  entity.prevPos = { ...entity.pos };
}

/** Finish a running craft cast without advancing the world clock.
 *  Mirrors updateCasting: clear cast fields first, then route to complete. */
function completeCraftNow(sim: Sim) {
  const { p, meta } = playerOf(sim);
  p.castingAbility = null;
  p.castRemaining = 0;
  sim.ctx.completeCraftCast(p, meta);
}

describe('profession cast sentinels', () => {
  it('pins each craft-family cast id to its wire token and isNonSpellCast membership', () => {
    // Literal pins so renaming a constant cannot leave labels/audio/wire green.
    expect(CRAFT_CAST_ID).toBe('crafting');
    expect(DISENCHANT_CAST_ID).toBe('disenchanting');
    expect(ENCHANT_CAST_ID).toBe('enchanting_apply');
    expect(SALVAGE_CAST_ID).toBe('salvaging');
    expect(TOOL_RECHARGE_CAST_ID).toBe('tool_recharge');
    for (const id of [
      CRAFT_CAST_ID,
      DISENCHANT_CAST_ID,
      ENCHANT_CAST_ID,
      SALVAGE_CAST_ID,
      TOOL_RECHARGE_CAST_ID,
    ]) {
      expect(isNonSpellCast(id), id).toBe(true);
    }
    expect(isNonSpellCast('fireball')).toBe(false);
  });
});

describe('craftCastDurationSec', () => {
  it('pins the content band table to the locked plan literals', () => {
    expect(CRAFT_CAST_DURATION_FIELD_SEC).toBe(1.75);
    expect(CRAFT_CAST_DURATION_SKILL_25_SEC).toBe(2.5);
    expect(CRAFT_CAST_DURATION_SKILL_50_SEC).toBe(3.0);
    expect(CRAFT_CAST_DURATION_SKILL_75_SEC).toBe(3.5);
    expect(CRAFT_CAST_DURATION_SKILL_100_OR_COMBO_SEC).toBe(4.0);
    expect(CRAFT_CAST_DURATION_FLOOR_SEC).toBe(1.5);
    expect(CRAFT_CAST_DURATION_CEILING_SEC).toBe(5.0);
  });

  it('maps skillReq bands and combo to the locked durations', () => {
    const field: ProfessionRecipeRecord = {
      id: 't_field',
      professionId: 'tailoring',
      resultItemId: 'homespun_cloth',
      resultCount: 1,
      reagents: [],
      skillReq: 0,
      itemLevelBudget: 1,
      level: 1,
    };
    expect(craftCastDurationSec(field)).toBe(1.75);
    expect(craftCastDurationSec({ ...field, skillReq: 25 })).toBe(2.5);
    expect(craftCastDurationSec({ ...field, skillReq: 50 })).toBe(3.0);
    expect(craftCastDurationSec({ ...field, skillReq: 75 })).toBe(3.5);
    expect(craftCastDurationSec({ ...field, skillReq: 100 })).toBe(4.0);
    expect(craftCastDurationSec({ ...field, skillReq: 150 })).toBe(4.0);
    // Combo always uses the top band even at skillReq 25.
    const combo = COMBO_RECIPES[0];
    expect(combo.comboRequirement).toBeTruthy();
    expect(craftCastDurationSec(combo)).toBe(4.0);
  });
});

describe('craft cast start', () => {
  it('starts CRAFT_CAST_ID with session fields and leaves inventory unchanged', () => {
    const sim = makeSim();
    const { p, meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    grantReagents(sim, recipe, pid);
    const copperBefore = meta.copper;
    const matBefore = recipe.reagents.map((r) => sim.countItem(r.itemId, pid));

    const result = craftItem(sim.ctx, recipe.id, false, pid);

    expect(result.ok).toBe(true);
    expect(result.casting).toBe(true);
    expect(result.itemId).toBeUndefined();
    expect(p.castingAbility).toBe(CRAFT_CAST_ID);
    expect(p.castTotal).toBe(craftCastDurationSec(recipe));
    expect(p.castRemaining).toBe(p.castTotal);
    expect(p.craftCastRecipeId).toBe(recipe.id);
    expect(p.craftCastCommission).toBe(false);
    expect(p.craftCastBatchRemaining).toBe(1);
    expect(p.craftCastBatchTotal).toBe(1);
    expect(meta.copper).toBe(copperBefore);
    for (let i = 0; i < recipe.reagents.length; i++) {
      expect(sim.countItem(recipe.reagents[i].itemId, pid)).toBe(matBefore[i]);
    }
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(0);
  });

  it('captures commission at cast start', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES.find((r) => recipeById(r.id)?.resultItemId)!;
    // Prefer an equipment output if available; any craft still captures the flag.
    grantReagents(sim, recipe, pid);
    craftItem(sim.ctx, recipe.id, true, pid);
    expect(p.craftCastCommission).toBe(true);
  });

  it('denies busy when already casting and leaves materials', () => {
    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    grantReagents(sim, recipe, pid, 2);
    expect(craftItem(sim.ctx, recipe.id, false, pid).casting).toBe(true);
    const mid = craftItem(sim.ctx, recipe.id, false, pid);
    expect(mid.ok).toBe(false);
    expect(mid.reason).toBe('busy');
    for (const r of recipe.reagents) {
      expect(sim.countItem(r.itemId, pid)).toBe(r.count * 2);
    }
    expect(p.craftCastRecipeId).toBe(recipe.id);
  });
});

describe('craft cast complete', () => {
  it('updateCasting routes CRAFT_CAST_ID to completeCraftCast (grant without helper bypass)', () => {
    const sim = makeSim();
    const { p, meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    grantReagents(sim, recipe, pid);
    expect(craftItem(sim.ctx, recipe.id, false, pid).casting).toBe(true);
    expect(p.castingAbility).toBe('crafting');
    // Drain the real cast timer via the lifecycle, not completeCraftNow.
    let n = 0;
    while (p.castingAbility && n++ < 200) updateCasting(sim.ctx, p, meta);
    expect(p.castingAbility).toBeNull();
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(recipe.resultCount);
    expect(meta.lastCraftResult?.ok).toBe(true);
  });

  it('on complete: consumes mats, grants item, skill, and gold sink', () => {
    const sim = makeSim();
    const { meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    grantReagents(sim, recipe, pid);
    meta.copper = 1000;
    const skillBefore = meta.craftSkills[recipe.professionId] ?? 0;

    expect(craftItem(sim.ctx, recipe.id, false, pid).casting).toBe(true);
    completeCraftNow(sim);

    for (const r of recipe.reagents) {
      expect(sim.countItem(r.itemId, pid)).toBe(0);
    }
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(recipe.resultCount);
    expect(meta.craftSkills[recipe.professionId] ?? 0).toBeGreaterThan(skillBefore);
    expect(meta.copper).toBeLessThan(1000);
    expect(meta.lastCraftResult?.ok).toBe(true);
    expect(meta.lastCraftResult?.itemId).toBe(recipe.resultItemId);
    const { p } = playerOf(sim);
    expect(p.craftCastRecipeId).toBe('');
    expect(p.craftCastBatchRemaining).toBe(0);
  });

  it('station_required on complete when player leaves the station mid-cast', () => {
    const sim = makeSim();
    const { p, meta, pid } = playerOf(sim);
    // Station-bound tool recipe.
    const recipe = recipeById('recipe_thorium_mining_pick');
    if (!recipe?.stationType) throw new Error('expected station-bound tool recipe');
    placeAtStationFor(sim, pid, recipe.id);
    grantItem(sim, 'fine_iron_ore', 4, pid);
    grantItem(sim, 'mithril_mining_pick', 1, pid);
    meta.knownRecipes.add(recipe.id);

    expect(craftItem(sim.ctx, recipe.id, false, pid).casting).toBe(true);
    // Leave every station radius before complete (stations sit in towns; origin
    // is not always outside STATION_RADIUS of every placement).
    p.pos.x = 50_000;
    p.pos.z = 50_000;
    completeCraftNow(sim);

    expect(meta.lastCraftResult?.ok).toBe(false);
    expect(meta.lastCraftResult?.reason).toBe('station_required');
    expect(sim.countItem('fine_iron_ore', pid)).toBe(4);
    expect(sim.countItem('mithril_mining_pick', pid)).toBe(1);
    expect(sim.countItem('thorium_mining_pick', pid)).toBe(0);
  });

  it('insufficient_materials on complete when mats are removed mid-cast', () => {
    const sim = makeSim();
    const { meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    grantReagents(sim, recipe, pid);
    expect(craftItem(sim.ctx, recipe.id, false, pid).casting).toBe(true);
    for (const r of recipe.reagents) {
      sim.removeItem(r.itemId, r.count, pid);
    }
    completeCraftNow(sim);
    expect(meta.lastCraftResult?.ok).toBe(false);
    expect(meta.lastCraftResult?.reason).toBe('insufficient_materials');
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(0);
  });
});

describe('craft cast cancel', () => {
  it('cancel mid-cast consumes nothing, grants nothing, clears session fields', () => {
    const sim = makeSim();
    const { p, meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    grantReagents(sim, recipe, pid);
    meta.copper = 500;
    const copperBefore = meta.copper;
    let draws = 0;
    const origNext = sim.ctx.rng.next.bind(sim.ctx.rng);
    sim.ctx.rng.next = () => {
      draws += 1;
      return origNext();
    };

    expect(craftItem(sim.ctx, recipe.id, false, pid).casting).toBe(true);
    cancelCast(sim.ctx, p);

    expect(p.castingAbility).toBeNull();
    expect(p.craftCastRecipeId).toBe('');
    expect(p.craftCastCommission).toBe(false);
    expect(p.craftCastBatchRemaining).toBe(0);
    expect(p.craftCastBatchTotal).toBe(0);
    for (const r of recipe.reagents) {
      expect(sim.countItem(r.itemId, pid)).toBe(r.count);
    }
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(0);
    expect(meta.copper).toBe(copperBefore);
    // No masterwork / jack draws on cancel.
    expect(draws).toBe(0);
    sim.ctx.rng.next = origNext;
  });
});

describe('craft cast masterwork draw order', () => {
  it('draws rng only on successful complete, never on start or cancel', () => {
    const sim = makeSim(99);
    const { p, meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    grantReagents(sim, recipe, pid, 2);

    const nextSpy = () => {
      let n = 0;
      const orig = sim.ctx.rng.next.bind(sim.ctx.rng);
      sim.ctx.rng.next = () => {
        n += 1;
        return orig();
      };
      return () => n;
    };

    const drawsAfterStart = nextSpy();
    expect(craftItem(sim.ctx, recipe.id, false, pid).casting).toBe(true);
    expect(drawsAfterStart()).toBe(0);

    cancelCast(sim.ctx, p);
    expect(drawsAfterStart()).toBe(0);

    // Fresh cast and complete: at least the masterwork proc draw (Jack adds more).
    const drawsComplete = nextSpy();
    grantReagents(sim, recipe, pid);
    expect(craftItem(sim.ctx, recipe.id, false, pid).casting).toBe(true);
    expect(drawsComplete()).toBe(0);
    completeCraftNow(sim);
    expect(drawsComplete()).toBeGreaterThanOrEqual(1);
    expect(meta.lastCraftResult?.ok).toBe(true);
  });
});

describe('craft path no longer uses shared throttle', () => {
  it('many sequential craft casts succeed without reason throttled', () => {
    const sim = makeSim();
    const { p, meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    meta.copper = 1_000_000;
    let successes = 0;
    for (let i = 0; i < 12; i++) {
      // Drain prior outputs so bag capacity never confuses the throttle pin.
      const held = sim.countItem(recipe.resultItemId, pid);
      if (held > 0) sim.removeItem(recipe.resultItemId, held, pid);
      grantReagents(sim, recipe, pid);
      // Prior cast must be cleared (complete or cancel) so busy does not fire.
      if (p.castingAbility) completeCraftNow(sim);
      const start = craftItem(sim.ctx, recipe.id, false, pid);
      expect(start.reason).not.toBe('throttled');
      expect(start.casting).toBe(true);
      completeCraftNow(sim);
      expect(meta.lastCraftResult?.reason).not.toBe('throttled');
      if (meta.lastCraftResult?.ok) successes += 1;
    }
    expect(successes).toBe(12);
  });
});

describe('craft cast batch (Phase 3)', () => {
  it('clamps count to CRAFT_BATCH_MAX and mats-fit; default 1 preserves single craft', () => {
    expect(CRAFT_BATCH_MAX).toBe(50);
    expect(clampCraftBatchCount(1, 100)).toBe(1);
    expect(clampCraftBatchCount(undefined as unknown as number, 100)).toBe(1);
    expect(clampCraftBatchCount(0, 100)).toBe(1);
    expect(clampCraftBatchCount(-3, 100)).toBe(1);
    expect(clampCraftBatchCount(80, 100)).toBe(50);
    expect(clampCraftBatchCount(80, 12)).toBe(12);
    expect(clampCraftBatchCount(3.9, 10)).toBe(3);

    const sim = makeSim();
    const { p, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    grantReagents(sim, recipe, pid);
    expect(craftItem(sim.ctx, recipe.id, false, pid).casting).toBe(true);
    expect(p.craftCastBatchRemaining).toBe(1);
    expect(p.craftCastBatchTotal).toBe(1);
  });

  it('batch of 3: three completes, three consumes, three results', () => {
    const sim = makeSim();
    const { p, meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    meta.copper = 10_000;
    grantReagents(sim, recipe, pid, 3);
    const matBefore = recipe.reagents.map((r) => sim.countItem(r.itemId, pid));

    expect(craftItem(sim.ctx, recipe.id, false, pid, 3).casting).toBe(true);
    expect(p.craftCastBatchRemaining).toBe(3);
    expect(p.craftCastBatchTotal).toBe(3);

    completeCraftNow(sim);
    expect(meta.lastCraftResult?.ok).toBe(true);
    expect(p.castingAbility).toBe(CRAFT_CAST_ID);
    expect(p.craftCastBatchRemaining).toBe(2);
    expect(p.craftCastBatchTotal).toBe(3);
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(recipe.resultCount);

    completeCraftNow(sim);
    expect(meta.lastCraftResult?.ok).toBe(true);
    expect(p.craftCastBatchRemaining).toBe(1);
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(recipe.resultCount * 2);

    completeCraftNow(sim);
    expect(meta.lastCraftResult?.ok).toBe(true);
    expect(p.castingAbility).toBeNull();
    expect(p.craftCastBatchRemaining).toBe(0);
    expect(p.craftCastBatchTotal).toBe(0);
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(recipe.resultCount * 3);
    for (let i = 0; i < recipe.reagents.length; i++) {
      expect(sim.countItem(recipe.reagents[i].itemId, pid)).toBe(
        matBefore[i] - recipe.reagents[i].count * 3,
      );
    }
  });

  it('stops mid-batch when materials run out; keeps partial success', () => {
    const sim = makeSim();
    const { p, meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    meta.copper = 10_000;
    // Enough mats for exactly two crafts, but request three.
    grantReagents(sim, recipe, pid, 2);
    expect(maxCraftCountForRecipe(sim.ctx, recipe, pid)).toBe(2);

    // Start with count 2 (mats-fit clamps a higher request).
    expect(craftItem(sim.ctx, recipe.id, false, pid, 3).casting).toBe(true);
    expect(p.craftCastBatchTotal).toBe(2);

    completeCraftNow(sim);
    expect(meta.lastCraftResult?.ok).toBe(true);
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(recipe.resultCount);

    // Steal remaining mats so the second complete (or auto-start of a third) fails.
    for (const r of recipe.reagents) {
      const held = sim.countItem(r.itemId, pid);
      if (held > 0) sim.removeItem(r.itemId, held, pid);
    }
    completeCraftNow(sim);
    expect(meta.lastCraftResult?.ok).toBe(false);
    expect(meta.lastCraftResult?.reason).toBe('insufficient_materials');
    // First craft kept; no further cast armed.
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(recipe.resultCount);
    expect(p.castingAbility).toBeNull();
    expect(p.craftCastBatchRemaining).toBe(0);
  });

  it('cancel after first complete stops further auto-starts', () => {
    const sim = makeSim();
    const { p, meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    meta.copper = 10_000;
    grantReagents(sim, recipe, pid, 3);

    expect(craftItem(sim.ctx, recipe.id, false, pid, 3).casting).toBe(true);
    completeCraftNow(sim);
    expect(meta.lastCraftResult?.ok).toBe(true);
    expect(p.castingAbility).toBe(CRAFT_CAST_ID);
    expect(p.craftCastBatchRemaining).toBe(2);

    cancelCast(sim.ctx, p);
    expect(p.castingAbility).toBeNull();
    expect(p.craftCastBatchRemaining).toBe(0);
    expect(p.craftCastBatchTotal).toBe(0);
    // Only the completed unit was granted.
    expect(sim.countItem(recipe.resultItemId, pid)).toBe(recipe.resultCount);
    // Remaining mats for the two cancelled crafts stay.
    for (const r of recipe.reagents) {
      expect(sim.countItem(r.itemId, pid)).toBe(r.count * 2);
    }
  });

  it('commission captured at start applies to every batch complete', () => {
    const sim = makeSim();
    const { p, meta, pid } = playerOf(sim);
    // Prefer an equipment recipe when present; otherwise any recipe still
    // captures the flag for the session (honored only if eligible).
    const recipe =
      COMMON_RECIPES.find((r) => {
        const def = recipeById(r.id);
        return def && r.resultCount === 1;
      }) ?? COMMON_RECIPES[0];
    meta.copper = 10_000;
    grantReagents(sim, recipe, pid, 2);

    expect(craftItem(sim.ctx, recipe.id, true, pid, 2).casting).toBe(true);
    expect(p.craftCastCommission).toBe(true);
    completeCraftNow(sim);
    expect(meta.lastCraftResult?.ok).toBe(true);
    // Next cast in the batch re-arms with the same captured commission.
    expect(p.castingAbility).toBe(CRAFT_CAST_ID);
    expect(p.craftCastCommission).toBe(true);
    completeCraftNow(sim);
    expect(meta.lastCraftResult?.ok).toBe(true);
  });

  it('Sim.craftItem four-arg form passes count for multi-player pid', () => {
    const sim = makeSim();
    const { p, meta, pid } = playerOf(sim);
    const recipe = COMMON_RECIPES[0];
    meta.copper = 10_000;
    grantReagents(sim, recipe, pid, 2);
    sim.craftItem(recipe.id, false, pid, 2);
    expect(p.castingAbility).toBe(CRAFT_CAST_ID);
    expect(p.craftCastBatchTotal).toBe(2);
  });
});
