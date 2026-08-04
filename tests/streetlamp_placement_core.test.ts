import { describe, expect, it } from 'vitest';
import {
  LAMP_LIGHT_STRIDE,
  type LampTown,
  lampCarriesLight,
  planStreetlamps,
  type StreetlampProbes,
} from '../src/render/streetlamp_placement_core';
import { resolvePosition } from '../src/sim/colliders';
import { getActiveWorldContent } from '../src/sim/data';
import { propPlacementRoll } from '../src/sim/prop_layout';
import { roadDistance, terrainHeight } from '../src/sim/world';

// streetlamp_placement_core: where the streetlamps stand. Pure, so the layout
// is asserted directly here instead of eyeballed in a screenshot.

/** Distance from a point to the raw chords of a road set (the test's own
 *  "painted road" when no meander is being simulated). */
function chordDistance(
  roads: readonly (readonly { x: number; z: number }[])[],
  x: number,
  z: number,
): number {
  let best = Infinity;
  for (const road of roads) {
    for (let i = 0; i + 1 < road.length; i++) {
      const a = road[i];
      const b = road[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const len2 = abx * abx + abz * abz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2)) : 0;
      const dx = x - a.x - abx * t;
      const dz = z - a.z - abz * t;
      best = Math.min(best, Math.hypot(dx, dz));
    }
  }
  return best;
}

/** Flat ground, nothing in the way, a fixed roll: the layout under a microscope.
 *  roadClear reports the true chord distance, as if the paint had no meander. */
function openGround(
  roads: readonly (readonly { x: number; z: number }[])[],
  overrides: Partial<StreetlampProbes> = {},
): StreetlampProbes {
  return {
    groundAt: () => 0,
    blocked: () => false,
    roll: () => 0.5,
    roadClear: (x, z) => chordDistance(roads, x, z),
    ...overrides,
  };
}

const HUB: LampTown = { x: 0, z: 0, radius: 20 };
/** A straight 400 yd run due north out of the hub, as two authored waypoints. */
const STRAIGHT = [
  [
    { x: 0, z: 0 },
    { x: 0, z: 400 },
  ],
];

describe('planStreetlamps: the whole network is lit', () => {
  it('lines the road end to end, not just a walk out of the hub', () => {
    const plan = planStreetlamps(STRAIGHT, [HUB], openGround(STRAIGHT));
    const zs = plan.sites.map((s) => s.z);
    // reach = 20 * 1.6 + 60 = 92: the old plan stopped there; this one keeps
    // going to the far end (the last waymarker lands within one open step).
    expect(Math.max(...zs)).toBeGreaterThan(400 - 64);
    expect(Math.min(...zs)).toBeLessThan(30);
  });

  it('spaces lamps evenly along the open road', () => {
    const plan = planStreetlamps(STRAIGHT, [], openGround(STRAIGHT), { openSpacing: 25 });
    const zs = plan.sites.map((s) => s.z).sort((a, b) => a - b);
    expect(zs.length).toBeGreaterThan(10);
    for (let i = 1; i < zs.length; i++) {
      expect(zs[i] - zs[i - 1]).toBeCloseTo(25, 6);
    }
  });

  it('packs lamps closer inside a town reach than out on the open road', () => {
    const plan = planStreetlamps(STRAIGHT, [HUB], openGround(STRAIGHT), {
      spacing: 10,
      openSpacing: 30,
    });
    const zs = plan.sites.map((s) => s.z).sort((a, b) => a - b);
    const reach = HUB.radius * 1.6 + 60;
    const townGaps: number[] = [];
    const openGaps: number[] = [];
    for (let i = 1; i < zs.length; i++) {
      const gap = zs[i] - zs[i - 1];
      if (zs[i] < reach) townGaps.push(gap);
      else if (zs[i - 1] > reach) openGaps.push(gap);
    }
    expect(townGaps.length).toBeGreaterThan(2);
    expect(openGaps.length).toBeGreaterThan(2);
    for (const gap of townGaps) expect(gap).toBeCloseTo(10, 6);
    for (const gap of openGaps) expect(gap).toBeCloseTo(30, 6);
  });

  it('keeps the step running across waypoints instead of restarting at each', () => {
    // The authored roads have uneven waypoint spacing; restarting the step at
    // every corner bunches lamps up wherever a road is finely authored.
    const kinked = [
      [
        { x: 0, z: 0 },
        { x: 0, z: 13 }, // deliberately not a multiple of the spacing
        { x: 0, z: 400 },
      ],
    ];
    const plan = planStreetlamps(kinked, [], openGround(kinked), { openSpacing: 25 });
    const zs = plan.sites.map((s) => s.z).sort((a, b) => a - b);
    expect(zs.length).toBeGreaterThan(10);
    for (let i = 1; i < zs.length; i++) {
      expect(zs[i] - zs[i - 1]).toBeCloseTo(25, 6);
    }
  });

  it('stands the posts off the road, alternating sides down the run', () => {
    const plan = planStreetlamps(STRAIGHT, [], openGround(STRAIGHT));
    const xs = plan.sites.map((s) => s.x);
    expect(xs.some((x) => x > 0)).toBe(true);
    expect(xs.some((x) => x < 0)).toBe(true);
    for (const x of xs) expect(Math.abs(x)).toBeGreaterThan(2.9);
  });
});

