// The Stormbrass Foundry's creature and boss effects (phase 3; plan and
// anchors in foundry_creature_fx_core.ts), dressed over the phase 2 floor
// telegraphs (foundry_fx.ts), which stay the actionable read on every tier:
//  - the gestures the clips cannot know: Tock's gauge needle climbing toward
//    the lever throw (a dial) and rattling through the klaxon, the Voltaic
//    Warden's plates turning copper or charged face out (front and back apart
//    on heroic Split Plating) and rattling through the flip, the Half-Built
//    Frames slumped until their boot aura drops, and the one-shots fired off
//    nova events (Parts Drop, Drill Drones, Unload, Discharge, the drones);
//  - Line-Master Tock: smoke from his pack's stacks, the beacon's whirling
//    flare and a steam blast as the lever lands, the riveter's muzzle flashes
//    and the rivets hammering home, the Stamping Press's carriages sliding
//    along their rails (wheel sparks, the brake's hiss, the ram venting as it
//    winds up) and the slam's shockwave, dust walls, steam and sparks;
//  - the Rangewarden: a thin lock-on beam from its glass eye to each marked
//    player, every salvo shell's muzzle flash on the berm, its smoking arc and
//    its burst, the Proof Shot's charge and blast, the drone rack's smoke;
//  - the Voltaic Warden: arcs crawling from its coil to its antlers and a
//    core glow that swells with the Stored Charge, arcs leaping off the coil
//    to the floor farther and thicker as the bank builds (blue when Charged,
//    copper-green when Grounded), the Static Lash's whip and
//    chain, the Discharge's nova and the arcs it throws to every player, the
//    Coil Strike's bolt;
//  - the Prime Draft: storm cells crackling where they lie and in their
//    carriers' hands, the delivery arc into the hatch, the Overload's
//    lightning cascade over the colossus;
//  - the Gantry Hauler: chimney smoke, the Steam Blast's billowing cone, the
//    scrap plate thrown along its arc, the Unload, the Boiler Rupture; the
//    trash's boiler bursts and arc pops.
//
// Rules (src/render/CLAUDE.md): one root attached through the compile gate,
// every material present at construction; pooled particles (the crypt GPU
// kit), arcs, rings and projectiles; no point lights; no per-frame allocation
// in the pools. Cosmetic density sheds on the low tier; nothing here replaces
// or hides a telegraph. Everything reads mirrored entity state and events.

import * as THREE from 'three';
import { resolveUiEffectsProfile } from '../../game/ui_effects_profile';
import { MAIN_LINE_BELTS } from '../../sim/content/stormbrass_foundry_layout';
import {
  DRAFT_ARC_BACK,
  DRAFT_ARC_SURGE,
  DRAFT_BOLTED,
  DRAFT_CELL_CARRY,
  DRAFT_CHARGE_CYCLE,
  DRAFT_ENRAGE,
  DRAFT_OVERLOAD,
  DRAFT_PISTON_FIST,
  DRAFT_SHORT_OUT,
  DRAFT_TUNING,
  DRAFT_UNBOLT,
  FOUNDRY_SCRAP_MARK,
  FOUNDRY_SHELL_MARK,
  FRAME_BOOTING,
  GANTRY_HAULER_ID,
  HALF_BUILT_FRAME_ID,
  HAULER_BOILER_RUPTURE,
  HAULER_SCRAP_TOSS,
  HAULER_STEAM_BLAST,
  HAULER_TUNING,
  HAULER_UNLOAD,
  hatchStateOf,
  PRIME_DRAFT_ID,
  RANGE_DRILL_DRONES,
  RANGE_PROOF_SHOT,
  RANGE_SALVO,
  RANGE_TARGET_LOCK,
  RANGEWARDEN_ID,
  TOCK_ID,
  TOCK_LEVER,
  TOCK_PARTS_DROP,
  TOCK_PRESSURE,
  TOCK_RIVET_GUN,
  TOCK_STAMPING_PRESS,
  TOCK_TUNING,
  VOLTAIC_CHARGED,
  VOLTAIC_COIL_STRIKE,
  VOLTAIC_DISCHARGE,
  VOLTAIC_DRONES,
  VOLTAIC_FLIP,
  VOLTAIC_GROUNDED,
  VOLTAIC_STATIC_LASH,
  VOLTAIC_STORED,
  VOLTAIC_WARDEN_ID,
} from '../../sim/encounters/stormbrass_foundry/ids';
import { FOUNDRY_ARC_POP, FOUNDRY_BOILER_BURST } from '../../sim/mob/trash_kit/foundry_cast_ids';
import type { Entity, SimEvent } from '../../sim/types';
import type { IWorld } from '../../world_api';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { attachSceneGroupGated } from '../gated_scene_attach';
import { GFX } from '../gfx';
import {
  DUST_FRAG,
  GLOW_FRAG,
  PARTICLE_VERT,
  ParticlePool,
  type ParticleSpec,
} from '../hollow_crypt/crypt_fx_particles';
import { setRenderCategory } from '../renderer_diagnostics';
import { FoundryArcs } from './foundry_arcs';
import {
  FOUNDRY_FX_ANCHORS as A,
  FOUNDRY_DRAW,
  type FoundryAnchor,
  FRAME_AWAKE_GESTURE,
  FRAME_DORMANT_GESTURE,
  foundryAnchor,
  shellArcLift,
  TOCK_GAUGE_RATTLE,
  tockGaugeGesture,
  tockGaugeLevel,
  VOLTAIC_PLATE_RATTLE,
  voltaicFaces,
  voltaicFlipped,
  voltaicPlateGesture,
} from './foundry_creature_fx_core';
import { FoundryDraftTether } from './foundry_draft_tether';
import { storedChargeFill, storedChargeGlow } from './foundry_fx_core';
import { FOUNDRY_PRESS_HAMMERS } from './foundry_press';
import {
  beginPressStrike,
  createPressRig,
  HAMMER_HALF_LENGTH,
  HAMMER_HALF_WIDTH,
  PRESS_RAIL_Y,
  type PressPose,
  pressBeltOf,
  pressPoseInto,
  syncPressStrike,
} from './foundry_press_core';
import { DraftGestures } from './prime_draft_gesture_core';
import { PRIME_DRAFT_MODEL, primeDraftModelScale } from './prime_draft_model_core';
import { voltaicFlipTurned } from './voltaic_model_core';

type Rgb = readonly [number, number, number];

/** Does `e` wear aura `id` (from `source` when given)? A plain loop: no closure. */
function hasAura(e: Entity, id: string, source?: number): boolean {
  const auras = e.auras;
  if (!auras) return false;
  for (let i = 0; i < auras.length; i++) {
    const a = auras[i];
    if (a.id === id && (source === undefined || a.sourceId === source)) return true;
  }
  return false;
}
const RGB_0: Rgb = [0.9, 0.93, 0.95];
const RGB_1: Rgb = [1, 0.92, 0.6];
const RGB_2: Rgb = [0.6, 0.85, 1];
const RGB_3: Rgb = [1, 0.62, 0.15];
const RGB_4: Rgb = [1, 0.85, 0.5];
const RGB_5: Rgb = [0.5, 0.5, 0.52];
const RGB_6: Rgb = [0.42, 0.4, 0.38];
const RGB_7: Rgb = [1, 0.88, 0.55];
const RGB_8: Rgb = [0.45, 0.44, 0.44];
const RGB_9: Rgb = [1, 0.94, 0.75];
const RGB_10: Rgb = [0.3, 0.29, 0.28];
const RGB_11: Rgb = [1, 0.92, 0.65];
const RGB_12: Rgb = [0.48, 0.47, 0.46];
const RGB_13: Rgb = [0.75, 0.9, 1];
const RGB_14: Rgb = [0.7, 0.9, 1];
const RGB_15: Rgb = [0.8, 0.92, 1];
const RGB_16: Rgb = [0.85, 0.95, 1];
const RGB_17: Rgb = [0.75, 0.92, 1];
const RGB_18: Rgb = [0.45, 0.42, 0.38];
const RGB_19: Rgb = [0.92, 0.96, 1];
const RGB_20: Rgb = [0.55, 0.55, 0.56];
const RGB_21: Rgb = [1, 0.55, 0.12];
const RGB_22: Rgb = [1, 0.8, 0.45];
const RGB_23: Rgb = [0.6, 1, 0.75];
const RGB_24: Rgb = [0.32, 0.31, 0.32];
const RGB_25: Rgb = [0.45, 0.78, 1];
const RGB_26: Rgb = [0.5, 0.82, 1];
const RGB_27: Rgb = [1, 0.85, 0.42];
const RGB_28: Rgb = [1, 0.82, 0.4];
const RGB_29: Rgb = [0.42, 0.41, 0.4];

