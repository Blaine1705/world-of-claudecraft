// The Veiled Hollow: zone registration and the sealed southern border.
// The realm is reachable only through its portal, so the border ridge at the
// Thornpeak boundary must beat the climbable slope on a straight approach
// from EVERY x, in BOTH directions, with no road pass through it.

import { describe, expect, it } from 'vitest';
import {
  REALM_CAMPS,
  REALM_NPCS,
  REALM_PORTALS,
  REALM_PROPS,
  REALM_ROADS,
  REALM_ZONE,
} from '../src/sim/content/realm';
import { WORLD_MAX_Z, ZONES, zoneAt } from '../src/sim/data';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import { Sim } from '../src/sim/sim';
import { hollowLandness, terrainHeight, WATER_LEVEL } from '../src/sim/world';

const SEED = 1337; // matches the fixed client seed in src/main.ts

describe('Veiled Hollow zone registration', () => {
  it('sits fourth in the band order, tiled against Thornpeak', () => {
    // Once the world's last band, now the gateway to the northern realms:
    // the Drakelands tile against its north edge, the Frostveil past them.
    expect(ZONES[3].id).toBe('veiled_hollow');
    expect(ZONES[3].zMin).toBe(900);
    // the continent: the strip column stacks vale to garden; the columns
    // sit beside their rows (fire and ice, dream and nightmare, and so on)
    const byId = (id: string) => ZONES.find((zn) => zn.id === id)!;
    expect(byId('frostveil').zMin).toBe(ZONES[3].zMax); // the strip's north cap
    expect(byId('drakelands').xMin).toBe(180); // east beside the Reach
    expect(byId('amberfall').xMax).toBe(-180); // west beside the Reach
    expect(byId('galecrest').zMin).toBe(180); // the east column's south end
    expect(byId('evergarden').zMin).toBe(byId('galecrest').zMax);
    expect(byId('wraithwood').zMin).toBe(byId('evergarden').zMax);
    expect(byId('drakelands').zMin).toBe(byId('wraithwood').zMax);
    expect(byId('willowfen').zMin).toBe(180); // the west column's south end
    expect(byId('palmreach').zMin).toBe(byId('willowfen').zMax);
    expect(byId('nightbloom').zMin).toBe(byId('palmreach').zMax);
    expect(byId('amberfall').zMin).toBe(byId('nightbloom').zMax);
    // append order is rng-stream order, not stack order, since the grid:
    // the world's north end is the MAX zMax over all zones
    expect(WORLD_MAX_Z).toBe(Math.max(...ZONES.map((zn) => zn.zMax)));
    expect(zoneAt(0, 1000).id).toBe('veiled_hollow');
    expect(zoneAt(0, 899).id).toBe('thornpeak_heights');
    expect(zoneAt(0, 1500).id).toBe('frostveil');
    expect(zoneAt(360, 2000).id).toBe('drakelands');
  });

  it('declares its southern border sealed', () => {
    expect(REALM_ZONE.sealedSouthBorder).toBe(true);
  });

  it('keeps its hub and graveyard on dry, in-zone ground', () => {
    const { hub, graveyard } = REALM_ZONE;
    expect(hub.z).toBeGreaterThan(REALM_ZONE.zMin);
    expect(hub.z).toBeLessThan(REALM_ZONE.zMax);
    expect(terrainHeight(hub.x, hub.z, SEED)).toBeGreaterThan(WATER_LEVEL);
    expect(terrainHeight(graveyard.x, graveyard.z, SEED)).toBeGreaterThan(WATER_LEVEL);
  });
});

describe('the sealed border wall', () => {
  // Steepest straight-line gradient found walking north across the wall band
  // at a fixed x, sampled at the footstep scale the sim's climb check uses.
  function maxNorthGradient(x: number, seed: number): number {
    const step = 0.5;
    let steepest = 0;
    for (let z = 880; z < 955; z += step) {
      const rise = terrainHeight(x, z + step, seed) - terrainHeight(x, z, seed);
      if (rise / step > steepest) steepest = rise / step;
    }
    return steepest;
  }

  // Same, walking south (the way back out without the portal).
  function maxSouthGradient(x: number, seed: number): number {
    const step = 0.5;
    let steepest = 0;
    for (let z = 955; z > 880; z -= step) {
      const rise = terrainHeight(x, z - step, seed) - terrainHeight(x, z, seed);
      if (rise / step > steepest) steepest = rise / step;
    }
    return steepest;
  }

  it('blocks a straight walk in from Thornpeak at every x (several seeds)', () => {
    for (const seed of [SEED, 1, 42, 99999]) {
      for (let x = -170; x <= 170; x += 1) {
        expect(maxNorthGradient(x, seed), `x=${x} seed=${seed}`).toBeGreaterThan(
          PLAYER_MAX_CLIMB_SLOPE,
        );
      }
    }
  });

  it('blocks a straight walk back out at every x (several seeds)', () => {
    for (const seed of [SEED, 1, 42, 99999]) {
      for (let x = -170; x <= 170; x += 1) {
        expect(maxSouthGradient(x, seed), `x=${x} seed=${seed}`).toBeGreaterThan(
          PLAYER_MAX_CLIMB_SLOPE,
        );
      }
    }
  });

  it('leaves the Gravewyrm Sanctum approach essentially unchanged', () => {
    // The sealed crest sits 15yd inside the realm band with a narrow sigma,
    // so the raid gate at (0, 880) must not have been shoved upward.
    const atSanctum = terrainHeight(0, 880, SEED);
    const nearby = terrainHeight(0, 860, SEED);
    expect(Math.abs(atSanctum - nearby)).toBeLessThan(12);
  });
});

