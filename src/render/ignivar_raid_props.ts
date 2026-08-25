import * as THREE from 'three';
import type { AuthoredDecor } from '../sim/dungeon_layout';
import { loadGltf, releaseGltf } from './assets/loader';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

export type IgnivarRaidPropKey =
  | 'ignivar_chain'
  | 'ignivar_curved_gear_wall'
  | 'ignivar_fallen_automa'
  | 'ignivar_firepit'
  | 'ignivar_forge_anvil'
  | 'ignivar_forge_house'
  | 'ignivar_forge_station'
  | 'ignivar_furnace_pillar'
  | 'ignivar_gear_broad'
  | 'ignivar_gear_heavy'
  | 'ignivar_gear_machine'
  | 'ignivar_gear_small'
  | 'ignivar_gear_wall_cluster'
  | 'ignivar_reactor'
  | 'ignivar_wall_gear_relief'
  | 'ignivar_workbench';

interface IgnivarRaidPropModelDef {
  url: string;
  height: number;
  baseY?: number;
  emissiveIntensity?: number;
  highDetailOnly?: boolean;
  castShadow?: boolean;
}

export const IGNIVAR_RAID_PROP_MODELS: Record<IgnivarRaidPropKey, IgnivarRaidPropModelDef> = {
  ignivar_chain: {
    url: '/models/props/ignivar_chain.glb',
    height: 5.5,
    baseY: 2.45,
    castShadow: true,
  },
  ignivar_curved_gear_wall: {
    url: '/models/props/ignivar_curved_gear_wall.glb',
    height: 3.4,
    highDetailOnly: true,
  },
  ignivar_fallen_automa: {
    url: '/models/props/ignivar_fallen_automa.glb',
    height: 0.65,
    castShadow: true,
  },
  ignivar_firepit: {
    url: '/models/props/ignivar_firepit.glb',
    height: 1.1,
    emissiveIntensity: 0.42,
    castShadow: true,
  },
  ignivar_forge_anvil: {
    url: '/models/props/ignivar_forge_anvil.glb',
    height: 1.8,
    emissiveIntensity: 0.16,
  },
  ignivar_forge_house: {
    url: '/models/props/ignivar_forge_house.glb',
    height: 7.2,
    emissiveIntensity: 0.12,
    highDetailOnly: true,
  },
  ignivar_forge_station: {
    url: '/models/props/ignivar_forge_station.glb',
    height: 3.2,
    emissiveIntensity: 0.24,
  },
  ignivar_furnace_pillar: {
    url: '/models/props/ignivar_furnace_pillar.glb',
    height: 4.5,
    emissiveIntensity: 0.3,
    highDetailOnly: true,
  },
  ignivar_gear_broad: {
    url: '/models/props/ignivar_gear_broad.glb',
    height: 1.5,
    castShadow: true,
  },
  ignivar_gear_heavy: {
    url: '/models/props/ignivar_gear_heavy.glb',
    height: 1.7,
    castShadow: true,
  },
  ignivar_gear_machine: {
    url: '/models/props/ignivar_gear_machine.glb',
    height: 2.7,
  },
  ignivar_gear_small: {
    url: '/models/props/ignivar_gear_small.glb',
    height: 1.35,
    castShadow: true,
  },
  ignivar_gear_wall_cluster: {
    url: '/models/props/ignivar_gear_wall_cluster.glb',
    height: 3.3,
    highDetailOnly: true,
  },
  ignivar_reactor: {
    url: '/models/props/ignivar_reactor.glb',
    height: 3.4,
    emissiveIntensity: 0.38,
  },
  ignivar_wall_gear_relief: {
    url: '/models/props/ignivar_wall_gear_relief.glb',
    height: 3.4,
    highDetailOnly: true,
  },
  ignivar_workbench: {
    url: '/models/props/ignivar_workbench.glb',
    height: 1.55,
  },
};

const templates = new Map<IgnivarRaidPropKey, THREE.Group | null>();
const loadTasks = new Map<IgnivarRaidPropKey, Promise<void>>();

export function isIgnivarRaidPropKey(key: string): key is IgnivarRaidPropKey {
  return Object.hasOwn(IGNIVAR_RAID_PROP_MODELS, key);
}

function preparedMaterial(
  source: THREE.Material,
  emissiveIntensity: number | undefined,
): THREE.Material {
  const material = source.clone();
  if (emissiveIntensity !== undefined && material instanceof THREE.MeshStandardMaterial) {
    material.emissive.set(0xff6a20);
    material.emissiveIntensity = emissiveIntensity;
    material.emissiveMap = material.map;
  }
  return markSharedMaterial(material);
}

