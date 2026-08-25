import {
  VARKHUL_ANVILS_DECREE_CAST_ID,
  VARKHUL_FORGE_HAMMER_ABILITY_ID,
} from '../sim/encounters/varkhul';
import type { SimEvent } from '../sim/types';

type SpellFxAtEvent = Extract<SimEvent, { type: 'spellfxAt' }>;

// Which boss spellfxAt emissions start an authored one-shot, keyed by ability
// and gated on the fx kind. The fx gate keeps multi-emission abilities from
// double-triggering: the Anvil's Decree strike is the 'nova' at the forge,
// while its falling meteors emit 'meteorImpact' under the same ability id.
// The Sweep release is deliberately NOT routed: its whole windup plays as a
// Slam cast clip (castByAbility), so a release one-shot would double-swing.
const VARKHUL_STRIKE_FX: Record<string, string> = {
  [VARKHUL_FORGE_HAMMER_ABILITY_ID]: 'burst',
  [VARKHUL_ANVILS_DECREE_CAST_ID]: 'nova',
};

export interface VarkhulForgeHammerAttackPlan {
  entityId: number;
  abilityId: string;
}

export function varkhulForgeHammerAttackPlan(
  event: Pick<SpellFxAtEvent, 'ability' | 'sourceId' | 'fx'>,
): VarkhulForgeHammerAttackPlan | null {
  if (event.ability === undefined || event.sourceId === undefined) return null;
  if (VARKHUL_STRIKE_FX[event.ability] !== event.fx) return null;
  return {
    entityId: event.sourceId,
    abilityId: event.ability,
  };
}

export function dispatchVarkhulForgeHammerAttack(
  event: Pick<SpellFxAtEvent, 'ability' | 'sourceId' | 'fx'>,
  triggerAttack: (entityId: number, abilityId: string) => void,
): boolean {
  const plan = varkhulForgeHammerAttackPlan(event);
  if (!plan) return false;
  triggerAttack(plan.entityId, plan.abilityId);
  return true;
}
