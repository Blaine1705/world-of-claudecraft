export interface TrajectoryHistory {
  count: number;
  head: number;
  readonly times: Float64Array;
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly zs: Float64Array;
}

export interface SelfReconciliationState {
  active: boolean;
  matchedTimeMs: number;
  boundarySide: -1 | 0 | 1;
  boundarySinceMs: number;
  boundaryInteriorSinceMs: number;
  expectedTimeLatched: boolean;
  expectedTimeWithinSinceMs: number;
  timingCenterAgeMs: number;
  timingStableSinceMs: number;
  bestDistSq: number;
  bestCenterDeltaMs: number;
  bestTimeMs: number;
  bestX: number;
  bestY: number;
  bestZ: number;
  sampleX: number;
  sampleY: number;
  sampleZ: number;
}

export interface TrajectoryResidual {
  matched: boolean;
  matchTimeMs: number;
  x: number;
  y: number;
  z: number;
}

export interface ReconciliationCorrection {
  x: number;
  y: number;
  z: number;
}

export const SELF_RECONCILIATION_HISTORY_MAX_AGE_MS = 1500;
export const SELF_RECONCILIATION_MAX_TIMING_INPUT_MS = 1500;
export const SELF_RECONCILIATION_MAX_CORRECTION_SPEED_FACTOR = 1;
export const SELF_RECONCILIATION_MAX_STEP_SEC = 1 / 30;
export const SELF_RECONCILIATION_IDLE_ADOPT_YD = 0.005;
const MATCH_EPSILON_MS = 1e-6;

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export function createTrajectoryHistory(capacity: number): TrajectoryHistory {
  const size = Math.max(1, Math.floor(finiteOr(capacity, 1)));
  return {
    count: 0,
    head: 0,
    times: new Float64Array(size),
    xs: new Float64Array(size),
    ys: new Float64Array(size),
    zs: new Float64Array(size),
  };
}

export function resetTrajectoryHistory(history: TrajectoryHistory): void {
  history.count = 0;
  history.head = 0;
}

export function recordTrajectoryPoint(
  history: TrajectoryHistory,
  timeMs: number,
  x: number,
  y: number,
  z: number,
): void {
  if (!Number.isFinite(timeMs) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z))
    return;
  const i = history.head;
  history.times[i] = timeMs;
  history.xs[i] = x;
  history.ys[i] = y;
  history.zs[i] = z;
  history.head = (i + 1) % history.times.length;
  if (history.count < history.times.length) history.count++;
}

export function createSelfReconciliation(): SelfReconciliationState {
  return {
    active: false,
    matchedTimeMs: 0,
    boundarySide: 0,
    boundarySinceMs: 0,
    boundaryInteriorSinceMs: -1,
    expectedTimeLatched: false,
    expectedTimeWithinSinceMs: -1,
    timingCenterAgeMs: Number.NaN,
    timingStableSinceMs: 0,
    bestDistSq: Number.POSITIVE_INFINITY,
    bestCenterDeltaMs: Number.POSITIVE_INFINITY,
    bestTimeMs: 0,
    bestX: 0,
    bestY: 0,
    bestZ: 0,
    sampleX: 0,
    sampleY: 0,
    sampleZ: 0,
  };
}

export function resetSelfReconciliation(state: SelfReconciliationState): void {
  state.active = false;
  state.matchedTimeMs = 0;
  state.boundarySide = 0;
  state.boundarySinceMs = 0;
  state.boundaryInteriorSinceMs = -1;
  state.expectedTimeLatched = false;
  state.expectedTimeWithinSinceMs = -1;
  state.timingCenterAgeMs = Number.NaN;
  state.timingStableSinceMs = 0;
  state.bestDistSq = Number.POSITIVE_INFINITY;
  state.bestCenterDeltaMs = Number.POSITIVE_INFINITY;
  state.bestTimeMs = 0;
  state.bestX = 0;
  state.bestY = 0;
  state.bestZ = 0;
  state.sampleX = 0;
  state.sampleY = 0;
  state.sampleZ = 0;
}

