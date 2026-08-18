import { describe, expect, it } from 'vitest';
import {
  CROSS_HOTBAR_EXPANDED_SET,
  CROSS_HOTBAR_LAYER_BUTTONS,
  CROSS_HOTBAR_PRIMARY_SET,
  CROSS_HOTBAR_SET_COUNT,
  CROSS_HOTBAR_SLOTS_PER_LAYER,
  CROSS_HOTBAR_SLOTS_PER_SET,
  CROSS_HOTBAR_TRIGGERS,
  type CrossHotbarTriggerState,
  crossHotbarActionBarSlot,
  crossHotbarActiveSet,
  crossHotbarPosition,
  crossHotbarSetSlots,
  defaultCrossHotbarLayout,
  INITIAL_CROSS_HOTBAR_TRIGGER_STATE,
  isCrossHotbarButton,
  nextCrossHotbarTriggerState,
  sanitizeCrossHotbarLayout,
} from '../src/game/cross_hotbar';
import { GP } from '../src/game/gamepad_map';
import { ACTION_BAR_SLOTS } from '../src/game/keybinds';

// Advance the reducer over a scripted sequence of [lt, rt] polls.
function run(
  polls: readonly (readonly [boolean, boolean])[],
  expandEnabled = true,
): CrossHotbarTriggerState {
  let state = INITIAL_CROSS_HOTBAR_TRIGGER_STATE;
  for (const [lt, rt] of polls) {
    state = nextCrossHotbarTriggerState(state, lt, rt, expandEnabled);
  }
  return state;
}

describe('cross hotbar geometry', () => {
  it('reaches eight buttons per trigger and sixteen per set', () => {
    expect(CROSS_HOTBAR_LAYER_BUTTONS).toHaveLength(8);
    expect(CROSS_HOTBAR_SLOTS_PER_LAYER).toBe(8);
    expect(CROSS_HOTBAR_SLOTS_PER_SET).toBe(16);
  });

  it('claims the d-pad and face diamonds, and nothing else', () => {
    for (const button of [GP.DPAD_UP, GP.DPAD_DOWN, GP.DPAD_LEFT, GP.DPAD_RIGHT]) {
      expect(isCrossHotbarButton(button)).toBe(true);
    }
    for (const button of [GP.A, GP.B, GP.X, GP.Y]) {
      expect(isCrossHotbarButton(button)).toBe(true);
    }
    // The bumpers, stick clicks, Back/Start and the triggers themselves keep their
    // own flat bindings: the cross hotbar must not swallow them.
    for (const button of [GP.LB, GP.RB, GP.L3, GP.R3, GP.BACK, GP.START, GP.LT, GP.RT]) {
      expect(isCrossHotbarButton(button)).toBe(false);
    }
  });

  it('uses the triggers as the two layer modifiers', () => {
    expect(CROSS_HOTBAR_TRIGGERS.left).toBe(GP.LT);
    expect(CROSS_HOTBAR_TRIGGERS.right).toBe(GP.RT);
  });

  it('orders each diamond top, left, right, bottom', () => {
    expect(CROSS_HOTBAR_LAYER_BUTTONS.slice(0, 4)).toEqual([
      GP.DPAD_UP,
      GP.DPAD_LEFT,
      GP.DPAD_RIGHT,
      GP.DPAD_DOWN,
    ]);
    expect(CROSS_HOTBAR_LAYER_BUTTONS.slice(4)).toEqual([GP.Y, GP.X, GP.B, GP.A]);
  });

  it('places the right trigger positions after the left trigger block', () => {
    expect(crossHotbarPosition('left', GP.DPAD_UP)).toBe(0);
    expect(crossHotbarPosition('left', GP.A)).toBe(7);
    expect(crossHotbarPosition('right', GP.DPAD_UP)).toBe(8);
    expect(crossHotbarPosition('right', GP.A)).toBe(15);
  });

  it('returns no position for an unclaimed button on either layer', () => {
    expect(crossHotbarPosition('left', GP.LB)).toBeNull();
    expect(crossHotbarPosition('right', GP.START)).toBeNull();
  });
});

