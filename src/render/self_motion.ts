// Bounded intent-driven extrapolation of the LOCAL player's pose online: the
// sanctioned display-layer locomotion anticipation (src/net/CLAUDE.md).
//
// The online avatar used to wait a full round trip before moving: intent goes
// to the server, the next 20 Hz tick applies it, and the snapshot comes back.
// This module advances a display-only scratch pose every frame using the SAME
// movement math the server runs (src/sim/player_motion.ts: real speed, slope
// gates, swept static collision, jump/gravity), so starts, stops, and turns
// respond the frame the key changes.
//
// It is a visual layer with three hard safety properties, in order:
//  1. Anchored: the authoritative pose is matched against the closest point in
//     the recent predicted trajectory inside the measured timing window. ACK
//     and snapshot phase variation therefore causes no spatial correction,
//     while off-path disagreement still converges under a capped servo.
//  2. Bounded: the horizontal error from the authoritative pose is leashed to
//     what the player could legitimately cover in the latency cap; a server
//     teleport (or any gap over the renderer's 6 yd snap rule) resets outright.
//     One exception, and only one, the BLOCK EPISODE. A render frame longer
//     than a snapshot interval blocks the main thread, and the snapshots that
//     arrived meanwhile land in one burst. The browser orders that burst
//     either way, and both orderings break the display:
//       - burst applied after the frame: the anchor is frozen inside the frame
//         (alpha caps at 1), so the leash, sized for a fresh anchor, clips the
//         kernel's correct multi-step advance;
//       - burst applied before the frame's step: the anchor is fresh, but
//         ClientWorld has just re-anchored prevPos at the DRAWN pose with pos
//         several ticks ahead, so at alpha ~0 it sits behind the display by
//         more than the budget and the leash clips just the same; the display
//         then stalls while the anchor sweeps under it.
//     Neither is divergence: it is the local block seen from here, and the
//     kernel ran the same movement math the server ran. So an ISOLATED long
//     frame opens an episode where the block is trusted: the servo sits out
//     the burst sweep and the leash lends the lead the kernel took, drained
//     back afterwards. The episode is bounded (BLOCK_EPISODE_MAX_MS) and
//     isolation excludes steady low fps, where every frame is long and nothing
//     is hitching. A NETWORK gap may advance only through the unused portion of
//     the same hard prediction horizon; it freezes once that horizon is spent.
//     An active validated grounded-position stream replaces the spatial servo
//     and leash. The temporal horizon still freezes on a network gap, and a
//     validator reset restores ordinary reconciliation on the next snapshot.
//  3. Invisible to logic: the output feeds only the renderer's
//     selfRenderPosition (mesh + camera). It never writes into ClientWorld
//     mirrored state or IWorld reads. The network layer may send the displayed
//     XZ, but server/movement_position.ts independently bounds speed and sweeps
//     collision before authority may adopt it.
//
// Pure and Node-testable (no Three, no DOM): plain {x,y,z} in and out, like
// facing_smooth.ts / locomotion.ts. tests/self_motion.test.ts drives it
// against a real lagging Sim.
//
// Rifts (issue #3479): predicted like the overworld and regular dungeons. The
// raised-tier lift is stripped/reapplied around each kernel step
// (self_motion_rift_lift.ts, mirroring Sim.updatePlayerMovement's
// riftPlayerLift pair in src/sim/rift/runs.ts) and walls resolve through a
// real riftCollisionToken (src/net/CLAUDE.md has the full wiring). Two rift
// mechanics stay outside local prediction, deliberately: the ice slide is
// server-driven and unmirrored (self.riftSliding suspends prediction the same
// way a ledge climb does, below), and a closed switch-gated portcullis is a
// runtime clamp rather than a static collider, so it is left leash-bounded
// instead of locally resolved. Delves remain excluded (a separate, tracked
// gap: their door/prop state is not mirrored client-side).

import { hasValkyrsCallingFlightAura } from '../sim/combat/paladin_valkyrs_calling_state';
import { isRiftPos } from '../sim/data';
import { moveSpeedMult, type PlayerMotionDeps, stepPlayerMotion } from '../sim/player_motion';
import { DT, type Entity, type MoveInput, RUN_SPEED, type SimEvent } from '../sim/types';
import type { RiftFloorView } from '../world_api/dungeons';
import { createClientPlayerMotionDeps } from './client_player_motion';
import { resolvedRiftFloorPlan, riftLiftFor } from './self_motion_rift_lift';
import {
  boundedReconciliationCorrectionInto,
  createSelfReconciliation,
  createTrajectoryHistory,
  idleReconciliationCorrectionInto,
  reconciliationLeadDiscontinuity,
  recordTrajectoryPoint,
  resetSelfReconciliation,
  resetSelfReconciliationBoundary,
  resetTrajectoryHistory,
  SELF_RECONCILIATION_HISTORY_MAX_AGE_MS,
  SELF_RECONCILIATION_MAX_TIMING_INPUT_MS,
  type TrajectoryResidual,
  trajectoryResidualInto,
} from './self_reconciliation_core';

