// @vitest-environment happy-dom
// Pointer-level regressions for the radial ring's gesture controller: the DOM
// half that radial_gesture_core.ts owns no part of. The RULES have their own
// suite (radial_gesture_core.test.ts); everything here is about pointer
// bookkeeping, which is where the defects actually were.
//
// Four of them, each pinned below:
//   - one shared drag slot, so a second thumb on a second ring button was
//     dropped entirely (combat is played with two thumbs),
//   - no release path other than the button's own, so a setPointerCapture throw
//     plus a finger that left the button stranded the drag forever,
//   - the petal clamp measured against window.innerWidth/innerHeight while the
//     overlay is sized from the shared --app-vw/--app-vh box, and never widened
//     for the device's safe area,
//   - the shared "this release was a drag" flag consumed before the pointer-id
//     guard, so one thumb's release cleared the flag the other thumb's hold set.

import { beforeEach, describe, expect, it } from 'vitest';
import type { RadialDirection } from '../src/ui/hud/action_bar/radial_action_core';
import {
  RadialGesture,
  type RadialGestureDeps,
} from '../src/ui/hud/action_bar/radial_gesture_controller';
import { closeOpenTouchMenu } from '../src/ui/hud/tap_menu';
import type { TapMenuAnchorRole } from '../src/ui/hud/tap_menu_core';
import { makeWriterFacet } from '../src/ui/painter_host';

const BUTTON_SIZE_PX = 40;
/** The petal order the painter seats and the gesture is handed. */
const PETAL_DIRECTIONS: RadialDirection[] = ['up', 'right', 'down', 'left'];
/** Past FLICK_DEADZONE_PX (22), so a move resolves to a direction and pulls the
 *  petals up without waiting out the reveal timer. */
const FLICK_PX = 30;

interface Rig {
  buttons: HTMLButtonElement[];
  petals: HTMLButtonElement[];
  petalCancel: HTMLButtonElement;
  host: HTMLElement;
  gesture: RadialGesture;
  casts: Array<[number, RadialDirection]>;
  cancels: number;
  suppressed: { value: boolean; takes: number };
  claimed: Set<number>;
  /** settings.touchTapMenus, flipped per test. */
  tapMenus: boolean;
}

function rect(btn: HTMLElement, x: number, y: number): void {
  btn.getBoundingClientRect = () =>
    ({
      x,
      y,
      left: x,
      top: y,
      width: BUTTON_SIZE_PX,
      height: BUTTON_SIZE_PX,
      right: x + BUTTON_SIZE_PX,
      bottom: y + BUTTON_SIZE_PX,
    }) as DOMRect;
}

function makeRig(
  options: {
    appVw?: string;
    appVh?: string;
    safeAreaPx?: string;
    tapMenus?: boolean;
    anchorRole?: TapMenuAnchorRole;
  } = {},
): Rig {
  const host = document.createElement('div');
  host.style.setProperty('--radial-radius-ratio', '1.35');
  host.style.setProperty('--radial-margin', '6px');
  host.style.setProperty('--app-vw', options.appVw ?? '400px');
  host.style.setProperty('--app-vh', options.appVh ?? '300px');
  for (const side of ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']) {
    host.style.setProperty(side, options.safeAreaPx ?? '0px');
  }
  document.body.append(host);

  const buttons = [0, 1].map(() => {
    const btn = document.createElement('button');
    btn.type = 'button';
    document.body.append(btn);
    return btn;
  });
  // Both near the bottom-right corner, which is where the ring actually sits and
  // the only place the edge clamp does anything.
  rect(buttons[0], 360, 180);
  rect(buttons[1], 200, 180);

  // The petal overlay's own buttons, in the order the painter seats them. Tap
  // mode chooses by tapping one, so the gesture needs them; the drag path never
  // touches them.
  const petals = PETAL_DIRECTIONS.map(() => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.tabIndex = -1;
    document.body.append(btn);
    return btn;
  });
  const petalCancel = document.createElement('button');
  petalCancel.type = 'button';
  petalCancel.tabIndex = -1;
  document.body.append(petalCancel);

  const rig: Rig = {
    buttons,
    petals,
    petalCancel,
    host,
    casts: [],
    cancels: 0,
    suppressed: { value: false, takes: 0 },
    claimed: new Set<number>(),
    tapMenus: options.tapMenus ?? false,
    gesture: null as unknown as RadialGesture,
  };
  const deps: RadialGestureDeps = {
    buttons,
    writers: makeWriterFacet(
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      () => {},
      () => {},
    ),
    tapMenus: () => rig.tapMenus,
    anchorRole: options.anchorRole,
    metricsHost: host,
    hasSlot: () => true,
    cast: (buttonIndex, direction) => rig.casts.push([buttonIndex, direction]),
    pressClaimed: (buttonIndex) => rig.claimed.has(buttonIndex),
    takeSuppressedPress: () => {
      rig.suppressed.takes++;
      const was = rig.suppressed.value;
      rig.suppressed.value = false;
      return was;
    },
    onCancel: () => {
      rig.cancels++;
    },
  };
  rig.gesture = new RadialGesture(deps);
  rig.gesture.attach();
  rig.gesture.attachPetals(
    PETAL_DIRECTIONS.map((direction, i) => ({ direction, el: petals[i] })),
    petalCancel,
  );
  return rig;
}

