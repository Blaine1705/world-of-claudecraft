// Mage ground-anchored spell visuals (owner playtest 2026-07-11):
//  - the Meteor FALL: a burning sphere that drops out of the sky onto the
//    aimed point over the ability's real fall delay, so the impact the sim
//    schedules (the delayed groundAoE pulse) lands exactly when the ball does;
//  - the Rune of Power CIRCLE: a glowing arcane ring inscribed on the terrain
//    for the rune's full duration, so the zone the sim pulses is visible;
//  - the Blizzard SNOWFALL: a recycled pool of snowflakes drifting down over
//    the storm's area for its life ('snowZone' cue).
// Both are cosmetic riders on one 'meteorFall' / 'runeCircle' spellfxAt cue;
// the sim's pulses remain the authoritative gameplay telegraph.
//
// Renderer contract: construct once with the scene + a terrain-height
// resolver, spawn from the events, update(dt) once per frame beside the other
// transient systems. Geometries are shared; materials are per instance (they
// animate) and disposed on expiry. Math.random is fine here (render-only).

import * as THREE from 'three';
import { SCHOOL_COLORS } from './vfx';

const METEOR_DROP_HEIGHT = 45; // yards above the impact point it appears
const METEOR_RADIUS = 0.9;
const RUNE_FADE = 0.8; // seconds of fade at the rune's end of life
const RUNE_SPIN = 0.5; // rad/s, lazy inscription rotation

export interface MeteorFallSpawn {
  x: number;
  z: number;
  duration: number; // seconds of fall
}

export interface RuneCircleSpawn {
  x: number;
  z: number;
  radius: number;
  duration: number;
}

export interface SnowZoneSpawn {
  x: number;
  z: number;
  radius: number;
  duration: number;
}

const SNOW_COUNT = 90;
const SNOW_TOP = 9; // yards above ground the flakes spawn
const SNOW_FALL = 3.2; // yards per second

interface MeteorFx {
  group: THREE.Group;
  shellMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  groundY: number;
  duration: number;
  elapsed: number;
}

interface RuneFx {
  group: THREE.Group;
  mats: THREE.Material[];
  duration: number;
  elapsed: number;
  baseOpacities: number[];
}

interface SnowFx {
  points: THREE.Points;
  mat: THREE.PointsMaterial;
  pos: Float32Array;
  // The zone-edge PERIMETER ring (owner request: show how far the storm
  // reaches), an icy circle inscribed on the ground for the zone's life.
  ring: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  x: number;
  z: number;
  groundY: number;
  radius: number;
  duration: number;
  elapsed: number;
}

export class MageGroundFx {
  private readonly scene: THREE.Scene;
  private readonly groundY: (x: number, z: number) => number;
  private readonly onMeteorLand: (x: number, z: number) => void;
  private readonly meteors: MeteorFx[] = [];
  private readonly runes: RuneFx[] = [];
  private readonly snows: SnowFx[] = [];
  private meteorGeo: THREE.SphereGeometry | null = null;
  private meteorCoreGeo: THREE.SphereGeometry | null = null;
  private runeRingGeo: THREE.RingGeometry | null = null;

  constructor(
    scene: THREE.Scene,
    groundY: (x: number, z: number) => number,
    onMeteorLand: (x: number, z: number) => void,
  ) {
    this.scene = scene;
    this.groundY = groundY;
    this.onMeteorLand = onMeteorLand;
  }

