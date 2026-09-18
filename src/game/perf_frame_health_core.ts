// The one "is the last window a bad frame window" rule the perf doctor and the
// diagnostics panel share. It reads a window against the rate the session is
// AIMING at: under a chosen frame rate ceiling a steady 30 is the goal, and
// judging it against 60 would tell every such player to fix what the client
// chose for them (and ship that verdict to the fleet as a suggestion id).
//
// Pure: a window and the chosen cadence in, a verdict out.

export interface FrameHealthWindow {
  frames: number;
  fps: number;
  frameMs: { p95: number; long50: number };
}

/** The chosen cadence, or absent when the display paces the frames. */
export interface FrameHealthCadence {
  targetIntervalMs: number;
  missShare: number;
}

const NOMINAL_FRAME_MS = 1000 / 60;
/** A window is bad under this share of the aimed rate (45 of 60). */
const LOW_FPS_SHARE = 0.75;
/** ... or with a p95 past this many aimed intervals (28 ms of 16.7). */
const SLOW_P95_INTERVALS = 1.68;
/** Frames of 50 ms or more, the rule with no ceiling: three in a window. */
const LONG_FRAMES = 3;
/** Under a ceiling a 50 ms frame is one missed slot, so the long-frame count
 *  is replaced by the share of frames that missed their slot. */
const CHOSEN_CADENCE_BAD_MISS_SHARE = 0.1;

export function isBadFrameWindow(
  w: FrameHealthWindow,
  cadence?: FrameHealthCadence | null,
): boolean {
  if (w.frames === 0) return false;
  const chosen = cadence && cadence.targetIntervalMs > 0 ? cadence : null;
  const aimedMs = chosen ? chosen.targetIntervalMs : NOMINAL_FRAME_MS;
  if (w.fps < (1000 / aimedMs) * LOW_FPS_SHARE) return true;
  if (w.frameMs.p95 >= aimedMs * SLOW_P95_INTERVALS) return true;
  return chosen
    ? chosen.missShare >= CHOSEN_CADENCE_BAD_MISS_SHARE
    : w.frameMs.long50 >= LONG_FRAMES;
}
