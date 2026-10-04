// The trash engine's line-of-sight nova (G6, sim/mob/trash_kit/kit_nova.ts):
// "hide behind something" made visible. While a mob casts a nova bar (its
// kit's `nova.castId`, or the every-Nth `unstoppableCastId`) the floor shows
// its SIGHT FIELD: the ring of the nova's radius filling over the bar, cut by
// every wall, pillar and ice slab between the caster and the floor, so the
// shadow behind cover reads as a dark, hatched, safe wedge. The reach of each
// of NOVA_RAYS rays is bisected over the sim's own sight test
// (sim/colliders.ts lineOfSightClear, the very call the sim's nova makes; the
// combat walls are in it, online too), a few rays a frame, round-robin, so a
// slab crashing down mid-bar carves its shadow in at once.
//  - The kickable bar wears the kick glyph under the caster (the interrupt
//    sigil of the shared kit) and the danger rim; the unstoppable one has no
//    glyph, a lethal rim, a crackling double edge and red-white sparks.
//  - On landing (spellfx 'nova', ability = the cast id) a frost wave races out
//    along the lit floor only: its front and a standing curtain of frost stop
//    dead at each block, bursting into spray against it, so the blast reads
//    as a sight line.
//
// The sight field, its rim and the kick glyph are ACTIONABLE: every tier. The
// bands, the curtain and the sparks are cosmetic (the low tier sheds them).
// Built once under the host's root before its gated attach; no light; no
// per-frame allocation (the ray buffers are fixed per slot).

import * as THREE from 'three';
import { lineOfSightClear } from '../../sim/colliders';
import type { Entity, SimEvent } from '../../sim/types';
import { type TelegraphFan, telegraphFillOf } from '../floor_telegraph';
import {
  TELEGRAPH_THREAT_COLORS,
  type TelegraphLook,
  telegraphLook,
} from '../floor_telegraph/telegraph_look_core';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { SURFACE_LIFT } from './engine_geometry';
import {
  kitOf,
  NOVA_RAYS,
  NOVA_WAVE_LINGER,
  NOVA_WAVE_SECONDS,
  type NovaCastLook,
  novaCastLook,
  novaWave,
  rgbOf,
  SCHOOL_TINT,
  sightReach,
} from './trash_engine_fx_core';
import type { TrashEngineHost } from './trash_engine_host';

const CAST_SLOTS = 6;
const WAVE_SLOTS = 3;
/** Radial rings of the lit fan (the fill front and the bands need them). */
const RINGS = 5;
/** Rays re-measured per second per live bar, at most this many a frame, and
 *  how many the claim frame measures at once. */
const RAYS_PER_SECOND = 256;
const MAX_RAYS_PER_FRAME = 12;
const FIRST_RAYS = 16;
/** Seconds a released bar's sight field is kept for its landing wave. */
const KEEP_SECONDS = 1.2;

