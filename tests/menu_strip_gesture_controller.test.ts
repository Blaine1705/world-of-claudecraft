// @vitest-environment happy-dom
// Pointer-level regressions for the menu control's gesture layer, the third of
// the touch HUD's gesture twins. The RULES have their own suite
// (menu_strip_core.test.ts); this covers what only a DOM can show: the release
// backstop for a gesture the anchor never sees, the clamp box the row is laid out
// against, the tap-versus-swipe split at the anchor, and the sticky path Phase 6
// promotes to tap mode.

import { beforeEach, describe, expect, it } from 'vitest';
import { MENU_STRIP_COUNT } from '../src/ui/hud/menu/menu_strip_core';
import {
  MenuStripGesture,
  type MenuStripGestureDeps,
} from '../src/ui/hud/menu/menu_strip_gesture_controller';

const ANCHOR_SIZE_PX = 40;
/** Past STRIP_DEADZONE_PX (22), so a move commits to an item and pulls the row up
 *  without waiting out the reveal timer. */
const SWIPE_PX = 30;
const ANCHOR_X = 60;

interface Rig {
  anchor: HTMLButtonElement;
  items: HTMLButtonElement[];
  cancel: HTMLButtonElement;
  gesture: MenuStripGesture;
  picks: number[];
  defaults: number;
  cancels: number;
  repaints: number;
  /** settings.touchTapMenus, flipped per test. */
  tapMenus: boolean;
}

function makeRig(options: { appVw?: string; safeAreaPx?: string; tapMenus?: boolean } = {}): Rig {
  const host = document.createElement('div');
  host.style.setProperty('--strip-gap', '8px');
  host.style.setProperty('--strip-margin', '6px');
  host.style.setProperty('--app-vw', options.appVw ?? '520px');
  for (const side of ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']) {
    host.style.setProperty(side, options.safeAreaPx ?? '0px');
  }
  document.body.append(host);

  const anchor = document.createElement('button');
  anchor.type = 'button';
  document.body.append(anchor);
  anchor.getBoundingClientRect = () =>
    ({
      x: ANCHOR_X,
      y: 300,
      left: ANCHOR_X,
      top: 300,
      width: ANCHOR_SIZE_PX,
      height: ANCHOR_SIZE_PX,
      right: ANCHOR_X + ANCHOR_SIZE_PX,
      bottom: 300 + ANCHOR_SIZE_PX,
    }) as DOMRect;

  const items = Array.from({ length: MENU_STRIP_COUNT }, () => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.tabIndex = -1;
    document.body.append(btn);
    return btn;
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.tabIndex = -1;
  document.body.append(cancel);

  const rig: Rig = {
    anchor,
    items,
    cancel,
    picks: [],
    defaults: 0,
    cancels: 0,
    repaints: 0,
    tapMenus: options.tapMenus ?? false,
    gesture: null as unknown as MenuStripGesture,
  };
  const deps: MenuStripGestureDeps = {
    anchor,
    metricsHost: host,
    items,
    cancel,
    tapMenus: () => rig.tapMenus,
    pick: (index) => rig.picks.push(index),
    runDefault: () => {
      rig.defaults++;
    },
    onCancel: () => {
      rig.cancels++;
    },
    repaint: () => {
      rig.repaints++;
    },
  };
  rig.gesture = new MenuStripGesture(deps);
  rig.gesture.attach();
  return rig;
}

function pointer(type: string, pointerId: number, clientX: number): MouseEvent {
  return Object.assign(new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 320 }), {
    pointerId,
    pointerType: 'touch',
  });
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('MenuStripGesture: the release rules through real pointers', () => {
  it('runs the default action on a tap and opens nothing', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointerup', 1, 100));
    expect(rig.defaults).toBe(1);
    expect(rig.picks).toEqual([]);
    expect(rig.gesture.isOpen()).toBe(false);
  });

  it('picks the item a rightward swipe lands on', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    expect(rig.gesture.isOpen()).toBe(true);
    rig.anchor.dispatchEvent(pointer('pointerup', 1, 100 + SWIPE_PX));
    expect(rig.picks).toEqual([0]);
    expect(rig.defaults).toBe(0);
  });

  it('cancels when the finger comes back to the anchor with the row open', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    rig.anchor.dispatchEvent(pointer('pointermove', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointerup', 1, 100));
    expect(rig.cancels).toBe(1);
    expect(rig.picks).toEqual([]);
    expect(rig.defaults).toBe(0);
  });

  it('ignores a LEFTWARD drag: the row only grows one way', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointermove', 1, 100 - SWIPE_PX * 3));
    expect(rig.gesture.isOpen()).toBe(false);
    rig.anchor.dispatchEvent(pointer('pointerup', 1, 100 - SWIPE_PX * 3));
    expect(rig.defaults).toBe(1);
  });
});

