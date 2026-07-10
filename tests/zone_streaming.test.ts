import { describe, expect, it } from 'vitest';
import {
  distanceSqToZone,
  ZONE_STREAM_RECHECK_DISTANCE,
  zonesWithinStreamingHorizon,
} from '../src/render/zone_streaming';
import { ZONES } from '../src/sim/data';

describe('renderer zone-streaming horizon', () => {
  it('keeps a zero-radius query scoped to the containing zone', () => {
    expect(zonesWithinStreamingHorizon(ZONES, 0, 0, 0).map((zone) => zone.id)).toEqual([
      'eastbrook_vale',
    ]);
  });

  it('includes a neighbouring column before the player crosses its boundary', () => {
    const ids = zonesWithinStreamingHorizon(ZONES, 150, 0, 80, 1, 0).map((zone) => zone.id);
    expect(ids).toEqual(['eastbrook_vale', 'farshore_isle']);
    const farshore = ZONES.find((zone) => zone.id === 'farshore_isle');
    if (!farshore) throw new Error('expected Farshore in built-in zones');
    expect(distanceSqToZone(farshore, 150, 0)).toBe(30 * 30);
  });

  it('limits the spawn horizon to nearby regions instead of the whole world', () => {
    const ids = zonesWithinStreamingHorizon(ZONES, 0, 0, 470, 1, 0).map((zone) => zone.id);
    expect(ids).toEqual([
      'eastbrook_vale',
      'farshore_isle',
      'mirefen_marsh',
      'galecrest',
      'willowfen',
    ]);
    expect(ids.length).toBeLessThan(ZONES.length / 2);
  });

  it('prioritizes the camera-facing zone when adjacent boundaries tie', () => {
    const east = zonesWithinStreamingHorizon(ZONES, 0, 0, 470, 1, 0).map((zone) => zone.id);
    const north = zonesWithinStreamingHorizon(ZONES, 0, 0, 470, 0, 1).map((zone) => zone.id);
    expect(east.indexOf('farshore_isle')).toBeLessThan(east.indexOf('mirefen_marsh'));
    expect(north.indexOf('mirefen_marsh')).toBeLessThan(north.indexOf('farshore_isle'));
  });

  it('uses a non-zero movement threshold for cheap frame-loop rechecks', () => {
    expect(ZONE_STREAM_RECHECK_DISTANCE).toBeGreaterThan(0);
  });
});
