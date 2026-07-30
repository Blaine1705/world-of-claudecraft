// R35 GM professions inspector: normalize a character's persisted-state blob
// (or a live serializeCharacter snapshot, the same CharacterState shape) into
// the admin dashboard's professions read. PURE, no SQL, no IO, the
// character_sheet.ts pattern, so the shaping is unit-testable without a pool.
//
// Reads follow the blob's own back-compat rules: gathering proficiency
// prefers `gatheringProficiency` and falls back to the legacy `professions`
// key (the dual-write pair), every absent field loads to its documented
// default, and node timers pass through as the persisted remaining-second
// deltas (anchored at save time for a blob, at serialize time for a live
// snapshot; the `live` flag tells the operator which clock they are reading).

import { CRAFT_RING, GATHERING_PROFESSION_IDS, TOOL_EFFECTS } from '../src/sim/content/professions';
import { ITEMS } from '../src/sim/data';
import { gatherNodeById } from '../src/sim/professions/gathering';
import { tierForSkill } from '../src/sim/professions/wheel';
import type { CharacterState } from '../src/sim/sim';
import type { AdminCharacterProfessionsRow } from './admin_db';

export interface ProfessionsGatheringRow {
  professionId: string;
  proficiency: number;
}

export interface ProfessionsCraftRow {
  craftId: string;
  skill: number;
  tier: number;
}

export interface ProfessionsSlotRow {
  professionId: string;
  effectId: string;
  durability: number;
  maxDurability: number;
  // Signer provenance (server-only in the game wire; operators are staff and
  // need it to judge a restore, so the admin read carries it).
  craftedBy: string | null;
  confirmMode: string;
}

export interface ProfessionsNodeTimerRow {
  nodeId: string;
  // Enrichment from live content; null when the saved node id no longer
  // resolves (a retired node: the load-side filter will drop it anyway).
  zoneId: string | null;
  nodeType: string | null;
  remainingSeconds: number;
}

export interface CharacterProfessionsSheet {
  characterId: number;
  name: string;
  class: string;
  level: number;
  accountId: number;
  username: string;
  // True when the state came from a live serializeCharacter snapshot rather
  // than the stored blob (which lags the 30s autosave for an online player).
  live: boolean;
  // The blob's save time; null for a live snapshot (it is "now").
  updatedAt: string | null;
  archetype: {
    activeArchetype: string | null;
    pairedMajor: string | null;
    hobbyCraft: string | null;
  };
  gathering: ProfessionsGatheringRow[];
  crafting: ProfessionsCraftRow[];
  knownRecipes: number;
  slots: ProfessionsSlotRow[];
  nodeTimers: ProfessionsNodeTimerRow[];
  // The live tool-effect vocabulary, server-authored so the restore-slot
  // select renders data instead of a client-side mirror that could drift.
  toolEffectIds: string[];
}

export interface CharacterProfessionsInput {
  characterId: number;
  name: string;
  class: string;
  level: number;
  accountId: number;
  username: string;
  state: CharacterState;
  live: boolean;
  updatedAt: string | null;
}

