// Fire mage spec mechanics (owner design 2026-07-10, built 2026-07-11): the
// crit-driven Pyromancy loop, mirroring combat/frost_mage.ts.
//
//  - IGNITION (mastery): the fire mage's spell CRITICALS burn the target for
//    IGNITION_PCT of the damage dealt over IGNITE_DURATION, STACKING by adding
//    into the running burn (igniteOnCrit, hooked in combat/damage.ts). The burn
//    copies the RESOLVED damage: no new rng is ever drawn.
//  - HOT STREAK (signature): two consecutive BUILDER crits (Fireball / Fire
//    Blast / Scorch) make the next Pyroblast OR Flamestrike free AND instant
//    (the empower_next machinery, ability-scoped). The counter READS crits
//    already rolled (fireMageOnSpellHit, wired through noteSpellHit) and never
//    draws dice. Guaranteed crits BUILD it too, Combustion included (owner
//    reversal 2026-07-11 of the earlier skip: Combustion windows are meant to
//    chain Hot Streaks, the classic Combustion fantasy). The spenders are
//    also builders (free casts included): one spender crit is still only ONE
//    crit, never a whole new streak by itself, and a Flamestrike counts once
//    per cast however many enemies it strikes.
//  - GUARANTEED CRITS (fireGuaranteedCrit, read at the spell-crit roll sites in
//    effect_dispatch): Fire Blast ALWAYS crits; Scorch always crits against
//    targets at or below SCORCH_EXECUTE_HP; while Combustion is worn, every
//    Fire spell crits. The rng roll is STILL drawn exactly as before (only the
//    outcome is overridden), so the shared draw order never moves.
//
// Every check is deterministic; the counters and windows ride AURAS so no new
// entity field enters the parity state hash.
//
// `src/sim`-pure: sibling sim modules + the SimContext seam only.

import { ABILITIES } from '../data';
import type { SimContext } from '../sim_context';
import type { Entity } from '../types';

export const IGNITE_DURATION = 6;
export const IGNITE_INTERVAL = 2;
export const SCORCH_EXECUTE_HP = 0.3; // Scorch always crits at or below this
// The spenders are ALSO builders (owner rule 2026-07-11, final form): their
// crits, free casts included, count toward the NEXT streak. A Flamestrike is
// one crit per CAST however many enemies it strikes (the aoeDamage canCrit
// path notes exactly once), and only the initial impact counts: ground-zone
// pulses, DoT ticks and Ignite never reach noteSpellHit.
export const HOT_STREAK_BUILDERS: readonly string[] = [
  'fireball',
  'fire_blast',
  'scorch',
  'pyroblast',
  'flamestrike',
];
export const HOT_STREAK_SPENDERS: readonly string[] = ['pyroblast', 'flamestrike'];
export const HEATING_UP_WINDOW = 10; // seconds the first crit is remembered
export const HOT_STREAK_DURATION = 12; // seconds to spend the free instant

// The personal-barrier SLOT (owner rule): each mage spec fills it with its own
// shield, and the shared row talents (Warded / Cold Snap / Overflowing Power)
// hook whichever the player's spec provides, never a hardcoded single id.
export const PERSONAL_BARRIER_IDS: readonly string[] = [
  'ice_barrier',
  'blazing_barrier',
  // Chronomancy's shield fills the same slot (it is also its ally shield).
  'temporal_barrier',
];

function fireSpecMods(ctx: SimContext, p: Entity) {
  if (p.kind !== 'player') return null;
  const meta = ctx.players.get(p.id);
  if (!meta) return null;
  const mods = ctx.playerMods(meta);
  return mods.spec === 'fire' ? mods : null;
}

/** Guaranteed-crit override for the fire spec, read at the spell-crit roll
 *  sites (the roll is still drawn; only the outcome is overridden). */
export function fireGuaranteedCrit(
  ctx: SimContext,
  p: Entity,
  abilityId: string,
  school: string,
  target: Entity | null,
): boolean {
  if (school !== 'fire') return false;
  if (!fireSpecMods(ctx, p)) return false;
  if (p.auras.some((a) => a.kind === 'combustion')) return true;
  if (abilityId === 'fire_blast') return true;
  if (abilityId === 'scorch' && target && target.hp <= target.maxHp * SCORCH_EXECUTE_HP)
    return true;
  return false;
}

