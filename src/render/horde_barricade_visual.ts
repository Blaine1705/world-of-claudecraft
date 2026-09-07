// Personal arcade scene. Static poses reuse the shipped undead geometry; the
// entire horde is instanced instead of constructing an animation rig per kill.
// Every gameplay mesh is bounded and linked under the required entry cover.
import * as THREE from 'three';
import { HORDE_QUEST_ID, HORDE_SITE } from '../sim/content/world_quest_horde';
import {
  HORDE_COUNTDOWN_TICKS,
  HORDE_MAX_PROJECTILES,
  HORDE_MAX_SHOTS,
  HORDE_MAX_UNITS,
  HORDE_PROJECTILE_SPACING,
  type HordeState,
} from '../sim/minigames/horde_barricade';
import type { IWorld } from '../world_api';
import { loadGltf } from './assets/loader';
import { charactersReady, prepareVisual } from './characters/assets';
import { attachSceneGroupGated } from './gated_scene_attach';
import { cloneMaterialWithHooks } from './material_clone_hooks';
import { worldQuestTraceMaterials } from './world_quest_trace_materials';

export class HordeBarricadeVisual {
  readonly group = new THREE.Group();
  readonly readyForEntry: Promise<void>;
  private readonly content = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly sphere = new THREE.SphereGeometry(1, 8, 6);
  private readonly scratch = new THREE.Object3D();
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly pools: THREE.InstancedMesh[] = [];
  private readonly undead = new Map<string, THREE.InstancedMesh>();
  private readonly materials = worldQuestTraceMaterials();
  private readonly rewardColors = {
    projectile: new THREE.Color(0x49bfff),
    double: new THREE.Color(0xb58aff),
    haste: new THREE.Color(0x75f69a),
    pierce: new THREE.Color(0x55eeee),
    explosive: new THREE.Color(0xff8d45),
  };
  private readonly shots = this.pool(
    'horde-shots',
    this.sphere,
    this.materials.gold,
    HORDE_MAX_SHOTS,
  );
  private readonly explosiveShots = this.pool(
    'horde-explosive-shots',
    this.sphere,
    this.materials.red,
    HORDE_MAX_SHOTS,
  );
  private readonly impacts = this.pool(
    'horde-impacts',
    this.sphere,
    this.materials.green,
    HORDE_MAX_UNITS,
  );
  private readonly previous = new Float64Array(HORDE_MAX_UNITS * 4);
  private readonly bursts = new Float64Array(HORDE_MAX_UNITS * 3);
  private previousCount = 0;
  private burstCursor = 0;
  private observedTick = -1;
  private readonly health = this.pool(
    'horde-health',
    this.box,
    this.materials.red,
    HORDE_MAX_UNITS,
  );
  private readonly crateHealth = this.pool(
    'horde-crate-health',
    this.box,
    this.materials.blue,
    HORDE_MAX_UNITS,
  );
  private readonly crates: THREE.InstancedMesh;
  private readonly straps: THREE.InstancedMesh;
  private readonly upgrades: THREE.InstancedMesh;
  private readonly explosiveBadges: THREE.InstancedMesh;
  private readonly aim: THREE.Mesh;
  private readonly repeater = new THREE.Group();
  private readonly crossbows: THREE.Group[] = [];
  private readonly repeaterAxle: THREE.Mesh;
  private readonly barrierHealth: THREE.Mesh;
  private disposed = false;

