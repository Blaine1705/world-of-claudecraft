import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  IMPOSTOR_ATLAS_MAX,
  IMPOSTOR_JITTER_GLSL,
  IMPOSTOR_MIN_BAND,
  IMPOSTOR_SWAP_FADE,
  type ImpostorArchetypeSpec,
  packImpostorAtlas,
  SPRITE_MIN_FOG_BLEND,
  SPRITE_SWAP_MIN,
  spriteSwapDistance,
  spriteSwapFloor,
} from '../src/render/foliage_impostor_core';
import {
  fogBlendAt,
  foliageDistanceScale,
  foliageFogLimit,
  LOD_HIGH,
} from '../src/render/foliage_lod';

function spec(over: Partial<ImpostorArchetypeSpec> = {}): ImpostorArchetypeSpec {
  return {
    id: 'pine:0',
    worldWidth: 6,
    worldHeight: 9,
    worldBaseY: -0.2,
    views: 12,
    cellPx: 128,
    ...over,
  };
}

// The shipped kit's shape at the default tier: 15 tree variants at 128px x 12
// views, 8 rock colorway variants and 2 bush kinds at 64px. The packer must
// keep this inside the 4096 hardware floor with room to grow.
function shippedSet(): ImpostorArchetypeSpec[] {
  const specs: ImpostorArchetypeSpec[] = [];
  for (let i = 0; i < 15; i++) specs.push(spec({ id: `tree:${i}` }));
  for (let i = 0; i < 8; i++) specs.push(spec({ id: `rock:${i}`, views: 6, cellPx: 64 }));
  for (let i = 0; i < 2; i++) specs.push(spec({ id: `dress:${i}`, views: 8, cellPx: 64 }));
  return specs;
}

describe('impostor atlas packing', () => {
  it('fits the shipped set inside the hardware floor and stays power of two', () => {
    const placement = packImpostorAtlas(shippedSet(), IMPOSTOR_ATLAS_MAX);
    expect(placement.size).toBeLessThanOrEqual(IMPOSTOR_ATLAS_MAX);
    expect(Math.log2(placement.size) % 1).toBe(0);
  });

  it('gives every archetype a full row of non-overlapping view cells in bounds', () => {
    const specs = shippedSet();
    const placement = packImpostorAtlas(specs, IMPOSTOR_ATLAS_MAX);
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    specs.forEach((s, i) => {
      const rect = placement.origin[i];
      expect(rect, s.id).toBeDefined();
      const cellW = rect.u1 - rect.u0;
      const cellH = rect.v1 - rect.v0;
      // square cells at the requested pixel size
      expect(cellW * placement.size).toBeCloseTo(s.cellPx, 6);
      expect(cellH * placement.size).toBeCloseTo(s.cellPx, 6);
      // the whole view strip stays inside the atlas
      const stripEnd = rect.u0 + s.views * cellW;
      expect(stripEnd, `${s.id} strip`).toBeLessThanOrEqual(1 + 1e-9);
      expect(rect.v1).toBeLessThanOrEqual(1 + 1e-9);
      boxes.push({
        x0: rect.u0,
        y0: rect.v0,
        x1: stripEnd,
        y1: rect.v1,
      });
    });
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a];
        const B = boxes[b];
        const overlaps =
          A.x0 < B.x1 - 1e-9 && B.x0 < A.x1 - 1e-9 && A.y0 < B.y1 - 1e-9 && B.y0 < A.y1 - 1e-9;
        expect(overlaps, `${specs[a].id} vs ${specs[b].id}`).toBe(false);
      }
    }
  });

  it('is deterministic in input order', () => {
    const a = packImpostorAtlas(shippedSet(), IMPOSTOR_ATLAS_MAX);
    const b = packImpostorAtlas(shippedSet(), IMPOSTOR_ATLAS_MAX);
    expect(a).toEqual(b);
  });

  it('throws loudly when a grown kit cannot fit, instead of cropping', () => {
    const oversized = Array.from({ length: 80 }, (_, i) => spec({ id: `tree:${i}` }));
    expect(() => packImpostorAtlas(oversized, 2048)).toThrow(/cannot fit/);
  });
});

