import { IGNIVAR_METEOR_RADIUS, IGNIVAR_METEOR_REVEAL_DELAY_SECONDS } from '../sim/ignivar_meteors';
import { hoardSweepMeteorPoints } from '../sim/rift/hoard_boss';
import { hoardTideWaveCenter } from '../sim/rift/hoard_boss_kits';
import type { HoardBossCue } from '../sim/rift/types';
import type { HoardBossCueView } from '../world_api/dungeons';

export interface HoardCueVisualPlan {
  progress: number;
  pulseScale: number;
  countdownScale: number;
  urgent: boolean;
}

export type HoardCueShape = 'ignivar' | 'sector' | 'wave' | 'tether' | 'disc' | 'annulus';
export type HoardCuePalette = 'physical' | 'fire' | 'frost' | 'arcane' | 'storm' | 'tide';

export interface HoardCueAppearancePlan {
  shape: HoardCueShape;
  palette: HoardCuePalette;
  countdown: 'disc' | 'annulus' | 'none';
  elementalRider: boolean;
}

/** Pure semantic plan shared by every graphics tier and pinned in unit tests. */
export function hoardCueAppearance(cue: HoardBossCueView): HoardCueAppearancePlan {
  switch (cue.variant) {
    case undefined:
    case 'ember-frontal':
      return { shape: 'ignivar', palette: 'fire', countdown: 'none', elementalRider: false };
    case 'frost-gust':
      return { shape: 'sector', palette: 'frost', countdown: 'none', elementalRider: true };
    case 'brute-wide':
    case 'brute-medium':
    case 'brute-long':
      return { shape: 'ignivar', palette: 'physical', countdown: 'none', elementalRider: false };
    case 'tide-wave':
      return { shape: 'wave', palette: 'tide', countdown: 'none', elementalRider: true };
    case 'tide-tether':
      return { shape: 'tether', palette: 'tide', countdown: 'none', elementalRider: true };
    case 'arcane-ring':
      return { shape: 'annulus', palette: 'arcane', countdown: 'annulus', elementalRider: true };
    case 'arcane-blizzard':
      return { shape: 'disc', palette: 'arcane', countdown: 'disc', elementalRider: true };
    case 'storm-charge':
    case 'storm-field':
      return { shape: 'disc', palette: 'storm', countdown: 'disc', elementalRider: true };
    case 'frost-ice':
      return { shape: 'disc', palette: 'frost', countdown: 'disc', elementalRider: true };
    case 'ember-fire':
      return { shape: 'disc', palette: 'fire', countdown: 'disc', elementalRider: true };
    default:
      return { shape: 'disc', palette: 'physical', countdown: 'disc', elementalRider: false };
  }
}

export function hoardTideWaveOffset(cue: HoardBossCueView): number {
  return cue.variant === 'tide-wave'
    ? hoardTideWaveCenter(cue.radius, cue.remaining, cue.total)
    : 0;
}

export const HOARD_CUE_URGENT_SEC = 0.65;

export function hoardCueProgress(remaining: number, total: number): number {
  if (!(total > 0)) return 1;
  return Math.max(0, Math.min(1, 1 - remaining / total));
}

export function hoardCueVisualPlan(
  remaining: number,
  total: number,
  elapsed: number,
): HoardCueVisualPlan {
  const progress = hoardCueProgress(remaining, total);
  const urgent = remaining <= HOARD_CUE_URGENT_SEC;
  const speed = urgent ? 13 : 6;
  return {
    progress,
    pulseScale: 1 + Math.sin(elapsed * speed) * (urgent ? 0.035 : 0.018),
    countdownScale: Math.max(0.001, progress),
    urgent,
  };
}

export interface HoardSweepMeteorWarning {
  id: string;
  x: number;
  z: number;
  radius: number;
  duration: number;
  remaining: number;
  warningLead: number;
}

/** Rebuild the authored falling meteors from the authoritative sweep cue after reconnect. */
export function hoardSweepMeteorWarnings(
  cues: readonly HoardBossCueView[],
): HoardSweepMeteorWarning[] {
  const warnings: HoardSweepMeteorWarning[] = [];
  for (const cue of cues) {
    if (cue.kind !== 'sweep' || (cue.variant !== undefined && cue.variant !== 'ember-frontal')) {
      continue;
    }
    const sweep: Extract<HoardBossCue, { kind: 'sweep' }> = {
      id: cue.cueId,
      kind: 'sweep',
      variant: cue.variant,
      x: cue.x,
      z: cue.z,
      facing: cue.facing ?? 0,
      halfAngle: cue.halfAngle ?? 0,
      radius: cue.radius,
      remaining: cue.remaining,
      total: cue.total,
    };
    for (const [index, point] of hoardSweepMeteorPoints(sweep).entries()) {
      warnings.push({
        id: `hoard-sweep:${cue.instanceId}:${cue.cueId}:${index}`,
        x: point.x,
        z: point.z,
        radius: IGNIVAR_METEOR_RADIUS,
        duration: cue.total,
        remaining: cue.remaining,
        warningLead: Math.min(IGNIVAR_METEOR_REVEAL_DELAY_SECONDS, cue.total * 0.3),
      });
    }
  }
  return warnings;
}