function pointer(type: string, pointerId: number, clientX: number, clientY: number): MouseEvent {
  return Object.assign(new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY }), {
    pointerId,
    pointerType: 'touch',
  });
}

function down(rig: Rig, button: number, pointerId: number, x = 0, y = 0): void {
  rig.buttons[button].dispatchEvent(pointer('pointerdown', pointerId, x, y));
}

function move(rig: Rig, button: number, pointerId: number, x: number, y = 0): void {
  rig.buttons[button].dispatchEvent(pointer('pointermove', pointerId, x, y));
}

function up(rig: Rig, button: number, pointerId: number, x = 0, y = 0): void {
  rig.buttons[button].dispatchEvent(pointer('pointerup', pointerId, x, y));
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('RadialGesture: two thumbs, two ring buttons', () => {
  it('casts BOTH presses when a second ring button is pressed under the first', () => {
    const rig = makeRig();
    down(rig, 0, 1);
    down(rig, 1, 2);
    up(rig, 0, 1);
    up(rig, 1, 2);
    // One shared drag slot dropped the second press entirely: onDown returned
    // early while any drag was live, so the second thumb cast nothing.
    expect(rig.casts).toEqual([
      [0, 'center'],
      [1, 'center'],
    ]);
  });

  it('keeps each press on its own start point, so one thumb never flicks for the other', () => {
    const rig = makeRig();
    down(rig, 0, 1, 100, 100);
    down(rig, 1, 2, 300, 100);
    // Pointer 2 flicks right from ITS start; pointer 1 never moved.
    move(rig, 1, 2, 300 + FLICK_PX, 100);
    up(rig, 1, 2, 300 + FLICK_PX, 100);
    up(rig, 0, 1, 100, 100);
    expect(rig.casts).toEqual([
      [1, 'right'],
      [0, 'center'],
    ]);
  });

  it('opens the petal overlay for the FIRST press only, and the second still casts', () => {
    const rig = makeRig();
    down(rig, 0, 1, 100, 100);
    down(rig, 1, 2, 300, 100);
    // The second thumb flicks first. Two reveals cannot coexist visually, so it
    // resolves its own direction without seating a second overlay.
    move(rig, 1, 2, 300 + FLICK_PX, 100);
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.gesture.heldButtonIndex()).toBe(0);

    move(rig, 0, 1, 100 + FLICK_PX, 100);
    expect(rig.gesture.isOpen()).toBe(true);
    expect(rig.gesture.heldButtonIndex()).toBe(0);
    expect(rig.gesture.liveDirection()).toBe('right');

    up(rig, 1, 2, 300 + FLICK_PX, 100);
    expect(rig.casts).toEqual([[1, 'right']]);
  });
});

describe('RadialGesture: the window release backstop', () => {
  it('drops a drag whose release never reaches the button', () => {
    const rig = makeRig();
    // The exact shape the backstop exists for: capture throws, so the finger
    // leaving the button takes every pointer event with it.
    rig.buttons[0].setPointerCapture = () => {
      throw new Error('no capture for a synthetic pointer id');
    };
    down(rig, 0, 1, 100, 100);
    move(rig, 0, 1, 100 + FLICK_PX, 100);
    expect(rig.gesture.isOpen()).toBe(true);

    window.dispatchEvent(Object.assign(new MouseEvent('pointerup'), { pointerId: 1 }));
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.gesture.heldButtonIndex()).toBe(-1);
    // Dropping is not resolving: a release the gesture never saw must not cast.
    expect(rig.casts).toEqual([]);

    // And the ring is alive again. Before the backstop the stranded drag kept
    // every button dead under a painted overlay.
    down(rig, 1, 2);
    up(rig, 1, 2);
    expect(rig.casts).toEqual([[1, 'center']]);
  });

  it('leaves an ordinary release to the button, which resolves it first', () => {
    const rig = makeRig();
    down(rig, 0, 1);
    // Bubbles to window, so the backstop runs on the same event and must find
    // nothing left to drop rather than eating the cast.
    up(rig, 0, 1);
    expect(rig.casts).toEqual([[0, 'center']]);
  });

  it('drops only the matching pointer, never a neighbour still held', () => {
    const rig = makeRig();
    down(rig, 0, 1);
    down(rig, 1, 2);
    window.dispatchEvent(Object.assign(new MouseEvent('pointercancel'), { pointerId: 1 }));
    up(rig, 1, 2);
    up(rig, 0, 1);
    expect(rig.casts).toEqual([[1, 'center']]);
  });
});

