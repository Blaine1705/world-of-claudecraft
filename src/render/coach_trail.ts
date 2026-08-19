// The Proving Shore's golden guidance: a terrain-draped chevron ribbon along
// the coach's current route (coach_trail_core.ts decides the route), plus a
// pulsing golden ground ring under the rail's current target NPC. The island
// coaches players who have never played the genre; the ribbon paints the
// walk on the ground so nobody has to read to find the way.
//
// The race_line.ts idiom: geometry is sampled onto the terrain via the
// renderer's ground sampler and rebuilt only when the route key changes (a
// handful of times across the whole island, never per frame); per frame the
// chevron texture scrolls toward the destination and the glow breathes.
// MeshBasicMaterial + additive blending keeps this actionable guidance
// identical on every graphics tier (the fairness rule): no lights, no tier
// reads, no governor reads.

import * as THREE from 'three';
import type { CoachTrailPlan } from './coach_trail_core';

const RIBBON_WIDTH = 0.7;
const RIBBON_LIFT = 0.14;
const CHEVRON_LENGTH = 2.0; // world units per chevron repeat
const SCROLL_SPEED = 1.5; // repeats per second, toward the destination
const SAMPLES_PER_UNIT = 0.6; // cross-sections per world unit of route
const MIN_SAMPLES = 24;
const MAX_SAMPLES = 320;
const GOLD = 0xffc860;
const RING_INNER = 0.95;
const RING_OUTER = 1.35;
const RING_LIFT = 0.12;

/** The race_line chevron strip, narrower: one arrow per repeat, pointing +u. */
function chevronTexture(): THREE.Texture {
  const w = 64;
  const h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(10, 4);
  ctx.lineTo(34, 16);
  ctx.lineTo(10, 28);
  ctx.lineTo(22, 16);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export class CoachTrail {
  private ribbon: THREE.Mesh | null = null;
  private mat: THREE.MeshBasicMaterial | null = null;
  private tex: THREE.Texture | null = null;
  private builtKey: string | null = null;
  private ring: THREE.Mesh | null = null;
  private ringMat: THREE.MeshBasicMaterial | null = null;
  private ringKey = '';

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly groundAt: (x: number, z: number) => number,
  ) {}

  /** Rebuild the draped ribbon for a new route key. */
  private buildRibbon(plan: CoachTrailPlan): void {
    this.disposeRibbon();
    if (plan.points.length < 2) return;
    const pts = plan.points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    let routeLength = 0;
    for (let i = 1; i < pts.length; i++) {
      routeLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    const samples = Math.max(
      MIN_SAMPLES,
      Math.min(MAX_SAMPLES, Math.round(routeLength * SAMPLES_PER_UNIT)),
    );
    const positions = new Float32Array((samples + 1) * 2 * 3);
    const uvs = new Float32Array((samples + 1) * 2 * 2);
    const index: number[] = [];
    const p = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    let u = 0;
    let prevX = 0;
    let prevZ = 0;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      curve.getPoint(t, p);
      curve.getTangent(t, tangent);
      if (i > 0) u += Math.hypot(p.x - prevX, p.z - prevZ) / CHEVRON_LENGTH;
      prevX = p.x;
      prevZ = p.z;
      const len = Math.hypot(tangent.x, tangent.z) || 1;
      const nx = -tangent.z / len;
      const nz = tangent.x / len;
      const half = RIBBON_WIDTH / 2;
      const lx = p.x + nx * half;
      const lz = p.z + nz * half;
      const rx = p.x - nx * half;
      const rz = p.z - nz * half;
      const vi = i * 2;
      positions.set([lx, this.groundAt(lx, lz) + RIBBON_LIFT, lz], vi * 3);
      positions.set([rx, this.groundAt(rx, rz) + RIBBON_LIFT, rz], (vi + 1) * 3);
      uvs.set([u, 0], vi * 2);
      uvs.set([u, 1], (vi + 1) * 2);
      if (i > 0) {
        const a = vi - 2;
        const b = vi - 1;
        index.push(a, b, vi, b, vi + 1, vi);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(index);
    if (!this.tex) this.tex = chevronTexture();
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      color: new THREE.Color(GOLD).multiplyScalar(1.7),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ribbon = new THREE.Mesh(geo, this.mat);
    this.ribbon.renderOrder = 3;
    // Diagnostics-only census bucket (world-space actionable UI, the
    // race_line precedent); never a behavior or visibility gate.
    this.ribbon.userData.renderCategory = 'ui3d';
    this.scene.add(this.ribbon);
    this.builtKey = plan.key;
  }

  private disposeRibbon(): void {
    if (this.ribbon) {
      this.scene.remove(this.ribbon);
      this.ribbon.geometry.dispose();
      this.ribbon = null;
    }
    this.mat?.dispose();
    this.mat = null;
    this.builtKey = null;
  }

  private ensureRing(): void {
    if (this.ring) return;
    const geo = new THREE.RingGeometry(RING_INNER, RING_OUTER, 40);
    geo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(GOLD).multiplyScalar(1.9),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(geo, this.ringMat);
    this.ring.renderOrder = 3;
    this.ring.userData.renderCategory = 'ui3d';
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  /** Per-frame drive: `plan`/`ringAt` are null off the island or when the
   *  station has no route/target. `time` is the renderer's shared clock. */
  update(
    plan: CoachTrailPlan | null,
    ringAt: { x: number; z: number } | null,
    time: number,
    dt: number,
  ): void {
    if (!plan) {
      if (this.ribbon) this.disposeRibbon();
    } else {
      if (this.builtKey !== plan.key) this.buildRibbon(plan);
      if (this.ribbon && this.mat && this.tex) {
        this.ribbon.visible = true;
        this.tex.offset.x -= SCROLL_SPEED * dt;
        this.mat.opacity = 0.65 + 0.2 * Math.sin(time * 2.4);
      }
    }
    if (!ringAt) {
      if (this.ring) this.ring.visible = false;
      return;
    }
    this.ensureRing();
    if (!this.ring || !this.ringMat) return;
    this.ring.visible = true;
    const key = `${ringAt.x},${ringAt.z}`;
    if (this.ringKey !== key) {
      this.ringKey = key;
      this.ring.position.set(ringAt.x, this.groundAt(ringAt.x, ringAt.z) + RING_LIFT, ringAt.z);
    }
    const pulse = 1 + 0.1 * Math.sin(time * 3.4);
    this.ring.scale.setScalar(pulse);
    this.ringMat.opacity = 0.4 + 0.25 * (0.5 + 0.5 * Math.sin(time * 3.4));
  }
}
