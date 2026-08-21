// The touch gesture layer for the radial action ring: pointer capture, the
// reveal timer, and measuring the pressed button. Every RULE it applies lives in
// radial_gesture_core.ts (what a release means, whether the cancel target is the
// live choice) or radial_action_core.ts (which direction a drag points at, where
// the petals sit), so this module reads pointers and reports; it decides nothing
// on its own.
//
// The gesture: pointerdown arms, a quick tap casts the button's centre action, a
// flick past FLICK_DEADZONE_PX casts that direction, and a stationary hold of
// RADIAL_REVEAL_MS reveals the petals as a learning affordance. Casting never
// waits for the reveal, because a hold plus a swipe plus a release does not fit
// inside a global cooldown. Releasing back at the anchor with the petals open
// cancels.
//
// Three things that cost real time when they are missing:
//   - Pointer capture is MANDATORY: a flick leaves the button long before the
//     release, and without capture the pointerup is delivered elsewhere and the
//     gesture is silently lost. setPointerCapture is called inside try/catch
//     because a synthetic or already-released pointer id throws, which is
//     exactly why the window-level release backstop below exists: without it a
//     throw plus a finger that left the button strands the drag forever and
//     every ring button goes dead under a painted overlay.
//   - Drags are keyed PER POINTER ID. Combat is played with two thumbs, so a
//     second ring button pressed while the first is still held must cast too;
//     one shared drag slot dropped it. The petal overlay stays single-owner
//     (one reveal is seated around one button and two cannot coexist visually),
//     so only the FIRST press to arm may open it: the second thumb still casts,
//     it just casts without the learning affordance.
//   - The press is shared. A rearrange long-press drag and an empowered-ability
//     hold both bind the same button, so the radial asks before it acts and
//     stays silent when one of them owns the press.
//
// STICKY MODE is the tap-only path the touchTapMenus setting turns on, built to
// the shape the two strips already had: a press REVEALS the petals as a
// persistent menu of real, focusable buttons and casts nothing, a second press on
// the ring button casts its centre action, tapping a petal casts that direction,
// and a press outside dismisses. Every rule is tap_menu_core.ts's, shared with
// both strips so the three menus cannot drift. With the setting off nothing here
// runs and the gesture path above is untouched.

import type { PainterHostWriters } from '../../painter_host';
import { armTapMenuOutsideDismiss, registerTouchMenu } from '../tap_menu';
import { resolveTapMenuPress } from '../tap_menu_core';
import {
  FLICK_DEADZONE_PX,
  placeRadial,
  RADIAL_REVEAL_MS,
  type RadialDirection,
  type RadialPlacement,
  resolveRadialDirection,
} from './radial_action_core';
import {
  radialCancelIsLive,
  resolveRadialRelease,
  shouldRevealOnDrag,
} from './radial_gesture_core';

// Petal geometry comes from the stylesheet, never from numbers here. A petal is
// the same rendered size as the ring button that reveals it (both read
// --menu-btn-size and fold in --btn-scale), so the pressed button's own measured
// box IS the petal size and no second measurement is needed. The two remaining
// numbers are read back off the overlay's computed style, and both are authored
// as LITERALS there: getComputedStyle hands back an unresolved calc() for a
// custom property, so only a literal parses back to a number.
const RADIUS_RATIO_PROP = '--radial-radius-ratio';
const EDGE_MARGIN_PROP = '--radial-margin';
// The clamp box is the SHARED app-viewport box (#mobile-controls, #game-canvas,
// #ui and #nameplates all size from it), never window.innerWidth/innerHeight:
// whenever the two disagree (device emulation, pinch zoom, a mid-resize
// snapshot) a petal clamped against the window lands off the overlay it is
// painted into. Both are px literals written by syncAppViewport, so they parse.
const APP_VIEWPORT_WIDTH_PROP = '--app-vw';
const APP_VIEWPORT_HEIGHT_PROP = '--app-vh';
/** Applied only where the stylesheet is absent (a DOM without hud.mobile.css). */
const FALLBACK_PETAL_SIZE_PX = 46;
const FALLBACK_RADIUS_RATIO = 1.35;
const FALLBACK_MARGIN_PX = 6;
/** The pressed ring button's open state, so assistive tech is told the petals
 *  are showing. It is written on the BUTTON the petals belong to, never on the
 *  overlay: the button is the control a screen reader is standing on. */
