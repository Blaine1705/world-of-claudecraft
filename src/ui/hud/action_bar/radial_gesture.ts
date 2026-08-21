// The touch gesture layer for the radial action ring: pointer capture, the
// reveal timer, and measuring the pressed button. Every RULE it applies lives in
// radial_gesture_core.ts (what a release means) or radial_action_core.ts (which
// direction a drag points at, where the petals sit), so this module reads
// pointers and reports; it decides nothing on its own.
//
// The gesture: pointerdown arms, a quick tap casts the button's centre action, a
// flick past FLICK_DEADZONE_PX casts that direction, and a stationary hold of
// RADIAL_REVEAL_MS reveals the petals as a learning affordance. Casting never
// waits for the reveal, because a hold plus a swipe plus a release does not fit
// inside a global cooldown. Releasing back at the anchor with the petals open
// cancels.
//
// Two things that cost real time when they are missing:
//   - Pointer capture is MANDATORY: a flick leaves the button long before the
//     release, and without capture the pointerup is delivered elsewhere and the
//     gesture is silently lost. setPointerCapture is called inside try/catch
//     because a synthetic or already-released pointer id throws.
//   - The press is shared. A rearrange long-press drag and an empowered-ability
//     hold both bind the same button, so the radial asks before it acts and
//     stays silent when one of them owns the press.

import {
  FLICK_DEADZONE_PX,
  placeRadial,
  RADIAL_REVEAL_MS,
  type RadialDirection,
  type RadialPlacement,
  resolveRadialDirection,
} from './radial_action_core';
import { resolveRadialRelease, shouldRevealOnDrag } from './radial_gesture_core';

// Petal geometry comes from the stylesheet, never from numbers here. A petal is
// the same rendered size as the ring button that reveals it (both read
// --menu-btn-size and fold in --btn-scale), so the pressed button's own measured
// box IS the petal size and no second measurement is needed. The two remaining
// numbers are read back off the overlay's computed style, and both are authored
// as LITERALS there: getComputedStyle hands back an unresolved calc() for a
// custom property, so only a literal parses back to a number.
const RADIUS_RATIO_PROP = '--radial-radius-ratio';
const EDGE_MARGIN_PROP = '--radial-margin';
/** Applied only where the stylesheet is absent (a DOM without hud.mobile.css). */
const FALLBACK_PETAL_SIZE_PX = 46;
const FALLBACK_RADIUS_RATIO = 1.35;
const FALLBACK_MARGIN_PX = 6;

/** A keyboard-activated click reports detail 0; a pointer-driven one does not.
 *  The pointer path below owns mouse and touch, so the click listener exists
 *  only to keep Enter / Space working on a focused ring button. */
const KEYBOARD_CLICK_DETAIL = 0;

export interface RadialGestureDeps {
  /** The ring's action buttons, in ring index order. */
  buttons: readonly HTMLElement[];
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
  /** A rearrange long-press drag went active under the finger. */
  dragActive(): boolean;
  /** Read and CLEAR the shared "this release was a drag, not a tap" flag. Read
   *  on every release, armed or not: the empowered-hold path sets it on a press
   *  the radial never armed, and a flag left set would swallow the next cast. */
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

export class RadialGesture {
  private drag: DragState | null = null;

  constructor(private readonly deps: RadialGestureDeps) {}

  /** Bind every ring action button. Called once, at ring construction. */
  attach(): void {
    this.deps.buttons.forEach((btn, index) => {
      btn.addEventListener('pointerdown', (e) => this.onDown(e as PointerEvent, index, btn));
      btn.addEventListener('pointermove', (e) => this.onMove(e as PointerEvent));
      btn.addEventListener('pointerup', (e) => this.onUp(e as PointerEvent));
      btn.addEventListener('pointercancel', () => this.cancel());
      btn.addEventListener('click', (e) => {
        if ((e as MouseEvent).detail !== KEYBOARD_CLICK_DETAIL) return;
        if (this.deps.pressClaimed(index)) return;
        if (this.deps.hasSlot(index, 'center')) this.deps.cast(index, 'center');
      });
    });
  }

