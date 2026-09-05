// Session activity mirror: the server's fixed-tick remaining times become
// client display deadlines. The host owns omission and lifecycle clearing.
import { TICK_RATE } from '../sim/types';
import type { MountRaceView } from '../world_api/mounts';

export interface MountRaceMirror {
  raceId: string;
  phase: 'countdown' | 'racing';
  clearedMask: number;
  cleared: number;
  jumpsTotal: number;
  goDeadlineMs: number;
  deadlineMs: number;
  timeLimitTicks: number;
}

export function decodeMountRaceMirror(
  view: MountRaceView | null,
  now: number,
): MountRaceMirror | null {
  if (!view) return null;
  const goTicksLeft = Math.max(0, Number(view.goTicksLeft) || 0);
  const ticksLeft = Math.max(0, Number(view.ticksLeft) || 0);
  const timeLimitTicks = Math.max(0, Number(view.timeLimitTicks) || 0);
  return {
    raceId: String(view.raceId),
    phase: view.phase === 'racing' ? 'racing' : 'countdown',
    clearedMask: Math.max(0, Number(view.clearedMask) || 0),
    cleared: Math.max(0, Number(view.cleared) || 0),
    jumpsTotal: Math.max(0, Number(view.jumpsTotal) || 0),
    goDeadlineMs: now + (goTicksLeft / TICK_RATE) * 1000,
    deadlineMs: now + (ticksLeft / TICK_RATE) * 1000,
    timeLimitTicks,
  };
}
