/** Owner-only workshop instructions; consumes authoritative sim seconds, never wall time. */
import {
  FORGE_GOLD_SECONDS,
  FORGE_SILVER_SECONDS,
  FORGE_WRONG_PENALTY,
} from '../sim/minigames/forge_workshop';
import type { ForgeStationId, WorldQuestForgeResult, WorldQuestProgress } from '../sim/types';
import { formatNumber, t } from './i18n';

const number = (value: number) => formatNumber(value, { maximumFractionDigits: 0 });

export function forgeObjectLabel(objectItemId: string): string | null {
  switch (objectItemId) {
    case 'forge_fuel':
      return t('questUi.worldQuest.forge.fuel');
    case 'forge_metal':
      return t('questUi.worldQuest.forge.metal');
    case 'forge_water':
      return t('questUi.worldQuest.forge.water');
    case 'forge_tools':
      return t('questUi.worldQuest.forge.tools');
    default:
      return null;
  }
}

export function forgeResultText(result: WorldQuestForgeResult): string {
  return t('questUi.worldQuest.forge.result', {
    rating: t(`questUi.worldQuest.forge.medals.${result.rating}`),
    seconds: number(Math.ceil(result.adjustedTime)),
    mistakes: number(result.mistakes),
  });
}

function requestText(station: ForgeStationId, next?: ForgeStationId): string {
  const instruction = t(`questUi.worldQuest.forge.request.${station}`);
  return next
    ? t('questUi.worldQuest.forge.sequence', {
        instruction,
        next: t(`questUi.worldQuest.forge.${next}`),
      })
    : instruction;
}

/** Mara's speech contains the action, with no score or tracker bookkeeping. */
export function forgeSpeechText(progress: WorldQuestProgress): string | null {
  const session = progress.forging;
  if (!session) return null;
  if (session.phase === 'success') return t('questUi.worldQuest.forge.finished');
  const now = session.observedAt;
  if (session.phase === 'countdown') {
    return t('questUi.worldQuest.forge.countdown', {
      seconds: number(Math.max(0, Math.ceil(session.readyAt - now))),
    });
  }
  const request = session.requests[session.requestIndex];
  const station = request?.[session.actionIndex];
  return now < session.readyAt || !station
    ? t('questUi.worldQuest.forge.preparing')
    : requestText(station, request[session.actionIndex + 1]);
}

/** Progress stays in the tracker; medal thresholds appear only after a finish. */
export function forgeInstructionLines(progress: WorldQuestProgress): string[] {
  const session = progress.forging;
  const result =
    session?.phase === 'success' ? session.result : !session ? progress.forgeResult : null;
  if (result) {
    return [
      forgeResultText(result),
      t('questUi.worldQuest.forge.thresholds', {
        gold: number(FORGE_GOLD_SECONDS),
        silver: number(FORGE_SILVER_SECONDS),
      }),
      t('questUi.worldQuest.forge.replay'),
    ];
  }
  if (!session) return [t('questUi.worldQuest.forge.ready')];
  if (session.phase === 'countdown') return [t('questUi.worldQuest.forge.starting')];
  const request = session.requests[session.requestIndex];
  const lines = [
    t('questUi.worldQuest.forge.round', {
      round: number(session.requestIndex + 1),
      total: number(session.requests.length),
      step: number(session.actionIndex + 1),
      steps: number(request?.length ?? 1),
    }),
  ];
  if (session.feedback === 'wrong') {
    lines.push(t('questUi.worldQuest.forge.wrong', { penalty: number(FORGE_WRONG_PENALTY) }));
  }
  return lines;
}