const TOCK_STACKS = [A.tockStackL, A.tockStackR] as const;
const HAULER_NOZZLES = [A.haulerNozzleL, A.haulerNozzleR] as const;
const BELT_ENDS = [-1, 1] as const;
const BELT_MID_Z = (MAIN_LINE_BELTS.z0 + MAIN_LINE_BELTS.z1) / 2;
/** The slam's dust walls: stations along the strip's two long edges, thrown
 *  out to either side; the steam goes straight up the hammer's flanks. */
const PRESS_DUST_STATIONS = [-0.8, -0.4, 0, 0.4, 0.8] as const;
const PRESS_DUST_WEST = { x: -1, y: 0.25, z: 0 } as const;
const PRESS_DUST_EAST = { x: 1, y: 0.25, z: 0 } as const;
const PRESS_STEAM_UP = { x: 0, y: 1, z: 0 } as const;
/** The beacon's amber, rewritten in place as it pulses. */
const BEACON_RGB: [number, number, number] = [1, 0.5, 0.08];

const SCAN_SEC = 0.1;
const GESTURE_REFRESH_SEC = 2;
const RING_SLOTS = 10;
const SHELL_SLOTS = 10;
const PLATE_SLOTS = 3;
const ARC_SLOTS = 40;

const ARC_BLUE = 0x6fc4ff;
const ARC_WHITE = 0xd8f0ff;
const COPPER_GLOW = 0x7dffb0;
const HATCH_GOLD = 0xffd36a;

