import { describe, expect, it } from 'vitest';
import {
  areComparable,
  comparabilityMismatches,
  countEventsInWindow,
  GPU_HITCH_SCHEMA_VERSION,
  linksBeforeQuery,
  measurementParams,
  sanitizeCaptureUrl,
  summarizeCapture,
  uploadBucketsBeforeQuery,
  validateCapture,
} from '../scripts/profiler/gpu_hitch_metrics.mjs';

function capture(overrides = {}) {
  return {
    schemaVersion: GPU_HITCH_SCHEMA_VERSION,
    capture: { complete: true, profile: 'shader', scenario: 'offline-entry' },
    provenance: {
      gitHead: 'abc123',
      sourceBuildId: 'source',
      servedBuildId: 'served',
      probeSha256: 'probe',
      analyzerSha256: 'analyzer',
      worktreeName: 'test',
    },
    requested: {
      linkmode: null,
      linkrate: null,
      linkburst: null,
      compileroots: null,
      prewarmdeadline: null,
      modular: null,
      modularpeers: null,
      gfx: 'ultra',
    },
    effective: {
      schemaVersion: GPU_HITCH_SCHEMA_VERSION,
      prewarmPacing: { available: false },
      modular: { available: false },
    },
    environment: {
      browserVersion: 'Chrome/test',
      browserFlags: ['--enable-gpu'],
      shaderDiskCache: 'disabled',
      glVendor: 'vendor',
      glRenderer: 'renderer',
      viewport: '1600x900',
      devicePixelRatio: 1,
      visible: true,
      visibilityTransitions: [{ atMs: 0, state: 'visible' }],
      contextLost: 0,
    },
    timeline: {
      phases: [],
      links: [],
      queries: [],
      compileUnits: [],
      uploadBucketWidthMs: 100,
      uploadBuckets: [],
    },
    ...overrides,
  };
}

