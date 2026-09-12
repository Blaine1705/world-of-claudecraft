import { WORLD_QUESTS_BY_ID } from '../sim/data';
import type { WorldQuestProgress } from '../sim/types';
import { ownEntry } from './known_item';
import { buildWorldQuestPuzzleView, type WorldQuestPuzzleView } from './world_quest_puzzle_view';

export type WorldQuestLeyOutcome = 'playing' | 'won' | 'lost';
export interface WorldQuestLeyRotation {
  questId: string;
  tileIndex: number;
  rotation: number;
}
export interface WorldQuestLeyState {
  questId: string;
  sourceSignature: string;
  snapshot: WorldQuestProgress | null;
  board: WorldQuestPuzzleView | null;
  outcome: WorldQuestLeyOutcome;
  receiptsClosed: boolean;
  expiresAt: number | null;
  secondsRemaining: number;
}

/** Retain only observed presentation data when completion strips the live board. */
export function resolveWorldQuestLeyState(
  questId: string,
  progress: WorldQuestProgress | undefined,
  now: number,
  previous: WorldQuestLeyState | null,
): WorldQuestLeyState | null {
  if (ownEntry(WORLD_QUESTS_BY_ID, questId)?.objective.type !== 'puzzle' || !progress) return null;
  const prior = previous?.questId === questId ? previous : null;
  const sourceSignature = JSON.stringify(progress);
  const expiresAt =
    typeof progress.puzzleExpiresAt === 'number' && Number.isFinite(progress.puzzleExpiresAt)
      ? progress.puzzleExpiresAt
      : null;
  const secondsRemaining = expiresAt === null ? 0 : Math.max(0, expiresAt - now);
  // Completion is permanent. A loss reopens only after the server publishes a new attempt.
  if (prior?.outcome === 'won') return prior;
  if (
    prior?.outcome === 'lost' &&
    !(expiresAt !== null && expiresAt > now && expiresAt !== prior.expiresAt)
  )
    return prior;
  if (progress.state === 'completed') {
    return {
      questId,
      sourceSignature,
      snapshot: prior?.snapshot ?? null,
      board: prior?.board ?? null,
      outcome: 'won',
      receiptsClosed: false,
      expiresAt: prior?.expiresAt ?? null,
      secondsRemaining: 0,
    };
  }
  if (prior?.sourceSignature === sourceSignature) return prior;
  const board = buildWorldQuestPuzzleView(questId, progress);
  if (!board) return null;
  const snapshot: WorldQuestProgress = {
    questId,
    state: 'active',
    count: progress.count,
    puzzleVariant: board.level - 1,
    ...(progress.puzzleDay === undefined ? {} : { puzzleDay: progress.puzzleDay }),
    puzzleRotations: board.tiles.map((tile) => tile.rotation),
    ...(expiresAt === null ? {} : { puzzleExpiresAt: expiresAt }),
  };
  const outcome =
    expiresAt === 0 || (expiresAt !== null && secondsRemaining <= 0) ? 'lost' : 'playing';
  return {
    questId,
    sourceSignature,
    snapshot,
    board,
    outcome,
    receiptsClosed: outcome === 'lost',
    expiresAt,
    secondsRemaining,
  };
}

/** Absolute receipts preserve every accepted turn, including turns between paints. */
export function applyWorldQuestLeyRotation(
  state: WorldQuestLeyState | null,
  receipt: WorldQuestLeyRotation,
): WorldQuestLeyState | null {
  if (
    !state?.board ||
    !state.snapshot ||
    state.receiptsClosed ||
    state.outcome === 'lost' ||
    state.questId !== receipt.questId ||
    !Number.isInteger(receipt.tileIndex) ||
    receipt.tileIndex < 0 ||
    receipt.tileIndex >= state.board.tiles.length ||
    !Number.isInteger(receipt.rotation) ||
    receipt.rotation < 0 ||
    receipt.rotation > 3
  )
    return state;
  const rotations = state.board.tiles.map((tile) => tile.rotation);
  if (rotations[receipt.tileIndex] === receipt.rotation) return state;
  rotations[receipt.tileIndex] = receipt.rotation;
  const snapshot = { ...state.snapshot, puzzleRotations: rotations };
  return { ...state, snapshot, board: buildWorldQuestPuzzleView(state.questId, snapshot) };
}

/** Latch an authoritative terminal event until a distinct retry deadline arrives. */
export function setWorldQuestLeyOutcome(
  state: WorldQuestLeyState | null,
  outcome: 'won' | 'lost',
): WorldQuestLeyState | null {
  return state && !state.receiptsClosed ? { ...state, outcome, receiptsClosed: true } : state;
}
