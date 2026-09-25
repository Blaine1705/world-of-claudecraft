import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MeshoptDecoder } from 'meshoptimizer';
import type * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildDeckWood } from '../src/render/deck_render';
import { activateGfxProfile, GFX, type GfxTier, getActiveGfxProfile } from '../src/render/gfx';
import {
  buildWickharborWharf,
  wickharborWharfInternalsForTest,
  wickharborWharfPrewarmParts,
} from '../src/render/wickharbor_wharf';
import {
  WICKHARBOR_WHARF_DECKS,
  WICKHARBOR_WHARF_ORIGIN,
  wharfLocal,
} from '../src/sim/content/wickharbor_wharf';
import { GALE_HARBOR_DECKS } from '../src/sim/gale_harbor';
import { terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// The Wickharbor ferry wharf painter (src/render/wickharbor_wharf.ts) over the shipped GLB:
// the model placed on the waterline at the wharf origin, what each graphics tier really draws
// (the walkable structure, solids and every lantern on all of them), and the prewarm parts the
// props warm-up links.

const internals = wickharborWharfInternalsForTest;
const GLB = path.join(__dirname, '..', 'public', internals.assetUrl.replace(/^\//, ''));
/** Triangles per part (tests/wickharbor_wharf_asset.test.ts pins the same). */
const LOW = 1800 + 2112 + 360 + 1508 + 1128 + 828;
const MEDIUM = LOW + 2652;
const HIGH = MEDIUM + 904;

let gltf: GLTF;
const originalProfile = getActiveGfxProfile();

function withTier(tier: GfxTier): void {
  activateGfxProfile({ ...originalProfile, settings: { ...GFX, effectsTier: tier } });
  internals.setLoadedGltfForTest(gltf);
}

function triangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return n;
}

function glowing(root: THREE.Object3D): number {
  const glows = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && (m.emissive?.getHex() ?? 0) !== 0) glows.add(m);
  });
  return glows.size;
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const bytes = readFileSync(GLB);
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  gltf = await new Promise<GLTF>((resolve, reject) => loader.parse(ab, '', resolve, reject));
});

afterEach(() => {
  activateGfxProfile(originalProfile);
});

afterAll(() => {
  internals.setLoadedGltfForTest(null);
});

describe('wickharbor wharf painter', () => {
  it('places the model on the waterline at the wharf origin', () => {
    withTier('high');
    const wharf = buildWickharborWharf();
    const model = wharf.getObjectByName('wickharborWharfModel');
    if (!model) throw new Error('no model');
    expect(model.position.x).toBe(WICKHARBOR_WHARF_ORIGIN.x);
    expect(model.position.y).toBe(WATER_LEVEL);
    expect(model.position.z).toBe(WICKHARBOR_WHARF_ORIGIN.z);
    expect(model.userData.assetUrl).toBe(internals.assetUrl);
  });

  it('draws the structure, solids and lanterns on low, adds the trim on medium, the dressing from high', () => {
    for (const [tier, want] of [
      ['low', LOW],
      ['medium', MEDIUM],
      ['high', HIGH],
      ['ultra', HIGH],
      ['insane', HIGH],
    ] as const) {
      withTier(tier);
      const model = buildWickharborWharf().getObjectByName('wickharborWharfModel');
      if (!model) throw new Error('no model');
      expect(triangles(model), tier).toBe(want);
      // the lanterns are landmarks: they glow on every tier
      expect(glowing(model), tier).toBe(1);
    }
  });

  it('hands the props prewarm every program it draws, on every tier and material family', () => {
    for (const tier of ['low', 'medium', 'high', 'ultra', 'insane'] as const) {
      for (const standardMaterials of [true, false]) {
        activateGfxProfile({
          ...originalProfile,
          settings: { ...GFX, effectsTier: tier, standardMaterials },
        });
        internals.setLoadedGltfForTest(gltf);
        const wharf = buildWickharborWharf();
        const drawn = new Set<THREE.Material>();
        wharf.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) drawn.add(mesh.material as THREE.Material);
        });
        const warmed = new Set(wickharborWharfPrewarmParts().map((p) => p.material));
        const label = `${tier} ${standardMaterials ? 'standard' : 'lambert'}`;
        expect(drawn.size, label).toBeGreaterThan(0);
        for (const m of drawn) expect(warmed.has(m), label).toBe(true);
      }
    }
  });

  it('builds nothing (and warns) when the model was never preloaded', () => {
    internals.setLoadedGltfForTest(null);
    const warn = console.warn;
    const said: unknown[] = [];
    console.warn = (...args: unknown[]) => said.push(args[0]);
    try {
      expect(buildWickharborWharf().children).toHaveLength(0);
    } finally {
      console.warn = warn;
    }
    expect(String(said[0])).toContain('wickharbor wharf skipped');
  });

  it('plants no boardwalk bollard through the flight standing on the boardwalk end', () => {
    const terrain = (x: number, z: number): number => terrainHeight(x, z, WORLD_SEED);
    const bollards = (keepOut?: typeof WICKHARBOR_WHARF_DECKS) =>
      buildDeckWood(GALE_HARBOR_DECKS, terrain, WATER_LEVEL, {
        bollards: true,
        bollardKeepOut: keepOut,
      })
        .posts.map((g) => {
          g.computeBoundingBox();
          const bb = g.boundingBox;
          if (!bb) return null;
          const dx = bb.max.x - bb.min.x;
          const dy = bb.max.y - bb.min.y;
          const dz = bb.max.z - bb.min.z;
          // a bollard is the 0.26 x 0.72 x 0.26 post (turned with its deck)
          if (Math.abs(dy - 0.72) > 1e-3 || Math.max(dx, dz) > 0.4) return null;
          return { x: (bb.min.x + bb.max.x) / 2, z: (bb.min.z + bb.max.z) / 2 };
        })
        .filter((p): p is { x: number; z: number } => p !== null);
    const flight = WICKHARBOR_WHARF_DECKS.find((d) => d.id === 'flight');
    if (!flight) throw new Error('flight');
    const near = (p: { x: number; z: number }) => {
      const l = wharfLocal(p.x, p.z);
      return (
        l.along > flight.frame.a0 - 0.6 &&
        l.along < flight.frame.a1 + 0.6 &&
        l.across > flight.frame.c0 - 0.6 &&
        l.across < flight.frame.c1 + 0.6
      );
    };
    // without the keep-out the boardwalk's south-end pair lands in the flight's footprint
    const all = bollards();
    expect(all.filter(near)).toHaveLength(2);
    // with it (what gale_features.ts passes) they are gone, and every other bollard stays
    const kept = bollards(WICKHARBOR_WHARF_DECKS);
    expect(kept.filter(near)).toEqual([]);
    expect(kept).toHaveLength(all.length - 2);
  });
});
