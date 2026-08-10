import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SFX_FIXED_CATALOG_KEYS } from '../src/game/sfx_manifest.generated';

// src/sim/ cannot import the generated SfxId type (it lives in a client module
// the sim must never depend on, see src/sim/types.ts's `sfxKey?: string`
// comment), so nothing type-checks a `riftFx(...)` call's sfxKey literal
// against the real SFX manifest. This guard closes that gap the cheap way: it
// scrapes every riftFx(...) call site under src/sim/rift/ AND src/sim/dev_commands.ts
// (the dev `/rift_portal_spawn` command also calls riftFx directly, review
// finding, PR #2687 round 1 and round 2) for its sfxKey argument and asserts
// each one names a real, shipped SFX catalog key, so a typo'd or renamed key
// fails a test instead of silently playing nothing.

const RIFT_DIR = path.join(__dirname, '../src/sim/rift');
const EXTRA_SCAN_FILES = [path.join(__dirname, '../src/sim/dev_commands.ts')];

// riftFx(ctx, x, z, school, fx, sfxKey?, pid?): school and fx are drawn from
// small fixed vocabularies, so any OTHER quoted string literal inside a
// riftFx(...) call is the sfxKey argument.
const SCHOOL_AND_FX_LITERALS = new Set([
  'fire',
  'frost',
  'arcane',
  'shadow',
  'holy',
  'nature',
  'physical',
  'burst',
  'nova',
]);

// Extracts every `riftFx(...)` call's full argument text from `src`, matching
// parens with a running depth count rather than `/riftFx\(([^)]*)\)/`, so a
// call with a nested function call in its arguments (e.g. `riftFx(ctx, x, z,
// school, fx, pickKey())`) does not truncate at that inner call's closing
// paren and silently drop out of the scan.
function extractRiftFxCallArgs(src: string): string[] {
  const calls: string[] = [];
  const callRe = /riftFx\(/g;
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(src))) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
    }
    if (depth === 0) calls.push(src.slice(start, i - 1));
  }
  return calls;
}

function extractRiftSfxKeyLiterals(): string[] {
  const files = readdirSync(RIFT_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(RIFT_DIR, f))
    .concat(EXTRA_SCAN_FILES);
  const keys = new Set<string>();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const args of extractRiftFxCallArgs(src)) {
      for (const str of args.matchAll(/'([^']*)'/g)) {
        const literal = str[1];
        if (!SCHOOL_AND_FX_LITERALS.has(literal)) keys.add(literal);
      }
    }
  }
  return [...keys];
}

describe('src/sim/rift riftFx sfxKey literals stay in sync with the real SFX manifest', () => {
  it('finds at least one sfxKey literal (the scan itself is not vacuous)', () => {
    expect(extractRiftSfxKeyLiterals().length).toBeGreaterThan(0);
  });

  it('every sfxKey literal passed to riftFx is a real SFX_FIXED_CATALOG_KEYS entry', () => {
    const catalog = new Set<string>(SFX_FIXED_CATALOG_KEYS as readonly string[]);
    for (const key of extractRiftSfxKeyLiterals()) {
      expect(catalog.has(key), `sfxKey '${key}' is not in SFX_FIXED_CATALOG_KEYS`).toBe(true);
    }
  });
});
