// Thin painter for the per-ability spell VFX system: resolves an event's
// ability id against the authored spec table (ability_vfx_specs.ts), asks the
// pure core (ability_vfx_core.ts) for a plan, and drives the pooled Vfx
// particle primitives plus the gallery-ported primitive engine (fx.ts: ribbon
// trails, shock rings, ground decals, windup orbs, buff orbits) with the
// spec's color, scale, and archetype. Unknown ability or fx kind: it declines
// and the renderer's generic school-colored arm runs unchanged.

import {
  AbilityVfxBudget,
  type AbilityVfxFullSpec,
  type AbilityVfxPlan,
  type AbilityVfxSpec,
  abilityHexColor,
  abilityVfxColor,
  localCasterTier,
  planCast,
  planImpact,
} from '../ability_vfx_core';
import { ABILITY_VFX_FULL_SPECS } from '../ability_vfx_full_specs';
import { ABILITY_VFX_SPECS } from '../ability_vfx_specs';
import { attackAbilityId } from '../characters/weapon_attack_style_core';
import type { AbilityVfxFx, OrbitStyle, ParticleBurstKind } from './fx';

interface VfxPoint {
  x: number;
  y: number;
  z: number;
}

// The few Vfx methods this painter drives (structurally satisfied by Vfx).
export interface AbilityVfxPrimitives {
  projectile(
    sourceId: number,
    targetId: number,
    school: string,
    scale?: number,
    color?: number,
  ): void;
  lightningProjectile(sourceId: number, targetId: number, color?: number): void;
  burst(at: VfxPoint, school: string, count?: number, power?: number, color?: number): void;
  nova(centerId: number, school: string, color?: number): void;
  tick(targetId: number, school: string, color?: number): void;
  shoutwave(centerId: number, colorHex: number): void;
  buffSwirl(targetId: number, color?: number): void;
  beam(sourceId: number, targetId: number, school: string, colorOverride?: number): void;
}

// Dev probe counters (scripts/ability_vfx_probe.mjs): how often each ability's
// events were claimed and how many primitives that spawned. Always-on because
// the cost is two integer bumps per CAST, but only exposed on the dev-only
// window.__game surface.
export interface AbilityVfxStat {
  claimed: number;
  primitives: number;
}

export interface AbilityVfxDeps {
  vfx: AbilityVfxPrimitives;
  // The gallery-ported primitive engine (rings, ribbons, decals, overlays).
  fx: AbilityVfxFx;
  // The renderer's entity anchor (same closure Vfx homes on): world position at
  // a height fraction, or null when the entity has no view yet.
  anchor: (id: number, heightFrac: number) => VfxPoint | null;
  spawnAoeRing: (x: number, z: number, radius: number, school: string, colorHex?: number) => void;
  triggerAttack: (entityId: number, abilityId?: string) => void;
  // The renderer's pooled talent-moment point light (pulseAt); optional so
  // tests can omit it.
  lightPulse?: (entityId: number, school: string, intensity: number, duration: number) => void;
  // Writes the rig body glow (CharacterVisual.setAuraGlow); optional for tests.
  setAuraGlow?: (entityId: number, colorHex: number, intensity: number) => void;
  // Plays the caster's roar/cheer one-shot for shout casts; optional for tests.
  playShoutAnim?: (entityId: number) => void;
  // Entity lookups mirroring the renderer's generic-arm checks (all optional
  // for tests): mob-kind, live cast state, and whether the rig is already
  // playing a one-shot — the painter replicates the mob-throw fallback the
  // generic arm applies when it does NOT claim.
  isMob?: (entityId: number) => boolean;
  castingAbilityOf?: (entityId: number) => string | null;
  isMidOneShot?: (entityId: number) => boolean;
  // The local player's entity id (cast-acknowledgment gestures).
  localPlayerId?: () => number;
  // True when the ability resolves with no cast bar (no cast time, channel, or
  // empower hold). Only these get the synthetic pre-release windup phase: a
  // real cast already performed its ceremony through the live castingAbility
  // path in syncEntity. Unknown ids should return true.
  isInstantAbility?: (abilityId: string) => boolean;
}