// See tests/mobile_action_ring_painter.test.ts "arms NO rearrange gesture on
// the live ring" for the source-scan half of this pin (the retired
// bindMobileRingDrag / bindMobileActionDrag / mobileHotbarDrag tokens). This
// is the behavioral half: a held drag that reveals the petals and releases
// over where a NEIGHBOUR button sits on screen must still resolve through
// this button's own cast/cancel outcome, never rebind anything. The
// RadialGestureDeps interface exposes no callback that could touch another
// button's slot at all (only cast and onCancel), so this proves the negative
// concretely rather than by interface inspection alone.
describe('RadialGesture: a held drag toward a neighbour never rearranges anything', () => {
  it('resolves through cast/cancel on the PRESSED button, even when the release lands over a neighbour', () => {
    const rig = makeRig();
    // Button 1's rect is seated at (200,180)-(240,220) (see makeRig). Pressing
    // button 0 and dragging into that box is literally what the retired
    // long-press rearrange read as "pick up button 0, drop it on button 1".
    down(rig, 0, 1, 300, 200);
    move(rig, 0, 1, 220, 200); // dx -80, past FLICK_DEADZONE_PX: reveals and resolves 'left'.
    expect(rig.gesture.isOpen()).toBe(true);
    up(rig, 0, 1, 220, 200);

    // The only outcome is a cast of BUTTON 0's own 'left' slot: nothing
    // addresses button 1, because the deps interface has no such callback.
    expect(rig.casts).toEqual([[0, 'left']]);
    expect(rig.cancels).toBe(0);
  });

  it('cancels rather than rebinding when the release lands back on the anchor', () => {
    const rig = makeRig();
    down(rig, 0, 1, 300, 200);
    move(rig, 0, 1, 220, 200);
    move(rig, 0, 1, 300, 200); // back to the anchor with the petals still up.
    expect(rig.gesture.cancelIsLive()).toBe(true);
    up(rig, 0, 1, 300, 200);

    expect(rig.casts).toEqual([]);
    expect(rig.cancels).toBe(1);
  });
});

describe('RadialGesture: the clamp box', () => {
  it('clamps against the shared --app-vw/--app-vh box, not the window', () => {
    const rig = makeRig({ appVw: '400px', appVh: '300px' });
    down(rig, 0, 1, 380, 200);
    move(rig, 0, 1, 380 + FLICK_PX, 200);
    // radius 40 * 1.35 = 54, petalHalf 20, margin 6 -> reach 80. The button
    // centre is 380, so the app box (400 wide) pulls the origin in to 320 while
    // happy-dom's 1024px window would have left it at 380.
    expect(window.innerWidth).toBeGreaterThan(400);
    expect(rig.gesture.placement()?.originX).toBe(320);
    expect(rig.gesture.placement()?.originY).toBe(200);
  });

  it('widens the edge margin to the safe area the overlay carries as padding', () => {
    const rig = makeRig({ appVw: '400px', appVh: '300px', safeAreaPx: '30px' });
    down(rig, 0, 1, 380, 200);
    move(rig, 0, 1, 380 + FLICK_PX, 200);
    // margin becomes max(6, 30) = 30, so reach is 104 and the origin lands at
    // 400 - 104 = 296 instead of the bare-literal 320.
    expect(rig.gesture.placement()?.originX).toBe(296);
  });
});