const ARIA_EXPANDED_ATTR = 'aria-expanded';

/** A keyboard-activated click reports detail 0; a pointer-driven one does not.
 *  The pointer path below owns mouse and touch, so the click listener exists
 *  only to keep Enter / Space working on a focused ring button. */
const KEYBOARD_CLICK_DETAIL = 0;

/** One petal button and the direction it stands for, in the order they are
 *  seated. Handed over after the overlay is built, since the petals are minted
 *  from the same markup lookup that needs the gesture to already exist. */
export interface RadialPetalTarget {
  direction: RadialDirection;
  el: HTMLElement;
}

export interface RadialGestureDeps {
  /** The ring's action buttons, in ring index order. */
  buttons: readonly HTMLElement[];
  /** Hud's shared write-elision facet, which the pressed button's aria-expanded
   *  state is written through (the same cache the ring painter writes into). */
  writers: PainterHostWriters;
  /** Tap mode (settings.touchTapMenus), read live at press time. */
  tapMenus(): boolean;
  /** The element whose computed style carries the radial geometry per tier. */
  metricsHost: HTMLElement;
  /** Whether a button plus direction maps to a real hotbar slot right now. */
  hasSlot(buttonIndex: number, direction: RadialDirection): boolean;
  /** Cast the action a button plus direction resolves to. Routes through the
   *  SAME castSlot path a plain ring tap uses; only the input differs. */
  cast(buttonIndex: number, direction: RadialDirection): void;
  /** Another owner already claims this press (an empowered-ability hold, bind
   *  mode), so the radial must not arm at all. */
  pressClaimed(buttonIndex: number): boolean;
  /** Read and CLEAR the shared "this release was a drag, not a tap" flag. Read
   *  on every release the radial owns, and on an unowned one only while no other
   *  press is live: the empowered-hold path sets it on a press the radial never
   *  armed, and a flag left set would swallow the next cast. */
  takeSuppressedPress(): boolean;
  /** The player opened the radial and chose nothing. */
  onCancel(): void;
}

interface DragState {
  pointerId: number;
  buttonIndex: number;
  btn: HTMLElement;
  startX: number;
  startY: number;
  direction: RadialDirection;
  revealTimer: ReturnType<typeof setTimeout> | null;
  placement: RadialPlacement | null;
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

/** The tap-mode menu: which ring button revealed the petals, and where they are
 *  seated. Measured once on opening, exactly like a drag's placement. */
interface StickyState {
  buttonIndex: number;
  btn: HTMLElement;
  placement: RadialPlacement;
}

export class RadialGesture {
  private readonly drags = new Map<number, DragState>();
  /** The one pointer allowed to open the petal overlay: the first press to arm
   *  while nothing else was held. Cleared with that drag. */
  private revealOwner: number | null = null;
  /** Tap mode's open menu. Never coexists with a drag: a tap-mode press returns
   *  before the drag map is touched. */
  private sticky: StickyState | null = null;
  private petals: readonly RadialPetalTarget[] = [];
  private petalCancel: HTMLElement | null = null;
  /** Disarms the tap-outside listener, while one is armed. */
  private disarmOutside: (() => void) | null = null;
  /** Set when a tap-mode press resolved on pointerdown, so the click the browser
   *  fires afterwards cannot resolve it a second time. */
  private suppressClick = false;

  constructor(private readonly deps: RadialGestureDeps) {}

