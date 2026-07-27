import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectScansOnlyThroughSharedWalkers } from './helpers/scan_guard_self_audit';
import { duplicateSiblingBlocks, testBlockCalls } from './helpers/test_block_calls';
import { tsFilesUnder } from './helpers/ts_files_under';

// #2506: no test file may register the same block twice.
//
// `tests/gathering.test.ts` held a second, byte-identical copy of
// `resolveCorpseFocusHarvest: concentrate vs spread tradeoff (#1142)` and of
// `harvestTierQuantity`; `tests/fixes.test.ts` held a second copy of
// `mob tap rights` and `pet heel warp`. Vitest registers duplicate titles
// silently, so all four ran, and nothing in the suite could say so.
//
// This guard exists rather than the deletion alone because the gathering pair is
// a RECURRENCE: commit a1a8cfd56 deleted the same 80 lines in July, and its own
// message records the release/v0.23.0 merge putting them straight back. A defect
// that returns through merges returns again, and the only thing that stops it is
// a check that runs on every merge.
//
// FAILURE DIRECTION, which is what decides this scan's depth (#2502): it looks
// only for offenders, so a file it fails to reach is a SILENT PASS. It therefore
// recurses, over every `.ts` under `tests/`, and takes no view about which files
// are allowed to hold blocks. `tests/` is genuinely deep (server/, admin/,
// parity/, helpers/, progression/, browser/, util/), so the recursion is pinned
// twice over: directly, by a file-count floor and a per-subdirectory check over
// the real tree, and structurally, by a fixture that drives this file's OWN
// producer over a nested tree.

/** The scan root, as a parameter rather than a constant: the fixture case below
 *  drives this exact function over a temp tree, which is what pins the recursion
 *  rather than restating it (#2499: a producer that resolves its own root can
 *  only ever be proven against the tree it already passes). */
const TESTS_ROOT = path.resolve(process.cwd(), 'tests');

interface Offender {
  readonly file: string;
  readonly head: string;
  readonly title: string;
  readonly first: string;
  readonly repeat: string;
}

/** Every byte-identical duplicated sibling block under `root`, file-labeled. */
const duplicatesUnder = (root: string): Offender[] =>
  tsFilesUnder(root).flatMap(({ file, full }) =>
    duplicateSiblingBlocks(readFileSync(full, 'utf8'), file).map((d) => ({ file, ...d })),
  );

/** Every block under `root`, and the chains the head resolver did not recognize. */
const blocksUnder = (root: string) =>
  tsFilesUnder(root).map(({ file, full }) => ({
    file,
    ...testBlockCalls(readFileSync(full, 'utf8'), file),
  }));

const describeOffender = (o: Offender): string =>
  `${o.file} lines ${o.repeat} repeat lines ${o.first} verbatim: ${o.title}`;

