// The Great Saurian's body effects (plan: saurian_fx_core.ts, the model's
// measured facts: saurian_model_core.ts), composed by WildheartFx
// (basin_fx.ts) under its gated root:
//  - every footfall of its wade and its amble through the ford: a skirt of
//    water round the foot, rings racing out, droplets and a breath of mist
//    (dust on the dry banks);
//  - the Earthshaking Stomp: the forefeet planted in the crouch, then the
//    slam: a crown of water at each forefoot, a wall of water racing out to
//    the ring's edge, the ripples, the mist and the spray, the jolt after;
//  - the Tail Swipe: spray and mist flung off the whole tail as it crosses
//    the rear cone left to right, a wake at the club, the club's whip;
//  - the howdah breaking: the rattle, then the burst of bamboo, bone, red
//    cloth and leather splinters off the deck (instanced, ballistic, sinking
//    where they hit the water), the big pieces splashing down round its
//    flanks, the rider's own splash where the real one lands;
//  - the enrage's stamps, and its death: the barrel and then the neck
//    crashing into the ford.
// It also drives the model: the HowdahBreak and Enrage clips (gestures off
// their spellfx) and the howdah's mesh latch (gone once broken, whole again
// after a reset pull), re-sent so a view built mid-fight shows the truth.
//
// Cosmetic only (src/render/CLAUDE.md): nothing here is a telegraph (those are
// basin_fx.ts's, on the encounter band); every primitive here sits on the
// floor ladder's ground band, under them. Built once under the host's root
// before its gated attach; no per-frame allocation; no light.

import * as THREE from 'three';
import {
  GREAT_SAURIAN_ID,
  SAURIAN_ENRAGE,
  SAURIAN_HOWDAH_BREAK,
  SAURIAN_RIDER_LANDS,
  SAURIAN_STOMP,
  SAURIAN_TAIL_SWIPE,
} from '../../sim/encounters/wildheart_basin/ids';
import type { Entity, SimEvent } from '../../sim/types';
import type { IWorld } from '../../world_api';
import {
  SAURIAN_HOWDAH_GONE_GESTURE,
  SAURIAN_HOWDAH_WHOLE_GESTURE,
} from '../characters/wildheart_creature_looks';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { surfaceMat } from '../gfx';
import { STOMP_SHOCK_SECONDS, stompShock } from './basin_fx_core';
import type { BasinFxHost } from './basin_fx_host';
import { BASIN_SUN_DIRECTION } from './basin_plan_core';
import {
  CROWN_LOOKS,
  type CrownSpec,
  crownShape,
  howdahDeck,
  RIPPLE_LOOKS,
  type RippleSpec,
  rippleShape,
  type SaurianBeat,
  type SaurianTrigger,
  SPLINTER_COLORS,
  SPLINTER_GRAVITY,
  SPLINTER_MIX,
  SPLINTER_SINK,
  type SplinterKind,
  saurianBeats,
  TAIL_SWEEP_SPAN,
  tailSprayReach,
  tailSweepAngle,
  tailSweepStartsAt,
  wetFloor,
} from './saurian_fx_core';
import {
  SAURIAN_CLIP,
  type SaurianFoot,
  saurianFootfallsBetween,
  saurianFootPoint,
  saurianModelScale,
  saurianModelToWorld,
  saurianStride,
} from './saurian_model_core';

const CROWN_SLOTS = 22;
const RIPPLE_SLOTS = 22;
const BEAT_SLOTS = 48;
/** The ford's water stands this far over its bed. */
const WATER_LIFT = 0.32;
/** Seconds between re-sends of the howdah's latched state. */
const LATCH_RESEND = 1;

const CROWN_VERT = /* glsl */ `
uniform float uRadius;
uniform float uHeight;
uniform float uSeed;
varying float vV;
varying float vShade;
varying float vStreak;
uniform vec3 uSun;
void main() {
  float a = atan(position.z, position.x);
  float v = position.y;
  // A torn rim: the sheet stands taller in ragged tongues round the ring.
  float jag = 0.5 + 0.3 * sin(a * 7.0 + uSeed * 3.1) + 0.2 * sin(a * 19.0 + uSeed * 7.7);
  float h = uHeight * (0.42 + 0.58 * clamp(jag, 0.0, 1.0));
  // It flares outward as it climbs, the classic crown of a heavy splash.
  float r = uRadius * (1.0 + 0.42 * v * v);
  vec3 p = vec3(cos(a) * r, v * h, sin(a) * r);
  vV = v;
  vStreak = a;
  vec3 n = normalize(vec3(cos(a), 0.35, sin(a)));
  vShade = 0.72 + 0.4 * max(dot(n, uSun), 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const CROWN_FRAG = /* glsl */ `
