// Pure, host-agnostic model for the Proving Shore movement bootcamp: the
// coachmark a fresh arrival sees on the tutorial island, walking them
// through Warden Tam's Gauntlet, the walled two-elbow lane course on the
// south strand, one ordered lesson per lane.
//
// The running order IS the curriculum: hold forward down lane 1 to its
// flag, swing the camera, strafe left down lane 2 to its flag, swing the
// camera again, then hold forward down lane 3 to the red finish flag. The
// flags themselves are credited sim-side in running order (the quest's own
// objective count, tutorial/gauntlet_run.ts); this ladder folds that count
// with the client-side camera-swing progress into one lesson at a time.
//
// The island's on-rails quest chain teaches the GAME (combat, looting,
// trades, the bank); this overlay teaches the HANDS. It is the island
// sibling of the Eastbrook new-adventurer coachmark (tutorial.ts +
// tutorial_copy.ts). Copy has THREE arms: keyboard/mouse, touch, and
// gamepad, chosen by the live input-hint mode (src/game/input_hint_mode.ts).
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

/** Camera-yaw travel (radians) each camera lesson asks for. */
export const BOOTCAMP_CAMERA_TURN_RAD = 0.9;

export type BootcampStep = 'forward' | 'camera' | 'left' | 'camera2' | 'forward2' | 'done';

export const BOOTCAMP_STEP_ORDER: readonly BootcampStep[] = [
  'forward',
  'camera',
  'left',
  'camera2',
  'forward2',
];

export interface BootcampSnapshot {
  /** Gauntlet flags tagged so far, in running order (0..3). */
  checkpointsReached: number;
  /** Camera-yaw travel since the LAST flag was tagged, radians (absolute,
   *  accumulated; the overlay resets it at each tag). */
  yawTurnedSinceFlagRad: number;
}

/** The current lesson. One lane at a time, a camera lesson between lanes,
 *  strictly in order. */
export function computeBootcampStep(s: BootcampSnapshot): BootcampStep {
  if (s.checkpointsReached <= 0) return 'forward';
  if (s.checkpointsReached === 1) {
    return s.yawTurnedSinceFlagRad < BOOTCAMP_CAMERA_TURN_RAD ? 'camera' : 'left';
  }
  if (s.checkpointsReached === 2) {
    return s.yawTurnedSinceFlagRad < BOOTCAMP_CAMERA_TURN_RAD ? 'camera2' : 'forward2';
  }
  return 'done';
}

/** The movement action a lane lesson teaches, or null for the camera
 *  lessons. The overlay uses it two ways: which keycap chip to show, and
 *  (keyboard mode) which held key unlocks the lane's flag credit. */
export function stepMovementAction(step: BootcampStep): 'forward' | 'strafeLeft' | null {
  if (step === 'forward' || step === 'forward2') return 'forward';
  if (step === 'left') return 'strafeLeft';
  return null;
}

// NOTE flag tagging itself lives sim-side (tutorial/gauntlet_run.ts credits
// q_ps_the_gauntlet's objective count as the runner passes each flag in
// order); the overlay mirrors that count, so this core only decides which
// lesson the count-plus-yaw state is on.

/** The world point the guidance arrow should aim at: the current lane's flag
 *  during a lane lesson, nothing during the camera lessons (the whole point
 *  there is to look around, not follow a marker) or once done. */
export function bootcampArrowTarget(
  step: BootcampStep,
  checkpointsReached: number,
): { x: number; z: number } | null {
  if (stepMovementAction(step) === null) return null;
  return BOOTCAMP_COURSE_CHECKPOINTS[checkpointsReached] ?? null;
}

export type BootcampParam = 'forwardKey' | 'strafeKey';

export interface BootcampBodyPlan {
  bodyKey: TranslationKey;
  /** Which interpolation params the body needs (keyboard arms only; touch and
   *  pad copy names sticks and on-screen affordances instead of bind labels). */
  params: readonly BootcampParam[];
}

