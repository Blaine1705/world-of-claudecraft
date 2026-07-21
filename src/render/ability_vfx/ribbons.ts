import * as THREE from 'three';
import type { AbilityVfxTextures } from './fx_textures';

// Camera-facing ribbon trails, ported from the gallery's RibbonMesh +
// genBolt/smoothArc (arc_bolt_preview.js, ribbons section). One pooled dynamic
// mesh redrawn immediate-mode every frame from three fixed slot families:
// jagged flicker bolts (lightning cracks), comet trails that chase the pooled
// Vfx projectile, and slash arcs (melee strike reads). Hard caps on verts and
// slots; every point buffer is preallocated, so steady state allocates nothing.

const MAX_VERTS = 4096;
const MAX_INDICES = MAX_VERTS * 3;
const BOLT_SLOTS = 10;
const BOLT_PTS = 17; // 4 midpoint-displacement passes on a 2-point seed
const TRAIL_SLOTS = 12;
const TRAIL_PTS = 9;
const ARC_SLOTS = 20;
const ARC_PTS = 12;
const TRAIL_SPEED = 26; // yards/sec, matches Vfx.projectile so the trail rides the comet
const WHITE = new THREE.Color(0xffffff);

function allocPts(n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) pts.push(new THREE.Vector3());
  return pts;
}

interface BoltSlot {
  active: boolean;
  age: number;
  life: number;
  lastGen: number;
  sourceId: number;
  targetId: number;
  // fixed-endpoint mode (motif ground cracks): endpoints in world space
  // instead of live entity anchors
  fixed: boolean;
  fromP: THREE.Vector3;
  toP: THREE.Vector3;
  width: number;
  jagScale: number;
  core: THREE.Color;
  glow: THREE.Color;
  pts: THREE.Vector3[];
  count: number;
}

interface TrailSlot {
  active: boolean;
  targetId: number;
  ttl: number;
  width: number;
  core: THREE.Color;
  glow: THREE.Color;
  head: THREE.Vector3;
  ring: THREE.Vector3[]; // last TRAIL_PTS head positions, oldest overwritten
  ringHead: number;
  ringCount: number;
  onArrive: ((x: number, y: number, z: number) => void) | null;
}

interface ArcSlot {
  active: boolean;
  age: number;
  life: number;
  width: number;
  core: THREE.Color;
  glow: THREE.Color;
  pts: THREE.Vector3[];
}

export type RibbonAnchor = (id: number, heightFrac: number) => THREE.Vector3 | null;

// Plain world point (structurally satisfied by THREE.Vector3).
export interface RibbonPoint {
  x: number;
  y: number;
  z: number;
}

export class AbilityVfxRibbons {
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(MAX_VERTS * 3);
  private col = new Float32Array(MAX_VERTS * 3);
  private uv = new Float32Array(MAX_VERTS * 2);
  private idx = new Uint32Array(MAX_INDICES);
  private mat: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private v = 0;
  private i = 0;
  private wasEmpty = true;
  private time = 0;

  private bolts: BoltSlot[] = [];
  private trails: TrailSlot[] = [];
  private arcs: ArcSlot[] = [];

  private t1 = new THREE.Vector3();
  private t2 = new THREE.Vector3();
  private t3 = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private ordered: THREE.Vector3[] = allocPts(TRAIL_PTS + 1); // scratch, holds refs only

