import { describe, expect, it } from 'vitest';
import {
  distanceSqToZone,
  fogFarForPreparedZones,
  MAX_OUTDOOR_FOG_FAR,
  MIN_OUTDOOR_FOG_FAR,
  UNPREPARED_ZONE_FOG_GUARD,
} from '../src/render/zone_streaming';
import { ZONES } from '../src/sim/data';

describe('renderer zone-residency fog', () => {
  const eastbrookOnly = new Set(['eastbrook_vale']);

  it('uses the normal bounded view distance at the Eastbrook spawn', () => {
    expect(fogFarForPreparedZones(ZONES, eastbrookOnly, 2, -2, 500)).toBe(MAX_OUTDOOR_FOG_FAR);
  });

  it('contracts before Farshore can enter the visible envelope', () => {
    const farshore = ZONES.find((zone) => zone.id === 'farshore_isle');
    if (!farshore) throw new Error('expected Farshore in built-in zones');
    expect(distanceSqToZone(farshore, 60, 0)).toBe(120 * 120);
    expect(fogFarForPreparedZones(ZONES, eastbrookOnly, 60, 0, 500)).toBe(
      120 - UNPREPARED_ZONE_FOG_GUARD,
    );
    expect(fogFarForPreparedZones(ZONES, eastbrookOnly, 100, 0, 500)).toBe(
      80 - UNPREPARED_ZONE_FOG_GUARD,
    );
  });

  it('never exposes an unloaded boundary at point-blank range', () => {
    expect(fogFarForPreparedZones(ZONES, eastbrookOnly, 179, 0, 500)).toBe(MIN_OUTDOOR_FOG_FAR);
  });

  it('opens the view again after the destination becomes resident', () => {
    const withFarshore = new Set(['eastbrook_vale', 'farshore_isle']);
    expect(fogFarForPreparedZones(ZONES, withFarshore, 179, 0, 500)).toBe(MAX_OUTDOOR_FOG_FAR);
  });

  it('respects a denser biome request below the global cap', () => {
    expect(fogFarForPreparedZones(ZONES, eastbrookOnly, 2, -2, 80)).toBe(80);
  });
});
