// Buried Hoard boss dressing: the cosmetic layer over the actionable telegraphs
// in hoard_boss_fx.ts. Crystals heave out of Hoarfrost's Treacherous Ice, arcs
// crawl over Vharok's charged ground, and lightning wraps Vharok while Storm
// Surge stacks on him. Every number comes from hoard_boss_dressing_core.ts.
//
// Rules this module keeps (src/render/CLAUDE.md):
//  - pooled: every geometry and material is built once in the constructor and
//    attached through the scene gate, so nothing compiles mid-fight;
//  - no per-frame allocation: arcs and bolts rewrite preallocated buffers;
//  - cosmetic only: the low tier builds none of it, and nothing here ever
//    replaces or hides the floor telegraph a player reads to survive.

import * as THREE from 'three';
import { resolveUiEffectsProfile } from '../game/ui_effects_profile';
import { HOARD_STORM_SURGE_MAX_STACKS } from '../sim/rift/hoard_boss_kits';
import { HOARD_STORM_SURGE_AURA_ID } from '../sim/rift/hoard_storm_surge';
import type { IWorld } from '../world_api';
import type { HoardBossCueView } from '../world_api/dungeons';
import { attachSceneGroupGated } from './gated_scene_attach';
import { GFX } from './gfx';
import {
  HOARD_ICE_SHARD_COUNT,
  HOARD_LIGHTNING_REROLL_HZ,
  HOARD_STORM_ARC_COUNT,
  HOARD_STORM_ARC_POINTS,
  HOARD_SURGE_BOLT_COUNT,
  hoardIceGrowth,
  hoardIceShards,
  hoardStormArc,
  hoardSurgeBolt,
  hoardSurgePlan,
} from './hoard_boss_dressing_core';

const ICE_SLOTS = 4;
const FIELD_SLOTS = 3;
const BOLT_POINTS = 9;
const ARC_SEGMENTS = HOARD_STORM_ARC_POINTS - 1;
const BOLT_SEGMENTS = BOLT_POINTS - 1;
const SURGE_SCAN_SEC = 0.4;
const FIELD_LIFT = 0.22;

interface IceSlot {
  key: string;
  group: THREE.Group;
  shards: THREE.InstancedMesh;
  glow: THREE.Mesh;
  cueId: number;
}

interface FieldSlot {
  key: string;
  group: THREE.Group;
  core: THREE.Mesh;
  halo: THREE.Mesh;
  cue: HoardBossCueView | null;
  bucket: number;
}

