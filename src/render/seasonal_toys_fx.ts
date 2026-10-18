// Hester's toys' visual layer (sim: src/sim/seasonal/seasonal_toys.ts; the curves live in
// seasonal_toys_fx_core.ts), composed by ScarecrowFx (scarecrow_fx.ts), the Gourdlight Eve
// render layer the renderer already ticks and routes spellfxAt to:
//
//  - PRANKER'S PUMPKIN: a lit pumpkin lobbed end over end from the thrower's hand onto the
//    target's head, a sparkle trail behind it, then a SPLAT of pulp, seeds and a warm flash
//    (the head the target then wears is the Carved Pumpkin Head's own piece, drawn by the
//    character visual off the same aura: seasonal_head_core.ts);
//  - WANDERWISP LANTERN: a little iron lantern set down where it was used, its pale glass
//    lit by the wisp inside, and
//    a small translucent ghost circling its keeper at shoulder height, bobbing and leaning
//    into its turn, faint wisps streaming off its hem;
//  - SACK OF STARTLED BATS: a swarm of bats bursting up out of the sack in a tight spiral,
//    wings beating, then scattering out and away;
//  - MURMURWICK CANDLE: a cluster of green-flamed candles on an iron dish where it was lit,
//    a low green mist spreading over the ground round it and curling up off it, and its
//    whispers looping at the spot (the spatial audio sink's timed ground loop);
//  - SPARKBRISTLE PLAY BROOM: a straw broom swept to and fro at its user's side, bristles on
//    the ground, a trail of orange sparks left behind as they walk, a soft sweep each stride.
// Every look is cosmetic: nothing here is actionable, and a stealthed or dead body never
// draws one (a glowing toy where an unseen rogue walks would hand out what stealth hides).
//
// GPU work: one root group built on the first sight of a toy (a look on a body, or a toy's
// cue), attached through the world compile gate (attachSceneGroupGated); every pool is an
// InstancedMesh whose instances start hidden (scale 0) with their instance colours already
// set, so the gate links each program variant before its first real use, and an idle pool
// is hidden once its twin window is over. The thrown pumpkin is an instance of the decor
// kit's own small carved pumpkin (the instanced program variant the decor view links),
// behind its own gate since the kit can finish loading later. The glows are a small
// fixed pool of additive sprites. No light is added: the halos stand in for one. Particles
// ride the pooled point cloud (vfx.ts) through the boss layer's particle seam.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GOURDLIGHT_TOY_FX_PREFIX as TOY_FX_ABILITY_PREFIX } from '../sim/content/gourdlight_eve';
import type { SpatialAudioSink } from './audio_sink';
import { attachSceneGroupGated } from './gated_scene_attach';
import { gourdlightAssets } from './seasonal_decor_assets';
import {
  BAT_CAP,
  BAT_COUNT,
  BROOM_SWEEP_EVERY,
  BROOM_SWEEP_SFX,
  batFlight,
  broomPose,
  broomSparkRate,
  CANDLE_WHISPER_SFX,
  candleFlicker,
  candleMist,
  ghostOrbit,
  lookFade,
  PRANK_CAP,
  PRANK_FLIGHT_SEC,
  PRANK_SPLAT_SFX,
  prankArc,
  TOY_CAP,
  toyEffectOf,
} from './seasonal_toys_fx_core';

/** The pooled particle calls this layer uses (vfx.ts, through ScarecrowFx's seam). */
export interface ToyParticles {
  groundPuff(at: THREE.Vector3, power: number, color: number): void;
  toyMote(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    color: number,
    size: number,
    life: number,
    gravity: number,
    kind: 'glow' | 'spark' | 'smoke' | 'wisp' | 'debris',
    rate?: number,
    dt?: number,
  ): void;
}

interface ToyAuraLike {
  id: string;
  kind?: string;
  remaining?: number;
  duration?: number;
  value2?: number;
  value3?: number;
}

export interface ToyEntityLike {
  pos: { x: number; y: number; z: number };
  facing: number;
  dead: boolean;
  kind?: string;
  stealthed?: boolean;
  ghost?: boolean;
  mountKey?: string | null;
  auras?: readonly ToyAuraLike[];
}

interface ToyCueLike {
  fx: string;
  x: number;
  z: number;
  ability?: string;
  sourceId?: number;
  targetId?: number;
}

/** One toy look's per-body state (keyed by entity id and effect). */
interface LookState {
  born: number;
  seen: number;
  spotY: number;
  /** The bats' anchor (where the sack opened). */
  ax: number;
  ay: number;
  az: number;
  lastX: number;
  lastZ: number;
  speed: number;
  sweepAt: number;
  looped: boolean;
  phase: number;
}

