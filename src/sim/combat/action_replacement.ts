// Generic action-slot replacement. The learned base id remains authoritative for
// hotbars and persistence while the resolved definition changes with aura state.

import { ABILITIES } from '../data';
import type { ResolvedAbility } from '../sim';
import type { Entity } from '../types';

export function resolveActionReplacement(base: ResolvedAbility, actor: Entity): ResolvedAbility {
  const rule = base.def.actionReplacement;
  if (!rule) return base;
  const active = actor.auras.some(
    (aura) => aura.kind === rule.auraKind && (aura.stacks ?? 1) >= (rule.minStacks ?? 1),
  );
  if (!active) return base;
  return replaceResolvedAbility(base, rule.abilityId);
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
