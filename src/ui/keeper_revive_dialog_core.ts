// The Pale Keeper's two-step revive: talking to the Keeper opens its dialogue
// (what the Toll is, and that heroes below RES_SICKNESS_MIN_LEVEL are spared),
// and choosing Revive Me there opens a second, level-aware confirmation that
// says again what the raise will cost THIS character. Pure key selection; the
// HUD resolves the keys through t() and owns the dialog DOM (Hud.confirmDialog).

import { RES_SICKNESS_MIN_LEVEL } from '../sim/resurrection';
import type { TranslationKey } from './i18n';

export interface KeeperDialogStep {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  okKey: TranslationKey;
  cancelKey: TranslationKey;
}

/** Step one: the Keeper's own words, the same for every character. */
export function keeperReviveDialogue(): KeeperDialogStep {
  return {
    titleKey: 'hudChrome.death.keeperTalkTitle',
    bodyKey: 'hudChrome.death.keeperTalkBody',
    okKey: 'hudChrome.death.keeperTalkAccept',
    cancelKey: 'hudChrome.death.keeperTalkLeave',
  };
}

/** Step two: the confirmation, worded for whether the Toll will land on a
 *  character of this level (nothing is charged below RES_SICKNESS_MIN_LEVEL). */
export function keeperReviveConfirm(
  level: number,
  minLevel: number = RES_SICKNESS_MIN_LEVEL,
): KeeperDialogStep {
  const spared = level < minLevel;
  return {
    titleKey: spared
      ? 'hudChrome.death.keeperConfirmSparedTitle'
      : 'hudChrome.death.healerConfirmTitle',
    bodyKey: spared
      ? 'hudChrome.death.keeperConfirmSparedBody'
      : 'hudChrome.death.keeperConfirmBody',
    okKey: 'hudChrome.death.healerConfirmAccept',
    cancelKey: 'hudChrome.death.healerConfirmCancel',
  };
}
