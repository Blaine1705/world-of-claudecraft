import * as THREE from 'three';
import { setRenderCategory } from './renderer_diagnostics';
import { buildWeaponVfxPrewarmSkinGroup, disposeWeaponVfxPrewarmSkinGroups } from './weapon_vfx';

/**
 * Owns the aggregate scene group used by the streamed weapon-skin prewarm
 * units. The renderer still owns when the group is compiled, while this
 * helper owns deduplication and the failure cleanup that must release every
 * skin already staged by a partial resume.
 */
export interface WeaponVfxPrewarmSkinStage {
  readonly group: THREE.Group | null;
  get(key: string): THREE.Group | undefined;
  stage(key: string): THREE.Group;
  disposeFailure(): void;
  dispose(): void;
}

export function createWeaponVfxPrewarmSkinStage(scene: THREE.Scene): WeaponVfxPrewarmSkinStage {
  let group: THREE.Group | null = null;
  const skinGroups = new Map<string, THREE.Group>();

  const ensureGroup = (): THREE.Group => {
    if (group) return group;
    group = new THREE.Group();
    group.name = 'weapon-vfx-program-prewarm';
    group.position.set(0, -1000, 0);
    group.visible = false;
    setRenderCategory(group, 'prewarm');
    scene.add(group);
    return group;
  };

  const clear = (releaseResources: boolean): void => {
    if (releaseResources) disposeWeaponVfxPrewarmSkinGroups(skinGroups.values());
    skinGroups.clear();
    if (!group) return;
    scene.remove(group);
    group.clear();
    group = null;
  };

  return {
    get group() {
      return group;
    },
    get: (key) => skinGroups.get(key),
    stage: (key) => {
      const existing = skinGroups.get(key);
      if (existing) return existing;
      const aggregate = ensureGroup();
      const skinGroup = buildWeaponVfxPrewarmSkinGroup(key);
      aggregate.add(skinGroup);
      skinGroups.set(key, skinGroup);
      return skinGroup;
    },
    disposeFailure: () => clear(true),
    // A successful prewarm intentionally keeps materials alive so their
    // linked programs remain cached. Removing the hidden group is enough.
    dispose: () => clear(false),
  };
}
