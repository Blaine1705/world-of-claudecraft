// Thatchbound's visual layer (Old Thatchgrin's mind control, sim:
// src/sim/seasonal/scarecrow_puppet.ts), composed by ScarecrowFx (scarecrow_fx.ts):
//
//  - THE CAST: glowing strings reach out of his raised hand toward each marked victim over
//    the cast bar (the mark under the victim is the shared encounter rune circle);
//  - THE CURSE LANDING: a burst of crow feathers and straw off the victim and a dark-ember
//    shockwave (the curse's violet, never his fire's orange) rolling out round them;
//  - THE PUPPET, for as long as it is held: marionette strings from a swaying control bar
//    high above down to its head, hands and back, two burning eyes, a spinning violet sigil
//    under its feet, and a swirl of straw and feathers climbing its body;
//  - FREED: the strings snap in a spray of straw.
// The strings, eyes and sigil are the read of WHO is controlled (allies act on it), so
// they draw at every graphics tier; only the swirl's particle rate thins (reduced motion).
//
// GPU work: one root group built on the first sight of a puppet or a mark, attached through
// the world compile gate (attachSceneGroupGated). Every string and bar is one instance of a
// single pooled InstancedMesh (an additive core plus a wider dim sheath per segment), the
// sigils and the shockwaves are two more pooled InstancedMeshes, and the eyes are a small
// fixed pool of sprites sharing one material. Instance colours carry the fade (additive:
// darker is fainter), set before the first link so the program variant is the one used.
// An idle pool is hidden once its twin window is over, costing no draw. Particles ride the
// pooled point cloud (vfx.ts) through the boss layer's particle seam.
import * as THREE from 'three';
import { attachSceneGroupGated } from './gated_scene_attach';
import {
  BARS_PER_PUPPET,
  BOSS_HAND_UP,
  CAST_STRING_CAP,
  castReach,
  eyeSize,
  PUPPET_ABILITY,
  PUPPET_AURA_IDS,
  PUPPET_CAP,
  puppetBars,
  puppetBody,
  puppetEyes,
  puppetStrings,
  SHOCK_SEC,
  STRINGS_PER_PUPPET,
  shockwave,
  sigilState,
  stringGlow,
  swirlPoint,
  swirlRate,
  type Vec3Like,
} from './thatchbound_fx_core';

/** The pooled particle calls this layer uses (vfx.ts, through ScarecrowFx's seam). */
export interface ThatchboundParticles {
  burst(at: THREE.Vector3, school: string, count?: number, power?: number, color?: number): void;
  groundPuff(at: THREE.Vector3, power: number, color: number): void;
}

interface PuppetEntity {
  pos: { x: number; y: number; z: number };
  facing: number;
  dead: boolean;
  auras?: readonly { id: string }[];
}

interface MarkLike {
  sourceId?: number;
  targetId?: number;
  duration?: number;
}

interface PuppetSlot {
  born: number;
  phase: number;
  auraId: string;
  swirlClock: number;
  seen: boolean;
  last: THREE.Vector3;
}

interface CastString {
  bossId: number;
  victimId: number;
  start: number;
  duration: number;
}

interface Shock {
  x: number;
  y: number;
  z: number;
  born: number;
}

