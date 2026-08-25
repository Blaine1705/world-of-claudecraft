import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Postgres is mocked before the server/game import the harness pulls in
// (tests/CLAUDE.md, Server tests). Superset shape, copied from
// tests/unstuck_online.test.ts.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  saveMarketState: vi.fn(async () => {}),
  saveMailState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  acquireCharacterLease: vi.fn(async () => true),
  releaseCharacterLease: vi.fn(async () => {}),
  heartbeatCharacterLeases: vi.fn(async () => {}),
  releaseAllCharacterLeases: vi.fn(async () => {}),
}));

import { DT, emptyMoveInput, type MoveInput, RUN_SPEED } from '../src/sim/types';
import type { LatencyLinkConfig } from './helpers/latency_link';
import {
  COLLIDER_FREE_LANE,
  type Pose,
  runTwinServerTrajectory,
} from './helpers/movement_ground_truth';
import {
  computeMovementMetrics,
  type GroundTruthSample,
  MOVEMENT_FEEL_TARGETS,
  MOVEMENT_FEEL_TARGETS_CC,
  type MovementMetrics,
  type MovementMetricsOptions,
} from './helpers/movement_metrics';
import {
  createOnlineHarness,
  type FrameScript,
  frameCommandsToTickScript,
  type HarnessRun,
  type OnlineHarness,
  type RunScriptOptions,
  SERVER_TICK_MS,
} from './helpers/online_harness';
import { stripComments } from './helpers/strip_comments';

// The v0.41.0 movement-feel BASELINE: what the real online client actually
// draws for the local player under simulated latency, measured against what the
// authority would have done with no latency at all.
//
// This suite is deliberately a PIN, not a bar. Every number in BASELINE came
// out of a run of this file and was hand-carried here from the reported
// measurement; none was chosen, and none is derived at test time (a table the
// run computes for itself would compare the code to itself and pass forever).
// UPDATE_MOVEMENT_BASELINE_DOC only regenerates the committed MARKDOWN from
// BASELINE; the numbers themselves are always a human transcribing a run.
//
// While STRICT_MOVEMENT_TARGETS is off (the default) the assertions hold
// today's behavior in place, so the reconciliation rework shows up here as a
// diff in either direction, improvement included. MOVEMENT_FEEL_TARGETS (and
// MOVEMENT_FEEL_TARGETS_CC where the server legitimately overrides the client)
// is the bar the rework is aiming at; setting STRICT_MOVEMENT_TARGETS=1 asserts
// against it instead, and the cells that fail then are exactly the work.

const STRICT = process.env.STRICT_MOVEMENT_TARGETS === '1';
const UPDATE_TABLE = process.env.UPDATE_MOVEMENT_BASELINE_DOC === '1';
const BASELINE_DOC = join(import.meta.dirname, 'movement_latency_baseline.md');
const MAIN_TS = join(import.meta.dirname, '..', 'src', 'main.ts');
/** A stretch of the straight run with the key long since down and not yet
 *  released: what "steady" means for the lane-sanity check. */
const STEADY_FIRST_TICK = 20;
const STEADY_LAST_TICK = 40;

/** Per-direction delay envelope; a profile's RTT splits evenly across the two. */
function link(rttMs: number, jitterMs: number): LatencyLinkConfig {
  return {
    toServer: { baseMs: rttMs / 2, jitterMs, seed: 1337 },
    toClient: { baseMs: rttMs / 2, jitterMs, seed: 4242 },
  };
}

interface Profile {
  key: string;
  label: string;
  latency: LatencyLinkConfig;
}

const PROFILES: readonly Profile[] = [
  { key: 'rtt0', label: '0 ms', latency: link(0, 0) },
  { key: 'rtt50', label: '50 ms', latency: link(50, 0) },
  { key: 'rtt150j20', label: '150 ms + 20 jitter', latency: link(150, 20) },
  { key: 'rtt300j40', label: '300 ms + 40 jitter', latency: link(300, 40) },
];

const RUN_MS = 3000;

/** Forward for 3 s, then release and let the display settle for 1 s. */
const straightRun: RunScriptOptions = {
  durationMs: 4000,
  script: [
    { atMs: 0, mi: { forward: true }, facing: 0 },
    { atMs: RUN_MS, mi: { forward: false } },
  ],
};

/** Forward held while the heading sweeps 90 degrees, mouselook style. */
const curvedSteering: RunScriptOptions = {
  durationMs: RUN_MS,
  script: [{ atMs: 0, mi: { forward: true }, facing: 0 }],
  facingAt: (tMs) => (Math.PI / 4) * Math.sin((2 * Math.PI * tMs) / 2000),
};

