import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { declaredTimeouts } from './helpers/declared_timeouts';
import { expectScansOnlyThroughSharedWalkers } from './helpers/scan_guard_self_audit';
import { tsFilesUnder } from './helpers/ts_files_under';

// THE ANTI-WHALE RATCHET (docs/qa-gate.md, "Declared duration budgets").
//
// One giant test file sets the wall clock of whichever 2-worker CI job draws
// it: the owned-class balance harness reached 788 to 842 seconds as ONE file
// before it was split, and the warlock sustain suite drifted to 359 seconds in
// the shard pool with nothing to say so. This guard makes that drift a red
// diff instead of a slow surprise, off DECLARED vitest timeouts, which are the
// only deterministic signal available at review time.
//
// It reads ALLOWANCES, not runtimes (tests/helpers/declared_timeouts.ts states
// the parsing contract and its limits: diet arm of ternaries, comments
// stripped, describe-body collection work invisible). So the rules are
// conscious-decision ratchets, in the monolith_budget mold:
//  - a single test may not declare more than SINGLE_TEST_CAP unless its file
//    has an exact-match exception row here. One test is one worker chain: it
//    cannot parallelize, so its allowance IS a job-wall floor. Shrink an
//    exception when the test splits; growing one is a maintainer decision that
//    needs its reasoning in the PR body.
//  - a file whose declared sum exceeds DEFAULT_FILE_ALLOWANCE needs an
//    exact-match ledger row. The remedies, in preference order: split the file
//    along its cost clusters (the owned-class and chronomancy splits are the
//    worked precedent, and the extract-and-test skill has the recipe), move
//    the heavy case to a lane-owned suite (scripts/lib/ci_shard_plan.mjs,
//    CI_LONG_SUITES, whose own comment carries the measured 90-second rule),
//    or add the row deliberately.
//  - rows and exceptions are EXACT, so any timeout edit in a listed file
//    touches this ledger in the same change, and a row for a file that no
//    longer exceeds the default must be deleted (the ratchet direction).
//
// Lane membership itself stays a MEASURED decision, deliberately not enforced
// here: tests/audit_conservation_property.test.ts declares 2,700 seconds of
// allowance across its property cases yet measured 55.1 seconds in-lane and
// was evicted, so declared sums must never drive the lane list.

const SINGLE_TEST_CAP = 480_000;

// file -> the exact largest single declared timeout it is allowed to carry.
const SINGLE_TEST_EXCEPTIONS: ReadonlyMap<string, number> = new Map([
  // The Nythraxis matrix runs its full boss ladder as one case. Splitting it
  // is the standing follow-up; shrink this when that lands.
  ['tests/nythraxis_matrix.test.ts', 720_000],
]);

const DEFAULT_FILE_ALLOWANCE = 300_000;

// file -> exact declared diet-arm sum, for every file above the default.
const FILE_ALLOWANCE_LEDGER: ReadonlyMap<string, number> = new Map([
  ['tests/audit_conservation_property.test.ts', 2_700_000],
  ['tests/battleground_band.test.ts', 660_000],
  ['tests/chronomancy_balance_targets.test.ts', 360_000],
  ['tests/discord_db_integration.test.ts', 420_000],
  ['tests/dragonkin_whelp_litter.test.ts', 420_000],
  ['tests/druid_balance_probe.test.ts', 570_000],
  ['tests/emerald_deck_escape.test.ts', 540_000],
  ['tests/guild_bank_pg_integration.test.ts', 840_000],
  ['tests/mob_portrait_source_manifest.test.ts', 360_000],
  ['tests/nythraxis_matrix.test.ts', 1_320_000],
  ['tests/owned_class_balance_dps_probes.test.ts', 360_000],
  ['tests/perf_tour_entry.test.ts', 450_000],
]);

// This file excludes ITSELF from the scan: its parser fixtures below are real
// declaration text by necessity, so the scraper would read them as this file's
// own allowances (the diet-flag registry splits its needle for the same
// reason; string fixtures cannot be split without losing what they test).
const SELF = 'tests/suite_duration_budget.test.ts';

function suiteTimeouts(): Map<string, { perTest: number[]; sum: number }> {
  const out = new Map<string, { perTest: number[]; sum: number }>();
  for (const found of tsFilesUnder('tests')) {
    if (!found.file.endsWith('.test.ts')) continue;
    if (`tests/${found.file}` === SELF) continue;
    out.set(`tests/${found.file}`, declaredTimeouts(readFileSync(found.full, 'utf8')));
  }
  return out;
}

