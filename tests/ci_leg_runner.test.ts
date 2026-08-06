import { readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { formatLegHeader, runLeg, runLegsWithFlakeRetry } from '../scripts/lib/ci_leg_runner.mjs';
import { TEARDOWN_RPC_MESSAGE } from '../scripts/lib/teardown_rpc_flake.mjs';

// The retry policy is the load-bearing part: CI may rerun a leg ONLY on the
// exact teardown-rpc signature, at most once per process, and everything
// else must fail exactly as it always did (the packet's non-goals forbid a
// blanket retry). Every case here pins one arm of that sentence.

const FLAKE_TAIL =
  ' Test Files  272 passed (272)\n' +
  '      Tests  3312 passed (3312)\n' +
  `Unhandled Rejection\nEnvironmentTeardownError: [vitest-worker]: ${TEARDOWN_RPC_MESSAGE}\n`;

const REAL_FAILURE_TAIL =
  ' Test Files  1 failed | 271 passed (272)\n      Tests  1 failed | 3311 passed (3312)\n';

type StubResult = { status: number | null; tail: string };

function makeStub(script: Record<string, StubResult[]>) {
  const calls: string[] = [];
  const runLegImpl = async ({ cmd, args }: { cmd: string; args: string[] }) => {
    const key = `${cmd} ${args.join(' ')}`;
    calls.push(key);
    const queue = script[key];
    if (!queue || queue.length === 0) throw new Error(`unexpected leg spawn: ${key}`);
    return queue.shift() as StubResult;
  };
  return { calls, runLegImpl };
}

function collect() {
  const lines: string[] = [];
  return { lines, sink: (line: string) => lines.push(line) };
}

const GREEN: StubResult = { status: 0, tail: ' Test Files  10 passed (10)\n' };

describe('runLegsWithFlakeRetry', () => {
  it('runs every leg once and prints each header when all are green', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- a': [GREEN],
      'npm test -- b': [GREEN],
    });
    const log = collect();
    const result = await runLegsWithFlakeRetry({
      legs: [
        { name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] },
        { name: 'related', cmd: 'npm', args: ['test', '--', 'b'] },
      ],
      cwd: '/nowhere',
      log: log.sink,
      error: log.sink,
      runLegImpl,
    });
    expect(result).toEqual({ ok: true, status: 0, retriedLegNames: [] });
    expect(calls).toEqual(['npm test -- a', 'npm test -- b']);
    expect(log.lines).toEqual([
      formatLegHeader({ name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] }),
      formatLegHeader({ name: 'related', cmd: 'npm', args: ['test', '--', 'b'] }),
    ]);
  });

  it('retries exactly the flaked leg once, loudly, and greens when the rerun passes', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- a': [GREEN],
      'npm test -- b': [{ status: 1, tail: FLAKE_TAIL }, GREEN],
    });
    const log = collect();
    const result = await runLegsWithFlakeRetry({
      legs: [
        { name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] },
        { name: 'related', cmd: 'npm', args: ['test', '--', 'b'] },
      ],
      cwd: '/nowhere',
      log: log.sink,
      error: log.sink,
      runLegImpl,
    });
    expect(result).toEqual({ ok: true, status: 0, retriedLegNames: ['related'] });
    expect(calls).toEqual(['npm test -- a', 'npm test -- b', 'npm test -- b']);
    const banner = log.lines.find((l) => l.includes('known-flake retry'));
    expect(banner).toBeDefined();
    // The banner is the audit trail: it must name the leg, the signature, and
    // the fact that nothing else retries.
    expect(banner).toContain('"related"');
    expect(banner).toContain('teardown-rpc');
    expect(banner).toContain(TEARDOWN_RPC_MESSAGE);
    expect(banner).toContain('no other failure mode ever retries');
  });

  it('fails after one retry when the signature repeats: never a second retry', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- b': [
        { status: 1, tail: FLAKE_TAIL },
        { status: 1, tail: FLAKE_TAIL },
      ],
    });
    const log = collect();
    const result = await runLegsWithFlakeRetry({
      legs: [{ name: 'related', cmd: 'npm', args: ['test', '--', 'b'] }],
      cwd: '/nowhere',
      log: log.sink,
      error: log.sink,
      runLegImpl,
    });
    expect(result).toEqual({ ok: false, status: 1, retriedLegNames: ['related'] });
    expect(calls).toHaveLength(2);
    expect(log.lines.some((l) => l.includes('FAIL at "related" (exit 1)'))).toBe(true);
  });

  it('never retries a real failure: failed tests fail immediately', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- a': [{ status: 1, tail: REAL_FAILURE_TAIL }],
    });
    const log = collect();
    const result = await runLegsWithFlakeRetry({
      legs: [{ name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] }],
      cwd: '/nowhere',
      log: log.sink,
      error: log.sink,
      runLegImpl,
    });
    expect(result.ok).toBe(false);
    expect(result.retriedLegNames).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(log.lines.some((l) => l.includes('known-flake retry'))).toBe(false);
  });

  it('never retries other exit codes or signal kills, even with the signature text present', async () => {
    for (const status of [2, null]) {
      const { calls, runLegImpl } = makeStub({
        'npm test -- a': [{ status, tail: FLAKE_TAIL }],
      });
      const log = collect();
      const result = await runLegsWithFlakeRetry({
        legs: [{ name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] }],
        cwd: '/nowhere',
        log: log.sink,
        error: log.sink,
        runLegImpl,
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(status ?? 1);
      expect(result.retriedLegNames).toEqual([]);
      expect(calls).toHaveLength(1);
    }
  });

  it('shares ONE retry across all legs: a second flaked leg fails without retrying', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- a': [{ status: 1, tail: FLAKE_TAIL }, GREEN],
      'npm test -- b': [{ status: 1, tail: FLAKE_TAIL }],
    });
    const log = collect();
    const result = await runLegsWithFlakeRetry({
      legs: [
        { name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] },
        { name: 'related', cmd: 'npm', args: ['test', '--', 'b'] },
      ],
      cwd: '/nowhere',
      log: log.sink,
      error: log.sink,
      runLegImpl,
    });
    expect(result).toEqual({ ok: false, status: 1, retriedLegNames: ['floor'] });
    expect(calls).toEqual(['npm test -- a', 'npm test -- a', 'npm test -- b']);
  });

  it('stops at the first failing leg and preserves its exit code', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- a': [{ status: 7, tail: 'boom' }],
    });
    const log = collect();
    const result = await runLegsWithFlakeRetry({
      legs: [
        { name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] },
        { name: 'related', cmd: 'npm', args: ['test', '--', 'b'] },
      ],
      cwd: '/nowhere',
      log: log.sink,
      error: log.sink,
      runLegImpl,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(7);
    expect(calls).toEqual(['npm test -- a']);
    expect(log.lines.some((l) => l.includes('FAIL at "floor" (exit 7)'))).toBe(true);
  });
});