/** Forward plus a strafe that flips every 500 ms. */
const strafeWeave: RunScriptOptions = {
  durationMs: RUN_MS,
  script: (() => {
    const script: FrameScript = [{ atMs: 0, mi: { forward: true, strafeLeft: true }, facing: 0 }];
    const out = [...script];
    for (let i = 1; i * 500 < RUN_MS; i++) {
      out.push({
        atMs: i * 500,
        mi: { strafeLeft: i % 2 === 0, strafeRight: i % 2 === 1 },
      });
    }
    return out;
  })(),
};

/** A jump taken mid-run, held for one input quantum. */
const runWithJump: RunScriptOptions = {
  durationMs: RUN_MS,
  script: [
    { atMs: 0, mi: { forward: true }, facing: 0 },
    { atMs: 1500, mi: { jump: true } },
    { atMs: 1600, mi: { jump: false } },
  ],
};

/** Five 300 ms taps with 300 ms between them. */
const startStopTapping: RunScriptOptions = {
  durationMs: RUN_MS,
  script: (() => {
    const out: FrameScript[number][] = [{ atMs: 0, mi: {}, facing: 0 }];
    for (let i = 0; i < 5; i++) {
      out.push({ atMs: i * 600, mi: { forward: true } });
      out.push({ atMs: i * 600 + 300, mi: { forward: false } });
    }
    return out;
  })(),
};

interface Scenario {
  key: string;
  label: string;
  options: RunScriptOptions;
  /** Per-scenario metric tuning; the default ramp window is 150 ms. */
  metrics?: MovementMetricsOptions;
}

const SCENARIOS: readonly Scenario[] = [
  { key: 'straight', label: 'straight run + stop', options: straightRun },
  { key: 'curved', label: 'curved steering', options: curvedSteering },
  { key: 'weave', label: 'strafe weave', options: strafeWeave },
  { key: 'jump', label: 'run with jump', options: runWithJump },
  {
    key: 'tapping',
    label: 'start-stop tapping',
    options: startStopTapping,
    // The taps are 300 ms apart, so the default 150 ms ramp window would
    // exclude the entire timeline and leave the steady metrics vacuous. 100 ms
    // still covers every transition (the start dead-time is 50 ms) and leaves
    // the middle of each tap measurable.
    metrics: { rampWindowMs: 100 },
  },
];

/** The pinned numbers, one row per measured cell. */
interface BaselineRow {
  backwardCount: number;
  backwardWorstYd: number;
  deviationMaxYd: number;
  deviationMeanYd: number;
  progressMaxAbsYd: number;
  progressTerminalYd: number;
  speedErrYdPerSec: number;
  speedDeltaYdPerSec: number;
  correctionEvents: number;
}

function rowOf(metrics: MovementMetrics): BaselineRow {
  return {
    backwardCount: metrics.backwardSteps.count,
    backwardWorstYd: metrics.backwardSteps.worstYd,
    deviationMaxYd: metrics.pathDeviation.maxYd,
    deviationMeanYd: metrics.pathDeviation.meanYd,
    progressMaxAbsYd: metrics.progressError.maxAbsYd,
    progressTerminalYd: metrics.progressError.terminalYd,
    speedErrYdPerSec: metrics.speedContinuity.maxSpeedErr,
    speedDeltaYdPerSec: metrics.speedContinuity.maxSpeedDelta,
    correctionEvents: metrics.correctionEvents.count,
  };
}

interface CellResult {
  run: HarnessRun;
  truth: GroundTruthSample[];
  metrics: MovementMetrics;
  /** The zero-latency twin's full per-tick poses, kept for the honesty check
   *  (which compares facing too). Null for an authoritative-reference cell. */
  twinPoses: Pose[] | null;
}

/**
 * Which authority a cell is scored against.
 *  zeroLatency  - the twin GameServer running the same intent timeline with no
 *                 latency at all: the reference for "what should this have
 *                 looked like".
 *  authoritative- the harness's OWN server ticks. Used where server-side state
 *                 the twin cannot see (a stun, a snare applied to this world's
 *                 entity) makes the zero-latency trajectory a fiction; the
 *                 question there is whether the display agrees with the
 *                 authority it actually had.
 */
type Reference = 'zeroLatency' | 'authoritative';

