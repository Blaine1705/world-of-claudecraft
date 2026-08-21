// @vitest-environment happy-dom

// The tracker-stack seat: trackerStackAnchorTopPx (the pure math in
// tracker_stack_anchor_core.ts) and the TrackerStackAnchor applier that
// measures the live minimap column and writes #right-tracker-stack's top.
// The seat exists because the stylesheet's per-tier `top` constants cannot see
// a wrapping zone label, the mobile chrome scale, or the compact-tier
// transform; the compact tier really did paint the Reliquary chip over the
// compass and clock (the bug that minted this module).

import { describe, expect, it } from 'vitest';
import { installTrackerStackAnchor, TrackerStackAnchor } from '../src/ui/tracker_stack_anchor';
import {
  TRACKER_STACK_ANCHOR_GAP_PX,
  trackerStackAnchorTopPx,
} from '../src/ui/tracker_stack_anchor_core';

describe('trackerStackAnchorTopPx', () => {
  it('seats the stack a gap below the minimap bottom', () => {
    expect(
      trackerStackAnchorTopPx({ minimapBottomPx: 268, overhangBottomsPx: [], uiScale: 1 }),
    ).toBe(268 + TRACKER_STACK_ANCHOR_GAP_PX);
  });

  it('lets the lowest overhang win: the desktop zoom pill hangs below the wrap box', () => {
    expect(
      trackerStackAnchorTopPx({ minimapBottomPx: 268, overhangBottomsPx: [274, 240], uiScale: 1 }),
    ).toBe(274 + TRACKER_STACK_ANCHOR_GAP_PX);
    // An overhang ABOVE the wrap bottom (hidden element, zero rect) never pulls
    // the seat up.
    expect(
      trackerStackAnchorTopPx({ minimapBottomPx: 268, overhangBottomsPx: [0], uiScale: 1 }),
    ).toBe(268 + TRACKER_STACK_ANCHOR_GAP_PX);
  });

  it('divides the measured (visual) bottom back into UI space before writing', () => {
    // At uiScale 1.25 a 335px visual bottom is a 268px UI-space bottom: the
    // `top` the caller writes lives INSIDE the zoomed #ui layer.
    expect(
      trackerStackAnchorTopPx({ minimapBottomPx: 335, overhangBottomsPx: [], uiScale: 1.25 }),
    ).toBe(268 + TRACKER_STACK_ANCHOR_GAP_PX);
  });

  it('guards a broken scale (0 or NaN falls back to 1, never Infinity/NaN tops)', () => {
    expect(
      trackerStackAnchorTopPx({ minimapBottomPx: 268, overhangBottomsPx: [], uiScale: 0 }),
    ).toBe(268 + TRACKER_STACK_ANCHOR_GAP_PX);
    expect(
      trackerStackAnchorTopPx({ minimapBottomPx: 268, overhangBottomsPx: [], uiScale: Number.NaN }),
    ).toBe(268 + TRACKER_STACK_ANCHOR_GAP_PX);
  });

  it('answers null for a hidden column, so the stylesheet seat stands', () => {
    expect(
      trackerStackAnchorTopPx({ minimapBottomPx: null, overhangBottomsPx: [], uiScale: 1 }),
    ).toBeNull();
  });

  it('rounds to whole px so the elision compares stable integers', () => {
    const top = trackerStackAnchorTopPx({
      minimapBottomPx: 268.4,
      overhangBottomsPx: [],
      uiScale: 1,
    });
    expect(top).toBe(268 + TRACKER_STACK_ANCHOR_GAP_PX);
    expect(Number.isInteger(top)).toBe(true);
  });
});

interface Rig {
  anchor: TrackerStackAnchor;
  stack: HTMLElement;
  /** Mutable measured geometry the stubbed rect reads answer from. */
  geom: { wrapBottom: number; wrapSize: number; overhangBottom: number; scale: number };
  /** Every style.top the applier wrote ('' = removeProperty), in order. */
  writes: string[];
}

