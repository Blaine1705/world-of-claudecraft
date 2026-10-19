// Permanent loot quality on non-enemy reward sources (docs/design/loot-quality.md):
// crafts, quest and world-quest rewards, caches, chests and the Buried Hoard
// parcel roll each new equipment copy through loot/fresh_quality_grant.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { grantFreshLoot, rollFreshLootQualities } from '../src/sim/loot/fresh_quality_grant';
import { isEligibleLootQualityItem, type LootQualityDescriptor } from '../src/sim/loot_quality';
import { resolveCraftForRecipe } from '../src/sim/professions/crafting';
import type { ProfessionRecipeRecord } from '../src/sim/professions/types';
import { grantHoardReward } from '../src/sim/rift/hoard_reward_grant';
import { type HoardRewardInput, rollHoardReward } from '../src/sim/rift/hoard_reward_roll';
import { Rng } from '../src/sim/rng';
import { Sim } from '../src/sim/sim';
import type { ItemInstancePayload } from '../src/sim/types';

const GEAR = 'slagbreaker_helmet';
const MATERIAL = 'copper_ore';

/** An int that answers every quality draw (0..9999) with `draw` and every weight with 1000. */
function forcedQualityRng(draw: number, seed = 7) {
  const rng = new Rng(seed);
  const real = rng.int.bind(rng);
  vi.spyOn(rng, 'int').mockImplementation((min, max) =>
    min === 0 && max === 9999 ? draw : min === 1 && max === 1000 ? 1000 : real(min, max),
  );
  return rng;
}

function fakeCtx(rng: Rng) {
  const plain: Array<{ itemId: string; count: number }> = [];
  const instanced: Array<{ itemId: string; count: number; instance: ItemInstancePayload }> = [];
  return {
    plain,
    instanced,
    ctx: {
      rng,
      addItem: (itemId: string, count: number) => plain.push({ itemId, count }),
      addItemInstance: (itemId: string, instance: ItemInstancePayload, _pid?: number, count = 1) =>
        instanced.push({ itemId, count, instance }),
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('grantFreshLoot', () => {
  it('mints an enhanced copy per winning draw and keeps the rest ordinary', () => {
    const rng = new Rng(1);
    const draws = [9500, 100, 9995];
    vi.spyOn(rng, 'int').mockImplementation((min) => (min === 0 ? draws.shift()! : 1000));
    const { ctx, plain, instanced } = fakeCtx(rng);
    grantFreshLoot(ctx, GEAR, 3, 1);
    expect(instanced.map((g) => [g.count, g.instance.lootQuality?.tier])).toEqual([
      [1, 1],
      [1, 3],
    ]);
    expect(plain).toEqual([{ itemId: GEAR, count: 1 }]);
  });

  it('keeps the base payload on enhanced and ordinary copies alike', () => {
    const base: ItemInstancePayload = { signer: 'Maker', bindOnTrade: true };
    const { ctx, instanced } = fakeCtx(forcedQualityRng(9999));
    grantFreshLoot(ctx, GEAR, 1, 1, undefined, base);
    expect(instanced[0].instance).toEqual({
      signer: 'Maker',
      bindOnTrade: true,
      lootQuality: { version: 1, tier: 4, weights: [1000, 1000, 1000, 1000, 1000] },
    });
    expect(base).toEqual({ signer: 'Maker', bindOnTrade: true });

    const ordinary = fakeCtx(forcedQualityRng(0));
    grantFreshLoot(ordinary.ctx, GEAR, 2, 1, undefined, base);
    expect(ordinary.instanced).toEqual([{ itemId: GEAR, count: 2, instance: base }]);
  });

  it('takes no draw for an ineligible item or an already-rolled copy', () => {
    const rng = new Rng(3);
    const int = vi.spyOn(rng, 'int');
    const { ctx, plain, instanced } = fakeCtx(rng);
    grantFreshLoot(ctx, MATERIAL, 5, 1);
    const rolled: ItemInstancePayload = {
      lootQuality: { version: 1, tier: 2, weights: [1, 2, 3, 4, 5] },
    };
    grantFreshLoot(ctx, GEAR, 1, 1, undefined, rolled);
    expect(int).not.toHaveBeenCalled();
    expect(plain).toEqual([{ itemId: MATERIAL, count: 5 }]);
    expect(instanced).toEqual([{ itemId: GEAR, count: 1, instance: rolled }]);
    expect(rollFreshLootQualities(rng, 'no_such_item', 1)).toEqual([]);
  });
});

describe('crafted equipment', () => {
  const recipe: ProfessionRecipeRecord = {
    id: '__fresh_quality_craft',
    professionId: 'armorcrafting',
    resultItemId: GEAR,
    resultCount: 1,
    reagents: [{ itemId: MATERIAL, count: 1 }],
    skillReq: 0,
    itemLevelBudget: 1,
    level: 1,
  };

  it('rolls permanent quality on the crafted copy', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: false });
    const pid = sim.playerId;
    const meta = sim.players.get(pid)!;
    meta.inventory = [];
    sim.addItem(MATERIAL, 1, pid);
    const real = sim.ctx.rng.int.bind(sim.ctx.rng);
    vi.spyOn(sim.ctx.rng, 'int').mockImplementation((min, max) =>
      min === 0 && max === 9999 ? 9900 : real(min, max),
    );
    expect(resolveCraftForRecipe(sim.ctx, pid, recipe).ok).toBe(true);
    const crafted = meta.inventory.filter((s) => s.itemId === GEAR);
    expect(crafted).toHaveLength(1);
    expect(crafted[0].instance?.lootQuality?.tier).toBe(2);
  });
});

