// Leg runner for scripts/ci_shard_test.mjs, split out per the module-first
// rule so the retry policy is Vitest-pinnable without spawning real test
// legs. The entry stays a thin consumer.
//
// Streams the child's output through unchanged (the CI log must stay
// complete and live) while keeping a bounded rolling tail for the ONE
// sanctioned known-flake classification (teardown_rpc_flake.mjs). Retry
// policy, pinned by tests/ci_leg_runner.test.ts:
//   - only the exact teardown-rpc signature retries; every other failure
//     mode (failed tests, other exit codes, signal kills, other unhandled
//     errors) fails the job exactly as before;
//   - at most ONE retry per PROCESS, shared across all legs, so even a
//     pathological multi-leg flake run can never become a blanket retry
//     (the packet's non-goals forbid one);
//   - the retry reruns the SAME leg once, loudly, so a green that used the
//     retry is auditable from the job log alone.

import { spawn } from 'node:child_process';
import { isTeardownRpcFlake, TEARDOWN_RPC_TAIL_BYTES } from './teardown_rpc_flake.mjs';

/**
 * One leg's log header, shared with the entry's --plan-only printer so the
 * two modes cannot drift apart.
 *
 * @param {{ name: string, cmd: string, args: string[] }} leg
 * @returns {string}
 */
export function formatLegHeader({ name, cmd, args }) {
  return `\n[ci-shard] ${name}: ${cmd} ${args.join(' ')}`;
}

/**
 * Spawn one leg, mirroring its stdout/stderr through unchanged while keeping
 * a rolling tail of the combined output for classification. No shell,
 * deliberately: argv elements (which embed PR-controlled filenames) pass
 * verbatim to execvp.
 *
 * @param {{
 *   cmd: string,
 *   args: string[],
 *   cwd: string,
 *   spawnImpl?: typeof spawn,
 *   out?: { write: (chunk: Buffer) => unknown },
 *   err?: { write: (chunk: Buffer) => unknown },
 *   tailBytes?: number,
 * }} opts
 * @returns {Promise<{ status: number | null, tail: string }>}
 */
export function runLeg({
  cmd,
  args,
  cwd,
  spawnImpl = spawn,
  out = process.stdout,
  err = process.stderr,
  tailBytes = TEARDOWN_RPC_TAIL_BYTES,
}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(cmd, args, { cwd, stdio: ['inherit', 'pipe', 'pipe'] });
    /** @type {Buffer[]} */
    const chunks = [];
    let kept = 0;
    const keep = (chunk) => {
      chunks.push(chunk);
      kept += chunk.length;
      while (chunks.length > 1 && kept - chunks[0].length >= tailBytes) {
        kept -= chunks[0].length;
        chunks.shift();
      }
    };
    child.stdout?.on('data', (chunk) => {
      out.write(chunk);
      keep(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      err.write(chunk);
      keep(chunk);
    });
    child.on('error', reject);
    child.on('close', (status) => {
      const tail = Buffer.concat(chunks).subarray(-tailBytes).toString('utf8');
      resolve({ status, tail });
    });
  });
}

/**
 * Run every leg in order with the single sanctioned flake retry. Returns the
 * first failure (after any retry) or ok; printing of headers, the retry
 * banner, and the FAIL line happens here so the policy and its audit trail
 * stay in one tested place.
 *
 * @param {{
 *   legs: Array<{ name: string, cmd: string, args: string[] }>,
 *   cwd: string,
 *   log?: (line: string) => unknown,
 *   error?: (line: string) => unknown,
 *   runLegImpl?: typeof runLeg,
 * }} opts
 * @returns {Promise<{ ok: boolean, status: number, retriedLegNames: string[] }>}
 */
export async function runLegsWithFlakeRetry({
  legs,
  cwd,
  log = console.log,
  error = console.error,
  runLegImpl = runLeg,
}) {
  // Shared across all legs: one process, one retry, ever.
  let flakeRetryBudget = 1;
  /** @type {string[]} */
  const retriedLegNames = [];
  for (const leg of legs) {
    log(formatLegHeader(leg));
    let res = await runLegImpl({ cmd: leg.cmd, args: leg.args, cwd });
    if (res.status !== 0 && flakeRetryBudget > 0 && isTeardownRpcFlake(res)) {
      flakeRetryBudget -= 1;
      retriedLegNames.push(leg.name);
      log(
        `\n[ci-shard] known-flake retry: "${leg.name}" exited 1 with the teardown-rpc ` +
          'signature (every test passed; EnvironmentTeardownError: Closing rpc while ' +
          '"onUserConsoleLog" was pending). Retrying this one leg once; no other failure ' +
          'mode ever retries (docs/qa-gate.md, "Known-flake handling").',
      );
      res = await runLegImpl({ cmd: leg.cmd, args: leg.args, cwd });
    }
    if (res.status !== 0) {
      error(`\n[ci-shard] FAIL at "${leg.name}" (exit ${res.status ?? 'killed'})`);
      return { ok: false, status: res.status ?? 1, retriedLegNames };
    }
  }
  return { ok: true, status: 0, retriedLegNames };
}
