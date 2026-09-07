import { Rng } from '../rng';
import type { ForgeStationId, WorldQuestForgeResult, WorldQuestForgeState } from '../types';

export const FORGE_REQUEST_COUNT = 10;
export const FORGE_WRONG_PENALTY = 3;
export const FORGE_GOLD_SECONDS = 40;
export const FORGE_SILVER_SECONDS = 60;
export const FORGE_CLOCK_INTERVAL = 0.2;
const STATIONS: readonly ForgeStationId[] = ['fuel', 'metal', 'water', 'tools'];

/** An isolated seeded stream keeps workshop input from perturbing world RNG. */
export function createForgeWorkshop(seed: number, now: number): WorldQuestForgeState {
  const rng = new Rng(seed);
  let previous: ForgeStationId | undefined;
  const requests = Array.from({ length: FORGE_REQUEST_COUNT }, (_, index) =>
    Array.from({ length: index < 7 ? 1 : 2 }, () => {
      const options = STATIONS.filter((station) => station !== previous);
      const next = options[Math.floor(rng.next() * options.length)];
      previous = next;
      return next;
    }),
  );
  return {
    phase: 'countdown',
    observedAt: now,
    requests,
    requestIndex: 0,
    actionIndex: 0,
    readyAt: now + 3,
    startedAt: now + 3,
    lockUntil: now + 3,
    mistakes: 0,
    feedback: 'ready',
  };
}

export function forgeResult(elapsed: number, mistakes: number): WorldQuestForgeResult {
  const adjustedTime = elapsed + mistakes * FORGE_WRONG_PENALTY;
  return {
    elapsed,
    mistakes,
    adjustedTime,
    rating:
      adjustedTime <= FORGE_GOLD_SECONDS
        ? 'gold'
        : adjustedTime <= FORGE_SILVER_SECONDS
          ? 'silver'
          : 'bronze',
  };
}

export function advanceForgeWorkshop(state: WorldQuestForgeState, now: number): boolean {
  if (state.phase === 'success') return false;
  const becameReady = state.observedAt < state.readyAt && now >= state.readyAt;
  const phaseChanged = state.phase === 'countdown' && now >= state.readyAt;
  if (phaseChanged) state.phase = 'working';
  if (!phaseChanged && !becameReady && now - state.observedAt < FORGE_CLOCK_INTERVAL - 1e-9)
    return false;
  state.observedAt = now;
  return true;
}

/** Returns true only on accepted input. Clicks during transitions do nothing. */
export function clickForgeWorkshop(
  state: WorldQuestForgeState,
  station: ForgeStationId,
  now: number,
): boolean {
  if (state.phase === 'countdown' && now >= state.readyAt) state.phase = 'working';
  if (state.phase !== 'working' || now < state.readyAt || now < state.lockUntil) return false;
  state.observedAt = now;
  const request = state.requests[state.requestIndex];
  if (request[state.actionIndex] !== station) {
    state.mistakes++;
    state.feedback = 'wrong';
    state.lockUntil = now + 0.45;
    return true;
  }
  state.feedback = 'correct';
  state.lockUntil = now + 0.2;
  state.actionIndex++;
  if (state.actionIndex < request.length) return true;
  state.requestIndex++;
  state.actionIndex = 0;
  if (state.requestIndex === FORGE_REQUEST_COUNT) {
    state.phase = 'success';
    state.result = forgeResult(Math.max(0, now - state.startedAt), state.mistakes);
  } else {
    state.readyAt = now + (state.requestIndex < 4 ? 2 : state.requestIndex < 7 ? 1.5 : 1);
  }
  return true;
}

export function sanitizeForgeResult(value: unknown): WorldQuestForgeResult | undefined {
  if (!value || typeof value !== 'object') return;
  const row = value as Partial<WorldQuestForgeResult>;
  if (
    typeof row.elapsed !== 'number' ||
    !Number.isFinite(row.elapsed) ||
    row.elapsed < 0 ||
    row.elapsed > 86400 ||
    !Number.isSafeInteger(row.mistakes) ||
    (row.mistakes as number) < 0 ||
    (row.mistakes as number) > 100000
  )
    return;
  return forgeResult(row.elapsed, row.mistakes as number);
}
