// The Sunken Bastion's floor telegraphs (plan: bastion_fx_core.ts):
//  - a floor mark under every cast you dodge or kick, filling as its bar runs:
//    the Drowned Watchman's Halberd Sweep and the Turretback Hermit's Claw
//    Sweep cones, the Hermit's Shell Slam ring, the Fogbound Arbalest's
//    Piercing Bolt lane (locked on its caster's aim), and a turning glyph under
//    a Brine Mend or a Fog Ward (the kick call);
//  - the Barnacle Crawler's Brine Burst ring, filling over its fuse where it fell;
//  - a flash when a strike lands.
// Boss casts register more lanes and rings through registerBastionTelegraph.
//
// Rules (src/render/CLAUDE.md): every geometry and material is pooled and
// built once, attached through the compile gate; no per-frame allocation. The
// telegraphs are ACTIONABLE, so they draw on every graphics tier; only the
// landing flashes shed on the low tier. Everything is derived from IWorld
// entity state (cast fields, facing, the dead flag), so offline and online
// look the same.

import * as THREE from 'three';
import { resolveUiEffectsProfile } from '../../game/ui_effects_profile';
import type { SimEvent } from '../../sim/types';
import type { IWorld } from '../../world_api';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { attachSceneGroupGated } from '../gated_scene_attach';
import { GFX } from '../gfx';
import { setRenderCategory } from '../renderer_diagnostics';
import {
  BASTION_TELEGRAPH_COLORS,
  type BastionTelegraphSpec,
  bastionConeFan,
  bastionTelegraphFill,
  bastionTelegraphSpecs,
  brineBurstPhase,
  brineBurstSpec,
} from './bastion_fx_core';

const FAN_SLOTS = 12;
const LANE_SLOTS = 8;
const BURST_SLOTS = 8;
const FLASH_SLOTS = 6;
const SEGMENTS = 40;
const LANE_STEPS = 24;
const SCAN_SEC = 0.1;
const LIFT = 0.07;
const FLASH_SEC = 0.5;
const CRAWLER = 'barnacle_crawler';

type EntityView = IWorld['entities'] extends Map<number, infer E> ? E : never;

/** Extra telegraphs a boss visual registers: a spec per cast id, and for a
 *  lane an optional resolver of its live length (a charge that stops at a
 *  buttress or at the rim). */
const extraSpecs = new Map<string, BastionTelegraphSpec>();
const laneLengths = new Map<string, (caster: EntityView) => number>();

export function registerBastionTelegraph(
  castId: string,
  spec: BastionTelegraphSpec,
  laneLength?: (caster: EntityView) => number,
): void {
  extraSpecs.set(castId, spec);
  if (laneLength) laneLengths.set(castId, laneLength);
}

interface FanShape {
  group: THREE.Group;
  base: THREE.Mesh;
  fill: THREE.Mesh;
  rim: THREE.Mesh;
  baseMat: THREE.MeshBasicMaterial;
  fillMat: THREE.MeshBasicMaterial;
  rimMat: THREE.MeshBasicMaterial;
  laid: BastionTelegraphSpec | null;
  unitFan: Float32Array;
  unitRim: Float32Array;
}

interface FanSlot extends FanShape {
  casterId: number;
  castId: string;
}

interface BurstSlot extends FanShape {
  corpseId: number;
  since: number;
}

interface FlashSlot extends FanShape {
  age: number;
}

interface LaneSlot {
  group: THREE.Group;
  base: THREE.Mesh;
  fill: THREE.Mesh;
  edges: THREE.Mesh;
  baseMat: THREE.MeshBasicMaterial;
  fillMat: THREE.MeshBasicMaterial;
  edgeMat: THREE.MeshBasicMaterial;
  casterId: number;
  castId: string;
}

function fanGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((SEGMENTS + 2) * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) index.push(0, i + 1, i + 2);
  g.setIndex(index);
  return g;
}

function rimGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 2 * 3 + 12 * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const b = i * 2;
    index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const e = (SEGMENTS + 1) * 2;
  for (let side = 0; side < 2; side++) {
    const b = e + side * 4;
    index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  g.setIndex(index);
  return g;
}

