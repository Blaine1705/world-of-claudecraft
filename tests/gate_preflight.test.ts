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

describe('checkAudioTooling', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reports missing tools when either probe fails', async () => {
    await withFixtureDir(async (dir) => {
      vi.stubEnv('WOC_FFMPEG_PATH', '/nonexistent/woc-preflight/ffmpeg');
      vi.stubEnv('WOC_FFPROBE_PATH', '/nonexistent/woc-preflight/ffprobe');
      vi.resetModules();
      const { checkAudioTooling } = await import('../scripts/lib/gate_preflight.mjs');

      const result = await checkAudioTooling({ label: 'gate', shell: false, env: { PATH: dir } });

      expect(result).toContain('missing required SFX audio tooling: ffmpeg, ffprobe');
    });
  });

  it('reports null when both tools run', async () => {
    await withFixtureDir(async (dir) => {
      const okTool = join(dir, 'ok-tool');
      writeFileSync(okTool, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      vi.stubEnv('WOC_FFMPEG_PATH', okTool);
      vi.stubEnv('WOC_FFPROBE_PATH', okTool);
      vi.resetModules();
      const { checkAudioTooling } = await import('../scripts/lib/gate_preflight.mjs');

      const result = await checkAudioTooling({ label: 'gate', shell: false, env: { PATH: dir } });

      expect(result).toBeNull();
    });
  });

  it('runs both probes even when the first tool call errors, rather than short-circuiting', async () => {
    await withFixtureDir(async (dir) => {
      // ffmpeg missing, ffprobe present: both must still be reported/checked
      // independently (Promise.all over both promises, not a bail on the first).
      const okTool = join(dir, 'ok-tool');
      writeFileSync(okTool, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      vi.stubEnv('WOC_FFMPEG_PATH', '/nonexistent/woc-preflight/ffmpeg');
      vi.stubEnv('WOC_FFPROBE_PATH', okTool);
      vi.resetModules();
      const { checkAudioTooling } = await import('../scripts/lib/gate_preflight.mjs');

      const result = await checkAudioTooling({ label: 'gate', shell: false, env: { PATH: dir } });

      // Only ffmpeg failed, so it alone is named in the missing-tools list
      // (the reinstall guidance text mentions ffprobe regardless, so assert
      // on the list line, not the whole message).
      const [missingLine] = (result ?? '').split('\n');
      expect(missingLine).toContain('missing required SFX audio tooling: ffmpeg');
      expect(missingLine).not.toContain('ffprobe');
    });
  });
});
