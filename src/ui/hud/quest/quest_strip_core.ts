// Pure, DOM-free core for the touch quest strip: the single-line top-band
// replacement for the right-anchored quest tracker on phones. It owns which
// quest is shown (cycling arithmetic and the swipe orientation), the counter's
// numeric inputs, the objective list the strip renders, and the band arithmetic
// that turns measured boxes into a left edge and a max width. The painter owns
// the measuring, the t() calls, and the formatting; registered in
// tests/architecture.test.ts UI_PURE_CORES.
//
// The tracker this replaces is unbounded in height, so every extra quest grows
// it downward into the action ring. The strip shows one quest at a time in the
// free top band, which makes its height a constant rather than a function of the
// quest count.
//
// It reads the SAME TrackedQuest model as quest_tracker.ts: the strip is a
// second presentation of the tracked quests, not a second data model.

import { FLICK_DEADZONE_PX } from '../action_bar/radial_action_core';
import type { TrackedQuest } from './quest_tracker';

/** Horizontal travel before a drag counts as a swipe rather than a tap. Shared
 *  with the radial so the whole HUD speaks one gesture language. */
export const QUEST_STRIP_SWIPE_DEADZONE_PX = FLICK_DEADZONE_PX;

/** A guard, not the normal case: authored quests carry one to three objectives,
 *  so this only ever trims a pathological one. Height stays bounded either way. */
export const QUEST_STRIP_MAX_OBJECTIVES = 4;

/** Where the top band starts, and the margin its ends keep. */
export const QUEST_STRIP_BAND_TOP_PX = 6;
export const QUEST_STRIP_BAND_MIN_X_PX = 12;

/** Clear space between the target frame's reserved slot and the strip. */
export const QUEST_STRIP_TARGET_FRAME_GAP_PX = 26;

/** Clear space between the strip and any other occupant of the band. */
export const QUEST_STRIP_BAND_GAP_PX = 10;

/** The strip must never be squeezed so hard its text disappears. Letting the
 *  band drive the width alone once left a strip showing the incompressible
 *  counter chip and no quest at all. */
export const QUEST_STRIP_MIN_WIDTH_PX = 150;

/** Band height assumed when the strip has not been measured yet (first paint),
 *  so the overlap test still rejects boxes that sit well below the band. */
export const QUEST_STRIP_FALLBACK_HEIGHT_PX = 56;

/** Which way a swipe moves the selection. Swiping LEFT advances, following the
 *  carousel convention: the content slides left to reveal the next quest. */
export type QuestStripStep = 1 | -1;

/**
 * The step a horizontal drag on the strip resolves to. A tap (travel inside the
 * deadzone) advances, so the strip is fully usable without any gesture at all.
 */
export function questStripStep(
  dx: number,
  deadzone: number = QUEST_STRIP_SWIPE_DEADZONE_PX,
): QuestStripStep {
  if (Math.abs(dx) < deadzone) return 1;
  return dx < 0 ? 1 : -1;
}

/** Move the selection by `step`, wrapping in both directions. A total below 2
 *  has nothing to cycle to, so the only valid index is 0. */
export function cycleQuestStrip(index: number, step: number, total: number): number {
  if (!Number.isFinite(index) || !Number.isFinite(step) || total < 2) return 0;
  const from = clampQuestIndex(index, total);
  return (((from + Math.trunc(step)) % total) + total) % total;
}

/** Keep a selection valid as the tracked set shrinks under it. */
export function clampQuestIndex(index: number, total: number): number {
  if (!Number.isFinite(index) || total <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), total - 1);
}

export interface QuestStripCounter {
  /** 1-based position of the shown quest. 0 when nothing is tracked. */
  position: number;
  total: number;
  /** False when there is nothing to cycle to, so the chevrons stay hidden. */
  visible: boolean;
}

/** The counter's numeric inputs. The painter formats them (through formatNumber
 *  and its t() key); a core that returned "2/3" would be un-localizable. */
export function questStripCounter(index: number, total: number): QuestStripCounter {
  if (total <= 0) return { position: 0, total: 0, visible: false };
  return { position: clampQuestIndex(index, total) + 1, total, visible: total > 1 };
}

export interface QuestStripObjectiveRow {
  /** Already-localized objective label, as the tracked model carries it. */
  label: string;
  current: number;
  total: number;
  done: boolean;
}

