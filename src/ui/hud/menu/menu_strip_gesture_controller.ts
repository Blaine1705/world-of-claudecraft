// The touch gesture layer for the menu control: pointer capture, the reveal
// timer, and measuring the anchor. Every RULE it applies lives in
// menu_strip_core.ts (what a release means, when the row comes up, where the
// caption parks) or radial_action_core.ts (where the items sit, which one a drag
// is over), so this module reads pointers and reports; it decides nothing on its
// own. It is the twin of consumable_strip_gesture_controller.ts and holds the
// same contract.
//
// The gesture: pointerdown arms, a quick tap runs the default action (chat), a
// swipe RIGHT past the deadzone walks the row, and a stationary hold of
// RADIAL_REVEAL_MS reveals it as a learning affordance. Releasing back in the
// anchor's own X band with the row open cancels; the Y a thumb arc wandered to is
// ignored on purpose, because that arc is a curve and demanding a straight path
// would reject perfectly clear gestures.
//
// Two things that cost real time when they are missing:
//   - Pointer capture is MANDATORY: the finger leaves the anchor long before the
//     release, and without capture the pointerup is delivered elsewhere and the
//     gesture is silently lost. setPointerCapture is called inside try/catch
//     because a synthetic or already-released pointer id throws, which is why the
//     window-level release backstop exists: without it a throw plus a finger that
//     left the anchor strands the drag forever and the row stays painted.
//   - The row is measured at pointerdown, not at the reveal: the item centres
//     decide where the caption parks, so the placement has to exist before the
//     first move can be resolved against it.
//
// Unlike the ring's overlays there is no per-frame HUD paint behind this control,
// so every state change calls back into the owner to repaint. That callback is
// the whole driver: nothing here runs on a clock beyond the one reveal timer.
//
// STICKY MODE is the non-gesture path, for VoiceOver / TalkBack / Switch Control:
// activation opens the row as a persistent, focusable menu of real buttons
// instead of a drag. Phase 6 promotes exactly this path to the touchTapMenus
// setting (a tap opens the menu rather than running the default), which is why
// openSticky() is public and takes no pointer state.

import {
  placeConsumableStrip,
  RADIAL_REVEAL_MS,
  resolveStripIndex,
  STRIP_DEADZONE_PX,
  type StripPlacement,
} from '../action_bar/radial_action_core';
import {
  MENU_STRIP_COUNT,
  MENU_STRIP_DIRECTION,
  MENU_STRIP_PITCH_PX,
  menuStripCancelIsLive,
  resolveMenuStripRelease,
  shouldRevealMenuStrip,
} from './menu_strip_core';
import type { MenuStripOpenState } from './menu_strip_painter';

// Row geometry comes from the stylesheet, never from numbers here. An item is the
// same rendered size as the anchor that opens it (both read --menu-btn-size and
// fold in --btn-scale), so the anchor's own measured box IS the item size. The gap
// and the edge margin are read back off the overlay's computed style and are
// authored as LITERALS there: getComputedStyle hands back an unresolved calc() for
// a custom property, so only a literal parses back to a number.
const GAP_PROP = '--strip-gap';
const EDGE_MARGIN_PROP = '--strip-margin';
// The clamp box is the SHARED app-viewport box (#mobile-controls, #game-canvas,
// #ui and #nameplates all size from it), never window.innerWidth: whenever the two
// disagree (device emulation, pinch zoom, a mid-resize snapshot) a row clamped
// against the window lands off the overlay it is painted into. It is a px literal
// written by syncAppViewport, so it parses.
const APP_VIEWPORT_WIDTH_PROP = '--app-vw';
/** Applied only where the stylesheet is absent (a DOM without hud.mobile.css). */
const FALLBACK_ITEM_SIZE_PX = 46;
const FALLBACK_GAP_PX = 8;
const FALLBACK_MARGIN_PX = 6;

