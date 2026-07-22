import {
  type AbilityVfxFullSpec,
  type AbilityVfxMotif,
  abilityHexColor,
} from '../ability_vfx_core';

// The archetype sequencer, ported from the gallery interpreters
// (arc_bolt_preview.js): each claimed cast becomes one pooled sequence slot
// that plays the gallery's phase anatomy on the primitive pools: release flash
// (~100ms hot), the impact stack "stacked inside 150ms" (ground ring, +50ms
// second ring, +120ms finisher ring, vRing, sparks/embers/debris/smoke/blood,
// light pulse, trail arc, decal), then lingers (dot drips, motifEvery loops).
// Instants run the same sequence compressed: impact fires 0.15s after release.
// Motifs are set-piece compositions on the same pools, staged over time
// through a pooled beat queue (the gallery's setTimeoutSim staggering).
// Everything is slot-pooled and capped; budget tier 0 plays the full
// composition, tier 1 keeps ONE signature beat per motif and sheds lingers,
// tier 2 never reaches the sequencer.

const SEQ_SLOTS = 24;
const BEAT_SLOTS = 48;
// The implosion converge and barrier-plate transients play over fixed spans.
const IMPLODE_DUR = 0.42;
const BARRIER_DUR = 1.35;
const BARRIER_PLATE_LIFE = 1.1;

// The host surface fx.ts implements: every primitive the sequences drive.
export interface SequencerHost {
  anchorOf(id: number, frac: number): { x: number; y: number; z: number } | null;
  groundYAt(x: number, z: number): number;
  ringAt(
    x: number,
    y: number,
    z: number,
    maxR: number,
    dur: number,
    colorHex: number,
    intensity: number,
    vertical: boolean,
  ): void;
  decalXZ(x: number, z: number, radius: number, colorHex: number, style: string, dur: number): void;
  flipbookAt(
    x: number,
    y: number,
    z: number,
    size: number,
    colorHex: number,
    sheet: string,
    hdr: number,
  ): void;
  pillarAt(
    x: number,
    y: number,
    z: number,
    radius: number,
    height: number,
    colorHex: number,
    dur: number,
  ): void;
  shellFlash(entityId: number, colorHex: number, dur: number): void;
  burstAt(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    count: number,
    power: number,
    kind: 'sparks' | 'embers' | 'debris' | 'smoke' | 'blood',
  ): void;
  pulseLight(entityId: number, palette: string, intensity: number, duration: number): void;
  glowPulse(entityId: number, colorHex: number, strength: number, slowDecay: boolean): void;
  boltBetween(
    sourceId: number,
    targetId: number,
    colorHex: number,
    life: number,
    width: number,
    jag: number,
  ): void;
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
  ): void;
  slashStyled(
    at: { x: number; y: number; z: number },
    colorHex: number,
    style: string,
    scale?: number,
  ): void;
  pathRibbon(
    colorHex: number,
    width: number,
    life: number,
    fill: (pts: { set(x: number, y: number, z: number): unknown }[]) => number,
  ): void;
  pushOverlay(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    size: number,
    cell: number,
    alpha: number,
    brightness: number,
  ): void;
  overlayCells(): { glow: number; star: number; rune: number; spark: number };
  // One frame of the authored windup ceremony on an entity (drives the
  // sequencer's synthetic pre-release phase for instant casts).
  windupDraw(entityId: number, colorHex: number, progress: number, style: string): void;
  quality(): number;
  timeNow(): number;
  countPrimitive(abilityId: string, n: number): void;
  // Camera trauma at a world point (the host applies distance falloff and a
  // rolling budget so spam can never stack shake).
  shakeAt(x: number, y: number, z: number, amount: number): void;
  // Ghost-creature apparition (spirits.ts): fired once at impact when the
  // spec authors a spirit block. The host resolves the anchor, gates on
  // camera relevance and model readiness, and returns whether one spawned.
  spiritAt?(
    spirit: NonNullable<AbilityVfxFullSpec['spirit']>,
    casterId: number,
    targetId: number,
    x: number,
    y: number,
    z: number,
    colorHex: number,
    palette: string,
  ): boolean;
}

type SeqBurstKind = 'sparks' | 'embers' | 'debris' | 'smoke' | 'blood';

// One pooled delayed motif beat (the gallery's setTimeoutSim staggering):
// counts down, fires its primitive stack once, frees the slot. Beats hold
// world coordinates so they land correctly even after their sequence ends.
type BeatKind = 'burst' | 'pillar' | 'orbital';

interface Beat {
  active: boolean;
  delay: number;
  kind: BeatKind;
  abilityId: string;
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  color: number;
  accent: number;
  a: number; // count (burst) / height (pillar)
  b: number; // power (burst) / radius (pillar)
  burstKind: SeqBurstKind;
}

export interface SeqSlot {
  active: boolean;
  abilityId: string;
  casterId: number;
  targetId: number;
  spec: AbilityVfxFullSpec;
  color: number;
  accent: number;
  tier: number;
  t: number;
  power: number;
  // phase bookkeeping
  // synthetic pre-release windup for instants: release fires at releaseAt and
  // until then the caster draws the authored windup ceremony each frame
  releaseAt: number;
  releaseDone: boolean;
  impactAt: number;
  impactDone: boolean;
  ring2At: number;
  ring2Done: boolean;
  ring3At: number;
  ring3Done: boolean;
  swing2At: number;
  swing2Done: boolean;
  lingerUntil: number;
  dotTimer: number;
  motifTimer: number;
  motifLoops: number;
  // impact anchor captured at impact time (world point)
  ix: number;
  iy: number;
  iz: number;
  // transient draw state
  gavel: boolean;
  gavelT: number;
  ccStars: number; // stunned-star band duration remaining
  implode: number; // implosion converge remaining
  barrierT: number; // barrier plate-arc duration remaining
}

function lighten(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (
    (Math.min(255, Math.round(r + (255 - r) * amount)) << 16) |
    (Math.min(255, Math.round(g + (255 - g) * amount)) << 8) |
    Math.min(255, Math.round(b + (255 - b) * amount))
  );
}

