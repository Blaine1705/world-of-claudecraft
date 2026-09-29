// The Hollow Crypt trash telegraphs and impacts (plan: crypt_trash_fx_core.ts):
//  - a floor telegraph under every trash cast you dodge, filling as its bar
//    runs: the Ossuary Warrior's Grave Cleave cone, the drake's Bonechill
//    Breath cone and Tail Lash behind it, the Wing Gust and Stone Shriek rings,
//    and a sigil on the grave a Raise Bones is opening (and round a Murder Call);
//  - the Bone Minion's burst ring, filling over its fuse where it fell;
//  - a flash when a strike lands.
//
// Rules (src/render/CLAUDE.md): every geometry and material is pooled and
// built once, attached through the compile gate; no per-frame allocation. The
// telegraphs are ACTIONABLE, so they draw on every graphics tier (fairness:
// docs/design/graphics-settings-fairness.md); only the landing flashes are
// cosmetic and shed on the low tier. Everything is derived from IWorld entity
// state (cast fields, the dead flag), so offline and online look the same.

import * as THREE from 'three';
import { resolveUiEffectsProfile } from '../../game/ui_effects_profile';
import type { SimEvent } from '../../sim/types';
import type { IWorld } from '../../world_api';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { attachSceneGroupGated } from '../gated_scene_attach';
import { GFX } from '../gfx';
import { setRenderCategory } from '../renderer_diagnostics';
import {
  boneBurstPhase,
  boneBurstSpec,
  CRYPT_TELEGRAPH_COLORS,
  type CryptTelegraphSpec,
  coneFan,
  cryptTelegraphSpecs,
  telegraphFill,
  telegraphYaw,
} from './crypt_trash_fx_core';

const TELEGRAPH_SLOTS = 10;
const BURST_SLOTS = 8;
const FLASH_SLOTS = 6;
const SEGMENTS = 40;
const SCAN_SEC = 0.1;
const LIFT = 0.07;
const FLASH_SEC = 0.5;
const BONE_MINION = 'crypt_bone_minion';

interface Shape {
  group: THREE.Group;
  base: THREE.Mesh;
  fill: THREE.Mesh;
  rim: THREE.Mesh;
  baseMat: THREE.MeshBasicMaterial;
  fillMat: THREE.MeshBasicMaterial;
  rimMat: THREE.MeshBasicMaterial;
  /** The spec the geometry was last laid out for. */
  laid: CryptTelegraphSpec | null;
  /** Unit-radius (x, z) of the fan and rim vertices, kept to drape each frame. */
  unitFan: Float32Array;
  unitRim: Float32Array;
}

interface TelegraphSlot extends Shape {
  casterId: number;
  castId: string;
}

interface BurstSlot extends Shape {
  corpseId: number;
  since: number;
}