/** The pose the authority holds at scenario time 0, before its first tick. */
const START_SAMPLE: GroundTruthSample = {
  tick: -1,
  x: COLLIDER_FREE_LANE.x,
  z: COLLIDER_FREE_LANE.z,
};

function zeroLatencyTruth(poses: readonly Pose[]): GroundTruthSample[] {
  return [START_SAMPLE, ...poses.map((pose, index) => ({ tick: index, x: pose.x, z: pose.z }))];
}

function authoritativeTruth(run: HarnessRun): GroundTruthSample[] {
  return [START_SAMPLE, ...run.ticks.map((tick) => ({ tick: tick.tick, x: tick.x, z: tick.z }))];
}

function measure(
  latency: LatencyLinkConfig,
  options: RunScriptOptions,
  reference: Reference = 'zeroLatency',
  withHarness?: (harness: OnlineHarness, options: RunScriptOptions) => RunScriptOptions,
  metricOptions: MovementMetricsOptions = {},
): CellResult {
  const harness = createOnlineHarness({ latency });
  try {
    const resolved = withHarness ? withHarness(harness, options) : options;
    const run = harness.runScript(resolved);
    const twinPoses =
      reference === 'zeroLatency'
        ? runTwinServerTrajectory({ script: run.tickScript, ticks: run.tickCount })
        : null;
    const truth = twinPoses ? zeroLatencyTruth(twinPoses) : authoritativeTruth(run);
    const metrics = computeMovementMetrics(
      run.frames.map((frame) => ({ tMs: frame.tMs, x: frame.x, z: frame.z })),
      truth,
      run.commands,
      // The tick phase is stated rather than defaulted: a ground-truth sample
      // dates at the END of the tick that produced it, so the phase IS the
      // period, and a silent default here would silently re-date every sample
      // if the metric's default ever moved.
      { tickMs: SERVER_TICK_MS, tickPhaseMs: SERVER_TICK_MS, ...metricOptions },
    );
    return { run, truth, metrics, twinPoses };
  } finally {
    harness.dispose();
  }
}

const cells = new Map<string, CellResult>();
const cellKey = (scenario: string, profile: string): string => `${scenario}/${profile}`;

// --- adversarial cells (all at 150 ms + 20 ms jitter) ---

const ADVERSARIAL_PROFILE = link(150, 20);
const STALL_AT_MS = 1500;
const STALL_MS = 500;
const CC_AT_MS = 1500;

const stallRun: RunScriptOptions = {
  durationMs: RUN_MS,
  script: [{ atMs: 0, mi: { forward: true }, facing: 0 }],
};

function withStall(harness: OnlineHarness, options: RunScriptOptions): RunScriptOptions {
  return {
    ...options,
    actions: [
      {
        atMs: STALL_AT_MS,
        // Head-of-line blocking on the downstream: every snapshot already in
        // flight is held too, which is what a congestion burst does.
        run: () => harness.link.stall('toClient', harness.clock.now() + STALL_MS),
      },
    ],
  };
}

/** The aura shape effect_dispatch applies, pushed straight onto the authority. */
function withServerAura(
  kind: 'stun' | 'slow',
  value: number,
  seconds: number,
): (harness: OnlineHarness, options: RunScriptOptions) => RunScriptOptions {
  return (harness, options) => ({
    ...options,
    actions: [
      {
        atMs: CC_AT_MS,
        run: () => {
          harness.serverEntity.auras.push({
            id: `harness_${kind}`,
            name: kind === 'stun' ? 'Harness Stun' : 'Harness Snare',
            kind,
            remaining: seconds,
            duration: seconds,
            value,
            sourceId: harness.pid,
            school: 'physical',
          });
        },
      },
    ],
  });
}

beforeAll(() => {
  for (const scenario of SCENARIOS) {
    for (const profile of PROFILES) {
      cells.set(
        cellKey(scenario.key, profile.key),
        measure(profile.latency, scenario.options, 'zeroLatency', undefined, scenario.metrics),
      );
    }
  }
  cells.set(
    'adv-stall/rtt150j20',
    measure(ADVERSARIAL_PROFILE, stallRun, 'zeroLatency', withStall),
  );
  cells.set(
    'adv-stun/rtt150j20',
    measure(ADVERSARIAL_PROFILE, stallRun, 'authoritative', withServerAura('stun', 0, 1)),
  );
  cells.set(
    'adv-snare/rtt150j20',
    measure(ADVERSARIAL_PROFILE, stallRun, 'authoritative', withServerAura('slow', 0.5, 1)),
  );
}, 60_000);

