// build:bundle used to run its sitemap, SFX manifest, and media manifest
// pregen steps serially, even though each reads and writes its own disjoint
// set of files. scripts/build_bundle_pregen.mjs runs them concurrently via
// Promise.all instead. These teeth pin: the step list itself (so a step
// silently dropping from build:bundle fails loudly), that a step's real
// output surfaces through runPregenStep, that a failing step rejects with
// its exit code and stderr, and that runPregen genuinely overlaps the steps
// in wall time rather than just fanning out the spawn calls and awaiting
// them one at a time.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { PREGEN_STEPS, runPregen, runPregenStep } from '../scripts/build_bundle_pregen.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe('PREGEN_STEPS', () => {
  it('runs exactly the sitemap, SFX manifest, and media manifest generate steps', () => {
    expect(PREGEN_STEPS).toEqual([
      ['scripts/build_sitemap.mjs'],
      ['scripts/build_sfx_manifest.mjs'],
      ['scripts/build_media_manifest.mjs', 'generate'],
    ]);
  });
});

describe('package.json wiring', () => {
  // Pinning PREGEN_STEPS alone does not prove build:bundle actually calls the
  // orchestrator: a revert to the old serial `&&` chain in package.json would
  // leave that pin green. Cross-check the real script bodies instead.
  it('build:bundle invokes the pregen orchestrator, not an inline serial chain', () => {
    expect(PACKAGE_JSON.scripts['build:bundle']).toContain('node scripts/build_bundle_pregen.mjs');
  });

  it('the sitemap and SFX manifest steps stay in sync with their standalone npm scripts', () => {
    expect(PACKAGE_JSON.scripts['sitemap:build']).toBe(`node ${PREGEN_STEPS[0].join(' ')}`);
    expect(PACKAGE_JSON.scripts['sfx:manifest']).toBe(`node ${PREGEN_STEPS[1].join(' ')}`);
  });
});

describe('runPregenStep', () => {
  it('resolves with the captured stdout of a successful step', async () => {
    const { stdout } = await runPregenStep(['-e', 'console.log("pregen-step-ok")']);
    expect(stdout).toContain('pregen-step-ok');
  });

  it('rejects with the exit code and stderr when a step fails', async () => {
    await expect(
      runPregenStep(['-e', 'console.error("pregen-step-broke"); process.exit(3)']),
    ).rejects.toThrow(/exited with code 3[\s\S]*pregen-step-broke/);
  });

  it('rejects when the child process fails to spawn at all', async () => {
    await expect(runPregenStep(['-e', 'console.log(1)'], '/no/such/node/binary')).rejects.toThrow(
      /failed to spawn/,
    );
  });
});

describe('runPregen', () => {
  it('runs every step concurrently rather than one after another', async () => {
    // Three steps that each sleep before exiting 0. Serial execution takes at
    // least 3 * SLEEP_MS; concurrent execution takes roughly one SLEEP_MS
    // plus node-startup overhead. The threshold sits well under the serial
    // floor so this only goes green if the steps genuinely overlapped.
    const SLEEP_MS = 250;
    const sleepStep = ['-e', `setTimeout(() => process.exit(0), ${SLEEP_MS})`];
    const started = Date.now();
    await runPregen([sleepStep, sleepStep, sleepStep]);
    const elapsedMs = Date.now() - started;
    expect(elapsedMs).toBeLessThan(SLEEP_MS * 2);
  });

  it('surfaces every step output in step order once all succeed', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await runPregen([
        ['-e', 'console.log("first")'],
        ['-e', 'console.log("second")'],
      ]);
      const written = writeSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(written.indexOf('first')).toBeLessThan(written.indexOf('second'));
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('rejects with a non-zero-exit failure when any one step fails', async () => {
    await expect(
      runPregen([
        ['-e', 'setTimeout(() => process.exit(0), 200)'],
        ['-e', 'process.exit(9)'],
      ]),
    ).rejects.toThrow(/exited with code 9/);
  });
});
