// Attach a freshly built world group to the scene hidden until its shader
// programs are linked, then reveal it: the world-content twin of the entity
// view compile gate (gateViewOnCompile). A streamed group added visible links
// its programs synchronously at first draw (the zone-border stall); with a
// gate it pops in a frame or two late instead. Fail-soft on a rejected gate:
// the group always ends visible, matching the view gate's recovery arm.

import type * as THREE from 'three';

export async function attachSceneGroupGated(
  scene: { add(object: THREE.Object3D): unknown },
  group: THREE.Object3D,
  compileGate?: (target: THREE.Object3D) => Promise<unknown>,
): Promise<void> {
  if (!compileGate) {
    scene.add(group);
    return;
  }
  group.visible = false;
  scene.add(group);
  try {
    await compileGate(group);
  } catch {
    // Shutdown rejects queued GPU work on purpose; reveal happens either way.
  } finally {
    group.visible = true;
  }
}
