// Pure, DOM-free decision core for tap mode (settings.touchTapMenus): what a
// press MEANS on any of the three touch gesture menus (the action radial, the
// consumables row, the menu strip). The DOM halves live in the three gesture
// controllers, which own no rule of their own here, so a Vitest drives every
// branch without a browser. Registered in tests/architecture.test.ts
// UI_PURE_CORES.
//
// WHY ONE CORE FOR THREE MENUS. Tap mode has to behave identically everywhere or
// it is not a mode, it is three dialects: touching the control opens, touching an
// item chooses, touching the control again runs its default, and touching outside
// dismisses. Three controllers each re-deriving that table would drift on the
// first fix. They ask this instead.
//
// Only the ANCHOR press depends on the setting: with tap mode off the anchor
// press belongs to the gesture layer, unchanged. Item and outside presses only
// ever arrive while a sticky menu is already open, which is a state assistive
// activation can reach with the setting off too.

/** Where a press landed, relative to the menu it concerns. */
export type TapMenuPressTarget = 'anchor' | 'item' | 'outside';

/**
 * What a press does.
 *  - `open`: reveal the menu as a persistent, focusable one. Casts nothing.
 *  - `choose`: activate the revealed item at `index`.
 *  - `default`: run the control's default action (its centre slot, its first
 *    consumable, the menu control's tap default).
 *  - `dismiss`: the player looked and chose nothing.
 *  - `gesture`: not tap mode; the press belongs to the gesture layer.
 *  - `none`: nothing to do (a press that cannot mean anything in this state).
 */
export type TapMenuPress =
  | { readonly kind: 'open' }
  | { readonly kind: 'choose'; readonly index: number }
  | { readonly kind: 'default' }
  | { readonly kind: 'dismiss' }
  | { readonly kind: 'gesture' }
  | { readonly kind: 'none' };

export interface TapMenuPressInput {
  /** settings.touchTapMenus, read live at press time. */
  readonly tapMenus: boolean;
  /** Whether THIS control's menu is open right now. */
  readonly open: boolean;
  readonly target: TapMenuPressTarget;
  /** Row position of an item press, in the order the items are seated. */
  readonly index?: number;
}

/**
 * The whole tap-mode table, as one transition.
 *
 * An anchor press with the setting OFF is always 'gesture', including while a
 * sticky menu is open: that is the assistive path, where the gesture layer's own
 * guard already ignores the press, and tap mode must not change what the setting
 * being off does.
 *
 * An outside press is only a dismissal in tap mode, for the same reason: the
 * document-level listener that reports one exists only while tap mode holds a
 * menu open.
 */
export function resolveTapMenuPress(input: TapMenuPressInput): TapMenuPress {
  if (input.target === 'anchor') {
    if (!input.tapMenus) return { kind: 'gesture' };
    return input.open ? { kind: 'default' } : { kind: 'open' };
  }
  if (input.target === 'item') {
    const index = input.index ?? -1;
    if (!input.open || index < 0) return { kind: 'none' };
    return { kind: 'choose', index };
  }
  if (!input.open || !input.tapMenus) return { kind: 'none' };
  return { kind: 'dismiss' };
}
