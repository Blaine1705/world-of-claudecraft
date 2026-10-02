// Line-Master Tock's Scalding Vents (plan: foundry_vents_core.ts), in two
// halves:
//
//  - buildFoundryVents: the steam grilles let into every Main Line walkway
//    and the apron past the press (every floor that is not a belt vents)
//    (iron grates over a pit that glows as the boilers build) and the jets
//    that burst up from them, built with the interior (instance-local, one
//    merged mesh each, prewarmed with the arena). The jets are one draw: every
//    column is a camera-turned quad raised, scrolled and torn entirely in the
//    shader on sharedUniforms.uTime; FOUNDRY_VENT_UNIFORMS carries how hard
//    they blow and how hot the grilles glow.
//  - FoundryVentFx: the live half the telegraph painter (foundry_fx.ts) owns.
//    It reads the walkway strip objects the sim mirrors (template warn, then
//    scald), drapes the floor warning over every non-belt floor (the walkways,
//    the press-end apron, the chute-end lip: VENT_LANES) with the shared
//    telegraph kit, eases the two uniforms toward the phase, and throws the
//    steam that boils off the jets (a pooled GPU particle cloud).
//
// The floor warning is ACTIONABLE and draws on every tier; the jets thin out
// and the drifting steam thins on the low tier (cosmetic). No point lights, no
// per-frame allocation; everything reads mirrored entity state, so offline and
// online look the same.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Entity } from '../../sim/types';
import type { IWorld } from '../../world_api';
import { TelegraphKit, type TelegraphLane } from '../floor_telegraph';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { sharedUniforms } from '../gfx';
import {
  DUST_FRAG,
  PARTICLE_VERT,
  ParticlePool,
  type ParticleSpec,
} from '../hollow_crypt/crypt_fx_particles';
import { PartBin } from './foundry_mesh';
import {
  VENT_GRILLE_HALF,
  VENT_LANE_STYLE,
  VENT_LANES,
  type VentGrille,
  type VentPhase,
  ventEase,
  ventGrilles,
  ventHeatTarget,
  ventJetTarget,
  ventLaneFill,
  ventPhaseOf,
} from './foundry_vents_core';

type Ground = (x: number, z: number) => number;

/** How hard the jets blow (0 none, 1 the scalding column) and how hot the
 *  grilles glow (0 cold, 1 white hot). Shared by every built Foundry (one
 *  claim is in view at a time, like FOUNDRY_BELT_UNIFORMS): FoundryVentFx
 *  writes them from the live strip objects. */
export const FOUNDRY_VENT_UNIFORMS = {
  uJet: { value: 0 },
  uHeat: { value: 0 },
};

/** A jet's height and width at full blast (yards). */
const JET_HEIGHT = 7.5;
const JET_WIDTH = 2.0;

