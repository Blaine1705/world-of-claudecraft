// Chronomancy (mage healer) Phase 2: Temporal Echo. docs/prd/mage-chronomancy.md
// section 13. The healer marks ONE ally with a per-caster echo aura; while it
// rides, a fraction of the mage's EFFECTIVE (post-mitigation, post-absorb,
// non-overkill) Arcane damage is siphoned back as healing onto the marked ally:
// 35% of single-target Arcane damage, 15% of area Arcane damage. Applying the
// mark also does a small direct heal (owned by the effect dispatcher, not this
// module). Re-casting MOVES the mark to the new ally (one own mark at a time).
// Two chronomancers keep independent marks on the same ally, filtered by
// aura.sourceId.
//
// Determinism: the conversion heal draws NO rng. The damage's crit was already
// resolved upstream, so the converted heal never rolls its own crit and never
// touches the global rng stream (a second draw here would shift every later
// roll and break the parity gate). All state lives in entity auras, never in
// module globals. A converted heal is applied through a dedicated non-crit path
// (never dealDamage), so it can never trigger another conversion (no recursion).
//
// `src/sim`-pure: no DOM/Three/render/ui/game/net imports, no Math.random/
// Date.now/performance.now (enforced by tests/architecture.test.ts).

import { ABILITIES } from '../data';
import type { SimContext } from '../sim_context';
import type { Aura, Entity } from '../types';
import { consumeHealAbsorb, healingTakenMult, healingThreat } from './heal';

// The mark aura kind and ability id (they share one string so the buff bar and
// the tooltip resolve the icon/name straight from ABILITIES['temporal_echo']).
export const TEMPORAL_ECHO_ID = 'temporal_echo';
// The English ability name, emitted on conversion heals so the client heal-name
// matcher (sim_i18n) localizes them exactly like a Temporal Mend heal, never the
// raw id. Falls back to the id if the record is ever missing.
const TEMPORAL_ECHO_NAME = ABILITIES[TEMPORAL_ECHO_ID]?.name ?? 'Temporal Echo';
// Playtest-provisional (PRD section 13.1 / 13.14): 15s window, 35% single-target
// conversion, 15% area conversion. Not balance-locked.
export const TEMPORAL_ECHO_DURATION = 15;
export const ECHO_CONVERT_SINGLE = 0.35;
export const ECHO_CONVERT_AOE = 0.15;

/**
 * Remove every Temporal Echo mark THIS mage placed, wherever it currently sits.
 * Used to MOVE the mark on re-cast (strip then re-apply) and to clear it when the
 * mage leaves Chronomancy or dies. Filters strictly by `sourceId`, so a mark this
 * mage carries from ANOTHER chronomancer is left untouched. Emits the standard
 * aura fade event for each removed mark so both hosts drop the buff icon. Draws no
 * rng. Iterates `ctx.entities` in insertion order (deterministic).
 */
export function stripTemporalEchoes(ctx: SimContext, mageId: number): void {
  for (const e of ctx.entities.values()) {
    for (let i = e.auras.length - 1; i >= 0; i--) {
      const a = e.auras[i];
      if (a.kind === 'temporal_echo' && a.sourceId === mageId) {
        e.auras.splice(i, 1);
        ctx.emit({ type: 'aura', targetId: e.id, name: a.name, gained: false });
      }
    }
  }
}

/**
 * Apply (or MOVE) the caster's Temporal Echo mark onto `target`. Any existing mark
 * this caster owns is stripped first, so only one own mark is ever active. The
 * mark carries `sourceId` = caster so conversions and cleanup filter by caster,
 * and `school: 'arcane'`. A brief temporal glyph is shown directly over the target
 * (no projectile travels to the ally). The small initial heal is applied by the
 * `heal` effect that sits beside the `temporalEcho` effect on the ability, not
 * here.
 */
export function placeTemporalEcho(
  ctx: SimContext,
  caster: Entity,
  target: Entity,
  duration: number,
): void {
  stripTemporalEchoes(ctx, caster.id); // one own mark at a time -> re-cast moves it
  ctx.applyAura(target, {
    id: TEMPORAL_ECHO_ID,
    name: TEMPORAL_ECHO_NAME,
    kind: 'temporal_echo',
    remaining: duration,
    duration,
    value: 1,
    sourceId: caster.id,
    school: 'arcane',
  });
  // The identity beat: a temporal glyph blooms directly on the ally. It is
  // target-anchored (no wave, no projectile) and flows to the online client
  // verbatim like every other spellfx.
  ctx.emit({
    type: 'spellfx',
    sourceId: caster.id,
    targetId: target.id,
    school: 'arcane',
    fx: 'temporalGlyph',
  });
}

