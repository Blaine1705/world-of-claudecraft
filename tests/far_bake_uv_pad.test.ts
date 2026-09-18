// The far-LOD bake must keep the uv of every part that has one, even when the
// same body carries parts that have none.
//
// Why this matters: a composed (modular) body always mixes atlas-mapped kit
// pieces with colour-only face parts (head, ears, eyes, mouth, brows) that ship
// no uv at all. bakeStaticPose merges all of them into ONE far mesh, and
// mergeGeometries needs the attribute sets to agree, so the bake used to
// "resolve" a missing uv by deleting uv from EVERY part. The merged mesh then
// had no uv attribute, and the kit's atlas material sampled the single texel
// at uv (0,0) across the whole robe and hat: a flat, untextured body the
// moment a peer or NPC crossed into the static band (the "NPCs lose their
// textures" report; Chronicler Zenzie at night was the reproduction). The
// fix pads the uv-less parts with an inert zero uv instead.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

type AssetsModule = typeof import('../src/render/characters/assets');

/** The kit's uv, distinct per vertex so a preserved copy is unmistakable. */
const KIT_UV = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);

function kitMesh(): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  );
  geo.setAttribute('uv', new THREE.BufferAttribute(KIT_UV.slice(), 2));
  geo.setIndex([0, 1, 2]);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: 'kit' }));
  m.name = 'body';
  return m;
}

/** A colour-only face part: positions, no uv (the modular head/ear/eye shape). */
function faceMesh(): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 2, 0, 1, 2, 0, 0, 3, 0]), 3),
  );
  geo.setIndex([0, 1, 2]);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ name: 'skin' }));
  m.name = 'face';
  return m;
}

const stubGltf = () => {
  const scene = new THREE.Group();
  scene.add(kitMesh());
  scene.add(faceMesh());
  return { scene, animations: [new THREE.AnimationClip('Idle', 1, [])] };
};

async function loadAssets(): Promise<AssetsModule> {
  vi.resetModules();
  vi.doMock('../src/render/assets/loader', () => ({
    loadGltf: vi.fn(() => Promise.resolve(stubGltf())),
    loadTexture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    loadKtx2Texture: vi.fn(() => Promise.resolve(new THREE.Texture())),
    releaseGltf: vi.fn(),
  }));
  const assets = (await import('../src/render/characters/assets')) as AssetsModule;
  await assets.charactersReady();
  return assets;
}

afterEach(() => {
  vi.doUnmock('../src/render/assets/loader');
  vi.resetModules();
});

describe('padMissingUv', () => {
  it('gives uv-less parts a zero uv of their own vertex count and leaves mapped parts untouched', async () => {
    const { padMissingUv } = await loadAssets();
    const kit = kitMesh().geometry;
    const face = faceMesh().geometry;
    padMissingUv([kit, face]);
    expect(Array.from(kit.getAttribute('uv').array as Float32Array)).toEqual(Array.from(KIT_UV));
    const padded = face.getAttribute('uv');
    expect(padded).toBeDefined();
    expect(padded.itemSize).toBe(2);
    expect(padded.count).toBe(face.getAttribute('position').count);
    expect(padded.array).toBeInstanceOf(Float32Array);
    expect(Array.from(padded.array as Float32Array).every((v) => v === 0)).toBe(true);
  });

  it('leaves a set alone when no part carries a uv (nothing to agree with)', async () => {
    const { padMissingUv } = await loadAssets();
    const a = faceMesh().geometry;
    const b = faceMesh().geometry;
    padMissingUv([a, b]);
    expect(a.getAttribute('uv')).toBeUndefined();
    expect(b.getAttribute('uv')).toBeUndefined();
  });
});

describe('far-LOD bake uv survival', () => {
  it('keeps the atlas uv of the mapped part when a colour-only part sits beside it', async () => {
    const assets = await loadAssets();
    // A fixed-rig key whose bake walks every visible mesh of the stub scene
    // (the mocked loader serves the same two-mesh scene for every URL).
    const prep = assets.prepareVisual('mob_mushroom_pixie');
    const geo = prep.idleGeo;
    expect(geo).not.toBeNull();
    const uv = geo?.getAttribute('uv');
    // The mutant proof: restoring the old "delete uv from every geo when any
    // geo lacks one" arm turns this undefined, and the kit samples one texel.
    expect(uv).toBeDefined();
    expect(uv?.count).toBe(geo?.getAttribute('position').count);
    // The kit's vertices come through with their own uv, byte for byte.
    const values = Array.from(uv?.array as Float32Array);
    const needle = KIT_UV[0]; // float32-rounded, as the baked copy is
    const kitIndex = values.findIndex((_, i) => i % 2 === 0 && values[i] === needle);
    expect(kitIndex).toBeGreaterThanOrEqual(0);
    expect(values.slice(kitIndex, kitIndex + KIT_UV.length)).toEqual(Array.from(KIT_UV));
  }, 20000);
});
