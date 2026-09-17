// Regional Mastery: the permanent per-zone count of world quests a character
// has completed. It only ever climbs (a turn-in adds one), it never resets on
// a missed day (no streak, no decay), and it is separate from anything spent:
// currency and the daily board come and go, the count stays. At set milestones
// the character earns a Book of Deeds record; the milestone list is the single
// knob the design can move later, and every reader derives from it.
//
// Pure and host-agnostic: the sim increments the map at the world-quest
// credit site, the save and the wire carry it, the UI and the deed meter read
// it through the helpers here.

import { WORLD_QUEST_ZONES } from './world_quest_rotation';

/** The completion counts at which a zone's mastery advances a rung. */
export const REGIONAL_MASTERY_MILESTONES = [10, 25, 50, 100, 250] as const;

export type ZoneCompletionCounts = Readonly<Record<string, number>>;

const WORLD_QUEST_ZONE_SET: ReadonlySet<string> = new Set(WORLD_QUEST_ZONES);

/**
 * Clamp a saved or wired counts map to the shape the sim writes: only world
 * quest zones, non-negative whole numbers, zeros dropped. Unknown keys and
 * junk values vanish rather than throw (a legacy or hostile blob restores
 * cleanly).
 */
export function sanitizeZoneCompletionCounts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const zoneId of WORLD_QUEST_ZONES) {
    const value = (raw as Record<string, unknown>)[zoneId];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const whole = Math.floor(value);
    if (whole > 0) out[zoneId] = whole;
  }
  return out;
}

/** Whether a zone can carry a mastery count at all (it has world quests). */
export function isWorldQuestZone(zoneId: string): boolean {
  return WORLD_QUEST_ZONE_SET.has(zoneId);
}

/** The character's completion count for one zone (zero when never credited). */
export function zoneCompletionCount(counts: ZoneCompletionCounts | undefined, zoneId: string): number {
  const value = counts?.[zoneId];
  return typeof value === 'number' && value > 0 ? Math.floor(value) : 0;
}

/** The highest count across every zone: what the "in a single zone" deeds read. */
export function bestZoneCompletionCount(counts: ZoneCompletionCounts | undefined): number {
  let best = 0;
  for (const zoneId of WORLD_QUEST_ZONES) best = Math.max(best, zoneCompletionCount(counts, zoneId));
  return best;
}

export interface RegionalMasteryProgress {
  readonly count: number;
  /** How many milestones the count has passed (0 to the list length). */
  readonly reached: number;
  /** The last milestone passed, or null before the first. */
  readonly lastMilestone: number | null;
  /** The next milestone ahead, or null once every rung is passed. */
  readonly nextMilestone: number | null;
  /** Progress inside the current rung: count since the last milestone. */
  readonly progress: number;
  /** The rung's length: next minus last (the whole span past the top). */
  readonly required: number;
  /** progress / required as 0..100, 100 past the top. */
  readonly percent: number;
}

/** Where a zone's count sits on the milestone ladder. */
export function regionalMasteryProgress(count: number): RegionalMasteryProgress {
  const whole = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  let reached = 0;
  for (const milestone of REGIONAL_MASTERY_MILESTONES) if (whole >= milestone) reached++;
  const lastMilestone = reached > 0 ? REGIONAL_MASTERY_MILESTONES[reached - 1] : null;
  const nextMilestone =
    reached < REGIONAL_MASTERY_MILESTONES.length ? REGIONAL_MASTERY_MILESTONES[reached] : null;
  const floor = lastMilestone ?? 0;
  const progress = whole - floor;
  const required = nextMilestone === null ? Math.max(1, progress) : nextMilestone - floor;
  const percent = nextMilestone === null ? 100 : Math.min(100, (progress / required) * 100);
  return { count: whole, reached, lastMilestone, nextMilestone, progress, required, percent };
}
