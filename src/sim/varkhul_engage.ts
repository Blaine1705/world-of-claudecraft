// Varkhul's walk-in staging. Before anyone pulls, the Forgefather works his
// anvil with his back to the door (his spawn IS the work spot); on first
// engage he turns, roars, and leaps to the arena center before fighting.
// Pure state machine + arc math; the encounter module owns positions, events,
// and every mechanic. The staging deliberately never touches ability timers:
// they tick through the taunt and leap, so the cast schedule is identical to
// an un-staged pull.
import type { Vec3 } from './types';

// Covers the roar one-shot (PowerUp, 2.37s) so the leap starts clean and the
// airborne pose can read.
export const VARKHUL_ENGAGE_TAUNT_SECONDS = 2.4;
export const VARKHUL_ENGAGE_LEAP_SECONDS = 0.8;
export const VARKHUL_ENGAGE_LEAP_PEAK_Y = 4.5;
/** He leaps from his anvil to the middle of the arena (the dais center). */
export const VARKHUL_ENGAGE_ARENA_LOCAL_POS = { x: 0, z: 0 } as const;
/** How close a living player must come to pull him off the anvil. Matches
 *  his template aggroRadius; damage pulls at any range. */
export const VARKHUL_ENGAGE_RADIUS = 30;
/** Pre-pull anvil work cadence; mirrors the assembly-phase forge hammer. */
export const VARKHUL_ENGAGE_HAMMER_FIRST_SECONDS = 0.6;
export const VARKHUL_ENGAGE_HAMMER_EVERY_SECONDS = 2;

export type VarkhulEngagePhase = 'forging' | 'taunting' | 'leaping' | 'done';

export interface VarkhulEngageState {
  phase: VarkhulEngagePhase;
  /** seconds left in the current taunting/leaping phase */
  remaining: number;
  /** pre-pull hammer-blow countdown while forging */
  hammerTimer: number;
  /** where the leap started (the anvil), captured at engage */
  leapFrom: Vec3 | null;
}

export function initVarkhulEngage(): VarkhulEngageState {
  return {
    phase: 'forging',
    remaining: 0,
    hammerTimer: VARKHUL_ENGAGE_HAMMER_FIRST_SECONDS,
    leapFrom: null,
  };
}

/** Pre-pull anvil work: true exactly on the ticks a hammer blow lands. */
export function varkhulForgingHammerTick(st: VarkhulEngageState, dt: number): boolean {
  if (st.phase !== 'forging') return false;
  st.hammerTimer -= dt;
  if (st.hammerTimer > 1e-6) return false;
  st.hammerTimer += VARKHUL_ENGAGE_HAMMER_EVERY_SECONDS;
  return true;
}

/** First engage: leave the anvil work and start the taunt. */
export function startVarkhulEngage(st: VarkhulEngageState, from: Vec3): void {
  if (st.phase !== 'forging') return;
  st.phase = 'taunting';
  st.remaining = VARKHUL_ENGAGE_TAUNT_SECONDS;
  st.leapFrom = { ...from };
}

export interface VarkhulEngageStep {
  phase: VarkhulEngagePhase;
  /** 0..1 progress through the leap, valid while phase is 'leaping' */
  leapT: number;
  /** true on the single step where the leap completes (snap to the ground) */
  landed: boolean;
}

/** Advance the taunt/leap sequence by one tick. */
export function tickVarkhulEngage(st: VarkhulEngageState, dt: number): VarkhulEngageStep {
  if (st.phase === 'taunting') {
    st.remaining -= dt;
    if (st.remaining > 1e-6) return { phase: 'taunting', leapT: 0, landed: false };
    st.phase = 'leaping';
    st.remaining = VARKHUL_ENGAGE_LEAP_SECONDS;
  }
  if (st.phase === 'leaping') {
    st.remaining -= dt;
    if (st.remaining > 1e-6) {
      return {
        phase: 'leaping',
        leapT: 1 - st.remaining / VARKHUL_ENGAGE_LEAP_SECONDS,
        landed: false,
      };
    }
    st.phase = 'done';
    return { phase: 'done', leapT: 1, landed: true };
  }
  return { phase: st.phase, leapT: st.phase === 'done' ? 1 : 0, landed: false };
}

/** Whether the room's presence actually pulls him off the anvil: someone in
 *  engage range, or any damage already taken. Pure so the encounter's
 *  room-wide auto-target can stay untouched for everything after the pull. */
export function varkhulEngagePulled(
  bossPos: Vec3,
  bossHpFraction: number,
  playerPositions: readonly Vec3[],
): boolean {
  if (bossHpFraction < 1) return true;
  for (const pos of playerPositions) {
    const dx = pos.x - bossPos.x;
    const dz = pos.z - bossPos.z;
    if (dx * dx + dz * dz <= VARKHUL_ENGAGE_RADIUS * VARKHUL_ENGAGE_RADIUS) return true;
  }
  return false;
}

/** Position along the leap: straight XZ with a sine arc above the ground. */
export function varkhulLeapPos(from: Vec3, to: Vec3, groundY: number, t: number): Vec3 {
  const k = Math.min(1, Math.max(0, t));
  return {
    x: from.x + (to.x - from.x) * k,
    y: groundY + Math.sin(Math.PI * k) * VARKHUL_ENGAGE_LEAP_PEAK_Y,
    z: from.z + (to.z - from.z) * k,
  };
}