  /** Bind every ring action button. Called once, at ring construction. */
  attach(): void {
    this.deps.buttons.forEach((btn, index) => {
      btn.addEventListener('pointerdown', (e) => this.onDown(e as PointerEvent, index, btn));
      btn.addEventListener('pointermove', (e) => this.onMove(e as PointerEvent));
      btn.addEventListener('pointerup', (e) => this.onUp(e as PointerEvent));
      btn.addEventListener('pointercancel', (e) => this.clearDrag((e as PointerEvent).pointerId));
      btn.addEventListener('click', (e) => {
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        if ((e as MouseEvent).detail !== KEYBOARD_CLICK_DETAIL) return;
        if (this.deps.pressClaimed(index)) return;
        // Keyboard activation follows the same table as a tap, so Enter opens the
        // petals in tap mode instead of casting past them.
        if (this.deps.tapMenus()) {
          this.resolveAnchorPress(index);
          return;
        }
        if (this.deps.hasSlot(index, 'center')) this.deps.cast(index, 'center');
      });
    });
    // The backstop for a release the button never sees. It runs AFTER the
    // button's own handler on an ordinary release (the event bubbles), so the
    // gesture resolves first and this finds nothing left to drop.
    const release = (e: Event) => this.clearDrag((e as PointerEvent).pointerId);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    // Escape belongs to Hud's single closeAll dispatcher, which asks the shared
    // registry rather than knowing any menu by name.
    registerTouchMenu(() => this.closeIfOpen());
  }

  /**
   * Bind the petal buttons and the centre cancel target, so tap mode can choose
   * from them. Called once, right after the overlay is built; a build without the
   * overlay markup never calls it and tap mode then behaves as a plain tap.
   */
  attachPetals(petals: readonly RadialPetalTarget[], cancel: HTMLElement): void {
    this.petals = petals;
    this.petalCancel = cancel;
    this.setPetalsFocusable(false);
    petals.forEach(({ direction, el }, index) => {
      el.addEventListener('click', () => {
        const press = resolveTapMenuPress({
          tapMenus: this.deps.tapMenus(),
          open: this.sticky !== null,
          target: 'item',
          index,
        });
        if (press.kind !== 'choose') return;
        const buttonIndex = this.sticky?.buttonIndex ?? -1;
        this.closeSticky();
        if (buttonIndex >= 0 && this.deps.hasSlot(buttonIndex, direction)) {
          this.deps.cast(buttonIndex, direction);
        }
      });
    });
    cancel.addEventListener('click', () => {
      if (!this.sticky) return;
      this.closeSticky();
      this.deps.onCancel();
    });
  }

  /** True while the petals are showing, which is what makes the ring painter
   *  tick and paint them. */
  isOpen(): boolean {
    return this.sticky !== null || this.owner()?.placement != null;
  }

  /** The ring button the open radial belongs to, or -1 when nothing is held.
   *  The petal view resolves its slots against this. */
  heldButtonIndex(): number {
    return this.sticky?.buttonIndex ?? this.owner()?.buttonIndex ?? -1;
  }

  /** The direction the drag currently points at (the petal highlighted, or
   *  'center' for the cancel target). */
  liveDirection(): RadialDirection {
    // A tap-mode menu is chosen by tapping a petal, not by travel, so no
    // direction is under a finger and nothing is highlighted.
    if (this.sticky) return 'center';
    return this.owner()?.direction ?? 'center';
  }

  placement(): RadialPlacement | null {
    return this.sticky?.placement ?? this.owner()?.placement ?? null;
  }

  /** Whether the centre cancel target is the live choice, straight from the
   *  shared rule so the painter never re-derives it. */
  cancelIsLive(): boolean {
    if (this.sticky) return false;
    return radialCancelIsLive(this.liveDirection(), this.isOpen());
  }

