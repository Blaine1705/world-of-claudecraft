import * as THREE from 'three';
import type { AbilityVfxFullSpec } from '../ability_vfx_core';
import { type DecalStyle, GroundDecals } from './decals';
import { abilityVfxTextures, OVERLAY_CELL } from './fx_textures';
import { OverlaySprites } from './overlay_sprites';
import { LightPillars } from './pillars';
import { AbilityVfxRibbons, type RibbonAnchor } from './ribbons';
import { ShockRings } from './rings';
import { ArchetypeSequencer, type SequencerHost } from './sequencer';
import { BuffShells } from './shells';

export type { DecalStyle } from './decals';

// Particle bursts delegate to the pooled Vfx cloud through this seam (the
// painter wires deps.vfx.burst in); kind picks the sprite family.
export type ParticleBurstKind = 'sparks' | 'embers' | 'debris' | 'smoke' | 'blood';
export type ParticleBurst = (
  x: number,
  y: number,
  z: number,
  colorHex: number,
  count: number,
  power: number,
  kind: ParticleBurstKind,
) => void;

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

export type WindupStyle = 'none' | 'orb' | 'runes' | 'vortex' | 'ascend' | 'stance' | 'weapon';

interface WindupState {
  colorHex: number;
  progress: number;
  style: WindupStyle;
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

export class AbilityVfxFx implements SequencerHost {
  private ribbons: AbilityVfxRibbons;
  private rings: ShockRings;
  private decals: GroundDecals;
  private overlay: OverlaySprites;
  private pillars: LightPillars;
  private shells: BuffShells;
  private windups = new Map<number, WindupState>();
  private orbits = new Map<number, OrbitBand[]>();
  private orbitBandCount = 0;
  private time = 0;
  private frame = 0;
  private qualityLevel = 1;
  private particleBurst: ParticleBurst | null = null;
  private lightPulseCb:
    | ((entityId: number, palette: string, intensity: number, duration: number) => void)
    | null = null;
  private statSink: ((abilityId: string, n: number) => void) | null = null;
  private applyGlow: ((entityId: number, colorHex: number, intensity: number) => void) | null =
    null;
  private sequencer = new ArchetypeSequencer();
  // Body-glow envelopes (the gallery casterGlowV): attack fast while fed each
  // frame, decay 0.9/s for held-shell buffs else 2.2/s once the source drops.
  private glows = new Map<
    number,
    { color: number; target: number; level: number; slow: boolean; stamp: number }
  >();

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
    this.pillars = new LightPillars(scene);
    this.shells = new BuffShells(scene);
  }

  // Wired once by the painter: particle bursts ride the pooled Vfx cloud,
  // impact light rides the renderer's pooled point-light flashes, and every
  // sequencer spawn is counted into the painter's probe stats.
  setDelegates(
    burst: ParticleBurst,
    lightPulse: (entityId: number, palette: string, intensity: number, duration: number) => void,
    statSink: (abilityId: string, n: number) => void,
    applyGlow?: (entityId: number, colorHex: number, intensity: number) => void,
  ): void {
    this.particleBurst = burst;
    this.lightPulseCb = lightPulse;
    this.statSink = statSink;
    this.applyGlow = applyGlow ?? null;
  }

  // Feed the body glow for one entity this frame (spec'd cast or live buff
  // aura). The envelope owns attack/decay; the delegate writes the rig
  // emissive. Returns the current glow intensity for the dev probe.
  bodyGlow(entityId: number, colorHex: number, strength: number, slowDecay: boolean): void {
    let g = this.glows.get(entityId);
    if (!g) {
      if (this.glows.size >= 16) return;
      g = { color: colorHex, target: strength, level: 0, slow: slowDecay, stamp: this.frame };
      this.glows.set(entityId, g);
    }
    // one held call per entity per frame (the painter pre-selects the
    // strongest aura); a fresh frame RESETS the target so a dropped strong
    // buff stops holding the level up forever
    g.target = g.stamp === this.frame ? Math.max(g.target, strength) : strength;
    // a stronger transient pulse keeps its color until the envelope decays
    // back to the held level
    if (strength >= g.level) {
      g.color = colorHex;
      g.slow = slowDecay;
    }
    g.stamp = this.frame;
  }

