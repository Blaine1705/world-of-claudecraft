import { describe, expect, it } from 'vitest';
import {
  applyMovementPositionSample,
  type MovementPositionSession,
} from '../server/movement_position';
import { type MovementStopTarget, resolveMovementStop } from '../server/movement_stop';
import {
  hasAuthoritativeSelfPositionDiscontinuity,
  SELF_MOTION_CAP_MAX_MS,
  SELF_MOTION_CAP_MIN_MS,
  SELF_MOTION_MAIN_THREAD_STALL_MAX_MS,
  SELF_MOTION_SNAP_DIST_SQ,
  type SelfMotionFrame,
  SelfMotionPredictor,
  updateSelfRenderFallback,
  type Vec3Like,
} from '../src/render/self_motion';
<<<<<<< HEAD
import { DUNGEON_FLOOR_Y } from '../src/sim/data';
import { generateRiftFloor, riftLiftAt } from '../src/sim/rift/rift_gen';
=======
import { hasTranslationalMoveInput } from '../src/sim/move_input';
>>>>>>> origin/pr/3631
import { Sim } from '../src/sim/sim';
import { DT, type Entity, type MoveInput, RUN_SPEED, type SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';
import { EMPTY_TEST_WORLD } from './sim_shared';

// Policy tests for the online display-only self extrapolator, driven against a
// REAL lagging authority: a live Sim plays the server (inputs arrive lagMs
// late, snapshots leave after each 20 Hz tick) and the predictor renders 60 fps
// frames against the mirrored self entity, exactly like main.ts online.

const SEED = 42;
const FRAME_MS = 1000 / 60;
const SNAP_MS = 50;

const mi = (over: Partial<MoveInput> = {}): MoveInput => ({
  forward: false,
  back: false,
  turnLeft: false,
  turnRight: false,
  strafeLeft: false,
  strafeRight: false,
  jump: false,
  dive: false,
  surface: false,
  ...over,
});

function teleport(sim: Sim, x: number, z: number): void {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
  p.fallStartY = p.pos.y;
  p.onGround = true;
  p.vx = 0;
  p.vz = 0;
  p.vy = 0;
}

interface FrameResult {
  pose: { x: number; y: number; z: number } | null;
  a: { x: number; y: number; z: number };
  /** The leash's own anchor: alpha clamped at 1, exactly as the predictor
   *  computes it internally, so stall containment is measured against the
   *  same point the clamp enforces. */
  ac: { x: number; y: number; z: number };
  /** True when this frame delivered a snapshot to the mirror. */
  delivered: boolean;
}

// The lagging-authority lab: server Sim + mirrored self + predictor.
class Lab {
  readonly srv: Sim;
  readonly self: Entity;
  readonly predictor: SelfMotionPredictor;
  private nowMs = 0;
  private lastSnapMs = 0;
  private sinceTickMs = 0;
  private localInput = mi();
  private inputLog: { atMs: number; input: MoveInput; stop: MovementStopTarget | null }[] = [];
  private processedInputEvents = 0;
  private pendingServerStop: MovementStopTarget | null = null;
  private lastDisplay: { x: number; z: number } | null = null;
  private readonly positionAuthority: boolean;
  private positionAuthoritySignal: boolean | null = null;
  private readonly positionSession: MovementPositionSession;
  private readonly positionLog: {
    atMs: number;
    input: MoveInput;
    x: number;
    z: number;
  }[] = [];
  private processedPositionEvents = 0;
  private nextPositionSendMs = SNAP_MS;
  enabled = true;
  jitterMs = 0;
  echoMs: number;
  // Scripted broadcast stall: while positive, tick boundaries still advance
  // the server (it never stops simulating) but the mirror and lastSnapMs are
  // suppressed, so the client renders against a frozen snapshot exactly like
  // a real broadcast gap. Skipping n deliveries makes the wall-clock gap
  // between the last delivery and the resume delivery n plus 1 intervals.
  skipDeliveries = 0;

  // Snapshots produced during a frame, held back until the frame's tail: a
  // long render frame blocks the main thread, so the socket is only drained
  // AFTER the frame the messages arrived in (see the long-frame lane below).
  private pending: { x: number; y: number; z: number }[] = [];
  private readonly deliverAfter: boolean;
  private readonly deliveryMs: number;
  private readonly serverDeaf: boolean;
  private readonly serverMotionScale: number;
  /** While true the frame tail keeps the queue: a scripted delivery burst. */
  holdSnapshots = false;

  constructor(
    readonly lagMs: number,
    readonly frameMs = FRAME_MS,
    opts: {
      start?: { x: number; z: number };
      facing?: number;
      /** Drain the socket in the frame's TAIL instead of before the step. */
      deliverAfter?: boolean;
      /** Wall-clock spacing of deliveries, which is what the mirror's EWMA
       *  measures. Above the 50 ms tick cadence it models a coalescing link:
       *  the server still ticks at 20 Hz, the snapshots arrive in pairs. */
      deliveryMs?: number;
      /** The server never receives the local intent: worst-case divergence,
       *  the display predicting a run the authority never performs. */
      serverDeaf?: boolean;
      serverMotionScale?: number;
      positionAuthority?: boolean;
    } = {},
  ) {
    this.echoMs = lagMs;
    this.deliverAfter = opts.deliverAfter ?? false;
    this.deliveryMs = opts.deliveryMs ?? SNAP_MS;
    this.serverDeaf = opts.serverDeaf ?? false;
    this.serverMotionScale = opts.serverMotionScale ?? 1;
    this.positionAuthority = opts.positionAuthority ?? false;
    this.srv = new Sim({
      seed: SEED,
      playerClass: 'warrior',
      autoEquip: true,
      world: EMPTY_TEST_WORLD,
    });
    // Same fixed-per-world token the live Sim closes over for its own movement
    // (Sim.riftCollisionToken); real only once a scenario calls srv.enterRift.
    this.predictor = new SelfMotionPredictor(SEED, this.srv.riftCollisionToken);
    this.srv.setPlayerLevel(60);
    // Default start re-pinned 2026-08 for the Eastbrook harbor move
    // (d19aa33f76, docs/design/eastbrook-revamp/site-plan.md): (0,-80) now
    // sits inside the relocated chapel's footprint, whose collider mangles
    // every default-start run. Use the collider-free open-field lane this
    // file already documents for the stall labs, so the default and explicit
    // lanes stay identical.
    const start = opts.start ?? { x: 0, z: -1000 };
    teleport(this.srv, start.x, start.z);
    this.facing = opts.facing ?? 0;
    this.srv.player.facing = this.facing; // run straight north (+z) by default
    const p = this.srv.player;
    this.self = { ...p, pos: { ...p.pos }, prevPos: { ...p.prevPos } };
    this.positionSession = { pid: p.id, movementPositionState: null };
    this.inputLog.push({ atMs: 0, input: mi(), stop: null });
    this.positionLog.push({ atMs: 0, input: mi(), x: p.pos.x, z: p.pos.z });
  }

  readonly facing: number;

  setInput(input: MoveInput): void {
    const stopped = hasTranslationalMoveInput(this.localInput) && !hasTranslationalMoveInput(input);
    this.localInput = input;
    this.inputLog.push({
      atMs: this.nowMs,
      input,
      stop: stopped && this.lastDisplay ? { ...this.lastDisplay } : null,
    });
  }

  setPositionAuthoritySignal(active: boolean): void {
    this.positionAuthoritySignal = active;
  }

  movementPositionAuthorityActive(): boolean {
    return this.positionSession.movementPositionState?.authorityActive === true;
  }

  shiftServerPosition(z: number): void {
    this.srv.player.pos.z += z;
    this.srv.player.prevPos.z += z;
  }

  private applyServerInputAt(tMs: number): void {
    const meta = this.srv.players.get(this.srv.player.id);
    if (!meta) throw new Error('missing player meta');
    if (this.serverDeaf) {
      Object.assign(meta.moveInput, this.inputLog[0].input);
      return;
    }
    while (
      this.processedInputEvents < this.inputLog.length &&
      this.inputLog[this.processedInputEvents].atMs + this.lagMs <= tMs
    ) {
      const event = this.inputLog[this.processedInputEvents++];
      if (event.stop && hasTranslationalMoveInput(meta.moveInput)) {
        const resolution = resolveMovementStop(
          event.stop,
          this.srv.player.prevPos,
          this.srv.player.pos,
        );
        if (resolution.kind === 'reached') {
          this.srv.player.pos.x = resolution.x;
          this.srv.player.pos.y = resolution.y;
          this.srv.player.pos.z = resolution.z;
          Object.assign(meta.moveInput, event.input);
          this.pendingServerStop = null;
        } else if (resolution.kind === 'pending') {
          this.pendingServerStop = event.stop;
        } else {
          Object.assign(meta.moveInput, event.input);
          this.pendingServerStop = null;
        }
      } else if (!(this.pendingServerStop && !hasTranslationalMoveInput(event.input))) {
        this.pendingServerStop = null;
        Object.assign(meta.moveInput, event.input);
      }
    }
  }

  private sendPositionSamples(): void {
    if (!this.positionAuthority || !this.lastDisplay) return;
    while (this.nextPositionSendMs <= this.nowMs) {
      this.positionLog.push({
        atMs: this.nextPositionSendMs,
        input: { ...this.localInput },
        x: this.lastDisplay.x,
        z: this.lastDisplay.z,
      });
      this.nextPositionSendMs += SNAP_MS;
    }
  }

  private applyServerPositionsAt(tMs: number): void {
    if (!this.positionAuthority) return;
    while (
      this.processedPositionEvents < this.positionLog.length &&
      this.positionLog[this.processedPositionEvents].atMs + this.lagMs <= tMs
    ) {
      const event = this.positionLog[this.processedPositionEvents++];
      applyMovementPositionSample(
        this.srv,
        this.positionSession,
        { x: event.x, z: event.z },
        event.atMs,
        event.input,
      );
    }
  }

  /** `drainFirst` models the other browser ordering: the socket is drained
   *  just BEFORE the rAF callback, so the long frame's step already sees the
   *  burst (fresh anchor, prevPos re-anchored at the drawn pose). */
  frame(frameMsOverride?: number, drainFirst = false): FrameResult {
    const frameMs = frameMsOverride ?? this.frameMs;
    this.nowMs += frameMs;
    this.sendPositionSamples();
    this.sinceTickMs += frameMs;
    let delivered = false;
    while (this.sinceTickMs >= SNAP_MS) {
      this.sinceTickMs -= SNAP_MS;
      const meta = this.srv.players.get(this.srv.player.id);
      if (!meta) throw new Error('missing player meta');
      this.applyServerPositionsAt(this.nowMs);
      this.applyServerInputAt(this.nowMs);
      const before = { ...this.srv.player.pos };
      const beforeX = this.srv.player.pos.x;
      const beforeZ = this.srv.player.pos.z;
      this.srv.tick();
      if (this.serverMotionScale !== 1) {
        this.srv.player.pos.x =
          beforeX + (this.srv.player.pos.x - beforeX) * this.serverMotionScale;
        this.srv.player.pos.z =
          beforeZ + (this.srv.player.pos.z - beforeZ) * this.serverMotionScale;
        this.srv.player.pos.y = terrainHeight(
          this.srv.player.pos.x,
          this.srv.player.pos.z,
          this.srv.cfg.seed,
        );
      }
      if (this.pendingServerStop) {
        const resolution = resolveMovementStop(this.pendingServerStop, before, this.srv.player.pos);
        if (resolution.kind !== 'pending') {
          if (resolution.kind === 'reached') {
            this.srv.player.pos.x = resolution.x;
            this.srv.player.pos.y = resolution.y;
            this.srv.player.pos.z = resolution.z;
          }
          Object.assign(meta.moveInput, mi());
          this.pendingServerStop = null;
        }
      }
      if (this.skipDeliveries > 0) {
        this.skipDeliveries--;
        continue;
      }
      if (this.deliverAfter) {
        this.pending.push({ ...this.srv.player.pos });
        continue;
      }
      // the 20 Hz snapshot: prev pose = last wire pose, pose = fresh server pose
      this.self.prevPos = { ...this.self.pos };
      this.self.pos = { ...this.srv.player.pos };
      this.self.dead = this.srv.player.dead;
      this.self.ghost = this.srv.player.ghost;
      this.lastSnapMs = this.nowMs;
      delivered = true;
    }
    // At the default cadence every produced tick is delivered as it appears;
    // a coalescing link (deliveryMs above the tick spacing) holds them back.
    const dueForDelivery =
      this.deliveryMs <= SNAP_MS || this.nowMs - this.lastSnapMs >= this.deliveryMs;
    if (drainFirst && this.pending.length > 0 && !this.holdSnapshots && dueForDelivery) {
      this.drainPending();
      delivered = true;
    }
    const alpha = Math.min(1.25, (this.nowMs - this.lastSnapMs) / this.deliveryMs);
    const frame: SelfMotionFrame = {
      enabled: this.enabled,
      moveInput: this.localInput,
      movementPositionAuthority:
        this.positionAuthoritySignal ??
        (this.positionAuthority &&
          this.positionSession.movementPositionState?.authorityActive === true),
      displayFacing: this.facing,
      echoMs: this.echoMs,
      jitterMs: this.jitterMs,
      alpha,
      frameDt: frameMs / 1000,
      snapAgeMs: this.lastSnapMs > 0 ? this.nowMs - this.lastSnapMs : 0,
      snapIntervalMs: this.deliveryMs,
      // Read fresh every frame, exactly like main.ts reads net.riftFloor: null
      // outside a rift, the live descriptor once a rift scenario calls
      // srv.enterRift (see the "rift prediction" describe block below).
      riftFloor: this.srv.riftFloor,
    };
    const out = this.predictor.step(this.self, frame);
    if (out) this.lastDisplay = { x: out.x, z: out.z };
    const a = {
      x: this.self.prevPos.x + (this.self.pos.x - this.self.prevPos.x) * alpha,
      y: this.self.prevPos.y + (this.self.pos.y - this.self.prevPos.y) * alpha,
      z: this.self.prevPos.z + (this.self.pos.z - this.self.prevPos.z) * alpha,
    };
    const leashAlpha = Math.min(1, alpha);
    const ac = {
      x: this.self.prevPos.x + (this.self.pos.x - this.self.prevPos.x) * leashAlpha,
      y: this.self.prevPos.y + (this.self.pos.y - this.self.prevPos.y) * leashAlpha,
      z: this.self.prevPos.z + (this.self.pos.z - this.self.prevPos.z) * leashAlpha,
    };
    if (this.pending.length > 0 && !this.holdSnapshots && dueForDelivery) {
      this.drainPending();
      delivered = true;
    }
    return { pose: out ? { ...out } : null, a, ac, delivered };
  }

  // ClientWorld.applyWire re-anchors prevPos at the pose the renderer last
  // DREW (contAlpha, capped 1.25), not at the previous server pose, so a burst
  // of queued snapshots leaves prevPos at the drawn pose and pos at the newest
  // tick: the anchor then sweeps several ticks over one snapshot interval.
  private drainPending(): void {
    for (const pos of this.pending) {
      const contAlpha =
        this.lastSnapMs > 0 ? Math.min(1.25, (this.nowMs - this.lastSnapMs) / this.deliveryMs) : 1;
      this.self.prevPos = {
        x: this.self.prevPos.x + (this.self.pos.x - this.self.prevPos.x) * contAlpha,
        y: this.self.prevPos.y + (this.self.pos.y - this.self.prevPos.y) * contAlpha,
        z: this.self.prevPos.z + (this.self.pos.z - this.self.prevPos.z) * contAlpha,
      };
      this.self.pos = { ...pos };
      this.self.dead = this.srv.player.dead;
      this.self.ghost = this.srv.player.ghost;
      this.lastSnapMs = this.nowMs;
    }
    this.pending = [];
  }

  budget(): number {
    const cap = Math.min(
      SELF_MOTION_CAP_MAX_MS,
      Math.max(SELF_MOTION_CAP_MIN_MS, this.lagMs + 0.5 * this.jitterMs),
    );
    return (RUN_SPEED * cap) / 1000 + 0.05;
  }
}

describe('SelfMotionPredictor', () => {
  it.each([
    { echoMs: 50, jitterMs: [20, 50], cycles: 4 },
    { echoMs: 170, jitterMs: [5, 120], cycles: 4 },
    { echoMs: 1000, jitterMs: [120], cycles: 1 },
  ])(
    'does not reconcile timing phase into motion at $echoMs ms echo and $jitterMs ms jitter',
    ({ echoMs, jitterMs, cycles }) => {
      const lab = new Lab(echoMs, FRAME_MS, { start: { x: 0, z: -1000 } });
      const next = (): FrameResult => {
        lab.jitterMs = jitterMs[Math.floor(performanceCounter / 3) % jitterMs.length];
        performanceCounter++;
        return lab.frame();
      };
      let performanceCounter = 0;
      for (let i = 0; i < 30; i++) next();

      let maxSpeed = 0;
      let wrongWay = 0;
      let postStopDrift = 0;
      let previous = next().pose;
      if (!previous) throw new Error('predictor disabled unexpectedly');

      const drive = (input: MoveInput, direction: 1 | -1): void => {
        lab.setInput(input);
        for (let i = 0; i < 24; i++) {
          const pose = next().pose;
          if (!pose || !previous) throw new Error('predictor disabled unexpectedly');
          const dz = pose.z - previous.z;
          maxSpeed = Math.max(maxSpeed, Math.abs(dz) / (FRAME_MS / 1000));
          wrongWay = Math.max(wrongWay, -direction * dz);
          previous = pose;
        }
      };
      const stop = (label: string): void => {
        lab.setInput(mi());
        const moving = previous;
        const stopped = next().pose;
        if (!stopped || !moving) throw new Error('predictor disabled unexpectedly');
        expect(Math.hypot(stopped.x - moving.x, stopped.z - moving.z)).toBeLessThanOrEqual(0.005);
        previous = stopped;
        const confirmationFrames = Math.ceil((echoMs + Math.max(...jitterMs) + SNAP_MS) / FRAME_MS);
        let thisStopDrift = 0;
        for (let i = 0; i < confirmationFrames + 90; i++) {
          const pose = next().pose;
          if (!pose) throw new Error('predictor disabled unexpectedly');
          const drift = Math.hypot(pose.x - previous.x, pose.y - previous.y, pose.z - previous.z);
          postStopDrift += drift;
          thisStopDrift += drift;
          previous = pose;
        }
        expect(thisStopDrift, label).toBeLessThanOrEqual(0.01);
        expect(
          Math.hypot(
            previous.x - lab.self.pos.x,
            previous.y - lab.self.pos.y,
            previous.z - lab.self.pos.z,
          ),
        ).toBeLessThanOrEqual(0.005);
        const still = next().pose;
        if (!still) throw new Error('predictor disabled unexpectedly');
        for (let i = 0; i < 5; i++) expect(next().pose).toEqual(still);
      };

      for (let cycle = 0; cycle < cycles; cycle++) {
        drive(mi({ forward: true }), 1);
        stop(`forward stop ${cycle}`);
        drive(mi({ back: true }), -1);
        stop(`back stop ${cycle}`);
      }

      expect(maxSpeed).toBeLessThanOrEqual(RUN_SPEED * 1.15);
      expect(wrongWay).toBeLessThan(0.01);
      expect(postStopDrift).toBeLessThanOrEqual(0.01 * cycles * 2);
      const final = next();
      if (!final.pose) throw new Error('predictor disabled unexpectedly');
      expect(
        Math.hypot(final.pose.x - final.ac.x, final.pose.y - final.ac.y, final.pose.z - final.ac.z),
      ).toBeLessThanOrEqual(0.01);
    },
  );

  it.each([
    { echoMs: 50, jitterMs: 50 },
    { echoMs: 170, jitterMs: 120 },
    { echoMs: 1000, jitterMs: 120 },
  ])('keeps steady forward motion continuous at $echoMs ms echo', ({ echoMs, jitterMs }) => {
    const lab = new Lab(echoMs, FRAME_MS, { start: { x: 0, z: -1000 } });
    lab.jitterMs = jitterMs;
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 120; i++) lab.frame();
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');
    const expectedStep = RUN_SPEED * (FRAME_MS / 1000);
    for (let i = 0; i < 180; i++) {
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(pose.z - previous.z, `frame ${i}`).toBeCloseTo(expectedStep, 2);
      previous = pose;
    }
  });

  it('keeps steady forward motion continuous when validated display positions become authority', () => {
    const lab = new Lab(200, FRAME_MS, {
      start: { x: 0, z: -1000 },
      deliverAfter: true,
      positionAuthority: true,
    });
    lab.jitterMs = 50;
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 180; i++) lab.frame();
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');
    const expectedStep = RUN_SPEED * (FRAME_MS / 1000);
    for (let i = 0; i < 360; i++) {
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(pose.z - previous.z, `frame ${i}`).toBeCloseTo(expectedStep, 2);
      previous = pose;
    }
  });

  it('keeps validated-authority movement continuous through an isolated client frame drop', () => {
    const lab = new Lab(200, FRAME_MS, {
      start: { x: 0, z: -1000 },
      deliverAfter: true,
      positionAuthority: true,
    });
    lab.jitterMs = 50;
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 180; i++) lab.frame();
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');

    const frameDurations = [156, ...Array.from({ length: 90 }, () => FRAME_MS)];
    for (const [index, frameMs] of frameDurations.entries()) {
      const pose = lab.frame(frameMs).pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      const speed = (pose.z - previous.z) / (frameMs / 1000);
      expect(speed, `frame ${index}`).toBeGreaterThanOrEqual(RUN_SPEED * 0.9);
      expect(speed, `frame ${index}`).toBeLessThanOrEqual(RUN_SPEED * 1.1);
      previous = pose;
    }
  });

  it.each([300, 500, 600, 700, 750])(
    'keeps validated movement continuous through a %ims main-thread stall',
    (stallMs) => {
      const lab = new Lab(200, FRAME_MS, {
        start: { x: 0, z: -1000 },
        deliverAfter: true,
        positionAuthority: true,
      });
      lab.jitterMs = 50;
      lab.setInput(mi({ forward: true }));
      for (let i = 0; i < 180; i++) lab.frame();
      const before = lab.frame().pose;
      if (!before) throw new Error('predictor disabled unexpectedly');

      const after = lab.frame(stallMs).pose;
      if (!after) throw new Error('predictor disabled unexpectedly');
      const advanceMs = Math.min(stallMs, SELF_MOTION_MAIN_THREAD_STALL_MAX_MS);
      expect(after.z - before.z).toBeCloseTo(RUN_SPEED * (advanceMs / 1000), 2);
      expect(lab.movementPositionAuthorityActive()).toBe(true);

      let previous = after;
      for (let i = 0; i < 40; i++) {
        const recovered = lab.frame().pose;
        if (!recovered) throw new Error('predictor disabled unexpectedly');
        const recoveryStep = recovered.z - previous.z;
        const expectedStep = RUN_SPEED * (FRAME_MS / 1000);
        expect(recoveryStep, `recovery frame ${i}`).toBeGreaterThanOrEqual(expectedStep * 0.9);
        expect(recoveryStep, `recovery frame ${i}`).toBeLessThanOrEqual(expectedStep * 1.1);
        expect(lab.movementPositionAuthorityActive(), `authority frame ${i}`).toBe(true);
        previous = recovered;
      }
    },
  );

  it('applies the stale-input catch-up cap without movement-position authority', () => {
    expect(SELF_MOTION_MAIN_THREAD_STALL_MAX_MS).toBe(750);
    const lab = new Lab(200, FRAME_MS, { start: { x: 0, z: -1000 }, serverDeaf: true });
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 180; i++) lab.frame();
    const before = lab.frame().pose;
    if (!before) throw new Error('predictor disabled unexpectedly');

    const after = lab.frame(2000).pose;
    if (!after) throw new Error('predictor disabled unexpectedly');
    const advance = after.z - before.z;
    expect(advance).toBeGreaterThan(RUN_SPEED * 0.7);
    expect(advance).toBeLessThanOrEqual(
      RUN_SPEED * (SELF_MOTION_MAIN_THREAD_STALL_MAX_MS / 1000) + 1e-6,
    );
  });

  it('rebases a brief validator reset without interrupting held forward movement', () => {
    const lab = new Lab(200, FRAME_MS, { start: { x: 0, z: -1000 } });
    lab.jitterMs = 50;
    lab.setPositionAuthoritySignal(true);
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 180; i++) lab.frame();

    lab.shiftServerPosition(-3);
    for (let i = 0; i < 3; i++) lab.frame();
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');
    const expectedStep = RUN_SPEED * (FRAME_MS / 1000);

    lab.setPositionAuthoritySignal(false);
    for (let i = 0; i < 4; i++) {
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(pose.z - previous.z, `reset frame ${i}`).toBeCloseTo(expectedStep, 2);
      previous = pose;
    }

    lab.setPositionAuthoritySignal(true);
    for (let i = 0; i < 12; i++) {
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(pose.z - previous.z, `recovery frame ${i}`).toBeCloseTo(expectedStep, 2);
      previous = pose;
    }
  });

  it('keeps validated-authority movement continuous at sustained low client FPS', () => {
    const lowFpsFrameMs = 125;
    const lab = new Lab(200, lowFpsFrameMs, {
      start: { x: 0, z: -1000 },
      deliverAfter: true,
      positionAuthority: true,
    });
    lab.jitterMs = 50;
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 30; i++) lab.frame();
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');

    for (let i = 0; i < 60; i++) {
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      const speed = (pose.z - previous.z) / (lowFpsFrameMs / 1000);
      expect(speed, `frame ${i}`).toBeGreaterThanOrEqual(RUN_SPEED * 0.9);
      expect(speed, `frame ${i}`).toBeLessThanOrEqual(RUN_SPEED * 1.1);
      previous = pose;
    }
  });

  it('keeps a steady forward hold continuous while measured echo and jitter change', () => {
    const lab = new Lab(50, FRAME_MS, {
      start: { x: 0, z: -1000 },
      deliverAfter: true,
    });
    lab.setInput(mi({ forward: true }));
    let echoMean = 50;
    let jitterMean = 20;
    const echoSamples = [50, 55, 45, 100, 50, 45, 55, 50];
    let sampleIndex = 0;

    for (let i = 0; i < 120; i++) lab.frame();
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');
    const expectedStep = RUN_SPEED * (FRAME_MS / 1000);

    for (let i = 0; i < 60 * 12; i++) {
      const gapFrame = i % 150;
      lab.holdSnapshots = gapFrame >= 120 && gapFrame < 128;
      if (i % 3 === 0) {
        const sample = echoSamples[sampleIndex++ % echoSamples.length];
        const priorMean = echoMean;
        echoMean += 0.2 * (sample - echoMean);
        jitterMean += 0.2 * (Math.abs(sample - priorMean) - jitterMean);
        lab.echoMs = echoMean;
        lab.jitterMs = jitterMean;
      }
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(pose.z - previous.z, `frame ${i}`).toBeCloseTo(expectedStep, 2);
      previous = pose;
    }
  });

  it('does not turn a changing input-echo estimate into a periodic speed pulse', () => {
    const lab = new Lab(50, FRAME_MS, { start: { x: 0, z: -1000 } });
    lab.setInput(mi({ forward: true }));
    let echoMean = 50;
    let jitterMean = 0;
    let sampleIndex = 0;
    for (let i = 0; i < 120; i++) lab.frame();
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');
    const expectedStep = RUN_SPEED * (FRAME_MS / 1000);

    for (let i = 0; i < 60 * 15; i++) {
      if (i % 3 === 0) {
        const sample = 50 + (sampleIndex++ % 50);
        const priorMean = echoMean;
        echoMean = priorMean === 0 ? sample : priorMean + 0.2 * (sample - priorMean);
        const deviation = priorMean === 0 ? 0 : Math.abs(sample - priorMean);
        jitterMean = jitterMean === 0 ? deviation : jitterMean + 0.2 * (deviation - jitterMean);
        lab.echoMs = echoMean;
        lab.jitterMs = jitterMean;
      }
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(pose.z - previous.z, `frame ${i}`).toBeCloseTo(expectedStep, 2);
      previous = pose;
    }
  });

  it('answers every rapid strafe reversal instead of dropping partial movement segments', () => {
    const lab = new Lab(170, FRAME_MS, { start: { x: 0, z: -1000 } });
    lab.jitterMs = 120;
    for (let i = 0; i < 120; i++) lab.frame();
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');
    for (let i = 0; i < 60; i++) {
      const direction = i % 2 === 0 ? 1 : -1;
      lab.setInput(mi(direction > 0 ? { strafeLeft: true } : { strafeRight: true }));
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect((pose.x - previous.x) * direction, `frame ${i}`).toBeGreaterThan(0.05);
      previous = pose;
    }
  });

  it('does not visibly slide after movement input is released', () => {
    const lab = new Lab(170, FRAME_MS, { start: { x: 0, z: -1000 } });
    lab.jitterMs = 120;
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 120; i++) lab.frame();
    const moving = lab.frame().pose;
    if (!moving) throw new Error('predictor disabled unexpectedly');
    lab.setInput(mi());
    const released = lab.frame().pose;
    if (!released) throw new Error('predictor disabled unexpectedly');
    expect(Math.hypot(released.x - moving.x, released.z - moving.z)).toBeLessThanOrEqual(0.005);
    for (let i = 0; i < 180; i++) {
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(Math.hypot(pose.x - released.x, pose.z - released.z), `frame ${i}`).toBeLessThan(0.01);
    }
  });

  it.each(Array.from({ length: 12 }, (_, phase) => phase + 1))(
    'stops without a correction at release phase %i',
    (phase) => {
      const lab = new Lab(50, FRAME_MS, { start: { x: 0, z: -1000 } });
      lab.jitterMs = 50;
      lab.setInput(mi({ forward: true }));
      for (let i = 0; i < 60 + phase; i++) lab.frame();
      const moving = lab.frame().pose;
      if (!moving) throw new Error('predictor disabled unexpectedly');
      lab.setInput(mi());
      const released = lab.frame().pose;
      if (!released) throw new Error('predictor disabled unexpectedly');
      expect(Math.hypot(released.x - moving.x, released.z - moving.z)).toBeLessThanOrEqual(0.005);
      for (let i = 0; i < 180; i++) {
        const pose = lab.frame().pose;
        if (!pose) throw new Error('predictor disabled unexpectedly');
        expect(Math.hypot(pose.x - released.x, pose.z - released.z), `frame ${i}`).toBeLessThan(
          0.01,
        );
      }
      expect(Math.hypot(released.x - lab.self.pos.x, released.z - lab.self.pos.z)).toBeLessThan(
        0.01,
      );
    },
  );

  it('recognizes only the local completed-unstuck event as an authoritative discontinuity', () => {
    const completed = {
      type: 'unstuck',
      phase: 'completed',
      pid: 7,
      reason: 'moved_to_graveyard',
      area: { kind: 'overworld', id: 'eastbrook_vale' },
      origin: { x: 0, y: 0, z: 0, localX: 0, localZ: 0 },
      destination: { x: 0, y: 0, z: 4, localX: 0, localZ: 4 },
      duration: 10,
      distance: 4,
    } as const;
    expect(hasAuthoritativeSelfPositionDiscontinuity([completed], 7)).toBe(true);
    expect(hasAuthoritativeSelfPositionDiscontinuity([completed], 8)).toBe(false);
    expect(
      hasAuthoritativeSelfPositionDiscontinuity(
        [{ type: 'unstuck', phase: 'countdown', seconds: 4 }],
        7,
      ),
    ).toBe(false);
    const blink = {
      type: 'spellfx',
      sourceId: 7,
      targetId: 7,
      school: 'shadow',
      fx: 'blinkStep',
    } as SimEvent;
    expect(hasAuthoritativeSelfPositionDiscontinuity([blink], 7)).toBe(true);
    expect(hasAuthoritativeSelfPositionDiscontinuity([blink], 8)).toBe(false);
    expect(hasAuthoritativeSelfPositionDiscontinuity([{ type: 'respawn', pid: 7 }], 7)).toBe(true);
    expect(hasAuthoritativeSelfPositionDiscontinuity([{ type: 'respawn', pid: 7 }], 8)).toBe(false);
  });

  it('snaps both predictive and fallback poses on a sub-threshold authoritative recovery', () => {
    const sim = new Sim({
      seed: SEED,
      playerClass: 'warrior',
      autoEquip: true,
      world: EMPTY_TEST_WORLD,
    });
    teleport(sim, 0, -40);
    const self = {
      ...sim.player,
      pos: { ...sim.player.pos },
      prevPos: { ...sim.player.prevPos },
    };
    const frame: SelfMotionFrame = {
      enabled: true,
      moveInput: mi({ forward: true }),
      displayFacing: 0,
      echoMs: 100,
      jitterMs: 0,
      alpha: 1,
      frameDt: 0.05,
      snapAgeMs: 0,
      snapIntervalMs: SNAP_MS,
      riftFloor: null,
    };
    const predictive = new SelfMotionPredictor(SEED);
    const ordinary = new SelfMotionPredictor(SEED);
    for (let i = 0; i < 2; i++) {
      predictive.step(self, frame);
      ordinary.step(self, frame);
    }

    // Four yards is deliberately below the renderer's normal six-yard snap
    // threshold. The explicit completed-unstuck discontinuity must still win.
    self.pos = { ...self.pos, z: self.pos.z + 4 };
    self.prevPos = { ...self.pos };
    const ordinaryPose = ordinary.step(self, frame);
    const snappedPose = predictive.step(self, frame, true);
    expect(Math.abs((ordinaryPose?.z ?? self.pos.z) - self.pos.z)).toBeGreaterThan(0.1);
    expect(snappedPose).toEqual(self.pos);
    expect(predictive.leadMs).toBe(0);

    const fallbackPose = { x: 0, y: 0, z: 0 };
    updateSelfRenderFallback(fallbackPose, 0, 0, 4, true, 1 / 60, true, false);
    expect(fallbackPose.z).toBeGreaterThan(0);
    expect(fallbackPose.z).toBeLessThan(4);
    fallbackPose.z = 0;
    updateSelfRenderFallback(fallbackPose, 0, 0, 4, true, 1 / 60, true, true);
    expect(fallbackPose).toEqual({ x: 0, y: 0, z: 4 });
  });

  it('moves the pose the moment intent is pressed, long before the server does', () => {
    const lab = new Lab(120);
    lab.frame();
    const before = lab.frame();
    lab.setInput(mi({ forward: true }));
    let moved = 0;
    for (let i = 0; i < 4; i++) {
      const r = lab.frame();
      if (r.pose) moved = r.pose.z - (before.pose?.z ?? 0);
    }
    expect(moved).toBeGreaterThan(0.2); // ~4 frames of RUN_SPEED
    // the server has not even received the input yet (120ms lag > 4 frames)
    expect(lab.srv.player.pos.z).toBeCloseTo(-1000, 3);
  });

  it('keeps forward and lateral response through rapid direction-combination changes', () => {
    const lab = new Lab(170, FRAME_MS, { start: { x: 0, z: -1000 } });
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 30; i++) lab.frame();
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');
    const startX = previous.x;
    for (let i = 0; i < 18; i++) {
      lab.setInput(mi({ forward: true, strafeLeft: i % 2 === 0 }));
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(pose.z - previous.z, `frame ${i} forward`).toBeGreaterThan(0.02);
      previous = pose;
    }
    expect(Math.abs(previous.x - startX)).toBeGreaterThan(0.1);
  });

  it('responds on every frame through rapid true reversals', () => {
    const lab = new Lab(170, FRAME_MS, { start: { x: 0, z: -1000 } });
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 30; i++) lab.frame();
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');
    for (let i = 0; i < 18; i++) {
      const direction = i % 2 === 0 ? 1 : -1;
      lab.setInput(direction > 0 ? mi({ forward: true }) : mi({ back: true }));
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(direction * (pose.z - previous.z), `frame ${i} reversal`).toBeGreaterThan(0.02);
      previous = pose;
    }
  });

  it('keeps a small same-path speed correction continuous as jitter changes', () => {
    const lab = new Lab(170, FRAME_MS, {
      start: { x: 0, z: -1000 },
      serverMotionScale: 6.5 / RUN_SPEED,
    });
    lab.setInput(mi({ forward: true }));
    let previous = lab.frame().pose;
    if (!previous) throw new Error('predictor disabled unexpectedly');
    const speeds: number[] = [];
    for (let i = 0; i < 360; i++) {
      lab.jitterMs = i % 6 < 3 ? 5 : 120;
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      if (i >= 300) speeds.push((pose.z - previous.z) / (FRAME_MS / 1000));
      previous = pose;
    }
    expect(Math.min(...speeds)).toBeGreaterThan(6.35);
    expect(Math.max(...speeds)).toBeLessThan(6.65);
    for (let i = 1; i < speeds.length; i++) {
      expect(Math.abs(speeds[i] - speeds[i - 1]), `frame ${i}`).toBeLessThan(0.15);
    }
  });

  it('re-adopts a large raw server relocation independently of the legitimate visual lead', () => {
    const lab = new Lab(1000, FRAME_MS, { start: { x: 0, z: -1000 } });
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 120; i++) lab.frame();
    const before = lab.frame().pose;
    if (!before) throw new Error('predictor disabled unexpectedly');
    expect(before.z - lab.self.pos.z).toBeGreaterThan(6);

    lab.self.pos.x += 20;
    const relocated = lab.frame().pose;
    expect(relocated).toEqual(lab.self.pos);
  });

  it('keeps locomotion immediate and bounded at 1000 ms echo', () => {
    const lab = new Lab(1000, FRAME_MS, { start: { x: 0, z: -1000 } });
    for (let i = 0; i < 10; i++) lab.frame();
    const before = lab.frame().pose;
    if (!before) throw new Error('predictor disabled unexpectedly');
    lab.setInput(mi({ forward: true }));
    let immediate = before;
    for (let i = 0; i < 4; i++) {
      const pose = lab.frame().pose;
      if (pose) immediate = pose;
    }
    expect(immediate.z - before.z).toBeGreaterThan(0.2);
    expect(lab.srv.player.pos.z).toBeCloseTo(-1000, 3);

    for (let i = 0; i < 120; i++) lab.frame();
    const speedStart = lab.frame().pose;
    if (!speedStart) throw new Error('predictor disabled unexpectedly');
    let speedEnd = speedStart;
    let worstBackstep = 0;
    for (let i = 0; i < 120; i++) {
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      worstBackstep = Math.min(worstBackstep, pose.z - speedEnd.z);
      speedEnd = pose;
    }
    expect((speedEnd.z - speedStart.z) / 2).toBeGreaterThan(6.5);
    expect(worstBackstep).toBeGreaterThanOrEqual(-0.005);

    lab.setInput(mi());
    const stopped = lab.frame().pose;
    if (!stopped) throw new Error('predictor disabled unexpectedly');
    for (let i = 0; i < 100; i++) lab.frame();
    lab.setInput(mi({ back: true }));
    let reverse = lab.frame().pose;
    if (!reverse) throw new Error('predictor disabled unexpectedly');
    const reverseStart = reverse.z;
    for (let i = 0; i < 30; i++) {
      const pose = lab.frame().pose;
      if (pose) reverse = pose;
    }
    expect(reverse.z).toBeLessThan(reverseStart - 2);

    lab.setInput(mi());
    for (let i = 0; i < 120; i++) lab.frame();
    const settled = lab.frame();
    if (!settled.pose) throw new Error('predictor disabled unexpectedly');
    expect(
      Math.hypot(
        settled.pose.x - lab.self.pos.x,
        settled.pose.y - lab.self.pos.y,
        settled.pose.z - lab.self.pos.z,
      ),
    ).toBeLessThanOrEqual(0.005);
    const still = settled.pose;
    for (let i = 0; i < 20; i++) {
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(pose).toEqual(still);
    }

    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 120; i++) lab.frame();
    lab.skipDeliveries = 1000;
    const frozen: number[] = [];
    for (let i = 0; i < 180; i++) {
      const pose = lab.frame().pose;
      if (pose && i >= 160) frozen.push(pose.z);
    }
    expect(Math.max(...frozen) - Math.min(...frozen)).toBeLessThan(0.02);
  });

  it('expires optimistic no-echo movement while snapshots remain fresh', () => {
    const lab = new Lab(0, FRAME_MS, {
      start: { x: 0, z: -1000 },
      serverDeaf: true,
    });
    lab.echoMs = 0;
    lab.setInput(mi({ forward: true }));
    const start = lab.frame().pose;
    if (!start) throw new Error('predictor disabled unexpectedly');
    let immediate = start;
    for (let i = 0; i < 4; i++) {
      const pose = lab.frame().pose;
      if (pose) immediate = pose;
    }
    expect(immediate.z - start.z).toBeGreaterThan(0.2);

    const tail: number[] = [];
    for (let i = 0; i < 180; i++) {
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      if (i >= 150) tail.push(pose.z);
    }
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThan(0.02);
    expect(lab.srv.player.pos.z).toBeCloseTo(-1000, 3);

    lab.setInput(mi());
    for (let i = 0; i < 120; i++) lab.frame();
    const settled = lab.frame().pose;
    expect(settled).toEqual(lab.self.pos);
  });

  it('does not re-adopt a legitimate mounted lead at 1000 ms echo', () => {
    const lab = new Lab(1000, FRAME_MS, { start: { x: 0, z: -1000 } });
    lab.srv.addItem('reins_aether_hover_cycle', 1);
    lab.srv.player.mountKey = 'aether_hover_cycle';
    lab.self.mountKey = 'aether_hover_cycle';
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 180; i++) lab.frame();
    const first = lab.frame().pose;
    if (!first) throw new Error('predictor disabled unexpectedly');
    let previous = first;
    let last = first;
    let worstBackstep = 0;
    for (let i = 0; i < 120; i++) {
      const pose = lab.frame().pose;
      if (!pose) throw new Error('predictor disabled unexpectedly');
      worstBackstep = Math.min(worstBackstep, pose.z - previous.z);
      previous = pose;
      last = pose;
    }
    expect((last.z - first.z) / 2).toBeGreaterThan(11.5);
    expect(worstBackstep).toBeGreaterThanOrEqual(-0.005);
    expect(last.z - lab.self.pos.z).toBeGreaterThan(10);
  });

  // Running into a blocker (the Grand Armoury's flat south face at z = -12) is
  // the case the predictor must NOT "correct": the
  // display stops at the wall a full echo before the server does, and that is
  // right. Stripping the lead against the lagging anchor teleports the avatar
  // backward by RUN_SPEED x echo on the contact frame. A normal forward step at
  // 60 fps is RUN_SPEED/60 = 0.117 yd, so any backward frame step of that order
  // reads as a snap; the leash + divergence servo alone keep it sub-centimeter.
  it.each([100, 200, 300])('does not snap the pose backward on contact at %ims echo', (lagMs) => {
    const lab = new Lab(lagMs, FRAME_MS, { start: { x: 17.5, z: -16 }, facing: 0 });
    lab.frame();
    lab.frame();
    lab.setInput(mi({ forward: true }));

    let prevZ: number | null = null;
    let worstBackwardStep = 0;
    for (let i = 0; i < 240; i++) {
      const r = lab.frame();
      if (!r.pose) throw new Error('predictor disabled unexpectedly');
      if (prevZ !== null) worstBackwardStep = Math.min(worstBackwardStep, r.pose.z - prevZ);
      prevZ = r.pose.z;
    }

    // The blocked-intent lead removal produced -0.30/-0.99/-1.69 yd here.
    expect(worstBackwardStep).toBeGreaterThan(-0.05);
    // and the pose still settles onto the wall the server stopped at.
    expect(prevZ ?? Number.NaN).toBeCloseTo(lab.srv.player.pos.z, 1);
  });

  it('never renders the pose through a blocker it is running into', () => {
    const lab = new Lab(200, FRAME_MS, { start: { x: 17.5, z: -16 }, facing: 0 });
    lab.frame();
    lab.frame();
    lab.setInput(mi({ forward: true }));

    let farthest = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < 240; i++) {
      const r = lab.frame();
      if (!r.pose) throw new Error('predictor disabled unexpectedly');
      farthest = Math.max(farthest, r.pose.z);
    }

    // The predictor runs the same swept static collision as the server, so it
    // cannot walk into the wall; only the divergence servo can nudge it a few
    // centimetres past the resting face.
    expect(farthest).toBeLessThan(lab.srv.player.pos.z + 0.1);
  });

  it('holds a settled pose while forward is held against a wall', () => {
    const lab = new Lab(120, FRAME_MS, { start: { x: 17.5, z: -14.2 }, facing: 0 });
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 60; i++) lab.frame(); // run in and settle

    let prev = lab.frame().pose;
    if (!prev) throw new Error('predictor disabled unexpectedly');
    let worstJitter = 0;
    for (let i = 0; i < 120; i++) {
      const r = lab.frame();
      if (!r.pose) throw new Error('predictor disabled unexpectedly');
      worstJitter = Math.max(worstJitter, Math.hypot(r.pose.x - prev.x, r.pose.z - prev.z));
      prev = r.pose;
    }

    expect(worstJitter).toBeLessThan(0.01);
  });

  it('keeps the horizontal error inside the latency leash for the whole run', () => {
    const lab = new Lab(100);
    lab.setInput(mi({ forward: true }));
    const budget = lab.budget();
    for (let i = 0; i < 60 * 3; i++) {
      const { pose, a } = lab.frame();
      if (!pose) throw new Error('predictor disabled unexpectedly');
      const err = Math.hypot(pose.x - a.x, pose.z - a.z);
      expect(err, `frame ${i}`).toBeLessThanOrEqual(budget + 1e-6);
    }
  });

  it('keeps half-jitter in the leash budget without shifting reconciliation center age', () => {
    const lab = new Lab(50, FRAME_MS, {
      start: { x: 0, z: -1000 },
      serverDeaf: true,
    });
    lab.jitterMs = 50;
    lab.setInput(mi({ forward: true }));
    let last: FrameResult | null = null;
    for (let i = 0; i < 120; i++) last = lab.frame();
    if (!last?.pose) throw new Error('predictor disabled unexpectedly');
    const error = Math.hypot(last.pose.x - last.ac.x, last.pose.z - last.ac.z);
    expect(error).toBeLessThanOrEqual(lab.budget() + 1e-6);
    expect(lab.budget()).toBeCloseTo((RUN_SPEED * 75) / 1000 + 0.05, 8);
  });

  it('leads the authoritative pose in a steady run (latency actually hidden)', () => {
    const lab = new Lab(100);
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 60; i++) lab.frame(); // 1s warmup
    let leadSum = 0;
    let n = 0;
    for (let i = 0; i < 60; i++) {
      const { pose, a } = lab.frame();
      if (pose) {
        leadSum += pose.z - a.z;
        n++;
      }
    }
    expect(leadSum / n).toBeGreaterThan(0.25); // meaningful fraction of the 0.7yd lag
  });

  it('caps the extrapolation on a terrible link', () => {
    const lab = new Lab(500);
    lab.setInput(mi({ forward: true }));
    const capBudget = (RUN_SPEED * SELF_MOTION_CAP_MAX_MS) / 1000 + 0.05;
    for (let i = 0; i < 60 * 2; i++) {
      const { pose, a } = lab.frame();
      if (!pose) throw new Error('predictor disabled unexpectedly');
      expect(Math.hypot(pose.x - a.x, pose.z - a.z), `frame ${i}`).toBeLessThanOrEqual(
        capBudget + 1e-6,
      );
    }
  });

  it('stops instantly and settles onto the server pose with no backslide', () => {
    const lab = new Lab(100);
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 60 * 2; i++) lab.frame();
    lab.setInput(mi());
    let prevZ = -Infinity;
    let last: FrameResult | null = null;
    for (let i = 0; i < 60 * 1.5; i++) {
      const r = lab.frame();
      if (r.pose) {
        expect(r.pose.z, `frame ${i} backslide`).toBeGreaterThanOrEqual(prevZ - 0.005);
        prevZ = r.pose.z;
        last = r;
      }
    }
    if (!last?.pose) throw new Error('no pose');
    // converged onto the (now stationary) authoritative pose
    expect(Math.abs(last.pose.z - last.a.z)).toBeLessThan(0.25);
  });

  it('snaps to the authoritative pose on a server teleport', () => {
    const lab = new Lab(100);
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 30; i++) lab.frame();
    teleport(lab.srv, 0, 40); // 80yd jump, way past the 6yd snap rule
    let r: FrameResult | null = null;
    for (let i = 0; i < 4; i++) r = lab.frame(); // let a snapshot deliver it
    if (!r?.pose) throw new Error('no pose');
    expect(Math.abs(r.pose.z - r.a.z)).toBeLessThan(2);
  });

  it('returns null when disabled and re-adopts cleanly on re-enable', () => {
    const lab = new Lab(100);
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 30; i++) lab.frame();
    lab.enabled = false;
    expect(lab.frame().pose).toBeNull();
    lab.enabled = true;
    const r = lab.frame();
    if (!r.pose) throw new Error('no pose after re-enable');
    expect(Math.hypot(r.pose.z - r.a.z, r.pose.x - r.a.x)).toBeLessThan(0.5);
  });

  it('keeps corrections gentle under load-hitch frame times (world-entry low fps)', () => {
    // 8 fps frames like the first seconds after entering the world: the
    // per-frame display movement must stay near the legitimate run distance;
    // an unclamped correction blend would eat ~95% of the divergence in one
    // frame and read as a jerk.
    const lab = new Lab(100, 125);
    lab.setInput(mi({ forward: true }));
    let prev: number | null = null;
    for (let i = 0; i < 40; i++) {
      const { pose } = lab.frame();
      if (!pose) throw new Error('predictor disabled unexpectedly');
      if (prev !== null) {
        const step = pose.z - prev;
        expect(step, `frame ${i}`).toBeLessThanOrEqual(1.5); // ~run distance + bounded correction
        expect(step, `frame ${i}`).toBeGreaterThanOrEqual(-0.01); // never backward
      }
      prev = pose.z;
    }
  });

  it('never pumps forward/backward when the RTT exceeds the lead cap (netem case)', () => {
    // 280ms RTT > SELF_MOTION_CAP_MAX_MS: the divergence measurement must stay
    // aligned to the TRUE delay and the servo gain bounded, or the correction
    // chases its own delayed history and pumps the pose back and forth.
    const lab = new Lab(280);
    lab.setInput(mi({ forward: true }));
    let prev: number | null = null;
    for (let i = 0; i < 60 * 3; i++) {
      const { pose } = lab.frame();
      if (!pose) throw new Error('predictor disabled unexpectedly');
      if (prev !== null) expect(pose.z - prev, `run frame ${i}`).toBeGreaterThanOrEqual(-0.005);
      prev = pose.z;
    }
    lab.setInput(mi());
    // per-frame: nothing beyond sub-centimeter noise; cumulative: no slow
    // sawtooth sneaking under a per-frame threshold
    let backslide = 0;
    for (let i = 0; i < 60 * 2; i++) {
      const r = lab.frame();
      if (r.pose && prev !== null) {
        const step = r.pose.z - prev;
        expect(step, `release frame ${i}`).toBeGreaterThanOrEqual(-0.01);
        if (step < 0) backslide += -step;
        prev = r.pose.z;
      }
    }
    expect(backslide).toBeLessThan(0.05);
  });

  it('sustains the full run speed on a high-RTT link (no underwater feel)', () => {
    const lab = new Lab(280);
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 60; i++) lab.frame(); // 1s: past the start transient
    const first = lab.frame().pose;
    if (!first) throw new Error('predictor disabled unexpectedly');
    let last = first;
    for (let i = 0; i < 60 * 2; i++) {
      const r = lab.frame();
      if (r.pose) last = r.pose;
    }
    const avgSpeed = (last.z - first.z) / 2; // yd/s over the 2s window
    expect(avgSpeed).toBeGreaterThan(6.5); // RUN_SPEED is 7
  });

  // Phase 06, packet-0-instruments R11: the 100 to 500 ms broadcast-gap
  // regime. The server keeps ticking while the mirror and lastSnapMs are
  // suppressed, then one resume delivery re-anchors interpolation, exactly
  // like a real broadcast stall: the rAF loop never stops, snapshots do.
  // During an ordinary stall the client keeps integrating the held input at
  // its normal speed inside the fixed maximum prediction horizon. On resume
  // the anchor sweeps to the fresh pose without changing display speed. A gap
  // longer than the horizon freezes there instead of predicting forever. The straight-north lane doubles
  // as the yaw proxy: yaw is never server-gated, so the predictor must not
  // touch it, and any yaw contamination shows up as lateral drift.
  describe('scripted broadcast stalls', () => {
    const ECHO_MS = 150; // mid-band echo: cap 150 ms, leash budget 1.10 yd
    const WARMUP_FRAMES = 120; // 2 s of held run, settled on the steady lead
    const RESUME_WINDOW_FRAMES = 15; // the resume delivery + the anchor sweep
    const RECOVERY_SKIP_FRAMES = 60; // about 1 s after resume
    const RECOVERY_SAMPLE_FRAMES = 30;

    interface StallTrace {
      budget: number;
      stallErrs: number[];
      stallSteps: number[];
      resumeSteps: number[];
      resumeErrs: number[];
      recoveryErrs: number[];
      recoveryLeads: number[];
      /** Mean lead of an unstalled control run over the same final window:
       *  the steady band the stalled run must have rejoined. */
      controlMeanLead: number;
      worstLateral: number;
      serverLateral: number;
      /** Most negative per-frame step over the WHOLE run, not just the resume
       *  window: the sub-tick interpolation must never run backward, including
       *  on a frame where the leash clips more than the kernel step it just
       *  took (which is what the prevPos collapse in step() prevents). */
      worstStep: number;
    }

    function runStall(gapMs: number): StallTrace {
      // Long stalls cover enough northward ground to reach the authored town
      // wall from the default start, which clamps the server and hides the
      // snap the 2500 ms scenario exists to prove. Run the stall lab in the
      // collider-free open-field lane so these pins stay world-independent.
      const lab = new Lab(ECHO_MS, FRAME_MS, { start: { x: 0, z: -1000 } });
      const budget = lab.budget();
      lab.setInput(mi({ forward: true }));
      let lastZ = Number.NaN;
      let worstLateral = 0;
      let serverLateral = 0;
      let worstStep = 0;
      const errOf = (r: FrameResult): number => {
        if (!r.pose) throw new Error('predictor disabled unexpectedly');
        return Math.hypot(r.pose.x - r.ac.x, r.pose.z - r.ac.z);
      };
      const advance = (r: FrameResult): number => {
        if (!r.pose) throw new Error('predictor disabled unexpectedly');
        worstLateral = Math.max(worstLateral, Math.abs(r.pose.x));
        serverLateral = Math.max(serverLateral, Math.abs(lab.srv.player.pos.x));
        const step = r.pose.z - lastZ;
        if (!Number.isNaN(step)) worstStep = Math.min(worstStep, step);
        lastZ = r.pose.z;
        return step;
      };
      for (let i = 0; i < WARMUP_FRAMES; i++) advance(lab.frame());
      lab.skipDeliveries = gapMs / SNAP_MS - 1;
      const stallErrs: number[] = [];
      const stallSteps: number[] = [];
      const resumeSteps: number[] = [];
      const resumeErrs: number[] = [];
      let resumed = false;
      for (let guard = 0; guard < 400 && !resumed; guard++) {
        const r = lab.frame();
        if (r.delivered) {
          resumed = true;
          resumeSteps.push(advance(r));
          resumeErrs.push(errOf(r));
          break;
        }
        stallSteps.push(advance(r));
        stallErrs.push(errOf(r));
      }
      if (!resumed) throw new Error('stall never resumed');
      for (let i = 1; i < RESUME_WINDOW_FRAMES; i++) {
        const r = lab.frame();
        resumeSteps.push(advance(r));
        resumeErrs.push(errOf(r));
      }
      for (let i = RESUME_WINDOW_FRAMES; i < RECOVERY_SKIP_FRAMES; i++) advance(lab.frame());
      const recoveryErrs: number[] = [];
      const recoveryLeads: number[] = [];
      for (let i = 0; i < RECOVERY_SAMPLE_FRAMES; i++) {
        const r = lab.frame();
        advance(r);
        if (!r.pose) throw new Error('predictor disabled unexpectedly');
        recoveryErrs.push(errOf(r));
        recoveryLeads.push(r.pose.z - r.ac.z);
      }
      // The steady band, measured rather than assumed: an identical run with
      // no stall, sampled over the same final window. The stalled run must
      // land back on this band, which also proves recovery completed inside
      // the skip window rather than still converging through the sample.
      const postWarmupFrames = stallErrs.length + 1 + (RESUME_WINDOW_FRAMES - 1);
      const totalFrames =
        WARMUP_FRAMES +
        postWarmupFrames +
        (RECOVERY_SKIP_FRAMES - RESUME_WINDOW_FRAMES) +
        RECOVERY_SAMPLE_FRAMES;
      const control = new Lab(ECHO_MS);
      control.setInput(mi({ forward: true }));
      const controlLeads: number[] = [];
      for (let i = 0; i < totalFrames; i++) {
        const r = control.frame();
        if (!r.pose) throw new Error('predictor disabled unexpectedly');
        if (i >= totalFrames - RECOVERY_SAMPLE_FRAMES) controlLeads.push(r.pose.z - r.ac.z);
      }
      const controlMeanLead = controlLeads.reduce((s, v) => s + v, 0) / controlLeads.length;
      return {
        budget,
        stallErrs,
        stallSteps,
        resumeSteps,
        resumeErrs,
        recoveryErrs,
        recoveryLeads,
        controlMeanLead,
        worstLateral,
        serverLateral,
        worstStep,
      };
    }

    it.each([100, 250, 400, 500])(
      'holds constant display speed across a %ims broadcast stall',
      (gapMs) => {
        const run = runStall(gapMs);
        const maxPredictionBudget = (RUN_SPEED * SELF_MOTION_CAP_MAX_MS) / 1000 + 0.05;
        run.stallErrs.forEach((err, i) => {
          expect(err, `stall frame ${i}`).toBeLessThanOrEqual(maxPredictionBudget + 1e-6);
        });
        const expectedStep = RUN_SPEED * (FRAME_MS / 1000);
        const stepReport = `\n  stall: ${run.stallSteps.map((step) => step.toFixed(4)).join(' ')}\n  resume: ${run.resumeSteps.map((step) => step.toFixed(4)).join(' ')}`;
        for (const [i, step] of [...run.stallSteps, ...run.resumeSteps].entries()) {
          expect(step, `gap/resume frame ${i}${stepReport}`).toBeCloseTo(expectedStep, 2);
        }
        // Back in the steady lead band within about a second: contained,
        // meaningfully leading, and equal to the unstalled control's band
        run.recoveryErrs.forEach((err, i) => {
          expect(err, `recovery frame ${i}`).toBeLessThanOrEqual(run.budget + 1e-6);
        });
        const meanLead = run.recoveryLeads.reduce((s, v) => s + v, 0) / run.recoveryLeads.length;
        expect(meanLead).toBeGreaterThanOrEqual(0.45);
        expect(Math.abs(meanLead - run.controlMeanLead)).toBeLessThanOrEqual(0.05);
        // Zero lateral drift on the straight lane, the yaw-untouched proxy.
        // The server assert proves the lane itself is straight, so the display
        // assert is a real claim about the predictor and not about terrain.
        expect(run.serverLateral).toBeLessThanOrEqual(1e-9);
        expect(run.worstLateral).toBeLessThanOrEqual(1e-9);
        // Not one backward frame anywhere in the run, stall and recovery
        // included, not just the resume window sampled above
        expect(run.worstStep).toBeGreaterThanOrEqual(-0.03);
      },
    );

    it('freezes at the maximum horizon and re-adopts authority after a prolonged gap', () => {
      const run = runStall(2500);
      const maxPredictionBudget = (RUN_SPEED * SELF_MOTION_CAP_MAX_MS) / 1000 + 0.05;
      run.stallErrs.forEach((err, i) => {
        expect(err, `stall frame ${i}`).toBeLessThanOrEqual(maxPredictionBudget + 1e-6);
      });
      expect(Math.max(...run.stallErrs)).toBeGreaterThanOrEqual(maxPredictionBudget - 0.5);
      expect(Math.max(...run.stallSteps.slice(-12).map(Math.abs))).toBeLessThan(0.01);
      expect(SELF_MOTION_SNAP_DIST_SQ).toBe(36);
      const snapDist = Math.sqrt(SELF_MOTION_SNAP_DIST_SQ);
      expect(run.resumeSteps.some((step) => Math.abs(step) >= snapDist)).toBe(true);
      run.recoveryErrs.forEach((err, i) => {
        expect(err, `recovery frame ${i}`).toBeLessThanOrEqual(run.budget + 1e-6);
      });
      expect(run.worstLateral).toBeLessThanOrEqual(1e-9);
    });
  });

  // A long render frame (a shader link, a GC pause, a texture decode) blocks
  // the main thread, so the snapshots that arrive DURING it are only applied
  // after it: inside the frame the anchor is frozen, and right after it a
  // burst of queued snapshots re-anchors prevPos at the drawn pose and sweeps
  // the anchor several ticks across one snapshot interval. The display must
  // keep running at its steady speed through both halves: the kernel is
  // trusted while the anchor is stale (long frame) and while the burst sweep
  // settles, or the avatar stalls inside the long frame and rushes after it.
  describe('long render frames', () => {
    const SPEED_MIN = 5.0; // yd/s: RUN_SPEED is 7
    const SPEED_MAX = 9.0;
    const AFTER_FRAMES = 12;
    const WARMUP_FRAMES = 120; // 2 s, settled on the steady lead
    const HOLD_FRAMES = 9; // ~150 ms: three snapshots queue up
    const BURST_FRAMES = 30; // the burst arm repays a real network gap, see below
    // Long enough to outlast BLOCK_EPISODE_MAX_MS with frames to spare, so the
    // cap expiring is observable inside the gap rather than at its edge.
    const GAP_MS = 700;
    // The sweep replays the whole gap over one snapshot interval, and the
    // leash then walks its 4.7 yd loan back to the honest budget, which costs
    // one short re-phasing trim around the fortieth frame. Long enough that
    // the tail is settled run speed again.
    const GAP_RECOVERY_FRAMES = 60;

    interface Step {
      label: string;
      dtMs: number;
      /** Horizontal display speed over this frame, yd/s. */
      speed: number;
      /** Signed advance along the run direction (+z), yd. */
      forward: number;
      /** Horizontal distance to the leash's own anchor (alpha capped at 1). */
      err: number;
    }

    const trace = (steps: Step[]): string =>
      `\n${steps
        .map(
          (s) =>
            `  ${s.label.padStart(6)} dt=${s.dtMs.toFixed(1).padStart(6)}ms ` +
            `v=${s.speed.toFixed(2).padStart(6)} yd/s fwd=${s.forward.toFixed(3)} ` +
            `err=${s.err.toFixed(3)}`,
        )
        .join('\n')}`;

    // The collider-free open-field lane (same reason as the stall lane above:
    // the authored town wall would clamp the server and hide the artifact).
    function warmLab(lagMs: number): Lab {
      const lab = new Lab(lagMs, FRAME_MS, { start: { x: 0, z: -1000 }, deliverAfter: true });
      lab.setInput(mi({ forward: true }));
      for (let i = 0; i < WARMUP_FRAMES; i++) lab.frame();
      return lab;
    }

    // Runs `count` frames of `dtMs` and returns one Step per frame, each
    // measured against the pose the previous frame drew.
    function recorder(
      lab: Lab,
    ): (label: string, dtMs: number, count?: number, drainFirst?: boolean) => Step[] {
      let prev = { x: Number.NaN, z: Number.NaN };
      return (label, dtMs, count = 1, drainFirst = false): Step[] => {
        const out: Step[] = [];
        for (let i = 0; i < count; i++) {
          const r = lab.frame(dtMs, drainFirst);
          if (!r.pose) throw new Error('predictor disabled unexpectedly');
          const pose = { x: r.pose.x, z: r.pose.z };
          if (!Number.isNaN(prev.x)) {
            out.push({
              label: count > 1 ? `${label}${i + 1}` : label,
              dtMs,
              speed: Math.hypot(pose.x - prev.x, pose.z - prev.z) / (dtMs / 1000),
              forward: pose.z - prev.z,
              err: Math.hypot(pose.x - r.ac.x, pose.z - r.ac.z),
            });
          }
          prev = pose;
        }
        return out;
      };
    }

    function runLongFrame(lagMs: number, longMs: number): Step[] {
      const lab = warmLab(lagMs);
      const record = recorder(lab);
      record('warm', FRAME_MS); // seeds the previous pose, produces no step
      return [...record('long', longMs), ...record('+', FRAME_MS, AFTER_FRAMES)];
    }

    // The real-browser ordering, measured with injected blocks: after the long
    // frame Chrome runs several SHORT catch-up frames (8 to 17 ms) before it
    // drains the socket, so the anchor stays frozen for 4 to 6 more frames and
    // the queued snapshots land as one burst only then.
    function runWithheldBurst(
      lagMs: number,
      longMs: number,
      heldFrames: number,
      heldMs: number,
    ): Step[] {
      const lab = warmLab(lagMs);
      const record = recorder(lab);
      record('warm', FRAME_MS);
      lab.holdSnapshots = true;
      const blocked = [...record('long', longMs), ...record('held', heldMs, heldFrames)];
      lab.holdSnapshots = false;
      // the next frame's tail drains the whole queue at once
      return [...blocked, ...record('+', FRAME_MS, AFTER_FRAMES + 1)];
    }

    // The other browser ordering, also measured: the socket is drained just
    // before the long frame's rAF callback, so the anchor is FRESH but
    // ClientWorld has re-anchored prevPos at the drawn pose with pos several
    // ticks ahead. Nothing looks stale, and the leash clips the frame's own
    // multi-step advance unless the hitch itself is recognised.
    function runDeliverBefore(lagMs: number, longMs: number): Step[] {
      const lab = warmLab(lagMs);
      const record = recorder(lab);
      record('warm', FRAME_MS);
      const long = record('long', longMs, 1, true);
      return [...long, ...record('+', FRAME_MS, AFTER_FRAMES)];
    }

    function runBurst(lagMs: number): Step[] {
      const lab = warmLab(lagMs);
      const record = recorder(lab);
      record('warm', FRAME_MS);
      lab.holdSnapshots = true;
      record('hold', FRAME_MS, HOLD_FRAMES);
      lab.holdSnapshots = false;
      const burst = record('burst', FRAME_MS); // its tail applies all three at once
      return [...burst, ...record('+', FRAME_MS, BURST_FRAMES)];
    }

    const expectSteadyBand = (steps: Step[], maxSpeed = SPEED_MAX): void => {
      const report = trace(steps);
      for (const step of steps) {
        expect(step.speed, `${step.label}${report}`).toBeGreaterThanOrEqual(SPEED_MIN);
        expect(step.speed, `${step.label}${report}`).toBeLessThanOrEqual(maxSpeed);
        expect(step.forward, `${step.label}${report}`).toBeGreaterThanOrEqual(0);
      }
    };

    // The 250 ms rows carry a wider ceiling for a cause outside this fix: 250
    // ms IS the main-loop frame clamp, so the kernel accumulator drops the
    // remainder it was already holding and the display owes the server up to
    // one tick of ground. The servo repays that at a bounded rate over the
    // following frames (observed peak 9.67 yd/s); the artifact this test pins
    // against ran at 13.8 and stalled to 1.3 first.
    it.each([
      [40, 100, SPEED_MAX],
      [40, 156, SPEED_MAX],
      [40, 250, 10.0],
      [120, 100, SPEED_MAX],
      [120, 156, SPEED_MAX],
      [120, 250, 10.0],
    ])(
      'holds the steady display speed across a %ims-echo, %ims render frame',
      (lagMs, longMs, maxSpeed) => {
        expectSteadyBand(runLongFrame(lagMs, longMs), maxSpeed);
      },
    );

    it.each([
      [40, 100, 4, 10],
      [40, 156, 4, 10],
      [120, 100, 4, 10],
      [120, 156, 4, 10],
      [40, 100, 6, FRAME_MS],
      [40, 156, 6, FRAME_MS],
      [120, 100, 6, FRAME_MS],
      [120, 156, 6, FRAME_MS],
    ])(
      'holds the steady display speed at %ims echo across a %ims frame plus %i withheld frames of %ims',
      (lagMs, longMs, heldFrames, heldMs) => {
        expectSteadyBand(runWithheldBurst(lagMs, longMs, heldFrames, heldMs));
      },
    );

    it.each([
      [40, 100],
      [40, 156],
      [120, 100],
      [120, 156],
    ])(
      'holds the steady display speed at %ims echo across a %ims frame whose burst lands first',
      (lagMs, longMs) => {
        expectSteadyBand(runDeliverBefore(lagMs, longMs));
      },
    );

    // The isolation term in the hitch trigger, pinned from the regime it
    // protects: at a steady 8 fps nothing is hitching, no episode may open,
    // and the servo must keep correcting every frame. Sibling of 'keeps
    // corrections gentle under load-hitch frame times', which pins the same
    // regime from the smoothness side.
    it('keeps the divergence servo alive at steady low fps', () => {
      const lab = new Lab(100, 125, { start: { x: 0, z: -1000 } });
      lab.setInput(mi({ forward: true }));
      for (let i = 0; i < 20; i++) lab.frame();
      lab.srv.player.pos.x += 1; // a server-side sidestep, well under the 6 yd snap
      const errs: number[] = [];
      for (let i = 0; i < 8; i++) {
        const r = lab.frame();
        if (!r.pose) throw new Error('predictor disabled unexpectedly');
        errs.push(Math.abs(r.pose.x - r.ac.x));
      }
      const report = `\n  lateral error by frame: ${errs.map((e) => e.toFixed(3)).join(' ')}`;
      // Strictly closing every frame is the decisive part: a held servo would
      // park the error on the leash boundary (0.75 yd here) instead. The rate
      // is the module's own bound, not this test's choice: at a 100 ms echo the
      // blend runs at min(12, 500/measureMs) with its dt capped at 1/30, about
      // 15% of the gap per frame, so a 1 yd sidestep is two thirds gone by the
      // sixth frame and under 0.15 yd by the eighth.
      errs.forEach((err, i) => {
        if (i > 0) expect(err, `frame ${i}${report}`).toBeLessThan(errs[i - 1]);
      });
      expect(errs[5], report).toBeLessThan(0.25);
      expect(errs[7], report).toBeLessThan(0.15);
    });

    // An isolated local hitch followed by an ordinary network gap must keep
    // the same display speed through both causes without exceeding the shared
    // maximum prediction horizon.
    it.each([
      [40, 156],
      [120, 156],
    ])(
      'keeps constant speed when a %ims-echo hitch of %ims is followed by a 500 ms gap',
      (lagMs, longMs) => {
        const lab = warmLab(lagMs);
        const record = recorder(lab);
        record('warm', FRAME_MS);
        lab.holdSnapshots = true;
        const gapFrames = Math.round(GAP_MS / FRAME_MS);
        const blocked = [...record('long', longMs), ...record('gap', FRAME_MS, gapFrames)];
        lab.holdSnapshots = false;
        // A 700 ms gap needs a longer tail than the short-burst arms: the
        // resume sweep is the whole gap replayed over one snapshot interval.
        const post = record('+', FRAME_MS, GAP_RECOVERY_FRAMES);
        const report = trace([...blocked, ...post]);
        const bound = (RUN_SPEED * SELF_MOTION_CAP_MAX_MS) / 1000 + 0.05;
        for (const step of [...blocked, ...post]) {
          expect(step.err, `${step.label}${report}`).toBeLessThanOrEqual(bound + 1e-6);
        }
        expectSteadyBand(blocked);
        expectSteadyBand(post);
        expectSteadyBand(post.slice(-8));
      },
    );

    // The local-hitch loan is temporary. A later network gap gets only its own
    // bounded prediction allowance and still runs at the normal display speed.
    it.each([[40], [120]])(
      'drains the hitch loan before a later smooth broadcast gap at %ims echo',
      (lagMs) => {
        const lab = warmLab(lagMs);
        const record = recorder(lab);
        record('warm', FRAME_MS);
        record('long', 156);
        record('settle', FRAME_MS, 60); // 1 s of ordinary frames: the loan drains
        lab.holdSnapshots = true; // now a network gap, with no hitch of its own
        const stall = record('stall', FRAME_MS, Math.round(250 / FRAME_MS));
        const report = trace(stall);
        const bound = (RUN_SPEED * SELF_MOTION_CAP_MAX_MS) / 1000 + 0.05;
        for (const step of stall)
          expect(step.err, `${step.label}${report}`).toBeLessThanOrEqual(bound + 1e-6);
        expectSteadyBand(stall);
      },
    );

    // The trigger is RELATIVE to the mirror's measured interval, not to a
    // hardcoded 50 ms. On a coalescing link that delivers every 70 ms, a 60 ms
    // frame is an ordinary frame (shorter than the interval, nothing was
    // swallowed) and must be left to the plain leash, while a 90 ms one is a
    // hitch and gets its episode.
    const COALESCED_MS = 70;
    function runCoalesced(lagMs: number, longMs: number): Step[] {
      const lab = new Lab(lagMs, FRAME_MS, {
        start: { x: 0, z: -1000 },
        deliverAfter: true,
        deliveryMs: COALESCED_MS,
      });
      lab.setInput(mi({ forward: true }));
      for (let i = 0; i < WARMUP_FRAMES; i++) lab.frame();
      const record = recorder(lab);
      record('warm', FRAME_MS);
      return [...record('long', longMs), ...record('+', FRAME_MS, AFTER_FRAMES)];
    }

    it.each([[40], [120]])(
      'treats a 90 ms frame as a hitch when the interval is 70 ms at %ims echo',
      (lagMs) => {
        const steps = runCoalesced(lagMs, 90);
        const report = trace(steps);
        // the frame's own ground, less the fixed-step accumulator's phase (the
        // kernel lands whole 50 ms ticks, so a 90 ms frame carries one or two)
        expect(steps[0].forward, `long${report}`).toBeGreaterThan(0.9 * RUN_SPEED * 0.09);
        expectSteadyBand(steps);
      },
    );

    // The other half of the same claim, and the one a fixed 50 ms threshold
    // would get wrong: under the measured interval nothing was swallowed, so
    // the frame is ordinary and the servo must NOT be held. Read through a
    // server-side sidestep injected just before the frame in question: the
    // ordinary frame keeps closing it, the hitch defers it for the settle
    // window. A 50 ms threshold defers both, a 100 ms one defers neither.
    it('scales the hitch trigger to the measured interval, not to a fixed 50 ms', () => {
      const lateralErrs = (longMs: number): number[] => {
        const lab = new Lab(40, FRAME_MS, {
          start: { x: 0, z: -1000 },
          deliverAfter: true,
          deliveryMs: COALESCED_MS,
        });
        lab.setInput(mi({ forward: true }));
        for (let i = 0; i < WARMUP_FRAMES; i++) lab.frame();
        // Under the plain leash budget on purpose: inside it only the servo
        // can close the gap, so this reads the servo and not the clamp.
        lab.srv.player.pos.x += 0.35;
        lab.frame(longMs);
        const errs: number[] = [];
        for (let i = 0; i < 6; i++) {
          const r = lab.frame();
          if (!r.pose) throw new Error('predictor disabled unexpectedly');
          errs.push(Math.abs(r.pose.x - r.ac.x));
        }
        return errs;
      };
      const ordinary = lateralErrs(60);
      const hitch = lateralErrs(90);
      const report =
        `\n  60 ms frame: ${ordinary.map((e) => e.toFixed(3)).join(' ')}` +
        `\n  90 ms frame: ${hitch.map((e) => e.toFixed(3)).join(' ')}`;
      // the ordinary frame leaves the servo running, so the divergence turns
      // around inside the window; the hitch defers it through its settle
      // window, where it is still opening
      expect(ordinary[5], report).toBeLessThan(ordinary[4]);
      expect(ordinary[5], report).toBeLessThan(0.5);
      expect(hitch[5], report).toBeGreaterThan(hitch[4]);
    });

    // Recurrence bound. A machine hitching every few frames must not be able
    // to keep the servo held forever: measured against a server that never
    // receives the intent (the display predicts a run the authority never
    // performs), the display has to stay on the leash instead of walking out
    // to the 6 yd re-adopt. SERVO_REFRACTORY_INTERVALS is what bounds it.
    it('bounds the display against a diverging server through repeated hitches', () => {
      const lab = new Lab(100, FRAME_MS, {
        start: { x: 0, z: -1000 },
        deliverAfter: true,
        serverDeaf: true,
      });
      lab.setInput(mi({ forward: true }));
      const record = recorder(lab);
      record('warm', FRAME_MS);
      const hitching: Step[] = [];
      for (let cycle = 0; cycle < 15; cycle++) {
        hitching.push(...record('run', FRAME_MS, 5), ...record('hitch', 120));
      }
      const settling = record('calm', FRAME_MS, 60);
      const report = trace([...hitching, ...settling]);
      const peak = Math.max(...hitching.map((step) => step.err));
      expect(peak, `peak${report}`).toBeLessThan(2.5);
      expect(peak, `peak${report}`).toBeLessThan(Math.sqrt(SELF_MOTION_SNAP_DIST_SQ));
      // and once the hitching stops the servo closes it back onto the leash
      expect(settling[settling.length - 1].err, `settled${report}`).toBeLessThan(
        lab.budget() + 1e-6,
      );
    });

    // Defensive inputs: ClientWorld hands over its live EWMA and last-apply
    // age, and a fresh or reset mirror can present 0 or a negative sentinel.
    // The core floors both, so the two frame shapes must be indistinguishable.
    it('treats a degenerate interval and a negative snapshot age as the floored pair', () => {
      const sim = new Sim({
        seed: SEED,
        playerClass: 'warrior',
        autoEquip: true,
        world: EMPTY_TEST_WORLD,
      });
      sim.setPlayerLevel(60);
      teleport(sim, 0, -1000);
      sim.player.facing = 0;
      const mirror = (): Entity => ({
        ...sim.player,
        pos: { ...sim.player.pos },
        prevPos: { ...sim.player.prevPos },
      });
      const sentinel = { self: mirror(), predictor: new SelfMotionPredictor(SEED) };
      const floored = { self: mirror(), predictor: new SelfMotionPredictor(SEED) };
      const step = (
        arm: { self: Entity; predictor: SelfMotionPredictor },
        frameDt: number,
        snapAgeMs: number,
        snapIntervalMs: number,
      ): Vec3Like => {
        const out = arm.predictor.step(arm.self, {
          enabled: true,
          moveInput: mi({ forward: true }),
          displayFacing: 0,
          echoMs: 100,
          jitterMs: 0,
          alpha: 1,
          frameDt,
          snapAgeMs,
          snapIntervalMs,
          riftFloor: null,
        });
        if (!out) throw new Error('predictor disabled unexpectedly');
        expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)).toBe(
          true,
        );
        return { ...out };
      };
      const pair = (frameDt: number, ageMs: number): { a: Vec3Like; b: Vec3Like } => ({
        a: step(sentinel, frameDt, ageMs < 0 ? -1 : ageMs, 0),
        b: step(floored, frameDt, Math.max(0, ageMs), 20),
      });
      for (let i = 0; i < 30; i++) pair(FRAME_MS / 1000, -1);
      const before = pair(FRAME_MS / 1000, -1);
      const hitch = pair(0.156, -1); // the isolated long frame
      const after = pair(FRAME_MS / 1000, 300); // ...and a stale frame behind it
      expect(hitch.a).toEqual(hitch.b);
      expect(after.a).toEqual(after.b);
      // The episode still opens despite the sentinel: the output advances by
      // the hitch duration within one fixed-step interpolation interval instead
      // of staying pinned to the base latency budget.
      expect(hitch.a.z - before.a.z).toBeGreaterThan(RUN_SPEED * (0.156 - DT));
      expect(after.a.z).toBeGreaterThan(hitch.a.z);
    });

    // A delivery burst with no long frame is a network gap. The display keeps
    // integrating its held input and the resume sweep does not change speed.
    it.each([
      [40, 15.5],
      [120, 12.0],
    ])(
      'keeps a delivery burst with no long frame at constant speed at %ims echo',
      (lagMs, peakYdS) => {
        const steps = runBurst(lagMs);
        const report = trace(steps);
        for (const step of steps) {
          expect(step.forward, `${step.label}${report}`).toBeGreaterThanOrEqual(-0.03);
          expect(step.speed, `${step.label}${report}`).toBeLessThanOrEqual(peakYdS);
        }
        expectSteadyBand(steps);
        expectSteadyBand(steps.slice(-8));
      },
    );
  });

  it('starts the jump arc locally without waiting for the server', () => {
    const lab = new Lab(150);
    lab.setInput(mi({ forward: true }));
    for (let i = 0; i < 30; i++) lab.frame();
    const groundY = lab.frame().pose?.y ?? 0;
    // hold jump across a full 50ms fixed step (a sub-step tap can fall between
    // 20 Hz samples, exactly like it can server-side)
    lab.setInput(mi({ forward: true, jump: true }));
    for (let i = 0; i < 4; i++) lab.frame();
    lab.setInput(mi({ forward: true }));
    let maxRise = 0;
    for (let i = 0; i < 12; i++) {
      const r = lab.frame(); // 200ms window, server still grounded for most of it
      if (r.pose) maxRise = Math.max(maxRise, r.pose.y - groundY);
    }
    expect(maxRise).toBeGreaterThan(0.3);
  });
});