  /**
   * Open the petals as a persistent, focusable menu around `buttonIndex`. Tap
   * mode's own path: it measures the same way a reveal does and casts nothing.
   */
  openSticky(buttonIndex: number): void {
    const btn = this.deps.buttons[buttonIndex];
    if (!btn || this.drags.size > 0) return;
    if (this.sticky) this.closeSticky();
    this.sticky = { buttonIndex, btn, placement: this.measure(btn) };
    this.setPetalsFocusable(true);
    this.setExpanded(btn, true);
    this.disarmOutside = armTapMenuOutsideDismiss(
      () => [...this.deps.buttons, ...this.petals.map((p) => p.el), this.petalCancel],
      () => this.dismissSticky(),
    );
    this.petals[0]?.el.focus();
  }

  /** Close the tap-mode menu and hand focus back to the ring button it came
   *  from. Safe to call from any path. */
  closeSticky(): void {
    const sticky = this.sticky;
    if (!sticky) return;
    this.sticky = null;
    this.setPetalsFocusable(false);
    this.disarmOutside?.();
    this.disarmOutside = null;
    this.setExpanded(sticky.btn, false);
    sticky.btn.focus();
  }

  /** Escape's way out, called by Hud's closeAll dispatcher through the shared
   *  registry. Reports whether it had anything to close, and casts nothing. */
  closeIfOpen(): boolean {
    if (this.sticky === null) return false;
    this.closeSticky();
    this.deps.onCancel();
    return true;
  }

  /** The tap-outside path: close and report the radial as chosen-nothing. */
  private dismissSticky(): void {
    const press = resolveTapMenuPress({
      tapMenus: this.deps.tapMenus(),
      open: this.sticky !== null,
      target: 'outside',
    });
    if (press.kind !== 'dismiss') return;
    this.closeSticky();
    this.deps.onCancel();
  }

  /** A tap-mode press on a ring button: open the petals, or cast the centre
   *  action when they are already open for that button. */
  private resolveAnchorPress(buttonIndex: number): void {
    const press = resolveTapMenuPress({
      tapMenus: true,
      open: this.sticky?.buttonIndex === buttonIndex,
      target: 'anchor',
    });
    if (press.kind === 'open') {
      this.openSticky(buttonIndex);
      return;
    }
    if (press.kind !== 'default') return;
    // Focus goes back to the ring button either way (closeSticky hands it over),
    // so a keyboard user is left where they started rather than on a dead petal.
    this.closeSticky();
    if (this.deps.hasSlot(buttonIndex, 'center')) this.deps.cast(buttonIndex, 'center');
  }

  private setPetalsFocusable(on: boolean): void {
    const tabIndex = on ? 0 : -1;
    for (const petal of this.petals) petal.el.tabIndex = tabIndex;
    if (this.petalCancel) this.petalCancel.tabIndex = tabIndex;
  }

  /** The drag the petal overlay belongs to. A second thumb's press casts but
   *  never paints, so every readout above answers for this one. */
  private owner(): DragState | null {
    return this.revealOwner === null ? null : (this.drags.get(this.revealOwner) ?? null);
  }

  private onDown(e: PointerEvent, buttonIndex: number, btn: HTMLElement): void {
    if (this.drags.has(e.pointerId)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.deps.pressClaimed(buttonIndex)) return;
    // A press always clears a stale suppression first: it is set here and cleared
    // by the click that follows, so one that never arrived would otherwise
    // swallow the next keyboard activation.
    this.suppressClick = false;
    if (this.deps.tapMenus()) {
      this.suppressClick = true;
      if (e.pointerType === 'touch') e.preventDefault();
      this.resolveAnchorPress(buttonIndex);
      return;
    }
    try {
      btn.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or already-released pointer id: the button-level move/up
         listeners still resolve the drag while the finger stays on it, and the
         window backstop drops it when the finger leaves */
    }
    const drag: DragState = {
      pointerId: e.pointerId,
      buttonIndex,
      btn,
      startX: e.clientX,
      startY: e.clientY,
      direction: 'center',
      placement: null,
      revealTimer: null,
    };
    if (this.revealOwner === null) this.revealOwner = e.pointerId;
    drag.revealTimer = setTimeout(() => this.reveal(drag), RADIAL_REVEAL_MS);
    this.drags.set(e.pointerId, drag);
    if (e.pointerType === 'touch') e.preventDefault();
  }

