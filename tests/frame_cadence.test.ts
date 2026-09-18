import { describe, expect, it } from 'vitest';
import {
  createRefreshEstimator,
  noteRefreshDelta,
  type RefreshEstimatorState,
} from '../src/game/display_refresh_estimator_core';
import {
  ceilingDivisor,
  configureFrameCadence,
  createFrameCadence,
  frameCadenceShouldRender,
  MIN_CEILING_FPS,
} from '../src/game/frame_cadence_core';
import {
  type FrameCadenceGateView,
  type FrameCadenceSnapshot,
  FrameCadenceWiring,
  frameCadenceBeaconFieldsFrom,
  parseFrameCeilingIntent,
} from '../src/game/frame_cadence_wiring';

const INPUT_TICK_MS = 50;

function feed(state: RefreshEstimatorState, deltas: number[], repeat: number): void {
  for (let r = 0; r < repeat; r++) for (const d of deltas) noteRefreshDelta(state, d, false);
}

describe('display refresh estimator', () => {
  it.each([60, 75, 120, 144])('reads a held %i Hz display', (hz) => {
    const s = createRefreshEstimator();
    feed(s, [1000 / hz], 200);
    expect(s.verdict).toBe('paced');
    expect(1000 / s.refreshMs).toBeCloseTo(hz, 0);
  });

  it('reads 60 Hz from a machine that only ever lands on two and three slots', () => {
    const s = createRefreshEstimator();
    feed(s, [33.3, 33.3, 50, 33.3, 50], 60);
    expect(s.verdict).toBe('paced');
    expect(1000 / s.refreshMs).toBeCloseTo(60, 0);
  });

  it('reads 60 Hz through 1 ms timestamp coarsening', () => {
    const s = createRefreshEstimator();
    feed(s, [16, 17, 17], 100);
    expect(s.verdict).toBe('paced');
    expect(1000 / s.refreshMs).toBeCloseTo(60, 0);
  });

  it('follows a window dragged from a 60 Hz to a 144 Hz display', () => {
    const s = createRefreshEstimator();
    feed(s, [16.67], 200);
    feed(s, [6.94], 200);
    expect(1000 / s.refreshMs).toBeCloseTo(144, 0);
  });

  it('drops its window on a stall instead of learning from it', () => {
    const s = createRefreshEstimator();
    feed(s, [16.67], 200);
    noteRefreshDelta(s, 4000, false);
    expect(s.count).toBe(0);
    expect(s.verdict).toBe('paced');
    expect(1000 / s.refreshMs).toBeCloseTo(60, 0);
  });

  it('stays unknown on jittery deltas that sit on no lattice', () => {
    const s = createRefreshEstimator();
    const jitter = [2.6, 3.9, 3.1, 4.4, 2.9, 3.6, 5.2, 3.3];
    feed(s, jitter, 60);
    expect(s.verdict).toBe('unknown');
  });

  it('calls rAF uncapped only from idle callbacks answered faster than any display', () => {
    const s = createRefreshEstimator();
    feed(s, [5], 200);
    // A steady 5 ms cost looks like a 200 Hz display until a skip is answered at once.
    expect(s.verdict).toBe('paced');
    for (let i = 0; i < 6; i++) noteRefreshDelta(s, 0.4, true);
    expect(s.verdict).toBe('unpaced');
    // Busy deltas never take the verdict back; slow idle answers do.
    feed(s, [16.67], 50);
    expect(s.verdict).toBe('unpaced');
    noteRefreshDelta(s, 16.67, true);
    noteRefreshDelta(s, 16.67, true);
    expect(s.verdict).toBe('paced');
  });
});

