// The ambient life layer: bird flocks drifting over the fog-free vista and
// smoke columns rising from the world's campfires. Two draw calls total,
// both fully GPU-animated off the shared uTime clock (zero per-frame CPU
// beyond a visibility flag), built once from static world content plus the
// seed. Plans live in ambient_life_core.ts (pure, Node-tested); this file
// owns only the Three objects and shaders.
//
// The layer is deliberately COSMETIC: it reads no sim state (see the
// fairness contract in the core), so it adds life to the horizon without
// telling anyone where a real creature stands.

import * as THREE from 'three';
import { getActiveWorldContent } from '../sim/data';
import {
  type BirdFlockPlan,
  planBirdFlocks,
  planSmokeColumns,
  type SmokeColumnPlan,
} from './ambient_life_core';
import { sharedUniforms } from './gfx';
import { birdSpriteTexture, smokeColumnTexture } from './textures';

export interface AmbientLifeView {
  group: THREE.Group;
  /** Per-frame: the layer shows only outdoors. */
  update(outdoor: boolean): void;
  dispose(): void;
}

// Birds fade out where they would be sub-pixel anyway; smoke carries a bit
// farther (a column is bigger than a gull).
const BIRD_FAR = 1500;
const SMOKE_FAR = 1900;
// Smoke fades IN beyond the near band: up close the campfire's own flame
// and particle effects carry the fire, and a giant billboard overhead would
// double them.
const SMOKE_NEAR_IN = 90;

