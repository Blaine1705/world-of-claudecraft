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
