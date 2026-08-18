import { describe, expect, it } from 'vitest';
import {
  type DelveInteriorPlacement,
  delveInteriorBuildAction,
} from '../src/render/delve_interior_cache_core';

const placement = (moduleId: string, ox = 0, oz = 120): DelveInteriorPlacement => ({
  moduleId,
  ox,
  oz,
});

describe('delveInteriorBuildAction', () => {
  it('builds a position that has never been built', () => {
    expect(delveInteriorBuildAction(undefined, placement('litany_ring'), false)).toBe('build');
  });

  it('skips a position mid-build', () => {
    expect(delveInteriorBuildAction(undefined, placement('litany_ring'), true)).toBe('skip');
    expect(delveInteriorBuildAction(placement('litany_ring'), placement('litany_ring'), true)).toBe(
      'skip',
    );
  });

  it('skips a position already built with the same module and placement', () => {
    expect(
      delveInteriorBuildAction(placement('litany_ring'), placement('litany_ring'), false),
    ).toBe('skip');
  });

  it('rebuilds a position whose cached module differs from the current run: a new run randomized a DIFFERENT room into a z-slot a previous run already occupied', () => {
    expect(
      delveInteriorBuildAction(placement('litany_ring'), placement('litany_sluice'), false),
    ).toBe('rebuild');
  });

  it('rebuilds a same-module position when the world placement changes', () => {
    expect(
      delveInteriorBuildAction(
        placement('litany_apse', 10, 480),
        placement('litany_apse', 10, 496),
        false,
      ),
    ).toBe('rebuild');
    expect(
      delveInteriorBuildAction(
        placement('litany_apse', 10, 480),
        placement('litany_apse', 12, 480),
        false,
      ),
    ).toBe('rebuild');
  });
});
