// @vitest-environment happy-dom

// Craft Cast System Phase 2: crafting window duration chip, button state,
// in-window progress strip, aria-busy, and live region. Painter pins over
// pure craft_cast_view state.

import { describe, expect, it, vi } from 'vitest';
import type { ItemDef } from '../src/sim/types';
import { CRAFT_CAST_ID } from '../src/sim/types';
import { buildCraftCastSession, IDLE_CRAFT_CAST_SESSION } from '../src/ui/craft_cast_view';
import { buildCraftingView, type CraftingView } from '../src/ui/crafting_view';
import {
  paintCraftCastProgress,
  renderCraftingWindow,
  setCraftCastLiveMessage,
} from '../src/ui/crafting_window';

function item(id: string): ItemDef {
  return {
    id,
    name: id,
    quality: 'common',
    kind: 'junk',
    sellValue: 0,
  } as unknown as ItemDef;
}

const ITEMS = Object.fromEntries(['copper_ore', 'test_stew'].map((id) => [id, item(id)]));

function craftableView(): CraftingView {
  return buildCraftingView(
    [
      {
        id: 'recipe_test_stew',
        professionId: 'cooking',
        resultItemId: 'test_stew',
        resultCount: 1,
        reagents: [{ itemId: 'copper_ore', count: 1 }],
        skillReq: 0,
      },
    ],
    [{ itemId: 'copper_ore', count: 2 }],
    ITEMS,
  );
}

function deps(qty = 1) {
  const qtyMap = new Map<string, number>();
  return {
    hideTooltip: vi.fn(),
    onCraft: vi.fn(),
    onClose: vi.fn(),
    onOpenOrders: vi.fn(),
    itemIcon: vi.fn(() => ''),
    moneyHtml: vi.fn(() => ''),
    itemTooltip: vi.fn(() => ''),
    attachTooltip: vi.fn(),
    commissionChecked: vi.fn(() => false),
    onToggleCommission: vi.fn(),
    craftQty: (recipeId: string) => qtyMap.get(recipeId) ?? qty,
    onCraftQty: vi.fn((recipeId: string, n: number) => {
      qtyMap.set(recipeId, n);
    }),
    selectedCraft: () => null as string | null,
    onSelectCraft: vi.fn(),
  };
}

