// Pure pose of the Crane Bridge moment (foundry_gates.ts craneBridge): the
// bridge crane on the Crane Landing carries the whole span on its hook. While
// the gate is shut the span hangs level over the gulf west of the landing;
// when both wing bosses fall the jib slews it across the gulf, the slings
// pitching it to the ramp it will be while it is still out over the drop
// (so both its ends clear their seats as it comes round), then lowers it
// onto its seats on the landing and the Drafting Yard, in steam and a shower
// of sparks. Everything is a function of the swing's
// progress (0 parked, 1 seated) and the render clock, in instance-local
// yards, so the rig is one matrix write per mesh and the tests pin that the
// seated span is exactly the walked deck (craneBridgeDeck).
//
// Three-free, DOM-free, deterministic.

import {
  CRANE_BRIDGE,
  STORMBRASS_FOUNDRY_FIELD,
} from '../../sim/content/stormbrass_foundry_layout';
import { authoredFieldHeight } from '../../sim/instances/authored_field';
import { bridgeCraneProp, FOUNDRY_KIT_SIZES } from './foundry_kit_plan_core';
import { bridgeExtension, craneBridgeDeck } from './foundry_plan_core';

/** Seconds the whole swing takes (slew, then lower): slow enough to watch
 *  from either wing's boss room when the second boss falls. */
export const CRANE_BRIDGE_SWING_SECONDS = 9;
/** How far the jib slews back from the bridge's line while it is parked. */
export const CRANE_BRIDGE_PARK_YAW = 1.35;
/** How high over its seats the span rides while it is carried. */
export const CRANE_BRIDGE_CARRY_LIFT = 5.4;
/** The hook block's eye over the span's deck at its middle. */
export const CRANE_BRIDGE_HOOK_ABOVE = 4.4;
/** The share of the swing the span takes to seat; over the rest the slings
 *  drop free and the hook hoists clear of the walkers' heads. */
export const CRANE_BRIDGE_SEAT_SHARE = 0.86;
/** How far the freed hook hoists above its carrying height. */
export const CRANE_BRIDGE_RELEASE_LIFT = 9;

const ease = (u: number): number => {
  const k = Math.min(1, Math.max(0, u));
  return k * k * (3 - 2 * k);
};

/** The swing's progress `since` seconds after the gate last changed, from
 *  the progress it had then toward open (1) or shut (0). */
export function craneBridgeProgress(open: boolean, since: number, from: number): number {
  const k = Math.min(1, Math.max(0, since / CRANE_BRIDGE_SWING_SECONDS));
  return from + ((open ? 1 : 0) - from) * k;
}

export interface CraneBridgeRig {
  /** The crane's mast foot and its slewing ring's height. */
  mast: { x: number; z: number; top: number; scale: number };
  /** The jib's reach to the hook (yards from the mast axis). */
  reach: number;
  /** The jib's yaw with the span seated. */
  seatedYaw: number;
}

let cachedRig: CraneBridgeRig | null = null;
let cachedDeck: ReturnType<typeof craneBridgeDeck> | null = null;

/** The crane's fixed numbers, from the layout's bridge crane prop (computed
 *  once: the layout is data). */
export function craneBridgeRig(): CraneBridgeRig {
  cachedRig ??= computeRig();
  return cachedRig;
}

function computeRig(): CraneBridgeRig {
  const deck = craneBridgeDeck();
  const prop = bridgeCraneProp();
  const px = prop?.x ?? CRANE_BRIDGE.x - 14;
  const pz = prop?.z ?? CRANE_BRIDGE.fromZ - 2;
  const scale = (prop?.h ?? 18) / FOUNDRY_KIT_SIZES.craneMastTop;
  const midZ = CRANE_BRIDGE.fromZ + (deck.len * Math.cos(deck.pitch)) / 2;
  const dx = CRANE_BRIDGE.x - px;
  const dz = midZ - pz;
  return {
    mast: {
      x: px,
      z: pz,
      top: authoredFieldHeight(STORMBRASS_FOUNDRY_FIELD, px, pz) + (prop?.h ?? 18),
      scale,
    },
    reach: Math.hypot(dx, dz),
    seatedYaw: Math.atan2(dx, dz),
  };
}

