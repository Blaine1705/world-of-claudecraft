// The forge-lift antechamber's render half: the car never moves, the
// SURROUNDINGS sell the descent. Two pieces, both attached into the
// approach dressing group (so they compile under the interior's gated
// attach and dispose with it):
//  - the lift gate views (sealed / open portcullis, an in-place template
//    swap the renderer rebuilds on, the raid-gate discipline: both poses
//    share one frame so the threshold never pops), and
//  - the shaft illusion: sheets outside the car's grille walls whose
//    girders and passing floor-lights scroll UPWARD on the shared uTime
//    clock (the car "descends"), plus self-animating ember dust rising
//    through the car. Zero per-frame CPU: every motion lives in shaders
//    driven by sharedUniforms.uTime.
import * as THREE from 'three';
import { IGNIVAR_LIFT_GATE_HALF_WIDTH, IGNIVAR_LIFT_GATE_Z } from '../sim/ignivar_forge_lift';
import { EMISSIVE_GLOW, sharedUniforms, surfaceMat } from './gfx';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

export const IGNIVAR_LIFT_GATE_HEIGHT = 7.2;
export const LIFT_SHAFT_PROGRAM_CACHE_KEY = 'ignivar-lift-shaft-v1';
export const LIFT_DUST_PROGRAM_CACHE_KEY = 'ignivar-lift-dust-v1';

// The car interior the shaft sheets wrap: the entry pocket walled to
// x +-8 by the grille props, z -58 (shell wall) to the gate line.
const CAR_HALF_WIDTH = IGNIVAR_LIFT_GATE_HALF_WIDTH;
const CAR_Z_MIN = -58;
const SHAFT_HEIGHT = 16; // the ignivar double wall course
// Outside the grilles AND the shaft-gap gearwork (the gear_machine at
// x -10.6): the machinery lives between the bars and the moving wall.
const SHAFT_SHEET_X = CAR_HALF_WIDTH + 3.5;

function block(
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The car's inner gate: a full-width iron portcullis. Closed drops the
 *  bars to the floor behind an ember-hot warning strip; open tucks bar
 *  stubs under the track and calms the strip. The shared frame (posts +
 *  track) never changes between poses. */
export function buildIgnivarLiftGate(open: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = open ? 'ignivar-lift-gate-open' : 'ignivar-lift-gate-locked';
  const iron = surfaceMat({ color: 0x241b18, roughness: 0.52, metalness: 0.78 });
  const track = surfaceMat({ color: 0x35281f, roughness: 0.62, metalness: 0.6 });
  const strip = surfaceMat({
    color: open ? 0x7a4326 : 0xff5a18,
    emissive: open ? 0x2a1206 : 0xff2a08,
    emissiveIntensity: open ? EMISSIVE_GLOW * 0.25 : EMISSIVE_GLOW,
    roughness: 0.4,
  });
  const width = CAR_HALF_WIDTH * 2;
  group.add(
    block('left-post', [0.8, IGNIVAR_LIFT_GATE_HEIGHT, 0.9], [-CAR_HALF_WIDTH, 3.6, 0], iron),
  );
  group.add(
    block('right-post', [0.8, IGNIVAR_LIFT_GATE_HEIGHT, 0.9], [CAR_HALF_WIDTH, 3.6, 0], iron),
  );
  group.add(
    block('bar-track', [width + 1.6, 0.9, 1.0], [0, IGNIVAR_LIFT_GATE_HEIGHT - 0.45, 0], track),
  );
  const barCount = 13;
  const barLength = open ? 1.0 : IGNIVAR_LIFT_GATE_HEIGHT - 0.9;
  const barTop = IGNIVAR_LIFT_GATE_HEIGHT - 0.9;
  for (let index = 0; index < barCount; index++) {
    const x = -CAR_HALF_WIDTH + 0.9 + (index / (barCount - 1)) * (width - 1.8);
    group.add(block(`bar-${index}`, [0.22, barLength, 0.22], [x, barTop - barLength / 2, 0], iron));
  }
  group.add(
    block('ember-strip', [width - 1.4, 0.28, 0.5], [0, open ? barTop + 0.2 : 1.6, -0.2], strip),
  );
  return group;
}

// -- the shaft illusion -----------------------------------------------------

/** Splice the descending-shaft scroll into a basic material: girder ridges
 *  and a bright passing floor-light band ride local Y minus uTime, so the
 *  pattern climbs and the static car reads as sinking. */
function decorateShaftMaterial(material: THREE.MeshBasicMaterial): THREE.MeshBasicMaterial {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec2 vLiftShaft;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vLiftShaft = vec2(position.x, position.y);`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
varying vec2 vLiftShaft;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float liftPhase = fract(vLiftShaft.y * 0.09 - uTime * 0.55);
float liftGirder = smoothstep(0.0, 0.045, liftPhase) * smoothstep(0.13, 0.085, liftPhase);
float liftBand = smoothstep(0.47, 0.505, liftPhase) * smoothstep(0.585, 0.55, liftPhase);
float liftRib = 0.86 + 0.14 * sin(vLiftShaft.x * 2.6);
vec3 liftShaftColor = vec3(0.052, 0.034, 0.028) * (0.65 + 0.7 * liftGirder) * liftRib;
liftShaftColor += vec3(2.3, 0.72, 0.18) * liftBand;
diffuseColor.rgb = liftShaftColor;`,
      );
  };
  material.customProgramCacheKey = () => LIFT_SHAFT_PROGRAM_CACHE_KEY;
  return material;
}

