import { describe, expect, it } from 'vitest';
import type { InvSlot, ItemDef } from '../src/sim/types';
import { buildVendorView, sellJunkButtonState } from '../src/ui/hud/vendor/vendor_view';

// Minimal ItemDef fixtures: buildVendorView only reads id / buyValue / sellValue.
function item(
  id: string,
  opts: {
    buyValue?: number;
    priceHonor?: number;
    sellValue?: number;
    kind?: ItemDef['kind'];
  } = {},
): ItemDef {
  return {
    id,
    name: id,
    quality: 'common',
    kind: opts.kind ?? 'junk',
    slot: 'trinket',
    sellValue: opts.sellValue ?? 0,
    buyValue: opts.buyValue,
    priceHonor: opts.priceHonor,
  } as unknown as ItemDef;
}

// A rich, fully skilled viewer: these cases are about pricing and buyback, so
// the gathering counters are capped to keep every row open and out of the way.
// The gate's own cases live in tests/professions_tool_gate.test.ts.
const RICH = {
  copper: 1_000_000,
  honor: 1_000_000,
  gatheringProficiency: { mining: 100, logging: 100, herbalism: 100 },
} as const;

function table(...items: ItemDef[]): Record<string, ItemDef> {
  return Object.fromEntries(items.map((i) => [i.id, i]));
}

describe('buildVendorView goods', () => {
  it('lists vendor items that exist and have a buyValue, in order', () => {
    const items = table(item('bread', { buyValue: 5 }), item('water', { buyValue: 2 }));
    const view = buildVendorView(['bread', 'water'], [], items, RICH);
    expect(view.goods.map((g) => g.itemId)).toEqual(['bread', 'water']);
    expect(view.goods.map((g) => g.price)).toEqual([
      { copper: 5, honor: 0 },
      { copper: 2, honor: 0 },
    ]);
    expect(view.goods.every((g) => g.affordable)).toBe(true);
  });

  it('tags food/drink goods with a stack quantity of 5, other goods with 1', () => {
    const items = table(
      item('bread', { buyValue: 5, kind: 'food' }),
      item('water', { buyValue: 2, kind: 'drink' }),
      item('potion', { buyValue: 9, kind: 'potion' }),
    );
    const view = buildVendorView(['bread', 'water', 'potion'], [], items, RICH);
    expect(view.goods.map((g) => g.quantity)).toEqual([5, 5, 1]);
    // Price is the total for the purchase: per-unit buyValue times the stack quantity.
    expect(view.goods.map((g) => g.price)).toEqual([
      { copper: 25, honor: 0 },
      { copper: 10, honor: 0 },
      { copper: 9, honor: 0 },
    ]);
  });

  it('skips items missing from the table', () => {
    const items = table(item('bread', { buyValue: 5 }));
    const view = buildVendorView(['bread', 'ghost'], [], items, RICH);
    expect(view.goods.map((g) => g.itemId)).toEqual(['bread']);
  });

  it('skips items with no or zero buyValue (priceless items are never sold)', () => {
    const items = table(
      item('bread', { buyValue: 5 }),
      item('quest_token'),
      item('free', { buyValue: 0 }),
    );
    const view = buildVendorView(['bread', 'quest_token', 'free'], [], items, RICH);
    expect(view.goods.map((g) => g.itemId)).toEqual(['bread']);
  });

  it('returns empty goods for an empty vendor', () => {
    expect(buildVendorView([], [], {}, RICH).goods).toEqual([]);
  });

  it('supports Honor-only and dual-price goods without stack-multiplying Honor', () => {
    const items = table(
      item('banner', { priceHonor: 250 }),
      item('rations', { buyValue: 4, priceHonor: 30, kind: 'food' }),
    );
    const view = buildVendorView(['banner', 'rations'], [], items, RICH);
    expect(view.goods.map((g) => g.price)).toEqual([
      { copper: 0, honor: 250 },
      { copper: 20, honor: 30 },
    ]);
    expect(view.hasHonorGoods).toBe(true);
    expect(view.honorBalance).toBe(RICH.honor);
  });

  it('requires both balances for a dual-price good', () => {
    const items = table(item('blade', { buyValue: 25, priceHonor: 80 }));
    expect(
      buildVendorView(['blade'], [], items, { ...RICH, copper: 25, honor: 80 }).goods[0].affordable,
    ).toBe(true);
    expect(
      buildVendorView(['blade'], [], items, { ...RICH, copper: 24, honor: 80 }).goods[0].affordable,
    ).toBe(false);
    expect(
      buildVendorView(['blade'], [], items, { ...RICH, copper: 25, honor: 79 }).goods[0].affordable,
    ).toBe(false);
  });
});