export function characterProfessionsSheet(
  input: CharacterProfessionsInput,
): CharacterProfessionsSheet {
  const { state } = input;
  // Dual-key read, the loader's own rule: prefer the current key, fall back
  // to the legacy pre-rename `professions`, default every profession to 0.
  const gatheringMap = state.gatheringProficiency ?? state.professions ?? {};
  const gathering = GATHERING_PROFESSION_IDS.map((professionId) => ({
    professionId,
    proficiency: gatheringMap[professionId] ?? 0,
  }));
  const craftSkills = state.craftSkills ?? {};
  const crafting = CRAFT_RING.map((craft) => {
    const skill = craftSkills[craft.id] ?? 0;
    return { craftId: craft.id, skill, tier: tierForSkill(skill) };
  });
  const slots: ProfessionsSlotRow[] = Object.entries(state.toolEffectSlots ?? {}).flatMap(
    ([professionId, slot]) =>
      slot
        ? [
            {
              professionId,
              effectId: slot.effectId,
              durability: slot.durability,
              maxDurability: slot.maxDurability,
              craftedBy: slot.craftedBy ?? null,
              confirmMode: slot.confirmMode,
            },
          ]
        : [],
  );
  const nodeTimers = Object.entries(state.nodeHarvestCooldowns ?? {})
    .map(([nodeId, remainingSeconds]) => {
      const node = gatherNodeById(nodeId);
      return {
        nodeId,
        zoneId: node?.zoneId ?? null,
        nodeType: node?.type ?? null,
        remainingSeconds,
      };
    })
    .sort((a, b) => b.remainingSeconds - a.remainingSeconds || a.nodeId.localeCompare(b.nodeId));
  const archetype = state.archetype ?? {};
  return {
    characterId: input.characterId,
    name: input.name,
    class: input.class,
    level: input.level,
    accountId: input.accountId,
    username: input.username,
    live: input.live,
    updatedAt: input.updatedAt,
    archetype: {
      activeArchetype: archetype.activeArchetype ?? null,
      pairedMajor: archetype.pairedMajor ?? null,
      hobbyCraft: archetype.hobbyCraft ?? null,
    },
    gathering,
    crafting,
    knownRecipes: (state.knownRecipes ?? []).length,
    slots,
    nodeTimers,
    toolEffectIds: Object.keys(TOOL_EFFECTS),
  };
}

/** Shape one admin db row (plus an optional live serializeCharacter
 *  snapshot) into the sheet. The stored-blob cast lives HERE, beside the
 *  CharacterState type it asserts, so the admin handler never imports sim
 *  types; a live snapshot wins over the stored blob (it is fresher). */
export function characterProfessionsSheetFromRow(
  row: AdminCharacterProfessionsRow,
  liveState: CharacterState | null,
): CharacterProfessionsSheet {
  return characterProfessionsSheet({
    characterId: row.id,
    name: row.name,
    class: row.class,
    level: row.level,
    accountId: row.accountId,
    username: row.username,
    state: liveState ?? (row.state as CharacterState),
    live: liveState !== null,
    updatedAt: liveState !== null ? null : row.updatedAt,
  });
}

/** The dev_give clamp applied to a GM item restore: a positive integer count,
 *  at most 20 per action (a larger restore is several audited actions). */
export const RESTORE_ITEM_MAX_COUNT = 20;

/** Validate a restore-item request body. Returns the English error prose
 *  (the admin error model, reverse-mapped client-side) or null when valid.
 *  Validation runs BEFORE the audit write, so a fat-fingered request never
 *  leaves an audit row for a grant that was never possible; the runtime
 *  re-checks everything defensively. */
export function restoreItemBodyError(body: { itemId?: unknown; count?: unknown }): string | null {
  if (
    typeof body.itemId !== 'string' ||
    body.itemId.length === 0 ||
    !Object.hasOwn(ITEMS, body.itemId)
  ) {
    return 'unknown item id';
  }
  const count = body.count;
  if (
    typeof count !== 'number' ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > RESTORE_ITEM_MAX_COUNT
  ) {
    return `count must be a whole number between 1 and ${RESTORE_ITEM_MAX_COUNT}`;
  }
  return null;
}

/** Validate a restore-slot request body, same contract as
 *  restoreItemBodyError: pre-audit refusal in English prose, runtime
 *  re-checks defensively (the sim action owns the pair-validity rule). */
export function restoreSlotBodyError(body: {
  professionId?: unknown;
  effectId?: unknown;
}): string | null {
  if (
    typeof body.professionId !== 'string' ||
    !(GATHERING_PROFESSION_IDS as readonly string[]).includes(body.professionId)
  ) {
    return 'unknown gathering profession id';
  }
  if (typeof body.effectId !== 'string' || !Object.hasOwn(TOOL_EFFECTS, body.effectId)) {
    return 'unknown tool effect id';
  }
  return null;
}
