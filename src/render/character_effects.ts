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

export function characterSoulRendActive(e: Entity): boolean {
  return e.auras.some((a) => a.id === 'nythraxis_soul_rend');
}

export function characterSanguineAuraActive(e: Entity): boolean {
  return e.auras.some((a) => a.id === 'sanguine_aura');
}

export function characterRecklessnessActive(e: Entity): boolean {
  return e.auras.some((a) => a.kind === 'buff_reckless');
}

export type CharacterVeilboundState = 'none' | 'march' | 'mark';

export function characterVeilboundState(e: Entity): CharacterVeilboundState {
  if (e.auras.some((a) => a.id === 'veilbound_march')) return 'march';
  if (e.auras.some((a) => a.id === 'veilbound_mark')) return 'mark';
  return 'none';
}
