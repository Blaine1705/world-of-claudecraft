// Pure decision core for the touch radial gesture: what a press, a drag and a
// release MEAN. The DOM half (pointer capture, the reveal timer, measuring the
// pressed button) lives in radial_gesture.ts, which owns no rules of its own, so
// a Vitest drives every branch here without a browser.
//
// resolveRadialDirection in radial_action_core.ts answers WHERE a drag points;
// this module answers what to do about it, which is the part that has to agree
// with the rest of the HUD (a rearrange drag owns the press, an open radial
// makes the centre the way out rather than a cast).

import type { RadialDirection } from './radial_action_core';

/** What a release does. 'none' means some other owner consumed the press (a
 *  rearrange drag, an empowered hold), so the radial must stay silent rather
 *  than casting on top of it. */
export type RadialGestureOutcome =
  | { kind: 'cast'; direction: RadialDirection }
  | { kind: 'cancel' }
  | { kind: 'none' };

export interface RadialReleaseInput {
  /** The direction the drag resolved to at release. */
  direction: RadialDirection;
  /** Whether the petals were showing when the finger came up. */
  revealed: boolean;
  /** Whether that direction maps to a real hotbar slot on the current page. */
  hasSlot: boolean;
  /** Another owner (a rearrange drag, an empowered hold) took the press. */
  consumedElsewhere: boolean;
}

/**
 * The release rule. Released at the centre with the petals open means the player
 * opened the menu and chose nothing, so back out instead of casting: the centre
 * action stays one plain tap away, and committing to it here would turn an
 * inspect-then-think-better-of-it into an accidental cast.
 */
export function resolveRadialRelease(input: RadialReleaseInput): RadialGestureOutcome {
  if (input.consumedElsewhere) return { kind: 'none' };
  if (input.revealed && input.direction === 'center') return { kind: 'cancel' };
  if (!input.hasSlot) return { kind: 'none' };
  return { kind: 'cast', direction: input.direction };
}

/**
 * Whether a drag that just changed direction should pull the petals up early.
 * Moving past the deadzone is itself intent, so the player never waits out the
 * reveal timer to see what they already committed to.
 */
export function shouldRevealOnDrag(direction: RadialDirection, revealed: boolean): boolean {
  return !revealed && direction !== 'center';
}

/** Whether the cancel target (the radial's centre) is the live choice. It only
 *  exists once the petals are up; before that the centre is a plain tap. */
export function radialCancelIsLive(direction: RadialDirection, revealed: boolean): boolean {
  return revealed && direction === 'center';
}
