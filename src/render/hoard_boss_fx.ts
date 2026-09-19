import * as THREE from 'three';
import type { HoardBossCueView } from '../world_api/dungeons';
import { attachSceneGroupGated } from './gated_scene_attach';
import { hoardCueVisualPlan } from './hoard_boss_fx_core';

const SLOT_COUNT = 8;
const SEGMENTS = 40;
const LIFT = 0.1;

interface CueSlot {
  group: THREE.Group;
  sweep: THREE.Group;
  markWarning: THREE.Group;
  markHazard: THREE.Group;
  countdown: THREE.Mesh;
  sweepFill: THREE.BufferGeometry;
  sweepBorder: THREE.BufferGeometry;
  markDisc: THREE.BufferGeometry;
  markRing: THREE.BufferGeometry;
  slashA: THREE.BufferGeometry;
  slashB: THREE.BufferGeometry;
  cue: HoardBossCueView | null;
  key: string;
  terrainSignature: string;
  serial: number;
}

function material(color: number, opacity: number, additive = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    opacity,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function geometry(vertexCount: number, indices: number[]): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
  result.setIndex(indices);
  return result;
}

function fanGeometry(): THREE.BufferGeometry {
  const indices: number[] = [];
  for (let index = 0; index < SEGMENTS; index++) indices.push(0, index + 1, index + 2);
  return geometry(SEGMENTS + 2, indices);
}

function ringGeometry(): THREE.BufferGeometry {
  const indices: number[] = [];
  for (let index = 0; index < SEGMENTS; index++) {
    const inner = index * 2;
    indices.push(inner, inner + 1, inner + 2, inner + 1, inner + 3, inner + 2);
  }
  return geometry((SEGMENTS + 1) * 2, indices);
}

function wedgeBorderGeometry(): THREE.BufferGeometry {
  const indices: number[] = [];
  for (let index = 0; index < SEGMENTS; index++) {
    const inner = index * 2;
    indices.push(inner, inner + 1, inner + 2, inner + 1, inner + 3, inner + 2);
  }
  const sides = (SEGMENTS + 1) * 2;
  indices.push(sides, sides + 1, sides + 2, sides + 1, sides + 3, sides + 2);
  indices.push(sides + 4, sides + 5, sides + 6, sides + 5, sides + 7, sides + 6);
  return geometry(sides + 8, indices);
}

function quadGeometry(): THREE.BufferGeometry {
  return geometry(4, [0, 1, 2, 1, 3, 2]);
}

function positionAttribute(target: THREE.BufferGeometry): THREE.BufferAttribute {
  return target.getAttribute('position') as THREE.BufferAttribute;
}

function setLocalVertex(
  attribute: THREE.BufferAttribute,
  index: number,
  dx: number,
  dz: number,
  centerY: number,
  x: number,
  z: number,
  groundY: (x: number, z: number) => number,
): void {
  attribute.setXYZ(index, dx, groundY(x + dx, z + dz) - centerY + LIFT, dz);
}

function writeDisc(
  target: THREE.BufferGeometry,
  cue: HoardBossCueView,
  centerY: number,
  groundY: (x: number, z: number) => number,
): void {
  const position = positionAttribute(target);
  setLocalVertex(position, 0, 0, 0, centerY, cue.x, cue.z, groundY);
  for (let index = 0; index <= SEGMENTS; index++) {
    const angle = (index / SEGMENTS) * Math.PI * 2;
    setLocalVertex(
      position,
      index + 1,
      Math.cos(angle) * cue.radius * 0.82,
      Math.sin(angle) * cue.radius * 0.82,
      centerY,
      cue.x,
      cue.z,
      groundY,
    );
  }
  position.needsUpdate = true;
  target.computeBoundingSphere();
}

