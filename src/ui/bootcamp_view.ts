// Pure, host-agnostic model for the Proving Shore movement bootcamp: the
// coachmark that meets a fresh arrival at Warden Tam's Gauntlet, the walled
// two-elbow lane course on the south strand, and walks them through it one
// ordered lesson per lane.
//
// The ladder: TALK to Warden Tam (press F, which starts the run quest), hold
// forward down lane 1, turn with the turn key and walk the south lane, then
// swing the view with the mouse and STRAFE the last lane to the red flag,
// where Overseer Pell takes the run in. The flags are credited sim-side in
// running order (the quest's own objective count,
// tutorial/gauntlet_run.ts); this ladder folds that count with the quest's
// log state into one lesson at a time.
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

import { BOOTCAMP_COURSE_CHECKPOINTS, PROVING_SHORE_NPCS } from '../sim/content/proving_shore';
import type { TranslationKey } from './i18n';

/** The control family the copy speaks for. Structurally identical to
 *  input_hint_mode.ts's InputHintMode; declared here rather than imported so
 *  this core stays free of game/ imports (the pure-core purity scan). */
export type BootcampInputMode = 'keyboard' | 'touch' | 'pad';

export type BootcampStep = 'talk' | 'forward' | 'turnwalk' | 'strafe' | 'done';

export const BOOTCAMP_STEP_ORDER: readonly BootcampStep[] = [
  'talk',
  'forward',
  'turnwalk',
  'strafe',
];

export interface BootcampSnapshot {
  /** The run quest sits in the quest log (accepted at Warden Tam). */
  questActive: boolean;
  /** Gauntlet flags tagged so far, in running order (0..3). */
  checkpointsReached: number;
}

/** The current lesson: talk to the keeper, then one lane at a time. */
export function computeBootcampStep(s: BootcampSnapshot): BootcampStep {
  if (!s.questActive) return 'talk';
  if (s.checkpointsReached <= 0) return 'forward';
  if (s.checkpointsReached === 1) return 'turnwalk';
  if (s.checkpointsReached === 2) return 'strafe';
  return 'done';
}

/** The world point the guidance arrow should aim at: Warden Tam for the talk
 *  lesson, the current lane's flag while running, Overseer Pell at the end. */
export function bootcampArrowTarget(
  step: BootcampStep,
  checkpointsReached: number,
): { x: number; z: number } | null {
  if (step === 'talk') return PROVING_SHORE_NPCS.warden_tam.pos;
  if (step === 'done') return PROVING_SHORE_NPCS.overseer_pell.pos;
  return BOOTCAMP_COURSE_CHECKPOINTS[checkpointsReached] ?? null;
}

export type BootcampParam = 'forwardKey' | 'turnKey' | 'strafeKey' | 'interactKey';

export interface BootcampBodyPlan {
  bodyKey: TranslationKey;
  /** Which interpolation params the body needs (keyboard arms only; touch and
   *  pad copy names sticks and on-screen affordances instead of bind labels). */
  params: readonly BootcampParam[];
}

const KEYBOARD: Record<BootcampStep, BootcampBodyPlan> = {
  talk: { bodyKey: 'hudChrome.bootcamp.talkBody', params: ['interactKey'] },
  forward: { bodyKey: 'hudChrome.bootcamp.forwardBody', params: ['forwardKey'] },
  turnwalk: { bodyKey: 'hudChrome.bootcamp.turnwalkBody', params: ['turnKey', 'forwardKey'] },
  strafe: { bodyKey: 'hudChrome.bootcamp.strafeBody', params: ['strafeKey'] },
  done: { bodyKey: 'hudChrome.bootcamp.doneBody', params: ['interactKey'] },
};

const TOUCH: Record<BootcampStep, BootcampBodyPlan> = {
  talk: { bodyKey: 'hudChrome.bootcamp.talkBodyTouch', params: [] },
  forward: { bodyKey: 'hudChrome.bootcamp.forwardBodyTouch', params: [] },
  turnwalk: { bodyKey: 'hudChrome.bootcamp.turnwalkBodyTouch', params: [] },
  strafe: { bodyKey: 'hudChrome.bootcamp.strafeBodyTouch', params: [] },
  done: { bodyKey: 'hudChrome.bootcamp.doneBodyTouch', params: [] },
};

const PAD: Record<BootcampStep, BootcampBodyPlan> = {
  talk: { bodyKey: 'hudChrome.bootcamp.talkBodyPad', params: [] },
  forward: { bodyKey: 'hudChrome.bootcamp.forwardBodyPad', params: [] },
  turnwalk: { bodyKey: 'hudChrome.bootcamp.turnwalkBodyPad', params: [] },
  strafe: { bodyKey: 'hudChrome.bootcamp.strafeBodyPad', params: [] },
  done: { bodyKey: 'hudChrome.bootcamp.doneBodyPad', params: [] },
};

export function bootcampBodyPlan(step: BootcampStep, mode: BootcampInputMode): BootcampBodyPlan {
  if (mode === 'touch') return TOUCH[step];
  if (mode === 'pad') return PAD[step];
  return KEYBOARD[step];
}

export function bootcampTitleKey(step: BootcampStep): TranslationKey {
  const titles: Record<BootcampStep, TranslationKey> = {
    talk: 'hudChrome.bootcamp.talkTitle',
    forward: 'hudChrome.bootcamp.forwardTitle',
    turnwalk: 'hudChrome.bootcamp.turnwalkTitle',
    strafe: 'hudChrome.bootcamp.strafeTitle',
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
  labels: { forwardKey: string; turnKey: string; strafeKey: string; interactKey: string },
): readonly string[] {
  if (mode !== 'keyboard') return [];
  const caps: Record<BootcampStep, readonly string[]> = {
    talk: [labels.interactKey],
    forward: [labels.forwardKey],
    turnwalk: [labels.turnKey, labels.forwardKey],
    strafe: [labels.strafeKey],
    done: [labels.interactKey],
  };
  return caps[step].filter(Boolean);
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