/**
 * The damage-core seam. Called from dealDamage AFTER the truly-landed amount is
 * known (`dealt` = pre-hit hp minus post-hit hp, so absorbed / avoided / overkill
 * damage is already excluded). No-op unless the SOURCE is a player who currently
 * holds a Temporal Echo mark out and the damage school is Arcane. Heals the marked
 * ally by `dealt * rate` (single-target 35%, area 15%). Draws no rng; applies the
 * heal through applyEchoHeal (never dealDamage) so it can never recurse.
 */
export function chronomancyConvertArcaneDamage(
  ctx: SimContext,
  source: Entity | null,
  dealt: number,
  school: string,
  aoe: boolean,
): void {
  if (!source || source.kind !== 'player' || school !== 'arcane' || dealt <= 0) return;
  // Find the single ally this mage marked (only one own mark can exist). Stable
  // Map iteration order keeps the pick deterministic even though it is unique.
  let ally: Entity | null = null;
  for (const e of ctx.entities.values()) {
    let found = false;
    for (const a of e.auras) {
      if (a.kind === 'temporal_echo' && a.sourceId === source.id) {
        found = true;
        break;
      }
    }
    if (found) {
      ally = e;
      break;
    }
  }
  if (!ally || ally.dead) return; // a dead ally never receives the conversion
  const rate = aoe ? ECHO_CONVERT_AOE : ECHO_CONVERT_SINGLE;
  applyEchoHeal(ctx, source, ally, dealt, rate);
}

/**
 * Apply a Temporal Echo conversion heal onto the marked ally. NON-crit by design
 * (the damage crit already fattened `dealt`). Rounds per hit so each Arcane impact
 * heals on its own (PRD: Arcane Missiles heals per missile). Honors the ally's
 * incoming-heal reduction and heal-absorb shields and clamps to missing health
 * exactly like the normal heal channel, then fans out effective-healing threat.
 * Emits a `heal2` (the number + heal-glow pulse over the ally on both hosts).
 */
function applyEchoHeal(
  ctx: SimContext,
  source: Entity,
  ally: Entity,
  dealt: number,
  rate: number,
): void {
  if (ally.dead) return;
  let healed = Math.round(dealt * rate * healingTakenMult(ctx, ally));
  if (healed <= 0) return;
  healed = consumeHealAbsorb(ctx, ally, healed);
  healed = Math.min(healed, ally.maxHp - ally.hp);
  if (healed <= 0) return;
  ally.hp += healed;
  ctx.emit({
    type: 'heal2',
    sourceId: source.id,
    targetId: ally.id,
    amount: healed,
    crit: false,
    ability: TEMPORAL_ECHO_NAME,
  });
  healingThreat(ctx, source, ally, healed);
}

// ---- Chronomancy Phase 3: the Arcane rotation engine (Aether Surge charges),
// docs/prd/mage-chronomancy.md sections 13.4 / 14. Aether Surge (Oleada de éter)
// is the single-target Arcane spender that drives the offensive heal rotation.
// Each cast READS the caster's current Arcane Charge count to scale its damage
// (+30% per charge, moderate) and its mana cost (x1.9 per charge, steep and
// compounding), THEN banks one more charge (cap 4). The charges ride a caster
// aura that expires 10s after the last cast (refreshed each cast). Aether Darts
// (arcane_missiles) CONSUMES every charge on its FIRST landed missile and splits
// a flat Arcane bonus across its missiles. That bonus is plain Arcane damage, so
// Temporal Echo heals from it at the normal 35% (NO hidden heal bonus). The
// damage increase alone is what feeds more Echo healing.
//
// Determinism: every function here draws NO rng and keeps all state on the aura
// (charges) or two per-channel entity flags (the Darts dump). Aether Surge is
// `projectile: false`, so cost, damage and the +1 charge all resolve at cast
// completion in one controlled order (cost reads N, damage reads N, then banks
// N+1); a traveling bolt would let a back-to-back recast read stale charges.

