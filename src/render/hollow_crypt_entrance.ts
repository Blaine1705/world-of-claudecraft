// The Fallen Chapel, the Hollow Crypt's world entrance (door (80, 90),
// Eastbrook Vale): the four Blender GLBs (the south gable with the crypt
// stair-house and the nave's furnishings, the nave walls and apse, the
// churchyard with its lychgate and dead yew, the render-only growth) seated on
// the door's terrain height, plus its cosmetic layer:
//   - the STAIR behind the portal: a box of three flat windows in the
//     stair-house whose shader traces a virtual flight of steps going down
//     into a breathing violet dark. This is the door's portal look; the door body
//     itself is only the invisible click box (door_portal.ts
//     doorArchAuthoredElsewhere), and it draws on every tier;
//   - the soul light, the one point light (a fire-light sink source);
//   - the grave mist, ONE instanced draw of soft noise-broken puffs pouring
//     over the sill, down the nave and between the headstones;
//   - the spirit sprites, ONE instanced additive draw: every candle's flame
//     and halo, rising motes, the will-o-wisps of the nave after dusk and the
//     pale glow in the empty rose window.
// Pure placement and motion math lives in hollow_crypt_entrance_core.ts; what
// collides is src/sim/hollow_crypt_entrance.ts.
//
// Built once at boot as a static zone feature (static_world_features.ts), so it
// attaches through the renderer's gated attach (its programs link before its
// first visible frame), freezes its matrices and culls with the fog sweep.
// Everything moves on the shared uTime clock in its vertex or fragment shader;
// the only per-frame CPU is one uniform write (the time of day and the
// reduced-motion switch) from the mist's onBeforeRender.
import * as THREE from 'three';
import { resolveUiEffectsProfile } from '../game/ui_effects_profile';
import { DUNGEONS } from '../sim/data';
import { HOLLOW_CRYPT_ENTRANCE_DUNGEON_ID } from '../sim/hollow_crypt_entrance';
import { terrainHeight } from '../sim/world';
import { loadGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';
import { currentDayNightPhase } from './day_night_clock';
import { floorVfxRenderOrder } from './floor_vfx_layer';
import { GFX, sharedUniforms, surfaceMat } from './gfx';
import {
  CRYPT_MIST_FIELDS,
  CRYPT_SOUL_LIGHT,
  CRYPT_STAIR,
  type CryptEffectsTier,
  type CryptMistPose,
  type CryptSpritePose,
  cryptMistPose,
  cryptMistPuff,
  cryptMistPuffCount,
  cryptNightAmount,
  cryptSpritePose,
  cryptSprites,
} from './hollow_crypt_entrance_core';
import { mistNoiseTexture } from './ignivar_mist_gate';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

const MAIN_URL = '/models/props/hollow_crypt_entrance.glb';
const WALLS_URL = '/models/props/hollow_crypt_entrance_walls.glb';
const PROPS_URL = '/models/props/hollow_crypt_entrance_props.glb';
const GROWTH_URL = '/models/props/hollow_crypt_entrance_growth.glb';
const URLS = [MAIN_URL, WALLS_URL, PROPS_URL, GROWTH_URL] as const;
const sources = new Map<string, THREE.Group>();
if (typeof window !== 'undefined') {
  for (const url of URLS) {
    registerDeferredPreload(() =>
      loadGltf(url).then((gltf) => {
        sources.set(url, gltf.scene);
      }),
    );
  }
}
export const hollowCryptEntrancePreloadInternalsForTest = { urls: [...URLS] };

export const CRYPT_STAIR_PROGRAM_CACHE_KEY = 'hollow-crypt-stair-v1';
export const CRYPT_MIST_PROGRAM_CACHE_KEY = 'hollow-crypt-grave-mist-v1';
export const CRYPT_SPRITE_PROGRAM_CACHE_KEY = 'hollow-crypt-spirit-sprites-v1';

export interface HollowCryptEntranceView {
  group: THREE.Group;
  glowLights: THREE.PointLight[];
  cullGroups: THREE.Group[];
}

/** x: the night amount (0 day, 1 night); y: motion (1, or 0 under reduced
 *  motion). One object shared by the three effect programs. */
const cryptUniforms = { uCrypt: { value: new THREE.Vector2(0, 1) } };

// ---- materials (module-lifetime, shared) ------------------------------------------

let voidMat: THREE.MeshBasicMaterial | null = null;

/** The lit slots go through surfaceMat every time (it caches per graphics
 *  tier, so a live profile switch gets the new tier's material); the void
 *  behind the stair is unlit black on every tier. */
function kitMaterial(name: string): THREE.Material {
  if (name === 'KitVoid') {
    if (!voidMat) {
      const m = new THREE.MeshBasicMaterial({ color: 0x000000 });
      m.name = 'HollowCryptStairVoid';
      voidMat = markSharedMaterial(m);
    }
    return voidMat;
  }
  if (name === 'KitLeaf') {
    return surfaceMat({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide });
  }
  return surfaceMat({ vertexColors: true, roughness: 0.92 });
}

function seat(source: THREE.Group, castShadow: boolean): THREE.Group {
  const model = source.clone(true);
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    markSharedGeometry(node.geometry);
    const swap = (m: THREE.Material) => kitMaterial(m.name);
    node.material = Array.isArray(node.material) ? node.material.map(swap) : swap(node.material);
    node.castShadow = castShadow;
    node.receiveShadow = true;
  });
  return model;
}

