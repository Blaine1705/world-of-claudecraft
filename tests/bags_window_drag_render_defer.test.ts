// @vitest-environment happy-dom
// Bag-drag render-tear defect: a native HTML5 drag started on a bag row loses its
// dragend when the row it started on is destroyed mid-drag by a full grid rebuild
// (ANY inventory change while bags is open runs BagsWindow.render(), an innerHTML
// wipe of the whole window). Browsers never fire dragend on a source node that has
// left the document, so ItemDragState and Hud.dragAction (both cleared only from
// dragend / the touch drag's onEnd) are then stuck for the rest of the session:
// every later drag onto the action bar or a bag cell reads that STALE drag instead
// of the live one and silently refuses to accept the drop. That is the reported
// bug ("action bar and items stop being draggable, only a full reload fixes it"):
// the longer a session runs, the more inventory-changing events (loot, a vendor
// buy, a gather tick, regen) land while some bag drag happens to be in flight, so
// it is inevitable given enough playtime and never self-heals.
//
// The fix: render() defers its rebuild while ItemDragState reports an active drag,
// and the dragged row's own end-of-drag handler (dragend, or the touch drag's
// onEnd) flushes the deferred rebuild once the drag concludes. The row therefore
// always survives long enough to fire its own dragend normally, and the shared
// drag state clears the way it always should.

import { describe, expect, it } from 'vitest';
import type { InvSlot } from '../src/sim/types';
import { BagsWindow, type BagsWindowDeps } from '../src/ui/bags_window';
import { ItemDragState } from '../src/ui/item_drag_state';
import type { IWorld } from '../src/world_api';

const SWORD: InvSlot = { itemId: 'worn_sword', count: 1 };
const POTION: InvSlot = { itemId: 'healing_potion', count: 3 };

function harness() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  let inventory: InvSlot[] = [SWORD];
  const dragState = new ItemDragState();
  const noop = (): void => {};
  const deps: BagsWindowDeps = {
    itemIcon: () => '<span class="item-icon"></span>',
    moneyHtml: () => '',
    itemTooltip: () => '',
    attachTooltip: noop,
    root: () => root,
    world: () =>
      ({
        inventory,
        bags: [null, null, null, null],
        bagCapacity: 16,
        copper: 0,
      }) as unknown as IWorld,
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
    dragState,
    isTouchHud: () => false,
    markEquipDropTargets: noop,
    dropOnEquipSlot: noop,
    dropOnActionSlot: noop,
    dropOnActionRingSlot: noop,
    openItemActionMenu: noop,
  };
  return {
    window: new BagsWindow(deps),
    dragState,
    root,
    setInventory: (next: InvSlot[]) => {
      inventory = next;
    },
    gridEl: () => root.querySelector('.bag-grid'),
    itemKeys: () =>
      [...root.querySelectorAll<HTMLElement>('.bag-grid [data-focus-key^="bag:"]')]
        .map((el) => el.dataset.focusKey)
        .sort(),
  };
}

describe('BagsWindow.render defers a rebuild that would tear out a live drag', () => {
  it('does not rebuild the grid while a bag row is mid-drag', () => {
    const h = harness();
    h.window.render();
    const gridBefore = h.gridEl();
    expect(h.itemKeys()).toEqual(['bag:worn_sword:0']);

    // The player has the sword picked up (dragstart already ran dragState.begin()).
    h.dragState.begin({ itemId: 'worn_sword', count: 1, index: 0 });

    // Loot lands mid-drag: the common case (a kill, a gather tick, a vendor
    // transaction, mob regen). Un-guarded, this would innerHTML-wipe the window
    // and destroy the dragged row before it can fire dragend.
    h.setInventory([SWORD, POTION]);
    h.window.render();

    // Deferred: the SAME grid node, the SAME stale content. Nothing was torn down.
    expect(h.gridEl()).toBe(gridBefore);
    expect(h.itemKeys()).toEqual(['bag:worn_sword:0']);
  });

  it("flushes the deferred rebuild once the dragged row's own dragend fires", () => {
    const h = harness();
    h.window.render();
    h.dragState.begin({ itemId: 'worn_sword', count: 1, index: 0 });
    h.setInventory([SWORD, POTION]);
    h.window.render(); // deferred; the sword row survives

    const row = h.root.querySelector('[data-focus-key="bag:worn_sword:0"]');
    expect(row).not.toBeNull();

    // The row survived (nothing destroyed it out from under the drag), so the
    // browser fires its dragend normally.
    row?.dispatchEvent(new Event('dragend'));

    // The ordinary dragend cleanup ran (the drag state is no longer stuck)...
    expect(h.dragState.get()).toBeNull();
    // ...and the deferred rebuild caught up to the real inventory.
    expect(h.itemKeys()).toEqual(['bag:healing_potion:0', 'bag:worn_sword:0']);
  });

  it('renders normally with no drag in flight (no regression to the common path)', () => {
    const h = harness();
    h.window.render();
    h.setInventory([SWORD, POTION]);
    h.window.render();
    expect(h.itemKeys()).toEqual(['bag:healing_potion:0', 'bag:worn_sword:0']);
  });
});
