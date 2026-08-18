// The boot twins for the ground-decor pools nothing else warms: the grass
// cards (both `cap:` program arms), the ground flowers and the night-accent
// glow caps.
//
// The measured defect (production capture 2026-08-18): the last three cold
// links before the entry curtain lifted were `grass-card|cap:NN.NNN-NN.NNN|`
// (565.8 ms), `grass-card|cap:none|` (66.0 ms) and the `night-accents`
// instanced glow (207.4 ms). The grass ring builds its chunk InstancedMeshes
// per frame as you walk, and the night group is created hidden while the boot
// compile unit collects the scene with traverseVisible, so no compile root ever
// reached any of them. The same grass pair had escaped into LIVE frames on the
// day before's capture, on both GPUs.
//
// The cap arms are enumerated from the tier table in gfx.ts and composed
// through the same `grassCardProgramCacheKey` the live material uses: a hand
// list here would go stale the day a tier changes its carpet radius, and the
// twin set would silently stop covering an arm the game still draws.

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type GrassCapCollapseBand,
  grassCapCollapseBand,
  grassCardCapKey,
  grassCardProgramCacheKey,
} from '../src/render/grass_cap_collapse_core';
import {
  buildGroundDecorPrewarmTwins,
  clearGroundDecorPrewarmDraws,
  groundDecorPrewarmDraws,
  groundDecorPrewarmKey,
  registerGroundDecorPrewarmDraw,
} from '../src/render/ground_decor_prewarm';
import { nightAccentGlowMaterial } from '../src/render/night_accents';
import { materialProgramSignature } from '../src/render/prewarm_policy';

const sourceOf = (path: string): string =>
  readFileSync(new URL(`../src/render/${path}`, import.meta.url), 'utf8');

/**
 * Every blade-carpet radius the tier table can hand `grassCapCollapseBand`,
 * read off gfx.ts rather than copied: the live grass material is built with
 * `grassCapCollapseBand(GFX.bladeCarpetRadius)`, so these ARE the cap arms the
 * game produces (the ios/lean arms land on 0, i.e. the `none` arm).
 */
function carpetRadiiFromSource(): number[] {
  const matches = sourceOf('gfx.ts').matchAll(/bladeCarpetRadius:\s*(\d+(?:\.\d+)?)/g);
  return [...new Set([...matches].map((m) => Number(m[1])))];
}

function capArmsFromSource(): { key: string; band: GrassCapCollapseBand | null }[] {
  const arms = new Map<string, GrassCapCollapseBand | null>();
  for (const radius of carpetRadiiFromSource()) {
    const band = grassCapCollapseBand(radius);
    arms.set(grassCardCapKey(band), band);
  }
  return [...arms].map(([key, band]) => ({ key, band }));
}

/** A grass-card material in the live shape: the tuft sheet, the cutout, the
 *  double-sided card, and the cache key composed through the live composer. */
function grassCardMaterial(band: GrassCapCollapseBand | null): THREE.Material {
  const mat = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(),
    alphaTest: 0.3,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const baseProgramKey = mat.customProgramCacheKey();
  const key = grassCardProgramCacheKey(band, baseProgramKey);
  mat.customProgramCacheKey = () => key;
  return mat;
}

/** The merged tuft card geometry's attribute shape (position + uv, normals
 *  deleted, the cap tag on the arms that collapse). */
function cardGeometry(withCapAttribute: boolean): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.deleteAttribute('normal');
  if (withCapAttribute) {
    const count = geo.getAttribute('position').count;
    geo.setAttribute('aCap', new THREE.Uint8BufferAttribute(new Uint8Array(count), 1));
  }
  return geo;
}

beforeEach(() => {
  clearGroundDecorPrewarmDraws();
});

