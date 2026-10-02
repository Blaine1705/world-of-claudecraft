// The Stormbrass Foundry's chained workers: the chains (plan:
// foundry_worker_fx_core.ts). Every chained miner and hauler wears a shackle
// on the ankle and a chain of real iron links running to its camp's post; a
// hauler's chain follows it round its loop. When the camp is freed the chains
// are struck: sparks burst off every shackle and off the post's ring, the
// chains fall to the floor and lie there, the shackles sprung open, for as
// long as the camp stands in view (and for anyone who walks up later: a freed
// camp's chains lie where its workers stood, with no burst).
//
// Everything is read from IWorld entity state (the camp's state object and
// its template id, the workers' template ids and positions), so offline and
// online look the same with no wire change.
//
// Rules (src/render/CLAUDE.md): one link geometry built once and shared by
// every chain (each chain mesh owns only its draw range), the foundry's shared
// iron material, one pooled spark cloud (its own additive material, built
// here and attached with the chains through the compile gate), no light, no
// per-frame allocation: one matrix write per chain and per shackle a frame,
// and none at all once a struck chain has settled. The world is walked only
// when its roster changes (entityRosterVersion). Cosmetic: the chains draw on
// every tier (a dozen small meshes); the sparks thin on the low tier and lose
// their flash under reduced motion.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { resolveUiEffectsProfile } from '../../game/ui_effects_profile';
import { foundryWorkerCampPhaseOf } from '../../sim/content/stormbrass_foundry_workers';
import { DUNGEONS, instanceOrigin, instanceSlotForZ } from '../../sim/data';
import type { IWorld } from '../../world_api';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { attachSceneGroupGated } from '../gated_scene_attach';
import { GFX } from '../gfx';
import {
  GLOW_FRAG,
  PARTICLE_VERT,
  ParticlePool,
  type ParticleSpec,
} from '../hollow_crypt/crypt_fx_particles';
import { setRenderCategory } from '../renderer_diagnostics';
import { foundryMaterial } from './foundry_mesh';
import {
  type ChainPose,
  chainFall,
  chainPoseInto,
  fallenHeight,
  isChainedWorkerTemplate,
  WORKER_CHAIN,
  WORKER_CHAIN_MAX_LINKS,
  workerCampAt,
} from './foundry_worker_fx_core';

const CAMP_SLOTS = 4;
const CHAINS_PER_CAMP = 3;
/** A slow rescan between roster changes (a worker stepping into reach). */
const SCAN_SEC = 2;
const BY_ID = (a: { id: number }, b: { id: number }): number => a.id - b.id;
/** How fast a chain's far end closes on its worker (per second): the sim moves
 *  a hauler in 20 Hz steps, the drawn body glides between them. */
const FOLLOW_RATE = 18;
const LINK_RADIUS = 0.078;
const LINK_TUBE = 0.022;
const LINK_RADIAL = 5;
const LINK_TUBULAR = 8;
const INDICES_PER_LINK = LINK_RADIAL * LINK_TUBULAR * 6;
const DUNGEON_ID = 'stormbrass_foundry';
/** The struck chains' sparks: a burst off each shackle and a bigger one off
 *  the post's ring (three chains and a post at once, with room to spare). */
const SPARK_CAPACITY = 420;
const SPARKS_PER_SHACKLE = 40;
const SPARKS_AT_POST = 70;

interface Chain {
  mesh: THREE.Mesh;
  shackle: THREE.Mesh;
  workerId: number;
  /** The far end, smoothed toward the worker. */
  ex: number;
  ez: number;
  /** A live worker has been seen on this chain since its camp was taken. */
  seen: boolean;
}

interface CampSlot {
  objectId: number;
  chains: Chain[];
  /** Clock time the camp was first seen freed (-1 while chained). */
  struckAt: number;
  /** A freed camp's chains have reached the floor: nothing left to write. */
  settled: boolean;
}

/** Every link of the longest chain, along +Z from the origin: a ring every
 *  pitch, each turned a quarter from the last, stretched along the chain. */
function buildChainGeometry(): THREE.BufferGeometry {
  const links: THREE.BufferGeometry[] = [];
  for (let i = 0; i < WORKER_CHAIN_MAX_LINKS; i++) {
    const link = new THREE.TorusGeometry(LINK_RADIUS, LINK_TUBE, LINK_RADIAL, LINK_TUBULAR);
    // The ring's plane holds the chain's axis; every other link lies across.
    if (i % 2 === 0) link.rotateY(Math.PI / 2);
    else link.rotateX(Math.PI / 2);
    link.scale(1, 1, 1.5);
    link.translate(0, 0, (i + 0.5) * WORKER_CHAIN.pitch);
    links.push(link);
  }
  const merged = mergeGeometries(links, false);
  for (const link of links) link.dispose();
  if (!merged) throw new Error('foundry worker chain geometry failed to merge');
  return merged;
}