// Structural slices of the SimEvent members this painter consumes.
export interface AbilityVfxSpellfxEvent {
  sourceId: number;
  targetId: number;
  school: string;
  fx: string;
  ability?: string;
  attackAnimation?: 'ranged-shot';
}

// Structural slice of the point-anchored SimEvent member ('spellfxAt').
export interface AbilityVfxSpellfxAtEvent {
  x: number;
  z: number;
  school: string;
  fx: string;
  ability?: string;
  radius?: number;
  sourceId?: number;
}

export interface AbilityVfxDamageEvent {
  sourceId: number;
  targetId: number;
  school: string;
  ability: string | null;
  kind: string;
  crit: boolean;
  amount: number;
}

export interface AbilityVfxAuraEvent {
  targetId: number;
  gained: boolean;
  ability?: string;
}

// The per-frame entity slice syncEntity consumes (Entity satisfies it).
export interface AbilityVfxEntityState {
  id: number;
  castingAbility: string | null;
  castRemaining: number;
  castTotal: number;
  auras: readonly { id: string }[];
}

// The cast-moment fx kinds this painter claims; everything else stays generic.
const CAST_FX = new Set([
  'projectile',
  'heavyBolt',
  'lightning',
  'windup',
  'shout',
  'nova',
  'tick',
  'beam',
]);
// spawnAoeRing radius in yards per spec ringScale unit (rg 2 = the classic
// 8 yd warrior shout ring).
const RING_RADIUS_PER_SCALE = 4;

// Palette to school mapping for the pooled point-light flashes (the renderer's
// pulseAt is school-colored).
const SCHOOL_BY_PALETTE: Record<string, string> = {
  fire: 'fire',
  blood: 'fire',
  frost: 'frost',
  storm: 'frost',
  arcane: 'arcane',
  moon: 'arcane',
  shadow: 'shadow',
  venom: 'nature',
  nature: 'nature',
  gold: 'holy',
  holy: 'holy',
  physical: 'physical',
};

// The gallery rim rule: spec.rim outlines the body when authored, else the
// ability's main color carries the glow.
function rimColorOf(full: AbilityVfxFullSpec | undefined, spec: AbilityVfxSpec): number {
  if (full?.rim) return abilityHexColor(full.rim);
  return abilityVfxColor(spec);
}

// Particle sprite family per burst kind, mapped onto Vfx.burst's school hint.
const BURST_SCHOOL_BY_KIND: Record<ParticleBurstKind, string> = {
  sparks: 'arcane',
  embers: 'fire',
  debris: 'physical',
  smoke: 'shadow',
  blood: 'physical',
};

// One FULL point-anchored sequence per (caster, ability) inside this window:
// recurring emits of the same aimed nova (Frozen Orb's flight pulses, a
// re-triggered trap) degrade to the cheap zone re-hit instead of replaying
// the whole release + impact anatomy every second.
const POINT_SEQ_REFRACTORY_SEC = 3;

// One cast-budget charge per (caster, ability) inside this window: a cast
// event plus its own point-anchored landing (or a strike's contact hit) are
// ONE cast to the spam guard, never two. Matches the budget's rolling second.
const CAST_CHARGE_WINDOW_SEC = 1;

// Zone-pulse debris family per spec palette (the per-pulse re-hit accent).
const PULSE_BURST_BY_PALETTE: Record<string, ParticleBurstKind> = {
  fire: 'embers',
  blood: 'blood',
  physical: 'debris',
  shadow: 'smoke',
  venom: 'smoke',
};

// Spec bo (buff orbit) styles collapsed onto the three sprite bands the fx
// engine draws (halo crowns the head, sparks orbit shoulders, runes circle
// the feet).
const ORBIT_BY_BO: Record<string, OrbitStyle> = {
  halo: 'halo',
  wings: 'halo',
  heartbeat: 'halo',
  sparks: 'sparks',
  weaponGlow: 'sparks',
  speedlines: 'sparks',
  runes: 'runes',
  plates: 'runes',
  leaves: 'runes',
};