describe('MenuStripGesture: the window release backstop', () => {
  it('drops a drag whose release never reaches the anchor', () => {
    const rig = makeRig();
    rig.anchor.setPointerCapture = () => {
      throw new Error('no capture for a synthetic pointer id');
    };
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    expect(rig.gesture.isOpen()).toBe(true);

    window.dispatchEvent(Object.assign(new MouseEvent('pointerup'), { pointerId: 1 }));
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.gesture.openState()).toBeNull();
    // Dropping is not resolving: a release the gesture never saw opens nothing.
    expect(rig.picks).toEqual([]);
    expect(rig.defaults).toBe(0);

    // And the control is alive again, rather than dead under a painted row.
    rig.anchor.dispatchEvent(pointer('pointerdown', 2, 100));
    rig.anchor.dispatchEvent(pointer('pointerup', 2, 100));
    expect(rig.defaults).toBe(1);
  });

  it('leaves an ordinary release to the anchor, which resolves it first', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    // Bubbles to window, so the backstop runs on the same event and must find
    // nothing left to drop rather than eating the default action.
    rig.anchor.dispatchEvent(pointer('pointerup', 1, 100));
    expect(rig.defaults).toBe(1);
  });

  it('ignores a stray window release for a pointer it never armed', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    window.dispatchEvent(Object.assign(new MouseEvent('pointerup'), { pointerId: 9 }));
    expect(rig.gesture.isOpen()).toBe(true);
  });

  it('ignores a second pointer while one drag owns the control', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    rig.anchor.dispatchEvent(pointer('pointermove', 2, 100 + SWIPE_PX * 6));
    expect(rig.gesture.openState()?.live).toBe(0);
  });
});

describe('MenuStripGesture: the clamp box', () => {
  it('clamps the row against the shared --app-vw box, not the window', () => {
    const rig = makeRig({ appVw: '520px' });
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    const open = rig.gesture.openState();
    // itemSize 40 + gap 8 = pitch 48 from an anchor centre at 80, so the ninth
    // item's right edge lands at 512 + 20 = 532 and the 520px app box shifts the
    // whole row 18px left. happy-dom's 1024px window would not have clamped.
    expect(window.innerWidth).toBeGreaterThan(520);
    expect(open?.placement.clamped).toBe(true);
    expect(open?.viewportWidth).toBe(520);
    expect(open?.placement.centers[0]).toBe(110);
  });

  it('widens the edge margin to the safe area the overlay carries as padding', () => {
    const rig = makeRig({ appVw: '520px', safeAreaPx: '30px' });
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    const open = rig.gesture.openState();
    expect(open?.margin).toBe(30);
    // margin becomes max(6, 30) = 30, so the same row shifts 42px instead of 18.
    expect(open?.placement.centers[0]).toBe(86);
  });

  it('anchors the row on the measured centre of the control itself', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    const open = rig.gesture.openState();
    expect(open?.anchorX).toBe(ANCHOR_X + ANCHOR_SIZE_PX / 2);
    expect(open?.anchorY).toBe(300 + ANCHOR_SIZE_PX / 2);
    expect(open?.cancelLive).toBe(false);
  });
});

