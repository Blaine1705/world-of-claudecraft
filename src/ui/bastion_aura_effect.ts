// What the Sunken Bastion's boss marks DO, for their buff/debuff hover tooltip.
// A pure descriptor like the rest of aura_effect.ts (which calls this before the
// generic kind line): it returns a hudChrome.auraEffect.bastion.* key plus the
// raw numbers, and the HUD formats the numbers and renders t(key, values).
// The Drowned Anchor's hook is a tether (an authoritative displacement state,
// with no generic kind line of its own), so it says its rule: the two ways out
// and what the pit costs. Every number is the encounter tuning
// (src/sim/encounters/sunken_bastion/ids.ts), the same constants combat reads.
// Pinned by tests/sunken_bastion_chain_alert.test.ts.

import { anchorHits, OSSICK_ANCHORED, OSSICK_TUNING } from '../sim/encounters/sunken_bastion/ids';
import type { AuraEffectDescriptor, AuraEffectInput } from './aura_effect';

const KEY = 'hudChrome.auraEffect.bastion';

const pct = (frac: number): number => Math.round(Math.abs(frac) * 100);

/** The Bastion mark's descriptor, or null when `a` is not one of them. */
export function bastionAuraEffectDescriptor(a: AuraEffectInput): AuraEffectDescriptor | null {
  if (a.id === OSSICK_ANCHORED) {
    const T = OSSICK_TUNING;
    return {
      key: `${KEY}.anchored`,
      nums: {
        reach: T.postReach,
        run: T.postRun,
        dark: T.postDarkSeconds,
        links: anchorHits(false),
        linksHeroic: anchorHits(true),
        pit: pct(T.pitShare),
        pitHeroic: pct(T.pitShareHeroic),
      },
    };
  }
  return null;
}
