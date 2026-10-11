import {
  TEMPLE_SKEWERING_TRIDENT,
  TEMPLE_TIDEMARKED_SURGE,
} from '../../sim/mob/trash_kit/temple_cast_ids';

export type TempleGuardianCue = 'trident' | 'surge';
export const GUARDIAN_IMPACT_SECONDS = 0.65;

// Warden-v2 authored bounds: sole 0.04, chest core 2.29, total height
// 4.170002 (including trident). The renderer normalizes to 4.027 and the
// existing template scale is 1.5. Keep spell energy on its chest and leave
// room around the curved pauldrons; tests pin the live manifest/template pair.
export const GUARDIAN_VISUAL = {
  height: 4.027 * 1.5,
  chest: ((2.29 - 0.04) * (4.027 * 1.5)) / 4.170002,
  lowerBandDrop: 0.65,
  upperBandDrop: 0.25,
  chargeRadiusStart: 1.75,
  chargeRadiusGrowth: 0.5,
} as const;

/** Other creatures using the same line cast retain their existing visuals. */
export function templeGuardianCue(templateId: string, ability: string): TempleGuardianCue | null {
  if (templateId === 'temple_tidemarked_trident' && ability === TEMPLE_SKEWERING_TRIDENT)
    return 'trident';
  if (templateId === 'temple_tidemarked_tide' && ability === TEMPLE_TIDEMARKED_SURGE)
    return 'surge';
  return null;
}

export function guardianCharge(remaining: number, total: number): number {
  return total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
}

/** Presentation time only: hit detection stays entirely in the shared sim. */
export function guardianImpactProgress(age: number): number {
  return Math.max(0, Math.min(1, age / GUARDIAN_IMPACT_SECONDS));
}

export function guardianRippleRadius(age: number, radius: number, calm: boolean): number {
  return radius * (calm ? 1 : 0.2 + 0.8 * guardianImpactProgress(age));
}
