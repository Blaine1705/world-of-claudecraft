// Daily variation for the Windrider Slalom (world quests round 2,
// src/sim/world_quest_glider_generation.ts): every variant of every template
// is certified here the way the authored courses are, with terrain clearance
// under each ring and the bounded autopilot (world_quest_glider_autopilot.ts)
// that has to reach the pad.
import { describe, expect, it } from 'vitest';
import { GLIDER_COURSE } from '../src/sim/content/world_quest_glider';
import { GLIDER_COURSES } from '../src/sim/content/world_quest_glider_levels';
import { groundHeight } from '../src/sim/world';
import { autopilotFlight } from '../src/sim/world_quest_glider_autopilot';
import {
  GLIDER_VARIANT_CYCLE,
  GLIDER_VARIANT_MAX_LATERAL,
  GLIDER_VARIANT_MAX_VERTICAL,
  generateGliderCourseVariant,
  gliderCourseForCycle,
  gliderVariantForCycle,
  tunnelBoundRings,
} from '../src/sim/world_quest_glider_generation';
import { WORLD_SEED } from '../src/sim/world_seed';

const VARIANTS = Array.from({ length: GLIDER_VARIANT_CYCLE }, (_, index) => index);

describe('glider course variants', () => {
  it('variant 0 is the template itself, and the cycle walks the variants in order', () => {
    for (const template of GLIDER_COURSES) {
      expect(generateGliderCourseVariant(template, 0)).toBe(template);
    }
    expect(gliderVariantForCycle('wq1_0')).toBe(0);
    expect(gliderVariantForCycle('wq1_1')).toBe(1);
    expect(gliderVariantForCycle(`wq1_${GLIDER_VARIANT_CYCLE - 1}`)).toBe(GLIDER_VARIANT_CYCLE - 1);
    expect(gliderVariantForCycle(`wq1_${GLIDER_VARIANT_CYCLE}`)).toBe(0);
    expect(gliderVariantForCycle('nonsense')).toBe(0);
    expect(gliderVariantForCycle(undefined)).toBe(0);
    // Day 0 flies the authored daily course object, by identity.
    expect(gliderCourseForCycle('wq1_0')).toBe(GLIDER_COURSE);
    expect(gliderCourseForCycle('wq1_0', GLIDER_COURSES[1].id)).toBe(GLIDER_COURSES[1]);
  });

  it('is deterministic and hands the course visual a stable object per cycle and course', () => {
    const a = gliderCourseForCycle('wq1_5');
    const b = gliderCourseForCycle('wq1_5');
    expect(a).toBe(b);
    expect(generateGliderCourseVariant(GLIDER_COURSE, 5)).toEqual(a);
    expect(gliderCourseForCycle('wq1_6')).not.toBe(a);
    expect(gliderCourseForCycle('wq1_6')).not.toEqual(a);
  });

  it('gives the daily course a genuinely different line on almost every day', () => {
    // Certification may fold a variant back toward the template, but the
    // cycle as a whole has to be variety, not a repeat: at least three quarters
    // of the days fly distinct lines, and the template itself is day 0 only.
    const lines = new Map<string, number[]>();
    for (const variant of VARIANTS) {
      const key = JSON.stringify(generateGliderCourseVariant(GLIDER_COURSE, variant).rings);
      lines.set(key, [...(lines.get(key) ?? []), variant]);
    }
    expect(lines.size).toBeGreaterThanOrEqual((GLIDER_VARIANT_CYCLE * 3) / 4);
    const templateLine = JSON.stringify(GLIDER_COURSE.rings);
    expect(lines.get(templateLine)).toEqual([0]);
  });

  it('keeps ids, radii, count, pad, tunnels and medals, and nudges only free middle rings within bounds', () => {
    for (const template of GLIDER_COURSES) {
      const fixed = tunnelBoundRings(template);
      // Every authored tunnel pins a leg: the base course's four tunnels bind
      // eight rings, so the set is never empty and never the whole course.
      expect(fixed.size).toBeGreaterThan(0);
      expect(fixed.size).toBeLessThan(template.rings.length);
      for (const variant of VARIANTS) {
        const course = generateGliderCourseVariant(template, variant);
        expect(course.id).toBe(template.id);
        expect(course.landingPad).toBe(template.landingPad);
        expect(course.windTunnels).toBe(template.windTunnels);
        expect(course.medals).toBe(template.medals);
        expect(course.minRings).toBe(template.minRings);
        expect(course.rings).toHaveLength(template.rings.length);
        const last = template.rings.length - 1;
        course.rings.forEach((ring, i) => {
          const source = template.rings[i];
          expect(ring.id).toBe(source.id);
          expect(ring.radius).toBe(source.radius);
          expect(ring.boostY).toBe(source.boostY);
          const moved = Math.hypot(ring.x - source.x, ring.z - source.z);
          if (i === 0 || i >= last - 1 || fixed.has(i)) {
            expect(moved, `${template.id} v${variant} ring ${ring.id} is fixed`).toBe(0);
            expect(ring.y).toBe(source.y);
          } else {
            expect(moved).toBeLessThanOrEqual(GLIDER_VARIANT_MAX_LATERAL + 0.1);
            expect(Math.abs(ring.y - source.y)).toBeLessThanOrEqual(
              GLIDER_VARIANT_MAX_VERTICAL + 0.1,
            );
            // Never a steeper climb than the template's between settled rings.
            const prior = course.rings[i - 1];
            const sourcePrior = template.rings[i - 1];
            expect(ring.y - prior.y).toBeLessThanOrEqual(
              Math.max(0, source.y - sourcePrior.y) + 1e-9,
            );
          }
        });
      }
    }
  });

  it('every variant keeps every ring clear of the ground', () => {
    for (const template of GLIDER_COURSES) {
      for (const variant of VARIANTS) {
        const course = generateGliderCourseVariant(template, variant);
        for (const ring of course.rings) {
          expect(
            ring.y - ring.radius - groundHeight(ring.x, ring.z, WORLD_SEED),
            `${template.id} v${variant} ring ${ring.id}`,
          ).toBeGreaterThan(2);
        }
      }
    }
  });

  it('the bounded autopilot wins every variant of every course', () => {
    for (const template of GLIDER_COURSES) {
      for (const variant of VARIANTS) {
        const course = generateGliderCourseVariant(template, variant);
        const flight = autopilotFlight(course, WORLD_SEED);
        expect(
          { id: template.id, variant, phase: flight.phase, rings: flight.passedRings },
          `${template.id} variant ${variant}`,
        ).toEqual({ id: template.id, variant, phase: 'won', rings: course.rings.length });
      }
    }
  });
});