// Latency cap on the extrapolation window: at least one snapshot-ish interval
// so low-ping links still get the start-of-motion snap, and a hard ceiling so
// a pathological link never runs the visual far ahead of the truth. The
// ceiling must sit ABOVE any RTT the game is meant to feel good at: when the
// real echo exceeds it the display rides the leash boundary permanently and
// every steering input gets radially clamped, a distinct gluey "moving
// through water" feel (observed under netem at ~280ms RTT with a 180 cap).
// Mispredictions stay small regardless: CC gates the predictor off and
// teleports snap, so the cost of a higher ceiling is only a longer correction
// glide in the rare genuine-divergence case.
export const SELF_MOTION_CAP_MIN_MS = 60;
export const SELF_MOTION_CAP_MAX_MS = 1500;
export const SELF_MOTION_BOOTSTRAP_CAP_MS = 1000;
// A blocked main thread cannot refresh the held-input stream. Keep one-frame
// catch-up inside the server's 750 ms stale-input cutoff even when the wider
// network prediction horizon would otherwise permit more display travel.
export const SELF_MOTION_MAIN_THREAD_STALL_MAX_MS = 750;
// The divergence MEASUREMENT is aligned to the true echo, bounded only by
// what the history ring can serve. This is a different bound from the lead
// cap above on purpose: capping the measurement at 180ms on a 280ms link
// compares the anchor against a history sample 100ms too new, a constant
// phantom error that drives the servo continuously; and since the history
// records the already-corrected display, the correction chases its own
// delayed output. With gain x delay > 1 that loop self-oscillates (the
// observed forward/backward pumping under netem). Alignment kills the
// phantom error; the rate bound below keeps the residual loop damped.
export const SELF_MOTION_MEASURE_MAX_MS = SELF_RECONCILIATION_HISTORY_MAX_AGE_MS;
// Pull rate of the divergence correction. The correction compares the
// authoritative pose against WHERE THE LOCAL PREDICTION WAS one latency cap
// ago (a short pose-history ring), so during agreed motion (steady runs,
// starts, stops, jump arcs) the error is ~zero and the rate never shows; it
// only bites on genuine divergence (server-driven charge/knockback, a stun
// landing mid-press, a misprediction), which glides in over ~1/12 s.
export const SELF_MOTION_BLEND_RATE = 12; // 1/s
// Divergence deadband: the wire rounds positions to centimeters and the
// history sampling is frame-quantized; inside this radius the pose is left
// alone so a settled stop never jiggles. Real corrections are far larger.
export const SELF_MOTION_DEADBAND_YD = 0.05;
const LEASH_SLACK_YD = 0.05;
// Same teleport rule the renderer's self smoother uses (6 yd).
export const SELF_MOTION_SNAP_DIST_SQ = 6 * 6;
export const SELF_MOTION_PREDICTOR_VERTICAL_SNAP_YD = 6;
const MAX_PREDICTOR_FRAME_DT = SELF_MOTION_MAIN_THREAD_STALL_MAX_MS / 1000;
// The block episode (see the header): how long a hitch may keep lending leash
// room. It must outlast the browser's post-block catch-up frames with room to
// spare, and it must END, because a real network stall starting right after a
// hitch is indistinguishable from here and must fall back to the leash freeze
// rather than run the display away. 500 ms is the top of the broadcast-gap
// regime the stall arms in tests/self_motion.test.ts pin, so past it the
// network answer is the right one.
export const BLOCK_EPISODE_MAX_MS = 500;
// Settle window after a block, in snapshot intervals: see servoHoldMs below.
const SERVO_SETTLE_INTERVALS = 2;
// The mirror's interval EWMA can arrive degenerate (a fresh or reset
// ClientWorld); floor it the way every other consumer does (online.ts alpha).
const MIN_SNAP_INTERVAL_MS = 20;

// Covers the full measurement horizon at 480 Hz with ring-wrap headroom.
const HISTORY_SIZE = 1024;
const IDLE_WIRE_STABLE_YD = 0.01;
const LEASH_JITTER_HOLD_INTERVALS = 2;
const LEASH_JITTER_DECAY_RATE = 0.5;

export interface SelfMotionFrame {
  /** Gate computed by main.ts: online, not spectating, not frozen/CC'd, not in a delve. */
  enabled: boolean;
  /** This frame's resolved held intent (click-move folded in, jump included). */
  moveInput: MoveInput;
  /** The server is actively validating the streamed grounded display XZ. */
  movementPositionAuthority?: boolean;
  /** The one display heading: mouselook/click-move facing, else the local keyboard turn, else the interpolated server facing. */
  displayFacing: number;
  echoMs: number;
  jitterMs: number;
  /** The frame's snapshot alpha (same value handed to renderer.sync). */
  alpha: number;
  frameDt: number;
  /** Wall-clock ms since the last snapshot was APPLIED to the mirror (0 when none yet). */
  snapAgeMs: number;
  /** The mirror's adaptive inter-snapshot interval in ms (ClientWorld.snapInterval). */
  snapIntervalMs: number;
  /** The active rift floor descriptor (IWorld.riftFloor), or null outside a rift.
   *  Lets the kernel strip/reapply the raised-tier lift the same way the server
   *  does (self_motion_rift_lift.ts), so a platform or ramp never reads as
   *  airborne or fights the servo. */
  riftFloor: RiftFloorView | null;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

/**
 * Whether display-only self prediction is allowed to run for the local player
 * at `posX`. Prediction inside a rift needs the floor descriptor (lift +
 * wall data); a resumed ClientWorld starts with `riftFloor` null since
 * enter/descend/exit are the only ordinary riftState emit sites and a resume
 * replays none of them. `server/game.ts` `resumeSession` re-sends riftState
 * on resume, so this stays defense in depth for whatever window precedes it.
 */
export function selfMotionAllowedAt(posX: number, riftFloor: RiftFloorView | null): boolean {
  return !isRiftPos(posX) || riftFloor !== null;
}

export function hasAuthoritativeSelfPositionDiscontinuity(
  events: readonly SimEvent[],
  playerId: number,
): boolean {
  return events.some(
    (event) =>
      (event.type === 'unstuck' &&
        event.phase === 'completed' &&
        (event.pid === undefined || event.pid === playerId)) ||
      (event.type === 'respawn' && (event.pid === undefined || event.pid === playerId)) ||
      (event.type === 'spellfx' && event.fx === 'blinkStep' && event.sourceId === playerId),
  );
}

export const SELF_RENDER_SMOOTH_RATE = 30;

/**
 * Advance the renderer's non-predictive self pose. A completed authoritative
 * recovery is a semantic discontinuity even when it moves less than the usual
 * six-yard teleport threshold, so it always replaces the prior display pose.
 */
export function updateSelfRenderFallback(
  current: Vec3Like,
  targetX: number,
  targetY: number,
  targetZ: number,
  ready: boolean,
  dt: number,
  smooth: boolean,
  authoritativeDiscontinuity: boolean,
): void {
  const dx = targetX - current.x;
  const dy = targetY - current.y;
  const dz = targetZ - current.z;
  if (
    !smooth ||
    !ready ||
    authoritativeDiscontinuity ||
    dx * dx + dy * dy + dz * dz > SELF_MOTION_SNAP_DIST_SQ
  ) {
    current.x = targetX;
    current.y = targetY;
    current.z = targetZ;
    return;
  }
  const t = 1 - Math.exp(-SELF_RENDER_SMOOTH_RATE * Math.max(0, dt));
  current.x += dx * t;
  current.y += dy * t;
  current.z += dz * t;
}

export class SelfMotionPredictor {
  /**
   * Telemetry: how much latency the extrapolation is currently hiding, in ms
   * (the horizontal display lead over the authoritative anchor, expressed at
   * the player's current run speed). 0 while idle or inactive.
   */
  leadMs = 0;

