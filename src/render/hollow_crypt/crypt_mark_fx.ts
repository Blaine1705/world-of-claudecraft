// The marks the crypt trash leaves on a body, and the drake's heroic embers
// (plan: crypt_trash_kit_fx_core.ts; host: crypt_trash_kit_fx.ts):
//
//  - Granite Skin. Every layer of the Chapel Gargoyle's ward (its aura's
//    stacks, one to five) slams a ring of pale granite plates onto its body
//    with a crust pulse; the crust closes, thickens and pales with each layer,
//    and stone flakes orbit it, more and faster as it grows. A stun shatters
//    it (Cracked Stone): rock shards burst off the body with amber sparks and
//    a dust cloud, and while the crack holds, hot amber fissures glow on the
//    body and a heat halo beats round it: hit it now.
//  - Carrion Eye. A bruised-violet carrion bolt arcs from the Crow Caller's
//    staff to its victim, trailing smoke and shedding black feathers; while
//    the mark holds, a great violet eye hangs open over the victim's head,
//    blinking, and dark streaks run from every living Carrion Crow to it.
//  - Rimesilk Spit. A frost-white web strand shot down the widow's lane; a
//    player it roots stands in a frost web net for the root's seconds.
//  - Barrow Embers (heroic). The drake's breath cone burns on as live ghost
//    fire (warm green-white, the GHOST_FIRE_RAMP) until its object goes.
//
// The eye, the streaks, the web net, the crust, the cracks and the burning
// cone are actionable reads and draw on every tier; the orbiting flakes are a
// flourish and shed on the low tier; particle budgets follow the host density.

import * as THREE from 'three';
import {
  CRYPT_BARROW_EMBERS,
  CRYPT_CARRION_EYE,
  CRYPT_CRACKED_STONE,
  CRYPT_GRANITE_SKIN,
  CRYPT_RIMESILK_SPIT,
} from '../../sim/mob/trash_kit/cast_ids';
import type { Entity, SimEvent } from '../../sim/types';
import { anchorWorld, coneSpot, shockwave } from './crypt_creature_fx_core';
import { drapePolar, HALO_FRAG, NOISE_GLSL, SHOCK_FRAG } from './crypt_fx_floor';
import { GHOST_RAMP } from './crypt_fx_particles';
import type { CryptKitHost, KitBeam, KitGlyph, KitPatch } from './crypt_trash_kit_fx';
import { KIT_STEPS } from './crypt_trash_kit_fx';
import {
  barrowEmbersSpec,
  boltArcInto,
  CARRION_BOLT,
  CARRION_VIOLET,
  CRACK_AMBER,
  CRACK_SPRITES,
  CRYPT_KIT_MOBS,
  crackedGlow,
  crustPlateSpot,
  EYE_LIFT,
  embersFlameRate,
  eyeGlyph,
  GARGOYLE_BODY,
  GRANITE_FLAKES_PER_LAYER,
  GRANITE_PALE,
  GRANITE_PLATES_PER_LAYER,
  graniteCrust,
  graniteSpec,
  hazardLevel,
  LAYER_SLAM_SECONDS,
  layerSlam,
  RIME_WHITE,
  rimesilkLane,
  STRAND,
  strandPhase,
  WEB_NET_RADIUS,
  webNetLevel,
} from './crypt_trash_kit_fx_core';

const GARGOYLE_SLOTS = 3;
const EYE_SLOTS = 4;
const STREAK_SLOTS = 10;
const BOLT_SLOTS = 3;
const STRAND_SLOTS = 3;
const NET_SLOTS = 5;
const EMBER_SLOTS = 2;
const SCAN_SEC = 0.1;
const ROOT_AURA = `${CRYPT_RIMESILK_SPIT}_root`;
/** Where a player's head and chest stand over their feet (a player is 2.6). */
const HEAD = 2.5;
const CHEST = 1.45;
/** A Carrion Crow flies this high over its spot (the manifest's hover, plus its body). */
const CROW_UP = 2.7;
/** How far a crow may be from its mark and still streak to it. */
const STREAK_REACH = 60;

/** Pale granite plates and flakes: opaque stone, faceted, lit by a fixed key
 *  (no scene light enters the program), speckled, flashing as a layer slams. */