describe('suite duration budget (declared-timeout ratchet)', () => {
  const suite = suiteTimeouts();

  it('walks the whole suite recursively and actually parses timeouts', () => {
    // Deep root, so the real tree pins recursion directly: a subdirectory
    // member must be present, and the corpus floor sits near the real count
    // (2,730 on 2026-08-13) so a walk that silently narrowed would fail.
    expect(suite.size).toBeGreaterThanOrEqual(2_600);
    expect(suite.has('tests/server/new_endpoint.test.ts')).toBe(true);
    const withTimeouts = [...suite.values()].filter((entry) => entry.sum > 0).length;
    // Vacuity floor near the real count (106 on 2026-08-13): a scraper change
    // that stopped matching the repo's real declaration forms fails here, not
    // by quietly emptying every rule below.
    expect(withTimeouts).toBeGreaterThanOrEqual(90);
    const nythraxis = suite.get('tests/nythraxis_matrix.test.ts');
    expect(nythraxis?.sum).toBe(1_320_000);
    expect(Math.max(...(nythraxis?.perTest ?? [0]))).toBe(720_000);
  });

  it('parses every declared-timeout form and strips comments first', () => {
    // Producer semantics pinned by execution: the trailing-argument form, the
    // option-object form, the ternary diet arm, a trailing comma close, a
    // commented-out timeout (not counted), and a sub-10s value (not counted).
    expect(declaredTimeouts(`it('a', () => { run(); }, 120_000);`).perTest).toEqual([120_000]);
    expect(declaredTimeouts(`it('b', { timeout: 240_000 }, () => { run(); });`).perTest).toEqual([
      240_000,
    ]);
    expect(
      declaredTimeouts(`it('c', () => { run(); }, FULL ? 900_000 : 300_000);`).perTest,
    ).toEqual([300_000]);
    expect(declaredTimeouts(`it('d', { timeout: FULL ? 720_000 : 90_000 }, fn);`).perTest).toEqual([
      90_000,
    ]);
    expect(
      declaredTimeouts(`it(\n  'e',\n  () => {\n    run();\n  },\n  60_000,\n);`).perTest,
    ).toEqual([60_000]);
    expect(declaredTimeouts(`// it('old', () => { run(); }, 900_000);`).perTest).toEqual([]);
    expect(
      declaredTimeouts(`/* }, 800_000) */ it('f', () => { run(); }, 30_000);`).perTest,
    ).toEqual([30_000]);
    expect(declaredTimeouts(`setTimeout(() => { poll(); }, 5_000);`).perTest).toEqual([]);
  });

  it('caps every single declared test timeout at the worker-chain bound', () => {
    for (const [file, { perTest }] of suite) {
      const largest = Math.max(0, ...perTest);
      const exception = SINGLE_TEST_EXCEPTIONS.get(file);
      if (exception !== undefined) {
        expect(
          largest,
          `${file}: the single-test exception is exact; shrink the row when the test splits, ` +
            'and growing it is a maintainer decision that needs its reasoning in the PR body',
        ).toBe(exception);
        continue;
      }
      expect(
        largest,
        `${file} declares a ${Math.round(largest / 1000)}s single-test allowance (cap ` +
          `${SINGLE_TEST_CAP / 1000}s). One test is one worker chain and cannot parallelize: ` +
          'split it along its cost clusters (the owned-class balance split is the precedent), ' +
          'or add an exact exception row in tests/suite_duration_budget.test.ts deliberately.',
      ).toBeLessThanOrEqual(SINGLE_TEST_CAP);
    }
    for (const file of SINGLE_TEST_EXCEPTIONS.keys()) {
      expect(suite.has(file), `${file}: stale single-test exception row`).toBe(true);
    }
  });

  it('pins the per-file declared allowance ledger exactly, both directions', () => {
    for (const [file, { sum }] of suite) {
      const row = FILE_ALLOWANCE_LEDGER.get(file);
      if (row !== undefined) {
        expect(
          sum,
          `${file}: the ledger row is exact; any timeout edit here updates the row in the ` +
            'same change (and a split LOWERS it)',
        ).toBe(row);
        continue;
      }
      expect(
        sum,
        `${file} declares ${Math.round(sum / 1000)}s of summed allowance (default ` +
          `${DEFAULT_FILE_ALLOWANCE / 1000}s). Split the file along its cost clusters, move the ` +
          'heavy case to a lane-owned suite (scripts/lib/ci_shard_plan.mjs, CI_LONG_SUITES), or ' +
          'add an exact ledger row in tests/suite_duration_budget.test.ts deliberately.',
      ).toBeLessThanOrEqual(DEFAULT_FILE_ALLOWANCE);
    }
    for (const [file, row] of FILE_ALLOWANCE_LEDGER) {
      expect(suite.has(file), `${file}: stale ledger row (file gone; delete the row)`).toBe(true);
      expect(
        row,
        `${file}: ledger row at or under the default is dead weight; delete it`,
      ).toBeGreaterThan(DEFAULT_FILE_ALLOWANCE);
    }
  });

  it('reads the tree only through the shared walker', () => {
    expectScansOnlyThroughSharedWalkers(import.meta.url, ['ts_files_under']);
  });
});