/** Pre-load and headless stand-in: the gable and the stair-house as plain
 *  blocks, so the colliders are never invisible walls if a GLB is missing. */
function fallbackChapel(): THREE.Group {
  const root = new THREE.Group();
  const stone = surfaceMat({ color: 0xb9b19c, roughness: 0.92 });
  const box = markSharedGeometry(new THREE.BoxGeometry(1, 1, 1));
  for (const [x, y, z, w, h, d] of [
    [5.9, 5, -22, 7.4, 10, 1.2],
    [-5.9, 4, -22, 7.4, 8, 1.2],
    [2.35, 2.9, 2.3, 2.1, 5.8, 6],
    [-2.35, 2.6, 2.3, 2.1, 5.2, 6],
    [0, 6.4, -0.1, 6.8, 2.2, 1.3],
  ] as const) {
    const mesh = new THREE.Mesh(box, stone);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    root.add(mesh);
  }
  return root;
}

// ---- the stair behind the portal ---------------------------------------------------

const st = CRYPT_STAIR;
const fx = (v: number) => v.toFixed(3);

// Mirrors cryptStairTrace and cryptStairBreath (hollow_crypt_entrance_core.ts).
const STAIR_COMMON = `
uniform float uTime;
uniform vec2 uCrypt;
varying vec3 vCryptP;
varying vec3 vCryptC;
float cryptHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cryptNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cryptHash(i), cryptHash(i + vec2(1.0, 0.0)), f.x),
             mix(cryptHash(i + vec2(0.0, 1.0)), cryptHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 cryptWell(vec3 o, vec3 d) {
  const float HW = ${fx(st.halfWidth)};
  const float Z0 = ${fx(st.z0)};
  const float Z1 = ${fx(st.z1)};
  const float Y0 = ${fx(st.y)};
  const float APEX = ${fx(st.apex)};
  const float PITCH = ${fx((st.apex - st.spring) / st.halfWidth)};
  const float LIP = ${fx(st.lip)};
  const float TREAD = ${fx(st.tread)};
  const float RISER = ${fx(st.riser)};
  const float SLOPE = ${fx(st.riser / st.tread)};
  const float ZEND = ${fx(st.z0 + st.steps * st.tread)};
  float best = 1.0e5;
  float kind = 0.0;
  float stepK = 0.0;
  for (int k = 0; k < ${st.steps}; k++) {
    float fk = float(k);
    float zk = Z0 + fk * TREAD;
    float yk = Y0 - LIP - fk * RISER;
    if (d.y < -1.0e-4) {
      float t = (yk - o.y) / d.y;
      float z = o.z + d.z * t;
      if (t > 0.0 && t < best && z >= zk && z <= zk + TREAD) { best = t; kind = 1.0; stepK = fk; }
    }
    if (d.z < -1.0e-4) {
      float t = (zk + TREAD - o.z) / d.z;
      float y = o.y + d.y * t;
      if (t > 0.0 && t < best && y <= yk && y >= yk - RISER) { best = t; kind = 2.0; stepK = fk; }
    }
  }
  if (abs(d.x) > 1.0e-4) {
    float t = ((d.x > 0.0 ? HW : -HW) - o.x) / d.x;
    if (t > 0.0 && t < best) { best = t; kind = 3.0; }
  }
  for (int v = 0; v < 2; v++) {
    float side = v == 0 ? -1.0 : 1.0;
    float dn = d.y + PITCH * side * d.x + SLOPE * d.z;
    if (dn > 1.0e-4) {
      float t = (APEX - o.y - PITCH * side * o.x - SLOPE * (o.z - Z1)) / dn;
      if (t > 0.0 && t < best && side * (o.x + d.x * t) >= 0.0) { best = t; kind = 4.0; }
    }
  }
  if (d.z > 1.0e-4) {
    float t = (ZEND - o.z) / d.z;
    if (t > 0.0 && t < best) { best = t; kind = 0.0; }
  }
  float tt = min(best, 40.0);
  vec3 p = o + d * tt;
  float depth = max(0.0, Y0 - p.y);
  float tm = uTime * uCrypt.y;
  float breath = 0.72 + 0.28 * sin(tm * 0.9 - depth * 1.3);
  float night = uCrypt.x;
  // Daylight falls in through the broken vault and is gone a few steps down
  // (sooner under the solid ground past the well's back); the soul light
  // rises from below and owns the rest.
  float day = exp(-depth * 0.85 - max(0.0, p.z - Z1) * 0.6) * (1.0 - 0.93 * night);
  float soul = (1.0 - exp(-depth * 0.5)) * breath * (1.0 + 0.6 * night);
  vec3 stone = vec3(0.07, 0.066, 0.078);
  vec3 violet = vec3(0.2, 0.075, 0.62);
  vec3 col;
  if (kind < 0.5) {
    // The foot of the flight: no wall, only the light's own heart, low and soft.
    float gx = exp(-p.x * p.x * 1.1);
    float gy = 1.0 - smoothstep(Y0 - 5.6, Y0 - 2.6, p.y);
    col = violet * 0.75 * gx * (0.15 + 0.85 * gy) * breath * (1.0 + 0.6 * night);
  } else if (kind < 1.5) {
    float u = (p.z - (Z0 + stepK * TREAD)) / TREAD;
    float wear = 0.78 + 0.22 * cryptNoise(vec2(p.x * 3.0, stepK * 7.0)) - 0.22 * exp(-p.x * p.x * 1.6);
    float nose = smoothstep(0.84, 1.0, u);
    col = stone * wear * (day * 1.7 + 0.035) * (0.45 + 0.55 * smoothstep(0.0, 0.32, u));
    col += violet * soul * (0.1 + 1.25 * nose);
  } else if (kind < 2.5) {
    col = stone * 0.2 + violet * soul * 0.9;
  } else if (kind < 3.5) {
    float row = floor(p.y / 0.42);
    float cy = fract(p.y / 0.42);
    float cz = fract(p.z / 0.92 + row * 0.37);
    float joint = 1.0 - min(smoothstep(0.0, 0.07, min(cy, 1.0 - cy)), smoothstep(0.0, 0.035, min(cz, 1.0 - cz)));
    float tone = 0.78 + 0.3 * cryptHash(vec2(row, floor(p.z / 0.92 + row * 0.37)));
    // The flight's own shadow line climbs the wall: brighter just above the treads.
    float above = p.y - (Y0 - LIP - SLOPE * (p.z - Z0));
    float graze = exp(-max(0.0, above) * 0.9);
    col = stone * tone * (1.0 - 0.5 * joint) * (day * 1.3 + 0.03);
    col += violet * soul * (0.1 + 0.5 * graze) * (1.0 - 0.45 * joint);
  } else {
    float ribs = 1.0 - smoothstep(0.0, 0.1, abs(fract(p.z / 1.4) - 0.5) - 0.42);
    col = stone * (day * 0.6 + 0.02) * (1.0 - 0.4 * ribs) + violet * soul * 0.16;
  }
  // Two sheets of mist lying on the flight, drifting up it, lit from below.
  float den = d.y + SLOPE * d.z;
  for (int s = 0; s < 2; s++) {
    float h = 0.28 + float(s) * 0.6;
    if (den < -1.0e-4) {
      float t = (Y0 - LIP + h - o.y - SLOPE * (o.z - Z0)) / den;
      if (t > 0.0 && t < tt) {
        vec3 q = o + d * t;
        float n = cryptNoise(q.xz * 1.4 + vec2(float(s) * 9.0, tm * 0.11))
                * cryptNoise(q.xz * 3.3 - vec2(tm * 0.05, float(s) * 4.0 + tm * 0.2));
        float dq = max(0.0, Y0 - q.y);
        float a = n * (1.0 - exp(-dq * 0.8)) * (0.5 + 0.5 * breath);
        col += (violet * 0.85 + vec3(0.05, 0.05, 0.08)) * a * (1.0 + 0.6 * night);
      }
    }
  }
  // The glow thickens with the length of dark the eye looks through.
  float haze = (1.0 - exp(-tt * 0.05)) * (1.0 - exp(-depth * 0.6));
  col += violet * 0.3 * haze * breath * (1.0 + 0.6 * night);
  return col;
}`;

