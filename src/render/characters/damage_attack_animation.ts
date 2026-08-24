// Pure event gate for physical-hit attack gestures. Casts with an authored
// full-body one-shot keep ownership of the rig while ordinary melee damage is
// still allowed to resolve underneath them.

import { playerRangedAttackAlreadyStarted } from './skin_attack';

export interface DamageAttackAnimationContext {
  sourceKind: string | undefined;
  attackAnimationStarted: boolean | undefined;
  castingAbility: string | null | undefined;
  authoredCastOwnsBody: boolean;
}

export function shouldStartDamageAttackAnimation({
  sourceKind,
  attackAnimationStarted,
  castingAbility,
  authoredCastOwnsBody,
}: DamageAttackAnimationContext): boolean {
  if (playerRangedAttackAlreadyStarted(sourceKind, attackAnimationStarted)) return false;
  return !(sourceKind === 'mob' && castingAbility !== null && authoredCastOwnsBody);
}