  /** Measure the pressed button and seat the radial around it. The one place
   *  this module reads layout, gated to the reveal rather than per frame. */
  private reveal(d: DragState): void {
    if (d.placement || d.pointerId !== this.revealOwner) return;
    d.placement = this.measure(d.btn);
    this.setExpanded(d.btn, true);
  }

  /** The pressed button's popup state, through the shared elided writer so a
   *  repeat of the same state costs no DOM write. */
  private setExpanded(btn: HTMLElement, open: boolean): void {
    this.deps.writers.setAttr(btn, ARIA_EXPANDED_ATTR, open ? 'true' : 'false');
  }

  /** Seat the radial around one ring button. The one place this module reads
   *  layout, gated to an opening (a drag's reveal or a tap-mode press) rather
   *  than per frame. */
  private measure(btn: HTMLElement): RadialPlacement {
    const rect = btn.getBoundingClientRect();
    const style = getComputedStyle(this.deps.metricsHost);
    const petalSize = rect.width > 0 ? rect.width : FALLBACK_PETAL_SIZE_PX;
    return placeRadial({
      buttonCx: rect.x + rect.width / 2,
      buttonCy: rect.y + rect.height / 2,
      viewportWidth: readMetric(style, APP_VIEWPORT_WIDTH_PROP, window.innerWidth),
      viewportHeight: readMetric(style, APP_VIEWPORT_HEIGHT_PROP, window.innerHeight),
      radius: petalSize * readMetric(style, RADIUS_RATIO_PROP, FALLBACK_RADIUS_RATIO),
      petalHalf: petalSize / 2,
      margin: readEdgeMargin(style),
    });
  }

  private onMove(e: PointerEvent): void {
    const d = this.drags.get(e.pointerId);
    if (!d) return;
    const next = resolveRadialDirection(
      e.clientX - d.startX,
      e.clientY - d.startY,
      FLICK_DEADZONE_PX,
    );
    if (next === d.direction) return;
    d.direction = next;
    if (shouldRevealOnDrag(next, d.placement !== null)) this.reveal(d);
  }

  private onUp(e: PointerEvent): void {
    const d = this.drags.get(e.pointerId);
    if (!d) {
      // Not a press the radial armed (an empowered hold or bind mode took it).
      // The flag those paths set still has to be cleared or it swallows the next
      // cast, but only while nothing else is held: a second thumb's release must
      // never consume the flag its neighbour's hold armed.
      if (this.drags.size === 0) this.deps.takeSuppressedPress();
      return;
    }
    const suppressed = this.deps.takeSuppressedPress();
    const outcome = resolveRadialRelease({
      direction: d.direction,
      revealed: d.placement !== null,
      hasSlot: this.deps.hasSlot(d.buttonIndex, d.direction),
      consumedElsewhere: suppressed,
    });
    const buttonIndex = d.buttonIndex;
    this.clearDrag(d.pointerId);
    if (outcome.kind === 'cast') this.deps.cast(buttonIndex, outcome.direction);
    else if (outcome.kind === 'cancel') this.deps.onCancel();
  }

  /** Drop every live gesture and close the petals. Safe to call from any path. */
  cancel(): void {
    for (const pointerId of [...this.drags.keys()]) this.clearDrag(pointerId);
    this.closeSticky();
  }

  private clearDrag(pointerId: number): void {
    const d = this.drags.get(pointerId);
    if (!d) return;
    if (d.revealTimer !== null) clearTimeout(d.revealTimer);
    this.drags.delete(pointerId);
    if (d.placement) this.setExpanded(d.btn, false);
    if (this.revealOwner === pointerId) this.revealOwner = null;
  }
}
