// Interior retirement: drop a retired interior group's scene nodes, prune its
// lights/flames out of the per-frame registries, and free its per-build GPU
// resources. Extracted from the renderer coordinator (monolith ratchet) so the
// highest-blast-radius teardown in the interior path is a unit-testable module:
// a missed shared tag here bricks the kit for the session, and before this
// nothing could build-and-retire an interior under test.
//
// The disposal half leans on the shared_resource tagging contract: cached kit
// geometry and the pack/tint/glow material caches are shared-tagged
// (dungeon.ts), so the traversal frees only what one build minted (rift
// platform/ice/pool/illusion meshes, occluder-fade wall clones) plus every
// InstancedMesh's per-build instanceMatrix buffer. A 1-2 hour rift session
// descends through dozens of floors; before this, each retired floor left all
// of that resident for the session.

import type * as THREE from 'three';
import { pruneFireLights } from './fire_light_registry';
import { disposeUnsharedMeshResources } from './shared_resource';

export interface InteriorRetirementHost {
  /** The scene (or any parent) the retired group is removed from. */
  scene: Pick<THREE.Object3D, 'remove'>;
  fireLights: THREE.PointLight[];
  flames: THREE.Object3D[];
  /** Called when pruneFireLights changed the registry. The rank MUST follow:
   *  the rebuild guard compares ranked.length against a COUNT, so a retire
   *  that removes as many lights as a same-microtask build added would leave
   *  a stale rank holding the retired floor and missing the new one. */
  onLightRankDirty: () => void;
  /** Unregister occluder-fade wall records owned by doomed nodes. */
  retireHideables: (doomed: ReadonlySet<THREE.Object3D>) => void;
}

export function retireInteriorGroup(host: InteriorRetirementHost, group: THREE.Group): void {
  host.scene.remove(group);
  const doomed = new Set<THREE.Object3D>();
  group.traverse((o) => doomed.add(o));
  if (pruneFireLights(host.fireLights, doomed)) host.onLightRankDirty();
  for (let i = host.flames.length - 1; i >= 0; i--) {
    if (doomed.has(host.flames[i])) host.flames.splice(i, 1);
  }
  host.retireHideables(doomed);
  disposeUnsharedMeshResources(group, {
    geometries: true,
    materials: true,
    instanceBuffers: true,
  });
}
