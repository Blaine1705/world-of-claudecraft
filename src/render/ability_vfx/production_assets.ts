import * as THREE from 'three';
import { loadGltf, loadKtx2Texture, loadTexture, releaseGltf } from '../assets/loader';
import { registerDeferredPreload } from '../assets/preload';

export type BakedKind =
  | 'smoke'
  | 'shout_dust'
  | 'warrior_power'
  | 'warrior_fervor'
  | 'harvest_impact'
  | 'warrior_bite'
  | 'warrior_shear'
  | 'warrior_crush'
  | 'shockwave';
export type FragmentKind = 'ice_shard' | 'stone_chip' | 'metal_splinter';
export const BAKED_URLS = {
  smoke: '/textures/vfx/production/smoke.webp',
  shout_dust: '/textures/vfx/production/shout_dust.webp',
  warrior_power: '/textures/vfx/production/warrior_power.webp',
  warrior_fervor: '/textures/vfx/production/warrior_fervor.webp',
  harvest_impact: '/textures/vfx/production/harvest_impact.webp',
  warrior_bite: '/textures/vfx/production/warrior_bite.webp',
  warrior_shear: '/textures/vfx/production/warrior_shear.webp',
  warrior_crush: '/textures/vfx/production/warrior_crush.ktx2',
  shockwave: '/textures/vfx/production/shockwave.webp',
} as const;
export const FRAGMENT_URL = '/models/vfx/production_fragments.glb';
const textures = new Map<BakedKind, THREE.Texture>();
const PRESSURE_URL = '/textures/vfx/production/warrior_pressure.webp';
const BLOOD_URL = '/textures/vfx/production/warrior_blood_blade.webp';
const STEEL_URL = '/textures/vfx/production/warrior_forged_steel.webp';
const ROCK_URL = '/textures/terrain/Rock051_Color.jpg';
let rockTexture: THREE.Texture | null = null;
export function warriorRockTexture(): THREE.Texture | null {
  return rockTexture;
}
let steelTexture: THREE.Texture | null = null;
export function warriorSteelTexture(): THREE.Texture | null {
  return steelTexture;
}
let bloodTexture: THREE.Texture | null = null;
export function warriorBloodTexture(): THREE.Texture | null {
  return bloodTexture;
}
let pressureTexture: THREE.Texture | null = null;
export function warriorPressureTexture(): THREE.Texture | null {
  return pressureTexture;
}
const geometry = new Map<FragmentKind, THREE.BufferGeometry>();
registerDeferredPreload(async () => {
  await Promise.all(
    Object.entries(BAKED_URLS).map(async ([kind, url]) => {
      const texture = (
        await (url.endsWith('.ktx2')
          ? loadKtx2Texture(url, { large: true })
          : loadTexture(url, { srgb: true }))
      ).clone();
      // No mip cross-contamination between cells. Fixed framing has baked gutters.
      texture.generateMipmaps = false;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      textures.set(kind as BakedKind, texture);
    }),
  );
  pressureTexture = (await loadTexture(PRESSURE_URL, { srgb: false })).clone();
  pressureTexture.colorSpace = THREE.NoColorSpace;
  pressureTexture.generateMipmaps = false;
  pressureTexture.minFilter = pressureTexture.magFilter = THREE.LinearFilter;
  bloodTexture = (await loadTexture(BLOOD_URL, { srgb: true })).clone();
  bloodTexture.generateMipmaps = false;
  bloodTexture.minFilter = bloodTexture.magFilter = THREE.LinearFilter;
  steelTexture = (await loadTexture(STEEL_URL, { srgb: true })).clone();
  steelTexture.generateMipmaps = true;
  steelTexture.minFilter = THREE.LinearMipmapLinearFilter;
  steelTexture.magFilter = THREE.LinearFilter;
  rockTexture = (await loadTexture(ROCK_URL, { srgb: true })).clone();
  rockTexture.generateMipmaps = true;
  rockTexture.minFilter = THREE.LinearMipmapLinearFilter;
  rockTexture.magFilter = THREE.LinearFilter;
  const model = await loadGltf(FRAGMENT_URL);
  model.scene.updateMatrixWorld(true);
  for (const name of ['ice_shard', 'stone_chip', 'metal_splinter'] as const) {
    const mesh = model.scene.getObjectByName(name) as THREE.Mesh | undefined;
    if (!mesh?.isMesh) throw new Error(`Missing production fragment: ${name}`);
    // Shared preparation-owned source; per-renderer pools clone it and dispose their clone.
    geometry.set(name, mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
  }
  releaseGltf(FRAGMENT_URL);
});
export const productionPreloadInternalsForTest = {
  urls: [...Object.values(BAKED_URLS), PRESSURE_URL, BLOOD_URL, STEEL_URL, ROCK_URL, FRAGMENT_URL],
};
export function bakedTexture(kind: BakedKind): THREE.Texture | null {
  return textures.get(kind) ?? null;
}
export function fragmentGeometry(kind: FragmentKind): THREE.BufferGeometry | null {
  return geometry.get(kind) ?? null;
}