let shaftGeo: THREE.BufferGeometry | null = null;
let shaftMat: THREE.MeshBasicMaterial | null = null;

function shaftSheetGeometry(): THREE.BufferGeometry {
  shaftGeo ??= markSharedGeometry(
    new THREE.PlaneGeometry(Math.abs(IGNIVAR_LIFT_GATE_Z - CAR_Z_MIN) + 2.4, SHAFT_HEIGHT),
  );
  return shaftGeo;
}

function shaftSheetMaterial(): THREE.MeshBasicMaterial {
  shaftMat ??= markSharedMaterial(
    decorateShaftMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })),
  );
  return shaftMat;
}

// Rising ember dust inside the car: each particle loops its own phase on
// uTime in the vertex shader (the arena-atmosphere idiom), so the cloud
// animates with zero per-frame CPU.
const DUST_VERT = `
attribute float aPhase;
uniform float uTime;
varying float vFade;
void main() {
  float cycle = 6.5;
  float t = mod(aPhase * cycle + uTime * (0.55 + fract(aPhase * 7.31) * 0.5), cycle) / cycle;
  vec3 p = position;
  p.y += t * 9.0;
  p.x += sin(uTime * 0.7 + aPhase * 41.0) * 0.35;
  vFade = sin(t * 3.14159);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = (30.0 * (0.5 + fract(aPhase * 3.7) * 0.5)) / max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FRAG = `
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = 1.0 - smoothstep(0.15, 0.5, length(c));
  gl_FragColor = vec4(vec3(1.6, 0.55, 0.14) * d * vFade, d * vFade * 0.55);
}`;

let dustMat: THREE.ShaderMaterial | null = null;

function dustMaterial(): THREE.ShaderMaterial {
  if (!dustMat) {
    dustMat = markSharedMaterial(
      new THREE.ShaderMaterial({
        vertexShader: DUST_VERT,
        fragmentShader: DUST_FRAG,
        uniforms: { uTime: sharedUniforms.uTime },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    dustMat.customProgramCacheKey = () => LIFT_DUST_PROGRAM_CACHE_KEY;
  }
  return dustMat;
}

function buildDustCloud(count: number): THREE.Points {
  // Deterministic LCG scatter (never Math.random in render generation).
  let seed = 0x11f7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const carDepth = Math.abs(IGNIVAR_LIFT_GATE_Z - CAR_Z_MIN);
  for (let index = 0; index < count; index++) {
    positions[index * 3] = (rnd() * 2 - 1) * (CAR_HALF_WIDTH - 1);
    positions[index * 3 + 1] = rnd() * 1.5;
    positions[index * 3 + 2] = CAR_Z_MIN + 1 + rnd() * (carDepth - 2);
    phases[index] = rnd();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.computeBoundingSphere();
  const points = new THREE.Points(geometry, dustMaterial());
  points.name = 'ignivarLiftDust';
  points.frustumCulled = true;
  return points;
}

/** Build the shaft illusion around the car (dressing-group coordinates:
 *  the same instance-local space the prop placements use). */
export function buildIgnivarLiftShaft(lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ignivarLiftShaft';
  const zCenter = (IGNIVAR_LIFT_GATE_Z + CAR_Z_MIN) / 2;
  for (const side of [-1, 1]) {
    const sheet = new THREE.Mesh(shaftSheetGeometry(), shaftSheetMaterial());
    sheet.name = side < 0 ? 'liftShaftWest' : 'liftShaftEast';
    sheet.position.set(side * SHAFT_SHEET_X, SHAFT_HEIGHT / 2, zCenter);
    sheet.rotation.y = (side * Math.PI) / 2;
    group.add(sheet);
  }
  group.add(buildDustCloud(lowGfx ? 20 : 44));
  return group;
}

// -- the moving machinery ---------------------------------------------------
// The owner's lift props are single baked meshes, so the motion lives in
// the vertex shader: a position-derived REGION of each mesh moves on the
// shared uTime clock while the rest stands still. Region constants are
// measured from the shipped GLBs (canonical space: xz-centred, base y 0,
// dims normalized): the handle is a base under y 0.36 with the lever arm
// and grip above it; the winch drum spans radius ~0.25 about its x-axis
// axle at y 0.47, with the frame posts outside |x| 0.22.
export const LIFT_HANDLE_PROGRAM_CACHE_KEY = 'ignivar-lift-handle-v1';
export const LIFT_WINCH_PROGRAM_CACHE_KEY = 'ignivar-lift-winch-v1';

function decorateLiftMotion(
  material: THREE.Material,
  cacheKey: string,
  maskGlsl: string,
  angleGlsl: string,
  pivotY: string,
): THREE.Material {
  const previousCompile = material.onBeforeCompile.bind(material);
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
uniform float uTime;
float ignivarLiftMask(vec3 p) { return ${maskGlsl}; }
float ignivarLiftAngle() { return ${angleGlsl}; }
vec3 ignivarLiftSpin(vec3 p, float mask) {
  float a = ignivarLiftAngle() * mask;
  float ca = cos(a);
  float sa = sin(a);
  vec3 q = p - vec3(0.0, ${pivotY}, 0.0);
  return mix(p, vec3(q.x, q.y * ca - q.z * sa, q.y * sa + q.z * ca) + vec3(0.0, ${pivotY}, 0.0), mask);
}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
{
  float liftMask = ignivarLiftMask(position);
  float liftA = ignivarLiftAngle() * liftMask;
  float liftCa = cos(liftA);
  float liftSa = sin(liftA);
  objectNormal = mix(
    objectNormal,
    vec3(objectNormal.x, objectNormal.y * liftCa - objectNormal.z * liftSa,
      objectNormal.y * liftSa + objectNormal.z * liftCa),
    liftMask
  );
}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
transformed = ignivarLiftSpin(transformed, ignivarLiftMask(position));`,
    );
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|${cacheKey}`;
  return material;
}

/** The brake lever pumps: the arm and grip above the base swing about the
 *  pivot in a slow mechanical stroke. */
export function decorateLiftHandleMaterial(material: THREE.Material): THREE.Material {
  return decorateLiftMotion(
    material,
    LIFT_HANDLE_PROGRAM_CACHE_KEY,
    'step(0.36, p.y)',
    'sin(uTime * 1.4) * 0.18',
    '0.36',
  );
}

/** The winch drum turns continuously about its axle; the frame holds. */
export function decorateLiftWinchMaterial(material: THREE.Material): THREE.Material {
  return decorateLiftMotion(
    material,
    LIFT_WINCH_PROGRAM_CACHE_KEY,
    'step(length(vec2(p.y - 0.47, p.z)), 0.25) * step(abs(p.x), 0.22)',
    'uTime * 1.6',
    '0.47',
  );
}

export const ignivarLiftRoomInternalsForTest = {
  shaftSheetMaterial,
  dustMaterial,
  carHalfWidth: CAR_HALF_WIDTH,
  carZMin: CAR_Z_MIN,
  shaftSheetX: SHAFT_SHEET_X,
};