interface Flight {
  sourceId: number;
  targetId: number;
  start: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const TWIN_SEC = 3;
const HALO_CAP = 24;
const BAT_COLOR = 0x1a1220;
/** The candle cluster's and the play broom's drawn size against their authored one. */
const CANDLE_SCALE = 1.6;
const BROOM_SCALE = 1.35;
const PULP = [0xff8a1a, 0xffb347, 0xe0761c, 0xfff0b0] as const;
const m4 = new THREE.Matrix4();
const q4 = new THREE.Quaternion();
const q5 = new THREE.Quaternion();
const q6 = new THREE.Quaternion();
const FWD = new THREE.Vector3(0, 0, 1);
const s4 = new THREE.Vector3();
const p4 = new THREE.Vector3();
const e4 = new THREE.Euler();
const v1 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(1, 1, 1);
const tint = new THREE.Color();

/** Paint a geometry one vertex colour per vertex from `fn(position)`. */
function paint(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => number[]): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [r, g, b] = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    col[i * 3] = r;
    col[i * 3 + 1] = g;
    col[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Merge parts that each carry position, normal, uv and color. */
function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = mergeGeometries(flat, false) ?? new THREE.BufferGeometry();
  for (const g of parts) g.dispose();
  for (const g of flat) g.dispose();
  out.computeBoundingSphere();
  return out;
}

/** The little ghost: a round head over a flowing body whose hem ripples, two soft dark
 *  eyes and an "o" of a mouth (dark, so the additive body shows them as holes), bright at
 *  the crown and fading to nothing at the hem. Its front faces +Z. */
function ghostGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const u = i / n; // 0 crown, 1 hem
    const y = 1 - u;
    const r =
      u < 0.32
        ? 0.3 * Math.sin((u / 0.32) * (Math.PI / 2)) ** 0.8
        : 0.3 + 0.1 * ((u - 0.32) / 0.68) ** 1.4 - 0.025 * Math.sin((u - 0.32) * 9);
    pts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  const geo = new THREE.LatheGeometry(pts, 48);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y < 0.25) {
      // the hem: a scalloped ripple, longer tails swept back
      const a = Math.atan2(x, z);
      const k = (0.25 - y) / 0.25;
      pos.setY(i, y - k * (0.07 * Math.sin(a * 6) + 0.05 + 0.06 * Math.max(0, -Math.cos(a))));
    }
  }
  geo.computeVertexNormals();
  const eye = (x: number, y: number, z: number, cx: number, cy: number, rx: number, ry: number) => {
    if (z < 0.1) return 1;
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    const d = Math.sqrt(dx * dx + dy * dy);
    return Math.min(1, Math.max(0, (d - 0.65) / 0.35));
  };
  paint(geo, (x, y, z) => {
    const holes =
      eye(x, y, z, -0.1, 0.8, 0.055, 0.075) *
      eye(x, y, z, 0.1, 0.8, 0.055, 0.075) *
      eye(x, y, z, 0, 0.64, 0.05, 0.055);
    const lift = Math.min(1, Math.max(0, (y + 0.05) / 0.95)) ** 0.9;
    const rim = 0.55 + 0.45 * lift;
    return [0.62 * rim * holes, 0.82 * rim * holes, 1.0 * rim * holes];
  });
  return geo;
}

/** A bat's body (a dark furred spindle with two pointed ears), front +Z. */
function batBodyGeometry(): THREE.BufferGeometry {
  const body = new THREE.SphereGeometry(0.07, 10, 8);
  body.scale(0.8, 0.75, 1.5);
  const earL = new THREE.ConeGeometry(0.025, 0.07, 4);
  earL.translate(-0.03, 0.07, 0.07);
  const earR = new THREE.ConeGeometry(0.025, 0.07, 4);
  earR.translate(0.03, 0.07, 0.07);
  return merged(
    [body, earL, earR].map((g) => {
      paint(g, () => [1, 1, 1]);
      return g;
    }),
  );
}

/** One bat wing (+X side; the left is its mirror): a membrane stretched over three finger
 *  bones with a scalloped trailing edge, hinged at the body (x = 0). */
function batWingGeometry(side: 1 | -1): THREE.BufferGeometry {
  // leading edge points, then the scallops' points on the trailing edge
  const lead = [
    [0.04, 0.0, 0.05],
    [0.18, 0.04, 0.06],
    [0.32, 0.02, 0.02],
    [0.42, -0.01, -0.03],
  ];
  const trail = [
    [0.04, 0.0, -0.06],
    [0.14, -0.01, -0.1],
    [0.24, 0.0, -0.08],
    [0.33, -0.01, -0.11],
    [0.42, -0.01, -0.03],
  ];
  const v: number[] = [];
  const tri = (a: number[], b: number[], c: number[]) => {
    for (const p of [a, b, c]) v.push(p[0] * side, p[1], p[2]);
  };
  tri(lead[0], trail[0], trail[1]);
  tri(lead[0], trail[1], lead[1]);
  tri(lead[1], trail[1], trail[2]);
  tri(lead[1], trail[2], lead[2]);
  tri(lead[2], trail[2], trail[3]);
  tri(lead[2], trail[3], lead[3]);
  tri(lead[3], trail[3], trail[4]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.computeVertexNormals();
  return geo;
}

/** The play broom: a turned wooden handle, two orange bindings and a flared bundle of
 *  straw whose strands are ridged and frayed at the tip. Bristle tip at y = 0, the handle
 *  running up +Y to its knob. */
function broomGeometry(): THREE.BufferGeometry {
  const handle = new THREE.CylinderGeometry(0.02, 0.024, 1.08, 8, 1);
  handle.translate(0, 0.36 + 0.54, 0);
  paint(handle, (_x, y) => {
    const k = 0.75 + 0.25 * Math.sin(y * 22);
    return [0.42 * k, 0.26 * k, 0.13 * k];
  });
  const knob = new THREE.SphereGeometry(0.035, 8, 6);
  knob.translate(0, 1.45, 0);
  paint(knob, () => [0.36, 0.21, 0.1]);
  const bandA = new THREE.CylinderGeometry(0.062, 0.062, 0.035, 12, 1);
  bandA.translate(0, 0.37, 0);
  paint(bandA, () => [0.95, 0.42, 0.06]);
  const bandB = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12, 1);
  bandB.translate(0, 0.28, 0);
  paint(bandB, () => [0.85, 0.32, 0.04]);
  const straw = new THREE.CylinderGeometry(0.055, 0.17, 0.4, 28, 6, true);
  straw.translate(0, 0.2, 0);
  const sp = straw.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const y = sp.getY(i);
    const z = sp.getZ(i);
    const a = Math.atan2(x, z);
    const ridge = 1 + 0.12 * Math.sin(a * 14) * (1 - y / 0.4);
    const fray = y < 0.03 ? 0.02 * Math.sin(a * 23) : 0;
    sp.setXYZ(i, x * ridge, y + fray, z * ridge);
  }
  straw.computeVertexNormals();
  paint(straw, (x, y, z) => {
    const a = Math.atan2(x, z);
    const k = 0.78 + 0.22 * Math.sin(a * 14 + 1.3);
    const tip = 0.7 + 0.3 * Math.min(1, y / 0.25);
    return [0.92 * k * tip, 0.7 * k * tip, 0.34 * k * tip];
  });
  const core = new THREE.CylinderGeometry(0.04, 0.12, 0.38, 12, 1);
  core.translate(0, 0.21, 0);
  paint(core, () => [0.6, 0.45, 0.2]);
  return merged([handle, knob, bandA, bandB, straw, core]);
}

