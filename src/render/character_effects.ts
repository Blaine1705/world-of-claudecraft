import type { Entity } from '../sim/types';

export type CharacterWeaponAuraMode = 'none' | 'sanguine' | 'stonebound';

export function characterSoulRendActive(e: Entity): boolean {
  return e.auras.some((a) => a.id === 'nythraxis_soul_rend');
}

export function characterSanguineAuraActive(e: Entity): boolean {
  return e.auras.some((a) => a.id === 'sanguine_aura');
}

/** Stable structural weapon/body presentation. Stonebound wins if an unrelated
 * Sanguine effect overlaps, because its posture must remain readable. */
export function characterWeaponAuraMode(e: Entity): CharacterWeaponAuraMode {
  if (
    e.auras.some((aura) => aura.id === 'rockbiter_weapon' || aura.id === 'shaman_stonebound_armor')
  ) {
    return 'stonebound';
  }
  return characterSanguineAuraActive(e) ? 'sanguine' : 'none';
}

export function characterRecklessnessActive(e: Entity): boolean {
  return e.auras.some((a) => a.kind === 'buff_reckless');
}
