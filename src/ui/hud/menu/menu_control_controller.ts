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
// The static markup lives in index.html / play.html (#mobile-menu-anchor,
// #mobile-menu-strip). On a build that omits it, buildMobileMenuControl returns
// null and the control silently stays unbuilt, exactly like the ring.

import { t } from '../../i18n';
import { makeWriterFacet, type PainterHostWriters } from '../../painter_host';
import { MENU_STRIP_ITEMS } from './menu_strip_core';
import { MenuStripGesture } from './menu_strip_gesture_controller';
import { MenuStripPainter } from './menu_strip_painter';

const ANCHOR_ID = 'mobile-menu-anchor';
const STRIP_ID = 'mobile-menu-strip';
const CANCEL_ID = 'mobile-menu-cancel';
const CAPTION_ID = 'mobile-menu-caption';
const CAPTION_TEXT_SELECTOR = '.tt-title';

export interface MobileMenuControlDeps {
  /** A bare tap on the control: the same chat toggle the old Chat button ran. */
  runDefault(): void;
  /** The player opened the strip and chose nothing. */
  onCancel?(): void;
  /**
   * Optional writer facet. The control is gesture-driven cold chrome with no
   * per-frame HUD paint behind it, so it owns a small facet of its own by
   * default rather than reaching into the coordinator's shared caches.
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

  const painter = new MenuStripPainter(deps.writers ?? ownWriters(), {
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
  return { gesture, anchor };
}
