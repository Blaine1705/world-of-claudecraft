// Thin painter for the cross-hotbar overlay (#cross-hotbar). Every write routes
// through the injected PainterHostWriters, so a frame that changes nothing costs
// no DOM mutation.
//
// The eight cells are painted by the SHARED ActionBarPainter, not by a second copy
// of the icon/cooldown/usability rules: the overlay re-presents cells the desktop
// action bar has already ticked this frame. It builds a small adapter state whose
// eight entries are REFERENCES into that state's slot array (no per-frame copy, no
// allocation), so a cross-hotbar cell can never disagree with the action-bar button
// it mirrors.

import type { PainterHostWriters } from '../../painter_host';
import type { ActionBarPaintDescriptor } from '../action_bar/action_bar_painter';
import { ActionBarPainter } from '../action_bar/action_bar_painter';
import type { ActionBarSlotState, ActionBarState } from '../action_bar/action_bar_view';
import { makeSlotState } from '../action_bar/action_bar_view';
import { CROSS_HOTBAR_CELLS, type CrossHotbarOverlayState } from './cross_hotbar_view';

const DISPLAY_SHOWN = '';
const DISPLAY_HIDDEN = 'none';
const LAYER_ATTR = 'data-xhb-layer';
const CLASS_EXPANDED = 'xhb-expanded';
// No trigger held: the attribute still needs a defined value, since the elided
// writer compares strings rather than removing the attribute.
const LAYER_NONE = 'none';

/** The overlay's root plus the eight cells, in CROSS_HOTBAR_CELLS order. */
export interface CrossHotbarPaintDescriptor {
  root: HTMLElement;
  bar: ActionBarPaintDescriptor;
}

export class CrossHotbarPainter {
  private readonly barPainter: ActionBarPainter;
  // Reused every frame: the eight entries are reassigned to point at the desktop
  // state's slots, so painting allocates nothing.
  private readonly adapter: ActionBarState;
  // Stands in for a cell whose layout entry names no real action-bar slot.
  private readonly blank: ActionBarSlotState = makeSlotState();

  constructor(
    private readonly writers: PainterHostWriters,
    private readonly descriptor: CrossHotbarPaintDescriptor,
    resolveBackgroundImage: (iconKey: string) => string,
  ) {
    this.barPainter = new ActionBarPainter(writers, descriptor.bar, resolveBackgroundImage);
    this.adapter = { slots: CROSS_HOTBAR_CELLS.map(() => this.blank), manySpells: false };
  }

  /**
   * Paint one frame. `bar` is the desktop action bar's state for THIS frame; the
   * overlay reads its cells straight out of it. A hidden overlay stops after the
   * display write, so a player who never touches a trigger pays one elided write
   * per frame and nothing else.
   */
  paint(state: CrossHotbarOverlayState, bar: ActionBarState): void {
    this.writers.setDisplay(this.descriptor.root, state.visible ? DISPLAY_SHOWN : DISPLAY_HIDDEN);
    if (!state.visible) return;

    this.writers.setAttr(this.descriptor.root, LAYER_ATTR, state.layer ?? LAYER_NONE);
    this.writers.toggleClass(this.descriptor.root, CLASS_EXPANDED, state.expanded);

    for (let i = 0; i < this.adapter.slots.length; i++) {
      const slot = state.cellSlots[i];
      this.adapter.slots[i] = bar.slots[slot] ?? this.blank;
    }
    this.barPainter.paint(this.adapter);
  }
}