describe('ceiling divisor', () => {
  it('pins the intent 30 table', () => {
    const rate = (hz: number) => hz / ceilingDivisor(hz, 30);
    expect(rate(60)).toBe(30);
    expect(rate(75)).toBe(37.5);
    expect(rate(90)).toBe(30);
    expect(rate(100)).toBeCloseTo(33.33, 1);
    expect(rate(120)).toBe(30);
    expect(rate(144)).toBe(36);
    expect(rate(165)).toBe(33);
    expect(rate(240)).toBeCloseTo(34.29, 1);
    expect(rate(360)).toBe(36);
    expect(rate(50)).toBe(25);
    expect(ceilingDivisor(30, 30)).toBe(1);
  });

  it('pins the intent 60 table', () => {
    const rate = (hz: number) => hz / ceilingDivisor(hz, 60);
    expect(ceilingDivisor(60, 60)).toBe(1);
    expect(ceilingDivisor(75, 60)).toBe(1);
    expect(ceilingDivisor(50, 60)).toBe(1);
    expect(rate(90)).toBe(45);
    expect(rate(100)).toBe(50);
    expect(rate(120)).toBe(60);
    expect(rate(144)).toBe(72);
    expect(rate(165)).toBe(55);
    expect(rate(240)).toBe(60);
    expect(rate(360)).toBe(72);
  });

  it('never paces a frame past one input tick', () => {
    for (let hz = 24; hz <= 500; hz++) {
      for (const intent of [30, 60]) {
        const divisor = ceilingDivisor(hz, intent);
        if (divisor === 1) continue;
        expect(hz / divisor).toBeGreaterThanOrEqual(MIN_CEILING_FPS);
        expect((1000 / hz) * divisor).toBeLessThan(INPUT_TICK_MS);
      }
    }
  });
});

describe('frame cadence', () => {
  it('renders one 60 Hz slot out of two, with no drift and no misses', () => {
    const c = createFrameCadence();
    configureFrameCadence(c, 30, 'paced', 1000 / 60);
    let rendered = 0;
    for (let i = 1; i <= 600; i++) if (frameCadenceShouldRender(c, (i * 1000) / 60)) rendered++;
    expect(rendered).toBe(300);
    expect(c.missShare).toBe(0);
  });

  it('counts a missed slot and restarts the rhythm from the late frame', () => {
    const c = createFrameCadence();
    const slot = 1000 / 60;
    configureFrameCadence(c, 30, 'paced', slot);
    expect(frameCadenceShouldRender(c, 2 * slot)).toBe(true);
    expect(frameCadenceShouldRender(c, 4 * slot)).toBe(true);
    // The next frame lands three slots later (50 ms), then two slots after that.
    expect(frameCadenceShouldRender(c, 7 * slot)).toBe(true);
    expect(c.missShare).toBeGreaterThan(0);
    expect(frameCadenceShouldRender(c, 8 * slot)).toBe(false);
    expect(frameCadenceShouldRender(c, 9 * slot)).toBe(true);
  });

  it('is inert on a display already at the intent, and with no reading', () => {
    const c = createFrameCadence();
    configureFrameCadence(c, 30, 'paced', 1000 / 30);
    expect(c.targetIntervalMs).toBe(0);
    configureFrameCadence(c, 30, 'unknown', 0);
    expect(c.targetIntervalMs).toBe(0);
    configureFrameCadence(c, 0, 'paced', 1000 / 144);
    expect(c.targetIntervalMs).toBe(0);
  });

  it('is a plain time limiter without vsync', () => {
    const c = createFrameCadence();
    configureFrameCadence(c, 30, 'unpaced', 0);
    expect(c.targetIntervalMs).toBeCloseTo(33.33, 1);
    let rendered = 0;
    for (let t = 1; t <= 10000; t += 0.5) if (frameCadenceShouldRender(c, t)) rendered++;
    expect(rendered).toBeGreaterThanOrEqual(299);
    expect(rendered).toBeLessThanOrEqual(301);
  });
});

