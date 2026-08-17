// The compile gate's touch tail (src/render/linked_program_touch.ts): warm the
// uniform/attribute tables of every LINKED program variant under a target so
// the reveal draw issues no synchronous first-use query, never touching a
// variant still linking (that would block on the link).
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  type LinkedProgramLike,
  type MaterialPropertiesLike,
  touchLinkedPrograms,
} from '../src/render/linked_program_touch';

function program(ready: boolean): LinkedProgramLike & {
  uniforms: ReturnType<typeof vi.fn>;
  attributes: ReturnType<typeof vi.fn>;
} {
  const uniforms = vi.fn();
  const attributes = vi.fn();
  return {
    isReady: () => ready,
    getUniforms: uniforms,
    getAttributes: attributes,
    uniforms,
    attributes,
  };
}

function propertiesFor(
  entries: Map<THREE.Material, Map<string, LinkedProgramLike> | undefined>,
): MaterialPropertiesLike {
  return { get: (material) => ({ programs: entries.get(material) }) };
}

describe('touchLinkedPrograms', () => {
  it('touches every ready variant of every material under the target, once, and skips linking ones', () => {
    const shared = new THREE.MeshStandardMaterial({ name: 'shared' });
    const other = new THREE.MeshStandardMaterial({ name: 'other' });
    const bare = new THREE.MeshBasicMaterial({ name: 'no-programs' });
    const skinned = program(true);
    const far = program(true);
    const linking = program(false);
    const otherFar = program(true);
    const props = propertiesFor(
      new Map<THREE.Material, Map<string, LinkedProgramLike> | undefined>([
        // a tinted clone shared by the rig and the far mesh: both variants,
        // plus a third still linking
        [
          shared,
          new Map([
            ['skinned', skinned],
            ['far', far],
            ['linking', linking],
          ]),
        ],
        [other, new Map([['far', otherFar]])],
        [bare, undefined],
      ]),
    );
    const wrap = new THREE.Group();
    const farMesh = new THREE.Mesh(new THREE.BufferGeometry(), [shared, other, shared]);
    const proxy = new THREE.Mesh(new THREE.BufferGeometry(), bare);
    wrap.add(farMesh, proxy);
    // a non-mesh child and a null-material mesh are walked past
    wrap.add(new THREE.Group());
    const nulled = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    (nulled as unknown as { material: THREE.Material | null }).material = null;
    wrap.add(nulled);

    expect(touchLinkedPrograms(props, wrap)).toBe(3);

    for (const p of [skinned, far, otherFar]) {
      expect(p.uniforms).toHaveBeenCalledTimes(1);
      expect(p.attributes).toHaveBeenCalledTimes(1);
    }
    expect(linking.uniforms).not.toHaveBeenCalled();
    expect(linking.attributes).not.toHaveBeenCalled();
  });

  it('touches nothing on a target without meshes', () => {
    const props = propertiesFor(new Map());
    expect(touchLinkedPrograms(props, new THREE.Group())).toBe(0);
  });
});
