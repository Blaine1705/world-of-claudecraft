// The Wildheart Basin renderer's pure cores (src/render/wildheart_basin/
// basin_plan_core.ts and basin_fx_core.ts): the waterfalls stand where the
// layout puts them and the Waterfall Walk's veil falls in front of its ledge
// without touching it, the rainbows face the sun and read from the Idol Maw,
// the water sits where the sim's floor says it should, the gates' motion
// curves run the right way, the lights stay inside the per-zone budget, and
// every telegraph draws the edge the sim tests.
import { describe, expect, it } from 'vitest';
import { TELEGRAPH_THREAT_COLORS } from '../src/render/floor_telegraph/telegraph_look_core';
import {
  BASIN_OBJECT_SPECS,
  basinTelegraphSpecs,
  cloudPresence,
  entangleGrowth,
  STOMP_SHOCK_SECONDS,
  stompShock,
  TOTEM_PULSE_RADIUS,
  TOTEM_PULSE_SECONDS,
  totemPulse,
} from '../src/render/wildheart_basin/basin_fx_core';
import {
  BASIN_SUN_DIRECTION,
  BASIN_WATER,
  basinFloorAt,
  FORD_SHEET,
  fallPoint,
  fallWidth,
  JAGUAR_EYES,
  lightZoneOf,
  PLUNGE_POOL,
  planBasinFalls,
  planBasinLights,
  planBasinRainbows,
  planMoteSpots,
  planVineSegments,
  planWalkMask,
  riverStations,
  sunHorizontal,
  thornRise,
  VINE_BRIDGE_PATHS,
  vineWeaveGrowth,
  WALK_VEIL,
  wardCharge,
} from '../src/render/wildheart_basin/basin_plan_core';
import {
  IDOL_LANDING,
  RIM_FALLS,
  RIVER_FORD,
  WILDHEART_BASIN_ANCHORS,
  WILDHEART_HEIGHTS,
} from '../src/sim/content/wildheart_basin_layout';
import { MOBS } from '../src/sim/data';
import {
  SAURIAN_STOMP,
  SAURIAN_TAIL_SWIPE,
  SAURIAN_TUNING,
  WILDHEART_SPORE_CLOUD,
} from '../src/sim/encounters/wildheart_basin/ids';
import { WILDHEART_ENTANGLING_LASH } from '../src/sim/mob/trash_kit/wildheart_cast_ids';

const falls = planBasinFalls();
const byId = (id: string) => {
  const f = falls.find((x) => x.id === id);
  if (!f) throw new Error(`no fall ${id}`);
  return f;
};

describe('the waterfalls', () => {
  it('draws every rim fall of the layout, the Walk veil and the ford spill', () => {
    expect(falls.map((f) => f.id).sort()).toEqual(
      [...RIM_FALLS.map((f) => f.id), 'walk_veil', 'ford_spill'].sort(),
    );
    for (const r of RIM_FALLS) {
      const f = byId(r.id);
      expect(fallWidth(f)).toBeCloseTo(r.width, 6);
      expect(f.top).toBe(r.topY);
      expect(f.bottom).toBe(r.bottomY);
      expect(Math.hypot(f.nx, f.nz)).toBeCloseTo(1, 9);
      // The lip is centred on the layout's point and the curtain faces its yaw.
      expect((f.ax + f.bx) / 2).toBeCloseTo(r.x, 6);
      expect((f.az + f.bz) / 2).toBeCloseTo(r.z, 6);
      expect(f.nx).toBeCloseTo(Math.sin(r.facing), 9);
      expect(f.nz).toBeCloseTo(Math.cos(r.facing), 9);
    }
  });

  it('lands every fall off the walkable floor (into the gorge or the plunge pool)', () => {
    for (const f of falls) {
      for (const u of [0.1, 0.5, 0.9]) {
        const [x, , z] = fallPoint(f, u, 1);
        expect(basinFloorAt(x, z), `${f.id} lands on a walkway at u=${u}`).toBeNull();
      }
    }
  });

  it('lets the party walk behind the veil: it falls in front of the ledge, never on it', () => {
    const veil = byId('walk_veil');
    // The ledge behind the falls runs z -24..0 at height 15; the veil spans it.
    expect(veil.az).toBeLessThanOrEqual(-24);
    expect(veil.bz).toBeGreaterThanOrEqual(0);
    expect(veil.top).toBeGreaterThan(WILDHEART_HEIGHTS.behindFalls + 20);
    expect(veil.bottom).toBeLessThan(WILDHEART_HEIGHTS.behindFalls);
    // Down its whole length the sheet stays west of the walkable ledge, with
    // a gap a body can stand in at the ledge's own height.
    for (let t = 0; t <= 1; t += 0.05) {
      for (const u of [0, 0.5, 1]) {
        const [x, y, z] = fallPoint(veil, u, t);
        expect(basinFloorAt(x, z), `veil over a walkway at t=${t}`).toBeNull();
        if (Math.abs(y - WILDHEART_HEIGHTS.behindFalls) < 3) expect(x).toBeLessThan(WALK_VEIL.x);
      }
    }
    // The ledge itself is walkable, just east of the lip.
    expect(basinFloorAt(WILDHEART_BASIN_ANCHORS.behindFalls.x, -12)).toBe(
      WILDHEART_HEIGHTS.behindFalls,
    );
  });
});

