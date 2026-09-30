// The Mere Hydra's sixth-pass visuals, composed by temple_hydra.ts:
//  - each head's ELEMENT burns at its mouth: ice (frost motes and a pale
//    mist), venom (green drips and a sickly glow), water (droplets wheeling
//    round the jaw). An element follows whoever wields it, so a survivor that
//    inherits a fallen head's attack visibly carries two;
//  - the Tsunami: a wall of lagoon water stands up on its rim while the bar
//    runs, curls, rolls across its half of the pool and crashes in spray
//    (the floor half-disc is temple_fx.ts's telegraph);
//  - a regrowing head's burst of venom-green light as it bursts back up.
// The per-vertex element tint of the three necks is `tintHydraNecks`.
//
// Cosmetic: every state is read off IWorld (the heads' dead flags, the wave
// object and its template id), so offline and online look the same. GPU
// particles on the Hollow Crypt kit; built once under the gated temple root.

import * as THREE from 'three';
import { HYDRA_ELEMENTS, type HydraElement, POOL } from '../../sim/encounters/drowned_temple/ids';
import {
  DUST_FRAG,
  GLOW_FRAG,
  PARTICLE_VERT,
  ParticlePool,
} from '../hollow_crypt/crypt_fx_particles';

/** Each element's look: the particle colour, and the neck tint multiplier. */
export const HYDRA_ELEMENT_LOOK: Readonly<
  Record<HydraElement, { glow: [number, number, number]; tint: [number, number, number] }>
> = {
  frost: { glow: [0.7, 0.9, 1.0], tint: [0.82, 0.96, 1.22] },
  venom: { glow: [0.55, 1.0, 0.3], tint: [0.78, 1.08, 0.52] },
  tide: { glow: [0.3, 0.7, 1.0], tint: [0.52, 0.82, 1.1] },
};

const NECK = ['L', 'C', 'R'] as const;

/** Which neck a bone belongs to (0 L, 1 C, 2 R) and how far up it (0 base,
 *  1 head), or null for the body. */
function neckOfBone(name: string): { neck: number; up: number } | null {
  const m = /^(neck|head|jaw|lid)_([LCR])(?:_(\d+))?/.exec(name);
  if (!m) return null;
  const neck = NECK.indexOf(m[2] as (typeof NECK)[number]);
  if (m[1] !== 'neck') return { neck, up: 1 };
  return { neck, up: Number(m[3] ?? 1) / 7 };
}

/** Tint the three necks of the Hydra's cloned body by their elements, in
 *  their vertex colours (strongest at the head, fading into the mound). The
 *  geometry is cloned so the shared source stays untouched. */
export function tintHydraNecks(body: THREE.Object3D): void {
  body.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || !m.skeleton) return;
    const geo = m.geometry.clone();
    const color = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
    const joints = geo.getAttribute('skinIndex') as THREE.BufferAttribute | undefined;
    const weights = geo.getAttribute('skinWeight') as THREE.BufferAttribute | undefined;
    if (!color || !joints || !weights) return;
    const bones = m.skeleton.bones.map((b) => neckOfBone(b.name));
    const out = new Float32Array(color.count * 3);
    for (let i = 0; i < color.count; i++) {
      const tint = [0, 0, 0];
      let body = 0;
      for (let k = 0; k < 4; k++) {
        const w = weights.getComponent(i, k);
        if (w <= 0) continue;
        const b = bones[joints.getComponent(i, k)];
        if (!b) {
          body += w;
          continue;
        }
        const look = HYDRA_ELEMENT_LOOK[HYDRA_ELEMENTS[b.neck]].tint;
        const s = 0.35 + 0.65 * b.up;
        for (let c = 0; c < 3; c++) tint[c] += w * (1 + (look[c] - 1) * s);
      }
      for (let c = 0; c < 3; c++) out[i * 3 + c] = color.getComponent(i, c) * (tint[c] + body);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
    m.geometry = geo;
  });
}

// ---- the Tsunami's wall of water -------------------------------------------------------

const WAVE_VERT = /* glsl */ `
uniform float uHeight;
uniform float uCurl;
uniform float uTime;
varying vec2 vUv;
varying float vH;
void main() {
  vUv = uv;
  vec3 p = position;
  float h = uv.y;
  // The wall stands up, bulges and curls forward at the crest.
  float sway = sin(p.x * 0.35 + uTime * 2.2) * 0.35 + sin(p.x * 0.9 - uTime * 3.1) * 0.15;
  p.y = h * uHeight + sway * h;
  p.z = h * h * uCurl + sin(h * 3.14159) * 0.9;
  vH = h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const WAVE_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
varying float vH;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 q = vec2(vUv.x * 22.0, vUv.y * 5.0 - uTime * 2.6);
  float streak = vnoise(q) * 0.6 + vnoise(q * 2.3 + 7.0) * 0.4;
  vec3 deep = vec3(0.06, 0.22, 0.3);
  vec3 body = vec3(0.18, 0.52, 0.6);
  vec3 foam = vec3(0.88, 0.95, 1.0);
  vec3 col = mix(deep, body, smoothstep(0.0, 0.7, vH));
  float crest = smoothstep(0.72, 0.95, vH + (streak - 0.5) * 0.25);
  col = mix(col, foam, crest);
  col += foam * smoothstep(0.62, 0.9, streak) * 0.25 * vH;
  float edge = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
  gl_FragColor = vec4(col, uAlpha * edge * (0.72 + 0.25 * crest));
  #include <colorspace_fragment>
}
`;

