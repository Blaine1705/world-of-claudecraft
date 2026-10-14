// Shared scenery detail, installed by the world renderer before scene build.
// The original mesh remains the visibility/reveal/occluder owner. Its child
// batches borrow the EXACT materials and vertex attributes and partition the
// original placements; no fog, light, shader or horizon setting is changed.
import * as THREE from 'three';
import { ZONES } from '../sim/data';
import {
  type BackgroundGpuQueue,
  GPU_WORK_PRIORITY,
  isGpuQueueShutdown,
} from './background_gpu_queue';
import { GFX, SCENERY_DETAIL_BANDS } from './gfx';
import { GHOST_HIDE_ATTRIBUTE } from './instanced_dither_fade';
import {
  inSceneryRegion,
  type SceneryDetailBands,
  sceneryDetailLevel,
} from './scenery_detail_core';
import { preserveSceneryShadow } from './scenery_detail_shadow';

interface ModelLevels {
  source: THREE.BufferGeometry;
  palm: boolean;
  indices: Map<number, THREE.BufferAttribute>;
}

interface Batch {
  mesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  level: number;
  slots: number[];
}

interface Entry {
  mesh: THREE.Mesh;
  source: THREE.BufferGeometry;
  model: ModelLevels;
  count: number;
  positions: Float32Array;
  eligible: Uint8Array;
  levels: Uint8Array;
  batches: Batch[];
  variants: Map<number, THREE.BufferGeometry>;
  radius: number;
  x: number;
  z: number;
  matrixVersion: number;
  colorVersion: number;
  hideVersion: number;
  readyLevels: number;
  restoreShadow: () => void;
}

const palmRegion = ZONES.find((zone) => zone.id === 'palmreach')!;
const peakRegion = ZONES.find((zone) => zone.id === 'thornpeak_heights')!;
let active: SceneryDetailSession | undefined;

function shell(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.attributes = { ...source.attributes };
  result.index = source.index;
  result.boundingBox = source.boundingBox;
  result.boundingSphere = source.boundingSphere;
  result.userData.sharedRendererResource = true;
  return result;
}

function disposeShell(geometry: THREE.BufferGeometry, source: THREE.BufferGeometry): void {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== GHOST_HIDE_ATTRIBUTE) geometry.deleteAttribute(name);
  }
  // Rendered shells own Three's GPU disposal listeners. They all leave
  // together; retain reduced indices so those listeners release their GPU
  // buffers. Repeated removes are safe. Never delete the borrowed base index.
  if (geometry.index === source.index) geometry.index = null;
  geometry.dispose();
}