// Issue #3479: prediction used to be switched off entirely inside a rift
// (src/main.ts's old `!isRiftPos(pe.pos.x)` gate), so every key press showed
// the full echo latency there while the overworld and regular dungeons stayed
// predicted. These scenarios drive Lab through a REAL procedural rift floor
// (Sim.enterRift, the same entry point the server uses) so the predictor's
// strip/reapply lift pair and its rift-token wall resolution are proven
// against the actual generated geometry, not a hand-built stand-in.
describe('rift prediction (issue #3479)', () => {
  // Procedural (no authored rooms), so riftLiftAt falls through to the z-band
  // platform ramp: flat below local z=84, height ~2.2206 from z=94 on, verified
  // directly against riftLiftAt below rather than hardcoded.
  const PLATFORM_SEED = 6;
  const PLATFORM_BASE_LEVEL = 20;
  // Same "chamber-waist" wall fixture tests/rift_wall_swept_collision.test.ts
  // pins: a real side wall at local x=35 inside the origin(slot, 0) room band.
  const WALL_SEED = 2;
  const WALL_BASE_LEVEL = 20;

  // Real ClientWorld teleport handling (online.ts TELEPORT_SNAP_DIST_SQ): a jump
  // this large re-anchors prevPos AT the new pos, no interpolation sweep. Lab's
  // own snapshot mirroring has no such collapse (nothing before this needed
  // one), so every scenario below applies it manually right after repositioning
  // the server player, instead of letting Lab glide across roughly 100000 yd
  // from the overworld start to the rift band.
  //
  // Deliberately NOT authoritativeDiscontinuity: that flag is reserved for a
  // completed /unstuck recovery (hasAuthoritativeSelfPositionDiscontinuity),
  // a narrower signal than "any large teleport". A rift entry is an ordinary
  // large jump, caught the same way any other one is: step()'s own anchor
  // check (the module header's "any gap over the renderer's 6 yd snap rule
  // resets outright") sees the collapsed mirror disagree with the predictor's
  // pre-jump history and resets from there, with no discontinuity flag
  // needed. This helper exists only to fast-forward past the ~100000 yd trip
  // from the overworld start Lab's constructor uses to the rift band, so the
  // scenarios below can start their assertions already on the rift floor.
  function collapseMirrorToServerPos(lab: Lab): void {
    lab.self.pos = { ...lab.srv.player.pos };
    lab.self.prevPos = { ...lab.srv.player.pos };
  }

  it('the predicted Y matches the server-lifted Y at rest on a raised tier, with no per-frame oscillation', () => {
    const platformFloor = generateRiftFloor(PLATFORM_SEED, PLATFORM_BASE_LEVEL, 0);
    const expectedLift = riftLiftAt(platformFloor, 0, 100);
    expect(expectedLift).toBeGreaterThan(1); // sanity: this local point is really raised

    const lab = new Lab(50);
    lab.srv.enterRift(PLATFORM_SEED, PLATFORM_BASE_LEVEL, lab.srv.player.id);
    const origin = lab.srv.riftFloor?.origin;
    if (!origin) throw new Error('rift floor did not spawn');
    const p = lab.srv.player;
    p.pos.x = origin.x;
    p.pos.z = origin.z + 100;
    p.pos.y = DUNGEON_FLOOR_Y;
    p.prevPos = { ...p.pos };
    p.vy = 0;
    p.onGround = true;
    lab.srv.tick(); // settle server-side: updateRiftTriggers lifts p.pos.y once
    expect(p.pos.y).toBeCloseTo(expectedLift, 6);
    collapseMirrorToServerPos(lab);

    // The reposition above is a real teleport (a rift entry always is): the
    // predictor's actor is already rooted correctly. What this test actually
    // proves is what happens AFTER, across many further frames with no input:
    // the strip/reapply pair around the kernel must keep re-deriving the SAME
    // lift every tick, or the display would drift or judder on the platform.
    // Vertical is never leash-clamped (a jump apex must not be), so this is
    // decisive: nothing else would mask a wrong or drifting lift here.
    const ys: number[] = [];
    for (let i = 0; i < 40; i++) {
      const r = lab.frame();
      if (r.pose) ys.push(r.pose.y);
    }
    expect(ys.length).toBeGreaterThan(30);
    for (const y of ys) {
      expect(y).toBeCloseTo(expectedLift, 2);
    }
    // No per-frame oscillation: consecutive settled samples barely move at all
    // (this is a STANDING player; any visible bobbing would show up here).
    for (let i = 1; i < ys.length; i++) {
      expect(Math.abs(ys[i] - ys[i - 1])).toBeLessThan(0.01);
    }
  });

  it('a jump from the raised tier arcs above the lift and settles back onto it, never sinking through', () => {
    const platformFloor = generateRiftFloor(PLATFORM_SEED, PLATFORM_BASE_LEVEL, 0);
    const expectedLift = riftLiftAt(platformFloor, 0, 100);

    const lab = new Lab(50);
    lab.srv.enterRift(PLATFORM_SEED, PLATFORM_BASE_LEVEL, lab.srv.player.id);
    const origin = lab.srv.riftFloor?.origin;
    if (!origin) throw new Error('rift floor did not spawn');
    const p = lab.srv.player;
    p.pos.x = origin.x;
    p.pos.z = origin.z + 100;
    p.pos.y = DUNGEON_FLOOR_Y;
    p.prevPos = { ...p.pos };
    p.vy = 0;
    p.onGround = true;
    lab.srv.tick();
    collapseMirrorToServerPos(lab);
    for (let i = 0; i < 10; i++) lab.frame(); // settle the mirror onto the lift

    lab.setInput(mi({ jump: true }));
    for (let i = 0; i < 4; i++) lab.frame(); // hold across a full 50ms server step
    lab.setInput(mi());
    let maxY = 0;
    for (let i = 0; i < 30; i++) {
      const r = lab.frame();
      if (r.pose) maxY = Math.max(maxY, r.pose.y);
    }
    // The arc goes measurably above the resting lift...
    expect(maxY).toBeGreaterThan(expectedLift + 0.3);
    // ...and once landed and fully settled (a further 1s, well past a normal
    // jump arc's flight time) it is back to EXACTLY the platform's lift (same
    // decisive tolerance as the at-rest test), not sunk into a tier the
    // flat-floor kernel would otherwise not know exists. Only the TAIL of the
    // window is asserted: the arc itself is still descending through part of
    // this window, and asserting on that part would just re-measure the jump.
    const ys: number[] = [];
    for (let i = 0; i < 60; i++) {
      const r = lab.frame();
      if (r.pose) ys.push(r.pose.y);
    }
    for (const y of ys.slice(-15)) {
      expect(y).toBeCloseTo(expectedLift, 2);
    }
  });

  // Regression pin for a bug the first version of this fix shipped: the lift
  // was stripped/reapplied per kernel step INSIDE the DT loop, so it was
  // correct at the moment each step ran, but the divergence servo and the
  // horizontal leash clamp both run AFTER the loop and can still move x/z
  // (that is their whole job under lag) without ever recomputing the lift for
  // where they moved it to. On a flat plateau that is invisible (the lift is
  // constant either side of any such shift); it only shows up walking the
  // ramp itself, where the lift is a function of z. lagMs 300 keeps the servo
  // and the leash both continuously active for the whole traverse (the same
  // budget reasoning as the wall test below), so this is decisive, not just
  // theoretically exercising the path.
  it('the predicted Y matches the lift at wherever x/z actually ends up while walking up a ramp under lag', () => {
    const platformFloor = generateRiftFloor(PLATFORM_SEED, PLATFORM_BASE_LEVEL, 0);
    // Sanity: the ramp is really a ramp over this span (not flat, not already
    // fully raised), so the assertion below is actually exercising a
    // position-varying lift, not a constant.
    expect(riftLiftAt(platformFloor, 0, 80)).toBe(0);
    expect(riftLiftAt(platformFloor, 0, 89)).toBeGreaterThan(0);
    expect(riftLiftAt(platformFloor, 0, 89)).toBeLessThan(riftLiftAt(platformFloor, 0, 100));

    const lab = new Lab(300, FRAME_MS, { facing: 0 }); // facing 0: +z, straight up the ramp
    lab.srv.enterRift(PLATFORM_SEED, PLATFORM_BASE_LEVEL, lab.srv.player.id);
    const origin = lab.srv.riftFloor?.origin;
    if (!origin) throw new Error('rift floor did not spawn');
    const p = lab.srv.player;
    p.pos.x = origin.x;
    p.pos.z = origin.z + 70; // flat, well short of the ramp's rampZ0=84
    p.pos.y = DUNGEON_FLOOR_Y;
    p.prevPos = { ...p.pos };
    p.vy = 0;
    p.onGround = true;
    p.facing = 0;
    lab.srv.tick();
    collapseMirrorToServerPos(lab);
    for (let i = 0; i < 10; i++) lab.frame(); // settle the mirror

    lab.setInput(mi({ forward: true }));
    // 4s comfortably crosses the flat lead-in (z 70-84) and carries well into
    // the ramp itself (84-94), leash-bounded well under full run speed; it
    // does not reach the plateau (94+) at this lag budget, which the
    // maxLocalZ/liftedSamples assertions below pin directly rather than
    // leaving to a comment a future speed or leash change could silently
    // outdate.
    let sampled = 0;
    let maxLocalZ = Number.NEGATIVE_INFINITY;
    let liftedSamples = 0;
    for (let i = 0; i < 240; i++) {
      const r = lab.frame();
      if (!r.pose) continue;
      const localX = r.pose.x - origin.x;
      const localZ = r.pose.z - origin.z;
      const expected = riftLiftAt(platformFloor, localX, localZ);
      // 0.02 yd (under a centimeter), not the tighter 0.005 the at-rest tests
      // use: right at the ramp's kink (rampZ0) the OUTPUT itself linearly
      // interpolates x/z and y separately across one sub-frame step, and the
      // lift function is not linear across that exact point, so a one- or
      // two-frame sub-visual residual there is real and expected, not a
      // regression. The bug this test exists to catch (the servo/leash not
      // recomputing the lift after moving x/z) was an order of magnitude
      // larger: ~0.22 yd of Y error per yard of x/z correction on this same
      // ramp slope.
      expect(
        Math.abs(r.pose.y - expected),
        `frame ${i} at local z=${localZ.toFixed(2)}: expected ~${expected.toFixed(4)}, got ${r.pose.y.toFixed(4)}`,
      ).toBeLessThan(0.02);
      sampled++;
      maxLocalZ = Math.max(maxLocalZ, localZ);
      if (expected > 0) liftedSamples++;
    }
    expect(sampled).toBeGreaterThan(200);
    // Decisive traversal pins: the run must actually carry well onto the
    // ramp's rising slope (not just brush its start) while staying short of
    // the plateau, and a solid share of the 4s window must land on the
    // lifted (z > 84) part. A future speed or leash change that quietly
    // shrank the ramp portion toward zero would still pass `sampled > 200`
    // (a pose is produced on flat ground too), so these two are what
    // actually hold the traversal this test claims to exercise.
    expect(maxLocalZ).toBeGreaterThan(85);
    expect(maxLocalZ).toBeLessThan(94);
    expect(liftedSamples).toBeGreaterThan(80);
  });

  it('the predicted pose stops at a rift wall, never crossing it while running into it', () => {
    // facing: PI/2 (+x, toward the wall) as a constructor opt, not just on
    // the entity: the predictor's displayFacing reads Lab's OWN readonly
    // facing field, set once here, never the live entity's p.facing.
    // lagMs 300 gives a generous leash budget (~2 yd), so only the
    // predictor's OWN local wall resolution can hold it short of the wall:
    // a small budget would pass this test vacuously (the leash alone already
    // keeps the display within a fraction of a yard of the (also correctly
    // blocked) server anchor, whether or not local collision resolves at all).
    const lab = new Lab(300, FRAME_MS, { facing: Math.PI / 2 });
    lab.srv.enterRift(WALL_SEED, WALL_BASE_LEVEL, lab.srv.player.id);
    const origin = lab.srv.riftFloor?.origin;
    if (!origin) throw new Error('rift floor did not spawn');
    const p = lab.srv.player;
    // The same "chamber-waist" wall the swept-collision fixture pins (local
    // x=35), approached along z=70 (verified clear) rather than that
    // fixture's own single-shot teleport start point (z=61): stepped
    // movement there is a pre-existing dead spot unrelated to this fix
    // (resolveMovement's ejection guard rejects every iterative step from
    // that exact point, in every direction), so it cannot host a WALKED
    // approach. Server-verified along z=70 to run freely and stop at local
    // x=33.5.
    p.pos.x = origin.x + 33;
    p.pos.z = origin.z + 70;
    p.pos.y = DUNGEON_FLOOR_Y;
    p.prevPos = { ...p.pos };
    p.vy = 0;
    p.onGround = true;
    p.facing = Math.PI / 2; // face +x, straight at the wall
    lab.srv.tick();
    collapseMirrorToServerPos(lab);
    for (let i = 0; i < 10; i++) lab.frame(); // settle the mirror

    lab.setInput(mi({ forward: true }));
    let maxLocalX = Number.NEGATIVE_INFINITY;
    let sampled = 0;
    const localXs: number[] = [];
    // The wall must hold the predicted pose at its real block face
    // (server-verified 33.5) the whole way, not just at the end.
    for (let i = 0; i < 120; i++) {
      const r = lab.frame();
      if (!r.pose) continue;
      const localX = r.pose.x - origin.x;
      maxLocalX = Math.max(maxLocalX, localX);
      localXs.push(localX);
      sampled++;
    }
    // A pose must actually be produced across most of the run, or the bound
    // below is satisfied vacuously by prediction being off the whole time
    // (exactly the failure mode: a rift floor riftFloor never populated for,
    // e.g. a resumed session, suspends prediction entirely and this loop
    // would otherwise pass on zero samples).
    expect(sampled).toBeGreaterThan(100);
    expect(maxLocalX).toBeLessThan(34.5);
    // A full yard of slack against the real block face (33.5) would also let
    // the local wall resolution silently do nothing (leaving the leash alone
    // to hold the pose near the server anchor) and still pass; pin the lower
    // bound too, so a regression that stops resolving the wall locally shows
    // up here even while the leash still masks it from the naive test.
    expect(maxLocalX).toBeGreaterThan(33.4);
    // No backward step once the run reaches the wall: the issue's own
    // acceptance criterion ("no backward step when the authoritative anchor
    // catches up"), which nothing above asserts on its own.
    for (let i = 1; i < localXs.length; i++) {
      expect(localXs[i]).toBeGreaterThanOrEqual(localXs[i - 1] - 1e-6);
    }
  });

  it('suspends prediction while riftSliding is true and resumes once it clears', () => {
    // The ice slide is server-driven and unmirrored (self_motion.ts module
    // header): step()'s early-return gate on self.riftSliding is what hands
    // control back to the authoritative fallback for its duration, the same
    // way the Valkyr's Calling flight aura suspends grounded prediction
    // (tests/paladin_valkyrs_calling.test.ts). Nothing else in this suite
    // exercises that gate directly.
    const lab = new Lab(50);
    lab.srv.enterRift(PLATFORM_SEED, PLATFORM_BASE_LEVEL, lab.srv.player.id);
    lab.srv.tick();
    collapseMirrorToServerPos(lab);
    expect(lab.frame().pose).not.toBeNull();

    lab.self.riftSliding = true;
    expect(lab.frame().pose).toBeNull();

    lab.self.riftSliding = false;
    expect(lab.frame().pose).not.toBeNull();
  });
});