const DECAL_BY_SPEC: Record<string, string> = {
  crack: 'crack',
  scorch: 'char',
  rune: 'rune',
  portal: 'rune',
};

function decalStyleOf(spec: AbilityVfxFullSpec): string {
  if (spec.decal) return DECAL_BY_SPEC[spec.decal] ?? 'rune';
  const p = spec.palette;
  if (p === 'fire' || p === 'blood') return 'ember';
  if (p === 'physical' || p === 'storm') return 'char';
  if (p === 'frost' || p === 'moon') return 'rime';
  return 'rune';
}

// Which flipbook sheet each school's impact plays (the gallery PAL_STYLE map).
const SHEET_BY_PALETTE: Record<string, string> = {
  storm: 'electric',
  arcane: 'electric',
  physical: 'electric',
  fire: 'flame',
  blood: 'flame',
  frost: 'shatter',
  moon: 'radiance',
  holy: 'radiance',
  gold: 'radiance',
  shadow: 'void',
  venom: 'void',
  nature: 'verdant',
};

export class ArchetypeSequencer {
  private slots: SeqSlot[] = [];
  private beats: Beat[] = [];

  constructor() {
    for (let i = 0; i < BEAT_SLOTS; i++) {
      this.beats.push({
        active: false,
        delay: 0,
        kind: 'burst',
        abilityId: '',
        x: 0,
        y: 0,
        z: 0,
        tx: 0,
        ty: 0,
        tz: 0,
        color: 0xffffff,
        accent: 0xffffff,
        a: 0,
        b: 0,
        burstKind: 'sparks',
      });
    }
    for (let i = 0; i < SEQ_SLOTS; i++) {
      this.slots.push({
        active: false,
        abilityId: '',
        casterId: 0,
        targetId: 0,
        spec: { archetype: 'burst', palette: 'arcane' },
        color: 0xffffff,
        accent: 0xffffff,
        tier: 0,
        t: 0,
        power: 1,
        releaseAt: 0,
        releaseDone: true,
        impactAt: 0.15,
        impactDone: false,
        ring2At: 0,
        ring2Done: true,
        ring3At: 0,
        ring3Done: true,
        swing2At: 0,
        swing2Done: true,
        lingerUntil: 0,
        dotTimer: 0,
        motifTimer: 0,
        motifLoops: 0,
        ix: 0,
        iy: 0,
        iz: 0,
        gavel: false,
        gavelT: 0,
        ccStars: 0,
        implode: 0,
        barrierT: 0,
      });
    }
  }

  // Begin a sequence at the RELEASE moment. awaitTravel: a live projectile is
  // in flight and triggerImpact() will land it; otherwise the impact fires at
  // the compressed instant timing (0.15s). windupDelay > 0 stages a synthetic
  // pre-release windup first: the release (and everything after it) shifts
  // late by that much while the caster draws the authored windup ceremony.
  // `at` pins the sequence to a WORLD POINT (ground-aimed casts): pass
  // targetId -1 with it, and every target-anchored read falls back there.
  start(
    host: SequencerHost,
    abilityId: string,
    spec: AbilityVfxFullSpec,
    casterId: number,
    targetId: number,
    colorHex: number,
    tier: number,
    awaitTravel: boolean,
    windupDelay = 0,
    at?: { x: number; y: number; z: number },
  ): SeqSlot | null {
    if (tier >= 2) return null;
    // steal the oldest running sequence when the pool is saturated: a fresh
    // cast always reads louder than a stale linger tail
    let slot = this.slots.find((s) => !s.active) ?? null;
    if (!slot) {
      for (const cand of this.slots) {
        if (!slot || cand.t > slot.t) slot = cand;
      }
    }
    if (!slot) return null;
    slot.active = true;
    slot.abilityId = abilityId;
    slot.casterId = casterId;
    slot.targetId = targetId;
    slot.spec = spec;
    slot.color = colorHex;
    slot.accent = lighten(colorHex, 0.4);
    slot.tier = tier;
    slot.t = 0;
    slot.power = spec.power ?? 1;
    slot.releaseAt = windupDelay;
    slot.releaseDone = windupDelay <= 0;
    slot.impactAt = awaitTravel ? Number.POSITIVE_INFINITY : windupDelay + 0.15;
    slot.impactDone = false;
    slot.ring2Done = true;
    slot.ring3Done = true;
    slot.swing2Done = true;
    slot.lingerUntil = 0;
    slot.dotTimer = 0;
    slot.motifTimer = spec.motifEvery ?? 0;
    slot.motifLoops = 0;
    // seed the point anchor BEFORE release: release-phase motifs on a
    // point-anchored slot already need the fallback
    if (at) {
      slot.ix = at.x;
      slot.iy = at.y;
      slot.iz = at.z;
    }
    slot.gavel = false;
    slot.ccStars = 0;
    slot.implode = 0;
    slot.barrierT = 0;
    if (slot.releaseDone) this.release(host, slot);
    return slot;
  }

  // The projectile arrived: land the impact at its world point.
  triggerImpact(host: SequencerHost, slot: SeqSlot, x: number, y: number, z: number): void {
    if (!slot.active || slot.impactDone) return;
    slot.ix = x;
    slot.iy = y;
    slot.iz = z;
    slot.impactDone = true;
    this.impact(host, slot);
  }

