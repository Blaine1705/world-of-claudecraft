// Persistent Consecration presentation. The authoritative zone comes from IWorld,
// so late-joining and reconnecting clients see the same holy ground as the caster.

import * as THREE from 'three';
import type { ActiveConsecration } from '../world_api';

const SEGMENTS = 72;
const GROUND_LIFT = 0.055;
const FADE_SECONDS = 0.65;

interface ConsecrationVisual {
  root: THREE.Group;
  motes: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
  baseOpacities: number[];
  geometries: THREE.BufferGeometry[];
  duration: number;
  elapsed: number;
  lastRemaining: number;
}

export class PaladinConsecrationVisuals {
  private readonly active = new Map<string, ConsecrationVisual>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
  ) {}

  sync(states: readonly ActiveConsecration[]): void {
    const ids = new Set<string>();
    for (const state of states) {
      ids.add(state.id);
      const current = this.active.get(state.id);
      if (!current) {
        this.create(state);
        continue;
      }
      if (current.lastRemaining !== state.remaining) {
        current.duration = Math.max(0.1, state.duration);
        current.elapsed = Math.max(0, current.duration - state.remaining);
        current.lastRemaining = state.remaining;
        this.animate(current, 0);
      }
    }
    for (const [id, visual] of this.active) {
      if (ids.has(id)) continue;
      this.disposeVisual(visual);
      this.active.delete(id);
    }
  }

  update(dt: number): void {
    for (const [id, visual] of this.active) {
      visual.elapsed += dt;
      if (visual.elapsed >= visual.duration) {
        this.disposeVisual(visual);
        this.active.delete(id);
        continue;
      }
      this.animate(visual, dt);
    }
  }

  dispose(): void {
    for (const visual of this.active.values()) this.disposeVisual(visual);
    this.active.clear();
  }

  private create(state: ActiveConsecration): void {
    const radius = Math.max(0.5, state.radius);
    const root = new THREE.Group();
    root.name = 'paladin-consecration';
    const materials: THREE.MeshBasicMaterial[] = [];
    const geometries: THREE.BufferGeometry[] = [];
    const baseOpacities: number[] = [];
    const gold = new THREE.Color(0xffca45);
    const ivory = new THREE.Color(0xfff1ac);

    const glowGeometry = this.createTerrainDisc(state.x, state.z, radius * 0.94, 48);
    const glowMaterial = this.material(gold.clone().multiplyScalar(1.15), 0.16);
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.name = 'paladin-consecration-ground-glow';
    glow.renderOrder = 6;
    root.add(glow);
    materials.push(glowMaterial);
    geometries.push(glowGeometry);
    baseOpacities.push(0.16);

    for (const [name, inner, outer, opacity] of [
      ['outer', 0.9, 1, 0.82],
      ['middle', 0.56, 0.61, 0.5],
      ['heart', 0.2, 0.25, 0.58],
    ] as const) {
      const geometry = this.createTerrainRing(state.x, state.z, radius * inner, radius * outer);
      const material = this.material(
        (name === 'middle' ? ivory : gold).clone().multiplyScalar(1.7),
        opacity,
      );
      const ring = new THREE.Mesh(geometry, material);
      ring.name = `paladin-consecration-${name}-ring`;
      ring.renderOrder = 8;
      root.add(ring);
      materials.push(material);
      geometries.push(geometry);
      baseOpacities.push(opacity);
    }

    for (let glyph = 0; glyph < 8; glyph++) {
      const geometry = this.createTerrainSpoke(
        state.x,
        state.z,
        radius * 0.035,
        radius * (glyph % 2 === 0 ? 1.35 : 0.92),
        (glyph / 8) * Math.PI,
      );
      const opacity = glyph % 2 === 0 ? 0.42 : 0.3;
      const material = this.material(ivory.clone().multiplyScalar(1.45), opacity);
      const spoke = new THREE.Mesh(geometry, material);
      spoke.name = `paladin-consecration-glyph-${glyph}`;
      spoke.renderOrder = 7;
      root.add(spoke);
      materials.push(material);
      geometries.push(geometry);
      baseOpacities.push(opacity);
    }

    const motes = new THREE.Group();
    motes.name = 'paladin-consecration-motes';
    motes.position.set(state.x, this.groundY(state.x, state.z), state.z);
    const moteGeometry = new THREE.OctahedronGeometry(0.13, 0);
    geometries.push(moteGeometry);
    for (let index = 0; index < 12; index++) {
      const material = this.material(
        (index % 3 === 0 ? ivory : gold).clone().multiplyScalar(2),
        0.88,
      );
      const mote = new THREE.Mesh(moteGeometry, material);
      const angle = (index / 12) * Math.PI * 2;
      const moteRadius = radius * (0.33 + (index % 3) * 0.23);
      mote.position.set(
        Math.cos(angle) * moteRadius,
        0.18 + (index % 4) * 0.16,
        Math.sin(angle) * moteRadius,
      );
      mote.scale.setScalar(0.75 + (index % 3) * 0.2);
      motes.add(mote);
      materials.push(material);
      baseOpacities.push(0.88);
    }
    root.add(motes);

    const visual: ConsecrationVisual = {
      root,
      motes,
      materials,
      baseOpacities,
      geometries,
      duration: Math.max(0.1, state.duration),
      elapsed: Math.max(0, state.duration - state.remaining),
      lastRemaining: state.remaining,
    };
    this.animate(visual, 0);
    this.active.set(state.id, visual);
    this.scene.add(root);
  }

  private material(color: THREE.Color, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private animate(visual: ConsecrationVisual, dt: number): void {
    const fade = Math.min(1, (visual.duration - visual.elapsed) / FADE_SECONDS);
    const pulse = 0.78 + Math.sin(visual.elapsed * Math.PI * 2) * 0.22;
    visual.materials.forEach((material, index) => {
      material.opacity = visual.baseOpacities[index] * fade * pulse;
    });
    visual.motes.rotation.y -= dt * 0.38;
    visual.motes.children.forEach((mote, index) => {
      mote.position.y = 0.18 + (index % 4) * 0.16 + Math.sin(visual.elapsed * 3.2 + index) * 0.12;
    });
  }

  private disposeVisual(visual: ConsecrationVisual): void {
    this.scene.remove(visual.root);
    for (const material of visual.materials) material.dispose();
    for (const geometry of visual.geometries) geometry.dispose();
  }

  private createTerrainRing(
    x: number,
    z: number,
    innerRadius: number,
    outerRadius: number,
  ): THREE.BufferGeometry {
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let segment = 0; segment <= SEGMENTS; segment++) {
      const angle = (segment / SEGMENTS) * Math.PI * 2;
      for (const radius of [innerRadius, outerRadius]) {
        const sampleX = x + Math.cos(angle) * radius;
        const sampleZ = z + Math.sin(angle) * radius;
        vertices.push(sampleX, this.groundY(sampleX, sampleZ) + GROUND_LIFT, sampleZ);
      }
      if (segment < SEGMENTS) {
        const inner = segment * 2;
        indices.push(inner, inner + 1, inner + 2, inner + 1, inner + 3, inner + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  private createTerrainSpoke(
    x: number,
    z: number,
    width: number,
    length: number,
    angle: number,
  ): THREE.BufferGeometry {
    const segments = 12;
    const vertices: number[] = [];
    const indices: number[] = [];
    const alongX = Math.cos(angle);
    const alongZ = Math.sin(angle);
    const acrossX = -alongZ;
    const acrossZ = alongX;
    for (let segment = 0; segment <= segments; segment++) {
      const distance = -length / 2 + (length * segment) / segments;
      for (const side of [-1, 1]) {
        const sampleX = x + alongX * distance + acrossX * width * 0.5 * side;
        const sampleZ = z + alongZ * distance + acrossZ * width * 0.5 * side;
        vertices.push(sampleX, this.groundY(sampleX, sampleZ) + GROUND_LIFT, sampleZ);
      }
      if (segment < segments) {
        const left = segment * 2;
        indices.push(left, left + 1, left + 2, left + 1, left + 3, left + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  private createTerrainDisc(
    x: number,
    z: number,
    radius: number,
    segments: number,
  ): THREE.BufferGeometry {
    const vertices = [x, this.groundY(x, z) + GROUND_LIFT, z];
    const indices: number[] = [];
    const radialSegments = 8;
    for (let ring = 1; ring <= radialSegments; ring++) {
      const sampleRadius = (radius * ring) / radialSegments;
      for (let segment = 0; segment <= segments; segment++) {
        const angle = (segment / segments) * Math.PI * 2;
        const sampleX = x + Math.cos(angle) * sampleRadius;
        const sampleZ = z + Math.sin(angle) * sampleRadius;
        vertices.push(sampleX, this.groundY(sampleX, sampleZ) + GROUND_LIFT, sampleZ);
        if (segment >= segments) continue;
        const current = 1 + (ring - 1) * (segments + 1) + segment;
        if (ring === 1) {
          indices.push(0, current, current + 1);
        } else {
          const previous = current - (segments + 1);
          indices.push(previous, current, previous + 1, current, current + 1, previous + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    return geometry;
  }
}
