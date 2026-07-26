import { ABILITIES, abilitiesKnownAt } from './content/classes';
import {
  computeTalentModifiers,
  repairAllocation,
  SAVED_LOADOUT_BAR_SLOTS,
  type SavedLoadout,
  type TalentAllocation,
} from './content/talents';
import type { CharacterState } from './sim';
import { repairTalentLoadouts } from './talent_loadouts';
import { MAX_LEVEL, type PlayerClass } from './types';

const TALENTS_V2_CONTENT_REVISION = 1;

/**
 * Latest production character-JSON revision. 1: the v0.26 Talents V2 rollout.
 * 2: the v0.31 class-overhaul wave (hunter, shaman, priest, paladin, rogue);
 * changed option ids get a free row repick, and the repair scrubs retired row
 * grants (for rogues: Contingency, Wraith Strike, Shadecloak) off saved bars.
 * Untouched classes keep their build and bar layout and only advance the marker,
 * but every class is still scrubbed of ability ids it cannot use (see below).
 */
export const CURRENT_CHARACTER_CONTENT_REVISION = 2;

/**
 * The classes whose kit actually changed AT `CURRENT_CHARACTER_CONTENT_REVISION`.
 * These get the full repair: a free row repick, plus empty bar slots refilled with
 * their new baseline actives.
 *
 * WHEN YOU REDESIGN A CLASS: bump `CURRENT_CHARACTER_CONTENT_REVISION` and rewrite
 * this set to the classes redesigned at the NEW revision (it is per-revision, not
 * cumulative). This list was `cls !== 'hunter'` while the v0.29 hunter redesign was
 * the only one in flight; paladin (#2428) and rogue (#2328) landed later in the same
 * wave and were silently missed, which left retired ids like `judgement` sitting on
 * live bars. Forgetting the list is no longer that dangerous, because the scrub below
 * runs for every class, but a redesigned class left out of it still loses its free
 * repick and its refilled bar.
 */
const REDESIGNED_AT_CURRENT_REVISION: ReadonlySet<PlayerClass> = new Set<PlayerClass>([
  'hunter',
  'shaman',
  'priest',
  'paladin',
  'rogue',
]);

function migrationLevel(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_LEVEL, Math.trunc(value)));
}

function isMainBarAbility(cls: PlayerClass, abilityId: string): boolean {
  const ability = ABILITIES[abilityId];
  return (
    ability?.class === cls &&
    ability.passive !== true &&
    ability.exclusiveGroup !== 'warrior_stance'
  );
}

function canSeedOnMainBar(cls: PlayerClass, abilityId: string): boolean {
  const ability = ABILITIES[abilityId];
  return (
    isMainBarAbility(cls, abilityId) &&
    ability?.requiresForm === undefined &&
    ability?.requiresStealth !== true
  );
}

/**
 * Keep valid positions, drop obsolete/duplicate/passive entries, then (only when
 * `seed` is set) fill empty slots with deterministic baseline/spec actives.
 * Computing seed candidates with an empty row map prevents unselected row grants
 * from leaking onto the bar.
 *
 * The drop half runs for EVERY class: a slot naming an ability the character cannot
 * use is dead whoever owns it, and nothing else removes it (talent_loadouts.repairBar
 * only checks the slot is a string). The seed half is what would disturb a bar a
 * player deliberately left gapped, so it stays gated to the redesigned classes.
 */
function migrateLoadoutBar(
  cls: PlayerClass,
  level: number,
  allocation: TalentAllocation,
  value: readonly (string | null)[],
  seed: boolean,
): (string | null)[] {
  const fullMods = computeTalentModifiers(cls, allocation, level);
  const known = new Set(abilitiesKnownAt(cls, level, fullMods).map((entry) => entry.def.id));
  const seen = new Set<string>();
  const bar = Array.from({ length: SAVED_LOADOUT_BAR_SLOTS }, (_, index) => {
    const abilityId = value[index];
    if (
      typeof abilityId !== 'string' ||
      !known.has(abilityId) ||
      !isMainBarAbility(cls, abilityId) ||
      seen.has(abilityId)
    ) {
      return null;
    }
    seen.add(abilityId);
    return abilityId;
  });

  if (!seed) return bar;

  const specOnly = computeTalentModifiers(cls, { spec: allocation.spec, rows: {} }, level);
  const seedIds = abilitiesKnownAt(cls, level, specOnly)
    .map((entry) => entry.def.id)
    .filter((abilityId) => canSeedOnMainBar(cls, abilityId));
  for (const abilityId of seedIds) {
    if (seen.has(abilityId)) continue;
    const empty = bar.indexOf(null);
    if (empty < 0) break;
    bar[empty] = abilityId;
    seen.add(abilityId);
  }
  return bar;
}

function migrateLoadouts(
  cls: PlayerClass,
  level: number,
  value: unknown,
  activeValue: unknown,
  seed: boolean,
): { loadouts: SavedLoadout[]; activeLoadout: number } {
  const repaired = repairTalentLoadouts(cls, level, value, activeValue);
  return {
    activeLoadout: repaired.activeLoadout,
    loadouts: repaired.loadouts.map((loadout) => ({
      name: loadout.name,
      alloc: loadout.alloc,
      bar: migrateLoadoutBar(cls, level, loadout.alloc, loadout.bar, seed),
    })),
  };
}

/**
 * Pure one-way content migration. Revision 1 converted production point-tree saves
 * to canonical `{spec, rows}`. Revision 2 gives every class redesigned in the v0.31
 * wave a free row repick and refills its bar. A class nobody redesigned keeps its
 * build and bar layout and only advances the marker, but is still scrubbed of
 * ability ids it cannot use. Reapplying the current revision is an identity
 * operation.
 */
export function migrateCharacterTalentsV2(cls: PlayerClass, state: CharacterState): CharacterState {
  const revision = Number.isSafeInteger(state.contentRevision)
    ? (state.contentRevision as number)
    : 0;
  if (revision >= CURRENT_CHARACTER_CONTENT_REVISION) return state;

  // A pre-v1 save always needs the full conversion; at v1 and up only a class this
  // revision actually redesigned does.
  const fullRepair =
    revision < TALENTS_V2_CONTENT_REVISION || REDESIGNED_AT_CURRENT_REVISION.has(cls);

  const level = migrationLevel(state.level);
  const talents = fullRepair ? repairAllocation(cls, state.talents, level) : state.talents;
  const migratedLoadouts = migrateLoadouts(
    cls,
    level,
    state.loadouts,
    state.activeLoadout,
    fullRepair,
  );
  return {
    ...state,
    contentRevision: CURRENT_CHARACTER_CONTENT_REVISION,
    talents,
    loadouts: migratedLoadouts.loadouts,
    activeLoadout: migratedLoadouts.activeLoadout,
  };
}