const STONE_VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vObj;
void main() {
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  vObj = position;
  vec4 w = modelMatrix * p;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const STONE_FRAG = /* glsl */ `
uniform float uPale;
uniform float uFlash;
uniform float uLight;
varying vec3 vW;
varying vec3 vObj;
${NOISE_GLSL}
void main() {
  vec3 c = cross(dFdx(vW), dFdy(vW));
  float l = length(c);
  vec3 n = l > 1e-10 ? c / l : vec3(0.0, 1.0, 0.0);
  float diff = 0.38 + 0.62 * max(dot(n, normalize(vec3(0.35, 0.9, 0.25))), 0.0);
  float rim = 0.18 * max(dot(n, normalize(vec3(-0.6, 0.2, -0.7))), 0.0);
  float speck = vnoise(vObj.xz * 9.0 + vObj.y * 5.0) * 0.6 + vnoise(vObj.xy * 23.0) * 0.4;
  vec3 dark = vec3(0.36, 0.35, 0.33);
  vec3 pale = vec3(0.8, 0.78, 0.73);
  vec3 col = mix(dark, pale, 0.3 + 0.7 * uPale) * (0.78 + 0.34 * speck) * (diff + rim) * uLight;
  col += vec3(0.92, 0.92, 0.88) * uFlash;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** A hot amber fissure on the cracked body: a jagged vein with a branch and a
 *  heat glow round it. `uSeed` turns and reshapes each sprite. */
const CRACK_GLYPH_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
uniform float uSeed;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float ang = uSeed * 6.2831;
  vec2 d = vec2(cos(ang), sin(ang));
  vec2 q = vec2(dot(p, d), dot(p, vec2(-d.y, d.x)));
  float wob = (vnoise(vec2(q.x * 9.0 + uSeed * 13.0, uSeed * 3.0)) - 0.5) * 0.16;
  float main = 1.0 - smoothstep(0.0, 0.028, abs(q.y - wob));
  float br = (vnoise(vec2(q.x * 5.0, uSeed * 7.0 + 3.0)) - 0.5) * 0.3;
  float branch = (1.0 - smoothstep(0.0, 0.022, abs(q.y * 0.6 + q.x * 0.8 - br))) * step(0.0, q.x);
  float fade = 1.0 - smoothstep(0.5, 0.95, r);
  float crack = max(main, branch * 0.8) * fade;
  float glow = (1.0 - smoothstep(0.0, 0.14, abs(q.y - wob))) * 0.4 * fade;
  vec3 col = uColor * (1.5 + 1.8 * crack) + vec3(1.0, 0.95, 0.8) * crack * 0.8;
  gl_FragColor = vec4(col, clamp(crack + glow, 0.0, 1.0) * uAlpha);
}
`;

/** The Carrion Eye: an almond eye of bruised violet light, a black slit
 *  pupil, a hot iris ring and spikes round it, opening and blinking.
 *  Normal-blended so it reads over a bright floor as well as a dark one. */
const EYE_FRAG = /* glsl */ `
uniform float uAlpha;
uniform float uOpen;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float x2 = p.x * p.x * 1.15;
  float lid = uOpen * 0.52 * max(1.0 - x2, 0.0);
  float inside = step(abs(p.y), lid) * step(x2, 1.0);
  float outline = (1.0 - smoothstep(0.0, 0.07, abs(abs(p.y) - lid))) * step(x2, 1.0);
  float ir = length(p);
  float iris = (1.0 - smoothstep(0.3, 0.34, ir)) * inside;
  float irisRim = (1.0 - smoothstep(0.0, 0.05, abs(ir - 0.3))) * inside;
  float slit = (1.0 - smoothstep(0.045, 0.08, abs(p.x) + p.y * p.y * 0.25)) * inside * step(abs(p.y), 0.3);
  float a = atan(p.y, p.x + 1e-4);
  float s = abs(sin(a * 7.0 + uTime * 0.7));
  s = s * s;
  s = s * s;
  s = s * s;
  float spikes = s * smoothstep(0.62, 0.72, ir) * (1.0 - smoothstep(0.82, 1.0, ir)) * uOpen;
  float halo = (1.0 - smoothstep(0.55, 1.0, ir)) * 0.35;
  vec3 violet = vec3(0.72, 0.28, 1.0);
  vec3 col = vec3(0.12, 0.02, 0.18) * inside;
  col = mix(col, violet * 1.9, iris * (0.55 + 0.45 * sin(uTime * 5.0 + ir * 18.0)));
  col = mix(col, vec3(1.0, 0.8, 1.0) * 2.0, irisRim);
  col = mix(col, vec3(0.0), slit);
  col = mix(col, violet * 2.2, max(outline, spikes) * (1.0 - inside * 0.6));
  float alpha = clamp(inside * 0.92 + outline + spikes * 0.9 + halo * 0.4, 0.0, 1.0);
  col = mix(violet * 0.9, col, step(0.001, inside + outline + spikes));
  gl_FragColor = vec4(col, alpha * uAlpha);
}
`;

/** A crow's streak to its mark: a dark violet-black ribbon with violet
 *  dashes running toward the victim (B). Normal-blended (it is dark). */
const STREAK_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float across = abs(vUv.x - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.6, across);
  float flow = fract(vUv.y * 6.0 - uTime * 2.4);
  float dash = smoothstep(0.0, 0.1, flow) * (1.0 - smoothstep(0.3, 0.6, flow));
  float ends = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
  vec3 col = mix(vec3(0.06, 0.0, 0.09), vec3(0.78, 0.32, 1.0) * 1.7, dash * 0.75 + (1.0 - core) * 0.25);
  gl_FragColor = vec4(col, core * (0.6 + 0.4 * dash) * ends * uAlpha);
}
`;

/** The Rimesilk strand: twisted frost-white fibres with an icy glow. */
const STRAND_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float x = vUv.x - 0.5;
  float tw = sin(vUv.y * 70.0 - uTime * 4.0) * 0.18;
  float f1 = 1.0 - smoothstep(0.0, 0.07, abs(x - tw));
  float f2 = 1.0 - smoothstep(0.0, 0.07, abs(x + tw));
  float glow = 1.0 - smoothstep(0.0, 0.5, abs(x));
  float ends = smoothstep(0.0, 0.04, vUv.y);
  vec3 col = vec3(0.86, 0.96, 1.0) * (1.3 + 1.2 * max(f1, f2));
  gl_FragColor = vec4(col, (max(f1, f2) * 0.95 + glow * 0.3) * ends * uAlpha);
}
`;

/** A frost web round a rooted player's feet: spokes, sagging rings, rime. */
const WEB_FRAG = /* glsl */ `
uniform float uLevel;
uniform float uTime;
varying vec2 vPolar;
varying vec3 vLocal;
float lineAt(float x, float w) {
  float d = abs(fract(x + 0.5) - 0.5);
  return 1.0 - smoothstep(0.0, w, d);
}
void main() {
  float r = vPolar.x;
  float spokes = lineAt(vPolar.y * 9.0, 0.035 / max(r, 0.06)) * step(0.06, r);
  float rings = lineAt(r * 5.0 + sin(vPolar.y * 6.2831 * 9.0) * 0.1, 0.06) * step(0.12, r);
  float fade = 1.0 - smoothstep(0.82, 1.0, r);
  float web = max(spokes, rings * 0.9) * fade;
  float k = max(1.0 - r, 0.0);
  float rime = k * k * 0.35;
  float glint = 0.85 + 0.15 * sin(uTime * 3.0 + r * 12.0);
  vec3 col = vec3(0.9, 0.97, 1.0) * (1.1 + 0.6 * web) * glint;
  gl_FragColor = vec4(col, clamp(web * 0.95 + rime, 0.0, 1.0) * uLevel);
}
`;

/** The heroic Barrow Embers: the breath's cone still burning, ghost fire
 *  flowing over the floor from apex to rim, hottest in the cracks. */
const EMBERS_FRAG = /* glsl */ `
uniform float uLevel;
uniform float uTime;
varying vec2 vPolar;
varying vec3 vLocal;
${NOISE_GLSL}
${GHOST_RAMP}
void main() {
  float edge = (1.0 - smoothstep(0.88, 1.0, vPolar.x)) * smoothstep(0.0, 0.05, vPolar.y)
    * (1.0 - smoothstep(0.95, 1.0, vPolar.y)) * smoothstep(0.02, 0.1, vPolar.x);
  vec2 p = vLocal.xz;
  float n = fbm(p * 0.6 + vec2(0.0, -uTime * 0.9));
  float n2 = fbm(p * 1.4 + vec2(uTime * 0.3, -uTime * 1.7) + n);
  float heat = clamp(n2 * 1.3 - 0.18 + 0.08 * sin(uTime * 7.0 + n * 12.0), 0.0, 1.0);
  float cracks = 1.0 - smoothstep(0.02, 0.08, abs(fbm(p * 1.1 + 2.0) - 0.5));
  float h = clamp(heat * 0.75 + cracks * 0.4, 0.0, 0.98);
  vec3 col = ghostRamp(0.3 + 0.68 * h) * 1.7;
  gl_FragColor = vec4(col, edge * clamp(0.5 + 0.6 * h, 0.0, 1.0) * uLevel);
}
`;

