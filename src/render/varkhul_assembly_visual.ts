// Master's Assembly spatial interface. Every actionable element lives in the
// world: forge health, carry cores, matching runes, and locks.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  type ActiveVarkhulAssembly,
  VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT,
  VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS,
  VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ANGLE,
  VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT,
  VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS,
  VARKHUL_ASSEMBLY_LINK_PAD_RADIUS,
  type VarkhulAssemblyHammerControl,
  type VarkhulAssemblyLinkRole,
} from '../sim/varkhul_assembly';

const SYMBOL_COLORS = [0x47d7ff, 0xff4ecb, 0xffd23f, 0x68ff72, 0xb578ff] as const;

function mergeFloorGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geometries.map((geometry) =>
    geometry.index === null ? geometry : geometry.toNonIndexed(),
  );
  const merged = mergeGeometries(nonIndexed, false);
  if (!merged) throw new Error('Varkhul Assembly floor geometry could not be merged');
  return merged;
}

interface AssemblyVisual {
  root: THREE.Group;
  forge: THREE.Group;
  forgeSegments: THREE.Mesh[];
  barrierMaterial: THREE.MeshBasicMaterial;
  cores: Map<string, THREE.Group>;
  pads: THREE.Group[];
  phase: number;
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

function traceSymbol(
  path: THREE.Shape | THREE.Path,
  symbol: number,
  radius: number,
  clockwise = false,
): void {
  if (symbol === 0) {
    path.absarc(0, 0, radius, 0, Math.PI * 2, clockwise);
    return;
  }
  const points = symbol === 1 ? 3 : symbol === 2 ? 4 : symbol === 3 ? 4 : 10;
  for (let index = 0; index < points; index++) {
    const pointIndex = clockwise ? points - 1 - index : index;
    const angle =
      -Math.PI / 2 + (pointIndex / points) * Math.PI * 2 + (symbol === 3 ? Math.PI / 4 : 0);
    const pointRadius = symbol === 4 && pointIndex % 2 === 1 ? radius * 0.42 : radius;
    const x = Math.cos(angle) * pointRadius;
    const y = Math.sin(angle) * pointRadius;
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
}

function symbolShape(symbol: number, radius = 1, hollow = false): THREE.Shape {
  const shape = new THREE.Shape();
  traceSymbol(shape, symbol, radius);
  if (hollow) {
    const hole = new THREE.Path();
    traceSymbol(hole, symbol, radius * 0.55, true);
    shape.holes.push(hole);
  }
  return shape;
}

export function buildVarkhulLinkSymbol(
  symbol: number,
  radius = 1,
  role: VarkhulAssemblyLinkRole = 'hammer',
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(symbolShape(symbol, radius, role === 'anvil')),
    additive(SYMBOL_COLORS[symbol % SYMBOL_COLORS.length], 0.9),
  );
  mesh.userData.symbol = symbol;
  mesh.userData.role = role;
  mesh.userData.hollow = role === 'anvil';
  return mesh;
}

function buildForge(): {
  group: THREE.Group;
  segments: THREE.Mesh[];
  barrier: THREE.MeshBasicMaterial;
} {
  const group = new THREE.Group();
  group.name = 'varkhul-assembly-forge';
  const barrier = additive(0xff6b13, 0.54);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.15, 3.55, 64).rotateX(-Math.PI / 2),
    barrier,
  );
  ring.name = 'varkhul-assembly-forge-boundary';
  ring.position.y = 0.12;
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