describe('no test file registers the same block twice (#2506)', () => {
  const scanned = tsFilesUnder(TESTS_ROOT);
  const perFile = blocksUnder(TESTS_ROOT);
  const allBlocks = perFile.flatMap((f) => f.blocks);

  it('finds no block that repeats a sibling verbatim', () => {
    // The whole point of the guard. A repeat is always a defect: vitest runs
    // both copies, so the suite pays for the second one, and a reader has no way
    // to tell which copy the next case belongs in.
    expect(duplicatesUnder(TESTS_ROOT).map(describeOffender)).toEqual([]);
  });

  it('scanned a corpus the size of the real suite, not a handful of files', () => {
    // The vacuity floor, and the reason it is not `> 0`: this guard reports
    // OFFENDERS, so every way it can break quietly ends in an empty scan. A walk
    // that stopped recursing, a parse that threw and was swallowed, a filter that
    // matched nothing: all of them pass the assertion above with an empty list.
    // The floors sit under the real counts (1624 files, 23352 blocks as of
    // #2506) with room for ordinary churn in both directions, but far enough
    // above zero that losing a whole subdirectory fails here.
    expect(scanned.length).toBeGreaterThan(1400);
    expect(allBlocks.length).toBeGreaterThan(20_000);
  });

  it('reaches every subdirectory of tests/, so the deep suites are really covered', () => {
    // The direct recursion pin over the REAL tree, which `tests/` can carry and
    // a flat root cannot: most of this repo's tests sit at the top level, so a
    // single-level read would still scan 1452 files and look entirely healthy
    // while `tests/server/` (139 files) left the guard's coverage silently.
    const dirs = new Set(
      scanned.map((f) => f.file.split('/')[0]).filter((d) => d.endsWith('.ts') === false),
    );
    expect([...dirs].sort()).toEqual([
      'admin',
      'browser',
      'helpers',
      'parity',
      'progression',
      'server',
      'util',
    ]);
    // ...and that those subdirectories really contribute blocks, not just files.
    const nested = perFile.filter((f) => f.file.includes('/') && f.blocks.length > 0);
    expect(nested.length).toBeGreaterThan(100);
  });

  it('covers the two files #2506 fixed, so the guard holds the fix it shipped with', () => {
    // Named explicitly: a floor over 1600 files cannot notice these two leaving,
    // and they are the only files whose duplicates this guard has ever seen.
    for (const file of ['gathering.test.ts', 'fixes.test.ts']) {
      const found = perFile.find((f) => f.file === file);
      expect(found, `${file} left the scan`).toBeDefined();
      expect(found?.blocks.length ?? 0, `${file} contributed no blocks`).toBeGreaterThan(5);
    }
  });

  it('resolves every block chain except the known local rigs', () => {
    // The completeness half, and the one thing a "found no offenders" result
    // cannot tell you: if the head resolver stops recognizing a chain, those
    // blocks leave the scan and this file stays green over less. Pinned as an
    // exact set rather than a count, per #2516: a category field is a free-text
    // opt-out unless its distribution is pinned.
    //
    // Both survivors are a local rig bound to the name `test` in a controller
    // suite, which roots at the same identifier a real `test.each(...)` does.
    // A THIRD entry means one of two things: a new rig accessor that takes a
    // callback (add it here), or a vitest modifier missing from BLOCK_MODIFIERS
    // (add it there, and the blocks it was hiding rejoin the scan).
    const chains = perFile.flatMap((f) => f.unresolved.map((u) => `${u.head}.${u.chain}`));
    expect([...new Set(chains)].sort()).toEqual([
      'test.attachTooltip.mock.calls.find',
      'test.scheduled.some',
    ]);
  });

  it('reads the tree only through the shared walker', () => {
    // Over a root this deep a hand-rolled read would return the same list today,
    // so no assertion above can tell one from the other (#2502).
    expectScansOnlyThroughSharedWalkers(import.meta.url, ['ts_files_under']);
  });

  it('descends, so a duplicate in a SUBDIRECTORY is caught (#2485, #2489, #2502)', () => {
    // The structural recursion pin: drive the real producer over a fixture tree
    // rather than eyeballing the walk. The offender sits THREE levels down, so a
    // walk with any depth cap fails here rather than passing on a shallow tree.
    const fixture = mkdtempSync(path.join(tmpdir(), 'woc-dup-blocks-'));
    try {
      mkdirSync(path.join(fixture, 'nested', 'deeper', 'deepest'), { recursive: true });
      const dupe = [
        "describe('a', () => {",
        "  it('one', () => {",
        '    expect(1).toBe(1);',
        '  });',
        '});',
        '',
        "describe('a', () => {",
        "  it('one', () => {",
        '    expect(1).toBe(1);',
        '  });',
        '});',
        '',
      ].join('\n');
      writeFileSync(path.join(fixture, 'nested', 'deeper', 'deepest', 'deep.test.ts'), dupe);
      // A clean file beside it, so the fixture proves the scan is discriminating
      // and not just reporting every file it reaches.
      writeFileSync(
        path.join(fixture, 'top.test.ts'),
        "describe('kept', () => {\n  it('only once', () => {\n    expect(1).toBe(1);\n  });\n});\n",
      );
      expect(duplicatesUnder(fixture).map((o) => `${o.file} ${o.first} ${o.repeat}`)).toEqual([
        'nested/deeper/deepest/deep.test.ts 1-5 7-11',
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
