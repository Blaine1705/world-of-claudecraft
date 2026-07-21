// Thin painter for the per-ability spell VFX system: resolves an event's
// ability id against the authored spec table (ability_vfx_specs.ts), asks the
// pure core (ability_vfx_core.ts) for a plan, and drives the pooled Vfx
// particle primitives plus the gallery-ported primitive engine (fx.ts: ribbon
// trails, shock rings, ground decals, windup orbs, buff orbits) with the
// spec's color, scale, and archetype. Unknown ability or fx kind: it declines
// and the renderer's generic school-colored arm runs unchanged.

import type { AbilityVfxSpec } from '../ability_vfx_core';
import {
  AbilityVfxBudget,
  type AbilityVfxPlan,
  abilityVfxColor,
  planCast,
  planImpact,
} from '../ability_vfx_core';
import { ABILITY_VFX_SPECS } from '../ability_vfx_specs';
import { attackAbilityId } from '../characters/weapon_attack_style_core';
import type { AbilityVfxFx, DecalStyle, OrbitStyle } from './fx';

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
]);
// spawnAoeRing radius in yards per spec ringScale unit (rg 2 = the classic
// 8 yd warrior shout ring).
const RING_RADIUS_PER_SCALE = 4;

// Palette to ground-mark mapping: fire scorches, frost rimes, magic runes.
const DECAL_BY_PALETTE: Record<string, DecalStyle> = {
  fire: 'ember',
  blood: 'ember',
  physical: 'ember',
  frost: 'rime',
  moon: 'rime',
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

function decalStyleFor(spec: AbilityVfxSpec, school: string): DecalStyle {
  return DECAL_BY_PALETTE[spec.p ?? school] ?? 'rune';
}

export class AbilityVfx {
  private quality = 1;
  private budget = new AbilityVfxBudget();
  private now: () => number;

  constructor(
    private deps: AbilityVfxDeps,
    now?: () => number,
  ) {
    this.now = now ?? (() => performance.now() / 1000);
  }

  setQuality(q: number): void {
    this.quality = Math.min(1, Math.max(0, Number.isFinite(q) ? q : 1));
    this.deps.fx.setQuality(this.quality);
  }

  // Returns true when this painter fully handled the event (the renderer skips
  // its generic school-colored arm), false to fall through unchanged.
  handleSpellfx(ev: AbilityVfxSpellfxEvent): boolean {
    if (!ev.ability || !CAST_FX.has(ev.fx)) return false;
    const spec = ABILITY_VFX_SPECS[ev.ability];
    if (!spec) return false;
    const tier = this.budget.admit(ev.sourceId, this.now());
    const plan = planCast(spec, this.quality, tier);
    const fx = this.deps.fx;
    const arch = spec.a ?? 'burst';
    const gentle = arch === 'heal' || arch === 'buff' || arch === 'cc';
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
          if (tier < 2) fx.jaggedBolt(ev.sourceId, ev.targetId, plan.color);
        } else {
          for (let i = 0; i < plan.volley; i++) {
            this.deps.vfx.projectile(ev.sourceId, ev.targetId, ev.school, scale, plan.color);
          }
          // The gallery bolt read: a flowing comet trail chasing the head,
          // landing a vertical impact halo (full fidelity only).
          if (tier < 2)
            fx.cometTrail(ev.sourceId, ev.targetId, plan.color, 0.16 * scale, tier === 0);
        }
        break;
      }
      case 'lightning':
        this.deps.vfx.lightningProjectile(ev.sourceId, ev.targetId, plan.color);
        if (tier < 2) fx.jaggedBolt(ev.sourceId, ev.targetId, plan.color);
        break;
      case 'windup':
        // The generic windup arm's whole job is the throw animation: keep it.
        if (!plan.whirl) this.deps.triggerAttack(ev.sourceId, ev.ability);
        break;
      case 'shout': {
        this.deps.vfx.shoutwave(ev.sourceId, plan.color);
        this.spawnRing(ev.sourceId, plan, ev.school);
        if (tier < 2) {
          const radius = Math.max(4, RING_RADIUS_PER_SCALE * (spec.rg ?? 2));
          fx.doubleGroundRing(ev.sourceId, radius, plan.color, 1);
          if (tier === 0) fx.impactRing(ev.sourceId, plan.color, true);
        }
        break;
      }
      case 'nova': {
        this.deps.vfx.nova(ev.targetId, ev.school, plan.color);
        this.spawnRing(ev.targetId, plan, ev.school);
        if (tier < 2) {
          const radius = Math.max(3, RING_RADIUS_PER_SCALE * (spec.rg ?? 1));
          fx.doubleGroundRing(ev.targetId, radius, plan.color, gentle ? 0.55 : 1);
          // The linger: novas etch a fading ground mark (scorch, rime, or a
          // slow-spinning rune by palette). Tier 1 sheds lingers first.
          if (tier === 0 && arch !== 'cc') {
            fx.decalAt(
              ev.targetId,
              radius * 0.7,
              plan.color,
              decalStyleFor(spec, ev.school),
              Math.min(6, 1.5 + (spec.lg ?? 1) * 1.4),
            );
          }
        }
        break;
      }
      case 'tick':
        this.deps.vfx.tick(ev.targetId, ev.school, plan.color);
        break;
    }
    return true;
  }

  // A landed ability hit gets one reduced-count accent burst in the spec color
  // plus its archetype read: strikes slash a ribbon arc across the victim and
  // crits pop a vertical halo. Damage events carry player-facing ability
  // NAMES; normalize back to the stable id first. Budget-gated: any degrade
  // tier skips the accent entirely (casts keep priority under spam).
  onDamage(ev: AbilityVfxDamageEvent): void {
    if (ev.kind !== 'hit' || ev.amount <= 0 || !ev.ability) return;
    const abilityId = attackAbilityId(ev.ability);
    const spec = abilityId ? ABILITY_VFX_SPECS[abilityId] : undefined;
    if (!spec) return;
    const tier = this.budget.admit(ev.sourceId, this.now());
    if (tier >= 1) return;
    const plan = planImpact(spec, ev.crit, this.quality, tier);
    const at = this.deps.anchor(ev.targetId, 0.55);
    if (!at) return;
    this.deps.vfx.burst(at, ev.school, plan.burstCount, plan.burstPower, plan.color);
    const arch = spec.a ?? 'strike';
    if (arch === 'strike' || arch === 'dash') this.deps.fx.slashArc(ev.targetId, plan.color);
    if (ev.crit || spec.fin === 1) this.deps.fx.impactRing(ev.targetId, plan.color, ev.crit);
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
    if (e.castingAbility) {
      const spec = ABILITY_VFX_SPECS[e.castingAbility];
      if (spec) {
        const progress =
          e.castTotal > 0 ? Math.min(1, Math.max(0, 1 - e.castRemaining / e.castTotal)) : 0;
        fx.windup(e.id, abilityVfxColor(spec), progress);
      }
    }
    let bands = 0;
    for (let i = 0; i < e.auras.length && bands < 3; i++) {
      const spec = ABILITY_VFX_SPECS[e.auras[i].id];
      const style = spec?.bo !== undefined ? ORBIT_BY_BO[spec.bo] : undefined;
      if (spec === undefined || style === undefined) continue;
      fx.orbit(e.id, style, abilityVfxColor(spec));
      bands++;
    }
  }

  // Advances the primitive engine (ribbons, rings, decals, orbit/windup draw).
  update(dt: number): void {
    this.deps.fx.update(dt);
  }

  private spawnRing(entityId: number, plan: AbilityVfxPlan, school: string): void {
    if (plan.ringScale <= 0) return;
    const at = this.deps.anchor(entityId, 0);
    if (!at) return;
    this.deps.spawnAoeRing(at.x, at.z, RING_RADIUS_PER_SCALE * plan.ringScale, school, plan.color);
  }
}
