import { canEquipItem } from './equipment_rules';
import { trinketLootFitsClass } from './trinket_loot_eligibility';
import type { ItemDef, PlayerClass } from './types';

/** Class and stat restrictions shared by vault catalogs and new authoritative rolls. */
export function weeklyRewardFitsClass(cls: PlayerClass, item: ItemDef): boolean {
  if (!canEquipItem(cls, item) || (item.requiredClass && !item.requiredClass.includes(cls)))
    return false;
  if (!trinketLootFitsClass(cls, item)) return false;
  if (cls === 'warrior' || cls === 'rogue' || cls === 'hunter') {
    return (item.stats?.int ?? 0) <= 0 && (item.spellPower ?? 0) <= 0 && (item.healPower ?? 0) <= 0;
  }
  if (cls === 'mage' || cls === 'priest' || cls === 'warlock') {
    if ((item.stats?.str ?? 0) > 0 || (item.stats?.agi ?? 0) > 0) return false;
  }
  return cls !== 'warlock' || (item.healPower ?? 0) <= 0;
}