export function resetSelfReconciliationBoundary(state: SelfReconciliationState): void {
  state.boundarySide = 0;
  state.boundarySinceMs = 0;
  state.boundaryInteriorSinceMs = -1;
  state.expectedTimeLatched = false;
  state.expectedTimeWithinSinceMs = -1;
  state.timingCenterAgeMs = Number.NaN;
  state.timingStableSinceMs = 0;
}

export function reconciliationDiscontinuity(
  dx: number,
  dy: number,
  dz: number,
  snapDistSq: number,
): boolean {
  if (
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    !Number.isFinite(dz) ||
    !Number.isFinite(snapDistSq)
  )
    return true;
  return dx * dx + dy * dy + dz * dz > Math.max(0, snapDistSq);
}

export function reconciliationLeadDiscontinuity(
  dx: number,
  dy: number,
  dz: number,
  maxHorizontalYd: number,
  maxVerticalYd: number,
): boolean {
  if (
    !Number.isFinite(dx) ||
    !Number.isFinite(dy) ||
    !Number.isFinite(dz) ||
    !Number.isFinite(maxHorizontalYd) ||
    !Number.isFinite(maxVerticalYd)
  )
    return true;
  const horizontal = Math.max(0, maxHorizontalYd);
  return dx * dx + dz * dz > horizontal * horizontal || Math.abs(dy) > Math.max(0, maxVerticalYd);
}

const sampleAxis = (a: number, b: number, fraction: number): number => a + (b - a) * fraction;

function considerCandidate(
  state: SelfReconciliationState,
  timeMs: number,
  x: number,
  y: number,
  z: number,
  anchorX: number,
  anchorY: number,
  anchorZ: number,
  minTimeMs: number,
  maxTimeMs: number,
  preferredTimeMs: number,
): void {
  if (
    timeMs < minTimeMs ||
    timeMs > maxTimeMs ||
    !Number.isFinite(timeMs) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  )
    return;
  const dx = anchorX - x;
  const dy = anchorY - y;
  const dz = anchorZ - z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const centerDeltaMs = Math.abs(timeMs - preferredTimeMs);
  if (
    distSq < state.bestDistSq - Number.EPSILON ||
    (Math.abs(distSq - state.bestDistSq) <= Number.EPSILON &&
      (centerDeltaMs < state.bestCenterDeltaMs - MATCH_EPSILON_MS ||
        (Math.abs(centerDeltaMs - state.bestCenterDeltaMs) <= MATCH_EPSILON_MS &&
          timeMs > state.bestTimeMs)))
  ) {
    state.bestDistSq = distSq;
    state.bestCenterDeltaMs = centerDeltaMs;
    state.bestTimeMs = timeMs;
    state.bestX = x;
    state.bestY = y;
    state.bestZ = z;
  }
}

function sampleTrajectoryAtInto(
  history: TrajectoryHistory,
  timeMs: number,
  state: SelfReconciliationState,
): boolean {
  if (history.count === 0 || !Number.isFinite(timeMs)) return false;
  const capacity = history.times.length;
  const oldest = (history.head - history.count + capacity) % capacity;
  for (let offset = 0; offset < history.count; offset++) {
    const i = (oldest + offset) % capacity;
    const t0 = history.times[i];
    if (
      !Number.isFinite(t0) ||
      !Number.isFinite(history.xs[i]) ||
      !Number.isFinite(history.ys[i]) ||
      !Number.isFinite(history.zs[i])
    )
      continue;
    if (Math.abs(t0 - timeMs) <= MATCH_EPSILON_MS) {
      state.sampleX = history.xs[i];
      state.sampleY = history.ys[i];
      state.sampleZ = history.zs[i];
      return true;
    }
    if (offset + 1 >= history.count) continue;
    const j = (i + 1) % capacity;
    const t1 = history.times[j];
    if (timeMs < t0 || timeMs > t1 || t1 <= t0) continue;
    if (
      !Number.isFinite(t1) ||
      !Number.isFinite(history.xs[j]) ||
      !Number.isFinite(history.ys[j]) ||
      !Number.isFinite(history.zs[j])
    )
      continue;
    const fraction = (timeMs - t0) / (t1 - t0);
    state.sampleX = sampleAxis(history.xs[i], history.xs[j], fraction);
    state.sampleY = sampleAxis(history.ys[i], history.ys[j], fraction);
    state.sampleZ = sampleAxis(history.zs[i], history.zs[j], fraction);
    return true;
  }
  return false;
}

