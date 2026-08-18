import { describe, expect, it } from 'vitest';
import { CROSS_HOTBAR_LAYER_BUTTONS, CROSS_HOTBAR_SLOTS_PER_LAYER } from '../src/game/cross_hotbar';
import { GP } from '../src/game/gamepad_map';
import {
  CROSS_HOTBAR_CELL_COUNT,
  CROSS_HOTBAR_CELLS,
  crossHotbarOverlayState,
  HIDDEN_CROSS_HOTBAR,
} from '../src/ui/hud/cross_hotbar/cross_hotbar_view';

// The overlay core is deliberately host-agnostic and names no gamepad button, so
// nothing at compile time keeps its cell order in step with the pad's button
// order. That contract is real (cell 0 must be the button the pad fires first), so
// it is pinned HERE, against the game core's own list.
describe('overlay cells match the pad button order', () => {
  it('has a cell for every slot in a set: both halves, not just the held one', () => {
    expect(CROSS_HOTBAR_CELL_COUNT).toBe(CROSS_HOTBAR_SLOTS_PER_LAYER * 2);
    expect(CROSS_HOTBAR_CELLS.filter((c) => c.layer === 'left')).toHaveLength(
      CROSS_HOTBAR_LAYER_BUTTONS.length,
    );
    expect(CROSS_HOTBAR_CELLS.filter((c) => c.layer === 'right')).toHaveLength(
      CROSS_HOTBAR_LAYER_BUTTONS.length,
    );
  });

  it('orders the left half first, so cell index equals the set position', () => {
    expect(CROSS_HOTBAR_CELLS.slice(0, 8).every((c) => c.layer === 'left')).toBe(true);
    expect(CROSS_HOTBAR_CELLS.slice(8).every((c) => c.layer === 'right')).toBe(true);
  });

  it('puts the d-pad diamond first and the face diamond second within each half', () => {
    const half = ['dpad', 'dpad', 'dpad', 'dpad', 'face', 'face', 'face', 'face'];
    expect(CROSS_HOTBAR_CELLS.slice(0, 8).map((c) => c.cluster)).toEqual(half);
    expect(CROSS_HOTBAR_CELLS.slice(8).map((c) => c.cluster)).toEqual(half);
  });

  it('orders each diamond the same way the pad button list does', () => {
    // The pad list is d-pad up/left/right/down then face top/left/right/bottom;
    // the overlay must read top, left, right, bottom in both diamonds or a cell
    // would light for a different button than the one pressed.
    const points = ['top', 'left', 'right', 'bottom'];
    expect(CROSS_HOTBAR_CELLS.slice(0, 8).map((c) => c.point)).toEqual([...points, ...points]);
    expect(CROSS_HOTBAR_CELLS.slice(8).map((c) => c.point)).toEqual([...points, ...points]);
    expect(CROSS_HOTBAR_LAYER_BUTTONS).toEqual([
      GP.DPAD_UP,
      GP.DPAD_LEFT,
      GP.DPAD_RIGHT,
      GP.DPAD_DOWN,
      GP.Y,
      GP.X,
      GP.B,
      GP.A,
    ]);
  });

  it('numbers cells by their display order', () => {
    expect(CROSS_HOTBAR_CELLS.map((c) => c.index)).toEqual(
      Array.from({ length: CROSS_HOTBAR_CELL_COUNT }, (_, i) => i),
    );
  });
});

describe('crossHotbarOverlayState', () => {
  const set16 = Array.from({ length: 16 }, (_, i) => i + 4);
  const hold = (layer: 'left' | 'right' | null, slots = set16, expanded = false) => ({
    layer,
    slots,
    expanded,
    buttons: [],
  });

  it('hides the bar only when there is no hold at all', () => {
    expect(crossHotbarOverlayState(null)).toBe(HIDDEN_CROSS_HOTBAR);
    expect(HIDDEN_CROSS_HOTBAR.visible).toBe(false);
  });

  it('shows the WHOLE set, both halves, with no trigger held', () => {
    const state = crossHotbarOverlayState(hold(null));
    expect(state.visible).toBe(true);
    expect(state.activeLayer).toBeNull();
    expect(state.cellSlots).toEqual(set16);
  });

  it('arms one half without changing what either half shows', () => {
    const left = crossHotbarOverlayState(hold('left'));
    const right = crossHotbarOverlayState(hold('right'));
    expect(left.activeLayer).toBe('left');
    expect(right.activeLayer).toBe('right');
    // The contents are identical: holding a trigger highlights, never swaps.
    expect(left.cellSlots).toEqual(right.cellSlots);
  });

  it('carries the double-set marker', () => {
    expect(crossHotbarOverlayState(hold('right', set16, true)).expanded).toBe(true);
    expect(crossHotbarOverlayState(hold('right')).expanded).toBe(false);
  });

  it('always yields sixteen cells, so a short slot list cannot overrun the painter', () => {
    const state = crossHotbarOverlayState(hold(null, [1, 2]));
    expect(state.cellSlots).toHaveLength(CROSS_HOTBAR_CELL_COUNT);
    expect(state.cellSlots.slice(2).every((s) => s === -1)).toBe(true);
  });

  it('marks a negative or non-numeric entry as unfilled', () => {
    const state = crossHotbarOverlayState(hold(null, [-3, Number.NaN, 2, ...set16.slice(3)]));
    expect(state.cellSlots[0]).toBe(-1);
    // NaN is typeof number but fails the >= 0 gate, so it lands as unfilled rather
    // than reaching the painter as an index.
    expect(state.cellSlots[1]).toBe(-1);
    expect(state.cellSlots[2]).toBe(2);
  });
});
