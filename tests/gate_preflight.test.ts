import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// checkAudioTooling reads FFMPEG_PATH/FFPROBE_PATH from scripts/sfx/ffmpeg_paths.mjs
// at MODULE EVALUATION time (resolved once from process.env.WOC_FFMPEG_PATH /
// WOC_FFPROBE_PATH), so every scenario below stubs those env vars and calls
// vi.resetModules() BEFORE a fresh dynamic import, the same pattern
// tests/client_challenge.test.ts uses for other module-scoped constants.

async function withFixtureDir(run: (dir: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'woc-audio-preflight-'));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A fake `npx` on PATH standing in for the sfx:check turbo dry-run probe. */
function writeFakeNpx(dir: string, cacheStatus: 'HIT' | 'MISS') {
  writeFileSync(
    join(dir, 'npx'),
    `#!/bin/sh\necho '{"tasks":[{"task":"sfx:check","cache":{"status":"${cacheStatus}"}}]}'\nexit 0\n`,
    { mode: 0o755 },
  );
}

describe('checkAudioTooling', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('skips both version probes entirely when sfx:check would be a turbo cache hit', async () => {
    await withFixtureDir(async (dir) => {
      writeFakeNpx(dir, 'HIT');
      vi.stubEnv('WOC_FFMPEG_PATH', '/nonexistent/woc-preflight/ffmpeg');
      vi.stubEnv('WOC_FFPROBE_PATH', '/nonexistent/woc-preflight/ffprobe');
      vi.resetModules();
      const { checkAudioTooling } = await import('../scripts/lib/gate_preflight.mjs');

      const result = await checkAudioTooling({ label: 'gate', shell: false, env: { PATH: dir } });

      expect(result).toBeNull();
    });
  });

  it('still probes and reports missing tools when sfx:check would NOT be a cache hit', async () => {
    await withFixtureDir(async (dir) => {
      writeFakeNpx(dir, 'MISS');
      vi.stubEnv('WOC_FFMPEG_PATH', '/nonexistent/woc-preflight/ffmpeg');
      vi.stubEnv('WOC_FFPROBE_PATH', '/nonexistent/woc-preflight/ffprobe');
      vi.resetModules();
      const { checkAudioTooling } = await import('../scripts/lib/gate_preflight.mjs');

      const result = await checkAudioTooling({ label: 'gate', shell: false, env: { PATH: dir } });

      expect(result).toContain('missing required SFX audio tooling: ffmpeg, ffprobe');
    });
  });

  it('probes ffmpeg and ffprobe concurrently rather than serially', async () => {
    await withFixtureDir(async (dir) => {
      // A cache MISS so the two probes actually run; each sleeps long enough
      // that two SERIAL runs clearly exceed one CONCURRENT round.
      writeFakeNpx(dir, 'MISS');
      const sleepMs = 300;
      const slowTool = join(dir, 'slow-tool');
      writeFileSync(slowTool, `#!/bin/sh\nsleep ${sleepMs / 1000}\nexit 0\n`, { mode: 0o755 });
      vi.stubEnv('WOC_FFMPEG_PATH', slowTool);
      vi.stubEnv('WOC_FFPROBE_PATH', slowTool);
      vi.resetModules();
      const { checkAudioTooling } = await import('../scripts/lib/gate_preflight.mjs');

      const start = Date.now();
      const result = await checkAudioTooling({ label: 'gate', shell: false, env: { PATH: dir } });
      const elapsed = Date.now() - start;

      expect(result).toBeNull();
      // Two 300ms probes run serially take >= 600ms; concurrently they land
      // close to one 300ms round. Generous margins absorb CI jitter.
      expect(elapsed).toBeGreaterThanOrEqual(sleepMs - 100);
      expect(elapsed).toBeLessThan(sleepMs + 400);
    });
  });
});
