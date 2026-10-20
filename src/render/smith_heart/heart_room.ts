// The Heart and the raid's floating islands (heart_room_core.ts plans them):
// the keels under the Seal Dais, the Anvil of the World and its terrace; the
// Smith's heart beating in the chasm, its light rising in shafts; the four
// colossal chains from the altars into the mountain's crown, each carrying
// its vein's light down into its altar; the platform's rune rings; and the
// embers rising out of the chasm toward the open sky.
//
// Static geometry with shader-driven motion (the shared clock): nothing here
// writes a uniform per frame. The chains are one instanced draw; the rune
// rings ride the floor ladder's ground rung. Every tier draws the core, the
// chains and the pours (they are the room's identity and point at the
// altars); only the embers thin on the low tier (cosmetic).

import * as THREE from 'three';
import { HEART_ROOM, SMITH_HEART_VEIN_COLORS } from '../../sim/content/smith_heart_layout';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { sharedUniforms, surfaceMat } from '../gfx';
import { markSharedMaterial } from '../shared_resource';
import { radialGlowTexture } from '../textures';
import {
  heartBeamMaterial,
  heartCoreMaterial,
  heartMoteGeometry,
  heartMoteMaterial,
} from './heart_fx_materials';
import { HEART_PALETTE } from './heart_plan_core';
import {
  HEART_CORE,
  HEART_CORE_SHAFTS,
  HEART_RUNE_RINGS,
  heartChainLink,
  heartChains,
  heartEmberCount,
  heartKeels,
} from './heart_room_core';