describe('RadialGesture: the cancel target', () => {
  it('reports the cancel target live only once the petals are up', () => {
    const rig = makeRig();
    down(rig, 0, 1, 100, 100);
    // Centred, but nothing revealed: the centre is still a plain tap.
    expect(rig.gesture.liveDirection()).toBe('center');
    expect(rig.gesture.cancelIsLive()).toBe(false);

    move(rig, 0, 1, 100 + FLICK_PX, 100);
    expect(rig.gesture.cancelIsLive()).toBe(false);
    move(rig, 0, 1, 100, 100);
    expect(rig.gesture.cancelIsLive()).toBe(true);

    up(rig, 0, 1, 100, 100);
    expect(rig.casts).toEqual([]);
    expect(rig.cancels).toBe(1);
  });
});

describe('RadialGesture: the shared suppressed-press flag', () => {
  it('does not let one thumb consume the flag another thumb armed', () => {
    const rig = makeRig();
    // Button 1 is owned by an empowered hold, so the radial never arms on it.
    rig.claimed.add(1);
    down(rig, 0, 1, 100, 100);
    down(rig, 1, 2, 300, 100);
    // The hold resolves and arms the shared flag on its own release.
    rig.suppressed.value = true;
    up(rig, 1, 2, 300, 100);
    expect(rig.suppressed.value).toBe(true);

    up(rig, 0, 1, 100, 100);
    // Consumed by the press it was armed against, which therefore stays silent.
    expect(rig.suppressed.value).toBe(false);
    expect(rig.casts).toEqual([]);
  });

  it('still clears a stale flag on an unowned release while nothing else is held', () => {
    const rig = makeRig();
    rig.claimed.add(1);
    rig.suppressed.value = true;
    up(rig, 1, 2, 300, 100);
    expect(rig.suppressed.value).toBe(false);

    // The next real press casts instead of being swallowed by the leftover flag.
    down(rig, 0, 1);
    up(rig, 0, 1);
    expect(rig.casts).toEqual([[0, 'center']]);
  });
});

// The touchTapMenus setting (WCAG 2.5.1): the 16 directional actions were
// reachable only by a path-based flick, so tap mode promotes the strips' sticky
// path to the radial. Every rule comes from tap_menu_core.ts; what is pinned here
// is the pointer bookkeeping around it.
describe('RadialGesture: tap mode', () => {
  it('opens the petals on a press and casts NOTHING', () => {
    const rig = makeRig({ tapMenus: true });
    down(rig, 0, 1, 100, 100);
    expect(rig.casts).toEqual([]);
    expect(rig.gesture.isOpen()).toBe(true);
    expect(rig.gesture.heldButtonIndex()).toBe(0);
    expect(rig.gesture.placement()).not.toBeNull();
    // Nothing is under a finger, so no petal is highlighted and the centre is not
    // the way out the way it is mid-drag.
    expect(rig.gesture.liveDirection()).toBe('center');
    expect(rig.gesture.cancelIsLive()).toBe(false);
    // The release must not resolve anything either: the menu stays up.
    up(rig, 0, 1, 100, 100);
    expect(rig.casts).toEqual([]);
    expect(rig.gesture.isOpen()).toBe(true);
  });

  it('makes the petals real focusable buttons while open, and inert when closed', () => {
    const rig = makeRig({ tapMenus: true });
    expect(rig.petals.map((p) => p.tabIndex)).toEqual([-1, -1, -1, -1]);
    down(rig, 0, 1, 100, 100);
    expect(rig.petals.map((p) => p.tabIndex)).toEqual([0, 0, 0, 0]);
    expect(rig.petalCancel.tabIndex).toBe(0);
    expect(document.activeElement).toBe(rig.petals[0]);

    rig.gesture.closeSticky();
    expect(rig.petals.map((p) => p.tabIndex)).toEqual([-1, -1, -1, -1]);
    expect(rig.petalCancel.tabIndex).toBe(-1);
  });

  it('casts the direction of the petal that is tapped, then closes', () => {
    const rig = makeRig({ tapMenus: true });
    down(rig, 0, 1, 100, 100);
    rig.petals[1].click();
    expect(rig.casts).toEqual([[0, 'right']]);
    expect(rig.gesture.isOpen()).toBe(false);
  });

  it('casts the centre action when the ring button is tapped again', () => {
    const rig = makeRig({ tapMenus: true });
    down(rig, 0, 1, 100, 100);
    up(rig, 0, 1, 100, 100);
    down(rig, 0, 2, 100, 100);
    expect(rig.casts).toEqual([[0, 'center']]);
    expect(rig.gesture.isOpen()).toBe(false);
  });

  it('dismisses on a press outside the menu, casting nothing', () => {
    const rig = makeRig({ tapMenus: true });
    down(rig, 0, 1, 100, 100);
    // The press that OPENED it must not also dismiss it: the document listener is
    // armed mid-dispatch of that very event, and only a capture listener is
    // guaranteed to have been passed already.
    expect(rig.gesture.isOpen()).toBe(true);

    const elsewhere = document.createElement('div');
    document.body.append(elsewhere);
    elsewhere.dispatchEvent(pointer('pointerdown', 2, 10, 10));
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.casts).toEqual([]);
    expect(rig.cancels).toBe(1);
  });

  it('treats a press on another ring button as opening THAT menu, not an outside tap', () => {
    const rig = makeRig({ tapMenus: true });
    down(rig, 0, 1, 100, 100);
    down(rig, 1, 2, 300, 100);
    expect(rig.gesture.isOpen()).toBe(true);
    expect(rig.gesture.heldButtonIndex()).toBe(1);
    expect(rig.casts).toEqual([]);
    expect(rig.cancels).toBe(0);
  });

  it('leaves an empowered-hold button alone, exactly as the gesture path does', () => {
    const rig = makeRig({ tapMenus: true });
    rig.claimed.add(0);
    down(rig, 0, 1, 100, 100);
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.casts).toEqual([]);
  });

  it('with the setting OFF a petal tap does nothing and the flick still casts', () => {
    const rig = makeRig();
    rig.petals[1].click();
    expect(rig.casts).toEqual([]);
    expect(rig.gesture.isOpen()).toBe(false);

    down(rig, 0, 1, 100, 100);
    move(rig, 0, 1, 100 + FLICK_PX, 100);
    up(rig, 0, 1, 100 + FLICK_PX, 100);
    expect(rig.casts).toEqual([[0, 'right']]);
  });
});

