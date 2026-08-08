// @vitest-environment happy-dom
// The bags Sort button (the one-shot clean-up): drives the REAL BagsWindow
// against a jsdom container (the bags_window_use_routing.test.ts fixture
// idiom) and pins the press contract: exactly one world.sortInventory
// dispatch, the filter/search/view reset back to the pristine cells, and the
// one-shot settle ripple that plays only once the painted grid CONTENT
// changes (online the press repaints the still-unsorted mirror first; the
// tidied grid lands with the heavy self snapshot).
import { describe, expect, it } from 'vitest';
import type { InvSlot } from '../src/sim/types';
import { BagsWindow, type BagsWindowDeps } from '../src/ui/bags_window';
import { ItemDragState } from '../src/ui/item_drag_state';
import type { IWorld } from '../src/world_api';

function harness(inventory: InvSlot[]): {
  root: HTMLElement;
  window: BagsWindow;
  world: { inventory: InvSlot[] };
  sortCalls: number[];
} {
  const sortCalls: number[] = [];
  const world = {
    inventory,
    bags: [null, null, null, null],
    bagCapacity: 16,
    copper: 0,
    sortInventory: () => {
      sortCalls.push(1);
    },
  } as unknown as IWorld & { inventory: InvSlot[] };
  const root = document.createElement('div');
  document.body.appendChild(root);
  const noop = (): void => {};
  const deps: BagsWindowDeps = {
    itemIcon: () => '<span class="item-icon"></span>',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: noop,
    root: () => root,
    world: () => world,
    wocBalanceHtml: () => '',
    claudiumLauncherHtml: () => '',
    openClaudium: noop,
    openWallet: noop,
    hideTooltip: noop,
    consumePeek: () => false,
    cancelPetFeed: noop,
    captureFocus: () => null,
    restoreFocus: noop,
    renderCharIfOpen: noop,
    vendorOpen: () => false,
    tradeOpen: () => false,
    isMarketSell: () => false,
    isMailAttach: () => false,
    isBankOpen: () => false,
    isPersonalBankTab: () => false,
    isGuildBankTab: () => false,
    pendingPetFeed: () => false,
    closeVendor: noop,
    closeBank: noop,
    onClosed: noop,
    addItemToTrade: noop,
    stageMarketSell: noop,
    stageMailParcel: noop,
    insertItemChatLink: noop,
    showError: noop,
    setPendingPetFeed: noop,
    resetPetBarSig: noop,
    isHotbarItemId: () => false,
    useGatherTool: () => false,
    setDragAction: noop,
    clearActionDropTargets: noop,
    dragState: new ItemDragState(),
    isTouchHud: () => false,
    markEquipDropTargets: noop,
    dropOnEquipSlot: noop,
    dropOnActionSlot: noop,
    dropOnActionRingSlot: noop,
    openItemActionMenu: noop,
  };
  const window = new BagsWindow(deps);
  window.render();
  return { root, window, world, sortCalls };
}

const INV: InvSlot[] = [
  { itemId: 'baked_bread', count: 2 },
  { itemId: 'worn_sword', count: 1 },
  { itemId: 'baked_bread', count: 3 },
];

function clickSort(root: HTMLElement): void {
  const btn = root.querySelector('button.bag-sort-btn');
  expect(btn).not.toBeNull();
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('bags sort button', () => {
  it('renders in the tools row with a focus key and an accessible name', () => {
    const { root } = harness([...INV]);
    const btn = root.querySelector('button.bag-sort-btn') as HTMLElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.dataset.focusKey).toBe('bag-sort-btn');
    expect(btn?.getAttribute('aria-label')).toBeTruthy();
    expect(btn?.closest('.bag-tools')).not.toBeNull();
  });

  it('dispatches exactly one world.sortInventory per press', () => {
    const { root, sortCalls } = harness([...INV]);
    clickSort(root);
    expect(sortCalls).toHaveLength(1);
  });

  it('resets an active category/sort/search view back to the pristine cells', () => {
    const { root } = harness([...INV]);
    // Arm a derived view: pick the quality sort from the dropdown.
    const select = root.querySelector('select.bag-sort') as HTMLSelectElement;
    select.value = 'quality';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect((root.querySelector('select.bag-sort') as HTMLSelectElement).value).toBe('quality');
    clickSort(root);
    // Back to the manual view: the dropdown reads recent and the grid paints
    // real cells again (data-bag-index only exists in the manual view).
    expect((root.querySelector('select.bag-sort') as HTMLSelectElement).value).toBe('recent');
    expect(root.querySelector('button.bag-item[data-bag-index]')).not.toBeNull();
  });

  it('plays the settle ripple only once the painted content changes', () => {
    const { root, window, world } = harness([...INV]);
    // The press itself repaints an UNCHANGED grid (the online mirror has not
    // heard back yet): no ripple.
    clickSort(root);
    expect(root.querySelector('.bag-grid-settle')).toBeNull();
    // The snapshot lands: the sorted content arrives and the next paint
    // ripples, with the stagger index stamped per square.
    world.inventory[0] = { itemId: 'baked_bread', count: 5, slot: 1 };
    world.inventory[1] = { itemId: 'worn_sword', count: 1, slot: 0 };
    world.inventory.splice(2, 1);
    window.render();
    const grid = root.querySelector('.bag-grid-settle');
    expect(grid).not.toBeNull();
    const first = grid?.children[0] as HTMLElement;
    expect(first?.style.getPropertyValue('--settle-i')).toBe('0');
    // A later ordinary repaint does not ripple again (one-shot).
    window.render();
    expect(root.querySelector('.bag-grid-settle')).toBeNull();
  });
});
