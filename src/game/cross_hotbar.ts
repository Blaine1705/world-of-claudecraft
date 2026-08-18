// Pure, host-agnostic cross-hotbar (XHB) model: the console-MMO trigger-modifier
// hotbar. No DOM, no `navigator`, no timers, so the trigger state machine and the
// button-to-slot resolution unit-test without a real controller (the same
// pure-core split gamepad_map.ts uses for the stick math). The thin
// `GamepadManager` consumer in gamepad.ts owns polling and dispatch.
//
// Holding a trigger lights eight slots at once: the d-pad diamond and the face
// diamond. The left trigger reaches one eight, the right trigger the other, so
// one set is sixteen actions reachable without lifting a thumb. Tapping the
// opposite trigger while holding swaps to the second set (the "double" bar), for
// thirty-two in reach.

import { GP } from './gamepad_map';

/** Which trigger is currently held, naming the eight slots it reaches. */
export type CrossHotbarLayer = 'left' | 'right';

/** The trigger button for a layer; the two buttons that never fire their own
 *  bound action while the cross hotbar is on (they are the modifier). */
export const CROSS_HOTBAR_TRIGGERS: Record<CrossHotbarLayer, number> = {
  left: GP.LT,
  right: GP.RT,
};

// The eight buttons one held trigger reaches, in display order: the d-pad
// diamond first, then the face diamond, each read top, left, right, bottom. The
// order is the panel's and the overlay's; the indices are physical POSITIONS
// (gamepad_map.ts explains why position, not silk-screen, is the stable key).
export const CROSS_HOTBAR_LAYER_BUTTONS: readonly number[] = [
  GP.DPAD_UP,
  GP.DPAD_LEFT,
  GP.DPAD_RIGHT,
  GP.DPAD_DOWN,
  GP.Y,
  GP.X,
  GP.B,
  GP.A,
];

export const CROSS_HOTBAR_SLOTS_PER_LAYER = CROSS_HOTBAR_LAYER_BUTTONS.length;
export const CROSS_HOTBAR_SLOTS_PER_SET = CROSS_HOTBAR_SLOTS_PER_LAYER * 2;

// Two sets: the one a bare trigger hold reaches, and the one the opposite-trigger
// tap swaps to. Two is what the 34 action-bar slots actually fit (32 mirrored,
// the last two staying keyboard-only), so the count is derived from the slot
// budget rather than invented.
export const CROSS_HOTBAR_SET_COUNT = 2;
export const CROSS_HOTBAR_PRIMARY_SET = 0;
export const CROSS_HOTBAR_EXPANDED_SET = 1;

/** Per set, the action-bar slot each of the sixteen cross-hotbar positions casts.
 *  Mirroring the action bar rather than storing its own actions is deliberate:
 *  pad and keyboard players share one loadout, and there is no second store to
 *  keep in sync. */
export type CrossHotbarLayout = readonly (readonly number[])[];

/** Sequential default: the first set mirrors action-bar slots 0 to 15, the second
 *  16 to 31. Slot 0 is the Attack control, which is a legitimate cross-hotbar
 *  entry (the overlay paints it exactly as the action bar does). */
export function defaultCrossHotbarLayout(): number[][] {
  const sets: number[][] = [];
  for (let set = 0; set < CROSS_HOTBAR_SET_COUNT; set++) {
    const slots: number[] = [];
    for (let i = 0; i < CROSS_HOTBAR_SLOTS_PER_SET; i++) {
      slots.push(set * CROSS_HOTBAR_SLOTS_PER_SET + i);
    }
    sets.push(slots);
  }
  return sets;
}

/** Position within a set (0 to 15) for a physical button under a held trigger, or
 *  null when the button is not one of the eight (a bumper, a stick click, Start). */
export function crossHotbarPosition(layer: CrossHotbarLayer, button: number): number | null {
  const within = CROSS_HOTBAR_LAYER_BUTTONS.indexOf(button);
  if (within < 0) return null;
  return layer === 'left' ? within : within + CROSS_HOTBAR_SLOTS_PER_LAYER;
}

/** True for a button the cross hotbar claims while a trigger is held, so the
 *  consumer knows to suppress that button's own flat binding. */
export function isCrossHotbarButton(button: number): boolean {
  return CROSS_HOTBAR_LAYER_BUTTONS.includes(button);
}

/** The action-bar slot a press resolves to, or null when the button is unclaimed
 *  or the layout has no entry for that position. */
