import { MOBS } from '../sim/data';
import type { Entity } from '../sim/types';

export function shouldPlayCritSfxForTarget(target: Entity): boolean {
  return target.kind !== 'mob' || !MOBS[target.templateId]?.boss;
}

function isNythraxisBoss(entity: Entity): boolean {
  return entity.kind === 'mob' && entity.templateId === 'nythraxis_scourge_of_thornpeak';
}

export function shouldPlayCombatImpactForTarget(target: Entity): boolean {
  return !isNythraxisBoss(target);
}

export function shouldPlayMobVoiceSfxForEntity(entity: Entity): boolean {
  return (
    entity.kind === 'mob' &&
    entity.templateId !== 'nythraxis_scourge_of_thornpeak' &&
    entity.templateId !== 'nythraxis_skeleton_warrior'
  );
}

const SFX_MOB_FAMILIES = new Set([
  'beast',
  'spider',
  'mudfin',
  'burrower',
  'humanoid',
  'undead',
  'troll',
  'ogre',
  'elemental',
  'dragonkin',
  'demon',
]);

/** Creature-voice key family, with bespoke summoned-creature overrides. */
export function mobVoiceFamily(templateId: string): string | null {
  if (templateId === 'water_elemental') return 'water_elemental';
  if (templateId === 'wild_boar' || templateId === 'elder_bristleback') return 'boar';
  const family = MOBS[templateId]?.family;
  return family && SFX_MOB_FAMILIES.has(family) ? family : null;
}
