// The opt-in virtual mouse: a real pointer the right stick drives, for the times
// a pad player wants to poke at something the focus order cannot reach (dragging
// an item between bags, a spot on the map). FFXIV ships exactly this alongside its
// focus navigation, toggled with LB + right-stick-click, and it is opt-in there
// for the same reason it is here: steering a cursor to a button is slower than
// stepping onto it, so it is the escape hatch rather than the default.
//
// Distinct from dpad_focus_nav, which is the everyday path. This module owns only
// the pointer element, its position, and synthesising clicks under it.

const CURSOR_ID = 'pad-mouse-cursor';
/** Pixels per second at full stick deflection. */
export const PAD_MOUSE_SPEED = 900;

let cursorEl: HTMLElement | null = null;
let x = 0;
let y = 0;
let placed = false;

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

/** Screen position of the virtual pointer, for a caller that needs to aim. */
export function padMousePosition(): { x: number; y: number } {
  return { x, y };
}

/**
 * Move the pointer by one frame of stick deflection and draw it. `dx`/`dy` are
 * the post-deadzone stick vector; `dt` keeps the speed resolution-independent.
 * Answers whether the player actually moved it.
 */
export function updatePadMouse(dx: number, dy: number, dt: number): boolean {
  const el = ensureCursor();
  if (!el) return false;
  if (!placed) {
    // Open in the middle rather than at 0,0, so the first nudge is visible.
    x = window.innerWidth / 2;
    y = window.innerHeight / 2;
    placed = true;
  }
  el.style.display = 'block';
  if (dx === 0 && dy === 0) return false;
  x = Math.min(window.innerWidth, Math.max(0, x + dx * PAD_MOUSE_SPEED * dt));
  y = Math.min(window.innerHeight, Math.max(0, y + dy * PAD_MOUSE_SPEED * dt));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  return true;
}

/** Put the pointer away when mouse mode ends. */
export function hidePadMouse(): void {
  if (cursorEl) cursorEl.style.display = 'none';
}

/**
 * Synthesise a click under the pointer, reusing every DOM handler already wired
 * for a real mouse (use, equip, sell, trade). `button` is the DOM convention:
 * 0 left, 2 right.
 */
export function clickPadMouse(button: 0 | 2): void {
  // elementFromPoint is browser-only and absent from partial DOMs (headless env
  // server, unit stubs), where there is nothing under the pointer anyway.
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return;
  // The pointer must not be the element the click lands on.
  hidePadMouse();
  const target = document.elementFromPoint(x, y) as HTMLElement | null;
  if (cursorEl) cursorEl.style.display = 'block';
  if (!target) return;
  const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, button };
  target.dispatchEvent(new MouseEvent('mousedown', init));
  target.dispatchEvent(new MouseEvent('mouseup', init));
  if (button === 0) target.click();
  else target.dispatchEvent(new MouseEvent('contextmenu', init));
}