  /** True while the petals are showing, which is what makes the ring painter
   *  tick and paint them. */
  isOpen(): boolean {
    return this.drag?.placement != null;
  }

  /** The ring button the open radial belongs to, or -1 when nothing is held.
   *  The petal view resolves its slots against this. */
  heldButtonIndex(): number {
    return this.drag?.buttonIndex ?? -1;
  }

  /** The direction the drag currently points at (the petal highlighted, or
   *  'center' for the cancel target). */
  liveDirection(): RadialDirection {
    return this.drag?.direction ?? 'center';
  }

  placement(): RadialPlacement | null {
    return this.drag?.placement ?? null;
  }

  private onDown(e: PointerEvent, buttonIndex: number, btn: HTMLElement): void {
    if (this.drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.deps.pressClaimed(buttonIndex)) return;
    try {
      btn.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic or already-released pointer id: the button-level move/up
         listeners still resolve the drag while the finger stays on it */
    }
    this.drag = {
      pointerId: e.pointerId,
      buttonIndex,
      btn,
      startX: e.clientX,
      startY: e.clientY,
      direction: 'center',
      placement: null,
      revealTimer: setTimeout(() => this.reveal(), RADIAL_REVEAL_MS),
    };
    if (e.pointerType === 'touch') e.preventDefault();
  }

  /** Measure the pressed button and seat the radial around it. The one place
   *  this module reads layout, gated to the reveal rather than per frame. */
  private reveal(): void {
    const d = this.drag;
    if (!d || d.placement) return;
    const rect = d.btn.getBoundingClientRect();
    const style = getComputedStyle(this.deps.metricsHost);
    const petalSize = rect.width > 0 ? rect.width : FALLBACK_PETAL_SIZE_PX;
    d.placement = placeRadial({
      buttonCx: rect.x + rect.width / 2,
      buttonCy: rect.y + rect.height / 2,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      radius: petalSize * readMetric(style, RADIUS_RATIO_PROP, FALLBACK_RADIUS_RATIO),
      petalHalf: petalSize / 2,
      margin: readMetric(style, EDGE_MARGIN_PROP, FALLBACK_MARGIN_PX),
    });
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    // A rearrange drag activating under the finger takes the press over; the
    // petals must not sit on top of the slot the player is dragging.
    if (this.deps.dragActive()) {
      this.cancel();
      return;
    }
    const next = resolveRadialDirection(
      e.clientX - d.startX,
      e.clientY - d.startY,
      FLICK_DEADZONE_PX,
    );
    if (next === d.direction) return;
    d.direction = next;
    if (shouldRevealOnDrag(next, d.placement !== null)) this.reveal();
  }

  private onUp(e: PointerEvent): void {
    // Consumed FIRST and unconditionally: the rearrange drag's own release
    // handler runs before this one and arms the flag, and an empowered hold
    // arms it on a press the radial never took.
    const suppressed = this.deps.takeSuppressedPress();
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const outcome = resolveRadialRelease({
      direction: d.direction,
      revealed: d.placement !== null,
      hasSlot: this.deps.hasSlot(d.buttonIndex, d.direction),
      consumedElsewhere: suppressed || this.deps.dragActive(),
    });
    const buttonIndex = d.buttonIndex;
    this.cancel();
    if (outcome.kind === 'cast') this.deps.cast(buttonIndex, outcome.direction);
    else if (outcome.kind === 'cancel') this.deps.onCancel();
  }

  /** Drop the gesture and close the petals. Safe to call from any path. */
  cancel(): void {
    const d = this.drag;
    if (!d) return;
    if (d.revealTimer !== null) clearTimeout(d.revealTimer);
    this.drag = null;
  }
}
