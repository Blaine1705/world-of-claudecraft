import type { AbilityVfxFullSpec, AbilityVfxMotif } from '../ability_vfx_core';

// The archetype sequencer, ported from the gallery interpreters
// (arc_bolt_preview.js): each claimed cast becomes one pooled sequence slot
// that plays the gallery's phase anatomy on the primitive pools: release flash
// (~100ms hot), the impact stack "stacked inside 150ms" (ground ring, +50ms
// second ring, +120ms finisher ring, vRing, sparks/embers/debris/smoke/blood,
// light pulse, trail arc, decal), then lingers (dot drips, motifEvery loops).
// Instants run the same sequence compressed: impact fires 0.15s after release.
// Motifs are set-piece compositions on the same pools. Everything is
// slot-pooled and capped; budget tier 1 sheds motifs and lingers, tier 2 never
// reaches the sequencer.

const SEQ_SLOTS = 16;

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
  quality(): number;
  timeNow(): number;
  countPrimitive(abilityId: string, n: number): void;
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
  crack: 'rune',
  scorch: 'ember',
  rune: 'rune',
  portal: 'rune',
};

function decalStyleOf(spec: AbilityVfxFullSpec): string {
  if (spec.decal) return DECAL_BY_SPEC[spec.decal] ?? 'rune';
  const p = spec.palette;
  if (p === 'fire' || p === 'blood' || p === 'physical') return 'ember';
  if (p === 'frost' || p === 'moon') return 'rime';
  return 'rune';
}

export class ArchetypeSequencer {
  private slots: SeqSlot[] = [];

