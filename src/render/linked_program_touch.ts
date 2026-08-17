// The last synchronous step of a compile gate. A linked program's first
// setProgram still runs three's onFirstUse: an ACTIVE_UNIFORMS /
// ACTIVE_ATTRIBUTES round trip that waits for everything the GPU process has
// queued in front of it (the frame's uploads and draws, plus whatever link
// work a driver finishes lazily at first use). Measured on the composed far
// bakes at their reveal draw, AFTER COMPLETION_STATUS reported the link done:
// 20 to 160 ms on NVIDIA, 40 to 390 ms on the Intel iGPU. Touching the tables
// in the gate's tail, while nothing of the target's is queued, moves that cost
// off the reveal frame (NVIDIA: 0 to 20 ms once; iGPU: 40 to 100 ms per new
// program, still off the draw). Extracted from renderer.ts so the rule is
// testable with a stub property map (tests/linked_program_touch.test.ts).
import type * as THREE from 'three';

/** The slice of a three WebGLProgram this touch needs. */
export interface LinkedProgramLike {
  isReady(): boolean;
  getUniforms(): unknown;
  getAttributes(): unknown;
}

/** The slice of `WebGLRenderer.properties` this touch reads (three types the
 *  per-material map as `unknown`; `programs` is where WebGLRenderer.getProgram
 *  keeps every linked variant of a material, keyed by program cache key). */
export interface MaterialPropertiesLike {
  get(material: THREE.Material): unknown;
}

interface MaterialProgramsLike {
  programs?: Map<string, LinkedProgramLike>;
}

/**
 * Warm the uniform and attribute tables of every LINKED program under
 * `target`. Every variant of the material, not `currentProgram`: a tinted
 * clone can be shared between a skinned rig and its rigid far mesh, and that
 * slot names whichever variant drew last. A variant still linking is skipped:
 * its first use would block on the link, which is exactly what the gate
 * exists to avoid. Returns how many programs were touched.
 */
export function touchLinkedPrograms(
  properties: MaterialPropertiesLike,
  target: THREE.Object3D,
): number {
  let touched = 0;
  const seen = new Set<LinkedProgramLike>();
  target.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const programs = (properties.get(material) as MaterialProgramsLike).programs;
      if (!programs) continue;
      for (const program of programs.values()) {
        if (seen.has(program) || !program.isReady()) continue;
        seen.add(program);
        program.getUniforms();
        program.getAttributes();
        touched++;
      }
    }
  });
  return touched;
}
