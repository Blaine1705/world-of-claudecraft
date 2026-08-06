import { readFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { formatLegHeader, runLeg, runLegsWithFlakeRetry } from '../scripts/lib/ci_leg_runner.mjs';
import { TEARDOWN_RPC_MESSAGE } from '../scripts/lib/teardown_rpc_flake.mjs';

// The retry policy is the load-bearing part: CI may rerun a leg ONLY on the
// exact teardown-rpc signature, at most once per process, and everything
// else must fail exactly as it always did (the packet's non-goals forbid a
// blanket retry). Every case here pins one arm of that sentence. The
// signature literal is kept away from the runner's REAL output streams
// throughout (stub tails, injected PassThrough sinks): if it ever reached a
// leg's real stdout, an all-passing exit-1 failure in the suite carrying it
// could self-match the classifier.

const FLAKE_TAIL =
  `Vitest caught 1 unhandled error during the test run.\n` +
  `EnvironmentTeardownError: [vitest-worker]: ${TEARDOWN_RPC_MESSAGE}\n` +
  ' Test Files  272 passed (272)\n' +
  '      Tests  3312 passed (3312)\n' +
  '     Errors  1 error\n';

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

function runnerOpts(
  legs: Array<{ name: string; cmd: string; args: string[] }>,
  runLegImpl: ReturnType<typeof makeStub>['runLegImpl'],
) {
  const log = collect();
  const annotations = collect();
  return {
    opts: {
      legs,
      cwd: '/nowhere',
      log: log.sink,
      error: log.sink,
      annotate: annotations.sink,
      runLegImpl,
    },
    log,
    annotations,
  };
}

const GREEN: StubResult = { status: 0, tail: ' Test Files  10 passed (10)\n' };

describe('runLegsWithFlakeRetry', () => {
  it('runs every leg once and prints each header when all are green', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- a': [GREEN],
      'npm test -- b': [GREEN],
    });
    const legs = [
      { name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] },
      { name: 'related', cmd: 'npm', args: ['test', '--', 'b'] },
    ];
    const { opts, log, annotations } = runnerOpts(legs, runLegImpl);
    const result = await runLegsWithFlakeRetry(opts);
    expect(result).toEqual({ ok: true, status: 0, retriedLegNames: [] });
    expect(calls).toEqual(['npm test -- a', 'npm test -- b']);
    expect(log.lines).toEqual([formatLegHeader(legs[0]), formatLegHeader(legs[1])]);
    expect(annotations.lines).toEqual([]);
  });

  it('retries exactly the flaked leg once, loudly, and greens when the rerun passes', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- a': [GREEN],
      'npm test -- b': [{ status: 1, tail: FLAKE_TAIL }, GREEN],
    });
    const legs = [
      { name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] },
      { name: 'related', cmd: 'npm', args: ['test', '--', 'b'] },
    ];
    const { opts, log, annotations } = runnerOpts(legs, runLegImpl);
    const result = await runLegsWithFlakeRetry(opts);
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
    // The run-level annotation makes the retry visible without opening the
    // log; a green that used the retry must never look like a plain green.
    expect(annotations.lines).toHaveLength(1);
    expect(annotations.lines[0]).toMatch(/^::warning title=/);
    expect(annotations.lines[0]).toContain('"related"');
  });

  it('fails after one retry when the signature repeats: never a second retry', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- b': [
        { status: 1, tail: FLAKE_TAIL },
        { status: 1, tail: FLAKE_TAIL },
      ],
    });
    const { opts, log } = runnerOpts(
      [{ name: 'related', cmd: 'npm', args: ['test', '--', 'b'] }],
      runLegImpl,
    );
    const result = await runLegsWithFlakeRetry(opts);
    expect(result).toEqual({ ok: false, status: 1, retriedLegNames: ['related'] });
    expect(calls).toHaveLength(2);
    // The FAIL line says the budget was spent, so a red after a burned retry
    // is diagnosable without scrolling for the banner.
    const fail = log.lines.find((l) => l.includes('FAIL at "related" (exit 1)'));
    expect(fail).toBeDefined();
    expect(fail).toContain('known-flake retry already used on: related');
  });

  it('never retries a real failure: failed tests fail immediately', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- a': [{ status: 1, tail: REAL_FAILURE_TAIL }],
    });
    const { opts, log, annotations } = runnerOpts(
      [{ name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] }],
      runLegImpl,
    );
    const result = await runLegsWithFlakeRetry(opts);
    expect(result.ok).toBe(false);
    expect(result.retriedLegNames).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(log.lines.some((l) => l.includes('known-flake retry'))).toBe(false);
    expect(annotations.lines).toEqual([]);
  });

  it('never retries other exit codes or signal kills, even with the signature text present', async () => {
    for (const status of [2, null]) {
      const { calls, runLegImpl } = makeStub({
        'npm test -- a': [{ status, tail: FLAKE_TAIL }],
      });
      const { opts } = runnerOpts(
        [{ name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] }],
        runLegImpl,
      );
      const result = await runLegsWithFlakeRetry(opts);
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
    const { opts } = runnerOpts(
      [
        { name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] },
        { name: 'related', cmd: 'npm', args: ['test', '--', 'b'] },
      ],
      runLegImpl,
    );
    const result = await runLegsWithFlakeRetry(opts);
    expect(result).toEqual({ ok: false, status: 1, retriedLegNames: ['floor'] });
    expect(calls).toEqual(['npm test -- a', 'npm test -- a', 'npm test -- b']);
  });

  it('stops at the first failing leg and preserves its exit code', async () => {
    const { calls, runLegImpl } = makeStub({
      'npm test -- a': [{ status: 7, tail: 'boom' }],
    });
    const { opts, log } = runnerOpts(
      [
        { name: 'floor', cmd: 'npm', args: ['test', '--', 'a'] },
        { name: 'related', cmd: 'npm', args: ['test', '--', 'b'] },
      ],
      runLegImpl,
    );
    const result = await runLegsWithFlakeRetry(opts);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(7);
    expect(calls).toEqual(['npm test -- a']);
    expect(log.lines.some((l) => l.includes('FAIL at "floor" (exit 7)'))).toBe(true);
  });

  it('surfaces a spawn error as a named failed leg, never a retry and never a raw rejection', async () => {
    const spawnError = new Error('spawn definitely-missing ENOENT');
    const runLegImpl = async () => ({ status: null, tail: '', spawnError });
    const { opts, log, annotations } = runnerOpts(
      [{ name: 'floor', cmd: 'definitely-missing', args: [] }],
      runLegImpl as never,
    );
    const result = await runLegsWithFlakeRetry(opts);
    expect(result).toEqual({ ok: false, status: 1, retriedLegNames: [] });
    expect(log.lines.some((l) => l.includes('spawn error at "floor"'))).toBe(true);
    expect(log.lines.some((l) => l.includes('FAIL at "floor" (exit killed)'))).toBe(true);
    expect(annotations.lines).toEqual([]);
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
      // exitCode, never process.exit(): on a loaded machine the 64 KB burst
      // is still queued on the child's async stdout pipe, and a forced exit
      // drops the summary write behind it, exactly the truncation defect the
      // entry itself was fixed for (this fixture flaked that way once under
      // a full gate before the change).
      "process.stdout.write('x'.repeat(64 * 1024));" +
      "process.stdout.write('\\n Test Files  2 passed (2)\\n      Tests  5 passed (5)\\n');" +
      "process.stderr.write('EnvironmentTeardownError: [vitest-worker]: " +
      'Closing rpc while "onUserConsoleLog" was pending' +
      "\\n');" +
      'process.exitCode = 1;';
    const result = await runLeg({
      cmd: process.execPath,
      args: ['-e', script],
      cwd: process.cwd(),
      out,
      err,
      tailBytes: 8 * 1024,
    });
    expect(result.status).toBe(1);
    expect(result.spawnError).toBeUndefined();
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
    const result = await runLeg({
      cmd: process.execPath,
      args: ['-e', "process.stdout.write('ok\\n')"],
      cwd: process.cwd(),
      out: new PassThrough(),
      err: new PassThrough(),
    });
    expect(result.status).toBe(0);
    expect(result.tail).toContain('ok');
  });

  it('resolves a spawn failure instead of rejecting, so the FAIL audit line survives', async () => {
    const result = await runLeg({
      cmd: '/definitely/not/a/real/binary/anywhere-xyz',
      args: [],
      cwd: process.cwd(),
      out: new PassThrough(),
      err: new PassThrough(),
    });
    expect(result.status).toBeNull();
    expect(result.spawnError).toBeInstanceOf(Error);
  });

  it('proceeds after the drain deadline when a leaked child holds the stdio pipes open', async () => {
    // The child exits immediately but leaves a detached grandchild holding
    // the inherited stdout pipe for 8 seconds. Without the deadline, close
    // never fires until the grandchild lets go and the runner (a required
    // check in CI) hangs with it.
    const script =
      "const { spawn } = require('node:child_process');" +
      "spawn(process.execPath, ['-e', 'setTimeout(() => {}, 8000)'], " +
      "{ stdio: ['ignore', 'inherit', 'inherit'], detached: true }).unref();" +
      "process.stdout.write('leg done\\n');" +
      'process.exit(0);';
    const notes = collect();
    const startedAt = Date.now();
    const result = await runLeg({
      cmd: process.execPath,
      args: ['-e', script],
      cwd: process.cwd(),
      out: new PassThrough(),
      err: new PassThrough(),
      log: notes.sink,
      drainDeadlineMs: 500,
    });
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(result.status).toBe(0);
    expect(result.tail).toContain('leg done');
    expect(notes.lines.some((l) => l.includes('stdio stayed open'))).toBe(true);
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
    // The failure path must set exitCode and let the piped output drain; a
    // forced process.exit() discards queued stdout and truncates the
    // failing-shard log (measured: everything past one 64 KB pipe buffer).
    expect(code).toContain('process.exitCode = result.status');
    expect(code).not.toContain('process.exit(result.status)');
  });
});
