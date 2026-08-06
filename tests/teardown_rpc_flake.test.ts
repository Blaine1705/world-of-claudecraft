import { describe, expect, it } from 'vitest';
import {
  isTeardownRpcFlake,
  TEARDOWN_RPC_MESSAGE,
  TEARDOWN_RPC_TAIL_BYTES,
} from '../scripts/lib/teardown_rpc_flake.mjs';

// The ONE sanctioned known-flake signature (CI/CD performance packet, Phase
// 6): every test passed, exit 1 from the vitest worker-teardown RPC race.
// The classifier gates an automatic retry in CI, so every arm here is a
// fail-closed pin: anything that loosens the match would let a real failure
// ride the retry, which the packet's non-goals forbid.

const ESC = String.fromCharCode(27);
const dim = (s: string) => `${ESC}[2m${s}${ESC}[22m`;
const green = (s: string) => `${ESC}[1m${ESC}[32m${s}${ESC}[39m${ESC}[22m`;

const RPC_BANNER =
  'Unhandled Rejection\n' +
  `EnvironmentTeardownError: [vitest-worker]: ${TEARDOWN_RPC_MESSAGE}\n` +
  '    at Object.onCancel (node_modules/.pnpm/vitest@4.1.10/node_modules/vitest/dist/worker.js:105:11)\n';

function summary(filesBuckets: string, testsBuckets: string): string {
  return ` Test Files  ${filesBuckets}\n      Tests  ${testsBuckets}\n   Start at  13:24:33\n   Duration  431.92s (transform 31.1s, setup 46.2s, import 116.4s)\n`;
}

const FLAKE_TAIL = `${summary('272 passed (272)', '3312 passed (3312)')}\n${RPC_BANNER}\n  Errors  1 error\n`;

describe('isTeardownRpcFlake', () => {
  it('matches the exact recorded signature: all passed, exit 1, the rpc message', () => {
    expect(isTeardownRpcFlake({ status: 1, tail: FLAKE_TAIL })).toBe(true);
  });

  it('matches through ANSI color wrapping and CRLF, the shapes CI logs really have', () => {
    const colored =
      `${dim(' Test Files ')} ${green('272 passed')} ${dim('(272)')}\r\n` +
      `${dim('      Tests ')} ${green('3312 passed')} ${dim('(3312)')}\r\n` +
      `\r\n${RPC_BANNER.replace(/\n/g, '\r\n')}`;
    expect(isTeardownRpcFlake({ status: 1, tail: colored })).toBe(true);
  });

  it('allows skipped and todo buckets: the full suite carries DB-gated skips', () => {
    const tail = `${summary('272 passed (272)', '3302 passed | 10 skipped (3312)')}\n${RPC_BANNER}`;
    expect(isTeardownRpcFlake({ status: 1, tail })).toBe(true);
  });

  it('never matches when any test failed, in either summary line', () => {
    const failedTests = `${summary('272 passed (272)', '1 failed | 3311 passed (3312)')}\n${RPC_BANNER}`;
    expect(isTeardownRpcFlake({ status: 1, tail: failedTests })).toBe(false);
    const failedFiles = `${summary('1 failed | 271 passed (272)', '3312 passed (3312)')}\n${RPC_BANNER}`;
    expect(isTeardownRpcFlake({ status: 1, tail: failedFiles })).toBe(false);
  });

  it('never matches without BOTH summary lines in the tail', () => {
    const filesOnly = ` Test Files  272 passed (272)\n${RPC_BANNER}`;
    expect(isTeardownRpcFlake({ status: 1, tail: filesOnly })).toBe(false);
    const testsOnly = `      Tests  3312 passed (3312)\n${RPC_BANNER}`;
    expect(isTeardownRpcFlake({ status: 1, tail: testsOnly })).toBe(false);
    expect(isTeardownRpcFlake({ status: 1, tail: RPC_BANNER })).toBe(false);
  });

  it('requires the exact rpc message: a different pending rpc never retries', () => {
    const otherRpc = FLAKE_TAIL.replace('onUserConsoleLog', 'onTaskUpdate');
    expect(isTeardownRpcFlake({ status: 1, tail: otherRpc })).toBe(false);
    const otherError = FLAKE_TAIL.replace('EnvironmentTeardownError', 'SomeOtherTeardownError');
    expect(isTeardownRpcFlake({ status: 1, tail: otherError })).toBe(false);
  });

  it('requires exit status exactly 1: exit 0, other codes, and signal kills never match', () => {
    expect(isTeardownRpcFlake({ status: 0, tail: FLAKE_TAIL })).toBe(false);
    expect(isTeardownRpcFlake({ status: 2, tail: FLAKE_TAIL })).toBe(false);
    expect(isTeardownRpcFlake({ status: null, tail: FLAKE_TAIL })).toBe(false);
  });

  it('never matches an empty or summary-free tail', () => {
    expect(isTeardownRpcFlake({ status: 1, tail: '' })).toBe(false);
    expect(isTeardownRpcFlake({ status: 1, tail: 'npm ERR! test failed' })).toBe(false);
  });

  it('judges the FINAL summary when a tail somehow holds two', () => {
    const twoSummaries =
      `${summary('1 failed | 271 passed (272)', '1 failed | 3311 passed (3312)')}\n` +
      `${summary('272 passed (272)', '3312 passed (3312)')}\n${RPC_BANNER}`;
    expect(isTeardownRpcFlake({ status: 1, tail: twoSummaries })).toBe(true);
    const failsLast =
      `${summary('272 passed (272)', '3312 passed (3312)')}\n` +
      `${summary('1 failed | 271 passed (272)', '1 failed | 3311 passed (3312)')}\n${RPC_BANNER}`;
    expect(isTeardownRpcFlake({ status: 1, tail: failsLast })).toBe(false);
  });

  it('keeps the tail budget large enough for a summary plus the banner', () => {
    // The leg runner keeps this many bytes of combined output; the signature
    // artifacts print at the very end of a run, well inside the budget.
    expect(TEARDOWN_RPC_TAIL_BYTES).toBeGreaterThanOrEqual(64 * 1024);
    expect(FLAKE_TAIL.length).toBeLessThan(TEARDOWN_RPC_TAIL_BYTES / 8);
  });
});