// A tiny host: either a vsync display (callbacks on slots, a busy frame pushes
// the next callback to the first slot after its cost) or an uncapped rAF.
function runHost(opts: {
  refreshMs: number | null;
  costMs: number | ((nowMs: number) => number);
  seconds: number;
  intent: 0 | 30 | 60 | 'auto';
  governorShedding?: () => boolean;
  remembered?: 0 | 30 | 60 | null;
  gate?: Partial<FrameCadenceGateView>;
  cover?: () => boolean;
}) {
  let now = 0;
  const host: { pending: { at: number; timer: boolean } | null; timerCb: (() => void) | null } = {
    pending: null,
    timerCb: null,
  };
  let arms = 0;
  let maxArmsPerCallback = 0;
  const renderedAt: number[] = [];
  const published = { target: -1, share: -1, hold: false };
  const saved: number[] = [];
  const intentLog: Array<{ at: number; intent: number }> = [];
  let callbacks = 0;
  const nextFrameAt = (from: number) =>
    opts.refreshMs === null
      ? from + 0.3
      : (Math.floor(from / opts.refreshMs + 1e-9) + 1) * opts.refreshMs;
  const wiring = new FrameCadenceWiring({
    requestFrame: () => {
      arms++;
      host.pending = { at: nextFrameAt(now), timer: false };
    },
    setTimer: (cb, ms) => {
      arms++;
      host.pending = { at: now + ms, timer: true };
      host.timerCb = cb;
    },
    coverActive: opts.cover ?? (() => false),
    publish: (target, share, hold) => {
      published.target = target;
      published.share = share;
      published.hold = hold;
    },
    governorShedding: opts.governorShedding ?? (() => false),
    autoMemory: {
      load: () => opts.remembered ?? null,
      save: (_hz, ceiling) => saved.push(ceiling),
    },
  });
  if (opts.intent === 'auto') wiring.setAuto();
  else wiring.setIntent(opts.intent);
  const gate: FrameCadenceGateView = {
    hidden: false,
    desktopApp: false,
    graphicsRebuildPaused: false,
    worldDrawHeld: false,
    ...opts.gate,
  };
  const frame = (t: number): void => {
    callbacks++;
    const before = arms;
    const skip = wiring.armAndSkip(frame, t, gate);
    maxArmsPerCallback = Math.max(maxArmsPerCallback, arms - before);
    if (skip) return;
    renderedAt.push(t);
    const intentNow = wiring.snapshot().intent;
    if (intentLog.length === 0 || intentLog[intentLog.length - 1].intent !== intentNow) {
      intentLog.push({ at: t, intent: intentNow });
    }
    now = t + (typeof opts.costMs === 'function' ? opts.costMs(t) : opts.costMs);
    if (host.pending && !host.pending.timer) host.pending = { at: nextFrameAt(now), timer: false };
  };
  host.pending = { at: nextFrameAt(0), timer: false };
  while (now < opts.seconds * 1000) {
    const due = host.pending;
    if (!due) throw new Error('the frame chain died: a callback armed nothing');
    now = Math.max(now, due.at);
    host.pending = null;
    if (due.timer) host.timerCb?.();
    else frame(now);
  }
  const tail = renderedAt.filter((t) => t > (opts.seconds - 5) * 1000);
  const intervals = tail.slice(1).map((t, i) => t - tail[i]);
  return { wiring, callbacks, intervals, maxArmsPerCallback, published, saved, intentLog };
}

describe('frame cadence wiring', () => {
  it('parses the dev URL intent', () => {
    expect(parseFrameCeilingIntent('')).toBeNull();
    expect(parseFrameCeilingIntent('?fpscap=30')).toBe(30);
    expect(parseFrameCeilingIntent('?fpscap=60')).toBe(60);
    expect(parseFrameCeilingIntent('?fpscap=display')).toBe(0);
  });

  it('holds a steady two-slot rhythm on a 60 Hz display', () => {
    const r = runHost({ refreshMs: 1000 / 60, costMs: 12, seconds: 20, intent: 30 });
    expect(r.wiring.snapshot().divisor).toBe(2);
    expect(r.published.target).toBeCloseTo(33.33, 1);
    expect(r.published.share).toBe(0);
    for (const i of r.intervals) expect(i).toBeCloseTo(33.33, 1);
    expect(r.maxArmsPerCallback).toBe(1);
  });

  it('steadies a machine that misses the 60 Hz slot into two slots', () => {
    const r = runHost({ refreshMs: 1000 / 60, costMs: 24, seconds: 20, intent: 30 });
    for (const i of r.intervals) expect(i).toBeCloseTo(33.33, 1);
  });

  it('leaves every callback alone with no ceiling', () => {
    const r = runHost({ refreshMs: 1000 / 60, costMs: 5, seconds: 10, intent: 0 });
    expect(r.wiring.snapshot().skipped).toBe(0);
    expect(r.published.target).toBe(0);
  });

  it('never skips under a loading cover, a held draw, or a hidden desktop shell', () => {
    const base = { refreshMs: 1000 / 60, costMs: 5, seconds: 10, intent: 30 as const };
    expect(runHost({ ...base, cover: () => true }).wiring.snapshot().skipped).toBe(0);
    expect(runHost({ ...base, gate: { worldDrawHeld: true } }).wiring.snapshot().skipped).toBe(0);
    expect(
      runHost({ ...base, gate: { graphicsRebuildPaused: true } }).wiring.snapshot().skipped,
    ).toBe(0);
    expect(
      runHost({ ...base, gate: { hidden: true, desktopApp: true } }).wiring.snapshot().skipped,
    ).toBe(0);
  });

  it('limits an uncapped rAF by sleeping, not by spinning', () => {
    const r = runHost({ refreshMs: null, costMs: 5, seconds: 30, intent: 30 });
    expect(r.wiring.snapshot().verdict).toBe('unpaced');
    const mean = r.intervals.reduce((a, b) => a + b, 0) / r.intervals.length;
    expect(mean).toBeCloseTo(33.33, 0);
    // A spin would answer every 0.3 ms: about 3000 callbacks per second.
    const perSecond = r.callbacks / 30;
    expect(perSecond).toBeLessThan(80);
    expect(r.maxArmsPerCallback).toBe(1);
  });

  it('finds an uncapped rAF whose jitter fits no lattice, through the probe burst', () => {
    let n = 0;
    const costs = [2.6, 3.9, 3.1, 4.4, 2.9, 3.6, 5.2, 3.3];
    const r = runHost({
      refreshMs: null,
      get costMs() {
        return costs[n++ % costs.length];
      },
      seconds: 40,
      intent: 30,
    } as Parameters<typeof runHost>[0]);
    expect(r.wiring.snapshot().verdict).toBe('unpaced');
  });

  it('does not read its own timer cadence back as a display', () => {
    const r = runHost({ refreshMs: null, costMs: 5, seconds: 60, intent: 30 });
    const snap = r.wiring.snapshot();
    expect(snap.verdict).toBe('unpaced');
    expect(snap.targetIntervalMs).toBeCloseTo(33.33, 1);
  });
});

