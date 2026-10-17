// Old Thatchgrin's visual layer (Gourdlight Eve's field boss, sim: src/sim/seasonal/
// scarecrow_kit.ts). Three things the shared vocabulary cannot say on its own:
//
//  - the KINDLED GOURD in flight: a carved, lit pumpkin lobbed from his left hand on the
//    Throw clip's release frame, spinning and trailing embers, landing on the ring the sim
//    drew (the ring itself is the shared encounter rune circle, never re-drawn here);
//  - the BURST where it lands: a fireball of flame, pumpkin shards and seeds, a smoke
//    column and a dust ring, on top of the shared impact flash and blast ring;
//  - the SMOLDERING CHAFF it leaves: a hot ember disc on the ground at the patch's TRUE
//    radius for exactly its burn time (the read: where not to stand), with flames and smoke
//    rising off it. The disc is actionable information, so it draws at every graphics tier;
//    only the particle density scales.
// Plus the crows bursting off him at his call's peak and straw puffs as he collapses.
//
// GPU work: the gourd flies as one-instance InstancedMeshes over the seasonal decor kit's own
// geometry and materials, the instanced variant the decor view already links behind its
// gate (seasonal_decor.ts; his field's ring seats the same piece), and the patch disc is ONE
// shared additive material built with this layer's root and attached through the world
// compile gate (attachSceneGroupGated). Every particle rides the pooled point cloud (vfx.ts).
import * as THREE from 'three';
import { attachSceneGroupGated } from './gated_scene_attach';
import {
  bodyLocalToWorld,
  CHAFF_ABILITY,
  chaffFlameCalls,
  chaffStrength,
  DEATH_FOLD_SEC,
  DEATH_HEAP_SEC,
  GOURD_ABILITY,
  GOURD_HAND_LOCAL,
  GOURD_RELEASE_SEC,
  gourdApex,
  gourdArc,
  SUMMON_ABILITY,
  SUMMON_PEAK_SEC,
  THATCHGRIN_TEMPLATE,
} from './scarecrow_fx_core';
import { gourdlightAssets } from './seasonal_decor_assets';

/** The pooled particle calls this layer uses (vfx.ts). */
export interface ScarecrowParticles {
  burst(at: THREE.Vector3, school: string, count?: number, power?: number, color?: number): void;
  burstLater(
    seconds: number,
    x: number,
    y: number,
    z: number,
    school: string,
    count?: number,
    power?: number,
    color?: number,
  ): void;
  groundPuff(at: THREE.Vector3, power: number, color: number): void;
  fireworkBurst(at: THREE.Vector3, colors: readonly number[], count?: number, power?: number): void;
  campfireEmber(at: THREE.Vector3, dt: number): void;
  fluidSmoke(x: number, y: number, z: number, color: number, dt: number, rate: number): void;
}

interface EntityLike {
  templateId: string;
  pos: { x: number; y: number; z: number };
  facing: number;
  dead: boolean;
}

interface SpellfxAtLike {
  fx: string;
  x: number;
  z: number;
  ability?: string;
  sourceId?: number;
  radius?: number;
  duration?: number;
}

interface Flight {
  mesh: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  start: number;
  end: number;
  spin: THREE.Vector3;
}

interface Patch {
  disc: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  radius: number;
  born: number;
  total: number;
  flameClock: number;
}

const SHARD_COLORS = [0xff8a1a, 0xffb347, 0xd9561a, 0xfff0a8] as const;
const FEATHER_COLORS = [0x15141a, 0x24222b, 0x0a0a0d] as const;
const STRAW_COLOR = 0xd8b25a;
const IDENTITY = new THREE.Matrix4();
const CHAFF_DENSITY = 0.6;
const SMOKE = 0x2a2420;

/** The burning patch's alpha: a dim smoulder across the stubble, scattered live embers
 *  and a hot ragged rim at the edge (the boundary is the read). Built once per layer. */
function emberTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const mid = size / 2;
    // an alpha map reads the GREEN channel, so paint grey on opaque black
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.96, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    // live embers and glowing stalks across the patch
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * mid * 0.86;
      const x = mid + Math.cos(a) * r;
      const y = mid + Math.sin(a) * r;
      const e = ctx.createRadialGradient(x, y, 0, x, y, 3 + Math.random() * 9);
      e.addColorStop(0, `rgba(255,255,255,${0.5 + Math.random() * 0.5})`);
      e.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = e;
      ctx.fillRect(x - 12, y - 12, 24, 24);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * mid * 0.8;
      ctx.beginPath();
      ctx.moveTo(mid + Math.cos(a) * r, mid + Math.sin(a) * r);
      ctx.lineTo(mid + Math.cos(a + 0.2) * (r + 18), mid + Math.sin(a + 0.2) * (r + 18));
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export class ScarecrowFx {
  private root: THREE.Group | null = null;
  private discMaterial: THREE.MeshBasicMaterial | null = null;
  private discGeometry: THREE.CircleGeometry | null = null;
  private discTexture: THREE.Texture | null = null;
  private readonly flights: Flight[] = [];
  private readonly patches: Patch[] = [];
  private readonly deadSeen = new Set<number>();
  private time = 0;
  private disposed = false;
  private readonly scratch = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly particles: ScarecrowParticles,
    private readonly groundY: (x: number, z: number) => number,
    private readonly entities: () => ReadonlyMap<number, EntityLike>,
    private readonly entity: (id: number) => EntityLike | undefined,
    private readonly compileGate?: (target: THREE.Object3D) => Promise<unknown>,
  ) {}

  /** Built on the first sight of him: a world that never sees the boss links nothing. */
  private ensureRoot(): THREE.Group {
    if (this.root) return this.root;
    const root = new THREE.Group();
    root.name = 'scarecrow-fx';
    this.discTexture = emberTexture();
    this.discMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8480e,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      alphaMap: this.discTexture ?? undefined,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.discGeometry = new THREE.CircleGeometry(1, 40);
    this.discGeometry.rotateX(-Math.PI / 2);
    // one hidden twin so the gate links the disc's program before the first patch
    const twin = new THREE.Mesh(this.discGeometry, this.discMaterial);
    twin.scale.setScalar(0.001);
    root.add(twin);
    this.root = root;
    void attachSceneGroupGated(this.scene, root, this.compileGate, () => this.disposed).catch(
      () => {},
    );
    return root;
  }

  /** The decor kit's small carved pumpkin, flown as ONE-instance InstancedMeshes over the
   *  kit's own geometry and materials: the instanced program variant is exactly the one the
   *  decor view links behind its gate (his field's ring seats this very piece), so a throw
   *  links nothing new. A bare group when the kit is not loaded (the embers still trail). */
  private gourdMesh(): THREE.Group {
    const group = new THREE.Group();
    const parts = gourdlightAssets()?.decor.pumpkin_small ?? [];
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, 1);
      mesh.setMatrixAt(0, IDENTITY);
      // the instance sits at the group's origin, but its bounds are the geometry's alone
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    group.scale.setScalar(1.6);
    return group;
  }

  /** Release a flown gourd's per-flight instance buffers (the kit's geometry and materials
   *  are shared and never disposed here). */
  private retireGourd(group: THREE.Group): void {
    group.removeFromParent();
    for (const child of group.children) (child as THREE.InstancedMesh).dispose?.();
  }

  /** The sim's spellfxAt for his abilities. True when this layer CLAIMS the event (the
   *  renderer's generic arms skip it); false lets the shared rune / impact draw too. */
  handleSpellfxAt(ev: SpellfxAtLike): boolean {
    if (this.disposed) return false;
    if (ev.ability === GOURD_ABILITY && ev.fx === 'runeCircle') {
      this.launch(ev);
      return false; // the shared encounter rune circle is the ring
    }
    if (ev.ability === GOURD_ABILITY && ev.fx === 'nova') {
      this.gourdBurst(ev.x, ev.z, ev.radius ?? 5);
      return false; // the shared impact flash and blast ring ride on top
    }
    if (ev.ability === CHAFF_ABILITY) {
      this.addPatch(ev.x, ev.z, ev.radius ?? 3.5, ev.duration ?? 8);
      return true;
    }
    if (ev.ability === SUMMON_ABILITY && ev.fx === 'burst') {
      const y = this.groundY(ev.x, ev.z);
      this.particles.groundPuff(this.scratch.set(ev.x, y, ev.z), 1, 0x8a7350);
      return false;
    }
    return false;
  }

  /** The windup cue of his call: the crows burst off him at the clip's peak. */
  handleWindup(sourceId: number, ability: string | undefined): void {
    if (this.disposed || ability !== SUMMON_ABILITY) return;
    const boss = this.entity(sourceId);
    if (!boss) return;
    const y = boss.pos.y + 5.2;
    for (let i = 0; i < 3; i++) {
      this.particles.burstLater(
        SUMMON_PEAK_SEC + i * 0.08,
        boss.pos.x,
        y,
        boss.pos.z,
        'shadow',
        26,
        1.4,
        FEATHER_COLORS[i],
      );
    }
    this.particles.burstLater(
      SUMMON_PEAK_SEC,
      boss.pos.x,
      boss.pos.y + 3.4,
      boss.pos.z,
      'nature',
      22,
      1.2,
      STRAW_COLOR,
    );
  }

  private launch(ev: SpellfxAtLike): void {
    const boss = ev.sourceId !== undefined ? this.entity(ev.sourceId) : undefined;
    if (!boss) return;
    const windup = ev.duration ?? 2.2;
    const hand = bodyLocalToWorld(
      boss.pos.x,
      boss.pos.z,
      boss.facing,
      GOURD_HAND_LOCAL.left,
      GOURD_HAND_LOCAL.forward,
    );
    const from = new THREE.Vector3(hand.x, boss.pos.y + GOURD_HAND_LOCAL.up, hand.z);
    const to = new THREE.Vector3(ev.x, this.groundY(ev.x, ev.z) + 0.6, ev.z);
    const root = this.ensureRoot();
    const mesh = this.gourdMesh();
    mesh.visible = false;
    mesh.position.copy(from);
    root.add(mesh);
    const release = Math.min(GOURD_RELEASE_SEC, windup * 0.5);
    this.flights.push({
      mesh,
      from,
      to,
      start: this.time + release,
      end: this.time + windup,
      spin: new THREE.Vector3(3.1, 1.7, 2.3),
    });
  }

  private gourdBurst(x: number, z: number, radius: number): void {
    const y = this.groundY(x, z);
    const at = this.scratch.set(x, y + 0.8, z);
    // the fireball: a hard flash, then flame rolling up and out for half a second
    this.particles.burst(at, 'fire', 60, 2.6, 0xffe2a0);
    this.particles.fireworkBurst(at, SHARD_COLORS, 54, 1.6);
    this.particles.groundPuff(this.scratch.set(x, y, z), 1, 0x6b5638);
    for (let i = 0; i < 5; i++) {
      this.particles.burstLater(
        0.06 + i * 0.09,
        x,
        y + 0.9 + i * 0.5,
        z,
        'fire',
        26,
        1.7 - i * 0.2,
      );
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = radius * 0.75;
      this.particles.burstLater(
        0.04,
        x + Math.sin(a) * r,
        y + 0.4,
        z + Math.cos(a) * r,
        'fire',
        8,
        0.8,
      );
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.particles.fluidSmoke(
        x + Math.sin(a) * radius * 0.4,
        y,
        z + Math.cos(a) * radius * 0.4,
        SMOKE,
        1,
        1000,
      );
    }
  }

  private addPatch(x: number, z: number, radius: number, total: number): void {
    const root = this.ensureRoot();
    if (!this.discMaterial) return;
    // draped on the ground under it, so a patch on a slope never half-sinks into the hill
    const geometry = new THREE.CircleGeometry(radius, 40, 0, Math.PI * 2);
    geometry.rotateX(-Math.PI / 2);
    const y = this.groundY(x, z);
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.groundY(x + pos.getX(i), z + pos.getZ(i)) - y + 0.08);
    }
    pos.needsUpdate = true;
    const disc = new THREE.Mesh(geometry, this.discMaterial);
    disc.position.set(x, y, z);
    disc.visible = false;
    root.add(disc);
    this.patches.push({ disc, x, y, z, radius, born: this.time, total, flameClock: 0 });
  }

  update(dt: number, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.time += dt;
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      if (this.time < f.start) continue;
      const t = (this.time - f.start) / Math.max(0.05, f.end - f.start);
      if (t >= 1) {
        this.retireGourd(f.mesh);
        this.flights.splice(i, 1);
        continue;
      }
      const p = gourdArc(f.from, f.to, t, gourdApex(f.from.distanceTo(f.to)));
      f.mesh.visible = true;
      f.mesh.position.set(p.x, p.y, p.z);
      if (!reducedMotion) {
        f.mesh.rotation.x += f.spin.x * dt;
        f.mesh.rotation.y += f.spin.y * dt;
        f.mesh.rotation.z += f.spin.z * dt;
      }
      this.particles.campfireEmber(this.scratch.set(p.x, p.y - 0.6, p.z), dt);
      this.particles.campfireEmber(this.scratch.set(p.x, p.y - 0.4, p.z), dt);
    }
    // fixed density: the governor never thins a hazard a player reacts to
    const calls = chaffFlameCalls(CHAFF_DENSITY);
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const patch = this.patches[i];
      const age = this.time - patch.born;
      const k = chaffStrength(age, patch.total);
      if (age >= patch.total) {
        patch.disc.removeFromParent();
        patch.disc.geometry.dispose();
        this.patches.splice(i, 1);
        continue;
      }
      // the disc is drawn at the TRUE radius for the whole burn: the edge a player reads is
      // the edge that burns (it only shows once the patch has caught)
      patch.disc.visible = k > 0.02;
      for (let c = 0; c < calls; c++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * patch.radius * 0.95;
        this.particles.campfireEmber(
          this.scratch.set(patch.x + Math.sin(a) * r, patch.y - 0.45, patch.z + Math.cos(a) * r),
          dt * k,
        );
      }
      // low tongues of flame licking up off the stubble, a few a second
      patch.flameClock -= dt;
      if (patch.flameClock <= 0 && k > 0.2) {
        patch.flameClock = 0.12;
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * patch.radius * 0.85;
        this.particles.burst(
          this.scratch.set(patch.x + Math.sin(a) * r, patch.y + 0.15, patch.z + Math.cos(a) * r),
          'fire',
          4,
          0.35,
        );
      }
      this.particles.fluidSmoke(patch.x, patch.y, patch.z, SMOKE, dt, 2.5 * k);
    }
    // his collapse into straw: a puff as the stakes fold and another as the heap lands
    this.entities().forEach(this.watchDeath);
  }

  /** Per entity, per frame: allocation-free (a bound method over Map.forEach). */
  private readonly watchDeath = (e: EntityLike, id: number): void => {
    if (e.templateId !== THATCHGRIN_TEMPLATE) return;
    this.ensureRoot();
    if (!e.dead) {
      this.deadSeen.delete(id);
      return;
    }
    if (this.deadSeen.has(id)) return;
    this.deadSeen.add(id);
    const { x, y, z } = e.pos;
    this.particles.burstLater(DEATH_FOLD_SEC, x, y + 2.2, z, 'nature', 36, 1.6, STRAW_COLOR);
    this.particles.burstLater(DEATH_HEAP_SEC, x, y + 0.6, z, 'nature', 48, 1.9, STRAW_COLOR);
    this.particles.burstLater(DEATH_HEAP_SEC, x, y + 0.4, z, 'nature', 24, 1.2, 0x8a6a34);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.flights) this.retireGourd(f.mesh);
    this.flights.length = 0;
    for (const p of this.patches) p.disc.geometry.dispose();
    this.patches.length = 0;
    this.root?.removeFromParent();
    this.discMaterial?.dispose();
    this.discGeometry?.dispose();
    this.discTexture?.dispose();
    this.discMaterial = null;
    this.discGeometry = null;
    this.discTexture = null;
    this.root = null;
  }
}