export class AbilityVfx {
  private quality = 1;
  private budget = new AbilityVfxBudget();
  private now: () => number;
  private stats = new Map<string, AbilityVfxStat>();
  // last full point-sequence time per `${casterId}:${abilityId}` (see
  // POINT_SEQ_REFRACTORY_SEC); stale entries pruned in place once it grows
  private pointSeqAt = new Map<string, number>();
  // last cast-budget charge per `${casterId}:${abilityId}` (see
  // CAST_CHARGE_WINDOW_SEC); stale entries pruned in place once it grows
  private castChargeAt = new Map<string, number>();
  private spawned = 0; // primitives spawned by the CURRENT event (probe counter)

  constructor(
    private deps: AbilityVfxDeps,
    now?: () => number,
  ) {
    this.now = now ?? (() => performance.now() / 1000);
    // Particle bursts ride the pooled Vfx cloud; sequencer light pulses ride
    // the renderer's pooled point lights; sequencer spawns feed the probe stats.
    deps.fx.setDelegates(
      (x, y, z, colorHex, count, power, kind) =>
        deps.vfx.burst(
          { x, y, z },
          BURST_SCHOOL_BY_KIND[kind],
          count,
          power,
          kind === 'blood' ? 0xa01222 : colorHex,
        ),
      (entityId, palette, intensity, duration) =>
        deps.lightPulse?.(entityId, SCHOOL_BY_PALETTE[palette] ?? 'arcane', intensity, duration),
      (abilityId, n) => {
        this.spawned = n;
        this.recordStat(abilityId, false);
      },
      (entityId, colorHex, intensity) => deps.setAuraGlow?.(entityId, colorHex, intensity),
    );
  }

  setQuality(q: number): void {
    this.quality = Math.min(1, Math.max(0, Number.isFinite(q) ? q : 1));
    this.deps.fx.setQuality(this.quality);
  }

  // Dev probe surface: per-ability claim/primitive counters (copied out).
  statsSnapshot(): Record<string, AbilityVfxStat> {
    const out: Record<string, AbilityVfxStat> = {};
    for (const [id, s] of this.stats) out[id] = { claimed: s.claimed, primitives: s.primitives };
    return out;
  }

  // Degrade tier for a cast-claiming event: charges the cast budget once per
  // (caster, ability) window — a cast plus its own follow-through (aimed
  // landing, a strike's contact hit) never double-charges — and biases the
  // local player one tier up (their own rotation degrades last).
  private castTier(casterId: number, abilityId: string): 0 | 1 | 2 {
    const nowSec = this.now();
    const key = `${casterId}:${abilityId}`;
    const last = this.castChargeAt.get(key);
    let tier: 0 | 1 | 2;
    if (last !== undefined && nowSec - last < CAST_CHARGE_WINDOW_SEC) {
      tier = this.budget.peek(casterId, nowSec);
    } else {
      if (this.castChargeAt.size > 64) {
        for (const [k, at] of this.castChargeAt) {
          if (nowSec - at >= CAST_CHARGE_WINDOW_SEC) this.castChargeAt.delete(k);
        }
      }
      this.castChargeAt.set(key, nowSec);
      tier = this.budget.admit(casterId, nowSec);
    }
    return this.biasFor(casterId, tier);
  }

  private biasFor(casterId: number, tier: 0 | 1 | 2): 0 | 1 | 2 {
    return this.deps.localPlayerId?.() === casterId ? localCasterTier(tier) : tier;
  }

  private recordStat(abilityId: string, claimed: boolean): void {
    let s = this.stats.get(abilityId);
    if (!s) {
      s = { claimed: 0, primitives: 0 };
      this.stats.set(abilityId, s);
    }
    if (claimed) s.claimed++;
    s.primitives += this.spawned;
    this.spawned = 0;
  }

