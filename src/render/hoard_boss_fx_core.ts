import { IGNIVAR_METEOR_RADIUS, IGNIVAR_METEOR_REVEAL_DELAY_SECONDS } from '../sim/ignivar_meteors';
import { hoardSweepMeteorPoints } from '../sim/rift/hoard_boss';
import type { HoardBossCue } from '../sim/rift/types';
import type { HoardBossCueView } from '../world_api/dungeons';

export interface HoardCueVisualPlan {
  progress: number;
  pulseScale: number;
  countdownScale: number;
  urgent: boolean;
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
    if (cue.kind !== 'sweep') continue;
    const sweep: Extract<HoardBossCue, { kind: 'sweep' }> = {
      id: cue.cueId,
      kind: 'sweep',
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
