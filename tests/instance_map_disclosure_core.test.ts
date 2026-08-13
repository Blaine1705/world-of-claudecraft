import { describe, expect, it } from 'vitest';
import {
  INSTANCE_MAP_ENTITY_DISCLOSURE_RADIUS,
  isInstanceMapEntityDisclosed,
} from '../src/ui/hud/instance_map_disclosure_core';

describe('instance map entity disclosure', () => {
  it('includes the exact 80-yard boundary in every planar direction', () => {
    const r = INSTANCE_MAP_ENTITY_DISCLOSURE_RADIUS;
    expect(r).toBe(80);
    expect(isInstanceMapEntityDisclosed(10, -20, 10 + r, -20)).toBe(true);
    expect(isInstanceMapEntityDisclosed(10, -20, 10 - r, -20)).toBe(true);
    expect(isInstanceMapEntityDisclosed(10, -20, 10, -20 + r)).toBe(true);
    expect(isInstanceMapEntityDisclosed(10, -20, 10, -20 - r)).toBe(true);
  });

  it('uses squared planar distance and excludes points just outside the boundary', () => {
    const r = INSTANCE_MAP_ENTITY_DISCLOSURE_RADIUS;
    const diagonal = r / Math.SQRT2;
    expect(isInstanceMapEntityDisclosed(0, 0, diagonal, diagonal)).toBe(true);
    expect(isInstanceMapEntityDisclosed(0, 0, r + Number.EPSILON * r, 0)).toBe(false);
    expect(isInstanceMapEntityDisclosed(0, 0, r, 1)).toBe(false);
  });
});
