// Cantor Ilvane's effects on the crypt boss host (crypt_boss_fx.ts), read off
// the sim (src/sim/encounters/hollow_crypt/ilvane*.ts):
//
//  - the Dirge of the Hollow: under her the kick glyph (or, for the heroic
//    Unbroken Verse, a lethal ring with no glyph: hide), the violet rings of
//    her voice rolling out, and on the loft floor the SHADOW each choir pillar
//    throws from her voice (pale, still: stand there and she cannot see you;
//    the sim's line of sight agrees); then the blast, or the song shattering
//    when it is cut;
//  - Harmony: a thread of song from every living Chorister into her;
//  - the Bone Organ: each note lane gathering on the floor as the sim's object
//    says, then the burst, notes racing down it, the pipes flaring;
//  - Encore: a Chorister climbing back up.
//
// The glyph, the ring, the pillar shadows and the lanes are actionable and draw
// on every tier; the rings, notes and sparks are cosmetic.

import * as THREE from 'three';
import { HOLLOW_CRYPT_FIELD } from '../../sim/content/hollow_crypt_layout';
import {
  CHORISTER_ID,
  ILVANE_CRESCENDO,
  ILVANE_DIRGE,
  ILVANE_DIRGE_CUT,
  ILVANE_ENCORE,
  ILVANE_HARMONY,
  ILVANE_ID,
  ILVANE_NOTE_BURST_TEMPLATE,
  ILVANE_NOTE_MARK_TEMPLATE,
  ILVANE_NOTES_BURST,
  ILVANE_TUNING,
  ILVANE_UNBROKEN_DIRGE,
  NOTE_LANE_HALF,
} from '../../sim/encounters/hollow_crypt/ilvane_ids';
import type { Entity, SimEvent } from '../../sim/types';
import type { IWorld } from '../../world_api';
import {
  TELEGRAPH_ACCENTS,
  TELEGRAPH_THREAT_COLORS,
  type TelegraphFan,
  type TelegraphLane,
  telegraphFillOf,
} from '../floor_telegraph';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import type { CryptBossFxHost, CryptBossPainter } from './crypt_boss_fx';
import { cryptSlotOrigin, noteRun, pillarShadow } from './crypt_boss_fx_core';

const T = ILVANE_TUNING;
const SCAN_SEC = 0.1;
const LANES = 21;
const SONG = { r: 0.72, g: 0.45, b: 1 };
const PALE = { r: 0.8, g: 0.92, b: 1 };
/** The choir pillars (instance-local), the line-of-sight cover of her loft. */
const CHOIR_PILLARS = HOLLOW_CRYPT_FIELD.props.filter((p) => p.kind === 'hc_choir_pillar');
/** How far a pillar's shadow is drawn from her voice (the loft's reach). */
const SHADOW_REACH = 30;

const SHADOW_VERT = /* glsl */ `
attribute float aFar;
varying float vFar;
varying vec3 vWorld;
void main() {
  vFar = aFar;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/** A pillar's sight shadow: a pale, still band behind the stone, its near end
 *  crisp at the pillar, fading out toward its far end. */
const SHADOW_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
varying float vFar;
varying vec3 vWorld;
void main() {
  float fade = 1.0 - smoothstep(0.55, 1.0, vFar);
  float shimmer = 0.85 + 0.15 * sin(vWorld.x * 1.3 + vWorld.z * 1.1 + uTime * 1.5);
  vec3 col = vec3(0.62, 0.86, 1.0) * shimmer;
  gl_FragColor = vec4(col, 0.3 * fade * uAlpha);
}
`;

interface LaneSlot extends TelegraphLane {
  objectId: number;
  born: number;
  burstAt: number;
}

interface Shadow {
  mesh: THREE.Mesh;
  pos: THREE.BufferAttribute;
}

export class IlvaneFx implements CryptBossPainter {
  private readonly glyph: TelegraphFan;
  private readonly unbroken: TelegraphFan;
  private readonly lanes: LaneSlot[] = [];
  private readonly shadows: Shadow[] = [];
  private readonly shadowMat: THREE.ShaderMaterial;
  private ilvaneId = -1;
  private choristers: number[] = [];
  private scan = 0;
  private ring = 0;
  private thread = 0;