  // Returns true when this painter fully handled the event (the renderer skips
  // its generic school-colored arm), false to fall through unchanged.
  handleSpellfx(ev: AbilityVfxSpellfxEvent): boolean {
    if (!ev.ability || !CAST_FX.has(ev.fx)) return false;
    const spec = ABILITY_VFX_SPECS[ev.ability];
    if (!spec) return false;
    const tier = this.castTier(ev.sourceId, ev.ability);
    const plan = planCast(spec, this.quality, tier);
    const fx = this.deps.fx;
    const full = ABILITY_VFX_FULL_SPECS[ev.ability];
    this.spawned = 0;
    // Spin specs whirl the rig (Bladestorm); the one-shot is cheap, so it
    // survives every degrade tier.
    if (plan.whirl) this.deps.triggerAttack(ev.sourceId, ev.ability);
    switch (ev.fx) {
      case 'projectile':
      case 'heavyBolt': {
        // A player ranged shot's draw animation rides the projectile launch
        // cue; keep it when this painter claims the event.
        if (ev.attackAnimation === 'ranged-shot' && !plan.whirl)
          this.deps.triggerAttack(ev.sourceId);
        const scale = ev.fx === 'heavyBolt' ? Math.max(plan.projScale, 2) : plan.projScale;
        if (plan.jagged) {
          this.deps.vfx.lightningProjectile(ev.sourceId, ev.targetId, plan.color);
          this.spawned++;
          if (tier < 2) {
            fx.jaggedBolt(ev.sourceId, ev.targetId, plan.color);
            this.spawned++;
            // the crack lands instantly: run the archetype sequence compressed
            if (full)
              fx.sequenceInstant(ev.ability, full, ev.sourceId, ev.targetId, plan.color, tier);
          }
        } else {
          for (let i = 0; i < plan.volley; i++) {
            this.deps.vfx.projectile(ev.sourceId, ev.targetId, ev.school, scale, plan.color);
            this.spawned++;
          }
          // The gallery bolt read: release flash + a flowing comet trail
          // chasing the head, and the FULL impact stack where it arrives.
          if (tier < 2) {
            if (full) {
              fx.sequenceBolt(
                ev.ability,
                full,
                ev.sourceId,
                ev.targetId,
                plan.color,
                0.16 * scale,
                tier,
              );
            } else {
              fx.cometTrail(ev.sourceId, ev.targetId, plan.color, 0.16 * scale, tier === 0);
            }
            this.spawned++;
          }
        }
        if (!plan.whirl && ev.attackAnimation !== 'ranged-shot') this.mobThrowFallback(ev.sourceId);
        break;
      }
      case 'lightning':
        this.deps.vfx.lightningProjectile(ev.sourceId, ev.targetId, plan.color);
        this.spawned++;
        if (tier < 2) {
          fx.jaggedBolt(ev.sourceId, ev.targetId, plan.color);
          this.spawned++;
          if (full)
            fx.sequenceInstant(ev.ability, full, ev.sourceId, ev.targetId, plan.color, tier);
        }
        if (!plan.whirl) this.mobThrowFallback(ev.sourceId);
        break;
      case 'beam':
        // Channel rays (drains, mind flay): the school beam recolored plus a
        // wavering ribbon so the cord reads as flowing energy, not dots.
        this.deps.vfx.beam(ev.sourceId, ev.targetId, ev.school, plan.color);
        this.spawned++;
        if (tier < 2) {
          fx.beamRibbon(ev.sourceId, ev.targetId, plan.color);
          this.spawned++;
        }
        if (!plan.whirl) this.mobThrowFallback(ev.sourceId);
        break;
      case 'windup':
        // The generic windup arm's whole job is the throw animation: keep it.
        if (!plan.whirl) this.deps.triggerAttack(ev.sourceId, ev.ability);
        this.spawned++;
        break;
      case 'shout': {
        // The roar starts now even when the sequence stages a short windup:
        // the caster bellowing THROUGH the ceremony is the natural read.
        this.deps.vfx.shoutwave(ev.sourceId, plan.color);
        this.spawned++;
        this.spawnRing(ev.sourceId, plan, ev.school);
        this.deps.playShoutAnim?.(ev.sourceId);
        if (tier < 2 && full)
          fx.sequenceInstant(
            ev.ability,
            full,
            ev.sourceId,
            ev.targetId,
            plan.color,
            tier,
            this.windupDelayFor(ev.ability, full, ev.sourceId),
          );
        break;
      }
      case 'nova': {
        if (tier < 2 && full) {
          const delay = this.windupDelayFor(ev.ability, full, ev.sourceId);
          // a staged release carries the boom itself: firing the pooled nova
          // now would double the read half a windup early
          if (delay <= 0) {
            this.deps.vfx.nova(ev.targetId, ev.school, plan.color);
            this.spawned++;
          }
          fx.sequenceInstant(ev.ability, full, ev.sourceId, ev.targetId, plan.color, tier, delay);
        } else {
          this.deps.vfx.nova(ev.targetId, ev.school, plan.color);
          this.spawned++;
        }
        this.spawnRing(ev.targetId, plan, ev.school);
        break;
      }
      case 'tick':
        // Instants run their FULL archetype sequence, compressed (0.15s
        // release to impact) after any authored windup phase, never just the
        // small tick accent.
        this.deps.vfx.tick(ev.targetId, ev.school, plan.color);
        this.spawned++;
        if (tier < 2 && full)
          fx.sequenceInstant(
            ev.ability,
            full,
            ev.sourceId,
            ev.targetId,
            plan.color,
            tier,
            this.windupDelayFor(ev.ability, full, ev.sourceId),
          );
        break;
    }
    // Local-player cast acknowledgment: a claimed physical instant plays the
    // ability's one-shot so the button press reads on the rig (spell instants
    // get their read from the windup ceremony; no new clips are invented).
    if (
      ev.fx !== 'windup' &&
      !plan.whirl &&
      ev.attackAnimation !== 'ranged-shot' &&
      this.deps.localPlayerId?.() === ev.sourceId
    ) {
      const arch = full?.archetype ?? spec.a;
      if (arch === 'strike' || arch === 'dash') this.deps.triggerAttack(ev.sourceId, ev.ability);
    }
    this.recordStat(ev.ability, true);
    return true;
  }