describe('defaultCrossHotbarLayout', () => {
  it('mirrors consecutive action-bar slots across both sets', () => {
    const layout = defaultCrossHotbarLayout();
    expect(layout).toHaveLength(CROSS_HOTBAR_SET_COUNT);
    expect(layout[CROSS_HOTBAR_PRIMARY_SET]).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(layout[CROSS_HOTBAR_EXPANDED_SET]).toEqual([
      16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
    ]);
  });

  it('fits inside the real action bar', () => {
    // The default is generated from the set geometry, so a future action bar that
    // shrank below 32 slots would silently point the cross hotbar off the end.
    const highest = Math.max(...defaultCrossHotbarLayout().flat());
    expect(highest).toBeLessThan(ACTION_BAR_SLOTS);
  });
});

describe('crossHotbarActionBarSlot', () => {
  const layout = defaultCrossHotbarLayout();

  it('resolves a held-trigger press to its mirrored action-bar slot', () => {
    expect(crossHotbarActionBarSlot(layout, 0, 'left', GP.DPAD_UP)).toBe(0);
    expect(crossHotbarActionBarSlot(layout, 0, 'right', GP.A)).toBe(15);
    expect(crossHotbarActionBarSlot(layout, 1, 'left', GP.DPAD_UP)).toBe(16);
    expect(crossHotbarActionBarSlot(layout, 1, 'right', GP.A)).toBe(31);
  });

  it('resolves nothing for an unclaimed button or a set that does not exist', () => {
    expect(crossHotbarActionBarSlot(layout, 0, 'left', GP.LB)).toBeNull();
    expect(crossHotbarActionBarSlot(layout, 7, 'left', GP.DPAD_UP)).toBeNull();
  });

  it('follows a remapped layout rather than the sequential default', () => {
    const remapped = defaultCrossHotbarLayout();
    remapped[0][0] = 33;
    expect(crossHotbarActionBarSlot(remapped, 0, 'left', GP.DPAD_UP)).toBe(33);
  });
});

describe('crossHotbarSetSlots', () => {
  it('hands the overlay the sixteen slots of a set in display order', () => {
    const slots = crossHotbarSetSlots(defaultCrossHotbarLayout(), CROSS_HOTBAR_EXPANDED_SET);
    expect(slots).toHaveLength(CROSS_HOTBAR_SLOTS_PER_SET);
    expect(slots[0]).toBe(16);
  });

  it('is empty for a set outside the layout', () => {
    expect(crossHotbarSetSlots(defaultCrossHotbarLayout(), 9)).toEqual([]);
  });
});