function buildPad(symbol: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `varkhul-link-pad-${symbol}`;
  group.userData.renderCategory = 'ui3d';
  group.userData.actionable = true;
  group.userData.symbol = symbol;
  group.userData.anvilTargetOrbit = VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT;
  group.userData.anvilTargetRadius = VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS;
  group.userData.hammerControlOrbit = VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT;
  group.userData.hammerControlRadius = VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS;
  const color = SYMBOL_COLORS[symbol];

  const footprint = new THREE.Mesh(
    new THREE.RingGeometry(
      VARKHUL_ASSEMBLY_LINK_PAD_RADIUS - 0.08,
      VARKHUL_ASSEMBLY_LINK_PAD_RADIUS,
      64,
    ).rotateX(-Math.PI / 2),
    additive(color, 0.22),
  );
  footprint.name = 'varkhul-link-pad-footprint';

  const target = new THREE.Group();
  target.name = 'varkhul-link-anvil-target';
  target.userData.radius = VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS;
  const targetRimGeometry = new THREE.RingGeometry(
    VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS - 0.11,
    VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS,
    48,
  ).rotateX(-Math.PI / 2);
  const targetRuneGeometry = new THREE.ShapeGeometry(symbolShape(symbol, 0.42, true))
    .rotateX(-Math.PI / 2)
    .translate(0, 0.06, 0);
  const targetRim = new THREE.Mesh(
    mergeFloorGeometries([targetRimGeometry, targetRuneGeometry]),
    additive(color, 0.92),
  );
  targetRim.name = 'varkhul-link-anvil-target-rim';
  targetRim.userData.symbol = symbol;
  targetRim.userData.role = 'anvil';
  targetRim.userData.hollow = true;
  target.add(targetRim);
  const progress = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.035, 0.08),
    additive(0xffffff, 0.96),
    8,
  );
  progress.name = 'varkhul-link-progress';
  progress.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const progressMatrix = new THREE.Matrix4();
  const progressPosition = new THREE.Vector3();
  const progressRotation = new THREE.Quaternion();
  const progressScale = new THREE.Vector3(1, 1, 1);
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2;
    progressPosition.set(Math.sin(angle) * 0.84, 0.05, Math.cos(angle) * 0.84);
    progressRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    progressMatrix.compose(progressPosition, progressRotation, progressScale);
    progress.setMatrixAt(index, progressMatrix);
  }
  progress.instanceMatrix.needsUpdate = true;
  // Compute against all eight static transforms before the runtime count is hidden.
  // Otherwise Three can cache a one-tick sphere and cull later progress ticks.
  progress.computeBoundingSphere();
  progress.count = 0;
  progress.visible = false;
  target.add(progress);

  const arrowShape = (direction: -1 | 1): THREE.Shape => {
    const shape = new THREE.Shape();
    const points: Array<[number, number]> = [
      [-0.44, -0.12],
      [0.08, -0.12],
      [0.08, -0.32],
      [0.46, 0],
      [0.08, 0.32],
      [0.08, 0.12],
      [-0.44, 0.12],
    ].map(([x, y]) => [x * direction, y]);
    points.forEach(([x, y], index) => {
      if (index === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    });
    shape.closePath();
    return shape;
  };
  const brakeShape = (): THREE.Shape => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.31, -0.31);
    shape.lineTo(0.31, -0.31);
    shape.lineTo(0.31, 0.31);
    shape.lineTo(-0.31, 0.31);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-0.16, -0.16);
    hole.lineTo(-0.16, 0.16);
    hole.lineTo(0.16, 0.16);
    hole.lineTo(0.16, -0.16);
    hole.closePath();
    shape.holes.push(hole);
    return shape;
  };
  const controls: readonly [VarkhulAssemblyHammerControl, number][] = [
    ['counterclockwise', -VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ANGLE],
    ['brake', 0],
    ['clockwise', VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ANGLE],
  ];
  for (const [control, angle] of controls) {
    const plate = new THREE.Group();
    plate.name = `varkhul-link-control-${control}`;
    plate.userData.control = control;
    plate.userData.radius = VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS;
    plate.position.set(
      Math.sin(angle) * VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT,
      0,
      Math.cos(angle) * VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT,
    );
    // Keep the icon in an empty centre so it stays legible when the additive
    // control material turns fully white while occupied.
    const plateGeometry = new THREE.RingGeometry(
      VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS - 0.12,
      VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS,
      40,
    ).rotateX(-Math.PI / 2);
    const iconGeometry = new THREE.ShapeGeometry(
      control === 'brake' ? brakeShape() : arrowShape(control === 'counterclockwise' ? -1 : 1),
    )
      .rotateX(-Math.PI / 2)
      .translate(0, 0.06, 0);
    const surface = new THREE.Mesh(
      mergeFloorGeometries([plateGeometry, iconGeometry]),
      additive(color, 0.68),
    );
    surface.name = 'varkhul-link-control-surface';
    plate.add(surface);
    group.add(plate);
  }

  const arm = new THREE.Group();
  arm.name = 'varkhul-link-fire-arm';
  arm.userData.actionable = true;
  const armCore = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 2.05), additive(0xff6418, 0.96));
  armCore.name = 'varkhul-link-fire-arm-core';
  armCore.position.set(0, 0.08, 1.025);
  const armTip = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), additive(0xffed8a, 1));
  armTip.name = 'varkhul-link-fire-arm-tip';
  armTip.position.set(0, 0.13, 2.05);
  arm.add(armCore, armTip);

  const lock = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1.12, 48).rotateX(-Math.PI / 2),
    additive(0xffffff, 1),
  );
  lock.name = 'varkhul-link-lock-burst';
  lock.visible = false;
  target.add(lock);
  group.add(footprint, target, arm);
  return group;
}

