// DOM applier for the right tracker stack's dynamic seat: keeps
// #right-tracker-stack anchored BELOW the minimap column's real rendered
// bottom (wrap plus the zoom pill and clock that overhang it) instead of the
// per-tier stylesheet constant, which cannot see a wrapping zone label, the
// mobile chrome scale, or the compact-tier transform (the seat/geometry
// rationale and the math live in tracker_stack_anchor_core.ts).
//
// Cadence contract: apply() is driven from Hud.update()'s slow band (500ms,
// beside the tracker repaints; see the registry row in
// tests/hud_update_drive.test.ts), once at install, and on window resize. Each
// apply makes at most three getBoundingClientRect reads, a deliberate,
// bounded forced-reflow cost on a 2Hz band (the aura-anchor precedent in
// hud.ts); it must never be called from a per-frame path. The one style write
// is elided through lastTopPx, so a settled layout writes nothing. Registered
// in UI_DOM_MODULES (tests/architecture.test.ts): it owns a window resize
// listener and layout reads by design.

import {
  type TrackerStackAnchorMeasure,
  trackerStackAnchorTopPx,
} from './tracker_stack_anchor_core';

export interface TrackerStackAnchorDeps {
  /** The #right-tracker-stack element (the host owns the id). */
  stack(): HTMLElement;
  /** The #minimap-wrap column the stack seats under. */
  minimapWrap(): HTMLElement;
  /** Chrome that hangs below the wrap's own box (the desktop zoom pill and
   *  clock sit at negative bottom offsets); hidden entries resolve to nothing. */
  overhangs(): readonly (HTMLElement | null)[];
  /** The live #ui zoom (getUiScale), dividing rect space back into UI space. */
  uiScale(): number;
}

export class TrackerStackAnchor {
  // Resolved ONCE at construction (the painter idiom): these are static
  // index.html chrome nodes, never rebuilt, so per-apply re-queries would be
  // pure waste on the slow band.
  private readonly stack: HTMLElement;
  private readonly wrap: HTMLElement;
  private readonly overhangs: readonly HTMLElement[];
  /** Last applied top (UI px), or null when the stylesheet seat stands. */
  private lastTopPx: number | null = null;

  constructor(private readonly deps: TrackerStackAnchorDeps) {
    this.stack = deps.stack();
    this.wrap = deps.minimapWrap();
    this.overhangs = deps.overhangs().filter((el): el is HTMLElement => el !== null);
  }

  /** Re-measure the minimap column and re-seat the stack (elided write). */
  apply(): void {
    const wrapRect = this.wrap.getBoundingClientRect();
    // A hidden or unlaid-out column measures 0x0: fall back to the stylesheet
    // seat rather than anchoring the stack to the viewport's top edge.
    const visible = wrapRect.width > 0 && wrapRect.height > 0;
    const measure: TrackerStackAnchorMeasure = {
      minimapBottomPx: visible ? wrapRect.bottom : null,
      overhangBottomsPx: visible
        ? this.overhangs.map((el) => el.getBoundingClientRect().bottom)
        : [],
      uiScale: this.deps.uiScale(),
    };
    const top = trackerStackAnchorTopPx(measure);
    if (top === this.lastTopPx) return;
    this.lastTopPx = top;
    if (top === null) this.stack.style.removeProperty('top');
    else this.stack.style.top = `${top}px`;
  }
}

/** Construct the anchor, seat the stack once, and keep it seated across
 *  viewport resizes (rotation, split-screen, window drags). The slow band
 *  covers everything else that moves the column (zone change, chrome scale). */
export function installTrackerStackAnchor(deps: TrackerStackAnchorDeps): TrackerStackAnchor {
  const anchor = new TrackerStackAnchor(deps);
  anchor.apply();
  window.addEventListener('resize', () => anchor.apply());
  return anchor;
}
