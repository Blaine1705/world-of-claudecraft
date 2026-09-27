import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MeshoptDecoder } from 'meshoptimizer';
import type * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activateGfxProfile, GFX, type GfxTier, getActiveGfxProfile } from '../src/render/gfx';
import {
  buildMirefenTavern,
  MIREFEN_TAVERN_LIGHTS,
  mirefenTavernInternalsForTest,
  mirefenTavernLights,
  mirefenTavernPrewarmParts,
  mirefenTavernShellMeshes,
  updateMirefenTavernShell,
} from '../src/render/mirefen_tavern';
import {
  mirefenTavernParts,
  TAVERN_CRITICAL_PARTS,
  TAVERN_EYE_OVER_FEET,
  TAVERN_OPTIONAL_PARTS,
  TAVERN_SHELL_PARTS,
  TAVERN_TRIM_PARTS,
} from '../src/render/mirefen_tavern_core';
import { ditherFadeUniform, setDitherFadeEnabledForTest } from '../src/render/occluder_dither_fade';
import { OCCLUDER_FADE_ALPHA } from '../src/render/occluder_fade_core';
import {
  TAVERN_FLOOR_Y,
  TAVERN_LANTERNS,
  TAVERN_ORIGIN,
  TAVERN_YAW,
  tavernToWorld,
} from '../src/sim/content/mirefen_tavern';
import { tavernInsideLocal } from '../src/sim/mirefen_tavern';

// The Mirefen tavern painter (src/render/mirefen_tavern.ts) over the shipped GLB: the model
// placed on the ground floor at the tavern's origin and turned to the road, what each
// graphics tier really draws (the whole walkable building, its furniture and every light on
// all of them), the prewarm parts the props warm-up links, the per-part shell materials,
// the camera cutaway (cut indoors, ghost outdoors, eased back, culled past the fog), and
// the firelight handed to the fire-light budget.

