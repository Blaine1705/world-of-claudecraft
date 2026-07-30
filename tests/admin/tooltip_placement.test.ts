import { describe, expect, it } from 'vitest';
import { tooltipPlacement } from '../../src/admin/tooltip_placement';

const viewport = { width: 1440, height: 900 };

describe('tooltip placement', () => {
  it('opens below the anchor and right-aligns on it when there is room', () => {
    const placement = tooltipPlacement({ top: 200, bottom: 220, right: 1200 }, viewport);
    expect(placement).toEqual({ side: 'below', right: 240, offset: 227 });
  });

  it('flips above the anchor when the viewport bottom is close', () => {
    // 40px of room below cannot hold the details list, so the tooltip opens upward
    // anchored on the row top instead of hanging off the bottom edge.
    const placement = tooltipPlacement({ top: 840, bottom: 860, right: 1200 }, viewport);
    expect(placement.side).toBe('above');
    expect(placement.offset).toBe(viewport.height - 840 + 7);
  });

  it('keeps the tooltip inside both viewport edges', () => {
    // An anchor at the very right edge: the tooltip still leaves a margin.
    expect(tooltipPlacement({ top: 10, bottom: 30, right: 1440 }, viewport).right).toBe(8);
    // An anchor near the left edge: right-aligning would push the tooltip off screen,
    // so it is pulled back to the widest offset that still fits its min-width.
    expect(tooltipPlacement({ top: 10, bottom: 30, right: 40 }, viewport).right).toBe(
      1440 - 210 - 8,
    );
  });

  it('still returns an on-screen offset on a viewport narrower than the tooltip', () => {
    const narrow = { width: 180, height: 700 };
    expect(tooltipPlacement({ top: 10, bottom: 30, right: 170 }, narrow).right).toBe(8);
  });
});
