// The Smith's Heart blockout renderer's pure cores (src/render/smith_heart):
// the mountain walls against the walked floor and the open caldera, the
// light-rivers' drape, the seal memory fed by the mirrored markers, the gate
// poses, the prop recipes, the light budget, and the one list of borrowed
// placeholder bodies.

import { afterEach, describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { SMITH_HEART_PLACEHOLDER_LOOKS } from '../src/render/characters/smith_heart_placeholder_looks';
import { gateObjectPlan } from '../src/render/gate_objects';
import {
  HEART_SEAL_BARRIER,
  heartGatePartPose,
  heartGateParts,
  heartGateRig,
  heartSealGatePose,
  heartSlabPose,
} from '../src/render/smith_heart/heart_gates_core';
import {
  HEART_PROP_RECIPES,
  type HeartPart,
  heartLightZoneOf,
  heartPropBase,
  planHeartLights,
} from '../src/render/smith_heart/heart_plan_core';
import {
  HEART_RIVER_LIFT,
  HEART_RIVER_RUN_SECONDS,
  heartRiverLitSegments,
  planHeartRiver,
} from '../src/render/smith_heart/heart_rivers_core';
import {
  clearHeartSealForTest,
  HEART_SEAL_QUARTERS,
  heartSealQuarterLevel,
  heartSealSlotKey,
  heartSealView,
  isHeartSealMarker,
  observeHeartSealMarker,
} from '../src/render/smith_heart/heart_seal_core';
import {
  heartGateSolids,
  heartPropSolids,
  heartSightlineHits,
  heartWallSolids,
} from '../src/render/smith_heart/heart_sightline_core';
import {
  HEART_ROCK_VARIANTS,
  heartFloorClearance,
  heartRockShape,
  heartWallReach,
  planHeartWalls,
} from '../src/render/smith_heart/heart_walls_core';
import { SMITH_HEART_GATES, SMITH_HEART_MOBS } from '../src/sim/content/smith_heart';
import {
  BALCONY,
  BREATH,
  HEART,
  HEART_SEAL,
  HEAT,
  LIGHT_RIVERS,
  QUENCH,
  RING,
  RING_ARC,
  ringPoint,
  SMITH_HEART_FIELD,
  SMITH_HEART_VEIN_COLORS,
  SMITH_HEART_VEINS,
  WIND_BRIDGE,
} from '../src/sim/content/smith_heart_layout';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import { authoredFieldHeight, authoredFieldSurfaceAt } from '../src/sim/instances/authored_field';

const F = SMITH_HEART_FIELD;
const onFloor = (x: number, z: number) => authoredFieldSurfaceAt(F, x, z) !== null;
const floorAt = (x: number, z: number) => (onFloor(x, z) ? authoredFieldHeight(F, x, z) : null);

describe('heart_walls_core: the mountain rock', () => {
  for (const spacing of [5, 7]) {
    const blocks = planHeartWalls(spacing);
    it(`spacing ${spacing}: plenty of rock, every block 7+ yd from any walkable floor`, () => {
      expect(blocks.length).toBeGreaterThan(spacing === 5 ? 600 : 300);
      const bad: string[] = [];
      for (const b of blocks) {
        // The whole block, its lean included, then seven more yards.
        const outer = heartWallReach(b) + 7;
        const radii: number[] = [];
        for (let r = 0; r < outer; r += 1.5) radii.push(r);
        radii.push(outer);
        let hit = false;
        for (const r of radii) {
          for (let k = 0; k < 24 && !hit; k++) {
            const a = (k / 24) * Math.PI * 2;
            hit = onFloor(b.x + Math.sin(a) * r, b.z + Math.cos(a) * r);
          }
          if (hit) break;
        }
        if (hit) {
          bad.push(`(${b.x.toFixed(1)}, ${b.z.toFixed(1)}) reach ${heartWallReach(b).toFixed(2)}`);
        }
      }
      expect(bad.slice(0, 10)).toEqual([]);
    });
    it(`spacing ${spacing}: the caldera, the Wind Bridge's gulf and the Anvil's channels stay open`, () => {
      for (const b of blocks) {
        const reach = heartWallReach(b);
        expect(Math.hypot(b.x - RING.x, b.z - RING.z) - reach).toBeGreaterThanOrEqual(RING.innerR);
        const mx = (WIND_BRIDGE.fromX + WIND_BRIDGE.toX) / 2;
        const mz = (WIND_BRIDGE.fromZ + WIND_BRIDGE.toZ) / 2;
        expect(Math.hypot(b.x - mx, b.z - mz)).toBeGreaterThan(18);
        if (b.x < HEAT.anvil.x + 40 && Math.abs(b.z) < 30) {
          expect(Math.hypot(b.x - HEAT.anvil.x, b.z - HEAT.anvil.z)).toBeGreaterThan(20);
        }
      }
    });
  }
  it('reads as mountain rock, not a skyline: varied shapes, squashed, leaning out, low by the walks', () => {
    const blocks = planHeartWalls(5);
    expect(new Set(blocks.map((b) => b.variant)).size).toBe(HEART_ROCK_VARIANTS);
    // The tops spread widely (no rows of one height).
    const tops = blocks.map((b) => b.top);
    const mean = tops.reduce((a, t) => a + t, 0) / tops.length;
    const sd = Math.sqrt(tops.reduce((a, t) => a + (t - mean) ** 2, 0) / tops.length);
    expect(sd).toBeGreaterThan(8);
    let leanOut = 0;
    let near = 0;
    let nearLow = 0;
    for (const b of blocks) {
      expect(b.rz).toBeLessThanOrEqual(b.rx);
      const c = heartFloorClearance(b.x, b.z);
      // The lean points away from the floor the block faces.
      if (b.leanX * c.toX + b.leanZ * c.toZ < 0) leanOut++;
      if (c.d < 14) {
        near++;
        if (b.top - c.floor < 16) nearLow++;
      }
    }
    expect(leanOut / blocks.length).toBeGreaterThan(0.95);
    // The first teeth by a walk stay low (a camera behind a player sees over them).
    expect(near).toBeGreaterThan(50);
    expect(nearLow / near).toBeGreaterThan(0.9);
    // ... and the rock behind climbs into real walls.
    expect(blocks.some((b) => b.top - heartFloorClearance(b.x, b.z).floor > 45)).toBe(true);
  });
  it('builds every rock shape within its unit frame, with a jagged top', () => {
    for (let v = 0; v < HEART_ROCK_VARIANTS; v++) {
      const tri = heartRockShape(v);
      expect(tri.length % 9).toBe(0);
      expect(tri.length / 9).toBeGreaterThan(12);
      let maxY = 0;
      for (let i = 0; i < tri.length; i += 3) {
        expect(Math.hypot(tri[i], tri[i + 2])).toBeLessThanOrEqual(1 + 1e-9);
        expect(tri[i + 1]).toBeGreaterThanOrEqual(0);
        expect(tri[i + 1]).toBeLessThanOrEqual(1 + 1e-9);
        maxY = Math.max(maxY, tri[i + 1]);
      }
      expect(maxY).toBeGreaterThan(0.85);
    }
  });
  it('flanks every vein (the fissures read as cracks in the mountain)', () => {
    const blocks = planHeartWalls(5);
    const near = (x: number, z: number, d: number) =>
      blocks.some((b) => Math.hypot(b.x - x, b.z - z) < d);
    expect(near(BREATH.b1.x, BREATH.b1.z, 34)).toBe(true);
    expect(near(QUENCH.q1.x, QUENCH.q1.z, 34)).toBe(true);
    expect(near((HEAT.hall.x0 + HEAT.hall.x1) / 2, HEAT.hall.z1, 24)).toBe(true);
    // The Ring's outer gallery wall, between two vein mouths.
    const a = Math.PI / 4;
    expect(near(Math.sin(a) * (RING.outerR + 14), Math.cos(a) * (RING.outerR + 14), 8)).toBe(true);
  });
});

describe('heart_rivers_core: the floor light-rivers', () => {
  for (const vein of SMITH_HEART_VEINS) {
    it(`${vein}: drapes from its arena to the seal, faces up, hugs the floor`, () => {
      const pts = LIGHT_RIVERS[vein];
      const strip = planHeartRiver(pts, floorAt);
      expect(strip.segments).toBe(strip.points.length - 1);
      expect(strip.indices.length).toBe(strip.segments * 6);
      expect(strip.positions.length).toBe(strip.segments * 12);
      const first = strip.points[0];
      const last = strip.points[strip.points.length - 1];
      expect(Math.hypot(first.x - pts[0].x, first.z - pts[0].z)).toBeLessThan(0.01);
      expect(
        Math.hypot(last.x - pts[pts.length - 1].x, last.z - pts[pts.length - 1].z),
      ).toBeLessThan(0.01);
      // Every triangle faces the sky.
      const p = strip.positions;
      for (let t = 0; t < strip.indices.length; t += 3) {
        const [a, b, c] = [strip.indices[t], strip.indices[t + 1], strip.indices[t + 2]];
        const ux = p[b * 3] - p[a * 3];
        const uz = p[b * 3 + 2] - p[a * 3 + 2];
        const vx = p[c * 3] - p[a * 3];
        const vz = p[c * 3 + 2] - p[a * 3 + 2];
        expect(uz * vx - ux * vz).toBeGreaterThan(0);
      }
      // On the floor, the ribbon sits just over it, and every quad's corners
      // stand at their line point's height.
      for (const q of strip.points) {
        const h = floorAt(q.x, q.z);
        if (h === null) continue;
        expect(Math.abs(q.y - (h + HEART_RIVER_LIFT))).toBeLessThan(0.01);
      }
      for (let i = 0; i < strip.segments; i++) {
        expect(p[i * 12 + 1]).toBeCloseTo(strip.points[i].y);
        expect(p[i * 12 + 7]).toBeCloseTo(strip.points[i + 1].y);
      }
    });
  }
  it("the Hammer's river leaps the void from the Balcony's tip to the Heart, never dropping into it", () => {
    const strip = planHeartRiver(LIGHT_RIVERS.hammer, floorAt);
    let bridged = 0;
    for (const { x, y, z } of strip.points) {
      if (floorAt(x, z) !== null) continue;
      bridged++;
      expect(y).toBeGreaterThan(HEART.h);
      expect(y).toBeLessThan(21);
    }
    expect(bridged).toBeGreaterThan(5);
  });
  it('the light runs arena to seal on its own clock, whole when met already lit', () => {
    expect(heartRiverLitSegments(-1, 100)).toBe(0);
    expect(heartRiverLitSegments(0, 100)).toBe(0);
    expect(heartRiverLitSegments(HEART_RIVER_RUN_SECONDS / 2, 100)).toBe(50);
    expect(heartRiverLitSegments(999, 100)).toBe(100);
  });
});

describe('heart_seal_core: the seal memory from the mirrored markers', () => {
  afterEach(() => clearHeartSealForTest());
  const def = DUNGEONS.smith_heart;
  const o = instanceOrigin(def.index, 2);
  const key = heartSealSlotKey(o.x, o.z);
  const marker = (mask: number, dungeonId: string | null = 'smith_heart') => ({
    templateId: `smith_heart_seal_${mask}`,
    dungeonId,
    pos: { x: o.x + 120, z: o.z - 20 },
  });

  it('recognizes only seal markers, and only of this raid', () => {
    expect(isHeartSealMarker('smith_heart_seal_5')).toBe(true);
    expect(isHeartSealMarker('dungeon_gate_closed')).toBe(false);
    observeHeartSealMarker(marker(15, 'gravewyrm_sanctum'), 10);
    expect(heartSealView(key, 10).mask).toBe(0);
  });

  it('snaps a vein first seen lit, times a vein seen lighting, and starts over on a lost vein', () => {
    observeHeartSealMarker(marker(1), 10);
    let v = heartSealView(key, 10);
    expect(v.mask).toBe(1);
    expect(v.since[0]).toBeGreaterThan(100); // the Hammer, met already lit
    expect(v.since.slice(1)).toEqual([-1, -1, -1]);
    observeHeartSealMarker(marker(1 | 8), 20);
    v = heartSealView(key, 23);
    expect(v.mask).toBe(9);
    expect(v.since[3]).toBeCloseTo(3); // the Heat lit three seconds ago
    // A fresh claim in the same slot: dark again.
    observeHeartSealMarker(marker(0), 30);
    expect(heartSealView(key, 30).since).toEqual([-1, -1, -1, -1]);
  });

  it('is fed through the gate-object seam: a seal marker view is an empty anchor that reports', () => {
    const plan = gateObjectPlan({ ...marker(2) });
    expect(plan).toEqual({ encounterAnchor: true, height: 2 });
    expect(heartSealView(key, 0).mask).toBe(2);
  });

  it('faces each quarter at its vein mouth and flares then holds', () => {
    const at = Object.fromEntries(HEART_SEAL_QUARTERS.map((q) => [q.vein, q.bearingDeg]));
    expect(at.breath).toBeCloseTo(0);
    expect(at.quench).toBeCloseTo(90);
    expect(at.hammer).toBeCloseTo(180);
    expect(at.heat).toBeCloseTo(270);
    expect(heartSealQuarterLevel(-1)).toBe(0);
    expect(heartSealQuarterLevel(0)).toBe(0);
    expect(heartSealQuarterLevel(0.5)).toBeGreaterThan(0.5);
    expect(heartSealQuarterLevel(999)).toBe(1);
  });
});

describe('heart_gates_core: the gate poses', () => {
  it('rigs every Smith Heart gate kind', () => {
    for (const g of SMITH_HEART_GATES) expect(heartGateRig(g.kind), g.id).not.toBeNull();
    expect(heartGateRig('portcullis')).toBeNull();
  });
  it('the slab stands whole shut, splits and sinks out of sight open', () => {
    expect(heartSlabPose(0)).toEqual({ part: 0, sink: 0, shown: true });
    const mid = heartSlabPose(0.5);
    expect(mid.part).toBeGreaterThan(1);
    expect(mid.sink).toBeGreaterThan(0);
    expect(heartSlabPose(1).shown).toBe(false);
  });
  it('the forge seal shows its film shut, flares sealed, and is gone open', () => {
    expect(heartSealGatePose(0, false, 0)).toEqual({ sink: 0, film: 1, shown: true });
    expect(heartSealGatePose(0, true, Math.PI / 10).film).toBeGreaterThan(1.3);
    const open = heartSealGatePose(1, false, 0);
    expect(open.film).toBe(0);
    expect(open.shown).toBe(false);
  });
  it('the forge seal is a LOW barrier: nothing over 3 yd, nothing solid and wide above the sill', () => {
    for (const g of SMITH_HEART_GATES.filter((x) => x.kind === 'forge_seal')) {
      const parts = heartGateParts('seal', g.hw * 2);
      for (const p of parts) {
        expect(p.y + p.h / 2, `${g.id} ${p.role}`).toBeLessThanOrEqual(3);
        // Above the sill only thin light bars (and the end posts, outside
        // the passage) stand: no sheet, no disc, no wall.
        if (p.y - p.h / 2 >= HEART_SEAL_BARRIER.sillHeight - 1e-9 && p.role !== 'post') {
          expect(p.role).toBe('bar');
          expect(p.w).toBeLessThanOrEqual(0.2);
        }
        if (p.role === 'post') expect(Math.abs(p.x) - p.w / 2).toBeGreaterThanOrEqual(g.hw);
      }
      // It spans the whole passage (it reads as shut, wall to wall).
      const sill = parts.find((p) => p.role === 'sill');
      expect(sill?.w).toBeCloseTo(g.hw * 2);
      expect(parts.filter((p) => p.role === 'bar').length).toBeGreaterThanOrEqual(6);
      // Open: the sill and the bars sink out of sight; only the posts stay.
      for (const p of parts) {
        expect(heartGatePartPose(p, 'seal', 1).shown, p.role).toBe(p.role === 'post');
      }
    }
  });
  it('the slab stays a slab, and is gone open', () => {
    const parts = heartGateParts('slab', 15.2);
    expect(Math.max(...parts.map((p) => p.y + p.h / 2))).toBeLessThanOrEqual(9);
    for (const p of parts) expect(heartGatePartPose(p, 'slab', 1).shown).toBe(false);
  });
});

describe('heart_sightline_core: the raid sees the seal', () => {
  const solids = [
    ...heartWallSolids(5),
    ...heartWallSolids(7),
    ...heartPropSolids(),
    ...heartGateSolids(0),
    ...heartGateSolids(0.5),
    ...heartGateSolids(1),
  ];
  const seal = { x: HEART_SEAL.x, y: HEART.h + 0.5, z: HEART_SEAL.z };
  const eye = (x: number, z: number) => ({ x, y: authoredFieldHeight(F, x, z) + 1.7, z });
  const balconyTip = eye(0, BALCONY.z1);

  it('plans every family of solid (the pin is not vacuous)', () => {
    expect(heartWallSolids(5).length).toBeGreaterThan(600);
    expect(heartPropSolids().length).toBeGreaterThan(60);
    expect(heartGateSolids(0).length).toBeGreaterThan(40);
    // A ray straight through a shut causeway seal's sill does hit it.
    const g = SMITH_HEART_GATES.find((x) => x.id === 'causeway_north');
    if (!g) throw new Error('no north causeway gate');
    const low = authoredFieldHeight(F, g.x, g.z) + 0.3;
    expect(
      heartSightlineHits({ x: g.x, y: low, z: g.z + 3 }, { x: g.x, y: low, z: g.z - 3 }, solids),
    ).toContain('causeway_north:sill');
  });

  it('every point of the Ring sees the seal over every gate, prop and rock', () => {
    const bad: string[] = [];
    const degs: number[] = [RING_ARC.fromDeg, RING_ARC.toDeg];
    for (let d = Math.ceil(RING_ARC.fromDeg / 10) * 10; d <= RING_ARC.toDeg; d += 10) degs.push(d);
    expect(degs.length).toBeGreaterThan(25);
    for (const deg of degs) {
      const p = ringPoint(deg, RING.R);
      const hits = heartSightlineHits(eye(p.x, p.z), seal, solids);
      if (hits.length) bad.push(`ring ${deg % 360}: ${hits.join(', ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('the Balcony tip sees the seal and each causeway mouth', () => {
    expect(heartSightlineHits(balconyTip, seal, solids)).toEqual([]);
    for (const deg of [0, 90, 270]) {
      const m = ringPoint(deg, 66);
      const mouth = { x: m.x, y: authoredFieldHeight(F, m.x, m.z) + 1, z: m.z };
      expect(heartSightlineHits(balconyTip, mouth, solids), `mouth ${deg}`).toEqual([]);
    }
  });
});

/** How far a part reaches from the prop's centre across the ground. */
function reach(p: HeartPart): number {
  const off = Math.hypot(p.x, p.z);
  if (p.shape === 'box') return off + Math.hypot(p.w / 2, p.d / 2);
  if (p.shape === 'cyl') return off + Math.max(p.w, p.d) / 2;
  return off + p.w / 2;
}

describe('heart_plan_core: the placeholder props and the lights', () => {
  it('has a recipe for every sh_ prop kind the field places, and no dead rows', () => {
    const kinds = new Set(F.props.map((p) => p.kind));
    for (const k of kinds) {
      expect(k.startsWith('sh_'), k).toBe(true);
      expect(HEART_PROP_RECIPES[k], k).toBeDefined();
    }
    expect(Object.keys(HEART_PROP_RECIPES).sort()).toEqual([...kinds].sort());
  });

  it('keeps every part a body can touch within its collider (plus a body width)', () => {
    for (const prop of F.props) {
      if (prop.r === undefined && prop.hw === undefined) continue;
      const foot = prop.r ?? Math.hypot(prop.hw ?? 0, prop.hd ?? 0);
      for (const p of HEART_PROP_RECIPES[prop.kind]) {
        if (p.y - p.h / 2 > 2.6) continue; // above a body's head
        expect(reach(p), `${prop.kind} part`).toBeLessThanOrEqual(foot + 0.6);
      }
    }
  });

  it('stands no render-only solid over walkable floor', () => {
    const bad: string[] = [];
    for (const prop of F.props) {
      if (prop.r !== undefined || prop.hw !== undefined) continue;
      const base = heartPropBase(prop.x, prop.z);
      for (const p of HEART_PROP_RECIPES[prop.kind]) {
        const bottom = base + p.y - p.h / 2;
        const top = base + p.y + p.h / 2;
        const hw = p.shape === 'box' ? p.w / 2 : Math.max(p.w, p.d) / 2;
        const hd = p.shape === 'box' ? p.d / 2 : Math.max(p.w, p.d) / 2;
        for (const [u, v] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [0, 0],
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          // Local to world (rotation.y = rot): x' = x cos + z sin, z' = -x sin + z cos.
          const lx = p.x + u * hw;
          const lz = p.z + v * hd;
          const c = Math.cos(prop.rot);
          const s = Math.sin(prop.rot);
          const x = prop.x + lx * c + lz * s;
          const z = prop.z - lx * s + lz * c;
          const h = floorAt(x, z);
          if (h === null) continue;
          // A flush inlay is fine; a solid across a body's height is not.
          if (top > h + 0.35 && bottom < h + 2.6)
            bad.push(`${prop.kind} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('keys each vein in its colour and keeps at most eight lights per light zone', () => {
    const lights = planHeartLights();
    for (const vein of SMITH_HEART_VEINS) {
      const key = lights.find((l) => l.id === `key:${vein}`);
      expect(key?.color, vein).toBe(SMITH_HEART_VEIN_COLORS[vein]);
    }
    const perZone = new Map<string, number>();
    for (const l of lights) {
      expect(l.x).toBeGreaterThanOrEqual(F.bounds.minX);
      expect(l.x).toBeLessThanOrEqual(F.bounds.maxX);
      const zone = heartLightZoneOf(l.x, l.z)?.id ?? 'none';
      perZone.set(zone, (perZone.get(zone) ?? 0) + 1);
    }
    for (const [zone, n] of perZone) expect(n, zone).toBeLessThanOrEqual(8);
  });
});

describe('smith_heart_placeholder_looks: the one list of borrowed bodies', () => {
  it('maps every Smith Heart mob to a real, non-Ignivar visual, through MOB_KEYS', () => {
    expect(Object.keys(SMITH_HEART_PLACEHOLDER_LOOKS).sort()).toEqual(
      Object.keys(SMITH_HEART_MOBS).sort(),
    );
    for (const [id, key] of Object.entries(SMITH_HEART_PLACEHOLDER_LOOKS)) {
      expect(VISUALS[key], `${id} -> ${key}`).toBeDefined();
      expect(key.includes('ignivar'), key).toBe(false);
      // Never a lava-cracked or fel body for the white-gold Heat either.
      expect(['mob_hoard_magma_brute', 'mob_emberkin']).not.toContain(key);
      expect(visualKeyFor({ kind: 'mob', templateId: id } as never)).toBe(key);
    }
  });
});
