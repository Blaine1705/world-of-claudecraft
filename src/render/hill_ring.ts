// King of the Hill: the circle on the ground (src/sim/pvp/hill.ts, read
// through IWorld.hillInfo). One terrain-draped rim band plus a faint interior
// wash, keyed by the hill's geometry so a new hill is a new mesh set and a
// holder change only retints the standing one; the colour and the pulse come
// from the pure core (hill_ring_core.ts). The rift death zone's shape, minus
// the timer sweep: a hill has no fuse, only an owner.

import * as THREE from 'three';
import type { HillInfo } from '../world_api/world_pvp';
import { HILL_FILL_OPACITY, hillPulseSpeed, hillRingKey, hillRingPlan } from './hill_ring_core';

const SEGMENTS = 96;
/** Rim band inner edge as a fraction of the radius. A 50 yd circle needs a
 *  thinner band than the death zone's 15 yd one, or the ring reads as a wall. */
const RIM_INNER_FRACTION = 0.94;
/** Lift over the sampled ground so the decal never z-fights the floor. */
const GROUND_LIFT = 0.08;

interface RingVisual {
  group: THREE.Group;
  rimMat: THREE.MeshBasicMaterial;
  fillMat: THREE.MeshBasicMaterial;
  ownedGeometries: THREE.BufferGeometry[];
  phase: number;
  holder: HillInfo['holder'];
  challenger: HillInfo['challenger'];
}

export class HillRingVisuals {
  private visual: { key: string; ring: RingVisual } | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
  ) {}

  /** Called each frame with IWorld.hillInfo (null while no hill stands). */
  sync(info: HillInfo | null): void {
    if (!info) {
      this.clear();
      return;
    }
    const key = hillRingKey(info);
    if (this.visual && this.visual.key !== key) this.clear();
    if (!this.visual) this.visual = { key, ring: this.create(info) };
    this.visual.ring.holder = info.holder;
    this.visual.ring.challenger = info.challenger;
  }

  /** Called each frame with the elapsed frame time in seconds. */
  update(dt: number): void {
    const ring = this.visual?.ring;
    if (!ring) return;
    const contested = ring.challenger !== 'none';
    ring.phase = (ring.phase + dt * hillPulseSpeed(contested)) % (Math.PI * 2);
    const plan = hillRingPlan(ring.phase, ring);
    ring.rimMat.color.setHex(plan.color);
    ring.fillMat.color.setHex(plan.color);
    ring.rimMat.opacity = plan.ringOpacity;
    ring.fillMat.opacity = plan.fillOpacity;
  }

  private clear(): void {
    if (!this.visual) return;
    const ring = this.visual.ring;
    this.scene.remove(ring.group);
    ring.rimMat.dispose();
    ring.fillMat.dispose();
    for (const geo of ring.ownedGeometries) geo.dispose();
    this.visual = null;
  }

  private create(info: HillInfo): RingVisual {
    const group = new THREE.Group();
    group.name = 'hill-ring';
    const ownedGeometries: THREE.BufferGeometry[] = [];
    const plan = hillRingPlan(0, info);
    const rimMat = new THREE.MeshBasicMaterial({
      color: plan.color,
      transparent: true,
      opacity: plan.ringOpacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const rimGeo = this.terrainRing(info.x, info.z, info.radius * RIM_INNER_FRACTION, info.radius);
    ownedGeometries.push(rimGeo);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.renderOrder = 10;
    group.add(rim);
    const fillMat = new THREE.MeshBasicMaterial({
      color: plan.color,
      transparent: true,
      opacity: HILL_FILL_OPACITY,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fillGeo = this.terrainDisc(info.x, info.z, info.radius * RIM_INNER_FRACTION);
    ownedGeometries.push(fillGeo);
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.renderOrder = 9;
    group.add(fill);
    this.scene.add(group);
    return {
      group,
      rimMat,
      fillMat,
      ownedGeometries,
      phase: 0,
      holder: info.holder,
      challenger: info.challenger,
    };
  }

  /** Terrain-draped annulus band (the rift death zone's createTerrainRing shape). */
  private terrainRing(
    x: number,
    z: number,
    innerRadius: number,
    outerRadius: number,
  ): THREE.BufferGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const ix = x + cos * innerRadius;
      const iz = z + sin * innerRadius;
      const ox = x + cos * outerRadius;
      const oz = z + sin * outerRadius;
      positions.push(ix, this.groundY(ix, iz) + GROUND_LIFT, iz);
      positions.push(ox, this.groundY(ox, oz) + GROUND_LIFT, oz);
      if (i < SEGMENTS) {
        const b = i * 2;
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    return geo;
  }

  /** Terrain-draped disc: a fan from the centre, each rim vertex on the ground. */
  private terrainDisc(x: number, z: number, radius: number): THREE.BufferGeometry {
    const positions: number[] = [x, this.groundY(x, z) + GROUND_LIFT, z];
    const indices: number[] = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const px = x + Math.cos(a) * radius;
      const pz = z + Math.sin(a) * radius;
      positions.push(px, this.groundY(px, pz) + GROUND_LIFT, pz);
      if (i < SEGMENTS) indices.push(0, i + 1, i + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    return geo;
  }
}
