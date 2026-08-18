// The persisted cross-hotbar layout: the sixteen actions each set casts.
//
// Its own localStorage key and its own actions, deliberately NOT the action bar's.
// Mirroring the bar meant a player arranging their pad layout was silently
// rearranging their keyboard one; the best layout for a thumb is not the best
// layout for a number row. The bar is SEEDED from the action bar once so nobody
// starts empty, and independent from then on.
//
// Pure aside from localStorage, matching GamepadBindings and Settings, so the
// bind/seed/reset logic is testable.

import {
  CROSS_HOTBAR_SET_COUNT,
  CROSS_HOTBAR_SLOTS_PER_SET,
  type CrossHotbarAction,
  type CrossHotbarLayer,
  crossHotbarActionFor,
  crossHotbarPosition,
  crossHotbarSetActions,
  defaultCrossHotbarLayout,
  isCrossHotbarSeeded,
  placeInFirstFreeCell,
  sanitizeCrossHotbarLayout,
  seedCrossHotbarLayout,
} from './cross_hotbar';
import { parseStoredJson } from './local_storage_json';

const STORE_KEY = 'woc_gamepad_xhb';

export class CrossHotbarBindings {
  private layout: CrossHotbarAction[][] = defaultCrossHotbarLayout();
  // Every ability this bar has already offered a cell. Kept so a newly learned
  // spell lands once and an ability the player then REMOVES stays removed, rather
  // than reappearing on the next sync.
  private seen = new Set<string>();

  constructor() {
    this.load();
  }

  private load(): void {
    const stored = parseStoredJson(STORE_KEY);
    // The bare array is the original shape; read it so an existing layout survives.
    const raw = Array.isArray(stored) ? { layout: stored, seen: [] } : stored;
    const bag = (raw ?? {}) as { layout?: unknown; seen?: unknown };
    this.layout = sanitizeCrossHotbarLayout(bag.layout);
    this.seen = new Set(
      Array.isArray(bag.seen) ? bag.seen.filter((id): id is string => typeof id === 'string') : [],
    );
  }

  private save(): void {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({ layout: this.layout, seen: [...this.seen] }),
      );
    } catch {
      /* storage unavailable */
    }
  }

  /**
   * Offer a cell to every ability the bar has not seen before, so levelling into a
   * new spell puts it in reach instead of leaving a pad player to discover the
   * arrange chord first. Ids are pre-filtered by the caller against the SAME rules
   * the action bar auto-places by.
   *
   * Marks an id seen whether or not a cell was free, so a full bar does not quietly
   * queue placements that surface later when the player frees a slot.
   */
  syncKnown(abilityIds: readonly string[]): boolean {
    if (!this.isSeeded()) return false;
    let changed = false;
    for (const id of abilityIds) {
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      changed = true;
      const next = placeInFirstFreeCell(this.layout, { type: 'ability', id });
      if (next) this.layout = next;
    }
    if (changed) this.save();
    return changed;
  }

  /** The whole layout, for the overlay and the options panel. */
  all(): readonly (readonly CrossHotbarAction[])[] {
    return this.layout;
  }

  /** Whether anything sits on the bar yet. */
  isSeeded(): boolean {
    return isCrossHotbarSeeded(this.layout);
  }

  /**
   * Fill an untouched bar from the player's action bar, plus any class extras
   * (a warrior's stance is known at level one yet unbound, so a pad player could
   * never reach it). Does nothing once the bar holds anything, so a player's own
   * arrangement is never overwritten.
   */
  /** Record what the bar already holds as seen, so seeding does not re-offer it. */
  private markSeededSeen(): void {
    for (const cells of this.layout) {
      for (const cell of cells) if (cell?.type === 'ability') this.seen.add(cell.id);
    }
  }

  seedOnce(barActions: readonly CrossHotbarAction[], extras: readonly string[] = []): boolean {
    if (this.isSeeded()) return false;
    // Wait for the ACTION BAR specifically, not for any content at all. A pad is
    // usually connected before the character's bar loads, and the extras (the
    // stance) are ready first: latching then would seed a bar holding nothing but
    // a stance and never fill in the player's actual actions.
    if (!barActions.some((action) => action !== null)) return false;
    this.layout = seedCrossHotbarLayout(barActions, extras);
    if (!this.isSeeded()) return false;
    this.markSeededSeen();
    this.save();
    return true;
  }

  /** The sixteen actions of one set, in display order. */
  setActions(set: number): readonly CrossHotbarAction[] {
    return crossHotbarSetActions(this.layout, set);
  }

  /** The action a held-trigger press casts, or null when unclaimed or empty. */
  actionFor(set: number, layer: CrossHotbarLayer, button: number): CrossHotbarAction {
    return crossHotbarActionFor(this.layout, set, layer, button);
  }

  /** Put an action on a cell, or clear it with null. Out-of-range sets and
   *  positions are ignored rather than clamped: a caller naming a cell that does
   *  not exist is a bug, and quietly writing a neighbour would hide it. */
  bind(set: number, position: number, action: CrossHotbarAction): void {
    if (!Number.isInteger(set) || set < 0 || set >= CROSS_HOTBAR_SET_COUNT) return;
    if (!Number.isInteger(position) || position < 0 || position >= CROSS_HOTBAR_SLOTS_PER_SET)
      return;
    this.layout[set][position] = action;
    this.save();
  }

  /** Rebind by the physical trigger-plus-button pair, the shape an edit mode and
   *  the options panel both speak. */
  bindButton(
    set: number,
    layer: CrossHotbarLayer,
    button: number,
    action: CrossHotbarAction,
  ): void {
    const position = crossHotbarPosition(layer, button);
    if (position === null) return;
    this.bind(set, position, action);
  }

  /** Move a cell onto another, swapping whatever was there (the edit-mode drag). */
  swap(setA: number, posA: number, setB: number, posB: number): void {
    const a = this.layout[setA]?.[posA];
    const b = this.layout[setB]?.[posB];
    if (a === undefined || b === undefined) return;
    this.layout[setA][posA] = b;
    this.layout[setB][posB] = a;
    this.save();
  }

  /** Clear the bar back to empty; the next seed refills it from the action bar. */
  reset(): void {
    this.layout = defaultCrossHotbarLayout();
    this.save();
  }
}