function writeRing(
  target: THREE.BufferGeometry,
  cue: HoardBossCueView,
  centerY: number,
  groundY: (x: number, z: number) => number,
): void {
  const position = positionAttribute(target);
  for (let index = 0; index <= SEGMENTS; index++) {
    const angle = (index / SEGMENTS) * Math.PI * 2;
    for (let edge = 0; edge < 2; edge++) {
      const radius = cue.radius * (edge === 0 ? 0.84 : 1);
      setLocalVertex(
        position,
        index * 2 + edge,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        centerY,
        cue.x,
        cue.z,
        groundY,
      );
    }
  }
  position.needsUpdate = true;
  target.computeBoundingSphere();
}

function writeSlash(
  target: THREE.BufferGeometry,
  cue: HoardBossCueView,
  angle: number,
  centerY: number,
  groundY: (x: number, z: number) => number,
): void {
  const position = positionAttribute(target);
  const length = cue.radius * 0.86;
  const width = cue.radius * 0.11;
  const alongX = Math.sin(angle) * length;
  const alongZ = Math.cos(angle) * length;
  const sideX = Math.cos(angle) * width;
  const sideZ = -Math.sin(angle) * width;
  const vertices = [
    [-alongX - sideX, -alongZ - sideZ],
    [-alongX + sideX, -alongZ + sideZ],
    [alongX - sideX, alongZ - sideZ],
    [alongX + sideX, alongZ + sideZ],
  ];
  for (let index = 0; index < vertices.length; index++) {
    const [dx, dz] = vertices[index];
    setLocalVertex(position, index, dx, dz, centerY, cue.x, cue.z, groundY);
  }
  position.needsUpdate = true;
  target.computeBoundingSphere();
}

function writeWedge(
  fill: THREE.BufferGeometry,
  border: THREE.BufferGeometry,
  cue: HoardBossCueView,
  centerY: number,
  groundY: (x: number, z: number) => number,
): void {
  const facing = cue.facing ?? 0;
  const halfAngle = cue.halfAngle ?? 0;
  const fillPosition = positionAttribute(fill);
  setLocalVertex(fillPosition, 0, 0, 0, centerY, cue.x, cue.z, groundY);
  for (let index = 0; index <= SEGMENTS; index++) {
    const angle = facing - halfAngle + (index / SEGMENTS) * halfAngle * 2;
    setLocalVertex(
      fillPosition,
      index + 1,
      Math.sin(angle) * cue.radius,
      Math.cos(angle) * cue.radius,
      centerY,
      cue.x,
      cue.z,
      groundY,
    );
  }
  fillPosition.needsUpdate = true;
  fill.computeBoundingSphere();

  const borderPosition = positionAttribute(border);
  for (let index = 0; index <= SEGMENTS; index++) {
    const angle = facing - halfAngle + (index / SEGMENTS) * halfAngle * 2;
    for (let edge = 0; edge < 2; edge++) {
      const radius = cue.radius * (edge === 0 ? 0.94 : 1);
      setLocalVertex(
        borderPosition,
        index * 2 + edge,
        Math.sin(angle) * radius,
        Math.cos(angle) * radius,
        centerY,
        cue.x,
        cue.z,
        groundY,
      );
    }
  }
  const firstSide = (SEGMENTS + 1) * 2;
  for (let side = 0; side < 2; side++) {
    const angle = facing + (side === 0 ? -halfAngle : halfAngle);
    const tangentX = Math.cos(angle) * cue.radius * 0.025;
    const tangentZ = -Math.sin(angle) * cue.radius * 0.025;
    const endX = Math.sin(angle) * cue.radius;
    const endZ = Math.cos(angle) * cue.radius;
    const vertices = [
      [-tangentX, -tangentZ],
      [tangentX, tangentZ],
      [endX - tangentX, endZ - tangentZ],
      [endX + tangentX, endZ + tangentZ],
    ];
    for (let index = 0; index < vertices.length; index++) {
      const [dx, dz] = vertices[index];
      setLocalVertex(
        borderPosition,
        firstSide + side * 4 + index,
        dx,
        dz,
        centerY,
        cue.x,
        cue.z,
        groundY,
      );
    }
  }
  borderPosition.needsUpdate = true;
  border.computeBoundingSphere();
}