  // One-shot glow pop (instant buffs with no aura to hold, e.g. Blood Toll):
  // the level jumps to strength now and decays on the envelope.
  bodyGlowPulse(entityId: number, colorHex: number, strength: number, slowDecay: boolean): void {
    let g = this.glows.get(entityId);
    if (!g) {
      if (this.glows.size >= 16) return;
      g = { color: colorHex, target: 0, level: 0, slow: slowDecay, stamp: -1 };
      this.glows.set(entityId, g);
    }
    if (strength >= g.level) {
      g.level = strength;
      g.color = colorHex;
      g.slow = slowDecay;
    }
  }

  glowIntensityOf(entityId: number): number {
    const g = this.glows.get(entityId);
    return g ? Math.min(0.85, g.level * 0.38) : 0;
  }

  // ---- archetype sequences (the gallery phase anatomy; see sequencer.ts) --

  // Instant cast: release now, impact 0.15s later at the archetype's anchor.
  sequenceInstant(
    abilityId: string,
    spec: AbilityVfxFullSpec,
    casterId: number,
    targetId: number,
    colorHex: number,
    tier: number,
  ): void {
    this.sequencer.start(this, abilityId, spec, casterId, targetId, colorHex, tier, false);
  }

  // Traveling bolt: release now, comet trail chases the pooled Vfx projectile,
  // and the FULL impact stack lands where and when the trail arrives.
  sequenceBolt(
    abilityId: string,
    spec: AbilityVfxFullSpec,
    casterId: number,
    targetId: number,
    colorHex: number,
    width: number,
    tier: number,
  ): void {
    const slot = this.sequencer.start(
      this,
      abilityId,
      spec,
      casterId,
      targetId,
      colorHex,
      tier,
      true,
    );
    this.ribbons.spawnTrail(
      casterId,
      targetId,
      colorHex,
      width,
      slot ? (x, y, z) => this.sequencer.triggerImpact(this, slot, x, y, z) : null,
    );
  }

  setQuality(q: number): void {
    this.qualityLevel = Math.min(1, Math.max(0, Number.isFinite(q) ? q : 1));
  }