describe('Buried Hoard parcel', () => {
  const input: HoardRewardInput = {
    rarity: 'legendary',
    cls: 'warrior',
    level: 30,
    owner: true,
    guestCapped: false,
    mountOwned: true,
  };

  /** First seed whose owner parcel carries a gear piece. */
  function gearSeed(): number {
    for (let s = 1; s < 500; s++) {
      if (
        rollHoardReward(new Rng(s), input).items.some((i) =>
          isEligibleLootQualityItem(ITEMS[i.itemId]),
        )
      )
        return s;
    }
    throw new Error('no gear parcel in range');
  }

  it('draws the gear quality last, leaving every earlier outcome unchanged', () => {
    const seed = gearSeed();
    const enhanced = rollHoardReward(forcedQualityRng(9990, seed), input);
    const ordinary = rollHoardReward(forcedQualityRng(0, seed), input);
    expect(enhanced.items.map((i) => [i.itemId, i.count])).toEqual(
      ordinary.items.map((i) => [i.itemId, i.count]),
    );
    expect(enhanced.copper).toBe(ordinary.copper);
    expect(ordinary.items.some((i) => i.lootQuality)).toBe(false);
    const gear = enhanced.items.filter((i) => i.lootQuality);
    expect(gear).toHaveLength(1);
    expect(gear[0]).toMatchObject({ count: 1, lootQuality: { tier: 3 } });

    const rng = new Rng(seed);
    const calls: string[] = [];
    const int = rng.int.bind(rng);
    const chance = rng.chance.bind(rng);
    vi.spyOn(rng, 'int').mockImplementation((min, max) => {
      calls.push(min === 0 && max === 9999 ? 'quality' : 'int');
      return int(min, max);
    });
    vi.spyOn(rng, 'chance').mockImplementation((p) => {
      calls.push('chance');
      return chance(p);
    });
    const reward = rollHoardReward(rng, input);
    const q = calls.indexOf('quality');
    expect(q).toBeGreaterThan(0);
    expect(calls.slice(q + 1).every((c) => c === 'int')).toBe(true);
    // Same seed, same parcel: the quality is part of the frozen deterministic roll.
    expect(rollHoardReward(new Rng(seed), input)).toEqual(reward);
  });

  it('grants the stored quality on the copy and never on the materials', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: false });
    const pid = sim.playerId;
    const meta = sim.players.get(pid)!;
    meta.inventory = [];
    const lootQuality: LootQualityDescriptor = { version: 1, tier: 3, weights: [5, 4, 3, 2, 1] };
    expect(
      grantHoardReward(
        sim.ctx,
        pid,
        'legendary',
        {
          items: [
            { itemId: MATERIAL, count: 4 },
            { itemId: GEAR, count: 1, lootQuality },
          ],
          copper: 0,
          capped: false,
        },
        true,
      ),
    ).toBe(true);
    expect(meta.inventory.find((s) => s.itemId === GEAR)?.instance?.lootQuality).toEqual(
      lootQuality,
    );
    expect(meta.inventory.find((s) => s.itemId === MATERIAL)?.instance).toBeUndefined();
  });

  it('grants a malformed stored descriptor as the ordinary copy', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: false });
    const pid = sim.playerId;
    const meta = sim.players.get(pid)!;
    meta.inventory = [];
    const bad = { version: 1, tier: 9, weights: [1, 1, 1, 1, 1] } as never;
    grantHoardReward(
      sim.ctx,
      pid,
      'legendary',
      { items: [{ itemId: GEAR, count: 1, lootQuality: bad }], copper: 0, capped: false },
      true,
    );
    const slot = meta.inventory.find((s) => s.itemId === GEAR);
    expect(slot).toBeDefined();
    expect(slot?.instance?.lootQuality).toBeUndefined();
  });
});