interface FlashSlot extends Shape {
  age: number;
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
  // Two stations per arc point (inner, outer) plus the two straight edges.
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

function layOut(shape: Shape, spec: CryptTelegraphSpec): void {
  if (shape.laid === spec) return;
  shape.laid = spec;
  const fan = coneFan(1, spec.arcDeg, SEGMENTS);
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
  // The rim: a band 0.3 yd wide inside the arc, and the cone's two sides.
  const rim = shape.rim.geometry.getAttribute('position') as THREE.BufferAttribute;
  const width = Math.min(0.35, spec.range * 0.08) / spec.range;
  for (let i = 0; i <= SEGMENTS; i++) {
    const [x, z] = fan[i + 1];
    rim.setXYZ(i * 2, x * (1 - width), 0, z * (1 - width));
    rim.setXYZ(i * 2 + 1, x, 0, z);
  }
  const e = (SEGMENTS + 1) * 2;
  const cone = spec.arcDeg < 360;
  for (let side = 0; side < 2; side++) {
    const [x, z] = fan[side === 0 ? 1 : SEGMENTS + 1];
    const len = Math.hypot(x, z) || 1;
    const nx = (-z / len) * width * (side === 0 ? -1 : 1);
    const nz = (x / len) * width * (side === 0 ? -1 : 1);
    const b = e + side * 4;
    const k = cone ? 1 : 0;
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

export class CryptTrashFx {
  readonly readyForEntry: Promise<void>;
  private readonly root = new THREE.Group();
  private readonly specs = cryptTelegraphSpecs();
  private readonly burst = boneBurstSpec();
  private readonly burstSpec: CryptTelegraphSpec;
  private readonly flashSpec: CryptTelegraphSpec;
  private readonly telegraphs: TelegraphSlot[] = [];
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
    this.root.name = 'crypt-trash-telegraphs';
    setRenderCategory(this.root, 'ui3d');
    this.flashesOn =
      resolveUiEffectsProfile({ presetLabel: GFX.tier, effectsQuality: 1, reduceMotion: false })
        .tier !== 'low';
    this.burstSpec = {
      shape: 'ring',
      range: this.burst.radius,
      arcDeg: 360,
      color: CRYPT_TELEGRAPH_COLORS.bone,
    };
    this.flashSpec = { shape: 'ring', range: 1, arcDeg: 360, color: 0xffffff };
    for (let i = 0; i < TELEGRAPH_SLOTS; i++)
      this.telegraphs.push({ ...this.shape(18), casterId: -1, castId: '' });
    for (let i = 0; i < BURST_SLOTS; i++)
      this.bursts.push({ ...this.shape(16), corpseId: -1, since: 0 });
    if (this.flashesOn)
      for (let i = 0; i < FLASH_SLOTS; i++) this.flashes.push({ ...this.shape(24), age: -1 });
    this.readyForEntry = attachSceneGroupGated(scene, this.root, compileGate, () => this.disposed)
      .then(() => {})
      .catch(() => {});
  }

  private shape(order: number): Shape {
    const mat = (opacity: number) => {
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
    };
    const baseMat = mat(0.16);
    const fillMat = mat(0.42);
    const rimMat = mat(0.95);
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

  /** A landing strike's flash (cosmetic; the damage already has its number). */
  handleEvent(ev: SimEvent): void {
    if (!this.flashesOn || ev.type !== 'spellfx' || ev.fx !== 'nova' || !this.world) return;
    const ability = ev.ability ?? '';
    const spec = this.specs[ability];
    if (!spec && ability !== 'crypt_bone_growth') return;
    const at = this.world.entities.get(ev.targetId);
    if (!at) return;
    const slot = this.flashes.find((f) => f.age < 0) ?? this.flashes[0];
    const radius =
      spec?.shape === 'ring'
        ? spec.range
        : spec?.shape === 'sigil'
          ? 3
          : spec
            ? spec.range * 0.6
            : 3;
    layOut(slot, this.flashSpec);
    slot.baseMat.color.setHex(spec?.color ?? CRYPT_TELEGRAPH_COLORS.shadow);
    slot.fillMat.color.setHex(spec?.color ?? CRYPT_TELEGRAPH_COLORS.shadow);
    slot.rimMat.color.setHex(0xffffff);
    slot.age = 0;
    slot.group.userData.radius = radius;
    slot.group.position.set(at.pos.x, this.groundY(at.pos.x, at.pos.z) + LIFT, at.pos.z);
    slot.group.visible = true;
  }

  /**
   * Lay a shape on the real floor: every vertex takes the ground height under
   * its own world spot (a cone down a stair or across a ramp stays on the
   * steps instead of vanishing under them). The group sits at (x, y, z) with
   * yaw `yaw` and horizontal scale `range`; the fill is scaled by `fill`.
   */
  private drape(
    s: Shape,
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

  update(dt: number): void {
    const world = this.world;
    if (!world || this.disposed) return;
    this.clock += dt;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = SCAN_SEC;
      this.scanWorld(world);
    }
    for (const slot of this.telegraphs) {
      if (slot.casterId < 0) continue;
      const caster = world.entities.get(slot.casterId);
      const spec = this.specs[slot.castId];
      if (!caster || caster.dead || caster.castingAbility !== slot.castId || !spec) {
        slot.casterId = -1;
        slot.group.visible = false;
        continue;
      }
      const fill = telegraphFill(caster.castRemaining, caster.castTotal);
      let x = caster.pos.x;
      let z = caster.pos.z;
      if (spec.ahead) {
        x += Math.sin(caster.facing) * spec.ahead;
        z += Math.cos(caster.facing) * spec.ahead;
      }
      const floor = this.groundY(x, z);
      let yaw = telegraphYaw(spec.shape, caster.facing);
      if (spec.shape === 'sigil') yaw += this.clock * 1.4;
      slot.group.position.set(x, floor + LIFT, z);
      slot.group.rotation.y = yaw;
      slot.group.scale.set(spec.range, 1, spec.range);
      slot.fill.scale.set(fill, 1, fill);
      this.drape(slot, x, floor, z, yaw, spec.range, fill);
      // The last quarter of the bar pulses: it is about to land.
      slot.rimMat.opacity = fill > 0.75 ? 0.7 + 0.3 * Math.sin(this.clock * 30) : 0.95;
    }
    for (const slot of this.bursts) {
      if (slot.corpseId < 0) continue;
      const corpse = world.entities.get(slot.corpseId);
      const phase = boneBurstPhase(this.clock - slot.since, this.burst.delay);
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
      this.drape(slot, corpse.pos.x, floor, corpse.pos.z, 0, radius, bf);
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
        if (e.templateId === BONE_MINION && !this.seenDead.has(e.id)) {
          this.seenDead.add(e.id);
          const slot = this.bursts.find((b) => b.corpseId < 0);
          if (slot) {
            layOut(slot, this.burstSpec);
            slot.corpseId = e.id;
            slot.since = this.clock;
            slot.group.visible = true;
          }
        }
        continue;
      }
      const castId = e.castingAbility;
      if (!castId || !this.specs[castId]) continue;
      if (this.telegraphs.some((t) => t.casterId === e.id)) continue;
      const slot = this.telegraphs.find((t) => t.casterId < 0);
      if (!slot) continue;
      layOut(slot, this.specs[castId]);
      slot.casterId = e.id;
      slot.castId = castId;
      slot.group.visible = true;
    }
    // Forget corpses the world has dropped (the set stays bounded).
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