describe('automatic frame rate limit', () => {
  const SLOT = 1000 / 60;
  // An uneven machine: frames alternate between one and two slots. (A machine
  // that misses EVERY slot is already regular, reads as a slower display, and
  // is rightly left alone.)
  const uneven = (slow: number, fast: number) => {
    let n = 0;
    return () => (n++ % 2 === 0 ? slow : fast);
  };

  it('steps down to 30 on a 60 Hz machine that keeps missing its slot, and remembers it', () => {
    const r = runHost({
      refreshMs: SLOT,
      costMs: uneven(22, 12),
      seconds: 40,
      intent: 'auto',
    });
    expect(r.intentLog.map((e) => e.intent)).toEqual([0, 30]);
    expect(r.intentLog[1].at).toBeLessThan(35_000);
    for (const i of r.intervals) expect(i).toBeCloseTo(33.33, 1);
    expect(r.saved).toEqual([30]);
    expect(r.published.hold).toBe(true);
  });

  it('leaves a machine that holds its display alone', () => {
    const r = runHost({ refreshMs: SLOT, costMs: 9, seconds: 60, intent: 'auto' });
    expect(r.intentLog.map((e) => e.intent)).toEqual([0]);
    expect(r.published.hold).toBe(false);
    expect(r.saved).toEqual([]);
  });

  it('waits for the quality governor: no step down while it is still shedding', () => {
    const r = runHost({
      refreshMs: SLOT,
      costMs: uneven(22, 12),
      seconds: 60,
      intent: 'auto',
      governorShedding: () => true,
    });
    expect(r.intentLog.map((e) => e.intent)).toEqual([0]);
  });

  it('goes through about 60 first on a 144 Hz display', () => {
    const r = runHost({
      refreshMs: 1000 / 144,
      costMs: uneven(9, 4),
      seconds: 40,
      intent: 'auto',
    });
    expect(r.intentLog.map((e) => e.intent)).toEqual([0, 60]);
    expect(r.wiring.snapshot().divisor).toBe(2);
  });

  it('returns to full cadence through a trial once the load is gone', () => {
    const r = runHost({
      refreshMs: SLOT,
      costMs: (
        (slow) => (t: number) =>
          t < 40_000 ? slow() : 6
      )(uneven(22, 12)),
      seconds: 140,
      intent: 'auto',
    });
    expect(r.intentLog.map((e) => e.intent)).toEqual([0, 30, 0]);
    expect(r.saved).toEqual([30, 0]);
    expect(r.wiring.snapshot().auto).toBe(true);
    expect(r.published.hold).toBe(false);
  });

  it('falls back from a failed trial and doubles its wait', () => {
    const r = runHost({ refreshMs: SLOT, costMs: uneven(22, 12), seconds: 330, intent: 'auto' });
    const downs = r.intentLog.filter((e) => e.intent === 30).map((e) => e.at);
    const trials = r.intentLog.filter((e, i) => i > 0 && e.intent === 0).map((e) => e.at);
    expect(trials.length).toBe(2);
    // First trial about 60 s after the descent, the second about 120 s after the fallback.
    expect(trials[0] - downs[0]).toBeGreaterThan(55_000);
    expect(trials[0] - downs[0]).toBeLessThan(80_000);
    expect(trials[1] - downs[1]).toBeGreaterThan(115_000);
    expect(trials[1] - downs[1]).toBeLessThan(140_000);
    // A trial is never remembered: only the settled ceiling is.
    expect(r.saved).toEqual([30, 30, 30]);
  });

  it('stops yoyoing in a place whose load comes and goes: a quick step back down doubles the wait', () => {
    // 50 s uneven, 25 s light, repeating: a trial regularly lands on a light stretch.
    const slow = uneven(22, 12);
    const r = runHost({
      refreshMs: SLOT,
      costMs: (t) => (t % 75_000 < 50_000 ? slow() : 6),
      seconds: 1500,
      intent: 'auto',
    });
    const downs = r.intentLog.filter((e) => e.intent === 30).map((e) => e.at);
    const stays = downs.slice(1).map((t, i) => t - downs[i]);
    expect(downs.length).toBeGreaterThanOrEqual(3);
    // Each stay at the ceiling is longer than the one before, never a fixed beat.
    expect(stays[stays.length - 1]).toBeGreaterThan(stays[0] * 2);
    expect(downs.length).toBeLessThan(9);
  });

  it('starts at the remembered ceiling', () => {
    const r = runHost({
      refreshMs: SLOT,
      costMs: uneven(22, 12),
      seconds: 10,
      intent: 'auto',
      remembered: 30,
    });
    expect(r.intentLog.map((e) => e.intent)).toEqual([0, 30]);
    expect(r.intentLog[1].at).toBeLessThan(3_000);
  });

  it('is inert when rAF is uncapped, and an explicit choice switches it off', () => {
    const unpaced = runHost({ refreshMs: null, costMs: 25, seconds: 60, intent: 'auto' });
    expect(unpaced.intentLog.map((e) => e.intent)).toEqual([0]);
    const explicit = runHost({ refreshMs: SLOT, costMs: uneven(22, 12), seconds: 60, intent: 0 });
    expect(explicit.intentLog.map((e) => e.intent)).toEqual([0]);
  });
});

