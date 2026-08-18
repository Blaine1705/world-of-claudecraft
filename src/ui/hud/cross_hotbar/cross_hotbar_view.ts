// Pure, DOM-free model for the cross-hotbar overlay: the eight cells one held
// trigger lights, and which action-bar slot each one currently shows. The overlay
// draws two diamonds of four (the d-pad and the face buttons) whose CONTENTS swap
// with the held trigger, rather than showing all sixteen of a set at once.
//
// Deliberately self-contained: it names no gamepad button, because a registered UI
// pure core stays host-agnostic (it may not reach into src/game). The CELL ORDER
// here must stay in step with CROSS_HOTBAR_LAYER_BUTTONS in game/cross_hotbar.ts,
// which is a cross-module contract, so tests/cross_hotbar_view.test.ts pins the two
// against each other rather than an import doing it.
//
// The per-cell icon, cooldown and usability state is NOT re-derived here: the
// overlay reuses the desktop action bar's already-ticked ActionBarState, so a
// cross-hotbar cell and its action-bar button can never disagree.

/** Which trigger is held. Structurally the game core's CrossHotbarLayer. */
export type CrossHotbarOverlayLayer = 'left' | 'right';

export type CrossHotbarCluster = 'dpad' | 'face';
export type CrossHotbarPoint = 'top' | 'left' | 'right' | 'bottom';

/** One overlay cell: where it sits in its diamond. */
export interface CrossHotbarCell {
  /** 0 to 7, the overlay's own display order. */
  index: number;
  cluster: CrossHotbarCluster;
  point: CrossHotbarPoint;
}

// Each diamond is read top, left, right, bottom.
const POINTS: readonly CrossHotbarPoint[] = ['top', 'left', 'right', 'bottom'];
const CLUSTERS: readonly CrossHotbarCluster[] = ['dpad', 'face'];

/** The eight cells, in display order: the d-pad diamond then the face diamond. */
export const CROSS_HOTBAR_CELLS: readonly CrossHotbarCell[] = CLUSTERS.flatMap(
  (cluster, clusterIndex) =>
    POINTS.map((point, pointIndex) => ({
      index: clusterIndex * POINTS.length + pointIndex,
      cluster,
      point,
    })),
);

export const CROSS_HOTBAR_CELL_COUNT = CROSS_HOTBAR_CELLS.length;

export interface CrossHotbarOverlayState {
  visible: boolean;
  layer: CrossHotbarOverlayLayer | null;
  /** Whether the second (double) set is showing, for the overlay's set marker. */
  expanded: boolean;
  /** Action-bar slot per cell, always eight entries; -1 where the layout has none. */
  cellSlots: readonly number[];
}

export const HIDDEN_CROSS_HOTBAR: CrossHotbarOverlayState = {
  visible: false,
  layer: null,
  expanded: false,
  cellSlots: CROSS_HOTBAR_CELLS.map(() => -1),
};

/** What the HUD is handed when a trigger goes down: which trigger, the eight
 *  action-bar slots it reaches, and whether the double set is showing. */
export interface CrossHotbarHold {
  layer: CrossHotbarOverlayLayer;
  slots: readonly number[];
  expanded: boolean;
}

/**
 * Build the overlay state for a held trigger. `layerSlots` is the eight action-bar
 * slots that trigger reaches (game/cross_hotbar resolves it from the persisted
 * layout); a null layer means no trigger is held, which hides the bar. A short or
 * missing slot list still yields eight cells, so the painter never indexes past its
 * own elements.
 */
export function crossHotbarOverlayState(
  layer: CrossHotbarOverlayLayer | null,
  layerSlots: readonly number[],
  expanded = false,
): CrossHotbarOverlayState {
  if (layer === null) return HIDDEN_CROSS_HOTBAR;
  const cellSlots: number[] = [];
  for (let i = 0; i < CROSS_HOTBAR_CELL_COUNT; i++) {
    const slot = layerSlots[i];
    cellSlots.push(typeof slot === 'number' && slot >= 0 ? slot : -1);
  }
  return { visible: true, layer, expanded, cellSlots };
}
