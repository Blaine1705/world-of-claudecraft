import * as THREE from 'three';
import { type DecalStyle, GroundDecals } from './decals';
import { abilityVfxTextures, OVERLAY_CELL } from './fx_textures';
import { OverlaySprites } from './overlay_sprites';
import { AbilityVfxRibbons, type RibbonAnchor } from './ribbons';
import { ShockRings } from './rings';

export type { DecalStyle } from './decals';

const camPosScratch = new THREE.Vector3();

// The Three-side engine of the per-ability VFX system: owns the pooled
// primitive families ported from the Ability VFX Gallery (ribbon trails, shock
// rings, ground decals, overlay sprites) plus the per-frame windup-orb and
// buff-orbit state. The AbilityVfx painter decides WHAT to draw from the spec
// table; this class only knows HOW. Every pool has a hard cap and allocates
// nothing in steady state; per-entity windup/orbit entries allocate once on
// gain and are swept by frame stamp when the entity stops casting or the aura
// drops.

export type OrbitStyle = 'halo' | 'sparks' | 'runes';

const MAX_ORBITS_PER_ENTITY = 3;
const MAX_ORBIT_BANDS = 24;
const MAX_WINDUPS = 8;

interface OrbitBand {
  style: OrbitStyle;
  colorHex: number;
  phase: number;
  age: number;
  stamp: number;
}

interface WindupState {
  colorHex: number;
  progress: number;
  stamp: number;
}

// Per-style orbit DNA (gallery band discipline: halo crowns the head, sparks
// orbit the shoulders, runes circle the ankles).
const ORBIT_DNA: Record<
  OrbitStyle,
  {
    n: number;
    rate: number;
    radius: number;
    weave: number;
    frac: number;
    size: number;
    cell: number;
  }
> = {
  halo: {
    n: 3,
    rate: 0.8,
    radius: 0.42,
    weave: 0.06,
    frac: 1.02,
    size: 0.26,
    cell: OVERLAY_CELL.star,
  },
  sparks: {
    n: 3,
    rate: 2.6,
    radius: 0.72,
    weave: 0.16,
    frac: 0.62,
    size: 0.3,
    cell: OVERLAY_CELL.spark,
  },
  runes: {
    n: 4,
    rate: 1.1,
    radius: 0.95,
    weave: 0.08,
    frac: 0.08,
    size: 0.32,
    cell: OVERLAY_CELL.rune,
  },
};

export class AbilityVfxFx {
  private ribbons: AbilityVfxRibbons;
  private rings: ShockRings;
  private decals: GroundDecals;
  private overlay: OverlaySprites;
  private windups = new Map<number, WindupState>();
  private orbits = new Map<number, OrbitBand[]>();
  private orbitBandCount = 0;
  private time = 0;
  private frame = 0;
  private quality = 1;

  constructor(
    scene: THREE.Scene,
    private camera: THREE.Camera,
    private anchor: RibbonAnchor,
    private groundY: (x: number, z: number) => number,
  ) {
    const tex = abilityVfxTextures();
    this.ribbons = new AbilityVfxRibbons(scene, anchor, tex);
    this.rings = new ShockRings(scene, tex);
    this.decals = new GroundDecals(scene, tex);
    this.overlay = new OverlaySprites(scene, tex);
  }

  setQuality(q: number): void {
    this.quality = Math.min(1, Math.max(0, Number.isFinite(q) ? q : 1));
  }