describe('planStreetlamps: the clearance band against the painted road', () => {
  it('lands every post inside the band the roadClear probe reports', () => {
    const plan = planStreetlamps(STRAIGHT, [], openGround(STRAIGHT), {
      clearMin: 3.0,
      clearMax: 5.6,
    });
    expect(plan.sites.length).toBeGreaterThan(5);
    for (const site of plan.sites) {
      const clear = chordDistance(STRAIGHT, site.x, site.z);
      expect(clear).toBeGreaterThanOrEqual(3.0);
      expect(clear).toBeLessThanOrEqual(5.6);
    }
  });

  it('nudges a post OUT when the painted road has meandered under it', () => {
    // The paint is the chord shifted 2.5 yd toward +x: a fixed chord offset on
    // the +x side would stand IN the track. The probe reports the real paint.
    const shifted = (x: number, z: number) => chordDistance(STRAIGHT, x - 2.5, z);
    const plan = planStreetlamps(STRAIGHT, [], openGround(STRAIGHT, { roadClear: shifted }), {
      offset: 3.8,
      clearMin: 3.0,
      clearMax: 5.6,
    });
    expect(plan.sites.length).toBeGreaterThan(5);
    for (const site of plan.sites) {
      const clear = shifted(site.x, site.z);
      expect(clear).toBeGreaterThanOrEqual(3.0);
      expect(clear).toBeLessThanOrEqual(5.6);
    }
  });

  it('abandons a spot the band cannot be reached from, rather than misplacing it', () => {
    // A probe that always reports "on the road" is unescapable within maxNudges.
    const plan = planStreetlamps(STRAIGHT, [], openGround(STRAIGHT, { roadClear: () => 0 }));
    expect(plan.sites).toHaveLength(0);
  });
});

describe('planStreetlamps: the rejection probes', () => {
  it('drops a site standing in water or over a void', () => {
    const plan = planStreetlamps(STRAIGHT, [], openGround(STRAIGHT, { groundAt: () => -8 }));
    expect(plan.sites).toHaveLength(0);
  });

  it('drops a site something else already occupies', () => {
    const blockedNorth = planStreetlamps(
      STRAIGHT,
      [],
      openGround(STRAIGHT, { blocked: (_x, z) => z > 200 }),
    );
    expect(blockedNorth.sites.length).toBeGreaterThan(0);
    for (const site of blockedNorth.sites) expect(site.z).toBeLessThanOrEqual(200);
  });

  it('carries the vetted ground height, so the builder never resamples', () => {
    const plan = planStreetlamps(STRAIGHT, [], openGround(STRAIGHT, { groundAt: () => 4.25 }));
    expect(plan.sites.length).toBeGreaterThan(0);
    for (const site of plan.sites) expect(site.y).toBe(4.25);
  });

  it('collapses lamps where two roads cross', () => {
    const crossing = [
      [
        { x: -200, z: 100 },
        { x: 200, z: 100 },
      ],
      [
        { x: 0, z: -100 },
        { x: 0, z: 300 },
      ],
    ];
    const plan = planStreetlamps(crossing, [], openGround(crossing), { minSeparation: 8 });
    expect(plan.sites.length).toBeGreaterThan(10);
    for (let i = 0; i < plan.sites.length; i++) {
      for (let j = i + 1; j < plan.sites.length; j++) {
        const dx = plan.sites[i].x - plan.sites[j].x;
        const dz = plan.sites[i].z - plan.sites[j].z;
        expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

describe('planStreetlamps is deterministic and finite on the real world', () => {
  const SEED = 0;
  const realProbes = (): StreetlampProbes => ({
    groundAt: (x, z) => terrainHeight(x, z, SEED),
    blocked: (x, z) => {
      const resolved = resolvePosition(SEED, x, z, 1.1);
      return Math.abs(resolved.x - x) > 0.05 || Math.abs(resolved.z - z) > 0.05;
    },
    roll: propPlacementRoll,
    roadClear: roadDistance,
  });
  const realPlan = () => {
    const content = getActiveWorldContent();
    const towns = content.zones.map((zone) => ({
      x: zone.hub.x,
      z: zone.hub.z,
      radius: zone.hub.radius,
    }));
    return planStreetlamps(content.roads, towns, realProbes());
  };

  it('lights the whole network, sparsely (waymarkers, not a boulevard)', () => {
    const plan = realPlan();
    // ~13,500 yd of road at town spacing 26 / open spacing 64: a few hundred
    // posts. A runaway count is a perf regression (fixtures instance per zone,
    // but every third post carries a real light object); a collapsed count
    // means part of the network went dark.
    expect(plan.sites.length).toBeGreaterThan(200);
    expect(plan.sites.length).toBeLessThan(450);
  });

  it('stands every post beside the painted road, never on it', () => {
    const plan = realPlan();
    for (const site of plan.sites) {
      const clear = roadDistance(site.x, site.z);
      expect(clear).toBeGreaterThanOrEqual(3.0);
      expect(clear).toBeLessThanOrEqual(5.6);
    }
  });

  it('never stands a lamp in the sea', () => {
    const plan = realPlan();
    for (const site of plan.sites) expect(site.y).toBeGreaterThanOrEqual(-3);
  });

  it('produces the identical layout twice (no hidden global state)', () => {
    expect(realPlan()).toEqual(realPlan());
  });
});

describe('lampCarriesLight (which posts get a real point light)', () => {
  it('lights one post in three, so the shared budget still has room', () => {
    expect(LAMP_LIGHT_STRIDE).toBe(3);
    const lit = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(lampCarriesLight);
    expect(lit).toEqual([0, 3, 6]);
  });

  it('always lights the first post of a zone, so a small zone is never dark', () => {
    expect(lampCarriesLight(0)).toBe(true);
  });
});
