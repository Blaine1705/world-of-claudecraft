import { describe, expect, it } from 'vitest';
import {
  clampMobilePage,
  MOBILE_ACTION_BUTTONS,
  MOBILE_ACTION_PAGE_COUNT,
  MOBILE_ACTION_SOURCE_SLOT_COUNT,
  MOBILE_ACTIONS_PER_PAGE,
  mobileActionSourceSlotCount,
  mobileButtonHasSourceSlot,
  mobilePageCount,
  nextMobilePage,
  sourceSlotForMobileButton,
  sourceSlotsForMobilePage,
} from '../src/ui/hud/action_bar/mobile_action_page_view';
import {
  RADIAL_DIRECTIONS,
  RADIAL_SLOTS_PER_BUTTON,
} from '../src/ui/hud/action_bar/radial_action_core';

describe('mobilePageCount', () => {
  it('covers all 33 configurable action slots in two pages of four radial buttons', () => {
    expect(MOBILE_ACTION_SOURCE_SLOT_COUNT).toBe(33);
    expect(MOBILE_ACTION_BUTTONS).toBe(4);
    expect(MOBILE_ACTIONS_PER_PAGE).toBe(MOBILE_ACTION_BUTTONS * RADIAL_SLOTS_PER_BUTTON);
    expect(MOBILE_ACTIONS_PER_PAGE).toBe(20);
    expect(mobilePageCount()).toBe(2);
    expect(mobilePageCount(MOBILE_ACTION_SOURCE_SLOT_COUNT)).toBe(2);
    expect(MOBILE_ACTION_PAGE_COUNT).toBe(mobilePageCount());
  });

  it('is parameterized: a different total slot count rounds up', () => {
    expect(mobilePageCount(1)).toBe(1);
    expect(mobilePageCount(20)).toBe(1);
    expect(mobilePageCount(21)).toBe(2);
    expect(mobilePageCount(41)).toBe(3);
    expect(mobilePageCount(0)).toBe(1);
  });

  it('uses only enabled action-bar rows when deriving the mobile page count', () => {
    expect(mobileActionSourceSlotCount({ secondary: false, third: false })).toBe(11);
    expect(mobilePageCount(mobileActionSourceSlotCount({ secondary: false, third: false }))).toBe(
      1,
    );
    expect(mobileActionSourceSlotCount({ secondary: true, third: false })).toBe(22);
    expect(mobilePageCount(mobileActionSourceSlotCount({ secondary: true, third: false }))).toBe(2);
    expect(mobileActionSourceSlotCount({ secondary: true, third: true })).toBe(33);
    expect(mobilePageCount(mobileActionSourceSlotCount({ secondary: true, third: true }))).toBe(2);
  });
});

describe('clampMobilePage', () => {
  it('leaves an in-range page unchanged', () => {
    expect(clampMobilePage(0)).toBe(0);
    expect(clampMobilePage(1)).toBe(1);
  });

  it('clamps a negative page to 0', () => {
    expect(clampMobilePage(-1)).toBe(0);
    expect(clampMobilePage(-100)).toBe(0);
  });

  it('clamps an overflowing page to the last page', () => {
    expect(clampMobilePage(2)).toBe(1);
    expect(clampMobilePage(999)).toBe(1);
  });

  it('falls back to 0 for NaN', () => {
    expect(clampMobilePage(Number.NaN)).toBe(0);
  });

  it('respects a parameterized page count', () => {
    expect(clampMobilePage(2, 3)).toBe(2);
    expect(clampMobilePage(5, 3)).toBe(2);
  });
});