function additive(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** A ribbon mesh of `segments` quads whose vertices are rewritten in place. */
function ribbonGeometry(segments: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(segments * 4 * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const indices: number[] = [];
  for (let segment = 0; segment < segments; segment++) {
    const base = segment * 4;
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  geometry.setIndex(indices);
  return geometry;
}

export class HoardBossDressing {
  readonly readyForEntry: Promise<void>;
  private readonly root = new THREE.Group();
  private readonly enabled: boolean;
  private readonly iceSlots: IceSlot[] = [];
  private readonly fieldSlots: FieldSlot[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly surge = new THREE.Group();
  private surgeShell: THREE.Mesh | null = null;
  private surgeRing: THREE.Mesh | null = null;
  private surgeBoltsCore: THREE.Mesh | null = null;
  private surgeBoltsHalo: THREE.Mesh | null = null;
  private shellMaterial: THREE.MeshBasicMaterial | null = null;
  private surgeGlow: THREE.Mesh | null = null;
  private surgeGlowMaterial: THREE.MeshBasicMaterial | null = null;
  private surgeBossId: number | null = null;
  private surgeScan = 0;
  private surgeBucket = -1;
  private clock = 0;
  private disposed = false;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
    private readonly world?: IWorld,
    compileGate?: (target: THREE.Object3D) => Promise<unknown>,
  ) {
    this.root.name = 'hoard-boss-dressing';
    this.enabled =
      resolveUiEffectsProfile({ presetLabel: GFX.tier, effectsQuality: 1, reduceMotion: false })
        .tier !== 'low';
    if (!this.enabled) {
      this.readyForEntry = Promise.resolve();
      return;
    }
    this.buildIce();
    this.buildFields();
    this.buildSurge();
    this.readyForEntry = attachSceneGroupGated(scene, this.root, compileGate, () => this.disposed)
      .then(() => {})
      .catch(() => {});
  }

  private own<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private keep<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private buildIce(): void {
    // A five-sided spire with its base on the ground: faceted, so the flat
    // shading catches the light like cut ice.
    const spire = this.own(new THREE.ConeGeometry(0.5, 1, 5, 1));
    spire.translate(0, 0.5, 0);
    const crystal = this.keep(
      new THREE.MeshStandardMaterial({
        color: 0xc9f1ff,
        emissive: 0x2f9fe0,
        emissiveIntensity: 0.55,
        roughness: 0.12,
        metalness: 0.05,
        transparent: true,
        opacity: 0.9,
        flatShading: true,
      }),
    );
    const glowGeometry = this.own(new THREE.CircleGeometry(1, 40));
    glowGeometry.rotateX(-Math.PI / 2);
    const glowMaterial = this.keep(additive(0x7fd8ff, 0.2));
    for (let index = 0; index < ICE_SLOTS; index++) {
      const group = new THREE.Group();
      group.visible = false;
      const shards = new THREE.InstancedMesh(spire, crystal, HOARD_ICE_SHARD_COUNT);
      shards.frustumCulled = false;
      shards.castShadow = false;
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      glow.position.y = 0.16;
      glow.renderOrder = 17;
      group.add(glow, shards);
      this.root.add(group);
      this.iceSlots.push({ key: '', group, shards, glow, cueId: -1 });
    }
  }

  private buildFields(): void {
    const coreMaterial = this.keep(additive(0xeafcff, 0.95));
    const haloMaterial = this.keep(additive(0x3f9dff, 0.34));
    for (let index = 0; index < FIELD_SLOTS; index++) {
      const group = new THREE.Group();
      group.visible = false;
      const core = new THREE.Mesh(
        this.own(ribbonGeometry(HOARD_STORM_ARC_COUNT * ARC_SEGMENTS)),
        coreMaterial,
      );
      const halo = new THREE.Mesh(
        this.own(ribbonGeometry(HOARD_STORM_ARC_COUNT * ARC_SEGMENTS)),
        haloMaterial,
      );
      core.frustumCulled = false;
      halo.frustumCulled = false;
      core.renderOrder = 23;
      halo.renderOrder = 22;
      group.add(halo, core);
      this.root.add(group);
      this.fieldSlots.push({ key: '', group, core, halo, cue: null, bucket: -1 });
    }
  }

  private buildSurge(): void {
    this.surge.visible = false;
    this.shellMaterial = this.keep(additive(0x8fe6ff, 0.2));
    this.shellMaterial.wireframe = true;
    const shellGeometry = this.own(new THREE.IcosahedronGeometry(1, 2));
    this.surgeShell = new THREE.Mesh(shellGeometry, this.shellMaterial);
    this.surgeGlowMaterial = this.keep(additive(0x2f8cff, 0.1));
    this.surgeGlow = new THREE.Mesh(shellGeometry, this.surgeGlowMaterial);
    const ringGeometry = this.own(new THREE.TorusGeometry(1, 0.07, 6, 48));
    ringGeometry.rotateX(Math.PI / 2);
    this.surgeRing = new THREE.Mesh(ringGeometry, this.keep(additive(0xbff4ff, 0.85)));
    this.surgeRing.position.y = 0.2;
    this.surgeBoltsCore = new THREE.Mesh(
      this.own(ribbonGeometry(HOARD_SURGE_BOLT_COUNT * BOLT_SEGMENTS)),
      this.keep(additive(0xf4feff, 0.95)),
    );
    this.surgeBoltsHalo = new THREE.Mesh(
      this.own(ribbonGeometry(HOARD_SURGE_BOLT_COUNT * BOLT_SEGMENTS)),
      this.keep(additive(0x49a8ff, 0.4)),
    );
    for (const mesh of [
      this.surgeShell,
      this.surgeRing,
      this.surgeBoltsCore,
      this.surgeBoltsHalo,
    ]) {
      mesh.frustumCulled = false;
      mesh.renderOrder = 24;
    }
    this.surgeGlow.frustumCulled = false;
    this.surgeGlow.renderOrder = 23;
    this.surge.add(
      this.surgeGlow,
      this.surgeShell,
      this.surgeRing,
      this.surgeBoltsHalo,
      this.surgeBoltsCore,
    );
    this.root.add(this.surge);
  }

  sync(cues: readonly HoardBossCueView[]): void {
    if (!this.enabled) return;
    this.syncIce(cues);
    this.syncFields(cues);
  }

  private syncIce(cues: readonly HoardBossCueView[]): void {
    const live = cues.filter((cue) => cue.kind === 'mark' && cue.variant === 'frost-ice');
    for (const slot of this.iceSlots) {
      if (slot.key && !live.some((cue) => `${cue.instanceId}:${cue.cueId}` === slot.key)) {
        slot.key = '';
        slot.group.visible = false;
      }
    }
    for (const cue of live) {
      const key = `${cue.instanceId}:${cue.cueId}`;
      let slot = this.iceSlots.find((candidate) => candidate.key === key);
      if (!slot) {
        slot = this.iceSlots.find((candidate) => candidate.key === '');
        if (!slot) continue;
        slot.key = key;
        slot.cueId = cue.cueId;
        slot.group.position.set(cue.x, this.groundY(cue.x, cue.z), cue.z);
        slot.glow.scale.setScalar(cue.radius);
      }
      slot.group.visible = true;
      const growth = Math.max(0.001, hoardIceGrowth(cue.phase, cue.remaining, cue.total));
      const baseY = slot.group.position.y;
      const plans = hoardIceShards(cue.cueId);
      for (let index = 0; index < plans.length; index++) {
        const plan = plans[index];
        const dx = Math.cos(plan.angle) * plan.radiusFraction * cue.radius;
        const dz = Math.sin(plan.angle) * plan.radiusFraction * cue.radius;
        // Sunk a little so a crystal never floats on a slope.
        this.pos.set(dx, this.groundY(cue.x + dx, cue.z + dz) - baseY - 0.12, dz);
        // Lean outward, away from the patch centre.
        this.euler.set(Math.sin(plan.angle) * -plan.lean, 0, Math.cos(plan.angle) * plan.lean);
        this.quat.setFromEuler(this.euler);
        this.scale.set(plan.girth, plan.height * growth, plan.girth);
        this.matrix.compose(this.pos, this.quat, this.scale);
        slot.shards.setMatrixAt(index, this.matrix);
      }
      slot.shards.instanceMatrix.needsUpdate = true;
    }
  }

  private syncFields(cues: readonly HoardBossCueView[]): void {
    const live = cues.filter(
      (cue) =>
        cue.kind === 'mark' && (cue.variant === 'storm-field' || cue.variant === 'storm-charge'),
    );
    for (const slot of this.fieldSlots) {
      if (slot.key && !live.some((cue) => `${cue.instanceId}:${cue.cueId}` === slot.key)) {
        slot.key = '';
        slot.cue = null;
        slot.group.visible = false;
      }
    }
    for (const cue of live) {
      const key = `${cue.instanceId}:${cue.cueId}`;
      let slot = this.fieldSlots.find((candidate) => candidate.key === key);
      if (!slot) {
        slot = this.fieldSlots.find((candidate) => candidate.key === '');
        if (!slot) continue;
        slot.key = key;
        slot.bucket = -1;
        slot.group.position.set(cue.x, this.groundY(cue.x, cue.z), cue.z);
      }
      slot.cue = cue;
      slot.group.visible = true;
    }
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.clock += dt;
    const bucket = Math.floor(this.clock * HOARD_LIGHTNING_REROLL_HZ);
    for (const slot of this.fieldSlots) {
      if (!slot.cue || slot.bucket === bucket) continue;
      slot.bucket = bucket;
      this.writeFieldArcs(slot, bucket);
    }
    this.updateSurge(dt, bucket);
  }

  private writeFieldArcs(slot: FieldSlot, bucket: number): void {
    const cue = slot.cue;
    if (!cue) return;
    // The charge builds through the warning: few arcs at first, all of them live.
    const charging = cue.variant === 'storm-charge';
    const progress = cue.total > 0 ? 1 - cue.remaining / cue.total : 1;
    const liveArcs = charging
      ? Math.max(2, Math.round(HOARD_STORM_ARC_COUNT * progress))
      : HOARD_STORM_ARC_COUNT;
    const baseY = slot.group.position.y;
    const corePosition = slot.core.geometry.getAttribute('position') as THREE.BufferAttribute;
    const haloPosition = slot.halo.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let arc = 0; arc < HOARD_STORM_ARC_COUNT; arc++) {
      const points = hoardStormArc(cue.cueId, arc, bucket);
      for (let segment = 0; segment < ARC_SEGMENTS; segment++) {
        const ax = points[segment * 2] * cue.radius;
        const az = points[segment * 2 + 1] * cue.radius;
        const bx = points[segment * 2 + 2] * cue.radius;
        const bz = points[segment * 2 + 3] * cue.radius;
        const live = arc < liveArcs;
        const length = Math.hypot(bx - ax, bz - az) || 1;
        const nx = (-(bz - az) / length) * (live ? 1 : 0);
        const nz = ((bx - ax) / length) * (live ? 1 : 0);
        const ay = this.groundY(cue.x + ax, cue.z + az) - baseY + FIELD_LIFT;
        const by = this.groundY(cue.x + bx, cue.z + bz) - baseY + FIELD_LIFT;
        const vertex = (arc * ARC_SEGMENTS + segment) * 4;
        for (const [attribute, width] of [
          [corePosition, 0.1],
          [haloPosition, 0.5],
        ] as const) {
          attribute.setXYZ(vertex, ax + nx * width, ay, az + nz * width);
          attribute.setXYZ(vertex + 1, ax - nx * width, ay, az - nz * width);
          attribute.setXYZ(vertex + 2, bx + nx * width, by, bz + nz * width);
          attribute.setXYZ(vertex + 3, bx - nx * width, by, bz - nz * width);
        }
      }
    }
    corePosition.needsUpdate = true;
    haloPosition.needsUpdate = true;
  }

  /** The surged boss is found by his Storm Surge aura: a cheap periodic scan
   *  while no boss is tracked, then a direct lookup. */
  private findSurgedBoss(
    dt: number,
  ): { x: number; y: number; z: number; scale: number; stacks: number } | null {
    const world = this.world;
    if (!world) return null;
    if (this.surgeBossId !== null) {
      const tracked = world.entities.get(this.surgeBossId);
      const aura = tracked?.auras.find((candidate) => candidate.id === HOARD_STORM_SURGE_AURA_ID);
      if (tracked && aura && !tracked.dead) {
        return {
          x: tracked.pos.x,
          y: tracked.pos.y,
          z: tracked.pos.z,
          scale: tracked.scale,
          stacks: aura.stacks ?? 1,
        };
      }
      this.surgeBossId = null;
    }
    this.surgeScan -= dt;
    if (this.surgeScan > 0 || !world.riftFloor) return null;
    this.surgeScan = SURGE_SCAN_SEC;
    for (const entity of world.entities.values()) {
      if (entity.kind !== 'mob' || entity.dead) continue;
      if (entity.auras.some((candidate) => candidate.id === HOARD_STORM_SURGE_AURA_ID)) {
        this.surgeBossId = entity.id;
        return null;
      }
    }
    return null;
  }

  private updateSurge(dt: number, bucket: number): void {
    const boss = this.findSurgedBoss(dt);
    const plan = hoardSurgePlan(boss?.stacks ?? 0, HOARD_STORM_SURGE_MAX_STACKS, this.clock);
    this.surge.visible = boss !== null && plan.intensity > 0;
    if (!boss || !this.surge.visible) return;
    const radius = boss.scale * 0.8;
    const height = boss.scale * 1.9;
    this.surge.position.set(boss.x, boss.y, boss.z);
    if (this.surgeShell && this.shellMaterial) {
      this.surgeShell.position.y = height * 0.5;
      this.surgeShell.scale.set(radius * plan.shellScale, height * 0.62, radius * plan.shellScale);
      this.surgeShell.rotation.y += dt * (0.6 + plan.intensity * 2.2);
      this.shellMaterial.opacity = plan.shellOpacity * 0.55;
    }
    if (this.surgeGlow && this.surgeGlowMaterial) {
      this.surgeGlow.position.y = height * 0.5;
      this.surgeGlow.scale.set(
        radius * plan.shellScale * 0.96,
        height * 0.6,
        radius * plan.shellScale * 0.96,
      );
      this.surgeGlowMaterial.opacity = plan.shellOpacity * 0.6;
    }
    if (this.surgeRing) {
      this.surgeRing.scale.setScalar(radius * (1.25 + plan.intensity * 0.5));
      this.surgeRing.rotation.y += dt * plan.ringSpin;
    }
    if (bucket === this.surgeBucket || !this.surgeBoltsCore || !this.surgeBoltsHalo) return;
    this.surgeBucket = bucket;
    const corePosition = this.surgeBoltsCore.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    const haloPosition = this.surgeBoltsHalo.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    for (let bolt = 0; bolt < HOARD_SURGE_BOLT_COUNT; bolt++) {
      const live = bolt < plan.bolts;
      const points = hoardSurgeBolt(bolt, bucket, BOLT_POINTS);
      for (let segment = 0; segment < BOLT_SEGMENTS; segment++) {
        const ax = points[segment * 3] * radius;
        const ay = points[segment * 3 + 1] * height;
        const az = points[segment * 3 + 2] * radius;
        const bx = points[segment * 3 + 3] * radius;
        const by = points[segment * 3 + 4] * height;
        const bz = points[segment * 3 + 5] * radius;
        // Widen along the tangent around the boss, so a bolt reads from any side.
        const tangentLength = Math.hypot(ax, az) || 1;
        const tx = (-az / tangentLength) * (live ? 1 : 0);
        const tz = (ax / tangentLength) * (live ? 1 : 0);
        const vertex = (bolt * BOLT_SEGMENTS + segment) * 4;
        for (const [attribute, width] of [
          [corePosition, 0.12],
          [haloPosition, 0.55],
        ] as const) {
          attribute.setXYZ(vertex, ax + tx * width, ay, az + tz * width);
          attribute.setXYZ(vertex + 1, ax - tx * width, ay, az - tz * width);
          attribute.setXYZ(vertex + 2, bx + tx * width, by, bz + tz * width);
          attribute.setXYZ(vertex + 3, bx - tx * width, by, bz - tz * width);
        }
      }
    }
    corePosition.needsUpdate = true;
    haloPosition.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const slot of this.iceSlots) slot.shards.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}
