// The Stormbrass Foundry's procedural building blocks (phase 1): a bin that
// gathers transformed primitive geometry per material and merges each
// material's pile into ONE mesh, and the shared material set (polished brass,
// verdigris copper, dark riveted iron, slate, hazard paint, the blue-white
// storm glow). Phase 3 replaces the dressing with the Blender kit; the bin and
// the materials stay for the pieces the kit does not cover.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surfaceMat } from '../gfx';
import { markSharedMaterial } from '../shared_resource';
import { FOUNDRY_PALETTE as P } from './foundry_plan_core';

export type FoundryMat =
  | 'brass'
  | 'verdigris'
  | 'iron'
  | 'stone'
  | 'hazard'
  | 'black'
  | 'wood'
  | 'glow'
  | 'blueprint'
  | 'glass';

let glowMat: THREE.MeshBasicMaterial | null = null;
let blueprintMat: THREE.MeshBasicMaterial | null = null;

/** The shared material for a slot (cached: surfaceMat caches by options). */
export function foundryMaterial(kind: FoundryMat): THREE.Material {
  switch (kind) {
    case 'brass':
      return surfaceMat({ color: P.brass, metalness: 0.75, roughness: 0.38 });
    case 'verdigris':
      return surfaceMat({ color: P.verdigris, metalness: 0.45, roughness: 0.6 });
    case 'iron':
      return surfaceMat({ color: P.iron, metalness: 0.55, roughness: 0.62 });
    case 'stone':
      return surfaceMat({ color: P.stone, roughness: 0.92 });
    case 'hazard':
      return surfaceMat({ color: P.hazard, roughness: 0.7 });
    case 'black':
      return surfaceMat({ color: P.black, roughness: 0.8 });
    case 'wood':
      return surfaceMat({ color: P.wood, roughness: 0.9 });
    case 'glass':
      return surfaceMat({
        color: 0x9fd6ff,
        roughness: 0.15,
        metalness: 0.1,
        emissive: 0x3f8fd6,
        emissiveIntensity: 0.9,
      });
    case 'blueprint':
      if (!blueprintMat) {
        blueprintMat = new THREE.MeshBasicMaterial({
          color: P.blueprint,
          name: 'stormbrassBlueprint',
        });
        markSharedMaterial(blueprintMat);
      }
      return blueprintMat;
    case 'glow':
      if (!glowMat) {
        glowMat = new THREE.MeshBasicMaterial({
          color: P.lightning,
          name: 'stormbrassGlow',
          toneMapped: false,
        });
        markSharedMaterial(glowMat);
      }
      return glowMat;
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

/** Piles of transformed primitives per material, merged at `build`. */
export class PartBin {
  private readonly piles = new Map<FoundryMat, THREE.BufferGeometry[]>();

  /** Add `geo` (consumed) at (x, y, z), turned by `ry` (then `rx`, `rz`), scaled. */
  add(
    mat: FoundryMat,
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    ry = 0,
    scale: [number, number, number] = [1, 1, 1],
    rx = 0,
    rz = 0,
  ): void {
    tmpE.set(rx, ry, rz, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpP.set(x, y, z);
    tmpS.set(scale[0], scale[1], scale[2]);
    tmpM.compose(tmpP, tmpQ, tmpS);
    geo.applyMatrix4(tmpM);
    const pile = this.piles.get(mat) ?? [];
    pile.push(geo);
    this.piles.set(mat, pile);
  }

  /** A box of half extents (hx, hy, hz) centred at (x, y, z). */
  box(
    mat: FoundryMat,
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
    ry = 0,
    rx = 0,
    rz = 0,
  ): void {
    this.add(mat, new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), x, y, z, ry, [1, 1, 1], rx, rz);
  }

  /** An upright cylinder from y0 to y1. */
  cyl(
    mat: FoundryMat,
    x: number,
    y0: number,
    y1: number,
    z: number,
    rTop: number,
    rBottom = rTop,
    segs = 12,
  ): void {
    const h = Math.max(0.01, y1 - y0);
    this.add(mat, new THREE.CylinderGeometry(rTop, rBottom, h, segs), x, (y0 + y1) / 2, z);
  }

  /** A beam (a thin box) from a to b, `r` thick. */
  beam(mat: FoundryMat, a: [number, number, number], b: [number, number, number], r: number): void {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    const geo = new THREE.BoxGeometry(r * 2, len, r * 2);
    const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    tmpP.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpP, tmpQ, tmpS);
    geo.applyMatrix4(tmpM);
    const pile = this.piles.get(mat) ?? [];
    pile.push(geo);
    this.piles.set(mat, pile);
  }

  /** A ring (torus) lying flat at height y. */
  ring(mat: FoundryMat, x: number, y: number, z: number, radius: number, tube: number): void {
    this.add(mat, new THREE.TorusGeometry(radius, tube, 8, 36), x, y, z, 0, [1, 1, 1], Math.PI / 2);
  }

  /** Merge every pile into one mesh per material, under a named group. */
  build(name: string, castShadow = true): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, geos] of this.piles) {
      if (geos.length === 0) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, foundryMaterial(mat));
      mesh.name = `${name}:${mat}`;
      mesh.castShadow = castShadow && mat !== 'glow' && mat !== 'blueprint';
      mesh.receiveShadow = mat !== 'glow';
      group.add(mesh);
    }
    this.piles.clear();
    return group;
  }
}
