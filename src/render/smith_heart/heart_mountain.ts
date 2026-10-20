// The Smith's Heart's mountain (heart_mountain_core.ts plans it): one indexed,
// flat-shaded heightfield of rock round every floor, tinted by height (dark
// basalt down by the chasm, paler granite on the ridges where the storm light
// catches it) with a hashed mottle. Static, one draw; the low tier builds it
// on a coarser grid (fewer facets, the same mountain).

import * as THREE from 'three';
import { surfaceMat } from '../gfx';
import {
  HEART_MOUNTAIN_CHASM,
  heartMountainCellDrawn,
  planHeartMountain,
} from './heart_mountain_core';
import { heartHash } from './heart_plan_core';

const ROCK_LOW = new THREE.Color(0x24221f);
const ROCK_MID = new THREE.Color(0x4a4540);
const ROCK_HIGH = new THREE.Color(0x6e665c);

/** Build the mountain (instance-local). */
export function buildHeartMountain(lowGfx: boolean): THREE.Mesh {
  const g = planHeartMountain(lowGfx ? 5 : 3);
  const count = g.nx * g.nz;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i;
      const h = g.heights[k];
      positions[k * 3] = g.x0 + i * g.cell;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = g.z0 + j * g.cell;
      // Height tint: chasm-dark low, granite high, a mottle on top.
      const t = Math.max(0, Math.min(1, (h - HEART_MOUNTAIN_CHASM) / 150));
      if (t < 0.45) c.copy(ROCK_LOW).lerp(ROCK_MID, t / 0.45);
      else c.copy(ROCK_MID).lerp(ROCK_HIGH, (t - 0.45) / 0.55);
      c.multiplyScalar(0.82 + heartHash(i * 3 + 1, j * 5 - 7) * 0.3);
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < g.nz - 1; j++) {
    for (let i = 0; i < g.nx - 1; i++) {
      if (!heartMountainCellDrawn(g, i, j)) continue;
      const a = j * g.nx + i;
      const b = a + 1;
      const d = a + g.nx;
      const e = d + 1;
      // Alternate the diagonal (a hashed flip), so the facets never line up.
      if (heartHash(i, j) < 0.5) index.push(a, d, b, b, d, e);
      else index.push(a, d, e, a, e, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(
    geometry,
    surfaceMat({ color: 0xffffff, vertexColors: true, roughness: 0.95, flatShading: true }),
  );
  mesh.name = 'smithHeartMountain';
  mesh.matrixAutoUpdate = false;
  return mesh;
}