  setViewportScale(heightPx: number, fovDeg: number): void {
    this.overlay.setViewportScale(heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360)));
  }

  // ---- fire-and-forget primitives (painter dispatch) ----------------------

  jaggedBolt(sourceId: number, targetId: number, colorHex: number): void {
    this.ribbons.spawnBolt(sourceId, targetId, colorHex);
  }

  // A wavering channel beam (drains, mind rays): the bolt slot at near-zero
  // jag, a touch wider and longer-lived than the lightning crack.
  beamRibbon(sourceId: number, targetId: number, colorHex: number): void {
    this.ribbons.spawnBolt(sourceId, targetId, colorHex, 0.32, 0.11, 0.18);
  }

  // Comet trail chasing the pooled Vfx projectile; lands a small vertical
  // shock halo at the impact point when asked (the bolt archetype's read).
  cometTrail(
    sourceId: number,
    targetId: number,
    colorHex: number,
    width: number,
    ring: boolean,
  ): void {
    this.ribbons.spawnTrail(
      sourceId,
      targetId,
      colorHex,
      width,
      ring
        ? (x, y, z) => this.rings.spawn(x, y, z, 1.5, 0.4, colorHex, 1.4 * this.intensity(), true)
        : null,
    );
  }

  slashArc(targetId: number, colorHex: number, span = 1.15, life = 0.22): void {
    const at = this.anchor(targetId, 0.55);
    if (at) this.ribbons.spawnSlash(at, colorHex, span, life);
  }

  // Vertical camera-facing halo at an entity (impacts, crits, shout chests).
  impactRing(entityId: number, colorHex: number, big = false): void {
    const at = this.anchor(entityId, 0.55);
    if (!at) return;
    this.rings.spawn(
      at.x,
      at.y,
      at.z,
      big ? 2.6 : 1.6,
      big ? 0.55 : 0.4,
      colorHex,
      (big ? 1.8 : 1.4) * this.intensity(),
      true,
    );
  }

  // The nova/shout ground read: two staggered expanding rings draped at the
  // entity's feet (the second, slower ring sells the double-pulse).
  doubleGroundRing(entityId: number, radius: number, colorHex: number, intensity: number): void {
    const at = this.anchor(entityId, 0);
    if (!at) return;
    const y = this.groundY(at.x, at.z) + 0.15;
    const k = intensity * this.intensity();
    this.rings.spawn(at.x, y, at.z, radius, 0.55, colorHex, 1.9 * k, false);
    this.rings.spawn(at.x, y, at.z, radius * 1.18, 0.85, colorHex, 1.1 * k, false);
  }

  decalAt(
    entityId: number,
    radius: number,
    colorHex: number,
    style: DecalStyle,
    dur: number,
  ): void {
    const at = this.anchor(entityId, 0);
    if (!at) return;
    this.decals.spawn(at.x, this.groundY(at.x, at.z), at.z, radius, colorHex, style, dur);
  }

  // ---- per-frame state (refreshed every frame by painter.syncEntity) ------

  // Returns true when this call STARTED the windup (first frame of the cast),
  // so the painter can count and accent the moment.
  windup(entityId: number, colorHex: number, progress: number): boolean {
    let w = this.windups.get(entityId);
    let started = false;
    if (!w) {
      if (this.windups.size >= MAX_WINDUPS) return false;
      w = { colorHex, progress, stamp: this.frame };
      this.windups.set(entityId, w);
      started = true;
    }
    w.colorHex = colorHex;
    w.progress = progress;
    w.stamp = this.frame;
    return started;
  }

  // Returns true when this call CREATED the band (the aura-gain moment), so
  // the painter can pop a swirl without any event carrying the ability id.
  orbit(entityId: number, style: OrbitStyle, colorHex: number): boolean {
    let bands = this.orbits.get(entityId);
    if (!bands) {
      bands = [];
      this.orbits.set(entityId, bands);
    }
    for (const band of bands) {
      if (band.style === style) {
        band.colorHex = colorHex;
        band.stamp = this.frame;
        return false;
      }
    }
    if (bands.length >= MAX_ORBITS_PER_ENTITY || this.orbitBandCount >= MAX_ORBIT_BANDS)
      return false;
    bands.push({
      style,
      colorHex,
      phase: ((entityId * 2654435761) % 628) / 100,
      age: 0,
      stamp: this.frame,
    });
    this.orbitBandCount++;
    return true;
  }

  // ---- frame advance ------------------------------------------------------

  update(dt: number): void {
    this.time += dt;
    this.camera.getWorldPosition(camPosScratch);
    this.ribbons.update(dt, camPosScratch);
    this.rings.update(dt, this.camera.quaternion);
    this.decals.update(dt);
    this.overlay.beginFrame();
    for (const [id, w] of this.windups) {
      if (w.stamp !== this.frame) {
        this.windups.delete(id);
        continue;
      }
      this.drawWindup(id, w);
    }
    for (const [id, bands] of this.orbits) {
      for (let i = bands.length - 1; i >= 0; i--) {
        if (bands[i].stamp !== this.frame) {
          bands.splice(i, 1);
          this.orbitBandCount--;
        }
      }
      if (bands.length === 0) {
        this.orbits.delete(id);
        continue;
      }
      for (const band of bands) {
        band.age += dt;
        this.drawOrbit(id, band);
      }
    }
    this.overlay.commit();
    this.frame++;
  }

  clear(): void {
    this.ribbons.clear();
    this.rings.clear();
    this.decals.clear();
    this.windups.clear();
    this.orbits.clear();
    this.orbitBandCount = 0;
  }

  private intensity(): number {
    return 0.55 + 0.45 * this.quality;
  }

  // Windup orb: a glow that converges and swells between the caster's hands as
  // the cast bar fills, with a star core and two inward-spiraling motes.
  private drawWindup(entityId: number, w: WindupState): void {
    const at = this.anchor(entityId, 0.58);
    if (!at) return;
    const p = Math.min(1, Math.max(0, w.progress));
    const pulse = 1 + 0.07 * Math.sin(this.time * 14);
    const size = (0.28 + 0.5 * p) * pulse * (0.75 + 0.25 * this.quality);
    this.overlay.push(at.x, at.y + 0.12, at.z, w.colorHex, size, OVERLAY_CELL.glow, 0.85, 1.9);
    this.overlay.push(
      at.x,
      at.y + 0.12,
      at.z,
      w.colorHex,
      size * 0.45,
      OVERLAY_CELL.star,
      0.5 + 0.5 * p,
      2.6,
    );
    if (this.quality >= 0.5) {
      for (let k = 0; k < 2; k++) {
        const a = this.time * 5 + k * Math.PI + entityId;
        const r = 0.25 + 0.9 * (1 - p);
        this.overlay.push(
          at.x + Math.cos(a) * r,
          at.y + 0.12 + Math.sin(this.time * 3 + k * 2) * 0.14,
          at.z + Math.sin(a) * r,
          w.colorHex,
          0.16,
          OVERLAY_CELL.spark,
          0.7,
          2.2,
        );
      }
    }
  }

  private drawOrbit(entityId: number, band: OrbitBand): void {
    const dna = ORBIT_DNA[band.style];
    const at = this.anchor(entityId, dna.frac);
    if (!at) return;
    const fade = Math.min(1, band.age / 0.25) * (0.55 + 0.45 * this.quality);
    for (let k = 0; k < dna.n; k++) {
      const a = band.phase + this.time * dna.rate + (k / dna.n) * Math.PI * 2;
      const y = at.y + Math.sin(this.time * 2 + k * 2) * dna.weave;
      this.overlay.push(
        at.x + Math.cos(a) * dna.radius,
        y,
        at.z + Math.sin(a) * dna.radius,
        band.colorHex,
        dna.size,
        dna.cell,
        fade,
        2.1,
      );
    }
  }
}
