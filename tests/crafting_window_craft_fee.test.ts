// @vitest-environment happy-dom
//
// The #1301 gold-sink fee (src/sim/professions/crafting.ts
// resolveCraftForRecipe: Math.ceil(itemLevelBudget * CRAFT_GOLD_SINK_COPPER_
// PER_BUDGET)) is charged on every successful craft but was never shown
// anywhere in the crafting window: a player saw the wallet drop by more than
// the reagent cost with no line item explaining why. This drives the REAL
// renderCraftingWindow painter (built from the REAL buildCraftingView pure
// core) and asserts the fee appears in all three places a player could look:
// the always-visible row sub-line, the accessible name, and the hover
// tooltip; plus that a fee-free recipe renders none of them.

import { describe, expect, it, vi } from 'vitest';
import { CRAFT_GOLD_SINK_COPPER_PER_BUDGET } from '../src/sim/content/professions';
import type { InvSlot, ItemDef } from '../src/sim/types';
import { buildCraftingView, type RecipeDefLike } from '../src/ui/crafting_view';
import { type CraftingWindowDeps, renderCraftingWindow } from '../src/ui/crafting_window';

function item(id: string): ItemDef {
  return { id, name: id, quality: 'common', kind: 'junk', sellValue: 0 } as unknown as ItemDef;
}

function table(...items: ItemDef[]): Record<string, ItemDef> {
  return Object.fromEntries(items.map((i) => [i.id, i]));
}

// itemLevelBudget: 16 mirrors the real Marshstalker Spaulders recipe (a
// reported 32c fee at CRAFT_GOLD_SINK_COPPER_PER_BUDGET=2).
function feeRecipe(itemLevelBudget?: number): RecipeDefLike {
  return {
    id: 'recipe_fee',
    professionId: 'leatherworking',
    resultItemId: 'recipe_fee_result',
    resultCount: 1,
    reagents: [{ itemId: 'leather', count: 1 }],
    skillReq: 0,
    ...(itemLevelBudget !== undefined ? { itemLevelBudget } : {}),
  };
}

function craftingDeps(): CraftingWindowDeps {
  return {
    hideTooltip: () => {},
    onCraft: () => {},
    onClose: () => {},
    onOpenOrders: () => {},
    craftQty: () => 1,
    onCraftQty: () => {},
    announce: () => {},
    itemIcon: () => '',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: vi.fn(),
    commissionChecked: () => false,
    onToggleCommission: () => {},
    selectedCraft: () => null,
    onSelectCraft: () => {},
  };
}

function viewFor(itemLevelBudget?: number) {
  const items = table(item('leather'), item('recipe_fee_result'));
  const inventory: InvSlot[] = [{ itemId: 'leather', count: 5 }];
  return buildCraftingView([feeRecipe(itemLevelBudget)], inventory, items);
}

describe('renderCraftingWindow: craft fee visibility (#1301 gold sink)', () => {
  it('shows the fee inline under the reagent list', () => {
    const el = document.createElement('div');
    renderCraftingWindow(el, viewFor(16), craftingDeps());
    const feeLine = el.querySelector('.crafting-fee-line');
    expect(feeLine?.textContent).toBe(
      `Craft fee: ${formatCopper(Math.ceil(16 * CRAFT_GOLD_SINK_COPPER_PER_BUDGET))}`,
    );
  });

  it('folds the fee into the Craft button accessible name', () => {
    const el = document.createElement('div');
    renderCraftingWindow(el, viewFor(16), craftingDeps());
    const btn = el.querySelector('.crafting-recipe-btn');
    expect(btn?.getAttribute('aria-label')).toContain('Craft fee: 32c');
  });

  it('includes the fee in the hover tooltip content', () => {
    const el = document.createElement('div');
    const deps = craftingDeps();
    renderCraftingWindow(el, viewFor(16), deps);
    const attach = deps.attachTooltip as ReturnType<typeof vi.fn>;
    expect(attach).toHaveBeenCalled();
    const tooltipFactory = attach.mock.calls[0][1] as () => string;
    expect(tooltipFactory()).toContain('Craft fee: 32c');
  });

  it('renders no fee line, no tooltip fee, and no aria fee text for a recipe with no itemLevelBudget', () => {
    const el = document.createElement('div');
    const deps = craftingDeps();
    renderCraftingWindow(el, viewFor(undefined), deps);
    expect(el.querySelector('.crafting-fee-line')).toBeNull();
    const btn = el.querySelector('.crafting-recipe-btn');
    expect(btn?.getAttribute('aria-label')).not.toContain('Craft fee');
    const attach = deps.attachTooltip as ReturnType<typeof vi.fn>;
    const tooltipFactory = attach.mock.calls[0][1] as () => string;
    expect(tooltipFactory()).not.toContain('Craft fee');
  });
});

// Mirrors the compact formatMoney rendering (gold/silver/copper short units)
// for the exact copper amounts this suite exercises, so the assertions above
// read as plain English rather than a magic string.
function formatCopper(copper: number): string {
  return `${copper}c`;
}
