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
import type { Entity } from '../types';
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
