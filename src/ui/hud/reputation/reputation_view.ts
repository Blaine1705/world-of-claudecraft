// The Reputation tab's pure view core: one row per allied faction with the
// standing tier, the progress inside that tier and the tier that comes next,
// plus the day summary the tab shows beside them. DOM-free and clock-free (the
// window hands in `nowMs`), so tests and both hosts read the same decisions.
// The sim owns the standing model (src/sim/factions.ts): thresholds, tiers and
// the level-15 cap come from there, never re-derived here.
import {
  FACTION_IDS,
  FACTIONS,
  type FactionId,
  LOW_LEVEL_MAX_STANDING,
  MAX_STANDING,
  maxStandingForLevel,
  STANDING_TIERS,
  type StandingTier,
  standingProgress,
} from '../../../sim/factions';
import {
  isWorldQuestZone,
  REGIONAL_MASTERY_MILESTONES,
  regionalMasteryProgress,
} from '../../../sim/regional_mastery';
import type { WorldQuestProgress } from '../../../sim/types';

export interface ReputationRowView {
  readonly factionId: FactionId;
  readonly hubZoneId: string;
  readonly tier: StandingTier;
  /** The tier the bar fills toward; null at Champion. */
  readonly nextTier: StandingTier | null;
  /** Cumulative standing, clamped the way the sim clamps it. */
  readonly current: number;
  /** Progress inside the current tier: points earned and points required. */
  readonly tierProgress: number;
  readonly tierRequired: number;
  /** Whole percent of the current tier filled (100 at Champion). */
  readonly percent: number;
  /** True while the character's level caps standing below this row's next tier. */
  readonly cappedByLevel: boolean;
  /** The standing cap the level imposes when `cappedByLevel` (Trusted for 5-15). */
  readonly levelCap: number;
}

export interface ReputationDayView {
  /** World quests completed today out of the ones on the character's board. */
  readonly completed: number;
  readonly total: number;
  /** Milliseconds until the daily reset; 0 when the expiry is unknown or past. */
  readonly resetsInMs: number;
}

/** One zone's Regional Mastery: the permanent world-quest completion count
 *  and where it sits on the milestone ladder. */
export interface RegionalMasteryRowView {
  readonly zoneId: string;
  readonly factionId: FactionId;
  readonly count: number;
  /** Milestones passed, out of REGIONAL_MASTERY_MILESTONES.length. */
  readonly reached: number;
  readonly nextMilestone: number | null;
  /** Count since the last milestone, and the rung's length. */
  readonly progress: number;
  readonly required: number;
  readonly percent: number;
}

export interface ReputationView {
  readonly rows: readonly ReputationRowView[];
  readonly day: ReputationDayView;
  /** Regional Mastery, one row per world-quest zone in faction order. */
  readonly mastery: readonly RegionalMasteryRowView[];
  readonly masteryMilestoneCount: number;
  /** Every tier in ascending order, for the legend. */
  readonly tiers: readonly StandingTier[];
}

export interface ReputationViewInput {
  readonly factions: Readonly<Partial<Record<FactionId, number>>>;
  readonly level: number;
  readonly worldQuestLog: ReadonlyMap<string, WorldQuestProgress>;
  readonly worldQuestExpiresAtMs: number;
  readonly nowMs: number;
  /** Permanent per-zone world-quest completion counts (IWorld.worldQuestZoneCounts). */
  readonly zoneCounts: Readonly<Record<string, number>>;
}

/** Regional Mastery rows: every world-quest zone, grouped by faction in
 *  FACTION_IDS order and each faction's own zone order, so the list reads
 *  like the standing cards above it. */
export function buildRegionalMasteryRows(
  zoneCounts: Readonly<Record<string, number>>,
): RegionalMasteryRowView[] {
  const rows: RegionalMasteryRowView[] = [];
  for (const factionId of FACTION_IDS) {
    for (const zoneId of FACTIONS[factionId].zones) {
      if (!isWorldQuestZone(zoneId)) continue;
      const p = regionalMasteryProgress(zoneCounts[zoneId] ?? 0);
      rows.push({
        zoneId,
        factionId,
        count: p.count,
        reached: p.reached,
        nextMilestone: p.nextMilestone,
        progress: p.progress,
        required: p.required,
        percent: p.percent,
      });
    }
  }
  return rows;
}

export function buildReputationRow(
  factionId: FactionId,
  standing: number,
  level: number,
): ReputationRowView {
  const progress = standingProgress(standing);
  const levelCap = maxStandingForLevel(level);
  const cappedByLevel = progress.tierNext !== null && progress.tierNext > levelCap;
  return {
    factionId,
    hubZoneId: FACTIONS[factionId].hub.zoneId,
    tier: progress.tier,
    nextTier:
      progress.tierNext === null
        ? null
        : (STANDING_TIERS[STANDING_TIERS.indexOf(progress.tier) + 1] ?? null),
    current: progress.current,
    tierProgress: progress.tierProgress,
    tierRequired: progress.tierRequired,
    percent: progress.percent,
    cappedByLevel,
    levelCap,
  };
}

export function buildReputationView(input: ReputationViewInput): ReputationView {
  const rows = FACTION_IDS.map((id) =>
    buildReputationRow(id, input.factions[id] ?? 0, input.level),
  );
  let completed = 0;
  for (const progress of input.worldQuestLog.values()) {
    if (progress.state === 'completed') completed++;
  }
  const expires = input.worldQuestExpiresAtMs;
  const resetsInMs =
    Number.isFinite(expires) && Number.isFinite(input.nowMs) && expires > input.nowMs
      ? expires - input.nowMs
      : 0;
  return {
    rows,
    day: { completed, total: input.worldQuestLog.size, resetsInMs },
    mastery: buildRegionalMasteryRows(input.zoneCounts),
    masteryMilestoneCount: REGIONAL_MASTERY_MILESTONES.length,
    tiers: STANDING_TIERS,
  };
}

/** The standing ceiling the tab reports as the end of the track. */
export const REPUTATION_MAX_STANDING = MAX_STANDING;
/** The ceiling levels 5 to 15 see, so the tab can say what lifts it. */
export const REPUTATION_LOW_LEVEL_CAP = LOW_LEVEL_MAX_STANDING;