function makeRig(): Rig {
  const stack = document.createElement('div');
  const wrap = document.createElement('div');
  const overhang = document.createElement('div');
  const geom = { wrapBottom: 268, wrapSize: 170, overhangBottom: 274, scale: 1 };
  const rect = (bottom: () => number, size: () => number) => () =>
    ({ bottom: bottom(), width: size(), height: size() }) as DOMRect;
  wrap.getBoundingClientRect = rect(
    () => geom.wrapBottom,
    () => geom.wrapSize,
  );
  overhang.getBoundingClientRect = rect(
    () => geom.overhangBottom,
    () => 20,
  );
  const writes: string[] = [];
  const style = stack.style;
  const rawSet = style.setProperty.bind(style);
  const rawRemove = style.removeProperty.bind(style);
  style.setProperty = (name, value, priority) => {
    if (name === 'top') writes.push(String(value));
    rawSet(name, value, priority ?? undefined);
  };
  style.removeProperty = (name) => {
    if (name === 'top') writes.push('');
    return rawRemove(name);
  };
  // happy-dom routes `style.top = x` through the property setter, not
  // setProperty, so mirror the applier's writes by defining the property.
  Object.defineProperty(style, 'top', {
    get: () => style.getPropertyValue('top'),
    set: (value: string) => {
      writes.push(value);
      rawSet('top', value);
    },
  });
  const anchor = new TrackerStackAnchor({
    stack: () => stack,
    minimapWrap: () => wrap,
    overhangs: () => [overhang, null],
    uiScale: () => geom.scale,
  });
  return { anchor, stack, geom, writes };
}

describe('TrackerStackAnchor', () => {
  it('writes the computed seat, overhang included, and elides an unchanged re-apply', () => {
    const { anchor, geom, writes } = makeRig();
    anchor.apply();
    expect(writes).toEqual([`${274 + TRACKER_STACK_ANCHOR_GAP_PX}px`]);
    anchor.apply();
    anchor.apply();
    expect(writes).toHaveLength(1);
    // The column moved (a wrapping zone label): the seat follows.
    geom.wrapBottom = 300;
    geom.overhangBottom = 306;
    anchor.apply();
    expect(writes).toEqual([
      `${274 + TRACKER_STACK_ANCHOR_GAP_PX}px`,
      `${306 + TRACKER_STACK_ANCHOR_GAP_PX}px`,
    ]);
  });

  it('clears the inline seat when the column hides, restoring the stylesheet top', () => {
    const { anchor, geom, writes } = makeRig();
    anchor.apply();
    geom.wrapSize = 0; // display:none measures 0x0
    anchor.apply();
    expect(writes[writes.length - 1]).toBe('');
    // And hidden stays elided: no repeated removeProperty churn.
    anchor.apply();
    expect(writes).toHaveLength(2);
  });

  it('divides by the live uiScale at apply time', () => {
    const { anchor, geom, writes } = makeRig();
    geom.scale = 2;
    anchor.apply();
    expect(writes).toEqual([`${Math.round(274 / 2) + TRACKER_STACK_ANCHOR_GAP_PX}px`]);
  });

  it('installTrackerStackAnchor seats once immediately and re-applies on resize', () => {
    const stack = document.createElement('div');
    const wrap = document.createElement('div');
    const geom = { bottom: 268 };
    wrap.getBoundingClientRect = () =>
      ({ bottom: geom.bottom, width: 170, height: 250 }) as DOMRect;
    const anchor = installTrackerStackAnchor({
      stack: () => stack,
      minimapWrap: () => wrap,
      overhangs: () => [],
      uiScale: () => 1,
    });
    expect(anchor).toBeInstanceOf(TrackerStackAnchor);
    expect(stack.style.top).toBe(`${268 + TRACKER_STACK_ANCHOR_GAP_PX}px`);
    geom.bottom = 300;
    window.dispatchEvent(new Event('resize'));
    expect(stack.style.top).toBe(`${300 + TRACKER_STACK_ANCHOR_GAP_PX}px`);
  });
});