function cell(key: string): CellResult {
  const found = cells.get(key);
  if (!found) throw new Error(`no measured cell ${key}`);
  return found;
}

const YD_DIGITS = 4;

function expectPinned(key: string, pinned: BaselineRow): void {
  const measured = rowOf(cell(key).metrics);
  expect(measured.backwardCount).toBe(pinned.backwardCount);
  expect(measured.correctionEvents).toBe(pinned.correctionEvents);
  expect(measured.backwardWorstYd).toBeCloseTo(pinned.backwardWorstYd, YD_DIGITS);
  expect(measured.deviationMaxYd).toBeCloseTo(pinned.deviationMaxYd, YD_DIGITS);
  expect(measured.deviationMeanYd).toBeCloseTo(pinned.deviationMeanYd, YD_DIGITS);
  expect(measured.progressMaxAbsYd).toBeCloseTo(pinned.progressMaxAbsYd, YD_DIGITS);
  expect(measured.progressTerminalYd).toBeCloseTo(pinned.progressTerminalYd, YD_DIGITS);
  expect(measured.speedErrYdPerSec).toBeCloseTo(pinned.speedErrYdPerSec, YD_DIGITS);
  expect(measured.speedDeltaYdPerSec).toBeCloseTo(pinned.speedDeltaYdPerSec, YD_DIGITS);
}

/** The cells scored against the crowd-control bar: the server is overriding the
 *  client's speed there, so the ordinary speed and correction targets would be
 *  asserting against correct behavior (see MOVEMENT_FEEL_TARGETS_CC). */
const CC_TARGET_CELLS = new Set(['adv-stun/rtt150j20', 'adv-snare/rtt150j20']);

function expectTargets(key: string): void {
  const metrics = cell(key).metrics;
  if (CC_TARGET_CELLS.has(key)) {
    expect(metrics.backwardSteps.worstYd).toBeGreaterThanOrEqual(
      -MOVEMENT_FEEL_TARGETS_CC.backwardStepYd,
    );
    expect(Math.abs(metrics.progressError.terminalYd)).toBeLessThanOrEqual(
      MOVEMENT_FEEL_TARGETS_CC.settleYd,
    );
    return;
  }
  expect(metrics.correctionEvents.count).toBe(MOVEMENT_FEEL_TARGETS.correctionEvents);
  // Worst magnitude AND count: a run that snaps back a hair on every single
  // frame is exactly the artifact this bar exists for, and a magnitude-only
  // assertion would pass it.
  expect(metrics.backwardSteps.count).toBe(0);
  expect(metrics.backwardSteps.worstYd).toBeGreaterThanOrEqual(
    -MOVEMENT_FEEL_TARGETS.backwardStepYd,
  );
  expect(metrics.pathDeviation.maxYd).toBeLessThanOrEqual(MOVEMENT_FEEL_TARGETS.pathDeviationYd);
  expect(metrics.progressError.maxAbsYd).toBeLessThanOrEqual(MOVEMENT_FEEL_TARGETS.progressMaxYd);
  expect(metrics.speedContinuity.maxSpeedErr).toBeLessThanOrEqual(
    MOVEMENT_FEEL_TARGETS.speedErrYdPerSec,
  );
  expect(metrics.speedContinuity.maxSpeedDelta).toBeLessThanOrEqual(
    MOVEMENT_FEEL_TARGETS.speedDeltaYdPerSec,
  );
  expect(Math.abs(metrics.progressError.terminalYd)).toBeLessThanOrEqual(
    MOVEMENT_FEEL_TARGETS.settleYd,
  );
}

