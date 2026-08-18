// The persisted cross-hotbar layout: which action-bar slot each of the sixteen
// positions in each set casts. Its own localStorage key, separate from the flat
// pad bindings (gamepad_bindings.ts) because it is a different input space: those
// map ONE button to an action id, these map a trigger-plus-button PAIR to an
// action-bar slot. Pure aside from localStorage, matching GamepadBindings and
// Settings, so the bind/reset logic is testable.

import {
  CROSS_HOTBAR_SET_COUNT,
  CROSS_HOTBAR_SLOTS_PER_SET,
  type CrossHotbarLayer,
  crossHotbarActionBarSlot,
  crossHotbarLayerSlots,
  crossHotbarPosition,
  crossHotbarSetSlots,
  defaultCrossHotbarLayout,
  sanitizeCrossHotbarLayout,
} from './cross_hotbar';
import { ACTION_BAR_SLOTS } from './keybinds';
import { parseStoredJson } from './local_storage_json';

const STORE_KEY = 'woc_gamepad_xhb';

export class CrossHotbarBindings {
  private layout: number[][] = defaultCrossHotbarLayout();

  constructor() {
    this.load();
  }

  private load(): void {
    this.layout = sanitizeCrossHotbarLayout(parseStoredJson(STORE_KEY), ACTION_BAR_SLOTS);
  }

  private save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.layout));
    } catch {
      /* storage unavailable */
    }
  }

  /** The whole layout, for the pure resolvers and the overlay. */
  all(): readonly (readonly number[])[] {
    return this.layout;
  }

  /** The sixteen action-bar slots of one set, in display order. */
  setSlots(set: number): readonly number[] {
    return crossHotbarSetSlots(this.layout, set);
  }

  /** The eight action-bar slots one held trigger reaches, for the overlay. */
  layerSlots(set: number, layer: CrossHotbarLayer): readonly number[] {
    return crossHotbarLayerSlots(this.layout, set, layer);
  }

  /** The action-bar slot a held-trigger press casts, or null when unclaimed. */
  actionBarSlot(set: number, layer: CrossHotbarLayer, button: number): number | null {
    return crossHotbarActionBarSlot(this.layout, set, layer, button);
  }

  /** Point one cross-hotbar position at a different action-bar slot. Out-of-range
   *  sets, positions, and slots are ignored rather than clamped: a caller asking
   *  for a slot the action bar does not have is a bug, and silently writing a
   *  neighbouring slot would hide it. Duplicates ARE allowed, matching the flat
   *  pad bindings (two positions may deliberately cast the same slot). */
  bind(set: number, position: number, actionBarSlot: number): void {
    if (!Number.isInteger(set) || set < 0 || set >= CROSS_HOTBAR_SET_COUNT) return;
    if (!Number.isInteger(position) || position < 0 || position >= CROSS_HOTBAR_SLOTS_PER_SET)
      return;
    if (!Number.isInteger(actionBarSlot) || actionBarSlot < 0 || actionBarSlot >= ACTION_BAR_SLOTS)
      return;
    this.layout[set][position] = actionBarSlot;
    this.save();
  }

  /** Rebind by the physical trigger-plus-button pair, the shape the options panel
   *  and any capture flow speak. */
  bindButton(set: number, layer: CrossHotbarLayer, button: number, actionBarSlot: number): void {
    const position = crossHotbarPosition(layer, button);
    if (position === null) return;
    this.bind(set, position, actionBarSlot);
  }

  reset(): void {
    this.layout = defaultCrossHotbarLayout();
    this.save();
  }
}
