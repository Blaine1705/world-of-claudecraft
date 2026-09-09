import type { Entity } from '../sim/types';
import { type TranslationKey, t } from './i18n';

const ROLE_KEYS: Record<NonNullable<Entity['worldQuestCombatRole']>, TranslationKey> = {
  leader: 'questUi.worldQuest.combat.role.leader',
  soldier: 'questUi.worldQuest.combat.role.soldier',
  captain: 'questUi.worldQuest.combat.role.captain',
  wave: 'questUi.worldQuest.combat.role.wave',
  sapper: 'questUi.worldQuest.combat.role.sapper',
  boss: 'questUi.worldQuest.combat.role.boss',
};

/** The role travels with the spawned enemy, never inferred from a reused wild model. */
export function worldQuestCombatRoleName(entity: Entity, name: string): string {
  const role = entity.kind === 'mob' ? entity.worldQuestCombatRole : undefined;
  if (!role) return name;
  return t('questUi.worldQuest.combat.roleName', { role: t(ROLE_KEYS[role]), name });
}