describe('buildVendorView buyback', () => {
  it('lists redeemable buyback slots with sell-value price and count', () => {
    const items = table(item('sword', { sellValue: 12 }));
    const buyback: InvSlot[] = [{ itemId: 'sword', count: 3 }];
    const view = buildVendorView([], buyback, items, RICH);
    expect(view.buyback).toEqual([
      { itemId: 'sword', item: items.sword, count: 3, price: 12, index: 0 },
    ]);
  });

  it('carries crafted provenance so buyback clicks can echo the exact row identity', () => {
    const items = table(item('vest', { sellValue: 12 }));
    const buyback: InvSlot[] = [{ itemId: 'vest', count: 1, craftedRecipeId: 'recipe_vest' }];
    const view = buildVendorView([], buyback, items, RICH);
    expect(view.buyback[0].craftedRecipeId).toBe('recipe_vest');
  });

  it('skips slots whose item no longer exists or whose count is not positive', () => {
    const items = table(item('sword', { sellValue: 12 }));
    const buyback: InvSlot[] = [
      { itemId: 'sword', count: 1 },
      { itemId: 'ghost', count: 4 },
      { itemId: 'sword', count: 0 },
    ];
    const view = buildVendorView([], buyback, items, RICH);
    expect(view.buyback.map((b) => b.itemId)).toEqual(['sword']);
    expect(view.buyback[0].count).toBe(1);
    // index is the position in the source array (what buyBackItem addresses
    // server-side), not the position in the filtered output.
    expect(view.buyback[0].index).toBe(0);
  });

  it("keeps each row's index anchored to its source-array position, even when earlier rows are skipped", () => {
    const items = table(item('sword', { sellValue: 12 }));
    const buyback: InvSlot[] = [
      { itemId: 'ghost', count: 4 },
      { itemId: 'sword', count: 1 },
    ];
    const view = buildVendorView([], buyback, items, RICH);
    expect(view.buyback).toHaveLength(1);
    expect(view.buyback[0].index).toBe(1);
  });

  it('reports an empty buyback list distinctly from goods', () => {
    const view = buildVendorView([], [], {}, RICH);
    expect(view.buyback).toEqual([]);
  });
});

describe('buildVendorView is a pure projection', () => {
  it('returns identical structure for identical input (no hidden state)', () => {
    const items = table(item('bread', { buyValue: 5 }), item('sword', { sellValue: 12 }));
    const goodsIds = ['bread'];
    const buyback: InvSlot[] = [{ itemId: 'sword', count: 2 }];
    expect(buildVendorView(goodsIds, buyback, items, RICH)).toEqual(
      buildVendorView(goodsIds, buyback, items, RICH),
    );
  });
});

describe('sellJunkButtonState', () => {
  const gray = {
    ...item('rat_tail', { sellValue: 3 }),
    quality: 'poor',
  } as unknown as ItemDef;
  const keeper = item('iron_sword', { sellValue: 50 });

  it('enables on pricable junk and quotes exactly what this bundle can price', () => {
    const inv: InvSlot[] = [
      { itemId: 'rat_tail', count: 2 },
      { itemId: 'iron_sword', count: 1 },
    ];
    expect(sellJunkButtonState(inv, table(gray, keeper))).toEqual({
      enabled: true,
      proceeds: 6,
    });
  });

  it('stays live on an unknown-only bag, quoting zero (the R34 arm)', () => {
    // The server resolves sell_all_junk against ITS OWN table, so grays this
    // bundle cannot classify still sell: the button must not strand them,
    // and the quote stays honest at what this bundle can price.
    const inv: InvSlot[] = [{ itemId: 'future_gray_x', count: 4 }];
    expect(sellJunkButtonState(inv, table(keeper))).toEqual({ enabled: true, proceeds: 0 });
    // A prototype key is an UNKNOWN slot too, never a def (the known_item
    // predicate), so it keeps the button live rather than throwing.
    expect(sellJunkButtonState([{ itemId: 'constructor', count: 1 }], table(keeper))).toEqual({
      enabled: true,
      proceeds: 0,
    });
  });

  it('disables with nothing to sweep and nothing unknown', () => {
    expect(sellJunkButtonState([{ itemId: 'iron_sword', count: 1 }], table(keeper))).toEqual({
      enabled: false,
      proceeds: 0,
    });
    expect(sellJunkButtonState([], table(keeper))).toEqual({ enabled: false, proceeds: 0 });
  });
});
