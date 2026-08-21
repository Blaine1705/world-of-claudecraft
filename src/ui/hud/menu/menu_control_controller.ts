// Builds and wires the touch menu control: the single seat that replaces the old
// five-button row, plus the nine-item strip it opens (Phase 4 of the touch
// rework). The row it replaces sat 365 to 443px from the nearer thumb, the least
// reachable chrome in the HUD, and buried Mount two taps behind the More modal
// (issue #2739); the strip puts Mount at the shortest gesture on the control.
//
// Nothing here reimplements an action. Every strip item is a REAL button the
// touch HUD already binds (four of them are the old row's own buttons, five are
// promotions out of the More tray), so a pick activates that button and the
// action runs through its existing handler. The default action (chat) is the one
// exception: the chat button carries its own press-and-hold log peek, so it stays
// where it is and the owner hands us its tap as a callback.
//
// The ANCHOR'S ACCESSIBLE NAME depends on the MODE, which is why this module
// owns it rather than the static markup alone. A touch device has no hover to
// discover the gesture with, so the name teaches it; under settings.touchTapMenus
// a tap OPENS the strip and does not open chat, so the gesture sentence would
// tell a screen-reader user the opposite of what the control does. It is rewritten
// on the settings broadcast and again after a language switch, because the shell's
// data-i18n-aria pass re-stamps the gesture-mode name on every locale change.
//
// The static markup lives in index.html / play.html (#mobile-menu-anchor,
// #mobile-menu-strip). On a build that omits it, buildMobileMenuControl returns
// null and the control silently stays unbuilt, exactly like the ring.

import { SETTINGS_CHANGE_EVENT } from '../../../game/settings';
import { type TranslationKey, t } from '../../i18n';
import { makeWriterFacet, type PainterHostWriters } from '../../painter_host';
import { tapMenusEnabled } from '../tap_menu';
import { MENU_STRIP_ITEMS } from './menu_strip_core';
import { MenuStripGesture } from './menu_strip_gesture_controller';
import { MenuStripPainter } from './menu_strip_painter';

const ANCHOR_ID = 'mobile-menu-anchor';
const STRIP_ID = 'mobile-menu-strip';
const CANCEL_ID = 'mobile-menu-cancel';
const CAPTION_ID = 'mobile-menu-caption';
const CAPTION_TEXT_SELECTOR = '.tt-title';
const ARIA_LABEL_ATTR = 'aria-label';
/** The two accessible names, one per mode. The gesture one is also the static
 *  markup's `data-i18n-aria`, so an unbuilt control still says something true. */
const GESTURE_ARIA_KEY: TranslationKey = 'hudChrome.mobile.menuControlAria';
const TAP_ARIA_KEY: TranslationKey = 'hudChrome.mobile.menuControlAriaTap';

export interface MobileMenuControlDeps {
  /** A bare tap on the control: the same chat toggle the old Chat button ran. */
  runDefault(): void;
  /** The player opened the strip and chose nothing. */
  onCancel?(): void;
  /**
   * Optional writer facet. The control is gesture-driven cold chrome with no
   * per-frame HUD paint behind it, and its composition point (MobileControls,
   * built in src/main.ts) has no facet to hand down, so it owns a small one of
   * its own by default. The exception is recorded in src/ui/hud/CLAUDE.md next to
   * the "do not create a second write cache" rule; nothing it writes is on a
   * frame band and its elements are static, so no cache entry is ever stranded.
   */
  writers?: PainterHostWriters;
}

export interface MobileMenuControl {
  gesture: MenuStripGesture;
  anchor: HTMLButtonElement;
}

function ownWriters(): PainterHostWriters {
  return makeWriterFacet(
    new Map(),
    new Map(),
    new Map(),
    new Map(),
    () => {},
    () => {},
  );
}

/** Build the control, or return null when the markup is absent. */
export function buildMobileMenuControl(deps: MobileMenuControlDeps): MobileMenuControl | null {
  const anchor = document.getElementById(ANCHOR_ID) as HTMLButtonElement | null;
  const strip = document.getElementById(STRIP_ID);
  const cancel = document.getElementById(CANCEL_ID);
  const caption = document.getElementById(CAPTION_ID);
  const captionText = caption?.querySelector<HTMLElement>(CAPTION_TEXT_SELECTOR) ?? null;
  if (!anchor || !strip || !cancel || !caption || !captionText) return null;
  const items = MENU_STRIP_ITEMS.map((item) => document.getElementById(item.elementId));
  if (items.some((el) => el === null)) return null;
  const itemEls = items as HTMLElement[];

  const writers = deps.writers ?? ownWriters();
  const painter = new MenuStripPainter(writers, {
    strip,
    items: itemEls,
    cancel,
    caption,
    captionText,
  });

  const gesture = new MenuStripGesture({
    anchor,
    // The row's geometry tokens live on the overlay, which is a sibling of the
    // anchor so its items are seated in viewport coordinates rather than inside
    // the anchor's own scaled box.
    metricsHost: strip,
    items: itemEls,
    cancel,
    writers,
    tapMenus: () => tapMenusEnabled(),
    pick: (index) => {
      // Activate the real button: the action then runs through the handler the
      // old row or the More tray already bound to it, haptics included.
      itemEls[index]?.click();
      anchor.blur();
    },
    runDefault: () => {
      deps.runDefault();
      anchor.blur();
    },
    onCancel: () => deps.onCancel?.(),
    repaint: () => {
      const open = gesture.openState();
      const live = open?.live ?? -1;
      const item = live >= 0 ? MENU_STRIP_ITEMS[live] : undefined;
      painter.paint(open === null ? null : { ...open, caption: item ? t(item.captionKey) : '' });
    },
  });
  gesture.attach();

  // Deliberately NOT the elided writer: the shell's translatePage() pass writes
  // this same attribute from data-i18n-aria without going through any facet, so
  // an elided writer's cache would disagree with the DOM and skip the correction.
  // A cold path either way (a settings flip, a language switch), never a frame.
  const syncAnchorName = (): void => {
    anchor.setAttribute(ARIA_LABEL_ATTR, t(tapMenusEnabled() ? TAP_ARIA_KEY : GESTURE_ARIA_KEY));
  };
  syncAnchorName();
  window.addEventListener(SETTINGS_CHANGE_EVENT, syncAnchorName);
  // After the shell's own translatePage() pass, which re-stamps the gesture-mode
  // name from data-i18n-aria and would otherwise leave tap mode mislabelled.
  document.addEventListener('woc:languagechange', syncAnchorName);
  return { gesture, anchor };
}
