// What the Stormbrass Foundry's encounter marks DO, for their buff/debuff
// hover tooltip. A pure descriptor like the rest of aura_effect.ts (which calls
// this first): it returns a hudChrome.auraEffect.foundry.* key plus the raw
// numbers, and the HUD formats the numbers and renders t(key, values). The
// walkway mark of Line-Master Tock's Scalding Vents is a `vulnerability` of 0
// (it adds nothing), so the generic kind line would lie; it says the rule
// instead. The Rangewarden's Target Lock is the same kind of mark. Numbers come from the encounter tuning
// (src/sim/encounters/stormbrass_foundry/ids.ts) and the heroic mechanic
// factor (content/dungeon_difficulty.ts), the same constants combat reads.
// Pinned by tests/stormbrass_foundry_alert.test.ts.

import { HEROIC_DUNGEON_TUNING } from '../sim/content/dungeon_difficulty';
import {
  RANGE_TARGET_LOCK,
  RANGE_TUNING,
  RANGEWARDEN_ID,
  TOCK_ID,
  TOCK_SCALDING_VENTS,
  TOCK_TUNING,
} from '../sim/encounters/stormbrass_foundry/ids';
import type { AuraEffectDescriptor, AuraEffectInput } from './aura_effect';

const KEY = 'hudChrome.auraEffect.foundry';

/** A boss mechanic's heroic amount (normal numbers are stated landed; heroic
 *  multiplies them by the mob's heroic mechanic factor). */
export function foundryHeroicAmount(mobId: string, amount: number): number {
  const mult =
    HEROIC_DUNGEON_TUNING.stormbrass_foundry?.mechanicDamageMultiplierByMob?.[mobId] ?? 1;
  return Math.round(amount * mult);
}

/** The Foundry mark's descriptor, or null when `a` is not one of them. */
export function foundryAuraEffectDescriptor(a: AuraEffectInput): AuraEffectDescriptor | null {
  // The Rangewarden's Target Lock is a zero-value vulnerability too (a mark no
  // snare-break removes): it says the salvo's rule and its real numbers.
  if (a.id === RANGE_TARGET_LOCK)
    return {
      key: `${KEY}.targetLock`,
      nums: {
        every: RANGE_TUNING.shellEvery,
        delay: RANGE_TUNING.shellLag + RANGE_TUNING.shellWarning,
        radius: RANGE_TUNING.shellRadius,
        min: RANGE_TUNING.shellMin,
        max: RANGE_TUNING.shellMax,
        heroicMin: foundryHeroicAmount(RANGEWARDEN_ID, RANGE_TUNING.shellMin),
        heroicMax: foundryHeroicAmount(RANGEWARDEN_ID, RANGE_TUNING.shellMax),
      },
    };
  if (a.id !== TOCK_SCALDING_VENTS) return null;
  return {
    key: `${KEY}.scaldingVents`,
    nums: {
      min: TOCK_TUNING.ventMin,
      max: TOCK_TUNING.ventMax,
      every: TOCK_TUNING.ventTickEvery,
      seconds: TOCK_TUNING.ventScald,
      heroicMin: foundryHeroicAmount(TOCK_ID, TOCK_TUNING.ventMin),
      heroicMax: foundryHeroicAmount(TOCK_ID, TOCK_TUNING.ventMax),
    },
  };
}
