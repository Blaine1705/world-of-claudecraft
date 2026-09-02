import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

const FREIGHT_ASSET_URLS = Object.freeze({
  wagon: '/models/biome/city_wagon.glb',
  horse: '/models/mounts/valorsteed.glb',
  crate: '/models/quest/supply_crate.glb',
});

const gltfByUrl = new Map<string, GLTF>();
let freightWagonTemplate: THREE.Group | null = null;

if (typeof window !== 'undefined') {
  for (const url of Object.values(FREIGHT_ASSET_URLS)) {
    registerDeferredPreload(() =>
      loadGltf(url)
        .then((gltf) => gltfByUrl.set(url, gltf))
        .catch(() => undefined),
    );
  }
}

function normalizeLargest(root: THREE.Object3D, target: number): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  root.scale.setScalar(target / Math.max(size.x, size.y, size.z, 0.001));
  seatAndCenter(root);
}

function normalizeHeight(root: THREE.Object3D, target: number): void {
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  root.scale.setScalar(target / Math.max(size.y, 0.001));
  seatAndCenter(root);
}

function seatAndCenter(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= box.min.y;
  root.position.z -= center.z;
  root.updateMatrixWorld(true);
}

function markTemplateShared<T extends THREE.Object3D>(root: T): T {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    markSharedGeometry(mesh.geometry);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) markSharedMaterial(material);
  });
  return root;
}

function sourceClone(url: string): THREE.Group | null {
  const gltf = gltfByUrl.get(url);
  return gltf ? (cloneSkinned(gltf.scene) as THREE.Group) : null;
}

function prepareFreightWagon(): THREE.Group | null {
  if (freightWagonTemplate) return freightWagonTemplate;
  const wagon = sourceClone(FREIGHT_ASSET_URLS.wagon);
  const horseSource = sourceClone(FREIGHT_ASSET_URLS.horse);
  const crateSource = sourceClone(FREIGHT_ASSET_URLS.crate);
  if (!wagon || !horseSource || !crateSource) return null;

  const root = new THREE.Group();
  normalizeLargest(wagon, 4.4);
  root.add(wagon);

  normalizeHeight(horseSource, 2.15);
  for (const x of [-0.8, 0.8]) {
    const horse = cloneSkinned(horseSource);
    horse.position.set(x, 0, 3.45);
    root.add(horse);
  }

  normalizeLargest(crateSource, 0.72);
  for (const [x, y, z, rotation] of [
    [-0.42, 1.05, 0.15, 0.12],
    [0.35, 1.05, 0.05, -0.18],
    [0, 1.68, 0.08, 0.05],
  ] as const) {
    const crate = crateSource.clone(true);
    crate.position.set(x, y, z);
    crate.rotation.y = rotation;
    root.add(crate);
  }

  root.updateMatrixWorld(true);
  freightWagonTemplate = markTemplateShared(root);
  return freightWagonTemplate;
}

export function buildWorldQuestFreightWagon(): { group: THREE.Group; height: number } | null {
  const template = prepareFreightWagon();
  if (!template) return null;
  return { group: cloneSkinned(template) as THREE.Group, height: 2.3 };
}

export const worldQuestFreightVisualInternalsForTest = {
  assetUrls: FREIGHT_ASSET_URLS,
  reset(): void {
    freightWagonTemplate = null;
  },
};
