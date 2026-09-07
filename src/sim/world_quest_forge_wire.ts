import { FORGE_QUEST_ID } from './content/world_quest_forging';
import { sanitizeForgeResult } from './minigames/forge_workshop';
import type { ForgeStationId, WorldQuestForgeState } from './types';

/** Session-only owner readout. Save loading deliberately never calls this. */
export function decodeForgeState(
  value: unknown,
  questId: string,
): WorldQuestForgeState | undefined {
  if (questId !== FORGE_QUEST_ID || !value || typeof value !== 'object') return;
  const row = value as Partial<WorldQuestForgeState>;
  if (
    !['countdown', 'working', 'success'].includes(row.phase ?? '') ||
    !['ready', 'correct', 'wrong'].includes(row.feedback ?? '')
  )
    return;
  if (
    !Array.isArray(row.requests) ||
    row.requests.length !== 10 ||
    !Array.from(row.requests).every(
      (request, index) =>
        Array.isArray(request) &&
        request.length === (index < 7 ? 1 : 2) &&
        Array.from(request).every((id) => ['fuel', 'metal', 'water', 'tools'].includes(id)),
    )
  )
    return;
  for (const field of ['readyAt', 'startedAt', 'lockUntil', 'observedAt'] as const)
    if (typeof row[field] !== 'number' || !Number.isFinite(row[field]) || row[field]! < 0) return;
  if (
    !Number.isSafeInteger(row.requestIndex) ||
    row.requestIndex! < 0 ||
    row.requestIndex! > 10 ||
    !Number.isSafeInteger(row.actionIndex) ||
    row.actionIndex! < 0 ||
    row.actionIndex! > 1 ||
    !Number.isSafeInteger(row.mistakes) ||
    row.mistakes! < 0 ||
    row.mistakes! > 100000
  )
    return;
  if (
    row.phase === 'success'
      ? row.requestIndex !== 10 || row.actionIndex !== 0
      : row.requestIndex === 10 || row.actionIndex! >= row.requests[row.requestIndex!].length
  )
    return;
  const result = sanitizeForgeResult(row.result);
  if (row.phase === 'success' && !result) return;
  return {
    phase: row.phase as WorldQuestForgeState['phase'],
    observedAt: row.observedAt!,
    requests: row.requests.map((request) => [...request] as ForgeStationId[]),
    requestIndex: row.requestIndex!,
    actionIndex: row.actionIndex!,
    readyAt: row.readyAt!,
    startedAt: row.startedAt!,
    lockUntil: row.lockUntil!,
    mistakes: row.mistakes!,
    feedback: row.feedback as WorldQuestForgeState['feedback'],
    ...(row.phase === 'success' ? { result } : {}),
  };
}
