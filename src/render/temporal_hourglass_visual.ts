import * as THREE from 'three';
import { surfaceMat } from './gfx';

export type TemporalHourglassMode = 'hostile' | 'protective';

const BASE_GEOMETRY = new THREE.CylinderGeometry(0.34, 0.38, 0.08, 12);
const PILLAR_GEOMETRY = new THREE.CylinderGeometry(0.025, 0.025, 0.66, 6);
const GLASS_GEOMETRY = new THREE.ConeGeometry(0.22, 0.34, 12, 1, true);
const SAND_GEOMETRY = new THREE.ConeGeometry(0.17, 0.2, 10);
const RING_GEOMETRY = new THREE.TorusGeometry(0.43, 0.018, 6, 24);

const GOLD = surfaceMat({
  color: 0xd8a83e,
  emissive: 0x6b3f08,
  emissiveIntensity: 0.35,
  roughness: 0.3,
  metalness: 0.72,
});
const GLASS = surfaceMat({
  color: 0x9befff,
  emissive: 0x1757a0,
  emissiveIntensity: 0.38,
  roughness: 0.08,
  side: THREE.DoubleSide,
}).clone();
GLASS.transparent = true;
GLASS.opacity = 0.28;
GLASS.depthWrite = false;

const PROTECTIVE_ENERGY = surfaceMat({
  color: 0x8ff7ff,
  emissive: 0x20b5ff,
  emissiveIntensity: 1.2,
  roughness: 0.22,
});
const HOSTILE_ENERGY = surfaceMat({
  color: 0xff7d9b,
  emissive: 0xb3206b,
  emissiveIntensity: 1.2,
  roughness: 0.22,
});

/** Small physical hourglass placed at the controlled character's feet. */
export class TemporalHourglassVisual {
  readonly group = new THREE.Group();
  private readonly energy: THREE.Group;
  private mode: TemporalHourglassMode | null = null;
  private time = 0;

  constructor() {
    this.group.name = 'temporal-hourglass-visual';
    this.group.visible = false;

    for (const [name, y] of [
      ['bottom', 0.06],
      ['top', 0.76],
    ] as const) {
      const base = new THREE.Mesh(BASE_GEOMETRY, GOLD);
      base.name = `temporal-hourglass-${name}`;
      base.position.y = y;
      this.group.add(base);
    }

    for (let index = 0; index < 3; index++) {
      const angle = (index / 3) * Math.PI * 2;
      const pillar = new THREE.Mesh(PILLAR_GEOMETRY, GOLD);
      pillar.name = `temporal-hourglass-pillar-${index}`;
      pillar.position.set(Math.cos(angle) * 0.28, 0.41, Math.sin(angle) * 0.28);
      this.group.add(pillar);
    }

    const upperGlass = new THREE.Mesh(GLASS_GEOMETRY, GLASS);
    upperGlass.name = 'temporal-hourglass-upper-glass';
    upperGlass.position.y = 0.57;
    this.group.add(upperGlass);
    const lowerGlass = new THREE.Mesh(GLASS_GEOMETRY, GLASS);
    lowerGlass.name = 'temporal-hourglass-lower-glass';
    lowerGlass.position.y = 0.25;
    lowerGlass.rotation.z = Math.PI;
    this.group.add(lowerGlass);

    this.energy = new THREE.Group();
    this.energy.name = 'temporal-hourglass-energy';
    const upperSand = new THREE.Mesh(SAND_GEOMETRY, PROTECTIVE_ENERGY);
    upperSand.name = 'temporal-hourglass-upper-sand';
    upperSand.position.y = 0.57;
    const lowerSand = new THREE.Mesh(SAND_GEOMETRY, PROTECTIVE_ENERGY);
    lowerSand.name = 'temporal-hourglass-lower-sand';
    lowerSand.position.y = 0.19;
    lowerSand.rotation.z = Math.PI;
    const ring = new THREE.Mesh(RING_GEOMETRY, PROTECTIVE_ENERGY);
    ring.name = 'temporal-hourglass-ring';
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.035;
    this.energy.add(upperSand, lowerSand, ring);
    this.group.add(this.energy);
  }

  dispose(): void {
    // Geometry and materials are shared by all instances and live for the renderer lifetime.
  }

  update(mode: TemporalHourglassMode | null, dt: number): void {
    this.mode = mode;
    this.group.visible = mode !== null;
    if (!mode) return;
    const material = mode === 'protective' ? PROTECTIVE_ENERGY : HOSTILE_ENERGY;
    for (const child of this.energy.children) (child as THREE.Mesh).material = material;
    this.time += Math.max(0, dt);
    this.group.rotation.y = this.time * (mode === 'protective' ? 0.55 : -0.8);
    const pulse = 1 + Math.sin(this.time * 5) * 0.045;
    this.energy.scale.setScalar(pulse);
  }

  currentMode(): TemporalHourglassMode | null {
    return this.mode;
  }
}

export function syncTemporalHourglassVisual(
  visual: TemporalHourglassVisual | null,
  parent: THREE.Group,
  mode: TemporalHourglassMode | null,
  dt: number,
): TemporalHourglassVisual | null {
  let current = visual;
  if (mode && !current) {
    current = new TemporalHourglassVisual();
    parent.add(current.group);
  }
  current?.update(mode, dt);
  return current;
}
