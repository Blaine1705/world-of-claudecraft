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
  FrameCadenceWiring,
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
  costMs: number;
  seconds: number;
  intent: 0 | 30 | 60;
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
  const published = { target: -1, share: -1 };
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
    publish: (target, share) => {
      published.target = target;
      published.share = share;
    },
  });
  wiring.setIntent(opts.intent);
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
    now = t + opts.costMs;
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
  return { wiring, callbacks, intervals, maxArmsPerCallback, published };
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