  setViewportScale(heightPx: number, fovDeg: number): void {
    this.overlay.setViewportScale(heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360)));
  }

  // ---- SequencerHost surface (sequencer.ts drives these) ------------------

  anchorOf(id: number, frac: number): { x: number; y: number; z: number } | null {
    return this.anchor(id, frac);
  }

  groundYAt(x: number, z: number): number {
    return this.groundY(x, z);
  }

  ringAt(
    x: number,
    y: number,
    z: number,
    maxR: number,
    dur: number,
    colorHex: number,
    intensity: number,
    vertical: boolean,
  ): void {
    this.rings.spawn(x, y, z, maxR, dur, colorHex, intensity * this.intensity(), vertical);
  }

  decalXZ(
    x: number,
    z: number,
    radius: number,
    colorHex: number,
    style: string,
    dur: number,
  ): void {
    const s: DecalStyle = style === 'ember' || style === 'rime' ? style : 'rune';
    this.decals.spawn(x, this.groundY(x, z), z, radius, colorHex, s, dur);
  }

  pillarAt(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    colorHex: number,
    dur: number,
  ): void {
    this.pillars.spawn(x, y, z, radius, height, colorHex, dur);
  }

  shellFlash(entityId: number, colorHex: number, dur: number): void {
    this.shells.flash(entityId, colorHex, dur);
  }

  // Held barrier shell, refreshed per frame while the barrier aura lives.
  holdShell(entityId: number, colorHex: number): void {
    this.shells.hold(entityId, colorHex, this.frame);
  }

  burstAt(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    count: number,
    power: number,
    kind: ParticleBurstKind,
  ): void {
    this.particleBurst?.(x, y, z, colorHex, count, power, kind);
  }

  pulseLight(entityId: number, palette: string, intensity: number, duration: number): void {
    this.lightPulseCb?.(entityId, palette, intensity, duration);
  }

  glowPulse(entityId: number, colorHex: number, strength: number, slowDecay: boolean): void {
    this.bodyGlowPulse(entityId, colorHex, strength, slowDecay);
  }

  boltBetween(
    sourceId: number,
    targetId: number,
    colorHex: number,
    life: number,
    width: number,
    jag: number,
  ): void {
    this.ribbons.spawnBolt(sourceId, targetId, colorHex, life, width, jag);
  }

  boltPoints(
    fx: number,
    fy: number,
    fz: number,
    tx: number,
    ty: number,
    tz: number,
    colorHex: number,
    life: number,
    width: number,
    jag: number,
  ): void {
    this.ribbons.spawnBoltPoints(fx, fy, fz, tx, ty, tz, colorHex, life, width, jag);
  }

  slashStyled(
    at: { x: number; y: number; z: number },
    colorHex: number,
    style: string,
    scale = 1,
  ): void {
    this.ribbons.spawnSlashStyled(at, colorHex, style, scale);
  }

  pathRibbon(
    colorHex: number,
    width: number,
    life: number,
    fill: (pts: { set(x: number, y: number, z: number): unknown }[]) => number,
  ): void {
    this.ribbons.spawnPath(colorHex, width, life, fill);
  }

  pushOverlay(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    size: number,
    cell: number,
    alpha: number,
    brightness: number,
  ): void {
    this.overlay.push(x, y, z, colorHex, size, cell, alpha, brightness);
  }

  overlayCells(): { glow: number; star: number; rune: number; spark: number } {
    return OVERLAY_CELL;
  }

  quality(): number {
    return this.qualityLevel;
  }

  timeNow(): number {
    return this.time;
  }

  countPrimitive(abilityId: string, n: number): void {
    this.statSink?.(abilityId, n);
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
  windup(
    entityId: number,
    colorHex: number,
    progress: number,
    style: WindupStyle = 'orb',
  ): boolean {
    if (style === 'none') return false;
    let w = this.windups.get(entityId);
    let started = false;
    if (!w) {
      if (this.windups.size >= MAX_WINDUPS) return false;
      w = { colorHex, progress, style, stamp: this.frame };
      this.windups.set(entityId, w);
      started = true;
    }
    w.colorHex = colorHex;
    w.progress = progress;
    w.style = style;
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
    this.pillars.update(dt);
    this.shells.update(dt, this.time, this.frame, this.anchor);
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
    // the archetype sequences advance here so their transient draws (release
    // flash, gavel descent, stun stars) land inside this frame's overlay batch
    this.sequencer.update(this, dt);
    this.overlay.commit();
    for (const [id, g] of this.glows) {
      if (g.stamp === this.frame) {
        // held: rise toward the target, or decay DOWN to it after a pulse
        g.level =
          g.level < g.target
            ? Math.min(g.target, g.level + dt * 10)
            : Math.max(g.target, g.level - dt * (g.slow ? 0.9 : 2.2));
      } else {
        g.level -= dt * (g.slow ? 0.9 : 2.2);
        g.target = 0;
      }
      if (g.level <= 0.03 && g.stamp !== this.frame) {
        this.applyGlow?.(id, g.color, 0);
        this.glows.delete(id);
        continue;
      }
      this.applyGlow?.(id, g.color, Math.min(0.85, g.level * 0.38));
    }
    this.frame++;
  }

  clear(): void {
    this.ribbons.clear();
    this.rings.clear();
    this.decals.clear();
    this.pillars.clear();
    this.shells.clear();
    this.sequencer.clear();
    for (const [id, g] of this.glows) this.applyGlow?.(id, g.color, 0);
    this.glows.clear();
    this.windups.clear();
    this.orbits.clear();
    this.orbitBandCount = 0;
  }

  private intensity(): number {
    return 0.55 + 0.45 * this.qualityLevel;
  }

  // Windup ceremonies (gallery windupStyle set), all immediate-mode overlay
  // sprites recomputed per frame from the live cast progress:
  //   orb     a glow converging and swelling between the hands (the default)
  //   runes   a rotating rune circle at the feet, tightening as the cast fills
  //   vortex  wide sparks pulled inward, the drain-cast read
  //   ascend  a rising mote column crowned by a star near completion
  //   stance  low dust drifting at the feet (warrior stances)
  //   weapon  a hand-height star building along the weapon
  private drawWindup(entityId: number, w: WindupState): void {
    const p = Math.min(1, Math.max(0, w.progress));
    const q = 0.75 + 0.25 * this.qualityLevel;
    const pulse = 1 + 0.07 * Math.sin(this.time * 14);
    if (w.style === 'runes') {
      const feet = this.anchor(entityId, 0.04);
      if (!feet) return;
      const n = 4;
      const r = 1.25 - 0.35 * p;
      for (let k = 0; k < n; k++) {
        const a = this.time * 1.4 + (k / n) * Math.PI * 2;
        this.overlay.push(
          feet.x + Math.cos(a) * r,
          feet.y + 0.14,
          feet.z + Math.sin(a) * r,
          w.colorHex,
          0.3 * q,
          OVERLAY_CELL.rune,
          0.55 + 0.45 * p,
          2.1,
        );
      }
      const chest = this.anchor(entityId, 0.58);
      if (chest)
        this.overlay.push(
          chest.x,
          chest.y,
          chest.z,
          w.colorHex,
          0.24 * (0.5 + p) * pulse * q,
          OVERLAY_CELL.glow,
          0.7,
          1.8,
        );
      return;
    }
    if (w.style === 'stance') {
      const feet = this.anchor(entityId, 0.06);
      if (!feet) return;
      for (let k = 0; k < 3; k++) {
        const a = this.time * 1.1 + k * 2.1 + entityId;
        const r = 0.5 + 0.35 * Math.sin(this.time * 2.4 + k);
        this.overlay.push(
          feet.x + Math.cos(a) * r,
          feet.y + 0.12 + 0.1 * Math.sin(this.time * 3 + k),
          feet.z + Math.sin(a) * r,
          w.colorHex,
          0.22 * q,
          OVERLAY_CELL.glow,
          0.4 + 0.3 * p,
          1.2,
        );
      }
      return;
    }
    if (w.style === 'weapon') {
      const hand = this.anchor(entityId, 0.46);
      if (!hand) return;
      this.overlay.push(
        hand.x,
        hand.y,
        hand.z,
        w.colorHex,
        (0.16 + 0.3 * p) * pulse * q,
        OVERLAY_CELL.star,
        0.55 + 0.45 * p,
        2.5,
      );
      this.overlay.push(
        hand.x,
        hand.y,
        hand.z,
        w.colorHex,
        (0.3 + 0.35 * p) * q,
        OVERLAY_CELL.glow,
        0.5,
        1.6,
      );
      return;
    }
    if (w.style === 'ascend') {
      const feet = this.anchor(entityId, 0.04);
      const head = this.anchor(entityId, 1.0);
      if (!feet || !head) return;
      const span = head.y - feet.y + 0.8;
      for (let k = 0; k < 4; k++) {
        const f = (this.time * 0.45 + k / 4) % 1;
        const a = this.time * 2 + k * 1.7;
        this.overlay.push(
          feet.x + Math.cos(a) * 0.35,
          feet.y + f * span,
          feet.z + Math.sin(a) * 0.35,
          w.colorHex,
          0.2 * q,
          OVERLAY_CELL.glow,
          (1 - f) * (0.4 + 0.6 * p),
          1.9,
        );
      }
      this.overlay.push(
        head.x,
        head.y + 0.5,
        head.z,
        w.colorHex,
        0.3 * p * pulse * q,
        OVERLAY_CELL.star,
        p,
        2.6,
      );
      return;
    }
    // orb (default) and vortex share the hand orb; vortex pulls from wider out
    const at = this.anchor(entityId, 0.58);
    if (!at) return;
    const size = (0.28 + 0.5 * p) * pulse * q;
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
    if (this.qualityLevel >= 0.5) {
      const motes = w.style === 'vortex' ? 4 : 2;
      const reach = w.style === 'vortex' ? 1.9 : 0.9;
      for (let k = 0; k < motes; k++) {
        const a = this.time * 5 + (k * Math.PI * 2) / motes + entityId;
        const r = 0.25 + reach * (1 - p);
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
    const fade = Math.min(1, band.age / 0.25) * (0.55 + 0.45 * this.qualityLevel);
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
