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
}

/** Retain only observed presentation data when completion strips the live board. */
export function resolveWorldQuestLeyState(
  questId: string,
  progress: WorldQuestProgress | undefined,
  previous: WorldQuestLeyState | null,
): WorldQuestLeyState | null {
  if (ownEntry(WORLD_QUESTS_BY_ID, questId)?.objective.type !== 'puzzle' || !progress) return null;
  const prior = previous?.questId === questId ? previous : null;
  const sourceSignature = JSON.stringify(progress);
  // A delayed active snapshot cannot undo an authoritative terminal presentation.
  if (prior && prior.outcome !== 'playing') return prior;
  if (progress.state === 'completed') {
    return {
      questId,
      sourceSignature,
      snapshot: prior?.snapshot ?? null,
      board: prior?.board ?? null,
      outcome: 'won',
      receiptsClosed: false,
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
    puzzleRotations: board.tiles.map((tile) => tile.rotation),
  };
  return { questId, sourceSignature, snapshot, board, outcome: 'playing', receiptsClosed: false };
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

/** The lost face is a presentation hook; current Ley rules never emit a loss. */
export function setWorldQuestLeyOutcome(
  state: WorldQuestLeyState | null,
  outcome: 'won' | 'lost',
): WorldQuestLeyState | null {
  return state && !state.receiptsClosed ? { ...state, outcome, receiptsClosed: true } : state;
}