  /** The kernel's exact physics ground state for the displayed pose; true when
   *  inactive. Replaces the renderer's foot-height airborne heuristic for the
   *  local player while the predictor drives the display. */
  get onGround(): boolean {
    return this.actor?.onGround ?? true;
  }

  private readonly deps: PlayerMotionDeps;
  private actor: Entity | null = null;
  private lastSelfId = -1;
  private lastDead = false;
  private lastGhost = false;
  private wirePositionReady = false;
  private lastWireX = 0;
  private lastWireY = 0;
  private lastWireZ = 0;
  private acc = 0;
  private segmentPrimed = false;
  private timeMs = 0;
  // Long-frame block bookkeeping: the leash room the frozen anchor owes the
  // display, the post-burst settle window the servo sits out, and what is left
  // of the local-block episode a long frame opened (step()).
  private staleAllowanceYd = 0;
  private servoHoldMs = 0;
  private blockEpisodeMs = 0;
  private prevFrameDtMs = 0;
  // Lending capacity earned while the anchor is blocked, in yards of run.
  private episodeCapYd = 0;
  private networkGapWasActive = false;
  private networkGapSettleMs = 0;
  private networkGapAllowanceYd = 0;
  private movementPositionAuthorityWasActive = false;
  private authorityHandoffHoldMs = 0;
  private authorityHandoffAllowanceYd = 0;
  private readonly history = createTrajectoryHistory(HISTORY_SIZE);
  private readonly reconciliation = createSelfReconciliation();
  private readonly residual: TrajectoryResidual = {
    matched: false,
    matchTimeMs: 0,
    x: 0,
    y: 0,
    z: 0,
  };
  private readonly correction: Vec3Like = { x: 0, y: 0, z: 0 };
  private idleMs = 0;
  private lastMoveMask = -1;
  private credibleEchoMs = 0;
  private bootstrapMs = 0;
  private leashJitterMs = 0;
  private leashJitterLowMs = 0;
  private leashJitterReady = false;
  private readonly stepInput: MoveInput = {
    forward: false,
    back: false,
    turnLeft: false,
    turnRight: false,
    strafeLeft: false,
    strafeRight: false,
    jump: false,
    dive: false,
    surface: false,
  };
  private readonly out: Vec3Like = { x: 0, y: 0, z: 0 };

  constructor(seed: number, riftCollisionToken = 0) {
    // The client dep shape: pure static collision (delves are gated off by the
    // enabled flag), aura-only speed (the Fiesta augment is not mirrored; the
    // leash absorbs that bounded divergence), and no-op live-Sim callbacks.
    // riftCollisionToken is IWorld.riftCollisionToken (a fixed per-world value,
    // same as the live Sim closes over its own this.riftCollisionToken): the
    // online client registers the current rift floor's colliders under it
    // (src/net/online.ts applyRiftStateEvent), so a rift wall resolves here the
    // same way it does for the server and for the offline Sim.
    this.deps = createClientPlayerMotionDeps(seed, undefined, riftCollisionToken);
  }

  reset(): void {
    this.actor = null;
    this.acc = 0;
    this.segmentPrimed = false;
    this.wirePositionReady = false;
    resetTrajectoryHistory(this.history);
    resetSelfReconciliation(this.reconciliation);
    this.idleMs = 0;
    this.lastMoveMask = -1;
    this.credibleEchoMs = 0;
    this.bootstrapMs = 0;
    this.leashJitterMs = 0;
    this.leashJitterLowMs = 0;
    this.leashJitterReady = false;
    this.leadMs = 0;
    this.staleAllowanceYd = 0;
    this.servoHoldMs = 0;
    this.blockEpisodeMs = 0;
    this.prevFrameDtMs = 0;
    this.episodeCapYd = 0;
    this.networkGapWasActive = false;
    this.networkGapSettleMs = 0;
    this.networkGapAllowanceYd = 0;
    this.movementPositionAuthorityWasActive = false;
    this.authorityHandoffHoldMs = 0;
    this.authorityHandoffAllowanceYd = 0;
  }

  private recordHistory(x: number, y: number, z: number): void {
    recordTrajectoryPoint(this.history, this.timeMs, x, y, z);
  }

  private primeSegment(actor: Entity, input: MoveInput, displayFacing: number): void {
    actor.prevPos.x = actor.pos.x;
    actor.prevPos.y = actor.pos.y;
    actor.prevPos.z = actor.pos.z;
    actor.facing = displayFacing;
    stepPlayerMotion(this.deps, actor, input);
    this.segmentPrimed = true;
  }