function prepareTemplate(source: THREE.Object3D, def: IgnivarRaidPropModelDef): THREE.Group {
  const model = source.clone(true);
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry = markSharedGeometry(child.geometry);
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => preparedMaterial(material, def.emissiveIntensity))
      : preparedMaterial(child.material, def.emissiveIntensity);
    child.castShadow = def.castShadow === true;
    child.receiveShadow = true;
  });
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = def.height / Math.max(size.y, 1e-3);
  model.scale.setScalar(scale);
  model.position.set(
    -((bounds.min.x + bounds.max.x) * 0.5) * scale,
    -bounds.min.y * scale,
    -((bounds.min.z + bounds.max.z) * 0.5) * scale,
  );

  const group = new THREE.Group();
  group.add(model);
  return group;
}

type GltfSceneLoader = (url: string) => Promise<{ scene: THREE.Object3D }>;

async function ensureModelWithLoader(
  key: IgnivarRaidPropKey,
  loader: GltfSceneLoader = loadGltf,
  release: (url: string) => void = releaseGltf,
): Promise<void> {
  if (templates.has(key)) return;
  const existing = loadTasks.get(key);
  if (existing) return existing;
  const def = IGNIVAR_RAID_PROP_MODELS[key];
  const task = loader(def.url)
    .then((gltf) => {
      templates.set(key, prepareTemplate(gltf.scene, def));
      release(def.url);
    })
    .catch(() => {
      templates.set(key, null);
    })
    .finally(() => {
      loadTasks.delete(key);
    });
  loadTasks.set(key, task);
  return task;
}

function ensureModel(key: IgnivarRaidPropKey): Promise<void> {
  return ensureModelWithLoader(key);
}

function keysIn(decor: readonly AuthoredDecor[], lowGfx = false): IgnivarRaidPropKey[] {
  return [
    ...new Set(
      decor.flatMap((entry) => {
        if (!isIgnivarRaidPropKey(entry.key)) return [];
        if (lowGfx && IGNIVAR_RAID_PROP_MODELS[entry.key].highDetailOnly) return [];
        return [entry.key];
      }),
    ),
  ];
}

export async function ensureIgnivarRaidPropAssets(
  decor: readonly AuthoredDecor[],
  lowGfx = false,
  ensure: (key: IgnivarRaidPropKey) => Promise<void> = ensureModel,
): Promise<void> {
  await Promise.all(keysIn(decor, lowGfx).map(ensure));
}

/** True only when this tier can render the requested prop and its GLB loaded. */
export function isIgnivarRaidPropAvailable(key: string, lowGfx: boolean): boolean {
  if (!isIgnivarRaidPropKey(key)) return false;
  const def = IGNIVAR_RAID_PROP_MODELS[key];
  if (lowGfx && def.highDetailOnly) return false;
  return templates.get(key) != null;
}

export function buildIgnivarRaidProps(
  decor: readonly AuthoredDecor[],
  lowGfx: boolean,
): THREE.Group | null {
  return buildIgnivarRaidPropsWithTemplates(decor, lowGfx, templates);
}

function buildIgnivarRaidPropsWithTemplates(
  decor: readonly AuthoredDecor[],
  lowGfx: boolean,
  sourceTemplates: ReadonlyMap<IgnivarRaidPropKey, THREE.Group | null>,
): THREE.Group | null {
  const group = new THREE.Group();
  group.name = 'ignivarRaidProps';
  group.userData.renderCategory = 'dungeon';
  group.userData.collision = 'sim-authored';
  group.userData.actionable = false;

  for (const placement of decor) {
    if (!isIgnivarRaidPropKey(placement.key)) continue;
    const def = IGNIVAR_RAID_PROP_MODELS[placement.key];
    if (lowGfx && def.highDetailOnly) continue;
    const template = sourceTemplates.get(placement.key);
    if (!template) continue;
    const instance = template.clone(true);
    instance.name = placement.key;
    instance.position.set(placement.x, def.baseY ?? 0, placement.z);
    instance.rotation.y = placement.yaw;
    instance.scale.setScalar(placement.scale ?? 1);
    group.add(instance);
  }

  return group.children.length > 0 ? group : null;
}

export function resetIgnivarRaidPropCachesForTest(): void {
  templates.clear();
  loadTasks.clear();
}

export const ignivarRaidPropInternalsForTest = {
  buildIgnivarRaidPropsWithTemplates,
  ensureModelWithLoader,
  keysIn,
  prepareTemplate,
};
