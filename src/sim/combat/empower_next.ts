import type { SimContext } from '../sim_context';
import type { Aura, AuraKind, Entity } from '../types';

// An empowerment aura may be ability-scoped (talent procs set empowerAbilities);
// an unscoped aura (item sets, fiesta powerups) matches any cast.
function matches(a: Aura, abilityId?: string): boolean {
  if (!a.empowerAbilities) return true;
  return abilityId !== undefined && a.empowerAbilities.includes(abilityId);
}

export function consumeAuraKind(
  ctx: SimContext,
  e: Entity,
  kind: AuraKind,
  abilityId?: string,
): Aura | null {
  const idx = e.auras.findIndex((a) => a.kind === kind && matches(a, abilityId));
  if (idx < 0) return null;
  const [aura] = e.auras.splice(idx, 1);
  ctx.emit({ type: 'aura', targetId: e.id, name: aura.name, gained: false, auraKind: aura.kind });
  return aura;
}

export function hasNextCastFree(e: Entity, abilityId?: string): boolean {
  return e.auras.some((a) => a.kind === 'next_cast_free' && matches(a, abilityId));
}

export function consumeNextCastFree(ctx: SimContext, e: Entity, abilityId?: string): boolean {
  return consumeAuraKind(ctx, e, 'next_cast_free', abilityId) !== null;
}

/** Pure aura-list predicate: is `abilityId`'s cost covered by a free-cost
 *  proc? Structural input so the UI drives it with a mirrored aura list. */
export function freeCostAuraActive(
  auras: readonly { kind: string; empowerAbilities?: readonly string[] }[],
  abilityId: string,
): boolean {
  for (const a of auras) {
    // next_cast_free is SCOPED by empowerAbilities, so only the abilities the
    // proc actually empowers glow / cast free: Hot Streak -> Pyroblast +
    // Flamestrike, Aether Rush -> Aether Surge. An unscoped aura (item set /
    // fiesta powerup, no empowerAbilities) still covers every cast. This mirrors
    // the consume scope in consumeNextCastFree, so the bar glow, the usable
    // state, and the actual free cast can never disagree.
    if (
      a.kind === 'next_cast_free' &&
      (!a.empowerAbilities || a.empowerAbilities.includes(abilityId))
    )
      return true;
  }
  return false;
}

export function hasFreeCostFor(e: Entity, abilityId: string): boolean {
  return freeCostAuraActive(e.auras, abilityId);
}

/** Consume the free-cast proc covering `abilityId`. */
export function consumeFreeCostFor(ctx: SimContext, e: Entity, abilityId: string): boolean {
  // Pass the ability id so an ability-SCOPED next_cast_free aura (empowerAbilities
  // set by a talent proc, e.g. Searing Light / Fault Line) is only spent by an
  // ability it actually empowers. An unscoped aura still matches any cast.
  return consumeNextCastFree(ctx, e, abilityId);
}

export function consumeNextCastInstant(ctx: SimContext, e: Entity, abilityId?: string): boolean {
  return consumeAuraKind(ctx, e, 'next_cast_instant', abilityId) !== null;
}

/** Returns the cost multiplier (e.g. 0.5) or null when no cheap charge matches. */
export function consumeNextCastCheap(
  ctx: SimContext,
  e: Entity,
  abilityId?: string,
): number | null {
  const aura = consumeAuraKind(ctx, e, 'next_cast_cheap', abilityId);
  return aura ? aura.value : null;
}

export function consumeNextAttackCrit(ctx: SimContext, e: Entity): boolean {
  return consumeAuraKind(ctx, e, 'next_attack_crit') !== null;
}
