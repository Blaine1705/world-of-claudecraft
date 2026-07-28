// Generic action-slot replacement. The learned base id remains authoritative for
// hotbars and persistence while the resolved definition changes with aura state.

import { ABILITIES } from '../data';
import type { ResolvedAbility } from '../sim';
import type { Entity } from '../types';

export function resolveActionReplacement(base: ResolvedAbility, actor: Entity): ResolvedAbility {
  const rules = base.def.actionReplacement;
  if (!rules) return base;
  // A def may carry one rule per spec engine; the aura kinds are spec-gated,
  // so at most one can be active. The first matching rule wins.
  for (const rule of Array.isArray(rules) ? rules : [rules]) {
    const active = actor.auras.some(
      (aura) => aura.kind === rule.auraKind && (aura.stacks ?? 1) >= (rule.minStacks ?? 1),
    );
    if (active) return replaceResolvedAbility(base, rule.abilityId);
  }
  return base;
}

export function replaceResolvedAbility(
  base: ResolvedAbility,
  replacementId: string,
): ResolvedAbility {
  const replacement = ABILITIES[replacementId];
  if (!replacement) return base;
  return {
    def: replacement,
    rank: 1,
    cost: replacement.cost,
    castTime: replacement.castTime,
    cooldown: replacement.cooldown,
    effects: replacement.effects.map((effect) => ({ ...effect })),
    threatFlat: replacement.threat?.flat ?? 0,
    threatMult: replacement.threat?.mult ?? 1,
    castWhileMoving: replacement.castWhileMoving,
    charges: replacement.maxCharges,
  };
}
