// What the Hollow Crypt trash marks DO, for their buff/debuff hover tooltip.
// A pure descriptor like the rest of aura_effect.ts (which calls this before
// the generic kind line): it returns a hudChrome.auraEffect.crypt.* key plus
// the raw numbers, and the HUD formats the numbers and renders t(key, values).
// The Carrion Eye rides a slow aura at full speed (a mark, not a slow), so the
// generic slow line would claim a 0% slow; Granite Skin says its rule (it
// thickens on a clock and a stun shatters it). Every number is the template's
// own (src/sim/content/hollow_crypt_trash.ts), the values combat reads.
// Pinned by tests/hollow_crypt_trash_mechanics.test.ts.

import { MOBS } from '../sim/data';
import { CRYPT_CARRION_EYE, CRYPT_GRANITE_SKIN } from '../sim/mob/trash_kit/cast_ids';
import type { AuraEffectDescriptor, AuraEffectInput } from './aura_effect';

const KEY = 'hudChrome.auraEffect.crypt';

const pct = (frac: number): number => Math.round(Math.abs(frac) * 100);

/** The crypt trash mark's descriptor, or null when `a` is not one of them. */
export function cryptAuraEffectDescriptor(a: AuraEffectInput): AuraEffectDescriptor | null {
  if (a.id === CRYPT_CARRION_EYE) {
    const eye = MOBS.crypt_crow_caller?.trashKit?.eye;
    return { key: `${KEY}.carrionEye`, nums: { seconds: eye?.seconds ?? 6 } };
  }
  if (a.id === CRYPT_GRANITE_SKIN) {
    const g = MOBS.crypt_chapel_gargoyle?.trashKit?.granite;
    return {
      key: `${KEY}.graniteSkin`,
      nums: {
        pct: pct(a.value),
        every: g?.every ?? 3,
        cracked: pct(g?.cracked.taken ?? 0.25),
      },
    };
  }
  return null;
}
