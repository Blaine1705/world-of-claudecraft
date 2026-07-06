import type { SimContext } from '../sim_context';
import type { AuraKind, Entity } from '../types';

function consumeAuraKind(ctx: SimContext, e: Entity, kind: AuraKind): boolean {
  const idx = e.auras.findIndex((a) => a.kind === kind);
  if (idx < 0) return false;
  const [aura] = e.auras.splice(idx, 1);
  ctx.emit({ type: 'aura', targetId: e.id, name: aura.name, gained: false });
  return true;
}

export function hasNextCastFree(e: Entity): boolean {
  return e.auras.some((a) => a.kind === 'next_cast_free');
}

export function consumeNextCastFree(ctx: SimContext, e: Entity): boolean {
  return consumeAuraKind(ctx, e, 'next_cast_free');
}

// Battle Trance (warrior baseline): the ability-SCOPED sibling of
// next_cast_free. Connected auto swings arm the aura (auto_attack.ts); only
// these two abilities may spend it. The action bar imports the same predicate
// for its proc glow / usable state, so sim and UI can never disagree on scope.
export const BATTLE_TRANCE_ABILITIES: ReadonlySet<string> = new Set(['heroic_strike', 'slam']);

/** Pure aura-list predicate: is `abilityId`'s cost covered by a free-cost
 *  proc? Structural input so the UI drives it with a mirrored aura list. */
export function freeCostAuraActive(auras: readonly { kind: string }[], abilityId: string): boolean {
  for (const a of auras) {
    if (a.kind === 'next_cast_free') return true;
    if (a.kind === 'battle_trance' && BATTLE_TRANCE_ABILITIES.has(abilityId)) return true;
  }
  return false;
}

export function hasFreeCostFor(e: Entity, abilityId: string): boolean {
  return freeCostAuraActive(e.auras, abilityId);
}

/** Consume whichever free-cost proc covers `abilityId` (the generic
 *  next_cast_free first, then a scope-matched Battle Trance). */
export function consumeFreeCostFor(ctx: SimContext, e: Entity, abilityId: string): boolean {
  if (consumeNextCastFree(ctx, e)) return true;
  return BATTLE_TRANCE_ABILITIES.has(abilityId) && consumeAuraKind(ctx, e, 'battle_trance');
}

export function consumeNextCastInstant(ctx: SimContext, e: Entity): boolean {
  return consumeAuraKind(ctx, e, 'next_cast_instant');
}

export function consumeNextAttackCrit(ctx: SimContext, e: Entity): boolean {
  return consumeAuraKind(ctx, e, 'next_attack_crit');
}
