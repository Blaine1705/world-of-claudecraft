// Environment truth for the $WOC market: every market env var the code reads
// is documented in .env.example, and every WOC_MARKET_* row documented there
// is actually read by code. The review found both failure directions live
// (WOC_MARKET_SERVICE_URL read but undocumented; the TOTP threshold knob
// documented but read by nothing), so this guard pins both.
//
// The corpus is an EXPLICIT file list, not a directory walk: these are the
// exact modules that read market configuration, and a new one must be added
// here deliberately (the test says so when a known name goes missing).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripComments } from '../helpers/strip_comments';

const read = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

// Every module that reads a market-relevant env name. require_internal_secret
// is here because it reads DASHBOARD_INTERNAL_SECRET through a NAMED CONSTANT
// (process.env[gate.envVar]), which the process.env regex alone cannot see.
const CORPUS = [
  'server/woc_market_proxy.ts',
  'server/woc_market_routes.ts',
  'server/main.ts',
  'server/http/config.ts',
  'server/http/middleware/require_internal_secret.ts',
  // The claudium proxy owns WOC_ECONOMY_SERVICE_URL; it is in scope because
  // the market shares the WOC_ECONOMY_* pair (the internal secret) and the
  // dead-knob direction sweeps that prefix.
  'server/claudium_proxy.ts',
];

// Prefixes that make a name market-relevant for the forward check (main.ts
// and config.ts read plenty of unrelated env).
const PREFIXES = ['WOC_MARKET_', 'WOC_ECONOMY_', 'DASHBOARD_'];

function readNames(): Set<string> {
  const names = new Set<string>();
  for (const rel of CORPUS) {
    const src = stripComments(read(rel));
    // \benv\. covers both process.env.NAME and config.ts's bound
    // env: NodeJS.ProcessEnv parameter (env.NAME).
    for (const m of src.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)) names.add(m[1]);
    // The named-constant indirection: const X_ENV = 'NAME' later read as
    // process.env[gate.envVar]. Capture the literal at its definition.
    for (const m of src.matchAll(/_ENV\s*=\s*'([A-Z][A-Z0-9_]+)'/g)) names.add(m[1]);
  }
  return new Set([...names].filter((n) => PREFIXES.some((p) => n.startsWith(p))));
}

function documentedNames(): Set<string> {
  const env = read('.env.example');
  const names = new Set<string>();
  for (const m of env.matchAll(/^#?([A-Z][A-Z0-9_]+)=/gm)) names.add(m[1]);
  return names;
}

describe('market env documentation matches the code', () => {
  it('the scanner really sees the names the review found missing (positive control)', () => {
    // Guards the guard: if the read-extraction regexes rot (a refactor to a
    // destructured read, a renamed constant), the two set comparisons below
    // would go vacuous instead of red. These two names are the exact original
    // misses, one per extraction form.
    const reads = readNames();
    expect(reads).toContain('WOC_MARKET_SERVICE_URL');
    expect(reads).toContain('DASHBOARD_INTERNAL_SECRET');
  });

  it('documents every market env name the code reads', () => {
    const docs = documentedNames();
    const undocumented = [...readNames()].filter((n) => !docs.has(n)).sort();
    expect(
      undocumented,
      'read by market code but missing from .env.example (document it there)',
    ).toEqual([]);
  });

  it('reads every market-prefixed name .env.example documents (no dead knobs)', () => {
    const reads = readNames();
    const dead = [...documentedNames()]
      .filter((n) => PREFIXES.some((p) => n.startsWith(p)) && !reads.has(n))
      .sort();
    expect(
      dead,
      'documented in .env.example but read by no market module (delete the row, or add its reader to CORPUS)',
    ).toEqual([]);
  });

  it('the corpus itself stays real: every listed file reads at least one market name', () => {
    // A renamed module would silently shrink the sweep; this fails the rename
    // toward updating CORPUS.
    for (const rel of CORPUS) {
      const src = stripComments(read(rel));
      const hits =
        [...src.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)].some((m) =>
          PREFIXES.some((p) => m[1].startsWith(p)),
        ) || /_ENV\s*=\s*'(?:WOC_MARKET_|WOC_ECONOMY_|DASHBOARD_)[A-Z0-9_]*'/.test(src);
      expect(hits, `${rel} no longer reads any market env name; update CORPUS`).toBe(true);
    }
  });
});