/** A lane strip: LANE_STEPS rows along +z, two vertices across (x = -1, +1). */
function laneGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((LANE_STEPS + 1) * 2 * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const index: number[] = [];
  for (let i = 0; i < LANE_STEPS; i++) {
    const b = i * 2;
    index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  g.setIndex(index);
  return g;
}

/** The lane's two edge rails: two strips 0.3 yd wide along its sides. */
function laneEdgeGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array((LANE_STEPS + 1) * 4 * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const index: number[] = [];
  for (let side = 0; side < 2; side++) {
    const o = side * (LANE_STEPS + 1) * 2;
    for (let i = 0; i < LANE_STEPS; i++) {
      const b = o + i * 2;
      index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  g.setIndex(index);
  return g;
}

function layOutFan(shape: FanShape, spec: BastionTelegraphSpec): void {
  if (shape.laid === spec) return;
  shape.laid = spec;
  const fan = bastionConeFan(1, spec.arcDeg, SEGMENTS);
  for (let i = 0; i < fan.length; i++) {
    shape.unitFan[i * 2] = fan[i][0];
    shape.unitFan[i * 2 + 1] = fan[i][1];
  }
  for (const mesh of [shape.base, shape.fill]) {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < fan.length; i++) pos.setXYZ(i, fan[i][0], 0, fan[i][1]);
    pos.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }
  const rim = shape.rim.geometry.getAttribute('position') as THREE.BufferAttribute;
  const width = Math.min(0.35, Math.max(1, spec.range) * 0.08) / Math.max(1, spec.range);
  for (let i = 0; i <= SEGMENTS; i++) {
    const [x, z] = fan[i + 1];
    rim.setXYZ(i * 2, x * (1 - width), 0, z * (1 - width));
    rim.setXYZ(i * 2 + 1, x, 0, z);
  }
  const e = (SEGMENTS + 1) * 2;
  const isCone = spec.arcDeg < 360;
  for (let side = 0; side < 2; side++) {
    const [x, z] = fan[side === 0 ? 1 : SEGMENTS + 1];
    const len = Math.hypot(x, z) || 1;
    const nx = (-z / len) * width * (side === 0 ? -1 : 1);
    const nz = (x / len) * width * (side === 0 ? -1 : 1);
    const b = e + side * 4;
    const k = isCone ? 1 : 0;
    rim.setXYZ(b, 0, 0, 0);
    rim.setXYZ(b + 1, nx * k, 0, nz * k);
    rim.setXYZ(b + 2, x * k, 0, z * k);
    rim.setXYZ(b + 3, (x + nx) * k, 0, (z + nz) * k);
  }
  for (let i = 0; i < rim.count; i++) {
    shape.unitRim[i * 2] = rim.getX(i);
    shape.unitRim[i * 2 + 1] = rim.getZ(i);
  }
  rim.needsUpdate = true;
  shape.rim.geometry.computeBoundingSphere();
  shape.baseMat.color.setHex(spec.color);
  shape.fillMat.color.setHex(spec.color);
  shape.rimMat.color.setHex(spec.color);
}

export class BastionFx {
  readonly readyForEntry: Promise<void>;
  private readonly root = new THREE.Group();
  private readonly specs = bastionTelegraphSpecs();
  private readonly burst = brineBurstSpec();
  private readonly burstSpec: BastionTelegraphSpec;
  private readonly flashSpec: BastionTelegraphSpec;
  private readonly fans: FanSlot[] = [];
  private readonly lanes: LaneSlot[] = [];
  private readonly bursts: BurstSlot[] = [];
  private readonly flashes: FlashSlot[] = [];
  private readonly flashesOn: boolean;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly seenDead = new Set<number>();
  private scan = 0;
  private clock = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
    private readonly world?: IWorld,
    compileGate?: (target: THREE.Object3D) => Promise<unknown>,
  ) {
    this.root.name = 'sunken-bastion-telegraphs';
    setRenderCategory(this.root, 'ui3d');
    this.flashesOn =
      resolveUiEffectsProfile({ presetLabel: GFX.tier, effectsQuality: 1, reduceMotion: false })
        .tier !== 'low';
    this.burstSpec = {
      shape: 'ring',
      range: this.burst.radius,
      arcDeg: 360,
      color: BASTION_TELEGRAPH_COLORS.brine,
    };
    this.flashSpec = { shape: 'ring', range: 1, arcDeg: 360, color: 0xffffff };
    for (let i = 0; i < FAN_SLOTS; i++)
      this.fans.push({ ...this.fanShape(18), casterId: -1, castId: '' });
    for (let i = 0; i < LANE_SLOTS; i++) this.lanes.push(this.laneShape(18));
    for (let i = 0; i < BURST_SLOTS; i++)
      this.bursts.push({ ...this.fanShape(16), corpseId: -1, since: 0 });
    if (this.flashesOn)
      for (let i = 0; i < FLASH_SLOTS; i++) this.flashes.push({ ...this.fanShape(24), age: -1 });
    this.readyForEntry = attachSceneGroupGated(scene, this.root, compileGate, () => this.disposed)
      .then(() => {})
      .catch(() => {});
  }

  private material(opacity: number): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.materials.push(m);
    return m;
  }

  private fanShape(order: number): FanShape {
    const baseMat = this.material(0.16);
    const fillMat = this.material(0.42);
    const rimMat = this.material(0.95);
    const fan = () => {
      const g = fanGeometry();
      this.geometries.push(g);
      return g;
    };
    const rimGeo = rimGeometry();
    this.geometries.push(rimGeo);
    const base = new THREE.Mesh(fan(), baseMat);
    const fill = new THREE.Mesh(fan(), fillMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    base.renderOrder = floorVfxRenderOrder('encounter', order);
    fill.renderOrder = floorVfxRenderOrder('encounter', order + 1);
    rim.renderOrder = floorVfxRenderOrder('encounter', order + 2);
    for (const m of [base, fill, rim]) m.frustumCulled = false;
    const group = new THREE.Group();
    group.visible = false;
    group.add(base, fill, rim);
    this.root.add(group);
    return {
      group,
      base,
      fill,
      rim,
      baseMat,
      fillMat,
      rimMat,
      laid: null,
      unitFan: new Float32Array((SEGMENTS + 2) * 2),
      unitRim: new Float32Array(((SEGMENTS + 1) * 2 + 12) * 2),
    };
  }

  private laneShape(order: number): LaneSlot {
    const baseMat = this.material(0.18);
    const fillMat = this.material(0.45);
    const edgeMat = this.material(0.95);
    const baseGeo = laneGeometry();
    const fillGeo = laneGeometry();
    const edgeGeo = laneEdgeGeometry();
    this.geometries.push(baseGeo, fillGeo, edgeGeo);
    const base = new THREE.Mesh(baseGeo, baseMat);
    const fill = new THREE.Mesh(fillGeo, fillMat);
    const edges = new THREE.Mesh(edgeGeo, edgeMat);
    base.renderOrder = floorVfxRenderOrder('encounter', order);
    fill.renderOrder = floorVfxRenderOrder('encounter', order + 1);
    edges.renderOrder = floorVfxRenderOrder('encounter', order + 2);
    for (const m of [base, fill, edges]) m.frustumCulled = false;
    const group = new THREE.Group();
    group.visible = false;
    group.add(base, fill, edges);
    this.root.add(group);
    return { group, base, fill, edges, baseMat, fillMat, edgeMat, casterId: -1, castId: '' };
  }

  private specFor(castId: string): BastionTelegraphSpec | undefined {
    return this.specs[castId] ?? extraSpecs.get(castId);
  }

  /** A landing strike's flash (cosmetic; the damage already has its number). */
  handleEvent(ev: SimEvent): void {
    if (!this.flashesOn || ev.type !== 'spellfx' || !this.world) return;
    const spec = this.specFor(ev.ability ?? '');
    if (!spec || spec.shape === 'lane' || spec.shape === 'sigil') return;
    const at = this.world.entities.get(ev.sourceId);
    if (!at) return;
    const slot = this.flashes.find((f) => f.age < 0) ?? this.flashes[0];
    if (!slot) return;
    layOutFan(slot, this.flashSpec);
    slot.baseMat.color.setHex(spec.color);
    slot.fillMat.color.setHex(spec.color);
    slot.rimMat.color.setHex(0xffffff);
    slot.age = 0;
    slot.group.userData.radius = spec.shape === 'ring' ? spec.range : spec.range * 0.6;
    slot.group.position.set(at.pos.x, this.groundY(at.pos.x, at.pos.z) + LIFT, at.pos.z);
    slot.group.visible = true;
  }

  /** Drape a fan on the real floor under its own world spot. */
  private drapeFan(
    s: FanShape,
    x: number,
    y: number,
    z: number,
    yaw: number,
    range: number,
    fill: number,
  ): void {
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const put = (attr: THREE.BufferAttribute, unit: Float32Array, k: number): void => {
      for (let i = 0; i < attr.count; i++) {
        const lx = unit[i * 2] * range * k;
        const lz = unit[i * 2 + 1] * range * k;
        const wx = x + lx * c + lz * sn;
        const wz = z - lx * sn + lz * c;
        attr.setY(i, this.groundY(wx, wz) - y);
      }
      attr.needsUpdate = true;
    };
    put(s.base.geometry.getAttribute('position') as THREE.BufferAttribute, s.unitFan, 1);
    put(s.fill.geometry.getAttribute('position') as THREE.BufferAttribute, s.unitFan, fill);
    put(s.rim.geometry.getAttribute('position') as THREE.BufferAttribute, s.unitRim, 1);
  }

  /** Lay a lane of `length` x 2 `half` from (x, z) along `yaw` on the floor,
   *  its fill running `fill` of the way down it. */
  private drapeLane(
    s: LaneSlot,
    x: number,
    y: number,
    z: number,
    yaw: number,
    length: number,
    half: number,
    fill: number,
  ): void {
    const ax = Math.sin(yaw);
    const az = Math.cos(yaw);
    const px = az;
    const pz = -ax;
    const strip = (attr: THREE.BufferAttribute, len: number, a: number, b: number, off = 0) => {
      for (let i = 0; i <= LANE_STEPS; i++) {
        const t = (i / LANE_STEPS) * len;
        for (let k = 0; k < 2; k++) {
          const w = k === 0 ? a : b;
          const wx = x + ax * t + px * w;
          const wz = z + az * t + pz * w;
          attr.setXYZ(off + i * 2 + k, wx - x, this.groundY(wx, wz) - y, wz - z);
        }
      }
      attr.needsUpdate = true;
    };
    strip(s.base.geometry.getAttribute('position') as THREE.BufferAttribute, length, -half, half);
    strip(
      s.fill.geometry.getAttribute('position') as THREE.BufferAttribute,
      length * fill,
      -half,
      half,
    );
    const edges = s.edges.geometry.getAttribute('position') as THREE.BufferAttribute;
    strip(edges, length, -half, -half + 0.3, 0);
    strip(edges, length, half - 0.3, half, (LANE_STEPS + 1) * 2);
    for (const m of [s.base, s.fill, s.edges]) m.geometry.computeBoundingSphere();
  }

  update(dt: number): void {
    const world = this.world;
    if (!world || this.disposed) return;
    this.clock += dt;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = SCAN_SEC;
      this.scanWorld(world);
    }
    for (const slot of this.fans) {
      if (slot.casterId < 0) continue;
      const caster = world.entities.get(slot.casterId);
      const spec = this.specFor(slot.castId);
      if (!caster || caster.dead || caster.castingAbility !== slot.castId || !spec) {
        slot.casterId = -1;
        slot.group.visible = false;
        continue;
      }
      const fill = bastionTelegraphFill(caster.castRemaining, caster.castTotal);
      const x = caster.pos.x;
      const z = caster.pos.z;
      const floor = this.groundY(x, z);
      const yaw = spec.shape === 'sigil' ? this.clock * 1.4 : caster.facing;
      slot.group.position.set(x, floor + LIFT, z);
      slot.group.rotation.y = yaw;
      slot.group.scale.set(spec.range, 1, spec.range);
      slot.fill.scale.set(fill, 1, fill);
      this.drapeFan(slot, x, floor, z, yaw, spec.range, fill);
      slot.rimMat.opacity = fill > 0.75 ? 0.7 + 0.3 * Math.sin(this.clock * 30) : 0.95;
    }
    for (const slot of this.lanes) {
      if (slot.casterId < 0) continue;
      const caster = world.entities.get(slot.casterId);
      const spec = this.specFor(slot.castId);
      if (!caster || caster.dead || caster.castingAbility !== slot.castId || !spec) {
        slot.casterId = -1;
        slot.group.visible = false;
        continue;
      }
      const fill = bastionTelegraphFill(caster.castRemaining, caster.castTotal);
      const length = laneLengths.get(slot.castId)?.(caster) ?? spec.range;
      const x = caster.pos.x;
      const z = caster.pos.z;
      const floor = this.groundY(x, z);
      slot.group.position.set(x, floor + LIFT, z);
      this.drapeLane(slot, x, floor, z, caster.facing, length, spec.halfWidth ?? 1, fill);
      slot.edgeMat.opacity = fill > 0.75 ? 0.7 + 0.3 * Math.sin(this.clock * 30) : 0.95;
    }
    for (const slot of this.bursts) {
      if (slot.corpseId < 0) continue;
      const corpse = world.entities.get(slot.corpseId);
      const phase = brineBurstPhase(this.clock - slot.since, this.burst.delay);
      if (!corpse || phase.stage === 'done') {
        slot.corpseId = -1;
        slot.group.visible = false;
        continue;
      }
      const floor = this.groundY(corpse.pos.x, corpse.pos.z);
      const radius = this.burst.radius * (phase.stage === 'flash' ? 1 + phase.fill * 0.3 : 1);
      const bf = phase.stage === 'fuse' ? phase.fill : 1;
      slot.group.position.set(corpse.pos.x, floor + LIFT, corpse.pos.z);
      slot.group.scale.set(radius, 1, radius);
      slot.fill.scale.set(bf, 1, bf);
      this.drapeFan(slot, corpse.pos.x, floor, corpse.pos.z, 0, radius, bf);
      slot.fillMat.opacity = phase.stage === 'flash' ? 0.6 * (1 - phase.fill) : 0.42;
      slot.rimMat.opacity = phase.stage === 'flash' ? 1 - phase.fill : 0.95;
    }
    for (const slot of this.flashes) {
      if (slot.age < 0) continue;
      slot.age += dt;
      const k = slot.age / FLASH_SEC;
      if (k >= 1) {
        slot.age = -1;
        slot.group.visible = false;
        continue;
      }
      const r = (slot.group.userData.radius as number) * (0.4 + 0.8 * k);
      slot.group.scale.set(r, 1, r);
      slot.fill.scale.set(1, 1, 1);
      slot.fillMat.opacity = 0.5 * (1 - k);
      slot.baseMat.opacity = 0.2 * (1 - k);
      slot.rimMat.opacity = 1 - k;
    }
  }

  private scanWorld(world: IWorld): void {
    for (const e of world.entities.values()) {
      if (e.kind !== 'mob') continue;
      if (e.dead) {
        if (e.templateId === CRAWLER && !this.seenDead.has(e.id)) {
          this.seenDead.add(e.id);
          const slot = this.bursts.find((b) => b.corpseId < 0);
          if (slot) {
            layOutFan(slot, this.burstSpec);
            slot.corpseId = e.id;
            slot.since = this.clock;
            slot.group.visible = true;
          }
        }
        continue;
      }
      const castId = e.castingAbility;
      const spec = castId ? this.specFor(castId) : undefined;
      if (!castId || !spec) continue;
      if (spec.shape === 'lane') {
        if (this.lanes.some((t) => t.casterId === e.id)) continue;
        const slot = this.lanes.find((t) => t.casterId < 0);
        if (!slot) continue;
        slot.baseMat.color.setHex(spec.color);
        slot.fillMat.color.setHex(spec.color);
        slot.edgeMat.color.setHex(spec.color);
        slot.casterId = e.id;
        slot.castId = castId;
        slot.group.visible = true;
        continue;
      }
      if (this.fans.some((t) => t.casterId === e.id)) continue;
      const slot = this.fans.find((t) => t.casterId < 0);
      if (!slot) continue;
      layOutFan(slot, spec);
      slot.casterId = e.id;
      slot.castId = castId;
      slot.group.visible = true;
    }
    if (this.seenDead.size > 64) {
      for (const id of this.seenDead) if (!world.entities.has(id)) this.seenDead.delete(id);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
