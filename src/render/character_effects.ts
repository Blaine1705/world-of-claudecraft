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

/**
 * Pack Ferocity is authoritative on the Hunter. The pet only derives a visual
 * stage from its current owner, so growth cannot alter collision or persistence.
 */
export function hunterPetFerocityStage(pet: Entity, owner: Entity | null): 0 | 1 | 2 | 3 {
  if (pet.dead || pet.ownerId === null || owner?.id !== pet.ownerId) return 0;
  const aura = owner.auras.find((candidate) => candidate.kind === 'hunter_ferocity');
  const raw = aura?.stacks ?? aura?.value ?? 0;
  return Math.min(3, Math.max(0, Math.trunc(raw))) as 0 | 1 | 2 | 3;
}

export function hunterPetFrenzyActive(pet: Entity, owner: Entity | null): boolean {
  return (
    !pet.dead &&
    pet.ownerId !== null &&
    owner?.id === pet.ownerId &&
    owner.auras.some((candidate) => candidate.kind === 'hunter_frenzy')
  );
}

export function hunterPetVisualScale(stage: number, frenzy: boolean): number {
  if (frenzy) return 1.1;
  if (stage >= 3) return 1.12;
  if (stage === 2) return 1.08;
  if (stage === 1) return 1.04;
  return 1;
}
