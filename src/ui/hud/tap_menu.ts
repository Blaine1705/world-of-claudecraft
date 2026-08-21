// The two host-reaching halves of tap mode (settings.touchTapMenus): reading the
// setting live, and the tap-outside dismissal every sticky menu shares. The RULES
// live in tap_menu_core.ts; this module holds only what needs a browser.
// Registered in tests/architecture.test.ts UI_DOM_MODULES.
//
// Both exist once rather than three times: the action radial, the consumables row
// and the menu strip must agree about what tap mode is, and a per-controller copy
// of either half is how they would stop agreeing.

import { Settings } from '../../game/settings';

/**
 * Whether tap mode is on, read at press time.
 *
 * A fresh Settings read rather than a cached instance, matching main.ts: the
 * options panel writes through its own instance, so a cached one here would go
 * stale the moment the player flipped the row. This runs once per press, never
 * per frame.
 */
export function tapMenusEnabled(): boolean {
  return new Settings().get('touchTapMenus');
}

/**
 * Dismiss an open tap-mode menu when the next press lands outside it.
 *
 * CAPTURE phase on the document, which is what keeps this from swallowing the
 * very press that opened the menu: the listener is added while that press is
 * being dispatched at the control, by which point the document's capture step has
 * already passed, so the event cannot reach a listener registered here. The
 * `inside` check then covers every later press on the control or its own items.
 *
 * Returns the disarm function; call it when the menu closes, from any path.
 */
export function armTapMenuOutsideDismiss(
  inside: () => readonly (HTMLElement | null | undefined)[],
  onOutside: () => void,
): () => void {
  const onDown = (e: Event) => {
    const target = e.target as Node | null;
    if (target !== null && inside().some((el) => el?.contains(target))) return;
    onOutside();
  };
  document.addEventListener('pointerdown', onDown, true);
  return () => document.removeEventListener('pointerdown', onDown, true);
}