describe('renderCraftingWindow craft-cast UX', () => {
  it('paints a duration chip and ready craft button when idle', () => {
    const el = document.createElement('div');
    renderCraftingWindow(
      el,
      craftableView(),
      deps(),
      undefined,
      new Map(),
      IDLE_CRAFT_CAST_SESSION,
    );
    const chip = el.querySelector('.crafting-duration-chip');
    expect(chip).not.toBeNull();
    expect(chip!.textContent).toMatch(/1\.75/);
    const btn = el.querySelector<HTMLButtonElement>('.crafting-recipe-btn');
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);
    expect(btn!.getAttribute('aria-busy')).toBeNull();
    expect(btn!.querySelector('.crafting-craft-chip')!.textContent).toMatch(/Create/);
    const progress = el.querySelector<HTMLElement>('.crafting-cast-progress');
    expect(progress).not.toBeNull();
    expect(progress!.hidden).toBe(true);
    expect(el.querySelector('.crafting-live')).not.toBeNull();
    // Phase 3 batch controls.
    expect(el.querySelector('.crafting-qty-row')).not.toBeNull();
    expect(el.querySelector('.crafting-create-all-btn')).not.toBeNull();
    expect(el.querySelector('.crafting-create-all-btn')!.textContent).toMatch(/Create All/);
  });

  it('marks the active recipe casting with aria-busy and shows progress', () => {
    const el = document.createElement('div');
    const session = buildCraftCastSession({
      castingAbility: CRAFT_CAST_ID,
      castRemaining: 0.875,
      castTotal: 1.75,
      craftCastRecipeId: 'recipe_test_stew',
    });
    renderCraftingWindow(el, craftableView(), deps(), undefined, new Map(), session);
    const btn = el.querySelector<HTMLButtonElement>('.crafting-recipe-btn');
    expect(btn!.disabled).toBe(true);
    expect(btn!.getAttribute('aria-busy')).toBe('true');
    expect(btn!.classList.contains('casting')).toBe(true);
    expect(btn!.querySelector('.crafting-craft-chip')!.textContent).toMatch(/Crafting/);
    const progress = el.querySelector<HTMLElement>('.crafting-cast-progress');
    expect(progress!.hidden).toBe(false);
    expect(progress!.getAttribute('aria-valuenow')).toBe('50');
    const fill = progress!.querySelector<HTMLElement>('.crafting-cast-progress-fill');
    expect(fill!.style.width).toBe('50.0%');
    expect(el.querySelector('.crafting-live')!.textContent).toMatch(/Crafting/);
  });

  it('paintCraftCastProgress updates fill without wiping the tree', () => {
    const el = document.createElement('div');
    const start = buildCraftCastSession({
      castingAbility: CRAFT_CAST_ID,
      castRemaining: 1.75,
      castTotal: 1.75,
      craftCastRecipeId: 'recipe_test_stew',
    });
    renderCraftingWindow(el, craftableView(), deps(), undefined, new Map(), start);
    const bodyBefore = el.querySelector('.crafting-body');
    const mid = buildCraftCastSession({
      castingAbility: CRAFT_CAST_ID,
      castRemaining: 0.875,
      castTotal: 1.75,
      craftCastRecipeId: 'recipe_test_stew',
    });
    paintCraftCastProgress(el, mid);
    expect(el.querySelector('.crafting-body')).toBe(bodyBefore);
    expect(el.querySelector<HTMLElement>('.crafting-cast-progress-fill')!.style.width).toBe(
      '50.0%',
    );
    paintCraftCastProgress(el, IDLE_CRAFT_CAST_SESSION);
    expect(el.querySelector<HTMLElement>('.crafting-cast-progress')!.hidden).toBe(true);
  });

  it('setCraftCastLiveMessage writes the polite region', () => {
    const el = document.createElement('div');
    renderCraftingWindow(el, craftableView(), deps());
    setCraftCastLiveMessage(el, 'Finished crafting stew');
    expect(el.querySelector('.crafting-live')!.textContent).toBe('Finished crafting stew');
  });

  it('duration is present in the accessible name (fairness: not color-only)', () => {
    const el = document.createElement('div');
    renderCraftingWindow(el, craftableView(), deps());
    const aria = el.querySelector('.crafting-recipe-btn')!.getAttribute('aria-label') ?? '';
    expect(aria).toMatch(/1\.75/);
    expect(aria.toLowerCase()).toMatch(/cast/);
  });

  it('Create click sends the row qty; Create All sends mats-fit', () => {
    const el = document.createElement('div');
    const d = deps(2);
    renderCraftingWindow(el, craftableView(), d);
    el.querySelector<HTMLButtonElement>('.crafting-recipe-btn')!.click();
    expect(d.onCraft).toHaveBeenCalledWith('recipe_test_stew', 2);
    d.onCraft.mockClear();
    el.querySelector<HTMLButtonElement>('.crafting-create-all-btn')!.click();
    // craftableView holds 2 copper_ore for a 1-cost recipe.
    expect(d.onCraft).toHaveBeenCalledWith('recipe_test_stew', 2);
  });

  it('disables qty stepper while casting and shows batch remaining', () => {
    const el = document.createElement('div');
    const session = buildCraftCastSession({
      castingAbility: CRAFT_CAST_ID,
      castRemaining: 1,
      castTotal: 2,
      craftCastRecipeId: 'recipe_test_stew',
      craftCastBatchRemaining: 2,
      craftCastBatchTotal: 3,
    });
    renderCraftingWindow(el, craftableView(), deps(), undefined, new Map(), session);
    const dec = el.querySelector<HTMLButtonElement>('[data-focus-key^="qty-dec:"]');
    const inc = el.querySelector<HTMLButtonElement>('[data-focus-key^="qty-inc:"]');
    expect(dec!.disabled).toBe(true);
    expect(inc!.disabled).toBe(true);
    const batch = el.querySelector<HTMLElement>('.crafting-cast-progress-batch');
    expect(batch!.hidden).toBe(false);
    expect(batch!.textContent).toMatch(/2/);
    expect(batch!.textContent).toMatch(/3/);
  });
});