const FIELD_VERT = /* glsl */ `
attribute float aR;
attribute float aReach;
varying float vR;
varying float vReach;
varying vec3 vWorld;
void main() {
  vR = aR;
  vReach = aReach;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

/** The lit part of the field: the shared telegraph layers (tint, fill and
 *  its front, rim, warning, cosmetic bands) on yards from the caster, the rim
 *  drawn wherever the sight line ends (the nova's edge, or the face of the
 *  cover that stops it). */
const LIT_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAccent;
uniform float uRadius;
uniform float uFill;
uniform float uBase;
uniform float uFilled;
uniform float uFront;
uniform float uRim;
uniform float uWarn;
uniform float uDetail;
uniform float uHarsh;
uniform float uTime;
uniform float uFade;
varying float vR;
varying float vReach;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float edge = max(0.0, vReach - vR);
  float open = smoothstep(uRadius - 0.3, uRadius - 0.05, vReach);
  float rimCore = 1.0 - smoothstep(0.05, 0.18, edge);
  float rimSoft = 1.0 - smoothstep(0.0, 0.7, edge);
  float fillYards = uFill * uRadius;
  float inside = 1.0 - smoothstep(fillYards - 0.08, fillYards + 0.08, vR);
  float front = (1.0 - smoothstep(0.0, 0.6, abs(vR - fillYards))) * uFront;
  float a = uBase + inside * uFilled + front + rimSoft * 0.3 + rimCore * uRim * mix(0.75, 1.0, open);
  a += uWarn * (0.12 + inside * 0.14);
  vec3 col = uColor * (0.8 + 0.35 * inside + 0.45 * rimCore) + uAccent * front * 0.6;
  // The unstoppable bar: a second, broken edge inside the rim that crackles.
  if (uHarsh > 0.5) {
    float inner = 1.0 - smoothstep(0.0, 0.12, abs(edge - 0.7));
    float crackle = step(0.45, hash(floor(vWorld.xz * 2.0) + floor(uTime * 12.0)));
    a += inner * (0.35 + 0.4 * crackle) * open;
    col += vec3(1.0, 0.85, 0.8) * inner * crackle * 0.6 * open;
  }
  if (uDetail > 0.0) {
    float band = fract(vR * 0.55 - uTime * 1.1);
    float bands = smoothstep(0.0, 0.1, band) * (1.0 - smoothstep(0.18, 0.32, band));
    a += bands * 0.08 * (1.0 - inside * 0.5) * uDetail;
  }
  col += vec3(1.0) * uWarn * 0.12;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uFade);
}
`;

/** The shadow behind cover: dark, cool, hatched; the nova cannot see here.
 *  Its outer edge keeps a faint dotted trace of the reach. */
const SHADE_FRAG = /* glsl */ `
uniform float uRadius;
uniform float uTime;
uniform float uFade;
varying float vR;
varying float vReach;
varying vec3 vWorld;
void main() {
  if (vR < vReach + 0.02) discard;
  float hatch = step(0.5, fract((vWorld.x + vWorld.z) * 0.9));
  float near = 1.0 - smoothstep(0.0, 1.2, vR - vReach);
  float trace = (1.0 - smoothstep(0.08, 0.2, uRadius - vR)) * step(0.5, fract(atan(vWorld.z, vWorld.x) * 30.0));
  vec3 col = mix(vec3(0.02, 0.05, 0.09), vec3(0.45, 0.8, 0.95), hatch * 0.25 + near * 0.35);
  float a = 0.34 + hatch * 0.08 + near * 0.2 + trace * 0.35;
  gl_FragColor = vec4(col, a * uFade);
}
`;

/** The landing wave over the lit floor: a racing frost front, rime left
 *  glittering behind it. */