  // Point-anchored claims: an aimed ground cast's landing ('nova'/'burst' at
  // the aim point) runs the full archetype sequence anchored at the WORLD
  // POINT — windup ceremony and release flash on the caster, motifs, decal,
  // and linger at the point — and a zone pulse ('tick') draws a cheap
  // per-pulse re-hit, never a full sequence. The four bespoke lifetime kinds
  // (meteorFall/snowZone/runeCircle/orb) are deliberately never claimed:
  // their legacy visuals animate duration-long state (a ball timed to its
  // landing, snowfall over the zone's whole life, a persistent inscription,
  // the roaming orb) that a one-shot sequence would read worse than.
  handleSpellfxAt(ev: AbilityVfxSpellfxAtEvent): boolean {
    if (!ev.ability) return false;
    if (ev.fx !== 'nova' && ev.fx !== 'burst' && ev.fx !== 'tick') return false;
    const spec = ABILITY_VFX_SPECS[ev.ability];
    if (!spec) return false;
    const casterId = ev.sourceId ?? -1;
    const fx = this.deps.fx;
    const gy = fx.groundYAt(ev.x, ev.z);
    const nowSec = this.now();
    this.spawned = 0;
    if (ev.fx === 'tick') {
      // Zone-pulse re-hits ride the accent window, never the cast budget: a
      // 6s earthquake must not starve its caster's next cast.
      if (this.budget.admitAccent(nowSec)) {
        const tier = this.biasFor(casterId, this.budget.peek(casterId, nowSec));
        this.zoneRehit(ev.x, gy, ev.z, ev.radius, spec, planCast(spec, this.quality, tier), tier);
      }
      this.recordStat(ev.ability, true);
      return true;
    }
    const full = ABILITY_VFX_FULL_SPECS[ev.ability];
    // recurring emits of the same aimed nova replay only the cheap re-hit
    const seqKey = `${casterId}:${ev.ability}`;
    const lastSeq = this.pointSeqAt.get(seqKey);
    const repeat = lastSeq !== undefined && nowSec - lastSeq < POINT_SEQ_REFRACTORY_SEC;
    if (this.pointSeqAt.size > 64) {
      for (const [key, at] of this.pointSeqAt) {
        if (nowSec - at >= POINT_SEQ_REFRACTORY_SEC) this.pointSeqAt.delete(key);
      }
    }
    this.pointSeqAt.set(seqKey, nowSec);
    // a fresh landing is the cast (charged once, deduped against its own cast
    // event); repeats are follow-through on the accent window
    const tier = repeat
      ? this.biasFor(casterId, this.budget.peek(casterId, nowSec))
      : this.castTier(casterId, ev.ability);
    const plan = planCast(spec, this.quality, tier);
    // the terrain-draped area ring is an actionable telegraph: always instant
    if (ev.radius) {
      this.deps.spawnAoeRing(ev.x, ev.z, ev.radius, ev.school, plan.color);
      this.spawned++;
    }
    if (repeat) {
      if (this.budget.admitAccent(nowSec)) {
        this.zoneRehit(ev.x, gy, ev.z, ev.radius, spec, plan, tier);
      }
    } else if (tier < 2 && full) {
      fx.sequenceInstantAt(
        ev.ability,
        full,
        casterId,
        ev.x,
        ev.z,
        plan.color,
        tier,
        this.windupDelayFor(ev.ability, full, casterId),
      );
      // ground slams from the local player still read on the rig
      if (this.deps.localPlayerId?.() === casterId) {
        const arch = full.archetype;
        if (arch === 'strike' || arch === 'dash') this.deps.triggerAttack(casterId, ev.ability);
      }
    } else {
      // minimal fallback read: the spec-colored burst at the landing point
      this.deps.vfx.burst(
        { x: ev.x, y: gy + 0.4, z: ev.z },
        ev.school,
        plan.burstCount,
        plan.burstPower,
        plan.color,
      );
      this.spawned++;
    }
    this.recordStat(ev.ability, true);
    return true;
  }

