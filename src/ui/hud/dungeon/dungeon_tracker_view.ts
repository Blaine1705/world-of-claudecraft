// Pure, host-agnostic core of the dungeon objectives tracker: the plate at the
// top of the right tracker stack that names the group dungeon a player stands
// in and lists its bosses, each counted 0 of 1 until it falls.
//
// It decides WHAT the tracker shows from IWorld.dungeonRun (the sim's own
// answer to "which bosses, in what order, and which are down": see
// src/sim/instances/dungeon_run.ts), and nothing about how it is drawn. No DOM
// and no i18n: every name is resolved by the painter (dungeon_tracker_painter.ts)
// from the ids carried here, so the core is the same on a Sim and a ClientWorld.
//
// Allocation-light: the model is ONE caller-owned object with a fixed row
// pool, rebuilt in place on every poll, so the medium band it runs on makes no
// garbage and an unchanged run is a handful of field writes.
//
// The model also carries the one piece of memory the tracker has: which rows
// were already down on the previous build. That is what lets a boss falling
// IN FRONT OF the player light its row for a moment, while a row that was
// already down when the player walked in (a re-entry, a late join, a
// reconnect) is simply drawn as done. The glow is decoration over a count that
// is already on screen; nothing actionable rides it.
//
// TOUCH has no room for a plate in the right column (the stack's seat on a
// landscape phone runs straight into the action ring), and the quest tracker
// is already replaced there by the top-band quest strip. So on touch the run
// rides that strip as one page of its own: dungeonStripQuest() projects it
// onto the strip's own TrackedQuest model, and the strip paints it like any
// other page ("Sexton Marrow: 0/1"), with no second presentation to keep in
// step.

import type { IWorld } from '../../../world_api';
import type { TrackedQuest } from '../quest/quest_tracker';

/**
 * The row pool: far above any authored boss list (the longest is four), so a
 * dungeon never loses a row to it. tests/dungeon_tracker_view.test.ts pins
 * every tracked dungeon under this cap.
 */
export const DUNGEON_TRACKER_ROW_CAP = 8;

/**
 * How many consecutive builds a fresh kill keeps its highlight. The tracker
 * is polled on the HUD's medium band (about 4 Hz), so this is a little over a
 * second: long enough for the CSS glow to play out once, then the row rests.
 */
export const DUNGEON_TRACKER_FLASH_BUILDS = 6;

export interface DungeonTrackerRow {
  /** The boss's mob template id; the painter resolves its name. */
  mobId: string;
  done: boolean;
  /** The boss fell while the tracker was up (see DUNGEON_TRACKER_FLASH_BUILDS). */
  flash: boolean;
  /** Builds the flash still has to run; the core's own memory. */
  flashHold: number;
}

export interface DungeonTrackerModel {
  /** False outside a tracked dungeon: the painter hides the whole tracker. */
  visible: boolean;
  dungeonId: string;
  heroic: boolean;
  /** Live rows: `rows[0 .. count)`; slots past it are stale pool entries. */
  count: number;
  rows: DungeonTrackerRow[];
  /** How many of the live rows are done. */
  defeated: number;
  /** Every boss is down: the run reads as finished. */
  complete: boolean;
  /** The LAST boss fell while the tracker was up: the plate's one-time glow. */
  completeFlash: boolean;
  completeHold: number;
}

/** Id prefix of the run's page on the touch quest strip. A quest id never
 *  carries a colon, so the page cannot be mistaken for a logged quest. */
export const DUNGEON_STRIP_QUEST_PREFIX = 'dungeon:';

/** The localized text the strip page needs; resolved by the caller. */
export interface DungeonStripText {
  /** The page title: the dungeon's name, with the difficulty when heroic. */
  title(dungeonId: string, heroic: boolean): string;
  bossName(mobId: string): string;
}

/**
 * The run as one page of the touch quest strip, or null outside a tracked
 * dungeon: the dungeon is the title, each boss one counted objective (0 or 1
 * of 1), and the page reads complete once every boss is down. The difficulty
 * is part of the id, so a heroic run after a normal one is a new page.
 */