describe('MenuStripGesture: the sticky path Phase 6 promotes', () => {
  it('opens a focusable menu of real buttons on an assistive activation', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rig.gesture.isOpen()).toBe(true);
    for (const btn of rig.items) expect(btn.tabIndex).toBe(0);
    expect(rig.cancel.tabIndex).toBe(0);
    // Chosen by focus, not by travel, so nothing is live and the X is not either.
    expect(rig.gesture.openState()?.live).toBe(-1);
    expect(rig.gesture.openState()?.cancelLive).toBe(false);
  });

  it('picks from an item click and closes the menu again', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rig.items[4].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rig.picks).toEqual([4]);
    expect(rig.gesture.isOpen()).toBe(false);
    for (const btn of rig.items) expect(btn.tabIndex).toBe(-1);
  });

  it('backs out of the sticky menu through the cancel target', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rig.cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rig.cancels).toBe(1);
    expect(rig.picks).toEqual([]);
    expect(rig.gesture.isOpen()).toBe(false);
  });

  it('does not mistake the click a resolved gesture leaves behind for an activation', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointerup', 1, 100));
    rig.anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.defaults).toBe(1);
  });

  it('ignores an item click while the menu is closed, so the row is inert', () => {
    const rig = makeRig();
    rig.items[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rig.picks).toEqual([]);
  });
});

// The touchTapMenus setting: the same sticky path VoiceOver already used, now a
// player option. The RULES are tap_menu_core.ts's (its own suite); what is pinned
// here is that the anchor's pointer path routes to them and arms no drag.
describe('MenuStripGesture: tap mode', () => {
  it('opens the row on a press and runs NO default action', () => {
    const rig = makeRig({ tapMenus: true });
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    expect(rig.defaults).toBe(0);
    expect(rig.picks).toEqual([]);
    expect(rig.gesture.isOpen()).toBe(true);
    // No drag armed, so the release resolves nothing and the row stays up.
    rig.anchor.dispatchEvent(pointer('pointerup', 1, 100));
    expect(rig.defaults).toBe(0);
    expect(rig.gesture.isOpen()).toBe(true);
    expect(rig.gesture.liveIndex()).toBe(-1);
    expect(rig.items.every((btn) => btn.tabIndex === 0)).toBe(true);
  });

  it('opens the item that is tapped, then closes', () => {
    const rig = makeRig({ tapMenus: true });
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.items[4].click();
    expect(rig.picks).toEqual([4]);
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.items.every((btn) => btn.tabIndex === -1)).toBe(true);
  });

  it('runs the default action when the anchor is pressed again', () => {
    const rig = makeRig({ tapMenus: true });
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointerup', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointerdown', 2, 100));
    expect(rig.defaults).toBe(1);
    expect(rig.picks).toEqual([]);
    expect(rig.gesture.isOpen()).toBe(false);
  });

  it('dismisses on a press outside the row, opening nothing', () => {
    const rig = makeRig({ tapMenus: true });
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    expect(rig.gesture.isOpen()).toBe(true);

    const elsewhere = document.createElement('div');
    document.body.append(elsewhere);
    elsewhere.dispatchEvent(pointer('pointerdown', 2, 40));
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.picks).toEqual([]);
    expect(rig.defaults).toBe(0);
    expect(rig.cancels).toBe(1);
  });

  it('with the setting OFF the swipe still picks and a tap still runs the default', () => {
    const rig = makeRig();
    rig.anchor.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.anchor.dispatchEvent(pointer('pointerup', 1, 100));
    expect(rig.defaults).toBe(1);

    rig.anchor.dispatchEvent(pointer('pointerdown', 2, 100));
    rig.anchor.dispatchEvent(pointer('pointermove', 2, 100 + SWIPE_PX));
    rig.anchor.dispatchEvent(pointer('pointerup', 2, 100 + SWIPE_PX));
    expect(rig.picks).toEqual([0]);
  });
});
