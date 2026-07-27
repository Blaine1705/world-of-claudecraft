import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_NEIGHBOR_STREAM_RADIUS,
  distanceSqToZone,
  fogFarForPreparedZones,
  INITIAL_SKY_PREWARM_RADIUS,
  MAX_OUTDOOR_FOG_FAR,
  MIN_OUTDOOR_FOG_FAR,
  UNPREPARED_ZONE_FOG_GUARD,
  ZONE_STREAM_RECHECK_DISTANCE,
  zoneEntryPoint,
  zonesWithinStreamingHorizon,
} from '../src/render/zone_streaming';
import { ZONES, zoneAt } from '../src/sim/data';

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

  it('limits loading-screen sky uploads to the active and immediately adjacent biomes', () => {
    const nearby = zonesWithinStreamingHorizon(ZONES, 2, -2, INITIAL_SKY_PREWARM_RADIUS);
    expect(nearby.map((zone) => zone.id)).toEqual([
      'eastbrook_vale',
      'farshore_isle',
      'mirefen_marsh',
    ]);
    expect([...new Set(nearby.map((zone) => zone.biome))]).toEqual(['vale', 'marsh']);
  });

  it('prioritizes the camera-facing zone when adjacent boundaries tie', () => {
    const east = zonesWithinStreamingHorizon(ZONES, 0, 0, 470, 1, 0).map((zone) => zone.id);
    const north = zonesWithinStreamingHorizon(ZONES, 0, 0, 470, 0, 1).map((zone) => zone.id);
    expect(east.indexOf('farshore_isle')).toBeLessThan(east.indexOf('mirefen_marsh'));
    expect(north.indexOf('mirefen_marsh')).toBeLessThan(north.indexOf('farshore_isle'));
  });

  it('prepares the travel-direction zone before a marginally nearer sideways zone', () => {
    // Regression for the Mirefen crossing stall: from the spawn walk north,
    // Farshore (178 yd east) is strictly nearer than Mirefen (182 yd north),
    // so nearest-first ordering spent the whole approach building the isle
    // while the player crossed into an unprepared marsh.
    const ids = zonesWithinStreamingHorizon(ZONES, 2, -2, 470, 0, 1).map((zone) => zone.id);
    expect(ids[0]).toBe('eastbrook_vale');
    expect(ids.indexOf('mirefen_marsh')).toBeLessThan(ids.indexOf('farshore_isle'));
    // A stationary east-facing camera still takes the strictly nearer isle.
    const east = zonesWithinStreamingHorizon(ZONES, 2, -2, 470, 1, 0).map((zone) => zone.id);
    expect(east.indexOf('farshore_isle')).toBeLessThan(east.indexOf('mirefen_marsh'));
  });

  it('uses a non-zero movement threshold for cheap frame-loop rechecks', () => {
    expect(ZONE_STREAM_RECHECK_DISTANCE).toBeGreaterThan(0);
  });

  it('every entry point resolves back to its own zone, even from a boundary camera', () => {
    // Regression for the willowfen starvation: the un-inset nearest rectangle
    // point of a zone west of the camera lands exactly on its exclusive max-x
    // edge, zoneAt resolves it to the neighbour, the prepare no-ops, and the
    // streaming queue entry is consumed without ever building the zone.
    const cameras = [
      { x: 25, z: -16 }, // the vale spawn camera that starved willowfen live
      { x: 0, z: 0 },
      { x: 500, z: 2000 },
      { x: -500, z: 900 },
    ];
    for (const zone of ZONES) {
      for (const cam of cameras) {
        const entry = zoneEntryPoint(zone, cam.x, cam.z);
        expect(zoneAt(entry.x, entry.z).id, `${zone.id} from (${cam.x}, ${cam.z})`).toBe(zone.id);
      }
    }
  });
});

