const SHAMAN_SHOCK_COOLDOWN_IDS = ['earth_shock', 'flame_shock', 'frost_shock'] as const;
const PALADIN_HAMMER_COOLDOWN_IDS = ['hammer_of_grace', 'hammer_of_light'] as const;

export function sharedCooldownIds(abilityId: string): readonly string[] | null {
  if (
    (SHAMAN_SHOCK_COOLDOWN_IDS as readonly string[]).includes(abilityId) ||
    abilityId === 'lightning_shock'
  ) {
    return SHAMAN_SHOCK_COOLDOWN_IDS;
  }
  if ((PALADIN_HAMMER_COOLDOWN_IDS as readonly string[]).includes(abilityId)) {
    return PALADIN_HAMMER_COOLDOWN_IDS;
  }
  return null;
}
