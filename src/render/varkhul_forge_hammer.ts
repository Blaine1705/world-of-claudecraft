import { VARKHUL_FORGE_HAMMER_ABILITY_ID } from '../sim/encounters/varkhul';
import type { SimEvent } from '../sim/types';

type SpellFxAtEvent = Extract<SimEvent, { type: 'spellfxAt' }>;

export interface VarkhulForgeHammerAttackPlan {
  entityId: number;
  abilityId: typeof VARKHUL_FORGE_HAMMER_ABILITY_ID;
}

export function varkhulForgeHammerAttackPlan(
  event: Pick<SpellFxAtEvent, 'ability' | 'sourceId'>,
): VarkhulForgeHammerAttackPlan | null {
  if (event.ability !== VARKHUL_FORGE_HAMMER_ABILITY_ID || event.sourceId === undefined) {
    return null;
  }
  return {
    entityId: event.sourceId,
    abilityId: VARKHUL_FORGE_HAMMER_ABILITY_ID,
  };
}

export function dispatchVarkhulForgeHammerAttack(
  event: Pick<SpellFxAtEvent, 'ability' | 'sourceId'>,
  triggerAttack: (entityId: number, abilityId: string) => void,
): boolean {
  const plan = varkhulForgeHammerAttackPlan(event);
  if (!plan) return false;
  triggerAttack(plan.entityId, plan.abilityId);
  return true;
}
