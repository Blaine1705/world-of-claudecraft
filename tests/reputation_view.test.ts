import { describe, expect, it } from 'vitest';
import {
  FACTION_IDS,
  LOW_LEVEL_MAX_STANDING,
  MAX_STANDING,
  STANDING_THRESHOLDS,
} from '../src/sim/factions';
import type { WorldQuestProgress } from '../src/sim/types';
import {
  buildRegionalMasteryRows,
  buildReputationRow,
  buildReputationView,
} from '../src/ui/hud/reputation/reputation_view';

const log = (rows: Array<[string, WorldQuestProgress['state']]>) =>
  new Map<string, WorldQuestProgress>(
    rows.map(([questId, state]) => [questId, { questId, count: 0, state } as WorldQuestProgress]),
  );

describe('reputation view: one row per allied faction', () => {
  it('lists every faction in catalogue order with its hub zone, even at zero standing', () => {
    const view = buildReputationView({
      factions: {},
      level: 20,
      worldQuestLog: new Map(),
      worldQuestExpiresAtMs: 0,
      zoneCounts: {},
      nowMs: 0,
    });
    expect(view.rows.map((row) => row.factionId)).toEqual([...FACTION_IDS]);
    expect(view.rows.map((row) => row.hubZoneId)).toEqual([
      'palmreach',
      'eastbrook_vale',
      'drakelands',
    ]);
    for (const row of view.rows) {
      expect(row.tier).toBe('unknown');
      expect(row.nextTier).toBe('recognized');
      expect(row.percent).toBe(0);
      expect(row.current).toBe(0);
    }
  });

  it('fills the bar inside the current tier and names the tier that comes next', () => {
    const row = buildReputationRow('rift_watch', 3_400, 20);
    expect(row.tier).toBe('trusted');
    expect(row.nextTier).toBe('proven');
    expect(row.tierProgress).toBe(3_400 - STANDING_THRESHOLDS.trusted);
    expect(row.tierRequired).toBe(STANDING_THRESHOLDS.proven - STANDING_THRESHOLDS.trusted);
    expect(row.percent).toBe(10);
    expect(row.cappedByLevel).toBe(false);
  });

  it('a Champion row has no next tier and reads full', () => {
    const row = buildReputationRow('church_order', MAX_STANDING + 500, 20);
    expect(row.tier).toBe('champion');
    expect(row.nextTier).toBeNull();
    expect(row.percent).toBe(100);
    expect(row.current).toBe(MAX_STANDING);
  });

  it('says when the character level, not the points, is what caps the track', () => {
    const atCap = buildReputationRow('automatons', LOW_LEVEL_MAX_STANDING, 12);
    expect(atCap.tier).toBe('trusted');
    expect(atCap.cappedByLevel).toBe(true);
    expect(atCap.levelCap).toBe(LOW_LEVEL_MAX_STANDING);
    const belowCap = buildReputationRow('automatons', 500, 12);
    expect(belowCap.cappedByLevel).toBe(false);
    const sameAtSixteen = buildReputationRow('automatons', LOW_LEVEL_MAX_STANDING, 16);
    expect(sameAtSixteen.cappedByLevel).toBe(false);
  });
});

describe('reputation view: the day summary', () => {
  it('counts completed quests against the board and the time until the reset', () => {
    const view = buildReputationView({
      factions: { rift_watch: 30 },
      level: 20,
      worldQuestLog: log([
        ['wq_a', 'completed'],
        ['wq_b', 'active'],
        ['wq_c', 'completed'],
      ]),
      worldQuestExpiresAtMs: 10_000,
      zoneCounts: {},
      nowMs: 4_000,
    });
    expect(view.day).toEqual({ completed: 2, total: 3, resetsInMs: 6_000 });
    expect(view.tiers).toEqual([
      'unknown',
      'recognized',
      'trusted',
      'proven',
      'vanguard',
      'champion',
    ]);
  });

  it('reports no reset time for an unknown or past expiry instead of a negative one', () => {
    const past = buildReputationView({
      factions: {},
      level: 20,
      worldQuestLog: new Map(),
      worldQuestExpiresAtMs: 1_000,
      zoneCounts: {},
      nowMs: 5_000,
    });
    expect(past.day.resetsInMs).toBe(0);
    const unknown = buildReputationView({
      factions: {},
      level: 20,
      worldQuestLog: new Map(),
      worldQuestExpiresAtMs: Number.NaN,
      zoneCounts: {},
      nowMs: 5_000,
    });
    expect(unknown.day.resetsInMs).toBe(0);
  });
});

describe('buildRegionalMasteryRows', () => {
  it('lists every world-quest zone in faction order with its count and milestone rung', () => {
    const rows = buildRegionalMasteryRows({ farshore_isle: 37, drakelands: 250, nowhere: 9 });
    // Faction order: Rift Watch zones, then Church Order, then Automatons.
    expect(rows.map((r) => r.factionId)).toEqual([
      ...Array(5).fill('rift_watch'),
      ...Array(5).fill('church_order'),
      ...Array(4).fill('automatons'),
    ]);
    expect(rows).toHaveLength(14);
    const farshore = rows.find((r) => r.zoneId === 'farshore_isle');
    expect(farshore).toMatchObject({
      count: 37,
      reached: 2,
      nextMilestone: 50,
      progress: 12,
      required: 25,
      percent: 48,
    });
    const drakelands = rows.find((r) => r.zoneId === 'drakelands');
    expect(drakelands).toMatchObject({ count: 250, reached: 5, nextMilestone: null, percent: 100 });
    // A zone never credited sits on the first rung.
    const fresh = rows.find((r) => r.zoneId === 'eastbrook_vale');
    expect(fresh).toMatchObject({ count: 0, reached: 0, nextMilestone: 10, percent: 0 });
    // The tutorial shore has no world quests and never appears.
    expect(rows.some((r) => r.zoneId === 'proving_shore')).toBe(false);
  });

  it('rides the reputation view with the milestone count', () => {
    const view = buildReputationView({
      factions: {},
      level: 20,
      worldQuestLog: new Map(),
      worldQuestExpiresAtMs: 0,
      nowMs: 0,
      zoneCounts: { palmreach: 10 },
    });
    expect(view.masteryMilestoneCount).toBe(5);
    expect(view.mastery.find((r) => r.zoneId === 'palmreach')?.reached).toBe(1);
  });
});