function buildBirds(seed: number): THREE.InstancedMesh {
  const flocks = planBirdFlocks(seed);
  const total = flocks.reduce((sum, f) => sum + f.count, 0);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex([0, 1, 2, 2, 1, 3]);

  const anchor = new Float32Array(total * 3);
  const orbit = new Float32Array(total * 4); // radius, speed, phase, size
  const flap = new Float32Array(total);
  let i = 0;
  for (const f of flocks) {
    for (let b = 0; b < f.count; b++) {
      anchor[i * 3] = f.x;
      anchor[i * 3 + 1] = f.y + Math.sin(b * 2.7) * 1.6;
      anchor[i * 3 + 2] = f.z;
      orbit[i * 4] = f.radius + Math.sin(b * 4.1) * 3;
      orbit[i * 4 + 1] = f.speed;
      // birds trail each other around the ring
      orbit[i * 4 + 2] = f.phase + (b / f.count) * 0.9;
      orbit[i * 4 + 3] = f.size;
      flap[i] = f.flapRate * (0.92 + 0.16 * ((b * 37) % 5) * 0.2);
      i++;
    }
  }
  geo.setAttribute('aBirdAnchor', new THREE.InstancedBufferAttribute(anchor, 3));
  geo.setAttribute('aBirdOrbit', new THREE.InstancedBufferAttribute(orbit, 4));
  geo.setAttribute('aBirdFlap', new THREE.InstancedBufferAttribute(flap, 1));

  const mat = new THREE.MeshBasicMaterial({
    map: birdSpriteTexture(),
    alphaTest: 0.3,
    side: THREE.DoubleSide,
    fog: false,
  });
  mat.name = 'ambient:birds';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uBirdFar = { value: BIRD_FAR };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uBirdFar;
        attribute vec3 aBirdAnchor;
        attribute vec4 aBirdOrbit;
        attribute float aBirdFlap;
        varying vec2 vBirdUv;`,
      )
      .replace(
        '#include <begin_vertex>',
        `float birdAng = aBirdOrbit.z * 6.2831853 + uTime * aBirdOrbit.y;
        vec3 birdCenter = aBirdAnchor
          + vec3(cos(birdAng) * aBirdOrbit.x, sin(uTime * 0.9 + aBirdOrbit.z * 7.0) * 1.2, sin(birdAng) * aBirdOrbit.x);
        float birdDist = distance(birdCenter.xz, cameraPosition.xz);
        if (birdDist > uBirdFar) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        // camera-facing quad
        vec3 birdFwd = normalize(vec3(cameraPosition.x - birdCenter.x, 0.0, cameraPosition.z - birdCenter.z));
        vec3 birdRight = normalize(cross(vec3(0.0, 1.0, 0.0), birdFwd));
        // two-frame flap: left half of the sheet, or right
        float birdFrame = step(0.5, fract(uTime * aBirdFlap + aBirdOrbit.z * 3.0));
        vBirdUv = vec2((uv.x + birdFrame) * 0.5, uv.y);
        vec3 birdWorld = birdCenter
          + birdRight * (position.x * aBirdOrbit.w)
          + vec3(0.0, position.y * aBirdOrbit.w * 0.55, 0.0);
        vec3 transformed = birdWorld;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vBirdUv;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          diffuseColor *= texture2D( map, vBirdUv );
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'ambient-birds';

  const mesh = new THREE.InstancedMesh(geo, mat, total);
  const identity = new THREE.Matrix4();
  for (let k = 0; k < total; k++) mesh.setMatrixAt(k, identity);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'ambient-birds';
  mesh.frustumCulled = false; // positions live in the shader; 2 tris a bird
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function buildSmoke(plans: SmokeColumnPlan[]): THREE.InstancedMesh {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex([0, 1, 2, 2, 1, 3]);

  const base = new Float32Array(plans.length * 3);
  const dims = new Float32Array(plans.length * 3); // width, height, phase
  plans.forEach((p, i) => {
    base[i * 3] = p.x;
    base[i * 3 + 1] = p.y;
    base[i * 3 + 2] = p.z;
    dims[i * 3] = p.width;
    dims[i * 3 + 1] = p.height;
    dims[i * 3 + 2] = p.phase;
  });
  geo.setAttribute('aSmokeBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aSmokeDims', new THREE.InstancedBufferAttribute(dims, 3));

  const mat = new THREE.MeshBasicMaterial({
    map: smokeColumnTexture(),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    opacity: 0.62,
  });
  mat.name = 'ambient:smoke';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uSmokeNear = { value: SMOKE_NEAR_IN };
    shader.uniforms.uSmokeFar = { value: SMOKE_FAR };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uSmokeNear;
        uniform float uSmokeFar;
        attribute vec3 aSmokeBase;
        attribute vec3 aSmokeDims;
        varying vec2 vSmokeUv;
        varying float vSmokeFade;`,
      )
      .replace(
        '#include <begin_vertex>',
        `float smokeDist = distance(aSmokeBase.xz, cameraPosition.xz);
        vSmokeFade = smoothstep(uSmokeNear, uSmokeNear + 90.0, smokeDist)
          * (1.0 - smoothstep(uSmokeFar * 0.75, uSmokeFar, smokeDist));
        if (vSmokeFade <= 0.001) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        vec3 smokeFwd = normalize(vec3(cameraPosition.x - aSmokeBase.x, 0.0, cameraPosition.z - aSmokeBase.z));
        vec3 smokeRight = normalize(cross(vec3(0.0, 1.0, 0.0), smokeFwd));
        // the column leans and swells gently; the texture scrolls upward
        float sway = sin(uTime * 0.35 + aSmokeDims.z) * 0.18;
        vec3 smokeWorld = aSmokeBase
          + smokeRight * (position.x * aSmokeDims.x * (1.0 + position.y * 0.9))
          + vec3(sway * position.y * aSmokeDims.y, position.y * aSmokeDims.y, 0.0);
        vSmokeUv = vec2(uv.x, uv.y - uTime * 0.055 - aSmokeDims.z);
        vec3 transformed = smokeWorld;`,
      )
      .replace(
        '#include <project_vertex>',
        `vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vSmokeUv;
        varying float vSmokeFade;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec4 smokeTex = texture2D( map, vSmokeUv );
          diffuseColor *= smokeTex;
          diffuseColor.a *= vSmokeFade;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'ambient-smoke';

  const mesh = new THREE.InstancedMesh(geo, mat, plans.length);
  const identity = new THREE.Matrix4();
  for (let k = 0; k < plans.length; k++) mesh.setMatrixAt(k, identity);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = 'ambient-smoke';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2; // after opaque world, with the other transparents
  return mesh;
}

export function buildAmbientLife(seed: number): AmbientLifeView {
  const group = new THREE.Group();
  group.name = 'ambientLife';
  const birds = buildBirds(seed);
  group.add(birds);
  const smoke = buildSmoke(planSmokeColumns(getActiveWorldContent().props.campfires, seed));
  group.add(smoke);
  return {
    group,
    update(outdoor: boolean): void {
      group.visible = outdoor;
    },
    dispose(): void {
      for (const mesh of [birds, smoke]) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material & { map?: THREE.Texture | null }).map?.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    },
  };
}
