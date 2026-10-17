import { describe, expect, it } from 'vitest';
import {
  buildCascadeSpectrum,
  CASCADE_HANDOVER,
  DEFAULT_SEA_STATE,
  donelanBannerSpread,
  OCEAN_LOOP_SECONDS,
  OCEAN_VARIANCE_SAMPLES,
  oceanCyclesPerLoop,
  oceanOmega,
  oceanPlanForTier,
  oceanSpectrumK,
  oceanWaveIndex,
  stockhamInverse,
  stockhamStage,
  unresolvedSlopeVariance,
} from '../src/render/ocean/ocean_spectrum_core';

describe('ocean cascade plan', () => {
  it('has no simulation on low and hands every band to exactly one cascade', () => {
    expect(oceanPlanForTier('low')).toBeNull();
    for (const tier of ['medium', 'high', 'ultra', 'insane'] as const) {
      const plan = oceanPlanForTier(tier);
      expect(plan).not.toBeNull();
      if (!plan) continue;
      expect(Math.log2(plan.resolution) % 1).toBe(0);
      plan.cascades.forEach((c, i) => {
        // Each band sits inside its own grid's resolved range.
        expect(c.kHigh).toBeLessThanOrEqual((Math.PI * plan.resolution) / c.size + 1e-9);
        expect(c.kLow).toBeLessThan(c.kHigh);
        const next = plan.cascades[i + 1];
        if (next) {
          expect(next.kLow).toBeCloseTo(c.kHigh, 12);
          expect(next.kLow).toBeCloseTo(((2 * Math.PI) / next.size) * CASCADE_HANDOVER, 12);
        }
      });
      expect(plan.cascades[0].kLow).toBe(0);
    }
  });
});

describe('ocean spectrum', () => {
  it('rounds every travelling wave to whole cycles per loop, so the wrap is seamless', () => {
    for (const k of [0.01, 0.2, 1.7, 13, 140]) {
      const cycles = oceanCyclesPerLoop(k);
      expect(Number.isInteger(cycles)).toBe(true);
      expect(cycles).toBeGreaterThanOrEqual(1);
      // Within half a cycle of the true dispersion over one loop.
      expect(
        Math.abs(cycles - (oceanOmega(k) * OCEAN_LOOP_SECONDS) / (2 * Math.PI)),
      ).toBeLessThanOrEqual(0.5);
    }
    expect(oceanCyclesPerLoop(0)).toBe(0);
  });

  it('spreads energy downwind and normalizes the spreading function', () => {
    const wp = 1.2;
    for (const ratio of [0.6, 1, 1.3, 3]) {
      let sum = 0;
      const steps = 4000;
      for (let i = 0; i < steps; i++) {
        const theta = -Math.PI + ((i + 0.5) / steps) * 2 * Math.PI;
        sum += donelanBannerSpread(theta, ratio * wp, wp) * ((2 * Math.PI) / steps);
      }
      expect(sum).toBeCloseTo(1, 3);
    }
    const sea = { ...DEFAULT_SEA_STATE, swellHeight: 0 };
    const k = 0.2;
    const down = oceanSpectrumK(Math.cos(sea.windAngle) * k, Math.sin(sea.windAngle) * k, sea);
    const up = oceanSpectrumK(-Math.cos(sea.windAngle) * k, -Math.sin(sea.windAngle) * k, sea);
    expect(down).toBeGreaterThan(up * 20);
  });

  it('builds conjugate-paired amplitudes with no energy outside the band', () => {
    const plan = oceanPlanForTier('medium');
    if (!plan) throw new Error('medium has a plan');
    const n = plan.resolution;
    const spec = buildCascadeSpectrum(plan, 1, DEFAULT_SEA_STATE, 20061);
    const again = buildCascadeSpectrum(plan, 1, DEFAULT_SEA_STATE, 20061);
    expect(Array.from(spec.h0.slice(0, 64))).toEqual(Array.from(again.h0.slice(0, 64)));
    const dk = (2 * Math.PI) / plan.cascades[1].size;
    for (let row = 0; row < n; row += 7) {
      for (let col = 0; col < n; col += 5) {
        const t = row * n + col;
        const m = ((n - row) % n) * n + ((n - col) % n);
        // conj(h0(-k)) stored here is the conjugate of what -k stores as h0.
        expect(spec.h0[t * 4 + 2]).toBe(spec.h0[m * 4]);
        expect(spec.h0[t * 4 + 3]).toBe(-spec.h0[m * 4 + 1]);
        const k = Math.hypot(oceanWaveIndex(col, n) * dk, oceanWaveIndex(row, n) * dk);
        if (k < plan.cascades[1].kLow || k >= plan.cascades[1].kHigh) {
          expect(spec.h0[t * 4]).toBe(0);
          expect(spec.h0[t * 4 + 1]).toBe(0);
        }
        expect(spec.waves[t * 4 + 2]).toBe(oceanCyclesPerLoop(k));
      }
    }
    expect(spec.heightVariance).toBeGreaterThan(0);
  });

  it('keeps the open sea gentle enough for a swimmer', () => {
    const plan = oceanPlanForTier('ultra');
    if (!plan) throw new Error('ultra has a plan');
    let variance = 0;
    plan.cascades.forEach((_, i) => {
      variance += buildCascadeSpectrum(plan, i, DEFAULT_SEA_STATE, 1).heightVariance;
    });
    const significantHeight = 4 * Math.sqrt(variance);
    // Visible rolling sea, never a storm next to a 2.6 unit character.
    expect(significantHeight).toBeGreaterThan(0.5);
    expect(significantHeight).toBeLessThan(2.2);
  });

  it('reports less unresolved slope the finer a pixel resolves', () => {
    const plan = oceanPlanForTier('high');
    if (!plan) throw new Error('high has a plan');
    const table = unresolvedSlopeVariance(plan, DEFAULT_SEA_STATE);
    expect(table.length).toBe(OCEAN_VARIANCE_SAMPLES);
    for (let i = 1; i < table.length; i++) expect(table[i]).toBeLessThanOrEqual(table[i - 1]);
    expect(table[0]).toBeGreaterThan(0.001);
    expect(table[table.length - 1]).toBe(0);
  });
});

describe('Stockham FFT stages (the GPU passes mirror this arithmetic)', () => {
  it('reads each input exactly twice per stage and covers every output', () => {
    const n = 16;
    for (let p = 1; p < n; p *= 2) {
      const reads = new Array(n).fill(0);
      for (let j = 0; j < n; j++) {
        const { a, b } = stockhamStage(j, p, n);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBe(a + n / 2);
        reads[a]++;
        reads[b]++;
      }
      expect(reads.every((r) => r === 2)).toBe(true);
    }
  });

  it('is the inverse DFT in natural order', () => {
    const n = 32;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      re[i] = Math.sin(i * 1.7) + (i % 3);
      im[i] = Math.cos(i * 0.6) - 0.5;
    }
    const [outRe, outIm] = stockhamInverse(re, im);
    for (let x = 0; x < n; x++) {
      let sr = 0;
      let si = 0;
      for (let k = 0; k < n; k++) {
        const a = (2 * Math.PI * k * x) / n;
        sr += re[k] * Math.cos(a) - im[k] * Math.sin(a);
        si += re[k] * Math.sin(a) + im[k] * Math.cos(a);
      }
      expect(outRe[x]).toBeCloseTo(sr, 9);
      expect(outIm[x]).toBeCloseTo(si, 9);
    }
  });
});