describe('the sealed border is a hard movement wall', () => {
  // The climb gate projects rise along the movement direction, so a smooth
  // gaussian wall alone is beatable by shallow diagonals (and airborne drift
  // skips the gate entirely). crossesSealedBorder in resolveMovement is the
  // real guarantee: drive the ACTUAL sim movement at exploit angles and with
  // jump spam, and assert the crest is never crossed.
  const CREST = 915; // ZONES[2].zMax + 15 (the sealed ridge shift)

  function walker(seed: number, startX: number, yawOffNorth: number, jump: boolean): number {
    const sim = new Sim({ seed, playerClass: 'warrior' });
    const p = sim.player;
    p.pos.x = startX;
    p.pos.z = 890;
    p.pos.y = terrainHeight(startX, 890, seed);
    p.prevPos = { ...p.pos };
    p.maxHp = 999999;
    p.hp = 999999;
    sim.moveInput.forward = true;
    let maxZ = p.pos.z;
    // 60 seconds of held movement, re-aiming across the wall each second and
    // flipping the diagonal so the walker tacks along the face
    for (let s = 0; s < 60; s++) {
      const sign = s % 2 === 0 ? 1 : -1;
      p.facing = sign * yawOffNorth; // 0 = +z north (into the realm)
      for (let t = 0; t < 20; t++) {
        if (jump) sim.moveInput.jump = true;
        sim.tick();
        if (p.pos.z > maxZ) maxZ = p.pos.z;
      }
      // clamp x back into the band so the tack never leaves the world
      if (p.pos.x > 170) p.pos.x = 170;
      if (p.pos.x < -170) p.pos.x = -170;
    }
    return maxZ;
  }

  // the easiest faces found by a greedy climber: mid-band and the Starfall
  // carve near x=126 (full sims are slow; keep the matrix tight)
  it('holds against shallow-diagonal walking at the exploit-prone faces', () => {
    for (const x of [-40, 126]) {
      for (const yaw of [1.1, 1.35]) {
        expect(walker(SEED, x, yaw, false), `x=${x} yaw=${yaw}`).toBeLessThan(CREST);
      }
    }
  }, 60000);

  it('holds against jump spam into the face', () => {
    for (const x of [-40, 126]) {
      expect(walker(SEED, x, 1.2, true), `x=${x}`).toBeLessThan(CREST);
    }
  }, 60000);

  it('still lets the portal deliver players across', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior' });
    const p = sim.player;
    p.pos.x = -140;
    p.pos.z = 844.5;
    p.prevPos = { ...p.pos };
    sim.tick();
    expect(p.pos.z).toBeGreaterThan(CREST);
    expect(zoneAt(p.pos.x, p.pos.z).id).toBe('veiled_hollow');
  });
});

describe('the Hollow coastline keeps every fixed feature on dry land', () => {
  function assertOnLand(label: string, x: number, z: number) {
    // the coast only exists north of the sealed range (z >= 960); south of it
    // (and outside the band) only the dry-ground check applies
    if (z >= 960 && z <= 1262) {
      expect(hollowLandness(x, z), `${label} at ${x},${z} landness`).toBeGreaterThan(0.14);
    }
    expect(terrainHeight(x, z, SEED), `${label} at ${x},${z} height`).toBeGreaterThan(WATER_LEVEL);
  }

  it('camps, town, roads, ruins, portals, and POIs stay above the sea', () => {
    for (const c of REALM_CAMPS) assertOnLand(`camp ${c.mobId}`, c.center.x, c.center.z);
    for (const n of Object.values(REALM_NPCS)) assertOnLand(`npc ${n.id}`, n.pos.x, n.pos.z);
    for (const poi of REALM_ZONE.pois) {
      // POIs may label water features (the lakes); they just must not drift
      // out past the coast into the open sea
      expect(hollowLandness(poi.x, poi.z), `poi ${poi.label} landness`).toBeGreaterThan(0.14);
    }
    for (const b of REALM_PROPS.buildings) assertOnLand('building', b.x, b.z);
    for (const ring of REALM_PROPS.ruinRings) assertOnLand('ruin ring', ring.x, ring.z);
    for (const t of REALM_PROPS.tents) assertOnLand('tent', t.x, t.z);
    for (const m of REALM_PROPS.mines) assertOnLand('cave mouth', m.x, m.z);
    for (const portal of REALM_PORTALS) {
      assertOnLand('portal b', portal.b.x, portal.b.z);
      assertOnLand('portal b landing', portal.b.landing.x, portal.b.landing.z);
    }
    const g = REALM_ZONE.graveyard;
    assertOnLand('graveyard', g.x, g.z);
    for (const road of REALM_ROADS) {
      for (let i = 0; i < road.length - 1; i++) {
        for (let t = 0; t <= 1; t += 0.1) {
          const x = road[i].x + (road[i + 1].x - road[i].x) * t;
          const z = road[i].z + (road[i + 1].z - road[i].z) * t;
          assertOnLand('road', x, z);
        }
      }
    }
  });
});

