// DOM adapter for the cross-hotbar overlay: mints the two diamonds and their eight
// cells inside the static #cross-hotbar root, holds the current overlay state, and
// drives the painter each frame. Cold by contract: no layout reads, no driver of
// its own (the HUD's frame loop calls paint).
//
// The root is aria-hidden by design. The cells MIRROR action-bar buttons that
// already carry their own accessible names, so exposing them again would announce
// every ability twice; the overlay is a controller-only affordance.

import type { PainterHostWriters } from '../../painter_host';
import type { ActionBarSlotElements } from '../action_bar/action_bar_painter';
import type { ActionBarState } from '../action_bar/action_bar_view';
import { CrossHotbarPainter } from './cross_hotbar_painter';
import type { CrossHotbarHold } from './cross_hotbar_view';
import {
  CROSS_HOTBAR_CELLS,
  type CrossHotbarOverlayState,
  crossHotbarOverlayState,
  HIDDEN_CROSS_HOTBAR,
} from './cross_hotbar_view';

const ROOT_ID = 'cross-hotbar';
const CLUSTER_CLASS = 'xhb-diamond';
const CELL_CLASS = 'xhb-slot';
const CELL_POSITION_ATTR = 'data-xhb-point';
const CELL_INDEX_ATTR = 'data-xhb-index';
const GLYPH_CLASS = 'xhb-glyph';

/** Mint one cell's inner spans, matching the action bar's element contract so the
 *  shared ActionBarPainter can write it unchanged. */
function buildCell(cell: (typeof CROSS_HOTBAR_CELLS)[number]): ActionBarSlotElements {
  const btn = document.createElement('div');
  btn.className = `action-btn ${CELL_CLASS}`;
  btn.setAttribute(CELL_POSITION_ATTR, cell.point);
  btn.setAttribute(CELL_INDEX_ATTR, String(cell.index));
  const label = document.createElement('span');
  label.className = 'icon-label';
  const countEl = document.createElement('span');
  countEl.className = 'item-count';
  const keybindEl = document.createElement('span');
  keybindEl.className = 'keybind';
  const cdOverlay = document.createElement('div');
  cdOverlay.className = 'cd-overlay';
  const cdText = document.createElement('div');
  cdText.className = 'cdtext';
  const rechargeOverlay = document.createElement('div');
  rechargeOverlay.className = 'recharge-overlay';
  btn.append(label, countEl, keybindEl, cdOverlay, rechargeOverlay, cdText);
  return { btn, label, countEl, keybindEl, cdOverlay, cdText, rechargeOverlay };
}

export class CrossHotbarController {
  private readonly painter: CrossHotbarPainter;
  private readonly glyphs: HTMLElement[] = [];
  private state: CrossHotbarOverlayState = HIDDEN_CROSS_HOTBAR;

  private constructor(
    root: HTMLElement,
    writers: PainterHostWriters,
    iconBg: (k: string) => string,
  ) {
    const cells: ActionBarSlotElements[] = [];
    for (const cluster of ['dpad', 'face'] as const) {
      const wrap = document.createElement('div');
      wrap.className = `${CLUSTER_CLASS} ${CLUSTER_CLASS}-${cluster}`;
      for (const cell of CROSS_HOTBAR_CELLS) {
        if (cell.cluster !== cluster) continue;
        const els = buildCell(cell);
        const glyph = document.createElement('span');
        glyph.className = GLYPH_CLASS;
        els.btn.appendChild(glyph);
        this.glyphs[cell.index] = glyph;
        wrap.appendChild(els.btn);
        cells[cell.index] = els;
      }
      root.appendChild(wrap);
    }
    this.painter = new CrossHotbarPainter(
      writers,
      { root, bar: { container: root, slots: cells } },
      iconBg,
    );
  }

  /** Build the overlay, or answer undefined on a document without the root (the
   *  same defensive shape the mobile action ring uses for an older template). */
  static create(
    writers: PainterHostWriters,
    iconBg: (iconKey: string) => string,
  ): CrossHotbarController | undefined {
    const root = document.getElementById(ROOT_ID);
    return root ? new CrossHotbarController(root, writers, iconBg) : undefined;
  }

  /** Open the overlay on a held trigger, or close it when `layer` is null. */
  /** Open, rest, or close the bar. The glyphs are written here rather than per
   *  frame (they only move when the pad's brand does) and into their OWN element,
   *  because the shared ActionBarPainter owns `.keybind` and would overwrite a
   *  glyph parked there with the keyboard keycap. */
  setHold(hold: CrossHotbarHold | null): void {
    this.state = crossHotbarOverlayState(
      hold?.layer ?? null,
      hold?.slots ?? [],
      hold?.expanded ?? false,
      hold?.active ?? true,
    );
    const labels = hold?.buttons;
    if (!labels) return;
    for (let i = 0; i < this.glyphs.length; i++) {
      const next = labels[i] ?? '';
      if (this.glyphs[i].textContent !== next) this.glyphs[i].textContent = next;
    }
  }

  /** Paint from the frame's already-ticked action-bar state. */
  paint(bar: ActionBarState): void {
    this.painter.paint(this.state, bar);
  }
}