describe('renderer zone-residency fog', () => {
  const eastbrookOnly = new Set(['eastbrook_vale']);

  it('clamps ahead of the nearest unprepared zone at the Eastbrook spawn', () => {
    // Farshore sits 178 yd from (2, -2) and is the closest unprepared zone,
    // so the fog is held at 178 - guard = 170 no matter what was requested.
    expect(fogFarForPreparedZones(ZONES, eastbrookOnly, 2, -2, 500)).toBe(170);
    expect(fogFarForPreparedZones(ZONES, eastbrookOnly, 2, -2, 900)).toBe(170);
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

  it('opens the view to the full request after the destination becomes resident', () => {
    const withFarshore = new Set(['eastbrook_vale', 'farshore_isle']);
    // The next unprepared zone is farther than the request, so the biome
    // preset wins outright once the crossing target is resident.
    expect(fogFarForPreparedZones(ZONES, withFarshore, 179, 0, 170)).toBe(170);
  });

  it('caps every request at the rendering envelope even with the world resident', () => {
    const all = new Set(ZONES.map((zone) => zone.id));
    expect(fogFarForPreparedZones(ZONES, all, 0, 0, MAX_OUTDOOR_FOG_FAR + 500)).toBe(
      MAX_OUTDOOR_FOG_FAR,
    );
    expect(fogFarForPreparedZones(ZONES, all, 0, 0, 80)).toBe(80);
  });
});

describe('teleport-arrival neighbourhood', () => {
  // A realm portal into the Drakelands lands on the zone's western margin: the
  // Frostveil rectangle is 37 yd away and the Wraithwood 51 yd, both well
  // inside the clamp. Preparing only the destination there left the player
  // looking at a 45-yard wall of ember haze until the idle-paced background
  // lane finished a whole neighbouring zone.
  const LANDING = { x: 217, z: 1871 };
  // Bracket the ember preset's far rather than pinning it: this is a streaming
  // policy test, and the biome table is the renderer's to retune.
  const REQUESTS = [200, 385];

  it('pins the landing at the floor when only the destination is resident', () => {
    const destinationOnly = new Set(['drakelands']);
    expect(zoneAt(LANDING.x, LANDING.z).id).toBe('drakelands');
    for (const requested of REQUESTS) {
      expect(fogFarForPreparedZones(ZONES, destinationOnly, LANDING.x, LANDING.z, requested)).toBe(
        MIN_OUTDOOR_FOG_FAR,
      );
    }
  });

  it('reaches every neighbour that would clamp a border landing', () => {
    const arrival = zonesWithinStreamingHorizon(
      ZONES,
      LANDING.x,
      LANDING.z,
      ARRIVAL_NEIGHBOR_STREAM_RADIUS,
    );
    expect([...arrival.map((zone) => zone.id)].sort()).toEqual([
      'drakelands',
      'frostveil',
      'wraithwood',
    ]);
    // With those resident the clamp stops binding: every request is granted
    // in full, so the landing view is the biome preset's, not the floor.
    const resident = new Set(arrival.map((zone) => zone.id));
    for (const requested of REQUESTS) {
      expect(fogFarForPreparedZones(ZONES, resident, LANDING.x, LANDING.z, requested)).toBe(
        requested,
      );
    }
    // Even an unbounded request now clears the next rectangle (the Amberfall,
    // 397 yd off) rather than collapsing to the floor.
    expect(fogFarForPreparedZones(ZONES, resident, LANDING.x, LANDING.z, MAX_OUTDOOR_FOG_FAR)).toBe(
      397 - UNPREPARED_ZONE_FOG_GUARD,
    );
  });

  it('clears the wall for a login on the Thornpeak south edge', () => {
    // Reported live: logging in at (-2, 580) put the player 40 yd from the
    // Mirefen rectangle, so the peaks preset's 850-yard vista was pinned at the
    // 45-yard floor for about a minute until the background lane caught up.
    const login = { x: -2, z: 580 };
    const PEAKS_FOG_FAR = MAX_OUTDOOR_FOG_FAR;
    expect(zoneAt(login.x, login.z).id).toBe('thornpeak_heights');
    const loginZoneOnly = new Set(['thornpeak_heights']);
    expect(fogFarForPreparedZones(ZONES, loginZoneOnly, login.x, login.z, PEAKS_FOG_FAR)).toBe(
      MIN_OUTDOOR_FOG_FAR,
    );

    const arrival = zonesWithinStreamingHorizon(
      ZONES,
      login.x,
      login.z,
      ARRIVAL_NEIGHBOR_STREAM_RADIUS,
    );
    expect([...arrival.map((zone) => zone.id)].sort()).toEqual([
      'mirefen_marsh',
      'thornpeak_heights',
    ]);
    // Not the full 850-yard vista (nothing short of preparing half the world
    // buys that), but a playable view instead of a wall: the next rectangle
    // out is the Willowfen at 178 yd.
    const resident = new Set(arrival.map((zone) => zone.id));
    const opened = fogFarForPreparedZones(ZONES, resident, login.x, login.z, PEAKS_FOG_FAR);
    expect(opened).toBe(178 - UNPREPARED_ZONE_FOG_GUARD);
    expect(opened).toBeGreaterThan(3 * MIN_OUTDOOR_FOG_FAR);
  });

  it('streams nothing extra for a landing in the middle of a rectangle', () => {
    // The Eastbrook hearthstone: no other rectangle is within the radius, so
    // the common arrival pays exactly what it paid before.
    const arrival = zonesWithinStreamingHorizon(ZONES, 0, 0, ARRIVAL_NEIGHBOR_STREAM_RADIUS);
    expect(arrival.map((zone) => zone.id)).toEqual(['eastbrook_vale']);
  });
});