const WAVE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uFront;
uniform float uAlpha;
uniform float uTime;
varying float vR;
varying float vReach;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  if (vR > uFront) discard;
  float d = uFront - vR;
  float crest = exp(-d * d * 1.6);
  float rime = (0.25 + 0.2 * hash(floor(vWorld.xz * 3.0))) * (1.0 - smoothstep(0.0, 9.0, d));
  float wall = 1.0 - smoothstep(0.0, 0.5, vReach - vR);
  vec3 col = mix(uColor, vec3(1.0), crest * 0.6) * (1.0 + crest * 1.2 + wall * 0.8);
  gl_FragColor = vec4(col * (crest + rime + wall * 0.6) * uAlpha, 1.0);
}
`;

const CURTAIN_VERT = /* glsl */ `
attribute float aH;
varying float vH;
varying vec3 vWorld;
void main() {
  vH = aH;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
/** The standing frost curtain riding the wave's front. */
const CURTAIN_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying float vH;
varying vec3 vWorld;
void main() {
  float streak = 0.6 + 0.4 * sin((vWorld.x - vWorld.z) * 3.1 + uTime * 9.0);
  float fall = pow(max(1.0 - vH, 0.0), 1.6);
  vec3 col = mix(uColor, vec3(1.0), 0.35) * 1.4;
  gl_FragColor = vec4(col * fall * streak * uAlpha, 1.0);
}
`;

/** One sight field: the lit fan and its shadow strip over NOVA_RAYS rays. */
interface Field {
  lit: THREE.Mesh;
  shade: THREE.Mesh;
  litMat: THREE.ShaderMaterial;
  shadeMat: THREE.ShaderMaterial;
}

interface CastSlot {
  casterId: number;
  castId: string;
  look: NovaCastLook | null;
  /** The caster the field was measured for (kept after release). */
  lastCasterId: number;
  releasedAt: number;
  x: number;
  y: number;
  z: number;
  reach: Float32Array;
  cursor: number;
  /** Rays owed to the budget (fractional carry). */
  due: number;
  field: Field;
  sigil: TelegraphFan;
  spark: number;
}

interface WaveSlot {
  alive: boolean;
  born: number;
  radius: number;
  x: number;
  y: number;
  z: number;
  reach: Float32Array;
  /** Rays whose block the front has already splashed against. */
  splashed: Uint8Array;
  color: number;
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  curtain: THREE.Mesh;
  curtainMat: THREE.ShaderMaterial;
}

/** Vertices of one sector (between two neighbouring rays) of the lit fan. */
const LIT_PER_SECTOR = (RINGS + 1) * 2;

/**
 * The sight field's geometry, one SECTOR per pair of neighbouring rays with
 * vertices of its own: a sector is lit out to the FARTHER of its two rays'
 * reaches and shaded only beyond that, so the hatched shadow is drawn only
 * where both of its rays are blocked (conservative: never a safe-looking spot
 * the nova can still see).
 */
function fieldGeometry(): { lit: THREE.BufferGeometry; shade: THREE.BufferGeometry } {
  const n = NOVA_RAYS;
  const litCount = n * LIT_PER_SECTOR;
  const lit = new THREE.BufferGeometry();
  lit.setAttribute('position', new THREE.BufferAttribute(new Float32Array(litCount * 3), 3));
  lit.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(litCount), 1));
  lit.setAttribute('aReach', new THREE.BufferAttribute(new Float32Array(litCount), 1));
  const li: number[] = [];
  for (let s = 0; s < n; s++) {
    const b = s * LIT_PER_SECTOR;
    for (let k = 0; k < RINGS; k++) {
      const a0 = b + k * 2;
      li.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }
  lit.setIndex(li);
  const shade = new THREE.BufferGeometry();
  shade.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
  shade.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(n * 4), 1));
  shade.setAttribute('aReach', new THREE.BufferAttribute(new Float32Array(n * 4), 1));
  const si: number[] = [];
  for (let s = 0; s < n; s++) {
    const b = s * 4;
    si.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  shade.setIndex(si);
  return { lit, shade };
}

export class EngineNova {
  private readonly casts: CastSlot[] = [];
  private readonly waves: WaveSlot[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly look: TelegraphLook = {
    base: 0,
    filled: 0,
    front: 0,
    rim: 0,
    warn: 0,
    detail: 0,
  };
  private readonly from = { x: 0, y: 0, z: 0 };
  private readonly to = { x: 0, z: 0 };
  /** The ray under test (unit direction), read by the one bound sight probe. */
  private rayX = 0;
  private rayZ = 0;
  private readonly clearAt = (d: number): boolean => {
    this.to.x = this.from.x + this.rayX * d;
    this.to.z = this.from.z + this.rayZ * d;
    return lineOfSightClear(this.host.world.cfg.seed, this.from, this.to, 0.05);
  };
  private readonly cosA = new Float32Array(NOVA_RAYS);
  private readonly sinA = new Float32Array(NOVA_RAYS);
  private readonly detail: boolean;
  private clock = 0;

  constructor(private readonly host: TrashEngineHost) {
    this.detail = host.density >= 1;
    for (let i = 0; i < NOVA_RAYS; i++) {
      const a = (i / NOVA_RAYS) * Math.PI * 2;
      // Sim convention: facing 0 looks down +z (x = sin, z = cos).
      this.sinA[i] = Math.sin(a);
      this.cosA[i] = Math.cos(a);
    }
    for (let i = 0; i < CAST_SLOTS; i++) {
      this.casts.push({
        casterId: -1,
        castId: '',
        look: null,
        lastCasterId: -1,
        releasedAt: -1e9,
        x: 0,
        y: 0,
        z: 0,
        reach: new Float32Array(NOVA_RAYS),
        cursor: 0,
        due: 0,
        field: this.field(),
        sigil: host.kit.fan(19),
        spark: 0,
      });
    }
    for (let i = 0; i < WAVE_SLOTS; i++) {
      const { lit } = fieldGeometry();
      this.geometries.push(lit);
      const mat = new THREE.ShaderMaterial({
        name: 'trashEngineNovaWave',
        uniforms: {
          uColor: { value: new THREE.Color() },
          uFront: { value: 0 },
          uAlpha: { value: 0 },
          uTime: host.uTime,
        },
        vertexShader: FIELD_VERT,
        fragmentShader: WAVE_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(lit, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = floorVfxRenderOrder('encounter', 22);
      host.root.add(mesh);
      // The curtain: one quad per ray, its foot on the front, 2.6 yd tall.
      const cg = new THREE.BufferGeometry();
      cg.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(NOVA_RAYS * 2 * 3), 3),
      );
      const hAttr = new Float32Array(NOVA_RAYS * 2);
      for (let r = 0; r < NOVA_RAYS; r++) hAttr[r * 2 + 1] = 1;
      cg.setAttribute('aH', new THREE.BufferAttribute(hAttr, 1));
      const ci: number[] = [];
      for (let r = 0; r < NOVA_RAYS; r++) {
        const j = (r + 1) % NOVA_RAYS;
        ci.push(r * 2, j * 2, r * 2 + 1, j * 2, j * 2 + 1, r * 2 + 1);
      }
      cg.setIndex(ci);
      this.geometries.push(cg);
      const curtainMat = new THREE.ShaderMaterial({
        name: 'trashEngineNovaCurtain',
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uTime: host.uTime },
        vertexShader: CURTAIN_VERT,
        fragmentShader: CURTAIN_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.materials.push(curtainMat);
      const curtain = new THREE.Mesh(cg, curtainMat);
      curtain.frustumCulled = false;
      curtain.visible = false;
      curtain.renderOrder = floorVfxRenderOrder('encounter', 25);
      host.root.add(curtain);
      this.waves.push({
        alive: false,
        born: 0,
        radius: 0,
        x: 0,
        y: 0,
        z: 0,
        reach: new Float32Array(NOVA_RAYS),
        splashed: new Uint8Array(NOVA_RAYS),
        color: 0xffffff,
        mesh,
        mat,
        curtain,
        curtainMat,
      });
    }
  }

  private field(): Field {
    const { lit, shade } = fieldGeometry();
    this.geometries.push(lit, shade);
    const litMat = new THREE.ShaderMaterial({
      name: 'trashEngineNovaSight',
      uniforms: {
        uColor: { value: new THREE.Color() },
        uAccent: { value: new THREE.Color() },
        uRadius: { value: 1 },
        uFill: { value: 0 },
        uBase: { value: 0 },
        uFilled: { value: 0 },
        uFront: { value: 0 },
        uRim: { value: 0 },
        uWarn: { value: 0 },
        uDetail: { value: 0 },
        uHarsh: { value: 0 },
        uTime: this.host.uTime,
        uFade: { value: 1 },
      },
      vertexShader: FIELD_VERT,
      fragmentShader: LIT_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const shadeMat = new THREE.ShaderMaterial({
      name: 'trashEngineNovaShade',
      uniforms: { uRadius: { value: 1 }, uTime: this.host.uTime, uFade: { value: 1 } },
      vertexShader: FIELD_VERT,
      fragmentShader: SHADE_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.materials.push(litMat, shadeMat);
    const litMesh = new THREE.Mesh(lit, litMat);
    litMesh.frustumCulled = false;
    litMesh.visible = false;
    litMesh.renderOrder = floorVfxRenderOrder('encounter', 15);
    const shadeMesh = new THREE.Mesh(shade, shadeMat);
    shadeMesh.frustumCulled = false;
    shadeMesh.visible = false;
    shadeMesh.renderOrder = floorVfxRenderOrder('encounter', 14);
    this.host.root.add(litMesh, shadeMesh);
    return { lit: litMesh, shade: shadeMesh, litMat, shadeMat };
  }

  // ------------------------------------------------------------- sight rays

  /** The sim's own sight test from the caster to a floor spot `d` yards out. */
  private rayReach(
    at: { x: number; y: number; z: number },
    ray: number,
    radius: number,
    caster: Entity | null,
    steps?: number,
  ): number {
    this.from.x = caster ? caster.pos.x : at.x;
    this.from.y = caster ? caster.pos.y : at.y;
    this.from.z = caster ? caster.pos.z : at.z;
    this.rayX = this.sinA[ray];
    this.rayZ = this.cosA[ray];
    return sightReach(this.clearAt, radius, steps);
  }

  /** Rewrite the two sectors that share ray `ray` (its reach changed). */
  private writeRay(
    lit: THREE.BufferGeometry,
    shade: THREE.BufferGeometry | null,
    at: { x: number; y: number; z: number },
    ray: number,
    reach: Float32Array,
    radius: number,
    lift: number,
  ): void {
    this.writeSector(lit, shade, at, (ray + NOVA_RAYS - 1) % NOVA_RAYS, reach, radius, lift);
    this.writeSector(lit, shade, at, ray, reach, radius, lift);
  }

  /** Lay one sector (rays `s` and `s + 1`) on the floor: lit out to the
   *  farther of the two reaches, shaded from there to the radius. */
  private writeSector(
    lit: THREE.BufferGeometry,
    shade: THREE.BufferGeometry | null,
    at: { x: number; y: number; z: number },
    s: number,
    reach: Float32Array,
    radius: number,
    lift: number,
  ): void {
    const gY = this.host.groundY;
    const j = (s + 1) % NOVA_RAYS;
    const q = Math.max(reach[s], reach[j]);
    const lp = lit.getAttribute('position') as THREE.BufferAttribute;
    const lr = lit.getAttribute('aR') as THREE.BufferAttribute;
    const lre = lit.getAttribute('aReach') as THREE.BufferAttribute;
    const base = s * LIT_PER_SECTOR;
    for (let k = 0; k <= RINGS; k++) {
      const d = (q * k) / RINGS;
      for (let e = 0; e < 2; e++) {
        const ray = e === 0 ? s : j;
        const wx = at.x + this.sinA[ray] * d;
        const wz = at.z + this.cosA[ray] * d;
        const idx = base + k * 2 + e;
        lp.setXYZ(idx, wx - at.x, gY(wx, wz) - at.y + lift, wz - at.z);
        lr.setX(idx, d);
        lre.setX(idx, q);
      }
    }
    lp.needsUpdate = true;
    lr.needsUpdate = true;
    lre.needsUpdate = true;
    if (!shade) return;
    const sp = shade.getAttribute('position') as THREE.BufferAttribute;
    const sr = shade.getAttribute('aR') as THREE.BufferAttribute;
    const sre = shade.getAttribute('aReach') as THREE.BufferAttribute;
    for (let k = 0; k < 2; k++) {
      const d = k === 0 ? q : radius;
      for (let e = 0; e < 2; e++) {
        const ray = e === 0 ? s : j;
        const wx = at.x + this.sinA[ray] * d;
        const wz = at.z + this.cosA[ray] * d;
        const idx = s * 4 + k * 2 + e;
        sp.setXYZ(idx, wx - at.x, gY(wx, wz) - at.y + lift * 0.8, wz - at.z);
        sr.setX(idx, d);
        sre.setX(idx, q);
      }
    }
    sp.needsUpdate = true;
    sr.needsUpdate = true;
    sre.needsUpdate = true;
  }

  /** Lay a whole field (every sector). */
  private writeField(
    lit: THREE.BufferGeometry,
    shade: THREE.BufferGeometry | null,
    at: { x: number; y: number; z: number },
    reach: Float32Array,
    radius: number,
    lift: number,
  ): void {
    for (let s = 0; s < NOVA_RAYS; s++) this.writeSector(lit, shade, at, s, reach, radius, lift);
  }

  // ------------------------------------------------------------------ scans

  /** A mob seen by the scan: claim its nova bar. */
  scanMob(e: Entity): void {
    if (e.dead || !e.castingAbility) return;
    const look = novaCastLook(kitOf(e), e.castingAbility);
    if (!look) return;
    if (this.casts.some((c) => c.casterId === e.id)) return;
    const slot =
      this.casts.find((c) => c.casterId < 0 && this.clock - c.releasedAt > KEEP_SECONDS) ??
      this.casts.find((c) => c.casterId < 0);
    if (!slot) return;
    slot.casterId = e.id;
    slot.lastCasterId = e.id;
    slot.castId = e.castingAbility;
    slot.look = look;
    slot.x = e.pos.x;
    slot.y = this.host.groundY(e.pos.x, e.pos.z);
    slot.z = e.pos.z;
    slot.cursor = 0;
    slot.spark = 0;
    // Start open (the whole ring), then carve the shadows in as rays land:
    // a quarter of the rays are measured this very frame.
    for (let r = 0; r < NOVA_RAYS; r++) slot.reach[r] = look.radius;
    const f = slot.field;
    f.lit.position.set(slot.x, slot.y, slot.z);
    f.shade.position.set(slot.x, slot.y, slot.z);
    this.writeField(f.lit.geometry, f.shade.geometry, slot, slot.reach, look.radius, SURFACE_LIFT);
    slot.due = 0;
    this.measure(slot, e, FIRST_RAYS);
    const lu = f.litMat.uniforms;
    (lu.uColor.value as THREE.Color).setHex(look.color);
    (lu.uAccent.value as THREE.Color).setHex(look.accent);
    lu.uRadius.value = look.radius;
    lu.uHarsh.value = look.kickable ? 0 : 1;
    f.shadeMat.uniforms.uRadius.value = look.radius;
    f.lit.visible = true;
    f.shade.visible = true;
    if (look.kickable) {
      this.host.kit.layOutFan(slot.sigil, 360, {
        color: TELEGRAPH_THREAT_COLORS.interrupt,
        accent: look.accent,
        sigil: true,
      });
      slot.sigil.group.visible = true;
    }
  }

  private measure(slot: CastSlot, caster: Entity | null, count: number): void {
    const look = slot.look;
    if (!look) return;
    for (let k = 0; k < count; k++) {
      const ray = slot.cursor;
      slot.cursor = (slot.cursor + 1) % NOVA_RAYS;
      const reach = this.rayReach(slot, ray, look.radius, caster);
      if (Math.abs(reach - slot.reach[ray]) > 0.05) {
        slot.reach[ray] = reach;
        const f = slot.field;
        this.writeRay(
          f.lit.geometry,
          f.shade.geometry,
          slot,
          ray,
          slot.reach,
          look.radius,
          SURFACE_LIFT,
        );
      }
    }
  }

  // ----------------------------------------------------------------- events

  /** A nova landed: its wave. True when drawn here. */
  handleEvent(ev: SimEvent): boolean {
    if (ev.type !== 'spellfx' || ev.fx !== 'nova' || !ev.ability) return false;
    const def = this.host.catalog.novas.get(ev.ability);
    if (!def) return false;
    const caster = this.host.world.entities.get(ev.sourceId) ?? null;
    const slot =
      this.casts.find((c) => c.casterId === ev.sourceId) ??
      this.casts.find(
        (c) => c.lastCasterId === ev.sourceId && this.clock - c.releasedAt <= KEEP_SECONDS,
      );
    const wave = this.waves.find((w) => !w.alive) ?? this.waves[0];
    if (slot) {
      wave.reach.set(slot.reach);
      wave.x = slot.x;
      wave.y = slot.y;
      wave.z = slot.z;
      if (slot.casterId === ev.sourceId) this.release(slot);
      slot.lastCasterId = -1;
    } else if (caster) {
      // Seen landing without its bar (it came into view late): measure now.
      wave.x = caster.pos.x;
      wave.y = this.host.groundY(caster.pos.x, caster.pos.z);
      wave.z = caster.pos.z;
      // Coarse, so a late landing never stalls its frame: every fourth ray,
      // three bisection steps, each standing for its neighbours.
      for (let r = 0; r < NOVA_RAYS; r += 4) {
        const reach = this.rayReach(wave, r, def.radius, caster, 3);
        for (let k = 0; k < 4 && r + k < NOVA_RAYS; k++) wave.reach[r + k] = reach;
      }
    } else return true;
    this.launchWave(wave, def.radius, SCHOOL_TINT[def.school] ?? SCHOOL_TINT.frost);
    return true;
  }

  private launchWave(wave: WaveSlot, radius: number, color: number): void {
    wave.alive = true;
    wave.born = this.clock;
    wave.radius = radius;
    wave.color = color;
    wave.splashed.fill(0);
    // The wave's floor: the lit fan of the reach it was cast with.
    this.writeField(wave.mesh.geometry, null, wave, wave.reach, radius, SURFACE_LIFT * 1.4);
    wave.mesh.position.set(wave.x, wave.y, wave.z);
    wave.curtain.position.set(wave.x, wave.y, wave.z);
    (wave.mat.uniforms.uColor.value as THREE.Color).setHex(color);
    (wave.curtainMat.uniforms.uColor.value as THREE.Color).setHex(color);
    wave.mesh.visible = true;
    wave.curtain.visible = this.detail;
    const h = this.host;
    // The blast at its heart.
    h.shockRing(wave.x, wave.z, 0xffffff, 3.5, 0.3);
    h.puff(wave.x, wave.y + 1.4, wave.z, 6, {
      speed: 0.3,
      life: 0.3,
      size: [5, 2],
      color: rgbOf(color),
      alpha: 1,
      pool: 'glow',
    });
    h.shards.burst(wave.x, wave.y + 1.2, wave.z, 24, {
      speed: 12,
      up: 3,
      size: [0.25, 0.8],
      radius: 0.8,
      iron: 0,
    });
    if (!h.reducedMotion()) h.shake(0.3);
  }

  // ------------------------------------------------------------------ frame

  update(dt: number, clock: number): void {
    this.clock = clock;
    const world = this.host.world;
    for (const slot of this.casts) {
      if (slot.casterId < 0 || !slot.look) continue;
      const caster = world.entities.get(slot.casterId);
      if (!caster || caster.dead || caster.castingAbility !== slot.castId) {
        this.release(slot);
        continue;
      }
      const look = slot.look;
      if (caster.pos.x !== slot.x || caster.pos.z !== slot.z) {
        // A planted bar never moves; a resend only. Redraw where it stands.
        slot.x = caster.pos.x;
        slot.z = caster.pos.z;
        slot.y = this.host.groundY(slot.x, slot.z);
        slot.field.lit.position.set(slot.x, slot.y, slot.z);
        slot.field.shade.position.set(slot.x, slot.y, slot.z);
        const f = slot.field;
        this.writeField(
          f.lit.geometry,
          f.shade.geometry,
          slot,
          slot.reach,
          look.radius,
          SURFACE_LIFT,
        );
      }
      // A rays-per-second budget (a full sweep about four times a second),
      // never more than a handful in one frame whatever the refresh rate.
      slot.due = Math.min(MAX_RAYS_PER_FRAME, slot.due + dt * RAYS_PER_SECOND);
      const now = Math.floor(slot.due);
      slot.due -= now;
      this.measure(slot, caster, now);
      const fill = telegraphFillOf(caster.castRemaining, caster.castTotal);
      const l = telegraphLook(fill, clock, this.detail, this.look);
      const u = slot.field.litMat.uniforms;
      u.uFill.value = fill;
      u.uBase.value = l.base;
      u.uFilled.value = l.filled;
      u.uFront.value = l.front;
      u.uRim.value = l.rim;
      u.uWarn.value = look.kickable ? l.warn : Math.min(1, l.warn * 1.4 + 0.15 * fill);
      u.uDetail.value = l.detail;
      if (look.kickable) {
        this.host.kit.drapeFan(
          slot.sigil,
          this.host.groundY,
          slot.x,
          slot.y,
          slot.z,
          clock * 1.4,
          2.4,
        );
        this.host.kit.paintFan(slot.sigil, { fill, clock, range: 2.4 });
      } else {
        // The unstoppable bar: red-white sparks crackling round the caster.
        slot.spark += dt * 26 * this.host.density;
        while (slot.spark >= 1) {
          slot.spark -= 1;
          const a = this.host.rand() * Math.PI * 2;
          const r = 1.2 + this.host.rand() * 1.4;
          this.host.puff(slot.x + Math.sin(a) * r, slot.y + 0.3, slot.z + Math.cos(a) * r, 1, {
            speed: 0.6,
            up: 2.4 + fill * 3,
            life: 0.5,
            size: [0.22, 0.05],
            color: [1, 0.5 + 0.4 * this.host.rand(), 0.45],
            alpha: 1,
            pool: 'glow',
          });
        }
      }
    }
    this.updateWaves();
  }

  private updateWaves(): void {
    const h = this.host;
    for (const w of this.waves) {
      if (!w.alive) continue;
      const elapsed = this.clock - w.born;
      if (elapsed > NOVA_WAVE_SECONDS + NOVA_WAVE_LINGER) {
        w.alive = false;
        w.mesh.visible = false;
        w.curtain.visible = false;
        continue;
      }
      const wave = novaWave(elapsed, w.radius);
      w.mat.uniforms.uFront.value = wave.front;
      w.mat.uniforms.uAlpha.value = wave.alpha;
      const racing = elapsed < NOVA_WAVE_SECONDS;
      w.curtainMat.uniforms.uAlpha.value = racing ? 0.9 : Math.max(0, wave.alpha - 0.4);
      // The curtain stands on the front, held at each ray's block.
      const cp = w.curtain.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let ray = 0; ray < NOVA_RAYS; ray++) {
        const reach = w.reach[ray];
        const d = Math.min(wave.front, reach);
        const wx = w.x + this.sinA[ray] * d;
        const wz = w.z + this.cosA[ray] * d;
        const gy = h.groundY(wx, wz) - w.y;
        cp.setXYZ(ray * 2, wx - w.x, gy, wz - w.z);
        cp.setXYZ(ray * 2 + 1, wx - w.x, gy + 2.6, wz - w.z);
        // The blast slams into the cover that stops it: spray at the face.
        if (racing && w.splashed[ray] === 0 && reach < w.radius - 0.3 && wave.front >= reach) {
          w.splashed[ray] = 1;
          h.puff(wx, h.groundY(wx, wz) + 1.2, wz, 3, {
            speed: 2.6,
            up: 2,
            life: 0.9,
            size: [0.9, 2.4],
            color: [0.88, 0.95, 1],
            alpha: 0.5,
            dir: [-this.sinA[ray], 0.6, -this.cosA[ray]],
            spread: 0.6,
            drag: 2,
          });
          h.puff(wx, h.groundY(wx, wz) + 1.4, wz, 3, {
            speed: 3.2,
            up: 2.5,
            life: 0.5,
            size: [0.2, 0.05],
            color: rgbOf(w.color),
            alpha: 1,
            pool: 'glow',
            gravity: 6,
          });
        }
        // Frost thrown along every lit ray as the front passes.
        if (racing && reach >= w.radius - 0.3 && ray % 3 === 0 && h.rand() < 0.45 * h.density)
          h.puff(wx, h.groundY(wx, wz) + 0.4, wz, 1, {
            speed: 3,
            up: 1.2,
            life: 0.6,
            size: [0.6, 1.8],
            color: [0.86, 0.94, 1],
            alpha: 0.4,
            dir: [this.sinA[ray], 0.2, this.cosA[ray]],
            spread: 0.3,
            drag: 2.4,
          });
      }
      cp.needsUpdate = true;
    }
  }

  private release(slot: CastSlot): void {
    slot.casterId = -1;
    slot.look = null;
    slot.releasedAt = this.clock;
    slot.field.lit.visible = false;
    slot.field.shade.visible = false;
    slot.sigil.group.visible = false;
  }

  hideAll(): void {
    for (const s of this.casts) {
      this.release(s);
      s.lastCasterId = -1;
    }
    for (const w of this.waves) {
      w.alive = false;
      w.mesh.visible = false;
      w.curtain.visible = false;
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
