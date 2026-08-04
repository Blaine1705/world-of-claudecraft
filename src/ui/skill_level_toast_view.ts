// Pure, host-agnostic celebration plan for profession skill level-ups
// (gathering proficiency and craft skill counters). Skills gain fractional
// amounts; the player-visible "level" is the floored integer, so a toast fires
// only when that floor climbs (classic "skill increased to N" feedback).
//
// The buildCraftCelebrationPlan shape (craft_celebration_view.ts): the HUD arm
// stays a thin consumer and the batching rules are unit-pinned here. DOM-free
// and i18n-free so tests/skill_level_toast_view.test.ts drives it directly.
//
// Silent first observation (null prev): a fresh cprof/gprof mirror never toasts
// the player's whole history on login/join. `synced` gates the same way craft
// tier-ups do: the pre-mirror {} must never become a baseline.

/** Display level for a (possibly fractional) skill counter: floor of a
 *  non-negative value, 0 for anything non-positive or non-finite. */
export function skillDisplayLevel(skill: number): number {
  if (!(skill > 0) || !Number.isFinite(skill)) return 0;
  return Math.floor(skill);
}

/** One skill whose floored display level climbed between two snapshots. */
export interface SkillLevelUp {
  skillId: string;
  toLevel: number;
}

/**
 * Integer skill-level crossings between two skill maps. One entry per skill
 * that climbed, carrying the final display level (a multi-point jump reports
 * only the final floor). `prev === null` is the silent first observation.
 */
export function computeSkillLevelUps(
  prev: Readonly<Record<string, number>> | null,
  next: Readonly<Record<string, number>>,
): SkillLevelUp[] {
  if (prev === null) return [];
  const ups: SkillLevelUp[] = [];
  for (const skillId in next) {
    const toLevel = skillDisplayLevel(next[skillId]);
    const fromLevel = skillDisplayLevel(prev[skillId] ?? 0);
    if (toLevel > fromLevel) ups.push({ skillId, toLevel });
  }
  return ups;
}

export interface SkillLevelObservation {
  skillUps: SkillLevelUp[];
  prev: Record<string, number> | null;
}

const NO_SKILL_UPS: SkillLevelUp[] = [];

/**
 * Per-drain skill-level observation: silent first synced baseline, then every
 * subsequent synced observation diffs floors. Always-on after init (no armed
 * window): craft skill can climb on craft/enchant/salvage/battlefield trickle,
 * and gathering proficiency applies the tick after gatherResult/fishingResult,
 * so an event-armed window would miss quiet drains. Guarded on `synced` so a
 * pre-mirror {} never becomes a baseline.
 */
export function observeSkillLevels(
  synced: boolean,
  prev: Record<string, number> | null,
  next: Readonly<Record<string, number>>,
): SkillLevelObservation {
  if (!synced) return { skillUps: NO_SKILL_UPS, prev };
  if (prev === null) return { skillUps: NO_SKILL_UPS, prev: { ...next } };
  const skillUps = computeSkillLevelUps(prev, next);
  // Carry values forward in place (skills only ever climb, keys never leave),
  // avoiding a per-drain snapshot allocation.
  for (const skillId in next) {
    if (prev[skillId] !== next[skillId]) prev[skillId] = next[skillId];
  }
  return { skillUps, prev };
}

export interface SkillLevelCelebrationPlan {
  /** One log line each, in observation order. */
  skillUpLogs: SkillLevelUp[];
  /** Coalesced single banner slot: the LAST skill-up wins when several climb
   *  in one drain (the log carries every line). */
  banner: SkillLevelUp | null;
  /** At most one celebration sound per drain. */
  playSound: boolean;
  /** Motion-only flourishes; false under reducedMotion. Never gates the log
   *  lines, the banner text, or the sound (information survives). */
  motion: boolean;
}

/** Plan the HUD reaction to one drain's skill level-ups. */
export function buildSkillLevelCelebrationPlan(
  skillUps: readonly SkillLevelUp[],
  reducedMotion: boolean,
): SkillLevelCelebrationPlan {
  const skillUpLogs = [...skillUps];
  const last = skillUpLogs[skillUpLogs.length - 1];
  const banner = last !== undefined ? last : null;
  return {
    skillUpLogs,
    banner,
    playSound: banner !== null,
    motion: banner !== null && !reducedMotion,
  };
}

/** Resolve painted profession art id for a craft or gathering skill id.
 *  The caller still resolves through professionImageUrl, which returns null
 *  when the art file is absent from the registry. */
export function skillLevelArtId(skillId: string): string {
  // Gathering ids (mining/logging/herbalism/fishing) and craft ring ids share
  // disjoint prefixes in the profession art registry.
  if (
    skillId === 'mining' ||
    skillId === 'logging' ||
    skillId === 'herbalism' ||
    skillId === 'fishing'
  ) {
    return `gather_${skillId}`;
  }
  return `prof_${skillId}`;
}