function expectedTimeResidualInto(
  state: SelfReconciliationState,
  history: TrajectoryHistory,
  expectedTimeMs: number,
  anchorX: number,
  anchorY: number,
  anchorZ: number,
  deadbandYd: number,
  out: TrajectoryResidual,
): boolean {
  if (!sampleTrajectoryAtInto(history, expectedTimeMs, state)) return false;
  const x = anchorX - state.sampleX;
  const y = anchorY - state.sampleY;
  const z = anchorZ - state.sampleZ;
  if (x * x + y * y + z * z <= deadbandYd * deadbandYd) return true;
  out.x = x;
  out.y = y;
  out.z = z;
  return true;
}

export function trajectoryResidualInto(
  state: SelfReconciliationState,
  history: TrajectoryHistory,
  nowMs: number,
  echoMs: number,
  jitterMs: number,
  snapshotIntervalMs: number,
  anchorX: number,
  anchorY: number,
  anchorZ: number,
  deadbandYd: number,
  out: TrajectoryResidual,
): void {
  out.matched = false;
  out.matchTimeMs = finiteOr(state.matchedTimeMs, 0);
  out.x = 0;
  out.y = 0;
  out.z = 0;
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(anchorX) ||
    !Number.isFinite(anchorY) ||
    !Number.isFinite(anchorZ)
  ) {
    resetSelfReconciliation(state);
    return;
  }
  if (!Number.isFinite(state.matchedTimeMs)) resetSelfReconciliation(state);
  if (history.count === 0) return;

  const centerAgeMs = Math.min(
    SELF_RECONCILIATION_HISTORY_MAX_AGE_MS,
    Math.max(0, finiteOr(echoMs, 0)),
  );
  const boundedJitterMs = Math.min(
    SELF_RECONCILIATION_MAX_TIMING_INPUT_MS,
    Math.max(0, finiteOr(jitterMs, 0)),
  );
  const boundedIntervalMs = Math.min(
    SELF_RECONCILIATION_MAX_TIMING_INPUT_MS,
    Math.max(0, finiteOr(snapshotIntervalMs, 0)),
  );
  const uncertaintyMs = Math.min(
    SELF_RECONCILIATION_HISTORY_MAX_AGE_MS,
    boundedJitterMs + boundedIntervalMs,
  );
  const timingCenterChanged =
    !Number.isFinite(state.timingCenterAgeMs) ||
    Math.abs(state.timingCenterAgeMs - centerAgeMs) > MATCH_EPSILON_MS;
  if (timingCenterChanged) {
    state.timingCenterAgeMs = centerAgeMs;
    state.timingStableSinceMs = nowMs;
    state.boundarySide = 0;
    state.boundarySinceMs = 0;
    state.boundaryInteriorSinceMs = -1;
    state.expectedTimeLatched = false;
    state.expectedTimeWithinSinceMs = -1;
  }
  const centerTimeMs = nowMs - centerAgeMs;
  const absoluteMinTimeMs = Math.max(
    nowMs - SELF_RECONCILIATION_HISTORY_MAX_AGE_MS,
    centerTimeMs - uncertaintyMs,
  );
  const maxTimeMs = Math.min(nowMs, centerTimeMs + uncertaintyMs);
  const deadband = Math.max(0, finiteOr(deadbandYd, 0));
  const timingWindowStable =
    nowMs - state.timingStableSinceMs >= Math.max(1, 2 * boundedIntervalMs);
  if (state.expectedTimeLatched) {
    const sampled = expectedTimeResidualInto(
      state,
      history,
      centerTimeMs,
      anchorX,
      anchorY,
      anchorZ,
      deadband,
      out,
    );
    if (!sampled) return;
    const outsideDeadband = out.x !== 0 || out.y !== 0 || out.z !== 0;
    if (outsideDeadband) {
      state.expectedTimeWithinSinceMs = -1;
      return;
    }
    if (state.expectedTimeWithinSinceMs < 0) state.expectedTimeWithinSinceMs = nowMs;
    if (nowMs - state.expectedTimeWithinSinceMs >= Math.max(1, boundedIntervalMs)) {
      state.expectedTimeLatched = false;
      state.expectedTimeWithinSinceMs = -1;
      state.boundarySide = 0;
      state.boundarySinceMs = 0;
      state.boundaryInteriorSinceMs = -1;
    }
    return;
  }
  const minTimeMs = state.active
    ? Math.max(absoluteMinTimeMs, state.matchedTimeMs)
    : absoluteMinTimeMs;
  if (minTimeMs > maxTimeMs) {
    if (!timingWindowStable) return;
    expectedTimeResidualInto(
      state,
      history,
      centerTimeMs,
      anchorX,
      anchorY,
      anchorZ,
      Math.max(0, finiteOr(deadbandYd, 0)),
      out,
    );
    return;
  }

  state.bestDistSq = Number.POSITIVE_INFINITY;
  state.bestCenterDeltaMs = Number.POSITIVE_INFINITY;
  state.bestTimeMs = 0;
  const capacity = history.times.length;
  const oldest = (history.head - history.count + capacity) % capacity;
  for (let offset = 0; offset < history.count; offset++) {
    const i = (oldest + offset) % capacity;
    considerCandidate(
      state,
      history.times[i],
      history.xs[i],
      history.ys[i],
      history.zs[i],
      anchorX,
      anchorY,
      anchorZ,
      minTimeMs,
      maxTimeMs,
      centerTimeMs,
    );
    if (offset + 1 >= history.count) continue;
    const j = (i + 1) % capacity;
    const t0 = history.times[i];
    const t1 = history.times[j];
    const span = t1 - t0;
    if (
      !Number.isFinite(t0) ||
      !Number.isFinite(t1) ||
      span <= 0 ||
      t1 < minTimeMs ||
      t0 > maxTimeMs
    )
      continue;
    const lo = Math.max(t0, minTimeMs);
    const hi = Math.min(t1, maxTimeMs);
    if (lo > hi) continue;
    const loFraction = (lo - t0) / span;
    const hiFraction = (hi - t0) / span;
    const lx = sampleAxis(history.xs[i], history.xs[j], loFraction);
    const ly = sampleAxis(history.ys[i], history.ys[j], loFraction);
    const lz = sampleAxis(history.zs[i], history.zs[j], loFraction);
    const hx = sampleAxis(history.xs[i], history.xs[j], hiFraction);
    const hy = sampleAxis(history.ys[i], history.ys[j], hiFraction);
    const hz = sampleAxis(history.zs[i], history.zs[j], hiFraction);
    if (
      !Number.isFinite(lx) ||
      !Number.isFinite(ly) ||
      !Number.isFinite(lz) ||
      !Number.isFinite(hx) ||
      !Number.isFinite(hy) ||
      !Number.isFinite(hz)
    )
      continue;
    const sx = hx - lx;
    const sy = hy - ly;
    const sz = hz - lz;
    const lengthSq = sx * sx + sy * sy + sz * sz;
    const projection =
      lengthSq > 0
        ? Math.max(
            0,
            Math.min(
              1,
              ((anchorX - lx) * sx + (anchorY - ly) * sy + (anchorZ - lz) * sz) / lengthSq,
            ),
          )
        : hi > lo
          ? (Math.min(hi, Math.max(lo, centerTimeMs)) - lo) / (hi - lo)
          : 0;
    considerCandidate(
      state,
      lo + (hi - lo) * projection,
      sampleAxis(lx, hx, projection),
      sampleAxis(ly, hy, projection),
      sampleAxis(lz, hz, projection),
      anchorX,
      anchorY,
      anchorZ,
      minTimeMs,
      maxTimeMs,
      centerTimeMs,
    );
  }

  if (!Number.isFinite(state.bestDistSq)) {
    expectedTimeResidualInto(
      state,
      history,
      centerTimeMs,
      anchorX,
      anchorY,
      anchorZ,
      Math.max(0, finiteOr(deadbandYd, 0)),
      out,
    );
    return;
  }
  state.active = true;
  state.matchedTimeMs = Math.max(state.matchedTimeMs, state.bestTimeMs);
  out.matched = true;
  out.matchTimeMs = state.matchedTimeMs;

  const boundarySide =
    Math.abs(state.bestTimeMs - absoluteMinTimeMs) <= MATCH_EPSILON_MS
      ? -1
      : Math.abs(state.bestTimeMs - maxTimeMs) <= MATCH_EPSILON_MS
        ? 1
        : 0;
  if (boundarySide === 0) {
    if (state.boundarySide !== 0) {
      if (state.boundaryInteriorSinceMs < 0) state.boundaryInteriorSinceMs = nowMs;
      if (nowMs - state.boundaryInteriorSinceMs >= Math.max(1, boundedIntervalMs)) {
        state.boundarySide = 0;
        state.boundarySinceMs = 0;
        state.boundaryInteriorSinceMs = -1;
      }
    }
  } else if (state.boundarySide !== boundarySide || nowMs < state.boundarySinceMs) {
    state.boundarySide = boundarySide;
    state.boundarySinceMs = nowMs;
    state.boundaryInteriorSinceMs = -1;
  } else {
    state.boundaryInteriorSinceMs = -1;
  }
  const boundaryExpired =
    state.boundarySide !== 0 &&
    nowMs - state.boundarySinceMs >= Math.max(1, boundedIntervalMs) &&
    timingWindowStable;
  if (boundaryExpired) {
    state.expectedTimeLatched = true;
    state.expectedTimeWithinSinceMs = -1;
    expectedTimeResidualInto(
      state,
      history,
      centerTimeMs,
      anchorX,
      anchorY,
      anchorZ,
      deadband,
      out,
    );
    return;
  }
  if (state.bestDistSq <= deadband * deadband) return;
  out.x = anchorX - state.bestX;
  out.y = anchorY - state.bestY;
  out.z = anchorZ - state.bestZ;
}

