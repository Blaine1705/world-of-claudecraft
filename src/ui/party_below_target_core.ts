// Pure geometry for the party frames' below-target offset. No DOM, no Three, no
// sim deps: given the measured boxes of the target frame, its #tf-debuffs strip
// (which hangs below the frame and grows with the target's aura count), and the
// party frames container, this answers "what author-space bottom must the party
// frames clear, if any?" so the calc is unit-testable headlessly (real layout
// cannot be asserted in jsdom). The DOM measuring and the CSS custom-property
// write live in party_below_target_painter.ts.
//
// Coordinate model (the target_frame_pos.ts / ui_scale.ts convention): inputs
// are VISUAL (post-zoom) viewport px from getBoundingClientRect(); the result is
// an AUTHOR-space length (visual / uiScale) suitable for a style or custom
// property write on a #ui child, which the `zoom: var(--ui-scale)` on #ui
// re-multiplies back to the visual value. The child zooms inside the target
// frame (--target-frame-scale, the mobile chrome transform scale) need no
// special handling here: the measured boxes already include them.

/** One measured box: the subset of DOMRect this calc reads, in visual px. */
export interface MeasuredBox {
  left: number;
  right: number;
  bottom: number;
}

export interface PartyBelowTargetInputs {
  /** The target frame's box, or null when the frame is hidden (no target). */
  frame: MeasuredBox | null;
  /** The #tf-debuffs strip box, or null when the strip is empty. The strip is
   *  absolutely positioned below the frame, so the frame's own box never
   *  includes it; the union of the two is the full target stack. */
  debuffs: MeasuredBox | null;
  /** The party frames container's horizontal span, in visual px. */
  party: { left: number; right: number } | null;
  /** The live UI scale (the `--ui-scale` zoom on #ui); bad values fall to 1. */
  uiScale: number;
}

// Mirrors target_frame_pos.ts safeScale: a non-finite or non-positive scale
// falls back to 1 so a bad read never blanks the layout. Exported so the
// painter converts its other raw measures (rows top, move-zone top) with the
// same rule.
export function safeScale(scale: number): number {
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * The AUTHOR-space bottom of the target stack (frame + debuff strip) the party
 * frames must clear, or null when no push is needed: no target frame, a party
 * column the stack does not horizontally overlap (e.g. a dragged target frame),
 * or a degenerate measure. The visual gap between the stack and the frames is
 * added in CSS (the below-target rule's `+ 8px`), not here, so the tunable
 * stays a stylesheet value.
 */
export function partyBelowTargetBottom(inputs: PartyBelowTargetInputs): number | null {
  const { frame, debuffs, party } = inputs;
  if (!frame) return null;
  const bottom = Math.max(frame.bottom, debuffs ? debuffs.bottom : frame.bottom);
  const left = Math.min(frame.left, debuffs ? debuffs.left : frame.left);
  const right = Math.max(frame.right, debuffs ? debuffs.right : frame.right);
  if (!Number.isFinite(bottom) || bottom <= 0) return null;
  // Horizontal-overlap gate: a stack fully beside the party column must not
  // push the frames down for no reason, and a missing or zero-width party span
  // (no members rendered) needs no push either.
  if (!party || party.right - party.left <= 0) return null;
  if (right <= party.left || left >= party.right) return null;
  return bottom / safeScale(inputs.uiScale);
}

export interface ReservedBelowTargetInput {
  /** This frame's measure, or null when the frame is hidden or does not overlap. */
  measured: number | null;
  /** The last bottom the frame actually occupied, or null before the first one. */
  reserved: number | null;
  targetShown: boolean;
  /** Whether the slot is held while the frame is hidden (touch only). */
  reserve: boolean;
}

/**
 * The bottom the party frames lay out against, HOLDING the target frame's slot
 * while it is hidden. The frame comes and goes with the player's target, so
 * anything seated off its live box jumps the moment they deselect. On touch the
 * frame now sits in the top band the collapsed menu row vacated with the party
 * stack hanging directly under it, so that jump lands mid-combat; laying out
 * against the last box the frame occupied keeps the slot whether or not anything
 * is in it. Desktop passes reserve: false and is unchanged.
 */
export function reservedBelowTargetBottom(input: ReservedBelowTargetInput): number | null {
  if (input.targetShown) return input.measured;
  return input.reserve ? input.reserved : null;
}
