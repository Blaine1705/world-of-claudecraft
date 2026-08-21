// The menu control's gesture layer: one instance of the shared StripGesture
// (../strip_gesture_controller.ts), which owns pointer capture, the reveal
// timer, the anchor measure, the window release backstop, sticky/tap mode, the
// aria-expanded state and the Escape closer. This module supplies only what is
// genuinely this menu's: the row grows RIGHT (fixed, because the muscle memory
// the roster order buys depends on the direction never changing under the
// player), the roster is a constant nine, and a bare tap runs the control's
// default action (chat) rather than choosing an item.
//
// It was a near-verbatim copy of the consumables row's gesture layer until the
// rule of three was reached: identical drag state, metric reads, fallbacks,
// pointer wiring and every sticky path, differing only in those parameters. The
// sibling CLAUDE.md's warning was the exact drift ("a new gesture menu asks
// those two; it does not grow a fourth dialect"), so the two now ask one.

import type { PainterHostWriters } from '../../painter_host';
import {
  StripGesture,
  type StripGestureOutcome,
  type StripReleaseInput,
} from '../strip_gesture_controller';
import {
  MENU_STRIP_COUNT,
  MENU_STRIP_DIRECTION,
  MENU_STRIP_PITCH_PX,
  resolveMenuStripRelease,
} from './menu_strip_core';
import type { MenuStripOpenState } from './menu_strip_painter';

export interface MenuStripGestureDeps {
  /** The menu control itself, which owns the press. */
  anchor: HTMLElement;
  /** The element whose computed style carries the row geometry per tier. */
  metricsHost: HTMLElement;
  /** The row's item buttons, in row order (index 0 nearest the anchor). */
  items: readonly HTMLElement[];
  /** The X that sits on top of the anchor and backs out without opening. */
  cancel: HTMLElement;
  /** The write-elision facet the anchor's aria-expanded state is written through. */
  writers: PainterHostWriters;
  /** Tap mode (settings.touchTapMenus), read live at press time. */
  tapMenus(): boolean;
  /** Open the item at `index`. */
  pick(index: number): void;
  /** A bare tap: run the control's default action. */
  runDefault(): void;
  /** The player opened the row and chose nothing. */
  onCancel(): void;
  /** Repaint from openState(); called on every state change. */
  repaint(): void;
}

/** The menu strip's release rule in the shared outcome shape. The strip's own
 *  'pick' / 'default' / 'cancel' table is already that shape, so this is a type
 *  bridge rather than a second rule. */
function release(input: StripReleaseInput): StripGestureOutcome {
  return resolveMenuStripRelease(input);
}

export class MenuStripGesture {
  private readonly gesture: StripGesture;

  constructor(deps: MenuStripGestureDeps) {
    this.gesture = new StripGesture({
      anchor: deps.anchor,
      metricsHost: deps.metricsHost,
      items: deps.items,
      cancel: deps.cancel,
      writers: deps.writers,
      tapMenus: () => deps.tapMenus(),
      count: () => MENU_STRIP_COUNT,
      pitch: MENU_STRIP_PITCH_PX,
      direction: () => MENU_STRIP_DIRECTION,
      release,
      onPick: (index) => deps.pick(index),
      onDefault: () => deps.runDefault(),
      onCancel: () => deps.onCancel(),
      repaint: () => deps.repaint(),
    });
  }

  /** Bind the anchor and the row's own buttons. Called once, at build. */
  attach(): void {
    this.gesture.attach();
  }

  /** Open the row as a persistent, focusable menu. Assistive activation calls
   *  this, and so does a tap-mode press. */
  openSticky(): void {
    this.gesture.openSticky();
  }

  /** Close the sticky menu and hand focus back to the anchor it came from. */
  closeSticky(): void {
    this.gesture.closeSticky();
  }

  /** Escape's way out, through Hud's single closeAll dispatcher. */
  closeIfOpen(): boolean {
    return this.gesture.closeIfOpen();
  }

  /** True while the row is showing, from either path. */
  isOpen(): boolean {
    return this.gesture.isOpen();
  }

  /** The item the finger is over, or -1 for none. */
  liveIndex(): number {
    return this.gesture.liveIndex();
  }

  /** What the painter needs to seat the row, minus the caption text the owner
   *  localizes, or null while it is closed. */
  openState(): Omit<MenuStripOpenState, 'caption'> | null {
    return this.gesture.openState();
  }

  /** Drop the gesture and close the row. Safe to call from any path. */
  cancelDrag(): void {
    this.gesture.cancelDrag();
  }
}