  constructor(
    scene: THREE.Object3D,
    private readonly groundAt: (x: number, z: number) => number,
    compileGate?: (target: THREE.Object3D) => Promise<unknown>,
  ) {
    this.group.name = 'personal-horde-barricade';
    this.bursts.fill(-100);
    this.group.add(this.content);
    const wood = new THREE.MeshLambertMaterial({ color: 0x806043 });
    const iron = new THREE.MeshLambertMaterial({ color: 0x414956 });
    const crateMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const badgeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.ownedMaterials.push(wood, iron, crateMaterial, badgeMaterial);
    this.crates = this.pool('horde-crates', this.box, crateMaterial, HORDE_MAX_UNITS);
    this.upgrades = this.pool('horde-upgrades', this.box, badgeMaterial, HORDE_MAX_UNITS * 4);
    this.explosiveBadges = this.pool(
      'horde-explosive-badges',
      this.sphere,
      badgeMaterial,
      HORDE_MAX_UNITS,
    );
    // Allocate instanceColor BEFORE linking. Introducing it on first pickup
    // would create a new shader variant during the timed encounter.
    for (const pool of [this.crates, this.upgrades, this.explosiveBadges]) {
      for (let i = 0; i < pool.instanceMatrix.count; i++)
        pool.setColorAt(i, this.rewardColors.projectile);
    }
    this.straps = this.pool('horde-crate-straps', this.box, iron, HORDE_MAX_UNITS * 2);
    // Dotted margins follow the real terrain, never a floating substitute floor.
    for (const x of [-9, 9]) {
      for (let z = 0; z <= 46; z += 3) {
        const marker = this.mesh(this.materials.blue);
        this.place(marker, x, z, 0.1, 0.16, 0.08, 1.7);
      }
    }
    for (let x = -8; x <= 8; x += 2) {
      const post = this.mesh(wood);
      this.place(post, x, -1.4, 0.6, 0.35, 1.2, 0.4);
    }
    for (const y of [0.4, 0.95]) {
      const rail = this.mesh(wood);
      this.place(rail, 0, -1.4, y, 17, 0.2, 0.25);
    }
    this.barrierHealth = this.mesh(this.materials.green);
    this.place(this.barrierHealth, 0, -1.4, 1.45, 17, 0.16, 0.16);
    this.aim = this.mesh(this.materials.gold);
    this.repeater.name = 'horde-repeater';
    this.content.add(this.repeater);
    const support = new THREE.Mesh(this.box, iron);
    support.scale.set(0.2, 1.1, 0.2);
    support.position.y = 0.55;
    this.repeaterAxle = new THREE.Mesh(this.box, wood);
    this.repeaterAxle.scale.set(1.65, 0.16, 0.22);
    this.repeaterAxle.position.y = 1.05;
    this.repeater.add(support, this.repeaterAxle);
    this.content.visible = false;
    this.readyForEntry = this.prepare(scene, compileGate);
  }

  private mesh(material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(this.box, material);
    mesh.userData.renderCategory = 'ui3d';
    this.content.add(mesh);
    return mesh;
  }

  private pool(
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    capacity: number,
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.renderCategory = 'ui3d';
    this.content.add(mesh);
    this.pools.push(mesh);
    return mesh;
  }

  private place(
    node: THREE.Object3D,
    x: number,
    z: number,
    lift: number,
    sx: number,
    sy: number,
    sz: number,
  ): void {
    const wx = HORDE_SITE.x + x;
    const wz = HORDE_SITE.z + z * HORDE_SITE.direction;
    node.position.set(wx, this.groundAt(wx, wz) + lift, wz);
    node.scale.set(sx, sy, sz);
  }

  private instance(
    pool: THREE.InstancedMesh,
    x: number,
    z: number,
    lift: number,
    sx: number,
    sy: number,
    sz: number,
    yaw = 0,
    roll = 0,
  ): void {
    if (pool.count >= pool.instanceMatrix.count) return;
    this.place(this.scratch, x, z, lift, sx, sy, sz);
    this.scratch.rotation.set(0, yaw, roll);
    this.scratch.updateMatrix();
    pool.setMatrixAt(pool.count++, this.scratch.matrix);
  }

