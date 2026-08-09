// The one decision point for "what may this frame skip". The desktop shell can
// be hidden or minimized while the page still believes it is visible
// (backgroundThrottling is off, so the Page Visibility API never flips), which
// is why the hidden signal is an input here rather than a document read.
//
// Pure and DOM-free so the truth table is unit-testable; main.ts only consumes
// the decision.

export interface PresentationGateInput {
  /** Hidden per the page OR per the desktop shell's push. */
  hidden: boolean;
  /** True only in the desktop shell build. */
  desktopApp: boolean;
  /** The renderer is being rebuilt; nothing may run against it this frame. */
  graphicsRebuildPaused: boolean;
}

export interface PresentationGateDecision {
  /** Submit GL draws and sample the frame for perf. */
  render: boolean;
  /** Write HUD and overlay DOM. */
  paint: boolean;
  /** Advance the sim and drain the network. */
  tick: boolean;
}

/**
 * Decide what a frame is allowed to do. Ordered by precedence: the graphics
 * rebuild wins over everything, then the desktop hidden state, then the
 * all-allowed default.
 */
export function presentationGate(input: PresentationGateInput): PresentationGateDecision {
  if (input.graphicsRebuildPaused) return { render: false, paint: false, tick: false };
  if (input.hidden && input.desktopApp) {
    // tick stays true while hidden: skipping the network drain lets the server
    // snapshot backlog pile up and refocus then freezes the client working
    // through it (the July WS-backlog refocus freeze).
    return { render: false, paint: false, tick: true };
  }
  // Web keeps every frame whole, hidden or not: rAF is already paused in a
  // hidden tab, so there is no frame to skip and no behavior to change.
  return { render: true, paint: true, tick: true };
}
