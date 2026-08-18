// The one compile host every streamed-decor reveal gate shares
// (src/render/reveal_compile_host.ts). Its whole policy is a priority and an
// order: an IMMINENT key (the decor an arrival's camera landed among) rides at
// LIVE_VIEW so the driver links it ahead of the rest of the reveal lane, an
// ordinary reveal stays at VISIBLE_PREWARM under the live entity gates, and in
// both cases the link comes before the upload, which comes before the touch.

import { describe, expect, it } from 'vitest';
import { GPU_WORK_PRIORITY } from '../src/render/background_gpu_queue';
import { createRevealCompileHost, REVEAL_GATE_PREP_KIND } from '../src/render/reveal_compile_host';
import { REVEAL_GATE_WATCHDOG_MS, REVEAL_SOFT_DEADLINE_MIN_MS } from '../src/render/reveal_gate';

/** Records every arm the host drives, in order, with the priority it used. */
function recordingDeps(predictRevealMs = 0) {
  const calls: { arm: string; priority: number; label?: string }[] = [];
  const deps = {
    gate(work: () => Promise<unknown>, options: { priority: number; label: string }) {
      calls.push({ arm: 'gate', priority: options.priority, label: options.label });
      return work();
    },
    compileColor(_target: object) {
      calls.push({ arm: 'color', priority: Number.NaN });
      return Promise.resolve();
    },
    compileShadow(_target: object) {
      calls.push({ arm: 'shadow', priority: Number.NaN });
      return Promise.resolve();
    },
    upload(_target: object, priority: number) {
      calls.push({ arm: 'upload', priority });
      return Promise.resolve();
    },
    touch(_target: object, priority: number) {
      calls.push({ arm: 'touch', priority });
      return Promise.resolve();
    },
    predictRevealMs: () => predictRevealMs,
  };
  return { calls, host: createRevealCompileHost(deps) };
}

const root = { name: 'eastbrookTownMicroOpaqueBatch', type: 'Mesh' };

describe('reveal compile host priority', () => {
  it('submits an IMMINENT key at LIVE_VIEW, link, upload and touch alike', async () => {
    const { calls, host } = recordingDeps();
    await host.compile(root, true);
    const priorities = calls
      .filter((call) => call.arm === 'gate' || call.arm === 'upload' || call.arm === 'touch')
      .map((call) => call.priority);
    expect(priorities).toEqual([
      GPU_WORK_PRIORITY.LIVE_VIEW,
      GPU_WORK_PRIORITY.LIVE_VIEW,
      GPU_WORK_PRIORITY.LIVE_VIEW,
    ]);
  });

  it('submits an ordinary reveal at VISIBLE_PREWARM, link, upload and touch alike', async () => {
    const { calls, host } = recordingDeps();
    await host.compile(root, false);
    const priorities = calls
      .filter((call) => call.arm === 'gate' || call.arm === 'upload' || call.arm === 'touch')
      .map((call) => call.priority);
    expect(priorities).toEqual([
      GPU_WORK_PRIORITY.VISIBLE_PREWARM,
      GPU_WORK_PRIORITY.VISIBLE_PREWARM,
      GPU_WORK_PRIORITY.VISIBLE_PREWARM,
    ]);
  });

  it('keeps the imminent lane under the actionable gates and above every other reveal', () => {
    // Cosmetic scenery may go first among the reveals, never ahead of a mob or
    // a player the camera can act on.
    expect(GPU_WORK_PRIORITY.LIVE_VIEW).toBeLessThan(GPU_WORK_PRIORITY.ACTIONABLE_VIEW);
    expect(GPU_WORK_PRIORITY.LIVE_VIEW).toBeGreaterThan(GPU_WORK_PRIORITY.VISIBLE_PREWARM);
  });

  it('links, then uploads, then touches, whatever the priority', async () => {
    // A touch before the link warms nothing, and an upload after the touch is
    // measured by the touch's own driver round trip instead of being its own
    // budgeted piece.
    for (const imminent of [true, false]) {
      const { calls, host } = recordingDeps();
      await host.compile(root, imminent);
      expect(calls.map((call) => call.arm)).toEqual(['gate', 'color', 'shadow', 'upload', 'touch']);
    }
  });

  it('labels every unit under the one prep kind the cost model is keyed on', async () => {
    const { calls, host } = recordingDeps();
    await host.compile(root, true);
    expect(calls[0].label).toBe(`${REVEAL_GATE_PREP_KIND}:${root.name}`);
    const { calls: unnamed, host: other } = recordingDeps();
    await other.compile({ name: '', type: 'Group' }, false);
    expect(unnamed[0].label).toBe(`${REVEAL_GATE_PREP_KIND}:Group`);
  });
});

describe('reveal compile host soft deadline', () => {
  it('reports the learned cost times the root count, floored and clamped', () => {
    const { host } = recordingDeps(400);
    expect(host.expectedMs?.('town', 1)).toBe(REVEAL_SOFT_DEADLINE_MIN_MS);
    expect(host.expectedMs?.('town', 10)).toBe(4_000);
    expect(host.expectedMs?.('town', 1_000)).toBe(REVEAL_GATE_WATCHDOG_MS);
  });
});
