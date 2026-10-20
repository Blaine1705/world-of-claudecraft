// Every five-player dungeon that ships a boss guide, keyed by dungeon id. A
// new dungeon page is one data module under ./dungeons/ plus its row here.

import { GRAVEWYRM_SANCTUM_JOURNAL } from './dungeons/gravewyrm_sanctum';
import { WILDHEART_BASIN_JOURNAL } from './dungeons/wildheart_basin';
import { type DungeonJournalDef, dungeonJournalSource, type JournalSource } from './journal_view';

export const DUNGEON_JOURNALS: readonly DungeonJournalDef[] = [
  GRAVEWYRM_SANCTUM_JOURNAL,
  WILDHEART_BASIN_JOURNAL,
];

const SOURCES = new Map<string, JournalSource>(
  DUNGEON_JOURNALS.map((def) => [def.dungeonId, dungeonJournalSource(def)]),
);

/** The dungeon's guide as a window source, or null for a dungeon with none. */
export function dungeonJournalSourceFor(dungeonId: string): JournalSource | null {
  return SOURCES.get(dungeonId) ?? null;
}
