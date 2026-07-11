// Frozen Orb visual: the roaming ice sphere the frost mage releases (WoW-style
// reference: a translucent blue orb drifting forward, swirling shards, frosty
// glow). The sim's orb is pure state (ctx.frozenOrbs, never wired); the client
// gets ONE 'orb' spellfxAt event at release carrying the whole straight-line
// path (origin, unit direction, speed, duration) and this module animates the
// flight locally: no per-tick sync, no protocol change. The per-second pulse
// novas remain the authoritative area telegraph at every graphics tier; this
// sphere is cosmetic richness on top.
//
// Renderer contract: construct once with the scene and a terrain-height
// resolver, spawn() from the 'orb' event, update(dt) once per frame from the
// same block that ticks the other transient systems (vfx / lightPulses).
// Per-frame work is allocation-free: geometries are built once and shared;
// only materials are cloned per orb (they animate opacity) and disposed when
// the orb expires.

import * as THREE from 'three';
import { SCHOOL_COLORS } from './vfx';

const ORB_HOVER = 1.15; // yards the sphere floats above the terrain
const ORB_RADIUS = 0.55;
const CORE_RADIUS = 0.26;
const SHARD_COUNT = 6;
const SHARD_ORBIT = 0.85;
const FADE_IN = 0.18; // seconds growing out of the cast
const FADE_OUT = 0.4; // seconds dissolving at end of life
const BOB_HEIGHT = 0.08;
const BOB_SPEED = 3.2; // rad/s of the hover bob
const SPIN_SPEED = 1.6; // rad/s, the shell's lazy roll
const SHARD_SPIN_SPEED = -2.8; // rad/s, counter-rotating shard ring
const SHELL_OPACITY = 0.42;
const CORE_OPACITY = 0.9;
const SHARD_OPACITY = 0.85;

export interface FrozenOrbSpawn {
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  speed: number; // yards per second
  duration: number; // seconds of flight
}

interface OrbFx {
  group: THREE.Group;
  shardRing: THREE.Group;
  shellMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshBasicMaterial;
  shardMat: THREE.MeshStandardMaterial;
  x0: number;
  z0: number;
  dirX: number;
  dirZ: number;
  speed: number;
  duration: number;
  elapsed: number;
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export class FrozenOrbFx {
  private readonly scene: THREE.Scene;
  private readonly groundY: (x: number, z: number) => number;
  private readonly orbs: OrbFx[] = [];
  // Shared geometry, built lazily on the first spawn and reused for every orb.
  private shellGeo: THREE.SphereGeometry | null = null;
  private coreGeo: THREE.SphereGeometry | null = null;
  private shardGeo: THREE.TetrahedronGeometry | null = null;

  constructor(scene: THREE.Scene, groundY: (x: number, z: number) => number) {
    this.scene = scene;
    this.groundY = groundY;
  }

  spawn(opts: FrozenOrbSpawn): void {
    this.shellGeo ??= new THREE.SphereGeometry(ORB_RADIUS, 20, 14);
    this.coreGeo ??= new THREE.SphereGeometry(CORE_RADIUS, 12, 8);
    this.shardGeo ??= new THREE.TetrahedronGeometry(0.11);

    const frost = new THREE.Color(SCHOOL_COLORS.frost);
    // Translucent icy shell: the emissive term keeps it readable in shade and
    // feeds the bloom pass a soft blue halo without an actual light.
    const shellMat = new THREE.MeshStandardMaterial({
      color: frost,
      emissive: frost.clone().multiplyScalar(0.55),
      roughness: 0.18,
      metalness: 0,
      transparent: true,
      opacity: SHELL_OPACITY,
      depthWrite: false,
    });
    // Bright additive heart, over the bloom threshold so the orb glows.
    const coreMat = new THREE.MeshBasicMaterial({
      color: frost.clone().multiplyScalar(1.9),
      transparent: true,
      opacity: CORE_OPACITY,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0xcfeaff,
      emissive: frost.clone().multiplyScalar(0.35),
      roughness: 0.25,
      metalness: 0,
      transparent: true,
      opacity: SHARD_OPACITY,
    });

    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.shellGeo, shellMat));
    group.add(new THREE.Mesh(this.coreGeo, coreMat));
    // Counter-rotating ring of ice shards around the equator.
    const shardRing = new THREE.Group();
    for (let i = 0; i < SHARD_COUNT; i++) {
      const shard = new THREE.Mesh(this.shardGeo, shardMat);
      const a = (i / SHARD_COUNT) * Math.PI * 2;
      shard.position.set(
        Math.cos(a) * SHARD_ORBIT,
        Math.sin(a * 3) * 0.12,
        Math.sin(a) * SHARD_ORBIT,
      );
      shard.rotation.set(a, a * 1.7, a * 0.6);
      shardRing.add(shard);
    }
    group.add(shardRing);
    group.position.set(opts.x, this.groundY(opts.x, opts.z) + ORB_HOVER, opts.z);
    group.scale.setScalar(0.01); // grows in over FADE_IN
    this.scene.add(group);

    this.orbs.push({
      group,
      shardRing,
      shellMat,
      coreMat,
      shardMat,
      x0: opts.x,
      z0: opts.z,
      dirX: opts.dirX,
      dirZ: opts.dirZ,
      speed: opts.speed,
      duration: opts.duration,
      elapsed: 0,
    });
  }

  update(dt: number): void {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.elapsed += dt;
      if (orb.elapsed >= orb.duration) {
        this.scene.remove(orb.group);
        orb.shellMat.dispose();
        orb.coreMat.dispose();
        orb.shardMat.dispose();
        this.orbs.splice(i, 1);
        continue;
      }
      const t = orb.elapsed;
      const x = orb.x0 + orb.dirX * orb.speed * t;
      const z = orb.z0 + orb.dirZ * orb.speed * t;
      const bob = Math.sin(t * BOB_SPEED) * BOB_HEIGHT;
      orb.group.position.set(x, this.groundY(x, z) + ORB_HOVER + bob, z);
      orb.group.rotation.y += SPIN_SPEED * dt;
      orb.shardRing.rotation.y += SHARD_SPIN_SPEED * dt;
      // Grow out of the cast, dissolve at end of life; opacity rides the same
      // ramp so the dissolve reads as melting, not popping.
      const fadeIn = easeOutCubic(Math.min(1, t / FADE_IN));
      const fadeOut = Math.min(1, (orb.duration - t) / FADE_OUT);
      const s = fadeIn * (0.6 + 0.4 * fadeOut);
      orb.group.scale.setScalar(Math.max(0.01, s));
      const a = fadeIn * fadeOut;
      orb.shellMat.opacity = SHELL_OPACITY * a;
      orb.coreMat.opacity = CORE_OPACITY * a;
      orb.shardMat.opacity = SHARD_OPACITY * a;
    }
  }
}