  // The cheap per-pulse zone re-hit (ground-zone ticks, repeated aimed novas):
  // a small expanding ring, a pinch of palette debris, and at full tier a
  // vertical accent halo — never a full sequence. Tier 2 draws nothing.
  private zoneRehit(
    x: number,
    gy: number,
    z: number,
    radius: number | undefined,
    spec: AbilityVfxSpec,
    plan: AbilityVfxPlan,
    tier: number,
  ): void {
    if (tier >= 2) return;
    const fx = this.deps.fx;
    const r = Math.min(6, Math.max(1.6, (radius ?? 4) * 0.85));
    fx.ringAt(x, gy + 0.15, z, r, 0.5, plan.color, 1.1, false);
    fx.burstAt(
      x,
      gy + 0.3,
      z,
      plan.swirlColor,
      tier === 0 ? 8 : 5,
      0.8,
      PULSE_BURST_BY_PALETTE[spec.p ?? ''] ?? 'sparks',
    );
    this.spawned += 2;
    if (tier === 0) {
      fx.ringAt(x, gy + 0.9, z, Math.min(2.4, r * 0.5), 0.4, plan.swirlColor, 1.2, true);
      this.spawned++;
    }
  }

  // A landed ability hit gets one reduced-count accent burst in the spec color
  // plus its archetype read: strikes slash a ribbon arc across the victim and
  // crits pop a vertical halo. Damage events carry player-facing ability
  // NAMES; normalize back to the stable id first. Accents ride the flat accent
  // window and only peek the cast tier — a rotation's own landed hits (and
  // plain autos) never consume its cast slots. The one exception: a physical
  // special whose ONLY event is its hit — that contact IS its cast, so it
  // charges the cast budget (deduped) and runs the full sequence.
  onDamage(ev: AbilityVfxDamageEvent): void {
    if (ev.kind !== 'hit' || ev.amount <= 0) return;
    const nowSec = this.now();
    if (!ev.ability) {
      // Auto-attack polish: a subtle steel slash ribbon on plain melee swings
      // (the meleeSpark already popped). Accent-gated so crowds stay calm.
      if (
        ev.school === 'physical' &&
        this.biasFor(ev.sourceId, this.budget.peek(ev.sourceId, nowSec)) === 0 &&
        this.budget.admitAccent(nowSec)
      ) {
        this.deps.fx.slashArc(ev.targetId, 0xffd9a8, 0.85, 0.16);
      }
      return;
    }
    const abilityId = attackAbilityId(ev.ability);
    const spec = abilityId ? ABILITY_VFX_SPECS[abilityId] : undefined;
    if (!spec || !abilityId) return;
    const full = ABILITY_VFX_FULL_SPECS[abilityId];
    const arch = full?.archetype ?? spec.a ?? 'strike';
    const isCastMoment = !!full && (arch === 'strike' || arch === 'dash' || arch === 'buff');
    let tier: 0 | 1 | 2;
    if (isCastMoment) {
      tier = this.castTier(ev.sourceId, abilityId);
    } else {
      tier = this.biasFor(ev.sourceId, this.budget.peek(ev.sourceId, nowSec));
      if (tier >= 1) return; // degraded accents vanish first; casts keep priority
      if (!this.budget.admitAccent(nowSec)) return;
    }
    const plan = planImpact(spec, ev.crit, this.quality, tier);
    const at = this.deps.anchor(ev.targetId, 0.55);
    if (!at) return;
    this.spawned = 0;
    this.deps.vfx.burst(at, ev.school, plan.burstCount, plan.burstPower, plan.color);
    this.spawned++;
    if (isCastMoment && full && tier < 2) {
      // The contact moment runs the full archetype sequence (authored slash
      // arc, impact stack, motifs). Buff-archetype self-hits (Blood Toll's
      // health price) run the buff sequence too: shell pop plus the red
      // body-glow pulse.
      this.deps.fx.sequenceInstant(abilityId, full, ev.sourceId, ev.targetId, plan.color, tier);
    } else if (!isCastMoment && (ev.crit || spec.fin === 1)) {
      this.deps.fx.impactRing(ev.targetId, plan.color, ev.crit);
      this.spawned++;
    }
    this.recordStat(abilityId, false);
  }