/** Pooled, terrain-draped presentation for the Hoard boss's actionable cues. */
export class HoardBossFx {
  readonly readyForEntry: Promise<void>;
  private readonly root = new THREE.Group();
  private readonly slots: CueSlot[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[];
  private disposed = false;
  private serial = 0;

  constructor(
    scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
    compileGate?: (target: THREE.Object3D) => Promise<unknown>,
  ) {
    this.root.name = 'hoard-boss-actionable-cues';
    this.root.userData.renderCategory = 'ui3d';
    this.root.userData.actionable = true;

    const sweepFillMaterial = material(0xc75a16, 0.28);
    const sweepEdgeMaterial = material(0xffc44d, 0.95, true);
    const markFillMaterial = material(0xd56b12, 0.24);
    const markGoldMaterial = material(0xffcf55, 0.96, true);
    const markCountdownMaterial = material(0xffa52f, 0.34, true);
    const hazardFillMaterial = material(0x7f1e0d, 0.38);
    const hazardEdgeMaterial = material(0xff6b20, 0.8, true);
    this.materials = [
      sweepFillMaterial,
      sweepEdgeMaterial,
      markFillMaterial,
      markGoldMaterial,
      markCountdownMaterial,
      hazardFillMaterial,
      hazardEdgeMaterial,
    ];

    for (let index = 0; index < SLOT_COUNT; index++) {
      const sweepFill = fanGeometry();
      const sweepBorder = wedgeBorderGeometry();
      const markDisc = fanGeometry();
      const markRing = ringGeometry();
      const slashA = quadGeometry();
      const slashB = quadGeometry();
      this.geometries.push(sweepFill, sweepBorder, markDisc, markRing, slashA, slashB);

      const group = new THREE.Group();
      group.name = `hoard-boss-cue-${index}`;
      const sweep = new THREE.Group();
      sweep.name = 'hoard-boss-sweep';
      const sweepArea = new THREE.Mesh(sweepFill, sweepFillMaterial);
      const sweepRim = new THREE.Mesh(sweepBorder, sweepEdgeMaterial);
      sweepArea.renderOrder = 18;
      sweepRim.renderOrder = 20;
      sweep.add(sweepArea, sweepRim);

      const markWarning = new THREE.Group();
      markWarning.name = 'hoard-boss-mark-warning';
      const warningFill = new THREE.Mesh(markDisc, markFillMaterial);
      const countdown = new THREE.Mesh(markDisc, markCountdownMaterial);
      const warningRing = new THREE.Mesh(markRing, markGoldMaterial);
      const warningSlashA = new THREE.Mesh(slashA, markGoldMaterial);
      const warningSlashB = new THREE.Mesh(slashB, markGoldMaterial);
      warningFill.renderOrder = 18;
      countdown.renderOrder = 19;
      warningRing.renderOrder = 20;
      warningSlashA.renderOrder = 21;
      warningSlashB.renderOrder = 21;
      markWarning.add(warningFill, countdown, warningRing, warningSlashA, warningSlashB);

      const markHazard = new THREE.Group();
      markHazard.name = 'hoard-boss-mark-hazard';
      const hazardFill = new THREE.Mesh(markDisc, hazardFillMaterial);
      const hazardRing = new THREE.Mesh(markRing, hazardEdgeMaterial);
      const hazardSlashA = new THREE.Mesh(slashA, hazardEdgeMaterial);
      const hazardSlashB = new THREE.Mesh(slashB, hazardEdgeMaterial);
      hazardFill.renderOrder = 18;
      hazardRing.renderOrder = 20;
      hazardSlashA.renderOrder = 21;
      hazardSlashB.renderOrder = 21;
      markHazard.add(hazardFill, hazardRing, hazardSlashA, hazardSlashB);

      group.add(sweep, markWarning, markHazard);
      this.root.add(group);
      this.slots.push({
        group,
        sweep,
        markWarning,
        markHazard,
        countdown,
        sweepFill,
        sweepBorder,
        markDisc,
        markRing,
        slashA,
        slashB,
        cue: null,
        key: '',
        terrainSignature: '',
        serial: 0,
      });
    }

    this.readyForEntry = attachSceneGroupGated(scene, this.root, compileGate, () => this.disposed)
      .then(() => {
        for (const slot of this.slots) this.syncSlot(slot);
      })
      .catch(() => {});
  }

  sync(cues: readonly HoardBossCueView[]): void {
    const seen = new Set<string>();
    for (const cue of cues) {
      const key = `${cue.instanceId}:${cue.cueId}`;
      seen.add(key);
      let slot = this.slots.find((candidate) => candidate.key === key);
      if (!slot) {
        slot =
          this.slots.find((candidate) => candidate.cue === null) ??
          this.slots.reduce((oldest, candidate) =>
            candidate.serial < oldest.serial ? candidate : oldest,
          );
        slot.key = key;
        slot.serial = ++this.serial;
        slot.terrainSignature = '';
      }
      slot.cue = { ...cue };
      this.syncSlot(slot);
    }
    for (const slot of this.slots) {
      if (!slot.cue || seen.has(slot.key)) continue;
      slot.cue = null;
      slot.key = '';
      slot.terrainSignature = '';
      this.syncSlot(slot);
    }
  }

  update(_dt: number): void {
    for (const slot of this.slots) {
      const cue = slot.cue;
      if (!cue) continue;
      const elapsed = Math.max(0, cue.total - cue.remaining);
      const plan = hoardCueVisualPlan(cue.remaining, cue.total, elapsed);
      if (cue.kind === 'sweep') {
        slot.sweep.scale.set(plan.pulseScale, 1, plan.pulseScale);
      } else if (cue.phase === 'warning') {
        slot.markWarning.scale.set(plan.pulseScale, 1, plan.pulseScale);
        slot.countdown.scale.set(plan.countdownScale, 1, plan.countdownScale);
      } else {
        const pulse = 1 + Math.sin(elapsed * 5) * 0.025;
        slot.markHazard.scale.set(pulse, 1, pulse);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const ownedGeometry of this.geometries) ownedGeometry.dispose();
    for (const ownedMaterial of this.materials) ownedMaterial.dispose();
  }

  private syncSlot(slot: CueSlot): void {
    const cue = slot.cue;
    slot.group.visible = cue !== null;
    if (!cue) return;
    const centerY = this.groundY(cue.x, cue.z);
    slot.group.position.set(cue.x, centerY, cue.z);
    slot.sweep.visible = cue.kind === 'sweep';
    slot.markWarning.visible = cue.kind === 'mark' && cue.phase === 'warning';
    slot.markHazard.visible = cue.kind === 'mark' && cue.phase === 'hazard';
    slot.sweep.scale.set(1, 1, 1);
    slot.markWarning.scale.set(1, 1, 1);
    slot.markHazard.scale.set(1, 1, 1);
    const signature = [
      cue.kind,
      cue.x,
      cue.z,
      cue.radius,
      cue.facing ?? 0,
      cue.halfAngle ?? 0,
    ].join(':');
    if (signature === slot.terrainSignature) return;
    slot.terrainSignature = signature;
    if (cue.kind === 'sweep') {
      writeWedge(slot.sweepFill, slot.sweepBorder, cue, centerY, this.groundY);
      slot.sweep.userData.halfAngle = cue.halfAngle;
      return;
    }
    writeDisc(slot.markDisc, cue, centerY, this.groundY);
    writeRing(slot.markRing, cue, centerY, this.groundY);
    writeSlash(slot.slashA, cue, Math.PI / 4, centerY, this.groundY);
    writeSlash(slot.slashB, cue, -Math.PI / 4, centerY, this.groundY);
  }
}