  /**
   * Advance one rendered frame. Returns the display pose, or null when the
   * predictor is disabled (the caller falls back to the plain lead-smoothing
   * path, which shares the same selfRenderPosition so the handoff is seamless).
   */
  step(self: Entity, frame: SelfMotionFrame, authoritativeDiscontinuity = false): Vec3Like | null {
    // Valkyr's Calling is server-driven movement. Let authoritative snapshot
    // interpolation render the full ascent and approach instead of predicting
    // ordinary grounded input over it.
    // The rift ice slide is also server-driven (a scripted glide, not ordinary
    // input): only the boolean rides the wire, never a direction to mirror, so
    // predicting it would invent a heading. Suspend like a ledge climb; the
    // slide's own authoritative interpolation carries the display instead.
    if (!frame.enabled || hasValkyrsCallingFlightAura(self) || self.riftSliding) {
      this.reset();
      return null;
    }
    if (
      !Number.isFinite(frame.frameDt) ||
      !Number.isFinite(frame.echoMs) ||
      !Number.isFinite(frame.jitterMs) ||
      !Number.isFinite(frame.snapIntervalMs) ||
      !Number.isFinite(frame.snapAgeMs) ||
      !Number.isFinite(frame.alpha) ||
      !Number.isFinite(frame.displayFacing) ||
      !Number.isFinite(self.pos.x) ||
      !Number.isFinite(self.pos.y) ||
      !Number.isFinite(self.pos.z) ||
      !Number.isFinite(self.prevPos.x) ||
      !Number.isFinite(self.prevPos.y) ||
      !Number.isFinite(self.prevPos.z)
    ) {
      this.reset();
      return null;
    }
    const dt = clamp(frame.frameDt, 0, MAX_PREDICTOR_FRAME_DT);
    this.timeMs += dt * 1000;
    // The authoritative anchor. Alpha is capped at 1 (unlike the renderer's
    // 1.25 display extrapolation): an extrapolated anchor overshoots every
    // stop and then retreats when the stationary snapshot lands, and that
    // retreat would jiggle the divergence measurement.
    const alpha = clamp(frame.alpha, 0, 1);
    const ax = self.prevPos.x + (self.pos.x - self.prevPos.x) * alpha;
    const ay = self.prevPos.y + (self.pos.y - self.prevPos.y) * alpha;
    const az = self.prevPos.z + (self.pos.z - self.prevPos.z) * alpha;
    // Resolved once and reused for every lift lookup this frame (self_motion_rift_lift.ts);
    // 0 outside a rift for every position, so non-rift prediction is unaffected below.
    const riftPlan = resolvedRiftFloorPlan(frame.riftFloor);
    const riftOrigin = frame.riftFloor?.origin;
    const liftAt = (x: number, z: number): number =>
      riftOrigin ? riftLiftFor(riftPlan, riftOrigin, x, z) : 0;
    const wireDx = self.pos.x - this.lastWireX;
    const wireDy = self.pos.y - this.lastWireY;
    const wireDz = self.pos.z - this.lastWireZ;
    const validatedWireMotion =
      frame.movementPositionAuthority === true &&
      self.onGround &&
      (frame.moveInput.forward ||
        frame.moveInput.back ||
        frame.moveInput.strafeLeft ||
        frame.moveInput.strafeRight ||
        frame.moveInput.dive ||
        frame.moveInput.surface);
    const rawWireDiscontinuity =
      this.wirePositionReady &&
      !validatedWireMotion &&
      wireDx * wireDx + wireDy * wireDy + wireDz * wireDz > SELF_MOTION_SNAP_DIST_SQ;
    this.lastWireX = self.pos.x;
    this.lastWireY = self.pos.y;
    this.lastWireZ = self.pos.z;
    this.wirePositionReady = true;

    // Re-adopt the authoritative pose outright on identity/life-state flips and
    // teleports; otherwise keep the persistent scratch actor.
    const flipped =
      self.id !== this.lastSelfId || self.dead !== this.lastDead || self.ghost !== this.lastGhost;
    this.lastSelfId = self.id;
    this.lastDead = self.dead;
    this.lastGhost = self.ghost;
    let actor = this.actor;
    if (actor && !flipped && !authoritativeDiscontinuity && !rawWireDiscontinuity) {
      const dx = actor.pos.x - ax;
      const dy = actor.pos.y - ay;
      const dz = actor.pos.z - az;
      const maxHorizontalLead =
        (RUN_SPEED * moveSpeedMult(self, 0) * SELF_MOTION_CAP_MAX_MS) / 1000 + LEASH_SLACK_YD;
      if (
        reconciliationLeadDiscontinuity(
          dx,
          dy,
          dz,
          maxHorizontalLead,
          SELF_MOTION_PREDICTOR_VERTICAL_SNAP_YD,
        )
      )
        actor = null;
    } else {
      actor = null;
    }
    const adoptRawWire = authoritativeDiscontinuity || rawWireDiscontinuity;
    if (!actor) {
      const rootX = adoptRawWire ? self.pos.x : ax;
      const rootY = adoptRawWire ? self.pos.y : ay;
      const rootZ = adoptRawWire ? self.pos.z : az;
      actor = {
        ...self,
        pos: { x: rootX, y: rootY, z: rootZ },
        prevPos: { x: rootX, y: rootY, z: rootZ },
        facing: frame.displayFacing,
        vx: 0,
        vy: 0,
        vz: 0,
        onGround: true,
        jumping: false,
        fallStartY: rootY,
        swimStroke: 0,
        swimDiving: false,
      };
      this.actor = actor;
      this.acc = 0;
      this.segmentPrimed = false;
      this.staleAllowanceYd = 0;
      this.servoHoldMs = 0;
      this.blockEpisodeMs = 0;
      this.prevFrameDtMs = 0;
      this.episodeCapYd = 0;
      this.networkGapAllowanceYd = 0;
      this.networkGapWasActive = false;
      this.networkGapSettleMs = 0;
      this.movementPositionAuthorityWasActive = false;
      this.authorityHandoffHoldMs = 0;
      this.authorityHandoffAllowanceYd = 0;
      // The old display trajectory is meaningless relative to the new anchor
      // (teleport / life-state flip); comparing against it would fling the pose.
      resetTrajectoryHistory(this.history);
      resetSelfReconciliation(this.reconciliation);
      this.idleMs = 0;
      this.lastMoveMask = -1;
    }
    if (adoptRawWire) {
      // Do not integrate even one held-input step on the recovery frame. The
      // event's destination is the authoritative visual truth for this frame,
      // and the next frame may resume bounded prediction from this clean root.
      this.out.x = self.pos.x;
      this.out.y = self.pos.y;
      this.out.z = self.pos.z;
      this.recordHistory(self.pos.x, self.pos.y - liftAt(self.pos.x, self.pos.z), self.pos.z);
      this.leadMs = 0;
      return this.out;
    }
    // Borrow the mirrored per-frame state the kernel reads; the pose fields
    // above stay owned by the scratch actor.
    actor.auras = self.auras;
    actor.ghost = self.ghost;
    actor.sitting = self.sitting;
    actor.castingAbility = self.castingAbility;
    actor.maxHp = self.maxHp;
    // Mount speed reads the entity mirror (player_motion.moveSpeedMult), so a
    // mid-session mount/dismount must reach the scratch actor the same frame.
    actor.mountKey = self.mountKey;
    // The kernel roots movement while a mount summon channel is in flight
    // (mountCastRemaining > 0 with a non-empty mountCastKey); borrow both so the
    // online display roots in lockstep with the server. A dismount channel
    // (mountCastKey === '') does not root movement and is move-cancelable.
    actor.mountCastRemaining = self.mountCastRemaining;
    actor.mountCastKey = self.mountCastKey;

    const frameDtMs = dt * 1000;
    if (frame.echoMs > 0) {
      this.credibleEchoMs = frame.echoMs;
      this.bootstrapMs = 0;
    } else if (this.credibleEchoMs <= 0) {
      this.bootstrapMs += frameDtMs;
    }
    const effectiveEchoMs = this.credibleEchoMs;
    const snapIntervalMs = Math.max(MIN_SNAP_INTERVAL_MS, frame.snapIntervalMs);
    const boundedJitterMs = clamp(frame.jitterMs, 0, SELF_RECONCILIATION_MAX_TIMING_INPUT_MS);
    if (!this.leashJitterReady || boundedJitterMs >= this.leashJitterMs) {
      this.leashJitterMs = boundedJitterMs;
      this.leashJitterLowMs = 0;
      this.leashJitterReady = true;
    } else {
      this.leashJitterLowMs += frameDtMs;
      if (this.leashJitterLowMs >= LEASH_JITTER_HOLD_INTERVALS * snapIntervalMs) {
        const decay = 1 - Math.exp(-LEASH_JITTER_DECAY_RATE * dt);
        this.leashJitterMs += (boundedJitterMs - this.leashJitterMs) * decay;
      }
    }
    const staleMs = Math.max(0, Math.max(0, frame.snapAgeMs) - snapIntervalMs);
    const hitchFrame = frameDtMs > snapIntervalMs && this.prevFrameDtMs <= snapIntervalMs;
    this.prevFrameDtMs = frameDtMs;
    if (hitchFrame) {
      this.blockEpisodeMs = BLOCK_EPISODE_MAX_MS;
      this.episodeCapYd = 0;
    } else if (this.blockEpisodeMs > 0)
      this.blockEpisodeMs = staleMs > 0 ? Math.max(0, this.blockEpisodeMs - frameDtMs) : 0;
    const blockedFrame = hitchFrame || this.blockEpisodeMs > 0;
    const networkGapActive = !blockedFrame && staleMs > 0.5 * snapIntervalMs;
    const resumedNetworkGap = this.networkGapWasActive && !networkGapActive;
    this.networkGapWasActive = networkGapActive;
    const bootstrapExpired = effectiveEchoMs <= 0 && this.bootstrapMs > SELF_MOTION_CAP_MAX_MS;
    const capMs = clamp(
      (effectiveEchoMs > 0 ? effectiveEchoMs : SELF_MOTION_BOOTSTRAP_CAP_MS) +
        0.5 * this.leashJitterMs,
      SELF_MOTION_CAP_MIN_MS,
      SELF_MOTION_CAP_MAX_MS,
    );
    const networkGapHeadroomMs = Math.max(0, SELF_MOTION_CAP_MAX_MS - capMs);
    const networkGapAllowanceMs = networkGapActive ? Math.min(staleMs, networkGapHeadroomMs) : 0;
    const networkGapExpired = staleMs > networkGapHeadroomMs;

    // Verticality: strip the raised-tier lift from the WORKING actor before
    // any of this frame's position math runs, exactly like
    // Sim.updatePlayerMovement strips it before the kernel (its
    // riftPlayerLift; src/sim/rift/runs.ts). Both pos and prevPos are
    // stripped by their OWN current x/z, since they can already sit at
    // different points along a ramp. Zero outside a rift, so non-rift
    // prediction is unaffected. Unlike the server, this frame does more than
    // one kernel step's worth of position math after the strip (the DT loop,
    // then the divergence servo, then the horizontal leash can all move x/z
    // further), so the reapply below waits until ALL of it is done and reads
    // the FINAL x/z, rather than re-deriving the lift once per kernel step
    // the way an early version of this fix did: that left the servo blend
    // and the leash clamp free to shift x/z out from under an already-baked
    // Y on a ramp, since neither recomputed the lift for where they moved
    // the body to. Working in flat-baseline space end to end removes the
    // possibility rather than chasing each mutation site for it: a
    // position-independent Y cannot desync from a position that moves.
    actor.pos.y -= liftAt(actor.pos.x, actor.pos.z);
    actor.prevPos.y -= liftAt(actor.prevPos.x, actor.prevPos.z);

    // Fixed-step advance with the held intent. Turn flags are stripped: the
    // heading is assigned from the one display source each step, and letting
    // the kernel integrate tl/tr on top would double the turn.
    const inp = this.stepInput;
    inp.forward = frame.moveInput.forward;
    inp.back = frame.moveInput.back;
    inp.strafeLeft = frame.moveInput.strafeLeft;
    inp.strafeRight = frame.moveInput.strafeRight;
    inp.jump = frame.moveInput.jump;
    // The vertical half of swimming is held intent too, and predicting it is
    // what makes a camera-steered dive answer the mouse instead of the round
    // trip: without these the depth column only ever moved on the server's
    // echo, so aiming the view down felt like a request rather than a control.
    // The kernel branch is the same one the server runs (swimVerticalPass), and
    // it is inert unless the body is actually in water.
    inp.dive = frame.moveInput.dive;
    inp.surface = frame.moveInput.surface;
    inp.swimSteer = frame.moveInput.swimSteer;
    const moveMask =
      (inp.forward ? 1 : 0) |
      (inp.back ? 2 : 0) |
      (inp.strafeLeft ? 4 : 0) |
      (inp.strafeRight ? 8 : 0) |
      (inp.dive ? 16 : 0) |
      (inp.surface ? 32 : 0);
    if (this.lastMoveMask >= 0 && moveMask !== this.lastMoveMask) {
      const transitionX = this.out.x;
      const transitionY = this.out.y - liftAt(this.out.x, this.out.z);
      const transitionZ = this.out.z;
      actor.pos.x = transitionX;
      actor.pos.y = transitionY;
      actor.pos.z = transitionZ;
      actor.prevPos.x = transitionX;
      actor.prevPos.y = transitionY;
      actor.prevPos.z = transitionZ;
      this.acc = 0;
      this.segmentPrimed = false;
    }
    this.lastMoveMask = moveMask;
    const translationalInput = moveMask !== 0;
    const validatedGroundAuthority =
      frame.movementPositionAuthority === true && translationalInput && actor.onGround;
    const authorityLostDuringGroundMove =
      this.movementPositionAuthorityWasActive &&
      frame.movementPositionAuthority !== true &&
      translationalInput &&
      actor.onGround;
    this.movementPositionAuthorityWasActive = frame.movementPositionAuthority === true;
    if (validatedGroundAuthority) {
      this.authorityHandoffHoldMs = 0;
      this.authorityHandoffAllowanceYd = 0;
    }
    // A blocked step needs NO special handling, and must never get any. The
    // kernel runs the same swept static collision as the server, so when the
    // display stops at a wall it is already RIGHT and the authoritative anchor
    // is merely one echo behind, still mid-approach. Both converge on the wall
    // face on their own, and the divergence measurement below sees ~zero error
    // throughout (it compares the anchor against the display one echo ago, and
    // the display stopped one echo ago too). Detecting the block and stripping
    // the forward lead against the anchor instead yanks the avatar backward by
    // RUN_SPEED x echo in a SINGLE frame (a yard at 200ms, unsmoothed, because
    // the renderer follows this pose exactly), and then walks it back into the
    // wall: the "collide and snap back" artifact. Leave the block alone.
    const canAdvance = (!networkGapExpired || blockedFrame) && !bootstrapExpired;
    if (canAdvance) {
      // actor.pos.y is flat-baseline here (stripped above): the kernel's
      // gravity/onGround pass integrates against the true flat rift floor,
      // same as outside a rift, and needs no rift-specific handling at all.
      if (!this.segmentPrimed) this.primeSegment(actor, inp, frame.displayFacing);
      this.acc += dt;
      while (this.acc >= DT) {
        this.acc -= DT;
        this.primeSegment(actor, inp, frame.displayFacing);
      }
    }
    const frac = this.segmentPrimed ? this.acc / DT : 0;

    const runSpeed = RUN_SPEED * moveSpeedMult(actor, 0);
    if (authorityLostDuringGroundMove) {
      resetTrajectoryHistory(this.history);
      resetSelfReconciliation(this.reconciliation);
      const handoffX = actor.prevPos.x + (actor.pos.x - actor.prevPos.x) * frac;
      const handoffY = actor.prevPos.y + (actor.pos.y - actor.prevPos.y) * frac;
      const handoffZ = actor.prevPos.z + (actor.pos.z - actor.prevPos.z) * frac;
      this.recordHistory(handoffX, handoffY, handoffZ);
      this.authorityHandoffHoldMs = capMs + snapIntervalMs;
      const handoffLead = Math.hypot(actor.pos.x - ax, actor.pos.z - az);
      const handoffBaseBudget = (runSpeed * capMs) / 1000 + LEASH_SLACK_YD;
      this.authorityHandoffAllowanceYd = Math.max(
        this.authorityHandoffAllowanceYd,
        handoffLead - handoffBaseBudget,
      );
    } else {
      this.authorityHandoffHoldMs = Math.max(0, this.authorityHandoffHoldMs - frameDtMs);
    }
    // The local block episode (rationale: the header's Bounded exception).
    // An ISOLATED long frame is the trigger, staleness not required: in the
    // deliver-before ordering there is no staleness to see. Isolation is what
    // keeps steady low fps out, where nothing is hitching and the servo must
    // keep correcting every frame.
    if (blockedFrame) {
      // Two snapshot intervals, counted down only once the snapshots flow
      // again: one for the burst sweep itself, and one more because the sweep
      // starts from the DRAWN pose (ClientWorld re-anchors prevPos there), so
      // the first anchor the servo can trust as an independent reading is one
      // interval past the sweep. Resuming inside that window reads the sweep
      // as divergence, which is the rush half of the original artifact.
      this.servoHoldMs = Math.max(this.servoHoldMs, SERVO_SETTLE_INTERVALS * snapIntervalMs);
    } else {
      this.servoHoldMs = Math.max(0, this.servoHoldMs - frameDtMs);
    }
    if (resumedNetworkGap) {
      this.servoHoldMs = SERVO_SETTLE_INTERVALS * snapIntervalMs;
      this.networkGapSettleMs = SERVO_SETTLE_INTERVALS * snapIntervalMs;
    } else if (!networkGapActive) {
      this.networkGapSettleMs = Math.max(0, this.networkGapSettleMs - frameDtMs);
    }
    // A stale anchor the display has already been lent room against is not a
    // reference: correcting toward it would drag the pose off the position the
    // block's own kernel steps put it at (and the next burst confirms), then
    // make it rush back. Freeze instead, which is the plain leash behavior.
    // Two intervals, not one: at 60 fps the newest snapshot routinely ages a
    // frame past the interval, and treating that phase noise as a frozen
    // anchor would suspend the servo for as long as any loan is outstanding.
    const staleWithLoan = staleMs > snapIntervalMs && this.staleAllowanceYd > 0;
    // The settle window belongs to the burst that ends the block, so hold it
    // full while the anchor is frozen: draining it during the freeze would
    // leave the servo facing the resume sweep with no cover, reading it as
    // divergence and hauling the display back off the pose the burst is about
    // to confirm.
    if (staleWithLoan) this.servoHoldMs = SERVO_SETTLE_INTERVALS * snapIntervalMs;
    const servoActive =
      (effectiveEchoMs > 0 || !translationalInput) &&
      !networkGapActive &&
      !blockedFrame &&
      !staleWithLoan &&
      this.authorityHandoffHoldMs <= 0 &&
      this.servoHoldMs <= 0;
    if (!servoActive) resetSelfReconciliationBoundary(this.reconciliation);

    // Echo is the expected trajectory age. Jitter widens the eligible timing
    // window around it, but never shifts its center.
    const measureMs = clamp(effectiveEchoMs, 0, SELF_MOTION_MEASURE_MAX_MS);
    trajectoryResidualInto(
      this.reconciliation,
      this.history,
      this.timeMs,
      effectiveEchoMs > 0 ? effectiveEchoMs : SELF_MOTION_BOOTSTRAP_CAP_MS,
      frame.jitterMs,
      snapIntervalMs,
      ax,
      ay - liftAt(ax, az),
      az,
      SELF_MOTION_DEADBAND_YD,
      this.residual,
    );

    this.idleMs = translationalInput || !actor.onGround ? 0 : this.idleMs + frameDtMs;
    const idleConfirmMs = Math.min(
      SELF_MOTION_MEASURE_MAX_MS,
      Math.max(0, effectiveEchoMs) +
        Math.min(SELF_RECONCILIATION_MAX_TIMING_INPUT_MS, Math.max(0, frame.jitterMs)) +
        Math.min(SELF_RECONCILIATION_MAX_TIMING_INPUT_MS, snapIntervalMs),
    );
    const wireStable =
      Math.hypot(
        self.pos.x - self.prevPos.x,
        self.pos.y - self.prevPos.y,
        self.pos.z - self.prevPos.z,
      ) <= IDLE_WIRE_STABLE_YD;

    if (servoActive) {
      let exactIdleAdopt = false;
      if (this.idleMs >= idleConfirmMs && wireStable) {
        exactIdleAdopt = idleReconciliationCorrectionInto(
          self.pos.x - actor.pos.x,
          self.pos.y - liftAt(self.pos.x, self.pos.z) - actor.pos.y,
          self.pos.z - actor.pos.z,
          SELF_MOTION_BLEND_RATE,
          0,
          runSpeed,
          dt,
          this.correction,
        );
      } else if ((translationalInput || !actor.onGround) && !validatedGroundAuthority) {
        boundedReconciliationCorrectionInto(
          this.residual.x,
          this.residual.y,
          this.residual.z,
          SELF_MOTION_DEADBAND_YD,
          SELF_MOTION_BLEND_RATE,
          measureMs,
          runSpeed,
          dt,
          this.correction,
        );
      } else {
        this.correction.x = 0;
        this.correction.y = 0;
        this.correction.z = 0;
      }
      if (translationalInput) {
        const predictedX = actor.prevPos.x + (actor.pos.x - actor.prevPos.x) * frac;
        const predictedZ = actor.prevPos.z + (actor.pos.z - actor.prevPos.z) * frac;
        const motionX = predictedX - this.out.x;
        const motionZ = predictedZ - this.out.z;
        const motionLength = Math.hypot(motionX, motionZ);
        if (motionLength > 1e-9) {
          const correctionAlongMotion =
            (this.correction.x * motionX + this.correction.z * motionZ) / motionLength;
          if (correctionAlongMotion < -motionLength) {
            const adjustment = -motionLength - correctionAlongMotion;
            this.correction.x += (motionX / motionLength) * adjustment;
            this.correction.z += (motionZ / motionLength) * adjustment;
          }
        } else {
          this.correction.x = 0;
          this.correction.z = 0;
        }
      }
      actor.pos.x += this.correction.x;
      actor.pos.y += this.correction.y;
      actor.pos.z += this.correction.z;
      actor.prevPos.x += this.correction.x;
      actor.prevPos.y += this.correction.y;
      actor.prevPos.z += this.correction.z;
      if (exactIdleAdopt) {
        actor.pos.x = self.pos.x;
        actor.pos.y = self.pos.y - liftAt(self.pos.x, self.pos.z);
        actor.pos.z = self.pos.z;
        actor.prevPos.x = self.pos.x;
        actor.prevPos.y = self.pos.y - liftAt(self.pos.x, self.pos.z);
        actor.prevPos.z = self.pos.z;
      }
    }

    // Horizontal leash: outside an active validated grounded stream, never
    // show the player farther from the authoritative anchor than they could
    // legitimately RUN inside the latency cap (the
    // kernel itself moves slower while backpedaling/swimming, so the run
    // budget is the honest upper bound; only corrections consume the slack).
    // Vertical is exempt (a jump apex must not be leash-clipped; gravity
    // bounds it).
    const baseBudget = (runSpeed * capMs) / 1000 + LEASH_SLACK_YD;
    const ex = actor.pos.x - ax;
    const ez = actor.pos.z - az;
    const elen = Math.hypot(ex, ez);
    if (networkGapAllowanceMs > 0 || this.networkGapSettleMs > 0) {
      this.networkGapAllowanceYd = Math.min(
        (runSpeed * networkGapHeadroomMs) / 1000,
        Math.max(
          this.networkGapAllowanceYd,
          (runSpeed * networkGapAllowanceMs) / 1000,
          elen - baseBudget,
        ),
      );
    } else if (!blockedFrame && this.servoHoldMs <= 0) {
      this.networkGapAllowanceYd = Math.max(
        0,
        Math.min(
          this.networkGapAllowanceYd,
          Math.max(elen - baseBudget, this.networkGapAllowanceYd - runSpeed * dt),
        ),
      );
    }
    if (this.authorityHandoffHoldMs > 0) {
      this.authorityHandoffAllowanceYd = Math.max(
        this.authorityHandoffAllowanceYd,
        elen - baseBudget - this.networkGapAllowanceYd - this.staleAllowanceYd,
      );
    } else if (!blockedFrame && this.servoHoldMs <= 0) {
      this.authorityHandoffAllowanceYd = Math.max(
        0,
        Math.min(
          this.authorityHandoffAllowanceYd,
          Math.max(
            elen - baseBudget - this.networkGapAllowanceYd - this.staleAllowanceYd,
            this.authorityHandoffAllowanceYd - runSpeed * dt,
          ),
        ),
      );
    }
    if (blockedFrame) {
      // Lend at RUN SPEED IN WALL CLOCK, and only what THIS episode has
      // earned. Wall clock rather than a tick per frame because the fixed-step
      // accumulator lands a whole 50 ms step inside a 10 ms catch-up frame and
      // clipping THAT is the stall again. Per episode rather than cumulative
      // because otherwise a machine hitching every few frames ratchets the
      // boundary outward at every hitch and, against a server that never
      // confirms the motion, walks the display to the 6 yd re-adopt.
      this.episodeCapYd += runSpeed * dt;
      this.staleAllowanceYd = Math.max(
        this.staleAllowanceYd,
        Math.min(elen - baseBudget, this.episodeCapYd),
      );
    } else {
      // The allowance drains at run speed once the snapshots flow again, but
      // never below the lead currently in use: draining THROUGH the live lead
      // would clamp the display back at run speed, the same stall this fix
      // removes, one beat later. Shrinking the lead is the servo's job, and
      // the allowance follows it down (it only ever grows while blocked).
      this.staleAllowanceYd = Math.max(
        0,
        Math.min(
          this.staleAllowanceYd,
          Math.max(elen - baseBudget, this.staleAllowanceYd - runSpeed * dt),
        ),
      );
    }
    const budget =
      baseBudget +
      this.networkGapAllowanceYd +
      this.staleAllowanceYd +
      this.authorityHandoffAllowanceYd;
    if (elen > budget && !validatedGroundAuthority) {
      // Clamp pos ONLY (unlike the correction blend above): prevPos keeps the
      // last displayed point, so the sub-frame interpolation glides onto the
      // boundary instead of stepping back. When the RTT exceeds the lead cap
      // the display rides this boundary permanently, and shifting prevPos too
      // turned each 20Hz kernel step into a visible forward/back sawtooth.
      actor.pos.x = ax + (ex * budget) / elen;
      actor.pos.z = az + (ez * budget) / elen;
    }

    // Reapply the lift now that every mutation of x/z for this frame is
    // done (the DT loop, the divergence servo, the leash clamp): each of
    // pos and prevPos by its OWN final x/z, converting the working actor
    // back to the same visual/lifted space `self`'s own pos/prevPos are in,
    // which is what `this.actor` must stay in between calls (the entry
    // snap-reset check above compares it against the lifted anchor).
    const outFlatY = actor.prevPos.y + (actor.pos.y - actor.prevPos.y) * frac;
    actor.pos.y += liftAt(actor.pos.x, actor.pos.z);
    actor.prevPos.y += liftAt(actor.prevPos.x, actor.prevPos.z);

    this.out.x = actor.prevPos.x + (actor.pos.x - actor.prevPos.x) * frac;
    this.out.y = actor.prevPos.y + (actor.pos.y - actor.prevPos.y) * frac;
    this.out.z = actor.prevPos.z + (actor.pos.z - actor.prevPos.z) * frac;
    this.recordHistory(this.out.x, outFlatY, this.out.z);
    this.leadMs =
      runSpeed > 0 ? (Math.hypot(this.out.x - ax, this.out.z - az) / runSpeed) * 1000 : 0;
    return this.out;
  }
}
