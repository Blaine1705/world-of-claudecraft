// The floating avoidance word over a body that took no damage from a hit: the
// classic words (Miss, Dodge, Parry, Evade, Resist), and "Turned aside" when
// the Voltaic Warden's plating (or a plated drone's) refused the hit: a
// resist against a body whose face does not take that kind of damage (physical
// needs the copper Grounded face, every spell school the blue Charged one). On
// heroic Split Plating the back half wears the other face, so any resist
// against a split body reads as turned aside. Pure and DOM-free: the HUD's
// floating combat text asks it for the word.

import {
  platingFor,
  VOLTAIC_CHARGED,
  VOLTAIC_GROUNDED,
} from '../../../sim/encounters/stormbrass_foundry/ids';
import { t } from '../../i18n';

interface PlatedAura {
  id: string;
  value2?: number;
}

/** Did a plating face on the target turn a hit of `school` aside? */
export function platingTurnedAside(
  auras: readonly PlatedAura[] | null | undefined,
  school: string | null | undefined,
): boolean {
  if (!auras) return false;
  for (const a of auras) {
    const grounded = a.id === VOLTAIC_GROUNDED;
    if (!grounded && a.id !== VOLTAIC_CHARGED) continue;
    if (a.value2 === 1 || !school) return true;
    return platingFor(school) !== (grounded ? 'grounded' : 'charged');
  }
  return false;
}

/** The word a fully avoided hit floats over its target. */
export function fctAvoidanceText(
  kind: string,
  targetAuras?: readonly PlatedAura[] | null,
  school?: string | null,
): string {
  if (kind === 'miss') return t('hud.combat.floatingMiss');
  if (kind === 'dodge') return t('hud.combat.floatingDodge');
  if (kind === 'parry') return t('hud.combat.floatingParry');
  if (kind === 'evade') return t('hud.combat.floatingEvade');
  return platingTurnedAside(targetAuras, school)
    ? t('hudChrome.foundryAlert.turnedAside')
    : t('hud.combat.floatingResist');
}