describe('gpu hitch metrics', () => {
  it('keeps only allowlisted query parameters and drops credentials', () => {
    expect(measurementParams('?perf&linkrate=24&modularpeers=off&token=secret')).toMatchObject({
      linkrate: 24,
      modularpeers: 'off',
    });
    expect(measurementParams('?gfx=unsafe&modular=1')).toMatchObject({ gfx: null, modular: null });
    expect(
      sanitizeCaptureUrl(
        'https://example.test/private/secret?gfx=ultra&modular=off&token=secret#private',
      ),
    ).toBe('https://example.test/?modular=off&gfx=ultra');
    expect(
      sanitizeCaptureUrl('https://example.test/private/secret?gfx=evil&modular=<script>#private'),
    ).toBe('https://example.test/');
    expect(sanitizeCaptureUrl('https://example.test/?linkrate=24&token=secret#private')).toBe(
      'https://example.test/?linkrate=24',
    );
    expect(sanitizeCaptureUrl('https://example.test/?linkmode=adaptive&token=secret')).toBe(
      'https://example.test/?linkmode=adaptive',
    );
  });

  it('attributes links to the half-open window ending at query start', () => {
    const links = [{ startMs: 1_999 }, { startMs: 2_000 }, { startMs: 9_999 }, { startMs: 10_000 }];
    expect(countEventsInWindow(links, 2_000, 10_000)).toBe(2);
    expect(linksBeforeQuery({ startMs: 10_000 }, links, 8_000)).toEqual({
      startMs: 2_000,
      endMs: 10_000,
      count: 2,
    });
  });

  it('returns certain and possible bounds for partial upload buckets', () => {
    const result = uploadBucketsBeforeQuery(
      { startMs: 1_050 },
      [
        { startMs: 200, count: 10, bytes: 100 },
        { startMs: 300, count: 20, bytes: 200 },
        { startMs: 900, count: 30, bytes: 300 },
        { startMs: 1_000, count: 40, bytes: 400 },
      ],
      800,
      100,
    );
    expect(result).toMatchObject({ startMs: 250, endMs: 1_050, certain: 50, possible: 100 });
  });

  it('rejects an effective pacing mismatch instead of accepting a silent no-op', () => {
    const raw = capture({ requested: { ...capture().requested, linkrate: 24 } });
    const result = validateCapture(raw);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('linkrate was requested but link pacing is unavailable');
  });

  it('rejects malformed query intervals and hidden or lost-context captures', () => {
    const raw = capture({
      environment: {
        ...capture().environment,
        visible: false,
        contextLost: 1,
        visibilityTransitions: [
          { atMs: 0, state: 'visible' },
          { atMs: 10, state: 'hidden' },
          { atMs: 20, state: 'visible' },
        ],
      },
      timeline: {
        ...capture().timeline,
        queries: [{ startMs: 20, endMs: 10, durationMs: -10 }],
      },
    });
    const result = validateCapture(raw);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'timeline.queries[0].endMs precedes startMs',
        'WebGL context was lost',
        'capture page became hidden',
      ]),
    );
  });

  it('summarizes query kinds and exact pre-query link pressure', () => {
    const raw = capture({
      timeline: {
        ...capture().timeline,
        links: [
          { startMs: 1_000, endMs: 1_001, lane: 'submit-sync' },
          { startMs: 1_500, endMs: 1_501, lane: 'submit-sync' },
          { startMs: 3_000, endMs: 3_001, lane: 'first-draw' },
        ],
        queries: [
          {
            kind: 'completion-status',
            startMs: 2_000,
            endMs: 2_500,
            durationMs: 500,
          },
          {
            kind: 'active-attributes',
            startMs: 3_000,
            endMs: 3_100,
            durationMs: 100,
          },
        ],
        compileUnits: [
          {
            id: 'scene:0',
            lane: 'programs.compile-submit',
            submittedAtMs: 100,
            syncEndAtMs: 110,
            settledAtMs: null,
            failedAtMs: null,
            statusAtReveal: 'pending',
          },
        ],
      },
    });
    const summary = summarizeCapture(raw, { slowMs: 100, windowMs: 2_000 });
    expect(summary.linksTotal).toBe(3);
    expect(summary.queriesByKind['active-attributes']).toMatchObject({ calls: 1, maxMs: 100 });
    expect(summary.slowQueries[0].linksBefore.count).toBe(2);
    expect(summary.compileUnitsAtReveal).toEqual({ pending: 1 });
  });

  it('rejects an impossible compile-unit lifecycle', () => {
    const raw = capture({
      timeline: {
        ...capture().timeline,
        compileUnits: [
          {
            id: 'scene:0',
            lane: 'programs.compile',
            submittedAtMs: 20,
            syncEndAtMs: 10,
            settledAtMs: null,
            failedAtMs: null,
            statusAtReveal: 'pending',
          },
        ],
      },
    });
    const result = validateCapture(raw);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('timeline.compileUnits[0].syncEndAtMs precedes submittedAtMs');
  });

  it('refuses A/B legs with different probe, GPU, or viewport evidence', () => {
    const left = capture();
    const right = capture({
      provenance: { ...left.provenance, probeSha256: 'different' },
      environment: { ...left.environment, glRenderer: 'other-renderer' },
    });
    expect(areComparable(left, right)).toBe(false);
    expect(comparabilityMismatches(left, right)).toEqual(['probeSha256', 'glRenderer']);
  });

  it('requires an explicit varying knob for an A/B difference', () => {
    const left = capture({
      requested: { ...capture().requested, linkrate: 0 },
      effective: {
        ...capture().effective,
        prewarmPacing: {
          available: true,
          mode: 'unlimited',
          linksPerSecond: null,
          burst: 8,
          compileBatchRoots: 16,
          hardMaxMs: 15_000,
          scope: 'compile-unit-sync-prologue',
        },
      },
    });
    const right = capture({
      requested: { ...capture().requested, linkrate: 24 },
      effective: {
        ...capture().effective,
        prewarmPacing: {
          available: true,
          mode: 'limited',
          linksPerSecond: 24,
          burst: 8,
          compileBatchRoots: 16,
          hardMaxMs: 15_000,
          scope: 'compile-unit-sync-prologue',
        },
      },
    });
    expect(areComparable(left, right)).toBe(false);
    expect(areComparable(left, right, { varying: ['linkrate'] })).toBe(true);
  });

  it('validates and compares adaptive pacing without treating feedback as configuration', () => {
    const control = capture({
      requested: { ...capture().requested, linkmode: null, linkrate: 0 },
      effective: {
        ...capture().effective,
        prewarmPacing: {
          available: true,
          mode: 'unlimited',
          linksPerSecond: null,
          burst: 8,
          compileBatchRoots: 16,
          hardMaxMs: 15_000,
          scope: 'compile-unit-sync-prologue',
        },
      },
    });
    const adaptive = capture({
      requested: { ...capture().requested, linkmode: 'adaptive' },
      effective: {
        ...capture().effective,
        prewarmPacing: {
          available: true,
          mode: 'adaptive',
          linksPerSecond: null,
          burst: null,
          compileBatchRoots: 16,
          hardMaxMs: 15_000,
          scope: 'compile-unit-lifecycle',
          adaptive: { state: 'revealed', windowLinks: 24, settledUnits: 18 },
        },
      },
    });

    expect(validateCapture(adaptive).valid).toBe(true);
    expect(areComparable(control, adaptive)).toBe(false);
    expect(areComparable(control, adaptive, { varying: ['linkmode'] })).toBe(false);
    expect(areComparable(control, adaptive, { varying: ['linkrate', 'linkmode'] })).toBe(true);

    const anotherAdaptive = structuredClone(adaptive);
    anotherAdaptive.effective.prewarmPacing.adaptive = {
      state: 'revealed',
      windowLinks: 16,
      settledUnits: 9,
    };
    expect(areComparable(adaptive, anotherAdaptive)).toBe(true);
  });

  it('requires complete campaign metadata and the same group for comparable legs', () => {
    const incomplete = capture({
      capture: { ...capture().capture, groupId: 'campaign-a' },
    });
    expect(validateCapture(incomplete).errors).toContain('capture.leg is missing');

    const left = capture({
      capture: {
        ...capture().capture,
        groupId: 'campaign-a',
        leg: 'control',
        repetition: 1,
        order: 1,
      },
    });
    const right = capture({
      capture: {
        ...capture().capture,
        groupId: 'campaign-b',
        leg: 'limited',
        repetition: 1,
        order: 2,
      },
    });
    expect(comparabilityMismatches(left, right)).toContain('groupId');
  });

  it('refuses nominally identical scenarios with different fixture evidence', () => {
    const left = capture({
      capture: { ...capture().capture, fixture: { kind: 'geared-arrival-v1', count: 4 } },
    });
    const right = capture({
      capture: { ...capture().capture, fixture: { kind: 'geared-arrival-v1', count: 20 } },
    });
    expect(comparabilityMismatches(left, right)).toContain('fixture');
  });

  it('compares capture duration and effective renderer tier', () => {
    const left = capture({
      capture: { ...capture().capture, durationMs: 1_000 },
      effective: { ...capture().effective, renderer: { tier: 'ultra' } },
    });
    const right = capture({
      capture: { ...capture().capture, durationMs: 900 },
      effective: { ...capture().effective, renderer: { tier: 'high' } },
    });
    expect(comparabilityMismatches(left, right)).toEqual(
      expect.arrayContaining(['durationMs', 'rendererTier']),
    );
  });

  it('uses contractual duration for A/B comparison while retaining total probe elapsed time', () => {
    const left = capture({
      capture: { ...capture().capture, durationMs: 180_000, totalElapsedMs: 180_347 },
    });
    const right = capture({
      capture: { ...capture().capture, durationMs: 180_000, totalElapsedMs: 181_106 },
    });

    expect(validateCapture(left).valid).toBe(true);
    expect(validateCapture(right).valid).toBe(true);
    expect(comparabilityMismatches(left, right)).not.toContain('durationMs');
    expect(areComparable(left, right)).toBe(true);
  });

  it('validates total probe elapsed time when present', () => {
    const raw = capture({
      capture: { ...capture().capture, durationMs: 180_000, totalElapsedMs: 179_999 },
    });
    const result = validateCapture(raw);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('capture.totalElapsedMs precedes durationMs');
  });

  it('compares an available zone regardless of which capture surface supplied it', () => {
    const left = capture({
      environment: { ...capture().environment, zone: 'eastbrook_vale' },
    });
    const right = capture({
      environment: { ...capture().environment, zone: 'thornhollow_fields' },
    });
    expect(comparabilityMismatches(left, right)).toContain('zone');
  });

  it('keeps headless SwiftShader captures as smoke artifacts, never performance evidence', () => {
    const raw = capture({
      capture: { ...capture().capture, headless: true },
      environment: {
        ...capture().environment,
        browserFlags: ['--headless=new'],
        glRenderer: 'ANGLE (Google, SwiftShader Device (Subzero))',
      },
    });
    const smoke = validateCapture(raw);
    expect(smoke.valid).toBe(true);
    expect(smoke.performanceEvidence).toBe(false);
    expect(smoke.evidenceKind).toBe('smoke');
    expect(smoke.warnings).toEqual(
      expect.arrayContaining([
        'headless capture is smoke-only and cannot be used as performance evidence',
        'SwiftShader software renderer is smoke-only and cannot be used as performance evidence',
      ]),
    );

    const performance = validateCapture(raw, { performanceEvidence: true });
    expect(performance.valid).toBe(false);
    expect(performance.errors).toEqual(
      expect.arrayContaining([
        'headless capture cannot be used as performance evidence',
        'SwiftShader software renderer cannot be used as performance evidence',
      ]),
    );
  });

  it('labels a visible hardware capture as performance evidence', () => {
    const result = validateCapture(capture());
    expect(result).toMatchObject({
      valid: true,
      performanceEvidence: true,
      evidenceKind: 'performance',
    });
    expect(result.warnings).toEqual([]);
  });
});
