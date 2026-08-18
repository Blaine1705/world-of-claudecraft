// The blocking arrival chain lifted out of main.ts
// (src/game/arrival_warmup.ts). Every dependency is faked, so these cases pin
// the ORDER the steps run in, the curtain flag's lifetime (including on a
// failure), the bounded wait for the held reveals, and the frame-loop state
// main.ts gets back.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ARRIVAL_REVEAL_SETTLE_MAX_MS,
  arrivalRevealSettleMaxMs,
  type BlockingArrivalWarmupDeps,
  runBlockingArrivalWarmup,
  settleWorldEntryCover,
} from '../src/game/arrival_warmup';
import { arrivalCoverActive, resetArrivalCoverForTest } from '../src/render/arrival_cover';

interface Rig {
  calls: string[];
  waited: number[];
  deps: BlockingArrivalWarmupDeps;
  revealed: number;
  settled: number;
}

function rig(overrides: Partial<BlockingArrivalWarmupDeps> = {}): Rig {
  const calls: string[] = [];
  const waited: number[] = [];
  const state = { revealed: 0, settled: 0 };
  const deps: BlockingArrivalWarmupDeps = {
    renderer: {
      prepareZoneAt: async (x, z, onProgress) => {
        calls.push(`prepareZoneAt:${x},${z}`);
        onProgress?.(1, 2);
      },
      prepareZonesAround: async (x, z, radiusYd, onProgress) => {
        calls.push(`prepareZonesAround:${x},${z},${radiusYd}`);
        onProgress?.(2, 2);
      },
      prewarmZoneAt: async (x, z) => {
        calls.push(`prewarmZoneAt:${x},${z}`);
      },
      markGpuHitchReveal: () => calls.push('markGpuHitchReveal'),
    },
    ui: {
      showLoadingScreen: (text) => calls.push(`showLoadingScreen:${text}`),
      setLoadingProgressRange: (done, total, from, to) =>
        calls.push(`progress:${done}/${total}:${from}-${to}`),
      setLoadingPercent: (percent) => calls.push(`percent:${percent}`),
      hideLoadingScreen: () => calls.push('hideLoadingScreen'),
      nextPaint: async () => {
        calls.push('nextPaint');
      },
      fatalOverlay: (message) => calls.push(`fatalOverlay:${message}`),
    },
    t: (key, values) => (values ? `${key}(${JSON.stringify(values)})` : key),
    technicalErrorMessage: (error) => String(error),
    zoneX: 120,
    zoneZ: -40,
    online: false,
    neighborRadiusYd: 240,
    onRevealed: () => {
      state.revealed++;
      calls.push('onRevealed');
    },
    onSettled: () => {
      state.settled++;
      calls.push('onSettled');
    },
    setCover: (active) => calls.push(`cover:${active}`),
    awaitReveals: async (maxMs) => {
      waited.push(maxMs);
      calls.push('awaitReveals');
    },
    ...overrides,
  };
  return {
    calls,
    waited,
    deps,
    get revealed() {
      return state.revealed;
    },
    get settled() {
      return state.settled;
    },
  };
}

afterEach(() => {
  resetArrivalCoverForTest();
  vi.restoreAllMocks();
});