  constructor(private readonly host: CryptBossFxHost) {
    const kit = host.kit;
    this.glyph = kit.fan(13);
    kit.layOutFan(this.glyph, 360, {
      color: TELEGRAPH_THREAT_COLORS.interrupt,
      accent: TELEGRAPH_ACCENTS.shadow,
      sigil: true,
    });
    this.unbroken = kit.fan(13);
    kit.layOutFan(this.unbroken, 360, {
      color: TELEGRAPH_THREAT_COLORS.lethal,
      accent: TELEGRAPH_ACCENTS.shadow,
    });
    for (let i = 0; i < LANES; i++)
      this.lanes.push({ ...kit.lane(9), objectId: -1, born: 0, burstAt: 0 });
    this.shadowMat = host.own(
      new THREE.ShaderMaterial({
        uniforms: { uTime: host.uTime, uAlpha: { value: 0 } },
        vertexShader: SHADOW_VERT,
        fragmentShader: SHADOW_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    for (let i = 0; i < CHOIR_PILLARS.length; i++) {
      const g = host.own(new THREE.BufferGeometry());
      const pos = new THREE.BufferAttribute(new Float32Array(12), 3).setUsage(
        THREE.DynamicDrawUsage,
      );
      g.setAttribute('position', pos);
      g.setAttribute('aFar', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 1]), 1));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const mesh = new THREE.Mesh(g, this.shadowMat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.renderOrder = floorVfxRenderOrder('encounter', 5);
      host.root.add(mesh);
      this.shadows.push({ mesh, pos });
    }
  }

  // ------------------------------------------------------------------ events

  handleEvent(ev: SimEvent & { type: 'spellfx' }, world: IWorld): void {
    const a = ev.ability;
    const src = world.entities.get(ev.sourceId);
    if (!src) return;
    if ((a === ILVANE_DIRGE || a === ILVANE_UNBROKEN_DIRGE) && ev.fx === 'nova') this.blast(src);
    else if (a === ILVANE_DIRGE_CUT) this.cut(src);
    else if (a === ILVANE_NOTES_BURST) this.pipes(src);
    else if (a === ILVANE_ENCORE) this.encore(src);
  }

  private blast(e: Entity): void {
    const h = this.host;
    const now = h.clock();
    h.wave(e.pos.x, e.pos.z, 34, 1, 0xb98cff, 0.12);
    h.wave(e.pos.x, e.pos.z, 20, 0.7, 0xffffff, 0.06);
    const n = Math.round(140 * h.density);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = 14 + h.rand() * 8;
      h.glow.emit(now, {
        x: e.pos.x,
        y: e.pos.y + 3 + h.rand() * 2,
        z: e.pos.z,
        vx: Math.sin(a) * s,
        vy: (h.rand() - 0.5) * 3,
        vz: Math.cos(a) * s,
        life: 0.9,
        drag: 1.6,
        size0: 1.2,
        size1: 0.2,
        ...SONG,
        a: 0.9,
      });
    }
    h.shakeAt(e.pos.x, e.pos.z, 0.5);
  }

  /** The song shatters when it is cut: notes scattering like broken glass. */
  private cut(e: Entity): void {
    const h = this.host;
    const now = h.clock();
    for (let i = 0; i < Math.round(60 * h.density); i++) {
      const a = h.rand() * Math.PI * 2;
      const s = 4 + h.rand() * 6;
      h.glow.emit(now, {
        x: e.pos.x,
        y: e.pos.y + 4,
        z: e.pos.z,
        vx: Math.sin(a) * s,
        vy: (h.rand() - 0.3) * 6,
        vz: Math.cos(a) * s,
        ay: -10,
        life: 0.7,
        drag: 1,
        size0: 0.6,
        size1: 0.1,
        ...PALE,
        a: 1,
      });
    }
    h.wave(e.pos.x, e.pos.z, 6, 0.4, 0xfff2c0, 0.3);
  }

  /** The organ's pipes flare as a wave of notes bursts. */
  private pipes(e: Entity): void {
    const h = this.host;
    const now = h.clock();
    const o = cryptSlotOrigin(e.pos.x, e.pos.z);
    const y = h.groundY(o.x, o.z + 170) + 6;
    for (let i = 0; i < Math.round(50 * h.density); i++) {
      const x = o.x - 8 + h.rand() * 16;
      h.glow.emit(now, {
        x,
        y: y + h.rand() * 5,
        z: o.z + 170,
        vx: 0,
        vy: 3 + h.rand() * 3,
        vz: -1 - h.rand() * 2,
        life: 0.8,
        drag: 1,
        size0: 1,
        size1: 0.2,
        ...SONG,
        a: 0.85,
      });
    }
  }