const BASELINE: Record<string, BaselineRow> = {
  'straight/rtt0': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.18961,
    progressTerminalYd: -0.038187,
    speedErrYdPerSec: 2.07826,
    speedDeltaYdPerSec: 2.183506,
    correctionEvents: 0,
  },
  'straight/rtt50': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.265887,
    progressTerminalYd: -0.004419,
    speedErrYdPerSec: 2.132971,
    speedDeltaYdPerSec: 2.160247,
    correctionEvents: 0,
  },
  'straight/rtt150j20': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.305148,
    progressTerminalYd: 0.304669,
    speedErrYdPerSec: 2.033319,
    speedDeltaYdPerSec: 2.490148,
    correctionEvents: 0,
  },
  'straight/rtt300j40': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.523049,
    progressTerminalYd: 0.096365,
    speedErrYdPerSec: 3.531797,
    speedDeltaYdPerSec: 3.617252,
    correctionEvents: 0,
  },
  'curved/rtt0': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0.058574,
    deviationMeanYd: 0.026103,
    progressMaxAbsYd: 0.192994,
    progressTerminalYd: -0.086473,
    speedErrYdPerSec: 1.970705,
    speedDeltaYdPerSec: 2.19506,
    correctionEvents: 0,
  },
  'curved/rtt50': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0.250757,
    deviationMeanYd: 0.110001,
    progressMaxAbsYd: 0.329894,
    progressTerminalYd: -0.164181,
    speedErrYdPerSec: 2.198417,
    speedDeltaYdPerSec: 2.160969,
    correctionEvents: 0,
  },
  'curved/rtt150j20': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0.190483,
    deviationMeanYd: 0.093339,
    progressMaxAbsYd: 0.328916,
    progressTerminalYd: -0.047454,
    speedErrYdPerSec: 1.661888,
    speedDeltaYdPerSec: 2.217952,
    correctionEvents: 0,
  },
  'curved/rtt300j40': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0.173885,
    deviationMeanYd: 0.068397,
    progressMaxAbsYd: 0.555042,
    progressTerminalYd: -0.317116,
    speedErrYdPerSec: 2.457945,
    speedDeltaYdPerSec: 2.523584,
    correctionEvents: 0,
  },
  'weave/rtt0': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0.116667,
    deviationMeanYd: 0.012329,
    progressMaxAbsYd: 0.25481,
    progressTerminalYd: -0.088012,
    speedErrYdPerSec: 1.99744,
    speedDeltaYdPerSec: 2.137725,
    correctionEvents: 0,
  },
  'weave/rtt50': {
    backwardCount: 0,
    backwardWorstYd: -0.000145,
    deviationMaxYd: 0.100398,
    deviationMeanYd: 0.007365,
    progressMaxAbsYd: 0.285644,
    progressTerminalYd: -0.156758,
    speedErrYdPerSec: 2.036255,
    speedDeltaYdPerSec: 2.129034,
    correctionEvents: 0,
  },
  'weave/rtt150j20': {
    backwardCount: 7,
    backwardWorstYd: -0.004587,
    deviationMaxYd: 0.638889,
    deviationMeanYd: 0.247281,
    progressMaxAbsYd: 0.87362,
    progressTerminalYd: 0.214365,
    speedErrYdPerSec: 5.153198,
    speedDeltaYdPerSec: 4.989962,
    correctionEvents: 3,
  },
  'weave/rtt300j40': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0.257528,
    deviationMeanYd: 0.100556,
    progressMaxAbsYd: 0.730342,
    progressTerminalYd: -0.378675,
    speedErrYdPerSec: 4.183016,
    speedDeltaYdPerSec: 4.398782,
    correctionEvents: 0,
  },
  'jump/rtt0': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.18961,
    progressTerminalYd: -0.085872,
    speedErrYdPerSec: 2.07826,
    speedDeltaYdPerSec: 2.183506,
    correctionEvents: 0,
  },
  'jump/rtt50': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.265887,
    progressTerminalYd: -0.159874,
    speedErrYdPerSec: 2.132971,
    speedDeltaYdPerSec: 2.160247,
    correctionEvents: 0,
  },
  'jump/rtt150j20': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.305148,
    progressTerminalYd: -0.155496,
    speedErrYdPerSec: 2.033319,
    speedDeltaYdPerSec: 2.490148,
    correctionEvents: 0,
  },
  'jump/rtt300j40': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.523049,
    progressTerminalYd: -0.280528,
    speedErrYdPerSec: 3.531797,
    speedDeltaYdPerSec: 3.617252,
    correctionEvents: 0,
  },
  'tapping/rtt0': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.202831,
    progressTerminalYd: -0.038099,
    speedErrYdPerSec: 0.955161,
    speedDeltaYdPerSec: 0.674746,
    correctionEvents: 0,
  },
  'tapping/rtt50': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.273222,
    progressTerminalYd: -0.002375,
    speedErrYdPerSec: 1.287313,
    speedDeltaYdPerSec: 1.414168,
    correctionEvents: 0,
  },
  'tapping/rtt150j20': {
    backwardCount: 2,
    backwardWorstYd: -0.00242,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 1.22175,
    progressTerminalYd: -0.858518,
    speedErrYdPerSec: 1.058307,
    speedDeltaYdPerSec: 1.058307,
    correctionEvents: 0,
  },
  'tapping/rtt300j40': {
    backwardCount: 0,
    backwardWorstYd: 0,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.233333,
    progressTerminalYd: 0.156151,
    speedErrYdPerSec: 0.375728,
    speedDeltaYdPerSec: 0.163056,
    correctionEvents: 0,
  },
  'adv-stall/rtt150j20': {
    backwardCount: 12,
    backwardWorstYd: -0.016,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 3.371015,
    progressTerminalYd: -0.124394,
    speedErrYdPerSec: 7.157228,
    speedDeltaYdPerSec: 6.406418,
    correctionEvents: 6,
  },
  'adv-stun/rtt150j20': {
    backwardCount: 12,
    backwardWorstYd: -0.378075,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.966071,
    progressTerminalYd: 0.031886,
    speedErrYdPerSec: 15.684526,
    speedDeltaYdPerSec: 14.927639,
    correctionEvents: 8,
  },
  'adv-snare/rtt150j20': {
    backwardCount: 1,
    backwardWorstYd: -0.18656,
    deviationMaxYd: 0,
    deviationMeanYd: 0,
    progressMaxAbsYd: 0.557738,
    progressTerminalYd: 0.198905,
    speedErrYdPerSec: 6.201855,
    speedDeltaYdPerSec: 9.980314,
    correctionEvents: 1,
  },
};

