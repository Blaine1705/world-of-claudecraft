import { DT } from '../types';
import type { CourierState } from './types';

/** No leg may take longer than this; long routes cruise faster to arrive on time. */
export const COURIER_MAX_LEG_SECONDS = 15;
export const COURIER_MAX_LEG_TICKS = COURIER_MAX_LEG_SECONDS / DT;
/** Ground run before the hops, then the hops themselves, both at ground speed. */
export const COURIER_RUN_SECONDS = 0.8;
export const COURIER_HOP_COUNT = 3;
export const COURIER_HOP_SECONDS = 0.4;
export const COURIER_TAKEOFF_SECONDS = 1.2;
export const COURIER_DESCENT_SECONDS = 1.2;
/** Touchdown slide: ground speed braking linearly to a stop at the destination. */
export const COURIER_SKID_SECONDS = 0.6;
export const COURIER_GROUND_SPEED = 7;
/** Natural flight speed (three times run speed) before the duration cap applies. */
export const COURIER_CRUISE_SPEED = 21;
/** The returning courier lands this far in front of its owner, not inside them. */
export const COURIER_LANDING_OFFSET = 2.2;
// Retained for older wire poses and saves during a rolling deployment.
export const COURIER_GROUND_DISTANCE = 3;
export const COURIER_FLIGHT_DISTANCE = 8;

const GROUND_SECONDS = COURIER_RUN_SECONDS + COURIER_HOP_COUNT * COURIER_HOP_SECONDS;
const FIXED_SECONDS =
  GROUND_SECONDS + COURIER_TAKEOFF_SECONDS + COURIER_DESCENT_SECONDS + COURIER_SKID_SECONDS;

