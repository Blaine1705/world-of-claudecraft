// Pure pins for Regional Mastery: the milestone ladder, the sanitized counts
// map (world quest zones only, whole non-negative numbers, zeros dropped),
// the per-zone and best-zone readers, and the rung arithmetic the UI paints.

import { describe, expect, it } from 'vitest';
import {
  bestZoneCompletionCount,
  isWorldQuestZone,
  REGIONAL_MASTERY_MILESTONES,
  regionalMasteryProgress,
  sanitizeZoneCompletionCounts,
  zoneCompletionCount,
} from '../src/sim/regional_mastery';
import { WORLD_QUEST_ZONES } from '../src/sim/world_quest_rotation';

describe('REGIONAL_MASTERY_MILESTONES', () => {
  it('is the design ladder, strictly climbing', () => {
    expect([...REGIONAL_MASTERY_MILESTONES]).toEqual([10, 25, 50, 100, 250]);
    for (let i = 1; i < REGIONAL_MASTERY_MILESTONES.length; i++) {
      expect(REGIONAL_MASTERY_MILESTONES[i]).toBeGreaterThan(REGIONAL_MASTERY_MILESTONES[i - 1]);
    }
  });
});

describe('sanitizeZoneCompletionCounts', () => {
  it('keeps world quest zones with whole positive counts and drops everything else', () => {
    const zone = WORLD_QUEST_ZONES[0];
    expect(
      sanitizeZoneCompletionCounts({
        [zone]: 37.9,
        [WORLD_QUEST_ZONES[1]]: 0,
        [WORLD_QUEST_ZONES[2]]: -4,
        [WORLD_QUEST_ZONES[3]]: Number.NaN,
        [WORLD_QUEST_ZONES[4]]: '12',
        proving_shore: 9,
        nowhere: 3,
      }),
    ).toEqual({ [zone]: 37 });
    expect(sanitizeZoneCompletionCounts(null)).toEqual({});
    expect(sanitizeZoneCompletionCounts('junk')).toEqual({});
    expect(sanitizeZoneCompletionCounts([1, 2])).toEqual({});
  });

  it('answers the zone membership question the same way', () => {
    expect(isWorldQuestZone(WORLD_QUEST_ZONES[0])).toBe(true);
    expect(isWorldQuestZone('proving_shore')).toBe(false);
  });
});

describe('zone readers', () => {
  it('reads a zone count, zero when never credited, and the best zone across the map', () => {
    const counts = { [WORLD_QUEST_ZONES[0]]: 12, [WORLD_QUEST_ZONES[3]]: 40 };
    expect(zoneCompletionCount(counts, WORLD_QUEST_ZONES[0])).toBe(12);
    expect(zoneCompletionCount(counts, WORLD_QUEST_ZONES[1])).toBe(0);
    expect(zoneCompletionCount(undefined, WORLD_QUEST_ZONES[0])).toBe(0);
    expect(bestZoneCompletionCount(counts)).toBe(40);
    expect(bestZoneCompletionCount({})).toBe(0);
    expect(bestZoneCompletionCount(undefined)).toBe(0);
  });
});

describe('regionalMasteryProgress', () => {
  it('starts on the first rung with nothing reached', () => {
    expect(regionalMasteryProgress(0)).toEqual({
      count: 0,
      reached: 0,
      lastMilestone: null,
      nextMilestone: 10,
      progress: 0,
      required: 10,
      percent: 0,
    });
  });

  it('places a mid-ladder count inside its rung', () => {
    const p = regionalMasteryProgress(37);
    expect(p).toEqual({
      count: 37,
      reached: 2,
      lastMilestone: 25,
      nextMilestone: 50,
      progress: 12,
      required: 25,
      percent: 48,
    });
  });

  it('treats a milestone count as reached, with the next rung ahead', () => {
    const p = regionalMasteryProgress(25);
    expect(p.reached).toBe(2);
    expect(p.lastMilestone).toBe(25);
    expect(p.nextMilestone).toBe(50);
    expect(p.progress).toBe(0);
  });

  it('caps past the top rung at 100 percent with no next milestone', () => {
    const p = regionalMasteryProgress(400);
    expect(p.reached).toBe(REGIONAL_MASTERY_MILESTONES.length);
    expect(p.lastMilestone).toBe(250);
    expect(p.nextMilestone).toBeNull();
    expect(p.percent).toBe(100);
  });

  it('floors fractional and clamps negative or non-finite counts to zero', () => {
    expect(regionalMasteryProgress(9.9).count).toBe(9);
    expect(regionalMasteryProgress(-3).count).toBe(0);
    expect(regionalMasteryProgress(Number.NaN).count).toBe(0);
  });
});