  update(host: SequencerHost, dt: number): void {
    // staggered motif beats fire before the slot walk so a beat scheduled last
    // frame lands on time even if its sequence ended
    for (const beat of this.beats) {
      if (!beat.active) continue;
      beat.delay -= dt;
      if (beat.delay > 0) continue;
      beat.active = false;
      this.fireBeat(host, beat);
    }
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.t += dt;
      const spec = slot.spec;
      if (!slot.releaseDone) {
        if (slot.t < slot.releaseAt) {
          // pre-release: the caster performs the authored windup ceremony
          host.windupDraw(
            slot.casterId,
            slot.color,
            Math.min(1, slot.t / slot.releaseAt),
            spec.windupStyle ?? 'orb',
          );
          continue;
        }
        slot.releaseDone = true;
        this.release(host, slot);
      }
      if (!slot.impactDone && slot.t >= slot.impactAt) {
        const at = this.impactAnchor(host, slot);
        if (at) {
          slot.ix = at.x;
          slot.iy = at.y;
          slot.iz = at.z;
          slot.impactDone = true;
          this.impact(host, slot);
        } else {
          slot.active = false;
          continue;
        }
      }
      // staggered ring follow-ups (the "stacked inside 150ms" tail)
      if (!slot.ring2Done && slot.t >= slot.ring2At) {
        slot.ring2Done = true;
        const rs = this.ringScale(slot);
        host.ringAt(
          slot.ix,
          this.groundOf(host, slot),
          slot.iz,
          2.6 * rs,
          0.5,
          slot.accent,
          1.2,
          false,
        );
        host.countPrimitive(slot.abilityId, 1);
      }
      if (!slot.ring3Done && slot.t >= slot.ring3At) {
        slot.ring3Done = true;
        const rs = this.ringScale(slot);
        host.ringAt(slot.ix, slot.iy + 0.6, slot.iz, 3.6 * rs, 0.55, 0xffffff, 1.5, true);
        host.countPrimitive(slot.abilityId, 1);
      }
      // strike second swing
      if (!slot.swing2Done && slot.t >= slot.swing2At) {
        slot.swing2Done = true;
        const at = host.anchorOf(slot.targetId, 0.55);
        if (at) {
          host.slashStyled(at, slot.color, spec.strike?.arc ?? 'horizontal', 0.85);
          host.burstAt(at.x, at.y, at.z, slot.color, 14, 0.9, 'sparks');
          host.countPrimitive(slot.abilityId, 2);
        }
      }
      // dot drips while the linger lives
      if (slot.impactDone && spec.archetype === 'dot' && slot.t < slot.lingerUntil) {
        slot.dotTimer -= dt;
        if (slot.dotTimer <= 0) {
          slot.dotTimer = 0.5;
          const at =
            host.anchorOf(slot.targetId, 0.5) ??
            (slot.targetId < 0 ? { x: slot.ix, y: slot.iy, z: slot.iz } : null);
          if (at) {
            const rise = spec.dot?.drip !== 'fall';
            host.burstAt(
              at.x,
              at.y + (rise ? 0 : 0.5),
              at.z,
              slot.color,
              5,
              0.5,
              rise ? 'embers' : 'blood',
            );
            host.countPrimitive(slot.abilityId, 1);
          }
        }
      }
      // motifEvery loops (Bladestorm re-runs its whirl while the linger lives)
      if (
        slot.impactDone &&
        (spec.motifEvery ?? 0) > 0 &&
        slot.t < slot.lingerUntil &&
        slot.tier === 0
      ) {
        slot.motifTimer -= dt;
        if (slot.motifTimer <= 0 && slot.motifLoops < 8) {
          slot.motifTimer = spec.motifEvery ?? 1;
          slot.motifLoops++;
          this.runMotifs(host, slot);
        }
      }
      // transient draws
      this.drawTransients(host, slot, dt);
      // sequence end: after impact + lingers + transients drain
      const done =
        slot.impactDone &&
        slot.ring2Done &&
        slot.ring3Done &&
        slot.swing2Done &&
        slot.t >= slot.lingerUntil &&
        !slot.gavel &&
        slot.ccStars <= 0 &&
        slot.implode <= 0 &&
        slot.barrierT <= 0;
      if (done || slot.t > 12) slot.active = false;
    }
  }

  clear(): void {
    for (const slot of this.slots) slot.active = false;
    for (const beat of this.beats) beat.active = false;
  }

  // ---- staggered motif beats ----------------------------------------------

  private scheduleBeat(
    delay: number,
    kind: BeatKind,
    abilityId: string,
    x: number,
    y: number,
    z: number,
    color: number,
    accent: number,
    a: number,
    b: number,
    burstKind: SeqBurstKind = 'sparks',
    tx = 0,
    ty = 0,
    tz = 0,
  ): void {
    // a saturated pool drops garnish beats; the immediate stack already read
    const beat = this.beats.find((bt) => !bt.active);
    if (!beat) return;
    beat.active = true;
    beat.delay = delay;
    beat.kind = kind;
    beat.abilityId = abilityId;
    beat.x = x;
    beat.y = y;
    beat.z = z;
    beat.tx = tx;
    beat.ty = ty;
    beat.tz = tz;
    beat.color = color;
    beat.accent = accent;
    beat.a = a;
    beat.b = b;
    beat.burstKind = burstKind;
  }

  private fireBeat(host: SequencerHost, beat: Beat): void {
    switch (beat.kind) {
      case 'burst':
        host.burstAt(beat.x, beat.y, beat.z, beat.color, Math.round(beat.a), beat.b, beat.burstKind);
        host.countPrimitive(beat.abilityId, 1);
        break;
      case 'pillar': {
        // one sequential ground eruption (gallery pillars): light column, a
        // vertical crack, and risers bursting off the base
        const gy = host.groundYAt(beat.x, beat.z);
        host.pillarAt(beat.x, gy, beat.z, beat.b, beat.a, beat.color, 0.5);
        host.boltPoints(
          beat.x,
          gy + 0.05,
          beat.z,
          beat.x + (Math.random() - 0.5) * 0.5,
          gy + beat.a,
          beat.z + (Math.random() - 0.5) * 0.5,
          beat.color,
          0.28,
          0.12,
          0.8,
        );
        host.burstAt(beat.x, gy + 0.15, beat.z, beat.accent, 7, 1.3, 'embers');
        host.countPrimitive(beat.abilityId, 3);
        break;
      }
      case 'orbital':
        // one orb slam (gallery orbitals): the strike arc plus its spark pop
        host.boltPoints(
          beat.x,
          beat.y,
          beat.z,
          beat.tx,
          beat.ty,
          beat.tz,
          beat.color,
          0.16,
          0.09,
          0.25,
        );
        host.burstAt(beat.tx, beat.ty, beat.tz, beat.accent, 8, 1.3, 'sparks');
        host.countPrimitive(beat.abilityId, 2);
        break;
    }
  }

  // ---- phases -------------------------------------------------------------

  // Release: the 100ms hot flash at the caster plus per-archetype openers.
  private release(host: SequencerHost, slot: SeqSlot): void {
    const spec = slot.spec;
    const caster = host.anchorOf(slot.casterId, 0.58);
    if (caster) {
      host.burstAt(
        caster.x,
        caster.y,
        caster.z,
        slot.color,
        Math.round(10 * slot.power),
        1.1,
        'sparks',
      );
      host.pulseLight(slot.casterId, spec.palette, 3.2 * slot.power, 0.22);
      host.countPrimitive(slot.abilityId, 2);
    }
    // release-phase motifs (bladestorm whirl, implosion pull-in); tier 1 still
    // plays them as their single signature beat
    if (spec.motifs && slot.tier <= 1) {
      for (const m of spec.motifs) {
        if (m === 'bladestorm' || m === 'implosion') this.runOneMotif(host, slot, m);
      }
    }
  }

  // The full impact stack at (ix, iy, iz), honoring every spec impact flag.
  private impact(host: SequencerHost, slot: SeqSlot): void {
    const spec = slot.spec;
    const o = spec.impact ?? {};
    const cs = slot.power;
    const rs = this.ringScale(slot);
    const gy = this.groundOf(host, slot);
    const arch = spec.archetype;
    const gentle = arch === 'heal' || arch === 'buff' || arch === 'cc';
    let n = 0;
    // hero impact sheet (gallery impactStack fires the flipbook first): the
    // authored spec wins — an explicit true forces it even on gentle
    // archetypes, false suppresses it, and the default fires only for
    // non-gentle impacts. Tier-0-only spectacle; sheet picked per school.
    if (slot.tier === 0 && o.flipbook !== false && (o.flipbook === true || !gentle)) {
      host.flipbookAt(
        slot.ix,
        slot.iy,
        slot.iz,
        2 * cs,
        slot.color,
        SHEET_BY_PALETTE[spec.palette] ?? 'electric',
        spec.finisher ? 1.6 : 1.25,
      );
      n++;
    }
    // ground ring (rings default ON except when spec turns them off)
    if (o.ring !== false && (o.ring !== undefined || !gentle)) {
      const base =
        arch === 'nova'
          ? (spec.nova?.radius ?? 5) * slot.power
          : arch === 'shout'
            ? (spec.shout?.radius ?? 6) * slot.power
            : 2.4 * cs;
      host.ringAt(slot.ix, gy, slot.iz, base * rs, 0.55, slot.color, 1.8, false);
      slot.ring2At = slot.t + 0.06;
      slot.ring2Done = false;
      n++;
    }
    // vertical halo
    if (o.vRing) {
      host.ringAt(
        slot.ix,
        slot.iy + 0.4,
        slot.iz,
        2.6 * cs * (o.vRing === true ? 1 : o.vRing),
        0.45,
        slot.accent,
        1.3,
        true,
      );
      n++;
    }
    // crit-finisher third ring
    if (spec.finisher) {
      slot.ring3At = slot.t + 0.12;
      slot.ring3Done = false;
    }
    // particles: sparks, embers, debris, smoke, blood
    const q = 0.4 + 0.6 * host.quality();
    const sparks = Math.round(
      (o.sparks ?? (gentle ? 14 : 30)) * cs * q * (slot.tier === 1 ? 0.5 : 1),
    );
    if (sparks > 0) {
      host.burstAt(
        slot.ix,
        slot.iy,
        slot.iz,
        slot.accent,
        Math.min(60, Math.max(4, sparks)),
        1.1 * cs,
        'sparks',
      );
      n++;
    }
    if (o.debris) {
      host.burstAt(slot.ix, slot.iy, slot.iz, slot.color, Math.round(10 * cs * q), 1, 'debris');
      n++;
    }
    if (o.smoke) {
      host.burstAt(slot.ix, slot.iy + 0.3, slot.iz, slot.color, 5, 0.5, 'smoke');
      n++;
    }
    if (o.blood) {
      host.burstAt(slot.ix, slot.iy, slot.iz, 0xa01222, Math.round(12 * cs), 0.9, 'blood');
      n++;
    }
    // buff-block casts light the caster's body (the gallery casterGlowV on
    // buff impact); instant no-aura buffs like Blood Toll get their red read
    // from exactly this pulse
    if (spec.buff !== undefined || arch === 'buff') {
      const rim = spec.rim ? abilityHexColor(spec.rim) : slot.color;
      host.glowPulse(
        slot.casterId,
        rim,
        (spec.buff?.shellDur ? 2 : 1.3) * cs,
        !!spec.buff?.shellDur,
      );
      n++;
    }
    // impact light pulse
    const light = typeof o.light === 'number' ? o.light : 1;
    if (light > 0) {
      host.pulseLight(slot.targetId, spec.palette, Math.min(10, 2.5 * light * cs), 0.3);
      n++;
    }
    // weapon trail arc frozen at contact
    if (o.trail) {
      const at = host.anchorOf(slot.targetId, 0.55);
      if (at) {
        host.slashStyled(at, slot.accent, o.trail, 1);
        n++;
      }
    }
    // ground mark
    if (slot.tier === 0 && (spec.decal || (!gentle && (spec.linger ?? 0) >= 1.5))) {
      host.decalXZ(
        slot.ix,
        slot.iz,
        Math.max(1.6, 2 * rs),
        slot.color,
        decalStyleOf(spec),
        Math.min(6, 1.5 + (spec.linger ?? 1) * 1.4),
      );
      n++;
    }
    host.countPrimitive(slot.abilityId, n);
    // crit-finisher impacts kick the camera (small; the accent system and the
    // host's shake budget keep a crit chain from stacking trauma)
    if (spec.finisher && slot.tier === 0) host.shakeAt(slot.ix, slot.iy, slot.iz, 0.15);
    // per-archetype impact extras
    this.archetypeImpact(host, slot, gy);
    // spirit apparition (summons, cc, shapeshifts — any spec authoring one):
    // tier-0-only spectacle, once per sequence, at the impact moment
    if (
      slot.tier === 0 &&
      spec.spirit?.model &&
      host.spiritAt?.(
        spec.spirit,
        slot.casterId,
        slot.targetId,
        slot.ix,
        slot.iy,
        slot.iz,
        slot.color,
        spec.palette,
      )
    ) {
      host.countPrimitive(slot.abilityId, 1);
    }
    // impact-phase motifs; tier 1 keeps one signature beat per motif
    if (spec.motifs && slot.tier <= 1) this.runMotifs(host, slot);
    // lingers honor the authored 1-6s dwell at tier 0 (dot drips, motif loops,
    // and the decal above all ride this window)
    slot.lingerUntil = slot.t + (slot.tier === 0 ? Math.min(6, spec.linger ?? 0.5) : 0);
  }

  private archetypeImpact(host: SequencerHost, slot: SeqSlot, gy: number): void {
    const spec = slot.spec;
    const c = slot.color;
    switch (spec.archetype) {
      case 'strike': {
        const at = host.anchorOf(slot.targetId, 0.55);
        if (at) {
          host.slashStyled(at, c, spec.strike?.arc ?? 'horizontal', 1);
          host.countPrimitive(slot.abilityId, 1);
          if (spec.strike?.bleed) {
            host.burstAt(at.x, at.y, at.z, 0xa01222, 8, 0.7, 'blood');
            host.countPrimitive(slot.abilityId, 1);
          }
          if (spec.strike?.groundSlam) {
            host.ringAt(slot.ix, gy, slot.iz, 4.2 * slot.power, 0.6, c, 1.6, false);
            host.burstAt(slot.ix, gy + 0.2, slot.iz, c, 12, 1, 'debris');
            host.countPrimitive(slot.abilityId, 2);
            if (slot.tier === 0) host.shakeAt(slot.ix, gy, slot.iz, 0.2);
          }
          if (spec.strike?.stars) slot.ccStars = Math.max(slot.ccStars, 1.2);
        }
        if ((spec.strike?.swings ?? 1) > 1) {
          slot.swing2At = slot.t + 0.22;
          slot.swing2Done = false;
        }
        break;
      }
      case 'nova':
      case 'shout': {
        // radial risers around the wavefront
        const radius =
          spec.archetype === 'nova'
            ? (spec.nova?.radius ?? 5) * slot.power
            : (spec.shout?.radius ?? 6) * slot.power;
        host.burstAt(
          slot.ix,
          gy + 0.25,
          slot.iz,
          slot.accent,
          Math.round(10 * host.quality() + 8),
          1.4,
          'embers',
        );
        host.ringAt(slot.ix, slot.iy + 0.8, slot.iz, radius * 0.75, 0.5, c, 1.6, true);
        host.countPrimitive(slot.abilityId, 2);
        break;
      }
      case 'heal': {
        const shaft = spec.shaft === false ? 0 : typeof spec.shaft === 'number' ? spec.shaft : 1;
        if (shaft > 0) {
          host.pillarAt(
            slot.ix,
            gy,
            slot.iz,
            (0.55 + 0.45 * slot.power) * shaft,
            4 + 3.2 * slot.power,
            c,
            0.5 + 0.4 * slot.power,
          );
          host.countPrimitive(slot.abilityId, 1);
        }
        host.burstAt(slot.ix, slot.iy, slot.iz, slot.accent, 16, 0.8, 'embers');
        host.countPrimitive(slot.abilityId, 1);
        break;
      }
      case 'buff': {
        if (spec.buff?.shellDur || spec.barrier) {
          host.shellFlash(slot.casterId, c, Math.max(1, spec.buff?.shellDur ?? 1.2));
          host.countPrimitive(slot.abilityId, 1);
        }
        host.burstAt(slot.ix, slot.iy - 0.4, slot.iz, slot.accent, 12, 0.7, 'embers');
        host.countPrimitive(slot.abilityId, 1);
        break;
      }
      case 'summon': {
        host.decalXZ(slot.ix, slot.iz, 1.6, c, 'rune', 2.4);
        host.pillarAt(slot.ix, gy, slot.iz, 0.6, 3, c, 0.5);
        host.burstAt(slot.ix, gy + 0.3, slot.iz, slot.accent, 16, 0.9, 'embers');
        host.countPrimitive(slot.abilityId, 3);
        break;
      }
      case 'cc': {
        const style = spec.cc?.style ?? 'poof';
        if (style === 'tendrils') {
          const at = host.anchorOf(slot.targetId, 0.3);
          if (at) {
            for (let k = 0; k < 3; k++)
              host.boltPoints(
                at.x,
                at.y - 0.4,
                at.z,
                at.x + (Math.random() - 0.5) * 0.9,
                at.y + 1.1,
                at.z + (Math.random() - 0.5) * 0.9,
                c,
                0.35,
                0.06,
                0.6,
              );
            host.countPrimitive(slot.abilityId, 3);
          }
        } else {
          slot.ccStars = Math.max(1.8, Math.min(4, (spec.linger ?? 2) - 0.2));
          if (style === 'poof') {
            host.burstAt(slot.ix, slot.iy + 0.3, slot.iz, c, 8, 0.6, 'smoke');
            host.countPrimitive(slot.abilityId, 1);
          }
        }
        break;
      }
      case 'dash': {
        const from = host.anchorOf(slot.casterId, 0.3);
        const to = host.anchorOf(slot.targetId, 0.3);
        if (from && to) {
          host.pathRibbon(c, 0.5, 0.35, (pts) => {
            for (let i = 0; i < 10; i++) {
              const u = i / 9;
              pts[i].set(
                from.x + (to.x - from.x) * u,
                from.y + (to.y - from.y) * u + 0.15,
                from.z + (to.z - from.z) * u,
              );
            }
            return 10;
          });
          host.countPrimitive(slot.abilityId, 1);
        }
        slot.ccStars = Math.max(slot.ccStars, 0.9);
        break;
      }
      case 'burst': {
        const style = spec.burst?.style ?? 'link';
        if (style === 'skybeam') {
          const shaft = spec.shaft === false ? 0 : typeof spec.shaft === 'number' ? spec.shaft : 1;
          host.pillarAt(slot.ix, gy, slot.iz, 1.1 * Math.max(0.4, shaft), 11, c, 0.55);
          host.boltPoints(
            slot.ix,
            slot.iy + 9,
            slot.iz,
            slot.ix,
            slot.iy,
            slot.iz,
            c,
            0.4,
            0.22,
            0.5,
          );
          host.countPrimitive(slot.abilityId, 2);
        } else if (style === 'ground') {
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * Math.PI * 2 + slot.t;
            host.boltPoints(
              slot.ix + Math.cos(a) * 0.7,
              gy,
              slot.iz + Math.sin(a) * 0.7,
              slot.ix + Math.cos(a) * 0.9,
              gy + 2.2,
              slot.iz + Math.sin(a) * 0.9,
              c,
              0.3,
              0.09,
              0.7,
            );
          }
          host.countPrimitive(slot.abilityId, 3);
        } else {
          host.boltBetween(slot.casterId, slot.targetId, c, 0.14, 0.07, 0.25);
          host.countPrimitive(slot.abilityId, 1);
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- motifs -------------------------------------------------------------

  private runMotifs(host: SequencerHost, slot: SeqSlot): void {
    if (!slot.spec.motifs) return;
    for (const m of slot.spec.motifs) {
      if (m === 'bladestorm' || m === 'implosion') {
        // release-phase motifs: re-run only on motifEvery loops
        if (slot.motifLoops > 0) this.runOneMotif(host, slot, m);
        continue;
      }
      this.runOneMotif(host, slot, m);
    }
  }

  // Set-piece motif compositions at gallery scale (MOTIFS table,
  // arc_bolt_preview.js): full stagger and beat count at tier 0, the ONE
  // signature beat at tier 1. Delayed beats ride the pooled beat queue; the
  // immediate primitives count here and every beat counts itself on fire.
  private runOneMotif(host: SequencerHost, slot: SeqSlot, motif: AbilityVfxMotif): void {
    const spec = slot.spec;
    const lite = slot.tier >= 1;
    const atCaster = spec.motifAt === 'caster' || spec.self === true;
    const anchorId =
      spec.motifAt === 'target' ? slot.targetId : atCaster ? slot.casterId : slot.targetId;
    const at = host.anchorOf(anchorId, 0.4) ?? { x: slot.ix, y: slot.iy, z: slot.iz };
    const gy = host.groundYAt(at.x, at.z);
    const c = slot.color;
    const acc = slot.accent;
    const r = spec.motifR ?? 1.1;
    const id = slot.abilityId;
    let n = 1;
    switch (motif) {
      case 'fissure': {
        // the ground splits toward the target: a branching caster-to-point
        // crack (0.8s) with six ember/dust eruptions staggered along it
        const from = host.anchorOf(slot.casterId, 0.05);
        if (!from) {
          n = 0;
          break;
        }
        const fgy = host.groundYAt(from.x, from.z);
        host.boltPoints(from.x, fgy + 0.12, from.z, at.x, gy + 0.12, at.z, c, 0.8, 0.18, 0.5);
        if (lite) {
          // signature beat: the crack plus one eruption where it ends
          host.burstAt(at.x, gy + 0.15, at.z, c, 6, 1, 'debris');
          n = 2;
          break;
        }
        // a branch splitting off the midpoint sells "branching", which the
        // pooled bolt generator itself never draws
        const mx = (from.x + at.x) / 2;
        const mz = (from.z + at.z) / 2;
        const px = -(at.z - from.z);
        const pz = at.x - from.x;
        const pl = Math.hypot(px, pz) || 1;
        const side = Math.random() < 0.5 ? 1 : -1;
        const bx = mx + (px / pl) * 2.2 * side;
        const bz = mz + (pz / pl) * 2.2 * side;
        host.boltPoints(
          mx,
          host.groundYAt(mx, mz) + 0.12,
          mz,
          bx,
          host.groundYAt(bx, bz) + 0.12,
          bz,
          c,
          0.6,
          0.1,
          0.8,
        );
        for (let k = 0; k < 6; k++) {
          const u = (k + 1) / 7;
          const ex = from.x + (at.x - from.x) * u;
          const ez = from.z + (at.z - from.z) * u;
          this.scheduleBeat(
            u * 0.22,
            'burst',
            id,
            ex,
            host.groundYAt(ex, ez) + 0.15,
            ez,
            k % 2 === 0 ? c : acc,
            acc,
            6,
            1.1,
            k % 2 === 0 ? 'debris' : 'embers',
          );
        }
        if (slot.tier === 0) host.shakeAt(at.x, gy, at.z, 0.3);
        n = 2;
        break;
      }
      case 'pillars': {
        // ring of five sequential ground eruptions, 90ms apart
        if (lite) {
          host.pillarAt(at.x, gy, at.z, 0.45, 3, c, 0.5);
          break;
        }
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          this.scheduleBeat(
            k * 0.09,
            'pillar',
            id,
            at.x + Math.cos(a) * 1.9,
            gy,
            at.z + Math.sin(a) * 1.9,
            c,
            acc,
            2.2 + (k % 3) * 0.5,
            0.42,
          );
        }
        n = 0;
        break;
      }
      case 'crescents':
        // twin moon-blades sweeping through at gallery span
        host.slashStyled({ x: at.x, y: at.y + 0.4, z: at.z }, c, 'crescent', lite ? 1.5 : 1.6);
        if (!lite) {
          host.slashStyled({ x: at.x, y: at.y + 0.7, z: at.z }, acc, 'crescent', 1.3);
          host.burstAt(at.x, at.y + 0.5, at.z, acc, 8, 0.9, 'sparks');
          n = 3;
        }
        break;
      case 'bladestorm': {
        // slash ribbons ARCING around the caster (true whirl segments, not
        // point slashes); spec.motifR widens the whirl to the real AoE
        const center = host.anchorOf(slot.casterId, 0.5) ?? at;
        const w = Math.sqrt(r / 1.1);
        const count = lite ? 1 : 3;
        for (let k = 0; k < count; k++) {
          const ph = host.timeNow() * 9 + (k / 3) * Math.PI * 2;
          host.pathRibbon(k % 2 === 0 ? c : acc, 0.11 * w, 0.55, (pts) => {
            for (let i = 0; i < 9; i++) {
              const a = ph + (i / 8) * 1.6;
              pts[i].set(
                center.x + Math.cos(a) * r,
                center.y + Math.sin(ph * 0.7) * 0.3,
                center.z + Math.sin(a) * r,
              );
            }
            return 9;
          });
        }
        if (slot.tier === 0) host.shakeAt(center.x, center.y, center.z, 0.25);
        n = count;
        break;
      }
      case 'orbitals': {
        // orbs circle in and slam one-two-three (staggered 140ms apart)
        if (lite) {
          const a = 0.6;
          host.boltPoints(
            at.x + Math.cos(a) * 1.8,
            at.y + 0.9,
            at.z + Math.sin(a) * 1.8,
            at.x,
            at.y,
            at.z,
            c,
            0.16,
            0.09,
            0.25,
          );
          host.burstAt(at.x, at.y, at.z, acc, 8, 1.1, 'sparks');
          n = 2;
          break;
        }
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.6;
          this.scheduleBeat(
            0.1 + k * 0.14,
            'orbital',
            id,
            at.x + Math.cos(a) * 1.8,
            at.y + 0.9,
            at.z + Math.sin(a) * 1.8,
            k % 2 === 0 ? c : acc,
            acc,
            0,
            0,
            'sparks',
            at.x,
            at.y,
            at.z,
          );
        }
        n = 0;
        break;
      }
      case 'fountain': {
        // arcing streams rain onto the point from a wide ring
        const streams = lite ? 2 : 6;
        for (let k = 0; k < streams; k++) {
          const a = (k / streams) * Math.PI * 2 + 0.4;
          const sx = at.x + Math.cos(a) * 2.4;
          const sz = at.z + Math.sin(a) * 2.4;
          host.pathRibbon(k % 2 === 0 ? c : acc, 0.09, 0.85, (pts) => {
            for (let i = 0; i < 10; i++) {
              const u = i / 9;
              pts[i].set(
                sx + (at.x - sx) * u,
                gy + 0.4 + Math.sin(u * Math.PI) * 2.2,
                sz + (at.z - sz) * u,
              );
            }
            return 10;
          });
        }
        n = streams;
        if (!lite) {
          host.burstAt(at.x, gy + 0.5, at.z, acc, 10, 0.9, 'embers');
          n++;
        }
        break;
      }
      case 'chains': {
        // taut binding chains snap up from the earth, sagging then tensing
        const links = lite ? 1 : 3;
        for (let k = 0; k < links; k++) {
          const a = (k / 3) * Math.PI * 2 + 1.1;
          const sx = at.x + Math.cos(a) * 2.2;
          const sz = at.z + Math.sin(a) * 2.2;
          const ty = at.y + 1.2 + k * 0.35;
          host.pathRibbon(k % 2 === 0 ? c : acc, 0.07, 1.0, (pts) => {
            for (let i = 0; i < 9; i++) {
              const u = i / 8;
              pts[i].set(
                sx + (at.x - sx) * u + (i % 2 === 1 ? (Math.random() - 0.5) * 0.1 : 0),
                gy + (ty - gy) * u + Math.sin(u * Math.PI) * -0.3,
                sz + (at.z - sz) * u + (i % 2 === 1 ? (Math.random() - 0.5) * 0.1 : 0),
              );
            }
            return 9;
          });
          if (!lite) host.burstAt(sx, gy + 0.2, sz, acc, 4, 0.6, 'sparks');
        }
        n = lite ? 1 : 6;
        break;
      }
      case 'swarm':
        // dark shapes burst out and FLEE: the slow smoke bloom plus a fast
        // scattering ember shell
        host.burstAt(at.x, at.y + 0.4, at.z, c, lite ? 8 : 16, 1.4, 'smoke');
        if (!lite) {
          host.burstAt(at.x, at.y + 0.5, at.z, acc, 12, 2.4, 'embers');
          n = 2;
        }
        break;
      case 'implosion':
        // space sucks inward before the hit (drawn per frame in transients)
        slot.implode = Math.max(slot.implode, lite ? 0.25 : IMPLODE_DUR);
        if (slot.tier === 0) host.shakeAt(at.x, at.y, at.z, 0.28);
        break;
      case 'barrier':
        // plates snap into a guarding arc around the shell flash
        host.shellFlash(slot.casterId, c, 1.2);
        if (!lite) slot.barrierT = BARRIER_DUR;
        break;
      case 'gavel':
        slot.gavel = true;
        slot.gavelT = 0;
        break;
      case 'claws':
        host.slashStyled(at, c, 'claws', 1.25);
        if (!lite) {
          host.burstAt(at.x, at.y, at.z, acc, 12, 1, 'sparks');
          n = 2;
        }
        break;
      case 'vines': {
        // living coils climb the target
        const coils = lite ? 1 : 5;
        for (let k = 0; k < coils; k++) {
          const a0 = (k / 5) * Math.PI * 2;
          host.pathRibbon(k % 2 === 0 ? c : acc, 0.09, 1.1 + k * 0.1, (pts) => {
            for (let i = 0; i < 12; i++) {
              const u = i / 11;
              const ang = a0 + u * 4.2;
              const rr2 = 0.75 - u * 0.35;
              pts[i].set(at.x + Math.cos(ang) * rr2, gy + u * 2.5, at.z + Math.sin(ang) * rr2);
            }
            return 12;
          });
        }
        n = coils;
        if (!lite) {
          host.burstAt(at.x, gy + 0.4, at.z, acc, 12, 1.2, 'embers');
          n++;
        }
        break;
      }
      case 'cross': {
        // the radiant cross-flash: a straight vertical stroke crossed by a
        // long flat horizontal, sealed with a hot center star
        const cy = at.y + 0.55;
        host.boltPoints(at.x, cy - 1.6, at.z, at.x, cy + 1.6, at.z, c, 0.35, 0.16, 0.06);
        if (!lite) {
          host.slashStyled({ x: at.x, y: cy, z: at.z }, c, 'thrust', 1.7);
          host.pushOverlay(at.x, cy, at.z, acc, 0.65, host.overlayCells().star, 0.9, 2.8);
          n = 3;
        }
        break;
      }
      default:
        n = 0;
        break;
    }
    if (n > 0) host.countPrimitive(slot.abilityId, n);
  }

  // ---- per-frame transient draws (release flash, gavel, cc stars, implode)

  private drawTransients(host: SequencerHost, slot: SeqSlot, dt: number): void {
    const cells = host.overlayCells();
    // release flash: 100ms hot star at the caster's chest (timed from the
    // release moment, which a synthetic windup shifts late)
    const sinceRelease = slot.t - slot.releaseAt;
    if (sinceRelease >= 0 && sinceRelease < 0.1) {
      const caster = host.anchorOf(slot.casterId, 0.58);
      if (caster) {
        const rp = sinceRelease / 0.1;
        const size = (0.6 + 1.1 * rp) * slot.power;
        host.pushOverlay(
          caster.x,
          caster.y,
          caster.z,
          slot.color,
          size,
          cells.star,
          (1 - rp) ** 1.2,
          3.2,
        );
      }
    }
    // implosion converge motes (gallery scale: a wide shell of space sucking
    // inward; tier 1 runs a smaller, sparser pull)
    if (slot.implode > 0) {
      slot.implode -= dt;
      const caster = host.anchorOf(slot.casterId, 0.55);
      if (caster) {
        const motes = slot.tier === 0 ? 8 : 4;
        const pull = Math.max(0, slot.implode / IMPLODE_DUR);
        for (let k = 0; k < motes; k++) {
          const a = host.timeNow() * 7 + k * 0.79;
          const rr2 = 0.35 + 2.1 * pull;
          host.pushOverlay(
            caster.x + Math.cos(a) * rr2,
            caster.y + Math.sin(a * 1.7 + k) * (0.3 + 0.5 * pull),
            caster.z + Math.sin(a) * rr2,
            slot.color,
            0.16 + 0.1 * (1 - pull),
            cells.spark,
            0.85,
            2.1,
          );
        }
      }
    }
    // barrier plates snapping into a guarding arc (staggered in, long fade)
    if (slot.barrierT > 0) {
      slot.barrierT -= dt;
      const center = host.anchorOf(slot.casterId, 0.55);
      if (center) {
        const elapsed = BARRIER_DUR - slot.barrierT;
        for (let k = 0; k < 5; k++) {
          const tt = elapsed - k * 0.05;
          if (tt < 0 || tt > BARRIER_PLATE_LIFE) continue;
          const u = tt / BARRIER_PLATE_LIFE;
          const alpha = u < 0.15 ? u / 0.15 : (1 - (u - 0.15) / 0.85) ** 1.4 * 0.75;
          const a = (k - 2) * 0.35 + host.timeNow() * 0.3;
          host.pushOverlay(
            center.x + Math.cos(a) * 1.15,
            center.y + 0.15 + Math.abs(k - 2) * 0.1,
            center.z + Math.sin(a) * 1.15,
            slot.color,
            0.5,
            cells.rune,
            alpha,
            2,
          );
        }
      }
    }
    // stunned-star band over the victim's head
    if (slot.ccStars > 0) {
      slot.ccStars -= dt;
      const head = host.anchorOf(slot.targetId, 1.0);
      if (head) {
        for (let k = 0; k < 4; k++) {
          const a = host.timeNow() * 2.4 + (k / 4) * Math.PI * 2;
          host.pushOverlay(
            head.x + Math.cos(a) * 0.45,
            head.y + 0.55,
            head.z + Math.sin(a) * 0.45,
            slot.accent,
            0.2,
            cells.star,
            Math.min(1, slot.ccStars),
            2.2,
          );
        }
      }
    }
    // gavel: a hammer of light descending onto the impact point over 0.22s,
    // accelerating into the verdict and LANDING (ring, sparks, light, trauma)
    if (slot.gavel) {
      slot.gavelT += dt;
      const u = Math.min(1, slot.gavelT / 0.22);
      const y = slot.iy + 6.4 - (6.4 - 1.15) * u * u;
      host.pushOverlay(slot.ix, y, slot.iz, slot.color, 1.05, cells.glow, 0.9, 2.4);
      host.pushOverlay(slot.ix, y + 0.55, slot.iz, slot.accent, 0.45, cells.rune, 0.9, 2.2);
      if (u >= 1) {
        slot.gavel = false;
        const gy = this.groundOf(host, slot);
        host.ringAt(slot.ix, gy, slot.iz, 4.2, 0.6, slot.color, 1.9, false);
        host.burstAt(slot.ix, slot.iy, slot.iz, slot.accent, 26, 1.2, 'sparks');
        host.pulseLight(slot.targetId, slot.spec.palette, 6, 0.3);
        if (slot.tier === 0) host.shakeAt(slot.ix, slot.iy, slot.iz, 0.35);
        host.countPrimitive(slot.abilityId, 3);
      }
    }
  }

  // ---- helpers ------------------------------------------------------------

  private impactAnchor(
    host: SequencerHost,
    slot: SeqSlot,
  ): { x: number; y: number; z: number } | null {
    // point-anchored casts (ground aims, targetId -1) are pinned to their
    // seeded world point
    if (slot.targetId < 0) return { x: slot.ix, y: slot.iy, z: slot.iz };
    const spec = slot.spec;
    const selfCentered =
      spec.self === true ||
      spec.archetype === 'nova' ||
      spec.archetype === 'shout' ||
      spec.archetype === 'buff' ||
      spec.archetype === 'heal' ||
      spec.archetype === 'summon';
    // a target that died mid-flight loses its anchor: land the stack at the
    // caster instead of fizzling the whole sequence
    return (
      host.anchorOf(selfCentered ? slot.casterId : slot.targetId, 0.4) ??
      host.anchorOf(slot.casterId, 0.4)
    );
  }

  private ringScale(slot: SeqSlot): number {
    const raw = slot.spec.impact?.ring;
    const rs = typeof raw === 'number' ? Math.min(2, raw) : 1;
    return rs * (0.7 + 0.3 * slot.power);
  }

  private groundOf(host: SequencerHost, slot: SeqSlot): number {
    return host.groundYAt(slot.ix, slot.iz) + 0.15;
  }
}
