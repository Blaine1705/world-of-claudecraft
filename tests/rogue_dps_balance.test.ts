import { describe, expect, it } from 'vitest';
import {
  averageRogueDps,
  ROGUE_BAND_FIXTURE,
  type RogueProbeSpec,
} from '../scripts/rogue_dps_probe';
import { ITEMS } from '../src/sim/data';
import { bestEpicGearFor } from '../src/sim/dev/bis_gear';

const SPECS: RogueProbeSpec[] = ['assassination', 'combat', 'subtlety'];

function measuredDps(): Record<RogueProbeSpec, number> {
  return Object.fromEntries(
    SPECS.map((spec) => [
      spec,
      averageRogueDps(
        spec,
        ROGUE_BAND_FIXTURE.seeds,
        ROGUE_BAND_FIXTURE.seconds,
        ROGUE_BAND_FIXTURE.targetArmor,
        ROGUE_BAND_FIXTURE.build,
      ).dps,
    ]),
  ) as Record<RogueProbeSpec, number>;
}

describe('Rogue fight-6498 deterministic DPS bands', () => {
  it('records the accepted La Luna, BiS epic, heroic Nythraxis fixture', () => {
    expect(ROGUE_BAND_FIXTURE).toEqual({
      seconds: 60,
      seeds: [4242, 777, 1313],
      targetArmor: 798,
      build: {
        row14: 'rog_r14_ceaseless_cuts',
        row20: 'rog_r20_second_shadow',
      },
      rows: {
        5: 'rog_r5_killers_pace',
        8: 'rog_r8_borrowed_breath',
        11: 'rog_r11_marked_prey',
        14: 'rog_r14_ceaseless_cuts',
        17: 'rog_r17_flurry_of_knives',
        20: 'rog_r20_second_shadow',
      },
    });

    for (const spec of SPECS) {
      const gear = Object.values(bestEpicGearFor('rogue', spec));
      expect(gear.length, `${spec} has a complete representative loadout`).toBeGreaterThan(0);
      expect(
        gear.every((itemId) => ITEMS[itemId]?.quality === 'epic'),
        `${spec} loadout excludes legendary gear`,
      ).toBe(true);
    }
  });

  it('holds Combat at the 200-DPS top band and keeps the sibling ordering', () => {
    const first = measuredDps();
    const repeat = measuredDps();
    expect(repeat).toEqual(first);

    // Accepted three-seed measurements on this fixture are approximately
    // 224 Combat, 176 Assassination, and 178 Subtlety. Re-anchored through
    // the Crucible round: the ilvl-35 weapons and jewelry entered the kits,
    // the Emberflight Longbow's removal freed Combat's picks, and the Phase A
    // exclusion (unregistered set ids never count as BiS) pulled the
    // bonus-less Crucible set pieces back out, which nudged Subtlety a hair
    // above Assassination. The Phase B set-bonus pass re-anchors and is
    // expected to restore Assassination's edge; until then the exact new
    // ordering is pinned so a real collapse still reds.
    expect(first.combat).toBeGreaterThanOrEqual(216);
    expect(first.combat).toBeLessThanOrEqual(232);
    expect(first.assassination).toBeGreaterThanOrEqual(168);
    expect(first.assassination).toBeLessThanOrEqual(184);
    expect(first.subtlety).toBeGreaterThanOrEqual(170);
    expect(first.subtlety).toBeLessThanOrEqual(186);
    expect(first.combat).toBeGreaterThan(first.subtlety);
    expect(first.subtlety).toBeGreaterThan(first.assassination);
  }, 30_000);
});
