// Pure, host-agnostic view model for the "Riding Lessons" mount-training minigame
// panel (Stablemaster Marla's story riding lesson): a ridden equestrian course.
//
// This is the pure-core half of the pure-core + thin-consumer split (root CLAUDE.md
// Conventions; reference vendor_view.ts). It maps the raw IWorld.MountTrainingView
// into a render model the thin painter (mount_training_window.ts) draws. DOM/Three/
// i18n-free so tests/mount_training_view.test.ts can drive it directly: it returns
// only the phase discriminator and the numeric ride progress, and the painter
// renders every player-visible string through the hudChrome.mountTraining.* t() keys.

import type { MountTrainingView } from '../world_api';

export interface MountTrainingRenderModel {
  /** False when there is no live session: the panel has nothing to paint. */
  active: boolean;
  /** 'mount' before the training steed is summoned, 'ride' during the course, or
   *  null when idle. Selects which instruction the painter shows. */
  phase: 'mount' | 'ride' | null;
  /** Ride progress args ("Gate {n} of {total}"), or null in phase 'mount'/idle. */
  progress: { n: number; total: number } | null;
}

const IDLE_MODEL: MountTrainingRenderModel = {
  active: false,
  phase: null,
  progress: null,
};

/** Build the panel's render model from the authoritative view. A null view (no live
 *  session) always maps to the shared IDLE_MODEL instance: allocation-light, no
 *  per-call object when idle. */
export function mountTrainingRenderModel(view: MountTrainingView | null): MountTrainingRenderModel {
  if (!view) return IDLE_MODEL;
  const riding = view.phase === 'ride';
  return {
    active: true,
    phase: view.phase,
    // The gate being ridden to is 1-based for display: gate 0 cleared means heading
    // to gate 1 of N. Null once the last gate is cleared (the session ends then).
    progress:
      riding && view.gate < view.gatesTotal ? { n: view.gate + 1, total: view.gatesTotal } : null,
  };
}

/** Compact signature of everything the panel paint depends on: the per-frame
 *  repaintIfChanged safety net compares this against the last paint and only touches
 *  the DOM when it changes (mirrors lockpickRenderSig). */
export function mountTrainingRenderSig(view: MountTrainingView): string {
  return `${view.sessionId}|${view.phase}|${view.gate}|${view.gatesTotal}`;
}