// Escape belongs to Hud's single closeAll dispatcher, which asks the shared
// tap-menu registry rather than knowing any menu by name. Before this the
// tap-mode petals had NO key-driven way out at all.
describe('RadialGesture: the Escape path and the button open state', () => {
  it('closes the tap-mode petals through the shared registry, casting nothing', () => {
    const rig = makeRig({ tapMenus: true });
    down(rig, 0, 1, 100, 100);
    expect(rig.gesture.isOpen()).toBe(true);

    expect(closeOpenTouchMenu()).toBe(true);
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.casts).toEqual([]);
    expect(rig.cancels).toBe(1);
    expect(rig.petals.map((p) => p.tabIndex)).toEqual([-1, -1, -1, -1]);
  });

  it('reports nothing to close while the petals are down', () => {
    const rig = makeRig({ tapMenus: true });
    expect(closeOpenTouchMenu()).toBe(false);
    expect(rig.cancels).toBe(0);
  });

  it('tells assistive tech whether the petals are showing, on the pressed button', () => {
    const rig = makeRig({ tapMenus: true });
    down(rig, 0, 1, 100, 100);
    // The state lands on the BUTTON the petals belong to, which is the control a
    // screen reader is standing on, never on the overlay.
    expect(rig.buttons[0].getAttribute('aria-expanded')).toBe('true');
    expect(rig.buttons[1].getAttribute('aria-expanded')).toBeNull();
    rig.gesture.closeSticky();
    expect(rig.buttons[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('moves the same state on the gesture path, when a hold reveals the petals', () => {
    const rig = makeRig();
    down(rig, 0, 1, 100, 100);
    move(rig, 0, 1, 100 + FLICK_PX, 100);
    expect(rig.buttons[0].getAttribute('aria-expanded')).toBe('true');
    up(rig, 0, 1, 100 + FLICK_PX, 100);
    expect(rig.buttons[0].getAttribute('aria-expanded')).toBe('false');
  });
});

// anchorRole 'toggle': the parameter that lets a control with no action of its
// own (the stance control) reuse this exact gesture layer instead of forking a
// fourth dialect. Every assertion below is about the ROLE, not about stances.
describe("RadialGesture: a 'toggle' anchor with no action of its own", () => {
  it('opens the petals on a bare tap with tap mode OFF, and casts nothing', () => {
    const rig = makeRig({ anchorRole: 'toggle' });
    down(rig, 0, 1, 100, 100);
    up(rig, 0, 1, 100, 100);
    expect(rig.casts).toEqual([]);
    expect(rig.gesture.isOpen()).toBe(true);
    expect(rig.gesture.heldButtonIndex()).toBe(0);
    // The petals become a real focusable menu, exactly as in tap mode.
    expect(rig.petals.map((p) => p.tabIndex)).toEqual([0, 0, 0, 0]);
    expect(rig.buttons[0].getAttribute('aria-expanded')).toBe('true');
  });

  it('closes again on the next press, in either mode', () => {
    for (const tapMenus of [false, true]) {
      document.body.replaceChildren();
      const rig = makeRig({ anchorRole: 'toggle', tapMenus });
      down(rig, 0, 1, 100, 100);
      up(rig, 0, 1, 100, 100);
      expect(rig.gesture.isOpen(), `tapMenus=${tapMenus}`).toBe(true);
      down(rig, 0, 2, 100, 100);
      expect(rig.gesture.isOpen(), `tapMenus=${tapMenus}`).toBe(false);
      expect(rig.casts, `tapMenus=${tapMenus}`).toEqual([]);
      expect(rig.cancels, `tapMenus=${tapMenus}`).toBe(1);
    }
  });

  it('keeps the flick: a swipe past the deadzone still chooses that direction', () => {
    const rig = makeRig({ anchorRole: 'toggle' });
    down(rig, 0, 1, 100, 100);
    move(rig, 0, 1, 100 + FLICK_PX, 100);
    up(rig, 0, 1, 100 + FLICK_PX, 100);
    expect(rig.casts).toEqual([[0, 'right']]);
    expect(rig.gesture.isOpen()).toBe(false);
  });

  it('backs out when the finger returns to the anchor with the petals up', () => {
    const rig = makeRig({ anchorRole: 'toggle' });
    down(rig, 0, 1, 100, 100);
    move(rig, 0, 1, 100 + FLICK_PX, 100);
    move(rig, 0, 1, 100, 100);
    up(rig, 0, 1, 100, 100);
    expect(rig.casts).toEqual([]);
    expect(rig.cancels).toBe(1);
    expect(rig.gesture.isOpen()).toBe(false);
  });

  it('dismisses on a press OUTSIDE the control, with tap mode off too', () => {
    // A bare tap can open this row in either mode, so a row with no tap-driven
    // way out would strand a player who opened it by accident.
    const rig = makeRig({ anchorRole: 'toggle' });
    down(rig, 0, 1, 100, 100);
    up(rig, 0, 1, 100, 100);
    expect(rig.gesture.isOpen()).toBe(true);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.cancels).toBe(1);
  });

  it('an ACTION anchor is untouched: the ring still casts its centre on a tap', () => {
    // The ring passes no role at all, so this is the shipped default arm.
    const rig = makeRig();
    down(rig, 0, 1, 100, 100);
    up(rig, 0, 1, 100, 100);
    expect(rig.casts).toEqual([[0, 'center']]);
    expect(rig.gesture.isOpen()).toBe(false);
    // And with tap mode ON it opens first, then casts the centre on the second
    // press, which is the behaviour that shipped.
    document.body.replaceChildren();
    const tap = makeRig({ tapMenus: true });
    down(tap, 0, 1, 100, 100);
    expect(tap.casts).toEqual([]);
    expect(tap.gesture.isOpen()).toBe(true);
    down(tap, 0, 2, 100, 100);
    expect(tap.casts).toEqual([[0, 'center']]);
  });
});

// The strips' seated-button defect has no twin here: a petal is an overlay
// button nothing else binds, and a tap on one casts through the routing callback
// directly rather than by re-activating the element. This is the pin that it
// stays that way.
describe('RadialGesture: a petal activation casts exactly once', () => {
  it('casts once for a real touchscreen tap on a petal', () => {
    const rig = makeRig({ tapMenus: true });
    down(rig, 0, 1, 100, 100);
    // The touch pointer pair a petal never listens for, then the compatibility
    // click the browser synthesizes for it.
    rig.petals[2].dispatchEvent(
      Object.assign(new MouseEvent('pointerdown', { bubbles: true, button: 0 }), {
        pointerId: 2,
        pointerType: 'touch',
      }),
    );
    rig.petals[2].dispatchEvent(
      Object.assign(new MouseEvent('pointerup', { bubbles: true, button: 0 }), {
        pointerId: 2,
        pointerType: 'touch',
      }),
    );
    rig.petals[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rig.casts).toEqual([[0, PETAL_DIRECTIONS[2]]]);
    expect(rig.gesture.isOpen()).toBe(false);
  });

  it('casts once for an assistive click on a petal', () => {
    const rig = makeRig({ tapMenus: true });
    down(rig, 0, 1, 100, 100);
    rig.petals[3].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(rig.casts).toEqual([[0, PETAL_DIRECTIONS[3]]]);
  });
});