describe('sprite swap law', () => {
  const scaleAt = (q: number) => foliageDistanceScale(q, false);
  const base = LOD_HIGH.treeDetailFar;

  it('follows the budget in the open realms: no fog floor pushes it out', () => {
    // Vale: near 55, far 700. The old cone law parked the swap at ~506u to
    // hide the cones; the sprite law hands off at the budgeted radius and the
    // sprites (legible in clear air) carry the rest.
    const fogLimit = foliageFogLimit(700, 1);
    expect(spriteSwapDistance(base, scaleAt(1), 55, 700, fogLimit)).toBe(300);
    expect(spriteSwapDistance(base, scaleAt(0), 55, 700, fogLimit)).toBeCloseTo(216, 9);
  });

  it('never hands off closer than the clear-air floor', () => {
    // A pathological budget cannot put a flat sprite 90u from the camera in
    // clear air; the floor holds at SPRITE_SWAP_MIN there.
    const fogLimit = foliageFogLimit(700, 1);
    expect(spriteSwapDistance(base, 0.3, 55, 700, fogLimit)).toBe(SPRITE_SWAP_MIN);
  });

  it('the floor yields to the murk: heavy fog may swap arbitrarily close', () => {
    // Marsh: near 75, far 165. At the 50 percent blend line (120u) the
    // parallax flatness the floor exists for is already mush.
    expect(spriteSwapFloor(75, 165)).toBe(75 + SPRITE_MIN_FOG_BLEND * 90);
    const fogLimit = foliageFogLimit(165, 1);
    const swap = spriteSwapDistance(base, scaleAt(1), 75, 165, fogLimit);
    expect(swap).toBeLessThan(fogLimit); // a sprite band exists
    expect(fogBlendAt(swap, 75, 165)).toBeGreaterThanOrEqual(SPRITE_MIN_FOG_BLEND - 1e-9);
  });

  it('short-fog realms keep a guaranteed sprite band before the cull', () => {
    for (const [near, far] of [
      [75, 165], // marsh
      [48, 125], // cave
      [85, 265], // haunt
    ] as const) {
      for (const q of [0, 0.5, 1]) {
        const fogLimit = foliageFogLimit(far, q);
        const swap = spriteSwapDistance(base, scaleAt(q), near, far, fogLimit);
        expect(swap, `near ${near} far ${far} q ${q}`).toBeLessThan(fogLimit);
        expect(fogLimit - swap).toBeGreaterThan(0);
        // the band never grows past what the floor law leaves available
        expect(fogLimit - swap).toBeLessThanOrEqual(
          Math.max(IMPOSTOR_MIN_BAND, fogLimit - spriteSwapFloor(near, far)) + 1e-9,
        );
      }
    }
  });

  it('a residency fog wall parks the handoff on the wall: no sprites in the lap', () => {
    // The live clamp can pin the cull at 45u while a zone builds; the final
    // clamp keeps real trees to the wall rather than swapping at the floor.
    const liveCull = foliageFogLimit(45, 1);
    expect(spriteSwapDistance(base, scaleAt(1), 175, 628, liveCull)).toBe(liveCull);
  });

  it('a malformed near-past-far pair still cannot pass the cull', () => {
    expect(spriteSwapDistance(base, 1, 175, 45, foliageFogLimit(45, 1))).toBe(
      foliageFogLimit(45, 1),
    );
  });

  it('never exceeds the budgeted radius, so near-fill needs no law of its own', () => {
    // placeSpecies folds the near-fill trees into the shared tree sprites.
    // That is sound because the swap can never pass the near-fill authored
    // cap: swap <= base * scale, and the tables author the detail base under
    // the near-fill cap (both scale by the same governor lever).
    expect(LOD_HIGH.treeDetailFar).toBeLessThan(LOD_HIGH.treeFillFar);
    for (const q of [0, 0.35, 0.72, 1]) {
      for (const [near, far] of [
        [55, 700],
        [75, 165],
        [175, 628],
        [48, 125],
      ] as const) {
        const swap = spriteSwapDistance(base, scaleAt(q), near, far, foliageFogLimit(far, q));
        expect(swap).toBeLessThanOrEqual(base * scaleAt(q) + 1e-9);
      }
    }
  });
});

describe('shared GLSL and constants', () => {
  it('both shader sides source the jitter from this module, byte for byte', () => {
    // The real side (foliage_collapse.ts) ends each instance at
    // swap - fade * jitter; the sprite side (foliage_impostor.ts) begins it
    // there. They agree only because both interpolate IMPOSTOR_JITTER_GLSL.
    for (const file of ['../src/render/foliage_collapse.ts', '../src/render/foliage_impostor.ts']) {
      const src = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(src, file).toContain('IMPOSTOR_JITTER_GLSL');
    }
    // the hash reads the shared name both vertex shaders declare
    expect(IMPOSTOR_JITTER_GLSL).toContain('collapseOrigin');
  });

  it('the fade span stays small against every category swap', () => {
    // The jittered handoff band must sit inside the shortest realistic swap
    // (the murk realms bottom out near the 50 percent blend line).
    expect(IMPOSTOR_SWAP_FADE).toBeGreaterThan(0);
    expect(IMPOSTOR_SWAP_FADE).toBeLessThan(SPRITE_SWAP_MIN / 4);
  });
});
