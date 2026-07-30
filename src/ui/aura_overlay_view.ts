import type { PlayerClass } from '../sim/types';
import type { TranslationKey } from './i18n.catalog';

export type WarriorProcId =
  | 'revenge_free'
  | 'battle_trance'
  | 'raised_guard'
  | 'iron_resolve'
  | 'sudden_death'
  | 'victory_rush'
  | 'overpower_charge'
  | 'enrage';

export interface WarriorProcDef {
  id: WarriorProcId;
  auraKind: string;
  auraId?: string;
  iconAbilityId: string;
  theme: 'rage' | 'battle' | 'death' | 'victory';
  labelKey: TranslationKey | null;
}

interface KnownAbilityLike {
  def: { id: string };
}

interface AuraLike {
  kind: string;
}

const has = (ids: ReadonlySet<string>, id: string): boolean => ids.has(id);

export function availableWarriorProcDefs(
  playerClass: PlayerClass,
  known: readonly KnownAbilityLike[],
): WarriorProcDef[] {
  if (playerClass !== 'warrior') return [];
  const ids = new Set(known.map((ability) => ability.def.id));
  const out: WarriorProcDef[] = [];
  if (has(ids, 'revenge')) {
    out.push({
      id: 'revenge_free',
      auraKind: 'revenge_free',
      iconAbilityId: 'revenge',
      theme: 'rage',
      labelKey: 'hudChrome.auraOverlay.procs.revenge',
    });
  }
  const battleAbility = has(ids, 'mortal_strike')
    ? 'mortal_strike'
    : has(ids, 'heroic_strike')
      ? 'heroic_strike'
      : null;
  if (battleAbility) {
    out.push({
      id: 'battle_trance',
      auraKind: 'battle_trance',
      iconAbilityId: battleAbility,
      theme: 'battle',
      labelKey: 'hudChrome.auraOverlay.procs.battleTrance',
    });
  }
  if (has(ids, 'raised_guard')) {
    out.push({
      id: 'raised_guard',
      auraKind: 'buff_dr_phys',
      auraId: 'raised_guard_dr',
      iconAbilityId: 'raised_guard',
      theme: 'battle',
      labelKey: null,
    });
  }
  if (has(ids, 'iron_resolve')) {
    out.push({
      id: 'iron_resolve',
      auraKind: 'absorb',
      auraId: 'iron_resolve',
      iconAbilityId: 'iron_resolve',
      theme: 'victory',
      labelKey: null,
    });
  }
  if (has(ids, 'overpower') && has(ids, 'mortal_strike')) {
    out.push({
      id: 'overpower_charge',
      auraKind: 'overpower_charge',
      iconAbilityId: 'overpower',
      theme: 'battle',
      labelKey: 'hudChrome.auraOverlay.procs.overpowerCharge',
    });
  }
  if (has(ids, 'sudden_death') && has(ids, 'execute')) {
    out.push({
      id: 'sudden_death',
      auraKind: 'sudden_death',
      iconAbilityId: 'execute',
      theme: 'death',
      labelKey: 'hudChrome.auraOverlay.procs.suddenDeath',
    });
  }
  if (has(ids, 'victory_rush')) {
    out.push({
      id: 'victory_rush',
      auraKind: 'victory_rush',
      iconAbilityId: 'victory_rush',
      theme: 'victory',
      labelKey: 'hudChrome.auraOverlay.procs.victoryRush',
    });
  }
  if (has(ids, 'enrage_passive') || has(ids, 'bloodthirst') || has(ids, 'red_harvest')) {
    out.push({
      id: 'enrage',
      auraKind: 'enrage',
      iconAbilityId: has(ids, 'bloodthirst') ? 'bloodthirst' : 'red_harvest',
      theme: 'rage',
      labelKey: 'hudChrome.auraOverlay.procs.enrage',
    });
  }
  return out;
}

export function activeWarriorProcIds(auras: readonly AuraLike[]): Set<WarriorProcId> {
  const active = new Set<WarriorProcId>();
  for (const aura of auras) {
    if (
      aura.kind === 'revenge_free' ||
      aura.kind === 'battle_trance' ||
      aura.kind === 'sudden_death' ||
      aura.kind === 'victory_rush' ||
      aura.kind === 'overpower_charge' ||
      aura.kind === 'enrage'
    ) {
      active.add(aura.kind);
    }
  }
  return active;
}