const MESH_VERT = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
/** A shockwave: a hot leading edge with a soft wake. */
const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying vec3 vLocal;
void main() {
  float r = length(vLocal.xz);
  float lead = smoothstep(0.82, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
  float wake = smoothstep(0.4, 0.95, r) * 0.25 * step(r, 1.0);
  gl_FragColor = vec4(uColor * (1.0 + lead), (lead + wake) * uAlpha);
}
`;

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  born: number;
  span: number;
  reach: number;
  alive: boolean;
}

interface Flyer {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  born: number;
  span: number;
  apex: number;
  objectId: number;
  alive: boolean;
}

interface Watch {
  gauge: number;
  gaugeAt: number;
  faces: string;
  facesAt: number;
  castSeen: string | null;
  frame: string;
  lockBeam: Map<number, number>;
}

type V3 = { x: number; y: number; z: number };

/** The Voltaic Warden's drone bay doors (the drones leave from both). */
const WARDEN_BAYS = [A.wardenBayL, A.wardenBayR] as const;
/** The Prime Draft's feet (the bolts shear off both). */
const DRAFT_FEET = [A.draftFootL, A.draftFootR] as const;

export class FoundryCreatureFx {
  readonly readyForEntry: Promise<void>;
  private readonly root = new THREE.Group();
  private readonly uTime = { value: 0 };
  private readonly density: number;
  private readonly smoke: ParticlePool;
  private readonly glow: ParticlePool;
  private readonly arcs = new FoundryArcs(ARC_SLOTS);
  /** The Prime Draft's cable terminal (its cables' far ends) and each
   *  Draft's presentation gestures (the moorings, the hatch, the stance). */
  private readonly tether: FoundryDraftTether;
  private readonly draftGestures = new Map<number, DraftGestures>();
  private readonly sendTo = { id: -1 };
  private readonly sendGesture = (g: string): void => {
    this.playGesture?.(this.sendTo.id, g);
  };
  private readonly rings: Ring[] = [];
  private readonly shells: Flyer[] = [];
  private readonly plates: Flyer[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly watch = new Map<number, Watch>();
  private readonly seenObjects = new Set<number>();
  private readonly objectPos = new Map<number, V3>();
  private readonly bosses: Entity[] = [];
  private readonly players: Entity[] = [];
  private readonly carriers: Entity[] = [];
  private readonly cells: Entity[] = [];
  private readonly belts: Entity[] = [];
  private readonly frames: Entity[] = [];
  private readonly cellObjects: Entity[] = [];
  private readonly hatches: Entity[] = [];
  private readonly fresh: Entity[] = [];
  private readonly live = new Set<number>();
  /** When each marked player's lock beam was last struck. */
  private readonly lockStruck = new Map<number, number>();
  private rosterVersion = -1;
  /** The Stamping Press's carriages (foundry_press_core.ts), each one's last
   *  strike spot in the world (the strip is gone when its slam is heard) and
   *  the way it was last seen travelling. */
  private readonly pressRig = createPressRig();
  private readonly pressSpot: V3[] = this.pressRig.map(() => ({ x: 0, y: 0, z: 0 }));
  private readonly pressMoving: number[] = this.pressRig.map(() => 0);
  private readonly pressPose: PressPose = { z: 0, drop: 0, shadow: 0, moving: 0 };
  /** The claim's origin in the world, read off the belts (the rails are
   *  instance-local). */
  private pressOriginX = 0;
  private pressOriginZ = 0;
  private clock = 0;
  private scan = 0;
  private emitAcc = 0;
  private seed = 0x5f0d;
  private disposed = false;
  private readonly p: V3 = { x: 0, y: 0, z: 0 };
  private readonly q: V3 = { x: 0, y: 0, z: 0 };
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
    r: 1,
    g: 1,
    b: 1,
    a: 1,
  };

  constructor(
    scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
    private readonly world?: IWorld,
    compileGate?: (target: THREE.Object3D) => Promise<unknown>,
    private readonly reducedMotion: () => boolean = () => false,
    private readonly shake?: (amount: number) => void,
    private readonly playGesture?: (entityId: number, gesture: string) => void,
  ) {
    this.root.name = 'stormbrass-foundry-creature-fx';
    setRenderCategory(this.root, 'ui3d');
    const low =
      resolveUiEffectsProfile({ presetLabel: GFX.tier, effectsQuality: 1, reduceMotion: false })
        .tier === 'low';
    this.density = low ? 0.4 : 1;
    const particleMat = (frag: string, blending: THREE.Blending) => {
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
    this.smoke = new ParticlePool(
      Math.round(1400 * this.density) + 120,
      particleMat(DUST_FRAG, THREE.NormalBlending),
      floorVfxRenderOrder('encounter', 6),
    );
    this.glow = new ParticlePool(
      Math.round(1600 * this.density) + 160,
      particleMat(GLOW_FRAG, THREE.AdditiveBlending),
      floorVfxRenderOrder('encounter', 8),
    );
    for (const pool of [this.smoke, this.glow]) {
      this.geometries.push(pool.mesh.geometry);
      this.root.add(pool.mesh);
    }
    this.root.add(this.arcs.root);
    this.tether = new FoundryDraftTether(this.root);
    const ringGeo = new THREE.CircleGeometry(1, 64);
    ringGeo.rotateX(-Math.PI / 2);
    this.geometries.push(ringGeo);
    for (let i = 0; i < RING_SLOTS; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
        vertexShader: MESH_VERT,
        fragmentShader: RING_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      this.materials.push(mat);
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = floorVfxRenderOrder('encounter', 4);
      this.root.add(mesh);
      this.rings.push({ mesh, mat, born: 0, span: 1, reach: 1, alive: false });
    }
    // The salvo's shells: dark iron slugs with a hot glowing nose.
    const shellGeo = new THREE.SphereGeometry(0.35, 10, 8);
    shellGeo.scale(1, 1, 1.8);
    const shellMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8 });
    this.geometries.push(shellGeo);
    this.materials.push(shellMat);
    for (let i = 0; i < SHELL_SLOTS; i++) this.shells.push(this.flyer(shellGeo, shellMat));
    // The Hauler's scrap plates: a riveted brass slab tumbling through the air.
    const plateGeo = new THREE.BoxGeometry(2.4, 0.18, 1.7);
    // Unlit (no light- or fog-keyed program variant to link mid-fight).
    const plateMat = new THREE.MeshBasicMaterial({ color: 0x9a7634 });
    this.geometries.push(plateGeo);
    this.materials.push(plateMat);
    for (let i = 0; i < PLATE_SLOTS; i++) this.plates.push(this.flyer(plateGeo, plateMat));
    this.readyForEntry = attachSceneGroupGated(scene, this.root, compileGate, () => this.disposed)
      .then(() => {})
      .catch(() => {});
  }

  private flyer(geo: THREE.BufferGeometry, mat: THREE.Material): Flyer {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    this.root.add(mesh);
    return {
      mesh,
      from: new THREE.Vector3(),
      to: new THREE.Vector3(),
      born: 0,
      span: 1,
      apex: 0,
      objectId: -1,
      alive: false,
    };
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0;
    return (this.seed >>> 0) / 4294967296;
  }

  // -------------------------------------------------------------------- helpers

  private at(e: Entity, a: FoundryAnchor, out: V3 = this.p): V3 {
    const draw = (FOUNDRY_DRAW[e.templateId] ?? 1) * (e.scale || 1);
    return foundryAnchor(e.pos, e.facing, draw, a, out);
  }

  private puff(
    x: number,
    y: number,
    z: number,
    n: number,
    o: {
      speed: number;
      up?: number;
      life: number;
      size: [number, number];
      color: Rgb;
      alpha: number;
      drag?: number;
      dir?: V3;
      spread?: number;
      glow?: boolean;
      gravity?: number;
    },
  ): void {
    const pool = o.glow ? this.glow : this.smoke;
    const count = Math.max(1, Math.round(n * this.density));
    const s = this.spec;
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2;
      const e = (this.rand() - 0.5) * 2;
      let vx = Math.cos(a) * Math.sqrt(1 - e * e);
      let vy = e;
      let vz = Math.sin(a) * Math.sqrt(1 - e * e);
      if (o.dir) {
        const k = o.spread ?? 0.35;
        vx = o.dir.x + vx * k;
        vy = o.dir.y + vy * k;
        vz = o.dir.z + vz * k;
      }
      const sp = o.speed * (0.55 + 0.6 * this.rand());
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = vx * sp;
      s.vy = vy * sp + (o.up ?? 0);
      s.vz = vz * sp;
      s.ax = 0;
      s.ay = o.gravity ?? 0;
      s.az = 0;
      s.life = o.life * (0.7 + 0.5 * this.rand());
      s.drag = o.drag ?? 1.5;
      s.floor = this.groundY(x, z) + 0.05;
      s.size0 = o.size[0] * (0.8 + 0.4 * this.rand());
      s.size1 = o.size[1] * (0.8 + 0.4 * this.rand());
      s.spin = (this.rand() - 0.5) * 2;
      s.seed = this.rand();
      s.r = o.color[0];
      s.g = o.color[1];
      s.b = o.color[2];
      s.a = o.alpha;
      pool.emit(this.clock, s);
    }
  }

  private steam(
    x: number,
    y: number,
    z: number,
    n: number,
    size: number,
    dir?: V3,
    speed = 4,
  ): void {
    this.puff(x, y, z, n, {
      speed,
      up: 1.2,
      life: 1.6,
      size: [size * 0.6, size * 2.2],
      color: RGB_0,
      alpha: 0.55,
      drag: 1.6,
      dir,
      spread: 0.45,
    });
  }

  private sparks(x: number, y: number, z: number, n: number, speed: number, color = RGB_1): void {
    this.puff(x, y, z, n, {
      speed,
      up: 2,
      life: 0.6,
      size: [0.22, 0.05],
      color,
      alpha: 1,
      drag: 1.2,
      glow: true,
      gravity: -14,
    });
  }

  private flash(x: number, y: number, z: number, size: number, color: Rgb, life = 0.18): void {
    const s = this.spec;
    s.x = x;
    s.y = y;
    s.z = z;
    s.vx = s.vy = s.vz = 0;
    s.ax = s.ay = s.az = 0;
    s.life = life;
    s.drag = 1;
    s.floor = -1e6;
    s.size0 = size;
    s.size1 = size * 1.6;
    s.spin = 0;
    s.seed = this.rand();
    s.r = color[0];
    s.g = color[1];
    s.b = color[2];
    s.a = 1;
    this.glow.emit(this.clock, s);
  }

  private ring(
    x: number,
    z: number,
    reach: number,
    seconds: number,
    color: number,
    delay = 0,
  ): void {
    const r = this.rings.find((q) => !q.alive) ?? this.rings[0];
    r.alive = true;
    r.born = this.clock + delay;
    r.span = seconds;
    r.reach = reach;
    (r.mat.uniforms.uColor.value as THREE.Color).setHex(color);
    r.mesh.position.set(x, this.groundY(x, z) + 0.15, z);
    r.mesh.scale.setScalar(0.01);
    r.mesh.visible = false;
  }

  private shakeAt(x: number, z: number, amount: number): void {
    if (!this.shake || this.reducedMotion() || !this.world) return;
    const me = this.world.player;
    if (!me) return;
    const d = Math.hypot(me.pos.x - x, me.pos.z - z);
    if (d < 40) this.shake(amount * (1 - d / 40));
  }

  private gesture(e: Entity, g: string): void {
    this.playGesture?.(e.id, g);
  }

  private watchOf(e: Entity): Watch {
    let w = this.watch.get(e.id);
    if (!w) {
      w = {
        gauge: -1,
        gaugeAt: -1e6,
        faces: '',
        facesAt: -1e6,
        castSeen: null,
        frame: '',
        lockBeam: new Map(),
      };
      this.watch.set(e.id, w);
    }
    return w;
  }

  private chest(e: Entity, out: V3): V3 {
    switch (e.templateId) {
      case VOLTAIC_WARDEN_ID:
        return this.at(e, A.wardenCore, out);
      case PRIME_DRAFT_ID:
        return this.at(e, A.draftChest, out);
      case TOCK_ID:
        return this.at(e, A.tockChest, out);
      default:
        out.x = e.pos.x;
        out.y = e.pos.y + 1.3 * (e.scale || 1);
        out.z = e.pos.z;
        return out;
    }
  }

  // --------------------------------------------------------------------- events

  handleEvent(ev: SimEvent): void {
    if (this.disposed || !this.world || ev.type !== 'spellfx' || !ev.ability) return;
    const src = this.world.entities.get(ev.sourceId);
    const tgt = ev.targetId !== undefined ? this.world.entities.get(ev.targetId) : undefined;
    const ab = ev.ability;
    if (ev.fx === 'windup') {
      if (ab === RANGE_SALVO && src && ev.targetId !== undefined)
        this.launchShell(src, ev.targetId);
      else if (ab === HAULER_SCRAP_TOSS && src) this.scrapToss(src);
      // The Prime Draft raises its brass fist as the mark paints: the Slam
      // clip's fist meets the floor as the warning ends.
      else if (ab === DRAFT_PISTON_FIST && src) this.gesture(src, DRAFT_PISTON_FIST);
      return;
    }
    if (ev.fx !== 'nova') return;
    switch (ab) {
      case TOCK_LEVER:
        if (src) this.leverLands(src);
        return;
      case TOCK_RIVET_GUN:
        if (src) this.rivets(src, tgt);
        return;
      case TOCK_STAMPING_PRESS:
        this.pressLands(ev.targetId, tgt);
        return;
      case TOCK_PARTS_DROP:
        if (src) this.gesture(src, TOCK_PARTS_DROP);
        return;
      case RANGE_SALVO:
        this.shellBursts(ev.targetId);
        return;
      case RANGE_PROOF_SHOT:
        if (src) this.proofShot(src, tgt);
        return;
      case RANGE_DRILL_DRONES:
        if (src) this.drillDrones(src);
        return;
      case VOLTAIC_DISCHARGE:
        if (src) this.discharge(src);
        return;
      case VOLTAIC_STATIC_LASH:
        if (src && tgt) this.lash(src, tgt);
        return;
      case VOLTAIC_DRONES:
        if (src) {
          this.gesture(src, VOLTAIC_DRONES);
          // Out of the two bay doors on its back housing, arcing off the coil.
          const c = this.chest(src, this.q);
          for (const bay of WARDEN_BAYS) {
            const b = this.at(src, bay, this.p);
            this.sparks(b.x, b.y, b.z, 18, 8, RGB_2);
            this.flash(b.x, b.y, b.z, 2.4, RGB_2, 0.2);
            this.arcs.strike(this.clock, c, b, 0.3, ARC_BLUE, 0.16, 0.3);
          }
        }
        return;
      case VOLTAIC_COIL_STRIKE:
        this.coilStrike(tgt);
        return;
      case DRAFT_OVERLOAD:
        if (src) {
          // The seizure (its Overload clip) and its lightning flaring.
          this.gesture(src, DRAFT_OVERLOAD);
          this.overloadStrikes(src, tgt);
        }
        return;
      case DRAFT_PISTON_FIST:
        if (src) this.fistLands(src, tgt);
        return;
      case DRAFT_UNBOLT:
        if (src) this.boltsShear(src);
        return;
      case DRAFT_ARC_BACK:
      case DRAFT_SHORT_OUT:
        if (tgt) this.cellBlows(tgt, ab === DRAFT_SHORT_OUT ? 1.6 : 1);
        return;
      case DRAFT_ARC_SURGE:
        if (src && tgt) this.lash(src, tgt);
        return;
      case DRAFT_CHARGE_CYCLE:
        return;
      case HAULER_STEAM_BLAST:
        if (src) this.steamBlast(src);
        return;
      case HAULER_SCRAP_TOSS:
        this.plateLands(ev.targetId);
        return;
      case HAULER_UNLOAD:
        if (src) {
          this.gesture(src, HAULER_UNLOAD);
          const b = this.at(src, A.haulerBed);
          this.steam(b.x, b.y, b.z, 18, 2.2);
          this.sparks(b.x, b.y, b.z, 30, 7);
        }
        return;
      case HAULER_BOILER_RUPTURE:
        if (src) this.boilerBurst(src, 2.6, HAULER_TUNING.blastRange);
        return;
      case FOUNDRY_BOILER_BURST:
        if (src) this.boilerBurst(src, 1.4, 6);
        return;
      case FOUNDRY_ARC_POP:
        if (src) this.arcPop(src);
        return;
      default:
        return;
    }
  }

  /** The belts reverse: steam spits along every belt, sparks off its rollers. */
  private beltsReverse(): void {
    const half = (MAIN_LINE_BELTS.z1 - MAIN_LINE_BELTS.z0) / 2;
    for (const b of this.belts) {
      for (let k = 0; k < 5; k++) {
        const z = b.pos.z - half + (2 * half * (k + 0.5)) / 5;
        const y = this.groundY(b.pos.x, z);
        this.steam(b.pos.x + (this.rand() - 0.5) * 4, y + 0.3, z, 4, 1.2, { x: 0, y: 1, z: 0 }, 3);
        this.sparks(b.pos.x + (k % 2 ? 2.4 : -2.4), y + 0.4, z, 6, 5);
      }
    }
  }

  /** The klaxon over the belts: a whirling amber beacon at both ends of each. */
  private beltAlarm(): void {
    const half = (MAIN_LINE_BELTS.z1 - MAIN_LINE_BELTS.z0) / 2;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 14);
    for (const b of this.belts) {
      if (b.templateId !== 'foundry_belt_alarm') continue;
      for (const end of BELT_ENDS) {
        const z = b.pos.z + end * (half + 0.6);
        const x = b.pos.x + MAIN_LINE_BELTS.halfWidth + 0.4;
        const y = this.groundY(x, z) + 1.6;
        BEACON_RGB[1] = 0.42 + 0.2 * pulse;
        this.flash(x, y, z, 1.2 + 1.4 * pulse, BEACON_RGB, 0.1);
      }
    }
  }

  private leverLands(tock: Entity): void {
    this.beltsReverse();
    for (const a of TOCK_STACKS) {
      const s = this.at(tock, a);
      this.steam(s.x, s.y, s.z, 26, 1.8, { x: 0, y: 1, z: 0 }, 7);
    }
    const b = this.at(tock, A.tockBeacon);
    this.flash(b.x, b.y, b.z, 3.2, RGB_3, 0.35);
    this.ring(tock.pos.x, tock.pos.z, 9, 0.7, 0xffb347);
    this.shakeAt(tock.pos.x, tock.pos.z, 0.25);
  }

  private rivets(tock: Entity, target: Entity | undefined): void {
    const m = this.at(tock, A.tockRiveter);
    for (let k = 0; k < 3; k++) this.flash(m.x, m.y, m.z, 1.5, RGB_4, 0.12);
    this.puff(m.x, m.y, m.z, 10, {
      speed: 2,
      up: 0.6,
      life: 0.9,
      size: [0.5, 1.6],
      color: RGB_5,
      alpha: 0.5,
    });
    if (!target) return;
    const c = this.chest(target, this.q);
    // the rivets: three hot tracers hammering in
    for (let k = 0; k < 3; k++) {
      const s = this.spec;
      s.x = m.x;
      s.y = m.y;
      s.z = m.z;
      const t = 0.12;
      s.vx = (c.x - m.x) / t;
      s.vy = (c.y - m.y) / t;
      s.vz = (c.z - m.z) / t;
      s.ax = s.ay = s.az = 0;
      s.drag = 0.001;
      s.floor = -1e6;
      s.life = t;
      s.size0 = 0.35;
      s.size1 = 0.25;
      s.spin = 0;
      s.seed = this.rand();
      s.r = 1;
      s.g = 0.9;
      s.b = 0.6;
      s.a = 1;
      this.glow.emit(this.clock - k * 0.04, s);
    }
    this.sparks(c.x, c.y, c.z, 22, 6);
  }

  /** The sim's hit landed on strip `stripId`: pull that belt's carriage onto
   *  the tick that hurt and play the slam where the strip stood (the strip
   *  itself is already gone). */
  private pressLands(stripId: number | undefined, strip: Entity | undefined): void {
    const rig = this.pressRig;
    let i = -1;
    for (let k = 0; k < rig.length; k++) if (rig[k].at >= 0 && rig[k].stripId === stripId) i = k;
    if (i < 0) {
      // A strip this painter never saw (it arrived mid-warning): slam where it lies.
      if (strip) this.pressStrikes(strip.pos.x, strip.pos.z);
      return;
    }
    const c = rig[i];
    if (c.struck) return;
    c.struck = true;
    syncPressStrike(c, this.clock, TOCK_TUNING.pressWarning);
    this.pressStrikes(this.pressSpot[i].x, this.pressSpot[i].z);
  }

  /** The slam on the strip centred at (x, z): two shockwaves, a flash, dust
   *  walls thrown out from under both long edges, steam up the hammer's
   *  flanks and sparks off its ends. */
  private pressStrikes(x: number, z: number): void {
    const y = this.groundY(x, z);
    const w = HAMMER_HALF_WIDTH;
    const l = HAMMER_HALF_LENGTH;
    this.ring(x, z, 14, 0.75, 0xffd36a);
    this.ring(x, z, 8, 0.45, 0xffffff, 0.05);
    this.ring(x, z, 18, 1.1, 0xff8a3a, 0.12);
    this.flash(x, y + 0.6, z, 11, RGB_9, 0.2);
    this.flash(x, y + 1.4, z, 5, RGB_1, 0.32);
    for (const side of BELT_ENDS) {
      const out = side < 0 ? PRESS_DUST_WEST : PRESS_DUST_EAST;
      for (const k of PRESS_DUST_STATIONS)
        this.puff(x + side * w, y + 0.25, z + k * l, 10, {
          speed: 9,
          up: 0.7,
          life: 1.8,
          size: [1.1, 4.2],
          color: RGB_6,
          alpha: 0.62,
          dir: out,
          spread: 0.4,
        });
      this.steam(x + side * w, y + 0.8, z - l * 0.5, 12, 2.2, PRESS_STEAM_UP, 10);
      this.steam(x + side * w, y + 0.8, z + l * 0.5, 12, 2.2, PRESS_STEAM_UP, 10);
      this.sparks(x, y + 0.4, z + side * l, 44, 14);
      this.sparks(x + side * w, y + 0.4, z, 44, 14);
    }
    this.sparks(x, y + 0.4, z, 60, 16);
    this.shakeAt(x, z, 0.6);
  }

  private launchShell(boss: Entity, markId: number): void {
    const mark = this.world?.entities.get(markId);
    if (!mark) return;
    const s = this.shells.find((q) => !q.alive) ?? this.shells[0];
    // From the berm guns across the range (instance west, the -x side).
    const fx = mark.pos.x - 34 - 6 * this.rand();
    const fz = mark.pos.z + (this.rand() - 0.5) * 10;
    const fy = this.groundY(fx, fz) + 3.5;
    s.from.set(fx, fy, fz);
    s.to.set(mark.pos.x, this.groundY(mark.pos.x, mark.pos.z) + 0.4, mark.pos.z);
    s.born = this.clock;
    s.span = 0.6;
    s.apex = 9;
    s.objectId = markId;
    s.alive = true;
    this.objectPos.set(markId, { x: mark.pos.x, y: s.to.y, z: mark.pos.z });
    this.flash(fx, fy, fz, 3, RGB_7, 0.15);
    this.puff(fx, fy, fz, 8, {
      speed: 3,
      up: 0.8,
      life: 1.2,
      size: [0.9, 2.4],
      color: RGB_8,
      alpha: 0.6,
    });
    void boss;
  }

  private shellBursts(markId: number | undefined): void {
    if (markId === undefined) return;
    const at = this.objectPos.get(markId) ?? this.world?.entities.get(markId)?.pos;
    if (!at) return;
    const y = this.groundY(at.x, at.z);
    this.flash(at.x, y + 1, at.z, 5, RGB_9, 0.2);
    this.ring(at.x, at.z, 5.5, 0.45, 0xffe2a0);
    this.sparks(at.x, y + 0.5, at.z, 28, 10);
    this.puff(at.x, y + 0.3, at.z, 22, {
      speed: 4,
      up: 2.2,
      life: 1.8,
      size: [1, 3.2],
      color: RGB_10,
      alpha: 0.7,
    });
    this.shakeAt(at.x, at.z, 0.2);
  }

  private proofShot(boss: Entity, target: Entity | undefined): void {
    const m = this.at(boss, A.rangeProofMuzzle);
    this.flash(m.x, m.y, m.z, 5.5, RGB_11, 0.22);
    const dir = { x: Math.sin(boss.facing), y: 0.15, z: Math.cos(boss.facing) };
    this.puff(m.x, m.y, m.z, 30, {
      speed: 6,
      up: 0.8,
      life: 1.6,
      size: [1, 3.4],
      color: RGB_12,
      alpha: 0.65,
      dir,
      spread: 0.5,
    });
    this.sparks(m.x, m.y, m.z, 24, 12);
    if (target) {
      const c = this.chest(target, this.q);
      this.sparks(c.x, c.y, c.z, 30, 9);
      this.flash(c.x, c.y, c.z, 2.6, RGB_4, 0.16);
    }
    this.shakeAt(boss.pos.x, boss.pos.z, 0.35);
  }

  private drillDrones(boss: Entity): void {
    this.gesture(boss, RANGE_DRILL_DRONES);
    const r = this.at(boss, A.rangeRack);
    this.steam(r.x, r.y, r.z, 22, 2, { x: 0, y: 1, z: 0 }, 6);
    this.sparks(r.x, r.y, r.z, 20, 7, RGB_2);
  }

  private discharge(warden: Entity): void {
    this.gesture(warden, VOLTAIC_DISCHARGE);
    const c = this.chest(warden, this.p);
    this.flash(c.x, c.y, c.z, 9, RGB_13, 0.4);
    this.ring(warden.pos.x, warden.pos.z, 24, 0.9, ARC_WHITE);
    this.ring(warden.pos.x, warden.pos.z, 18, 0.7, ARC_BLUE, 0.08);
    for (const pl of this.players) {
      if (pl.dead || Math.hypot(pl.pos.x - warden.pos.x, pl.pos.z - warden.pos.z) > 32) continue;
      this.arcs.strike(this.clock, c, this.chest(pl, this.q), 0.45, ARC_WHITE, 0.32, 0.18);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + this.rand();
      const d = 8 + 10 * this.rand();
      this.q.x = c.x + Math.sin(a) * d;
      this.q.z = c.z + Math.cos(a) * d;
      this.q.y = this.groundY(this.q.x, this.q.z) + 0.2;
      this.arcs.strike(this.clock, c, this.q, 0.35, ARC_BLUE, 0.22, 0.25);
    }
    this.sparks(c.x, c.y, c.z, 50, 12, RGB_14);
    this.shakeAt(warden.pos.x, warden.pos.z, 0.4);
  }

  private lash(src: Entity, tgt: Entity): void {
    const from =
      src.templateId === VOLTAIC_WARDEN_ID
        ? this.at(src, A.wardenHandR, this.p)
        : this.chest(src, this.p);
    const to = this.chest(tgt, this.q);
    this.arcs.strike(this.clock, from, to, 0.5, ARC_WHITE, 0.3, 0.2);
    this.arcs.strike(this.clock, from, to, 0.35, ARC_BLUE, 0.18, 0.32);
    this.sparks(to.x, to.y, to.z, 24, 7, RGB_14);
    this.flash(to.x, to.y, to.z, 2.2, RGB_2, 0.2);
  }

  private coilStrike(mark: Entity | undefined): void {
    if (!mark) return;
    const x = mark.pos.x;
    const z = mark.pos.z;
    const y = this.groundY(x, z);
    this.q.x = x + 3;
    this.q.y = y + 34;
    this.q.z = z - 2;
    this.p.x = x;
    this.p.y = y + 0.2;
    this.p.z = z;
    this.arcs.strike(this.clock, this.q, this.p, 0.4, ARC_WHITE, 0.55, 0.12);
    this.arcs.strike(this.clock, this.q, this.p, 0.3, ARC_BLUE, 0.3, 0.2);
    this.flash(x, y + 1, z, 6, RGB_15, 0.25);
    this.ring(x, z, 4.5, 0.5, ARC_WHITE);
    this.sparks(x, y + 0.3, z, 30, 9, RGB_13);
    this.shakeAt(x, z, 0.3);
  }

  /** The brass fist meets the floor: dust and sparks where the model's fist
   *  struck, a heavier burst on the mark it was aimed at. */
  private fistLands(draft: Entity, mark: Entity | undefined): void {
    const f = this.at(draft, A.draftFist, this.p);
    this.sparks(f.x, f.y, f.z, 26, 9, RGB_13);
    this.steam(f.x, f.y, f.z, 10, 1.6);
    if (mark) {
      const y = this.groundY(mark.pos.x, mark.pos.z);
      this.sparks(mark.pos.x, y + 0.3, mark.pos.z, 30, 10, RGB_13);
    }
    this.shakeAt(draft.pos.x, draft.pos.z, 0.45);
  }

  /** It tears free: rivets and sparks off both feet, arcs snapping from the
   *  cable sockets in its back as the cables rip out. */
  private boltsShear(draft: Entity): void {
    for (const foot of DRAFT_FEET) {
      const f = this.at(draft, foot, this.p);
      this.sparks(f.x, f.y, f.z, 34, 11, RGB_13);
      this.steam(f.x, f.y, f.z, 6, 1.2);
    }
    const c = this.chest(draft, this.q);
    for (const plug of [A.draftPlugL, A.draftPlugR]) {
      const p = this.at(draft, plug, this.p);
      this.arcs.strike(this.clock, c, p, 0.4, ARC_WHITE, 0.24, 0.3);
      this.sparks(p.x, p.y, p.z, 20, 9, RGB_17);
    }
    this.shakeAt(draft.pos.x, draft.pos.z, 0.5);
  }

  private overloadStrikes(draft: Entity, hatch: Entity | undefined): void {
    const c = this.chest(draft, this.p);
    if (hatch) {
      this.q.x = hatch.pos.x;
      this.q.y = this.groundY(hatch.pos.x, hatch.pos.z) + 1.4;
      this.q.z = hatch.pos.z;
      this.arcs.strike(this.clock, this.q, c, 0.6, ARC_WHITE, 0.45, 0.15);
    }
    this.flash(c.x, c.y, c.z, 10, RGB_16, 0.5);
    this.sparks(c.x, c.y, c.z, 70, 14, RGB_17);
    this.shakeAt(draft.pos.x, draft.pos.z, 0.5);
  }

  private cellBlows(at: Entity, k: number): void {
    const c = this.chest(at, this.p);
    this.flash(c.x, c.y, c.z, 4 * k, RGB_14, 0.25);
    this.ring(at.pos.x, at.pos.z, 5 * k, 0.5, ARC_BLUE);
    this.sparks(c.x, c.y, c.z, Math.round(36 * k), 9, RGB_14);
  }

  private steamBlast(hauler: Entity): void {
    const dir = { x: Math.sin(hauler.facing), y: 0.08, z: Math.cos(hauler.facing) };
    for (const a of HAULER_NOZZLES) {
      const n = this.at(hauler, a);
      this.steam(n.x, n.y, n.z, 60, 3, dir, 16);
    }
    this.shakeAt(hauler.pos.x, hauler.pos.z, 0.35);
  }

  private scrapToss(hauler: Entity): void {
    // The mark appears on this same tick: pick it up on the next scan.
    const w = this.watchOf(hauler);
    w.castSeen = 'toss';
  }

  private launchPlate(hauler: Entity, mark: Entity): void {
    const s = this.plates.find((q) => !q.alive) ?? this.plates[0];
    const c = this.at(hauler, A.haulerClaw);
    s.from.set(c.x, c.y, c.z);
    s.to.set(mark.pos.x, this.groundY(mark.pos.x, mark.pos.z) + 0.3, mark.pos.z);
    // The crane lets go a third of the way into its windup; the plate lands
    // as the warning ends.
    s.born = this.clock + 0.8;
    s.span = HAULER_TUNING.tossWarning - 0.8;
    s.apex = 10;
    s.objectId = mark.id;
    s.alive = true;
    this.objectPos.set(mark.id, { x: s.to.x, y: s.to.y, z: s.to.z });
  }

  private plateLands(markId: number | undefined): void {
    if (markId === undefined) return;
    const at = this.objectPos.get(markId) ?? this.world?.entities.get(markId)?.pos;
    if (!at) return;
    const y = this.groundY(at.x, at.z);
    this.sparks(at.x, y + 0.4, at.z, 40, 10);
    this.ring(at.x, at.z, 5.5, 0.5, 0xffd36a);
    this.puff(at.x, y + 0.2, at.z, 26, {
      speed: 5,
      up: 0.6,
      life: 1.3,
      size: [0.9, 2.8],
      color: RGB_18,
      alpha: 0.6,
    });
    this.shakeAt(at.x, at.z, 0.3);
  }

  private boilerBurst(e: Entity, k: number, reach: number): void {
    const c =
      e.templateId === GANTRY_HAULER_ID ? this.at(e, A.haulerBoiler) : this.chest(e, this.p);
    this.flash(c.x, c.y, c.z, 6 * k, RGB_19, 0.3);
    this.steam(c.x, c.y, c.z, Math.round(70 * k), 2.6 * k, undefined, 9 * k);
    this.sparks(c.x, c.y, c.z, Math.round(40 * k), 10 * k);
    this.ring(e.pos.x, e.pos.z, reach, 0.7, 0xe9eef0);
    this.shakeAt(e.pos.x, e.pos.z, 0.25 * k);
  }

  private arcPop(e: Entity): void {
    const c = this.chest(e, this.p);
    this.flash(c.x, c.y, c.z, 2.6, RGB_14, 0.2);
    for (let k = 0; k < 4; k++) {
      const a = this.rand() * Math.PI * 2;
      this.q.x = c.x + Math.sin(a) * 3;
      this.q.z = c.z + Math.cos(a) * 3;
      this.q.y = this.groundY(this.q.x, this.q.z) + 0.1;
      this.arcs.strike(this.clock, c, this.q, 0.3, ARC_BLUE, 0.14, 0.3);
    }
    this.sparks(c.x, c.y, c.z, 18, 7, RGB_14);
  }

  // ---------------------------------------------------------------------- frame

  update(dt: number): void {
    const world = this.world;
    if (!world || this.disposed) return;
    this.clock += dt;
    this.uTime.value = this.clock;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = SCAN_SEC;
      this.scanWorld(world);
    }
    this.emitAcc += dt;
    const tick = this.emitAcc >= 0.08;
    if (tick) this.emitAcc = 0;
    for (const b of this.bosses) this.bossFrame(b, tick);
    this.paintTether();
    if (tick) this.cellsFrame();
    this.paintFlyers();
    this.paintHammers(tick);
    this.paintRings();
    this.arcs.steady = this.reducedMotion();
    this.arcs.update(this.clock);
    this.smoke.update(this.clock);
    this.glow.update(this.clock);
  }

  /** Rebuild the cached rosters only when membership changed (an entity came
   *  or went); the 10 Hz pass then reads auras and casts off the short lists. */
  private rebuildRoster(world: IWorld): void {
    this.rosterVersion = world.entityRosterVersion;
    this.bosses.length = 0;
    this.frames.length = 0;
    this.players.length = 0;
    this.cellObjects.length = 0;
    this.belts.length = 0;
    this.hatches.length = 0;
    this.fresh.length = 0;
    this.live.clear();
    for (const e of world.entities.values()) {
      if (e.kind === 'player') {
        this.players.push(e);
        continue;
      }
      const t = e.templateId;
      if (e.kind === 'mob') {
        if (
          t === TOCK_ID ||
          t === RANGEWARDEN_ID ||
          t === VOLTAIC_WARDEN_ID ||
          t === PRIME_DRAFT_ID ||
          t === GANTRY_HAULER_ID
        )
          this.bosses.push(e);
        else if (t === HALF_BUILT_FRAME_ID) this.frames.push(e);
        continue;
      }
      if (!t.startsWith('foundry_')) continue;
      if (t.startsWith('foundry_storm_cell')) this.cellObjects.push(e);
      else if (t.startsWith('foundry_belt_')) this.belts.push(e);
      else if (t.startsWith('foundry_hatch_')) this.hatches.push(e);
      else if (
        t === 'foundry_press_strip' ||
        t === FOUNDRY_SHELL_MARK ||
        t === FOUNDRY_SCRAP_MARK
      ) {
        this.live.add(e.id);
        if (!this.seenObjects.has(e.id)) {
          this.seenObjects.add(e.id);
          this.fresh.push(e);
        }
      }
    }
    for (const id of this.seenObjects) if (!this.live.has(id)) this.seenObjects.delete(id);
    for (const id of this.watch.keys()) if (!world.entities.has(id)) this.watch.delete(id);
    for (const id of this.draftGestures.keys())
      if (!world.entities.has(id)) this.draftGestures.delete(id);
    for (const id of this.lockStruck.keys())
      if (!world.entities.has(id)) this.lockStruck.delete(id);
    this.belts.sort((p, q) => p.pos.x - q.pos.x);
    for (const e of this.fresh) {
      if (e.templateId === 'foundry_press_strip') this.pressFor(e);
      else if (e.templateId === FOUNDRY_SCRAP_MARK) this.pairScrapMark(e);
    }
  }

  private scanWorld(world: IWorld): void {
    if (world.entityRosterVersion !== this.rosterVersion) this.rebuildRoster(world);
    this.carriers.length = 0;
    for (const p of this.players)
      if (!p.dead && hasAura(p, DRAFT_CELL_CARRY)) this.carriers.push(p);
    this.cells.length = 0;
    for (const c of this.cellObjects)
      if (c.templateId.startsWith('foundry_storm_cell')) this.cells.push(c);
    for (const b of this.bosses) this.bossGestures(b);
    for (const f of this.frames) this.frameGestures(f);
  }

  /** A press strip appeared: its belt's carriage leaves for the strip's rail
   *  stop (the strip's own position) and the strike's clock starts. */
  private pressFor(strip: Entity): void {
    const west = this.belts[0];
    if (!west) return;
    this.pressOriginX = west.pos.x - MAIN_LINE_BELTS.xs[0];
    this.pressOriginZ = west.pos.z - BELT_MID_Z;
    const i = pressBeltOf(strip.pos.x - this.pressOriginX);
    beginPressStrike(this.pressRig[i], strip.pos.z - this.pressOriginZ, this.clock, strip.id);
    const spot = this.pressSpot[i];
    spot.x = strip.pos.x;
    spot.y = this.groundY(strip.pos.x, strip.pos.z);
    spot.z = strip.pos.z;
  }

  /** Pose every carriage (its place on the rail, its hammer, its shadow) and
   *  dress the motion: wheel sparks while it slides, the brake's hiss as it
   *  parks, the ram venting through the wind-up. */
  private paintHammers(tick: boolean): void {
    const warning = TOCK_TUNING.pressWarning;
    const rig = this.pressRig;
    for (let i = 0; i < rig.length; i++) {
      const c = rig[i];
      const live = c.at >= 0;
      const t = this.clock - c.at;
      const pose = pressPoseInto(c, this.clock, warning, this.pressPose);
      const h = FOUNDRY_PRESS_HAMMERS[i];
      h.z = pose.z;
      h.drop = pose.drop;
      h.shadow = pose.shadow;
      if (!live) continue;
      const spot = this.pressSpot[i];
      // The slam's event never came (out of earshot): play it on the rig's clock.
      if (!c.struck && t >= warning) {
        c.struck = true;
        this.pressStrikes(spot.x, spot.z);
      }
      const z = this.pressOriginZ + pose.z;
      const railY = spot.y + PRESS_RAIL_Y;
      const was = this.pressMoving[i];
      this.pressMoving[i] = pose.moving;
      if (pose.moving !== 0) {
        if (!tick) continue;
        for (const side of BELT_ENDS)
          this.sparks(spot.x + side * 0.62, railY + 0.2, z - pose.moving * 1.1, 3, 4);
      } else if (was !== 0) {
        this.steam(spot.x, railY - 0.6, z, 16, 1.6, undefined, 5);
        this.sparks(spot.x, railY + 0.1, z, 14, 7);
      } else if (tick && pose.drop < 0) {
        this.steam(spot.x, railY - 3, z, 3, 1.1, undefined, 3);
      }
    }
  }

  private pairScrapMark(mark: Entity): void {
    let best: Entity | null = null;
    let bd = 60;
    for (const e of this.bosses) {
      if (e.templateId !== GANTRY_HAULER_ID || e.dead) continue;
      const d = Math.hypot(e.pos.x - mark.pos.x, e.pos.z - mark.pos.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) this.launchPlate(best, mark);
  }

  /** The Prime Draft's gestures (prime_draft_gesture_core.ts): its moorings,
   *  its hatch leaves, its stance and its overdrive beat, off mirrored state. */
  private draftGesturesFor(e: Entity): DraftGestures {
    let g = this.draftGestures.get(e.id);
    if (!g) {
      g = new DraftGestures();
      this.draftGestures.set(e.id, g);
    }
    let ring: 'closed' | 'warn' | 'open' | null = null;
    for (const h of this.hatches) ring = hatchStateOf(h.templateId) ?? ring;
    this.sendTo.id = e.id;
    g.step(
      {
        dead: e.dead,
        bolted: hasAura(e, DRAFT_BOLTED),
        inFight: e.inCombat,
        unbolting: e.castingAbility === DRAFT_UNBOLT,
        ring,
        overloaded: hasAura(e, DRAFT_OVERLOAD),
        overdrive: hasAura(e, DRAFT_ENRAGE),
      },
      this.clock,
      DRAFT_TUNING.hatchWarning,
      this.sendGesture,
    );
    return g;
  }

  private bossGestures(e: Entity): void {
    const w = this.watchOf(e);
    if (e.templateId === PRIME_DRAFT_ID) {
      this.draftGesturesFor(e);
      return;
    }
    if (e.dead) return;
    if (e.templateId === TOCK_ID) {
      const aura = e.auras?.find((a) => a.id === TOCK_PRESSURE);
      const level = e.castingAbility === TOCK_LEVER ? 8 : tockGaugeLevel(aura?.remaining);
      if (level !== w.gauge || this.clock - w.gaugeAt > GESTURE_REFRESH_SEC) {
        w.gauge = level;
        w.gaugeAt = this.clock;
        this.gesture(e, tockGaugeGesture(level));
      }
    } else if (e.templateId === VOLTAIC_WARDEN_ID) {
      let faces = voltaicFaces(e.auras, VOLTAIC_GROUNDED, VOLTAIC_CHARGED);
      // Mid flip, once the clip has pushed the plates out on their mounts,
      // they turn to the face the flip will leave them on (the aura follows
      // as the bar ends); a flip cut short turns them back.
      if (
        faces &&
        e.castingAbility === VOLTAIC_FLIP &&
        voltaicFlipTurned((e.castTotal ?? 0) - (e.castRemaining ?? 0))
      )
        faces = voltaicFlipped(faces);
      const g = faces
        ? voltaicPlateGesture(faces.front, faces.back)
        : voltaicPlateGesture('grounded', 'grounded');
      if (g !== w.faces || this.clock - w.facesAt > GESTURE_REFRESH_SEC) {
        w.faces = g;
        w.facesAt = this.clock;
        this.gesture(e, g);
      }
    }
    const cast = e.castingAbility ?? null;
    if (cast !== w.castSeen && w.castSeen !== 'toss') {
      if (cast === TOCK_LEVER) this.gesture(e, TOCK_GAUGE_RATTLE);
      if (cast === VOLTAIC_FLIP) this.gesture(e, VOLTAIC_PLATE_RATTLE);
      w.castSeen = cast;
    } else if (w.castSeen === 'toss') {
      w.castSeen = cast;
    }
  }

  private frameGestures(e: Entity): void {
    const w = this.watchOf(e);
    const booting = !e.dead && hasAura(e, FRAME_BOOTING);
    const g = booting ? FRAME_DORMANT_GESTURE : FRAME_AWAKE_GESTURE;
    if (g !== w.frame) {
      const first = w.frame === '';
      w.frame = g;
      // A frame met awake (streamed in late) just stays awake: no boot replay.
      if (!(first && !booting)) this.gesture(e, g);
      if (!first && !booting && !e.dead) {
        const c = this.chest(e, this.p);
        this.sparks(c.x, c.y, c.z, 24, 6, RGB_14);
        this.steam(c.x, c.y, c.z, 10, 1.2);
      }
    }
  }

  private bossFrame(e: Entity, tick: boolean): void {
    if (e.dead) return;
    switch (e.templateId) {
      case TOCK_ID: {
        if (!tick) return;
        this.beltAlarm();
        for (const a of TOCK_STACKS) {
          const s = this.at(e, a);
          this.puff(s.x, s.y, s.z, 1, {
            speed: 0.6,
            up: 1.6,
            life: 2.4,
            size: [0.5, 2.2],
            color: RGB_20,
            alpha: 0.35,
            drag: 0.8,
          });
        }
        if (e.castingAbility === TOCK_LEVER) {
          const b = this.at(e, A.tockBeacon);
          this.flash(b.x, b.y, b.z, 2.4 + Math.sin(this.clock * 18) * 0.8, RGB_21, 0.12);
          if (this.rand() < 0.5) this.steam(b.x, b.y - 0.6, b.z, 2, 0.9, { x: 0, y: 1, z: 0 }, 3);
        }
        if (e.castingAbility === TOCK_RIVET_GUN) {
          const m = this.at(e, A.tockRiveter);
          this.flash(m.x, m.y, m.z, 0.8, RGB_22, 0.1);
        }
        return;
      }
      case RANGEWARDEN_ID: {
        this.lockBeams(e);
        if (tick && e.castingAbility === RANGE_PROOF_SHOT) {
          const m = this.at(e, A.rangeProofMuzzle);
          const k = 1 - (e.castRemaining ?? 0) / Math.max(0.01, e.castTotal ?? 1);
          this.flash(m.x, m.y, m.z, 0.6 + 2 * k, RGB_4, 0.12);
          this.puff(m.x, m.y, m.z, 2, {
            speed: 3 + 3 * k,
            life: 0.4,
            size: [0.15, 0.04],
            color: RGB_4,
            alpha: 1,
            glow: true,
            dir: { x: 0, y: 0, z: 0 },
            spread: 1,
          });
        }
        return;
      }
      case VOLTAIC_WARDEN_ID: {
        if (!tick) return;
        const stored = e.auras?.find((a) => a.id === VOLTAIC_STORED);
        const bank = storedChargeFill(stored?.stacks, stored?.value2);
        const g = storedChargeGlow(bank);
        const charged = hasAura(e, VOLTAIC_CHARGED);
        const flipping = e.castingAbility === VOLTAIC_FLIP;
        const hue = charged ? ARC_BLUE : COPPER_GLOW;
        const tint = charged ? RGB_2 : RGB_23;
        if (this.rand() < g.arcChance + (flipping ? 0.6 : 0)) {
          const c = this.at(e, A.wardenCore, this.p);
          // Off the coil to the crown's toroid, or its spire while it flips.
          const tip = this.at(
            e,
            flipping && this.rand() < 0.4
              ? A.wardenCrownTip
              : this.rand() < 0.5
                ? A.wardenAntlerL
                : A.wardenAntlerR,
            this.q,
          );
          this.arcs.strike(this.clock, c, tip, 0.18, hue, g.width, 0.25);
        }
        // The bank on its body: a core light that swells, and arcs leaping
        // off the coil to the floor, farther and thicker as it builds.
        if (g.glow > 0) {
          const c = this.at(e, A.wardenCore, this.p);
          const beat = 1 + 0.12 * Math.sin(this.clock * (6 + 10 * bank));
          this.flash(c.x, c.y, c.z, g.glow * beat, tint, 0.14);
          for (let k = 0; k < g.floorArcs; k++) {
            if (this.rand() > 0.3 + 0.4 * bank) continue;
            const a = this.rand() * Math.PI * 2;
            const r = g.reach * (0.55 + 0.45 * this.rand());
            this.q.x = e.pos.x + Math.sin(a) * r;
            this.q.z = e.pos.z + Math.cos(a) * r;
            this.q.y = this.groundY(this.q.x, this.q.z) + 0.1;
            this.arcs.strike(
              this.clock,
              c,
              this.q,
              0.2,
              bank > 0.6 ? ARC_WHITE : hue,
              g.width,
              0.32,
            );
            if (bank > 0.4) this.sparks(this.q.x, this.q.y, this.q.z, 3, 5, tint);
          }
        }
        if (flipping || bank > 0.25) {
          const c = this.at(e, A.wardenCore, this.p);
          this.sparks(c.x, c.y, c.z, 2 + Math.round(5 * bank), 4 + 4 * bank, tint);
        }
        return;
      }
      case PRIME_DRAFT_ID: {
        if (!tick) return;
        if (hasAura(e, DRAFT_OVERLOAD)) {
          // the lightning cascade crawling over the colossus while it seizes
          const c = this.chest(e, this.p);
          const h = PRIME_DRAFT_MODEL.core.up * 1.25 * primeDraftModelScale(e.scale || 1);
          for (let k = 0; k < 2; k++) {
            const a = this.rand() * Math.PI * 2;
            this.q.x = e.pos.x + Math.sin(a) * 2.4 * (e.scale || 1) * 0.6;
            this.q.z = e.pos.z + Math.cos(a) * 2.4 * (e.scale || 1) * 0.6;
            this.q.y = e.pos.y + this.rand() * h;
            this.arcs.strike(this.clock, c, this.q, 0.22, ARC_WHITE, 0.2, 0.3);
          }
          this.sparks(this.q.x, this.q.y, this.q.z, 4, 6, RGB_17);
        }
        return;
      }
      case GANTRY_HAULER_ID: {
        if (!tick) return;
        const ch = this.at(e, A.haulerChimney);
        this.puff(ch.x, ch.y, ch.z, 2, {
          speed: 0.8,
          up: 2.4,
          life: 3,
          size: [0.9, 3.6],
          color: RGB_24,
          alpha: 0.42,
          drag: 0.7,
        });
        if (e.castingAbility === HAULER_STEAM_BLAST) {
          const dir = { x: Math.sin(e.facing), y: 0.05, z: Math.cos(e.facing) };
          for (const a of HAULER_NOZZLES) {
            const n = this.at(e, a);
            this.steam(n.x, n.y, n.z, 2, 0.8, dir, 3);
          }
        }
        return;
      }
      default:
        return;
    }
  }

  /** A thin red-white beam from the glass eye to every player it marked,
   *  re-struck as each one fades (never dragging a pooled arc it lost). */
  private lockBeams(boss: Entity): void {
    for (const pl of this.players) {
      if (pl.dead || !hasAura(pl, RANGE_TARGET_LOCK, boss.id)) continue;
      if (this.clock - (this.lockStruck.get(pl.id) ?? -1) < 0.25) continue;
      this.lockStruck.set(pl.id, this.clock);
      const eye = this.at(boss, A.rangeEye, this.p);
      this.arcs.strike(this.clock, eye, this.chest(pl, this.q), 0.32, 0xff5a4a, 0.05, 0.004);
    }
  }

  private cellsFrame(): void {
    for (const cell of this.cells) {
      const y = this.groundY(cell.pos.x, cell.pos.z);
      // a crackling battery: sparks and short arcs off it, a light pillar
      this.flash(cell.pos.x, y + 0.8, cell.pos.z, 1.6, RGB_25, 0.12);
      if (this.rand() < 0.5) {
        this.p.x = cell.pos.x;
        this.p.y = y + 0.8;
        this.p.z = cell.pos.z;
        const a = this.rand() * Math.PI * 2;
        this.q.x = cell.pos.x + Math.sin(a) * 1.6;
        this.q.z = cell.pos.z + Math.cos(a) * 1.6;
        this.q.y = y + 0.1;
        this.arcs.strike(this.clock, this.p, this.q, 0.12, ARC_BLUE, 0.07, 0.35);
      }
      this.puff(cell.pos.x, y + 0.5, cell.pos.z, 1, {
        speed: 0.4,
        up: 3,
        life: 1.2,
        size: [0.3, 0.05],
        color: RGB_26,
        alpha: 0.9,
        glow: true,
        drag: 0.5,
      });
    }
    for (const pl of this.carriers) {
      const aura = pl.auras?.find((a) => a.id === DRAFT_CELL_CARRY);
      const heat = Math.min(1, (aura?.stacks ?? 30) / 80);
      const yaw = pl.facing;
      this.p.x = pl.pos.x + Math.sin(yaw) * 0.7;
      this.p.y = pl.pos.y + 1.3;
      this.p.z = pl.pos.z + Math.cos(yaw) * 0.7;
      this.flash(this.p.x, this.p.y, this.p.z, 1.4 + heat, RGB_25, 0.12);
      if (this.rand() < 0.4 + 0.5 * heat) {
        const a = this.rand() * Math.PI * 2;
        this.q.x = pl.pos.x + Math.sin(a) * 0.5;
        this.q.z = pl.pos.z + Math.cos(a) * 0.5;
        this.q.y = pl.pos.y + 0.4 + this.rand() * 1.6;
        this.arcs.strike(this.clock, this.p, this.q, 0.12, ARC_WHITE, 0.06, 0.4);
      }
    }
    // The open hatch's gold breath of light: motes streaming up the beacon
    // (foundry_hatch_beacon.ts is the every-tier shaft), sparks dancing on
    // the ring's rim, the chest itself blazing.
    for (const b of this.bosses) {
      if (b.templateId !== PRIME_DRAFT_ID || b.dead) continue;
      for (const e of this.hatches) {
        if (e.templateId !== 'foundry_hatch_open') continue;
        const y = this.groundY(e.pos.x, e.pos.z);
        this.puff(e.pos.x, y + 0.3, e.pos.z, 4, {
          speed: 0.9,
          up: 7,
          life: 1.7,
          size: [0.45, 0.08],
          color: RGB_27,
          alpha: 0.95,
          glow: true,
        });
        const a = this.rand() * Math.PI * 2;
        const r = e.scale || 4;
        this.sparks(e.pos.x + Math.sin(a) * r, y + 0.2, e.pos.z + Math.cos(a) * r, 3, 3, RGB_27);
        this.flash(e.pos.x, y + 0.6, e.pos.z, 3.4, RGB_28, 0.14);
        const c = this.chest(b, this.q);
        this.flash(c.x, c.y, c.z, 4.2, RGB_28, 0.12);
        void HATCH_GOLD;
      }
    }
  }

  /** The Prime Draft's cable terminal follows its cables' far ends. */
  private paintTether(): void {
    let draft: Entity | null = null;
    for (const b of this.bosses)
      if (b.templateId === PRIME_DRAFT_ID && !b.dead) {
        draft = b;
        break;
      }
    const moored = draft ? (this.draftGestures.get(draft.id)?.moored ?? true) : false;
    this.tether.update(draft, moored, draft?.inCombat ?? false);
  }

  private paintFlyers(): void {
    for (const s of this.shells) this.paintFlyer(s, true);
    for (const s of this.plates) this.paintFlyer(s, false);
  }

  private paintFlyer(s: Flyer, shell: boolean): void {
    if (!s.alive) return;
    const t = (this.clock - s.born) / s.span;
    if (t < 0) {
      s.mesh.visible = false;
      return;
    }
    if (t >= 1) {
      s.alive = false;
      s.mesh.visible = false;
      return;
    }
    const x = s.from.x + (s.to.x - s.from.x) * t;
    const z = s.from.z + (s.to.z - s.from.z) * t;
    const y = s.from.y + (s.to.y - s.from.y) * t + shellArcLift(t, s.apex);
    const dx = s.to.x - s.from.x;
    const dz = s.to.z - s.from.z;
    const dy = s.to.y - s.from.y + s.apex * 4 * (1 - 2 * t);
    s.mesh.position.set(x, y, z);
    s.mesh.visible = true;
    if (shell) {
      s.mesh.lookAt(x + dx, y + dy, z + dz);
      // the smoking trail
      if (this.rand() < 0.8)
        this.puff(x, y, z, 1, {
          speed: 0.3,
          up: 0.4,
          life: 0.9,
          size: [0.5, 1.5],
          color: RGB_29,
          alpha: 0.5,
        });
      this.flash(x, y, z, 0.9, RGB_22, 0.06);
    } else {
      s.mesh.rotation.set(t * 7, Math.atan2(dx, dz), t * 3);
    }
  }

  private paintRings(): void {
    for (const r of this.rings) {
      if (!r.alive) continue;
      const t = (this.clock - r.born) / r.span;
      if (t < 0) continue;
      if (t >= 1) {
        r.alive = false;
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - t) ** 3;
      r.mesh.scale.setScalar(Math.max(0.01, r.reach * e));
      r.mat.uniforms.uAlpha.value = (1 - t) * 0.55;
      r.mesh.visible = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    // The gantry outlives this painter (it is the interior's): park it.
    for (const h of FOUNDRY_PRESS_HAMMERS) {
      h.drop = 0;
      h.shadow = 0;
    }
    this.smoke.dispose();
    this.glow.dispose();
    this.arcs.dispose();
    this.tether.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
