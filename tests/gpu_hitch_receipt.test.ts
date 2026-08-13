import { afterEach, describe, expect, it } from 'vitest';
import { publishGpuHitchRuntimeReceipt } from '../src/game/gpu_hitch_receipt';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('gpu hitch runtime receipt', () => {
  it('records requested knobs and explicitly reports unsupported release flags', () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    const receipt = publishGpuHitchRuntimeReceipt({
      search: '?perf&linkrate=24&modularpeers=off&token=secret',
      renderer: {
        tier: 'ultra',
        glVendor: 'vendor',
        glRenderer: 'renderer',
        contextLost: 0,
      },
    });
    expect(receipt).toMatchObject({
      schemaVersion: 3,
      requested: { linkrate: 24, modularpeers: 'off' },
      effective: {
        prewarmPacing: { available: false, mode: 'unsupported' },
        modular: { available: false },
        renderer: { tier: 'ultra', glRenderer: 'renderer' },
      },
    });
    expect(JSON.stringify(receipt)).not.toContain('secret');
  });

  it('publishes the pacing values consumed by the renderer after prewarm', () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    const receipt = publishGpuHitchRuntimeReceipt({
      search: '?perf&linkrate=12&linkburst=4',
      renderer: {
        prewarm: {
          prewarmPacing: {
            available: true,
            source: 'query',
            mode: 'limited',
            linksPerSecond: 12,
            burst: 4,
            compileBatchRoots: 16,
            hardMaxMs: 15_000,
            chargedLinks: 220,
            scope: 'compile-unit-sync-prologue',
          },
        },
      },
    });
    expect(receipt?.effective.prewarmPacing).toMatchObject({
      available: true,
      mode: 'limited',
      linksPerSecond: 12,
      chargedLinks: 220,
    });
  });

  it('records an explicit adaptive request and its lifecycle receipt', () => {
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    const receipt = publishGpuHitchRuntimeReceipt({
      search: '?perf&linkmode=adaptive',
      renderer: {
        prewarm: {
          prewarmPacing: {
            available: true,
            source: 'query',
            mode: 'adaptive',
            linksPerSecond: null,
            burst: null,
            compileBatchRoots: 16,
            hardMaxMs: 15_000,
            chargedLinks: 156,
            scope: 'compile-unit-lifecycle',
            adaptive: {
              state: 'revealed',
              windowLinks: 24,
              minWindowLinks: 8,
              maxWindowLinks: 32,
              maxWindowObserved: 24,
              estimatedLinksPerUnit: 10,
              inFlightLinks: 0,
              inFlightUnits: 0,
              submittedUnits: 18,
              settledUnits: 18,
              failedUnits: 0,
              backoffCount: 0,
              noProgressCount: 0,
              lastSettlementMs: 800,
            },
          },
        },
      },
    });

    expect(receipt).toMatchObject({
      requested: { linkmode: 'adaptive', linkrate: null },
      effective: {
        prewarmPacing: {
          mode: 'adaptive',
          linksPerSecond: null,
          scope: 'compile-unit-lifecycle',
          adaptive: { state: 'revealed', settledUnits: 18 },
        },
      },
    });
  });
});