describe('runLeg (real subprocess)', () => {
  it('streams output through, captures a bounded tail, and reports the exit code', async () => {
    const out = new PassThrough();
    const err = new PassThrough();
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    out.on('data', (c) => outChunks.push(c));
    err.on('data', (c) => errChunks.push(c));
    const script =
      // Enough stdout to overflow the small tail budget below, then the
      // signature artifacts at the very end, split across the two streams
      // like a real vitest run (summary on stdout, rejection on stderr).
      "process.stdout.write('x'.repeat(64 * 1024));" +
      "process.stdout.write('\\n Test Files  2 passed (2)\\n      Tests  5 passed (5)\\n');" +
      "process.stderr.write('EnvironmentTeardownError: [vitest-worker]: " +
      'Closing rpc while "onUserConsoleLog" was pending' +
      "\\n');" +
      'process.exit(1);';
    const result = await runLeg({
      cmd: process.execPath,
      args: ['-e', script],
      cwd: process.cwd(),
      out,
      err,
      tailBytes: 8 * 1024,
    });
    expect(result.status).toBe(1);
    // The tail is bounded and keeps the END of the combined output.
    expect(result.tail.length).toBeLessThanOrEqual(8 * 1024);
    expect(result.tail).toContain('Test Files  2 passed (2)');
    expect(result.tail).toContain(TEARDOWN_RPC_MESSAGE);
    // The full output still reached the passthrough sinks uncut: the CI log
    // must never lose bytes to the tail bookkeeping.
    expect(Buffer.concat(outChunks).length).toBeGreaterThan(64 * 1024);
    expect(Buffer.concat(errChunks).toString('utf8')).toContain(TEARDOWN_RPC_MESSAGE);
  });

  it('reports exit 0 for a green child', async () => {
    const out = new PassThrough();
    const err = new PassThrough();
    const result = await runLeg({
      cmd: process.execPath,
      args: ['-e', "process.stdout.write('ok\\n')"],
      cwd: process.cwd(),
      out,
      err,
    });
    expect(result.status).toBe(0);
    expect(result.tail).toContain('ok');
  });
});

describe('entry wiring', () => {
  it('ci_shard_test.mjs runs its legs through the flake-retry runner, not a raw spawn', () => {
    const source = readFileSync(new URL('../scripts/ci_shard_test.mjs', import.meta.url), 'utf8');
    // Comments stripped (block then line, the ci_workflow.test.ts idiom): a
    // commented-out call must fail the pin, and prose mentioning spawnSync
    // must not trip the ban.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).toContain("from './lib/ci_leg_runner.mjs'");
    expect(code).toContain('runLegsWithFlakeRetry({ legs: plan.legs, cwd: repoRoot })');
    // The one retry policy lives in the runner; the entry must not grow its
    // own spawn path around it.
    expect(code).not.toContain('spawnSync');
    expect(code).not.toContain('spawn(');
  });
});
