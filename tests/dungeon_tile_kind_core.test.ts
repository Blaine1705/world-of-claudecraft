// Pins for the pure kit floor/wall pickers (src/render/dungeon_tile_kind_core.ts):
// the drowned-arena temple aliasing, the ignivar tile-kit rerouting, and the
// clean-masonry guarantees the kept-castle variants rely on.
import { describe, expect, it } from 'vitest';
import {
  dungeonFloorKind,
  dungeonFloorQuadKind,
  dungeonWallKind,
} from '../src/render/dungeon_tile_kind_core';
import {
  IGNIVAR_FLOOR_KIND_WEIGHTS,
  IGNIVAR_FLOOR_QUAD_KIND,
} from '../src/render/ignivar_tile_kit';

const sweep = (count = 40): number[] => Array.from({ length: count }, (_, i) => i / count);

describe('dungeonFloorKind', () => {
  it('aliases the drowned arena to the temple mix', () => {
    for (const t of sweep()) {
      expect(dungeonFloorKind('arena_drowned', t, false)).toBe(
        dungeonFloorKind('temple', t, false),
      );
    }
  });

  it('routes ignivar through the tile-kit weights', () => {
    const allowed = IGNIVAR_FLOOR_KIND_WEIGHTS.map(([name]) => name);
    for (const t of sweep()) {
      expect(allowed).toContain(dungeonFloorKind('ignivar', t, false));
    }
  });

  it('keeps the kept-castle floors free of dirt and grates', () => {
    for (const variant of ['lastkeep', 'dawnhold'] as const) {
      for (const t of sweep()) {
        const kind = dungeonFloorKind(variant, t, false);
        expect(kind, `${variant} t=${t}`).not.toMatch(/dirt|grate/);
      }
    }
  });

  it('distinguishes the delve mix from the crypt default', () => {
    const delve = sweep(200).map((t) => dungeonFloorKind('crypt', t, true));
    const crypt = sweep(200).map((t) => dungeonFloorKind('crypt', t, false));
    expect(delve).not.toEqual(crypt);
  });
});

describe('dungeonFloorQuadKind', () => {
  it('returns the fixed ignivar quad and aliases the drowned arena to the temple', () => {
    for (const t of sweep()) {
      expect(dungeonFloorQuadKind('ignivar', t)).toBe(IGNIVAR_FLOOR_QUAD_KIND);
      expect(dungeonFloorQuadKind('arena_drowned', t)).toBe(dungeonFloorQuadKind('temple', t));
    }
  });
});

describe('dungeonWallKind', () => {
  it('aliases the drowned arena to the temple walls', () => {
    for (const t of sweep()) {
      expect(dungeonWallKind('arena_drowned', t, false)).toBe(dungeonWallKind('temple', t, false));
    }
  });

  it('keeps the kept-castle walls free of cracked stone', () => {
    for (const variant of ['lastkeep', 'dawnhold'] as const) {
      for (const t of sweep()) {
        expect(dungeonWallKind(variant, t, false), `${variant} t=${t}`).not.toContain('cracked');
      }
    }
  });
});