function visibleInTree(mesh: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = mesh; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

export class SceneryDetailSession {
  private entries: Entry[] = [];
  private models: ModelLevels[] = [];
  private registered = new WeakSet<THREE.Object3D>();
  private disposed = false;
  private pending = new Set<Promise<void>>();
  private readonly wanted: number[];

  constructor(
    private readonly queue: Pick<BackgroundGpuQueue, 'run'>,
    private readonly bands: SceneryDetailBands,
  ) {
    this.wanted = [...new Set(bands)].filter((level) => level > 0);
  }

  private modelFor(source: THREE.BufferGeometry, palm: boolean): ModelLevels {
    // Ghost geometry shells share their source's attribute/index objects.
    let model = this.models.find(
      (entry) =>
        entry.palm === palm &&
        entry.source.index === source.index &&
        entry.source.attributes.position === source.attributes.position,
    );
    if (model) return model;
    model = { source, palm, indices: new Map() };
    this.models.push(model);
    const own = model;
    const job = (async () => {
      // A disabled pilot must not load or initialize the simplifier's WASM.
      const { buildSceneryDetailIndex, scenerySimplifierReady } = await import(
        './scenery_detail_indices'
      );
      await scenerySimplifierReady;
      for (const level of this.wanted) {
        if (this.disposed) return;
        await this.queue.run(
          () => {
            if (this.disposed) return;
            const index = buildSceneryDetailIndex(source, level, palm);
            own.indices.set(level, index);
          },
          GPU_WORK_PRIORITY.BACKGROUND,
          `scenery-index:${source.id}:${level}`,
        );
      }
    })().catch((error: unknown) => {
      if (!this.disposed && !isGpuQueueShutdown(error))
        console.warn('[scenery-detail] retained full geometry', error);
    });
    this.pending.add(job);
    void job.finally(() => this.pending.delete(job));
    return model;
  }

  /** Construction only, before the owner's normal compile/reveal gate. */
  prepare(mesh: THREE.Mesh, regional = true): void {
    if (this.disposed || this.registered.has(mesh)) return;
    const source = mesh.geometry;
    const material = mesh.material;
    if (
      !source?.attributes.position ||
      Array.isArray(material) ||
      material.transparent ||
      (mesh as THREE.SkinnedMesh).isSkinnedMesh ||
      source.groups.length ||
      Object.keys(source.morphAttributes).length ||
      source.drawRange.start !== 0 ||
      source.drawRange.count !== Infinity ||
      (source.index?.count ?? source.attributes.position.count) < 96
    )
      return;
    for (const [name, attribute] of Object.entries(source.attributes)) {
      if (
        (attribute as THREE.InstancedBufferAttribute).isInstancedBufferAttribute &&
        name !== GHOST_HIDE_ATTRIBUTE
      )
        return;
    }
    mesh.updateWorldMatrix(true, false);
    if (!source.boundingBox) source.computeBoundingBox();
    if (!source.boundingSphere) source.computeBoundingSphere();
    const instanced = mesh as THREE.InstancedMesh;
    const count = instanced.isInstancedMesh ? instanced.count : 1;
    const positions = new Float32Array(count * 2);
    const eligible = new Uint8Array(count);
    const matrix = new THREE.Matrix4();
    let any = false,
      palm = false;
    for (let i = 0; i < count; i++) {
      if (instanced.isInstancedMesh) {
        instanced.getMatrixAt(i, matrix);
        matrix.premultiply(mesh.matrixWorld);
      } else matrix.copy(mesh.matrixWorld);
      const x = matrix.elements[12],
        z = matrix.elements[14];
      positions[i * 2] = x;
      positions[i * 2 + 1] = z;
      const inPalm = inSceneryRegion(x, z, palmRegion);
      eligible[i] = !regional || inPalm || inSceneryRegion(x, z, peakRegion) ? 1 : 0;
      any ||= eligible[i] === 1;
      palm ||= inPalm;
    }
    if (!any) return;
    // A crossing batch keeps the ordinary reduction. Palm-only batches get
    // its stronger crown budget, never neighbouring placements by camera zone.
    const palmOnly =
      palm &&
      Array.from({ length: count }, (_, i) =>
        inSceneryRegion(positions[i * 2], positions[i * 2 + 1], palmRegion),
      ).every(Boolean);
    const model = this.modelFor(source, palmOnly && /Leaves|Atlas|tripo/.test(material.name));
    const entry: Entry = {
      mesh,
      source,
      model,
      count,
      positions,
      eligible,
      levels: new Uint8Array(count),
      batches: [],
      variants: new Map(),
      radius: 0,
      x: NaN,
      z: NaN,
      matrixVersion: -1,
      colorVersion: -1,
      hideVersion: -1,
      readyLevels: -1,
      restoreShadow: preserveSceneryShadow(mesh, source, count),
    };
    if (instanced.isInstancedMesh) {
      instanced.computeBoundingBox();
      instanced.computeBoundingSphere();
      for (const level of [0, ...this.wanted]) {
        const geometry = shell(source);
        if (source.hasAttribute(GHOST_HIDE_ATTRIBUTE))
          geometry.setAttribute(
            GHOST_HIDE_ATTRIBUTE,
            new THREE.InstancedBufferAttribute(new Float32Array(count), 1),
          );
        const child = new THREE.InstancedMesh(geometry, material, count);
        child.name = `scenery-detail:${level}`;
        child.count = 0;
        child.visible = false;
        if (instanced.instanceColor)
          child.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
        child.boundingBox = instanced.boundingBox?.clone() ?? null;
        child.boundingSphere = instanced.boundingSphere?.clone() ?? null;
        child.castShadow = false;
        preserveSceneryShadow(child, geometry, 0);
        child.receiveShadow = mesh.receiveShadow;
        child.frustumCulled = mesh.frustumCulled;
        child.layers.mask = mesh.layers.mask;
        child.renderOrder = mesh.renderOrder;
        mesh.add(child);
        entry.batches.push({ mesh: child, geometry, level, slots: [] });
      }
    } else {
      // Landmarks use their whole footprint, not their trunk origin.
      const box = new THREE.Box3().setFromObject(mesh);
      entry.positions[0] = (box.min.x + box.max.x) / 2;
      entry.positions[1] = (box.min.z + box.max.z) / 2;
      entry.radius = Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
      for (const level of this.wanted) entry.variants.set(level, shell(source));
    }
    this.registered.add(mesh);
    this.entries.push(entry);
  }

  prepareRoot(root: THREE.Object3D, landmarksOnly = false): void {
    root.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (landmarksOnly) {
        let placement: THREE.Object3D = mesh;
        while (placement.parent && placement.parent !== root) placement = placement.parent;
        if (!placement.getObjectByName('TwistedTree_1')) return;
      }
      meshes.push(mesh);
    });
    for (const mesh of meshes) {
      // This first slice covers standing scenery, not merged paving, water or
      // broad ground strips. Those keep their existing representations.
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      if (!bounds) continue;
      const size = bounds.getSize(new THREE.Vector3());
      if (size.y <= 0 || size.x <= 0 || size.z <= 0) continue;
      this.prepare(mesh, false);
    }
  }

  ownsMesh(mesh: THREE.Object3D): boolean {
    return this.registered.has(mesh);
  }

  update(x: number, z: number): void {
    if (this.disposed) return;
    for (const entry of this.entries) {
      if (!visibleInTree(entry.mesh)) continue;
      const source = entry.mesh as THREE.InstancedMesh;
      const hide = entry.source.getAttribute(GHOST_HIDE_ATTRIBUTE) as
        | THREE.InstancedBufferAttribute
        | undefined;
      const matrixVersion = source.instanceMatrix?.version ?? 0;
      const colorVersion = source.instanceColor?.version ?? 0;
      const hideVersion = hide?.version ?? 0;
      if (
        entry.x === x &&
        entry.z === z &&
        entry.matrixVersion === matrixVersion &&
        entry.colorVersion === colorVersion &&
        entry.hideVersion === hideVersion &&
        entry.readyLevels === entry.model.indices.size
      )
        continue;
      let changed =
        entry.matrixVersion !== matrixVersion ||
        entry.colorVersion !== colorVersion ||
        entry.hideVersion !== hideVersion ||
        entry.readyLevels !== entry.model.indices.size;
      entry.x = x;
      entry.z = z;
      entry.matrixVersion = matrixVersion;
      entry.colorVersion = colorVersion;
      entry.hideVersion = hideVersion;
      entry.readyLevels = entry.model.indices.size;
      for (const batch of entry.batches) batch.slots.length = 0;
      for (let i = 0; i < entry.count; i++) {
        const distance = Math.max(
          0,
          Math.hypot(x - entry.positions[i * 2], z - entry.positions[i * 2 + 1]) - entry.radius,
        );
        let level = entry.eligible[i]
          ? sceneryDetailLevel(distance, entry.levels[i], this.bands)
          : 0;
        if (level && !entry.model.indices.has(level)) level = 0;
        changed ||= entry.levels[i] !== level;
        entry.levels[i] = level;
        if (source.isInstancedMesh)
          entry.batches.find((batch) => batch.level === level)!.slots.push(i);
        else {
          const geometry = entry.variants.get(level) ?? entry.source;
          const index = entry.model.indices.get(level);
          if (index) geometry.index = index;
          entry.mesh.geometry = geometry;
        }
      }
      if (!source.isInstancedMesh || !changed) continue;
      for (const batch of entry.batches) {
        const target = batch.mesh;
        const index = entry.model.indices.get(batch.level);
        if (index) batch.geometry.index = index;
        target.count = batch.slots.length;
        target.visible = target.count > 0;
        const targetHide = batch.geometry.getAttribute(GHOST_HIDE_ATTRIBUTE) as
          | THREE.InstancedBufferAttribute
          | undefined;
        for (let j = 0; j < batch.slots.length; j++) {
          const i = batch.slots[j];
          for (let k = 0; k < 16; k++)
            target.instanceMatrix.array[j * 16 + k] = source.instanceMatrix.array[i * 16 + k];
          if (source.instanceColor && target.instanceColor)
            for (let k = 0; k < 3; k++)
              target.instanceColor.array[j * 3 + k] = source.instanceColor.array[i * 3 + k];
          if (hide && targetHide) targetHide.array[j] = hide.array[i];
        }
        if (target.count) {
          target.instanceMatrix.needsUpdate = true;
          if (target.instanceColor) target.instanceColor.needsUpdate = true;
          if (targetHide) targetHide.needsUpdate = true;
        }
      }
      source.count = 0;
    }
  }

  async settled(): Promise<void> {
    await Promise.all(this.pending);
  }

  snapshot(): {
    entries: number;
    models: number;
    pending: number;
    levels: number[];
    indexBytes: number;
  } {
    const levels = [0, 0, 0, 0, 0, 0];
    for (const entry of this.entries) for (const level of entry.levels) levels[level]++;
    return {
      entries: this.entries.length,
      models: this.models.length,
      pending: this.pending.size,
      levels,
      indexBytes: this.models.reduce(
        (n, model) =>
          n + [...model.indices.values()].reduce((sum, index) => sum + index.array.byteLength, 0),
        0,
      ),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries) {
      entry.restoreShadow();
      entry.mesh.geometry = entry.source;
      if ((entry.mesh as THREE.InstancedMesh).isInstancedMesh)
        (entry.mesh as THREE.InstancedMesh).count = entry.count;
      for (const batch of entry.batches) {
        batch.mesh.removeFromParent();
        batch.mesh.dispose();
        disposeShell(batch.geometry, entry.source);
      }
      for (const geometry of entry.variants.values()) disposeShell(geometry, entry.source);
    }
    this.entries.length = 0;
    this.models.length = 0;
  }
}

export function installSceneryDetail(queue: Pick<BackgroundGpuQueue, 'run'>): void {
  disposeSceneryDetail();
  if (GFX.sceneryDetail) active = new SceneryDetailSession(queue, SCENERY_DETAIL_BANDS[GFX.tier]);
}
export function prepareSceneryDetailMesh(mesh: THREE.Mesh): void {
  active?.prepare(mesh);
}
export function prepareSceneryDetailRoot(root: THREE.Object3D, landmarksOnly = false): void {
  active?.prepareRoot(root, landmarksOnly);
}
export function isSceneryDetailMesh(mesh: THREE.Object3D): boolean {
  return active?.ownsMesh(mesh) ?? false;
}
export function updateSceneryDetail(x: number, z: number): void {
  active?.update(x, z);
}
export function sceneryDetailSnapshot(): ReturnType<SceneryDetailSession['snapshot']> | null {
  return active?.snapshot() ?? null;
}
export function disposeSceneryDetail(): void {
  active?.dispose();
  active = undefined;
}