/** The Wanderwisp Lantern's frame: a small square iron lantern on a footed base, four
 *  corner posts, a peaked cap and a carrying ring. Its pale glass and the wisp inside are
 *  the glow pool's (lanternGlowGeometry). Base at y = 0. */
function lanternFrameGeometry(): THREE.BufferGeometry {
  const iron = () => [0.11, 0.1, 0.12];
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.BoxGeometry(0.26, 0.04, 0.26);
  base.translate(0, 0.02, 0);
  parts.push(base);
  const foot = new THREE.BoxGeometry(0.2, 0.03, 0.2);
  foot.translate(0, 0.055, 0);
  parts.push(foot);
  for (const [x, z] of [
    [-0.1, -0.1],
    [0.1, -0.1],
    [-0.1, 0.1],
    [0.1, 0.1],
  ]) {
    const post = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5, 1);
    post.translate(x, 0.07 + 0.15, z);
    parts.push(post);
  }
  const rail = new THREE.BoxGeometry(0.23, 0.025, 0.23);
  rail.translate(0, 0.37, 0);
  parts.push(rail);
  const cap = new THREE.ConeGeometry(0.19, 0.14, 4, 1);
  cap.rotateY(Math.PI / 4);
  cap.translate(0, 0.45, 0);
  parts.push(cap);
  const ring = new THREE.TorusGeometry(0.05, 0.01, 5, 14);
  ring.translate(0, 0.56, 0);
  parts.push(ring);
  for (const g of parts) paint(g, iron);
  return merged(parts);
}

/** The lantern's glass and the wisp inside it: a pale pane box, brightest at its heart,
 *  and a small soft flame (additive: the glow pool's material). */
function lanternGlowGeometry(): THREE.BufferGeometry {
  const pane = new THREE.BoxGeometry(0.18, 0.28, 0.18, 2, 3, 2);
  pane.translate(0, 0.22, 0);
  paint(pane, (_x, y) => {
    const k = 1 - Math.min(1, Math.abs(y - 0.22) / 0.16) * 0.5;
    return [0.12 * k, 0.26 * k, 0.36 * k];
  });
  const wisp = new THREE.SphereGeometry(0.05, 10, 8);
  wisp.scale(1, 1.5, 1);
  wisp.translate(0, 0.21, 0);
  paint(wisp, () => [0.7, 0.92, 1.0]);
  return merged([pane, wisp]);
}

/** The Murmurwick candles: three pale grey-green wax candles of different heights on an
 *  old iron dish, drips frozen down their sides, black wicks. Flames ride the flame pool. */
const CANDLE_TOPS: readonly [number, number, number][] = [
  [0, 0.34, 0.012],
  [0.12, 0.2, -0.05],
  [-0.09, 0.16, 0.08],
];
function candleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const dish = new THREE.CylinderGeometry(0.26, 0.22, 0.04, 24, 1);
  dish.translate(0, 0.02, 0);
  paint(dish, () => [0.1, 0.09, 0.085]);
  parts.push(dish);
  const rim = new THREE.TorusGeometry(0.25, 0.015, 6, 24);
  rim.rotateX(Math.PI / 2);
  rim.translate(0, 0.04, 0);
  paint(rim, () => [0.16, 0.14, 0.12]);
  parts.push(rim);
  CANDLE_TOPS.forEach(([x, h, z], k) => {
    const r = k === 0 ? 0.06 : 0.045;
    const wax = new THREE.CylinderGeometry(r * 0.92, r, h, 14, 4);
    const wp = wax.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < wp.count; i++) {
      const vx = wp.getX(i);
      const vz = wp.getZ(i);
      const vy = wp.getY(i);
      const a = Math.atan2(vx, vz);
      const drip = 1 + 0.09 * Math.max(0, Math.sin(a * 5 + k)) * (0.5 - vy / h);
      wp.setXYZ(i, vx * drip, vy, vz * drip);
    }
    wax.computeVertexNormals();
    wax.translate(x, 0.04 + h / 2, z);
    paint(wax, (_x, y) => {
      const k2 = 0.8 + 0.2 * Math.min(1, (y - 0.04) / h);
      return [0.66 * k2, 0.72 * k2, 0.58 * k2];
    });
    parts.push(wax);
    const wick = new THREE.CylinderGeometry(0.006, 0.006, 0.04, 4, 1);
    wick.translate(x, 0.04 + h + 0.015, z);
    paint(wick, () => [0.04, 0.035, 0.03]);
    parts.push(wick);
  });
  return merged(parts);
}

/** A candle flame: a teardrop, white-hot at its root, cold green to its tip (additive). */
function flameGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 10, 8);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const sh = 1 - 0.7 * Math.max(0, y);
    p.setXYZ(i, p.getX(i) * 0.032 * sh, 0.05 + y * 0.075 + 0.02 * y * y, p.getZ(i) * 0.032 * sh);
  }
  paint(g, (_x, y) => {
    const k = Math.min(1, Math.max(0, (y - 0.0) / 0.12));
    return [0.55 - 0.4 * k, 1.0 - 0.15 * k, 0.6 - 0.35 * k];
  });
  return g;
}

/** The mist's alpha: a soft disc broken into drifting curls (grey on opaque black: an
 *  alpha map reads the green channel). Deterministic: a fixed pattern, no random. */
function mistTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const mid = size / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 46; i++) {
      const a = i * 2.39996;
      const r = Math.sqrt((i + 0.5) / 46) * mid * 0.8;
      const x = mid + Math.cos(a) * r;
      const y = mid + Math.sin(a) * r;
      const rad = 14 + ((i * 37) % 23);
      const c = ctx.createRadialGradient(x, y, 0, x, y, rad);
      c.addColorStop(0, 'rgba(255,255,255,0.35)');
      c.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = c;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** A soft round halo (white on transparent, tinted per use). */
function haloTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const mid = size / 2;
    const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/** An instanced pool with every instance hidden and coloured before its first link. */
function pool(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  cap: number,
  name: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  for (let i = 0; i < cap; i++) {
    mesh.setMatrixAt(i, HIDDEN);
    mesh.setColorAt(i, WHITE);
  }
  mesh.frustumCulled = false;
  mesh.name = name;
  return mesh;
}

/** A kit-part pool (the decor kit's small carved pumpkin, the one the prank throws): one InstancedMesh per part
 *  over the kit's own geometry and materials, behind its own gate. */
class KitPool {
  meshes: THREE.InstancedMesh[] | null = null;
  private parts: unknown = null;
  private group: THREE.Group | null = null;
  private ready = false;
  used = 0;

  constructor(
    private readonly node: 'pumpkin_small',
    private readonly cap: number,
    private readonly gate: ((t: THREE.Object3D) => Promise<unknown>) | undefined,
    private readonly disposed: () => boolean,
  ) {}

  /** The pool when linked, else null (the first ask builds it once the kit is loaded). */
  take(root: THREE.Object3D | null): THREE.InstancedMesh[] | null {
    const parts = gourdlightAssets()?.decor[this.node];
    if (this.meshes && parts === this.parts) return this.ready ? this.meshes : null;
    this.release();
    if (!parts || parts.length === 0 || !root) return null;
    const group = new THREE.Group();
    group.name = `seasonal-toys-${this.node}`;
    this.meshes = parts.map((part) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, this.cap);
      for (let i = 0; i < this.cap; i++) mesh.setMatrixAt(i, HIDDEN);
      mesh.frustumCulled = false;
      group.add(mesh);
      return mesh;
    });
    this.parts = parts;
    this.group = group;
    const mine = group;
    const retired = () => this.disposed() || this.group !== mine;
    void attachSceneGroupGated(root, group, this.gate, retired)
      .then(() => {
        if (!retired()) this.ready = true;
      })
      .catch(() => {});
    return null;
  }

  place(index: number, matrix: THREE.Matrix4): void {
    if (!this.meshes) return;
    for (const m of this.meshes) m.setMatrixAt(index, matrix);
  }

  /** Hide the instances past `used` and flag the buffers for upload. */
  finish(twins: boolean): void {
    if (!this.meshes || !this.ready) return;
    for (const m of this.meshes) {
      for (let i = this.used; i < this.cap; i++) m.setMatrixAt(i, HIDDEN);
      m.instanceMatrix.needsUpdate = true;
      m.visible = twins || this.used > 0;
    }
  }

  release(): void {
    if (this.meshes) for (const m of this.meshes) m.dispose();
    this.group?.removeFromParent();
    this.meshes = null;
    this.group = null;
    this.parts = null;
    this.ready = false;
  }
}