describe('frame cadence beacon fields', () => {
  const base: FrameCadenceSnapshot = {
    auto: false,
    autoTrial: false,
    autoLateShare: 0,
    intent: 0,
    verdict: 'paced',
    refreshHz: 59.94,
    divisor: 1,
    targetIntervalMs: 0,
    missShare: 0,
    rendered: 0,
    skipped: 0,
  };

  it('reports the renderer budget target while the ceiling is inert', () => {
    expect(frameCadenceBeaconFieldsFrom(base, 60)).toEqual({
      frameCapIntent: 0,
      cadenceDivisor: 1,
      refreshHz: 59.9,
      targetFps: 60,
    });
  });

  it('reports the effective target of a paced ceiling: 144 Hz over four slots is 36', () => {
    const s = {
      ...base,
      intent: 30 as const,
      refreshHz: 144,
      divisor: 4,
      targetIntervalMs: 4000 / 144,
    };
    expect(frameCadenceBeaconFieldsFrom(s, 60)).toEqual({
      frameCapIntent: 30,
      cadenceDivisor: 4,
      refreshHz: 144,
      targetFps: 36,
    });
  });

  it('reports the unpaced limiter as its own rate with no display reading', () => {
    const s = {
      ...base,
      intent: 30 as const,
      verdict: 'unpaced' as const,
      refreshHz: 0,
      targetIntervalMs: 1000 / 30,
    };
    expect(frameCadenceBeaconFieldsFrom(s, 120)).toEqual({
      frameCapIntent: 30,
      cadenceDivisor: 1,
      refreshHz: 0,
      targetFps: 30,
    });
  });
});