const CELL_LABELS: Record<string, string> = {
  'adv-stall/rtt150j20': 'HOL stall 500 ms mid-run',
  'adv-stun/rtt150j20': 'server stun mid-run',
  'adv-snare/rtt150j20': 'server snare mid-run',
};

function formatRow(key: string, row: BaselineRow): string {
  const label =
    CELL_LABELS[key] ??
    (() => {
      const [scenario, profile] = key.split('/');
      const scenarioLabel = SCENARIOS.find((entry) => entry.key === scenario)?.label ?? scenario;
      const profileLabel = PROFILES.find((entry) => entry.key === profile)?.label ?? profile;
      return `${scenarioLabel} @ ${profileLabel}`;
    })();
  const cells3 = [
    row.backwardCount.toString(),
    row.backwardWorstYd.toFixed(4),
    row.deviationMaxYd.toFixed(3),
    row.deviationMeanYd.toFixed(3),
    row.progressMaxAbsYd.toFixed(3),
    row.progressTerminalYd.toFixed(3),
    row.speedErrYdPerSec.toFixed(2),
    row.speedDeltaYdPerSec.toFixed(2),
    row.correctionEvents.toString(),
  ];
  return `| ${label} | ${cells3.join(' | ')} |`;
}

function renderBaselineDoc(): string {
  const header = [
    '<!-- Generated from tests/movement_latency_baseline.test.ts (BASELINE).',
    '     Regenerate with UPDATE_MOVEMENT_BASELINE_DOC=1 npx vitest run',
    '     tests/movement_latency_baseline.test.ts; never hand-edit. -->',
    '',
    '# Movement latency baseline (v0.41.0)',
    '',
    'What the online client DRAWS for the local player, scored against the',
    'zero-latency authoritative trajectory for the same intent timeline.',
    'Yards and yards per second; back = backward steps, dev = path deviation,',
    'prog = along-path progress error, corr = correction events.',
    '',
    "The two crowd-control rows are scored against the harness server's OWN",
    'ticks instead: the zero-latency twin never receives the aura, so its',
    'trajectory would be a fiction to compare against.',
    '',
    '| cell | back n | back worst | dev max | dev mean | prog max | prog settle | speed err | speed delta | corr |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const rows = Object.entries(BASELINE).map(([key, row]) => formatRow(key, row));
  return `${[...header, ...rows].join('\n')}\n`;
}

describe('zero-latency ground-truth script conversion', () => {
  // The convention every measurement rests on, pinned on its own: tick k runs
  // at (k + 1) * 50 ms, so it acts on the last intent put on the wire at or
  // before that instant.
  const neutral = emptyMoveInput();
  const forward: MoveInput = { ...neutral, forward: true };

  it('gives a tick the last intent sent strictly before the instant it runs', () => {
    const script = frameCommandsToTickScript(
      [
        { tMs: 0, mi: neutral, facing: 0 },
        { tMs: 16.7, mi: forward, facing: 0.25 },
        { tMs: 50, mi: neutral, facing: 0.5 },
        { tMs: 83.3, mi: forward, facing: 0.75 },
      ],
      3,
    );

    // Tick 0 runs at 50 ms, and the frame sent AT that instant is handled
    // after it: the client's unconditional send timer is phase-aligned with
    // the world loop, so its 50 ms beat lands on tick 1.
    expect(script[0]).toEqual({ tick: 0, mi: forward, facing: 0.25 });
    // Tick 1 runs at 100 ms and has both the 50 ms and the 83.3 ms frame.
    expect(script[1]).toEqual({ tick: 1, mi: forward, facing: 0.75 });
    // Tick 2 has nothing newer, so the intent is HELD.
    expect(script[2]).toEqual({ tick: 2, mi: forward, facing: 0.75 });
  });

  it('holds the first sample for ticks that predate it', () => {
    const script = frameCommandsToTickScript([{ tMs: 400, mi: forward, facing: 1 }], 2);
    expect(script).toEqual([
      { tick: 0, mi: forward, facing: 1 },
      { tick: 1, mi: forward, facing: 1 },
    ]);
  });
});

describe('movement latency baseline', () => {
  it('keeps the committed baseline table in step with the pinned numbers', () => {
    const rendered = renderBaselineDoc();
    if (UPDATE_TABLE) writeFileSync(BASELINE_DOC, rendered);
    expect(readFileSync(BASELINE_DOC, 'utf8')).toBe(rendered);
  });

  // The harness honesty check, over EVERY scenario rather than the easiest
  // one. With no delay in either direction the server under test receives each
  // wire frame inside the same tick the ground-truth twin applies it, so the
  // two authoritative trajectories must agree bit for bit, heading included;
  // anything else means the harness is measuring its own plumbing and every
  // latency number read off it is really a plumbing number. Exact toBe on
  // purpose: a tolerance here would hide precisely the timeline mismatch this
  // check exists to catch.
  it.each(SCENARIOS.map((scenario) => scenario.key))(
    'reproduces the zero-latency authority exactly at RTT 0 (%s)',
    (scenarioKey) => {
      const result = cell(cellKey(scenarioKey, 'rtt0'));
      const poses = result.twinPoses;
      if (!poses) throw new Error(`cell ${scenarioKey}/rtt0 has no zero-latency twin`);
      expect(result.run.ticks).toHaveLength(poses.length);
      expect(poses.length).toBeGreaterThan(50);
      for (let i = 0; i < poses.length; i++) {
        expect(result.run.ticks[i].x, `${scenarioKey} tick ${i} x`).toBe(poses[i].x);
        expect(result.run.ticks[i].z, `${scenarioKey} tick ${i} z`).toBe(poses[i].z);
        expect(result.run.ticks[i].facing, `${scenarioKey} tick ${i} facing`).toBe(poses[i].facing);
      }
    },
  );

  it('runs the speed baselines on a constant-speed lane', () => {
    // Lane sanity. Every speed number here is only meaningful while the
    // authority's horizontal step is exactly the commanded one: on a hill that
    // gated or slid, these cells would quietly become terrain measurements
    // with no assertion noticing. The y axis is terrain and is not travel.
    const poses = cell(cellKey('straight', 'rtt0')).twinPoses;
    if (!poses) throw new Error('the straight cell has no zero-latency twin');
    for (let i = STEADY_FIRST_TICK; i < STEADY_LAST_TICK; i++) {
      const step = Math.hypot(poses[i + 1].x - poses[i].x, poses[i + 1].z - poses[i].z);
      expect(step, `tick ${i} horizontal step`).toBeCloseTo(RUN_SPEED * DT, 6);
    }
  });

  it('drives the client frame pipeline in the order src/main.ts drives it', () => {
    // A source-order pin, not a behavior test: the harness (tests/helpers/
    // online_harness.ts stepFrame) hand-rolls main.ts's online arm, and the
    // ORDER is load-bearing (alpha before the echo fold, the fold before the
    // frame build, the drawn pose last). Nothing else would notice main.ts
    // resequencing those calls, and the harness would keep measuring a
    // pipeline the client no longer runs.
    const source = stripComments(readFileSync(MAIN_TS, 'utf8'));
    const at = (marker: string): number => {
      const first = source.indexOf(marker);
      expect(first, `src/main.ts has no ${marker}`).toBeGreaterThanOrEqual(0);
      expect(source.indexOf(marker, first + 1), `src/main.ts has two ${marker}`).toBe(-1);
      return first;
    };
    const alpha = at('snapshotAlpha(');
    const flush = at('net.flushInput()');
    const consumeEcho = at('net.consumeInputEchoSamples()');
    const fold = at('inputEcho.fold(');
    const drain = at('net.drainEvents()');
    const discontinuity = at('hasAuthoritativeSelfPositionDiscontinuity(');
    const frameBuild = at('selfMotionFrameBuffer.write(');
    // updateSelfRenderPosition itself lives in the renderer (src/render/
    // self_render_position_core.ts, called from renderer.sync); main.ts's half
    // of the contract is that the drawn pose is produced AFTER the frame the
    // predictor reads was built.
    const draw = source.indexOf('renderer.sync(', frameBuild);
    const note = 'update tests/helpers/online_harness.ts stepFrame to match';
    expect(draw, `src/main.ts has no renderer.sync after the frame build: ${note}`).toBeGreaterThan(
      -1,
    );
    expect(alpha, `alpha must be read before the echo fold: ${note}`).toBeLessThan(consumeEcho);
    expect(flush, `the wire write must precede the echo read: ${note}`).toBeLessThan(consumeEcho);
    expect(consumeEcho, `samples are consumed then folded: ${note}`).toBeLessThan(fold);
    expect(fold, `the fold must precede the frame build: ${note}`).toBeLessThan(frameBuild);
    expect(drain, `events are drained before the discontinuity read: ${note}`).toBeLessThan(
      discontinuity,
    );
    expect(discontinuity, `the discontinuity is read before the frame build: ${note}`).toBeLessThan(
      frameBuild,
    );
    expect(draw, `the drawn pose comes after the frame build: ${note}`).toBeGreaterThan(frameBuild);
  });

  it('pins the movement-feel target sets', () => {
    // The bar the strict arm asserts, held to literals: a target quietly
    // widened is a moved goalpost, and every cell would keep passing.
    expect(MOVEMENT_FEEL_TARGETS).toEqual({
      backwardStepYd: 0.001,
      correctionEvents: 0,
      pathDeviationYd: 0.05,
      progressMaxYd: 0.15,
      speedErrYdPerSec: 0.5,
      speedDeltaYdPerSec: 1.5,
      settleYd: 0.05,
    });
    expect(MOVEMENT_FEEL_TARGETS_CC).toEqual({
      backwardStepYd: 0.5,
      settleYd: 0.05,
    });
  });

  it('drives the whole real pipeline in every cell', () => {
    for (const [key, result] of cells) {
      // A cell that silently stopped predicting, stopped drawing, or stopped
      // moving would score beautifully; assert it did none of those.
      expect(result.run.frames.length, key).toBeGreaterThan(100);
      expect(result.run.ticks.length, key).toBeGreaterThan(50);
      // The correction scan drops idle frames and the ramp windows, so the
      // floor is the tapping cells' share (idle half the run, 100 ms windows),
      // not the frame count.
      expect(result.metrics.correctionEvents.samples, key).toBeGreaterThan(20);
      const first = result.run.frames[0];
      const last = result.run.frames[result.run.frames.length - 1];
      expect(Math.hypot(last.x - first.x, last.z - first.z), key).toBeGreaterThan(1);
    }
  });

  it('keeps the predictor engaged except where the gate closes it', () => {
    const straight = cell(cellKey('straight', 'rtt150j20'));
    expect(straight.run.frames.every((frame) => frame.predictionEnabled)).toBe(true);
    // The stun reaches the client mirror one downstream trip later, and the
    // gate closes on it there.
    const stunned = cell('adv-stun/rtt150j20');
    const closed = stunned.run.frames.filter((frame) => !frame.predictionEnabled);
    expect(closed.length).toBeGreaterThan(10);
    expect(closed[0].tMs).toBeGreaterThan(CC_AT_MS);
  });

  const keys = [
    ...SCENARIOS.flatMap((scenario) =>
      PROFILES.map((profile) => cellKey(scenario.key, profile.key)),
    ),
    'adv-stall/rtt150j20',
    'adv-stun/rtt150j20',
    'adv-snare/rtt150j20',
  ];

  it('measures every pinned cell and pins every measured cell', () => {
    // The vacuity floor under the it.each below. An it.each over a shortened
    // list registers FEWER cases rather than failing, so a scenario or profile
    // dropped from the tables would silently stop being measured while this
    // suite stayed green; and a BASELINE row with no matching cell (or a cell
    // with no row) would never be asserted at all.
    expect(keys).toHaveLength(23);
    expect(Object.keys(BASELINE).sort()).toEqual([...keys].sort());
    expect(cells.size).toBe(keys.length);
  });

  it.each(keys)('pins the measured baseline for %s', (key) => {
    if (STRICT) expectTargets(key);
    else expectPinned(key, BASELINE[key]);
  });
});
