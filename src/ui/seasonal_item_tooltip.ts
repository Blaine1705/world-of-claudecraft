// The seasonal event items' tooltip lines (src/sim/content/gourdlight_eve.ts):
// what the pumpkin head, the Jar of Mischief, the treat pouch and the sweet do,
// stated from the live content (the pouch's count is read off the sim constant).
// One small view the item tooltip composes, so the bags, the vendor and the
// market all say the same thing.
import {
  CARVED_PUMPKIN_HEAD_ID,
  GOURDLIGHT_POUCH_SWEETS,
  GOURDLIGHT_SWEET_ID,
  GOURDLIGHT_TREAT_POUCH_ID,
  JAR_OF_MISCHIEF_ID,
} from '../sim/content/gourdlight_eve';
import {
  STRAWLING_CHARM_ID,
  STRAWLING_GUISE,
  THATCHGRIN_SACK_ID,
  THATCHGRIN_SACK_SWEETS,
} from '../sim/content/gourdlight_eve_scarecrow';
import type { ItemDef } from '../sim/types';
import { formatNumber, t } from './i18n';
import { createTooltipLine } from './tooltip_line';

/** The use or purpose line for a seasonal item, or null for any other item. */
export function seasonalItemTooltipText(item: Pick<ItemDef, 'id'>): string | null {
  switch (item.id) {
    case CARVED_PUMPKIN_HEAD_ID:
      return t('seasonal.itemUse.pumpkinHead');
    case JAR_OF_MISCHIEF_ID:
      return t('seasonal.itemUse.trickJar');
    case GOURDLIGHT_TREAT_POUCH_ID:
      return t('seasonal.itemUse.pouch', { count: formatNumber(GOURDLIGHT_POUCH_SWEETS) });
    case GOURDLIGHT_SWEET_ID:
      return t('seasonal.itemUse.sweet');
    case THATCHGRIN_SACK_ID:
      return t('seasonal.itemUse.pouch', { count: formatNumber(THATCHGRIN_SACK_SWEETS) });
    case STRAWLING_CHARM_ID:
      return t('seasonal.itemUse.strawlingCharm', {
        seconds: formatNumber(STRAWLING_GUISE.duration),
      });
    default:
      return null;
  }
}

/** The line as tooltip HTML (empty for any other item). */
export function seasonalItemTooltipLines(item: Pick<ItemDef, 'id'>): string {
  const text = seasonalItemTooltipText(item);
  return text ? createTooltipLine(text, 'tt-desc').outerHTML : '';
}