const internals = mirefenTavernInternalsForTest;
const GLB = path.join(__dirname, '..', 'public', internals.assetUrl.replace(/^\//, ''));

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

function partTriangles(names: readonly string[]): number {
  let n = 0;
  for (const name of names) {
    const node = gltf.scene.getObjectByName(name);
    if (node) n += triangles(node);
  }
  return n;
}

/** The eye over a player standing at local (lx, lz) with feet at local height ly. */
function eye(lx: number, lz: number, ly = 0) {
  const w = tavernToWorld(lx, lz);
  return { x: w.x, y: TAVERN_FLOOR_Y + ly + TAVERN_EYE_OVER_FEET, z: w.z };
}
/** A point at local (lx, ly, lz), in the world. */
function at(lx: number, ly: number, lz: number) {
  const w = tavernToWorld(lx, lz);
  return { x: w.x, y: TAVERN_FLOOR_Y + ly, z: w.z };
}
function step(e: ReturnType<typeof eye>, c: ReturnType<typeof at>, frames = 1): void {
  for (let i = 0; i < frames; i++) updateMirefenTavernShell(c.x, c.y, c.z, e.x, e.y, e.z, 1 / 60);
}
function part(name: string) {
  const r = internals.shell().find((x) => x.part === name);
  if (!r) throw new Error(name);
  return r;
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

beforeEach(() => setDitherFadeEnabledForTest(false));

afterEach(() => {
  setDitherFadeEnabledForTest(null);
  activateGfxProfile(originalProfile);
});

afterAll(() => {
  internals.setLoadedGltfForTest(null);
});

describe('mirefen tavern painter', () => {
  it('places the model on the ground floor at the origin, its door toward the road', () => {
    withTier('high');
    const model = buildMirefenTavern().getObjectByName('mirefenTavernModel');
    if (!model) throw new Error('model');
    expect(model.position.x).toBe(TAVERN_ORIGIN.x);
    expect(model.position.y).toBe(TAVERN_FLOOR_Y);
    expect(model.position.z).toBe(TAVERN_ORIGIN.z);
    expect(model.rotation.y).toBe(TAVERN_YAW);
  });

  it('draws the whole building on low, adds the trim on medium and the clutter from high', () => {
    const low = partTriangles(TAVERN_CRITICAL_PARTS);
    const trim = partTriangles(TAVERN_TRIM_PARTS);
    const clutter = partTriangles(TAVERN_OPTIONAL_PARTS);
    expect(trim).toBeGreaterThan(0);
    expect(clutter).toBeGreaterThan(0);
    for (const [tier, want] of [
      ['low', low],
      ['medium', low + trim],
      ['high', low + trim + clutter],
      ['ultra', low + trim + clutter],
    ] as const) {
      withTier(tier);
      expect(triangles(buildMirefenTavern()), tier).toBe(want);
    }
    // every shell part, the frame, the furniture and the lights on every tier
    for (const name of [
      ...TAVERN_SHELL_PARTS,
      'TavernFrame',
      'TavernFurnishings',
      'TavernLights',
    ]) {
      expect(mirefenTavernParts('low')).toContain(name);
    }
  });

  it('hands the props prewarm every program it draws', () => {
    withTier('high');
    const tavern = buildMirefenTavern();
    const drawn = new Set<THREE.Material>();
    tavern.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) drawn.add(mesh.material as THREE.Material);
    });
    const warmed = new Set(mirefenTavernPrewarmParts().map((p) => p.material));
    for (const m of drawn) expect(warmed.has(m)).toBe(true);
  });

  it('draws each shell part with its own material clones, never the shared ones', () => {
    withTier('high');
    const tavern = buildMirefenTavern();
    const shell = new Set<THREE.Material>(
      mirefenTavernShellMeshes().map((m) => m.material as THREE.Material),
    );
    const shellNames = new Set<string>(TAVERN_SHELL_PARTS);
    tavern.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || shellNames.has(mesh.name)) return;
      expect(shell.has(mesh.material as THREE.Material)).toBe(false);
    });
    const byPart = new Map<string, Set<THREE.Material>>();
    for (const m of mirefenTavernShellMeshes()) {
      const set = byPart.get(m.name) ?? new Set<THREE.Material>();
      set.add(m.material as THREE.Material);
      byPart.set(m.name, set);
    }
    expect([...byPart.keys()].sort()).toEqual([...TAVERN_SHELL_PARTS].sort());
    const all = [...byPart.values()].flatMap((set) => [...set]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('cuts the front wall away for a player inside with the camera out front, keeping its shadow', () => {
    withTier('high');
    buildMirefenTavern();
    const e = eye(0, 8);
    step(e, at(0, 5, 18));
    const front = part('HallWallFront');
    expect(front.alpha).toBe(0);
    for (const m of front.meshes) {
      const mat = m.material as THREE.Material;
      expect(mat.opacity).toBe(0);
      expect(mat.depthWrite).toBe(false);
      expect(mat.colorWrite).toBe(false);
      expect(m.castShadow).toBe(true);
    }
    for (const name of ['HallWallBack', 'HallWallLeft', 'HallWallRight', 'HallRoof']) {
      expect(part(name).alpha, name).toBe(1);
    }
    // the camera comes back into the room: the wall eases back to its authored state
    step(e, at(0, 4, 11), 240);
    expect(front.alpha).toBe(1);
    for (const m of front.meshes) {
      const mat = m.material as THREE.Material;
      expect(mat.transparent).toBe(false);
      expect(mat.depthWrite).toBe(true);
      expect(mat.colorWrite).toBe(true);
    }
  });

  it('under the dithered fade, a wall cut away writes depth again once it is back', () => {
    setDitherFadeEnabledForTest(true);
    withTier('high');
    buildMirefenTavern();
    const e = eye(0, 8);
    step(e, at(0, 5, 18));
    const front = part('HallWallFront');
    expect(front.alpha).toBe(0);
    for (const m of front.meshes) {
      const mat = m.material as THREE.Material;
      expect(ditherFadeUniform(mat)?.value).toBe(0);
      expect(mat.depthWrite).toBe(false);
    }
    step(e, at(0, 4, 11), 240);
    expect(front.alpha).toBe(1);
    for (const m of front.meshes) {
      const mat = m.material as THREE.Material;
      expect(ditherFadeUniform(mat)?.value).toBe(1);
      expect(mat.depthWrite).toBe(true);
      expect(mat.colorWrite).toBe(true);
    }
  });

  it('spares the shadow pass for the parts inside the building', () => {
    withTier('high');
    buildMirefenTavern();
    for (const m of mirefenTavernShellMeshes()) {
      expect(m.castShadow, m.name).toBe(m.name !== 'Gallery' && m.name !== 'RoomWalls');
    }
  });

  it('ghosts only the parts that hide a player outside, and eases them back', () => {
    withTier('high');
    buildMirefenTavern();
    // behind the tavern's left wall, the camera out over the hall to the right
    const e = eye(-19, 0);
    step(e, at(22, 10, 0));
    expect(part('HallWallLeft').alpha).toBe(OCCLUDER_FADE_ALPHA);
    expect(part('HallWallRight').alpha).toBe(OCCLUDER_FADE_ALPHA);
    expect(part('WingWallBack').alpha).toBe(1);
    // the camera swings round in front of the player: nothing fades
    step(e, at(-30, 8, 0), 240);
    for (const r of internals.shell()) expect(r.alpha, r.part).toBe(1);
  });

  it('stops drawing the shell past the fog', () => {
    withTier('high');
    const shell = buildMirefenTavern().getObjectByName('mirefenTavernShell');
    if (!shell) throw new Error('shell');
    const far = tavernToWorld(0, 400);
    updateMirefenTavernShell(far.x, 20, far.z, 0, 20, 0, 1 / 60, false, 120);
    expect(shell.visible).toBe(false);
    const near = tavernToWorld(0, 60);
    updateMirefenTavernShell(near.x, 20, near.z, 0, 20, 0, 1 / 60, false, 120);
    expect(shell.visible).toBe(true);
  });

  it('lights the hearth, the wall fire, the chandelier and the lit lanterns, for the budget', () => {
    withTier('high');
    buildMirefenTavern();
    const lights = mirefenTavernLights();
    expect(lights).toHaveLength(3 + TAVERN_LANTERNS.filter((l) => l.lit).length);
    expect(lights[0].intensity).toBe(MIREFEN_TAVERN_LIGHTS.hearth.intensity);
    for (const l of lights) {
      expect(l.isPointLight).toBe(true);
      expect(l.userData.baseIntensity).toBe(l.intensity);
      // every light inside the walls, over the floor, under the roof
      const lx = TAVERN_ORIGIN.z - l.position.z;
      const lz = l.position.x - TAVERN_ORIGIN.x;
      expect(tavernInsideLocal(lx, lz), l.name).toBe(true);
      expect(l.position.y).toBeGreaterThan(TAVERN_FLOOR_Y);
      expect(l.position.y).toBeLessThan(TAVERN_FLOOR_Y + 11);
    }
  });
});