describe('the rainbows', () => {
  const bows = planBasinRainbows(falls);
  const [sx, sz] = sunHorizontal(BASIN_SUN_DIRECTION);

  it('stands one in the spray of every fall but the ford spill, facing the sun', () => {
    expect(bows.map((b) => b.fallId).sort()).toEqual(
      falls
        .filter((f) => f.kind !== 'spill')
        .map((f) => f.id)
        .sort(),
    );
    for (const b of bows) {
      expect(Math.sin(b.yaw)).toBeCloseTo(sx, 9);
      expect(Math.cos(b.yaw)).toBeCloseTo(sz, 9);
      expect(b.radius).toBeGreaterThan(4);
      expect(b.strength).toBeGreaterThan(0);
      expect(b.strength).toBeLessThanOrEqual(0.6);
      // On the sun's side of its fall's foot.
      const f = byId(b.fallId);
      expect((b.x - f.footX) * sx + (b.z - f.footZ) * sz).toBeGreaterThan(0);
    }
  });

  it('reads from the Idol Maw: the vista sees the face of every far fall bow', () => {
    for (const id of ['north_west', 'north_east', 'weeping']) {
      const b = bows.find((x) => x.fallId === id);
      expect(b).toBeDefined();
      if (!b) continue;
      const vx = IDOL_LANDING.x - b.x;
      const vz = IDOL_LANDING.z - b.z;
      expect(vx * Math.sin(b.yaw) + vz * Math.cos(b.yaw), id).toBeGreaterThan(0);
    }
  });

  it('keeps the sun low behind the maw (a gold afternoon, the bows toward the vista)', () => {
    const [x, y, z] = BASIN_SUN_DIRECTION;
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
    expect(y).toBeGreaterThan(0.3);
    expect(y).toBeLessThan(0.7);
    expect(z).toBeLessThan(0);
  });
});

