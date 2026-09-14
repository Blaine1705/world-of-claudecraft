// The online read of one world-quest scoreboard page. A public GET (no bearer:
// the ladder is bragging rights, and the server rate-limits it like the other
// public boards); any failure resolves the empty page so the window paints
// its empty state rather than an error for a board that simply has no rows.
import { apiUrl } from '../client_origin';
import { LEADERBOARD_PAGE_SIZE } from '../sim/leaderboard_page';
import { emptyWorldQuestLeaderboardPage } from '../sim/world_quest_leaderboard_page';
import type { WorldQuestScoreboardId } from '../sim/world_quest_scoreboards';
import type { WorldQuestLeaderboardPage } from '../world_api';

export async function fetchWorldQuestLeaderboard(
  base: string,
  board: WorldQuestScoreboardId,
  page = 0,
  pageSize = LEADERBOARD_PAGE_SIZE,
): Promise<WorldQuestLeaderboardPage> {
  const empty = emptyWorldQuestLeaderboardPage(board, 0, pageSize);
  try {
    const query = `board=${encodeURIComponent(board)}&page=${page}&pageSize=${pageSize}`;
    const res = await fetch(apiUrl(`/api/world-quests/leaderboard?${query}`, base));
    if (!res.ok) return empty;
    const data = await res.json();
    return {
      board,
      leaders: Array.isArray(data.leaders) ? data.leaders : [],
      page: data.page ?? page,
      pageCount: data.pageCount ?? 1,
      total: data.total ?? data.leaders?.length ?? 0,
      pageSize: data.pageSize ?? pageSize,
    };
  } catch {
    return empty;
  }
}