describe('nextCrossHotbarTriggerState', () => {
  it('is dormant until a trigger goes down', () => {
    const state = run([[false, false]]);
    expect(state.hold).toBeNull();
    expect(state.expanded).toBe(false);
  });

  it('holds the trigger that is pressed', () => {
    expect(run([[true, false]]).hold).toBe('left');
    expect(run([[false, true]]).hold).toBe('right');
  });

  it('keeps the hold across polls and drops it on release', () => {
    expect(
      run([
        [true, false],
        [true, false],
      ]).hold,
    ).toBe('left');
    expect(
      run([
        [true, false],
        [false, false],
      ]).hold,
    ).toBeNull();
  });

  it('rolls to the other trigger when the held one is released first', () => {
    const state = run([
      [true, false],
      [true, true],
      [false, true],
    ]);
    expect(state.hold).toBe('right');
  });

  it('resolves a same-poll tie to the left trigger', () => {
    expect(run([[true, true]]).hold).toBe('left');
  });

  it('expands on an opposite-trigger tap while holding', () => {
    const state = run([
      [true, false],
      [true, true],
    ]);
    expect(state.hold).toBe('left');
    expect(state.expanded).toBe(true);
    expect(crossHotbarActiveSet(state)).toBe(CROSS_HOTBAR_EXPANDED_SET);
  });

  it('returns to the primary set on a second tap', () => {
    const state = run([
      [true, false],
      [true, true],
      [true, false],
      [true, true],
    ]);
    expect(state.expanded).toBe(false);
    expect(crossHotbarActiveSet(state)).toBe(CROSS_HOTBAR_PRIMARY_SET);
  });

  it('needs a rising edge, so a held opposite trigger does not re-expand each poll', () => {
    const state = run([
      [true, false],
      [true, true],
      [true, true],
      [true, true],
    ]);
    expect(state.expanded).toBe(true);
  });

  it('clears the expansion when the hold is released', () => {
    const state = run([
      [true, false],
      [true, true],
      [false, false],
      [true, false],
    ]);
    expect(state.hold).toBe('left');
    expect(state.expanded).toBe(false);
  });

  it('never expands while the double bar is switched off', () => {
    const state = run(
      [
        [true, false],
        [true, true],
      ],
      false,
    );
    expect(state.hold).toBe('left');
    expect(state.expanded).toBe(false);
    expect(crossHotbarActiveSet(state)).toBe(CROSS_HOTBAR_PRIMARY_SET);
  });
});

describe('sanitizeCrossHotbarLayout', () => {
  it('falls back wholesale for a non-array value', () => {
    expect(sanitizeCrossHotbarLayout(null, ACTION_BAR_SLOTS)).toEqual(defaultCrossHotbarLayout());
    expect(sanitizeCrossHotbarLayout('nope', ACTION_BAR_SLOTS)).toEqual(defaultCrossHotbarLayout());
  });

  it('keeps stored entries that name a real slot', () => {
    const stored = defaultCrossHotbarLayout();
    stored[0][3] = 30;
    const clean = sanitizeCrossHotbarLayout(stored, ACTION_BAR_SLOTS);
    expect(clean[0][3]).toBe(30);
  });

  it('replaces an out-of-range slot with its default, per position', () => {
    const stored = defaultCrossHotbarLayout();
    stored[0][0] = ACTION_BAR_SLOTS; // one past the end
    stored[0][1] = -1;
    stored[0][2] = 9;
    const clean = sanitizeCrossHotbarLayout(stored, ACTION_BAR_SLOTS);
    expect(clean[0][0]).toBe(0);
    expect(clean[0][1]).toBe(1);
    expect(clean[0][2]).toBe(9);
  });

  it('replaces a non-integer entry with its default', () => {
    const stored = defaultCrossHotbarLayout();
    stored[1][0] = 4.5;
    const clean = sanitizeCrossHotbarLayout(stored, ACTION_BAR_SLOTS);
    expect(clean[1][0]).toBe(16);
  });

  it('restores a set that is missing or the wrong shape', () => {
    const clean = sanitizeCrossHotbarLayout([undefined, 'gone'], ACTION_BAR_SLOTS);
    expect(clean).toEqual(defaultCrossHotbarLayout());
  });

  it('pads a short stored set back to sixteen positions', () => {
    const clean = sanitizeCrossHotbarLayout([[5, 6]], ACTION_BAR_SLOTS);
    expect(clean[0]).toHaveLength(CROSS_HOTBAR_SLOTS_PER_SET);
    expect(clean[0][0]).toBe(5);
    expect(clean[0][2]).toBe(2);
  });

  it('drops extra sets a longer stored value carries', () => {
    const stored = [...defaultCrossHotbarLayout(), Array(16).fill(0)];
    expect(sanitizeCrossHotbarLayout(stored, ACTION_BAR_SLOTS)).toHaveLength(
      CROSS_HOTBAR_SET_COUNT,
    );
  });
});
