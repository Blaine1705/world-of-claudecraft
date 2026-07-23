import type { SimContext } from '../sim_context';
import type { Entity } from '../types';

export const RADIANT_RESONANCE_KIND = 'paladin_radiant_resonance' as const;
export const RADIANT_RESONANCE_DURATION = 10;
export const RADIANT_RESONANCE_DAWN_CAST_TIME = 1.5;
export const RADIANT_RESONANCE_DAWN_COST_MULTIPLIER = 0.5;

export function hasRadiantResonance(entity: Entity): boolean {
  return entity.auras.some((aura) => aura.kind === RADIANT_RESONANCE_KIND);
}

export function reserveRadiantResonance(entity: Entity, abilityId: string): void {
  if (abilityId === 'dawns_embrace' && hasRadiantResonance(entity)) {
    entity.castRadiantResonance = true;
  }
}

export function clearRadiantResonanceReservation(entity: Entity): void {
  if (entity.castRadiantResonance !== undefined) {
    entity.castRadiantResonance = undefined;
  }
}

export function grantRadiantResonance(
  ctx: SimContext,
  paladin: Entity,
  effectiveTargets: number,
): boolean {
  if (effectiveTargets < 2) return false;
  ctx.applyAura(paladin, {
    id: 'radiant_resonance',
    name: 'Radiant Resonance',
    kind: RADIANT_RESONANCE_KIND,
    value: RADIANT_RESONANCE_DAWN_COST_MULTIPLIER,
    remaining: RADIANT_RESONANCE_DURATION,
    duration: RADIANT_RESONANCE_DURATION,
    sourceId: paladin.id,
    school: 'holy',
  });
  return true;
}

export function radiantResonanceCastTime(
  entity: Entity,
  abilityId: string,
  castTime: number,
): number {
  if (
    abilityId !== 'dawns_embrace' ||
    (!hasRadiantResonance(entity) && entity.castRadiantResonance !== true) ||
    castTime <= RADIANT_RESONANCE_DAWN_CAST_TIME
  ) {
    return castTime;
  }
  return RADIANT_RESONANCE_DAWN_CAST_TIME;
}
