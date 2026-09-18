import { describe, expect, it } from 'vitest';
import {
  CHOSEN_CADENCE_ALLOWED_MISS_SHARE,
  chosenCadenceFrameMs,
  chosenCadenceLoadMs,
  NO_CHOSEN_CADENCE,
} from '../src/render/chosen_cadence_pressure_core';
import { GFX_BUDGETS, type GfxTier } from '../src/render/gfx';
import {
  RenderBudgetGovernor,
  type RenderBudgetSample,
  type RenderBudgetState,
} from '../src/render/render_budget';

// The frame rate ceiling makes the wall interval a choice. Read raw, a held
// 33.4 ms rhythm with an idle main thread is over every tier's frame budget and
// is exactly the external frame cap candidate. Under a chosen cadence the
// governor judges the share of frames missing their slot instead.

const TIERS: GfxTier[] = ['low', 'medium', 'high', 'ultra', 'insane'];

function sample(overrides: Partial<RenderBudgetSample> = {}): RenderBudgetSample {
  return {
    dt: 1 / 30,
    frameMs: 33.4,
    totalMs: 9,
    submitMs: 5,
    calls: 220,
    triangles: 1_540_000,
    grassVisibleTufts: 2_600,
    grassVisibleChunks: 8,
    activeViews: 25,
    createdViews: 0,
    minRenderScale: 1,
    maxRenderScale: 1,
    ...overrides,
  };
}

function governor(tier: GfxTier): RenderBudgetGovernor {
  const g = new RenderBudgetGovernor({ tier, budget: GFX_BUDGETS[tier], enabled: true });
  g.reset(1, 1, 1);
  return g;
}

function run(
  g: RenderBudgetGovernor,
  seconds: number,
  overrides: Partial<RenderBudgetSample>,
): { state: RenderBudgetState; probed: boolean; degraded: boolean } {
  let state = g.state();
  let probed = false;
  let degraded = false;
  for (let t = 0; t < seconds; t += 1 / 30) {
    state = g.update(sample(overrides));
    if (state.frameCapProbe !== 'idle' || state.externalFrameCap) probed = true;
    if (state.mode === 'degrading') degraded = true;
  }
  return { state, probed, degraded };
}

describe('chosen cadence reading', () => {
  it.each(TIERS)('%s: a held rhythm reads under the recover line', (tier) => {
    const b = GFX_BUDGETS[tier];
    expect(chosenCadenceFrameMs(0, b.dropFrameMs, b.recoverFrameMs)).toBeLessThan(b.recoverFrameMs);
  });

  it.each(TIERS)('%s: the allowed miss share lands exactly on the drop line', (tier) => {
    const b = GFX_BUDGETS[tier];
    expect(
      chosenCadenceFrameMs(CHOSEN_CADENCE_ALLOWED_MISS_SHARE, b.dropFrameMs, b.recoverFrameMs),
    ).toBeCloseTo(b.dropFrameMs, 6);
  });

  it.each(TIERS)('%s: a machine missing most slots reads urgent', (tier) => {
    const b = GFX_BUDGETS[tier];
    expect(chosenCadenceFrameMs(0.4, b.dropFrameMs, b.recoverFrameMs)).toBeGreaterThanOrEqual(
      b.urgentFrameMs,
    );
  });

  it('reads the load as nominal while the chosen interval is held, late past it', () => {
    expect(chosenCadenceLoadMs(33.4, 33.4)).toBeCloseTo(16.67, 1);
    expect(chosenCadenceLoadMs(50, 33.4)).toBeCloseTo(33.27, 1);
    // No chosen cadence (including a real 30 Hz display): the wall interval stands.
    expect(chosenCadenceLoadMs(33.4, 0)).toBe(33.4);
  });
});

describe('governor under a chosen cadence', () => {
  it('without it, a held 33 ms rhythm with an idle main thread opens the cap probe', () => {
    const r = run(governor('low'), 20, {});
    expect(r.probed).toBe(true);
  });

  it('a real 30 Hz display keeps today’s behavior: the marker is not a cadence', () => {
    const r = run(governor('low'), 20, { chosenCadenceMissShare: NO_CHOSEN_CADENCE });
    expect(r.probed).toBe(true);
  });

  it.each(TIERS)('%s: a held chosen cadence opens no probe and sheds nothing', (tier) => {
    const r = run(governor(tier), 30, { chosenCadenceMissShare: 0 });
    expect(r.probed).toBe(false);
    expect(r.degraded).toBe(false);
    expect(r.state.reason).not.toBe('frame-cap');
  });

  it.each(TIERS)('%s: a chosen cadence that keeps missing its slot sheds quality', (tier) => {
    const r = run(governor(tier), 30, { chosenCadenceMissShare: 0.3 });
    expect(r.probed).toBe(false);
    expect(r.degraded).toBe(true);
  });

  it('CPU-side cost still reads over budget under a held chosen cadence', () => {
    const held = run(governor('low'), 30, { chosenCadenceMissShare: 0 });
    expect(held.state.pressure).toBeLessThan(1);
    const costly = run(governor('low'), 30, { chosenCadenceMissShare: 0, totalMs: 26 });
    expect(costly.state.pressure).toBeGreaterThanOrEqual(1);
    expect(costly.probed).toBe(false);
  });
});
