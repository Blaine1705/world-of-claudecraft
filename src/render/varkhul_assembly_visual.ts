// Master's Assembly spatial interface. Ten player-owned runes surround the
// room; exact inner and outer control zones stay visible on every graphics tier.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  type ActiveVarkhulAssembly,
  VARKHUL_ASSEMBLY_RUNE_COUNT,
  VARKHUL_ASSEMBLY_RUNE_GLYPH_ORBIT,
  VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_TARGET_ORBIT,
} from '../sim/varkhul_assembly';

const SYMBOL_COLORS = [
  0x47d7ff, 0xff4ecb, 0xffd23f, 0x68ff72, 0xb578ff, 0xff812d, 0x4b79ff, 0xff4d50, 0xa8ff3d,
  0xf4f1ff,
] as const;
const GROUND_LIFT = 0.08;

interface AssemblyVisual {
  root: THREE.Group;
  forge: THREE.Group;
  forgeSegments: THREE.Mesh[];
  barrierMaterial: THREE.MeshBasicMaterial;
  cores: Map<string, THREE.Group>;
  runes: RuneVisual[];
  phase: number;
}

interface RuneVisual {
  root: THREE.Group;
  target: THREE.Group;
  rotor: THREE.Group;
  inner: THREE.Mesh;
  outer: THREE.Mesh;
  socket: THREE.Mesh;
  embers: THREE.InstancedMesh;
  lock: THREE.Group;
}

function additive(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function floorGeometry(geometry: THREE.BufferGeometry, y = 0): THREE.BufferGeometry {
  return geometry.rotateX(-Math.PI / 2).translate(0, y, 0);
}

function polygon(points: readonly [number, number][]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function regularPolygon(points: number, radius: number, rotation = -Math.PI / 2): THREE.Shape {
  return polygon(
    Array.from({ length: points }, (_, index) => {
      const angle = rotation + (index / points) * Math.PI * 2;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius] as [number, number];
    }),
  );
}

function symbolShape(symbol: number, radius = 1): THREE.Shape {
  switch (Math.max(0, Math.floor(symbol)) % VARKHUL_ASSEMBLY_RUNE_COUNT) {
    case 0: {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
      return shape;
    }
    case 1:
      return regularPolygon(3, radius);
    case 2:
      return regularPolygon(5, radius);
    case 3:
      return regularPolygon(4, radius);
    case 4:
      return polygon(
        Array.from({ length: 10 }, (_, index) => {
          const angle = -Math.PI / 2 + (index / 10) * Math.PI * 2;
          const pointRadius = index % 2 === 0 ? radius : radius * 0.42;
          return [Math.cos(angle) * pointRadius, Math.sin(angle) * pointRadius] as [number, number];
        }),
      );
    case 5:
      return regularPolygon(6, radius);
    case 6:
      return polygon([
        [-radius, radius * 0.72],
        [0, -radius],
        [radius, radius * 0.72],
        [radius * 0.42, radius],
        [0, -radius * 0.18],
        [-radius * 0.42, radius],
      ]);
    case 7:
      return polygon([
        [-radius * 0.28, -radius],
        [radius * 0.28, -radius],
        [radius * 0.28, -radius * 0.28],
        [radius, -radius * 0.28],
        [radius, radius * 0.28],
        [radius * 0.28, radius * 0.28],
        [radius * 0.28, radius],
        [-radius * 0.28, radius],
        [-radius * 0.28, radius * 0.28],
        [-radius, radius * 0.28],
        [-radius, -radius * 0.28],
        [-radius * 0.28, -radius * 0.28],
      ]);
    case 8:
      return polygon([
        [-radius, -radius],
        [radius, -radius],
        [radius * 0.28, 0],
        [radius, radius],
        [-radius, radius],
        [-radius * 0.28, 0],
      ]);
    default:
      return polygon([
        [-radius * 0.2, -radius],
        [radius * 0.72, -radius * 0.18],
        [radius * 0.16, -radius * 0.08],
        [radius * 0.38, radius],
        [-radius * 0.76, radius * 0.02],
        [-radius * 0.12, -radius * 0.08],
      ]);
  }
}

export function buildVarkhulRuneSymbol(symbol: number, radius = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(symbolShape(symbol, radius)),
    additive(SYMBOL_COLORS[symbol % SYMBOL_COLORS.length], 0.94),
  );
  mesh.userData.symbol = symbol;
  return mesh;
}

function mergeFloorGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geometries.map((geometry) =>
    geometry.index === null ? geometry : geometry.toNonIndexed(),
  );
  const merged = mergeGeometries(nonIndexed, false);
  if (!merged) throw new Error('Varkhul rune floor geometry could not be merged');
  return merged;
}