describe('runBlockingArrivalWarmup', () => {
  it('runs the arrival under the curtain, in order, and lifts it with the reveals settled', async () => {
    const r = rig();
    await runBlockingArrivalWarmup(r.deps);

    expect(r.calls).toEqual([
      'showLoadingScreen:loading.world',
      'cover:true',
      'nextPaint',
      'prepareZoneAt:120,-40',
      'progress:1/2:0-55',
      'prepareZonesAround:120,-40,240',
      'progress:2/2:55-94',
      // The empty-neighbourhood fill: a dungeon or rift interior reports no
      // progress above, so the band is closed explicitly.
      'progress:1/1:55-94',
      'percent:96',
      'prewarmZoneAt:120,-40',
      'awaitReveals',
      'markGpuHitchReveal',
      'percent:100',
      'nextPaint',
      'hideLoadingScreen',
      'onRevealed',
      'cover:false',
      'onSettled',
    ]);
    expect(r.waited).toEqual([ARRIVAL_REVEAL_SETTLE_MAX_MS]);
    expect(r.revealed).toBe(1);
    expect(r.settled).toBe(1);
  });

  it('marks the reveal exactly once, after the wait and before the last paint', () => {
    const r = rig();
    return runBlockingArrivalWarmup(r.deps).then(() => {
      expect(r.calls.filter((call) => call === 'markGpuHitchReveal')).toHaveLength(1);
      expect(r.calls.indexOf('markGpuHitchReveal')).toBeGreaterThan(
        r.calls.indexOf('awaitReveals'),
      );
      expect(r.calls.indexOf('markGpuHitchReveal')).toBeLessThan(r.calls.lastIndexOf('nextPaint'));
    });
  });

  it('holds the real cover flag up for the whole chain and drops it at the end', async () => {
    const seen: boolean[] = [];
    const r = rig({
      setCover: undefined,
      awaitReveals: async () => {
        seen.push(arrivalCoverActive());
      },
    });
    expect(arrivalCoverActive()).toBe(false);
    const chain = runBlockingArrivalWarmup(r.deps);
    expect(arrivalCoverActive()).toBe(true);
    await chain;

    expect(seen).toEqual([true]);
    expect(arrivalCoverActive()).toBe(false);
  });

  it('drops the real cover flag when the chain fails', async () => {
    // A stuck flag would suspend every reveal gate's escape bound for the rest
    // of the session, so the failure path matters more than the happy one.
    const r = rig({
      setCover: undefined,
      renderer: {
        prepareZoneAt: async () => {
          throw new Error('prepare exploded');
        },
        prepareZonesAround: async () => undefined,
        prewarmZoneAt: async () => undefined,
        markGpuHitchReveal: () => undefined,
      },
    });
    await runBlockingArrivalWarmup(r.deps);

    expect(arrivalCoverActive()).toBe(false);
    expect(r.calls).toContain(
      'fatalOverlay:loading.rendererFailed({"error":"Error: prepare exploded"})',
    );
    // The screen stays up on a fatal, and the frame loop is not resumed.
    expect(r.calls).not.toContain('hideLoadingScreen');
    expect(r.revealed).toBe(0);
    expect(r.settled).toBe(1);
  });

  it('survives a failed prewarm and still reveals', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = rig();
    r.deps.renderer.prewarmZoneAt = async () => {
      throw new Error('prewarm exploded');
    };
    await runBlockingArrivalWarmup(r.deps);

    expect(warn).toHaveBeenCalled();
    expect(r.calls).toContain('awaitReveals');
    expect(r.calls).toContain('hideLoadingScreen');
    expect(r.revealed).toBe(1);
  });

  it('streams the radius it is given, so a rift exit keeps its wider ring', async () => {
    const r = rig({ neighborRadiusYd: 999 });
    await runBlockingArrivalWarmup(r.deps);

    expect(r.calls).toContain('prepareZonesAround:120,-40,999');
  });

  it('pins the settle budget to three seconds', () => {
    // Long enough for a town kit's links on an integrated GPU, short enough
    // that a stuck driver cannot hold a loading screen open.
    expect(ARRIVAL_REVEAL_SETTLE_MAX_MS).toBe(3_000);
  });

  it('never adds a cosmetic wait for an online character, who is live on the server', async () => {
    expect(arrivalRevealSettleMaxMs(true)).toBe(0);
    expect(arrivalRevealSettleMaxMs(false)).toBe(ARRIVAL_REVEAL_SETTLE_MAX_MS);
    const r = rig({ online: true });
    await runBlockingArrivalWarmup(r.deps);
    expect(r.waited).toEqual([0]);
    // The cover still ran for the structural prepare: raised first, dropped last.
    expect(r.calls.indexOf('cover:true')).toBeLessThan(r.calls.indexOf('prepareZoneAt:120,-40'));
    expect(r.calls.at(-1)).toBe('onSettled');
    expect(r.calls.at(-2)).toBe('cover:false');
  });
});

describe('settleWorldEntryCover', () => {
  afterEach(() => resetArrivalCoverForTest());

  function entryRig(online: boolean) {
    const calls: string[] = [];
    const waited: number[] = [];
    let settleMs = -1;
    let flush: (() => void) | null = null;
    settleWorldEntryCover({
      adaptiveBudget: true,
      constrainedMemory: false,
      online,
      revealWorld: () => calls.push('revealWorld'),
      afterActiveAnimationMs: (ms, callback) => {
        settleMs = ms;
        flush = callback;
      },
      setCover: (active) => calls.push(active ? 'cover:on' : 'cover:off'),
      awaitReveals: async (maxMs) => {
        waited.push(maxMs);
        calls.push('awaitReveals');
      },
    });
    return { calls, waited, settleMs: () => settleMs, flush: () => flush?.() };
  }

  it('raises the cover at once, then reveals after the settle and the bounded wait (offline)', async () => {
    const r = entryRig(false);
    expect(r.calls).toEqual(['cover:on']);
    expect(r.settleMs()).toBeGreaterThan(0);
    r.flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(r.calls).toEqual(['cover:on', 'awaitReveals', 'revealWorld', 'cover:off']);
    expect(r.waited).toEqual([ARRIVAL_REVEAL_SETTLE_MAX_MS]);
  });

  it('online: no settle time and no cosmetic wait, the cover only spans the curtain', async () => {
    const r = entryRig(true);
    expect(r.settleMs()).toBe(0);
    r.flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(r.calls).toEqual(['cover:on', 'awaitReveals', 'revealWorld', 'cover:off']);
    expect(r.waited).toEqual([0]);
  });

  it('drops the cover even when revealWorld throws, and reports the throw', async () => {
    const calls: string[] = [];
    let flush = (): void => {};
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    settleWorldEntryCover({
      adaptiveBudget: false,
      constrainedMemory: false,
      online: true,
      revealWorld: () => {
        throw new Error('reveal failed');
      },
      afterActiveAnimationMs: (_ms, callback) => {
        flush = callback;
      },
      setCover: (active) => calls.push(active ? 'cover:on' : 'cover:off'),
      awaitReveals: async () => undefined,
    });
    flush();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(['cover:on', 'cover:off']);
    expect(report).toHaveBeenCalledWith('World reveal failed', expect.any(Error));
    report.mockRestore();
  });
});