  // Spec-colored buff swirl for an aura gain. Only an exact ability id (from
  // the event when it carries one, else the caller's guess) is trusted; aura
  // display names are never fuzzy-matched. The persistent orbit band comes
  // from syncEntity's aura scan, not from this one-shot.
  onAuraGained(ev: AbilityVfxAuraEvent, abilityIdGuess?: string): void {
    if (!ev.gained) return;
    const abilityId = ev.ability ?? abilityIdGuess;
    if (!abilityId) return;
    const spec = ABILITY_VFX_SPECS[abilityId];
    if (!spec) return;
    this.deps.vfx.buffSwirl(ev.targetId, planCast(spec, this.quality, 0).swirlColor);
  }

  // Spec color for the per-frame cast sparkle of a casting ability, or
  // undefined to keep the generic school color. Cached parse, zero allocation:
  // safe to call every frame from the renderer's entity sync.
  sparkleColorFor(abilityId: string | null | undefined): number | undefined {
    const spec = abilityId ? ABILITY_VFX_SPECS[abilityId] : undefined;
    return spec ? abilityVfxColor(spec) : undefined;
  }

  // Per-frame entity feed from the renderer's view sync: keeps the windup orb
  // alive while a spec'd ability is casting (scaled by cast progress) and the
  // buff-orbit bands alive while their aura ids persist. The fx engine sweeps
  // anything not refreshed this frame, so there is no teardown bookkeeping.
  // Allocation-free per call.
  syncEntity(e: AbilityVfxEntityState): void {
    const fx = this.deps.fx;
    // Body glow (the gallery rim read): the strongest live source wins between
    // an in-flight cast and any spec'd buff auras (rim or buff block).
    let glowColor = 0;
    let glowStrength = 0;
    let glowSlow = false;
    if (e.castingAbility) {
      const spec = ABILITY_VFX_SPECS[e.castingAbility];
      if (spec) {
        const progress =
          e.castTotal > 0 ? Math.min(1, Math.max(0, 1 - e.castRemaining / e.castTotal)) : 0;
        const full = ABILITY_VFX_FULL_SPECS[e.castingAbility];
        const style = full?.windupStyle ?? 'orb';
        glowColor = rimColorOf(full, spec);
        glowStrength = 1.2 * (full?.power ?? 1);
        if (fx.windup(e.id, abilityVfxColor(spec), progress, style)) {
          this.spawned = 1;
          this.recordStat(e.castingAbility, false);
        }
      }
    }
    let bands = 0;
    for (let i = 0; i < e.auras.length && bands < 3; i++) {
      const auraId = e.auras[i].id;
      const spec = ABILITY_VFX_SPECS[auraId];
      if (spec === undefined) continue;
      const full = ABILITY_VFX_FULL_SPECS[auraId];
      // barrier specs wear the translucent fresnel shell while the aura lives
      if (full?.barrier) fx.holdShell(e.id, abilityVfxColor(spec));
      // held buffs light the body: casterGlowV = (shellDur ? 2 : 1.3) * power
      if (full && (full.buff !== undefined || full.rim !== undefined || full.barrier)) {
        const strength = (full.buff?.shellDur ? 2 : 1.3) * (full.power ?? 1);
        if (strength > glowStrength) {
          glowStrength = strength;
          glowColor = rimColorOf(full, spec);
          glowSlow = !!full.buff?.shellDur;
        }
      }
      const style = spec.bo !== undefined ? ORBIT_BY_BO[spec.bo] : undefined;
      if (style === undefined) continue;
      if (fx.orbit(e.id, style, abilityVfxColor(spec))) {
        // The band just appeared (aura gained): pop the swirl here instead of
        // the aura event, which carries no ability id. Works online too, since
        // this reads the mirrored entity's auras, not sim events.
        this.deps.vfx.buffSwirl(e.id, planCast(spec, this.quality, 0).swirlColor);
        this.spawned = 2;
        this.recordStat(auraId, false);
      }
      bands++;
    }
    if (glowStrength > 0) fx.bodyGlow(e.id, glowColor, glowStrength, glowSlow);
  }