let stairMat: THREE.MeshBasicMaterial | null = null;

function stairMaterial(): THREE.MeshBasicMaterial {
  if (stairMat) return stairMat;
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uCrypt = cryptUniforms.uCrypt;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vCryptP;\nvarying vec3 vCryptC;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvCryptP = position;\nvCryptC = cameraPosition - modelMatrix[3].xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${STAIR_COMMON}`)
      .replace(
        '#include <map_fragment>',
        'diffuseColor.rgb = cryptWell(vCryptP, normalize(vCryptP - vCryptC));',
      );
  };
  material.customProgramCacheKey = () => CRYPT_STAIR_PROGRAM_CACHE_KEY;
  material.name = 'HollowCryptStair';
  stairMat = markSharedMaterial(material);
  return stairMat;
}

/** The window box the stair is seen through (its front behind the sill, its
 *  lid a yard up over the meadow grass, its back the vault's own pointed
 *  opening): one geometry, one draw. */
function stairWindows(): THREE.Mesh {
  const s = CRYPT_STAIR;
  const w = s.halfWidth;
  const positions = [
    [-w, s.y, s.z0],
    [w, s.y, s.z0],
    [w, s.lid, s.z0],
    [-w, s.lid, s.z0],
    [-w, s.lid, s.z0],
    [w, s.lid, s.z0],
    [w, s.lid, s.z1],
    [-w, s.lid, s.z1],
    [-w, s.lid, s.z1],
    [w, s.lid, s.z1],
    [w, s.spring, s.z1],
    [0, s.apex, s.z1],
    [-w, s.spring, s.z1],
  ].flat();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 8, 9, 10, 8, 10, 12, 12, 10, 11]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, stairMaterial());
  mesh.name = 'hollowCryptStair';
  return mesh;
}

// ---- the grave mist (one instanced draw) -------------------------------------------

let puffTex: THREE.CanvasTexture | null = null;
let mistMat: THREE.MeshBasicMaterial | null = null;

function puffTexture(): THREE.CanvasTexture | null {
  if (puffTex) return puffTex;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(canvas);
  return puffTex;
}

// The vertex stage mirrors cryptMistPose: the puff's centre drifts along its
// own lane and widens, the quad faces the camera and lies low and wide.
const MIST_VERTEX = `float cT = fract(aA.z + uTime * aA.w * uCrypt.y);
vec3 cCenter = vec3(
  aA.x + aB.x * cT + sin(uTime * 0.21 * uCrypt.y + aA.z * 6.2831853) * 0.35,
  aB.w + 0.25 * cT,
  aA.y + aB.y * cT);
float cScale = aB.z * (0.75 + 0.9 * cT);
vec4 mvPosition = modelViewMatrix * vec4(cCenter, 1.0);
mvPosition.xy += position.xy * vec2(cScale, cScale * 0.42);
vCryptPuff = vec2(smoothstep(0.0, 0.18, cT) * (1.0 - smoothstep(0.6, 1.0, cT)), aA.z);
gl_Position = projectionMatrix * mvPosition;`;

const MIST_FRAGMENT = `#include <map_fragment>
vec2 cUv = vMapUv * vec2(1.5, 0.66) + vec2(vCryptPuff.y * 7.0 + uTime * 0.016 * uCrypt.y, vCryptPuff.y * 3.0);
float cWisp = texture2D(uCryptNoise, cUv).r;
float cHole = texture2D(uCryptNoise, cUv * 2.3 + vec2(0.37, uTime * 0.011 * uCrypt.y)).r;
diffuseColor.rgb = mix(vec3(0.66, 0.68, 0.8), vec3(0.36, 0.33, 0.74), uCrypt.x);
diffuseColor.a *= vCryptPuff.x * smoothstep(0.04, 0.3, cWisp) * (0.45 + 1.4 * cHole) * (0.4 + 0.6 * uCrypt.x);`;

function graveMistMaterial(): THREE.MeshBasicMaterial {
  if (mistMat) return mistMat;
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: puffTexture() ?? undefined,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uCrypt = cryptUniforms.uCrypt;
    shader.uniforms.uCryptNoise = { value: mistNoiseTexture() };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 aA;\nattribute vec4 aB;\nuniform float uTime;\nuniform vec2 uCrypt;\nvarying vec2 vCryptPuff;',
      )
      .replace('#include <project_vertex>', MIST_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uTime;\nuniform vec2 uCrypt;\nuniform sampler2D uCryptNoise;\nvarying vec2 vCryptPuff;',
      )
      .replace('#include <map_fragment>', MIST_FRAGMENT);
  };
  material.customProgramCacheKey = () => CRYPT_MIST_PROGRAM_CACHE_KEY;
  material.name = 'HollowCryptGraveMist';
  mistMat = markSharedMaterial(material);
  return mistMat;
}

let motionMql: MediaQueryList | null | undefined;
let lastMotionCheck = -10;

/** Reduced motion, the game's own two sources: the OS query and the in-game
 *  switch's body class (main.ts keeps it). Read at most once a second. */
function motionNow(time: number): void {
  if (time - lastMotionCheck < 1 && time >= lastMotionCheck) return;
  lastMotionCheck = time;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (motionMql === undefined) {
    motionMql = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  }
  const reduced =
    (motionMql?.matches ?? false) || document.body.classList.contains('reduce-motion');
  cryptUniforms.uCrypt.value.y = reduced ? 0 : 1;
}

function graveMist(
  tier: CryptEffectsTier,
  door: { x: number; z: number },
  base: number,
  seed: number,
): THREE.InstancedMesh {
  const count = cryptMistPuffCount(tier);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const a = new Float32Array(count * 4);
  const b = new Float32Array(count * 4);
  const mesh = new THREE.InstancedMesh(geometry, graveMistMaterial(), count);
  // The shader ignores these matrices; they are seeded across each puff's own
  // drift so the fog sweep's footprint measurement at attach sees the spread.
  const m = new THREE.Matrix4();
  const pose: CryptMistPose = { x: 0, y: 0, z: 0, scale: 0, alpha: 0 };
  for (let i = 0; i < count; i++) {
    const p = cryptMistPuff(i, count);
    // Each puff rides the ground under the middle of its own drift.
    const ground =
      terrainHeight(door.x + p.ox + p.dx * 0.5, door.z + p.oz + p.dz * 0.5, seed) - base;
    a.set([p.ox, p.oz, p.phase, p.speed], i * 4);
    b.set([p.dx, p.dz, p.size, ground + p.y], i * 4);
    cryptMistPose(p, (i / count) * 4, 0, pose);
    m.makeTranslation(pose.x, ground + pose.y, pose.z);
    mesh.setMatrixAt(i, m);
  }
  geometry.setAttribute('aA', new THREE.InstancedBufferAttribute(a, 4));
  geometry.setAttribute('aB', new THREE.InstancedBufferAttribute(b, 4));
  // Every puff travels its whole lane in the shader, away from its seeded
  // matrix: frustum culling would drop puffs still on screen. The chapel's
  // cull group (the fog sweep) still sheds it with the rest of the set piece.
  mesh.frustumCulled = false;
  mesh.renderOrder = floorVfxRenderOrder('ground', 1);
  mesh.name = 'hollowCryptGraveMist';
  mesh.onBeforeRender = () => {
    cryptUniforms.uCrypt.value.x = cryptNightAmount(currentDayNightPhase());
    motionNow(sharedUniforms.uTime.value);
  };
  return mesh;
}

// ---- the spirit sprites (one instanced additive draw) ------------------------------

let spriteMat: THREE.MeshBasicMaterial | null = null;

// Mirrors cryptSpritePose: kind 0 flame, 1 halo, 2 mote, 3 wisp, 4 rose glow.
const SPRITE_VERTEX = `float cK = aK.z;
float cTm = uTime * uCrypt.y;
float cN = uCrypt.x;
vec3 cC = aS.xyz;
vec2 cSz = vec2(aS.w);
float cA = 1.0;
if (cK < 0.5) {
  float fl = sin(cTm * 11.0 + aK.x * 40.0) * sin(cTm * 7.3 + aK.x * 17.0);
  cSz = vec2(aS.w * 0.5, aS.w * (1.0 + 0.16 * fl));
  cC.x += sin(cTm * 5.1 + aK.x * 23.0) * 0.012;
  cC.y += cSz.y * 0.42;
  cA = 0.9 + 0.1 * fl;
} else if (cK < 1.5) {
  cA = (0.3 + 0.5 * cN) * (0.86 + 0.14 * sin(cTm * 3.1 + aK.x * 6.2831853));
} else if (cK < 2.5) {
  float t = fract(aK.x + cTm * aK.y);
  cC.x += sin(cTm * 0.9 + aK.x * 31.0) * 0.22 * t;
  cC.y += aK.w * t;
  cC.z += cos(cTm * 0.7 + aK.x * 19.0) * 0.22 * t;
  cA = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.55, 1.0, t)) * (0.55 + 0.45 * cN);
} else if (cK < 3.5) {
  float a = cTm * aK.y + aK.x * 6.2831853;
  cC.x += sin(a) * aK.w;
  cC.y += sin(a * 1.7 + aK.x * 9.0) * 0.45;
  cC.z += cos(a * 0.8 + aK.x * 4.0) * aK.w;
  cA = cN * (0.55 + 0.45 * sin(uTime * 0.6 + aK.x * 11.0));
} else {
  cA = cN * (0.8 + 0.2 * sin(uTime * 0.4 + aK.x * 6.2831853));
}
vec4 mvPosition = modelViewMatrix * vec4(cC, 1.0);
mvPosition.xy += position.xy * cSz;
vCryptQ = position.xy;
vCryptS = vec2(cK, cA);
gl_Position = projectionMatrix * mvPosition;`;

const SPRITE_FRAGMENT = `vec2 cQ = vCryptQ;
float cKind = vCryptS.x;
vec3 cCol;
float cAl;
if (cKind < 0.5) {
  // A flame: a teardrop with a white-violet heart.
  float y = cQ.y + 0.5;
  float w = 1.1 * sqrt(max(0.0, y)) * (1.0 - y) + 0.03;
  float e = abs(cQ.x) / w;
  float core = (1.0 - smoothstep(0.0, 0.6, e)) * (1.0 - smoothstep(0.1, 0.8, y));
  cAl = (1.0 - smoothstep(0.2, 1.0, e)) * smoothstep(0.0, 0.07, y);
  cCol = mix(vec3(0.5, 0.2, 1.0), vec3(1.0, 0.92, 1.0), core) * (1.7 + 1.8 * core);
} else {
  float r = clamp(1.0 - length(cQ) * 2.0, 0.0, 1.0);
  float g = r * r;
  if (cKind < 1.5) {
    cCol = vec3(0.5, 0.25, 1.0) * 0.5;
    cAl = g;
  } else if (cKind < 2.5) {
    cCol = vec3(0.72, 0.5, 1.0) * 2.2;
    cAl = r;
  } else if (cKind < 3.5) {
    float heart = clamp(1.0 - length(cQ) * 5.5, 0.0, 1.0);
    cCol = vec3(0.4, 0.82, 0.95) * (0.65 + 3.2 * heart * heart);
    cAl = g * r;
  } else {
    cCol = vec3(0.6, 0.7, 1.0) * 0.42;
    cAl = g;
  }
}
diffuseColor = vec4(cCol, cAl * vCryptS.y);`;

function spriteMaterial(): THREE.MeshBasicMaterial {
  if (spriteMat) return spriteMat;
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // additive light may only fade toward black: no fog-coloured glow
    fog: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uCrypt = cryptUniforms.uCrypt;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 aS;\nattribute vec4 aK;\nuniform float uTime;\nuniform vec2 uCrypt;\nvarying vec2 vCryptQ;\nvarying vec2 vCryptS;',
      )
      .replace('#include <project_vertex>', SPRITE_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vCryptQ;\nvarying vec2 vCryptS;',
      )
      .replace('#include <map_fragment>', SPRITE_FRAGMENT);
  };
  material.customProgramCacheKey = () => CRYPT_SPRITE_PROGRAM_CACHE_KEY;
  material.name = 'HollowCryptSpiritSprites';
  spriteMat = markSharedMaterial(material);
  return spriteMat;
}

function spiritSprites(tier: CryptEffectsTier): THREE.InstancedMesh {
  const sprites = cryptSprites(tier);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const s = new Float32Array(sprites.length * 4);
  const k = new Float32Array(sprites.length * 4);
  const mesh = new THREE.InstancedMesh(geometry, spriteMaterial(), sprites.length);
  const m = new THREE.Matrix4();
  const pose: CryptSpritePose = { x: 0, y: 0, z: 0, w: 0, h: 0, alpha: 0 };
  sprites.forEach((sp, i) => {
    s.set([sp.x, sp.y, sp.z, sp.size], i * 4);
    k.set([sp.phase, sp.speed, sp.kind, sp.range], i * 4);
    cryptSpritePose(sp, 0, 1, 0, pose);
    m.makeTranslation(pose.x, pose.y, pose.z);
    mesh.setMatrixAt(i, m);
  });
  geometry.setAttribute('aS', new THREE.InstancedBufferAttribute(s, 4));
  geometry.setAttribute('aK', new THREE.InstancedBufferAttribute(k, 4));
  // Motes rise and wisps wander away from their seeded matrices.
  mesh.frustumCulled = false;
  mesh.renderOrder = floorVfxRenderOrder('ground', 2);
  mesh.name = 'hollowCryptSpiritSprites';
  return mesh;
}

/** Build the Fallen Chapel (world coordinates). */
export function buildHollowCryptEntrance(seed: number): HollowCryptEntranceView {
  const door = DUNGEONS[HOLLOW_CRYPT_ENTRANCE_DUNGEON_ID].doorPos;
  const base = terrainHeight(door.x, door.z, seed);
  const group = new THREE.Group();
  group.name = 'hollowCryptEntrance';
  const chapel = new THREE.Group();
  chapel.name = 'hollowCryptEntranceBody';
  chapel.position.set(door.x, base, door.z);
  const main = sources.get(MAIN_URL);
  chapel.add(main ? seat(main, true) : fallbackChapel());
  for (const url of [WALLS_URL, PROPS_URL]) {
    const source = sources.get(url);
    if (source) chapel.add(seat(source, true));
  }
  const growth = sources.get(GROWTH_URL);
  if (growth) chapel.add(seat(growth, false));
  chapel.add(stairWindows());
  const tier = resolveUiEffectsProfile({
    presetLabel: GFX.tier,
    effectsQuality: 1,
    reduceMotion: false,
  }).tier;
  chapel.add(graveMist(tier, door, base, seed));
  chapel.add(spiritSprites(tier));
  group.add(chapel);
  const light = new THREE.PointLight(
    CRYPT_SOUL_LIGHT.color,
    CRYPT_SOUL_LIGHT.intensity,
    CRYPT_SOUL_LIGHT.distance,
    2,
  );
  light.position.set(
    door.x + CRYPT_SOUL_LIGHT.lx,
    base + CRYPT_SOUL_LIGHT.y,
    door.z + CRYPT_SOUL_LIGHT.lz,
  );
  group.add(light);
  return { group, glowLights: [light], cullGroups: [chapel] };
}

export const hollowCryptEntranceInternalsForTest = {
  kitMaterial,
  stairMaterial,
  graveMistMaterial,
  spriteMaterial,
  stairCommon: STAIR_COMMON,
  mistVertex: MIST_VERTEX,
  spriteVertex: SPRITE_VERTEX,
  mistFieldCount: CRYPT_MIST_FIELDS.length,
  uniforms: cryptUniforms,
  resetCaches(): void {
    voidMat = stairMat = mistMat = spriteMat = null;
    puffTex = null;
    lastMotionCheck = -10;
  },
};