export interface QuestStripView {
  /** Whether to render anything at all (false when no quests are tracked). */
  visible: boolean;
  id: string;
  title: string;
  complete: boolean;
  /** The index actually shown, after clamping the requested one. */
  index: number;
  counter: QuestStripCounter;
  /** Every objective of the shown quest, capped at QUEST_STRIP_MAX_OBJECTIVES. */
  objectives: QuestStripObjectiveRow[];
  /** Objectives the cap trimmed, so the painter can add its "+N more" line. */
  hiddenObjectives: number;
}

// Built per call, never shared: the caller owns the arrays it is handed.
function emptyQuestStripView(): QuestStripView {
  return {
    visible: false,
    id: '',
    title: '',
    complete: false,
    index: 0,
    counter: { position: 0, total: 0, visible: false },
    objectives: [],
    hiddenObjectives: 0,
  };
}

/**
 * The strip's render model for one selection. EVERY objective of the shown quest
 * is included, not just the next one: the unbounded growth this replaces came
 * from the quest COUNT, and one quest's objectives is a small, self-limiting
 * list the player needs in full.
 */
export function questStripView(quests: readonly TrackedQuest[], index: number): QuestStripView {
  const total = quests.length;
  if (total === 0) return emptyQuestStripView();
  const shownIndex = clampQuestIndex(index, total);
  const quest = quests[shownIndex];
  const objectives = quest.objectives.slice(0, QUEST_STRIP_MAX_OBJECTIVES).map((o) => ({
    label: o.label,
    current: o.current,
    total: o.total,
    done: o.current >= o.total,
  }));
  return {
    visible: true,
    id: quest.id,
    title: quest.title,
    complete: quest.complete,
    index: shownIndex,
    counter: questStripCounter(shownIndex, total),
    objectives,
    hiddenObjectives: quest.objectives.length - objectives.length,
  };
}

/** One measured box, in visual viewport px: the subset of DOMRect the band
 *  arithmetic reads. The painter measures; this module only does the maths. */
export interface QuestStripBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface QuestStripBandInputs {
  viewportWidth: number;
  /** Everything that can legitimately share the top band (the combat row, the
   *  menu control, the party frames, the buff and debuff bars, the minimap).
   *  Each only counts while it actually overlaps the band vertically. */
  occupants: readonly QuestStripBox[];
  /** Right edge of the target frame's RESERVED slot, or null when no slot is
   *  reserved. Reserved rather than measured so the strip holds its position
   *  when the player drops their target and the frame disappears. */
  reservedRight: number | null;
  /** Measured strip height; 0 before the first measure. */
  stripHeight: number;
}

export interface QuestStripBand {
  left: number;
  /** A max-width, not a width: the strip hugs its text rather than filling the
   *  band, which would leave a mostly empty slab. */
  maxWidth: number;
  top: number;
}

/**
 * Seat the strip in the measured gap the band's other occupants leave, rather
 * than at a fixed offset, so it survives a scale or safe-area change. Anchoring
 * off any single element was wrong twice over in the lab: off the button row it
 * broke when the row collapsed, and off the collapsed menu button it parked the
 * strip on top of the target frame once that frame moved into the same band.
 * The target frame is deliberately not an occupant: its reserved right edge is
 * supplied instead, so losing a target does not slide the strip left.
 */
export function questStripBand(inputs: QuestStripBandInputs): QuestStripBand {
  const top = QUEST_STRIP_BAND_TOP_PX;
  const height = inputs.stripHeight > 0 ? inputs.stripHeight : QUEST_STRIP_FALLBACK_HEIGHT_PX;
  const bandBottom = top + height;
  const reserved = inputs.reservedRight;
  let left =
    reserved !== null && reserved > 0
      ? Math.max(QUEST_STRIP_BAND_MIN_X_PX, reserved + QUEST_STRIP_TARGET_FRAME_GAP_PX)
      : QUEST_STRIP_BAND_MIN_X_PX;
  let rightLimit = inputs.viewportWidth - QUEST_STRIP_BAND_MIN_X_PX;
  const middle = inputs.viewportWidth / 2;
  for (const box of inputs.occupants) {
    if (box.right - box.left <= 0) continue;
    if (box.bottom <= top || box.top >= bandBottom) continue;
    // Left of centre pushes the start right; right of centre caps the width.
    if (box.left < middle) left = Math.max(left, box.right + QUEST_STRIP_BAND_GAP_PX);
    else rightLimit = Math.min(rightLimit, box.left - QUEST_STRIP_BAND_GAP_PX);
  }
  return {
    left: Math.round(left),
    maxWidth: Math.max(QUEST_STRIP_MIN_WIDTH_PX, Math.round(rightLimit - left)),
    top,
  };
}
