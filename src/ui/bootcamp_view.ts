// Pure, host-agnostic model for the Proving Shore movement bootcamp: the
// coachmark a fresh arrival sees on the tutorial island, teaching walking,
// the camera, and jumping via the Gauntlet flag course on the south strand.
//
// The island's on-rails quest chain teaches the GAME (combat, looting,
// trades, the bank); this overlay teaches the HANDS, the three things a
// complete beginner must feel before any quest text can help them: move,
// look, jump. It is the island sibling of the Eastbrook new-adventurer
// coachmark (tutorial.ts + tutorial_copy.ts) and follows the same recipe:
// a pure step ladder over an observed snapshot, copy selection keyed by
// step and input family, and a DOM overlay (bootcamp.ts) that owns nothing
// but paint. Unlike the Eastbrook card's binary keyboard/touch split, copy
// here has THREE arms: keyboard/mouse, touch, and gamepad, chosen by the
// live input-hint mode (src/game/input_hint_mode.ts), because the island is
// the one place guaranteed to meet a player who has never used any of them.
//
// The pure-core half of the pure-core + thin-consumer split (root CLAUDE.md);
// registered in UI_PURE_CORES (tests/architecture.test.ts); driven directly
// by tests/bootcamp_view.test.ts.

import { BOOTCAMP_COURSE_CHECKPOINTS } from '../sim/content/proving_shore';
import type { TranslationKey } from './i18n';

/** The control family the copy speaks for. Structurally identical to
 *  input_hint_mode.ts's InputHintMode; declared here rather than imported so
 *  this core stays free of game/ imports (the pure-core purity scan). */
export type BootcampInputMode = 'keyboard' | 'touch' | 'pad';

/** Yards of displacement from the engage point before "move" is learned. */
export const BOOTCAMP_MOVE_THRESHOLD_YD = 3;
/** Cumulative camera-yaw travel (radians) before "camera" is learned. */
export const BOOTCAMP_CAMERA_TURN_RAD = 0.9;
/** How close (yards) the player must pass to a Gauntlet flag to tag it. */
export const BOOTCAMP_CHECKPOINT_RADIUS_YD = 4;

export type BootcampStep = 'move' | 'camera' | 'course' | 'done';

export const BOOTCAMP_STEP_ORDER: readonly BootcampStep[] = ['move', 'camera', 'course'];

export interface BootcampSnapshot {
  /** 2D displacement from where the overlay engaged, in yards. */
  movedYd: number;
  /** Total camera-yaw travel since engage, radians (absolute, accumulated). */
  cameraTurnedRad: number;
  /** Gauntlet flags tagged so far, in running order. */
  checkpointsReached: number;
}

/** The first lesson the snapshot has not yet satisfied. Strictly ordered:
 *  move, then camera, then the course, so one card teaches one thing. */
export function computeBootcampStep(s: BootcampSnapshot): BootcampStep {
  if (s.movedYd < BOOTCAMP_MOVE_THRESHOLD_YD) return 'move';
  if (s.cameraTurnedRad < BOOTCAMP_CAMERA_TURN_RAD) return 'camera';
  if (s.checkpointsReached < BOOTCAMP_COURSE_CHECKPOINTS.length) return 'course';
  return 'done';
}

/** Advance the sequential checkpoint counter: the NEXT flag in running order
 *  is tagged when the player passes within radius. One call may only ever
 *  advance by one (a frame cannot cross two flags 10 yards apart). */
export function advanceCheckpoints(reached: number, pos: { x: number; z: number }): number {
  const next = BOOTCAMP_COURSE_CHECKPOINTS[reached];
  if (!next) return reached;
  const d = Math.hypot(pos.x - next.x, pos.z - next.z);
  return d <= BOOTCAMP_CHECKPOINT_RADIUS_YD ? reached + 1 : reached;
}

/** The world point the guidance arrow should aim at, or null once done. */
export function bootcampArrowTarget(
  step: BootcampStep,
  checkpointsReached: number,
): { x: number; z: number } | null {
  if (step !== 'course') return null;
  return BOOTCAMP_COURSE_CHECKPOINTS[checkpointsReached] ?? null;
}

export type BootcampParam = 'moveKeys' | 'jumpKey';

export interface BootcampBodyPlan {
  bodyKey: TranslationKey;
  /** Which interpolation params the body needs (keyboard arms only; touch and
   *  pad copy names on-screen affordances and sticks instead of bind labels). */
  params: readonly BootcampParam[];
}

const KEYBOARD: Record<BootcampStep, BootcampBodyPlan> = {
  move: { bodyKey: 'hudChrome.bootcamp.moveBody', params: ['moveKeys'] },
  camera: { bodyKey: 'hudChrome.bootcamp.cameraBody', params: [] },
  course: { bodyKey: 'hudChrome.bootcamp.courseBody', params: ['jumpKey'] },
  done: { bodyKey: 'hudChrome.bootcamp.doneBody', params: [] },
};

const TOUCH: Record<BootcampStep, BootcampBodyPlan> = {
  move: { bodyKey: 'hudChrome.bootcamp.moveBodyTouch', params: [] },
  camera: { bodyKey: 'hudChrome.bootcamp.cameraBodyTouch', params: [] },
  course: { bodyKey: 'hudChrome.bootcamp.courseBodyTouch', params: [] },
  done: { bodyKey: 'hudChrome.bootcamp.doneBody', params: [] },
};

const PAD: Record<BootcampStep, BootcampBodyPlan> = {
  move: { bodyKey: 'hudChrome.bootcamp.moveBodyPad', params: [] },
  camera: { bodyKey: 'hudChrome.bootcamp.cameraBodyPad', params: [] },
  course: { bodyKey: 'hudChrome.bootcamp.courseBodyPad', params: [] },
  done: { bodyKey: 'hudChrome.bootcamp.doneBody', params: [] },
};

export function bootcampBodyPlan(step: BootcampStep, mode: BootcampInputMode): BootcampBodyPlan {
  if (mode === 'touch') return TOUCH[step];
  if (mode === 'pad') return PAD[step];
  return KEYBOARD[step];
}

export function bootcampTitleKey(step: BootcampStep): TranslationKey {
  const titles: Record<BootcampStep, TranslationKey> = {
    move: 'hudChrome.bootcamp.moveTitle',
    camera: 'hudChrome.bootcamp.cameraTitle',
    course: 'hudChrome.bootcamp.courseTitle',
    done: 'hudChrome.bootcamp.doneTitle',
  };
  return titles[step];
}

/** The physical keycap chips to show under the body ("the buttons they need
 *  to press, on screen"). Keyboard only: touch and pad have no keycaps, their
 *  copy names the on-screen affordance or stick instead. */
export function bootcampKeycaps(
  step: BootcampStep,
  mode: BootcampInputMode,
  labels: { moveKeys: readonly string[]; jumpKey: string },
): readonly string[] {
  if (mode !== 'keyboard') return [];
  if (step === 'move') return labels.moveKeys.filter(Boolean);
  if (step === 'course') return labels.jumpKey ? [labels.jumpKey] : [];
  return [];
}

/** Repaint only when the step or the input family changes (the tutorial.ts
 *  precedent): the course counter alone is live-patched by the overlay. */
export function bootcampNeedsRerender(
  prevStep: BootcampStep | null,
  nextStep: BootcampStep,
  prevMode: BootcampInputMode,
  nextMode: BootcampInputMode,
): boolean {
  return prevStep !== nextStep || prevMode !== nextMode;
}
