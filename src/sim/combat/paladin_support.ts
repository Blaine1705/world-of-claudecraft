import type { SimContext } from '../sim_context';
import type { Aura, Entity } from '../types';

export const PALADIN_DEVOTION_ABILITY_IDS: ReadonlySet<string> = new Set([
  'devotion_ward',
  'retribution_aura',
]);

export function paladinDevotionConflicts(
  auras: readonly Aura[],
  sourceId: number,
  incomingId: string,
): number[] {
  if (!PALADIN_DEVOTION_ABILITY_IDS.has(incomingId)) return [];
  const conflicts: number[] = [];
  for (let index = auras.length - 1; index >= 0; index--) {
    const aura = auras[index];
    if (
      aura.sourceId === sourceId &&
      aura.id !== incomingId &&
      PALADIN_DEVOTION_ABILITY_IDS.has(aura.id)
    ) {
      conflicts.push(index);
    }
  }
  return conflicts;
}

export function stripPaladinDevotionsFromSource(ctx: SimContext, sourceId: number): void {
  for (const entity of ctx.entities.values()) {
    for (let index = entity.auras.length - 1; index >= 0; index--) {
      const aura = entity.auras[index];
      if (aura.sourceId !== sourceId || !PALADIN_DEVOTION_ABILITY_IDS.has(aura.id)) continue;
      ctx.applyNonPlayerStatAura(entity, aura, -1);
      entity.auras.splice(index, 1);
      ctx.emit({ type: 'aura', targetId: entity.id, name: aura.name, gained: false });
    }
  }
}

export function paladinManaCostMultiplier(entity: Entity): number {
  let reduction = 0;
  for (const aura of entity.auras) {
    if (aura.kind === 'buff_mana_grace') reduction += aura.value2 ?? 0.03;
  }
  return Math.max(0.2, 1 - reduction);
}

export function paladinHealingDoneMultiplier(entity: Entity): number {
  let bonus = 0;
  for (const aura of entity.auras) {
    if (aura.kind === 'buff_healing_done') bonus += aura.value;
    else if (aura.kind === 'sacred_form') bonus += aura.value;
  }
  return 1 + bonus;
}
