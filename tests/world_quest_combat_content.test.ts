import { describe, expect, it } from 'vitest';
import { resolvePosition } from '../src/sim/colliders';
import { DEEDS } from '../src/sim/content/deeds';
import { COMBAT_QUEST_SITES, COMBAT_WORLD_QUESTS } from '../src/sim/content/world_quest_combat';
import { CAMPS, MOBS, NPCS, WORLD_QUESTS_BY_ID } from '../src/sim/data';
import { findPlayerPath, PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { groundHeight, waterLevelAt } from '../src/sim/world';
import {
  activeWorldQuestsForCycle,
  worldQuestCycleOfferingQuest,
} from '../src/sim/world_quest_rotation';
import { WORLD_SEED } from '../src/sim/world_seed';

describe('combat expedition content', () => {
  it('publishes only the three retained combat expeditions', () => {
    expect(COMBAT_QUEST_SITES.map((site) => site.encounterId)).toEqual([
      'warband',
      'restless_company',
      'hold_highwatch',
    ]);
    const questIds = COMBAT_WORLD_QUESTS.map((quest) => quest.id);
    expect(questIds).not.toContain('wq_thornpeak_beast_hunt');
    expect(questIds).not.toContain('wq_thornpeak_break_command');
  });

  it('places Restless Company on the flatter eastern clearing', () => {
    const site = COMBAT_QUEST_SITES.find(
      (candidate) => candidate.encounterId === 'restless_company',
    )!;
    expect(site.start).toEqual({ x: 75, z: 710 });
    expect(site.center).toEqual({ x: 100, z: 690 });
    const heights: number[] = [];
    for (let dx = -24; dx <= 24; dx += 4) {
      for (let dz = -24; dz <= 24; dz += 4) {
        heights.push(groundHeight(site.center.x + dx, site.center.z + dz, WORLD_SEED));
      }
    }
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(25);
    let from = { x: 0, z: 660 };
    for (const to of findPlayerPath(WORLD_SEED, from, site.start)) {
      const distance = Math.hypot(to.x - from.x, to.z - from.z);
      const steps = Math.ceil(distance * 2);
      let height = groundHeight(from.x, from.z, WORLD_SEED);
      for (let step = 1; step <= steps; step++) {
        const x = from.x + ((to.x - from.x) * step) / steps;
        const z = from.z + ((to.z - from.z) * step) / steps;
        const nextHeight = groundHeight(x, z, WORLD_SEED);
        expect(Math.abs(nextHeight - height) / (distance / steps)).toBeLessThanOrEqual(
          PLAYER_MAX_CLIMB_SLOPE,
        );
        height = nextHeight;
      }
      from = to;
    }
  });
  it.each(['warband', 'restless_company'])(
    '%s keeps the battle spawns clear of ambient camps',
    (id) => {
      const site = COMBAT_QUEST_SITES.find((s) => s.encounterId === id)!;
      for (const camp of CAMPS.filter((c) => MOBS[c.mobId]?.aggroRadius > 0)) {
        expect(
          Math.hypot(camp.center.x - site.center.x, camp.center.z - site.center.z) - camp.radius,
          camp.mobId,
        ).toBeGreaterThan(46);
      }
      const points =
        id === 'warband'
          ? [
              [0, 8],
              [-18, 1],
              [17, 3],
              [0, 21],
              [-14, 3],
            ]
          : [
              [0, 8],
              [-15, 7],
              [-18, 9],
              [-21, 11],
              [-24, 13],
              [15, 7],
              [18, 9],
              [21, 11],
              [-16, 15],
              [16, 15],
            ];
      for (const [dx, dz] of points) {
        const p = { x: site.center.x + dx, z: site.center.z + dz };
        expect(groundHeight(p.x, p.z, WORLD_SEED)).toBeGreaterThan(
          waterLevelAt(p.x, p.z, WORLD_SEED) + 1,
        );
        const resolved = resolvePosition(WORLD_SEED, p.x, p.z, 0.6);
        expect(Math.hypot(resolved.x - p.x, resolved.z - p.z)).toBeLessThan(0.1);
        // Check the actual path, including its fallback: reachable endpoints alone
        // do not catch a cliff between the expedition NPC and the fight.
        let from = site.start;
        for (const to of findPlayerPath(WORLD_SEED, from, p)) {
          const distance = Math.hypot(to.x - from.x, to.z - from.z);
          const steps = Math.ceil(distance * 2);
          let height = groundHeight(from.x, from.z, WORLD_SEED);
          for (let step = 1; step <= steps; step++) {
            const x = from.x + ((to.x - from.x) * step) / steps;
            const z = from.z + ((to.z - from.z) * step) / steps;
            const nextHeight = groundHeight(x, z, WORLD_SEED);
            expect(Math.abs(nextHeight - height) / (distance / steps)).toBeLessThanOrEqual(
              PLAYER_MAX_CLIMB_SLOPE,
            );
            const point = resolvePosition(WORLD_SEED, x, z, 0.4);
            expect(Math.hypot(point.x - x, point.z - z)).toBeLessThan(0.1);
            height = nextHeight;
          }
          from = to;
        }
      }
    },
  );
  it.each(COMBAT_QUEST_SITES)(
    '$encounterId has an accessible existing NPC and a reachable rotation reward',
    (site) => {
      expect(NPCS[site.npcId]).toBeDefined();
      expect(DEEDS[site.deedId]?.trigger.kind).toBe('manual');
      expect(WORLD_QUESTS_BY_ID[site.questId]).toEqual(
        COMBAT_WORLD_QUESTS.find((q) => q.id === site.questId),
      );
      const cycle = worldQuestCycleOfferingQuest('wq3_0', site.questId);
      expect(activeWorldQuestsForCycle(cycle).map((q) => q.id)).toContain(site.questId);
      const p = site.start;
      expect(groundHeight(p.x, p.z, WORLD_SEED)).toBeGreaterThan(
        waterLevelAt(p.x, p.z, WORLD_SEED) + 0.5,
      );
      const resolved = resolvePosition(WORLD_SEED, p.x, p.z, 0.6);
      expect(Math.hypot(resolved.x - p.x, resolved.z - p.z)).toBeLessThan(0.1);
    },
  );
});
