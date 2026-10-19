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
import { planHeartWalls } from '../src/render/smith_heart/heart_walls_core';
import { SMITH_HEART_GATES, SMITH_HEART_MOBS } from '../src/sim/content/smith_heart';
import {
  BREATH,
  HEART,
  HEAT,
  LIGHT_RIVERS,
  QUENCH,
  RING,
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

describe('heart_walls_core: the mountain walls', () => {
  for (const spacing of [5, 7]) {
    const blocks = planHeartWalls(spacing);
    it(`spacing ${spacing}: plenty of wall, and none over walkable floor`, () => {
      expect(blocks.length).toBeGreaterThan(spacing === 5 ? 400 : 200);
      const bad: string[] = [];
      for (const b of blocks) {
        expect(b.top).toBeGreaterThan(b.base + 20);
        for (let k = 0; k <= 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const r = k === 16 ? 0 : b.r;
          const x = b.x + Math.sin(a) * r;
          const z = b.z + Math.cos(a) * r;
          if (onFloor(x, z)) bad.push(`(${b.x.toFixed(1)}, ${b.z.toFixed(1)}) r ${b.r.toFixed(2)}`);
        }
      }
      expect(bad.slice(0, 10)).toEqual([]);
    });
    it(`spacing ${spacing}: the caldera, the Wind Bridge's gulf and the Anvil's channels stay open`, () => {
      for (const b of blocks) {
        expect(Math.hypot(b.x - RING.x, b.z - RING.z) - b.r).toBeGreaterThanOrEqual(RING.innerR);
        const mx = (WIND_BRIDGE.fromX + WIND_BRIDGE.toX) / 2;
        const mz = (WIND_BRIDGE.fromZ + WIND_BRIDGE.toZ) / 2;
        expect(Math.hypot(b.x - mx, b.z - mz)).toBeGreaterThan(18);
        if (b.x < HEAT.anvil.x + 40 && Math.abs(b.z) < 30) {
          expect(Math.hypot(b.x - HEAT.anvil.x, b.z - HEAT.anvil.z)).toBeGreaterThan(20);
        }
      }
    });
  }
  it('walls flank every vein (the fissures read as cracks in the mountain)', () => {
    const blocks = planHeartWalls(5);
    const near = (x: number, z: number, d: number) =>
      blocks.some((b) => Math.hypot(b.x - x, b.z - z) < d);
    expect(near(BREATH.b1.x, BREATH.b1.z, 30)).toBe(true);
    expect(near(QUENCH.q1.x, QUENCH.q1.z, 30)).toBe(true);
    expect(near((HEAT.hall.x0 + HEAT.hall.x1) / 2, HEAT.hall.z1, 20)).toBe(true);
    // The Ring's outer gallery wall, between two vein mouths.
    const a = Math.PI / 4;
    expect(near(Math.sin(a) * (RING.outerR + 8), Math.cos(a) * (RING.outerR + 8), 8)).toBe(true);
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
      expect(visualKeyFor({ kind: 'mob', templateId: id } as never)).toBe(key);
    }
  });
});
