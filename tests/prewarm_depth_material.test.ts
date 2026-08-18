import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { prewarmDepthMaterial } from '../src/render/prewarm_depth_material';

describe('prewarmDepthMaterial', () => {
  it('pins RGBADepthPacking (matches the real shadow pass program key)', () => {
    const cache = new Map<string, THREE.MeshDepthMaterial>();
    const depth = prewarmDepthMaterial(cache, new THREE.MeshStandardMaterial());
    expect(depth.depthPacking).toBe(THREE.RGBADepthPacking);
  });

  it('dedupes by the program-key inputs and mints a fresh one when they differ', () => {
    const cache = new Map<string, THREE.MeshDepthMaterial>();
    const a = prewarmDepthMaterial(
      cache,
      new THREE.MeshStandardMaterial({ side: THREE.FrontSide }),
    );
    const b = prewarmDepthMaterial(
      cache,
      new THREE.MeshStandardMaterial({ side: THREE.FrontSide }),
    );
    expect(b).toBe(a); // same key -> cached
    expect(cache.size).toBe(1);

    // A different alpha-test arm is a distinct depth program.
    const c = prewarmDepthMaterial(
      cache,
      new THREE.MeshStandardMaterial({ side: THREE.FrontSide, alphaTest: 0.5 }),
    );
    expect(c).not.toBe(a);
    expect(cache.size).toBe(2);

    // A map's PRESENCE flips the key even though the image never matters.
    const withMap = new THREE.MeshStandardMaterial({ side: THREE.FrontSide });
    withMap.map = new THREE.Texture();
    const d = prewarmDepthMaterial(cache, withMap);
    expect(d).not.toBe(a);
    expect(cache.size).toBe(3);
  });

  it('derives the shadow side opposite the source side (front->back)', () => {
    const cache = new Map<string, THREE.MeshDepthMaterial>();
    const front = prewarmDepthMaterial(
      cache,
      new THREE.MeshStandardMaterial({ side: THREE.FrontSide }),
    );
    expect(front.side).toBe(THREE.BackSide);
    const back = prewarmDepthMaterial(
      cache,
      new THREE.MeshStandardMaterial({ side: THREE.BackSide }),
    );
    expect(back.side).toBe(THREE.FrontSide);
    const dbl = prewarmDepthMaterial(
      cache,
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
    );
    expect(dbl.side).toBe(THREE.DoubleSide);
  });
});