export const ARCANE_SURGE_ID = 'arcane_surge';
const ARCANE_SURGE_NAME = ABILITIES[ARCANE_SURGE_ID]?.name ?? 'Aether Surge';
// PLAYTEST-provisional (PRD 13.4 / 14). The base cost lives on the ABILITIES
// record; it is DERIVED via tests/chronomancy_balance.test.ts to land the
// conservative rotation near 70-80s to OOM at the real level-20 pool.
export const AETHER_SURGE_MAX_CHARGES = 4;
export const AETHER_SURGE_DMG_PER_CHARGE = 0.3; // +30% damage per charge (linear, moderate)
export const AETHER_SURGE_COST_PER_CHARGE = 0.9; // x1.9 cost per charge (geometric, steep)
export const AETHER_SURGE_CHARGE_WINDOW = 10; // seconds, refreshed on each cast
// Aether Darts dump: a flat Arcane bonus of 6 per consumed charge, split evenly
// across the channel's missiles (24 total at 4 charges, +8 per missile over 3).
export const AETHER_DARTS_BONUS_PER_CHARGE = 6;

function aetherSurgeAura(e: Entity): Aura | undefined {
  return e.auras.find((a) => a.id === ARCANE_SURGE_ID);
}

/** Arcane Charges the caster currently holds (0 if none). Draws no rng. */
export function aetherSurgeStacks(e: Entity): number {
  return aetherSurgeAura(e)?.value ?? 0;
}

/** Cost multiplier for the NEXT Aether Surge, from the charges held right now.
 *  Geometric (x1.9 per charge) so four charges cost ~13x the base: the mana wall
 *  that makes holding a full stack a short emergency window, not a rotation. */
export function aetherSurgeCostMult(e: Entity): number {
  return (1 + AETHER_SURGE_COST_PER_CHARGE) ** aetherSurgeStacks(e);
}

/** Damage multiplier for THIS Aether Surge, from the charges held right now.
 *  Linear (+30% per charge): moderate, so the extra Echo healing it feeds grows
 *  gently while the cost climbs steeply. */
export function aetherSurgeDamageMult(e: Entity): number {
  return 1 + AETHER_SURGE_DMG_PER_CHARGE * aetherSurgeStacks(e);
}

/** Bank one Arcane Charge after an Aether Surge lands (cap 4) and refresh the
 *  10s window. applyAura replaces by id, so the timer resets on every cast. */
export function aetherSurgeAddStack(ctx: SimContext, caster: Entity): void {
  const next = Math.min(AETHER_SURGE_MAX_CHARGES, aetherSurgeStacks(caster) + 1);
  ctx.applyAura(caster, {
    id: ARCANE_SURGE_ID,
    name: ARCANE_SURGE_NAME,
    kind: 'arcane_charge',
    remaining: AETHER_SURGE_CHARGE_WINDOW,
    duration: AETHER_SURGE_CHARGE_WINDOW,
    value: next,
    stacks: next,
    sourceId: caster.id,
    school: 'arcane',
  });
}

/** Channel-start hook (casting_lifecycle's channel block): arm the Aether Darts
 *  dump so the FIRST landed missile of THIS channel consumes the charges. Inert
 *  for every other channel. */
export function aetherDartsChannelStart(caster: Entity, abilityId: string): void {
  if (abilityId !== 'arcane_missiles') return;
  caster.aetherDartsConsumePending = true;
  caster.aetherDartsBonusPerBolt = 0;
}

/** Per-missile hook (the Aether Darts bolt callback): on the FIRST landed missile
 *  of the channel, consume every Arcane Charge and lock in the flat per-missile
 *  bonus (total 6 per charge split across the channel's `ticks`); later missiles
 *  reuse the locked value. Returns the flat Arcane damage to add to this missile.
 *  Consuming on the first LANDED missile (not at channel start) means an
 *  interrupt before any damage lands never wastes the charges. Draws no rng. */
export function aetherDartsBoltBonus(ctx: SimContext, caster: Entity, ticks: number): number {
  if (caster.aetherDartsConsumePending) {
    caster.aetherDartsConsumePending = false;
    const stacks = aetherSurgeStacks(caster);
    const idx = caster.auras.findIndex((a) => a.id === ARCANE_SURGE_ID);
    if (idx >= 0) {
      const a = caster.auras[idx];
      caster.auras.splice(idx, 1);
      ctx.emit({ type: 'aura', targetId: caster.id, name: a.name, gained: false });
    }
    const total = AETHER_DARTS_BONUS_PER_CHARGE * stacks;
    caster.aetherDartsBonusPerBolt = ticks > 0 ? Math.round(total / ticks) : 0;
  }
  return caster.aetherDartsBonusPerBolt ?? 0;
}