export function buildVarkhulRuneControlArrowGeometry(
  control: 'counterclockwise' | 'clockwise',
): THREE.BufferGeometry {
  const direction = control === 'counterclockwise' ? -1 : 1;
  const arrow = polygon(
    [
      [-0.46, -0.13],
      [0.08, -0.13],
      [0.08, -0.34],
      [0.5, 0],
      [0.08, 0.34],
      [0.08, 0.13],
      [-0.46, 0.13],
    ].map(([x, y]) => [x * direction, y] as [number, number]),
  );
  const geometry = floorGeometry(new THREE.ShapeGeometry(arrow).scale(0.88, 0.88, 0.88), 0.035);
  if (control === 'clockwise') {
    geometry.translate(
      0,
      0,
      (VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS +
        VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS) /
        2,
    );
  }
  return geometry;
}

function buildForge(): {
  group: THREE.Group;
  segments: THREE.Mesh[];
  barrier: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  group.name = 'varkhul-assembly-forge';
  const barrier = additive(0xff6b13, 0.54);
  const ring = new THREE.Mesh(floorGeometry(new THREE.RingGeometry(3.15, 3.55, 64), 0.12), barrier);
  ring.name = 'varkhul-assembly-forge-boundary';
  group.add(ring);

  const segments: THREE.Mesh[] = [];
  for (let index = 0; index < 10; index++) {
    const segment = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.22, 0.1),
      additive(0xffb21f, 0.96),
    );
    segment.name = `varkhul-assembly-forge-health-${index}`;
    segment.position.set(-2.34 + index * 0.52, 5.6, 0);
    group.add(segment);
    const cross = segment.clone();
    cross.rotation.y = Math.PI / 2;
    cross.name = `varkhul-assembly-forge-health-cross-${index}`;
    group.add(cross);
    segments.push(segment, cross);
  }
  return { group, segments, barrier };
}

function buildCore(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'varkhul-molten-core';
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.64, 1), additive(0xfff0a0, 1));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.92, 1), additive(0xff3a06, 0.62));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.08, 8, 28), additive(0xffb52d, 0.84));
  ring.rotation.x = Math.PI / 2;
  group.add(core, shell, ring);
  return group;
}

function buildRune(symbol: number): RuneVisual {
  const color = SYMBOL_COLORS[symbol];
  const group = new THREE.Group();
  group.name = `varkhul-rune-${symbol}`;
  group.userData.renderCategory = 'ui3d';
  group.userData.actionable = true;
  group.userData.symbol = symbol;
  group.userData.innerControlRadius = VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS;
  group.userData.outerControlInnerRadius = VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS;
  group.userData.outerControlOuterRadius = VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS;

  const backing = new THREE.Mesh(
    floorGeometry(new THREE.CircleGeometry(VARKHUL_ASSEMBLY_RUNE_RADIUS, 64), 0),
    new THREE.MeshBasicMaterial({
      color: 0x130805,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  backing.name = 'varkhul-rune-backing';
  backing.renderOrder = 3;

  const fieldLines = new THREE.Mesh(
    mergeFloorGeometries([
      floorGeometry(
        new THREE.RingGeometry(
          VARKHUL_ASSEMBLY_RUNE_RADIUS - 0.1,
          VARKHUL_ASSEMBLY_RUNE_RADIUS,
          64,
        ),
        0.025,
      ),
      floorGeometry(
        new THREE.RingGeometry(
          VARKHUL_ASSEMBLY_RUNE_GLYPH_ORBIT - 0.09,
          VARKHUL_ASSEMBLY_RUNE_GLYPH_ORBIT + 0.09,
          64,
        ),
        0.05,
      ),
    ]),
    additive(color, 0.75),
  );
  fieldLines.name = 'varkhul-rune-field-lines';
  fieldLines.renderOrder = 5;

  const inner = new THREE.Mesh(
    mergeFloorGeometries([
      floorGeometry(
        new THREE.CircleGeometry(VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS, 56),
        0.018,
      ),
      buildVarkhulRuneControlArrowGeometry('counterclockwise'),
    ]),
    additive(color, 0.3),
  );
  inner.name = 'varkhul-rune-control-counterclockwise';
  inner.userData.control = 'counterclockwise';
  inner.renderOrder = 4;

  const outer = new THREE.Mesh(
    mergeFloorGeometries([
      floorGeometry(
        new THREE.RingGeometry(
          VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS,
          VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS,
          64,
        ),
        0.018,
      ),
      buildVarkhulRuneControlArrowGeometry('clockwise'),
    ]),
    additive(color, 0.3),
  );
  outer.name = 'varkhul-rune-control-clockwise';
  outer.userData.control = 'clockwise';
  outer.renderOrder = 4;

  const target = new THREE.Group();
  target.name = 'varkhul-rune-target';
  const targetRim = new THREE.Mesh(
    mergeFloorGeometries([
      floorGeometry(new THREE.RingGeometry(0.5, 0.67, 48), 0.07),
      floorGeometry(new THREE.ShapeGeometry(symbolShape(symbol, 0.32)), 0.075),
      new THREE.TorusGeometry(0.8, 0.055, 8, 36).rotateX(Math.PI / 2).translate(0, 0.28, 0),
    ]),
    additive(color, 0.92),
  );
  targetRim.name = 'varkhul-rune-target-socket';
  targetRim.renderOrder = 8;
  target.add(targetRim);

  const rotor = new THREE.Group();
  rotor.name = 'varkhul-rune-rotor';
  const glyph = new THREE.Mesh(
    mergeFloorGeometries([
      floorGeometry(new THREE.ShapeGeometry(symbolShape(symbol, 0.64)), 0.12),
      new THREE.OctahedronGeometry(0.25, 0).translate(0, 0.52, 0),
    ]),
    additive(color, 0.96),
  );
  glyph.name = 'varkhul-rune-moving-glyph';
  glyph.renderOrder = 8;
  const embers = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.075, 0),
    additive(color, 0.78),
    6,
  );
  embers.name = 'varkhul-rune-embers';
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 6; index++) {
    const angle = (index / 6) * Math.PI * 2;
    matrix.makeTranslation(
      Math.sin(angle) * 0.78,
      0.25 + (index % 2) * 0.22,
      Math.cos(angle) * 0.78,
    );
    embers.setMatrixAt(index, matrix);
  }
  embers.instanceMatrix.needsUpdate = true;
  rotor.add(glyph, embers);

  const lockBurst = new THREE.Group();
  lockBurst.name = 'varkhul-rune-lock-burst';
  lockBurst.visible = false;
  const lockGeometry = mergeFloorGeometries([
    new THREE.TorusGeometry(1.15, 0.08, 8, 48).rotateX(Math.PI / 2).translate(0, 0.22, 0),
    new THREE.CylinderGeometry(0.22, 0.72, 3.8, 16, 1, true).translate(0, 1.9, 0),
  ]);
  const lockEffect = new THREE.Mesh(lockGeometry, additive(0xffe49a, 0.72));
  lockEffect.name = 'varkhul-rune-lock-effect';
  lockBurst.add(lockEffect);

  group.add(backing, fieldLines, inner, outer, target, rotor, lockBurst);
  return {
    root: group,
    target,
    rotor,
    inner,
    outer,
    socket: targetRim,
    embers,
    lock: lockBurst,
  };
}