describe('open-sea swim fatigue', () => {
  it('warns, then deals rising damage far offshore, and relents ashore', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior' });
    const p = sim.player;
    p.maxHp = 1000;
    p.hp = 1000;
    // hugging the eastern map edge in open water: the fatigue band
    p.pos.x = 160;
    p.pos.z = 1380;
    p.pos.y = -4.6; // treading at the surface
    p.prevPos = { ...p.pos };
    let warned = false;
    // swim until the sea has bitten once (staying past that is lethal by design)
    for (let t = 0; t < 20 * 16 && p.hp === 1000; t++) {
      const events = sim.tick();
      if (events.some((e) => e.type === 'log' && e.text.includes('open sea'))) warned = true;
      p.pos.x = 160;
      p.pos.z = 1380; // keep swimming in place against any drift
    }
    expect(warned).toBe(true);
    expect(p.hp).toBeLessThan(1000);
    const hpAfterSea = p.hp;
    // back ashore: fatigue resets and the bleeding stops
    p.pos.x = -40;
    p.pos.z = 1030;
    p.pos.y = 3;
    p.prevPos = { ...p.pos };
    for (let t = 0; t < 20 * 3; t++) sim.tick();
    expect(p.fatigueTicks).toBe(0);
    expect(p.hp).toBeGreaterThanOrEqual(hpAfterSea);
  });
});

describe('the Pale Causeway', () => {
  it('is one continuous walkable landmass from the coast to the band edge', () => {
    // the spine, coast root to northern head: dry land the whole way, and no
    // step along it steeper than the climb gate
    const spine = [
      { x: 0, z: 1250 },
      { x: 18, z: 1280 },
      { x: 30, z: 1300 },
      { x: 40, z: 1330 },
      { x: 48, z: 1355 },
      { x: 46, z: 1390 },
      { x: 44, z: 1415 },
    ];
    for (let i = 0; i < spine.length - 1; i++) {
      for (let t = 0; t <= 1; t += 0.1) {
        const x = spine[i].x + (spine[i + 1].x - spine[i].x) * t;
        const z = spine[i].z + (spine[i + 1].z - spine[i].z) * t;
        expect(terrainHeight(x, z, SEED), `spine ${x},${z}`).toBeGreaterThan(WATER_LEVEL);
      }
      // sample the along-path gradient at footstep scale
      const dx = spine[i + 1].x - spine[i].x;
      const dz = spine[i + 1].z - spine[i].z;
      const len = Math.hypot(dx, dz);
      for (let d = 0; d < len - 0.5; d += 0.5) {
        const x0 = spine[i].x + (dx * d) / len;
        const z0 = spine[i].z + (dz * d) / len;
        const x1 = spine[i].x + (dx * (d + 0.5)) / len;
        const z1 = spine[i].z + (dz * (d + 0.5)) / len;
        const rise = terrainHeight(x1, z1, SEED) - terrainHeight(x0, z0, SEED);
        expect(
          Math.abs(rise) / 0.5,
          `spine slope at ${x0.toFixed(0)},${z0.toFixed(0)}`,
        ).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
      }
    }
  });

  it('leaves the interior sound fatigue-free (only the map edges drown)', () => {
    const sim = new Sim({ seed: SEED, playerClass: 'warrior' });
    const p = sim.player;
    p.maxHp = 1000;
    p.hp = 1000;
    p.pos.x = -60;
    p.pos.z = 1320; // mid-sound, far from every edge
    p.pos.y = -5.2;
    p.prevPos = { ...p.pos };
    for (let t = 0; t < 20 * 6; t++) {
      sim.tick();
      p.pos.x = -60;
      p.pos.z = 1320;
    }
    expect(p.fatigueTicks).toBe(0);
    expect(p.hp).toBe(1000);
  });
});
