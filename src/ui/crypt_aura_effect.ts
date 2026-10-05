// What the Hollow Crypt's wing-boss auras DO, for their buff/debuff hover
// tooltip. A pure descriptor like the rest of aura_effect.ts (which calls this
// before the generic kind line): it returns a hudChrome.auraEffect.crypt.* key
// plus the raw numbers, and the HUD formats the numbers and renders t(key,
// values). Several of these auras are quiet markers (a 'slow' of 1, a
// 'buff_dr' of 0, a 'buff_haste' of 1), so the generic kind line would lie
// ("reduces movement speed by 0%"); each says its rule instead. Every number is
// the encounter tuning (src/sim/encounters/hollow_crypt/*_ids.ts) or the
// slippery-ground kernel (src/sim/slippery_ground.ts), the same constants
// combat reads, and the heroic amounts multiply them by the boss's heroic
// mechanic factor (content/dungeon_difficulty.ts). Live per-aura state (the
// Gravedigger's Blow stacks, Lingering Lament's bonus, Harmony's share, the
// ice's grip) reads off the aura itself. Pinned by tests/hollow_crypt_alert.test.ts.

import { HEROIC_DUNGEON_TUNING } from '../sim/content/dungeon_difficulty';
import {
  ILVANE_CRESCENDO,
  ILVANE_HARMONY,
  ILVANE_TUNING,
} from '../sim/encounters/hollow_crypt/ilvane_ids';
import {
  LADY_EMBRACED,
  LADY_ID,
  LADY_LAMENT_DREAD,
  LADY_LINGERING_LAMENT,
  LADY_TUNING,
} from '../sim/encounters/hollow_crypt/lady_ids';
import {
  MARROW_BLOW_STACKS,
  MARROW_DIRT_IN_EYES,
  MARROW_GRAVE_DIRT,
  MARROW_GRAVE_VIGOR,
  MARROW_ID,
  MARROW_MEASURED,
  MARROW_TOLLING,
  MARROW_TUNING,
} from '../sim/encounters/hollow_crypt/marrow_ids';
import { SLIPPERY_DEFAULT_GRIP, SLIPPERY_GROUND_AURA } from '../sim/slippery_ground';
import type { AuraEffectDescriptor, AuraEffectInput } from './aura_effect';

const KEY = 'hudChrome.auraEffect.crypt';

const pct = (frac: number): number => Math.round(Math.abs(frac) * 100);

/** A wing boss mechanic's heroic amount (its normal numbers are stated as
 *  authored; heroic multiplies them by the boss's heroic mechanic factor, the
 *  same mechanicDamageMult the sim stamps on the heroic spawn). */
export function cryptHeroicAmount(mobId: string, amount: number): number {
  const mult = HEROIC_DUNGEON_TUNING.hollow_crypt?.mechanicDamageMultiplierByMob?.[mobId] ?? 1;
  return Math.round(amount * mult);
}

/** A normal and heroic damage range under one boss's factor. */
function range(mobId: string, min: number, max: number): Record<string, number> {
  return {
    min,
    max,
    heroicMin: cryptHeroicAmount(mobId, min),
    heroicMax: cryptHeroicAmount(mobId, max),
  };
}

/** The Crypt aura's descriptor, or null when `a` is not one of them. */
export function cryptAuraEffectDescriptor(a: AuraEffectInput): AuraEffectDescriptor | null {
  const M = MARROW_TUNING;
  const L = LADY_TUNING;
  const I = ILVANE_TUNING;
  switch (a.id) {
    case MARROW_MEASURED:
      return {
        key: `${KEY}.measured`,
        nums: { radius: M.graveRadius, ...range(MARROW_ID, M.graveOpenMin, M.graveOpenMax) },
      };
    case MARROW_GRAVE_DIRT:
      return {
        key: `${KEY}.graveDirt`,
        nums: {
          slow: pct(1 - M.graveSlow),
          damage: M.graveDirtPerSecond,
          heroic: cryptHeroicAmount(MARROW_ID, M.graveDirtPerSecond),
          linger: M.unquietLinger,
        },
      };
    case MARROW_DIRT_IN_EYES:
      return { key: `${KEY}.dirtInEyes`, nums: { pct: pct(1 - M.shovelSlow) } };
    case MARROW_BLOW_STACKS:
      return {
        key: `${KEY}.blow`,
        nums: {
          pct: pct(a.value),
          per: pct(M.blowVulnPerStack),
          stacks: a.stacks ?? 1,
          max: M.blowMaxStacks,
          seconds: M.blowSeconds,
        },
      };
    case MARROW_GRAVE_VIGOR:
      return { key: `${KEY}.graveVigor`, nums: { pct: pct(M.graveVigorHaste - 1) } };
    case MARROW_TOLLING:
      return { key: `${KEY}.tolling`, nums: range(MARROW_ID, M.tollMin, M.tollMax) };
    case LADY_EMBRACED:
      return {
        key: `${KEY}.embraced`,
        nums: {
          tick: L.embracePerSecond,
          tickHeroic: cryptHeroicAmount(LADY_ID, L.embracePerSecond),
          share: pct(L.embraceBreakShare),
          hold: L.embraceHold,
          ...range(LADY_ID, L.dropMin, L.dropMax),
        },
      };
    case LADY_LAMENT_DREAD:
      return {
        key: `${KEY}.lament`,
        nums: {
          radius: L.lanternRadius,
          cap: L.lanternCap,
          ...range(LADY_ID, L.lamentMin, L.lamentMax),
        },
      };
    case LADY_LINGERING_LAMENT:
      return {
        key: `${KEY}.lingering`,
        nums: {
          // value2 carries the whole bonus the next Lament takes.
          pct: pct(a.value2 ?? L.lingerPerStack * (a.stacks ?? 1)),
          per: pct(L.lingerPerStack),
          max: L.lingerMaxStacks,
        },
      };
    case SLIPPERY_GROUND_AURA:
      return {
        key: `${KEY}.slippery`,
        nums: { grip: a.value2 !== undefined && a.value2 > 0 ? a.value2 : SLIPPERY_DEFAULT_GRIP },
      };
    case ILVANE_HARMONY:
      return { key: `${KEY}.harmony`, nums: { pct: pct(a.value), per: pct(I.harmonyPer) } };
    case ILVANE_CRESCENDO:
      return {
        key: `${KEY}.crescendo`,
        nums: {
          cast: I.dirgeCastCrescendo,
          castNormal: I.dirgeCast,
          every: I.dirgeEveryCrescendo,
          everyNormal: I.dirgeEvery,
          waves: I.organWaveAtCrescendo.length,
          wavesNormal: I.organWaveAt.length,
        },
      };
    default:
      return null;
  }
}
