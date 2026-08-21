// @vitest-environment happy-dom
// Pointer-level regressions for the consumables seat's gesture controller, the
// DOM twin of the radial ring's. The RULES have their own suite
// (consumable_strip_core.test.ts); this covers the two defects the twin shared:
// no release path other than the seat's own (a setPointerCapture throw plus a
// finger that left the seat stranded the drag and left the row painted), and a
// row clamped against window.innerWidth while the overlay is sized from the
// shared --app-vw box and never widened for the device's safe area.
//
// The seat is ONE element, so the radial's per-pointer drag map has no twin
// here: a second pointer on the same seat is correctly ignored.

import { beforeEach, describe, expect, it } from 'vitest';
import { CONSUMABLE_BAR_SLOTS } from '../src/ui/hud/action_bar/consumable_bar_view';
import {
  ConsumableStripGesture,
  type ConsumableStripGestureDeps,
} from '../src/ui/hud/action_bar/consumable_strip_gesture_controller';

const SEAT_SIZE_PX = 40;
/** Past STRIP_DEADZONE_PX (22), so a move commits to an item and pulls the row
 *  up without waiting out the reveal timer. */
const SWIPE_PX = 30;

interface Rig {
  seat: HTMLButtonElement;
  gesture: ConsumableStripGesture;
  used: number[];
  cancels: number;
}

function makeRig(options: { appVw?: string; safeAreaPx?: string } = {}): Rig {
  const host = document.createElement('div');
  host.style.setProperty('--strip-gap', '8px');
  host.style.setProperty('--strip-margin', '6px');
  host.style.setProperty('--app-vw', options.appVw ?? '380px');
  for (const side of ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']) {
    host.style.setProperty(side, options.safeAreaPx ?? '0px');
  }
  document.body.append(host);

  const seat = document.createElement('button');
  seat.type = 'button';
  document.body.append(seat);
  // Hard against the LEFT edge, so the row has to grow right and the far end
  // runs into the clamp: the one placement the viewport box actually decides.
  seat.getBoundingClientRect = () =>
    ({
      x: 60,
      y: 180,
      left: 60,
      top: 180,
      width: SEAT_SIZE_PX,
      height: SEAT_SIZE_PX,
      right: 60 + SEAT_SIZE_PX,
      bottom: 180 + SEAT_SIZE_PX,
    }) as DOMRect;

  const items = Array.from({ length: CONSUMABLE_BAR_SLOTS }, () => {
    const btn = document.createElement('button');
    btn.type = 'button';
    document.body.append(btn);
    return btn;
  });
  const cancel = document.createElement('button');
  cancel.type = 'button';
  document.body.append(cancel);

  const rig: Rig = {
    seat,
    used: [],
    cancels: 0,
    gesture: null as unknown as ConsumableStripGesture,
  };
  const deps: ConsumableStripGestureDeps = {
    seat,
    metricsHost: host,
    items,
    cancel,
    count: () => CONSUMABLE_BAR_SLOTS,
    use: (index) => rig.used.push(index),
    onCancel: () => {
      rig.cancels++;
    },
  };
  rig.gesture = new ConsumableStripGesture(deps);
  rig.gesture.attach();
  return rig;
}

function pointer(type: string, pointerId: number, clientX: number): MouseEvent {
  return Object.assign(new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 200 }), {
    pointerId,
    pointerType: 'touch',
  });
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('ConsumableStripGesture: the window release backstop', () => {
  it('drops a drag whose release never reaches the seat', () => {
    const rig = makeRig();
    rig.seat.setPointerCapture = () => {
      throw new Error('no capture for a synthetic pointer id');
    };
    rig.seat.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.seat.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    expect(rig.gesture.isOpen()).toBe(true);

    window.dispatchEvent(Object.assign(new MouseEvent('pointerup'), { pointerId: 1 }));
    expect(rig.gesture.isOpen()).toBe(false);
    expect(rig.gesture.openState()).toBeNull();
    // Dropping is not resolving: a release the gesture never saw uses nothing.
    expect(rig.used).toEqual([]);

    // And the seat is alive again, rather than dead under a painted row.
    rig.seat.dispatchEvent(pointer('pointerdown', 2, 100));
    rig.seat.dispatchEvent(pointer('pointerup', 2, 100));
    expect(rig.used).toEqual([0]);
  });

  it('leaves an ordinary release to the seat, which resolves it first', () => {
    const rig = makeRig();
    rig.seat.dispatchEvent(pointer('pointerdown', 1, 100));
    // Bubbles to window, so the backstop runs on the same event and must find
    // nothing left to drop rather than eating the use.
    rig.seat.dispatchEvent(pointer('pointerup', 1, 100));
    expect(rig.used).toEqual([0]);
  });

  it('ignores a stray window release for a pointer it never armed', () => {
    const rig = makeRig();
    rig.seat.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.seat.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    window.dispatchEvent(Object.assign(new MouseEvent('pointerup'), { pointerId: 9 }));
    expect(rig.gesture.isOpen()).toBe(true);
  });
});

describe('ConsumableStripGesture: the clamp box', () => {
  it('clamps the row against the shared --app-vw box, not the window', () => {
    const rig = makeRig({ appVw: '380px' });
    rig.seat.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.seat.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    const open = rig.gesture.openState();
    // itemSize 40 + gap 8 = pitch 48 from an anchor at 80, so the far item's
    // right edge lands at 388 and the 380px app box shifts the whole row 14px
    // left. happy-dom's 1024px window would not have clamped at all.
    expect(window.innerWidth).toBeGreaterThan(380);
    expect(open?.placement.clamped).toBe(true);
    expect(open?.placement.centers[0]).toBe(114);
  });

  it('widens the edge margin to the safe area the overlay carries as padding', () => {
    const rig = makeRig({ appVw: '380px', safeAreaPx: '30px' });
    rig.seat.dispatchEvent(pointer('pointerdown', 1, 100));
    rig.seat.dispatchEvent(pointer('pointermove', 1, 100 + SWIPE_PX));
    // margin becomes max(6, 30) = 30, so the same row shifts 38px instead of 14.
    expect(rig.gesture.openState()?.placement.centers[0]).toBe(90);
  });
});