const KEYBOARD: Record<BootcampStep, BootcampBodyPlan> = {
  forward: { bodyKey: 'hudChrome.bootcamp.forwardBody', params: ['forwardKey'] },
  camera: { bodyKey: 'hudChrome.bootcamp.cameraBody', params: [] },
  left: { bodyKey: 'hudChrome.bootcamp.leftBody', params: ['strafeKey'] },
  camera2: { bodyKey: 'hudChrome.bootcamp.camera2Body', params: [] },
  forward2: { bodyKey: 'hudChrome.bootcamp.forward2Body', params: ['forwardKey'] },
  done: { bodyKey: 'hudChrome.bootcamp.doneBody', params: [] },
};

const TOUCH: Record<BootcampStep, BootcampBodyPlan> = {
  forward: { bodyKey: 'hudChrome.bootcamp.forwardBodyTouch', params: [] },
  camera: { bodyKey: 'hudChrome.bootcamp.cameraBodyTouch', params: [] },
  left: { bodyKey: 'hudChrome.bootcamp.leftBodyTouch', params: [] },
  camera2: { bodyKey: 'hudChrome.bootcamp.camera2BodyTouch', params: [] },
  forward2: { bodyKey: 'hudChrome.bootcamp.forward2BodyTouch', params: [] },
  done: { bodyKey: 'hudChrome.bootcamp.doneBody', params: [] },
};

const PAD: Record<BootcampStep, BootcampBodyPlan> = {
  forward: { bodyKey: 'hudChrome.bootcamp.forwardBodyPad', params: [] },
  camera: { bodyKey: 'hudChrome.bootcamp.cameraBodyPad', params: [] },
  left: { bodyKey: 'hudChrome.bootcamp.leftBodyPad', params: [] },
  camera2: { bodyKey: 'hudChrome.bootcamp.camera2BodyPad', params: [] },
  forward2: { bodyKey: 'hudChrome.bootcamp.forward2BodyPad', params: [] },
  done: { bodyKey: 'hudChrome.bootcamp.doneBody', params: [] },
};

export function bootcampBodyPlan(step: BootcampStep, mode: BootcampInputMode): BootcampBodyPlan {
  if (mode === 'touch') return TOUCH[step];
  if (mode === 'pad') return PAD[step];
  return KEYBOARD[step];
}

export function bootcampTitleKey(step: BootcampStep): TranslationKey {
  const titles: Record<BootcampStep, TranslationKey> = {
    forward: 'hudChrome.bootcamp.forwardTitle',
    camera: 'hudChrome.bootcamp.cameraTitle',
    left: 'hudChrome.bootcamp.leftTitle',
    camera2: 'hudChrome.bootcamp.camera2Title',
    forward2: 'hudChrome.bootcamp.forward2Title',
    done: 'hudChrome.bootcamp.doneTitle',
  };
  return titles[step];
}

/** The physical keycap chips to show under the body ("the buttons they need
 *  to press, on screen"). Keyboard only: touch and pad have no keycaps, their
 *  copy names the stick or on-screen affordance instead. */
export function bootcampKeycaps(
  step: BootcampStep,
  mode: BootcampInputMode,
  labels: { forwardKey: string; strafeKey: string },
): readonly string[] {
  if (mode !== 'keyboard') return [];
  const action = stepMovementAction(step);
  if (action === 'forward') return labels.forwardKey ? [labels.forwardKey] : [];
  if (action === 'strafeLeft') return labels.strafeKey ? [labels.strafeKey] : [];
  return [];
}

/** Repaint only when the step or the input family changes (the tutorial.ts
 *  precedent): the flag counter alone is live-patched by the overlay. */
export function bootcampNeedsRerender(
  prevStep: BootcampStep | null,
  nextStep: BootcampStep,
  prevMode: BootcampInputMode,
  nextMode: BootcampInputMode,
): boolean {
  return prevStep !== nextStep || prevMode !== nextMode;
}