function disposeRoot(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh | THREE.Line;
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
  const pads = Array.from({ length: 5 }, (_, symbol) => buildPad(symbol));
  root.add(...pads);
  scene.add(root);
  return {
    root,
    forge: forge.group,
    forgeSegments: forge.segments,
    barrierMaterial: forge.barrier,
    cores: new Map(),
    pads,
    phase: 0,
  };
}

/** Stages the global Assembly material set at Inner Crucible attach. */
export function buildVarkhulAssemblyPrewarmVisual(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'varkhul-assembly-prewarm';
  const forge = buildForge();
  root.add(forge.group);
  for (let symbol = 0; symbol < 5; symbol++) {
    const pad = buildPad(symbol);
    pad.position.set((symbol - 2) * 6.5, 0, 8);
    pad.traverse((child) => {
      child.visible = true;
      if (child instanceof THREE.InstancedMesh) child.count = 8;
    });
    root.add(pad);
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
      for (const pad of state.pads) {
        const padVisual = visual.pads[pad.symbol];
        padVisual.visible = state.phase === 'links';
        padVisual.position.set(pad.x, this.groundY(pad.x, pad.z) + 0.08, pad.z);
        const outwardAngle = Math.atan2(pad.x - state.forgeX, pad.z - state.forgeZ);
        padVisual.rotation.y = outwardAngle;
        const targetAngle = pad.targetAngle - outwardAngle;
        const target = padVisual.getObjectByName('varkhul-link-anvil-target') as THREE.Group;
        target.position.set(
          Math.sin(targetAngle) * VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT,
          0.02,
          Math.cos(targetAngle) * VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT,
        );
        const targetRim = target.getObjectByName('varkhul-link-anvil-target-rim') as THREE.Mesh;
        const targetMaterial = targetRim.material as THREE.MeshBasicMaterial;
        targetMaterial.color.setHex(
          pad.locked || pad.anvilReady ? 0xffffff : SYMBOL_COLORS[pad.symbol],
        );
        targetMaterial.opacity = pad.anvilReady || pad.locked ? 1 : 0.86;
        // The lock burst replaces the progress ticks instead of adding a ninth
        // draw at the exact moment the station completes.
        const visibleProgress = pad.locked ? 0 : Math.floor(Math.max(0, pad.progress) * 8 + 0.001);
        const progress = target.getObjectByName('varkhul-link-progress') as THREE.InstancedMesh;
        progress.count = visibleProgress;
        progress.visible = visibleProgress > 0;
        const lock = target.getObjectByName('varkhul-link-lock-burst');
        if (lock) lock.visible = pad.locked;

        for (const control of ['counterclockwise', 'brake', 'clockwise'] as const) {
          const plate = padVisual.getObjectByName(`varkhul-link-control-${control}`) as THREE.Group;
          const active = pad.control === control;
          const surface = plate.getObjectByName('varkhul-link-control-surface') as THREE.Mesh;
          const material = surface.material as THREE.MeshBasicMaterial;
          material.color.setHex(pad.locked || active ? 0xffffff : SYMBOL_COLORS[pad.symbol]);
          material.opacity = active ? 1 : 0.68;
        }
        const arm = padVisual.getObjectByName('varkhul-link-fire-arm') as THREE.Group;
        arm.rotation.y = pad.armAngle - outwardAngle;
        arm.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.material) return;
          const material = mesh.material as THREE.MeshBasicMaterial;
          material.color.setHex(
            pad.locked || (pad.aligned && pad.control === 'brake')
              ? 0xffffff
              : pad.aligned
                ? 0xffe45c
                : child.name.endsWith('tip')
                  ? 0xffed8a
                  : child.name.endsWith('core')
                    ? 0xff8a18
                    : 0xff3300,
          );
        });
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
      visual.forge.scale.setScalar(visual.root.userData.phase === 'stunned' ? 1 + pulse * 0.1 : 1);
    }
  }

  dispose(): void {
    for (const visual of this.visuals.values()) disposeRoot(visual.root);
    this.visuals.clear();
    this.active.clear();
  }
}
