#!/usr/bin/env node
// Thin orchestrator for `npm run ci:changed`: resolves the correct local
// `--since` ref (scripts/lib/ci_changed_base.mjs, backed by
// scripts/lib/gate_discovery.mjs's resolveSelectBase) and execs biome with
// it, mirroring the `lint` job in .github/workflows/ci.yml. See
// ci_changed_base.mjs's header for why a bare `biome ci --changed` is wrong
// here.

import { spawnSync } from 'node:child_process';
import { resolveChangedBaseRef } from './lib/ci_changed_base.mjs';

// npm/npx resolve to .cmd files on Windows, which spawnSync only finds via a
// shell (same pattern as scripts/gate.mjs and scripts/gate_fast.mjs).
const shell = process.platform === 'win32';

/** @type {(cmd: string, args: string[]) => { status: number | null, stdout?: string }} */
function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', shell });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

let since;
try {
  since = resolveChangedBaseRef({ env: process.env, run });
} catch (err) {
  console.error(`[ci:changed] ${err.message}`);
  process.exit(1);
}

console.log(`[ci:changed] --since=${since}`);

// Pin the biome invocation to the version this repo depends on
// (package.json "@biomejs/biome") with --no-install, same as the guard-test
// invocation in scripts/gate_fast.mjs: a bare `npx @biomejs/biome` can
// silently resolve a different cached/global version than the one the repo
// pins, which would drift from every other biome check in the gate.
const result = spawnSync(
  'npx',
  [
    '--no-install',
    '@biomejs/biome@2.5.4',
    'ci',
    '--changed',
    `--since=${since}`,
    '--no-errors-on-unmatched',
  ],
  { stdio: 'inherit', shell },
);

if (result.error !== undefined) {
  console.error(`[ci:changed] failed to spawn biome: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
