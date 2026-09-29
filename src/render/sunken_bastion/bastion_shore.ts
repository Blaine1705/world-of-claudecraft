// The Sunken Bastion's shore: the headland rock the fortress stands on (the
// pure heightfield of bastion_headland_core.ts, wet and black at the tide
// line, barnacled and weed-green just above it, weathered grey higher up),
// and the surf that breaks against every sea-facing cliff foot in white
// bursts of spray.
//
// Render only and cosmetic: the rock lies in the unwalkable void or hidden
// under the terraces, and the spray sheds with the effects tier.

import * as THREE from 'three';
import { SUNKEN_BASTION_SEA_LEVEL } from '../../sim/content/sunken_bastion_layout';
import { rockDetail } from '../authored_field/field_textures';
import { sharedUniforms } from '../gfx';
import { HEADLAND_DROWNED, planHeadlandRock, rockNoise } from './bastion_headland_core';
import { planSurf } from './bastion_plan_core';

/** The headland rock as one mesh (tops of the void between the terraces). */
export function buildHeadlandRock(lowGfx: boolean): THREE.Mesh {
  const grid = planHeadlandRock(lowGfx ? 4 : 2.5);
  const { cols, rows, heights, under, minX, minZ, step } = grid;
  const positions = new Float32Array(cols * rows * 3);
  const colors = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const sea = SUNKEN_BASTION_SEA_LEVEL;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const x = minX + i * step;
      const z = minZ + j * step;
      const y = heights[k];
      positions.set([x, y, z], k * 3);
      uvs.set([x * 0.22, z * 0.22], k * 2);
      const above = y - sea;
      const wet = Math.max(0, 1 - Math.abs(above) / 2.2);
      const weed = Math.max(0, 1 - Math.abs(above - 2.6) / 2.2);
      const lichen = Math.max(0, rockNoise(x * 1.7, z * 1.7) - 0.55) * Math.min(1, above / 10);
      // Dark wet basalt-grey, warmer higher up; the terraces must read first.
      const tone = 0.13 + rockNoise(x, z) * 0.07 + Math.min(0.05, above * 0.0025);
      colors.set(
        [
          tone * 1.05 * (1 - wet * 0.55) + weed * 0.012 + lichen * 0.05,
          tone * (1 - wet * 0.5) + weed * 0.04 + lichen * 0.06,
          tone * 0.9 * (1 - wet * 0.45) + weed * 0.01 + lichen * 0.03,
        ],
        k * 3,
      );
    }
  }
  const indices: number[] = [];
  const drowned = (k: number) => heights[k] <= HEADLAND_DROWNED + 0.01;
  for (let j = 0; j + 1 < rows; j++) {
    for (let i = 0; i + 1 < cols; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // Skip what hides under a terrace or lies deep under the waves.
      if (under[a] && under[b] && under[c] && under[d]) continue;
      if (drowned(a) && drowned(b) && drowned(c) && drowned(d)) continue;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const rock = rockDetail();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: rock.map,
    normalMap: lowGfx ? null : rock.normalMap,
    roughness: 0.92,
    metalness: 0,
    name: 'sunkenBastionHeadland',
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'sunkenBastionHeadland';
  mesh.receiveShadow = true;
  mesh.castShadow = !lowGfx;
  return mesh;
}

// ---- surf ---------------------------------------------------------------------------

const SPRAY_VERT = /* glsl */ `
attribute vec4 aSurf;   // x, z, nx, nz
attribute vec3 aSeed;   // phase, spread, lift
uniform float uTime;
uniform float uSea;
varying float vAlpha;
void main() {
  // Each surf point bursts on its own swell period; its particles fly out and
  // up the cliff foot, then fall back into the foam.
  float period = 5.5 + aSeed.x * 3.0;
  float t = fract(uTime / period + aSeed.x);
  float burst = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.35, 0.6, t));
  float life = clamp(t / 0.6, 0.0, 1.0);
  vec2 n = aSurf.zw;
  vec2 side = vec2(-n.y, n.x);
  vec3 p = vec3(aSurf.x, uSea, aSurf.y);
  float out1 = (0.4 + aSeed.y) * life * 3.0;
  p.xz += n * out1 + side * (aSeed.y - 0.5) * 5.0;
  p.y += (4.0 + aSeed.z * 7.0) * life - 11.0 * life * life + 0.3;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(90.0, (5.0 + aSeed.z * 9.0) * (1.0 + life * 1.5) * (300.0 / max(1.0, -mv.z)));
  vAlpha = burst * (1.0 - life * 0.6) * step(uSea - 0.5, p.y);
}
`;

const SPRAY_FRAG = /* glsl */ `
precision highp float;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 1.8) * vAlpha * 0.55;
  gl_FragColor = vec4(vec3(0.92, 0.95, 0.94), a);
  #include <colorspace_fragment>
}
`;

/** Spray bursting off the surf points (one draw). */
export function buildSurfSpray(density: number): THREE.Points {
  const surf = planSurf(density > 0.8 ? 8 : 14);
  const per = Math.max(6, Math.round(18 * density));
  const n = surf.length * per;
  const aSurf = new Float32Array(n * 4);
  const aSeed = new Float32Array(n * 3);
  let s = 21;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  surf.forEach((p, i) => {
    for (let k = 0; k < per; k++) {
      const idx = i * per + k;
      aSurf.set([p.x, p.z, p.nx, p.nz], idx * 4);
      aSeed.set([p.phase + rnd() * 0.04, rnd(), rnd()], idx * 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSurf', new THREE.BufferAttribute(aSurf, 4));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 3));
  const material = new THREE.ShaderMaterial({
    name: 'sunkenBastionSurf',
    vertexShader: SPRAY_VERT,
    fragmentShader: SPRAY_FRAG,
    uniforms: { uTime: sharedUniforms.uTime, uSea: { value: SUNKEN_BASTION_SEA_LEVEL } },
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const points = new THREE.Points(geo, material);
  points.name = 'sunkenBastionSurf';
  points.frustumCulled = false;
  points.renderOrder = 12;
  return points;
}