  private async prepare(
    scene: THREE.Object3D,
    compileGate?: (target: THREE.Object3D) => Promise<unknown>,
  ): Promise<void> {
    const [, crossbow] = await Promise.all([
      charactersReady(),
      loadGltf('/models/weapons/crossbow_2handed.glb'),
    ]);
    if (this.disposed) return;
    const bounds = new THREE.Box3().setFromObject(crossbow.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 1.6 / Math.max(0.01, size.x, size.y, size.z);
    for (let i = 0; i < HORDE_MAX_PROJECTILES; i++) {
      const mount = new THREE.Group();
      mount.name = `horde-crossbow-${i}`;
      const model = crossbow.scene.clone(true);
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      mount.position.y = 1.2;
      mount.add(model);
      this.repeater.add(mount);
      this.crossbows.push(mount);
    }
    for (const [kind, key] of [
      ['zombie', 'skel_minion'],
      ['runner', 'skel_rogue'],
      ['brute', 'skel_warrior'],
      ['boss', 'skel_boss'],
    ]) {
      const prepared = prepareVisual(key);
      if (!prepared.idleGeo) throw new Error(`Missing baked horde visual: ${key}`);
      // Dedicated clones prevent the instancing program from replacing a live
      // character material's currentProgram while its own gate is settling.
      const materials = prepared.idleSrcMats.map((source) => cloneMaterialWithHooks(source));
      this.ownedMaterials.push(...materials);
      this.undead.set(
        kind,
        this.pool(`horde-${kind}`, prepared.idleGeo, materials, HORDE_MAX_UNITS),
      );
    }
    await attachSceneGroupGated(scene, this.group, compileGate, () => this.disposed).catch(
      (error) => {
        if (!this.disposed) throw error;
      },
    );
  }

  update(world: IWorld, reducedMotion = false): void {
    this.sync(world.worldQuestLog.get(HORDE_QUEST_ID)?.horde, reducedMotion);
  }

  sync(state: HordeState | null | undefined, reducedMotion = false): void {
    if (this.disposed) return;
    this.content.visible = !!state && (state.phase === 'countdown' || state.phase === 'active');
    for (const pool of this.pools) pool.count = 0;
    if (!state || !this.content.visible) {
      this.previousCount = 0;
      this.observedTick = -1;
      this.bursts.fill(-100);
      return;
    }
    if (state.tick !== this.observedTick) this.recordImpacts(state);
    this.place(this.aim, state.playerX, 2, 0.16, 0.22, 0.08, 3);
    this.place(this.repeater, state.playerX, 0.5, 0, 1, 1, 1);
    this.repeater.rotation.y = HORDE_SITE.direction === 1 ? 0 : Math.PI;
    const projectiles = Math.max(1, Math.min(HORDE_MAX_PROJECTILES, state.projectiles));
    this.repeaterAxle.scale.x = Math.max(1.65, projectiles * HORDE_PROJECTILE_SPACING);
    const volleyPhase =
      (((state.tick - HORDE_COUNTDOWN_TICKS) * 5 * (1 + state.haste * 0.25)) / 20) % 1;
    for (let i = 0; i < this.crossbows.length; i++) {
      const mount = this.crossbows[i];
      mount.visible = i < projectiles;
      mount.position.x = (i - (projectiles - 1) / 2) * HORDE_PROJECTILE_SPACING;
      mount.scale.setScalar(projectiles > 2 ? 0.65 : 1);
      mount.position.z = !reducedMotion && state.phase === 'active' ? -0.09 * (1 - volleyPhase) : 0;
    }
    this.barrierHealth.scale.x = 17 * Math.max(0, Math.min(1, state.barrier / 100));
    for (const unit of state.units) {
      const fraction = Math.max(0.02, Math.min(1, unit.hp / unit.maxHp));
      if (unit.kind === 'crate') {
        const color = this.rewardColors[unit.reward ?? 'projectile'];
        const crateIndex = this.crates.count;
        this.instance(this.crates, unit.x, unit.z, 0.8, 1.65, 1.6, 1.65);
        if (crateIndex < this.crates.count) this.crates.setColorAt(crateIndex, color);
        for (const dx of [-0.5, 0.5])
          this.instance(this.straps, unit.x + dx, unit.z, 0.8, 0.13, 1.66, 1.7);
        const badgeIndex = this.upgrades.count;
        if (unit.reward === 'explosive') {
          const sphereIndex = this.explosiveBadges.count;
          this.instance(this.explosiveBadges, unit.x, unit.z, 2.3, 0.35, 0.35, 0.35);
          if (sphereIndex < this.explosiveBadges.count)
            this.explosiveBadges.setColorAt(sphereIndex, color);
        } else if (unit.reward === 'double') {
          for (const angle of [-Math.PI / 4, Math.PI / 4])
            this.instance(this.upgrades, unit.x, unit.z, 2.3, 0.16, 0.9, 0.16, 0, angle);
        } else if (unit.reward === 'haste') {
          for (const dx of [-0.24, 0.24])
            for (const angle of [-Math.PI / 4, Math.PI / 4]) {
              this.instance(
                this.upgrades,
                unit.x + dx,
                unit.z,
                2.3 + (angle < 0 ? 0.17 : -0.17),
                0.14,
                0.5,
                0.14,
                0,
                angle,
              );
            }
        } else if (unit.reward === 'pierce') {
          this.instance(this.upgrades, unit.x, unit.z, 2.3, 0.14, 0.9, 0.14);
          for (const dx of [-0.14, 0.14])
            this.instance(
              this.upgrades,
              unit.x + dx,
              unit.z,
              2.58,
              0.14,
              0.5,
              0.14,
              0,
              dx < 0 ? -Math.PI / 4 : Math.PI / 4,
            );
        } else {
          this.instance(this.upgrades, unit.x, unit.z, 2.3, 0.18, 0.8, 0.18);
          this.instance(this.upgrades, unit.x, unit.z, 2.3, 0.7, 0.18, 0.18);
        }
        for (let i = badgeIndex; i < this.upgrades.count; i++) this.upgrades.setColorAt(i, color);
        this.instance(this.crateHealth, unit.x, unit.z, 2.9, 1.8 * fraction, 0.15, 0.16);
        continue;
      }
      const pool = this.undead.get(unit.kind);
      if (!pool) continue;
      const size =
        unit.kind === 'boss'
          ? 2
          : unit.kind === 'brute'
            ? 1.35
            : unit.kind === 'runner'
              ? 0.72
              : 0.88;
      const sway = reducedMotion
        ? 0
        : Math.sin(state.tick * (unit.kind === 'runner' ? 0.6 : 0.32) + unit.id) * 0.08;
      this.instance(
        pool,
        unit.x,
        unit.z,
        Math.abs(sway) * 0.6,
        size,
        size,
        size,
        (HORDE_SITE.direction === 1 ? Math.PI : 0) + sway,
      );
      this.instance(
        this.health,
        unit.x,
        unit.z,
        2.5 * size + 0.4,
        1.4 * size * fraction,
        0.13,
        0.13,
      );
    }
    for (const shot of state.shots) {
      const explosive = state.upgrade === 3;
      this.instance(
        explosive ? this.explosiveShots : this.shots,
        shot.x,
        shot.z,
        1.2,
        explosive ? 0.24 : 0.12,
        explosive ? 0.24 : 0.12,
        shot.pierce > 1 ? 1.1 : 0.6,
      );
    }
    if (!reducedMotion)
      for (let i = 0; i < HORDE_MAX_UNITS; i++) {
        const at = i * 3;
        const age = state.tick - this.bursts[at + 2];
        if (age < 0 || age > 5) continue;
        const size = 0.2 + age * 0.12;
        this.instance(this.impacts, this.bursts[at], this.bursts[at + 1], 1.1, size, size, size);
      }
    for (const pool of this.pools) {
      pool.instanceMatrix.needsUpdate = true;
      if (pool.instanceColor) pool.instanceColor.needsUpdate = true;
    }
  }

  private recordImpacts(state: HordeState): void {
    if (state.tick < this.observedTick) {
      this.previousCount = 0;
      this.bursts.fill(-100);
    }
    for (let i = 0; i < this.previousCount; i++) {
      const at = i * 4;
      const unit = state.units.find((candidate) => candidate.id === this.previous[at]);
      if ((unit && unit.hp >= this.previous[at + 3]) || this.previous[at + 2] < 1) continue;
      const burst = this.burstCursor * 3;
      this.bursts[burst] = unit?.x ?? this.previous[at + 1];
      this.bursts[burst + 1] = unit?.z ?? this.previous[at + 2];
      this.bursts[burst + 2] = state.tick;
      this.burstCursor = (this.burstCursor + 1) % HORDE_MAX_UNITS;
    }
    this.previousCount = Math.min(HORDE_MAX_UNITS, state.units.length);
    for (let i = 0; i < this.previousCount; i++) {
      const unit = state.units[i];
      const at = i * 4;
      this.previous[at] = unit.id;
      this.previous[at + 1] = unit.x;
      this.previous[at + 2] = unit.z;
      this.previous[at + 3] = unit.hp;
    }
    this.observedTick = state.tick;
  }

  dispose(): void {
    this.disposed = true;
    this.group.removeFromParent();
    for (const pool of this.pools) pool.dispose();
    this.box.dispose();
    this.sphere.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    // Prepared undead geometry and source maps belong to the character cache.
  }
}
