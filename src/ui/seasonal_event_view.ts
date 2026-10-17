// The presentation of a seasonal SimEvent (src/sim/seasonal/): the log line and
// the top-center flash for a knock's treat or trick, the refusals, the pumpkin
// head toggle and the Jar of Mischief. The sim sends ids and numbers only; every
// sentence is composed here from the `seasonal.*` catalog. Pure (no DOM), so a
// Vitest drives it directly; quest_event_view.ts routes the event here.
import type { SimEvent } from '../sim/types';
import { npcDisplayName } from './entity_display_core';
import { zoneDisplayName } from './entity_i18n';
import { formatNumber, type TranslationKey, t, tPlural } from './i18n';

export interface SeasonalEventPresentation {
  logText: string;
  flashText?: string;
  sound?: 'quest_ready';
}

type SeasonalEvent = Extract<SimEvent, { type: 'seasonal' }>;

/** A trick's display name; an unknown id (a newer server) falls back to the
 *  generic Gourdlight Eve name rather than printing an id. */
export function seasonalTrickName(trickId: string | undefined): string {
  const key = `seasonal.tricks.${trickId ?? ''}` as TranslationKey;
  const name = trickId ? t(key) : '';
  return name && name !== key ? name : t('seasonal.event.gourdlight_eve.name');
}

export function seasonalEventPresentation(event: SeasonalEvent): SeasonalEventPresentation | null {
  const name = event.npc ? npcDisplayName(event.npc) : '';
  switch (event.what) {
    case 'pumpkinFound': {
      const values = {
        zone: zoneDisplayName(event.zoneId ?? ''),
        count: formatNumber(event.count ?? 0),
        total: formatNumber(event.total ?? 0),
        sweets: formatNumber(event.sweets ?? 0),
      };
      return {
        logText: t('seasonal.pumpkins.found', values),
        flashText: t('seasonal.pumpkins.flash', values),
        sound: 'quest_ready',
      };
    }
    case 'treat': {
      const count = event.sweets ?? 0;
      return {
        logText: t('seasonal.trickOrTreat.treat', { name }),
        flashText: tPlural('seasonal.trickOrTreat.treatFlash', count, {
          count: formatNumber(count),
        }),
      };
    }
    case 'trick': {
      const trick = seasonalTrickName(event.trick);
      return {
        logText: t('seasonal.trickOrTreat.trick', { name, trick }),
        flashText: t('seasonal.trickOrTreat.trickFlash', { trick }),
      };
    }
    case 'alreadyKnocked':
      return { logText: t('seasonal.trickOrTreat.alreadyKnocked', { name }) };
    case 'notActive':
      return { logText: t('seasonal.trickOrTreat.notActive') };
    case 'tooFar':
      return { logText: t('seasonal.trickOrTreat.tooFar') };
    case 'pumpkinOn':
      return { logText: t('seasonal.pumpkinHead.on') };
    case 'pumpkinOff':
      return { logText: t('seasonal.pumpkinHead.off') };
    case 'jarTrick': {
      const trick = seasonalTrickName(event.trick);
      return {
        logText: t('seasonal.jarTrick', { trick }),
        flashText: t('seasonal.trickOrTreat.trickFlash', { trick }),
      };
    }
    case 'guise': {
      const trick = seasonalTrickName(event.trick);
      return {
        logText: t('seasonal.guise', { trick }),
        flashText: t('seasonal.trickOrTreat.trickFlash', { trick }),
      };
    }
    default:
      return null;
  }
}