export interface HydraFxInput {
  /** Each head's mouth (world), or null when that head is gone. */
  sockets: (THREE.Vector3 | null)[];
  /** Which head wields each element (HYDRA_ELEMENTS order), or null. */
  wielders: (number | null)[];
  /** The Tsunami's wave object, if one stands: its rim spot, heading and state. */
  wave: { x: number; y: number; z: number; facing: number; rolling: boolean } | null;
}

export class TempleHydraFx {
  private readonly uTime = { value: 0 };
  private readonly glow: ParticlePool;
  private readonly mist: ParticlePool;
  private readonly materials: THREE.Material[] = [];
  private readonly wave: THREE.Mesh;
  private readonly waveUniforms = {
    uTime: this.uTime,
    uHeight: { value: 0 },
    uCurl: { value: 0 },
    uAlpha: { value: 0 },
  };
  /** The wave's life on screen: its rise, its roll, its crash. */
  private waveAge = 0;
  private waveRoll = 0;
  private waveCrash = -1;
  private readonly waveAt = new THREE.Vector3();
  private waveHeading = 0;
  private emitDebt = [0, 0, 0];
  private seed = 1;

  constructor(
    root: THREE.Group,
    private readonly detail: boolean,
  ) {
    const mat = (frag: string, blending: THREE.Blending) => {
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: this.uTime },
        vertexShader: PARTICLE_VERT,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending,
      });
      this.materials.push(m);
      return m;
    };
    this.glow = new ParticlePool(detail ? 900 : 360, mat(GLOW_FRAG, THREE.AdditiveBlending), 12);
    this.mist = new ParticlePool(detail ? 500 : 200, mat(DUST_FRAG, THREE.NormalBlending), 11);
    root.add(this.glow.mesh, this.mist.mesh);
    const waveMat = new THREE.ShaderMaterial({
      name: 'drownedTempleTsunami',
      uniforms: this.waveUniforms,
      vertexShader: WAVE_VERT,
      fragmentShader: WAVE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.materials.push(waveMat);
    this.wave = new THREE.Mesh(
      new THREE.PlaneGeometry(POOL.r * 2 + 8, 1, detail ? 48 : 20, detail ? 12 : 6).translate(
        0,
        0.5,
        0,
      ),
      waveMat,
    );
    this.wave.frustumCulled = false;
    this.wave.renderOrder = 10;
    // Present from the start (collapsed): its program links with the temple.
    this.wave.scale.setScalar(1e-4);
    root.add(this.wave);
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** A regrown head bursts back up out of the pool. */
  burstAt(p: THREE.Vector3, clock: number): void {
    const n = this.detail ? 60 : 24;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2;
      const s = 3 + this.rand() * 6;
      this.glow.emit(clock, {
        x: p.x,
        y: p.y,
        z: p.z,
        vx: Math.cos(a) * s,
        vy: 2 + this.rand() * 6,
        vz: Math.sin(a) * s,
        ay: -6,
        drag: 1.2,
        life: 0.9 + this.rand() * 0.6,
        size0: 1.2,
        size1: 0.3,
        r: 0.6,
        g: 1,
        b: 0.45,
        a: 1,
      });
    }
  }

  private emitElement(el: HydraElement, at: THREE.Vector3, clock: number, dt: number): void {
    const i = HYDRA_ELEMENTS.indexOf(el);
    const rate = this.detail ? 34 : 14;
    this.emitDebt[i] += rate * dt;
    const [r, g, b] = HYDRA_ELEMENT_LOOK[el].glow;
    while (this.emitDebt[i] >= 1) {
      this.emitDebt[i] -= 1;
      const a = this.rand() * Math.PI * 2;
      const rr = 0.4 + this.rand() * 1.3;
      const x = at.x + Math.cos(a) * rr;
      const z = at.z + Math.sin(a) * rr;
      const y = at.y + (this.rand() - 0.5) * 1.2;
      if (el === 'frost') {
        this.glow.emit(clock, {
          x,
          y,
          z,
          vx: (this.rand() - 0.5) * 0.8,
          vy: 0.6 + this.rand(),
          vz: (this.rand() - 0.5) * 0.8,
          life: 1.1 + this.rand() * 0.8,
          size0: 0.5,
          size1: 0.15,
          spin: 2,
          r,
          g,
          b,
          a: 0.9,
        });
        if (this.rand() < 0.35)
          this.mist.emit(clock, {
            x,
            y: y - 0.4,
            z,
            vx: 0,
            vy: -0.3,
            vz: 0,
            life: 1.8,
            size0: 1.4,
            size1: 2.6,
            r: 0.8,
            g: 0.9,
            b: 1,
            a: 0.3,
          });
      } else if (el === 'venom') {
        this.glow.emit(clock, {
          x,
          y,
          z,
          vx: 0,
          vy: -0.5,
          vz: 0,
          ay: -14,
          drag: 0.4,
          life: 0.9 + this.rand() * 0.4,
          size0: 0.42,
          size1: 0.3,
          r,
          g,
          b,
          a: 1,
        });
      } else {
        // Water wheels round the jaw.
        const s = 3.2;
        this.glow.emit(clock, {
          x,
          y,
          z,
          vx: -Math.sin(a) * s,
          vy: 0.4 + this.rand() * 0.6,
          vz: Math.cos(a) * s,
          ay: -3,
          drag: 1.5,
          life: 0.8 + this.rand() * 0.5,
          size0: 0.45,
          size1: 0.2,
          r,
          g,
          b,
          a: 0.95,
        });
      }
    }
  }

  private crashSpray(clock: number): void {
    const n = this.detail ? 160 : 60;
    const ax = Math.sin(this.waveHeading);
    const az = Math.cos(this.waveHeading);
    for (let i = 0; i < n; i++) {
      const across = (this.rand() - 0.5) * (POOL.r * 2);
      const x = this.waveAt.x + az * across;
      const z = this.waveAt.z - ax * across;
      const s = 4 + this.rand() * 8;
      this.mist.emit(clock, {
        x,
        y: this.waveAt.y + 1 + this.rand() * 4,
        z,
        vx: ax * s + (this.rand() - 0.5) * 3,
        vy: 3 + this.rand() * 7,
        vz: az * s + (this.rand() - 0.5) * 3,
        ay: -9,
        drag: 0.8,
        life: 1.1 + this.rand() * 0.8,
        size0: 1.6,
        size1: 3.4,
        r: 0.85,
        g: 0.93,
        b: 1,
        a: 0.55,
      });
    }
  }

  update(dt: number, clock: number, input: HydraFxInput): void {
    this.uTime.value = clock;
    input.wielders.forEach((head, i) => {
      const at = head !== null ? input.sockets[head] : null;
      if (at) this.emitElement(HYDRA_ELEMENTS[i], at, clock, dt);
    });
    this.updateWave(dt, clock, input.wave);
    this.glow.update(clock);
    this.mist.update(clock);
  }

  private updateWave(dt: number, clock: number, w: HydraFxInput['wave']): void {
    const u = this.waveUniforms;
    if (w) {
      if (this.waveAge === 0 || this.waveCrash >= 0) {
        this.waveAge = 0;
        this.waveRoll = 0;
        this.waveCrash = -1;
      }
      this.waveAge += dt;
      this.waveHeading = w.facing;
      if (w.rolling) this.waveRoll = Math.min(1, this.waveRoll + dt / 1.2);
      const ax = Math.sin(w.facing);
      const az = Math.cos(w.facing);
      // Rolls from its rim spot to the pool's middle line and a stride beyond.
      const travel = this.waveRoll * (POOL.r + 2);
      this.waveAt.set(w.x + ax * travel, w.y, w.z + az * travel);
      const rise = Math.min(1, this.waveAge / 2.6);
      u.uHeight.value = (1 - (1 - rise) ** 2) * 7.5 + this.waveRoll * 1.5;
      u.uCurl.value = 1.2 + this.waveRoll * 3.2;
      u.uAlpha.value = Math.min(1, this.waveAge * 1.5);
    } else if (this.waveAge > 0 && this.waveCrash < 0) {
      // The object is gone: the wave broke. Spray, then it sinks away.
      this.waveCrash = 0;
      this.crashSpray(clock);
    }
    if (this.waveCrash >= 0) {
      this.waveCrash += dt;
      const k = Math.min(1, this.waveCrash / 0.7);
      u.uHeight.value = Math.max(0, u.uHeight.value - dt * 14);
      u.uAlpha.value = 1 - k;
      if (k >= 1) {
        this.waveAge = 0;
        this.waveCrash = -1;
      }
    }
    const live = this.waveAge > 0;
    this.wave.scale.setScalar(live ? 1 : 1e-4);
    if (live) {
      this.wave.position.copy(this.waveAt);
      this.wave.rotation.set(0, this.waveHeading, 0);
    }
  }

  dispose(): void {
    this.glow.dispose();
    this.mist.dispose();
    this.wave.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}
