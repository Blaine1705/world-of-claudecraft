import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SFX_FIXED_CATALOG_KEYS } from '../src/game/sfx_manifest.generated';

// src/sim/ cannot import the generated SfxId type (it lives in a client module
// the sim must never depend on, see src/sim/types.ts's `sfxKey?: string`
// comment), so nothing type-checks a `riftFx(...)` call's sfxKey literal
// against the real SFX manifest. This guard closes that gap the cheap way: it
// scrapes every riftFx(...) call site under src/sim/rift/ for its sfxKey
// argument and asserts each one names a real, shipped SFX catalog key, so a
// typo'd or renamed key fails a test instead of silently playing nothing
// (review finding, PR #2687).

const RIFT_DIR = path.join(__dirname, '../src/sim/rift');

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

function extractRiftSfxKeyLiterals(): string[] {
  const files = readdirSync(RIFT_DIR).filter((f) => f.endsWith('.ts'));
  const keys = new Set<string>();
  for (const file of files) {
    const src = readFileSync(path.join(RIFT_DIR, file), 'utf8');
    for (const call of src.matchAll(/riftFx\(([^)]*)\)/g)) {
      const args = call[1];
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