export interface MenuStripGestureDeps {
  /** The menu control itself, which owns the press. */
  anchor: HTMLElement;
  /** The element whose computed style carries the row geometry per tier. */
  metricsHost: HTMLElement;
  /** The row's item buttons, in row order (index 0 nearest the anchor). */
  items: readonly HTMLElement[];
  /** The X that sits on top of the anchor and backs out without opening. */
  cancel: HTMLElement;
  /** Open the item at `index`. */
  pick(index: number): void;
  /** A bare tap: run the control's default action. */
  runDefault(): void;
  /** The player opened the row and chose nothing. */
  onCancel(): void;
  /** Repaint from openState(); called on every state change. */
  repaint(): void;
}

/** The measured row: fixed for the whole of one gesture, since the control does
 *  not move under a press and the swipe distance to item N must stay
 *  predictable. */
interface StripLayout {
  placement: StripPlacement;
  anchorX: number;
  anchorY: number;
  viewportWidth: number;
  margin: number;
  itemSize: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  index: number;
  revealed: boolean;
  revealTimer: ReturnType<typeof setTimeout> | null;
  layout: StripLayout;
}

function readMetric(style: CSSStyleDeclaration, prop: string, fallback: number): number {
  const parsed = Number.parseFloat(style.getPropertyValue(prop));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** The edge clearance the clamp keeps: the stylesheet's literal, widened to
 *  whatever the device's safe area actually claims. env() cannot live in that
 *  literal (a custom property comes back unresolved, see above), so the overlay
 *  carries the insets as padding, which is inert under the global border-box
 *  reset and, being a real property, does resolve to px. */
function readEdgeMargin(style: CSSStyleDeclaration): number {
  return Math.max(
    readMetric(style, EDGE_MARGIN_PROP, FALLBACK_MARGIN_PX),
    readPx(style.paddingTop),
    readPx(style.paddingRight),
    readPx(style.paddingBottom),
    readPx(style.paddingLeft),
  );
}

export class MenuStripGesture {
  private drag: DragState | null = null;
  /** Sticky mode: opened by assistive activation rather than a drag, and kept
   *  open so it can be navigated and chosen without a pointer. */
  private sticky: StripLayout | null = null;
  /** Set when our own pointer handling resolved a gesture, so the synthetic click
   *  the browser fires afterwards is not mistaken for an assistive activation. */
  private suppressClick = false;

  constructor(private readonly deps: MenuStripGestureDeps) {}

  /** Bind the anchor and the row's own buttons. Called once, at build. */
  attach(): void {
    const { anchor, cancel } = this.deps;
    anchor.addEventListener('pointerdown', (e) => this.onDown(e as PointerEvent));
    anchor.addEventListener('pointermove', (e) => this.onMove(e as PointerEvent));
    anchor.addEventListener('pointerup', (e) => this.onUp(e as PointerEvent));
    anchor.addEventListener('pointercancel', () => this.cancelDrag());
    // The backstop for a release the anchor never sees. It runs AFTER the
    // anchor's own handler on an ordinary release (the event bubbles), so the
    // gesture resolves first and this finds nothing left to drop.
    const release = (e: Event) => {
      if ((e as PointerEvent).pointerId === this.drag?.pointerId) this.cancelDrag();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    // Assistive technologies activate a button with a plain click and emit no
    // pointer events at all, so a click our own drag handling did not just
    // produce is the non-gesture path asking for the menu.
    anchor.addEventListener('click', () => {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      this.openSticky();
    });
    this.deps.items.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        if (!this.sticky) return;
        this.closeSticky();
        this.deps.pick(index);
      });
    });
    cancel.addEventListener('click', () => {
      if (!this.sticky) return;
      this.closeSticky();
      this.deps.onCancel();
    });
  }

  /**
   * Open the row as a persistent, focusable menu. The pointer path never calls
   * this; assistive activation does, and Phase 6's tap mode will.
   */
  openSticky(): void {
    if (this.sticky || this.drag) return;
    this.sticky = this.measure();
    this.setRowFocusable(true);
    this.deps.repaint();
    this.deps.items[0]?.focus();
  }

  /** Close the sticky menu and hand focus back to the anchor it came from. */
  closeSticky(): void {
    if (!this.sticky) return;
    this.sticky = null;
    this.setRowFocusable(false);
    this.deps.repaint();
    this.deps.anchor.focus();
  }

  /** True while the row is showing, from either path. */
  isOpen(): boolean {
    return this.sticky !== null || this.drag?.revealed === true;
  }

  /** The item the finger is over, or -1 for none. */
  liveIndex(): number {
    return this.sticky ? -1 : (this.drag?.index ?? -1);
  }

  /** What the painter needs to seat the row, minus the caption text the owner
   *  localizes, or null while it is closed. */
  openState(): Omit<MenuStripOpenState, 'caption'> | null {
    const layout = this.sticky ?? (this.drag?.revealed ? this.drag.layout : null);
    if (!layout) return null;
    return {
      placement: layout.placement,
      anchorX: layout.anchorX,
      anchorY: layout.anchorY,
      viewportWidth: layout.viewportWidth,
      margin: layout.margin,
      itemSize: layout.itemSize,
      // The sticky menu is chosen by FOCUS, not by travel, so no item is under a
      // finger and the cancel target is not the live choice either.
      live: this.liveIndex(),
      cancelLive:
        this.sticky === null &&
        menuStripCancelIsLive(this.drag?.index ?? -1, this.drag?.revealed === true),
    };
  }

  private setRowFocusable(on: boolean): void {
    const tabIndex = on ? 0 : -1;
    for (const btn of this.deps.items) btn.tabIndex = tabIndex;
    this.deps.cancel.tabIndex = tabIndex;
  }

  /** Measure the anchor and lay the row out around it. The one place this module
   *  reads layout, gated to an opening gesture rather than per frame. */
  private measure(): StripLayout {
    const rect = this.deps.anchor.getBoundingClientRect();
    const style = getComputedStyle(this.deps.metricsHost);
    const itemSize = rect.width > 0 ? rect.width : FALLBACK_ITEM_SIZE_PX;
    const anchorX = rect.x + rect.width / 2;
    const anchorY = rect.y + rect.height / 2;
    const viewportWidth = readMetric(style, APP_VIEWPORT_WIDTH_PROP, window.innerWidth);
    const margin = readEdgeMargin(style);
    return {
      placement: placeConsumableStrip({
        anchorX,
        anchorY,
        count: MENU_STRIP_COUNT,
        itemSize,
        gap: readMetric(style, GAP_PROP, FALLBACK_GAP_PX),
        viewportWidth,
        margin,
        direction: MENU_STRIP_DIRECTION,
      }),
      anchorX,
      anchorY,
      viewportWidth,
      margin,
      itemSize,
    };
  }

  private onDown(e: PointerEvent): void {
    if (this.drag || this.sticky) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      this.deps.anchor.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or already-released pointer id: the anchor's own move/up
         listeners still resolve the drag while the finger stays on it, and the
         window backstop drops it when the finger leaves */
    }
    this.drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      index: -1,
      revealed: false,
      layout: this.measure(),
      revealTimer: setTimeout(() => this.reveal(), RADIAL_REVEAL_MS),
    };
    if (e.pointerType === 'touch') e.preventDefault();
  }

  private reveal(): void {
    if (!this.drag || this.drag.revealed) return;
    this.drag.revealed = true;
    this.deps.repaint();
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const next = resolveStripIndex(
      e.clientX - d.startX,
      MENU_STRIP_PITCH_PX,
      MENU_STRIP_COUNT,
      STRIP_DEADZONE_PX,
      MENU_STRIP_DIRECTION,
    );
    if (next === d.index) return;
    d.index = next;
    if (shouldRevealMenuStrip(next, d.revealed)) this.reveal();
    else if (d.revealed) this.deps.repaint();
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const outcome = resolveMenuStripRelease({
      index: d.index,
      revealed: d.revealed,
      count: MENU_STRIP_COUNT,
    });
    this.suppressClick = true;
    this.cancelDrag();
    if (outcome.kind === 'pick') this.deps.pick(outcome.index);
    else if (outcome.kind === 'default') this.deps.runDefault();
    else this.deps.onCancel();
  }

  /** Drop the gesture and close the row. Safe to call from any path. */
  cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    if (d.revealTimer !== null) clearTimeout(d.revealTimer);
    this.drag = null;
    this.deps.repaint();
  }
}