interface GargoyleSlot {
  owner: number;
  crust: THREE.InstancedMesh;
  crustMat: THREE.ShaderMaterial;
  flakes: THREE.InstancedMesh | null;
  orbit: THREE.Group;
  /** Plates laid out so far (the matrices hold them). */
  laid: number;
  stacks: number;
  slamAt: number;
  slamLayer: number;
  cracks: KitGlyph[];
  halo: KitGlyph;
  crackedSince: number;
}

interface Bolt {
  live: boolean;
  from: number;
  to: number;
  born: number;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  head: KitGlyph;
  trail: number;
}

interface Strand {
  beam: KitBeam;
  born: number;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
}

interface Ember {
  patch: KitPatch;
  x: number;
  z: number;
  facing: number;
  range: number;
  emit: number;
}

const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchSpin = new THREE.Quaternion();
const scratchPos = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchNormal = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const scratchPoint = { x: 0, y: 0, z: 0 };

export class CryptMarkFx {
  private readonly gargoyles: GargoyleSlot[] = [];
  private readonly eyes: KitGlyph[] = [];
  private readonly streaks: KitBeam[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly strands: Strand[] = [];
  private readonly nets: KitPatch[] = [];
  private readonly embers: Ember[] = [];
  private readonly shocks: { patch: KitPatch; span: number; reach: number }[] = [];
  private readonly marked: number[] = [];
  private readonly crows: number[] = [];
  private readonly rooted: number[] = [];
  private readonly granite = graniteSpec();
  private readonly plateCap: number;
  private readonly lane = rimesilkLane();
  private readonly embersSpec = barrowEmbersSpec();
  private readonly plateSpots: { x: number; y: number; z: number; size: number }[] = [];
  private scan = 0;

  constructor(private readonly host: CryptKitHost) {
    const h = host;
    this.plateCap = Math.max(1, this.granite.maxStacks) * GRANITE_PLATES_PER_LAYER;
    for (let i = 0; i < this.plateCap; i++) this.plateSpots.push(crustPlateSpot(i, this.plateCap));
    const plateGeo = h.own(new THREE.DodecahedronGeometry(1, 0));
    plateGeo.scale(1, 0.4, 0.85);
    const flakeGeo = h.own(new THREE.TetrahedronGeometry(1, 0));
    const stoneMat = () =>
      h.own(
        new THREE.ShaderMaterial({
          uniforms: { uPale: { value: 0 }, uFlash: { value: 0 }, uLight: { value: 0.62 } },
          vertexShader: STONE_VERT,
          fragmentShader: STONE_FRAG,
        }),
      );
    for (let i = 0; i < GARGOYLE_SLOTS; i++) {
      const crustMat = stoneMat();
      const crust = new THREE.InstancedMesh(plateGeo, crustMat, this.plateCap);
      crust.count = 0;
      crust.frustumCulled = false;
      crust.visible = false;
      h.root.add(crust);
      const orbit = new THREE.Group();
      orbit.visible = false;
      h.root.add(orbit);
      let flakes: THREE.InstancedMesh | null = null;
      if (h.detail) {
        const cap = Math.max(1, this.granite.maxStacks) * GRANITE_FLAKES_PER_LAYER;
        flakes = new THREE.InstancedMesh(flakeGeo, crustMat, cap);
        flakes.count = 0;
        flakes.frustumCulled = false;
        orbit.add(flakes);
      }
      const cracks: KitGlyph[] = [];
      for (let k = 0; k < CRACK_SPRITES; k++) {
        const g = h.glyph(
          CRACK_GLYPH_FRAG,
          {
            uColor: { value: new THREE.Color(CRACK_AMBER[0], CRACK_AMBER[1], CRACK_AMBER[2]) },
            uAlpha: { value: 0 },
            uSeed: { value: (k * 0.618034) % 1 },
          },
          KIT_STEPS.glyph,
        );
        cracks.push(g);
      }
      const halo = h.glyph(
        HALO_FRAG,
        { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
        KIT_STEPS.glyph,
      );
      this.gargoyles.push({
        owner: -1,
        crust,
        crustMat,
        flakes,
        orbit,
        laid: 0,
        stacks: 0,
        slamAt: -10,
        slamLayer: 0,
        cracks,
        halo,
        crackedSince: -1,
      });
    }
    for (let i = 0; i < EYE_SLOTS; i++) {
      this.eyes.push(
        h.glyph(EYE_FRAG, { uAlpha: { value: 0 }, uOpen: { value: 0 } }, KIT_STEPS.glyph, false),
      );
    }
    for (let i = 0; i < STREAK_SLOTS; i++) {
      this.streaks.push(h.beam(STREAK_FRAG, { uAlpha: { value: 0 } }, KIT_STEPS.beam, false));
    }
    for (let i = 0; i < BOLT_SLOTS; i++) {
      const head = h.glyph(
        HALO_FRAG,
        {
          uColor: {
            value: new THREE.Color(CARRION_VIOLET[0], CARRION_VIOLET[1], CARRION_VIOLET[2]),
          },
          uAlpha: { value: 0 },
        },
        KIT_STEPS.glyph,
      );
      this.bolts.push({
        live: false,
        from: -1,
        to: -1,
        born: 0,
        ax: 0,
        ay: 0,
        az: 0,
        bx: 0,
        by: 0,
        bz: 0,
        head,
        trail: 0,
      });
    }
    for (let i = 0; i < STRAND_SLOTS; i++) {
      this.strands.push({
        beam: h.beam(STRAND_FRAG, { uAlpha: { value: 0 } }, KIT_STEPS.beam),
        born: -10,
        ax: 0,
        ay: 0,
        az: 0,
        bx: 0,
        by: 0,
        bz: 0,
      });
    }
    for (let i = 0; i < NET_SLOTS; i++) {
      this.nets.push(h.patch(4, 48, WEB_FRAG, { uLevel: { value: 0 } }, KIT_STEPS.webNet));
    }
    for (let i = 0; i < EMBER_SLOTS; i++) {
      this.embers.push({
        patch: h.patch(12, 40, EMBERS_FRAG, { uLevel: { value: 0 } }, KIT_STEPS.hazardBody),
        x: 0,
        z: 0,
        facing: 0,
        range: 0,
        emit: 0,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.shocks.push({
        patch: h.patch(
          5,
          64,
          SHOCK_FRAG,
          { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
          KIT_STEPS.shock,
          true,
        ),
        span: 0,
        reach: 0,
      });
    }
  }

  // ------------------------------------------------------------------ events

  handleEvent(ev: SimEvent): boolean {
    if (ev.type !== 'spellfx') return false;
    const world = this.host.world;
    if (ev.fx === 'selfCast' && ev.ability === CRYPT_GRANITE_SKIN) {
      const e = world.entities.get(ev.sourceId);
      if (e) this.layerForms(e);
      return true;
    }
    if (ev.fx === 'nova' && ev.ability === CRYPT_CRACKED_STONE) {
      const e = world.entities.get(ev.sourceId);
      if (e) this.shatter(e);
      return true;
    }
    if (ev.fx === 'heavyBolt' && ev.ability === CRYPT_CARRION_EYE) {
      const from = world.entities.get(ev.sourceId);
      const to = world.entities.get(ev.targetId);
      if (from && to) this.launchBolt(from, to);
      return true;
    }
    if (ev.fx === 'heavyBolt' && ev.ability === CRYPT_RIMESILK_SPIT) {
      const from = world.entities.get(ev.sourceId);
      if (from) this.spit(from);
      return true;
    }
    return false;
  }

  // ----------------------------------------------------------- Granite Skin

  private slotFor(id: number, claim: boolean): GargoyleSlot | null {
    const own = this.gargoyles.find((g) => g.owner === id);
    if (own || !claim) return own ?? null;
    const free = this.gargoyles.find((g) => g.owner < 0);
    if (!free) return null;
    free.owner = id;
    free.laid = 0;
    free.stacks = 0;
    free.crackedSince = -1;
    return free;
  }

  private layerForms(e: Entity): void {
    const slot = this.slotFor(e.id, true);
    const h = this.host;
    const stacks = Math.max(1, auraOf(e, CRYPT_GRANITE_SKIN)?.stacks ?? 1);
    if (slot) {
      slot.slamAt = h.now();
      slot.slamLayer = stacks;
    }
    // The crust pulse: a pale flash at the body and grit shaken off it.
    const scale = e.scale || 1;
    const gy = h.groundY(e.pos.x, e.pos.z);
    const c = anchorWorld(GARGOYLE_BODY, e.pos.x, gy, e.pos.z, e.facing, scale);
    if (slot) {
      slot.halo.born = h.now();
      (slot.halo.mat.uniforms.uColor.value as THREE.Color).setRGB(
        GRANITE_PALE[0],
        GRANITE_PALE[1],
        GRANITE_PALE[2],
      );
    }
    const n = Math.round((10 + 4 * stacks) * h.density);
    for (let i = 0; i < n; i++) {
      const a = h.rand() * Math.PI * 2;
      const r = GARGOYLE_BODY.rx * scale * (0.8 + 0.3 * h.rand());
      h.dust.emit(h.now() + h.rand() * 0.1, {
        x: c.x + Math.sin(a) * r,
        y: c.y + (h.rand() - 0.3) * GARGOYLE_BODY.ry * scale,
        z: c.z + Math.cos(a) * r,
        vx: Math.sin(a) * 1.2,
        vy: -0.4 - h.rand(),
        vz: Math.cos(a) * 1.2,
        ay: -1.5,
        life: 1.1 + h.rand() * 0.5,
        drag: 1.5,
        floor: gy + 0.1,
        size0: 0.6,
        size1: 1.8 + h.rand(),
        spin: (h.rand() - 0.5) * 0.5,
        r: GRANITE_PALE[0],
        g: GRANITE_PALE[1],
        b: GRANITE_PALE[2],
        a: 0.42,
      });
    }
  }

  private shatter(e: Entity): void {
    const h = this.host;
    const slot = this.slotFor(e.id, true);
    const scale = e.scale || 1;
    const gy = h.groundY(e.pos.x, e.pos.z);
    const c = anchorWorld(GARGOYLE_BODY, e.pos.x, gy, e.pos.z, e.facing, scale);
    const now = h.now();
    if (slot) {
      slot.stacks = 0;
      slot.laid = 0;
      slot.crust.count = 0;
      slot.crust.visible = false;
      if (slot.flakes) slot.flakes.count = 0;
      slot.orbit.visible = false;
      slot.crackedSince = now;
    }
    // Rock shards burst off the body, big slabs and grit.
    const n = Math.round(70 * h.density);
    for (let i = 0; i < n; i++) {
      const a = h.rand() * Math.PI * 2;
      const up = h.rand() * 2 - 0.6;
      const big = i % 3 === 0;
      const sp = (big ? 6 : 9) + h.rand() * 7;
      h.shards.emit(now + h.rand() * 0.04, {
        x: c.x + Math.sin(a) * GARGOYLE_BODY.rx * scale * 0.8,
        y: c.y + up * GARGOYLE_BODY.ry * scale * 0.5,
        z: c.z + Math.cos(a) * GARGOYLE_BODY.rz * scale * 0.8,
        vx: Math.sin(a) * sp,
        vy: 3 + h.rand() * 6,
        vz: Math.cos(a) * sp,
        ay: -24,
        life: 1.2 + h.rand() * 0.6,
        drag: 0.6,
        floor: gy + 0.08,
        size0: big ? 0.9 + h.rand() * 0.5 : 0.35 + h.rand() * 0.25,
        size1: big ? 0.8 : 0.3,
        spin: (h.rand() - 0.5) * 10,
        r: GRANITE_PALE[0],
        g: GRANITE_PALE[1],
        b: GRANITE_PALE[2],
        a: 1,
      });
    }
    for (let i = 0; i < Math.round(60 * h.density); i++) {
      const a = h.rand() * Math.PI * 2;
      const sp = 7 + h.rand() * 9;
      h.glow.emit(now, {
        x: c.x,
        y: c.y,
        z: c.z,
        vx: Math.sin(a) * sp,
        vy: 1 + h.rand() * 6,
        vz: Math.cos(a) * sp,
        ay: -10,
        life: 0.6 + h.rand() * 0.5,
        drag: 1.8,
        size0: 0.22,
        size1: 0.05,
        r: CRACK_AMBER[0],
        g: CRACK_AMBER[1],
        b: CRACK_AMBER[2],
        a: 1,
      });
    }
    for (let i = 0; i < Math.round(30 * h.density); i++) {
      const a = (i / 30) * Math.PI * 2;
      const sp = 3 + h.rand() * 3;
      h.dust.emit(now + h.rand() * 0.08, {
        x: c.x + Math.sin(a),
        y: c.y - GARGOYLE_BODY.up * scale * 0.4,
        z: c.z + Math.cos(a),
        vx: Math.sin(a) * sp,
        vy: 0.5 + h.rand() * 1.5,
        vz: Math.cos(a) * sp,
        life: 1.6 + h.rand() * 0.6,
        drag: 1.8,
        floor: gy + 0.2,
        size0: 1.4,
        size1: 4 + h.rand() * 1.5,
        spin: (h.rand() - 0.5) * 0.6,
        r: 0.6,
        g: 0.58,
        b: 0.54,
        a: 0.55,
      });
    }
    const ring = this.shocks.find((s) => s.patch.owner < 0) ?? this.shocks[0];
    drapePolar(ring.patch.mesh, h.groundY, e.pos.x, e.pos.z, 6 * scale, 0.05);
    ring.patch.owner = 1;
    ring.patch.born = now;
    ring.span = 0.45;
    ring.reach = 6 * scale;
    (ring.patch.mat.uniforms.uColor.value as THREE.Color).setRGB(1, 0.72, 0.4);
    ring.patch.mesh.scale.set(0.01, 1, 0.01);
    ring.patch.mesh.visible = true;
    h.shakeAt(e.pos.x, e.pos.z, 0.4);
  }

  /** Lay the crust's plates up to `plates` (or re-lay the slamming layer). */
  private layPlates(slot: GargoyleSlot, plates: number, crustScale: number): void {
    const now = this.host.now();
    const slam = layerSlam(now - slot.slamAt);
    const slamFrom = (slot.slamLayer - 1) * GRANITE_PLATES_PER_LAYER;
    const slamTo = slot.slamLayer * GRANITE_PLATES_PER_LAYER;
    const from = Math.min(slot.laid, slamFrom);
    const b = GARGOYLE_BODY;
    for (let i = Math.max(0, from); i < plates; i++) {
      const s = this.plateSpots[i];
      const inSlam = i >= slamFrom && i < slamTo;
      const k = inSlam ? slam.scale : 1;
      // On the body shell, set a little inside so each plate beds into the stone.
      scratchPos.set(
        s.x * b.rx * 0.86 * k,
        b.up + s.y * b.ry * 0.86 * k,
        b.forward + s.z * b.rz * 0.86 * k,
      );
      scratchNormal.set(s.x / b.rx, s.y / b.ry, s.z / b.rz).normalize();
      scratchQuat.setFromUnitVectors(UP, scratchNormal);
      scratchSpin.setFromAxisAngle(UP, s.size * 17);
      scratchQuat.multiply(scratchSpin);
      const size = s.size * crustScale;
      scratchScale.set(size, size * (0.8 + 0.4 * crustScale), size);
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
      slot.crust.setMatrixAt(i, scratchMatrix);
    }
    slot.crust.count = plates;
    slot.crust.instanceMatrix.needsUpdate = true;
    slot.laid = plates;
  }

  private layFlakes(slot: GargoyleSlot, flakes: number): void {
    if (!slot.flakes) return;
    const b = GARGOYLE_BODY;
    for (let i = 0; i < flakes; i++) {
      const a = i * 2.399963;
      const r = 1.55 + 0.35 * ((i * 0.37) % 1);
      scratchPos.set(
        Math.sin(a) * b.rx * r,
        b.up + (((i * 0.618034) % 1) - 0.4) * b.ry * 1.3,
        Math.cos(a) * b.rz * r,
      );
      scratchQuat.setFromAxisAngle(UP, a * 3.1);
      const size = 0.16 + 0.12 * ((i * 0.53) % 1);
      scratchScale.set(size, size * 1.4, size * 0.7);
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
      slot.flakes.setMatrixAt(i, scratchMatrix);
    }
    slot.flakes.count = flakes;
    slot.flakes.instanceMatrix.needsUpdate = true;
  }

  private stepGargoyle(slot: GargoyleSlot, dt: number): void {
    const h = this.host;
    const e = h.world.entities.get(slot.owner);
    if (!e || e.dead) {
      this.freeGargoyle(slot);
      return;
    }
    const now = h.now();
    const scale = e.scale || 1;
    const gy = h.groundY(e.pos.x, e.pos.z);
    const stacks = auraOf(e, CRYPT_GRANITE_SKIN)?.stacks ?? 0;
    const crust = graniteCrust(stacks, this.granite.maxStacks);
    const slamming = now - slot.slamAt < LAYER_SLAM_SECONDS + 0.05;
    if (stacks !== slot.stacks || slamming) {
      if (stacks < slot.stacks) slot.laid = 0;
      slot.stacks = stacks;
      this.layPlates(slot, crust.plates, crust.thickness);
      this.layFlakes(slot, crust.flakes);
    }
    const on = crust.plates > 0;
    slot.crust.visible = on;
    slot.orbit.visible = on && !!slot.flakes;
    if (on) {
      slot.crust.position.set(e.pos.x, gy, e.pos.z);
      slot.crust.rotation.y = e.facing;
      slot.crust.scale.setScalar(scale);
      slot.orbit.position.set(e.pos.x, gy, e.pos.z);
      slot.orbit.scale.setScalar(scale);
      slot.orbit.rotation.y += dt * crust.orbit;
      slot.crustMat.uniforms.uPale.value = crust.pale;
      slot.crustMat.uniforms.uFlash.value = layerSlam(now - slot.slamAt).flash * 0.6;
    }
    // The crust pulse halo, then (while cracked) the beating heat halo.
    const c = scratchPoint;
    c.x = e.pos.x + Math.sin(e.facing) * GARGOYLE_BODY.forward * scale;
    c.y = gy + GARGOYLE_BODY.up * scale;
    c.z = e.pos.z + Math.cos(e.facing) * GARGOYLE_BODY.forward * scale;
    const cracked = auraOf(e, CRYPT_CRACKED_STONE);
    const pulseAge = now - slot.halo.born;
    let haloAlpha = 0;
    let haloSize = 0;
    if (cracked && cracked.remaining > 0) {
      if (slot.crackedSince < 0) slot.crackedSince = now;
      const glow = crackedGlow(cracked.remaining, now - slot.crackedSince, now);
      haloAlpha = glow * (0.32 + 0.12 * Math.sin(now * 6));
      haloSize = 3.6 * scale;
      (slot.halo.mat.uniforms.uColor.value as THREE.Color).setRGB(
        CRACK_AMBER[0],
        CRACK_AMBER[1],
        CRACK_AMBER[2],
      );
      for (let k = 0; k < slot.cracks.length; k++) {
        const g = slot.cracks[k];
        const s = this.plateSpots[(k * 5 + 2) % this.plateSpots.length];
        const cx = Math.cos(e.facing);
        const sx = Math.sin(e.facing);
        const lx = s.x * GARGOYLE_BODY.rx * 0.95 * scale;
        const lz = (GARGOYLE_BODY.forward + s.z * GARGOYLE_BODY.rz * 0.95) * scale;
        g.mesh.position.set(
          e.pos.x + lx * cx + lz * sx,
          gy + (GARGOYLE_BODY.up + s.y * GARGOYLE_BODY.ry * 0.85) * scale,
          e.pos.z - lx * sx + lz * cx,
        );
        g.mesh.scale.setScalar((0.75 + 0.35 * s.size) * scale);
        g.mat.uniforms.uAlpha.value = glow * (0.75 + 0.25 * Math.sin(now * 9 + k * 1.7));
        g.mesh.visible = true;
      }
      // Embers spitting out of the cracks.
      if (h.rand() < dt * 14 * h.density) {
        const a = h.rand() * Math.PI * 2;
        h.glow.emit(now, {
          x: c.x + Math.sin(a) * GARGOYLE_BODY.rx * scale * 0.8,
          y: c.y + (h.rand() - 0.5) * GARGOYLE_BODY.ry * scale,
          z: c.z + Math.cos(a) * GARGOYLE_BODY.rz * scale * 0.8,
          vx: Math.sin(a) * 1.5,
          vy: 1 + h.rand() * 2,
          vz: Math.cos(a) * 1.5,
          ay: -3,
          life: 0.6 + h.rand() * 0.4,
          drag: 1,
          size0: 0.16,
          size1: 0.04,
          r: CRACK_AMBER[0],
          g: CRACK_AMBER[1],
          b: CRACK_AMBER[2],
          a: 1,
        });
      }
    } else {
      slot.crackedSince = -1;
      for (const g of slot.cracks) g.mesh.visible = false;
      if (pulseAge >= 0 && pulseAge < 0.5) {
        const k = pulseAge / 0.5;
        haloAlpha = (1 - k) * (1 - k) * 0.55;
        haloSize = (2.6 + 2.2 * k) * scale;
      }
    }
    slot.halo.mesh.visible = haloAlpha > 0.003;
    if (slot.halo.mesh.visible) {
      slot.halo.mesh.position.set(c.x, c.y, c.z);
      slot.halo.mesh.scale.setScalar(haloSize);
      slot.halo.mat.uniforms.uAlpha.value = haloAlpha;
    }
    if (!on && !(cracked && cracked.remaining > 0) && pulseAge > 0.6) this.freeGargoyle(slot);
  }

  private freeGargoyle(slot: GargoyleSlot): void {
    slot.owner = -1;
    slot.laid = 0;
    slot.stacks = 0;
    slot.crust.count = 0;
    slot.crust.visible = false;
    if (slot.flakes) slot.flakes.count = 0;
    slot.orbit.visible = false;
    slot.halo.mesh.visible = false;
    for (const g of slot.cracks) g.mesh.visible = false;
  }

  // ----------------------------------------------------------- Carrion Eye

  private launchBolt(from: Entity, to: Entity): void {
    const h = this.host;
    const slot = this.bolts.find((b) => !b.live) ?? this.bolts[0];
    const fy = h.groundY(from.pos.x, from.pos.z);
    const ty = h.groundY(to.pos.x, to.pos.z);
    slot.live = true;
    slot.from = from.id;
    slot.to = to.id;
    slot.born = h.now();
    slot.ax = from.pos.x + Math.sin(from.facing) * 0.6;
    slot.ay = fy + 2.7 * (from.scale || 1);
    slot.az = from.pos.z + Math.cos(from.facing) * 0.6;
    slot.bx = to.pos.x;
    slot.by = ty + CHEST;
    slot.bz = to.pos.z;
    slot.trail = 0;
    slot.head.mesh.visible = true;
    // The staff's burst of carrion light as it lets fly.
    for (let i = 0; i < Math.round(18 * h.density); i++) {
      const a = h.rand() * Math.PI * 2;
      h.glow.emit(h.now(), {
        x: slot.ax,
        y: slot.ay,
        z: slot.az,
        vx: Math.sin(a) * 3,
        vy: (h.rand() - 0.3) * 3,
        vz: Math.cos(a) * 3,
        life: 0.4,
        drag: 3,
        size0: 0.4,
        size1: 0.1,
        r: CARRION_VIOLET[0],
        g: CARRION_VIOLET[1],
        b: CARRION_VIOLET[2],
        a: 1,
      });
    }
  }

  private stepBolt(b: Bolt, dt: number): void {
    const h = this.host;
    const now = h.now();
    const to = h.world.entities.get(b.to);
    if (to && !to.dead) {
      b.bx = to.pos.x;
      b.bz = to.pos.z;
      b.by = h.groundY(to.pos.x, to.pos.z) + CHEST;
    }
    const t = (now - b.born) / CARRION_BOLT.seconds;
    if (t >= 1) {
      b.live = false;
      b.head.mesh.visible = false;
      this.boltImpact(b.bx, b.by, b.bz);
      return;
    }
    const p = boltArcInto(t, b.ax, b.ay, b.az, b.bx, b.by, b.bz, CARRION_BOLT.lift, scratchPoint);
    b.head.mesh.position.set(p.x, p.y, p.z);
    b.head.mesh.scale.setScalar(0.9 + 0.15 * Math.sin(now * 40));
    b.head.mat.uniforms.uAlpha.value = 1;
    b.trail += dt * 120 * h.density;
    while (b.trail >= 1) {
      b.trail -= 1;
      if (h.rand() < 0.5) {
        h.dust.emit(now, {
          x: p.x + (h.rand() - 0.5) * 0.3,
          y: p.y + (h.rand() - 0.5) * 0.3,
          z: p.z + (h.rand() - 0.5) * 0.3,
          vx: (h.rand() - 0.5) * 0.8,
          vy: 0.3 + h.rand() * 0.6,
          vz: (h.rand() - 0.5) * 0.8,
          life: 0.55 + h.rand() * 0.3,
          drag: 1.5,
          size0: 0.5,
          size1: 1.3,
          spin: (h.rand() - 0.5) * 0.8,
          r: 0.1,
          g: 0.03,
          b: 0.14,
          a: 0.65,
        });
      } else {
        h.glow.emit(now, {
          x: p.x,
          y: p.y,
          z: p.z,
          vx: (h.rand() - 0.5) * 1.5,
          vy: (h.rand() - 0.5) * 1.5,
          vz: (h.rand() - 0.5) * 1.5,
          life: 0.35 + h.rand() * 0.2,
          drag: 2,
          size0: 0.45,
          size1: 0.1,
          r: CARRION_VIOLET[0],
          g: CARRION_VIOLET[1],
          b: CARRION_VIOLET[2],
          a: 0.9,
        });
      }
    }
  }

  private boltImpact(x: number, y: number, z: number): void {
    const h = this.host;
    const now = h.now();
    for (let i = 0; i < Math.round(40 * h.density); i++) {
      const a = h.rand() * Math.PI * 2;
      const up = h.rand() * 2 - 1;
      const sp = 4 + h.rand() * 5;
      h.glow.emit(now, {
        x,
        y,
        z,
        vx: Math.sin(a) * sp * Math.sqrt(1 - up * up),
        vy: up * sp,
        vz: Math.cos(a) * sp * Math.sqrt(1 - up * up),
        life: 0.45 + h.rand() * 0.3,
        drag: 3,
        size0: 0.4,
        size1: 0.08,
        r: CARRION_VIOLET[0],
        g: CARRION_VIOLET[1],
        b: CARRION_VIOLET[2],
        a: 1,
      });
    }
    // Black feathers drifting down off the strike.
    for (let i = 0; i < Math.round(14 * h.density); i++) {
      const a = h.rand() * Math.PI * 2;
      h.shards.emit(now, {
        x,
        y: y + 0.3,
        z,
        vx: Math.sin(a) * (1 + h.rand() * 2),
        vy: 1 + h.rand() * 2,
        vz: Math.cos(a) * (1 + h.rand() * 2),
        ay: -2.5,
        life: 1.6 + h.rand() * 0.8,
        drag: 2.4,
        floor: h.groundY(x, z) + 0.05,
        size0: 0.4 + h.rand() * 0.2,
        size1: 0.36,
        spin: (h.rand() - 0.5) * 5,
        r: 0.08,
        g: 0.04,
        b: 0.11,
        a: 1,
      });
    }
  }

  private stepEyes(): void {
    const h = this.host;
    const now = h.now();
    let used = 0;
    for (const id of this.marked) {
      if (used >= this.eyes.length) break;
      const e = h.world.entities.get(id);
      const aura = e ? auraOf(e, CRYPT_CARRION_EYE) : undefined;
      if (!e || e.dead || !aura) continue;
      const slot = this.eyes[used++];
      if (slot.owner !== id) {
        slot.owner = id;
        slot.born = now - Math.max(0, aura.duration - aura.remaining);
      }
      const g = eyeGlyph(now - slot.born, aura.remaining, now);
      const gy = h.groundY(e.pos.x, e.pos.z);
      slot.mesh.position.set(e.pos.x, gy + EYE_LIFT * (e.scale || 1) + g.bob, e.pos.z);
      slot.mesh.scale.setScalar(1.15 * g.scale);
      slot.mat.uniforms.uAlpha.value = g.alpha;
      slot.mat.uniforms.uOpen.value = g.open;
      slot.mesh.visible = g.alpha > 0.002;
    }
    for (let i = used; i < this.eyes.length; i++) {
      this.eyes[i].owner = -1;
      this.eyes[i].mesh.visible = false;
    }
    // Every living crow's streak to its mark (the nearest marked player).
    let s = 0;
    if (this.marked.length > 0) {
      for (const cid of this.crows) {
        if (s >= this.streaks.length) break;
        const crow = h.world.entities.get(cid);
        if (!crow || crow.dead) continue;
        // The crow's own quarry when it is marked, else the nearest mark.
        const aim = crow.aggroTargetId ?? crow.targetId;
        let best: Entity | null = null;
        let bestD = STREAK_REACH * STREAK_REACH;
        for (const id of this.marked) {
          const v = h.world.entities.get(id);
          if (!v || v.dead) continue;
          const dx = v.pos.x - crow.pos.x;
          const dz = v.pos.z - crow.pos.z;
          const d = aim === id ? -1 : dx * dx + dz * dz;
          if (d < bestD) {
            best = v;
            bestD = d;
          }
        }
        if (!best) continue;
        const beam = this.streaks[s++];
        const u = beam.mat.uniforms;
        (u.uA.value as THREE.Vector3).set(
          crow.pos.x,
          h.groundY(crow.pos.x, crow.pos.z) + CROW_UP * (crow.scale || 1),
          crow.pos.z,
        );
        (u.uB.value as THREE.Vector3).set(
          best.pos.x,
          h.groundY(best.pos.x, best.pos.z) + HEAD,
          best.pos.z,
        );
        u.uWidth.value = 0.12;
        u.uSag.value = -0.6;
        u.uWave.value = 0.08;
        u.uAlpha.value = 0.85;
        beam.owner = cid;
        beam.mesh.visible = true;
      }
    }
    for (let i = s; i < this.streaks.length; i++) {
      this.streaks[i].owner = -1;
      this.streaks[i].mesh.visible = false;
    }
  }

  // ----------------------------------------------------------- Rimesilk Spit

  private spit(widow: Entity): void {
    const h = this.host;
    const slot = this.strands.reduce((a, b) => (b.born < a.born ? b : a));
    const scale = widow.scale || 1;
    const gy = h.groundY(widow.pos.x, widow.pos.z);
    const fx = Math.sin(widow.facing);
    const fz = Math.cos(widow.facing);
    slot.born = h.now();
    slot.ax = widow.pos.x + fx * 1.3 * scale;
    slot.ay = gy + 0.95 * scale;
    slot.az = widow.pos.z + fz * 1.3 * scale;
    const len = this.lane.length || 22;
    slot.bx = widow.pos.x + fx * len;
    slot.bz = widow.pos.z + fz * len;
    slot.by = h.groundY(slot.bx, slot.bz) + 0.5;
    slot.beam.mesh.visible = true;
    // Frost motes thrown along the lane as the strand flies.
    const n = Math.round(46 * h.density);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const x = slot.ax + (slot.bx - slot.ax) * k;
      const z = slot.az + (slot.bz - slot.az) * k;
      const y = slot.ay + (slot.by - slot.ay) * k;
      h.glow.emit(h.now() + k * STRAND.shoot, {
        x,
        y,
        z,
        vx: (h.rand() - 0.5) * 1.2,
        vy: -0.3 + h.rand() * 0.8,
        vz: (h.rand() - 0.5) * 1.2,
        life: 0.6 + h.rand() * 0.5,
        drag: 1.6,
        size0: 0.3,
        size1: 0.06,
        r: RIME_WHITE[0],
        g: RIME_WHITE[1],
        b: RIME_WHITE[2],
        a: 0.9,
      });
    }
    for (let i = 0; i < Math.round(18 * h.density); i++) {
      const a = h.rand() * Math.PI * 2;
      h.dust.emit(h.now() + STRAND.shoot, {
        x: slot.bx,
        y: slot.by,
        z: slot.bz,
        vx: Math.sin(a) * 2.5,
        vy: 0.4 + h.rand(),
        vz: Math.cos(a) * 2.5,
        life: 1 + h.rand() * 0.5,
        drag: 2,
        size0: 0.6,
        size1: 1.8,
        spin: (h.rand() - 0.5) * 0.5,
        r: 0.82,
        g: 0.92,
        b: 1,
        a: 0.4,
      });
    }
  }

  private stepStrand(s: Strand): void {
    const now = this.host.now();
    const ph = strandPhase(now - s.born);
    if (ph.alpha <= 0) {
      s.beam.mesh.visible = false;
      return;
    }
    const u = s.beam.mat.uniforms;
    (u.uA.value as THREE.Vector3).set(
      s.ax + (s.bx - s.ax) * ph.tail,
      s.ay + (s.by - s.ay) * ph.tail,
      s.az + (s.bz - s.az) * ph.tail,
    );
    (u.uB.value as THREE.Vector3).set(
      s.ax + (s.bx - s.ax) * ph.head,
      s.ay + (s.by - s.ay) * ph.head,
      s.az + (s.bz - s.az) * ph.head,
    );
    u.uWidth.value = 0.32;
    u.uSag.value = 0.5 * (1 - ph.alpha) + 0.15;
    u.uWave.value = 0.05;
    u.uAlpha.value = ph.alpha;
    s.beam.mesh.visible = true;
  }

  private stepNets(): void {
    const h = this.host;
    const now = h.now();
    for (const net of this.nets) {
      if (net.owner < 0) continue;
      const e = h.world.entities.get(net.owner);
      if (!e || e.dead || !auraOf(e, ROOT_AURA)) {
        net.owner = -1;
        net.mesh.visible = false;
      }
    }
    for (const id of this.rooted) {
      const e = h.world.entities.get(id);
      const aura = e ? auraOf(e, ROOT_AURA) : undefined;
      if (!e || e.dead || !aura) continue;
      let net = this.nets.find((n) => n.owner === e.id);
      if (!net) {
        net = this.nets.find((n) => n.owner < 0);
        if (!net) continue;
        net.owner = e.id;
        net.born = now - Math.max(0, aura.duration - aura.remaining);
        drapePolar(net.mesh, h.groundY, e.pos.x, e.pos.z, WEB_NET_RADIUS, 0.06);
        net.mesh.visible = true;
      }
      net.mat.uniforms.uLevel.value = webNetLevel(aura.remaining, now - net.born);
    }
  }

  // ----------------------------------------------------------- Barrow Embers

  private holdEmbers(e: Entity): void {
    if (this.embers.some((m) => m.patch.owner === e.id)) return;
    const slot = this.embers.find((m) => m.patch.owner < 0);
    if (!slot) return;
    const h = this.host;
    slot.patch.owner = e.id;
    slot.patch.born = h.now();
    slot.patch.goneAt = -1;
    slot.x = e.pos.x;
    slot.z = e.pos.z;
    slot.facing = e.facing;
    slot.range = e.scale || 1;
    slot.emit = 0;
    drapePolar(
      slot.patch.mesh,
      h.groundY,
      e.pos.x,
      e.pos.z,
      slot.range,
      0.07,
      e.facing,
      this.embersSpec.arcDeg,
    );
    slot.patch.mat.uniforms.uLevel.value = 0;
    slot.patch.mesh.visible = true;
  }

  private stepEmbers(m: Ember, dt: number): void {
    const h = this.host;
    const now = h.now();
    const gone = m.patch.goneAt >= 0 ? now - m.patch.goneAt : -1;
    const level = hazardLevel(now - m.patch.born, gone, 0.2, 0.5);
    m.patch.mat.uniforms.uLevel.value = level;
    if (level <= 0 && gone >= 0) {
      m.patch.owner = -1;
      m.patch.goneAt = -1;
      m.patch.mesh.visible = false;
      return;
    }
    // Ghost-fire tongues licking up all over the cone, embers lifting off it.
    m.emit += dt * embersFlameRate(m.range, this.embersSpec.arcDeg, h.density) * level;
    const c = Math.cos(m.facing);
    const s = Math.sin(m.facing);
    let i = Math.floor(now * 97) % 997;
    while (m.emit >= 1) {
      m.emit -= 1;
      const spot = coneSpot(i++, 64, m.range * 0.96, this.embersSpec.arcDeg, 1);
      const wx = m.x + spot.x * c + spot.z * s + (h.rand() - 0.5) * 0.7;
      const wz = m.z - spot.x * s + spot.z * c + (h.rand() - 0.5) * 0.7;
      const gy = h.groundY(wx, wz);
      h.fire.emit(now, {
        x: wx,
        y: gy + 0.08,
        z: wz,
        vx: 0,
        vy: 1.2 + h.rand() * 1.4,
        vz: 0,
        ay: 1.2,
        life: 0.6 + h.rand() * 0.5,
        drag: 0.8,
        size0: 0.7 + h.rand() * 0.6,
        size1: 1.6 + h.rand() * 1.6,
        r: 0.75 + h.rand() * 0.3,
        g: 0,
        b: 0,
        a: 0.85 * level,
      });
      if (h.rand() < 0.25) {
        h.glow.emit(now, {
          x: wx,
          y: gy + 0.3,
          z: wz,
          vx: (h.rand() - 0.5) * 1.4,
          vy: 2.2 + h.rand() * 2.5,
          vz: (h.rand() - 0.5) * 1.4,
          ay: 0.6,
          life: 1 + h.rand(),
          drag: 0.7,
          size0: 0.14,
          size1: 0.05,
          r: 0.78,
          g: 1,
          b: 0.42,
          a: level,
        });
      }
    }
  }

  // ----------------------------------------------------------------- frame

  update(dt: number): void {
    const h = this.host;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = SCAN_SEC;
      this.scanWorld();
    }
    for (const g of this.gargoyles) if (g.owner >= 0) this.stepGargoyle(g, dt);
    for (const b of this.bolts) if (b.live) this.stepBolt(b, dt);
    for (const s of this.strands) this.stepStrand(s);
    this.stepEyes();
    this.stepNets();
    for (const m of this.embers) if (m.patch.owner >= 0) this.stepEmbers(m, dt);
    for (const r of this.shocks) {
      if (r.patch.owner < 0) continue;
      const w = shockwave(h.now() - r.patch.born, r.reach, r.span);
      if (w.done) {
        r.patch.owner = -1;
        r.patch.mesh.visible = false;
        continue;
      }
      const k = w.radius / Math.max(r.reach, 1e-3);
      r.patch.mesh.scale.set(k, 1, k);
      r.patch.mat.uniforms.uAlpha.value = w.alpha;
    }
  }

  private scanWorld(): void {
    const h = this.host;
    const now = h.now();
    this.marked.length = 0;
    this.crows.length = 0;
    this.rooted.length = 0;
    for (const e of h.world.entities.values()) {
      if (e.kind === 'object') {
        if (e.templateId === CRYPT_BARROW_EMBERS) this.holdEmbers(e);
        continue;
      }
      if (e.dead) continue;
      if (e.kind === 'mob') {
        if (e.templateId === CRYPT_KIT_MOBS.crow) this.crows.push(e.id);
        else if (e.templateId === CRYPT_KIT_MOBS.gargoyle) {
          const stone = auraOf(e, CRYPT_GRANITE_SKIN);
          const cracked = auraOf(e, CRYPT_CRACKED_STONE);
          if ((stone && (stone.stacks ?? 0) > 0) || cracked) this.slotFor(e.id, true);
        }
      }
      for (const a of e.auras) {
        if (a.id === CRYPT_CARRION_EYE && a.remaining > 0) this.marked.push(e.id);
        else if (a.id === ROOT_AURA && a.remaining > 0) this.rooted.push(e.id);
      }
    }
    for (const m of this.embers) {
      if (m.patch.owner < 0 || m.patch.goneAt >= 0) continue;
      if (!h.world.entities.has(m.patch.owner)) m.patch.goneAt = now;
    }
  }
}

function auraOf(
  e: Entity,
  id: string,
): { stacks?: number; remaining: number; duration: number } | undefined {
  for (const a of e.auras) if (a.id === id) return a;
  return undefined;
}
