// Pure view core for the World Quests high-score tab: which boards exist and
// how they are named, what one row's number means (waves held, seconds, or
// points) and how it formats, and the medal cell. DOM-free; the window
// (leaderboard_window.ts) paints the rows this module shapes.
import {
  WORLD_QUEST_SCOREBOARDS,
  type WorldQuestMedal,
  type WorldQuestScoreboard,
  type WorldQuestScoreboardId,
  worldQuestScoreboard,
} from '../sim/world_quest_scoreboards';
import type { WorldQuestLeaderboardEntry } from '../world_api';
import { formatNumber, t } from './i18n';
import { worldQuestDisplayName } from './world_quest_view';

export interface WorldQuestBoardChip {
  id: WorldQuestScoreboardId;
  label: string;
  active: boolean;
}

/** The board selector strip above the rows: one chip per scoreboard. */
export function worldQuestBoardChips(active: WorldQuestScoreboardId): WorldQuestBoardChip[] {
  return WORLD_QUEST_SCOREBOARDS.map((board) => ({
    id: board.id,
    label: worldQuestDisplayName(board.questId),
    active: board.id === active,
  }));
}

/** The first board is the default selection (the endless cannon line). */
export const DEFAULT_WORLD_QUEST_BOARD: WorldQuestScoreboardId = WORLD_QUEST_SCOREBOARDS[0].id;

/** Column header for the board's number. */
export function worldQuestMetricHeader(board: WorldQuestScoreboard): string {
  switch (board.metric) {
    case 'waves':
      return t('hudChrome.leaderboard.wqWaves');
    case 'seconds':
      return t('hudChrome.leaderboard.wqTime');
    default:
      return t('hudChrome.leaderboard.wqPoints');
  }
}

/** The number as the player reads it: whole waves or points, seconds with the unit. */
export function worldQuestMetricText(board: WorldQuestScoreboard, metric: number): string {
  const whole = formatNumber(metric, { maximumFractionDigits: 0 });
  return board.metric === 'seconds'
    ? t('hudChrome.leaderboard.wqSeconds', {
        seconds: formatNumber(metric, { maximumFractionDigits: 1 }),
      })
    : whole;
}

export function worldQuestMedalText(medal: WorldQuestMedal | null): string {
  return medal
    ? t(`hudChrome.leaderboard.wqMedals.${medal}`)
    : t('hudChrome.leaderboard.wqNoMedal');
}

export interface WorldQuestLeaderboardRowView {
  rank: string;
  name: string;
  medal: WorldQuestMedal | null;
  medalText: string;
  metricText: string;
  me: boolean;
}

/** One painted row; `viewerName` marks the viewer's own character. */
export function worldQuestLeaderboardRow(
  board: WorldQuestScoreboard,
  entry: WorldQuestLeaderboardEntry,
  viewerName: string,
): WorldQuestLeaderboardRowView {
  return {
    rank: formatNumber(entry.rank, { maximumFractionDigits: 0 }),
    name: entry.name,
    medal: entry.medal,
    medalText: worldQuestMedalText(entry.medal),
    metricText: worldQuestMetricText(board, entry.metric),
    me: entry.name === viewerName,
  };
}

/** Resolve a stored selection, falling back to the default when it names no board. */
export function resolveWorldQuestBoard(id: string): WorldQuestScoreboard {
  return (
    worldQuestScoreboard(id) ??
    (worldQuestScoreboard(DEFAULT_WORLD_QUEST_BOARD) as WorldQuestScoreboard)
  );
}