function disposeRoot(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
    if ('geometry' in mesh && mesh.geometry) mesh.geometry.dispose();
    if ('material' in mesh && mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    }
  });
  root.removeFromParent();
}

function createVisual(scene: THREE.Scene, bossId: number): AssemblyVisual {
  const root = new THREE.Group();
  root.name = `varkhul-assembly-${bossId}`;
  root.userData.renderCategory = 'ui3d';
  const forge = buildForge();
  root.add(forge.group);
  const runes = Array.from({ length: VARKHUL_ASSEMBLY_RUNE_COUNT }, (_, symbol) =>
    buildRune(symbol),
  );
  root.add(...runes.map((rune) => rune.root));
  scene.add(root);
  return {
    root,
    forge: forge.group,
    forgeSegments: forge.segments,
    barrierMaterial: forge.barrier,
    cores: new Map(),
    runes,
    phase: 0,
  };
}

/** Stages the complete Assembly material set when the Inner Crucible attaches. */
export function buildVarkhulAssemblyPrewarmVisual(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'varkhul-assembly-prewarm';
  const forge = buildForge();
  root.add(forge.group);
  for (let symbol = 0; symbol < VARKHUL_ASSEMBLY_RUNE_COUNT; symbol++) {
    const { root: rune } = buildRune(symbol);
    rune.position.set((symbol - 4.5) * 7.2, 0, 8);
    rune.traverse((child) => {
      child.visible = true;
    });
    root.add(rune);
  }
  const core = buildCore();
  core.position.set(0, 2, 2);
  root.add(core);
  return root;
}

