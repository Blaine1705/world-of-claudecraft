#!/usr/bin/env node
// Thin orchestrator for `npm run ci:changed`: resolves the correct local
// `--since` ref (scripts/lib/ci_changed_base.mjs) and execs biome with it,
// mirroring the `lint` job in .github/workflows/ci.yml. See that module's
// header for why a bare `biome ci --changed` is wrong here.

import { execFileSync, spawnSync } from 'node:child_process';
import { resolveChangedBaseRef } from './lib/ci_changed_base.mjs';

function execGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

const since = resolveChangedBaseRef({ execGit });

const result = spawnSync(
  'npx',
  ['@biomejs/biome', 'ci', '--changed', `--since=${since}`, '--no-errors-on-unmatched'],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