const STRING_EMBER = new THREE.Color(0xffb060);
const SHEATH_EMBER = new THREE.Color(0x3a1406);
const BAR_EMBER = new THREE.Color(0x8a3a10);
// the curse's colour: a sickly violet, never the orange of his burning ground (a sigil under
// a friend must not read as fire to step out of)
const SIGIL_EMBER = new THREE.Color(0xa050ff);
const SHOCK_EMBER = new THREE.Color(0x8a40e0);
const EYE_EMBER = 0xff5a10;
const STRAW = 0xd8b25a;
const FEATHERS = [0x15141a, 0x24222b, 0x0a0a0d] as const;
const SEGMENTS_PER_PUPPET = STRINGS_PER_PUPPET + BARS_PER_PUPPET;
/** Core plus sheath per segment, for every puppet and every cast string. */
const SEGMENT_CAP = (PUPPET_CAP * SEGMENTS_PER_PUPPET + CAST_STRING_CAP) * 2;
const SHOCK_CAP = PUPPET_CAP;
const STRING_WIDTH = 0.018;
const SHEATH_WIDTH = 0.07;
const BAR_WIDTH = 0.05;
const SIGIL_RADIUS = 1.9;
const TWIN_SEC = 3;

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const BLACK = new THREE.Color(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const scratchMat = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchDir = new THREE.Vector3();
const scratchPos = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchColor = new THREE.Color();

/** The sigil's alpha art: a ring, an inner ring, and straw spokes (grey on black). */
function sigilTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const mid = size / 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    const g = ctx.createRadialGradient(mid, mid, mid * 0.2, mid, mid, mid);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(mid, mid, mid * 0.88, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mid, mid, mid * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    // straw spokes, crossed like a scarecrow's lashing, between the rings
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const b = a + 0.32;
      ctx.lineWidth = i % 3 === 0 ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(mid + Math.cos(a) * mid * 0.62, mid + Math.sin(a) * mid * 0.62);
      ctx.lineTo(mid + Math.cos(b) * mid * 0.88, mid + Math.sin(b) * mid * 0.88);
      ctx.stroke();
    }
    // the stitched grin at the centre
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mid, mid * 0.98, mid * 0.28, 0.2, Math.PI - 0.2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = 0.35 + (i / 5) * (Math.PI - 0.7);
      const x = mid + Math.cos(a) * mid * 0.28;
      const y = mid * 0.98 + Math.sin(a) * mid * 0.28;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x, y + 8);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** A hot round glow (colour on transparent): the burning eyes. */
function eyeTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const mid = size / 2;
    const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    g.addColorStop(0, 'rgba(255,250,220,1)');
    g.addColorStop(0.2, 'rgba(255,170,60,0.95)');
    g.addColorStop(0.5, 'rgba(255,80,10,0.35)');
    g.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

