import type { AbilityEffect, Entity } from '../../../sim/types';

export interface AimPoint {
  x: number;
  z: number;
}

export interface GroundAimState {
  activeAbilityId: string | null;
  activeSlot: number | null;
}

export const DEFAULT_GROUND_AOE_RADIUS = 6;

/** Aim-slot sentinel for an ability arranged only on the cross hotbar: no bar
 *  slot can equal it, so re-press commit resolves by ability id instead. */
export const XHB_ONLY_AIM_SLOT = -1;

/** Touch uses the dedicated precise-targeting preference. Desktop remains
 * governed by the player's ground-reticle preference. */
export function shouldUseGroundAim(
  _abilityId: string,
  mobileTouch: boolean,
  desktopPreference: boolean,
  touchPrecise: boolean,
): boolean {
  return mobileTouch ? touchPrecise : desktopPreference;
}

export function createGroundAimState(): GroundAimState {
  return { activeAbilityId: null, activeSlot: null };
}

export function enterGroundAim(
  state: GroundAimState,
  abilityId: string,
  slot: number,
): GroundAimState {
  return { ...state, activeAbilityId: abilityId, activeSlot: slot };
}

export function cancelGroundAim(state: GroundAimState): GroundAimState {
  if (state.activeAbilityId === null && state.activeSlot === null) return state;
  return { ...state, activeAbilityId: null, activeSlot: null };
}

export function commitGroundAim(state: GroundAimState): {
  state: GroundAimState;
  abilityId: string | null;
} {
  const abilityId = state.activeAbilityId;
  return { state: cancelGroundAim(state), abilityId };
}

export function clampAimToRange(
  caster: Pick<Entity, 'pos'>,
  point: AimPoint,
  range: number,
): {
  point: AimPoint;
  clamped: boolean;
} {
  const maxRange = range > 0 ? range : 5;
  const dx = point.x - caster.pos.x;
  const dz = point.z - caster.pos.z;
  const d = Math.hypot(dx, dz);
  if (d <= maxRange || d === 0) return { point: { x: point.x, z: point.z }, clamped: false };
  return {
    point: {
      x: caster.pos.x + (dx / d) * maxRange,
      z: caster.pos.z + (dz / d) * maxRange,
    },
    clamped: true,
  };
}

export function smartSeedPoint(
  caster: Pick<Entity, 'pos' | 'facing'>,
  targetPoint: AimPoint | null,
  range: number,
): AimPoint {
  if (targetPoint) return clampAimToRange(caster, targetPoint, range).point;
  const effectiveRange = range > 0 ? range : 5;
  const distance = effectiveRange / 2;
  return {
    x: caster.pos.x + Math.sin(caster.facing) * distance,
    z: caster.pos.z + Math.cos(caster.facing) * distance,
  };
}

export function withinMinRange(
  caster: Pick<Entity, 'pos'>,
  point: AimPoint,
  minRange: number | undefined,
): boolean {
  return !!minRange && Math.hypot(point.x - caster.pos.x, point.z - caster.pos.z) < minRange;
}

export function abilityAoeRadius(res: { effects: readonly AbilityEffect[] }): number {
  const effect = res.effects.find(
    (eff) =>
      eff.type === 'aoeDamage' || eff.type === 'groundAoE' || eff.type === 'temporalHourglass',
  );
  if (effect?.type === 'temporalHourglass') return effect.captureRadius;
  return effect && 'radius' in effect ? effect.radius : DEFAULT_GROUND_AOE_RADIUS;
}
