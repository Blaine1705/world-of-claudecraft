import { describe, expect, it } from 'vitest';
import {
  boundedReconciliationCorrectionInto,
  createSelfReconciliation,
  createTrajectoryHistory,
  idleReconciliationCorrectionInto,
  reconciliationDiscontinuity,
  reconciliationLeadDiscontinuity,
  recordTrajectoryPoint,
  resetSelfReconciliation,
  resetTrajectoryHistory,
  type TrajectoryResidual,
  trajectoryResidualInto,
} from '../src/render/self_reconciliation_core';

const residual = (): TrajectoryResidual => ({
  matched: false,
  matchTimeMs: 0,
  x: 0,
  y: 0,
  z: 0,
});

describe('trajectory-window reconciliation', () => {
  it('returns no residual for an authoritative point along the eligible trajectory', () => {
    const history = createTrajectoryHistory(16);
    for (let t = 600; t <= 1000; t += 100) recordTrajectoryPoint(history, t, t / 100, 0, 0);
    const state = createSelfReconciliation();
    const out = residual();

    trajectoryResidualInto(state, history, 1000, 200, 50, 50, 7.25, 0, 0, 0.05, out);

    expect(out.matched).toBe(true);
    expect(out.matchTimeMs).toBeCloseTo(725, 6);
    expect(out).toMatchObject({ x: 0, y: 0, z: 0 });
  });

  it('never regresses match time when an older point becomes closest', () => {
    const history = createTrajectoryHistory(16);
    for (let t = 600; t <= 1000; t += 100) recordTrajectoryPoint(history, t, t / 100, 0, 0);
    const state = createSelfReconciliation();
    const out = residual();
    trajectoryResidualInto(state, history, 1000, 150, 100, 50, 8.5, 0, 0, 0.05, out);
    const firstMatch = out.matchTimeMs;
    trajectoryResidualInto(state, history, 1050, 200, 100, 50, 7.5, 0, 0, 0.05, out);

    expect(out.matchTimeMs).toBeGreaterThanOrEqual(firstMatch);
    expect(out.x).toBeLessThan(-0.5);
  });

  it('does not match backward when a reversal overlaps an older path', () => {
    const history = createTrajectoryHistory(16);
    recordTrajectoryPoint(history, 600, 0, 0, 0);
    recordTrajectoryPoint(history, 700, 1, 0, 0);
    recordTrajectoryPoint(history, 800, 2, 0, 0);
    recordTrajectoryPoint(history, 900, 1, 0, 0);
    recordTrajectoryPoint(history, 1000, 0, 0, 0);
    const state = createSelfReconciliation();
    const out = residual();
    trajectoryResidualInto(state, history, 1000, 100, 150, 50, 1, 0, 0, 0.05, out);
    expect(out.matchTimeMs).toBeCloseTo(900, 6);
    trajectoryResidualInto(state, history, 1050, 200, 150, 50, 2, 0, 0, 0.05, out);

    expect(out.matchTimeMs).toBeGreaterThanOrEqual(900);
    expect(out.x).toBeGreaterThan(0.9);
  });

  it('returns lateral divergence that cannot be explained by timing phase', () => {
    const history = createTrajectoryHistory(16);
    recordTrajectoryPoint(history, 700, 0, 0, 0);
    recordTrajectoryPoint(history, 900, 0, 0, 2);
    const out = residual();
    trajectoryResidualInto(
      createSelfReconciliation(),
      history,
      1000,
      200,
      50,
      50,
      1,
      0,
      1,
      0.05,
      out,
    );

    expect(out.x).toBeCloseTo(1, 6);
    expect(out.y).toBe(0);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it('caps each correction by current run speed and the frame step ceiling', () => {
    const out = { x: 0, y: 0, z: 0 };
    boundedReconciliationCorrectionInto(10, 0, 0, 0.05, 12, 100, 7, 0.25, out);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(7 / 30, 8);
  });

  it('clears history and monotonic match state on reset and detects teleports', () => {
    const history = createTrajectoryHistory(4);
    recordTrajectoryPoint(history, 100, 0, 0, 0);
    const state = createSelfReconciliation();
    const out = residual();
    trajectoryResidualInto(state, history, 100, 0, 0, 50, 0, 0, 0, 0.05, out);
    expect(state.active).toBe(true);
    expect(reconciliationDiscontinuity(6.01, 0, 0, 36)).toBe(true);
    expect(reconciliationDiscontinuity(6, 0, 0, 36)).toBe(false);

    resetTrajectoryHistory(history);
    resetSelfReconciliation(state);
    expect(history.count).toBe(0);
    expect(state).toMatchObject({ active: false, matchedTimeMs: 0, boundarySide: 0 });
  });

  it('matches jump-arc timing variation in three dimensions', () => {
    const history = createTrajectoryHistory(8);
    recordTrajectoryPoint(history, 700, 0, 0, 0);
    recordTrajectoryPoint(history, 800, 1, 2, 0);
    recordTrajectoryPoint(history, 900, 2, 0, 0);
    const out = residual();
    trajectoryResidualInto(
      createSelfReconciliation(),
      history,
      1000,
      200,
      50,
      50,
      1.25,
      1.5,
      0,
      0.05,
      out,
    );

    expect(out).toMatchObject({ matched: true, x: 0, y: 0, z: 0 });
    expect(out.matchTimeMs).toBeCloseTo(825, 6);
  });

  it('expires a stationary point once it leaves the moving timing window', () => {
    const history = createTrajectoryHistory(8);
    recordTrajectoryPoint(history, 500, 1, 0, 0);
    recordTrajectoryPoint(history, 900, 2, 0, 0);
    recordTrajectoryPoint(history, 1000, 2, 0, 0);
    const out = residual();
    trajectoryResidualInto(
      createSelfReconciliation(),
      history,
      1000,
      100,
      20,
      50,
      1,
      0,
      0,
      0.05,
      out,
    );
    expect(out.matched).toBe(true);
    expect(out.matchTimeMs).toBeGreaterThanOrEqual(830);
    expect(out.x).toBeLessThan(-0.8);
  });

  it('eventually exposes a small same-path speed mismatch as spatial drift', () => {
    const history = createTrajectoryHistory(256);
    for (let t = 0; t <= 10000; t += 50) recordTrajectoryPoint(history, t, 0.007 * t, 0, 0);
    const state = createSelfReconciliation();
    const out = residual();
    for (let now = 1000; now <= 10000; now += 50) {
      const anchorTime = now - 100;
      trajectoryResidualInto(
        state,
        history,
        now,
        100,
        20,
        50,
        0.0068 * anchorTime,
        0,
        0,
        0.05,
        out,
      );
    }
    expect(Math.abs(out.x)).toBeGreaterThan(0.05);
  });

  it('keeps the full measurement horizon after wrapping at 480 Hz', () => {
    const history = createTrajectoryHistory(1024);
    const frameMs = 1000 / 480;
    for (let i = 0; i < 1400; i++) {
      const t = i * frameMs;
      recordTrajectoryPoint(history, t, t / 100, 0, 0);
    }
    const now = 1399 * frameMs;
    const anchorTime = now - 1500;
    const out = residual();
    trajectoryResidualInto(
      createSelfReconciliation(),
      history,
      now,
      1500,
      0,
      0,
      anchorTime / 100,
      0,
      0,
      0.05,
      out,
    );
    expect(history.count).toBe(1024);
    expect(history.head).not.toBe(0);
    expect(out).toMatchObject({ matched: true, x: 0, y: 0, z: 0 });
    expect(out.matchTimeMs).toBeCloseTo(anchorTime, 6);
  });

  it.each([
    [0.049, false],
    [0.009, false],
    [0.004, true],
  ])('settles an idle residual of %f yd with exact adopt %s', (distance, exact) => {
    const out = { x: 0, y: 0, z: 0 };
    expect(idleReconciliationCorrectionInto(distance, 0, 0, 12, 100, 7, 1 / 60, out)).toBe(exact);
    expect(out.x).toBeGreaterThan(0);
    expect(out.x).toBeLessThanOrEqual(distance);
    if (exact) expect(out.x).toBe(distance);
  });

  it('falls back to expected-time residual after a boundary match saturates', () => {
    const history = createTrajectoryHistory(64);
    for (let t = 0; t <= 1000; t += 25) recordTrajectoryPoint(history, t, t / 100, 0, 0);
    const state = createSelfReconciliation();
    const out = residual();
    for (let now = 800; now <= 1000; now += 25) {
      trajectoryResidualInto(state, history, now, 100, 20, 50, (now - 300) / 100, 0, 0, 0.05, out);
    }
    expect(out.x).toBeCloseTo(-2, 6);
  });

  it('keeps an exposed speed mismatch latched across transient window widening', () => {
    const history = createTrajectoryHistory(512);
    for (let t = 0; t <= 10000; t += 25) recordTrajectoryPoint(history, t, 0.007 * t, 0, 0);
    const state = createSelfReconciliation();
    const out = residual();
    let exposed = false;
    for (let now = 1000; now <= 10000; now += 25) {
      const jitterMs = Math.floor(now / 75) % 2 === 0 ? 5 : 120;
      const anchorTime = now - 170;
      trajectoryResidualInto(
        state,
        history,
        now,
        170,
        jitterMs,
        50,
        0.0065 * anchorTime,
        0,
        0,
        0.05,
        out,
      );
      if (Math.abs(out.x) > 0.05) exposed = true;
      if (exposed) expect(Math.abs(out.x), `now ${now}`).toBeGreaterThan(0.05);
    }
    expect(exposed).toBe(true);
  });

  it('returns bounded zero correction for non-finite inputs', () => {
    const out = { x: 1, y: 1, z: 1 };
    boundedReconciliationCorrectionInto(Number.NaN, 2, 3, 0, 12, 100, 7, 1 / 60, out);
    expect(out).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('separates dynamic horizontal lead headroom from vertical discontinuities', () => {
    expect(reconciliationLeadDiscontinuity(12, 0, 0, 13, 6)).toBe(false);
    expect(reconciliationLeadDiscontinuity(14, 0, 0, 13, 6)).toBe(true);
    expect(reconciliationLeadDiscontinuity(0, 6.1, 0, 13, 6)).toBe(true);
  });
});