const RUNE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
varying vec2 vP;
float h1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float r = length(vP);
  float turns = atan(vP.x, vP.y) / 6.2831853 + 0.5;
  float a = 0.0;
  ${HEART_RUNE_RINGS.map(
    (R, i) => `{
    float d = abs(r - ${R.toFixed(1)});
    a += smoothstep(0.22, 0.0, d);
    float cell = floor(turns * ${48 + i * 24}.0);
    float inCell = fract(turns * ${48 + i * 24}.0);
    a += step(d, 1.6) * step(1.0, d) * step(0.45, h1(cell * ${(3.1 + i).toFixed(1)}))
      * step(0.25, inCell) * step(inCell, 0.75) * 0.7;
  }`,
  ).join('\n  ')}
  float beat = 0.75 + 0.25 * sin(uTime * 2.856);
  float run = 0.6 + 0.4 * sin(turns * 25.13 - uTime * 0.8 + r * 0.3);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a * beat * run * 1.3, 1.0);
  #include <colorspace_fragment>
}`;

/** The keels under the floating islands. */
function buildKeels(group: THREE.Group): void {
  const stone = surfaceMat({
    color: HEART_PALETTE.dark,
    roughness: 0.9,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  for (const k of heartKeels()) {
    const pts = k.profile.map(([r, y]) => new THREE.Vector2(Math.max(0.01, r), y));
    const keel = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), stone);
    keel.position.set(k.x, k.h, k.z);
    keel.name = `keel:${k.id}`;
    group.add(keel);
    // The glowing band round it.
    const r0 = radiusAt(k.profile, -k.band[0]);
    const r1 = radiusAt(k.profile, -k.band[1]);
    const band = new THREE.Mesh(
      new THREE.LatheGeometry(
        [new THREE.Vector2(r0 + 0.25, -k.band[0]), new THREE.Vector2(r1 + 0.25, -k.band[1])],
        40,
      ),
      surfaceMat({
        color: 0x1a1410,
        emissive: k.color,
        emissiveIntensity: 1.6,
        side: THREE.DoubleSide,
      }),
    );
    band.position.set(k.x, k.h, k.z);
    band.name = `keelBand:${k.id}`;
    group.add(band);
  }
}

/** The keel's radius at height `y` (under the floor) by its profile. */
function radiusAt(profile: readonly (readonly [number, number])[], y: number): number {
  for (let i = 0; i < profile.length - 1; i++) {
    const [ra, ya] = profile[i];
    const [rb, yb] = profile[i + 1];
    if (y <= ya && y >= yb) return ra + ((rb - ra) * (y - ya)) / (yb - ya || 1);
  }
  return profile[profile.length - 1][0];
}

let haloMaterial: THREE.SpriteMaterial | null = null;

/** The Smith's heart in the chasm, its halo and its rising shafts. */
function buildCore(group: THREE.Group): void {
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(HEART_CORE.r, 48, 32),
    heartCoreMaterial('smithHeartCore'),
  );
  core.position.set(HEART_CORE.x, HEART_CORE.y, HEART_CORE.z);
  core.name = 'smithHeartCore';
  group.add(core);
  if (!haloMaterial) {
    haloMaterial = new THREE.SpriteMaterial({
      map: radialGlowTexture(),
      color: 0xffc070,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      name: 'smithHeartCoreHalo',
    });
    markSharedMaterial(haloMaterial);
  }
  const halo = new THREE.Sprite(haloMaterial);
  halo.position.set(HEART_CORE.x, HEART_CORE.y + 4, HEART_CORE.z);
  halo.scale.set(120, 120, 1);
  group.add(halo);
  const shaftMat = heartBeamMaterial(0xffc87a, 'smithHeartCoreShaft');
  shaftMat.uniforms.uK.value = 0.22;
  for (const s of HEART_CORE_SHAFTS) {
    const h = 110;
    const g = new THREE.CylinderGeometry(s.r, s.r * 0.5, h, 16, 1, true).translate(0, h / 2, 0);
    const shaft = new THREE.Mesh(g, shaftMat);
    shaft.position.set(s.x, HEART_CORE.y + 6, s.z);
    // Lean out, away from the platform.
    const ax = s.x - HEART_ROOM.x;
    const az = s.z - HEART_ROOM.z;
    const l = Math.hypot(ax, az) || 1;
    shaft.rotation.set((az / l) * s.tilt, 0, (-ax / l) * s.tilt);
    shaft.name = 'coreShaft';
    group.add(shaft);
  }
}

/** The four chains (one instanced draw) and their pours. */
function buildChains(group: THREE.Group): void {
  const chains = heartChains();
  const count = chains.reduce((n, c) => n + c.links, 0);
  const link = new THREE.TorusGeometry(1.9, 0.62, 8, 18).scale(1, 1.6, 1);
  const iron = surfaceMat({
    color: HEART_PALETTE.steel,
    metalness: 0.75,
    roughness: 0.4,
    flatShading: true,
  });
  const mesh = new THREE.InstancedMesh(link, iron, count);
  mesh.name = 'smithHeartChains';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let i = 0;
  for (const c of chains) {
    dir.set(c.bx - c.ax, c.by - c.ay, c.bz - c.az).normalize();
    q.setFromUnitVectors(up, dir);
    for (let k = 0; k < c.links; k++) {
      const l = heartChainLink(c, k);
      roll.setFromAxisAngle(up, l.roll);
      pos.set(l.x, l.y, l.z);
      m.compose(pos, q.clone().multiply(roll), one);
      mesh.setMatrixAt(i++, m);
    }
    // The pour: the vein's light running down the chain into its altar.
    const a = new THREE.Vector3(c.ax, c.ay, c.az);
    const b = new THREE.Vector3(c.bx, c.by, c.bz);
    const len = a.distanceTo(b);
    const pourMat = heartBeamMaterial(
      SMITH_HEART_VEIN_COLORS[c.vein],
      `smithHeartPour:${c.vein}`,
      -1.4,
    );
    pourMat.uniforms.uK.value = 0.85;
    const pour = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 1.15, len, 12, 8, true).translate(0, len / 2, 0),
      pourMat,
    );
    pour.position.copy(a);
    pour.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    pour.name = `pour:${c.vein}`;
    group.add(pour);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

/** The platform's rune rings (a floor mark on the ground rung). */
function buildRuneRings(group: THREE.Group): void {
  const material = new THREE.ShaderMaterial({
    name: 'smithHeartRuneRings',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uTime: sharedUniforms.uTime,
      uColor: { value: new THREE.Color(0xffc878) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: RUNE_FRAG,
  });
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(HEART_ROOM.r - 1.5, 128).rotateX(-Math.PI / 2),
    material,
  );
  disc.position.set(HEART_ROOM.x, HEART_ROOM.h + 0.06, HEART_ROOM.z);
  disc.renderOrder = floorVfxRenderOrder('ground', 2);
  disc.name = 'heartRuneRings';
  group.add(disc);
}

/** The embers rising out of the chasm toward the sky. */
function buildEmbers(group: THREE.Group, lowGfx: boolean): void {
  const material = heartMoteMaterial('smithHeartEmbers', {
    radius: 62,
    height: 150,
    size: 1.3,
    spin: 0.22,
    color: 0xffb860,
  });
  material.uniforms.uK.value = 1;
  const points = new THREE.Points(heartMoteGeometry(heartEmberCount(lowGfx)), material);
  points.position.set(HEART_ROOM.x, HEART_CORE.y + 10, HEART_ROOM.z);
  points.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 75, 0), 110);
  points.name = 'heartEmbers';
  group.add(points);
}

/** The Heart's dressing and every island's keel (instance-local). */
export function buildHeartRoom(lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'smithHeartRoom';
  buildKeels(group);
  buildCore(group);
  buildChains(group);
  buildRuneRings(group);
  buildEmbers(group, lowGfx);
  return group;
}
