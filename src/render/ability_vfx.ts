// Thin painter for the per-ability spell VFX system: resolves an event's
// ability id against the authored spec table (ability_vfx_specs.ts), asks the
// pure core (ability_vfx_core.ts) for a plan, and drives the EXISTING pooled
// Vfx primitives with the spec's color and scale. Unknown ability or fx kind:
// it declines and the renderer's generic school-colored arm runs unchanged.
import { AbilityVfxBudget, type AbilityVfxPlan, planCast, planImpact } from './ability_vfx_core';
import { ABILITY_VFX_SPECS } from './ability_vfx_specs';
import { attackAbilityId } from './characters/weapon_attack_style_core';

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
  }

  // Returns true when this painter fully handled the event (the renderer skips
  // its generic school-colored arm), false to fall through unchanged.
  handleSpellfx(ev: AbilityVfxSpellfxEvent): boolean {
    if (!ev.ability || !CAST_FX.has(ev.fx)) return false;
    const spec = ABILITY_VFX_SPECS[ev.ability];
    if (!spec) return false;
    const tier = this.budget.admit(ev.sourceId, this.now());
    const plan = planCast(spec, this.quality, tier);
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
        } else {
          for (let i = 0; i < plan.volley; i++) {
            this.deps.vfx.projectile(ev.sourceId, ev.targetId, ev.school, scale, plan.color);
          }
        }
        break;
      }
      case 'lightning':
        this.deps.vfx.lightningProjectile(ev.sourceId, ev.targetId, plan.color);
        break;
      case 'windup':
        // The generic windup arm's whole job is the throw animation: keep it.
        if (!plan.whirl) this.deps.triggerAttack(ev.sourceId, ev.ability);
        break;
      case 'shout':
        this.deps.vfx.shoutwave(ev.sourceId, plan.color);
        this.spawnRing(ev.sourceId, plan, ev.school);
        break;
      case 'nova':
        this.deps.vfx.nova(ev.targetId, ev.school, plan.color);
        this.spawnRing(ev.targetId, plan, ev.school);
        break;
      case 'tick':
        this.deps.vfx.tick(ev.targetId, ev.school, plan.color);
        break;
    }
    return true;
  }

  // A landed ability hit gets one reduced-count accent burst in the spec color
  // so impacts read per-ability too. Damage events carry player-facing ability
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
  }

  // Spec-colored buff swirl for an aura gain. Only an exact ability id (from
  // the event when it carries one, else the caller's guess) is trusted; aura
  // display names are never fuzzy-matched.
  onAuraGained(ev: AbilityVfxAuraEvent, abilityIdGuess?: string): void {
    if (!ev.gained) return;
    const abilityId = ev.ability ?? abilityIdGuess;
    if (!abilityId) return;
    const spec = ABILITY_VFX_SPECS[abilityId];
    if (!spec) return;
    this.deps.vfx.buffSwirl(ev.targetId, planCast(spec, this.quality, 0).swirlColor);
  }

  // Reserved for time-based per-ability effects (lingering glows). O(1) today.
  update(_dt: number): void {}

  private spawnRing(entityId: number, plan: AbilityVfxPlan, school: string): void {
    if (plan.ringScale <= 0) return;
    const at = this.deps.anchor(entityId, 0);
    if (!at) return;
    this.deps.spawnAoeRing(at.x, at.z, RING_RADIUS_PER_SCALE * plan.ringScale, school, plan.color);
  }
}