describe('sourceSlotForMobileButton', () => {
  it('defaults to the centre tap, whose slots are the desktop 1 to 4 keys', () => {
    expect([0, 1, 2, 3].map((i) => sourceSlotForMobileButton(0, i))).toEqual([1, 2, 3, 4]);
    expect([0, 1, 2, 3].map((i) => sourceSlotForMobileButton(0, i, 'center'))).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('is direction-major: each direction takes the next block of four slots', () => {
    expect(RADIAL_DIRECTIONS.map((d) => sourceSlotForMobileButton(0, 0, d))).toEqual([
      1, 5, 9, 13, 17,
    ]);
    expect(RADIAL_DIRECTIONS.map((d) => sourceSlotForMobileButton(0, 3, d))).toEqual([
      4, 8, 12, 16, 20,
    ]);
  });

  it('advances a whole page span of twenty on page 1', () => {
    expect(sourceSlotForMobileButton(1, 0)).toBe(21);
    expect(sourceSlotForMobileButton(1, 3)).toBe(24);
    expect(sourceSlotForMobileButton(1, 0, 'left')).toBe(37);
  });

  it('never returns slot 0 across every page/button/direction combination', () => {
    for (let page = 0; page < MOBILE_ACTION_PAGE_COUNT; page++) {
      for (let i = 0; i < MOBILE_ACTION_BUTTONS; i++) {
        for (const direction of RADIAL_DIRECTIONS) {
          expect(sourceSlotForMobileButton(page, i, direction)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('maps every button/direction pair on a page to a DISTINCT slot', () => {
    const seen = new Set<number>();
    for (let page = 0; page < MOBILE_ACTION_PAGE_COUNT; page++) {
      for (let i = 0; i < MOBILE_ACTION_BUTTONS; i++) {
        for (const direction of RADIAL_DIRECTIONS) {
          seen.add(sourceSlotForMobileButton(page, i, direction));
        }
      }
    }
    expect(seen.size).toBe(MOBILE_ACTION_PAGE_COUNT * MOBILE_ACTIONS_PER_PAGE);
  });
});

describe('mobileButtonHasSourceSlot', () => {
  it('keeps every centre live on both pages at the full 33-slot span', () => {
    for (let page = 0; page < MOBILE_ACTION_PAGE_COUNT; page++) {
      for (let i = 0; i < MOBILE_ACTION_BUTTONS; i++) {
        expect(mobileButtonHasSourceSlot(page, i), `page ${page} button ${i}`).toBe(true);
      }
    }
  });

  it('hides the directions whose slot falls past the reachable span', () => {
    // Page 1 spans slots 21 to 40, so its down direction straddles the end of
    // the 33-slot span (button 0 is slot 33, button 1 is 34) and its whole left
    // direction (37 to 40) is past it.
    expect(mobileButtonHasSourceSlot(1, 0, MOBILE_ACTION_SOURCE_SLOT_COUNT, 'down')).toBe(true);
    expect(mobileButtonHasSourceSlot(1, 1, MOBILE_ACTION_SOURCE_SLOT_COUNT, 'down')).toBe(false);
    expect(mobileButtonHasSourceSlot(1, 0, MOBILE_ACTION_SOURCE_SLOT_COUNT, 'left')).toBe(false);
    expect(mobileButtonHasSourceSlot(0, 3, MOBILE_ACTION_SOURCE_SLOT_COUNT, 'left')).toBe(true);
  });

  it('respects a narrowed span when the optional desktop rows are hidden', () => {
    const primaryOnly = mobileActionSourceSlotCount({ secondary: false, third: false });
    expect(mobileButtonHasSourceSlot(0, 2, primaryOnly, 'right')).toBe(true); // slot 11
    expect(mobileButtonHasSourceSlot(0, 3, primaryOnly, 'right')).toBe(false); // slot 12
  });
});

describe('sourceSlotsForMobilePage', () => {
  it('returns the page span, one slot per button/direction pair', () => {
    for (let page = 0; page < MOBILE_ACTION_PAGE_COUNT; page++) {
      expect(sourceSlotsForMobilePage(page)).toHaveLength(MOBILE_ACTIONS_PER_PAGE);
    }
    expect(sourceSlotsForMobilePage(0)[0]).toBe(1);
    expect(sourceSlotsForMobilePage(1)[0]).toBe(21);
  });

  it('contains exactly the slots the page reaches, so a slot lookup finds its page', () => {
    for (let page = 0; page < MOBILE_ACTION_PAGE_COUNT; page++) {
      const listed = new Set(sourceSlotsForMobilePage(page));
      for (let i = 0; i < MOBILE_ACTION_BUTTONS; i++) {
        for (const direction of RADIAL_DIRECTIONS) {
          expect(listed.has(sourceSlotForMobileButton(page, i, direction))).toBe(true);
        }
      }
    }
  });

  it('the two pages expose every configurable slot, with an empty tail past 33', () => {
    const all = Array.from({ length: MOBILE_ACTION_PAGE_COUNT }, (_, page) =>
      sourceSlotsForMobilePage(page),
    ).flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all.slice(0, MOBILE_ACTION_SOURCE_SLOT_COUNT)).toEqual(
      Array.from({ length: 33 }, (_, index) => index + 1),
    );
    expect(all.slice(MOBILE_ACTION_SOURCE_SLOT_COUNT)).toEqual([34, 35, 36, 37, 38, 39, 40]);
  });
});

describe('nextMobilePage', () => {
  it('advances through the default span and wraps after the last page', () => {
    expect(nextMobilePage(0)).toBe(1);
    expect(nextMobilePage(1)).toBe(0);
  });

  it('clamps an out-of-range page before advancing', () => {
    expect(nextMobilePage(-1)).toBe(1);
    expect(nextMobilePage(99)).toBe(0);
  });

  it('respects a parameterized page count', () => {
    expect(nextMobilePage(0, 3)).toBe(1);
    expect(nextMobilePage(1, 3)).toBe(2);
    expect(nextMobilePage(2, 3)).toBe(0);
  });

  it('wraps within the enabled-row page count after optional bars are disabled', () => {
    const primaryOnlyCount = mobilePageCount(
      mobileActionSourceSlotCount({ secondary: false, third: false }),
    );
    const secondaryCount = mobilePageCount(
      mobileActionSourceSlotCount({ secondary: true, third: false }),
    );

    expect(nextMobilePage(0, primaryOnlyCount)).toBe(0);
    expect(nextMobilePage(1, secondaryCount)).toBe(0);
    expect(clampMobilePage(6, primaryOnlyCount)).toBe(0);
    expect(clampMobilePage(6, secondaryCount)).toBe(1);
  });
});
