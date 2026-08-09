import { describe, expect, it } from 'vitest';
import { IGNIVAR_LAYOUT } from '../src/sim/dungeon_layout';
import { polygonContainsPoint } from '../src/sim/geometry2d';
import {
  IGNIVAR_METEOR_COUNT,
  IGNIVAR_METEOR_MAX_RANGE,
  IGNIVAR_METEOR_MIN_RANGE,
  IGNIVAR_METEOR_MIN_SEPARATION,
  IGNIVAR_METEOR_RADIUS,
  ignivarMeteorPattern,
  pointInIgnivarMeteor,
} from '../src/sim/ignivar_meteors';

describe('Ignivar falling meteors', () => {
  it('pins five non-overlapping 2.4-yard warnings inside the arena ring', () => {
    expect(IGNIVAR_METEOR_COUNT).toBe(5);
    expect(IGNIVAR_METEOR_RADIUS).toBe(2.4);
    expect(IGNIVAR_METEOR_MIN_RANGE).toBe(9);
    expect(IGNIVAR_METEOR_MAX_RANGE).toBe(25);
    expect(IGNIVAR_METEOR_MIN_SEPARATION).toBe(6);
    expect(IGNIVAR_METEOR_MIN_SEPARATION).toBeGreaterThanOrEqual(IGNIVAR_METEOR_RADIUS * 2);
  });

  it('creates a deterministic random-looking pattern inside the arena', () => {
    const origin = { x: 120, z: -80 };
    const first = ignivarMeteorPattern(91, origin);
    expect(first).toEqual(ignivarMeteorPattern(91, origin));
    expect(first).not.toEqual(ignivarMeteorPattern(92, origin));
    expect(first).toHaveLength(IGNIVAR_METEOR_COUNT);

    const polygon = IGNIVAR_LAYOUT.shellPolygon;
    if (!polygon) throw new Error('Ignivar arena polygon is missing');
    for (let castKey = 1; castKey <= 128; castKey++) {
      const pattern = ignivarMeteorPattern(castKey, origin);
      for (let meteorIndex = 0; meteorIndex < pattern.length; meteorIndex++) {
        const meteor = pattern[meteorIndex];
        const distance = Math.hypot(meteor.x - origin.x, meteor.z - origin.z);
        expect(distance).toBeGreaterThanOrEqual(IGNIVAR_METEOR_MIN_RANGE);
        expect(distance).toBeLessThanOrEqual(IGNIVAR_METEOR_MAX_RANGE);
        for (let edge = 0; edge < 16; edge++) {
          const angle = (edge * Math.PI * 2) / 16;
          expect(
            polygonContainsPoint(
              polygon,
              meteor.x - origin.x + Math.sin(angle) * IGNIVAR_METEOR_RADIUS,
              meteor.z - origin.z + Math.cos(angle) * IGNIVAR_METEOR_RADIUS,
            ),
          ).toBe(true);
        }
        for (let previous = 0; previous < meteorIndex; previous++) {
          expect(
            Math.hypot(meteor.x - pattern[previous].x, meteor.z - pattern[previous].z),
          ).toBeGreaterThanOrEqual(IGNIVAR_METEOR_MIN_SEPARATION);
        }
      }
    }
  });

  it('uses the same circular footprint for warning and impact resolution', () => {
    const meteor = { x: 4, z: 7 };
    expect(pointInIgnivarMeteor(meteor, { x: 4 + IGNIVAR_METEOR_RADIUS, z: 7 })).toBe(true);
    expect(pointInIgnivarMeteor(meteor, { x: 4 + IGNIVAR_METEOR_RADIUS + 0.01, z: 7 })).toBe(false);
  });
});
