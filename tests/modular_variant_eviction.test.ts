// What a composed variant is allowed to FREE when the cache evicts it.
//
// The variant cache is bounded and refcounted so a populated zone stops minting
// part sets forever, and eviction disposes geometry to make that mean anything.
// The hazard is that a variant root is a SkeletonUtils clone, which SHARES
// BufferGeometry with the parsed GLB it came from, and mergeSkinnedParts only
// mints new geometry for the buckets it can PROVE safe: it refuses anything
// carrying morph targets (head, eyes, ears, lashes, brows, mouth) and skips
// buckets of one. Every one of those meshes is still pointing at the parsed
// scene's buffers — which every other variant, and every future compose, also
// point at, and which nothing re-creates.
//
// So an eviction that disposed the whole root would free the head, eye, ear,
// lash and brow buffers out from under every character on screen, and only in
// a session that has seen more than the cap's worth of distinct looks: the exact
// situation the cache exists for. That is the same shape as the recolorCache
// bug this workstream fixed, one layer down.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { variantOwnedGeometries } from '../src/render/characters/assets';

/** A mesh pointing at a given geometry, the way a clone shares its source's. */
function meshWith(geo: THREE.BufferGeometry, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

function boxGeo(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

/** The parsed GLB's meshes, and a variant root built the way modularVariant
 *  builds one: the unmerged parts still on the source geometry, the merged
 *  bucket on geometry the merge minted. */
function scene() {
  const head = boxGeo(); // morph targets -> mergeSkinnedParts refuses it
  const eyes = boxGeo(); // ditto
  const loneArm = boxGeo(); // bucket of one -> skipped
  const plateA = boxGeo();
  const plateB = boxGeo();
  const shared = new Set([head, eyes, loneArm, plateA, plateB]);

  const merged = boxGeo(); // what mergeSkinnedParts minted from plateA + plateB
  const variantRoot = new THREE.Group();
  variantRoot.add(meshWith(head, 'head'));
  variantRoot.add(meshWith(eyes, 'eyes'));
  variantRoot.add(meshWith(loneArm, 'arm'));
  variantRoot.add(meshWith(merged, 'plate_merged'));
  return { shared, variantRoot, head, eyes, loneArm, merged };
}

describe('variantOwnedGeometries', () => {
  it('claims only the geometry the merge minted', () => {
    const { shared, variantRoot, merged } = scene();
    expect(variantOwnedGeometries(variantRoot, shared)).toEqual([merged]);
  });

  it('never claims a part still pointing at the parsed GLB', () => {
    const { shared, variantRoot, head, eyes, loneArm } = scene();
    const owned = variantOwnedGeometries(variantRoot, shared);
    for (const geo of [head, eyes, loneArm]) expect(owned).not.toContain(geo);
  });

  it('leaves a second variant intact when the first is evicted', () => {
    // The reviewer's scenario end to end: two distinct part sets sharing the
    // GLB's head buffer, one evicted. `dispose()` is observable as the event
    // the renderer frees GPU buffers on, so listen for it rather than poking at
    // attributes (dispose does not clear those).
    const { shared, variantRoot, head, merged } = scene();

    const otherRoot = new THREE.Group();
    otherRoot.add(meshWith(head, 'head')); // the SAME buffer, as a real clone would
    otherRoot.add(meshWith(boxGeo(), 'plate_merged'));

    let headDisposed = false;
    let mergedDisposed = false;
    head.addEventListener('dispose', () => {
      headDisposed = true;
    });
    merged.addEventListener('dispose', () => {
      mergedDisposed = true;
    });

    for (const geo of variantOwnedGeometries(variantRoot, shared)) geo.dispose();

    expect(mergedDisposed).toBe(true); // the evicted variant's own buffer went back
    expect(headDisposed).toBe(false); // ...and the shared one did not
    // The survivor still draws from a live buffer.
    const otherHead = otherRoot.getObjectByName('head') as THREE.Mesh;
    expect(otherHead.geometry).toBe(head);
    expect(otherHead.geometry.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('claims everything when nothing is shared (a fully merged root)', () => {
    const { variantRoot } = scene();
    expect(variantOwnedGeometries(variantRoot, new Set())).toHaveLength(4);
  });
});