export interface CraneBridgePose {
  /** The jib's yaw (three.js rotation.y; 0 points +z). */
  jibYaw: number;
  /** The span's deck origin (its south end's walking surface), its yaw and
   *  its pitch (rotation.x after the yaw). */
  span: { x: number; y: number; z: number; yaw: number; pitch: number };
  /** The hook block's eye. */
  hook: { x: number; y: number; z: number };
  /** The jib's trolley the hoist cable leaves from. */
  tip: { x: number; y: number; z: number };
  /** 0..1: how hard the seats spark (the last yard of the lowering). */
  touchdown: number;
  /** 0..1: the hoist working (steam from the winch while the span moves). */
  working: number;
  /** 0..1: the slings let go and the hook hoisted clear (0 while it carries). */
  release: number;
}

/** The whole rig at swing progress `k` (0 parked, 1 seated) and time `t`. */
export function craneBridgePose(k: number, t: number): CraneBridgePose {
  const rig = craneBridgeRig();
  cachedDeck ??= craneBridgeDeck();
  const deck = cachedDeck;
  const e = bridgeExtension(Math.min(1, k / CRANE_BRIDGE_SEAT_SHARE));
  const release = ease((k - CRANE_BRIDGE_SEAT_SHARE) / (1 - CRANE_BRIDGE_SEAT_SHARE));
  const slew = ease(e.swing);
  const lower = ease(e.run);
  const moving = k > 0.001 && k < 0.999 ? 1 : 0;
  // A slow pendulum while the span hangs free, dying as it seats.
  const sway = Math.sin(t * 1.1) * 0.02 * (1 - lower);
  const jibYaw = rig.seatedYaw - CRANE_BRIDGE_PARK_YAW * (1 - slew);
  const hx = rig.mast.x + Math.sin(jibYaw) * rig.reach;
  const hz = rig.mast.z + Math.cos(jibYaw) * rig.reach;
  const seatedMidY = (CRANE_BRIDGE.fromH + CRANE_BRIDGE.toH) / 2;
  const midY = seatedMidY + CRANE_BRIDGE_CARRY_LIFT * (1 - lower);
  // Pitched to its ramp over the first half of the slew, out over the drop.
  const pitch = deck.pitch * ease(e.swing * 2.6) + sway * 0.5;
  const yaw = jibYaw - rig.seatedYaw + sway;
  const half = deck.len / 2;
  const up = -Math.sin(pitch) * half;
  const along = Math.cos(pitch) * half;
  return {
    jibYaw,
    span: {
      x: hx - Math.sin(yaw) * along,
      y: midY - up,
      z: hz - Math.cos(yaw) * along,
      yaw,
      pitch,
    },
    hook: { x: hx, y: midY + CRANE_BRIDGE_HOOK_ABOVE + release * CRANE_BRIDGE_RELEASE_LIFT, z: hz },
    tip: { x: hx, y: rig.mast.top + 0.4 * rig.mast.scale, z: hz },
    touchdown: moving * Math.max(0, (e.run - 0.8) / 0.2) * (1 - release),
    working: moving,
    release,
  };
}

/** Where the seated span meets its two seats (the spark showers). */
export function craneBridgeSeats(): { x: number; y: number; z: number }[] {
  const deck = craneBridgeDeck();
  return [
    { x: CRANE_BRIDGE.x, y: CRANE_BRIDGE.fromH + 0.3, z: CRANE_BRIDGE.fromZ + 0.6 },
    {
      x: CRANE_BRIDGE.x,
      y: CRANE_BRIDGE.toH + 0.3,
      z: CRANE_BRIDGE.fromZ + deck.len * Math.cos(deck.pitch),
    },
  ];
}

/** The spark gate the bridge's seats ride (foundry_sparks.ts). */
export const BRIDGE_SPARK_GATE = 4;