uniform float uAlpha;
uniform float uSeed;
varying float vV;
varying float vShade;
varying float vStreak;
float h1(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  // Vertical streaks of thicker water, thinning to spray at the lip.
  float s = vStreak * 9.5493 + uSeed * 5.0;
  float streak = mix(h1(floor(s)), h1(floor(s) + 1.0), smoothstep(0.0, 1.0, fract(s)));
  float body = smoothstep(0.0, 0.08, vV) * (1.0 - smoothstep(0.55 + 0.3 * streak, 1.0, vV));
  float foam = 1.0 - smoothstep(0.0, 0.35, vV);
  vec3 col = mix(vec3(0.74, 0.86, 0.84), vec3(1.0, 0.99, 0.95), foam * 0.7 + streak * 0.3) * vShade;
  float a = body * (0.32 + 0.48 * streak + 0.3 * foam) * uAlpha;
  gl_FragColor = vec4(col, a);
}
`;

const RIPPLE_VERT = /* glsl */ `
varying vec2 vLocal;
void main() {
  vLocal = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RIPPLE_FRAG = /* glsl */ `
uniform float uAlpha;
uniform float uRings;
uniform float uSeed;
varying vec2 vLocal;
void main() {
  float r = length(vLocal);
  float a = atan(vLocal.y, vLocal.x);
  float wob = 0.012 * sin(a * 11.0 + uSeed) + 0.008 * sin(a * 27.0 - uSeed * 2.0);
  float sum = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    if (fi >= uRings) break;
    float ri = 1.0 - fi * 0.17;
    float w = 0.022 + fi * 0.008;
    float band = 1.0 - smoothstep(0.0, w, abs(r + wob - ri));
    // The crest bright, the trough behind it a faint dark line.
    float trough = 1.0 - smoothstep(0.0, w * 1.6, abs(r + wob - (ri - w * 2.2)));
    sum += band * (1.0 - fi * 0.2) - trough * 0.25;
  }
  float inside = 1.0 - smoothstep(0.96, 1.0, r);
  float a1 = clamp(sum, -0.3, 1.0) * inside * uAlpha;
  vec3 col = a1 >= 0.0 ? vec3(0.95, 1.0, 0.98) : vec3(0.18, 0.26, 0.22);
  gl_FragColor = vec4(col, abs(a1) * 0.42);
}
`;

interface CrownSlot {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  spec: CrownSpec;
  born: number;
  alive: boolean;
}
interface RippleSlot {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  spec: RippleSpec;
  born: number;
  alive: boolean;
}
interface PendingBeat {
  at: number;
  beat: SaurianBeat | null;
  entityId: number;
  x: number;
  z: number;
  facing: number;
  scale: number;
  live: boolean;
}
/** What the fx remembers of one Saurian between frames. */
interface Tracker {
  id: number;
  seen: boolean;
  x: number;
  z: number;
  facing: number;
  scale: number;
  /** Gait cycles travelled since it last stood still. */
  phase: number;
  gait: 'walk' | 'run';
  speed: number;
  dead: boolean;
  /** The cast bar the effects already reacted to (by its start), or ''. */
  barSeen: string;
  /** The Tail Swipe's sweep: when it started (clock), -1 when none. */
  sweepAt: number;
  sweepEmit: number;
  /** The howdah: broken this pull, when it broke, the last re-send. */
  broken: boolean;
  brokenAt: number;
  sentAt: number;
}

export class SaurianFx {
  private readonly crowns: CrownSlot[] = [];
  private readonly ripples: RippleSlot[] = [];
  private readonly beats: PendingBeat[] = [];
  private readonly trackers = new Map<number, Tracker>();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly splinters: THREE.InstancedMesh;
  private readonly sKind: SplinterKind[] = [];
  private readonly sPos: Float32Array;
  private readonly sVel: Float32Array;
  private readonly sAxis: Float32Array;
  private readonly sAngle: Float32Array;
  private readonly sSpin: Float32Array;
  private readonly sLen: Float32Array;
  /** 0 dead, 1 flying, 2 sinking, 3 resting on dry ground. */
  private readonly sState: Uint8Array;
  private readonly sFloor: Float32Array;
  private readonly sTimer: Float32Array;
  private splintersLive = 0;
  private readonly feet: SaurianFoot[] = [];
  private readonly tmpPt = { x: 0, z: 0 };
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpAxis = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpM = new THREE.Matrix4();
  private clock = 0;

  constructor(
    private readonly host: BasinFxHost,
    private readonly world: IWorld,
    private readonly playGesture?: (entityId: number, gesture: string) => void,
  ) {
    const sun = new THREE.Vector3(...BASIN_SUN_DIRECTION).normalize();
    const crownGeo = new THREE.CylinderGeometry(1, 1, 1, 56, 6, true).translate(0, 0.5, 0);
    this.geometries.push(crownGeo);
    for (let i = 0; i < CROWN_SLOTS; i++) {
      const mat = new THREE.ShaderMaterial({
        name: 'wildheartSaurianCrown',
        uniforms: {
          uRadius: { value: 1 },
          uHeight: { value: 1 },
          uAlpha: { value: 0 },
          uSeed: { value: i * 3.7 },
          uSun: { value: sun },
        },
        vertexShader: CROWN_VERT,
        fragmentShader: CROWN_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(crownGeo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = floorVfxRenderOrder('ground', 6);
      host.root.add(mesh);
      this.crowns.push({ mesh, mat, spec: CROWN_LOOKS.footfall, born: 0, alive: false });
    }
    const rippleGeo = new THREE.CircleGeometry(1, 72).rotateX(-Math.PI / 2);
    this.geometries.push(rippleGeo);
    for (let i = 0; i < RIPPLE_SLOTS; i++) {
      const mat = new THREE.ShaderMaterial({
        name: 'wildheartSaurianRipple',
        uniforms: {
          uAlpha: { value: 0 },
          uRings: { value: 2 },
          uSeed: { value: i * 2.3 },
        },
        vertexShader: RIPPLE_VERT,
        fragmentShader: RIPPLE_FRAG,
        transparent: true,
        depthWrite: false,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(rippleGeo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = floorVfxRenderOrder('ground', 5);
      host.root.add(mesh);
      this.ripples.push({ mesh, mat, spec: RIPPLE_LOOKS.footfall, born: 0, alive: false });
    }
    // The howdah's splinters: one instanced draw, coloured per instance.
    for (const kind of Object.keys(SPLINTER_MIX) as SplinterKind[]) {
      const n = Math.max(2, Math.round(SPLINTER_MIX[kind] * host.density));
      for (let i = 0; i < n; i++) this.sKind.push(kind);
    }
    const count = this.sKind.length;
    const splinterGeo = new THREE.BoxGeometry(1, 1, 1);
    this.geometries.push(splinterGeo);
    this.splinters = new THREE.InstancedMesh(
      splinterGeo,
      surfaceMat({ color: 0xffffff, roughness: 0.82 }),
      count,
    );
    this.splinters.name = 'wildheartHowdahSplinters';
    this.splinters.frustumCulled = false;
    this.splinters.visible = false;
    this.splinters.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.splinters.setColorAt(i, color.setHex(SPLINTER_COLORS[this.sKind[i]]));
      this.splinters.setMatrixAt(i, this.tmpM.makeScale(0, 0, 0));
    }
    host.root.add(this.splinters);
    this.sPos = new Float32Array(count * 3);
    this.sVel = new Float32Array(count * 3);
    this.sAxis = new Float32Array(count * 3);
    this.sAngle = new Float32Array(count);
    this.sSpin = new Float32Array(count);
    this.sLen = new Float32Array(count);
    this.sState = new Uint8Array(count);
    this.sFloor = new Float32Array(count);
    this.sTimer = new Float32Array(count);
    for (let i = 0; i < BEAT_SLOTS; i++)
      this.beats.push({
        at: 0,
        beat: null,
        entityId: -1,
        x: 0,
        z: 0,
        facing: 0,
        scale: 1,
        live: false,
      });
  }

  // ------------------------------------------------------------------ events

  /** The Saurian's own spellfx (and its rider's landing). True when drawn. */
  handleEvent(ev: SimEvent & { type: 'spellfx' }, src: Entity): boolean {
    switch (ev.ability) {
      case SAURIAN_STOMP:
        this.schedule('stomp', src);
        if (!this.host.reducedMotion()) this.host.shake(0.55);
        return true;
      case SAURIAN_TAIL_SWIPE:
        this.tailImpact(src);
        this.schedule('tail', src);
        if (!this.host.reducedMotion()) this.host.shake(0.25);
        return true;
      case SAURIAN_HOWDAH_BREAK: {
        const t = this.tracker(src);
        t.broken = true;
        t.brokenAt = this.clock;
        t.sentAt = this.clock;
        this.playGesture?.(src.id, SAURIAN_HOWDAH_BREAK);
        this.schedule('howdah', src);
        return true;
      }
      case SAURIAN_ENRAGE:
        this.playGesture?.(src.id, SAURIAN_ENRAGE);
        this.enrageFlare(src);
        this.schedule('enrage', src);
        return true;
      case SAURIAN_RIDER_LANDS:
        this.splashAt(src.pos.x, src.pos.z, CROWN_LOOKS.rider, RIPPLE_LOOKS.rider, 26, 1);
        return true;
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------- scans

  /** Once per WildheartFx scan: before the entities are walked. */
  beginScan(): void {
    for (const t of this.trackers.values()) t.seen = false;
  }

  /** One Saurian seen by the scan: its howdah latch, its death, its bars. */
  scanSaurian(e: Entity): void {
    if (e.templateId !== GREAT_SAURIAN_ID) return;
    const t = this.tracker(e);
    t.seen = true;
    if (e.dead && !t.dead) this.schedule('death', e);
    t.dead = e.dead;
    // The howdah: latched broken from the break (or, a view joining late, from
    // a fight under half health); mended by a reset pull at full health.
    const share = e.maxHp > 0 ? e.hp / e.maxHp : 1;
    if (!t.broken && !e.dead && e.inCombat && share <= 0.5) {
      t.broken = true;
      t.brokenAt = this.clock - SAURIAN_CLIP.howdahGone;
      t.sentAt = -1e9;
    }
    if (t.broken && !e.dead && !e.inCombat && share >= 0.999) {
      t.broken = false;
      this.playGesture?.(e.id, SAURIAN_HOWDAH_WHOLE_GESTURE);
    }
    if (
      t.broken &&
      this.clock - t.brokenAt > SAURIAN_CLIP.howdahGone + 0.3 &&
      this.clock - t.sentAt >= LATCH_RESEND
    ) {
      t.sentAt = this.clock;
      this.playGesture?.(e.id, SAURIAN_HOWDAH_GONE_GESTURE);
    }
    // A Stomp bar just started: the crouch plants the forefeet.
    const bar = e.dead ? null : e.castingAbility;
    const barKey = bar ? `${bar}:${e.castTotal.toFixed(2)}` : '';
    if (bar === SAURIAN_STOMP && t.barSeen !== barKey && e.castRemaining > e.castTotal - 0.3)
      this.schedule('stompBar', e);
    t.barSeen = barKey;
  }

  /** After the scan: forget the Saurians no longer in the world. */
  endScan(): void {
    for (const [id, t] of this.trackers) if (!t.seen) this.trackers.delete(id);
  }

  // ------------------------------------------------------------------- frame

  update(dt: number, clock: number): void {
    this.clock = clock;
    this.stepTrackers(dt);
    this.fireBeats();
    this.paintCrowns();
    this.paintRipples();
    this.stepSplinters(dt);
  }

  hideAll(): void {
    for (const c of this.crowns) {
      c.alive = false;
      c.mesh.visible = false;
    }
    for (const r of this.ripples) {
      r.alive = false;
      r.mesh.visible = false;
    }
    for (const b of this.beats) b.live = false;
    this.sState.fill(0);
    this.splintersLive = 0;
    this.splinters.visible = false;
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.splinters.dispose();
  }

  // ---------------------------------------------------------------- internals

  private tracker(e: Entity): Tracker {
    let t = this.trackers.get(e.id);
    if (!t) {
      t = {
        id: e.id,
        seen: true,
        x: e.pos.x,
        z: e.pos.z,
        facing: e.facing,
        scale: e.scale || 1,
        phase: 0,
        gait: 'walk',
        speed: 0,
        dead: e.dead,
        barSeen: '',
        sweepAt: -1,
        sweepEmit: 0,
        broken: false,
        brokenAt: 0,
        sentAt: 0,
      };
      this.trackers.set(e.id, t);
    }
    return t;
  }

  private schedule(trigger: SaurianTrigger, e: Entity): void {
    for (const beat of saurianBeats(trigger)) {
      const slot = this.beats.find((b) => !b.live);
      if (!slot) return;
      slot.live = true;
      slot.at = this.clock + beat.at;
      slot.beat = beat;
      slot.entityId = e.id;
      slot.x = e.pos.x;
      slot.z = e.pos.z;
      slot.facing = e.facing;
      slot.scale = e.scale || 1;
    }
  }

  private fireBeats(): void {
    for (const b of this.beats) {
      if (!b.live || this.clock < b.at || !b.beat) continue;
      b.live = false;
      // Follow the body if it is still there (it stands planted for its bars).
      const e = this.world.entities.get(b.entityId);
      if (e) {
        b.x = e.pos.x;
        b.z = e.pos.z;
        b.facing = e.facing;
      }
      this.playBeat(b.beat, b);
    }
  }

  private playBeat(beat: SaurianBeat, at: PendingBeat): void {
    const pt = this.tmpPt;
    const foot = (f: SaurianFoot) => {
      const p = saurianFootPoint(f);
      return saurianModelToWorld(at, at.facing, at.scale, p.x, p.z, pt);
    };
    const k = saurianModelScale(at.scale);
    switch (beat.kind) {
      case 'stompCrouch':
        for (const f of ['leftFore', 'rightFore'] as const) {
          foot(f);
          this.splashAt(pt.x, pt.z, CROWN_LOOKS.footfallRun, RIPPLE_LOOKS.footfall, 10, 0.6);
        }
        return;
      case 'stompSlam':
        this.stompSlam(at);
        return;
      case 'stompJolt': {
        foot('leftFore');
        this.droplets(pt.x, pt.z, 30, 7, 2.2);
        foot('rightFore');
        this.droplets(pt.x, pt.z, 30, 7, 2.2);
        this.ripple(at.x, at.z, RIPPLE_LOOKS.stamp);
        return;
      }
      case 'clubWhip': {
        const reach = tailSprayReach(at.scale);
        const a = tailSweepAngle(TAIL_SWEEP_SPAN);
        saurianModelToWorld(
          at,
          at.facing,
          at.scale,
          (Math.sin(a) * reach.to) / k,
          (-Math.cos(a) * reach.to) / k,
          pt,
        );
        this.splashAt(pt.x, pt.z, CROWN_LOOKS.tailWake, RIPPLE_LOOKS.tail, 24, 0.9);
        return;
      }
      case 'howdahRattle': {
        const deck = howdahDeck(at.scale);
        const gy = this.host.groundY(at.x, at.z);
        const fx = at.x + Math.sin(at.facing) * deck.forward;
        const fz = at.z + Math.cos(at.facing) * deck.forward;
        this.host.puff(fx, gy + deck.up - 1, fz, 14, {
          speed: 1.5,
          life: 1.4,
          size: [0.6, 1.8],
          color: [0.66, 0.56, 0.4],
          alpha: 0.55,
          gravity: 5,
          radius: 2.2 * k,
        });
        return;
      }
      case 'howdahBurst':
        this.howdahBurst(at);
        return;
      case 'debrisSplash': {
        saurianModelToWorld(at, at.facing, at.scale, beat.mx ?? 0, beat.mz ?? 0, pt);
        this.splashAt(pt.x, pt.z, CROWN_LOOKS.debris, RIPPLE_LOOKS.debris, 16, 0.8);
        return;
      }
      case 'stamp': {
        foot(beat.foot ?? 'leftFore');
        this.splashAt(pt.x, pt.z, CROWN_LOOKS.stamp, RIPPLE_LOOKS.stamp, 36, 1.2);
        if (!this.host.reducedMotion()) this.host.shake(0.22);
        return;
      }
      case 'deathBody':
      case 'deathNeck': {
        saurianModelToWorld(at, at.facing, at.scale, beat.mx ?? 0, beat.mz ?? 0, pt);
        const body = beat.kind === 'deathBody';
        this.splashAt(
          pt.x,
          pt.z,
          body ? CROWN_LOOKS.deathBody : CROWN_LOOKS.deathNeck,
          RIPPLE_LOOKS.death,
          body ? 60 : 36,
          body ? 2.2 : 1.5,
        );
        if (body && !this.host.reducedMotion()) this.host.shake(0.4);
        return;
      }
    }
  }

  /** A splash: a crown, the ripples, droplets and mist (dust when dry). */
  private splashAt(
    x: number,
    z: number,
    crown: CrownSpec,
    ripple: RippleSpec,
    drops: number,
    mist: number,
  ): void {
    const gy = this.host.groundY(x, z);
    if (!wetFloor(gy)) {
      this.dust(x, z, gy, Math.round(drops * 0.6), crown.r1);
      return;
    }
    this.crown(x, z, crown);
    this.ripple(x, z, ripple);
    this.droplets(x, z, drops, crown.height * 1.4, crown.r0);
    if (mist > 0) this.mist(x, z, mist, crown.r1);
  }

  private crown(x: number, z: number, spec: CrownSpec): void {
    const slot = this.crowns.find((c) => !c.alive) ?? this.oldest(this.crowns);
    slot.alive = true;
    slot.spec = spec;
    slot.born = this.clock;
    slot.mat.uniforms.uSeed.value = this.host.rand() * 40;
    slot.mesh.position.set(x, this.waterY(x, z) - 0.05, z);
    slot.mesh.rotation.y = this.host.rand() * Math.PI * 2;
    slot.mesh.visible = true;
  }

  private ripple(x: number, z: number, spec: RippleSpec): void {
    const slot = this.ripples.find((r) => !r.alive) ?? this.oldest(this.ripples);
    slot.alive = true;
    slot.spec = spec;
    slot.born = this.clock;
    slot.mat.uniforms.uRings.value = spec.rings;
    slot.mat.uniforms.uSeed.value = this.host.rand() * 40;
    slot.mesh.position.set(x, this.waterY(x, z) + 0.03, z);
    slot.mesh.visible = true;
  }

  private oldest<T extends { born: number }>(slots: T[]): T {
    let best = slots[0];
    for (const s of slots) if (s.born < best.born) best = s;
    return best;
  }

  private waterY(x: number, z: number): number {
    const gy = this.host.groundY(x, z);
    return wetFloor(gy) ? Math.max(gy, 0) + WATER_LIFT : gy + 0.05;
  }

  private droplets(x: number, z: number, n: number, up: number, radius: number): void {
    if (n <= 0) return;
    this.host.puff(x, this.waterY(x, z) + 0.2, z, n, {
      speed: 3.2,
      up,
      life: 1.15,
      size: [0.32, 0.12],
      color: [0.9, 0.97, 1],
      alpha: 0.95,
      gravity: 16,
      drag: 0.25,
      radius,
      glow: true,
    });
  }

  private mist(x: number, z: number, strength: number, radius: number): void {
    this.host.puff(x, this.waterY(x, z) + 0.6, z, Math.round(6 * strength), {
      speed: 1.2 * strength,
      up: 1.1,
      life: 2.2,
      size: [1.6 * strength, 4.6 * strength],
      color: [0.93, 0.96, 0.94],
      alpha: 0.32,
      drag: 1.6,
      radius,
    });
  }

  private dust(x: number, z: number, gy: number, n: number, radius: number): void {
    this.host.puff(x, gy + 0.3, z, Math.max(3, n), {
      speed: 3,
      up: 1.2,
      life: 1.5,
      size: [1.2, 3.8],
      color: [0.6, 0.53, 0.4],
      alpha: 0.5,
      drag: 2,
      radius,
    });
  }

  // ----- the Stomp

  private stompSlam(at: PendingBeat): void {
    const gy = this.host.groundY(at.x, at.z);
    const wet = wetFloor(gy);
    const pt = this.tmpPt;
    for (const f of ['leftFore', 'rightFore'] as const) {
      const p = saurianFootPoint(f);
      saurianModelToWorld(at, at.facing, at.scale, p.x, p.z, pt);
      this.splashAt(pt.x, pt.z, CROWN_LOOKS.stompFoot, RIPPLE_LOOKS.stamp, 70, 2);
    }
    if (wet) {
      this.crown(at.x, at.z, CROWN_LOOKS.stompWall);
      this.ripple(at.x, at.z, RIPPLE_LOOKS.stomp);
      // A curtain of spray thrown off the racing wall.
      this.host.puff(at.x, gy + 0.6, at.z, 70, {
        speed: 11,
        up: 3,
        life: 1.3,
        size: [0.9, 2.6],
        color: [0.9, 0.96, 0.98],
        alpha: 0.6,
        drag: 2.4,
        radius: 4,
        dir: [0, 0.35, 0],
        spread: 1,
      });
    } else {
      this.dust(at.x, at.z, gy, 60, 8);
    }
    // The shock in the floor (the bars of light racing out): the host's rings.
    const shock = stompShock(STOMP_SHOCK_SECONDS).radius;
    this.host.shockRing(at.x, at.z, 0xfff0c8, shock, STOMP_SHOCK_SECONDS);
    this.host.shockRing(at.x, at.z, 0xb67bff, shock * 0.92, STOMP_SHOCK_SECONDS * 0.85);
  }

  // ----- the Tail Swipe

  /** The nova: the tail is mid-cone; an arc of spray across its whole reach. */
  private tailImpact(src: Entity): void {
    const reach = tailSprayReach(src.scale || 1);
    const k = saurianModelScale(src.scale || 1);
    const pt = this.tmpPt;
    for (let i = 0; i < 7; i++) {
      const a = tailSweepAngle(TAIL_SWEEP_SPAN * (0.2 + 0.1 * i));
      const r = reach.from + (reach.to - reach.from) * (0.45 + 0.08 * i);
      saurianModelToWorld(
        src.pos,
        src.facing,
        src.scale || 1,
        (Math.sin(a) * r) / k,
        (-Math.cos(a) * r) / k,
        pt,
      );
      this.ripple(pt.x, pt.z, RIPPLE_LOOKS.tail);
    }
  }

  private stepTail(t: Tracker, e: Entity, dt: number): void {
    if (e.dead) {
      t.sweepAt = -1;
      return;
    }
    // The sweep starts off the bar (the tail enters the cone before the impact)
    // and runs on past the bar's end until the tail leaves the cone.
    if (t.sweepAt < 0) {
      if (e.castingAbility !== SAURIAN_TAIL_SWIPE || e.castRemaining > tailSweepStartsAt()) return;
      t.sweepAt = this.clock - (tailSweepStartsAt() - e.castRemaining);
      t.sweepEmit = 0;
    }
    if (this.clock - t.sweepAt > TAIL_SWEEP_SPAN) {
      // Spent: wait for the next bar.
      if (e.castingAbility !== SAURIAN_TAIL_SWIPE) t.sweepAt = -1;
      return;
    }
    this.sweepSpray(t, e, dt);
  }

  /** The spray flung off the tail as it sweeps (also after the bar ends). */
  private sweepSpray(t: Tracker, e: Entity, dt: number): void {
    const el = this.clock - t.sweepAt;
    if (el < 0 || el > TAIL_SWEEP_SPAN) return;
    const scale = e.scale || 1;
    const k = saurianModelScale(scale);
    const reach = tailSprayReach(scale);
    const a = tailSweepAngle(el);
    const pt = this.tmpPt;
    const gy0 = this.host.groundY(e.pos.x, e.pos.z);
    const wet = wetFloor(gy0);
    // The sweep runs toward its right: the tangent (model space) is (-cos a, -sin a).
    const s = Math.sin(e.facing);
    const c = Math.cos(e.facing);
    const tx = -Math.cos(a);
    const tz = -Math.sin(a);
    const dirX = tz * s + tx * c;
    const dirZ = tz * c - tx * s;
    t.sweepEmit += dt * 150 * this.host.density;
    while (t.sweepEmit >= 1) {
      t.sweepEmit -= 1;
      const u = 0.25 + 0.75 * this.host.rand();
      const r = reach.from + (reach.to - reach.from) * u;
      saurianModelToWorld(
        e.pos,
        e.facing,
        scale,
        (Math.sin(a) * r) / k,
        (-Math.cos(a) * r) / k,
        pt,
      );
      const y = this.waterY(pt.x, pt.z) + 0.3;
      this.host.puff(pt.x, y, pt.z, 4, {
        speed: 7 + 7 * u,
        up: 5 + 5 * u,
        life: 1.2,
        size: [0.42, 0.14],
        color: wet ? [0.9, 0.97, 1] : [0.7, 0.6, 0.45],
        alpha: 0.95,
        gravity: 15,
        drag: 0.35,
        dir: [dirX, 0.55, dirZ],
        spread: 0.45,
        glow: wet,
      });
      this.host.puff(pt.x, y + 0.6, pt.z, 2, {
        speed: 3 + 5 * u,
        up: 2.2,
        life: 1.8,
        size: [1.6, 4.8],
        color: wet ? [0.93, 0.97, 0.96] : [0.6, 0.54, 0.42],
        alpha: 0.42,
        drag: 2,
        dir: [dirX, 0.25, dirZ],
        spread: 0.5,
      });
      if (u > 0.6 && wet && this.host.rand() < 0.3) this.crown(pt.x, pt.z, CROWN_LOOKS.tailWake);
    }
  }

  // ----- the howdah

  private howdahBurst(at: PendingBeat): void {
    const deck = howdahDeck(at.scale);
    const gy = this.host.groundY(at.x, at.z);
    const x = at.x + Math.sin(at.facing) * deck.forward;
    const z = at.z + Math.cos(at.facing) * deck.forward;
    const y = gy + deck.up;
    const k = saurianModelScale(at.scale);
    // The crack of it: a warm flash, the dust cloud, the red cloth torn away.
    this.host.puff(x, y, z, 4, {
      speed: 1,
      life: 0.45,
      size: [6, 13],
      color: [1, 0.82, 0.5],
      alpha: 0.85,
      glow: true,
    });
    this.host.puff(x, y, z, 28, {
      speed: 6,
      up: 1.5,
      life: 2.2,
      size: [1.6, 5],
      color: [0.72, 0.62, 0.46],
      alpha: 0.38,
      drag: 1.6,
      radius: 3 * k,
    });
    this.host.puff(x, y + 0.5, z, 30, {
      speed: 7,
      up: 4,
      life: 2.8,
      size: [0.9, 0.6],
      color: [0.66, 0.15, 0.12],
      alpha: 1,
      gravity: 3.5,
      drag: 0.9,
    });
    this.host.puff(x, y, z, 24, {
      speed: 9,
      up: 5,
      life: 1,
      size: [0.35, 0.1],
      color: [1, 0.9, 0.7],
      alpha: 1,
      gravity: 12,
      drag: 0.5,
      glow: true,
    });
    this.launchSplinters(x, y, z, at.facing);
    if (!this.host.reducedMotion()) this.host.shake(0.35);
  }

  private launchSplinters(x: number, y: number, z: number, facing: number): void {
    const n = this.sKind.length;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const a = this.host.rand() * Math.PI * 2;
      const lift = 0.35 + this.host.rand() * 0.65;
      const sp = 7 + this.host.rand() * 10;
      const kind = this.sKind[i];
      this.sPos[o] = x + (this.host.rand() - 0.5) * 3;
      this.sPos[o + 1] = y + (this.host.rand() - 0.2) * 2;
      this.sPos[o + 2] = z + (this.host.rand() - 0.5) * 3;
      // Thrown mostly sideways off its back (the clip bucks the deck up).
      const side = Math.cos(a) * 0.4 + Math.sign(Math.sin(a + facing)) * 0.2;
      this.sVel[o] = Math.cos(a) * sp * (1 - lift * 0.5) + side;
      this.sVel[o + 1] = lift * sp * 0.9 + 3;
      this.sVel[o + 2] = Math.sin(a) * sp * (1 - lift * 0.5);
      const ax = this.host.rand() - 0.5;
      const ay = this.host.rand() - 0.5;
      const az = this.host.rand() - 0.5;
      const len = Math.hypot(ax, ay, az) || 1;
      this.sAxis[o] = ax / len;
      this.sAxis[o + 1] = ay / len;
      this.sAxis[o + 2] = az / len;
      this.sAngle[i] = this.host.rand() * 6.28;
      this.sSpin[i] = (this.host.rand() - 0.5) * 22;
      this.sLen[i] =
        kind === 'bamboo'
          ? 0.7 + this.host.rand() * 1.3
          : kind === 'cloth'
            ? 0.6 + this.host.rand() * 0.5
            : 0.3 + this.host.rand() * 0.45;
      this.sState[i] = 1;
      this.sTimer[i] = 0;
    }
    this.splintersLive = n;
    this.splinters.visible = true;
  }

  private stepSplinters(dt: number): void {
    if (this.splintersLive <= 0) return;
    let live = 0;
    const p = this.sPos;
    const v = this.sVel;
    for (let i = 0; i < this.sKind.length; i++) {
      const st = this.sState[i];
      if (st === 0) continue;
      const o = i * 3;
      if (st === 1) {
        v[o + 1] -= SPLINTER_GRAVITY * dt;
        const drag = this.sKind[i] === 'cloth' ? 1.6 : 0.15;
        const d = Math.exp(-drag * dt);
        v[o] *= d;
        v[o + 2] *= d;
        if (this.sKind[i] === 'cloth') v[o + 1] = Math.max(v[o + 1], -5);
        p[o] += v[o] * dt;
        p[o + 1] += v[o + 1] * dt;
        p[o + 2] += v[o + 2] * dt;
        this.sAngle[i] += this.sSpin[i] * dt;
        const gy = this.host.groundY(p[o], p[o + 2]);
        const wet = wetFloor(gy);
        const floor = wet ? Math.max(gy, 0) + WATER_LIFT : gy + 0.08;
        if (p[o + 1] <= floor && v[o + 1] < 0) {
          p[o + 1] = floor;
          this.sFloor[i] = floor;
          if (wet) {
            this.sState[i] = 2;
            this.sSpin[i] *= 0.15;
            if (this.host.rand() < 0.35) this.ripple(p[o], p[o + 2], RIPPLE_LOOKS.debris);
            this.droplets(p[o], p[o + 2], 3, 2.5, 0.2);
          } else {
            this.sState[i] = 3;
            this.sSpin[i] = 0;
          }
        }
      } else if (st === 2) {
        p[o + 1] -= SPLINTER_SINK.speed * dt;
        this.sAngle[i] += this.sSpin[i] * dt;
        if (p[o + 1] < this.sFloor[i] - SPLINTER_SINK.depth) this.sState[i] = 0;
      } else {
        this.sTimer[i] += dt;
        if (this.sTimer[i] > 4) this.sState[i] = 0;
      }
      if (this.sState[i] === 0) {
        this.splinters.setMatrixAt(i, this.tmpM.makeScale(0, 0, 0));
        continue;
      }
      live++;
      const kind = this.sKind[i];
      const fade = this.sState[i] === 3 ? Math.max(0, 1 - Math.max(0, this.sTimer[i] - 3)) : 1;
      const len = this.sLen[i] * fade;
      const thick = kind === 'cloth' ? 0.04 : kind === 'bamboo' ? 0.11 : 0.16;
      const wide = kind === 'cloth' ? 0.5 : thick;
      this.tmpAxis.set(this.sAxis[o], this.sAxis[o + 1], this.sAxis[o + 2]);
      this.tmpQ.setFromAxisAngle(this.tmpAxis, this.sAngle[i]);
      this.tmpPos.set(p[o], p[o + 1], p[o + 2]);
      this.tmpScale.set(wide * fade, thick * fade, len);
      this.splinters.setMatrixAt(i, this.tmpM.compose(this.tmpPos, this.tmpQ, this.tmpScale));
    }
    this.splinters.instanceMatrix.needsUpdate = true;
    this.splintersLive = live;
    if (live === 0) this.splinters.visible = false;
  }

  // ----- the enrage

  private enrageFlare(src: Entity): void {
    const k = saurianModelScale(src.scale || 1);
    const gy = this.host.groundY(src.pos.x, src.pos.z);
    this.host.puff(src.pos.x, gy + 9 * k, src.pos.z, 36, {
      speed: 6,
      up: 3,
      life: 1.4,
      size: [2.5, 7],
      color: [1, 0.32, 0.2],
      alpha: 0.7,
      glow: true,
      radius: 3 * k,
    });
  }

  // ----- the gait

  private stepTrackers(dt: number): void {
    if (dt <= 0) return;
    for (const t of this.trackers.values()) {
      const e = this.world.entities.get(t.id);
      if (!e) continue;
      const scale = e.scale || 1;
      t.scale = scale;
      this.stepTail(t, e, dt);
      const moved = Math.hypot(e.pos.x - t.x, e.pos.z - t.z);
      t.x = e.pos.x;
      t.z = e.pos.z;
      t.facing = e.facing;
      // A teleport or a fresh view: no footfalls across the jump.
      if (e.dead || moved > 6) {
        t.speed = 0;
        t.phase = 0;
        continue;
      }
      t.speed += (moved / dt - t.speed) * Math.min(1, dt * 6);
      if (t.speed < 0.4) {
        // It stood still: the next gait starts its cycle afresh.
        t.phase = 0;
        continue;
      }
      const gait = t.speed > 4 ? 'run' : 'walk';
      if (gait !== t.gait) {
        t.gait = gait;
        t.phase = 0;
      }
      const from = t.phase;
      t.phase += moved / saurianStride(gait, scale);
      if (saurianFootfallsBetween(gait, from, t.phase, this.feet) === 0) continue;
      for (const f of this.feet) this.footfall(e, f, gait);
    }
  }

  private footfall(e: Entity, f: SaurianFoot, gait: 'walk' | 'run'): void {
    const p = saurianFootPoint(f);
    const pt = saurianModelToWorld(e.pos, e.facing, e.scale || 1, p.x, p.z, this.tmpPt);
    const gy = this.host.groundY(pt.x, pt.z);
    if (!wetFloor(gy)) {
      this.dust(pt.x, pt.z, gy, gait === 'run' ? 8 : 4, 1.2);
      return;
    }
    if (this.host.density >= 1)
      this.crown(pt.x, pt.z, gait === 'run' ? CROWN_LOOKS.footfallRun : CROWN_LOOKS.footfall);
    this.ripple(pt.x, pt.z, RIPPLE_LOOKS.footfall);
    this.droplets(pt.x, pt.z, gait === 'run' ? 10 : 5, gait === 'run' ? 3.5 : 2.2, 0.8);
    if (gait === 'run') this.mist(pt.x, pt.z, 0.6, 1.5);
  }

  // ----- the pools

  private paintCrowns(): void {
    for (const c of this.crowns) {
      if (!c.alive) continue;
      const s = crownShape(c.spec, this.clock - c.born);
      if (s.alpha <= 0) {
        c.alive = false;
        c.mesh.visible = false;
        continue;
      }
      c.mat.uniforms.uRadius.value = s.radius;
      c.mat.uniforms.uHeight.value = Math.max(0.01, s.height);
      c.mat.uniforms.uAlpha.value = s.alpha;
    }
  }

  private paintRipples(): void {
    for (const r of this.ripples) {
      if (!r.alive) continue;
      const s = rippleShape(r.spec, this.clock - r.born);
      if (s.alpha <= 0) {
        r.alive = false;
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(Math.max(0.05, s.radius));
      r.mat.uniforms.uAlpha.value = s.alpha;
    }
  }
}