/** Hot Streak: two consecutive BUILDER crits arm a free, instant Pyroblast or
 *  Flamestrike. Wired through noteSpellHit so it READS every resolved spell
 *  hit; draws no rng. Every crit builds, Combustion's guaranteed ones too. */
export function fireMageOnSpellHit(
  ctx: SimContext,
  p: Entity,
  abilityId: string | undefined,
  crit: boolean,
): void {
  if (!abilityId || !HOT_STREAK_BUILDERS.includes(abilityId)) return;
  if (!fireSpecMods(ctx, p)) return;
  const heatingIdx = p.auras.findIndex((a) => a.id === 'heating_up');
  if (!crit) {
    // A non-crit builder breaks the streak.
    if (heatingIdx >= 0) {
      const gone = p.auras[heatingIdx];
      p.auras.splice(heatingIdx, 1);
      ctx.emit({ type: 'aura', targetId: p.id, name: gone.name, gained: false });
    }
    return;
  }
  if (heatingIdx < 0) {
    ctx.applyAura(p, {
      id: 'heating_up',
      name: 'Heating Up',
      kind: 'internal_cd',
      value: 0,
      remaining: HEATING_UP_WINDOW,
      duration: HEATING_UP_WINDOW,
      sourceId: p.id,
      school: 'fire',
    });
    return;
  }
  // Second crit in a row: consume Heating Up, arm Hot Streak (free + instant,
  // scoped to the two spenders via the empower_next ability lists).
  const heat = p.auras[heatingIdx];
  p.auras.splice(heatingIdx, 1);
  ctx.emit({ type: 'aura', targetId: p.id, name: heat.name, gained: false });
  ctx.applyAura(p, {
    id: 'hot_streak',
    name: 'Hot Streak',
    kind: 'next_cast_free',
    value: 0,
    remaining: HOT_STREAK_DURATION,
    duration: HOT_STREAK_DURATION,
    sourceId: p.id,
    school: 'fire',
    empowerAbilities: [...HOT_STREAK_SPENDERS],
  });
  ctx.applyAura(p, {
    id: 'hot_streak_instant',
    name: 'Hot Streak',
    kind: 'next_cast_instant',
    value: 0,
    remaining: HOT_STREAK_DURATION,
    duration: HOT_STREAK_DURATION,
    sourceId: p.id,
    school: 'fire',
    empowerAbilities: [...HOT_STREAK_SPENDERS],
  });
}

/** Bank a burn on the target over IGNITE_DURATION, STACKING into the running
 *  Ignite (per-tick value grows, clock refreshes). The caller computes the
 *  burn from RESOLVED damage; draws no rng. */
export function applyIgnite(ctx: SimContext, source: Entity, target: Entity, burn: number): void {
  if (burn <= 0 || target.dead) return;
  const perTick = Math.max(1, Math.round(burn / (IGNITE_DURATION / IGNITE_INTERVAL)));
  const existing = target.auras.find((a) => a.id === 'ignite' && a.sourceId === source.id);
  if (existing) {
    existing.value += perTick;
    existing.remaining = IGNITE_DURATION;
    existing.duration = IGNITE_DURATION;
    return;
  }
  ctx.applyAura(target, {
    id: 'ignite',
    name: 'Ignite',
    kind: 'dot',
    value: perTick,
    remaining: IGNITE_DURATION,
    duration: IGNITE_DURATION,
    tickInterval: IGNITE_INTERVAL,
    tickTimer: IGNITE_INTERVAL,
    sourceId: source.id,
    school: 'fire',
  });
}

/** The mastery hook, called from combat/damage.ts once per landed hit: a fire
 *  mage's Fire-school ABILITY crit banks its Ignite. Ignite's own ticks carry
 *  crit=false, so a burn can never re-ignite itself. */
export function igniteOnCrit(
  ctx: SimContext,
  source: Entity | null,
  target: Entity,
  amount: number,
  crit: boolean,
  school: string,
  ability: string | null,
): void {
  if (!crit || amount <= 0 || ability === null || school !== 'fire') return;
  if (!source || source.id === target.id) return;
  const mods = fireSpecMods(ctx, source);
  if (!mods || mods.global.ignitionPct <= 0) return;
  applyIgnite(ctx, source, target, Math.round(amount * mods.global.ignitionPct));
}

/** Does this ability id name a mage ability (used by tests and tooling). */
export function isFireSpender(abilityId: string): boolean {
  return HOT_STREAK_SPENDERS.includes(abilityId) && ABILITIES[abilityId] !== undefined;
}
