import { describe, expect, it } from 'vitest';
import { delveInteriorBuildAction } from '../src/render/delve_interior_cache_core';

describe('delveInteriorBuildAction', () => {
  it('builds a position that has never been built', () => {
    expect(delveInteriorBuildAction(undefined, 'litany_ring', false)).toBe('build');
  });

  it('skips a position mid-build', () => {
    expect(delveInteriorBuildAction(undefined, 'litany_ring', true)).toBe('skip');
    expect(delveInteriorBuildAction('litany_ring', 'litany_ring', true)).toBe('skip');
  });

  it('skips a position already built with the same module (same run, or a re-roll that picked the same room)', () => {
    expect(delveInteriorBuildAction('litany_ring', 'litany_ring', false)).toBe('skip');
  });

  it('rebuilds a position whose cached module differs from the current run: a new run randomized a DIFFERENT room into a z-slot a previous run already occupied', () => {
    expect(delveInteriorBuildAction('litany_ring', 'litany_sluice', false)).toBe('rebuild');
  });
});
