// The touch menu control's decision core: the roster, the release rules, the
// early reveal, and where the live caption parks. Pure, so every branch is driven
// directly without a browser (the pointer half lives in
// menu_strip_gesture_controller.test.ts).

import { describe, expect, it } from 'vitest';
import {
  MENU_CAPTION_HALF_PX,
  MENU_STRIP_COUNT,
  MENU_STRIP_DIRECTION,
  MENU_STRIP_ITEMS,
  MENU_STRIP_PITCH_PX,
  menuCaptionCenterX,
  menuStripCancelIsLive,
  resolveMenuStripRelease,
  shouldRevealMenuStrip,
} from '../src/ui/hud/menu/menu_strip_core';

describe('the menu strip roster', () => {
  it('leads with Mount, the answer to issue #2739', () => {
    expect(MENU_STRIP_ITEMS[0].id).toBe('mount');
    expect(MENU_STRIP_ITEMS[0].elementId).toBe('mobile-menu-mount');
  });

  it('keeps the frequency order the swipe distance is priced against', () => {
    expect(MENU_STRIP_ITEMS.map((item) => item.id)).toEqual([
      'mount',
      'map',
      'bags',
      'social',
      'quest',
      'char',
      'spellbook',
      'settings',
      'more',
    ]);
    expect(MENU_STRIP_COUNT).toBe(9);
  });

  it('names a REAL button per item, so no action is implemented twice', () => {
    // The four that moved out of the old row keep the ids their handlers are
    // bound to; the five promoted out of the More tray get their own.
    const byId = new Map(MENU_STRIP_ITEMS.map((item) => [item.id, item.elementId]));
    expect(byId.get('social')).toBe('mobile-social');
    expect(byId.get('quest')).toBe('mobile-quest');
    expect(byId.get('settings')).toBe('mobile-menu');
    expect(byId.get('more')).toBe('mobile-more');
    // Every element id is distinct, or two roster positions would fire one button.
    expect(new Set(byId.values()).size).toBe(MENU_STRIP_COUNT);
  });

  it('grows rightward from a control seated at the left of the bottom band', () => {
    expect(MENU_STRIP_DIRECTION).toBe('right');
  });

  it('walks the row in well under a thumb arc at the gesture pitch', () => {
    // The drawn spacing would need over 500px of travel to reach item 8.
    expect(MENU_STRIP_PITCH_PX * (MENU_STRIP_COUNT - 1)).toBeLessThan(300);
  });
});

describe('resolveMenuStripRelease', () => {
  it('runs the default action on a bare tap, so the control is still one tap to chat', () => {
    expect(
      resolveMenuStripRelease({ index: -1, revealed: false, count: MENU_STRIP_COUNT }),
    ).toEqual({ kind: 'default' });
  });

  it('cancels a release back at the anchor once the row is open', () => {
    expect(resolveMenuStripRelease({ index: -1, revealed: true, count: MENU_STRIP_COUNT })).toEqual(
      {
        kind: 'cancel',
      },
    );
  });

  it('picks the item the finger is over', () => {
    expect(resolveMenuStripRelease({ index: 0, revealed: true, count: MENU_STRIP_COUNT })).toEqual({
      kind: 'pick',
      index: 0,
    });
    expect(resolveMenuStripRelease({ index: 8, revealed: true, count: MENU_STRIP_COUNT })).toEqual({
      kind: 'pick',
      index: 8,
    });
  });

  it('clamps a readout past the end of the row onto the last item', () => {
    expect(resolveMenuStripRelease({ index: 99, revealed: true, count: MENU_STRIP_COUNT })).toEqual(
      {
        kind: 'pick',
        index: MENU_STRIP_COUNT - 1,
      },
    );
  });

  it('falls back to the default action with an empty roster', () => {
    expect(resolveMenuStripRelease({ index: 3, revealed: true, count: 0 })).toEqual({
      kind: 'default',
    });
  });
});

describe('menuStripCancelIsLive', () => {
  it('is live only while the row is open and nothing is chosen', () => {
    expect(menuStripCancelIsLive(-1, true)).toBe(true);
    expect(menuStripCancelIsLive(-1, false)).toBe(false);
    expect(menuStripCancelIsLive(0, true)).toBe(false);
  });
});

describe('shouldRevealMenuStrip', () => {
  it('pulls the row up as soon as a drag commits, without waiting out the timer', () => {
    expect(shouldRevealMenuStrip(0, false)).toBe(true);
    expect(shouldRevealMenuStrip(-1, false)).toBe(false);
    expect(shouldRevealMenuStrip(2, true)).toBe(false);
  });
});

describe('menuCaptionCenterX', () => {
  const centers = [100, 160, 220, 280, 340, 400, 460, 520, 580];

  it('hides itself when nothing is live', () => {
    expect(menuCaptionCenterX({ centers, live: -1, viewportWidth: 844, margin: 6 })).toBeNull();
  });

  it('parks over the live item when there is room on both sides', () => {
    expect(menuCaptionCenterX({ centers, live: 3, viewportWidth: 844, margin: 6 })).toBe(280);
  });

  it('clamps the near end so the box never runs off the left edge', () => {
    // A clamped row can seat item 0 inside the caption's own half-width of the
    // edge, which is the case the near bound exists for.
    expect(menuCaptionCenterX({ centers: [24, 84], live: 0, viewportWidth: 844, margin: 6 })).toBe(
      6 + MENU_CAPTION_HALF_PX,
    );
    // A live item with room on both sides is left exactly where it sits.
    expect(menuCaptionCenterX({ centers, live: 0, viewportWidth: 844, margin: 6 })).toBe(100);
  });

  it('clamps the far end against the app viewport, not the drawn row', () => {
    // The 9th item sits at 580 on a 620px box: unclamped the caption would hang
    // off the right edge.
    expect(menuCaptionCenterX({ centers, live: 8, viewportWidth: 620, margin: 6 })).toBe(
      620 - 6 - MENU_CAPTION_HALF_PX,
    );
  });

  it('centres in a viewport too narrow to satisfy both bounds', () => {
    expect(menuCaptionCenterX({ centers, live: 4, viewportWidth: 80, margin: 6 })).toBe(40);
  });

  it('reports nothing for a live index the placement never filled', () => {
    expect(menuCaptionCenterX({ centers: [], live: 0, viewportWidth: 844, margin: 6 })).toBeNull();
  });
});
