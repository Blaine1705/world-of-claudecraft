import type { Aura, Entity } from '../sim/types';

export function isAvengingWrathAura(aura: Pick<Aura, 'id' | 'kind'>): boolean {
  return aura.id === 'avenging_wrath' && aura.kind === 'buff_dmg_done';
}

export function isPaladinWingAura(aura: Pick<Aura, 'id' | 'kind'>): boolean {
  return (
    isAvengingWrathAura(aura) ||
    ((aura.id === 'guardian_covenant' || aura.id === 'life_covenant') && aura.kind === 'buff_dr')
  );
}

export function characterAvengingWrathActive(e: Entity): boolean {
  return !e.dead && e.templateId === 'paladin' && e.auras.some(isAvengingWrathAura);
}

export function characterPaladinWingsActive(e: Entity): boolean {
  return !e.dead && e.auras.some(isPaladinWingAura);
}

export function isOathChainAura(aura: Pick<Aura, 'id' | 'kind'>): boolean {
  return (
    (aura.id === 'oath_chain_pull' && aura.kind === 'forced_move') ||
    (aura.id === 'oath_chain_slow' && aura.kind === 'slow')
  );
}

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

/** A five-stack Tithefiend is authored above normal creature scale. */
export function tithefiendEmpoweredActive(entity: Entity): boolean {
  return !entity.dead && entity.templateId === 'guardian_tithefiend' && entity.scale > 1;
}

export type CharacterVeilboundState = 'none' | 'march' | 'mark';

export function characterVeilboundState(e: Entity): CharacterVeilboundState {
  if (e.auras.some((a) => a.id === 'veilbound_march')) return 'march';
  if (e.auras.some((a) => a.id === 'veilbound_mark')) return 'mark';
  return 'none';
}
