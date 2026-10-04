// Laverock's finale on the Moon Altar (plan: temple_cantor_finale_core.ts),
// composed by temple_fx.ts: when his song begins (the sim's id-only
// `dungeonGuideFinale` event, carrying where the Choir's fallen lie) each of
// them dissolves into moonlight where they fell, a pale flare and a column of
// motes lifting toward the moon, one after another across the song; and while
// he sings (his mirrored `guideState`), motes rise slowly off the water round
// him. Cosmetic only: nothing here is a cue a player acts on, so the low tier
// sheds density, never the effect.
//
// Rules (src/render/CLAUDE.md): one particle pool built once under the gated
// temple root, on the SAME shader and blending as the Ysolei glow pool (the
// shared crypt particle kit), so it links no new program; the CPU writes a
// mote only when it is born.

import * as THREE from 'three';
import type { SimEvent } from '../../sim/types';
import type { IWorld } from '../../world_api';
import { GLOW_FRAG, PARTICLE_VERT, ParticlePool } from '../hollow_crypt/crypt_fx_particles';
import {
  type MoteLaunch,
  moteBudget,
  RISE_EMIT_SEC,
  RISE_MOTES,
  RISE_WISPS,
  type RiseSpot,
  riseMote,
  riseSchedule,
  riseWisp,
  SONG_MOTES_PER_SEC,
  songMote,
} from './temple_cantor_finale_core';

const SCAN_SEC = 0.5;
/** Risings kept at once (a run's fallen number well under this). */
const MAX_RISES = 96;

interface Rise {
  spot: RiseSpot;
  index: number;
  emitted: number;
  debt: number;
  flared: boolean;
}

export class TempleCantorFinaleFx {
  private readonly root = new THREE.Group();
  private readonly uTime = { value: 0 };
  private readonly material: THREE.ShaderMaterial;
  private readonly pool: ParticlePool;
  private readonly rises: Rise[] = [];
  private readonly density: number;
  private singerId: number | null = null;
  private scan = 0;
  private songDebt = 0;
  private songCount = 0;
  private clock = 0;

  constructor(
    parent: THREE.Group,
    private readonly world: IWorld | undefined,
    detail: boolean,
  ) {
    this.root.name = 'drowned-temple-cantor-finale';
    parent.add(this.root);
    this.density = detail ? 1 : 0.4;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime },
      vertexShader: PARTICLE_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.material.name = 'drownedTempleCantorFinaleMotes';
    this.pool = new ParticlePool(Math.round(1600 * this.density), this.material, 13);
    this.root.add(this.pool.mesh);
  }

  handleEvent(ev: SimEvent): void {
    if (ev.type !== 'dungeonGuideFinale') return;
    const schedule = riseSchedule(ev.spots, this.clock);
    for (let i = 0; i < schedule.length && this.rises.length < MAX_RISES; i++) {
      this.rises.push({ spot: schedule[i], index: i, emitted: 0, debt: 0, flared: false });
    }
    this.singerId = ev.npcId;
  }

  update(dt: number, clock: number): void {
    this.clock = clock;
    this.uTime.value = clock;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = SCAN_SEC;
      this.scanSinger();
    }
    this.updateRises(dt, clock);
    this.updateSong(dt);
    this.pool.update(clock);
  }

  private emit(m: MoteLaunch): void {
    this.pool.emit(this.uTime.value, m);
  }

  private updateRises(dt: number, clock: number): void {
    const perSec = (RISE_MOTES * this.density) / RISE_EMIT_SEC;
    for (let i = this.rises.length - 1; i >= 0; i--) {
      const r = this.rises[i];
      if (clock < r.spot.at) continue;
      if (!r.flared) {
        r.flared = true;
        // The body gives itself up: a wide soft flare where it lay.
        this.emit({
          x: r.spot.x,
          y: r.spot.y + 0.5,
          z: r.spot.z,
          vx: 0,
          vy: 0.6,
          vz: 0,
          ay: 0,
          life: 2.2,
          drag: 0.5,
          size0: 5,
          size1: 1.5,
          r: 0.78,
          g: 0.88,
          b: 1,
          a: 0.7,
        });
        for (let k = 0; k < RISE_WISPS; k++) this.emit(riseWisp(r.spot, r.index, k));
      }
      const b = moteBudget(r.debt, dt, perSec);
      r.debt = b.debt;
      for (let k = 0; k < b.count; k++) this.emit(riseMote(r.spot, r.index, r.emitted++));
      if (clock >= r.spot.at + RISE_EMIT_SEC) this.rises.splice(i, 1);
    }
  }

  private scanSinger(): void {
    const world = this.world;
    if (!world) return;
    if (this.singerId !== null) {
      const e = world.entities.get(this.singerId);
      if (e?.guideState === 'singing') return;
      this.singerId = null;
    }
    // A late arrival (or a reload) finds him already singing.
    for (const e of world.entities.values()) {
      if (e.kind === 'npc' && e.guideState === 'singing') {
        this.singerId = e.id;
        return;
      }
    }
  }

  private updateSong(dt: number): void {
    if (this.singerId === null || !this.world) return;
    const e = this.world.entities.get(this.singerId);
    if (!e || e.guideState !== 'singing') return;
    const b = moteBudget(this.songDebt, dt, SONG_MOTES_PER_SEC * this.density);
    this.songDebt = b.debt;
    for (let k = 0; k < b.count; k++) {
      this.emit(songMote(e.pos.x, e.pos.y, e.pos.z, this.songCount++));
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.pool.dispose();
    this.material.dispose();
  }
}
