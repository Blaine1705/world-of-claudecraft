import { describe, expect, it } from 'vitest';
import {
  buildCapture,
  parseArgs,
  prepareOnlineGearedRoster,
} from '../scripts/gpu_hitch_capture.mjs';

describe('gpu hitch capture CLI', () => {
  it('parses the supported capture modes and profiles', () => {
    expect(
      parseArgs([
        '--url',
        'http://localhost:5173/?perf&gfx=ultra',
        '--mode',
        'manual',
        '--profile',
        'full',
        '--duration-ms',
        '5000',
        '--headless',
        '--allow-dirty',
        '--group-id',
        'linkrate-v38-a1',
        '--leg',
        'limited-8',
        '--repetition',
        '2',
        '--order',
        '4',
      ]),
    ).toMatchObject({
      mode: 'manual',
      profile: 'full',
      durationMs: 5000,
      headless: true,
      allowDirty: true,
      groupId: 'linkrate-v38-a1',
      leg: 'limited-8',
      repetition: 2,
      order: 4,
    });
  });

  it('rejects unknown modes, profiles, and non-positive durations', () => {
    expect(() => parseArgs(['--mode', 'online'])).toThrow(
      '--mode must be offline, manual, or online-geared',
    );
    expect(() => parseArgs(['--profile', 'all'])).toThrow(
      '--profile must be shader, upload, or full',
    );
    expect(() => parseArgs(['--duration-ms', '0'])).toThrow(
      '--duration-ms must be a positive integer',
    );
    expect(() =>
      parseArgs(['--mode', 'online-geared', '--url', 'https://capture.example/?perf']),
    ).toThrow(/non-loopback --url/);
  });

  it('requires complete, safe A/B metadata', () => {
    expect(() => parseArgs(['--group-id', 'campaign'])).toThrow(
      '--group-id, --leg, --repetition, and --order must be supplied together',
    );
    expect(() => parseArgs(['--leg', 'bad leg'])).toThrow(
      '--leg must be a 1-64 character identifier',
    );
  });

  it('assembles a complete capture artifact from a probe snapshot without a browser', () => {
    const raw = buildCapture({
      args: {
        mode: 'online-geared',
        profile: 'full',
        groupId: 'campaign',
        leg: 'limited',
        repetition: 1,
        order: 2,
        durationMs: 180_000,
        fixtureEvidence: { kind: 'geared-arrival-v1', count: 2 },
      },
      url: 'http://localhost:5173/?linkrate=8&gfx=high&token=must-not-survive',
      snapshot: {
        captureId: 'capture-1',
        startedAtEpochMs: Date.parse('2026-08-13T10:00:00.000Z'),
        startedAtPerformanceMs: 1_000,
        elapsedMs: 180_347,
        stopReason: 'duration',
        visible: true,
        visibilityTransitions: [],
        contextLost: 0,
        transitions: [{ phase: 'entry', atMs: 0 }],
        links: [],
        queries: [],
        controls: { profile: 'full' },
        running: false,
        uploadBucketWidthMs: 100,
        uploadBuckets: [],
        runtimeReceipt: {
          schemaVersion: 1,
          buildId: 'served-build',
          effective: {
            prewarmPacing: { available: true, deadlineMs: 12 },
            modular: { available: true },
            renderer: { tier: 'ultra' },
          },
        },
        rendererStats: {
          width: 1600,
          height: 900,
          pixelRatio: 1,
          glVendor: 'vendor',
          glRenderer: 'renderer',
          tier: 'stats-tier',
          currentZoneId: 'eastbrook_vale',
          prewarm: {
            compileUnits: [
              {
                id: 'unit-1',
                submittedAtMs: 1_010,
                syncEndAtMs: 1_020,
                settledAtMs: 1_030,
              },
            ],
          },
        },
      },
      browserVersion: 'Chrome test',
      flags: ['--headless=new'],
      provenance: {
        schemaVersion: 1,
        sourceBuildId: 'source-build',
        probeSha256: 'probe-sha',
        analyzerSha256: 'analyzer-sha',
      },
    });

    expect(raw.capture).toMatchObject({
      id: 'capture-1',
      scenario: 'online-geared-entry',
      durationMs: 180_000,
      totalElapsedMs: 180_347,
      complete: true,
      fixture: { kind: 'geared-arrival-v1', count: 2 },
      zone: 'eastbrook_vale',
      url: 'http://localhost:5173/?linkrate=8&gfx=high',
    });
    expect(raw.provenance).toMatchObject({
      sourceBuildId: 'source-build',
      servedBuildId: 'served-build',
    });
    expect(raw.effective).toEqual({
      schemaVersion: 1,
      prewarmPacing: { available: true, deadlineMs: 12 },
      modular: { available: true },
      renderer: { tier: 'ultra' },
    });
    expect(raw.timeline.compileUnits).toEqual([
      {
        id: 'unit-1',
        submittedAtMs: 10,
        syncEndAtMs: 20,
        settledAtMs: 30,
      },
    ]);
    expect(raw.environment).toMatchObject({
      browserVersion: 'Chrome test',
      browserFlags: ['--headless=new'],
      glVendor: 'vendor',
      glRenderer: 'renderer',
      rendererTier: 'ultra',
      viewport: '1600x900',
      visible: true,
    });
    expect(raw.diagnostics.runtimeReceipt.buildId).toBe('served-build');
  });

  it('checks capability before constructing or preparing the mutable roster', async () => {
    const events = [];
    const roster = {
      prepare: async () => events.push('prepare'),
    };
    const prepared = await prepareOnlineGearedRoster({
      args: {
        url: 'http://localhost:5173/?perf',
        serverUrl: 'http://localhost:8787',
        bots: 2,
      },
      runId: 'capture-1',
      databaseUrl: 'postgres://localhost/test',
      checkCapability: async (serverUrl) => events.push(`capability:${serverUrl}`),
      rosterFactory: (options) => {
        events.push(`construct:${options.count}`);
        return roster;
      },
    });

    expect(prepared).toBe(roster);
    expect(events).toEqual(['capability:http://localhost:8787', 'construct:2', 'prepare']);
  });

  it('rejects a remote page before capability checks or roster mutation', async () => {
    const events = [];
    await expect(
      prepareOnlineGearedRoster({
        args: {
          url: 'https://capture.example/?perf',
          serverUrl: 'http://localhost:8787',
          bots: 1,
        },
        runId: 'capture-1',
        databaseUrl: 'postgres://localhost/test',
        checkCapability: async () => events.push('capability'),
        rosterFactory: () => {
          events.push('construct');
          return { prepare: async () => events.push('prepare') };
        },
      }),
    ).rejects.toThrow(/non-loopback --url/);
    expect(events).toEqual([]);
  });
});
