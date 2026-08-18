// The DOM half of d-pad UI navigation: find the controls of the window the player
// is actually in, move focus between them with the pure spatial core, and press
// the focused one. `gamepad.ts` stays the thin poller and owns none of this.
//
// Scope matters more than the geometry here. Navigating every focusable element in
// the document would wander out of the open window and into the side rail, so the
// search starts at the top-most open dialog/panel and only falls back to the whole
// document when none is open.

import { type NavDirection, type NavRect, nextFocusIndex } from '../ui/dpad_nav_core';
import { FOCUSABLE_SELECTOR } from '../ui/focus_manager';

// The roots a pad player can be navigating, most specific first.
const WINDOW_SELECTOR = '[role="dialog"], .window.panel';

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

/** The open window the d-pad should navigate inside, or null for the document. */
function activeRoot(): HTMLElement | null {
  const open = [...document.querySelectorAll<HTMLElement>(WINDOW_SELECTOR)].filter(isVisible);
  // Last in document order is the most recently mounted, which is the one on top.
  return open.length > 0 ? open[open.length - 1] : null;
}

function focusables(root: HTMLElement | Document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (el) => !el.hasAttribute('disabled') && isVisible(el),
  );
}

function toRect(el: HTMLElement): NavRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** Where the virtual cursor should sit after a focus move: the centre of the
 *  control that now has focus. */
export interface DpadFocusResult {
  x: number;
  y: number;
}

/**
 * Move focus one step in `dir`, answering the new focus centre so the caller can
 * SNAP the virtual cursor onto it. Focus alone is invisible on a pad: the player
 * is watching the cursor, so the two must travel together (and it keeps a press
 * at the cursor and a press on the focused control the same act).
 *
 * Answers null when nothing moved, so the caller can fall back to the free cursor.
 */
export function moveDpadFocus(dir: NavDirection): DpadFocusResult | null {
  // No DOM (headless env server, unit tests): nothing to navigate.
  if (typeof document === 'undefined') return null;
  const root = activeRoot() ?? document;
  const els = focusables(root);
  if (els.length === 0) return null;
  const active = document.activeElement as HTMLElement | null;
  const current = active ? els.indexOf(active) : -1;
  const next = nextFocusIndex(els.map(toRect), current, dir);
  if (next < 0 || next === current) return null;
  const el = els[next];
  el.focus();
  markPadFocus(el);
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Programmatic focus() does NOT satisfy the browser's :focus-visible heuristic,
// which only fires for input it judges keyboard-like. A pad player therefore sees
// no ring at all, which is indistinguishable from the navigation being broken. So
// the highlight is an explicit class rather than a pseudo-class we do not control.
const PAD_FOCUS_CLASS = 'pad-focus';
const CURSOR_ID = 'pad-cursor';
let marked: HTMLElement | null = null;
let cursorEl: HTMLElement | null = null;

// The pointer graphic that rides the selection. A console MMO still SHOWS a
// cursor under gamepad control (FFXIV anchors one to the selected element); what
// it does not do is make you steer it. So this is drawn by us, snapped to focus,
// and never free-moving. It is not the OS pointer, which a page cannot move.
function ensureCursor(): HTMLElement | null {
  if (cursorEl) return cursorEl;
  if (typeof document === 'undefined') return null;
  const el = document.createElement('div');
  el.id = CURSOR_ID;
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  cursorEl = el;
  return el;
}

// While the pad is driving the UI, the OS pointer is dead weight sitting wherever
// it was last left, so it is hidden. ANY real pointer movement brings it straight
// back (a mouse, or the Deck's trackpad, which emulates one) and stands the pad
// pointer down: whichever device the player just used is the one that shows.
const PAD_NAV_CLASS = 'pad-nav';
let padNavActive = false;
let pointerWatchAttached = false;

function watchForRealPointer(): void {
  if (pointerWatchAttached || typeof window === 'undefined') return;
  pointerWatchAttached = true;
  window.addEventListener(
    'mousemove',
    () => {
      if (padNavActive) setPadCursorMode(false);
    },
    { passive: true },
  );
}

function setPadCursorMode(on: boolean): void {
  if (padNavActive === on) return;
  padNavActive = on;
  try {
    document.body.classList.toggle(PAD_NAV_CLASS, on);
  } catch {
    /* no DOM */
  }
  if (!on && cursorEl) cursorEl.style.display = 'none';
}

function markPadFocus(el: HTMLElement): void {
  if (marked !== el) {
    marked?.classList.remove(PAD_FOCUS_CLASS);
    el.classList.add(PAD_FOCUS_CLASS);
    marked = el;
  }
  // Anchor the pointer to the selection's top-left corner, the way FFXIV parks
  // it: on the element, not centred over it, so it never hides the label.
  const cursor = ensureCursor();
  if (!cursor) return;
  watchForRealPointer();
  setPadCursorMode(true);
  const r = el.getBoundingClientRect();
  cursor.style.left = `${r.left}px`;
  cursor.style.top = `${r.top}px`;
  cursor.style.display = 'block';
}

/** Drop the highlight and park the pointer when the pad leaves UI navigation. */
export function clearPadFocus(): void {
  marked?.classList?.remove(PAD_FOCUS_CLASS);
  marked = null;
  setPadCursorMode(false);
}

/**
 * Land focus on the first control of a newly opened window, so a pad player does
 * not have to press a direction just to get in. Answers false when no window is
 * open or it holds nothing focusable, which leaves the pointer alone.
 *
 * Deliberately requires a real window rather than falling back to the document:
 * auto-focusing the whole page on any state change would yank focus around the
 * HUD instead of landing inside the thing that just opened.
 */
export function focusFirstInWindow(): boolean {
  if (typeof document === 'undefined') return false;
  const root = activeRoot();
  if (!root) return false;
  const els = focusables(root);
  if (els.length === 0) return false;
  els[0].focus();
  markPadFocus(els[0]);
  return true;
}

/** Press whatever the d-pad has focused. Answers false when nothing is focused,
 *  so the caller can fall back to clicking at the free cursor instead. */
export function pressDpadFocus(): boolean {
  if (typeof document === 'undefined') return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return false;
  const root = activeRoot() ?? document;
  // Only press something the navigation itself could have reached: an unrelated
  // element holding focus (a chat input) must not be clicked by the A button.
  if (!focusables(root).includes(active)) return false;
  active.click();
  return true;
}
