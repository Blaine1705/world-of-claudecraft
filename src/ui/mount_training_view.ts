// Pure, host-agnostic view model for the "Riding Lessons" mount-training minigame
// bottom strip (Stablemaster Marla's timed show-jumping course).
//
// This is the pure-core half of the pure-core + thin-consumer split (root CLAUDE.md
// Conventions; reference vendor_view.ts). It maps the raw IWorld.MountTrainingView
// into a render model the thin painter (mount_training_strip.ts) draws. DOM/Three/
// i18n-free so tests/mount_training_view.test.ts can drive it directly: it returns
// the phase discriminator plus the numeric jump progress and countdown, and the
// painter renders every player-visible string through the hudChrome.mountTraining.*
// t() keys. It converts the wire's tick-based countdown into whole seconds + a bar
// fraction (importing only the sim TICK_RATE constant, no DOM).

import { TICK_RATE } from '../sim/types';
import type { MountTrainingView } from '../world_api';

export interface MountTrainingRenderModel {
  /** False when there is no live session: the strip has nothing to paint. */
  active: boolean;
  /** 'mount' before the steed is summoned, 'staging' mounted before the timer arms,
   *  'course' during the timed run, or null when idle. Selects the strip's content. */
  phase: 'mount' | 'staging' | 'course' | null;
  /** Jump progress args ("Jump {n} of {total}"), or null outside 'course'. */
  progress: { n: number; total: number } | null;
  /** Whole seconds left on the countdown (ceil, so it reads "1" until truly 0), or
   *  null outside 'course'. */
  secondsLeft: number | null;
  /** Countdown bar fill fraction [0..1], or null outside 'course'. */
  timeFraction: number | null;
}

const IDLE_MODEL: MountTrainingRenderModel = {
  active: false,
  phase: null,
  progress: null,
  secondsLeft: null,
  timeFraction: null,
};

/** Build the strip's render model from the authoritative view. A null view (no live
 *  session) always maps to the shared IDLE_MODEL instance: allocation-light. */
export function mountTrainingRenderModel(view: MountTrainingView | null): MountTrainingRenderModel {
  if (!view) return IDLE_MODEL;
  const onCourse = view.phase === 'course';
  // The jump being ridden to is 1-based for display: 0 cleared means heading to jump
  // 1 of N. Null once the last jump is cleared (the session ends then).
  const progress =
    onCourse && view.jump < view.jumpsTotal ? { n: view.jump + 1, total: view.jumpsTotal } : null;
  let secondsLeft: number | null = null;
  let timeFraction: number | null = null;
  if (onCourse && view.ticksLeft != null) {
    secondsLeft = Math.ceil(view.ticksLeft / TICK_RATE);
    timeFraction =
      view.timeLimitTicks > 0 ? Math.max(0, Math.min(1, view.ticksLeft / view.timeLimitTicks)) : 0;
  }
  return { active: true, phase: view.phase, progress, secondsLeft, timeFraction };
}

/** Compact signature of everything the strip paint depends on: the per-frame
 *  repaintIfChanged safety net compares this against the last paint and only touches
 *  the DOM when it changes. The countdown is bucketed to whole seconds so a per-frame
 *  ticksLeft drift (the online mirror counts wall-clock) repaints only once a second,
 *  not every frame. */
export function mountTrainingRenderSig(view: MountTrainingView): string {
  const secBucket = view.ticksLeft != null ? Math.ceil(view.ticksLeft / TICK_RATE) : -1;
  return `${view.sessionId}|${view.phase}|${view.jump}|${view.jumpsTotal}|${secBucket}`;
}
