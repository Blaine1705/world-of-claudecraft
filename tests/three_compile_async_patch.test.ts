import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('three compileAsync disposal race patch', () => {
  it('keeps the installed three r165 currentProgram guard applied', () => {
    // Install-integrity trap: compileAsync polls after a churned material can
    // lose its renderer properties. A three upgrade must re-evaluate the race.
    //
    // Scope: patches/three@0.165.0.patch covers build/three.module.js ONLY.
    // build/three.cjs and build/three.module.min.js still carry the race, but
    // nothing in this repo consumes them: there is no require('three'), so
    // every path resolves the package's "import" condition to three.module.js.
    // A future consumer of either bundle must extend the patch. This note
    // lives here instead of inside the .patch file because pnpm-lock.yaml pins
    // the patch file's content hash: editing the patch would invalidate that
    // pin and break pnpm install --frozen-lockfile.
    const source = readFileSync(
      new URL('../node_modules/three/build/three.module.js', import.meta.url),
      'utf8',
    );

    // Plain includes + message keeps a failure legible: a toContain miss would
    // dump the whole 1.28 MB bundle into the reporter.
    expect(
      source.includes('if ( program === undefined || program.isReady() ) {'),
      'the three r165 compileAsync patch is not applied; re-run pnpm install',
    ).toBe(true);
    expect(
      source.includes('three r165 compileAsync disposal race'),
      'the three r165 compileAsync patch marker comment is missing; re-run pnpm install',
    ).toBe(true);
  });
});
