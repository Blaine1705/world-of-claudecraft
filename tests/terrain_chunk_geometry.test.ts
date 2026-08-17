import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A byte-identical pin on generated chunk geometry.
//
// The terrain generator is about to be split so its compute half (the row
// fills, which touch no WebGL) can run in a Worker instead of stealing main
// thread time. That move must not change a single vertex: same seed, same
// world. These hashes are the safety net for the whole sequence, including the
// later swap of THREE.Color palette math for plain floats, where an
// unreplicated sRGB-to-linear conversion would silently reshade the world
// without changing anything's shape.
//
// If one of these fails after a refactor, the refactor changed the world. That
// is the point. Re-mint the expected hash ONLY when you intend the visual
// change and have looked at it.

function mockEmptyAssetLoads(): void {
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn(() => new Promise(() => {})),
    loadHdr: vi.fn(() => new Promise(() => {})),
    loadTexture: vi.fn(() => new Promise(() => {})),
    releaseGltf: vi.fn(),
  }));
  const texture = (): THREE.DataTexture => {
    const data = new Uint8Array([255, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  };
  vi.doMock('../src/render/textures', () => ({
    groundDetailTexture: vi.fn(texture),
    groundSplatMaps: vi.fn(() => ({
      grass: texture(),
      dirt: texture(),
      rock: texture(),
      sand: texture(),
      mud: texture(),
      snow: texture(),
    })),
    macroNoiseTexture: vi.fn(texture),
    skyTexture: vi.fn(texture),
    waterNormalish: vi.fn(texture),
    waterNormalMaps: vi.fn(() => [texture(), texture()]),
  }));
}

/** Stable digest of one attribute's raw numbers, rounded to a float32-safe
 *  precision so an unrelated FP-associativity change does not cry wolf. */
function hashAttribute(values: ArrayLike<number>): string {
  const hash = createHash('sha256');
  const buf = new Float64Array(1);
  for (let i = 0; i < values.length; i++) {
    // round to 6 decimals: far tighter than any visible difference, loose
    // enough to survive a compiler reassociating a sum
    buf[0] = Math.round(values[i] * 1e6) / 1e6;
    hash.update(new Uint8Array(buf.buffer, 0, 8));
  }
  return hash.digest('hex').slice(0, 16);
}

describe('generated chunk geometry is stable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pins every vertex attribute of the Eastbrook chunks for seed 20061', async () => {
    vi.resetModules();
    mockEmptyAssetLoads();
    const { buildTerrain } = await import('../src/render/terrain');
    const { zoneAt } = await import('../src/sim/data');

    const terrain = buildTerrain(20061);
    const task = terrain.ensureZone(zoneAt(0, 0));
    await vi.runAllTimersAsync();
    await task;

    const meshes = terrain.group.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
    // 36 in-rect chunks plus the 12 merged super-chunk meshes over the 21 gap
    // cells nearest-rect ownership hands the Vale (the rects do not tile).
    expect(meshes.length).toBe(48);

    // Order the chunks by their own geometry bounds, so the pin does not depend
    // on build ORDER (which the worker move is expressly going to change).
    const keyed = meshes.map((mesh) => {
      const geo = mesh.geometry;
      geo.computeBoundingBox();
      const box = geo.boundingBox;
      if (!box) throw new Error('chunk geometry has no bounding box');
      return { geo, box, key: `${Math.round(box.min.x)}:${Math.round(box.min.z)}` };
    });
    keyed.sort((a, b) => a.key.localeCompare(b.key));

    const digestOf = (chunks: typeof keyed): string => {
      const digest = createHash('sha256');
      for (const { geo, key } of chunks) {
        digest.update(key);
        for (const name of ['position', 'normal', 'color', 'uv']) {
          const attr = geo.getAttribute(name);
          expect(attr, `${key} missing ${name}`).toBeTruthy();
          digest.update(`${name}:${hashAttribute(attr.array as unknown as ArrayLike<number>)}`);
        }
        const index = geo.getIndex();
        expect(index, `${key} missing index`).toBeTruthy();
        if (index)
          digest.update(`index:${hashAttribute(index.array as unknown as ArrayLike<number>)}`);
      }
      return digest.digest('hex').slice(0, 32);
    };

    // The in-rect chunks split from the gap fill by their bounds: every Vale
    // rect chunk starts at x >= -180 (the skirt overhangs by under a yard).
    const inRect = keyed.filter(({ box }) => box.min.x >= -181);
    const gapFill = keyed.filter(({ box }) => box.min.x < -181);
    expect(inRect.length).toBe(36);
    expect(gapFill.length).toBe(12);

    // Re-minted for the natural-relief heightfield plus the shared height
    // lattice in terrain_chunk_build.ts (vertex normals now difference the
    // lattice at the chunk's own spacing instead of a fixed 1.5yd stencil).
    // Both were intended, reviewed visual changes. Re-minted again for the
    // gather-node placement fix (herb_eastbrook_4 moved off the boarball
    // pitch to (6,-69) is the move these chunks see): an authored node pos
    // is a calm-anchor world fixture, so the pads around the old and new
    // spots reshape nearby vertices. Localization checked against the dense
    // height atlas (tests/terrain_height_parity.test.ts fixture, re-minted
    // in the same commit): the whole ten-node placement fix moves 146 of
    // its 140639 points, 0.1 percent, all inside the moved nodes' pad
    // footprints.
    // Re-minted again for the northwest coast spit carve in applyValeCoast
    // (src/sim/world.ts): the low beach shelf that aproned the grey cliff foot
    // is submerged so the bay water meets the cliff, an intended, looked-at
    // visual change. The carve only ever lowers and stays local: sampled on a
    // 0.5yd lattice over the vale and its gap cells it moves 8704 of 1589721
    // points, 0.5 percent, every one inside x -211.5..-132.5, z 116.5..145.5,
    // and nothing rises anywhere. Both digests move because that window
    // straddles the rect edge at x = -180.
    // Re-minted for the Copper Dig relocation to the dig headland (New
    // Eastbrook program, docs/design/eastbrook-revamp/master-plan.md): the
    // dig-headland coast lobe, the site's mode level terrain stamp, the
    // relocated cluster's own camp flatten, and the VACATED old camp's
    // flatten disc reverting all reshape the vale's southeast. Localization
    // checked on a 1yd lattice over x -220..60, z -180..20 at the production
    // seed: 20,704 of 56,481 points move, every one inside x -211..-18,
    // z -155..-3 (the old flatten disc union the new headland), the town
    // core reads byte-identical, and the largest move is 6.33 at the new
    // coast. An intended, looked-at world change, not drift.
    // Re-minted for the Sowfield demolition (the New Eastbrook program,
    // docs/design/eastbrook-revamp/master-plan.md): the stadium's flatten arm,
    // stand lift, and decoration exclusion left with the minigame, so the
    // southern basin returns to natural vale ground. Localization checked on a
    // 1yd lattice over x -100..80, z -180..20 at the production seed against
    // the pre-demolition tree: 7,656 of 36,381 points move, every one inside
    // x -63..41, z -148..-74 (the flatten rect plus its 8yd apron), the town
    // core reads byte-identical, and the largest move is 13.90 where the
    // stand tiers stood. An intended, looked-at world change, not drift.
    expect(digestOf(inRect)).toBe('09e45c7a643439c1bbedd54066ae1ea6');
    // The gap super-chunks take the same re-mint.
    expect(digestOf(gapFill)).toBe('4df7ccbb3d29fffbec733ce0e95e31f9');

    terrain.cancelStreaming();
  });
});
