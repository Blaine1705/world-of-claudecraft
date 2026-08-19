// Pointer-only blur for HUD chrome buttons, the fix for "Space reopens the last
// menu I clicked": a mouse click on a chrome button (micromenu, panel button,
// chat tab) leaves that button holding document focus indefinitely, because the
// game canvas is not focusable and never takes it back. The next Space keydown
// that escapes the game layer's preventDefault (any blocked-input state, see
// src/game/input.ts) then natively re-activates that stale button.
//
// The discriminator is UIEvent.detail: a click event with detail > 0 is
// pointer-driven (detail is the click count); keyboard activation (Space/Enter
// on a focused button) and programmatic el.click() dispatch with detail === 0.
// Blurring ONLY the pointer path keeps keyboard users' focus position intact,
// and keeps the focus-restore-to-trigger accessibility pattern working: a
// window opened by keyboard still records its opener (the focused trigger),
// while a window opened by mouse records none, so closing it cannot re-plant
// stale focus on the trigger.
//
// Host-agnostic on purpose (no browser globals, everything reached off the
// passed event/elements), so it stays in the default architecture bucket and
// unit-tests in plain Node against hand-rolled fakes.

/** A click event as far as this module needs it. */
export interface ClickLike {
  detail: number;
  target: unknown;
}

/** The slice of an element the blur path touches. */
export interface BlurrableEl {
  blur(): void;
}

/** Blur `el` when the click that activated it was pointer-driven (mouse, touch,
 *  pen); leave keyboard and programmatic activations focused. */
export function blurIfPointerClick(e: ClickLike, el: BlurrableEl | null | undefined): void {
  if (e.detail > 0) el?.blur();
}

interface DelegateEl {
  closest(selector: string): DelegateEl | null;
  blur(): void;
}

interface ListenerHost {
  addEventListener(
    type: string,
    listener: (e: Event) => void,
    options?: boolean | { capture?: boolean },
  ): void;
}

/** Delegated pointer-only blur for every `selector` match inside `container`.
 *  Capture phase on purpose: the blur lands BEFORE the button's own click
 *  handler runs, so a toggle that opens a window and records the current
 *  focused element as its return-focus opener (FocusManager.activeFocusable)
 *  sees no stale opener on the mouse path. Keyboard activation (detail 0) is
 *  untouched, so the opener capture and focus-restore still work for it. */
export function bindPointerBlur(container: ListenerHost, selector = 'button'): void {
  container.addEventListener(
    'click',
    (e) => {
      const click = e as unknown as ClickLike;
      if (click.detail <= 0) return;
      const target = click.target as DelegateEl | null;
      target?.closest(selector)?.blur();
    },
    true,
  );
}

/** Keep Enter/Space activation of a focused chrome button native: stop the
 *  keydown from bubbling to the window-level game keybinds (Enter is Open
 *  Chat, Space is preventDefault-ed for jump), WITHOUT preventing the default,
 *  so the button's own activation still fires for keyboard users. This is the
 *  panel-guard contract that already protects the delve board, map, bank and
 *  bags panels in hud.ts, shared so the micromenu rail takes the same one. */
export function bindChromeButtonKeyGuard(container: ListenerHost): void {
  container.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    const target = ke.target as { tagName?: string } | null;
    if (target?.tagName !== 'BUTTON') return;
    if (ke.key === 'Enter' || ke.key === ' ' || ke.code === 'Space') ke.stopPropagation();
  });
}