export function boundedReconciliationCorrectionInto(
  residualX: number,
  residualY: number,
  residualZ: number,
  deadbandYd: number,
  blendRate: number,
  centerAgeMs: number,
  runSpeed: number,
  dt: number,
  out: ReconciliationCorrection,
): void {
  out.x = 0;
  out.y = 0;
  out.z = 0;
  if (
    !Number.isFinite(residualX) ||
    !Number.isFinite(residualY) ||
    !Number.isFinite(residualZ) ||
    !Number.isFinite(runSpeed) ||
    !Number.isFinite(dt)
  )
    return;
  const length = Math.hypot(residualX, residualY, residualZ);
  const deadband = Math.max(0, finiteOr(deadbandYd, 0));
  if (length <= deadband) return;
  const step = Math.min(Math.max(0, dt), SELF_RECONCILIATION_MAX_STEP_SEC);
  const rate = Math.min(
    Math.max(0, finiteOr(blendRate, 0)),
    500 / Math.max(1, Math.max(0, finiteOr(centerAgeMs, 0))),
  );
  const scale = ((length - deadband) / length) * (1 - Math.exp(-rate * step));
  let x = residualX * scale;
  let y = residualY * scale;
  let z = residualZ * scale;
  const correctionLength = Math.hypot(x, y, z);
  const maxCorrection =
    Math.max(0, runSpeed) * SELF_RECONCILIATION_MAX_CORRECTION_SPEED_FACTOR * step;
  if (correctionLength > maxCorrection && correctionLength > 0) {
    const capScale = maxCorrection / correctionLength;
    x *= capScale;
    y *= capScale;
    z *= capScale;
  }
  out.x = x;
  out.y = y;
  out.z = z;
}

export function idleReconciliationCorrectionInto(
  residualX: number,
  residualY: number,
  residualZ: number,
  blendRate: number,
  centerAgeMs: number,
  runSpeed: number,
  dt: number,
  out: ReconciliationCorrection,
): boolean {
  if (!Number.isFinite(residualX) || !Number.isFinite(residualY) || !Number.isFinite(residualZ)) {
    out.x = 0;
    out.y = 0;
    out.z = 0;
    return false;
  }
  if (Math.hypot(residualX, residualY, residualZ) <= SELF_RECONCILIATION_IDLE_ADOPT_YD) {
    out.x = residualX;
    out.y = residualY;
    out.z = residualZ;
    return true;
  }
  boundedReconciliationCorrectionInto(
    residualX,
    residualY,
    residualZ,
    0,
    blendRate,
    centerAgeMs,
    runSpeed,
    dt,
    out,
  );
  return false;
}