export function dungeonStripQuest(
  world: Pick<IWorld, 'dungeonRun'>,
  text: DungeonStripText,
): TrackedQuest | null {
  const run = world.dungeonRun;
  if (!run || run.bosses.length === 0) return null;
  const heroic = run.difficulty === 'heroic';
  return {
    id: `${DUNGEON_STRIP_QUEST_PREFIX}${run.dungeonId}:${run.difficulty}`,
    // Not a logged quest: it has no acceptance-order badge.
    number: 0,
    title: text.title(run.dungeonId, heroic),
    complete: run.bosses.every((boss) => boss.defeated),
    objectives: run.bosses.map((boss) => ({
      label: text.bossName(boss.mobId),
      current: boss.defeated ? 1 : 0,
      total: 1,
    })),
  };
}

/** A fresh, hidden model with its row pool preallocated. */
export function makeDungeonTrackerModel(): DungeonTrackerModel {
  const rows: DungeonTrackerRow[] = [];
  for (let i = 0; i < DUNGEON_TRACKER_ROW_CAP; i++) {
    rows.push({ mobId: '', done: false, flash: false, flashHold: 0 });
  }
  return {
    visible: false,
    dungeonId: '',
    heroic: false,
    count: 0,
    rows,
    defeated: 0,
    complete: false,
    completeFlash: false,
    completeHold: 0,
  };
}

/**
 * Rebuild `out` in place from the world's current run and return it. Call it
 * once per poll with the same `out`: the previous build's rows are the memory
 * the highlight is decided against.
 */
export function buildDungeonTracker(
  world: Pick<IWorld, 'dungeonRun'>,
  out: DungeonTrackerModel,
): DungeonTrackerModel {
  const run = world.dungeonRun;
  if (!run || run.bosses.length === 0) {
    // Hidden: forget everything, so the next sighting is a first sighting.
    out.visible = false;
    out.dungeonId = '';
    out.heroic = false;
    out.count = 0;
    out.defeated = 0;
    out.complete = false;
    out.completeFlash = false;
    out.completeHold = 0;
    return out;
  }
  const heroic = run.difficulty === 'heroic';
  const count = Math.min(run.bosses.length, DUNGEON_TRACKER_ROW_CAP);
  // The same run as last build: only then is "was not done, is done now" a
  // kill the player just watched. A different dungeon, difficulty or boss
  // list is a first sighting and never lights anything.
  let sameRun =
    out.visible && out.dungeonId === run.dungeonId && out.heroic === heroic && out.count === count;
  for (let i = 0; sameRun && i < count; i++) {
    if (out.rows[i].mobId !== run.bosses[i].mobId) sameRun = false;
  }
  const wasComplete = sameRun && out.complete;
  let defeated = 0;
  for (let i = 0; i < count; i++) {
    const boss = run.bosses[i];
    const row = out.rows[i];
    let hold = sameRun ? row.flashHold : 0;
    if (sameRun && boss.defeated && !row.done) hold = DUNGEON_TRACKER_FLASH_BUILDS;
    else if (hold > 0) hold--;
    // A row cannot be both open and lit (a fresh claim of the same dungeon).
    if (!boss.defeated) hold = 0;
    row.mobId = boss.mobId;
    row.done = boss.defeated;
    row.flashHold = hold;
    row.flash = hold > 0;
    if (boss.defeated) defeated++;
  }
  const complete = defeated === count;
  let completeHold = sameRun ? out.completeHold : 0;
  if (sameRun && complete && !wasComplete) completeHold = DUNGEON_TRACKER_FLASH_BUILDS;
  else if (completeHold > 0) completeHold--;
  if (!complete) completeHold = 0;
  out.visible = true;
  out.dungeonId = run.dungeonId;
  out.heroic = heroic;
  out.count = count;
  out.defeated = defeated;
  out.complete = complete;
  out.completeHold = completeHold;
  out.completeFlash = completeHold > 0;
  return out;
}
