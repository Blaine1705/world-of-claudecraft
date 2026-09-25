// The ability-VFX engine as the renderer builds it, headless: a canvas stub
// for the procedural textures, and a reading of which gated drawables would
// draw on the next frame. Shared by the cast gate's spawn and requirement
// pins. A suite that needs the Warrior fragments resident mocks
// production_assets' fragmentGeometry itself (vi.mock is hoisted per file).

import type * as THREE from 'three';
import { vi } from 'vitest';
import { castVfxFamilyBitOf } from '../../src/render/cast_vfx_family';

export function installCastVfxCanvasStub(): void {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const context = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (key === 'createImageData' || key === 'getImageData') {
          return (a: number, b: number, c?: number, d?: number) => ({
            data: new Uint8ClampedArray((c ?? a) * (d ?? b) * 4),
          });
        }
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
        if (key === 'createPattern') return () => gradient;
        if (key === 'measureText') return () => ({ width: 1 });
        return noop;
      },
      set: () => true,
    },
  );
  const canvas = () => ({
    width: 0,
    height: 0,
    style: {},
    getContext: () => context,
    addEventListener: noop,
    removeEventListener: noop,
  });
  vi.stubGlobal('document', { createElement: canvas, createElementNS: canvas });
}

/** Whether three would submit primitives for this object on the next frame:
 *  visible through its ancestors, and a non-empty instance or draw range. */
export function wouldDraw(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  const drawable = object as THREE.Mesh & { isInstancedMesh?: boolean; count?: number };
  if (drawable.isInstancedMesh) return (drawable.count ?? 0) > 0;
  const geometry = drawable.geometry as THREE.BufferGeometry | undefined;
  if (!geometry || !(object as THREE.Mesh).material) return false;
  const index = geometry.index;
  const position = geometry.getAttribute('position');
  const primitives = index ? index.count : position ? position.count : 0;
  return primitives > 0 && geometry.drawRange.count > 0;
}

/** Every family-tagged drawable in the scene, collected once (the pools are
 *  built at construction and never replaced). */
export function gatedDrawables(scene: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (castVfxFamilyBitOf(object) !== 0 && (object as THREE.Mesh).material) out.push(object);
  });
  return out;
}

/** The union of the family bits of the gated drawables that would draw. */
export function drawingFamilies(drawables: readonly THREE.Object3D[]): number {
  let bits = 0;
  for (const object of drawables) if (wouldDraw(object)) bits |= castVfxFamilyBitOf(object);
  return bits;
}
