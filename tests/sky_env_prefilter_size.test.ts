import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// One cubeUV height per session. PMREMGenerator sizes its prefiltered target
// from the SOURCE width (_fromTexture: _setSize(image.width / 4) for an
// equirect), and envMapCubeUVHeight is a program-cache-key input three
// re-reads with no material.needsUpdate anywhere, so two differently sized env
// sources make a biome crossing relink every lit material in the scene. The
// PMREM itself needs a GL context, so the invariant is pinned one level up, on
// the widths ensureEnvironmentBiome feeds it, plus a source pin that it still
// derives its target from exactly that texture.
const ENV_WIDTH = 512;
const DOME_WIDTH = 2048;

function hdrTexture(width: number): THREE.DataTexture {
  const height = width / 2;
  const texture = new THREE.DataTexture(
    new Uint16Array(width * height * 4).fill(0x3c00),
    width,
    height,
  );
  texture.type = THREE.HalfFloatType;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

const loadHdr = vi.fn(async (url: string, opts?: { maxWidth?: number }) =>
  hdrTexture(opts?.maxWidth ?? (url.includes('_1k.hdr') ? 1024 : DOME_WIDTH)),
);
const releaseHdr = vi.fn((_url: string, _opts?: { maxWidth?: number }) => undefined);

describe('the env PMREM source width', () => {
  beforeEach(() => {
    vi.resetModules();
    loadHdr.mockClear();
    releaseHdr.mockClear();
    vi.doMock('../src/render/gfx', () => ({ GFX: { standardMaterials: true } }));
    vi.doMock('../src/render/assets/loader', () => ({
      loadGltf: vi.fn(),
      loadHdr,
      loadTexture: vi.fn(async () => new THREE.Texture()),
      releaseGltf: vi.fn(),
      releaseHdr,
      releaseTexture: vi.fn(),
    }));
    vi.doMock('../src/render/textures', () => ({
      cloudTexture: vi.fn(() => new THREE.Texture()),
      skyTexture: vi.fn(() => new THREE.Texture()),
    }));
  });

  it('is one width for every biome, including one whose env arm never landed', async () => {
    const sky = await import('../src/render/sky');
    const biomes = sky.skyBiomesAt(0, 0);
    const stranded = biomes[0];
    // The dome fetches settle; the stranded biome's env fetch never does, which
    // is also what an eviction under memory pressure leaves behind.
    loadHdr.mockImplementation((url, opts) => {
      if (opts?.maxWidth && url.includes(stranded)) return new Promise<THREE.DataTexture>(() => {});
      return Promise.resolve(hdrTexture(opts?.maxWidth ?? DOME_WIDTH));
    });

    void sky.ensureSkyBiomeAssets(biomes);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const view = sky.buildSky(false, new THREE.Vector3(90, 140, 50));

    const widths = new Set<number>();
    for (const biome of biomes) {
      const source = view.envTexture(biome);
      expect(source).not.toBeNull();
      widths.add((source as THREE.DataTexture).image.width);
    }
    expect([...widths]).toEqual([ENV_WIDTH]);
    // The fallback is this module's own resample, never the live dome texture.
    expect(view.envTexture(stranded)).not.toBe(view.domeTexture(stranded));
    // Memoized, so the renderer's per-source PMREM cache builds one target.
    expect(view.envTexture(stranded)).toBe(view.envTexture(stranded));
  });

  it('releases the resampled fallback with its biome', async () => {
    const sky = await import('../src/render/sky');
    // The env arm fails outright: the dome lands, the 512 source never does.
    loadHdr.mockImplementation((_url, opts) =>
      opts?.maxWidth
        ? Promise.reject(new Error('env hdr fetch failed'))
        : Promise.resolve(hdrTexture(DOME_WIDTH)),
    );
    await sky.ensureSkyBiomeAssets(['vale', 'marsh']).catch(() => undefined);
    const view = sky.buildSky(false, new THREE.Vector3(90, 140, 50), 0, 40);
    const fallback = view.envTexture('marsh');
    if (!fallback) throw new Error('expected a resampled marsh env fallback');
    const disposed = vi.spyOn(fallback, 'dispose');

    expect(sky.releaseSkyBiomeAssets(['marsh'])).toEqual(['marsh']);

    expect(disposed).toHaveBeenCalled();
  });

  it('still prefilters exactly the texture envTexture hands it', () => {
    const source = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const start = source.indexOf('private ensureEnvironmentBiome(');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n  }', start));
    expect(body).toContain('const source = this.skyView.envTexture(biome);');
    expect(body).toContain('this.pmremGenerator.fromEquirectangular(source)');
  });
});
