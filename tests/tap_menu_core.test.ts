// The shared tap-mode decision core: the one table the action radial, the
// consumables row and the menu strip all ask, so tap mode cannot mean three
// different things. Node-only, no DOM (UI_PURE_CORES).
//
// Both settings states are covered for every target, because the whole promise of
// the setting is that turning it OFF leaves the gesture layer exactly as it was.

import { describe, expect, it } from 'vitest';
import { resolveTapMenuPress } from '../src/ui/hud/tap_menu_core';

describe('resolveTapMenuPress: tap mode ON', () => {
  it('opens the menu on the first press of the control, casting nothing', () => {
    expect(resolveTapMenuPress({ tapMenus: true, open: false, target: 'anchor' })).toEqual({
      kind: 'open',
    });
  });

  it('runs the default action when the control is pressed again with the menu open', () => {
    expect(resolveTapMenuPress({ tapMenus: true, open: true, target: 'anchor' })).toEqual({
      kind: 'default',
    });
  });

  it('chooses the item that was pressed, carrying its row position', () => {
    expect(resolveTapMenuPress({ tapMenus: true, open: true, target: 'item', index: 3 })).toEqual({
      kind: 'choose',
      index: 3,
    });
  });

  it('dismisses on a press outside the open menu', () => {
    expect(resolveTapMenuPress({ tapMenus: true, open: true, target: 'outside' })).toEqual({
      kind: 'dismiss',
    });
  });

  it('does nothing for an item or an outside press while the menu is closed', () => {
    // Neither can happen through the UI (a closed row paints nothing and arms no
    // outside listener), so the answer is silence rather than a stray cast.
    expect(resolveTapMenuPress({ tapMenus: true, open: false, target: 'item', index: 0 })).toEqual({
      kind: 'none',
    });
    expect(resolveTapMenuPress({ tapMenus: true, open: false, target: 'outside' })).toEqual({
      kind: 'none',
    });
  });

  it('does not choose an item with no row position', () => {
    expect(resolveTapMenuPress({ tapMenus: true, open: true, target: 'item' })).toEqual({
      kind: 'none',
    });
  });
});

describe('resolveTapMenuPress: tap mode OFF', () => {
  it('hands every press of the control to the gesture layer, open or not', () => {
    // Including while a menu IS open: that is the assistive path, where the
    // gesture layer's own guard already ignores the press. Answering 'default'
    // there would change what the setting being off does.
    expect(resolveTapMenuPress({ tapMenus: false, open: false, target: 'anchor' })).toEqual({
      kind: 'gesture',
    });
    expect(resolveTapMenuPress({ tapMenus: false, open: true, target: 'anchor' })).toEqual({
      kind: 'gesture',
    });
  });

  it('still chooses an item of a menu opened by assistive activation', () => {
    expect(resolveTapMenuPress({ tapMenus: false, open: true, target: 'item', index: 1 })).toEqual({
      kind: 'choose',
      index: 1,
    });
  });

  it('never dismisses on an outside press, which only tap mode listens for', () => {
    expect(resolveTapMenuPress({ tapMenus: false, open: true, target: 'outside' })).toEqual({
      kind: 'none',
    });
  });
});
