import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  activeVarkhulHammerZones,
  VARKHUL_HAMMER_FIRE_DURATION,
  VARKHUL_HAMMER_FIRE_RADIUS,
  VARKHUL_MARKED_HAMMERS_IMPACT_RADIUS,
  VARKHUL_MARKED_HAMMERS_WARNING_SECONDS,
  varkhulHammerFireId,
  varkhulHammerImpactPoint,
} from '../src/sim/varkhul_hammers';

describe('Varkhul Marked Hammers projection', () => {
  it('keeps the retired Living Blueprint mechanic out of the encounter contract', () => {
    const retiredSurface = [
      '../src/sim/encounters/varkhul.ts',
      '../src/sim/types.ts',
      '../src/ui/sim_i18n.ts',
      '../src/render/varkhul_encounter_core.ts',
      '../src/render/varkhul_encounter.ts',
      './varkhul_encounter_render.test.ts',
      '../docs/prd/ignivar-raid.md',
    ]
      .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
      .join('\n');

    expect(retiredSurface).not.toMatch(/blueprint/i);
    expect(retiredSurface).toContain('Marked Hammers');
  });

  it('places repeated impacts deterministically around a marked player', () => {
    const target = { x: 40, z: -12 };
    const first = varkhulHammerImpactPoint(target, 3, 0, 1);
    const repeat = varkhulHammerImpactPoint(target, 3, 0, 1);
    const next = varkhulHammerImpactPoint(target, 3, 1, 1);

    expect(first).toEqual(repeat);
    expect(next).not.toEqual(first);
    expect(Math.hypot(first.x - target.x, first.z - target.z)).toBeCloseTo(1.5, 8);
    expect(Math.hypot(next.x - target.x, next.z - target.z)).toBeCloseTo(2.25, 8);
  });

  it('projects warnings and fires with stable ids and literal gameplay bounds', () => {
    const zones = activeVarkhulHammerZones(91, {
      hammersCastKey: 4,
      hammersStrikeIndex: 2,
      hammersWarningRemaining: 0.8,
      hammersPoints: [{ x: 5, z: 7 }],
      hammerFires: [
        {
          id: varkhulHammerFireId(91, 3, 1, 0),
          pos: { x: 8, y: 0, z: 9 },
          remaining: 6,
          tickTimer: 0.5,
        },
      ],
    });

    expect(zones).toEqual([
      {
        id: '91:hammer:4:2:0',
        sourceId: 91,
        phase: 'warning',
        x: 5,
        z: 7,
        radius: VARKHUL_MARKED_HAMMERS_IMPACT_RADIUS,
        duration: VARKHUL_MARKED_HAMMERS_WARNING_SECONDS,
        remaining: 0.8,
      },
      {
        id: '91:fire:3:1:0',
        sourceId: 91,
        phase: 'fire',
        x: 8,
        z: 9,
        radius: VARKHUL_HAMMER_FIRE_RADIUS,
        duration: VARKHUL_HAMMER_FIRE_DURATION,
        remaining: 6,
      },
    ]);
    expect(VARKHUL_MARKED_HAMMERS_IMPACT_RADIUS).toBe(3);
    expect(VARKHUL_MARKED_HAMMERS_WARNING_SECONDS).toBe(1.25);
    expect(VARKHUL_HAMMER_FIRE_RADIUS).toBe(2.4);
    expect(VARKHUL_HAMMER_FIRE_DURATION).toBe(12);
  });
});
