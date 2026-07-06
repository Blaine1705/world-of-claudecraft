import type { Entity } from '../types';

export function spellCritBonusFromAuras(p: Entity): number {
  let bonus = 0;
  for (const aura of p.auras) {
    if (aura.kind === 'buff_spellcrit') bonus += aura.value;
  }
  return bonus;
}

export function spellDamageMultFromAuras(p: Entity): number {
  let bonus = 0;
  for (const aura of p.auras) {
    if (aura.kind === 'buff_spelldmg') bonus += aura.value;
  }
  return 1 + bonus;
}

export function spellHasteMultFromAuras(p: Entity): number {
  let bonus = 0;
  for (const aura of p.auras) {
    if (aura.kind === 'buff_spellhaste') bonus += aura.value;
  }
  return 1 + bonus;
}

export function hasCastShield(p: Entity): boolean {
  return p.auras.some((aura) => aura.kind === 'cast_shield');
}

export function noteSpellHit(..._args: unknown[]): void {
  // Hot Streak state is not present in this target branch.
}