export class VarkhulAssemblyVisuals {
  private readonly visuals = new Map<number, AssemblyVisual>();
  private readonly active = new Set<number>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
  ) {}

  sync(assemblies: readonly ActiveVarkhulAssembly[]): void {
    this.active.clear();
    for (const state of assemblies) {
      this.active.add(state.bossId);
      let visual = this.visuals.get(state.bossId);
      if (!visual) {
        visual = createVisual(this.scene, state.bossId);
        this.visuals.set(state.bossId, visual);
      }
      visual.root.userData.phase = state.phase;
      visual.forge.position.set(
        state.forgeX,
        this.groundY(state.forgeX, state.forgeZ),
        state.forgeZ,
      );
      const health = Math.ceil((state.forgeHp / Math.max(1, state.forgeMaxHp)) * 10);
      visual.forgeSegments.forEach((segment, index) => {
        segment.visible = Math.floor(index / 2) < health;
      });
      visual.barrierMaterial.color.setHex(state.phase === 'stunned' ? 0x54d9ff : 0xff6b13);
      visual.barrierMaterial.opacity = state.phase === 'stunned' ? 0.84 : 0.46;

      const activeCores = new Set<string>();
      for (const core of state.cores) {
        if (core.delivered) continue;
        activeCores.add(core.id);
        let coreVisual = visual.cores.get(core.id);
        if (!coreVisual) {
          coreVisual = buildCore();
          visual.root.add(coreVisual);
          visual.cores.set(core.id, coreVisual);
        }
        coreVisual.position.set(
          core.x,
          this.groundY(core.x, core.z) + (core.carrierId === null ? 1 : 3),
          core.z,
        );
      }
      for (const [id, core] of visual.cores) {
        if (activeCores.has(id)) continue;
        disposeRoot(core);
        visual.cores.delete(id);
      }

      for (const rune of state.runes) {
        const runeVisual = visual.runes[rune.symbol];
        runeVisual.root.visible = state.phase === 'links';
        runeVisual.root.position.set(rune.x, this.groundY(rune.x, rune.z) + GROUND_LIFT, rune.z);
        const color = SYMBOL_COLORS[rune.symbol];
        const target = runeVisual.target;
        target.position.set(
          Math.sin(rune.targetAngle) * VARKHUL_ASSEMBLY_RUNE_TARGET_ORBIT,
          0,
          Math.cos(rune.targetAngle) * VARKHUL_ASSEMBLY_RUNE_TARGET_ORBIT,
        );
        target.rotation.y = rune.targetAngle;
        const rotor = runeVisual.rotor;
        rotor.position.set(
          Math.sin(rune.glyphAngle) * VARKHUL_ASSEMBLY_RUNE_GLYPH_ORBIT,
          0,
          Math.cos(rune.glyphAngle) * VARKHUL_ASSEMBLY_RUNE_GLYPH_ORBIT,
        );
        rotor.rotation.y = rune.glyphAngle;
        const innerMaterial = runeVisual.inner.material as THREE.MeshBasicMaterial;
        const innerActive = rune.control === 'counterclockwise';
        innerMaterial.color.setHex(rune.locked || innerActive ? 0xffffff : color);
        innerMaterial.opacity = rune.assignedPlayerId === null ? 0.12 : innerActive ? 0.78 : 0.3;
        const outerMaterial = runeVisual.outer.material as THREE.MeshBasicMaterial;
        const outerActive = rune.control === 'clockwise';
        outerMaterial.color.setHex(rune.locked || outerActive ? 0xffffff : color);
        outerMaterial.opacity = rune.assignedPlayerId === null ? 0.12 : outerActive ? 0.78 : 0.3;
        const socket = runeVisual.socket;
        const socketMaterial = socket.material as THREE.MeshBasicMaterial;
        socketMaterial.color.setHex(rune.locked || rune.aligned ? 0xffffff : color);
        socketMaterial.opacity = rune.assignedPlayerId === null ? 0.18 : rune.aligned ? 1 : 0.92;
        runeVisual.lock.visible = rune.locked;
        rotor.visible = rune.assignedPlayerId !== null;
      }
    }
    for (const [bossId, visual] of this.visuals) {
      if (this.active.has(bossId)) continue;
      disposeRoot(visual.root);
      this.visuals.delete(bossId);
    }
  }

  update(dt: number, reducedMotion: boolean): void {
    for (const visual of this.visuals.values()) {
      if (!reducedMotion) visual.phase += Math.max(0, dt) * 3.5;
      const pulse = reducedMotion ? 1 : 1 + Math.sin(visual.phase) * 0.1;
      for (const core of visual.cores.values()) {
        core.rotation.y = reducedMotion ? 0 : visual.phase;
        core.scale.setScalar(pulse);
      }
      for (const rune of visual.runes) {
        rune.target.scale.setScalar(reducedMotion ? 1 : pulse);
        rune.embers.rotation.y = reducedMotion ? 0 : visual.phase * 0.7;
        if (rune.lock.visible) {
          rune.lock.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(visual.phase * 1.4) * 0.08);
        }
      }
      visual.forge.scale.setScalar(visual.root.userData.phase === 'stunned' ? 1 + pulse * 0.1 : 1);
    }
  }

  dispose(): void {
    for (const visual of this.visuals.values()) disposeRoot(visual.root);
    this.visuals.clear();
    this.active.clear();
  }
}
