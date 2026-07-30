// @vitest-environment jsdom
//
// The bags focus-restore ladder (the phase 13 QA hand-off): the window
// rebuilds whole on the same onInventoryChanged hook the vendor does and
// used to drop keyboard focus to <body> every time a stack changed. Drives
// the REAL BagsWindow (the bags_window_use_routing harness idiom): exact
// identity first, then the same grid slot walking outward, then Close.

import { describe, expect, it } from 'vitest';
import type { InvSlot } from '../src/sim/types';
import { BagsWindow, type BagsWindowDeps } from '../src/ui/bags_window';
import { ItemDragState } from '../src/ui/item_drag_state';
import type { IWorld } from '../src/world_api';

function harness(inventory: InvSlot[]): { root: HTMLElement; w: BagsWindow; inv: InvSlot[] } {
  const world = {
    inventory,
    bags: [null, null, null, null],
    bagCapacity: 16,
    copper: 0,
    useItem: () => {},
  } as unknown as IWorld;
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
  const w = new BagsWindow(deps);
  w.render();
  return { root, w, inv: inventory };
}

function focusRow(root: HTMLElement, key: string): void {
  const rows = [...root.querySelectorAll<HTMLElement>('[data-focus-key]')];
  const row = rows.find((node) => node.dataset.focusKey === key);
  expect(row, `missing focus key ${key}`).toBeTruthy();
  row?.focus();
  expect(document.activeElement).toBe(row);
}

function activeKey(): string | undefined {
  return (document.activeElement as HTMLElement | null)?.dataset.focusKey;
}

describe('bags window focus restore (the vendor ladder pattern)', () => {
  it('the exact stack keeps focus across a rebuild', () => {
    const { root, w } = harness([
      { itemId: 'wolf_fang', count: 2 },
      { itemId: 'baked_bread', count: 1 },
    ]);
    focusRow(root, 'bag:baked_bread:1');
    w.render();
    expect(activeKey()).toBe('bag:baked_bread:1');
  });

  it('a consumed stack lands the same slot (the next item), never <body>', () => {
    const inv: InvSlot[] = [
      { itemId: 'wolf_fang', count: 1 },
      { itemId: 'baked_bread', count: 1 },
      { itemId: 'wolf_fang', count: 3 },
    ];
    const { root, w } = harness(inv);
    focusRow(root, 'bag:baked_bread:1');
    // The focused stack is consumed (the sim removed it); the rebuild must
    // land the SAME slot, which now holds the next stack.
    inv.splice(1, 1);
    w.render();
    expect(document.activeElement).not.toBe(document.body);
    expect(activeKey()).toBe('bag:wolf_fang:1');
  });

  it('the last stack falls to Close, and non-grid controls restore exactly', () => {
    const inv: InvSlot[] = [{ itemId: 'wolf_fang', count: 1 }];
    const { root, w } = harness(inv);
    focusRow(root, 'bag:wolf_fang:0');
    inv.length = 0;
    w.render();
    expect(activeKey()).toBe('close');
    // A non-grid control (the close button itself) restores by identity too.
    w.render();
    expect(activeKey()).toBe('close');
  });
});
