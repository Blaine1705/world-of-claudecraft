import { readFileSync } from 'node:fs';
import path from 'node:path';
import { MeshoptDecoder } from 'meshoptimizer';
import type * as THREE from 'three';
import { PerspectiveCamera, Vector3 } from 'three';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activateGfxProfile, GFX, type GfxTier, getActiveGfxProfile } from '../src/render/gfx';
import {
  activeCameraInterior,
  clampChaseCameraToInterior,
  interiorCameraInternalsForTest,
  interiorLensInAir,
} from '../src/render/interior_camera';
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
  TAVERN_TOWER,
  TAVERN_TOWER_SCONCES,
  TAVERN_UPPER,
  TAVERN_YAW,
  tavernToWorld,
} from '../src/sim/content/mirefen_tavern';
import { tavernInsideLocal } from '../src/sim/mirefen_tavern';

// The Mirefen tavern painter (src/render/mirefen_tavern.ts) over the shipped GLB: the model
// placed on the ground floor at the tavern's origin and turned to the road, what each
// graphics tier really draws (the whole walkable building, its furniture and every light on
// all of them), the prewarm parts the props warm-up links, the per-part shell materials,
// the camera cutaway (indoors the outer shell holds and only the gallery and partitions cut,
// outdoors the shell ghosts, eased back, culled past the fog), the indoor camera interior it
// registers, and
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
  interiorCameraInternalsForTest.reset();
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

  it('never opens the outer shell for a player inside, even with a camera out front', () => {
    withTier('high');
    buildMirefenTavern();
    // (the indoor camera clamp keeps the real camera in the room; the shell holds regardless)
    step(eye(0, 8), at(0, 5, 18), 30);
    for (const r of internals.shell()) expect(r.alpha, r.part).toBe(1);
  });

  it("follows the indoor camera clamp's verdict once it runs, never the lagged look point", () => {
    withTier('high');
    buildMirefenTavern();
    const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 950);
    // the avatar already out on the porch while the lagged look point is still inside
    const porch = at(0, 0, 15.5);
    cam.position.set(porch.x, porch.y + 5, porch.z);
    clampChaseCameraToInterior(
      cam,
      new Vector3(porch.x, porch.y + 2, porch.z),
      new Vector3(porch.x, porch.y, porch.z),
      1 / 60,
      true,
    );
    step(eye(0, 12.8), at(0, 5, 18), 240);
    // outdoors: the front wall between the camera and the player ghosts (it would stay
    // whole if the shell still took the look point for indoors)
    expect(part('HallWallFront').alpha).toBe(OCCLUDER_FADE_ALPHA);
    // back inside by the clamp's verdict: the outer shell holds
    const hall = at(0, 0, 8);
    clampChaseCameraToInterior(
      cam,
      new Vector3(hall.x, hall.y + 2, hall.z),
      new Vector3(hall.x, hall.y, hall.z),
      1 / 60,
      true,
    );
    step(eye(0, 12.8), at(0, 5, 18), 240);
    expect(part('HallWallFront').alpha).toBe(1);
  });

  it('ghosts the front wall while the lens still follows through the doorway, then holds it', () => {
    withTier('high');
    buildMirefenTavern();
    const cam = new PerspectiveCamera(70, 16 / 9, 0.2, 950);
    // just over the sill walking in, the camera still out behind on the road: the eye is
    // indoors, but the clamp blends in over the first strides, so the lens is not yet in
    // the air and the shell cuts away on the sight line as it does for a camera outside
    const sill = at(0, 0, 12.8);
    const road = at(0, 5.8, 24);
    cam.position.set(road.x, road.y, road.z);
    clampChaseCameraToInterior(
      cam,
      new Vector3(sill.x, sill.y + 2, sill.z),
      new Vector3(sill.x, sill.y, sill.z),
      1 / 60,
      false,
    );
    expect(activeCameraInterior()?.id).toBe('mirefen_tavern');
    expect(interiorLensInAir()).toBe(false);
    const lens = cam.position.clone();
    step(eye(0, 12.8), lens, 240);
    expect(part('HallWallFront').alpha).toBe(OCCLUDER_FADE_ALPHA);
    // walked a few strides in (a walk, never a teleport), the lens has settled in the air:
    // the outer shell holds again
    let hall = sill;
    for (let lz = 12.8; lz > 6; lz -= 0.12) {
      hall = at(0, 0, lz);
      cam.position.set(hall.x + 11.4, hall.y + 5.8, hall.z);
      clampChaseCameraToInterior(
        cam,
        new Vector3(hall.x, hall.y + 2, hall.z),
        new Vector3(hall.x, hall.y, hall.z),
        1 / 60,
        false,
      );
    }
    for (let i = 0; i < 60; i++) {
      cam.position.set(hall.x + 11.4, hall.y + 5.8, hall.z);
      clampChaseCameraToInterior(
        cam,
        new Vector3(hall.x, hall.y + 2, hall.z),
        new Vector3(hall.x, hall.y, hall.z),
        1 / 60,
        false,
      );
    }
    expect(interiorLensInAir()).toBe(true);
    step(eye(0, 6.08), cam.position.clone(), 240);
    expect(part('HallWallFront').alpha).toBe(1);
  });

  it('cuts the gallery away for a player at the bar with the camera up over its deck', () => {
    withTier('high');
    buildMirefenTavern();
    const e = eye(9, -6, 0.5);
    step(e, at(9, 9, -12));
    const gallery = part('Gallery');
    expect(gallery.alpha).toBe(0);
    for (const m of gallery.meshes) {
      const mat = m.material as THREE.Material;
      expect(mat.opacity).toBe(0);
      expect(mat.depthWrite).toBe(false);
      expect(mat.colorWrite).toBe(false);
    }
    for (const name of ['HallWallBack', 'HallWallLeft', 'HallWallRight', 'HallRoof']) {
      expect(part(name).alpha, name).toBe(1);
    }
    // the camera comes back down into the room: the gallery eases back to its authored state
    step(e, at(9, 4, 2), 240);
    expect(gallery.alpha).toBe(1);
    for (const m of gallery.meshes) {
      const mat = m.material as THREE.Material;
      expect(mat.transparent).toBe(false);
      expect(mat.depthWrite).toBe(true);
      expect(mat.colorWrite).toBe(true);
    }
  });

  it('under the dithered fade, a part cut away writes depth again once it is back', () => {
    setDitherFadeEnabledForTest(true);
    withTier('high');
    buildMirefenTavern();
    const e = eye(9, -6, 0.5);
    step(e, at(9, 9, -12));
    const gallery = part('Gallery');
    expect(gallery.alpha).toBe(0);
    for (const m of gallery.meshes) {
      const mat = m.material as THREE.Material;
      expect(ditherFadeUniform(mat)?.value).toBe(0);
      expect(mat.depthWrite).toBe(false);
    }
    step(e, at(9, 4, 2), 240);
    expect(gallery.alpha).toBe(1);
    for (const m of gallery.meshes) {
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
      expect(m.castShadow, m.name).toBe(
        m.name !== 'Gallery' && m.name !== 'RoomWalls' && m.name !== 'TowerNewel',
      );
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

  it('lights the hearth, the wall fire, the chandelier, the lit lanterns and the tower sconces', () => {
    withTier('high');
    buildMirefenTavern();
    const lights = mirefenTavernLights();
    expect(lights).toHaveLength(
      3 + TAVERN_LANTERNS.filter((l) => l.lit).length + TAVERN_TOWER_SCONCES.length,
    );
    // the climb is lit from foot to head: a sconce low, one mid-flight, one near the landing
    const sconces = lights.filter((l) => l.name === 'tavernTowerSconce');
    expect(sconces).toHaveLength(TAVERN_TOWER_SCONCES.length);
    const heights = sconces.map((l) => l.position.y - TAVERN_FLOOR_Y).sort((a, b) => a - b);
    expect(heights[0]).toBeLessThan(4);
    expect(heights[heights.length - 1]).toBeGreaterThan(TAVERN_UPPER + 1.5);
    for (const l of sconces) {
      const lx = TAVERN_ORIGIN.z - l.position.z;
      const lz = l.position.x - TAVERN_ORIGIN.x;
      const r = Math.hypot(lx - TAVERN_TOWER.x, lz - TAVERN_TOWER.z);
      expect(r).toBeLessThan(TAVERN_TOWER.rIn);
      expect(r).toBeGreaterThan(TAVERN_TOWER.rIn - 1);
    }
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
