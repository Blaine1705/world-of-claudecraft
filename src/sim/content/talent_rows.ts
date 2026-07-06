// ---------------------------------------------------------------------------
// Choice-row talent framework (Pandaria style, adapted to the 20-level cap).
//
// Instead of spending points across a branching tree, a character unlocks SIX
// rows as it levels (at 5 / 8 / 11 / 14 / 17 / 20) and picks ONE of THREE options
// per row. This is the framework only: the types, the load-time validator, the
// level-unlock math, and the fold from a player's picks into the flat
// TalentModifiers that the hot paths already read. It REUSES the existing effect
// engine (`accumulate` / `emptyModifiers` from talents.ts), so a choice-row option
// expresses its effect with the exact same `TalentEffect` buckets the point-tree
// uses, and nothing downstream (recalcPlayerStats, applyTalentMods) changes.
//
// The per-class row DATA and the Sim/UI/wire integration land in later slices;
// this module is pure and host-agnostic (Node-testable, no DOM/Three), same as
// talents.ts.
// ---------------------------------------------------------------------------

import { accumulate, emptyModifiers, type TalentEffect, type TalentModifiers } from './talents';

/** The character level at which each row (tier) unlocks. One row per level. */
export const ROW_LEVELS = [5, 8, 11, 14, 17, 20] as const;
export const ROW_COUNT = ROW_LEVELS.length;
export const OPTIONS_PER_ROW = 3;

/** One of the three picks in a row. Its `effect` uses the same `TalentEffect`
 *  buckets as a point-tree node, so it folds through the shared engine. */
export interface ChoiceRowOption {
  id: string;
  name: string;
  description: string;
  effect: TalentEffect;
}

/** A single tier: a level gate plus exactly three mutually exclusive options. */
export interface ChoiceRow {
  level: number;
  options: ChoiceRowOption[];
}

/** A class's full set of rows (expected length: ROW_COUNT). */
export type RowTree = ChoiceRow[];

/** A player's allocation: the chosen option id per row, or null for unpicked. */
export type RowPicks = (string | null)[];

/** A fresh, all-unpicked allocation. */
export function emptyRowPicks(): RowPicks {
  return new Array(ROW_COUNT).fill(null);
}

/** Validate a class row tree at load time. Returns a list of problems (empty =
 *  valid), mirroring `validateTalentTree`'s contract so a malformed tree is caught
 *  at import rather than in play. */
export function validateRowTree(tree: RowTree): string[] {
  const errs: string[] = [];
  if (tree.length !== ROW_COUNT) {
    errs.push(`expected ${ROW_COUNT} rows, got ${tree.length}`);
  }
  const seen = new Set<string>();
  tree.forEach((row, i) => {
    const wantLevel = ROW_LEVELS[i];
    if (wantLevel !== undefined && row.level !== wantLevel) {
      errs.push(`row ${i}: level ${row.level}, expected ${wantLevel}`);
    }
    if (row.options.length !== OPTIONS_PER_ROW) {
      errs.push(`row ${i}: ${row.options.length} options, expected ${OPTIONS_PER_ROW}`);
    }
    for (const opt of row.options) {
      if (!opt.id) errs.push(`row ${i}: an option has no id`);
      else if (seen.has(opt.id)) errs.push(`duplicate option id: ${opt.id}`);
      else seen.add(opt.id);
    }
  });
  return errs;
}

/** How many rows are unlocked at a given character level (a row unlocks once the
 *  character reaches its gate level). */
export function rowsUnlockedAt(level: number): number {
  let n = 0;
  for (const lv of ROW_LEVELS) if (level >= lv) n++;
  return n;
}

/** Fold a player's picks into the flat `TalentModifiers` the hot paths read,
 *  reusing the shared effect engine. Unpicked rows and unknown ids contribute
 *  nothing; deterministic (a pure function of tree + picks). */
export function computeRowModifiers(tree: RowTree, picks: RowPicks): TalentModifiers {
  const mods = emptyModifiers();
  picks.forEach((pick, i) => {
    if (!pick) return;
    const row = tree[i];
    if (!row) return;
    const opt = row.options.find((o) => o.id === pick);
    if (opt) accumulate(mods, opt.effect, 1);
  });
  return mods;
}