describe('the water', () => {
  it('lays the ford sheet over the ford box, a hand over its floor and under its banks', () => {
    expect([FORD_SHEET.x0, FORD_SHEET.x1, FORD_SHEET.z0, FORD_SHEET.z1]).toEqual([
      RIVER_FORD.x0,
      RIVER_FORD.x1,
      RIVER_FORD.z0,
      RIVER_FORD.z1,
    ]);
    expect(FORD_SHEET.y).toBeGreaterThan(RIVER_FORD.h);
    expect(FORD_SHEET.y - RIVER_FORD.h).toBeLessThan(0.5);
    expect(FORD_SHEET.y).toBeLessThan(WILDHEART_HEIGHTS.bank);
    expect(basinFloorAt(0, -110)).toBe(RIVER_FORD.h);
  });

  it('runs the river down the gorge, below every walkway', () => {
    const stations = riverStations(4);
    expect(stations.length).toBeGreaterThan(50);
    for (const s of stations) {
      expect(s.y).toBeLessThan(-20);
      expect(s.halfWidth).toBeGreaterThan(3);
      expect(Math.hypot(s.nx, s.nz)).toBeCloseTo(1, 6);
    }
    for (let i = 1; i < stations.length; i++)
      expect(stations[i].s).toBeGreaterThan(stations[i - 1].s);
  });

  it('sits the plunge pool under the Weeping Falls, below the terrace it borders', () => {
    const weeping = byId('weeping');
    expect(Math.hypot(PLUNGE_POOL.x - weeping.footX, PLUNGE_POOL.z - weeping.footZ)).toBeLessThan(
      PLUNGE_POOL.r,
    );
    expect(PLUNGE_POOL.y).toBe(BASIN_WATER.pool);
    expect(PLUNGE_POOL.y).toBeLessThan(WILDHEART_HEIGHTS.fallsTerrace);
  });

  it('masks the gorge haze off every walkway', () => {
    const size = 64;
    const mask = planWalkMask(size, 0);
    const at = (x: number, z: number): number => {
      const i = Math.floor(((x + 114) / 228) * size);
      const j = Math.floor(((z + 240) / 480) * size);
      return mask[j * size + i];
    };
    expect(at(0, -110)).toBe(1); // the ford
    expect(at(0, 16)).toBe(1); // the central island
    expect(at(60, -20)).toBe(0); // the gorge east of the island
  });

  it('scatters the motes on the walkable floor only', () => {
    for (const [x, y, z] of planMoteSpots(80, 17)) expect(basinFloorAt(x, z)).toBe(y);
  });
});

describe('the gates move the right way', () => {
  it('weaves a vine bridge from the ford end, every segment woven when open', () => {
    const n = 9;
    for (let i = 0; i < n; i++) {
      expect(vineWeaveGrowth(0, i, n)).toBe(0);
      expect(vineWeaveGrowth(1, i, n)).toBe(1);
    }
    // Mid-weave the ford end is further along than the far end.
    expect(vineWeaveGrowth(0.4, 0, n)).toBeGreaterThan(vineWeaveGrowth(0.4, n - 1, n));
    let last = -1;
    for (let o = 0; o <= 1; o += 0.05) {
      const g = vineWeaveGrowth(o, 4, n);
      expect(g).toBeGreaterThanOrEqual(last);
      last = g;
    }
  });

  it('lays the woven segments on the bridge path, end to end', () => {
    for (const path of [VINE_BRIDGE_PATHS.west, VINE_BRIDGE_PATHS.east]) {
      const segs = planVineSegments(path, 4);
      let total = 0;
      for (let i = 0; i + 1 < path.length; i++) {
        const [ax, az, ah] = path[i];
        const [bx, bz, bh] = path[i + 1];
        total += Math.hypot(bx - ax, bz - az, bh - ah);
      }
      expect(segs.reduce((s, x) => s + x.length, 0)).toBeCloseTo(total, 6);
      expect(segs.map((s) => s.index)).toEqual(segs.map((_, i) => i));
      for (const s of segs) {
        expect(Math.hypot(s.dx, s.dy, s.dz)).toBeCloseTo(1, 9);
        expect(s.length).toBeGreaterThan(2);
        expect(s.length).toBeLessThan(6);
      }
      // The deck starts at the ford's height and ends at the far ledge's.
      expect(segs[0].y).toBeCloseTo(path[0][2], 6);
      expect(segs[segs.length - 1].y).toBeCloseTo(path[path.length - 1][2], 6);
    }
  });

  it('sinks the thorn hedge as it opens and stands it when shut or sealed', () => {
    expect(thornRise(0)).toBe(1);
    expect(thornRise(1)).toBeCloseTo(0, 9);
    let last = 2;
    for (let o = 0; o <= 1.0001; o += 0.05) {
      const r = thornRise(o);
      expect(r).toBeLessThanOrEqual(last);
      last = r;
    }
  });

  it('burns a ward full while shut and puts it out when open', () => {
    expect(wardCharge(0, 3)).toBe(1);
    expect(wardCharge(1, 3)).toBe(0);
    for (const t of [0.1, 0.7, 2.3]) expect(wardCharge(0.5, t)).toBeLessThanOrEqual(0.5);
  });
});