export class ThatchboundFx {
  private root: THREE.Group | null = null;
  private segGeo: THREE.CylinderGeometry | null = null;
  private segMat: THREE.MeshBasicMaterial | null = null;
  private segs: THREE.InstancedMesh | null = null;
  private sigilGeo: THREE.CircleGeometry | null = null;
  private sigilTex: THREE.Texture | null = null;
  private sigilMat: THREE.MeshBasicMaterial | null = null;
  private sigils: THREE.InstancedMesh | null = null;
  private shockGeo: THREE.RingGeometry | null = null;
  private shockMat: THREE.MeshBasicMaterial | null = null;
  private shocks: THREE.InstancedMesh | null = null;
  private eyeTex: THREE.Texture | null = null;
  private eyeMat: THREE.SpriteMaterial | null = null;
  private eyes: THREE.Sprite[] = [];
  private readonly puppets = new Map<number, PuppetSlot>();
  private readonly casts: CastString[] = [];
  private readonly shockList: Shock[] = [];
  private time = 0;
  private rootBorn = 0;
  private disposed = false;
  private idle = false;

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly particles: ThatchboundParticles,
    private readonly entities: () => ReadonlyMap<number, PuppetEntity>,
    private readonly entity: (id: number) => PuppetEntity | undefined,
    private readonly compileGate?: (target: THREE.Object3D) => Promise<unknown>,
  ) {}

  private ensureRoot(): void {
    if (this.root) return;
    const root = new THREE.Group();
    root.name = 'thatchbound-fx';
    // strings and bars: a unit cylinder standing on its base, stretched along each segment
    this.segGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    this.segGeo.translate(0, 0.5, 0);
    this.segMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.segs = new THREE.InstancedMesh(this.segGeo, this.segMat, SEGMENT_CAP);
    for (let i = 0; i < SEGMENT_CAP; i++) {
      this.segs.setMatrixAt(i, HIDDEN);
      this.segs.setColorAt(i, BLACK);
    }
    this.segs.frustumCulled = false;
    this.segs.name = 'thatchbound-strings';
    root.add(this.segs);
    // the sigils under the puppets
    this.sigilTex = sigilTexture();
    this.sigilGeo = new THREE.CircleGeometry(1, 48);
    this.sigilGeo.rotateX(-Math.PI / 2);
    this.sigilMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      alphaMap: this.sigilTex ?? undefined,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.sigils = new THREE.InstancedMesh(this.sigilGeo, this.sigilMat, PUPPET_CAP);
    for (let i = 0; i < PUPPET_CAP; i++) {
      this.sigils.setMatrixAt(i, HIDDEN);
      this.sigils.setColorAt(i, BLACK);
    }
    this.sigils.frustumCulled = false;
    this.sigils.name = 'thatchbound-sigils';
    root.add(this.sigils);
    // the curse's shockwave rings
    this.shockGeo = new THREE.RingGeometry(0.86, 1, 64);
    this.shockGeo.rotateX(-Math.PI / 2);
    this.shockMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.shocks = new THREE.InstancedMesh(this.shockGeo, this.shockMat, SHOCK_CAP);
    for (let i = 0; i < SHOCK_CAP; i++) {
      this.shocks.setMatrixAt(i, HIDDEN);
      this.shocks.setColorAt(i, BLACK);
    }
    this.shocks.frustumCulled = false;
    this.shocks.name = 'thatchbound-shocks';
    root.add(this.shocks);
    // the burning eyes: a fixed pool sharing one material (the first is the program twin)
    this.eyeTex = eyeTexture();
    this.eyeMat = new THREE.SpriteMaterial({
      map: this.eyeTex ?? undefined,
      color: EYE_EMBER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < PUPPET_CAP * 2; i++) {
      const s = new THREE.Sprite(this.eyeMat);
      s.scale.setScalar(0.001);
      s.visible = i === 0;
      root.add(s);
      this.eyes.push(s);
    }
    this.root = root;
    this.rootBorn = this.time;
    void attachSceneGroupGated(this.scene, root, this.compileGate, () => this.disposed).catch(
      () => {},
    );
  }

  /** A Thatchbound mark (the cast's spellfxAt on a victim): a string reaches for it. */
  handleMark(ev: MarkLike): void {
    if (this.disposed || ev.sourceId === undefined || ev.targetId === undefined) return;
    this.ensureRoot();
    if (this.casts.length >= CAST_STRING_CAP) this.casts.shift();
    this.casts.push({
      bossId: ev.sourceId,
      victimId: ev.targetId,
      start: this.time,
      duration: ev.duration ?? 2.5,
    });
  }

  /** Whether an event belongs to this layer (its marks are routed here by ScarecrowFx). */
  static claims(ability: string | undefined): boolean {
    return ability === PUPPET_ABILITY;
  }

  update(dt: number, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.time += dt;
    // who is a puppet this frame
    for (const slot of this.puppets.values()) slot.seen = false;
    this.entities().forEach((e, id) => {
      if (e.dead || !e.auras || e.auras.length === 0) return;
      let auraId: string | null = null;
      for (const a of e.auras) {
        if (PUPPET_AURA_IDS.has(a.id)) {
          auraId = a.id;
          break;
        }
      }
      if (auraId === null) return;
      let slot = this.puppets.get(id);
      if (!slot) {
        if (this.puppets.size >= PUPPET_CAP) return;
        this.ensureRoot();
        slot = {
          born: this.time,
          phase: (id % 97) * 0.37,
          auraId,
          swirlClock: 0,
          seen: true,
          last: new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z),
        };
        this.puppets.set(id, slot);
        this.landed(e);
      }
      slot.seen = true;
      slot.auraId = auraId;
      slot.last.set(e.pos.x, e.pos.y, e.pos.z);
    });
    for (const [id, slot] of this.puppets) {
      if (slot.seen) continue;
      this.freed(slot.last);
      this.puppets.delete(id);
    }
    if (!this.root) return;
    this.draw(dt, reducedMotion);
  }

  /** The curse lands on a body: feathers and straw burst off it, a shockwave rolls out. */
  private landed(e: PuppetEntity): void {
    const at = scratchPos.set(e.pos.x, e.pos.y + 1.4, e.pos.z);
    for (let i = 0; i < FEATHERS.length; i++)
      this.particles.burst(at, 'shadow', 22, 1.5, FEATHERS[i]);
    this.particles.burst(at, 'nature', 30, 1.3, STRAW);
    this.particles.burst(at, 'fire', 18, 1.1, 0xff7a2a);
    this.particles.groundPuff(scratchPos.set(e.pos.x, e.pos.y, e.pos.z), 1.2, 0x5a4528);
    if (this.shockList.length >= SHOCK_CAP) this.shockList.shift();
    this.shockList.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, born: this.time });
  }

  /** The strings snap: a spray of straw where the puppet stood. */
  private freed(at: THREE.Vector3): void {
    this.particles.burst(scratchPos.set(at.x, at.y + 3.5, at.z), 'nature', 26, 1.2, STRAW);
    this.particles.burst(scratchPos.set(at.x, at.y + 1.2, at.z), 'nature', 14, 0.8, STRAW);
  }

  private segment(index: number, a: Vec3Like, b: Vec3Like, width: number, color: THREE.Color) {
    if (!this.segs) return;
    scratchDir.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const len = scratchDir.length();
    if (len < 1e-4) {
      this.segs.setMatrixAt(index, HIDDEN);
      return;
    }
    scratchDir.divideScalar(len);
    scratchQuat.setFromUnitVectors(UP, scratchDir);
    scratchMat.compose(
      scratchPos.set(a.x, a.y, a.z),
      scratchQuat,
      scratchScale.set(width, len, width),
    );
    this.segs.setMatrixAt(index, scratchMat);
    this.segs.setColorAt(index, color);
  }

  private draw(dt: number, reducedMotion: boolean): void {
    const segs = this.segs;
    const sigils = this.sigils;
    const shocks = this.shocks;
    if (!segs || !sigils || !shocks) return;
    const twins = this.time - this.rootBorn < TWIN_SEC;
    // drop the finished cast strings and shockwaves
    for (let i = this.casts.length - 1; i >= 0; i--) {
      const c = this.casts[i];
      if (this.time - c.start > c.duration + 0.15) this.casts.splice(i, 1);
    }
    for (let i = this.shockList.length - 1; i >= 0; i--) {
      if (this.time - this.shockList[i].born > SHOCK_SEC) this.shockList.splice(i, 1);
    }
    const active = this.puppets.size > 0 || this.casts.length > 0 || this.shockList.length > 0;
    if (!active && this.idle && !twins) return;
    let seg = 0;
    let sigil = 0;
    let eye = 0;
    for (const [id, slot] of this.puppets) {
      const e = this.entity(id);
      if (!e) continue;
      const body = puppetBody(slot.auraId);
      const glow = stringGlow(this.time - slot.born, this.time, slot.phase);
      const strings = puppetStrings(e.pos, e.facing, body, this.time, slot.phase);
      for (const [a, b] of strings) {
        this.segment(
          seg++,
          a,
          b,
          STRING_WIDTH,
          scratchColor.copy(STRING_EMBER).multiplyScalar(glow),
        );
        this.segment(
          seg++,
          a,
          b,
          SHEATH_WIDTH,
          scratchColor.copy(SHEATH_EMBER).multiplyScalar(glow),
        );
      }
      for (const [a, b] of puppetBars(e.pos, e.facing, this.time, slot.phase)) {
        this.segment(seg++, a, b, BAR_WIDTH, scratchColor.copy(BAR_EMBER).multiplyScalar(glow));
        this.segment(
          seg++,
          a,
          b,
          SHEATH_WIDTH * 1.4,
          scratchColor.copy(SHEATH_EMBER).multiplyScalar(glow * 0.6),
        );
      }
      // the sigil under its feet
      const s = sigilState(this.time, slot.phase);
      scratchQuat.setFromAxisAngle(UP, s.spin);
      scratchMat.compose(
        scratchPos.set(e.pos.x, e.pos.y + 0.06, e.pos.z),
        scratchQuat,
        scratchScale.setScalar(SIGIL_RADIUS),
      );
      sigils.setMatrixAt(sigil, scratchMat);
      sigils.setColorAt(sigil, scratchColor.copy(SIGIL_EMBER).multiplyScalar(s.glow));
      sigil++;
      // the burning eyes
      const size = eyeSize(this.time, slot.phase);
      for (const p of puppetEyes(e.pos, e.facing, body)) {
        const sprite = this.eyes[eye++];
        if (!sprite) break;
        sprite.visible = true;
        sprite.position.set(p.x, p.y, p.z);
        sprite.scale.setScalar(size);
      }
      // the swirl of straw and feathers climbing it
      slot.swirlClock += dt * swirlRate(reducedMotion);
      while (slot.swirlClock >= 1) {
        slot.swirlClock -= 1;
        const k = Math.floor(this.time * 61 + slot.phase * 13);
        const p = swirlPoint(e.pos, this.time, k);
        const feather = k % 3 !== 0;
        this.particles.burst(
          scratchPos.set(p.x, p.y, p.z),
          feather ? 'shadow' : 'nature',
          2,
          0.35,
          feather ? FEATHERS[k % FEATHERS.length] : STRAW,
        );
      }
    }
    // the cast's strings reaching out of his hand toward each marked victim
    for (const c of this.casts) {
      const boss = this.entity(c.bossId);
      const victim = this.entity(c.victimId);
      if (!boss || !victim) continue;
      const reach = castReach(this.time - c.start, c.duration);
      const a = { x: boss.pos.x, y: boss.pos.y + BOSS_HAND_UP, z: boss.pos.z };
      const tip = {
        x: a.x + (victim.pos.x - a.x) * reach,
        y: a.y + (victim.pos.y + 1.8 - a.y) * reach,
        z: a.z + (victim.pos.z - a.z) * reach,
      };
      const flick = 0.75 + 0.25 * Math.sin(this.time * 14 + c.victimId);
      this.segment(
        seg++,
        a,
        tip,
        STRING_WIDTH * 1.3,
        scratchColor.copy(STRING_EMBER).multiplyScalar(flick),
      );
      this.segment(
        seg++,
        a,
        tip,
        SHEATH_WIDTH,
        scratchColor.copy(SHEATH_EMBER).multiplyScalar(flick),
      );
    }
    for (let i = seg; i < SEGMENT_CAP; i++) segs.setMatrixAt(i, HIDDEN);
    for (let i = sigil; i < PUPPET_CAP; i++) sigils.setMatrixAt(i, HIDDEN);
    for (let i = eye; i < this.eyes.length; i++) {
      const sprite = this.eyes[i];
      sprite.scale.setScalar(0.001);
      sprite.visible = twins && i === 0;
    }
    // the shockwaves
    let shock = 0;
    for (const sh of this.shockList) {
      const w = shockwave(this.time - sh.born);
      scratchMat.compose(
        scratchPos.set(sh.x, sh.y + 0.1, sh.z),
        scratchQuat.identity(),
        scratchScale.setScalar(w.radius),
      );
      shocks.setMatrixAt(shock, scratchMat);
      shocks.setColorAt(shock, scratchColor.copy(SHOCK_EMBER).multiplyScalar(w.glow));
      shock++;
    }
    for (let i = shock; i < SHOCK_CAP; i++) shocks.setMatrixAt(i, HIDDEN);
    for (const mesh of [segs, sigils, shocks]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    // an idle pool past its twin window costs no draw
    segs.visible = twins || seg > 0;
    sigils.visible = twins || sigil > 0;
    shocks.visible = twins || shock > 0;
    this.idle = !active;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root?.removeFromParent();
    this.segs?.dispose();
    this.segGeo?.dispose();
    this.segMat?.dispose();
    this.sigils?.dispose();
    this.sigilGeo?.dispose();
    this.sigilTex?.dispose();
    this.sigilMat?.dispose();
    this.shocks?.dispose();
    this.shockGeo?.dispose();
    this.shockMat?.dispose();
    this.eyeTex?.dispose();
    this.eyeMat?.dispose();
    this.eyes = [];
    this.puppets.clear();
    this.casts.length = 0;
    this.shockList.length = 0;
    this.root = null;
    this.segs = null;
    this.sigils = null;
    this.shocks = null;
  }
}
