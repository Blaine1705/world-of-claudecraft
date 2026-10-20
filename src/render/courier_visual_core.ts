import { courierFlightBlend, courierLegSegmentAt } from '../sim/courier/motion';

/** Read-only presentation subset of the authoritative courier snapshot. */
export interface CourierVisualInfo {
  phase: 'ready' | 'outbound' | 'returning' | 'waiting';
  x: number;
  z: number;
  travelTicks?: number;
  legTicks?: number;
  travelDistance?: number;
  remainingDistance?: number;
}

export interface CourierVisualPose {
  lift: number;
  flight: number;
  moving: boolean;
  /** Nose-up body tilt in radians: hops, takeoff climb and the landing skid. */
  pitch: number;
  /** Run cycle playback rate; the skid slows the legs to a stop. */
  stride: number;
}

export const COURIER_FLIGHT_LIFT = 2;
/** Each pre-takeoff hop springs a little higher than the last. */
export const COURIER_HOP_HEIGHTS = [0.35, 0.5, 0.7] as const;
/** A server that predates per-leg timing ran fixed ten-second legs. */
const LEGACY_LEG_TICKS = 200;

function smoothstep(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

function grounded(out: CourierVisualPose, moving: boolean): void {
  out.flight = 0;
  out.lift = 0;
  out.pitch = 0;
  out.stride = 1;
  out.moving = moving;
}

/** Run, hops, takeoff, cruise, descent and skid follow authoritative leg ticks.
 * Reduced motion keeps the essential flight altitude, and the caller freezes clips. */
export function courierVisualPoseInto(
  out: CourierVisualPose,
  info: CourierVisualInfo,
  moved: boolean,
): void {
  const travelling = info.phase === 'outbound' || info.phase === 'returning';
  const remaining = info.remainingDistance ?? 0;
  if (!travelling) {
    grounded(out, moved);
    return;
  }
  if (info.travelTicks === undefined) {
    grounded(out, moved || remaining > 0);
    out.flight = courierFlightBlend(info.travelDistance ?? 0, remaining);
    out.lift = COURIER_FLIGHT_LIFT * out.flight;
    return;
  }
  // A paused or arrived leg rests on the ground at its last authoritative point.
  if (remaining <= 0) {
    grounded(out, moved);
    return;
  }
  grounded(out, true);
  const { segment, u, hop } = courierLegSegmentAt(
    info.travelTicks,
    info.legTicks ?? LEGACY_LEG_TICKS,
  );
  switch (segment) {
    case 'run':
      return;
    case 'hop': {
      const arc = 4 * u * (1 - u);
      out.lift = (COURIER_HOP_HEIGHTS[hop] ?? COURIER_HOP_HEIGHTS[0]) * arc;
      // Nose up on the spring, level again for the landing.
      out.pitch = 0.18 * (1 - 2 * u);
      return;
    }
    case 'takeoff':
      out.flight = smoothstep(u);
      out.lift = COURIER_FLIGHT_LIFT * out.flight;
      out.pitch = 0.3 * Math.sin(Math.PI * u);
      return;
    case 'cruise':
      out.flight = 1;
      out.lift = COURIER_FLIGHT_LIFT;
      return;
    case 'descent':
      out.flight = 1 - smoothstep(u);
      out.lift = COURIER_FLIGHT_LIFT * out.flight;
      // Flare the nose up just before touchdown.
      out.pitch = 0.22 * smoothstep(u);
      return;
    case 'skid':
      // Lean back hardest at touchdown and settle level as the slide stops.
      out.pitch = 0.35 * (1 - u) * Math.min(1, u * 6 + 0.6);
      out.stride = Math.max(0.15, 1 - u);
      return;
  }
}

export const COURIER_SPIN_SECONDS = 1;
export const COURIER_VANISH_SECONDS = 0.4;
export const COURIER_FAREWELL_SECONDS = COURIER_SPIN_SECONDS + COURIER_VANISH_SECONDS;

export interface CourierFarewellPose {
  /** Extra yaw added to the landing facing (one full turn by the spin's end). */
  spin: number;
  lift: number;
  scale: number;
  done: boolean;
}

/** After the final delivery the donkey does one happy hop-spin, then shrinks away. */
export function courierFarewellPoseInto(out: CourierFarewellPose, elapsed: number): void {
  const t = Math.max(0, elapsed);
  const spinU = Math.min(1, t / COURIER_SPIN_SECONDS);
  out.spin = 2 * Math.PI * smoothstep(spinU);
  out.lift = 0.45 * 4 * spinU * (1 - spinU);
  const vanishU = Math.max(0, Math.min(1, (t - COURIER_SPIN_SECONDS) / COURIER_VANISH_SECONDS));
  out.done = t >= COURIER_FAREWELL_SECONDS;
  out.scale = out.done ? 0 : 1 - vanishU * vanishU;
  out.lift += 0.3 * vanishU;
}

/** True when the last observed pose was the return skid, so a vanished
 * snapshot means a completed delivery rather than a cancelled or unloaded one. */
export function courierDelivered(last: CourierVisualInfo | null): boolean {
  return (
    last?.phase === 'returning' &&
    last.travelTicks !== undefined &&
    last.legTicks !== undefined &&
    last.travelTicks <= last.legTicks &&
    last.legTicks - last.travelTicks <= 10
  );
}

/** No route prediction: orient along the last observed authoritative movement. */
export function courierFacing(
  previousX: number,
  previousZ: number,
  x: number,
  z: number,
  yaw: number,
): number {
  return Math.hypot(x - previousX, z - previousZ) > 0.001
    ? Math.atan2(x - previousX, z - previousZ)
    : yaw;
}
