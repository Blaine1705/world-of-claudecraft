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
  it('has one cell per button a held trigger reaches', () => {
    expect(CROSS_HOTBAR_CELL_COUNT).toBe(CROSS_HOTBAR_SLOTS_PER_LAYER);
    expect(CROSS_HOTBAR_CELLS).toHaveLength(CROSS_HOTBAR_LAYER_BUTTONS.length);
  });

  it('puts the d-pad diamond first and the face diamond second', () => {
    const clusters = CROSS_HOTBAR_CELLS.map((c) => c.cluster);
    expect(clusters).toEqual(['dpad', 'dpad', 'dpad', 'dpad', 'face', 'face', 'face', 'face']);
  });

  it('orders each diamond the same way the pad button list does', () => {
    // The pad list is d-pad up/left/right/down then face top/left/right/bottom;
    // the overlay must read top, left, right, bottom in both diamonds or a cell
    // would light for a different button than the one pressed.
    expect(CROSS_HOTBAR_CELLS.map((c) => c.point)).toEqual([
      'top',
      'left',
      'right',
      'bottom',
      'top',
      'left',
      'right',
      'bottom',
    ]);
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
    expect(CROSS_HOTBAR_CELLS.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('crossHotbarOverlayState', () => {
  const slots = [4, 5, 6, 7, 8, 9, 10, 11];

  it('hides the bar when no trigger is held', () => {
    expect(crossHotbarOverlayState(null, slots)).toBe(HIDDEN_CROSS_HOTBAR);
    expect(HIDDEN_CROSS_HOTBAR.visible).toBe(false);
  });

  it('shows the held trigger own eight slots', () => {
    const state = crossHotbarOverlayState('left', slots);
    expect(state.visible).toBe(true);
    expect(state.layer).toBe('left');
    expect(state.cellSlots).toEqual(slots);
  });

  it('carries the double-set marker', () => {
    expect(crossHotbarOverlayState('right', slots, true).expanded).toBe(true);
    expect(crossHotbarOverlayState('right', slots).expanded).toBe(false);
  });

  it('always yields eight cells, so a short slot list cannot overrun the painter', () => {
    const state = crossHotbarOverlayState('left', [1, 2]);
    expect(state.cellSlots).toHaveLength(CROSS_HOTBAR_CELL_COUNT);
    expect(state.cellSlots.slice(2)).toEqual([-1, -1, -1, -1, -1, -1]);
  });

  it('marks a negative or non-numeric entry as unfilled', () => {
    const state = crossHotbarOverlayState('left', [-3, Number.NaN, 2, 3, 4, 5, 6, 7]);
    expect(state.cellSlots[0]).toBe(-1);
    // NaN is typeof number but fails the >= 0 gate, so it lands as unfilled rather
    // than reaching the painter as an index.
    expect(state.cellSlots[1]).toBe(-1);
    expect(state.cellSlots[2]).toBe(2);
  });
});