  private encore(e: Entity): void {
    const h = this.host;
    const now = h.clock();
    const gy = h.groundY(e.pos.x, e.pos.z);
    for (let i = 0; i < Math.round(50 * h.density); i++) {
      const a = h.rand() * Math.PI * 2;
      h.glow.emit(now + h.rand() * 0.3, {
        x: e.pos.x + Math.sin(a) * 1.2,
        y: gy,
        z: e.pos.z + Math.cos(a) * 1.2,
        vx: -Math.sin(a),
        vy: 4 + h.rand() * 3,
        vz: -Math.cos(a),
        life: 1,
        drag: 0.8,
        size0: 0.9,
        size1: 0.2,
        ...SONG,
        a: 0.9,
      });
    }
    h.wave(e.pos.x, e.pos.z, 4, 0.6, 0xb98cff, 0.3);
  }

  // ------------------------------------------------------------------ frame

  update(world: IWorld, dt: number): void {
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = SCAN_SEC;
      this.scanWorld(world);
    }
    const ilvane = this.ilvaneId >= 0 ? world.entities.get(this.ilvaneId) : undefined;
    this.paintDirge(ilvane, dt);
    this.paintLanes(world, ilvane);
    if (ilvane) this.paintHarmony(world, ilvane, dt);
  }

  private scanWorld(world: IWorld): void {
    this.ilvaneId = -1;
    this.choristers = [];
    const live = new Set<number>();
    for (const e of world.entities.values()) {
      if (e.kind === 'mob') {
        if (e.dead) continue;
        if (e.templateId === ILVANE_ID) this.ilvaneId = e.id;
        else if (e.templateId === CHORISTER_ID) this.choristers.push(e.id);
        continue;
      }
      if (
        e.kind !== 'object' ||
        (e.templateId !== ILVANE_NOTE_MARK_TEMPLATE && e.templateId !== ILVANE_NOTE_BURST_TEMPLATE)
      )
        continue;
      live.add(e.id);
      const has = this.lanes.find((l) => l.objectId === e.id);
      if (has) {
        if (e.templateId === ILVANE_NOTE_BURST_TEMPLATE && has.burstAt === 0)
          has.burstAt = this.host.clock();
        continue;
      }
      const slot = this.lanes.find((l) => l.objectId < 0);
      if (!slot) continue;
      slot.objectId = e.id;
      slot.born = this.host.clock();
      slot.burstAt = e.templateId === ILVANE_NOTE_BURST_TEMPLATE ? this.host.clock() : 0;
    }
    for (const l of this.lanes)
      if (l.objectId >= 0 && !live.has(l.objectId)) {
        l.objectId = -1;
        l.burstAt = 0;
        l.group.visible = false;
      }
  }

  private paintDirge(ilvane: Entity | undefined, dt: number): void {
    const h = this.host;
    const casting = ilvane?.castingAbility;
    const singing = casting === ILVANE_DIRGE || casting === ILVANE_UNBROKEN_DIRGE;
    this.glyph.group.visible = false;
    this.unbroken.group.visible = false;
    if (!ilvane || !singing) {
      for (const s of this.shadows) s.mesh.visible = false;
      return;
    }
    const fill = telegraphFillOf(ilvane.castRemaining, ilvane.castTotal);
    const gy = h.groundY(ilvane.pos.x, ilvane.pos.z);
    const f = casting === ILVANE_DIRGE ? this.glyph : this.unbroken;
    h.kit.drapeFan(f, h.groundY, ilvane.pos.x, gy, ilvane.pos.z, 0, 2.6);
    h.kit.paintFan(f, { fill, clock: h.clock(), range: 2.6 });
    f.group.visible = true;
    // Every pillar's shadow from her voice: where she cannot see you.
    const o = cryptSlotOrigin(ilvane.pos.x, ilvane.pos.z);
    const sx = ilvane.pos.x - o.x;
    const sz = ilvane.pos.z - o.z;
    this.shadowMat.uniforms.uAlpha.value = 0.6 + 0.4 * fill;
    for (const [i, p] of CHOIR_PILLARS.entries()) {
      const s = this.shadows[i];
      const quad = pillarShadow(sx, sz, p.x, p.z, p.r ?? 1.4, SHADOW_REACH);
      if (!quad) {
        s.mesh.visible = false;
        continue;
      }
      for (const [k, [qx, qz]] of quad.entries()) {
        const wx = o.x + qx;
        const wz = o.z + qz;
        s.pos.setXYZ(k, wx, h.groundY(wx, wz) + 0.08, wz);
      }
      s.pos.needsUpdate = true;
      s.mesh.geometry.computeBoundingSphere();
      s.mesh.visible = true;
    }
    // The rings of her voice (cosmetic).
    if (h.low) return;
    this.ring -= dt;
    if (this.ring <= 0) {
      this.ring = 0.45 - 0.2 * fill;
      h.wave(ilvane.pos.x, ilvane.pos.z, 6 + 10 * fill, 0.55, 0x9d6cff, 0.1);
    }
    const now = h.clock();
    for (let k = 0; k < 2; k++) {
      const a = h.rand() * Math.PI * 2;
      h.glow.emit(now, {
        x: ilvane.pos.x + Math.sin(a) * 0.8,
        y: gy + 3.5,
        z: ilvane.pos.z + Math.cos(a) * 0.8,
        vx: Math.sin(a) * 2.5,
        vy: 1.5,
        vz: Math.cos(a) * 2.5,
        life: 0.9,
        drag: 0.6,
        size0: 0.5,
        size1: 0.15,
        ...SONG,
        a: 0.8,
      });
    }
  }

  private paintLanes(world: IWorld, ilvane: Entity | undefined): void {
    const h = this.host;
    const now = h.clock();
    const crescendo = ilvane?.auras.some((a) => a.id === ILVANE_CRESCENDO) ?? false;
    const gather = crescendo ? T.organGatherCrescendo : T.organGather;
    for (const l of this.lanes) {
      if (l.objectId < 0) continue;
      const obj = world.entities.get(l.objectId);
      if (!obj) continue;
      const length = obj.scale > 0 ? obj.scale : 18;
      const gy = h.groundY(obj.pos.x, obj.pos.z);
      const burst = l.burstAt > 0;
      h.kit.drapeLane(l, h.groundY, obj.pos.x, gy, obj.pos.z, obj.facing, length, NOTE_LANE_HALF, {
        color: TELEGRAPH_THREAT_COLORS.danger,
        accent: TELEGRAPH_ACCENTS.shadow,
      });
      const age = now - l.born;
      h.kit.paintLane(l, {
        fill: burst ? 1 : Math.min(1, age / gather),
        clock: now,
        range: length,
        fade: burst ? Math.max(0, 1 - (now - l.burstAt) / 0.6) : 1,
      });
      l.group.visible = true;
      if (!burst) continue;
      // Notes racing down the burst lane.
      const notes = h.low ? 2 : 5;
      for (let k = 0; k < notes; k++) {
        const u = noteRun(now - l.burstAt, k, notes);
        if (u < 0 || h.rand() > 0.5) continue;
        const along = u * length;
        h.glow.emit(now, {
          x: obj.pos.x + Math.sin(obj.facing) * along + (h.rand() - 0.5) * NOTE_LANE_HALF,
          y: gy + 0.6 + h.rand() * 1.2,
          z: obj.pos.z + Math.cos(obj.facing) * along + (h.rand() - 0.5) * NOTE_LANE_HALF,
          vx: Math.sin(obj.facing) * 6,
          vy: 1,
          vz: Math.cos(obj.facing) * 6,
          life: 0.35,
          drag: 1,
          size0: 0.9,
          size1: 0.2,
          ...SONG,
          a: 1,
        });
      }
    }
  }

  /** Harmony: a thread of song from each living Chorister into her. */
  private paintHarmony(world: IWorld, ilvane: Entity, dt: number): void {
    const h = this.host;
    if (!ilvane.auras.some((a) => a.id === ILVANE_HARMONY)) return;
    this.thread -= dt;
    if (this.thread > 0) return;
    this.thread = h.low ? 0.12 : 0.03;
    const now = h.clock();
    for (const id of this.choristers) {
      const c = world.entities.get(id);
      if (!c || c.dead || Math.hypot(c.pos.x - ilvane.pos.x, c.pos.z - ilvane.pos.z) > 35) continue;
      const u = h.rand();
      h.glow.emit(now, {
        x: c.pos.x + (ilvane.pos.x - c.pos.x) * u,
        y: c.pos.y + 2.4 + (ilvane.pos.y + 3.4 - c.pos.y - 2.4) * u + Math.sin(u * Math.PI) * 1.5,
        z: c.pos.z + (ilvane.pos.z - c.pos.z) * u,
        vx: (ilvane.pos.x - c.pos.x) * 0.4,
        vy: 0,
        vz: (ilvane.pos.z - c.pos.z) * 0.4,
        life: 0.4,
        drag: 0.5,
        size0: 0.55,
        size1: 0.2,
        ...SONG,
        a: 0.75,
      });
    }
  }
}
