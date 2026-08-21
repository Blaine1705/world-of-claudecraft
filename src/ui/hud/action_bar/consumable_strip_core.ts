// Pure, DOM-free decision core for the consumables seat: which way the row may
// grow, when it comes up, and what a release means. The geometry itself lives in
// radial_action_core.ts (placeConsumableStrip / resolveStripIndex); this module
// owns the rules the gesture layer would otherwise bury in pointer state, so a
// Vitest drives every branch without a browser. Registered in
// tests/architecture.test.ts UI_PURE_CORES.
//
// Consumables are a homogeneous list rather than four distinct choices, so a row
// reads better than a radial and scales past four. It grows LEFT because the
// seat is the top of the ring's arc, hard against the screen edge a right-handed
// player holds it at; the left-handed HUD mirror flips the whole ring, which is
// the one case resolveConsumableStripDirection exists for.

import type { StripDirection } from './radial_action_core';

/** Travel between adjacent items as the FINGER sees it. Deliberately smaller
 *  than the visual pitch: at the drawn spacing the sixth item would need over
 *  300px of drag, past a comfortable thumb arc, while 34px traverses the whole
 *  row in roughly 200px without the items looking cramped. */
export const CONSUMABLE_STRIP_PITCH_PX = 34;

/** What a release on the seat does. */
export type ConsumableStripOutcome = { kind: 'use'; index: number } | { kind: 'cancel' };

export interface ConsumableStripReleaseInput {
  /** resolveStripIndex's readout: -1 while the finger is still in the deadzone. */
  index: number;
  /** Whether the row was showing when the finger came up. */
  revealed: boolean;
  /** Carried consumables. */
  count: number;
}

/**
 * The release rule. A bare tap uses the FIRST consumable, because the common
 * case is "heal now" and making that require a swipe would be worse than the
 * top-left bar it replaces. Once the row is OPEN, though, a release back in the
 * seat's own band means the player looked and chose nothing, so back out instead
 * of quaffing something they did not pick.
 */
export function resolveConsumableStripRelease(
  input: ConsumableStripReleaseInput,
): ConsumableStripOutcome {
  if (input.count <= 0) return { kind: 'cancel' };
  if (input.revealed && input.index < 0) return { kind: 'cancel' };
  const index = input.index < 0 ? 0 : Math.min(input.index, input.count - 1);
  return { kind: 'use', index };
}

/**
 * Whether the cancel target is the live choice. It is a PLACE, not a direction:
 * the X sits on the seat itself, so the band the finger started in is the way
 * out and the Y a thumb arc wanders to never matters.
 */
export function consumableStripCancelIsLive(index: number, revealed: boolean): boolean {
  return revealed && index < 0;
}

/**
 * Whether a drag that just moved onto an item should pull the row up early.
 * Passing the deadzone is itself intent, so the player never waits out the
 * reveal timer to see what they already committed to.
 */
export function shouldRevealConsumableStrip(index: number, revealed: boolean): boolean {
  return !revealed && index >= 0;
}

export interface ConsumableStripDirectionInput {
  /** Centre of the seat. */
  anchorX: number;
  count: number;
  itemSize: number;
  gap: number;
  viewportWidth: number;
  margin?: number;
}

/**
 * Which way the row grows. Left is the answer for the shipped right-handed ring
 * and stays the answer whenever the left side can hold the row, so the gesture a
 * player learns never changes under them; it flips only when the left cannot fit
 * the row and the right can, which is the left-handed mirror seating the ring
 * against the opposite edge.
 */
export function resolveConsumableStripDirection(
  input: ConsumableStripDirectionInput,
): StripDirection {
  const margin = input.margin ?? 0;
  const pitch = input.itemSize + input.gap;
  const span = pitch * input.count + input.itemSize / 2;
  const leftRoom = input.anchorX - margin;
  const rightRoom = input.viewportWidth - margin - input.anchorX;
  if (leftRoom >= span) return 'left';
  return rightRoom > leftRoom ? 'right' : 'left';
}