function smoothstep(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/** Integral of smoothstep over [0, u]: a smoothstep speed ramp's covered fraction. */
function smoothstepArea(u: number): number {
  const v = Math.max(0, Math.min(1, u));
  return v * v * v - 0.5 * v * v * v * v;
}

/** Compatibility for a server that still publishes distance-based poses. */
export function courierFlightBlend(travelDistance: number, remainingDistance: number): number {
  return smoothstep(
    (Math.min(travelDistance, remainingDistance) - COURIER_GROUND_DISTANCE) /
      (COURIER_FLIGHT_DISTANCE - COURIER_GROUND_DISTANCE),
  );
}

/** One leg's fixed speed profile, derived only from its starting distance. */
export interface CourierLegPlan {
  ticks: number;
  cruiseSeconds: number;
  groundSpeed: number;
  cruiseSpeed: number;
}

/** Run, hops, takeoff, cruise, descent and skid. The cruise stretches at natural
 * speed until the leg would exceed fifteen seconds, then speeds up instead.
 * Routes too short for a full-speed profile slow every segment uniformly. */
export function courierLegPlan(distance: number): CourierLegPlan {
  const d = Math.max(0, distance);
  const fixedArea = COURIER_TAKEOFF_SECONDS / 2 + COURIER_DESCENT_SECONDS / 2;
  // Distance covered at ground speed by everything except the cruise share.
  const groundShare =
    COURIER_GROUND_SPEED *
    (GROUND_SECONDS +
      COURIER_TAKEOFF_SECONDS / 2 +
      COURIER_DESCENT_SECONDS / 2 +
      COURIER_SKID_SECONDS / 2);
  const natural = Math.max(
    0,
    (d - groundShare - COURIER_CRUISE_SPEED * fixedArea) / COURIER_CRUISE_SPEED,
  );
  const ticks = Math.min(COURIER_MAX_LEG_TICKS, Math.round((FIXED_SECONDS + natural) / DT));
  const cruiseSeconds = Math.max(0, ticks * DT - FIXED_SECONDS);
  const cruiseSpeed = (d - groundShare) / (fixedArea + cruiseSeconds);
  if (cruiseSpeed >= COURIER_GROUND_SPEED)
    return { ticks, cruiseSeconds, groundSpeed: COURIER_GROUND_SPEED, cruiseSpeed };
  const scale = d / (groundShare + COURIER_GROUND_SPEED * fixedArea);
  return {
    ticks,
    cruiseSeconds: 0,
    groundSpeed: COURIER_GROUND_SPEED * scale,
    cruiseSpeed: COURIER_GROUND_SPEED * scale,
  };
}

/** Distance covered after `seconds` along a plan (piecewise exact integral). */
function courierLegDistance(plan: CourierLegPlan, seconds: number): number {
  const vg = plan.groundSpeed;
  const vc = plan.cruiseSpeed;
  let t = Math.max(0, seconds);
  let s = vg * Math.min(t, GROUND_SECONDS);
  t -= GROUND_SECONDS;
  if (t <= 0) return s;
  const takeoff = Math.min(t, COURIER_TAKEOFF_SECONDS);
  s +=
    vg * takeoff +
    (vc - vg) * COURIER_TAKEOFF_SECONDS * smoothstepArea(takeoff / COURIER_TAKEOFF_SECONDS);
  t -= COURIER_TAKEOFF_SECONDS;
  if (t <= 0) return s;
  s += vc * Math.min(t, plan.cruiseSeconds);
  t -= plan.cruiseSeconds;
  if (t <= 0) return s;
  const descent = Math.min(t, COURIER_DESCENT_SECONDS);
  s +=
    vc * descent +
    (vg - vc) * COURIER_DESCENT_SECONDS * smoothstepArea(descent / COURIER_DESCENT_SECONDS);
  t -= COURIER_DESCENT_SECONDS;
  if (t <= 0) return s;
  const skid = Math.min(t, COURIER_SKID_SECONDS);
  return s + vg * (skid - (skid * skid) / (2 * COURIER_SKID_SECONDS));
}

/** Fraction of the route covered after `ticks`; exactly 1 on the plan's final tick. */
export function courierLegProgress(plan: CourierLegPlan, ticks: number): number {
  if (ticks >= plan.ticks) return 1;
  const total = courierLegDistance(plan, plan.ticks * DT);
  return total > 0 ? Math.min(1, courierLegDistance(plan, ticks * DT) / total) : 0;
}

export type CourierLegSegment = 'run' | 'hop' | 'takeoff' | 'cruise' | 'descent' | 'skid';

const ticksOf = (seconds: number) => Math.round(seconds / DT);
const RUN_TICKS = ticksOf(COURIER_RUN_SECONDS);
const HOP_TICKS = ticksOf(COURIER_HOP_SECONDS);
const GROUND_TICKS = RUN_TICKS + COURIER_HOP_COUNT * HOP_TICKS;
const TAKEOFF_TICKS = ticksOf(COURIER_TAKEOFF_SECONDS);
const DESCENT_TICKS = ticksOf(COURIER_DESCENT_SECONDS);
const SKID_TICKS = ticksOf(COURIER_SKID_SECONDS);

/** Presentation schedule of one leg: which segment is playing and how far through
 * it (0..1). Hops report their own index so each bounce can differ. Integer tick
 * boundaries keep every host and frame on the same segment. */
export function courierLegSegmentAt(
  ticks: number,
  legTicks: number,
): { segment: CourierLegSegment; u: number; hop: number } {
  const elapsed = Math.max(0, Math.min(legTicks, ticks));
  const remaining = legTicks - elapsed;
  if (remaining <= SKID_TICKS) return { segment: 'skid', u: 1 - remaining / SKID_TICKS, hop: 0 };
  if (remaining <= SKID_TICKS + DESCENT_TICKS)
    return { segment: 'descent', u: 1 - (remaining - SKID_TICKS) / DESCENT_TICKS, hop: 0 };
  if (elapsed < RUN_TICKS) return { segment: 'run', u: elapsed / RUN_TICKS, hop: 0 };
  if (elapsed < GROUND_TICKS) {
    const hops = (elapsed - RUN_TICKS) / HOP_TICKS;
    const hop = Math.floor(hops);
    return { segment: 'hop', u: hops - hop, hop };
  }
  if (elapsed < GROUND_TICKS + TAKEOFF_TICKS)
    return { segment: 'takeoff', u: (elapsed - GROUND_TICKS) / TAKEOFF_TICKS, hop: 0 };
  return { segment: 'cruise', u: 0, hop: 0 };
}

/** The returning leg ends just ahead of where the owner faces. */
export function courierLandingPoint(pos: { x: number; z: number }, facing: number) {
  const yaw = Number.isFinite(facing) ? facing : 0;
  return {
    x: pos.x + Math.sin(yaw) * COURIER_LANDING_OFFSET,
    z: pos.z + Math.cos(yaw) * COURIER_LANDING_OFFSET,
  };
}

/** Fix a leg's start point and duration from the current position and target. */
export function startCourierLeg(state: CourierState, x: number, z: number): void {
  state.travelTicks = 0;
  state.legStartX = state.x;
  state.legStartZ = state.z;
  state.legDistance = Math.hypot(x - state.x, z - state.z);
  state.travelDistance = 0;
}

/** Wire-facing leg length, or undefined while a legacy leg is still unplanned. */
export function courierLegTicks(state: CourierState): number | undefined {
  return state.travelTicks === undefined || state.legDistance === undefined
    ? undefined
    : courierLegPlan(state.legDistance).ticks;
}

/** Fixed-start interpolation keeps a stationary destination's path straight.
 * The returning endpoint follows the current owner without extending the deadline. */
export function travelCourier(state: CourierState, x: number, z: number, journey = true): boolean {
  if (journey) {
    if (
      state.travelTicks === undefined ||
      state.legStartX === undefined ||
      state.legStartZ === undefined ||
      state.legDistance === undefined
    )
      startCourierLeg(state, x, z);
    const plan = courierLegPlan(state.legDistance!);
    state.travelTicks = Math.min(plan.ticks, state.travelTicks! + 1);
    const progress = courierLegProgress(plan, state.travelTicks);
    state.x = state.legStartX! + (x - state.legStartX!) * progress;
    state.z = state.legStartZ! + (z - state.legStartZ!) * progress;
    state.travelDistance = Math.min(
      COURIER_FLIGHT_DISTANCE,
      Math.hypot(state.x - state.legStartX!, state.z - state.legStartZ!),
    );
    if (state.travelTicks === plan.ticks) {
      state.x = x;
      state.z = z;
      return true;
    }
    return false;
  }
  const dx = x - state.x;
  const dz = z - state.z;
  const distance = Math.hypot(dx, dz);
  const step = Math.min(distance, COURIER_GROUND_SPEED * DT);
  if (distance <= step) {
    state.x = x;
    state.z = z;
    return true;
  }
  state.x += (dx / distance) * step;
  state.z += (dz / distance) * step;
  return false;
}
