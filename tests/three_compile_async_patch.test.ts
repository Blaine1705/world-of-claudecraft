import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('three compileAsync disposal race patch', () => {
  it('keeps the installed three r165 currentProgram guard applied', () => {
    // Install-integrity trap: compileAsync polls after a churned material can
    // lose its renderer properties. A three upgrade must re-evaluate the race.
    const source = readFileSync(
      new URL('../node_modules/three/build/three.module.js', import.meta.url),
      'utf8',
    );

    expect(source).toContain('if ( program === undefined || program.isReady() ) {');
    expect(source).toContain('three r165 compileAsync disposal race');
  });
});
