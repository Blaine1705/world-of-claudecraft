import type { Entity } from '../sim/types';

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
