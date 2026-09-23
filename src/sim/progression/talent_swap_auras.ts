// Which auras a talent change orphans.
//
// A buff a talent's ability put up used to outlive the talent: channel
// Aetherwell, swap the capstone row to Rune of Power before the pull, fight
// with both (player report, v0.44). The talent recompute now strips every
// aura the player applied whose id ONLY a dropped ability can produce: a
// granted ability that fell out of the known list, or a talent rider
// (addEffects) that no longer resolves onto a still-known one (Ghostfoot
// Ward's damage cut on the baseline Ghostfoot).
//
// The ids come from the dispatcher's own rules (combat/aura_ids.ts), applied
// to each known ability's RESOLVED effects, so a talent-added companion buff
// is named exactly as the cast named it. An id a still-known ability can also
// produce is never orphaned. Abilities whose aura ids are hard-coded constants
// in a bespoke system (Temporal Echo and its kin) keep their own teardown in
// talents.ts; this module is the general rule for everything else.
// Pure: no Sim, no Rng, no host.
import { absorbAuraId, buffTargetAuraId, selfBuffAuraId } from '../combat/aura_ids';
import type { AbilityEffect } from '../types';

/** The slice of a known ability this reads: the def the dispatcher names ids
 *  from, and the resolved effects a cast runs. */
export interface AuraSourceAbility {
  def: { id: string; effects: readonly AbilityEffect[] };
  effects: readonly AbilityEffect[];
}

/** Every aura id one resolved ability can leave. The bare id is always one:
 *  most effect shapes (heals over time, group absorbs, zones) apply under it. */
export function abilityAuraIds(ability: AuraSourceAbility): Set<string> {
  const ids = new Set<string>([ability.def.id]);
  let buffTargetIndex = 0;
  for (const eff of ability.effects) {
    if (eff.type === 'selfBuff') ids.add(selfBuffAuraId(ability.def, eff));
    else if (eff.type === 'absorb') ids.add(absorbAuraId(ability.def, eff));
    else if (eff.type === 'buffTarget') {
      ids.add(buffTargetAuraId(ability.def, eff, buffTargetIndex));
      buffTargetIndex += 1;
    } else if ('auraId' in eff && typeof eff.auraId === 'string') ids.add(eff.auraId);
  }
  return ids;
}

/** Aura ids the previous known set could leave that the next one cannot. */
export function orphanedAbilityAuraIds(
  previous: readonly AuraSourceAbility[],
  next: readonly AuraSourceAbility[],
): Set<string> {
  const kept = new Set<string>();
  for (const ability of next) for (const id of abilityAuraIds(ability)) kept.add(id);
  const orphaned = new Set<string>();
  for (const ability of previous) {
    for (const id of abilityAuraIds(ability)) if (!kept.has(id)) orphaned.add(id);
  }
  return orphaned;
}
