// Pure view core for the choice-row talents tab (the Pandaria-style rows in
// src/sim/content/talent_rows.ts). Maps the row tree + the player's picks +
// level to the render model the tab painter walks: which rows are unlocked,
// which option is picked, and what is pickable. DOM-free, i18n-free,
// host-agnostic (the inputs are plain data mirrored identically by the offline
// Sim and the online ClientWorld), so a Vitest drives it directly.

import type { RowPicks, RowTree } from '../sim/content/talent_rows';
import type { TalentEffect } from '../sim/content/talents';

export interface RowOptionVM {
  id: string;
  /** English content name/description (localization pathway lands with the
   *  talent-copy i18n batch; rendered through esc() by the painter). */
  name: string;
  description: string;
  picked: boolean;
  /** The option's effect, passed through for the effect-derived icon. */
  effect: TalentEffect;
}

export interface RowVM {
  index: number;
  level: number;
  unlocked: boolean;
  options: RowOptionVM[];
}

export interface TalentRowsVM {
  rows: RowVM[];
  /** How many rows have a pick (the tab badge). */
  pickedCount: number;
  /** How many rows the player's level has unlocked. */
  unlockedCount: number;
}

export function buildTalentRowsView(
  tree: RowTree | null,
  picks: RowPicks,
  level: number,
): TalentRowsVM {
  if (!tree) return { rows: [], pickedCount: 0, unlockedCount: 0 };
  let pickedCount = 0;
  let unlockedCount = 0;
  const rows = tree.map((row, index) => {
    const unlocked = level >= row.level;
    if (unlocked) unlockedCount++;
    const pick = picks[index] ?? null;
    if (unlocked && pick !== null) pickedCount++;
    return {
      index,
      level: row.level,
      unlocked,
      options: row.options.map((o) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        picked: unlocked && pick === o.id,
        effect: o.effect,
      })),
    };
  });
  return { rows, pickedCount, unlockedCount };
}