  constructor(
    scene: THREE.Scene,
    private anchor: RibbonAnchor,
    tex: AbilityVfxTextures,
  ) {
    this.geo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute(
      'aCol',
      new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setAttribute(
      'uv',
      new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage),
    );
    this.geo.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(450, 0, 0), 2400);
    // Energy visibly flows along the strip: scrolling fBm over the soft ribbon
    // cross-section (the gallery's aFlow collapsed to a constant scroll).
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex.ribbon }, uNoise: { value: tex.noise }, uTime: { value: 0 } },
      vertexShader: `
        attribute vec3 aCol;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          vColor = aCol;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform sampler2D uNoise;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vec4 base = texture2D(uMap, vUv);
          float flow = 0.6 + 0.9 * texture2D(uNoise, vec2(vUv.x * 1.1 - uTime * 1.8, vUv.y * 0.4)).r;
          gl_FragColor = vec4(vColor * flow, base.a * min(flow, 1.1));
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.renderCategory = 'vfx';
    scene.add(this.mesh);
    for (let i = 0; i < BOLT_SLOTS; i++) {
      this.bolts.push({
        active: false,
        age: 0,
        life: 0,
        lastGen: -1,
        sourceId: 0,
        targetId: 0,
        fixed: false,
        fromP: new THREE.Vector3(),
        toP: new THREE.Vector3(),
        width: 0.1,
        jagScale: 1,
        core: new THREE.Color(),
        glow: new THREE.Color(),
        pts: allocPts(BOLT_PTS),
        count: 0,
      });
    }
    for (let i = 0; i < TRAIL_SLOTS; i++) {
      this.trails.push({
        active: false,
        targetId: 0,
        ttl: 0,
        width: 0.2,
        core: new THREE.Color(),
        glow: new THREE.Color(),
        head: new THREE.Vector3(),
        ring: allocPts(TRAIL_PTS),
        ringHead: 0,
        ringCount: 0,
        onArrive: null,
      });
    }
    for (let i = 0; i < ARC_SLOTS; i++) {
      this.arcs.push({
        active: false,
        age: 0,
        life: 0,
        width: 0.3,
        core: new THREE.Color(),
        glow: new THREE.Color(),
        pts: allocPts(ARC_PTS),
      });
    }
  }

  // A jagged electric crack from caster to target, regenerated every ~45ms so
  // it flickers (the gallery genBolt read, main line only: branches cost too
  // much churn for a crowd scene). Tracks both moving anchors. jagScale near 0
  // turns the crack into a wavering channel beam (drains, mind rays).
  spawnBolt(
    sourceId: number,
    targetId: number,
    colorHex: number,
    life = 0.22,
    width = 0.09,
    jagScale = 1,
  ): void {
    const slot = this.bolts.find((b) => !b.active) ?? this.bolts[0];
    slot.active = true;
    slot.age = 0;
    slot.life = life;
    slot.lastGen = -1;
    slot.sourceId = sourceId;
    slot.targetId = targetId;
    slot.fixed = false;
    slot.width = width;
    slot.jagScale = jagScale;
    slot.core.setHex(colorHex).lerp(WHITE, 0.55);
    slot.glow.setHex(colorHex);
    slot.count = 0;
  }

  // Fixed-endpoint variant (motif ground cracks, sky strikes): same flicker
  // regeneration between two world points instead of live entity anchors.
  spawnBoltPoints(
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
    colorHex: number,
    life = 0.3,
    width = 0.12,
    jagScale = 1,
  ): void {
    const slot = this.bolts.find((b) => !b.active) ?? this.bolts[0];
    slot.active = true;
    slot.age = 0;
    slot.life = life;
    slot.lastGen = -1;
    slot.fixed = true;
    slot.fromP.set(fx, fy, fz);
    slot.toP.set(tx, ty, tz);
    slot.width = width;
    slot.jagScale = jagScale;
    slot.core.setHex(colorHex).lerp(WHITE, 0.55);
    slot.glow.setHex(colorHex);
    slot.count = 0;
  }

  // A generic short-lived path ribbon: the caller fills the slot's
  // preallocated points (helix climbs, chain sags, fountain streams, gavel
  // strokes) and returns how many it wrote. Spawn-time-only closure cost.
  spawnPath(
    colorHex: number,
    width: number,
    life: number,
    fill: (pts: THREE.Vector3[]) => number,
  ): void {
    const slot = this.arcs.find((a) => !a.active) ?? this.arcs[0];
    const count = Math.min(ARC_PTS, Math.max(0, fill(slot.pts)));
    if (count < 2) return;
    // pad the unwritten tail onto the last point so the strip stays degenerate
    for (let i = count; i < ARC_PTS; i++) slot.pts[i].copy(slot.pts[count - 1]);
    slot.active = true;
    slot.age = 0;
    slot.life = life;
    slot.width = width;
    slot.core.setHex(colorHex).lerp(WHITE, 0.5);
    slot.glow.setHex(colorHex);
  }

  // A comet trail chasing the pooled Vfx projectile: advances with the same
  // speed/anchors, leaving a tapered ribbon through its recent positions.
  spawnTrail(
    sourceId: number,
    targetId: number,
    colorHex: number,
    width: number,
    onArrive: ((x: number, y: number, z: number) => void) | null = null,
  ): void {
    const from = this.anchor(sourceId, 0.62);
    if (!from) return;
    const slot = this.trails.find((t) => !t.active) ?? this.trails[0];
    slot.active = true;
    slot.targetId = targetId;
    slot.ttl = 3;
    slot.width = width;
    slot.core.setHex(colorHex).lerp(WHITE, 0.4);
    slot.glow.setHex(colorHex);
    slot.head.copy(from);
    slot.ring[0].copy(from);
    slot.ringHead = 1 % TRAIL_PTS;
    slot.ringCount = 1;
    slot.onArrive = onArrive;
  }

  // A bowed slash arc through a world point (melee strike read): computed once
  // into the slot's preallocated points, fades fast.
  spawnSlash(at: RibbonPoint, colorHex: number, span = 1.15, life = 0.22): void {
    this.slashOne(at, colorHex, span, life, (Math.random() - 0.5) * 1.1, 0, 0.34);
  }

  // The gallery's authored slash/trail vocabulary: every strike arc style and
  // impact trail style maps onto oriented slash strips through the target.
  spawnSlashStyled(at: RibbonPoint, colorHex: number, style: string, scale = 1): void {
    switch (style) {
      case 'vertical':
      case 'overhead':
        // overhead chop: top-to-bottom, nearly no horizontal travel
        this.slashOne(at, colorHex, 0.35 * scale, 0.26, 3.2, 0.55 * scale, 0.3);
        break;
      case 'uppercut':
        // rising cut: bottom-to-top with a forward kick
        this.slashOne(at, colorHex, 0.5 * scale, 0.26, -2.6, 0.5 * scale, 0.3);
        break;
      case 'thrust':
        // straight lunge: long, narrow, almost flat
        this.slashOne(at, colorHex, 1.5 * scale, 0.18, 0.05, 0, 0.12);
        break;
      case 'low':
        // ankle-height reap
        this.slashOne(at, colorHex, 1.1 * scale, 0.2, 0.15, -0.45, 0.28);
        break;
      case 'sweep':
        // extra-wide retaliatory sweep
        this.slashOne(at, colorHex, 1.6 * scale, 0.26, 0.25, 0, 0.4);
        break;
      case 'riposte':
        this.slashOne(at, colorHex, 1.0 * scale, 0.2, 0.9, 0.15, 0.26);
        break;
      case 'x':
      case 'cross':
        // two crossing diagonals
        this.slashOne(at, colorHex, 1.05 * scale, 0.26, 1.1, 0.1, 0.3);
        this.slashOne(at, colorHex, 1.05 * scale, 0.3, -1.1, 0.1, 0.3);
        break;
      case 'claws':
        // three parallel raking gashes
        for (let k = -1; k <= 1; k++)
          this.slashOne(at, colorHex, 0.85 * scale, 0.24, 1.4, 0.3 * k, 0.16);
        break;
      case 'bite':
        // two opposing jaw arcs snapping shut
        this.slashOne(at, colorHex, 0.7 * scale, 0.2, 2.4, 0.4, 0.22);
        this.slashOne(at, colorHex, 0.7 * scale, 0.22, -2.4, -0.4, 0.22);
        break;
      case 'crescent':
        // one moon-blade: wide, heavily bowed
        this.slashOne(at, colorHex, 1.3 * scale, 0.3, 0.4, 0.2, 0.5);
        break;
      default:
        // 'horizontal' / 'arc': the flat baseline sweep with a random tilt
        this.slashOne(at, colorHex, 1.15 * scale, 0.22, (Math.random() - 0.5) * 1.1, 0, 0.34);
        break;
    }
  }

  // One oriented slash strip: tilt skews the vertical travel across the swing
  // (large = vertical chop, negative = rising), lift offsets the whole arc.
  private slashOne(
    at: RibbonPoint,
    colorHex: number,
    span: number,
    life: number,
    tilt: number,
    lift: number,
    width: number,
  ): void {
    const slot = this.arcs.find((a) => !a.active) ?? this.arcs[0];
    slot.active = true;
    slot.age = 0;
    slot.life = life;
    slot.width = width;
    slot.core.setHex(colorHex).lerp(WHITE, 0.5);
    slot.glow.setHex(colorHex);
    // side axis perpendicular to the camera ray on XZ, so the arc always shows
    // its face
    const dx = at.x - this.camPos.x;
    const dz = at.z - this.camPos.z;
    const len = Math.hypot(dx, dz) || 1;
    const sx = -dz / len;
    const sz = dx / len;
    for (let i = 0; i < ARC_PTS; i++) {
      const u = i / (ARC_PTS - 1);
      const swing = (u - 0.5) * 2; // -1..1 across the target
      const bowY = Math.sin(u * Math.PI) * 0.34;
      slot.pts[i].set(
        at.x + sx * swing * span,
        at.y + lift + bowY + swing * tilt * 0.4,
        at.z + sz * swing * span,
      );
    }
  }

  update(dt: number, camPos: THREE.Vector3): void {
    this.time += dt;
    this.camPos.copy(camPos);
    this.v = 0;
    this.i = 0;

    for (const b of this.bolts) {
      if (!b.active) continue;
      b.age += dt;
      if (b.age >= b.life) {
        b.active = false;
        continue;
      }
      if (b.age - b.lastGen >= 0.045) {
        b.lastGen = b.age;
        this.genBolt(b);
      }
      if (b.count < 2) continue;
      const k = (1 - b.age / b.life) ** 0.7;
      this.add(b.pts, b.count, b.width * 3.2, b.glow, 1.3 * k, 1);
      this.add(b.pts, b.count, b.width, b.core, 2.6 * k, 1);
    }

    for (const t of this.trails) {
      if (!t.active) continue;
      t.ttl -= dt;
      const target = this.anchor(t.targetId, 0.5);
      if (!target || t.ttl <= 0) {
        t.active = false;
        continue;
      }
      this.t1.subVectors(target, t.head);
      const dist = this.t1.length();
      const step = TRAIL_SPEED * dt;
      if (dist <= Math.max(0.7, step)) {
        if (t.onArrive) t.onArrive(target.x, target.y, target.z);
        t.active = false;
        continue;
      }
      t.head.addScaledVector(this.t1, step / dist);
      t.ring[t.ringHead].copy(t.head);
      t.ringHead = (t.ringHead + 1) % TRAIL_PTS;
      if (t.ringCount < TRAIL_PTS) t.ringCount++;
      // oldest-to-newest through the ring, head last (scratch holds refs only)
      let n = 0;
      for (let k = 0; k < t.ringCount; k++) {
        const idx = (t.ringHead - t.ringCount + k + TRAIL_PTS * 2) % TRAIL_PTS;
        this.ordered[n++] = t.ring[idx];
      }
      if (n >= 2) {
        this.add(this.ordered, n, t.width * 2.6, t.glow, 1.2, 0.85);
        this.add(this.ordered, n, t.width, t.core, 2.2, 0.85);
      }
    }

    for (const a of this.arcs) {
      if (!a.active) continue;
      a.age += dt;
      if (a.age >= a.life) {
        a.active = false;
        continue;
      }
      const k = (1 - a.age / a.life) ** 2;
      this.add(a.pts, ARC_PTS, a.width * 2.4, a.glow, 1.1 * k, 0.9);
      this.add(a.pts, ARC_PTS, a.width, a.core, 2.4 * k, 0.9);
    }

    this.commit();
  }

  clear(): void {
    for (const b of this.bolts) b.active = false;
    for (const t of this.trails) t.active = false;
    for (const a of this.arcs) a.active = false;
  }

  // Midpoint displacement into the slot's preallocated points (no branches).
  private genBolt(b: BoltSlot): void {
    const from = b.fixed ? b.fromP : this.anchor(b.sourceId, 0.62);
    const to = b.fixed ? b.toP : this.anchor(b.targetId, 0.5);
    if (!from || !to) {
      b.count = 0;
      return;
    }
    const pts = b.pts;
    pts[0].copy(from);
    pts[BOLT_PTS - 1].copy(to);
    this.t1.subVectors(to, from);
    const totalLen = this.t1.length() || 1;
    this.t1.multiplyScalar(1 / totalLen);
    this.t2
      .set(this.t1.y, -this.t1.x + 0.31, this.t1.z + 0.17)
      .cross(this.t1)
      .normalize();
    this.t3.crossVectors(this.t1, this.t2);
    let stride = BOLT_PTS - 1;
    let amp = totalLen * 0.14 * b.jagScale;
    while (stride > 1) {
      const half = stride / 2;
      for (let s = 0; s + stride < BOLT_PTS; s += stride) {
        const mid = pts[s + half];
        mid.lerpVectors(pts[s], pts[s + stride], 0.5);
        mid.addScaledVector(this.t2, (Math.random() * 2 - 1) * amp);
        mid.addScaledVector(this.t3, (Math.random() * 2 - 1) * amp);
      }
      stride = half;
      amp *= 0.52;
    }
    b.count = BOLT_PTS;
  }

  // Append one camera-facing tapered strip (the gallery RibbonMesh.add).
  private add(
    pts: THREE.Vector3[],
    n: number,
    width: number,
    color: THREE.Color,
    mul: number,
    taper: number,
  ): void {
    if (n < 2 || this.v + n * 2 > MAX_VERTS || this.i + (n - 1) * 6 > MAX_INDICES) return;
    const base = this.v;
    for (let k = 0; k < n; k++) {
      const p = pts[k];
      const prev = pts[Math.max(0, k - 1)];
      const next = pts[Math.min(n - 1, k + 1)];
      this.t1.subVectors(next, prev);
      this.t2.subVectors(this.camPos, p);
      this.t1.cross(this.t2);
      const tl = this.t1.length();
      if (tl > 1e-6) this.t1.multiplyScalar(1 / tl);
      const u = k / (n - 1);
      const pinch = taper > 0 ? Math.min(1, 4 * u * (1 - u) + (1 - taper)) : 1;
      const w = width * pinch * 0.5;
      const vi = (base + k * 2) * 3;
      this.pos[vi] = p.x + this.t1.x * w;
      this.pos[vi + 1] = p.y + this.t1.y * w;
      this.pos[vi + 2] = p.z + this.t1.z * w;
      this.pos[vi + 3] = p.x - this.t1.x * w;
      this.pos[vi + 4] = p.y - this.t1.y * w;
      this.pos[vi + 5] = p.z - this.t1.z * w;
      const r = color.r * mul;
      const g = color.g * mul;
      const bl = color.b * mul;
      this.col[vi] = r;
      this.col[vi + 1] = g;
      this.col[vi + 2] = bl;
      this.col[vi + 3] = r;
      this.col[vi + 4] = g;
      this.col[vi + 5] = bl;
      const ui = (base + k * 2) * 2;
      this.uv[ui] = u * 3;
      this.uv[ui + 1] = 0;
      this.uv[ui + 2] = u * 3;
      this.uv[ui + 3] = 1;
    }
    for (let k = 0; k < n - 1; k++) {
      const a = base + k * 2;
      this.idx[this.i++] = a;
      this.idx[this.i++] = a + 1;
      this.idx[this.i++] = a + 2;
      this.idx[this.i++] = a + 1;
      this.idx[this.i++] = a + 3;
      this.idx[this.i++] = a + 2;
    }
    this.v += n * 2;
  }

  private commit(): void {
    this.mat.uniforms.uTime.value = this.time % 3600;
    if (this.i === 0) {
      if (!this.wasEmpty) {
        this.wasEmpty = true;
        this.geo.setDrawRange(0, 0);
      }
      return;
    }
    this.wasEmpty = false;
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aCol as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.uv as THREE.BufferAttribute).needsUpdate = true;
    if (this.geo.index) this.geo.index.needsUpdate = true;
    this.geo.setDrawRange(0, this.i);
  }
}