describe('the grass-card cap arms', () => {
  it('enumerates more than one arm from the tier table', () => {
    // Vacuity floor: an empty or single-arm enumeration would make every
    // coverage assertion below pass over nothing.
    const arms = capArmsFromSource();
    expect(carpetRadiiFromSource().length).toBeGreaterThanOrEqual(3);
    expect(arms.length).toBeGreaterThanOrEqual(2);
    expect(arms.map((arm) => arm.key)).toContain('none');
    expect(arms.filter((arm) => arm.key !== 'none').length).toBeGreaterThanOrEqual(1);
  });

  it('gets one twin per arm, wearing the live material and geometry', () => {
    const arms = capArmsFromSource();
    const live = arms.map((arm) => ({
      arm,
      geometry: cardGeometry(arm.band !== null),
      material: grassCardMaterial(arm.band),
    }));
    for (const entry of live) {
      registerGroundDecorPrewarmDraw({
        geometry: entry.geometry,
        material: entry.material,
        instanceColor: true,
      });
    }

    const twins = buildGroundDecorPrewarmTwins();
    expect(twins).toHaveLength(arms.length);
    for (const [index, entry] of live.entries()) {
      const twin = twins[index];
      // The twin IS the live program: same material, same geometry, an
      // InstancedMesh with an instance colour like the live chunk mesh.
      expect(materialProgramSignature(twin.material as THREE.Material)).toBe(
        materialProgramSignature(entry.material),
      );
      expect(twin.material).toBe(entry.material);
      expect(twin.geometry).toBe(entry.geometry);
      expect(twin.isInstancedMesh).toBe(true);
      expect(twin.instanceColor).not.toBeNull();
      expect(twin.visible).toBe(false);
      expect(twin.castShadow).toBe(false);
      expect(twin.frustumCulled).toBe(false);
    }
  });

  it('never folds two cap arms onto one twin', () => {
    const arms = capArmsFromSource();
    const keys = new Set(
      arms.map((arm) =>
        groundDecorPrewarmKey({
          geometry: cardGeometry(arm.band !== null),
          material: grassCardMaterial(arm.band),
          instanceColor: true,
        }),
      ),
    );
    expect(keys.size).toBe(arms.length);
  });

  it('folds the flower palettes, which share one program, onto one twin', () => {
    // The ring builds one material per biome palette (ten of them) and they
    // differ only in their texture image, which three never keys a program on.
    const geometry = cardGeometry(false);
    for (let palette = 0; palette < 10; palette++) {
      registerGroundDecorPrewarmDraw({
        geometry,
        material: grassCardMaterial(null),
        instanceColor: true,
      });
    }
    expect(groundDecorPrewarmDraws()).toHaveLength(1);
    expect(buildGroundDecorPrewarmTwins()).toHaveLength(1);
  });

  it('separates the instance-colour arm, which three does key on', () => {
    const geometry = cardGeometry(false);
    const material = grassCardMaterial(null);
    registerGroundDecorPrewarmDraw({ geometry, material, instanceColor: true });
    registerGroundDecorPrewarmDraw({ geometry, material, instanceColor: false });
    expect(buildGroundDecorPrewarmTwins()).toHaveLength(2);
  });
});

describe('the night-accent glow twin', () => {
  it('links the same program the live caps draw with', () => {
    const material = nightAccentGlowMaterial();
    const geometry = new THREE.SphereGeometry(0.19, 7, 4);
    registerGroundDecorPrewarmDraw({ geometry, material, instanceColor: true });
    const [twin] = buildGroundDecorPrewarmTwins();
    expect(materialProgramSignature(twin.material as THREE.Material)).toBe(
      materialProgramSignature(nightAccentGlowMaterial()),
    );
    // The live cap mesh is instanced AND per-instance tinted; a twin without
    // the instance colour links a different program (the capture's key delta
    // was exactly `+instancing +instancingColor +vertexColors`).
    expect(twin.instanceColor).not.toBeNull();
    expect((twin.material as THREE.MeshBasicMaterial).vertexColors).toBe(true);
  });

  it('registers the live cap material and geometry, not a rebuilt pair', () => {
    const source = sourceOf('night_accents.ts');
    expect(source).toContain('const capMat = nightAccentGlowMaterial();');
    expect(source).toContain('const caps = new THREE.InstancedMesh(capGeometry(), capMat,');
    // The registered pair IS the live pair: the caps mesh's own geometry and
    // the material it was built with, never a rebuilt lookalike.
    expect(source).toContain('registerGroundDecorPrewarmDraw({\n    geometry: caps.geometry,');
    expect(source).toContain('material: capMat,');
    expect(source).toContain('instanceColor: true,');
  });
});

describe('the prewarm manifest wiring (source pins)', () => {
  const foliage = sourceOf('foliage.ts');

  it('publishes the grass card and the flower palettes at ring build time', () => {
    expect(foliage).toContain(
      'registerGroundDecorPrewarmDraw({ geometry: geo, material: mat, instanceColor: true });',
    );
    expect(foliage).toContain(
      'registerGroundDecorPrewarmDraw({ geometry: flowerGeo, material: fmMat, instanceColor: true });',
    );
    // Composed through the core, so the arms this test enumerates are the ones
    // the live material really keys on.
    expect(foliage).toContain('grassCardProgramCacheKey(capBand, baseProgramKey)');
  });

  it('stages the twins inside the foliage material prewarm group', () => {
    expect(foliage).toContain(
      'for (const twin of buildGroundDecorPrewarmTwins()) group.add(twin);',
    );
  });

  it('rides the existing foliage.materials manifest entry, not a new lane', () => {
    const renderer = sourceOf('renderer.ts');
    const start = renderer.indexOf("        id: 'foliage.materials',");
    expect(start).toBeGreaterThan(0);
    // Up to the next MANIFEST entry (the eight-space id), not the next id at
    // all: this entry's resume units carry ids of their own.
    const entry = renderer.slice(start, renderer.indexOf("\n        id: '", start + 30));
    // Both arms of the entry mint the group: the entry run AND the resume
    // units a deadline drop falls back to.
    expect(entry.match(/buildFoliageMaterialPrewarmGroup\(\)/g)?.length).toBe(2);
    expect(renderer).not.toContain("id: 'ground-decor");
  });
});