const PIT_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
// The pit under a grate: black when cold, a pulsing orange as the pressure
// builds, white hot while it blows.
const PIT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uHeat;
void main() {
  vec2 d = vUv - 0.5;
  float core = 1.0 - smoothstep(0.1, 0.62, length(d));
  float pulse = 0.78 + 0.22 * sin(uTime * 9.0);
  vec3 warm = mix(vec3(1.0, 0.38, 0.06), vec3(1.0, 0.93, 0.8), smoothstep(0.75, 1.0, uHeat));
  vec3 col = mix(vec3(0.015, 0.016, 0.02), warm * (0.55 + 1.3 * core), uHeat * pulse);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const JET_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute float aSeed;
uniform float uTime;
uniform float uJet;
uniform float uHeight;
uniform float uWidth;
varying vec2 vUv;
varying float vSeed;
varying float vNear;
void main() {
  vUv = vec2(aCorner.x + 0.5, aCorner.y);
  vSeed = aSeed;
  // Each jet breathes on its own beat, so a walkway never blows as one sheet.
  float beat = 0.82 + 0.18 * sin(uTime * (5.0 + aSeed * 4.0) + aSeed * 40.0);
  float rise = clamp(uJet * beat, 0.0, 1.0);
  float h = uHeight * (0.78 + 0.44 * aSeed) * rise;
  float w = uWidth * (0.42 + 0.9 * aCorner.y) * (0.5 + 0.5 * rise);
  vec4 foot = modelMatrix * vec4(position, 1.0);
  vec3 right = normalize(vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]));
  float sway = sin(uTime * 2.6 + aSeed * 31.0 + aCorner.y * 2.4) * 0.3 * aCorner.y * aCorner.y;
  vec3 p = foot.xyz + right * (aCorner.x * w + sway) + vec3(0.0, aCorner.y * h, 0.0);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  // A column the camera stands in thins out: the steam never whites out the
  // fight (the belts, the press strips and the boss stay readable through it).
  vNear = smoothstep(2.5, 11.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
// A pressurised column: a hard bright core at the grate tearing into rolling
// steam, scrolled fast up the quad.
const JET_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying float vSeed;
varying float vNear;
uniform float uTime;
uniform float uJet;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float t = uTime * (1.0 + vSeed * 0.5) + vSeed * 31.0;
  float n = noise(vec2(vUv.x * 3.0 + vSeed * 7.0, vUv.y * 5.0 - t * 5.5)) * 0.6
    + noise(vec2(vUv.x * 8.0 - vSeed * 3.0, vUv.y * 12.0 - t * 9.0)) * 0.4;
  float width = mix(0.13, 0.5, pow(vUv.y, 0.65));
  float x = abs(vUv.x - 0.5);
  float body = smoothstep(width, width * 0.2, x + (n - 0.5) * 0.16 * vUv.y);
  float core = smoothstep(0.1, 0.0, x) * smoothstep(0.55, 0.0, vUv.y);
  float a = body * smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.4, vUv.y) * (0.4 + 0.8 * n);
  vec3 col = mix(vec3(0.9, 0.93, 0.95), vec3(1.0, 0.97, 0.9), core);
  gl_FragColor = vec4(col, clamp(a + core * 0.7, 0.0, 1.0) * smoothstep(0.0, 0.12, uJet) * 0.62 * vNear);
  #include <colorspace_fragment>
}
`;

function grilleParts(bin: PartBin, g: VentGrille, y: number): void {
  const h = VENT_GRILLE_HALF;
  for (const side of [-1, 1]) {
    bin.box('iron', g.x, y + 0.05, g.z + side * (h - 0.06), h, 0.05, 0.06);
    bin.box('iron', g.x + side * (h - 0.06), y + 0.05, g.z, 0.06, 0.05, h);
    for (const end of [-1, 1])
      bin.box('brass', g.x + side * (h - 0.06), y + 0.11, g.z + end * (h - 0.06), 0.07, 0.02, 0.07);
  }
  for (let k = -1.5; k <= 1.5; k += 1)
    bin.box('iron', g.x, y + 0.045, g.z + k * 0.34, h - 0.1, 0.035, 0.055);
}

/** The grilles let into every walkway (grates, glowing pits) and the jets over
 *  them, instance-local; `lowGfx` blows every other jet. */
export function buildFoundryVents(ground: Ground, lowGfx: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'stormbrassVents';
  const grilles = ventGrilles();
  const bin = new PartBin();
  const pits: THREE.BufferGeometry[] = [];
  const jets: THREE.BufferGeometry[] = [];
  grilles.forEach((g, i) => {
    const y = ground(g.x, g.z);
    grilleParts(bin, g, y);
    const pit = new THREE.PlaneGeometry(VENT_GRILLE_HALF * 2 - 0.2, VENT_GRILLE_HALF * 2 - 0.2);
    pit.rotateX(-Math.PI / 2);
    pit.translate(g.x, y + 0.02, g.z);
    pits.push(pit);
    if (lowGfx && i % 2 === 1) return;
    // Two quads a jet: the hard column and a wider, softer plume round it.
    for (let k = 0; k < 2; k++) {
      const quad = new THREE.BufferGeometry();
      const wide = k === 0 ? 1 : 1.7;
      quad.setAttribute(
        'position',
        new THREE.BufferAttribute(
          new Float32Array(12).map((_, n) => [g.x, y + 0.1, g.z][n % 3]),
          3,
        ),
      );
      quad.setAttribute(
        'aCorner',
        new THREE.BufferAttribute(
          new Float32Array([-0.5 * wide, 0, 0.5 * wide, 0, 0.5 * wide, 1, -0.5 * wide, 1]),
          2,
        ),
      );
      const seed = (g.seed + k * 0.37) % 1;
      quad.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(4).fill(seed), 1));
      quad.setIndex([0, 1, 2, 0, 2, 3]);
      jets.push(quad);
    }
  });
  const grates = bin.build('stormbrassVentGrilles', false);
  group.add(grates);

  const pitGeo = mergeGeometries(pits, false);
  for (const p of pits) p.dispose();
  if (pitGeo) {
    const pitMat = new THREE.ShaderMaterial({
      name: 'stormbrassVentPit',
      vertexShader: PIT_VERT,
      fragmentShader: PIT_FRAG,
      uniforms: { uTime: sharedUniforms.uTime, uHeat: FOUNDRY_VENT_UNIFORMS.uHeat },
    });
    const mesh = new THREE.Mesh(pitGeo, pitMat);
    mesh.name = 'stormbrassVentPits';
    group.add(mesh);
  }

  const jetGeo = mergeGeometries(jets, false);
  for (const j of jets) j.dispose();
  if (jetGeo) {
    // The feet only: grow the bound by the tallest, widest column.
    jetGeo.computeBoundingSphere();
    if (jetGeo.boundingSphere) jetGeo.boundingSphere.radius += JET_HEIGHT * 1.3;
    const jetMat = new THREE.ShaderMaterial({
      name: 'stormbrassVentJet',
      vertexShader: JET_VERT,
      fragmentShader: JET_FRAG,
      uniforms: {
        uTime: sharedUniforms.uTime,
        uJet: FOUNDRY_VENT_UNIFORMS.uJet,
        uHeight: { value: lowGfx ? JET_HEIGHT * 0.8 : JET_HEIGHT },
        uWidth: { value: JET_WIDTH },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(jetGeo, jetMat);
    mesh.name = 'stormbrassVentJets';
    mesh.renderOrder = floorVfxRenderOrder('encounter', 6);
    group.add(mesh);
  }
  return group;
}

const EMIT_SEC = 0.08;

export class FoundryVentFx {
  private readonly kit: TelegraphKit;
  private readonly lanes: TelegraphLane[] = [];
  private readonly steam: ParticlePool;
  private readonly steamMat: THREE.ShaderMaterial;
  private readonly uTime = { value: 0 };
  private readonly grilles = ventGrilles();
  private readonly strips: Entity[] = [];
  private readonly density: number;
  private rosterVersion = -1;
  private phase: VentPhase = 'off';
  private since = 0;
  private emitAcc = 0;
  private originX = 0;
  private originZ = 0;
  private seed = 0x51ea;
  private readonly spec: ParticleSpec = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 1,
    size0: 1,
    size1: 1,
    r: 0.91,
    g: 0.94,
    b: 0.96,
    a: 1,
  };

  /** `detail`: the cosmetic layers (off on the low tier). The pieces join
   *  `root`, which the owner attaches through the compile gate. */
  constructor(
    root: THREE.Group,
    private readonly groundY: Ground,
    detail: boolean,
  ) {
    this.density = detail ? 1 : 0.4;
    this.kit = new TelegraphKit(root, detail);
    for (let i = 0; i < VENT_LANES.length; i++) this.lanes.push(this.kit.lane(16));
    this.steamMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime },
      vertexShader: PARTICLE_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.steam = new ParticlePool(
      Math.round(520 * this.density) + 80,
      this.steamMat,
      floorVfxRenderOrder('encounter', 6),
    );
    root.add(this.steam.mesh);
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0;
    return (this.seed >>> 0) / 4294967296;
  }

  /** The claim's vent strips, west to east (rebuilt only when an entity came
   *  or went: their templates are read live off the kept references). */
  private rebuild(world: IWorld): void {
    this.rosterVersion = world.entityRosterVersion;
    this.strips.length = 0;
    for (const e of world.entities.values())
      if (e.kind === 'object' && ventPhaseOf(e.templateId) !== 'off') this.strips.push(e);
    this.strips.sort((a, b) => a.pos.x - b.pos.x);
  }

  /** One steam puff rising off grille `g`. */
  private puff(
    g: VentGrille,
    speed: number,
    life: number,
    size0: number,
    size1: number,
    a: number,
  ) {
    const s = this.spec;
    const x = this.originX + g.x + (this.rand() - 0.5) * 1.1;
    const z = this.originZ + g.z + (this.rand() - 0.5) * 1.1;
    const floor = this.groundY(x, z);
    s.x = x;
    s.y = floor + 0.3;
    s.z = z;
    s.vx = (this.rand() - 0.5) * 1.6;
    s.vy = speed * (0.7 + 0.6 * this.rand());
    s.vz = (this.rand() - 0.5) * 1.6;
    s.life = life * (0.7 + 0.6 * this.rand());
    s.drag = 0.9;
    s.floor = floor + 0.05;
    s.size0 = size0;
    s.size1 = size1 * (0.8 + 0.5 * this.rand());
    s.spin = (this.rand() - 0.5) * 1.4;
    s.seed = this.rand();
    s.a = a;
    this.steam.emit(this.uTime.value, s);
  }

  private enter(phase: VentPhase, clock: number): void {
    const was = this.phase;
    this.phase = phase;
    this.since = clock;
    if (phase === 'off') {
      for (const lane of this.lanes) lane.group.visible = false;
      return;
    }
    const west = this.strips[0];
    this.originX = west.pos.x - VENT_LANES[0].x;
    this.originZ = west.pos.z - (VENT_LANES[0].z0 + VENT_LANES[0].length / 2);
    if (was === 'off') {
      // The walkways never move: drape every lane once, as the warning paints.
      this.lanes.forEach((lane, i) => {
        const spec = VENT_LANES[i];
        const x = this.originX + spec.x;
        const z = this.originZ + spec.z0;
        this.kit.drapeLane(
          lane,
          this.groundY,
          x,
          this.groundY(x, z),
          z,
          0,
          spec.length,
          spec.halfWidth,
          VENT_LANE_STYLE,
        );
        lane.group.visible = true;
      });
    }
    if (phase === 'scald') {
      // The burst: every grille throws a gout of steam at once.
      const n = Math.max(1, Math.round(2 * this.density));
      for (const g of this.grilles)
        for (let k = 0; k < n; k++) this.puff(g, 11, 1.2, 0.8, 2.6, 0.3);
    }
  }

  update(dt: number, world: IWorld, clock: number): void {
    if (world.entityRosterVersion !== this.rosterVersion) this.rebuild(world);
    const phase = this.strips.length > 0 ? ventPhaseOf(this.strips[0].templateId) : 'off';
    if (phase !== this.phase) this.enter(phase, clock);
    const age = clock - this.since;
    const U = FOUNDRY_VENT_UNIFORMS;
    U.uJet.value = ventEase(U.uJet.value, ventJetTarget(phase, age), dt);
    U.uHeat.value = ventEase(U.uHeat.value, ventHeatTarget(phase, age), dt);
    this.uTime.value = clock;
    if (phase !== 'off') {
      const fill = ventLaneFill(phase, age);
      for (let i = 0; i < this.lanes.length; i++)
        this.kit.paintLane(this.lanes[i], { fill, clock, range: VENT_LANES[i].length });
      this.emitAcc += dt;
      if (this.emitAcc >= EMIT_SEC) {
        this.emitAcc = 0;
        // Wisps hissing out through the warning; a rolling cloud off the jets.
        const scald = phase === 'scald';
        const n = Math.max(1, Math.round((scald ? 5 : 4) * this.density));
        for (let k = 0; k < n; k++) {
          const g = this.grilles[Math.floor(this.rand() * this.grilles.length)];
          if (scald) this.puff(g, 7.5, 1.4, 1.0, 2.6, 0.2);
          else this.puff(g, 3, 0.7, 0.4, 1.3, 0.5);
        }
      }
    }
    this.steam.update(clock);
  }

  dispose(): void {
    FOUNDRY_VENT_UNIFORMS.uJet.value = 0;
    FOUNDRY_VENT_UNIFORMS.uHeat.value = 0;
    this.kit.dispose();
    this.steam.dispose();
    this.steamMat.dispose();
  }
}
