import { describe, expect, it } from 'vitest';
import { SHADOW_GUARDS } from '../src/sim/content/world_quest_shadow';
import { shadowBehindCarrier, shadowPatrolPosition } from '../src/sim/world_quest_shadow_patrol';

describe('readable lantern patrol openings', () => {
  it('pauses at each endpoint and walks continuously between watches', () => {
    const start = { x: 0, z: 0 },
      patrol = { x: 24, z: 0, period: 12, pause: 3 };
    expect(shadowPatrolPosition(start, patrol, 0).x).toBe(0);
    expect(shadowPatrolPosition(start, patrol, 2.9).x).toBe(0);
    expect(shadowPatrolPosition(start, patrol, 9).x).toBe(12);
    expect(shadowPatrolPosition(start, patrol, 15).x).toBe(24);
    expect(shadowPatrolPosition(start, patrol, 17.9).x).toBe(24);
    expect(shadowPatrolPosition(start, patrol, 24).x).toBe(12);
    expect(shadowPatrolPosition(start, patrol, 30).x).toBe(0);
  });
  it('gives every carrier repeated safe three-second rear openings and genuine patrol danger', () => {
    const sentries = SHADOW_GUARDS.filter((row) => row.sentry);
    for (const carrier of SHADOW_GUARDS.filter((row) => !row.sentry)) {
      const player = {
        x: carrier.npc.pos.x - 2 * Math.sin(carrier.npc.facing),
        z: carrier.npc.pos.z - 2 * Math.cos(carrier.npc.facing),
      };
      let safe = 0,
        longest = 0,
        danger = 0,
        windows = 0;
      for (let i = 0; i < 2400; i++) {
        const exposed = sentries.some((sentry) => {
          const pos = shadowPatrolPosition(sentry.npc.pos, sentry.patrol!, i / 20);
          return Math.hypot(player.x - pos.x, player.z - pos.z) < sentry.detectionRadius;
        });
        if (exposed) {
          danger++;
          safe = 0;
        } else {
          safe++;
          longest = Math.max(longest, safe);
          if (safe === 60) windows++;
        }
      }
      expect(longest, carrier.npc.id).toBeGreaterThanOrEqual(60);
      expect(windows, carrier.npc.id).toBeGreaterThanOrEqual(2);
      expect(danger, carrier.npc.id).toBeGreaterThan(0);
      expect(
        shadowBehindCarrier(player, { pos: carrier.npc.pos, facing: carrier.npc.facing }),
      ).toBe(true);
    }
  });
});

it('keeps the cloak start and retreat point outside both patrols for the whole cycle', () => {
  for (let i = 0; i < 2400; i++) {
    for (const sentry of SHADOW_GUARDS.filter((guard) => guard.sentry)) {
      if (!sentry.patrol) throw new Error('missing sentry patrol');
      const pos = shadowPatrolPosition(sentry.npc.pos, sentry.patrol, i / 20);
      expect(Math.hypot(48 - pos.x, 12 - pos.z)).toBeGreaterThan(sentry.detectionRadius);
    }
  }
});