  constructor() {
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
      });
    }
  }

  // Begin a sequence at the RELEASE moment. awaitTravel: a live projectile is
  // in flight and triggerImpact() will land it; otherwise the impact fires at
  // the compressed instant timing (0.15s).
  start(
    host: SequencerHost,
    abilityId: string,
    spec: AbilityVfxFullSpec,
    casterId: number,
    targetId: number,
    colorHex: number,
    tier: number,
    awaitTravel: boolean,
  ): SeqSlot | null {
    if (tier >= 2) return null;
    const slot = this.slots.find((s) => !s.active) ?? null;
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
    slot.impactAt = awaitTravel ? Number.POSITIVE_INFINITY : 0.15;
    slot.impactDone = false;
    slot.ring2Done = true;
    slot.ring3Done = true;
    slot.swing2Done = true;
    slot.lingerUntil = 0;
    slot.dotTimer = 0;
    slot.motifTimer = spec.motifEvery ?? 0;
    slot.motifLoops = 0;
    slot.gavel = false;
    slot.ccStars = 0;
    slot.implode = 0;
    this.release(host, slot);
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
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.t += dt;
      const spec = slot.spec;
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
          const at = host.anchorOf(slot.targetId, 0.5);
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
        slot.implode <= 0;
      if (done || slot.t > 12) slot.active = false;
    }
  }

  clear(): void {
    for (const slot of this.slots) slot.active = false;
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
    // release-phase motifs (bladestorm whirl, implosion pull-in)
    if (spec.motifs && slot.tier === 0) {
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
    // per-archetype impact extras
    this.archetypeImpact(host, slot, gy);
    // impact-phase motifs
    if (spec.motifs && slot.tier === 0) this.runMotifs(host, slot);
    // lingers
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

  private runOneMotif(host: SequencerHost, slot: SeqSlot, motif: AbilityVfxMotif): void {
    const spec = slot.spec;
    const atCaster = spec.motifAt === 'caster' || spec.self === true;
    const anchorId =
      spec.motifAt === 'target' ? slot.targetId : atCaster ? slot.casterId : slot.targetId;
    const at = host.anchorOf(anchorId, 0.4) ?? { x: slot.ix, y: slot.iy, z: slot.iz };
    const gy = host.groundYAt(at.x, at.z);
    const c = slot.color;
    const acc = slot.accent;
    const r = spec.motifR ?? 1.1;
    let n = 1;
    switch (motif) {
      case 'fissure': {
        const from = host.anchorOf(slot.casterId, 0.05);
        if (from) {
          const fgy = host.groundYAt(from.x, from.z);
          host.boltPoints(from.x, fgy + 0.12, from.z, at.x, gy + 0.12, at.z, c, 0.7, 0.16, 0.5);
          for (let k = 0; k < 4; k++) {
            const u = (k + 1) / 5;
            host.burstAt(
              from.x + (at.x - from.x) * u,
              fgy + 0.15,
              from.z + (at.z - from.z) * u,
              c,
              5,
              0.7,
              'debris',
            );
          }
          n = 5;
        }
        break;
      }
      case 'pillars': {
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          host.pillarAt(at.x + Math.cos(a) * 1.9, gy, at.z + Math.sin(a) * 1.9, 0.35, 2.6, c, 0.45);
        }
        n = 5;
        break;
      }
      case 'crescents':
        host.slashStyled({ x: at.x, y: at.y + 0.4, z: at.z }, c, 'crescent', 1.1);
        host.slashStyled({ x: at.x, y: at.y + 0.6, z: at.z }, acc, 'crescent', 0.9);
        n = 2;
        break;
      case 'bladestorm': {
        const center = host.anchorOf(slot.casterId, 0.5) ?? at;
        for (let k = 0; k < 3; k++) {
          const a = host.timeNow() * 9 + (k / 3) * Math.PI * 2;
          host.slashStyled(
            { x: center.x + Math.cos(a) * r, y: center.y, z: center.z + Math.sin(a) * r },
            k % 2 === 0 ? c : acc,
            'horizontal',
            0.8 * Math.sqrt(r / 1.1),
          );
        }
        n = 3;
        break;
      }
      case 'orbitals': {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.6;
          const sx = at.x + Math.cos(a) * 1.8;
          const sz = at.z + Math.sin(a) * 1.8;
          host.boltPoints(
            sx,
            at.y + 1.6,
            sz,
            at.x,
            at.y,
            at.z,
            k % 2 === 0 ? c : acc,
            0.25,
            0.09,
            0.2,
          );
        }
        host.burstAt(at.x, at.y, at.z, acc, 8, 0.8, 'sparks');
        n = 4;
        break;
      }
      case 'fountain': {
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          const sx = at.x + Math.cos(a) * 2.4;
          const sz = at.z + Math.sin(a) * 2.4;
          host.pathRibbon(k % 2 === 0 ? c : acc, 0.09, 0.7, (pts) => {
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
        n = 4;
        break;
      }
      case 'chains': {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 1.1;
          const sx = at.x + Math.cos(a) * 2.2;
          const sz = at.z + Math.sin(a) * 2.2;
          const ty = at.y + 1.2 + k * 0.25;
          host.pathRibbon(k % 2 === 0 ? c : acc, 0.07, 0.9, (pts) => {
            for (let i = 0; i < 9; i++) {
              const u = i / 8;
              pts[i].set(
                sx + (at.x - sx) * u,
                gy + (ty - gy) * u + Math.sin(u * Math.PI) * -0.35,
                sz + (at.z - sz) * u,
              );
            }
            return 9;
          });
        }
        n = 3;
        break;
      }
      case 'swarm':
        host.burstAt(at.x, at.y + 0.4, at.z, c, 14, 1.4, 'smoke');
        break;
      case 'implosion':
        slot.implode = Math.max(slot.implode, 0.28);
        break;
      case 'barrier':
        host.shellFlash(slot.casterId, c, 1.1);
        break;
      case 'gavel':
        slot.gavel = true;
        slot.gavelT = 0;
        break;
      case 'claws':
        host.slashStyled(at, c, 'claws', 1);
        host.burstAt(at.x, at.y, at.z, acc, 10, 0.8, 'sparks');
        n = 2;
        break;
      case 'vines': {
        for (let k = 0; k < 4; k++) {
          const a0 = (k / 4) * Math.PI * 2;
          host.pathRibbon(k % 2 === 0 ? c : acc, 0.09, 1.2, (pts) => {
            for (let i = 0; i < 12; i++) {
              const u = i / 11;
              const ang = a0 + u * 4.2;
              const rr2 = 0.75 - u * 0.35;
              pts[i].set(at.x + Math.cos(ang) * rr2, gy + u * 2.5, at.z + Math.sin(ang) * rr2);
            }
            return 12;
          });
        }
        host.burstAt(at.x, gy + 0.4, at.z, acc, 10, 0.8, 'embers');
        n = 5;
        break;
      }
      case 'cross':
        host.slashStyled({ x: at.x, y: at.y + 0.5, z: at.z }, c, 'x', 1.4);
        n = 2;
        break;
      default:
        n = 0;
        break;
    }
    if (n > 0) host.countPrimitive(slot.abilityId, n);
  }

  // ---- per-frame transient draws (release flash, gavel, cc stars, implode)

  private drawTransients(host: SequencerHost, slot: SeqSlot, dt: number): void {
    const cells = host.overlayCells();
    // release flash: 100ms hot star at the caster's chest
    if (slot.t < 0.1) {
      const caster = host.anchorOf(slot.casterId, 0.58);
      if (caster) {
        const rp = slot.t / 0.1;
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
    // implosion converge motes
    if (slot.implode > 0) {
      slot.implode -= dt;
      const caster = host.anchorOf(slot.casterId, 0.55);
      if (caster) {
        for (let k = 0; k < 5; k++) {
          const a = host.timeNow() * 7 + k * 1.26;
          const rr2 = 0.4 + 1.8 * (slot.implode / 0.28);
          host.pushOverlay(
            caster.x + Math.cos(a) * rr2,
            caster.y + Math.sin(a * 1.7) * 0.5,
            caster.z + Math.sin(a) * rr2,
            slot.color,
            0.18,
            cells.spark,
            0.8,
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
    // gavel: a hammer of light descending onto the impact point over 0.22s
    if (slot.gavel) {
      slot.gavelT += dt;
      const u = Math.min(1, slot.gavelT / 0.22);
      const y = slot.iy + 6.4 - (6.4 - 1.15) * u * u;
      host.pushOverlay(slot.ix, y, slot.iz, slot.color, 0.85, cells.glow, 0.9, 2.4);
      host.pushOverlay(slot.ix, y + 0.5, slot.iz, slot.accent, 0.4, cells.rune, 0.9, 2.2);
      if (u >= 1) {
        slot.gavel = false;
        const gy = this.groundOf(host, slot);
        host.ringAt(slot.ix, gy, slot.iz, 4.2, 0.6, slot.color, 1.9, false);
        host.burstAt(slot.ix, slot.iy, slot.iz, slot.accent, 22, 1.2, 'sparks');
        host.pulseLight(slot.targetId, slot.spec.palette, 6, 0.3);
        host.countPrimitive(slot.abilityId, 3);
      }
    }
  }

  // ---- helpers ------------------------------------------------------------

  private impactAnchor(
    host: SequencerHost,
    slot: SeqSlot,
  ): { x: number; y: number; z: number } | null {
    const spec = slot.spec;
    const selfCentered =
      spec.self === true ||
      spec.archetype === 'nova' ||
      spec.archetype === 'shout' ||
      spec.archetype === 'buff' ||
      spec.archetype === 'heal' ||
      spec.archetype === 'summon';
    return host.anchorOf(selfCentered ? slot.casterId : slot.targetId, 0.4);
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
