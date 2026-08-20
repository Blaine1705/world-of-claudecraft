// Authoritative Marked Hammers warnings and persistent fire zones. Every
// graphics tier keeps the same warning radius, countdown, hammer descent, and
// fire boundary because all four carry gameplay information.

import * as THREE from 'three';
import type { ActiveVarkhulHammerZone } from '../sim/varkhul_hammers';

const SEGMENTS = 48;
const GROUND_LIFT = 0.09;
const HAMMER_DROP_HEIGHT = 7.5;
const WARNING_COLOR = 0xff8a20;
const DANGER_COLOR = 0xff3514;

interface HammerVisual {
  group: THREE.Group;
  materials: THREE.Material[];
  hammer: THREE.Group | null;
  remaining: number;
  duration: number;
  phase: ActiveVarkhulHammerZone['phase'];
  pulse: number;
}

function material(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function addBoundary(group: THREE.Group, radius: number, color: number): THREE.Material[] {
  const fillMaterial = material(color, 0.2);
  const edgeMaterial = material(WARNING_COLOR, 0.9);
  const fill = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.82, SEGMENTS).rotateX(-Math.PI / 2),
    fillMaterial,
  );
  fill.name = 'varkhul-hammer-zone-fill';
  fill.renderOrder = 10;
  const edge = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.82, radius, SEGMENTS).rotateX(-Math.PI / 2),
    edgeMaterial,
  );
  edge.name = 'varkhul-hammer-zone-edge';
  edge.position.y = 0.02;
  edge.renderOrder = 11;
  group.add(fill, edge);
  group.userData.fillMaterial = fillMaterial;
  group.userData.edgeMaterial = edgeMaterial;
  return [fillMaterial, edgeMaterial];
}

function buildFallingHammer(): { group: THREE.Group; material: THREE.Material } {
  const group = new THREE.Group();
  group.name = 'varkhul-falling-hammer';
  const hammerMaterial = material(0xff7418, 0.94);
  const head = new THREE.Mesh(new THREE.BoxGeometry(4.1, 1.45, 1.75), hammerMaterial);
  head.position.y = 0.78;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 4.4, 10), hammerMaterial);
  handle.position.y = 3.55;
  group.add(head, handle);
  return { group, material: hammerMaterial };
}

export function buildVarkhulHammerZone(
  zone: ActiveVarkhulHammerZone,
  groundY: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `varkhul-hammer-${zone.phase}`;
  group.position.set(zone.x, groundY + GROUND_LIFT, zone.z);
  group.userData.renderCategory = 'ui3d';
  group.userData.actionable = true;
  group.userData.zoneId = zone.id;
  group.userData.sourceId = zone.sourceId;
  group.userData.radius = zone.radius;
  group.userData.phase = zone.phase;
  const materials = addBoundary(
    group,
    zone.radius,
    zone.phase === 'warning' ? DANGER_COLOR : 0xff1d08,
  );

  if (zone.phase === 'warning') {
    const hammer = buildFallingHammer();
    hammer.group.position.y = HAMMER_DROP_HEIGHT;
    group.add(hammer.group);
    materials.push(hammer.material);
    group.userData.hammer = hammer.group;
  } else {
    const flameMaterial = material(0xff5a12, 0.82);
    materials.push(flameMaterial);
    for (let index = 0; index < 8; index++) {
      const angle = (index * Math.PI * 2) / 8;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.95, 6), flameMaterial);
      flame.name = 'varkhul-hammer-fire-flame';
      flame.position.set(
        Math.sin(angle) * zone.radius * 0.62,
        0.48,
        Math.cos(angle) * zone.radius * 0.62,
      );
      group.add(flame);
    }
  }
  group.userData.materials = materials;
  return group;
}

function disposeVisual(visual: HammerVisual): void {
  visual.group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry.dispose();
  });
  for (const entry of visual.materials) entry.dispose();
  visual.group.removeFromParent();
}

export class VarkhulHammerVisuals {
  private readonly visuals = new Map<string, HammerVisual>();
  private readonly activeIds = new Set<string>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
  ) {}

  sync(zones: readonly ActiveVarkhulHammerZone[]): void {
    if (zones.length === 0 && this.visuals.size === 0) return;
    this.activeIds.clear();
    for (const zone of zones) {
      this.activeIds.add(zone.id);
      let visual = this.visuals.get(zone.id);
      if (!visual) {
        const group = buildVarkhulHammerZone(zone, this.groundY(zone.x, zone.z));
        visual = {
          group,
          materials: group.userData.materials as THREE.Material[],
          hammer: (group.userData.hammer as THREE.Group | undefined) ?? null,
          remaining: zone.remaining,
          duration: zone.duration,
          phase: zone.phase,
          pulse: 0,
        };
        this.scene.add(group);
        this.visuals.set(zone.id, visual);
      }
      visual.remaining = zone.remaining;
      visual.duration = zone.duration;
    }
    for (const [id, visual] of this.visuals) {
      if (this.activeIds.has(id)) continue;
      disposeVisual(visual);
      this.visuals.delete(id);
    }
  }

  update(dt: number, reducedMotion = false): void {
    for (const visual of this.visuals.values()) {
      if (!reducedMotion) visual.pulse = (visual.pulse + Math.max(0, dt) * 5) % (Math.PI * 2);
      const progress = THREE.MathUtils.clamp(
        1 - visual.remaining / Math.max(0.05, visual.duration),
        0,
        1,
      );
      const fill = visual.group.userData.fillMaterial as THREE.MeshBasicMaterial;
      const edge = visual.group.userData.edgeMaterial as THREE.MeshBasicMaterial;
      const pulse = reducedMotion ? 0.5 : 0.5 + Math.sin(visual.pulse) * 0.5;
      fill.opacity = visual.phase === 'warning' ? 0.16 + progress * 0.18 : 0.16 + pulse * 0.08;
      edge.opacity = 0.72 + pulse * 0.24;
      if (visual.hammer) {
        visual.hammer.position.y = HAMMER_DROP_HEIGHT * (1 - progress);
        visual.hammer.rotation.y = reducedMotion ? 0 : progress * Math.PI * 0.6;
      }
    }
  }

  dispose(): void {
    for (const visual of this.visuals.values()) disposeVisual(visual);
    this.visuals.clear();
    this.activeIds.clear();
  }
}
