// On-bar action-bar key-binding mode (issue #1238): pure phase/state helpers for
// the click-a-slot-then-press-a-key rebind flow. DOM-free (no button refs, no key
// capture) so the state transitions are Vitest-testable directly. The controller
// (action_bar_bind_controller.ts) owns the slot clicks, the key capture and the
// confirm dialogs, the banner DOM lives in action_bar_bind_banner.ts, and hud.ts
// keeps only the action-bar click intercept.

/**
 * selectedSlot: the bar slot index awaiting a keypress, or null between
 * selections. lastBoundKeyLabel: the on-screen label of the key just bound (or
 * null after a cancelled/rejected capture), shown as transient feedback until
 * the next slot is selected.
 */
import {
  type KeybindConflictPrompt,
  keybindConflictPrompt,
} from '../../keybind_conflict_prompt_core';

export interface ActionBarBindState {
  selectedSlot: number | null;
  lastBoundKeyLabel: string | null;
}

/** The mode's starting state: no slot selected yet. */
export function actionBarBindEnter(): ActionBarBindState {
  return { selectedSlot: null, lastBoundKeyLabel: null };
}

/** Clicking a bar slot selects it (replacing any prior selection, mid-capture
 *  or not) and clears any leftover "bound to X" feedback from an earlier capture. */
export function actionBarBindSelectSlot(slot: number): ActionBarBindState {
  return { selectedSlot: slot, lastBoundKeyLabel: null };
}

/** A capture resolved (a key was pressed and bound, or the capture was
 *  cancelled/rejected): clear the selection and record the outcome. Pass the
 *  bound key's label, or null for a cancelled/rejected capture. */
export function actionBarBindResolveCapture(keyLabel: string | null): ActionBarBindState {
  return { selectedSlot: null, lastBoundKeyLabel: keyLabel };
}

export type ActionBarBindStatus = 'idle' | 'capturing' | 'bound';

/** Which status line the banner should show for the current state. */
export function actionBarBindStatus(state: ActionBarBindState): ActionBarBindStatus {
  if (state.selectedSlot !== null) return 'capturing';
  if (state.lastBoundKeyLabel !== null) return 'bound';
  return 'idle';
}

/** The are-you-sure prompt the on-bar mode raises before a capture commits:
 *  the shared keybind conflict prompt, with the slot as the gaining action. */
export type ActionBarBindPrompt = KeybindConflictPrompt;

/**
 * Decide whether binding `key` to the selected slot needs a warning first.
 * `other` is the name of the action that would LOSE `key` (null when the key
 * is free); `slot` names the slot being bound. Only a key already in use
 * elsewhere warns: replacing the slot's own previous key is the point of the
 * mode and asks nothing.
 */
export function actionBarBindPrompt(input: {
  key: string;
  other: string | null;
  slot: string;
}): ActionBarBindPrompt | null {
  return keybindConflictPrompt({ key: input.key, other: input.other, action: input.slot });
}

/** A box in HUD author px (the #ui zoom already divided out). */
export interface ActionBarBindBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** How far above the bottom edge the banner sits when no bar has a box to
 *  anchor to (every bar hidden, or the touch layout): clear of the stock docked
 *  bar plus the player frame beneath it. */
export const ACTION_BAR_BIND_BANNER_FALLBACK_LIFT = 200;

/**
 * Where the banner goes, in HUD author px: centred on the primary bar (the
 * first box) and lifted `gap` above the TOPMOST visible bar, so it never sits
 * on the second or third bar stacked above the primary one (their slots are
 * rebind targets too, and a banner over them left those keys unbindable). When
 * there is no room above, it drops `gap` below the lowest bar instead. Every
 * bar is measured live (never assumed docked in #actionbar-stack) because
 * Interface Unlock reparents a moved bar to the HUD root. With no bar box at
 * all the banner takes the stock bottom-centre seat. Clamped `gap` inside the
 * viewport on every edge.
 */
export function actionBarBindBannerPlacement(args: {
  bars: readonly ActionBarBindBox[];
  banner: { width: number; height: number };
  viewport: { width: number; height: number };
  gap?: number;
}): { left: number; top: number } {
  const gap = args.gap ?? 8;
  const { banner, viewport, bars } = args;
  let left: number;
  let top: number;
  const primary = bars[0];
  if (primary) {
    const topmost = Math.min(...bars.map((b) => b.top));
    const lowest = Math.max(...bars.map((b) => b.top + b.height));
    left = primary.left + primary.width / 2 - banner.width / 2;
    top = topmost - gap - banner.height;
    if (top < gap) top = lowest + gap;
  } else {
    left = (viewport.width - banner.width) / 2;
    top = viewport.height - banner.height - ACTION_BAR_BIND_BANNER_FALLBACK_LIFT;
  }
  const maxLeft = Math.max(gap, viewport.width - banner.width - gap);
  const maxTop = Math.max(gap, viewport.height - banner.height - gap);
  return {
    left: Math.min(Math.max(left, gap), maxLeft),
    top: Math.min(Math.max(top, gap), maxTop),
  };
}