export function crossHotbarActionBarSlot(
  layout: CrossHotbarLayout,
  set: number,
  layer: CrossHotbarLayer,
  button: number,
): number | null {
  const position = crossHotbarPosition(layer, button);
  if (position === null) return null;
  return layout[set]?.[position] ?? null;
}

/** The eight action-bar slots ONE held trigger reaches, in display order. The
 *  overlay shows exactly this: two diamonds of four, swapping contents with the
 *  trigger rather than showing all sixteen at once. */
export function crossHotbarLayerSlots(
  layout: CrossHotbarLayout,
  set: number,
  layer: CrossHotbarLayer,
): readonly number[] {
  const offset = layer === 'left' ? 0 : CROSS_HOTBAR_SLOTS_PER_LAYER;
  const slots = layout[set];
  if (!slots) return [];
  return slots.slice(offset, offset + CROSS_HOTBAR_SLOTS_PER_LAYER);
}

/** The sixteen action-bar slots of one set, in display order, for the overlay. */
export function crossHotbarSetSlots(layout: CrossHotbarLayout, set: number): readonly number[] {
  return layout[set] ?? [];
}

/** Live trigger state. `ltDown`/`rtDown` are carried so the reducer is a closed
 *  function of its own previous output plus this poll's two booleans: the
 *  opposite-trigger TAP is a rising edge, which needs last poll's reading. */
export interface CrossHotbarTriggerState {
  /** The trigger being held, or null when the cross hotbar is dormant. */
  hold: CrossHotbarLayer | null;
  /** Whether the opposite-trigger tap has swapped this hold to the second set. */
  expanded: boolean;
  ltDown: boolean;
  rtDown: boolean;
}

export const INITIAL_CROSS_HOTBAR_TRIGGER_STATE: CrossHotbarTriggerState = {
  hold: null,
  expanded: false,
  ltDown: false,
  rtDown: false,
};

/**
 * Advance the trigger state one poll. A hold survives only while its own trigger
 * stays down; releasing it drops to the other trigger if that one is still held,
 * which is what a player rolling from one trigger to the other expects. While
 * holding, a rising edge on the opposite trigger toggles the expanded set (tapping
 * it again returns to the primary), so the second sixteen are a tap away and the
 * way back is the same tap.
 */
export function nextCrossHotbarTriggerState(
  prev: CrossHotbarTriggerState,
  ltDown: boolean,
  rtDown: boolean,
  expandEnabled: boolean,
): CrossHotbarTriggerState {
  const down = (layer: CrossHotbarLayer): boolean => (layer === 'left' ? ltDown : rtDown);
  let hold = prev.hold !== null && down(prev.hold) ? prev.hold : null;
  let expanded = hold !== null && prev.expanded;

  if (hold === null) {
    // Adopt whichever trigger is down. A same-poll tie resolves to the left one so
    // the result never depends on the order the two buttons happen to be read in.
    hold = ltDown ? 'left' : rtDown ? 'right' : null;
    expanded = false;
  } else if (expandEnabled) {
    const opposite: CrossHotbarLayer = hold === 'left' ? 'right' : 'left';
    const oppositeWasDown = opposite === 'left' ? prev.ltDown : prev.rtDown;
    if (down(opposite) && !oppositeWasDown) expanded = !expanded;
  }

  return { hold, expanded, ltDown, rtDown };
}

/** The set a trigger state reads from. */
export function crossHotbarActiveSet(state: CrossHotbarTriggerState): number {
  return state.expanded ? CROSS_HOTBAR_EXPANDED_SET : CROSS_HOTBAR_PRIMARY_SET;
}

/**
 * Coerce a persisted (therefore untrusted) layout into a usable one, keeping every
 * entry that names a real action-bar slot and falling back to the default for the
 * rest. A shrunk or grown ACTION_BAR_SLOTS, a hand-edited storage value, and a
 * layout written by an older build all land here.
 */
export function sanitizeCrossHotbarLayout(raw: unknown, actionBarSlots: number): number[][] {
  const fallback = defaultCrossHotbarLayout();
  if (!Array.isArray(raw)) return fallback;
  return fallback.map((defaults, set) => {
    const storedSet = raw[set];
    if (!Array.isArray(storedSet)) return defaults;
    return defaults.map((defaultSlot, position) => {
      const stored = storedSet[position];
      if (typeof stored !== 'number' || !Number.isInteger(stored)) return defaultSlot;
      if (stored < 0 || stored >= actionBarSlots) return defaultSlot;
      return stored;
    });
  });
}
