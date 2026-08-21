// Pure, DOM-free decision core for the touch menu control: the strip roster, what
// a release means, when the row comes up, and where the live item's caption is
// parked. The geometry itself is reused from radial_action_core.ts
// (placeConsumableStrip / resolveStripIndex), so the menu strip and the
// consumables row share one tested implementation. Registered in
// tests/architecture.test.ts UI_PURE_CORES.
//
// The control replaces the old five-button row (Chat, Social, Quests, Settings,
// More), which sat further from either thumb than anything else in the HUD. A tap
// opens chat, the action a player reaches for mid-session far more than the rest;
// a hold or a rightward swipe opens the nine-item strip.
//
// The roster is ordered by how often a player reaches for it, because swipe
// distance IS the cost: item 0 is one flick away, item 8 is the length of the row.
// Mount leads it, which is the answer to issue #2739: today mount is two taps
// behind the More modal, and here it is the shortest gesture on the control.

import type { TranslationKey } from '../../i18n';

/** The strip roster's stable ids. Order is load-bearing (it IS the row order). */
export type MenuActionId =
  | 'mount'
  | 'map'
  | 'bags'
  | 'social'
  | 'quest'
  | 'char'
  | 'spellbook'
  | 'settings'
  | 'more';

export interface MenuStripItem {
  id: MenuActionId;
  /**
   * The id of the REAL button the strip seats. Four of them are the old row's own
   * buttons and five are promotions out of the More tray, but every one is a
   * button the touch HUD already binds, so a pick routes through the existing
   * handler instead of a second copy of the action.
   */
  elementId: string;
  /** The caption shown while the finger is over the item. */
  captionKey: TranslationKey;
}

export const MENU_STRIP_ITEMS: readonly MenuStripItem[] = [
  { id: 'mount', elementId: 'mobile-menu-mount', captionKey: 'hudChrome.mounts.mount' },
  { id: 'map', elementId: 'mobile-menu-map', captionKey: 'hud.core.mobileMap' },
  { id: 'bags', elementId: 'mobile-menu-bags', captionKey: 'hud.keybinds.actions.bags' },
  { id: 'social', elementId: 'mobile-social', captionKey: 'hud.core.mobileSocial' },
  { id: 'quest', elementId: 'mobile-quest', captionKey: 'questUi.tracker.title' },
  { id: 'char', elementId: 'mobile-menu-char', captionKey: 'hud.keybinds.actions.char' },
  { id: 'spellbook', elementId: 'mobile-menu-spellbook', captionKey: 'abilityUi.spellbook.title' },
  { id: 'settings', elementId: 'mobile-menu', captionKey: 'hud.core.mobileSettings' },
  { id: 'more', elementId: 'mobile-more', captionKey: 'hud.core.mobileMore' },
];

export const MENU_STRIP_COUNT = MENU_STRIP_ITEMS.length;

/** The row grows rightward: the control sits at the left of the bottom band, so
 *  the whole screen width is in front of it. Fixed rather than resolved per
 *  gesture, because the muscle memory the roster order buys depends on the
 *  direction never changing under the player. */
export const MENU_STRIP_DIRECTION = 'right' as const;

/** Travel between adjacent items as the FINGER sees it, matching the consumables
 *  row: at the drawn spacing the ninth item would need well over 500px of drag,
 *  far past a comfortable thumb arc. */
export const MENU_STRIP_PITCH_PX = 34;

/** Nominal half-width of the caption box, used to clamp its centre on screen
 *  without measuring it (a painter may take no forced layout read). Wider than
 *  the longest roster caption at the compact tier's text size, so the clamp
 *  errs toward keeping the box fully visible. */
export const MENU_CAPTION_HALF_PX = 56;

/** What a release on the control does. */
export type MenuStripOutcome =
  | { kind: 'default' }
  | { kind: 'pick'; index: number }
  | { kind: 'cancel' };

export interface MenuStripReleaseInput {
  /** resolveStripIndex's readout: -1 while the finger is still in the deadzone. */
  index: number;
  /** Whether the row was showing when the finger came up. */
  revealed: boolean;
  count: number;
}

/**
 * The release rule. A bare tap runs the DEFAULT action (chat), so the control is
 * still a one-tap chat button for the player who never learns the gesture. Once
 * the row is OPEN, a release back in the anchor's own band means the player
 * looked and chose nothing, so back out instead of opening something they did
 * not pick.
 */
export function resolveMenuStripRelease(input: MenuStripReleaseInput): MenuStripOutcome {
  if (input.count <= 0) return { kind: 'default' };
  if (input.revealed && input.index < 0) return { kind: 'cancel' };
  if (input.index < 0) return { kind: 'default' };
  return { kind: 'pick', index: Math.min(input.index, input.count - 1) };
}

/**
 * Whether the cancel target is the live choice. It is a PLACE, not a direction:
 * the X sits on the anchor itself, so the band the finger started in is the way
 * out and the Y a thumb arc wanders to never matters.
 */
export function menuStripCancelIsLive(index: number, revealed: boolean): boolean {
  return revealed && index < 0;
}

/**
 * Whether a drag that just moved onto an item should pull the row up early.
 * Passing the deadzone is itself intent, so the player never waits out the
 * reveal timer to see what they already committed to.
 */
export function shouldRevealMenuStrip(index: number, revealed: boolean): boolean {
  return !revealed && index >= 0;
}

export interface MenuCaptionInput {
  /** Item centres from placeConsumableStrip, index 0 nearest the anchor. */
  centers: readonly number[];
  /** The item the finger is over, or -1 for none. */
  live: number;
  viewportWidth: number;
  margin: number;
  halfWidth?: number;
}

/**
 * Where the caption's centre parks: over the live item, clamped so the box stays
 * on screen. Returns null when nothing is live, which is what hides it: ONE
 * caption for the item being chosen, never nine permanent labels (nine captions
 * at this pitch collide and clip, and they name eight things the player is not
 * choosing).
 */
export function menuCaptionCenterX(input: MenuCaptionInput): number | null {
  const center = input.live >= 0 ? input.centers[input.live] : undefined;
  if (center === undefined || !Number.isFinite(center)) return null;
  const half = input.halfWidth ?? MENU_CAPTION_HALF_PX;
  const min = input.margin + half;
  const max = input.viewportWidth - input.margin - half;
  // A viewport narrower than the caption itself cannot satisfy both bounds; the
  // centre is the least-bad answer and keeps the box symmetric.
  if (max < min) return input.viewportWidth / 2;
  return Math.min(Math.max(center, min), max);
}
