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

  it('drops a free-form flag value instead of copying it into the artifact', () => {
    // modular, modularpeers and gfx are the only unbounded operator-controlled
    // strings in the receipt, and the capture embeds the whole receipt verbatim
    // (scripts/gpu_hitch_capture.mjs), around the measurementParams allowlist
    // that guards every other path. Every flag the client honours is a short
    // token, so anything longer or otherwise shaped is not a flag this run used.
    (globalThis as unknown as { window: Record<string, unknown> }).window = {};
    const long = 'a'.repeat(33);
    const receipt = publishGpuHitchRuntimeReceipt({
      search: `?modular=${long}&modularpeers=${encodeURIComponent('tok en/with spaces')}&gfx=${encodeURIComponent('<script>')}`,
      renderer: null,
    });
    expect(receipt?.requested).toMatchObject({
      modular: null,
      modularpeers: null,
      gfx: null,
    });
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(long);
    expect(serialized).not.toContain('script');

    // A real flag still travels: bounding must not silently blank the knobs the
    // A/B comparator keys on.
    const kept = publishGpuHitchRuntimeReceipt({
      search: '?modular=off&modularpeers=on&gfx=ultra',
      renderer: null,
    });
    expect(kept?.requested).toMatchObject({ modular: 'off', modularpeers: 'on', gfx: 'ultra' });
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
