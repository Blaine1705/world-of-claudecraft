/** Owner-only instructions projected from the shared sim tick, with no local clock. */
import {
  HORDE_COUNTDOWN_TICKS,
  HORDE_DURATION_TICKS,
  type HordeUpgrade,
} from '../sim/minigames/horde_barricade';
import { DT, type WorldQuestProgress } from '../sim/types';
import { formatNumber, t } from './i18n';

const number = (value: number) => formatNumber(value, { maximumFractionDigits: 0 });

export function hordeUpgradeText(kind: HordeUpgrade): string {
  return t(`questUi.worldQuest.horde.choices.${kind}`);
}

/** The existing tracker paints these same concise rows on desktop and touch. */
export function hordeInstructionLines(progress: WorldQuestProgress): string[] {
  const session = progress.horde;
  const finished = session?.phase === 'won' || session?.phase === 'failed';
  const result = finished ? session.result : !session ? progress.hordeResult : null;
  if (result) {
    return [
      session?.phase === 'failed'
        ? t('questUi.worldQuest.horde.failed')
        : t('questUi.worldQuest.horde.result', {
            rating: t(`questUi.worldQuest.horde.medals.${result.rating}`),
            score: number(result.score),
          }),
      t('questUi.worldQuest.horde.resultStats', {
        kills: number(result.kills),
        barrier: number(result.barrier),
      }),
      t('questUi.worldQuest.horde.replay'),
    ];
  }
  if (!session) return [t('questUi.worldQuest.horde.ready')];
  return [
    session.phase === 'countdown'
      ? t('questUi.worldQuest.horde.countdown', {
          seconds: number(Math.max(0, Math.ceil((HORDE_COUNTDOWN_TICKS - session.tick) * DT))),
        })
      : t('questUi.worldQuest.horde.status', {
          seconds: number(
            Math.max(
              0,
              Math.ceil((HORDE_COUNTDOWN_TICKS + HORDE_DURATION_TICKS - session.tick) * DT),
            ),
          ),
          kills: number(session.kills),
          barrier: number(session.barrier),
        }),
    t('questUi.worldQuest.horde.loadout', {
      count: number(session.projectiles),
      speed: number(session.haste * 25),
      weapon: t(`questUi.worldQuest.horde.weapons.${session.upgrade}`),
    }),
    t('questUi.worldQuest.horde.controls'),
    t('questUi.worldQuest.horde.supplies'),
  ];
}