export class FoundryWorkerFx {
  readonly readyForEntry: Promise<void>;
  private readonly root = new THREE.Group();
  private readonly camps: CampSlot[] = [];
  private readonly chainGeo: THREE.BufferGeometry;
  private readonly shackleGeo: THREE.BufferGeometry;
  private readonly ownedGeos: THREE.BufferGeometry[] = [];
  private readonly pose: ChainPose = { yaw: 0, pitch: 0, length: 0, links: 0 };
  private readonly workerScratch: { id: number; x: number; z: number }[] = [];
  private workerCount = 0;
  private rosterVersion = -1;
  private readonly density: number;
  private readonly sparks: ParticlePool;
  private readonly sparkMat: THREE.ShaderMaterial;
  private readonly sparkTime = { value: 0 };
  private readonly spark: ParticleSpec = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 1,
    size0: 0.2,
    size1: 0.04,
    r: 1,
    g: 0.86,
    b: 0.5,
    a: 1,
  };
  private seed = 0x5f0c;
  private scan = 0;
  private clock = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    private readonly groundY: (x: number, z: number) => number,
    private readonly world?: IWorld,
    compileGate?: (target: THREE.Object3D) => Promise<unknown>,
    private readonly reducedMotion: () => boolean = () => false,
  ) {
    this.root.name = 'stormbrass-foundry-worker-chains';
    const low =
      resolveUiEffectsProfile({ presetLabel: GFX.tier, effectsQuality: 1, reduceMotion: false })
        .tier === 'low';
    this.density = low ? 0.4 : 1;
    setRenderCategory(this.root, 'vfx');
    this.chainGeo = buildChainGeometry();
    this.shackleGeo = new THREE.TorusGeometry(0.2, 0.045, 6, 14);
    this.shackleGeo.rotateX(Math.PI / 2);
    const iron = foundryMaterial('iron');
    const reach = WORKER_CHAIN.maxLength / 2;
    for (let c = 0; c < CAMP_SLOTS; c++) {
      const chains: Chain[] = [];
      for (let i = 0; i < CHAINS_PER_CAMP; i++) {
        // The links are shared; each chain owns only how many it draws.
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', this.chainGeo.getAttribute('position'));
        geo.setAttribute('normal', this.chainGeo.getAttribute('normal'));
        geo.setIndex(this.chainGeo.getIndex());
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, reach), reach + 0.5);
        this.ownedGeos.push(geo);
        const mesh = new THREE.Mesh(geo, iron);
        mesh.name = 'foundryWorkerChain';
        mesh.matrixAutoUpdate = false;
        mesh.visible = false;
        const shackle = new THREE.Mesh(this.shackleGeo, iron);
        shackle.name = 'foundryWorkerShackle';
        shackle.matrixAutoUpdate = false;
        shackle.visible = false;
        this.root.add(mesh, shackle);
        chains.push({ mesh, shackle, workerId: -1, ex: 0, ez: 0, seen: false });
      }
      this.camps.push({ objectId: -1, chains, struckAt: -1, settled: false });
    }
    this.sparkMat = new THREE.ShaderMaterial({
      name: 'stormbrassWorkerChainSparks',
      uniforms: { uTime: this.sparkTime },
      vertexShader: PARTICLE_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparks = new ParticlePool(
      SPARK_CAPACITY,
      this.sparkMat,
      floorVfxRenderOrder('encounter', 8),
    );
    this.root.add(this.sparks.mesh);
    this.readyForEntry = attachSceneGroupGated(scene, this.root, compileGate, () => this.disposed)
      .then(() => {})
      .catch(() => {});
  }

  update(dt: number): void {
    const world = this.world;
    if (!world || this.disposed) return;
    this.clock += dt;
    this.scan -= dt;
    if (this.scan <= 0 || world.entityRosterVersion !== this.rosterVersion) {
      this.scan = SCAN_SEC;
      this.rosterVersion = world.entityRosterVersion;
      this.scanWorld(world);
    }
    const follow = 1 - Math.exp(-dt * FOLLOW_RATE);
    for (const camp of this.camps) {
      if (camp.objectId >= 0) this.paintCamp(world, camp, follow);
    }
    this.sparkTime.value = this.clock;
    this.sparks.update(this.clock);
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) | 0;
    return (this.seed >>> 0) / 4294967296;
  }

  /** A burst of hot sparks off struck iron at (x, y, z): a white flash and
   *  `n` sparks thrown up and out, falling back and dying on the floor. */
  private strike(x: number, y: number, z: number, n: number, speed: number): void {
    const s = this.spark;
    const floor = this.groundY(x, z);
    s.x = x;
    s.y = y;
    s.z = z;
    s.vx = s.vy = s.vz = 0;
    s.ax = s.az = 0;
    s.ay = 0;
    s.life = 0.3;
    s.drag = 1;
    s.floor = -1e6;
    s.size0 = 2.4;
    s.size1 = 4.2;
    s.spin = 0;
    s.seed = this.rand();
    s.r = 1;
    s.g = 0.95;
    s.b = 0.8;
    s.a = 1;
    // The white flash is the one thing here that could bother: off under
    // reduced motion. The sparks themselves thin with the effects tier.
    if (!this.reducedMotion()) this.sparks.emit(this.clock, s);
    const count = Math.max(4, Math.round(n * this.density));
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2;
      const out = speed * (0.35 + 0.65 * this.rand());
      s.x = x;
      s.y = y;
      s.z = z;
      s.vx = Math.sin(a) * out;
      s.vy = speed * (0.5 + 0.9 * this.rand());
      s.vz = Math.cos(a) * out;
      s.ay = -14;
      s.life = 0.6 + 0.7 * this.rand();
      s.drag = 1.1;
      s.floor = floor + 0.03;
      s.size0 = 0.34 + 0.2 * this.rand();
      s.size1 = 0.05;
      s.seed = this.rand();
      s.r = 1;
      s.g = 0.72 + 0.2 * this.rand();
      s.b = 0.3 + 0.25 * this.rand();
      this.sparks.emit(this.clock, s);
    }
  }

  private release(camp: CampSlot): void {
    camp.objectId = -1;
    camp.struckAt = -1;
    camp.settled = false;
    for (const chain of camp.chains) {
      chain.workerId = -1;
      chain.seen = false;
      chain.mesh.visible = false;
      chain.shackle.visible = false;
    }
  }

  /** Take a slot for every camp in view, drop the slots whose camp has gone,
   *  and hand each camp's chains to its chained workers (entity-id order: the
   *  sim spawns a camp's workers in its authored order). */
  private scanWorld(world: IWorld): void {
    for (const camp of this.camps) {
      if (camp.objectId >= 0 && !world.entities.has(camp.objectId)) this.release(camp);
    }
    this.workerCount = 0;
    for (const e of world.entities.values()) {
      if (e.kind === 'mob') {
        if (!e.dead && isChainedWorkerTemplate(e.templateId)) {
          // Reuse the scratch rows: a scan allocates only when a camp first fills.
          const row = this.workerScratch[this.workerCount] ?? { id: 0, x: 0, z: 0 };
          row.id = e.id;
          row.x = e.pos.x;
          row.z = e.pos.z;
          this.workerScratch[this.workerCount++] = row;
        }
        continue;
      }
      if (e.kind !== 'object' || foundryWorkerCampPhaseOf(e.templateId) === null) continue;
      let taken = false;
      let free: CampSlot | null = null;
      for (const c of this.camps) {
        if (c.objectId === e.id) taken = true;
        else if (c.objectId < 0 && !free) free = c;
      }
      if (!taken && free) free.objectId = e.id;
    }
    this.workerScratch.length = this.workerCount;
    this.workerScratch.sort(BY_ID);
    const reach2 = WORKER_CHAIN.reach * WORKER_CHAIN.reach;
    for (const camp of this.camps) {
      if (camp.objectId < 0) continue;
      const obj = world.entities.get(camp.objectId);
      if (!obj) continue;
      let i = 0;
      for (const w of this.workerScratch) {
        if (i >= camp.chains.length) break;
        const dx = w.x - obj.pos.x;
        const dz = w.z - obj.pos.z;
        if (dx * dx + dz * dz > reach2) continue;
        const chain = camp.chains[i++];
        if (chain.workerId !== w.id) {
          chain.workerId = w.id;
          if (!chain.seen) {
            chain.ex = w.x;
            chain.ez = w.z;
          }
        }
      }
    }
  }

  private paintCamp(world: IWorld, camp: CampSlot, follow: number): void {
    const obj = world.entities.get(camp.objectId);
    const phase = obj ? foundryWorkerCampPhaseOf(obj.templateId) : null;
    if (!obj || phase === null) {
      this.release(camp);
      return;
    }
    const px = obj.pos.x;
    const pz = obj.pos.z;
    const floor = this.groundY(px, pz);
    if (phase !== 'freed') {
      camp.struckAt = -1;
      camp.settled = false;
      for (const chain of camp.chains) {
        const w = chain.workerId >= 0 ? world.entities.get(chain.workerId) : undefined;
        if (!w || w.dead || !isChainedWorkerTemplate(w.templateId)) {
          chain.mesh.visible = false;
          chain.shackle.visible = false;
          continue;
        }
        if (!chain.seen) {
          chain.seen = true;
          chain.ex = w.pos.x;
          chain.ez = w.pos.z;
        } else {
          chain.ex += (w.pos.x - chain.ex) * follow;
          chain.ez += (w.pos.z - chain.ez) * follow;
        }
        this.place(chain, px, floor + WORKER_CHAIN.postY, pz, WORKER_CHAIN.ankleY, 0);
      }
      return;
    }
    if (camp.settled) return;
    if (camp.struckAt < 0) {
      // Seen struck just now (a chain was up a moment ago): it falls. A camp
      // first met already freed has its chains on the floor.
      const live = camp.chains.some((c) => c.seen);
      camp.struckAt = live ? this.clock : this.clock - WORKER_CHAIN.fallSeconds;
      if (!live) this.layStruckChains(camp, px, pz);
      else {
        // The blow that frees them: sparks off the post's ring and every shackle.
        this.strike(px, floor + WORKER_CHAIN.postY, pz, SPARKS_AT_POST, 7.5);
        for (const chain of camp.chains) {
          if (!chain.seen) continue;
          const y = this.groundY(chain.ex, chain.ez) + WORKER_CHAIN.ankleY;
          this.strike(chain.ex, y, chain.ez, SPARKS_PER_SHACKLE, 5.5);
        }
      }
    }
    const fall = chainFall(this.clock - camp.struckAt);
    for (const chain of camp.chains) {
      if (!chain.seen) continue;
      this.place(
        chain,
        px,
        floor + fallenHeight(WORKER_CHAIN.postY, fall),
        pz,
        fallenHeight(WORKER_CHAIN.ankleY, fall),
        fall,
      );
    }
    if (fall >= 1) camp.settled = true;
  }

  /** A camp met already freed: its chains lie from the post to where its
   *  workers stood (the camp's authored spots). */
  private layStruckChains(camp: CampSlot, px: number, pz: number): void {
    const def = DUNGEONS[DUNGEON_ID];
    if (!def) return;
    const o = instanceOrigin(def.index, instanceSlotForZ(pz));
    const authored = workerCampAt(px - o.x, pz - o.z);
    if (!authored) return;
    authored.workers.forEach((spot, i) => {
      const chain = camp.chains[i];
      if (!chain) return;
      chain.seen = true;
      chain.ex = o.x + spot.x;
      chain.ez = o.z + spot.z;
    });
  }

  /** Write one chain from the post point to its far end, and its shackle
   *  there (lying open on the floor once struck). */
  private place(
    chain: Chain,
    px: number,
    py: number,
    pz: number,
    endHeight: number,
    fall: number,
  ): void {
    const ey = this.groundY(chain.ex, chain.ez) + endHeight;
    const pose = chainPoseInto(this.pose, px, py, pz, chain.ex, ey, chain.ez);
    const mesh = chain.mesh;
    mesh.position.set(px, py, pz);
    mesh.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
    mesh.updateMatrix();
    mesh.geometry.setDrawRange(0, pose.links * INDICES_PER_LINK);
    mesh.visible = true;
    const shackle = chain.shackle;
    // A struck shackle springs open and tips over beside where the ankle was.
    shackle.position.set(chain.ex + fall * 0.25, ey, chain.ez + fall * 0.12);
    shackle.rotation.set(fall * 0.5, pose.yaw, fall * 0.35, 'YXZ');
    shackle.updateMatrix();
    shackle.visible = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const geo of this.ownedGeos) geo.dispose();
    this.chainGeo.dispose();
    this.shackleGeo.dispose();
    this.sparks.dispose();
    this.sparkMat.dispose();
  }
}
