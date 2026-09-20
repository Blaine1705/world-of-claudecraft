import type { HoardBossCueVariant } from './types';

export type HoardBossKit =
  | 'frost'
  | 'ember'
  | 'brood'
  | 'bone-legion'
  | 'brute'
  | 'arcane'
  | 'storm'
  | 'tide';

export interface HoardSweepSpec {
  variant: HoardBossCueVariant;
  radius: number;
  halfAngle: number;
  windup: number;
  damageFraction: number;
  school: 'physical' | 'fire' | 'frost' | 'arcane' | 'nature';
  knockback: number;
  ability: string;
}

export interface HoardMarkSpec {
  variant: HoardBossCueVariant;
  radius: number;
  innerRadius?: number;
  windup: number;
  impactFraction: number;
  hazardDuration: number;
  pulseFraction: number;
  pulseEvery: number;
  school: 'physical' | 'fire' | 'frost' | 'arcane' | 'nature';
  ability: string;
}

export const HOARD_BRUTE_COMBO: readonly HoardSweepSpec[] = [
  {
    variant: 'brute-wide',
    radius: 8,
    halfAngle: Math.PI * 0.37,
    windup: 2,
    damageFraction: 0.12,
    school: 'physical',
    knockback: 0,
    ability: 'Grask Widebreaker',
  },
  {
    variant: 'brute-medium',
    radius: 12,
    halfAngle: Math.PI * 0.24,
    windup: 2,
    damageFraction: 0.15,
    school: 'physical',
    knockback: 0,
    ability: 'Grask Cleaver',
  },
  {
    variant: 'brute-long',
    radius: 18,
    halfAngle: Math.PI * 0.13,
    windup: 2,
    damageFraction: 0.2,
    school: 'physical',
    knockback: 1.5,
    ability: 'Grask Skullsplitter',
  },
] as const;

/** Alternate left, right, then center around the opening aim. Each cue locks its own aim. */
export const HOARD_BRUTE_FACING_OFFSETS = [-0.7, 0.7, 0] as const;

export const HOARD_FROST_GUST: HoardSweepSpec = {
  variant: 'frost-gust',
  radius: 20,
  halfAngle: Math.PI * 0.3,
  windup: 2.4,
  damageFraction: 0.1,
  school: 'frost',
  knockback: 2.5,
  ability: 'Whiteout Gust',
};

export const HOARD_TIDE_WAVE: HoardSweepSpec = {
  variant: 'tide-wave',
  radius: 28,
  halfAngle: Math.PI * 0.42,
  windup: 4.2,
  damageFraction: 0.1,
  school: 'frost',
  knockback: 2.2,
  ability: 'Crashing Tide',
};

export const HOARD_TIDE_WAVE_HALF_SPAN = 15;
export const HOARD_TIDE_WAVE_HALF_GAP = 2.5;
export const HOARD_TIDE_WAVE_HALF_DEPTH = 1.15;
export const HOARD_TIDE_WAVE_LEAD_SEC = 1;

/** Center of the traveling wave measured along its authored facing. */
export function hoardTideWaveCenter(radius: number, remaining: number, total: number): number {
  const elapsed = Math.max(0, total - remaining);
  if (elapsed < HOARD_TIDE_WAVE_LEAD_SEC) return -radius * 0.5 - HOARD_TIDE_WAVE_HALF_DEPTH * 2;
  const travelDuration = Math.max(0.05, total - HOARD_TIDE_WAVE_LEAD_SEC);
  const progress = Math.max(0, Math.min(1, (elapsed - HOARD_TIDE_WAVE_LEAD_SEC) / travelDuration));
  return -radius * 0.5 + progress * radius;
}