export class SeasonalToysFx {
  private root: THREE.Group | null = null;
  private rootBorn = 0;
  private time = 0;
  private dt = 1 / 60;
  private frame = 0;
  private reduced = false;
  private disposed = false;
  private readonly owned: { dispose(): void }[] = [];
  private ghosts: THREE.InstancedMesh | null = null;
  private bats: THREE.InstancedMesh[] = [];
  private brooms: THREE.InstancedMesh | null = null;
  private candles: THREE.InstancedMesh | null = null;
  private flames: THREE.InstancedMesh | null = null;
  private mists: THREE.InstancedMesh | null = null;
  private halos: THREE.Sprite[] = [];
  private ghostsUsed = 0;
  private batsUsed = 0;
  private broomsUsed = 0;
  private candlesUsed = 0;
  private flamesUsed = 0;
  private mistsUsed = 0;
  private halosUsed = 0;
  private lanternFrames: THREE.InstancedMesh | null = null;
  private lanternGlows: THREE.InstancedMesh | null = null;
  private lanternsUsed = 0;
  private readonly pumpkins: KitPool;
  private readonly looks = new Map<string, LookState>();
  private readonly flights: Flight[] = [];
  private readonly at = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly particles: ToyParticles,
    private readonly groundY: (x: number, z: number) => number,
    private readonly entity: (id: number) => ToyEntityLike | undefined,
    private readonly compileGate?: (target: THREE.Object3D) => Promise<unknown>,
    private readonly audio: () => SpatialAudioSink | null = () => null,
  ) {
    const gone = () => this.disposed;
    this.pumpkins = new KitPool('pumpkin_small', PRANK_CAP, compileGate, gone);
  }

  /** Whether a spellfxAt cue is a toy's (this layer claims it: no generic burst). */
  static claims(ability: string | undefined): boolean {
    return ability?.startsWith(TOY_FX_ABILITY_PREFIX) === true;
  }

  /** Built on the first sight of a toy: a world that never plays one links nothing. */
  private ensureRoot(): THREE.Group {
    if (this.root) return this.root;
    const root = new THREE.Group();
    root.name = 'seasonal-toys-fx';
    const own = <T extends { dispose(): void }>(x: T): T => {
      this.owned.push(x);
      return x;
    };
    const ghostMat = own(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.ghosts = pool(own(ghostGeometry()), ghostMat, TOY_CAP, 'seasonal-toys-ghosts');
    root.add(this.ghosts);
    const batMat = own(new THREE.MeshBasicMaterial({ color: BAT_COLOR, side: THREE.DoubleSide }));
    const bodyGeo = own(batBodyGeometry());
    this.bats = [
      pool(bodyGeo, batMat, BAT_CAP, 'seasonal-toys-bat-bodies'),
      pool(own(batWingGeometry(-1)), batMat, BAT_CAP, 'seasonal-toys-bat-wings-l'),
      pool(own(batWingGeometry(1)), batMat, BAT_CAP, 'seasonal-toys-bat-wings-r'),
    ];
    for (const m of this.bats) root.add(m);
    const lambert = own(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.brooms = pool(own(broomGeometry()), lambert, TOY_CAP, 'seasonal-toys-brooms');
    root.add(this.brooms);
    this.candles = pool(own(candleGeometry()), lambert, TOY_CAP, 'seasonal-toys-candles');
    root.add(this.candles);
    this.lanternFrames = pool(
      own(lanternFrameGeometry()),
      lambert,
      TOY_CAP,
      'seasonal-toys-lanterns',
    );
    root.add(this.lanternFrames);
    const flameMat = own(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.flames = pool(own(flameGeometry()), flameMat, TOY_CAP * 3, 'seasonal-toys-flames');
    root.add(this.flames);
    this.lanternGlows = pool(
      own(lanternGlowGeometry()),
      flameMat,
      TOY_CAP,
      'seasonal-toys-lantern-glows',
    );
    root.add(this.lanternGlows);
    const mistTex = mistTexture();
    if (mistTex) own(mistTex);
    const mistMat = own(
      new THREE.MeshBasicMaterial({
        color: 0x4cff7a,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        alphaMap: mistTex ?? undefined,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    const mistGeo = own(new THREE.CircleGeometry(1, 40));
    mistGeo.rotateX(-Math.PI / 2);
    this.mists = pool(mistGeo, mistMat, TOY_CAP, 'seasonal-toys-mists');
    root.add(this.mists);
    const halo = haloTexture();
    if (halo) own(halo);
    for (let i = 0; i < HALO_CAP; i++) {
      const sprite = new THREE.Sprite(
        own(
          new THREE.SpriteMaterial({
            map: halo ?? undefined,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            opacity: 0,
          }),
        ),
      );
      sprite.visible = i === 0; // the program twin (opacity 0)
      sprite.scale.setScalar(0.001);
      root.add(sprite);
      this.halos.push(sprite);
    }
    this.root = root;
    this.rootBorn = this.time;
    void attachSceneGroupGated(this.scene, root, this.compileGate, () => this.disposed).catch(
      () => {},
    );
    return root;
  }

  /** A toy's moment (the sim's spellfxAt cue). True: claimed, no generic burst. */
  handleCue(ev: ToyCueLike): boolean {
    if (this.disposed || !SeasonalToysFx.claims(ev.ability)) return false;
    this.ensureRoot();
    const effect = ev.ability?.slice(TOY_FX_ABILITY_PREFIX.length);
    const y = this.groundY(ev.x, ev.z);
    const src = ev.sourceId !== undefined ? this.entity(ev.sourceId) : undefined;
    if (src && !this.drawable(src)) return true;
    const sy = src ? src.pos.y : y;
    if (effect === 'prank' && ev.sourceId !== undefined && ev.targetId !== undefined) {
      if (this.flights.length >= PRANK_CAP) this.flights.shift();
      const from = new THREE.Vector3(
        (src?.pos.x ?? ev.x) + Math.sin(src?.facing ?? 0) * 0.35,
        sy + 1.55,
        (src?.pos.z ?? ev.z) + Math.cos(src?.facing ?? 0) * 0.35,
      );
      this.flights.push({
        sourceId: ev.sourceId,
        targetId: ev.targetId,
        start: this.time,
        from,
        to: new THREE.Vector3(ev.x, y + 1.85, ev.z),
      });
    } else if (effect === 'lantern') {
      for (let i = 0; i < 14; i++) {
        const a = i * 0.45;
        this.particles.toyMote(
          ev.x,
          sy + 0.3,
          ev.z,
          Math.cos(a) * 0.9,
          0.9 + (i % 4) * 0.3,
          Math.sin(a) * 0.9,
          0xbfe6ff,
          0.35,
          1.3,
          -0.3,
          'wisp',
        );
      }
    } else if (effect === 'bats') {
      this.particles.groundPuff(this.at.set(ev.x, sy, ev.z), 0.6, 0x2a2230);
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63;
        this.particles.toyMote(
          ev.x,
          sy + 1.0,
          ev.z,
          Math.cos(a) * 1.4,
          1.6,
          Math.sin(a) * 1.4,
          0x3a2a40,
          0.22,
          0.9,
          1.5,
          'debris',
        );
      }
    } else if (effect === 'candle') {
      for (let i = 0; i < 18; i++) {
        const a = i * 0.35;
        this.particles.toyMote(
          ev.x,
          sy + 0.35,
          ev.z,
          Math.cos(a) * 1.1,
          0.6 + (i % 3) * 0.4,
          Math.sin(a) * 1.1,
          i % 3 === 0 ? 0xd8ffd0 : 0x55ff7a,
          0.3,
          1.1,
          -0.2,
          'glow',
        );
      }
      this.particles.groundPuff(this.at.set(ev.x, sy, ev.z), 0.8, 0x2f7a3e);
    } else if (effect === 'broom') {
      for (let i = 0; i < 22; i++) {
        const a = i * 0.29;
        this.particles.toyMote(
          ev.x,
          sy + 0.2,
          ev.z,
          Math.cos(a) * 2.2,
          1.4 + (i % 4) * 0.5,
          Math.sin(a) * 2.2,
          i % 3 === 0 ? 0xffd27a : 0xff7a1e,
          0.16,
          0.8,
          4.5,
          'spark',
        );
      }
    }
    return true;
  }

  /** Before the frame's entity scan. */
  begin(dt: number, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.time += dt;
    this.dt = dt;
    this.frame++;
    this.reduced = reducedMotion;
    this.ghostsUsed = 0;
    this.batsUsed = 0;
    this.broomsUsed = 0;
    this.candlesUsed = 0;
    this.flamesUsed = 0;
    this.mistsUsed = 0;
    this.halosUsed = 0;
    this.lanternsUsed = 0;
    this.pumpkins.used = 0;
  }

  /** Per entity, per frame (ScarecrowFx's scan): its toy looks, if any. Allocation-free
   *  for a body wearing none. */
  watch(e: ToyEntityLike, id: number): void {
    if (this.disposed || e.kind !== 'player' || !e.auras || e.auras.length === 0) return;
    for (const a of e.auras) {
      if (a.kind !== 'seasonal_cosmetic') continue;
      const effect = toyEffectOf(a.id);
      if (!effect || effect === 'prank') continue;
      if (!this.drawable(e)) return;
      this.ensureRoot();
      const key = `${id}:${effect}`;
      const remaining = Math.max(0, a.remaining ?? 0);
      const elapsed = Math.max(0, (a.duration ?? 0) - remaining);
      let st = this.looks.get(key);
      if (!st) {
        const sx = a.value2 ?? e.pos.x;
        const sz = a.value3 ?? e.pos.z;
        const near = Math.hypot(sx - e.pos.x, sz - e.pos.z) < 4;
        st = {
          born: this.time - elapsed,
          seen: this.frame,
          spotY: near ? e.pos.y : this.groundY(sx, sz),
          ax: e.pos.x,
          ay: e.pos.y,
          az: e.pos.z,
          lastX: e.pos.x,
          lastZ: e.pos.z,
          speed: 0,
          sweepAt: this.time + BROOM_SWEEP_EVERY,
          looped: false,
          phase: (id % 97) * 0.37,
        };
        this.looks.set(key, st);
      }
      st.seen = this.frame;
      const fade = lookFade(elapsed, remaining);
      if (effect === 'lantern') this.drawLantern(e, a, st, fade);
      else if (effect === 'bats') this.drawBats(st, a.duration ?? 6);
      else if (effect === 'candle') this.drawCandle(id, a, st, fade, remaining);
      else if (effect === 'broom') this.drawBroom(e, st, fade);
    }
  }

  /** After the scan: the flights, the stale looks, and every pool's unused tail. */
  end(): void {
    if (this.disposed) return;
    this.updateFlights();
    for (const [key, st] of this.looks) {
      if (st.seen === this.frame) continue;
      // a candle snuffed early (right-click, the event closing): its whispers stop too
      if (st.looped) {
        const id = key.slice(0, key.indexOf(':'));
        this.audio()?.timedGroundLoop(`murmurwick-${id}`, CANDLE_WHISPER_SFX, 0, 0, 0, 0.01);
      }
      this.looks.delete(key);
    }
    if (!this.root) return;
    const twins = this.time - this.rootBorn < TWIN_SEC;
    const tail = (m: THREE.InstancedMesh | null, used: number) => {
      if (!m) return;
      for (let i = used; i < m.count; i++) m.setMatrixAt(i, HIDDEN);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.visible = twins || used > 0;
    };
    tail(this.ghosts, this.ghostsUsed);
    for (const m of this.bats) tail(m, this.batsUsed);
    tail(this.brooms, this.broomsUsed);
    tail(this.candles, this.candlesUsed);
    tail(this.flames, this.flamesUsed);
    tail(this.mists, this.mistsUsed);
    tail(this.lanternFrames, this.lanternsUsed);
    tail(this.lanternGlows, this.lanternsUsed);
    this.pumpkins.finish(twins);
    for (let i = this.halosUsed; i < this.halos.length; i++) {
      const s = this.halos[i];
      (s.material as THREE.SpriteMaterial).opacity = 0;
      s.scale.setScalar(0.001);
      s.visible = twins && i === 0;
    }
  }

  /** A body this layer may dress: alive, seen, and not hidden in stealth. */
  private drawable(e: ToyEntityLike): boolean {
    return !e.dead && !e.ghost && !e.stealthed;
  }

  private halo(x: number, y: number, z: number, size: number, opacity: number, color: number) {
    if (this.halosUsed >= this.halos.length) return;
    const s = this.halos[this.halosUsed++];
    s.visible = true;
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    const m = s.material as THREE.SpriteMaterial;
    m.opacity = opacity;
    m.color.setHex(color);
  }

  private drawLantern(e: ToyEntityLike, a: ToyAuraLike, st: LookState, fade: number): void {
    const t = this.time - st.born;
    // the lantern where it was set down
    const lx = a.value2 ?? e.pos.x;
    const lz = a.value3 ?? e.pos.z;
    const ly = st.spotY;
    const flick = candleFlicker(this.time, st.phase);
    if (this.lanternFrames && this.lanternGlows && this.lanternsUsed < TOY_CAP) {
      const grow = Math.min(1, t / 0.35);
      m4.compose(p4.set(lx, ly, lz), q4.setFromAxisAngle(UP, st.phase), s4.setScalar(1.5 * grow));
      const i = this.lanternsUsed++;
      this.lanternFrames.setMatrixAt(i, m4);
      this.lanternGlows.setMatrixAt(i, m4);
      this.lanternGlows.setColorAt(i, tint.setScalar(fade * (0.75 + 0.25 * flick)));
    }
    this.halo(lx, ly + 0.36, lz, 1.4 * flick, 0.5 * fade, 0x9fd8ff);
    this.halo(lx, ly + 0.06, lz, 2.4, 0.16 * fade, 0x6fb8ff);
    // the ghost circling its keeper
    if (!this.ghosts || this.ghostsUsed >= TOY_CAP) return;
    const o = ghostOrbit(t, st.phase);
    const gx = e.pos.x + o.x;
    const gy = e.pos.y + o.y;
    const gz = e.pos.z + o.z;
    const out = Math.min(1, t / 0.8);
    // it faces half along its path and half out from its keeper, so its face reads
    e4.set(0.25 * Math.sin(t * 1.7), o.yaw - 0.8, -0.22);
    q4.setFromEuler(e4);
    const breathe = 1 + 0.05 * Math.sin(t * 3.1 + st.phase);
    m4.compose(
      p4.set(gx, gy - 0.45, gz),
      q4,
      s4.set(0.78 * breathe, 0.78 / breathe, 0.78).multiplyScalar(out),
    );
    const i = this.ghostsUsed++;
    this.ghosts.setMatrixAt(i, m4);
    this.ghosts.setColorAt(i, tint.setScalar(0.85 * fade));
    this.halo(gx, gy - 0.05, gz, 1.6, 0.3 * fade, 0x8fd0ff);
    this.halo(gx, gy + 0.1, gz, 0.6, 0.35 * fade, 0xdff4ff);
    // faint wisps streaming off its hem, back along its path
    const back = o.yaw + Math.PI;
    this.particles.toyMote(
      gx + Math.sin(back) * 0.15,
      gy - 0.5,
      gz + Math.cos(back) * 0.15,
      Math.sin(back) * 0.35,
      -0.05,
      Math.cos(back) * 0.35,
      0xa8dcff,
      0.3,
      1.3,
      -0.15,
      'wisp',
      (this.reduced ? 8 : 18) * fade,
      this.dt,
    );
  }

  private drawBats(st: LookState, life: number): void {
    const t = this.time - st.born;
    if (this.bats.length < 3) return;
    const [body, wingL, wingR] = this.bats;
    for (let i = 0; i < BAT_COUNT && this.batsUsed < BAT_CAP; i++) {
      const b = batFlight(i, t, life);
      if (!b || b.alpha <= 0.01) continue;
      const x = st.ax + b.x;
      const y = st.ay + b.y;
      const z = st.az + b.z;
      const k = this.batsUsed++;
      e4.set(0.25 * Math.sin(t * 7 + i), b.yaw, 0);
      q4.setFromEuler(e4);
      const sc = b.scale * (0.35 + 0.65 * b.alpha) * 2.0;
      m4.compose(p4.set(x, y, z), q4, s4.setScalar(sc));
      body.setMatrixAt(k, m4);
      // each wing hinged at the body, beating about the body's long (+Z) axis
      q6.copy(q4).multiply(q5.setFromAxisAngle(FWD, -b.flap));
      m4.compose(p4, q6, s4);
      wingL.setMatrixAt(k, m4);
      q6.copy(q4).multiply(q5.setFromAxisAngle(FWD, b.flap));
      m4.compose(p4, q6, s4);
      wingR.setMatrixAt(k, m4);
    }
  }

  private drawCandle(id: number, a: ToyAuraLike, st: LookState, fade: number, remaining: number) {
    const t = this.time - st.born;
    const cx = a.value2 ?? 0;
    const cz = a.value3 ?? 0;
    const cy = st.spotY;
    if (!st.looped && remaining > 0.5) {
      st.looped = true;
      this.audio()?.timedGroundLoop(
        `murmurwick-${id}`,
        CANDLE_WHISPER_SFX,
        cx,
        cy + 0.4,
        cz,
        remaining,
      );
    }
    if (this.candles && this.candlesUsed < TOY_CAP) {
      const grow = Math.min(1, t / 0.3);
      m4.compose(
        p4.set(cx, cy, cz),
        q4.setFromAxisAngle(UP, st.phase),
        s4.setScalar(CANDLE_SCALE * grow),
      );
      this.candles.setMatrixAt(this.candlesUsed++, m4);
    }
    // the cold green flames, each on its own flicker
    for (let k = 0; k < 3 && this.flames && this.flamesUsed < TOY_CAP * 3; k++) {
      const [ox, h, oz] = CANDLE_TOPS[k];
      const c = Math.cos(st.phase);
      const s = Math.sin(st.phase);
      const fx = cx + (ox * c + oz * s) * CANDLE_SCALE;
      const fz = cz + (-ox * s + oz * c) * CANDLE_SCALE;
      const fy = cy + (0.04 + h + 0.03) * CANDLE_SCALE;
      const fl = candleFlicker(this.time, st.phase + k * 1.7);
      e4.set(0.08 * Math.sin(this.time * 5 + k), 0, 0.08 * Math.cos(this.time * 4 + k));
      m4.compose(
        p4.set(fx, fy, fz),
        q4.setFromEuler(e4),
        s4.set(CANDLE_SCALE, CANDLE_SCALE * fl, CANDLE_SCALE).multiplyScalar(fade),
      );
      const i = this.flamesUsed++;
      this.flames.setMatrixAt(i, m4);
      this.flames.setColorAt(i, tint.setScalar(1));
      this.halo(fx, fy + 0.08, fz, 0.7 * fl, 0.55 * fade, 0x66ff8a);
    }
    this.halo(cx, cy + 0.3, cz, 3.2, 0.08 * fade, 0x3cff6e);
    // the low green mist spreading over the ground round it
    const mist = candleMist(t, remaining);
    if (this.mists && this.mistsUsed < TOY_CAP) {
      m4.compose(
        p4.set(cx, cy + 0.06, cz),
        q4.setFromAxisAngle(UP, this.time * 0.08 + st.phase),
        s4.set(mist.radius, 1, mist.radius),
      );
      const i = this.mistsUsed++;
      this.mists.setMatrixAt(i, m4);
      this.mists.setColorAt(i, tint.setScalar(0.09 * mist.strength));
    }
    // curls of it lifting off the ground, and pale motes drifting up through it
    const rate = (this.reduced ? 5 : 10) * mist.strength;
    const ang = this.time * 2.3 + st.phase;
    const r = mist.radius * (0.3 + 0.6 * ((Math.sin(this.time * 3.7) + 1) / 2));
    this.particles.toyMote(
      cx + Math.cos(ang) * r,
      cy + 0.1,
      cz + Math.sin(ang) * r,
      Math.cos(ang) * 0.3,
      0.12,
      Math.sin(ang) * 0.3,
      0x1d6a32,
      1.5,
      3.0,
      -0.02,
      'smoke',
      rate,
      this.dt,
    );
    this.particles.toyMote(
      cx - Math.cos(ang * 1.3) * r * 0.7,
      cy + 0.2,
      cz + Math.sin(ang * 1.3) * r * 0.7,
      0,
      0.35,
      0,
      0x9dffb0,
      0.12,
      1.6,
      -0.1,
      'glow',
      rate * 0.4,
      this.dt,
    );
  }

  private drawBroom(e: ToyEntityLike, st: LookState, fade: number): void {
    const dx = e.pos.x - st.lastX;
    const dz = e.pos.z - st.lastZ;
    st.lastX = e.pos.x;
    st.lastZ = e.pos.z;
    const inst = Math.hypot(dx, dz) / Math.max(1e-3, this.dt);
    st.speed += (Math.min(inst, 20) - st.speed) * Math.min(1, this.dt * 8);
    const stride = Math.min(1, st.speed / 3);
    const pose = broomPose(this.time - st.born + st.phase, stride);
    const c = Math.cos(e.facing);
    const s = Math.sin(e.facing);
    // local (+x right, +z forward) to world: forward is (sin f, cos f), right is (cos f, -sin f)
    const wx = (lx: number, lz: number) => e.pos.x + lz * s + lx * c;
    const wz = (lx: number, lz: number) => e.pos.z + lz * c - lx * s;
    const bx = wx(pose.bristle.x, pose.bristle.z);
    const bz = wz(pose.bristle.x, pose.bristle.z);
    const by = e.pos.y + pose.bristle.y;
    const mounted = !!e.mountKey;
    if (!mounted && this.brooms && this.broomsUsed < TOY_CAP) {
      const hx = wx(pose.hand.x, pose.hand.z);
      const hz = wz(pose.hand.x, pose.hand.z);
      v1.set(hx - bx, e.pos.y + pose.hand.y - by, hz - bz).normalize();
      q4.setFromUnitVectors(UP, v1);
      m4.compose(
        p4.set(bx, by - 0.06, bz),
        q4,
        s4.setScalar(BROOM_SCALE * Math.min(1, (this.time - st.born) / 0.25)),
      );
      this.brooms.setMatrixAt(this.broomsUsed++, m4);
    }
    // the sparks: thrown off the bristles, falling and fading behind the walker
    const sx = mounted ? e.pos.x - s * 1.2 : bx;
    const sz = mounted ? e.pos.z - c * 1.2 : bz;
    const rate = broomSparkRate(st.speed) * fade * (this.reduced ? 0.5 : 1);
    const kick = 0.6 + 0.8 * stride;
    this.particles.toyMote(
      sx,
      by + 0.12,
      sz,
      -s * kick * 0.6 + pose.sweep * c * 0.8,
      1.1 + stride,
      -c * kick * 0.6 - pose.sweep * s * 0.8,
      0xff7a1e,
      0.22,
      0.8,
      4.2,
      'spark',
      rate,
      this.dt,
    );
    this.particles.toyMote(
      sx,
      by + 0.1,
      sz,
      0,
      0.5,
      0,
      0xffd27a,
      0.16,
      1.3,
      0.8,
      'spark',
      rate * 0.4,
      this.dt,
    );
    this.halo(sx, by + 0.15, sz, 0.8, 0.35 * fade * (0.4 + 0.6 * stride), 0xff9a3a);
    // a soft sweep each stride while walking
    if (st.speed > 1 && this.time >= st.sweepAt) {
      st.sweepAt = this.time + BROOM_SWEEP_EVERY;
      this.audio()?.playAt?.(BROOM_SWEEP_SFX, bx, by, bz, { gain: 0.3, cooldown: 0.5 });
    }
  }

  private updateFlights(): void {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      const target = this.entity(f.targetId);
      if (target) f.to.set(target.pos.x, target.pos.y + 1.85, target.pos.z);
      const u = (this.time - f.start) / PRANK_FLIGHT_SEC;
      if (u >= 1) {
        this.splat(f.to);
        this.flights.splice(i, 1);
        continue;
      }
      const p = prankArc(f.from, f.to, u);
      const kit = this.pumpkins.take(this.root);
      if (kit && this.pumpkins.used < PRANK_CAP) {
        e4.set(p.spin, 0.6, p.spin * 0.4);
        m4.compose(p4.set(p.x, p.y - 0.15, p.z), q4.setFromEuler(e4), s4.setScalar(0.9));
        this.pumpkins.place(this.pumpkins.used++, m4);
      }
      this.halo(p.x, p.y, p.z, 1.1, 0.5, 0xffa040);
      this.particles.toyMote(
        p.x,
        p.y,
        p.z,
        0,
        0.2,
        0,
        0xffc060,
        0.16,
        0.5,
        0.5,
        'spark',
        60,
        this.dt,
      );
    }
  }

  /** The pumpkin bursting on a head: pulp and seeds, a warm flash, and its splat. */
  private splat(at: THREE.Vector3): void {
    const n = this.reduced ? 14 : 30;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996;
      const up = 0.6 + ((i * 7) % 5) * 0.45;
      const sp = 1.2 + ((i * 13) % 7) * 0.35;
      this.particles.toyMote(
        at.x,
        at.y + 0.1,
        at.z,
        Math.cos(a) * sp,
        up,
        Math.sin(a) * sp,
        PULP[i % PULP.length],
        i % 3 === 0 ? 0.11 : 0.2,
        0.7 + (i % 4) * 0.12,
        7.5,
        i % 3 === 0 ? 'debris' : 'glow',
      );
    }
    this.particles.groundPuff(this.at.set(at.x, at.y - 1.85, at.z), 0.5, 0xe0761c);
    this.halo(at.x, at.y, at.z, 2.4, 0.8, 0xffb050);
    this.audio()?.playAt?.(PRANK_SPLAT_SFX, at.x, at.y, at.z, { gain: 0.9, cooldown: 0.05 });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pumpkins.release();
    this.root?.removeFromParent();
    for (const m of [
      this.ghosts,
      this.brooms,
      this.candles,
      this.flames,
      this.mists,
      this.lanternFrames,
      this.lanternGlows,
      ...this.bats,
    ])
      m?.dispose();
    for (const x of this.owned) x.dispose();
    this.owned.length = 0;
    this.root = null;
    this.ghosts = null;
    this.brooms = null;
    this.candles = null;
    this.flames = null;
    this.mists = null;
    this.lanternFrames = null;
    this.lanternGlows = null;
    this.bats = [];
    this.halos = [];
    this.looks.clear();
    this.flights.length = 0;
  }
}