  // Dev probe surface: the entity's current body-glow intensity.
  glowIntensityOf(entityId: number): number {
    return this.deps.fx.glowIntensityOf(entityId);
  }

  // Advances the primitive engine (ribbons, rings, decals, orbit/windup draw).
  update(dt: number): void {
    this.deps.fx.update(dt);
  }

  // The synthetic pre-release windup for an INSTANT cast (part of the gallery
  // anatomy the 0.15s compression dropped): min(authored windup, 0.5s), with
  // gentler caps so nothing reads sluggish. Zero for real casts (their
  // ceremony already ran via the live castingAbility path), finisher-flagged
  // reactions, and unstyled windups. The visual release is what shifts late;
  // the sim's damage timing is untouched.
  private windupDelayFor(
    abilityId: string,
    full: AbilityVfxFullSpec | undefined,
    sourceId: number,
  ): number {
    if (!full?.windup || full.windup <= 0) return 0;
    if ((full.windupStyle ?? 'orb') === 'none') return 0;
    if (full.finisher) return 0;
    // dashes: the movement itself is the windup, and a leap's landing crater
    // must never arrive late
    if (full.archetype === 'dash') return 0;
    const d = this.deps;
    if (d.isInstantAbility && !d.isInstantAbility(abilityId)) return 0;
    if (d.castingAbilityOf?.(sourceId)) return 0;
    const arch = full.archetype;
    const cap = arch === 'heal' || arch === 'buff' || arch === 'shout' ? 0.25 : 0.5;
    return Math.min(full.windup, cap);
  }

  // Mirror of the renderer's generic-arm mob rule (its spellfx tail): a mob
  // hurling an instant bolt/ray with NO cast state has nothing else animating
  // the throw, so play its attack one-shot at launch. Claiming an event must
  // not lose that read.
  private mobThrowFallback(sourceId: number): void {
    const d = this.deps;
    if (!d.isMob?.(sourceId)) return;
    if (d.castingAbilityOf?.(sourceId)) return;
    if (d.isMidOneShot?.(sourceId)) return;
    d.triggerAttack(sourceId);
  }

  private spawnRing(entityId: number, plan: AbilityVfxPlan, school: string): void {
    if (plan.ringScale <= 0) return;
    const at = this.deps.anchor(entityId, 0);
    if (!at) return;
    this.deps.spawnAoeRing(at.x, at.z, RING_RADIUS_PER_SCALE * plan.ringScale, school, plan.color);
  }
}