describe('the lights', () => {
  it('lights every brazier and keeps each light zone within eight live lights', () => {
    const spots = planBasinLights();
    expect(spots.length).toBeGreaterThanOrEqual(8);
    const perZone = new Map<string, number>();
    const add = (x: number, z: number) => {
      const zone = lightZoneOf(x, z) ?? 'none';
      perZone.set(zone, (perZone.get(zone) ?? 0) + 1);
    };
    for (const s of spots) add(s.x, s.z);
    // One eye light between the jaguar's eyes, in the shrine zone.
    const eyeX = JAGUAR_EYES.reduce((a, e) => a + e.x, 0) / JAGUAR_EYES.length;
    const eyeZ = JAGUAR_EYES.reduce((a, e) => a + e.z, 0) / JAGUAR_EYES.length - 5;
    add(eyeX, eyeZ);
    for (const [zone, n] of perZone) expect(n, zone).toBeLessThanOrEqual(8);
    expect(perZone.get('shrine')).toBeGreaterThanOrEqual(5);
  });
});

describe('the telegraphs draw the sim edge', () => {
  const specs = basinTelegraphSpecs();
  const palette = new Set(Object.values(TELEGRAPH_THREAT_COLORS));

  it('turns the Tail Swipe behind the Saurian, 120 degrees and 12 yd', () => {
    const tail = specs[SAURIAN_TAIL_SWIPE];
    expect(tail.shape).toBe('cone');
    expect(tail.range).toBe(SAURIAN_TUNING.tailRange);
    expect(tail.arcDeg).toBe(SAURIAN_TUNING.tailArcDeg);
    expect(tail.yawOffset).toBeCloseTo(Math.PI, 9);
  });

  it('rings the Stomp at its full reach and the lash lane at the template', () => {
    const stomp = specs[SAURIAN_STOMP];
    expect(stomp.shape).toBe('ring');
    expect(stomp.range).toBe(SAURIAN_TUNING.stompRadius);
    const lash = specs[WILDHEART_ENTANGLING_LASH];
    const line = MOBS.vine_lasher?.trashKit?.line;
    expect(line).toBeDefined();
    expect(lash.shape).toBe('lane');
    expect(lash.range).toBe(line?.length);
    expect(lash.halfWidth).toBe(line?.halfWidth);
    expect(lash.yawOffset).toBe(0);
  });

  it('paints every shape in the threat palette (the colour is the threat)', () => {
    for (const [id, s] of Object.entries(specs)) expect(palette.has(s.color), id).toBe(true);
    for (const [id, s] of Object.entries(BASIN_OBJECT_SPECS))
      expect(palette.has(s.color), id).toBe(true);
    expect(specs[SAURIAN_STOMP].color).toBe(TELEGRAPH_THREAT_COLORS.control);
    expect(specs[SAURIAN_TAIL_SWIPE].color).toBe(TELEGRAPH_THREAT_COLORS.danger);
  });

  it('shows the spore cloud from its first tick to its last', () => {
    const seconds = BASIN_OBJECT_SPECS[WILDHEART_SPORE_CLOUD].seconds;
    expect(seconds).toBe(MOBS.spore_toad?.trashKit?.deathCloud?.seconds);
    expect(cloudPresence(0.3, seconds)).toBe(1);
    expect(cloudPresence(seconds - 0.1, seconds)).toBeGreaterThan(0.35);
    expect(cloudPresence(seconds + 1, seconds)).toBeGreaterThan(0);
  });

  it('races the shock and the pulse out to their reach and fades them', () => {
    const shock = stompShock(STOMP_SHOCK_SECONDS);
    expect(shock.radius).toBeGreaterThanOrEqual(SAURIAN_TUNING.stompRadius);
    expect(shock.alpha).toBe(0);
    expect(stompShock(0).radius).toBeLessThan(SAURIAN_TUNING.stompRadius * 0.3);
    const pulse = totemPulse(TOTEM_PULSE_SECONDS);
    expect(pulse.radius).toBeCloseTo(TOTEM_PULSE_RADIUS, 6);
    expect(pulse.alpha).toBe(0);
    expect(TOTEM_PULSE_RADIUS).toBe(MOBS.sunbone_totem?.trashKit?.pulse?.radius);
    expect(entangleGrowth(0)).toBe(0);
    expect(entangleGrowth(1)).toBe(1);
  });
});