/** Two broad foam lanes cross the arena with a stable central escape gap. */
export function pointInHoardTideWave(
  origin: { x: number; z: number },
  facing: number,
  point: { x: number; z: number },
  radius: number,
  remaining: number,
  total: number,
): boolean {
  const dx = point.x - origin.x;
  const dz = point.z - origin.z;
  const along = dx * Math.sin(facing) + dz * Math.cos(facing);
  const lateral = dx * Math.cos(facing) - dz * Math.sin(facing);
  const center = hoardTideWaveCenter(radius, remaining, total);
  return (
    Math.abs(along - center) <= HOARD_TIDE_WAVE_HALF_DEPTH &&
    Math.abs(lateral) <= HOARD_TIDE_WAVE_HALF_SPAN &&
    Math.abs(lateral) >= HOARD_TIDE_WAVE_HALF_GAP
  );
}

export function hoardBossKit(templateId: string): HoardBossKit {
  switch (templateId) {
    case 'rift_boss_frost':
      return 'frost';
    case 'rift_boss_ember':
      return 'ember';
    case 'rift_boss_venom':
      return 'brood';
    case 'rift_boss_necro':
      return 'bone-legion';
    case 'rift_boss_brute':
      return 'brute';
    case 'rift_boss_arcane':
      return 'arcane';
    case 'rift_boss_storm':
      return 'storm';
    case 'rift_boss_tide':
      return 'tide';
    default:
      return 'ember';
  }
}

export function pointInHoardAnnulus(
  center: { x: number; z: number },
  point: { x: number; z: number },
  innerRadius: number,
  outerRadius: number,
): boolean {
  const distanceSq = (point.x - center.x) ** 2 + (point.z - center.z) ** 2;
  return distanceSq >= innerRadius * innerRadius && distanceSq <= outerRadius * outerRadius;
}

export function hoardMarkSpec(variant: HoardBossCueVariant): HoardMarkSpec {
  switch (variant) {
    case 'frost-ice':
      return {
        variant,
        radius: 3.8,
        windup: 1.6,
        impactFraction: 0.06,
        hazardDuration: 5,
        pulseFraction: 0.015,
        pulseEvery: 0.6,
        school: 'frost',
        ability: 'Treacherous Ice',
      };
    case 'ember-fire':
      return {
        variant,
        radius: 3,
        windup: 2.1,
        impactFraction: 0.18,
        hazardDuration: 2,
        pulseFraction: 0.03,
        pulseEvery: 0.5,
        school: 'fire',
        ability: 'Emberfall',
      };
    case 'arcane-blizzard':
      return {
        variant,
        radius: 5.2,
        windup: 1.8,
        impactFraction: 0.08,
        hazardDuration: 5.5,
        pulseFraction: 0.035,
        pulseEvery: 0.75,
        school: 'frost',
        ability: 'Nyxaris Blizzard',
      };
    case 'arcane-ring':
      return {
        variant,
        radius: 8.5,
        innerRadius: 4.5,
        windup: 2.2,
        impactFraction: 0.12,
        hazardDuration: 0,
        pulseFraction: 0,
        pulseEvery: 1,
        school: 'frost',
        ability: 'Ring of Frost',
      };
    case 'storm-charge':
      return {
        variant,
        radius: 9,
        windup: 3.2,
        impactFraction: 0.34,
        hazardDuration: 6,
        pulseFraction: 0.03,
        pulseEvery: 0.75,
        school: 'nature',
        ability: 'Tempest Judgment',
      };
    case 'storm-field':
      return {
        variant,
        radius: 9,
        windup: 0,
        impactFraction: 0,
        hazardDuration: 6,
        pulseFraction: 0.03,
        pulseEvery: 0.75,
        school: 'nature',
        ability: 'Charged Ground',
      };
    default:
      return {
        variant: 'buried-mark',
        radius: 3,
        windup: 2.1,
        impactFraction: 0.18,
        hazardDuration: 2,
        pulseFraction: 0.03,
        pulseEvery: 0.5,
        school: 'physical',
        ability: 'Buried Mark',
      };
  }
}
