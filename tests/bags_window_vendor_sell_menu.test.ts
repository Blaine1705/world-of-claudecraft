// @vitest-environment happy-dom
// The vendor right-click "Sell all (N)" menu row (new-player-first-hour doc,
// section 6): drives the REAL BagsWindow against a jsdom container (the
// bags_window_use_routing.test.ts fixture idiom) and pins the wiring the pure
// bag_item_context_menu.test.ts core cannot reach on its own: a plain
// right-click at an open vendor opens the item menu with every copy of the
// clicked item held across the bags, Ctrl/Meta right-click keeps its existing
// instant split-stack-sell shortcut untouched, and an item the vendor refuses
// (noVendorSell) never grows a sell affordance the sim would refuse.
import { describe, expect, it } from 'vitest';
import type { InvSlot } from '../src/sim/types';
import { BagsWindow, type BagsWindowDeps } from '../src/ui/bags_window';
import { ItemDragState } from '../src/ui/item_drag_state';
import type { IWorld } from '../src/world_api';

interface MenuCall {
  itemId: string;
  vendorSellCount: number | undefined;
}

function harness(
  inventory: InvSlot[],
  sellItem: (itemId: string, count?: number) => void = () => {},
): { root: HTMLElement; menuCalls: MenuCall[] } {
  const menuCalls: MenuCall[] = [];
  const world = {
    inventory,
    bags: [null, null, null, null],
    bagCapacity: 16,
    copper: 0,
    sellItem,
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
    vendorOpen: () => true,
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
    openItemActionMenu: (
      _def,
      itemId,
      _slotIndex,
      _x,
      _y,
      _runDefault,
      _instance,
      vendorSellCount,
    ) => {
      menuCalls.push({ itemId, vendorSellCount });
    },
  };
  new BagsWindow(deps).render();
  return { root, menuCalls };
}

function rightClickFirstCell(root: HTMLElement, modifiers: { ctrlKey?: boolean } = {}): void {
  const cell = root.querySelector('button.bag-item');
  expect(cell).not.toBeNull();
  cell?.dispatchEvent(
    new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...modifiers }),
  );
}

describe('bags_window vendor right-click menu (Sell all)', () => {
  it('plain right-click opens the item menu with every copy of the item held across the bags', () => {
    const { root, menuCalls } = harness([
      { itemId: 'baked_bread', count: 5 },
      { itemId: 'baked_bread', count: 3 },
    ]);
    rightClickFirstCell(root);
    expect(menuCalls).toEqual([{ itemId: 'baked_bread', vendorSellCount: 8 }]);
  });

  it('a single held copy still opens the menu (Sell all only appears above 1, in the pure core)', () => {
    const { root, menuCalls } = harness([{ itemId: 'baked_bread', count: 1 }]);
    rightClickFirstCell(root);
    expect(menuCalls).toEqual([{ itemId: 'baked_bread', vendorSellCount: 1 }]);
  });

  it('an item the vendor refuses (noVendorSell) never opens the menu on a plain right-click', () => {
    const { root, menuCalls } = harness([{ itemId: 'reins_valorsteed', count: 1 }]);
    rightClickFirstCell(root);
    expect(menuCalls).toEqual([]);
  });

  it('Ctrl+right-click keeps its direct split-stack sell shortcut, not the menu', () => {
    const sold: Array<[string, number | undefined]> = [];
    const { root, menuCalls } = harness([{ itemId: 'baked_bread', count: 5 }], (itemId, count) =>
      sold.push([itemId, count]),
    );
    rightClickFirstCell(root, { ctrlKey: true });
    expect(menuCalls).toEqual([]);
    expect(sold).toEqual([['baked_bread', 5]]);
  });
});
