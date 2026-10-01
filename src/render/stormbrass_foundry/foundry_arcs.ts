// The Stormbrass Foundry's lightning arcs: a pool of jagged, flickering bolts
// between two moving points (a Static Lash chaining between players, a storm
// cell crackling onto its carrier, the Warden's coil spitting at its antlers,
// an Overload crawling over the Prime Draft). Each arc is two crossed ribbons
// (it reads from any side) along a path re-jagged a few times a second
// (foundry_creature_fx_core.arcPathInto); a hot white core fades to the storm
// blue at its edges.
//
// Rules (src/render/CLAUDE.md): every mesh and material is built at
// construction (the owner attaches the root through the compile gate), the
// path buffers are preallocated and rewritten in place, nothing is allocated
// per frame. Additive and depthWrite-free; it never hides a telegraph.

import * as THREE from 'three';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { arcPathInto } from './foundry_creature_fx_core';

const POINTS = 14;
const ARC_VERT = /* glsl */ `
attribute float aAcross;
varying float vAcross;
varying float vAlong;
attribute float aAlong;
void main() {
  vAcross = aAcross;
  vAlong = aAlong;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const ARC_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vAcross;
varying float vAlong;
void main() {
  float d = abs(vAcross * 2.0 - 1.0);
  float core = pow(max(1.0 - d, 0.0), 3.0);
  float glow = pow(max(1.0 - d, 0.0), 1.2) * 0.55;
  float ends = smoothstep(0.0, 0.06, vAlong) * smoothstep(1.0, 0.94, vAlong);
  vec3 col = mix(uColor, vec3(1.0), core * 0.85);
  gl_FragColor = vec4(col * (1.0 + 1.6 * core), (core + glow) * ends * uAlpha);
}
`;

interface Arc {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  pos: THREE.BufferAttribute;
  from: THREE.Vector3;
  to: THREE.Vector3;
  born: number;
  life: number;
  width: number;
  jag: number;
  seed: number;
  reseed: number;
  live: boolean;
}

const PATH: THREE.Vector3[] = Array.from({ length: POINTS }, () => new THREE.Vector3());
const DIR = new THREE.Vector3();
const S1 = new THREE.Vector3();
const S2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class FoundryArcs {
  readonly root = new THREE.Group();
  private readonly arcs: Arc[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(slots: number) {
    this.root.name = 'foundry-arcs';
    for (let i = 0; i < slots; i++) {
      const g = new THREE.BufferGeometry();
      // two ribbons x POINTS stations x 2 edges
      const n = 2 * POINTS * 2;
      const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      );
      const across = new Float32Array(n);
      const along = new Float32Array(n);
      const idx: number[] = [];
      for (let r = 0; r < 2; r++) {
        for (let k = 0; k < POINTS; k++) {
          const v = (r * POINTS + k) * 2;
          across[v] = 0;
          across[v + 1] = 1;
          along[v] = along[v + 1] = k / (POINTS - 1);
          if (k > 0) idx.push(v - 2, v - 1, v + 1, v - 2, v + 1, v);
        }
      }
      g.setAttribute('position', pos);
      g.setAttribute('aAcross', new THREE.BufferAttribute(across, 1));
      g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
      g.setIndex(idx);
      this.geometries.push(g);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x7fc8ff) }, uAlpha: { value: 0 } },
        vertexShader: ARC_VERT,
        fragmentShader: ARC_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = floorVfxRenderOrder('encounter', 30);
      this.root.add(mesh);
      this.arcs.push({
        mesh,
        mat,
        pos,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
        born: 0,
        life: 0,
        width: 0.2,
        jag: 0.2,
        seed: i * 17,
        reseed: 0,
        live: false,
      });
    }
  }

  /** Strike an arc from `a` to `b` for `life` seconds. Returns its slot (the
   *  caller may keep moving its ends with `move`), or -1 when none is free. */
  strike(
    now: number,
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    life: number,
    color: number,
    width = 0.22,
    jag = 0.22,
  ): number {
    let i = this.arcs.findIndex((s) => !s.live);
    if (i < 0) {
      // the oldest arc gives way
      let oldest = 0;
      for (let k = 1; k < this.arcs.length; k++)
        if (this.arcs[k].born < this.arcs[oldest].born) oldest = k;
      i = oldest;
    }
    const s = this.arcs[i];
    s.live = true;
    s.born = now;
    s.life = life;
    s.width = width;
    s.jag = jag;
    s.reseed = 0;
    s.seed = (s.seed * 1103515245 + 12345) & 0x7fffffff;
    s.from.set(a.x, a.y, a.z);
    s.to.set(b.x, b.y, b.z);
    (s.mat.uniforms.uColor.value as THREE.Color).setHex(color);
    s.mesh.visible = false;
    return i;
  }

  move(
    slot: number,
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ): void {
    const s = this.arcs[slot];
    if (!s?.live) return;
    s.from.set(a.x, a.y, a.z);
    s.to.set(b.x, b.y, b.z);
  }

  update(now: number): void {
    for (const s of this.arcs) {
      if (!s.live) continue;
      const t = (now - s.born) / Math.max(1e-3, s.life);
      if (t >= 1) {
        s.live = false;
        s.mesh.visible = false;
        continue;
      }
      if (now >= s.reseed) {
        s.seed = (s.seed * 1103515245 + 12345) & 0x7fffffff;
        s.reseed = now + 0.055;
      }
      arcPathInto(s.from, s.to, s.seed, s.jag, PATH);
      // flicker: bright strokes with dark gaps, fading out at the end
      const flick = 0.55 + 0.45 * Math.sin(now * 53 + s.seed);
      s.mat.uniforms.uAlpha.value = (1 - t * t) * flick;
      const arr = s.pos.array as Float32Array;
      DIR.subVectors(s.to, s.from).normalize();
      S1.crossVectors(DIR, UP);
      if (S1.lengthSq() < 1e-6) S1.set(1, 0, 0);
      S1.normalize();
      S2.crossVectors(DIR, S1).normalize();
      for (let r = 0; r < 2; r++) {
        const side = r === 0 ? S1 : S2;
        for (let k = 0; k < POINTS; k++) {
          const p = PATH[k];
          const w = s.width * (0.6 + 0.4 * Math.sin((k / (POINTS - 1)) * Math.PI));
          const v = (r * POINTS + k) * 2 * 3;
          arr[v] = p.x - side.x * w;
          arr[v + 1] = p.y - side.y * w;
          arr[v + 2] = p.z - side.z * w;
          arr[v + 3] = p.x + side.x * w;
          arr[v + 4] = p.y + side.y * w;
          arr[v + 5] = p.z + side.z * w;
        }
      }
      s.pos.needsUpdate = true;
      s.mesh.visible = true;
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const s of this.arcs) s.mat.dispose();
  }
}
