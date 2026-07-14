// Pure, host-agnostic view model for the "Riding Lessons" mount-training
// minigame panel (Stablemaster Marla's story riding lesson).
//
// This is the pure-core half of the pure-core + thin-consumer split (root
// CLAUDE.md Conventions; reference lockpick_panel.ts / vendor_view.ts). It maps
// the raw IWorld.MountTrainingView into a render model the thin painter
// (mount_training_window.ts) draws. DOM/Three/i18n-free so
// tests/mount_training_view.test.ts can drive it directly: it returns stable
// discriminators (the lean/cue KEY SUFFIX, never a localized string), and hud.ts
// / the painter render every player-visible string through the
// hudChrome.mountTraining.* t() keys keyed off those suffixes.

import type { MountTrainingView, TrainingLean } from '../world_api';

/** One of the three lean choices the rider can answer with, always shown in
 * this left-to-right reading order (steady sits between the two leans). */
export interface MountTrainingLeanOption {
  lean: TrainingLean;
  /** hudChrome.mountTraining.<suffix> key suffix for the button's label. */
  labelSuffix: 'leanLeft' | 'steady' | 'leanRight';
}

/** Shared, allocation-free instance: the three answer buttons never change
 * shape, so every render model (idle or live) points at the same array. */
export const MOUNT_TRAINING_LEAN_OPTIONS: readonly MountTrainingLeanOption[] = [
  { lean: 'left', labelSuffix: 'leanLeft' },
  { lean: 'steady', labelSuffix: 'steady' },
  { lean: 'right', labelSuffix: 'leanRight' },
];

/** hudChrome.mountTraining.<suffix> key suffix for the current cue prompt. */
export type MountTrainingCueSuffix = 'cueLeft' | 'cueRight' | 'cueSteady';

const CUE_SUFFIX: Record<TrainingLean, MountTrainingCueSuffix> = {
  left: 'cueLeft',
  right: 'cueRight',
  steady: 'cueSteady',
};

export interface MountTrainingRenderModel {
  /** False when there is no live session: the panel has nothing to paint. */
  active: boolean;
  /** The lit cue suffix, or null when idle. */
  cueSuffix: MountTrainingCueSuffix | null;
  /** Round readout args ("Round {n} of {total}"), or null when idle. */
  round: { n: number; total: number } | null;
  /** Slip readout args ("Slips {n} of {cap}"), or null when idle. */
  misses: { n: number; cap: number } | null;
  /** Per-round reaction budget in ms: the shrinking COSMETIC countdown only.
   * The sim is authoritative on whether an answer landed in time; this never
   * gates or decides anything, it only shows the window shrinking. Null when
   * idle. */
  windowMs: number | null;
  /** The three lean buttons, always in the same order. */
  leanOptions: readonly MountTrainingLeanOption[];
}

const IDLE_MODEL: MountTrainingRenderModel = {
  active: false,
  cueSuffix: null,
  round: null,
  misses: null,
  windowMs: null,
  leanOptions: MOUNT_TRAINING_LEAN_OPTIONS,
};

/** Build the panel's render model from the authoritative view. A null view (no
 * live session) always maps to the shared IDLE_MODEL instance: allocation-light,
 * no per-call object when idle. */
export function mountTrainingRenderModel(view: MountTrainingView | null): MountTrainingRenderModel {
  if (!view) return IDLE_MODEL;
  return {
    active: true,
    cueSuffix: CUE_SUFFIX[view.cue],
    round: { n: view.round, total: view.roundsTotal },
    misses: { n: view.misses, cap: view.missCap },
    windowMs: view.windowMs,
    leanOptions: MOUNT_TRAINING_LEAN_OPTIONS,
  };
}

/** Compact signature of everything the panel paint depends on: the per-frame
 * repaintIfChanged safety net compares this against the last paint and only
 * touches the DOM when it changes (mirrors lockpickRenderSig). */
export function mountTrainingRenderSig(view: MountTrainingView): string {
  return `${view.sessionId}|${view.round}|${view.roundsTotal}|${view.misses}|${view.missCap}|${view.cue}`;
}

/** Identity of the current round's reaction window: changes on every new round
 * (or a fresh session), so the painter's cosmetic countdown refills exactly
 * then (mirrors lockpickTimerKey). */
export function mountTrainingTimerKey(view: MountTrainingView): string {
  return `${view.sessionId}:${view.round}`;
}