  spawnMeteor(opts: MeteorFallSpawn): void {
    this.meteorGeo ??= new THREE.SphereGeometry(METEOR_RADIUS, 18, 12);
    this.meteorCoreGeo ??= new THREE.SphereGeometry(METEOR_RADIUS * 0.55, 12, 8);
    const fire = new THREE.Color(SCHOOL_COLORS.fire);
    const shellMat = new THREE.MeshStandardMaterial({
      color: fire,
      emissive: fire.clone().multiplyScalar(0.8),
      roughness: 0.4,
      metalness: 0,
      transparent: true,
      opacity: 0.9,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: fire.clone().multiplyScalar(2.0),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(this.meteorGeo, shellMat));
    group.add(new THREE.Mesh(this.meteorCoreGeo, coreMat));
    const gy = this.groundY(opts.x, opts.z);
    group.position.set(opts.x, gy + METEOR_DROP_HEIGHT, opts.z);
    this.scene.add(group);
    this.meteors.push({
      group,
      shellMat,
      coreMat,
      x: opts.x,
      z: opts.z,
      groundY: gy,
      duration: Math.max(0.3, opts.duration),
      elapsed: 0,
    });
  }

  spawnRune(opts: RuneCircleSpawn): void {
    this.runeRingGeo ??= new THREE.RingGeometry(0.82, 1, 48);
    const arcane = new THREE.Color(SCHOOL_COLORS.arcane);
    const group = new THREE.Group();
    const mats: THREE.Material[] = [];
    const baseOpacities: number[] = [];
    // Outer ring at the zone edge, inner ring at half, both additive.
    for (const [scale, opacity] of [
      [opts.radius, 0.75],
      [opts.radius * 0.55, 0.45],
    ] as const) {
      const mat = new THREE.MeshBasicMaterial({
        color: arcane.clone().multiplyScalar(1.6),
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(this.runeRingGeo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(scale);
      group.add(ring);
      mats.push(mat);
      baseOpacities.push(opacity);
    }
    // Four spokes so the circle reads as an inscribed rune, not a plain ring.
    const spokeGeo = new THREE.PlaneGeometry(0.12, opts.radius * 0.9);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: arcane.clone().multiplyScalar(1.3),
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const spoke = new THREE.Mesh(spokeGeo, mat);
      spoke.rotation.x = -Math.PI / 2;
      spoke.rotation.z = (i / 4) * Math.PI;
      spoke.position.y = 0.01;
      group.add(spoke);
      mats.push(mat);
      baseOpacities.push(0.4);
    }
    // A soft filled glow at the center plus a ring of orbiting motes: the
    // inscription reads as living magic, not a chalk outline (owner playtest).
    const glowGeo = new THREE.CircleGeometry(opts.radius * 0.5, 32);
    const glowMat = new THREE.MeshBasicMaterial({
      color: arcane.clone().multiplyScalar(0.9),
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.005;
    group.add(glow);
    mats.push(glowMat);
    baseOpacities.push(0.18);
    const moteGeo = new THREE.SphereGeometry(0.12, 8, 6);
    for (let i = 0; i < 6; i++) {
      const moteMat = new THREE.MeshBasicMaterial({
        color: arcane.clone().multiplyScalar(1.9),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mote = new THREE.Mesh(moteGeo, moteMat);
      const a = (i / 6) * Math.PI * 2;
      mote.position.set(Math.cos(a) * opts.radius * 0.8, 0.5, Math.sin(a) * opts.radius * 0.8);
      group.add(mote);
      mats.push(moteMat);
      baseOpacities.push(0.85);
    }
    group.position.set(opts.x, this.groundY(opts.x, opts.z) + 0.15, opts.z);
    this.scene.add(group);
    this.runes.push({ group, mats, duration: opts.duration, elapsed: 0, baseOpacities });
  }

  spawnSnow(opts: SnowZoneSpawn): void {
    const frost = new THREE.Color(SCHOOL_COLORS.frost);
    const pos = new Float32Array(SNOW_COUNT * 3);
    const gy = this.groundY(opts.x, opts.z);
    for (let i = 0; i < SNOW_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * opts.radius;
      pos[i * 3] = opts.x + Math.cos(a) * r;
      pos[i * 3 + 1] = gy + Math.random() * SNOW_TOP;
      pos[i * 3 + 2] = opts.z + Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: frost.clone().lerp(new THREE.Color(0xffffff), 0.6),
      size: 0.18,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    // The perimeter: a crisp frost ring at the zone edge so the player reads
    // the storm's exact reach at a glance (reuses the rune ring geometry).
    this.runeRingGeo ??= new THREE.RingGeometry(0.82, 1, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: frost.clone().lerp(new THREE.Color(0xffffff), 0.45).multiplyScalar(1.4),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(this.runeRingGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(opts.radius);
    ring.position.set(opts.x, gy + 0.12, opts.z);
    this.scene.add(ring);
    this.snows.push({
      points,
      mat,
      pos,
      ring,
      ringMat,
      x: opts.x,
      z: opts.z,
      groundY: gy,
      radius: opts.radius,
      duration: opts.duration,
      elapsed: 0,
    });
  }

  update(dt: number): void {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.elapsed += dt;
      const t = Math.min(1, m.elapsed / m.duration);
      if (t >= 1) {
        this.scene.remove(m.group);
        m.shellMat.dispose();
        m.coreMat.dispose();
        this.meteors.splice(i, 1);
        this.onMeteorLand(m.x, m.z);
        continue;
      }
      // Ease-in fall: slow release, violent finish, like a real drop.
      const eased = t * t;
      m.group.position.y = m.groundY + METEOR_DROP_HEIGHT * (1 - eased) + METEOR_RADIUS;
      m.group.rotation.y += 3 * dt;
      m.group.rotation.x += 2 * dt;
    }
    for (let i = this.runes.length - 1; i >= 0; i--) {
      const r = this.runes[i];
      r.elapsed += dt;
      if (r.elapsed >= r.duration) {
        this.scene.remove(r.group);
        for (const mat of r.mats) mat.dispose();
        r.group.children.forEach((c) => {
          const mesh = c as THREE.Mesh;
          if (mesh.geometry !== this.runeRingGeo) mesh.geometry.dispose();
        });
        this.runes.splice(i, 1);
        continue;
      }
      r.group.rotation.y += RUNE_SPIN * dt;
      // Steady glow with a soft breath; fade out over the last moments.
      const fade = Math.min(1, (r.duration - r.elapsed) / RUNE_FADE);
      const breath = 0.85 + 0.15 * Math.sin(r.elapsed * 2.4);
      r.mats.forEach((mat, idx) => {
        (mat as THREE.MeshBasicMaterial).opacity = r.baseOpacities[idx] * fade * breath;
      });
    }
    for (let i = this.snows.length - 1; i >= 0; i--) {
      const sfx = this.snows[i];
      sfx.elapsed += dt;
      if (sfx.elapsed >= sfx.duration) {
        this.scene.remove(sfx.points);
        sfx.mat.dispose();
        sfx.points.geometry.dispose();
        this.scene.remove(sfx.ring);
        sfx.ringMat.dispose();
        this.snows.splice(i, 1);
        continue;
      }
      // Every flake sinks; one that reaches the ground respawns at the top of
      // the column at a fresh scatter, so the fall never runs dry.
      for (let f = 0; f < SNOW_COUNT; f++) {
        sfx.pos[f * 3 + 1] -= SNOW_FALL * dt;
        if (sfx.pos[f * 3 + 1] <= sfx.groundY + 0.1) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * sfx.radius;
          sfx.pos[f * 3] = sfx.x + Math.cos(a) * r;
          sfx.pos[f * 3 + 1] = sfx.groundY + SNOW_TOP;
          sfx.pos[f * 3 + 2] = sfx.z + Math.sin(a) * r;
        }
      }
      sfx.points.geometry.attributes.position.needsUpdate = true;
      const snowFade = Math.min(1, (sfx.duration - sfx.elapsed) / 0.6);
      sfx.mat.opacity = 0.9 * snowFade;
      sfx.ringMat.opacity = 0.55 * snowFade;
      sfx.ring.rotation.z += 0.15 * dt; // a lazy drift so the edge reads alive
    }
  }
}
