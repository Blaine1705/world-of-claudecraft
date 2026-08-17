import type * as THREE from 'three';
import type { PrewarmResumeUnit } from './prewarm_resume';
import { setRenderCategory } from './renderer_diagnostics';

/** What a variant twin slot needs from the renderer. */
export interface VariantPrewarmSlotHost {
  scene: THREE.Object3D;
  compileColorPrograms(group: THREE.Group): Promise<unknown>;
}

/** One boot-manifest slot for a hidden group of program-variant TWINS (the
 *  camera-ghost fade twins, the character effect twins): the group is staged
 *  under the scene, compiled by the manifest's compile pass, hidden at entry
 *  and REMOVED but never disposed at cleanup, since the twins hold the only
 *  reference keeping each variant program linked while the live materials
 *  are still in their default state. The manifest entry and the two resume
 *  units share one builder so a resume after world entry stages the same set. */
export interface VariantPrewarmSlot {
  readonly stageId: string;
  readonly group: THREE.Group | null;
  /** The manifest entry's resumeUnits: stage the twins, then link them. */
  readonly resumeUnits: () => readonly PrewarmResumeUnit[];
  /** The manifest entry's run(): stage the twins (the compile pass links them). */
  readonly run: () => void;
  readonly detail: () => string;
  /** The (id, group) pair the staged compile groups list reports. */
  staged(): [string, THREE.Group | null];
  hide(): void;
  cleanup(): void;
}

export function createVariantPrewarmSlot(
  host: VariantPrewarmSlotHost,
  stageId: string,
  build: (scene: THREE.Object3D) => THREE.Group,
): VariantPrewarmSlot {
  let group: THREE.Group | null = null;
  const stage = (): void => {
    group = build(host.scene);
    setRenderCategory(group, 'prewarm');
    host.scene.add(group);
  };
  return {
    stageId,
    get group() {
      return group;
    },
    resumeUnits: () => [
      { id: `${stageId}:group`, run: stage },
      {
        id: `${stageId}:compile`,
        run: async () => {
          if (group) await host.compileColorPrograms(group);
        },
      },
    ],
    run: stage,
    detail: () => `objects=${group?.children.length ?? 0}`,
    staged: () => [stageId, group],
    hide: () => {
      if (group) group.visible = false;
    },
    cleanup: () => {
      if (group) host.scene.remove(group);
      group = null;
    },
  };
}
