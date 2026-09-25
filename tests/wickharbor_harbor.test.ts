import { beforeAll, describe, expect, it } from 'vitest';
import { type Collider, queryOpenWorldColliders } from '../src/sim/colliders';
import {
  deckLocal,
  deckPoint,
  harborDeck,
  harborLocal,
  harborPoint,
  WICKHARBOR_BEACON_DOCK_TOP,
  WICKHARBOR_BEACON_STAIR_TOP,
  WICKHARBOR_BOARDWALK_TOP,
  WICKHARBOR_HARBOR_DECKS,
  WICKHARBOR_HARBOR_MOVED_DECOR,
  WICKHARBOR_HARBOR_PROPS,
  WICKHARBOR_HARBOR_RAILS,
  WICKHARBOR_STAIR_FIRST_RISE,
  type WickharborHarborDeck,
} from '../src/sim/content/wickharbor_harbor';
import { WICKHARBOR_BOARDWALK_ABOVE_WATER } from '../src/sim/content/wickharbor_wharf';
import { WYRMWATCH_RAIL_HEIGHT } from '../src/sim/content/wyrmwatch_harbor';
import { CAMPS, GATHER_NODES, NPCS, PROPS, ZONES } from '../src/sim/data';
import { FERRY_PIER_DECKS } from '../src/sim/ferry_piers';
import {
  GALE_DECK_FREEBOARD,
  GALE_DECK_LIFT,
  GALE_HARBOR_DECKS,
  type GaleDeckDef,
  galeDeckAlong,
  galeDeckSurfaceAt,
} from '../src/sim/gale_harbor';
import { MAX_STEP_HEIGHT } from '../src/sim/physics/character';
import { Sim } from '../src/sim/sim';
import { collectCalmAnchorPads } from '../src/sim/terrain_calm_anchors';
import { wickharborHarborColliders } from '../src/sim/wickharbor_harbor';
import { groundHeight, terrainHeight, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

// Wickharbor's wooden harbor (src/sim/content/wickharbor_harbor.ts): the shore boardwalk,
// the two north piers, the two bluff stairs and the Old Beacon's dock and stair, rebuilt in
// the ferry wharf's wood as one harbor. This suite pins that no two walkable floors of the
// WHOLE harbor share a plank plane anywhere (the wharf's own decks among them), that every
// join is flush or one deliberate step with no gap, that every drop is railed and every
// opening is a stride onto the land, that the solids stand clear of the walks, and walks
// every route with the real movement kernel.

const S = WORLD_SEED;
const terrainAt = (x: number, z: number): number => terrainHeight(x, z, S);
const aw = (x: number, z: number): number => groundHeight(x, z, S) - WATER_LEVEL;
const deckAt = (d: GaleDeckDef, along: number): number =>
  galeDeckSurfaceAt(d, along, terrainAt, WATER_LEVEL) - WATER_LEVEL;

/** Every walkable floor of the harbor: Wickharbor's plank decks and the ferry pier surface
 *  query (the ferry wharf's decks among them). */
const FLOORS: readonly { name: string; deck: GaleDeckDef }[] = [
  ...GALE_HARBOR_DECKS.map((deck) => ({ name: (deck as WickharborHarborDeck).id, deck })),
  ...FERRY_PIER_DECKS.map((deck, i) => ({
    name: 'id' in deck ? `wharf ${String((deck as { id: string }).id)}` : `ferry ${i}`,
    deck,
  })),
];

/** The deck's plank height (above the water) at (x, z), or null off it (strictly inside,
 *  by `inset`). */
function surfaceIn(d: GaleDeckDef, x: number, z: number, inset = 1e-6): number | null {
  const along = galeDeckAlong(d, x, z, inset);
  return along === null ? null : deckAt(d, along);
}

/** The floors under (x, z). */
function floorsAt(x: number, z: number, inset = 1e-6): { name: string; y: number }[] {
  const out: { name: string; y: number }[] = [];
  for (const { name, deck } of FLOORS) {
    const y = surfaceIn(deck, x, z, inset);
    if (y !== null) out.push({ name, y });
  }
  return out;
}

/** Clearance between a circle and a collider (negative = overlap). */
function clearance(x: number, z: number, r: number, c: Collider): number {
  if (c.type === 'circle') return Math.hypot(x - c.x, z - c.z) - c.r - r;
  const cos = Math.cos(-c.rot);
  const sin = Math.sin(-c.rot);
  const lx = (x - c.x) * cos + (z - c.z) * sin;
  const lz = -(x - c.x) * sin + (z - c.z) * cos;
  const dx = Math.max(0, Math.abs(lx) - c.hw);
  const dz = Math.max(0, Math.abs(lz) - c.hd);
  return Math.hypot(dx, dz) - r;
}

/** The whole harbor: the plank decks' own early-out box (gale_harbor.ts). */
const ZONE = { x0: 440, x1: 536, z0: 312, z1: 396 };
const byId = harborDeck;
const colliders = wickharborHarborColliders(S);

describe('Wickharbor harbor: the decks', () => {
  it('keeps the decks in their old order on their old shore anchors (the terrain is untouched)', () => {
    expect(GALE_HARBOR_DECKS).toBe(WICKHARBOR_HARBOR_DECKS);
    expect(WICKHARBOR_HARBOR_DECKS.map((d) => d.id)).toEqual([
      'pierNorth',
      'pierMiddle',
      'boardwalk',
      'stairSouth',
      'stairNorth',
      'beaconPier',
      'beaconStair',
    ]);
    expect(WICKHARBOR_HARBOR_DECKS.map((d) => [d.ax, d.az, d.ax2, d.az2])).toEqual([
      [465, 354, undefined, undefined],
      [465, 354, undefined, undefined],
      [465, 354, undefined, undefined],
      [465, 354, 458, 361],
      [465, 354, 460, 352],
      [507, 327, undefined, undefined],
      [497, 321, 507, 327],
    ]);
  });

  it('sets each plank height above the water at the height the terrain always gave it', () => {
    // the shore network: the freeboard floor plus the lift (its anchor lies under the floor)
    expect(WICKHARBOR_BOARDWALK_TOP).toBeCloseTo(GALE_DECK_FREEBOARD + GALE_DECK_LIFT, 9);
    expect(WICKHARBOR_BOARDWALK_TOP).toBeCloseTo(WICKHARBOR_BOARDWALK_ABOVE_WATER, 9);
    expect(terrainAt(465, 354)).toBeLessThan(WATER_LEVEL + GALE_DECK_FREEBOARD);
    // the Beacon's dock and stair head: their anchors plus the lift
    expect(WICKHARBOR_BEACON_DOCK_TOP).toBeCloseTo(
      terrainAt(507, 327) + GALE_DECK_LIFT - WATER_LEVEL,
      3,
    );
    expect(WICKHARBOR_BEACON_STAIR_TOP).toBeCloseTo(
      terrainAt(497, 321) + GALE_DECK_LIFT - WATER_LEVEL,
      3,
    );
    for (const d of WICKHARBOR_HARBOR_DECKS) {
      expect(d.nearAboveWater, d.id).toBeDefined();
      expect(d.farAboveWater, d.id).toBeDefined();
      if (d.kind === 'level') expect(d.nearAboveWater, d.id).toBe(d.farAboveWater);
      expect(Math.min(d.nearAboveWater ?? 0, d.farAboveWater ?? 0), d.id).toBeGreaterThanOrEqual(
        GALE_DECK_FREEBOARD,
      );
    }
    for (const id of ['pierNorth', 'pierMiddle', 'boardwalk'] as const) {
      expect(byId(id).nearAboveWater, id).toBe(WICKHARBOR_BOARDWALK_TOP);
    }
  });

  it('keeps the boardwalk, the north pier and the Beacon stair where they stood, and the heads of the piers', () => {
    expect(byId('boardwalk')).toMatchObject({ x: 467.5, z: 358, rot: -0.124, hl: 8.1, hw: 1.7 });
    expect(byId('pierNorth')).toMatchObject({ x: 481.6, z: 353.7, rot: 1.3, hl: 12, hw: 1.8 });
    expect(byId('beaconPier')).toMatchObject({ x: 517.2, z: 337.2, rot: 0.785, hl: 13, hw: 2.2 });
    // the headland's cutting (world.ts terrainHeight) was carved for exactly this stair
    expect(byId('beaconStair')).toMatchObject({ x: 503.3, z: 325.3, rot: 0.99, hl: 6.94, hw: 1.4 });
    // the middle pier squared off the boardwalk: its head is where it always was
    const m = byId('pierMiddle');
    const tip = deckPoint(m, m.hl, 0);
    expect(Math.hypot(tip.x - 492.81, tip.z - 364.17)).toBeLessThan(0.02);
    expect(m.hw).toBe(2);
  });
});

describe('Wickharbor harbor: no two floors in one plane (the owner report)', () => {
  it('no two walkable floors of the harbor overlap at the same height anywhere', () => {
    const clashes: string[] = [];
    const steps = new Set<string>();
    for (let x = ZONE.x0; x <= ZONE.x1; x += 0.2) {
      for (let z = ZONE.z0; z <= ZONE.z1; z += 0.2) {
        const here = floorsAt(x, z);
        for (let i = 0; i < here.length; i++) {
          for (let j = i + 1; j < here.length; j++) {
            const pair = [here[i].name, here[j].name].sort().join(' over ');
            if (Math.abs(here[i].y - here[j].y) < 0.2) {
              clashes.push(`${pair} at (${x.toFixed(1)}, ${z.toFixed(1)})`);
            } else steps.add(pair);
          }
        }
      }
    }
    expect(clashes.slice(0, 8)).toEqual([]);
    // the only floors that overlap at all are the two stairs whose first tread stands on the
    // boardwalk, a step above it: the south stair and the ferry wharf's flight
    expect([...steps].sort()).toEqual(['boardwalk over stairSouth', 'boardwalk over wharf flight']);
  });

  it('stands the south stair on the boardwalk a step above its planks, and meets every other join flush', () => {
    const s = byId('stairSouth');
    expect(s.nearAboveWater).toBeCloseTo(WICKHARBOR_BOARDWALK_TOP + WICKHARBOR_STAIR_FIRST_RISE, 9);
    expect(WICKHARBOR_STAIR_FIRST_RISE).toBeLessThan(MAX_STEP_HEIGHT / 2);
    // its whole first tread rests on the boardwalk (no gap to fall through)
    for (let a = -s.hw + 0.02; a <= s.hw - 0.02; a += 0.1) {
      const p = deckPoint(s, -s.hl + 0.02, a);
      expect(surfaceIn(byId('boardwalk'), p.x, p.z, 0), `foot at ${a}`).not.toBeNull();
    }
    // the flush joins: across each shared edge the floors meet with no gap and no step
    const seams: { name: string; a: { x: number; z: number }; b: { x: number; z: number } }[] = [
      { name: 'middle pier on the boardwalk', a: harborPoint(1.0, 1.7), b: harborPoint(4.98, 1.7) },
      {
        name: 'north pier on the boardwalk',
        a: harborPoint(-8.08, 1.7),
        b: harborPoint(-5.96, 1.7),
      },
      {
        name: 'north stair off the boardwalk',
        a: harborPoint(-6.13, -1.7),
        b: harborPoint(-3.57, -1.7),
      },
      {
        name: 'the Beacon stair onto its dock',
        a: deckPoint(byId('beaconStair'), 6.94, -1.38),
        b: deckPoint(byId('beaconStair'), 6.94, 1.38),
      },
    ];
    for (const seam of seams) {
      const nx = seam.b.z - seam.a.z;
      const nz = -(seam.b.x - seam.a.x);
      const len = Math.hypot(nx, nz);
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        const x = seam.a.x + (seam.b.x - seam.a.x) * t;
        const z = seam.a.z + (seam.b.z - seam.a.z) * t;
        const one = floorsAt(x + (nx / len) * 0.03, z + (nz / len) * 0.03, 0);
        const two = floorsAt(x - (nx / len) * 0.03, z - (nz / len) * 0.03, 0);
        expect(one.length, `${seam.name} side one at ${t}`).toBeGreaterThan(0);
        expect(two.length, `${seam.name} side two at ${t}`).toBeGreaterThan(0);
        const ya = Math.max(...one.map((f) => f.y));
        const yb = Math.max(...two.map((f) => f.y));
        expect(Math.abs(ya - yb), `${seam.name} at ${t}`).toBeLessThan(0.03);
      }
    }
  });

  it('trims the north pier and the Beacon dock along the edges they meet', () => {
    const n = byId('pierNorth');
    // the pier's old root, inside the boardwalk, is the boardwalk's alone
    expect(surfaceIn(n, harborPoint(-7, 1.2).x, harborPoint(-7, 1.2).z)).toBeNull();
    expect(surfaceIn(n, harborPoint(-7, 1.9).x, harborPoint(-7, 1.9).z)).not.toBeNull();
    // the dock's old root, under the Beacon stair's last treads, is the stair's alone
    const st = byId('beaconStair');
    const under = deckPoint(st, 6.4, 0);
    expect(surfaceIn(byId('beaconPier'), under.x, under.z)).toBeNull();
    const past = deckPoint(st, 7.2, 0);
    expect(surfaceIn(byId('beaconPier'), past.x, past.z)).not.toBeNull();
  });
});

describe('Wickharbor harbor: the stairs and the ground', () => {
  it('climbs each stair within a stride per tread, and lands its head on the ground', () => {
    for (const id of ['stairSouth', 'stairNorth', 'beaconStair'] as const) {
      const d = byId(id);
      const rise = Math.abs((d.farAboveWater ?? 0) - (d.nearAboveWater ?? 0));
      expect(rise / (2 * d.hl), id).toBeLessThan(0.8);
    }
    // the bluff stairs' heads meet the land beyond them: a short step down at most
    for (const id of ['stairSouth', 'stairNorth'] as const) {
      const d = byId(id);
      const top = d.farAboveWater ?? 0;
      for (let c = -d.hw + 0.2; c <= d.hw - 0.2; c += 0.2) {
        const p = deckPoint(d, d.hl + 0.3, c);
        const drop = top - aw(p.x, p.z);
        expect(drop, `${id} head at ${c.toFixed(1)}`).toBeLessThan(0.45);
        expect(drop, `${id} head at ${c.toFixed(1)}`).toBeGreaterThan(-0.3);
      }
    }
  });

  it('stands clear of the terrain everywhere', () => {
    for (const d of WICKHARBOR_HARBOR_DECKS) {
      let least = Number.POSITIVE_INFINITY;
      for (let a = -d.hl + 0.05; a <= d.hl - 0.05; a += 0.25) {
        for (let c = -d.hw + 0.05; c <= d.hw - 0.05; c += 0.25) {
          const p = deckPoint(d, a, c);
          if (galeDeckAlong(d, p.x, p.z) === null) continue;
          least = Math.min(least, deckAt(d, a) - (terrainAt(p.x, p.z) - WATER_LEVEL));
        }
      }
      // the Beacon stair rides the headland's cutting, carved a hand under its treads
      expect(least, d.id).toBeGreaterThan(d.id === 'beaconStair' ? 0.2 : 0.05);
    }
  });
});

describe('Wickharbor harbor: rails and solids', () => {
  const railCount = colliders.length - WICKHARBOR_HARBOR_PROPS.length;

  it('rails every drop a rail height over the planks; every opening is a stride onto the land', () => {
    expect(railCount).toBeGreaterThan(80);
    for (const c of colliders.slice(0, railCount)) {
      const under = groundHeight(c.x, c.z, S);
      expect(c.moveTopY ?? 0).toBeGreaterThanOrEqual(under + WYRMWATCH_RAIL_HEIGHT - 1e-6);
      expect(c.standable).toBeUndefined();
      // every rail stands on planks
      expect(floorsAt(c.x, c.z, 0).length, `rail at (${c.x}, ${c.z})`).toBeGreaterThan(0);
    }
    const open: string[] = [];
    let railed = 0;
    for (const d of WICKHARBOR_HARBOR_DECKS) {
      const edges: [number, number, number, number, number, number][] = [
        [-d.hl, -d.hw, d.hl, -d.hw, 0, -1],
        [-d.hl, d.hw, d.hl, d.hw, 0, 1],
        [-d.hl, -d.hw, -d.hl, d.hw, -1, 0],
        [d.hl, -d.hw, d.hl, d.hw, 1, 0],
      ];
      for (const [a0, c0, a1, c1, na, nc] of edges) {
        const n = Math.ceil(Math.hypot(a1 - a0, c1 - c0) / 0.25);
        for (let k = 0; k <= n; k++) {
          const a = a0 + ((a1 - a0) * k) / n;
          const c = c0 + ((c1 - c0) * k) / n;
          const inside = deckPoint(d, a - na * 0.05, c - nc * 0.05);
          if (galeDeckAlong(d, inside.x, inside.z) === null) continue; // trimmed by a cut
          const out = deckPoint(d, a + na * 0.25, c + nc * 0.25);
          if (floorsAt(out.x, out.z, 0).some((f) => f.name !== d.id)) continue; // a join
          const p = deckPoint(d, a, c);
          if (colliders.slice(0, railCount).some((col) => clearance(p.x, p.z, 0.05, col) < 0)) {
            railed++;
            continue;
          }
          // a sliver of plank behind a rail (the north pier's root corner past the boardwalk's
          // end) no player can stand at: their body meets the rail first
          if (colliders.slice(0, railCount).some((col) => clearance(p.x, p.z, 0.5, col) < 0))
            continue;
          const drop = deckAt(d, a - na * 0.05) - aw(out.x, out.z);
          if (drop > 0.75)
            open.push(`${d.id} (${a.toFixed(2)}, ${c.toFixed(2)}) drop ${drop.toFixed(2)}`);
        }
      }
      // the cut edges: the north pier's (the boardwalk joins it, the rail closes the rest)
      // and the Beacon dock's (the stair joins it, rails either side)
      for (const cut of d.cuts ?? []) {
        for (let t = -6; t <= 6; t += 0.1) {
          const x = cut.x - cut.nz * t;
          const z = cut.z + cut.nx * t;
          if (galeDeckAlong(d, x + cut.nx * 0.05, z + cut.nz * 0.05) === null) continue;
          const ox = x - cut.nx * 0.25;
          const oz = z - cut.nz * 0.25;
          if (floorsAt(ox, oz, 0).some((f) => f.name !== d.id)) continue;
          if (colliders.slice(0, railCount).some((col) => clearance(x, z, 0.05, col) < 0)) continue;
          const drop = (d.nearAboveWater ?? 0) - aw(ox, oz);
          if (drop > 0.75)
            open.push(`${d.id} cut (${x.toFixed(2)}, ${z.toFixed(2)}) drop ${drop.toFixed(2)}`);
        }
      }
    }
    expect(open.slice(0, 40)).toEqual([]);
    expect(railed).toBeGreaterThan(300);
  });

  it('solidifies every prop on the planks: cargo can be stood on, the lantern posts are full height', () => {
    const props = colliders.slice(railCount);
    props.forEach((c, i) => {
      const p = WICKHARBOR_HARBOR_PROPS[i];
      expect(c.x).toBe(p.x);
      expect(c.z).toBe(p.z);
      expect(floorsAt(p.x, p.z).length, p.kind).toBe(1);
      const base = groundHeight(p.x, p.z, S);
      expect(c.cameraTopY).toBeCloseTo(base + p.height, 6);
      if (p.kind === 'lanternPost') expect(c.moveTopY).toBeUndefined();
      else expect(c.standable, p.kind).toBe(true);
      // no prop stands in a rail (a box prop: its outline, sampled)
      const outline: [number, number, number][] = [];
      if (p.r !== undefined) outline.push([p.x, p.z, p.r]);
      else {
        const hw = p.hw ?? 0.5;
        const hd = p.hd ?? 0.5;
        for (let t = -1; t <= 1; t += 0.1) {
          for (const [lx, lz] of [
            [t * hw, -hd],
            [t * hw, hd],
            [-hw, t * hd],
            [hw, t * hd],
          ]) {
            // three.js yaw: local +x onto (cos, -sin), local +z onto (sin, cos)
            outline.push([
              p.x + Math.cos(p.rot) * lx + Math.sin(p.rot) * lz,
              p.z - Math.sin(p.rot) * lx + Math.cos(p.rot) * lz,
              0,
            ]);
          }
        }
      }
      for (const r of colliders.slice(0, railCount)) {
        for (const [x, z, rad] of outline) {
          expect(clearance(x, z, rad, r), `${p.kind} at (${p.x}, ${p.z})`).toBeGreaterThan(0.02);
        }
      }
    });
  });

  it('joins the live static grid, ungated', () => {
    for (const c of colliders) {
      const near: Collider[] = [];
      queryOpenWorldColliders(S, c.x - 0.1, c.z - 0.1, c.x + 0.1, c.z + 0.1, near);
      expect(
        near.some((n) => n.x === c.x && n.z === c.z && n.gate === undefined),
        `(${c.x}, ${c.z})`,
      ).toBe(true);
    }
  });
});

describe('Wickharbor harbor: what stays as it was', () => {
  it('leaves every NPC, spawn camp, gathering node and point of interest on its own ground', () => {
    const inHarbor = (x: number, z: number): boolean =>
      x > ZONE.x0 - 10 && x < ZONE.x1 + 10 && z > ZONE.z0 - 10 && z < ZONE.z1 + 10;
    const anchors: [string, number, number][] = [
      ...Object.values(NPCS).map((n) => [n.id, n.pos.x, n.pos.z] as [string, number, number]),
      ...CAMPS.map((c) => [c.mobId, c.center.x, c.center.z] as [string, number, number]),
      ...GATHER_NODES.map((g) => [g.id, g.pos.x, g.pos.z] as [string, number, number]),
      ...ZONES.flatMap((zn) =>
        zn.pois.map((p) => [p.id ?? p.label, p.x, p.z] as [string, number, number]),
      ),
    ].filter(([, x, z]) => inHarbor(x, z));
    expect(anchors.length).toBeGreaterThan(3);
    for (const [id, x, z] of anchors) {
      // nothing of the harbor stands on or around them
      expect(floorsAt(x, z, -0.5), id).toEqual([]);
      for (const c of colliders) expect(clearance(x, z, 1, c), id).toBeGreaterThan(0);
    }
  });

  it('moved only the dinghy that lay under the north pier, and it keeps its terrain pad', () => {
    expect(WICKHARBOR_HARBOR_MOVED_DECOR).toHaveLength(1);
    for (const m of WICKHARBOR_HARBOR_MOVED_DECOR) {
      const rows = (PROPS.decorProps ?? []).filter((p) => p.key === m.key);
      expect(rows.filter((p) => p.x === m.to.x && p.z === m.to.z)).toHaveLength(1);
      expect(rows.filter((p) => p.x === m.from.x && p.z === m.from.z)).toHaveLength(0);
      // the pad stays where the row first lay (terrain_calm_anchors.ts)
      const pads = collectCalmAnchorPads().filter((r) => r.category === 'decorProp');
      expect(pads.some((r) => r.x === m.from.x && r.z === m.from.z)).toBe(true);
      expect(pads.some((r) => r.x === m.to.x && r.z === m.to.z)).toBe(false);
    }
  });

  it('keeps every moored hull and dinghy off the planks', () => {
    // the hulls' footprints (the KayKit models at their decor scale): the ship 13.5 by 6, the
    // dinghy 3.6 by 1.8, long axis on the prop's yaw
    const hulls = (PROPS.decorProps ?? []).filter(
      (p) =>
        /^hex(ShipBlue|Boat)$/.test(p.key) &&
        p.x > ZONE.x0 - 10 &&
        p.x < ZONE.x1 + 10 &&
        p.z > ZONE.z0 - 10 &&
        p.z < ZONE.z1 + 10,
    );
    expect(hulls.length).toBeGreaterThanOrEqual(8);
    for (const p of hulls) {
      const [hl, hw] = p.key === 'hexShipBlue' ? [6.75, 3] : [1.8, 0.9];
      const ax = { x: Math.sin(p.rot ?? 0), z: Math.cos(p.rot ?? 0) };
      for (let a = -hl; a <= hl; a += 0.25) {
        for (let c = -hw; c <= hw; c += 0.25) {
          const x = p.x + ax.x * a + ax.z * c;
          const z = p.z + ax.z * a - ax.x * c;
          expect(floorsAt(x, z, -0.2), `${p.key} at (${p.x}, ${p.z})`).toEqual([]);
        }
      }
    }
  });
});

describe('Wickharbor harbor: walking it (the real movement kernel)', () => {
  let sim: Sim;
  const idle = {
    forward: false,
    back: false,
    turnLeft: false,
    turnRight: false,
    strafeLeft: false,
    strafeRight: false,
    jump: false,
    dive: false,
    surface: false,
  };

  function place(x: number, z: number): void {
    const p = sim.player;
    p.pos = { x, y: groundHeight(x, z, S), z };
    p.prevPos = { ...p.pos };
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.onGround = true;
  }

  /** Walk toward (x, z); returns where it ended and the lowest the feet went under the
   *  ground at any tick (a fall shows as a large negative). */
  function walk(tx: number, tz: number, jump = false, maxTicks = 300) {
    const p = sim.player;
    const meta = sim.players.get(p.id);
    if (!meta) throw new Error('meta');
    let sink = 0;
    for (let i = 0; i < maxTicks; i++) {
      const dx = tx - p.pos.x;
      const dz = tz - p.pos.z;
      if (Math.hypot(dx, dz) < 0.25) break;
      p.facing = Math.atan2(dx, dz);
      Object.assign(meta.moveInput, { ...idle, forward: true, jump: jump && p.onGround });
      sim.tick();
      sink = Math.min(sink, p.pos.y - groundHeight(p.pos.x, p.pos.z, S));
    }
    Object.assign(meta.moveInput, idle);
    for (let i = 0; i < 10; i++) sim.tick();
    return { x: p.pos.x, z: p.pos.z, y: p.pos.y - WATER_LEVEL, sink };
  }

  /** Walk a route there and back, arriving at every waypoint on the planks or the ground. */
  function route(points: readonly { x: number; z: number }[]): void {
    place(points[0].x, points[0].z);
    const legs = [...points.slice(1), ...[...points].reverse().slice(1)];
    for (const { x, z } of legs) {
      const end = walk(x, z);
      expect(
        Math.hypot(end.x - x, end.z - z),
        `to (${x.toFixed(2)}, ${z.toFixed(2)})`,
      ).toBeLessThan(0.4);
      expect(Math.abs(end.y - aw(end.x, end.z)), `at (${x}, ${z})`).toBeLessThan(0.05);
      expect(end.sink, `to (${x}, ${z})`).toBeGreaterThan(-0.05);
    }
  }

  const H = harborPoint;
  const D = (id: Parameters<typeof harborDeck>[0], a: number, c: number) =>
    deckPoint(byId(id), a, c);

  beforeAll(() => {
    sim = new Sim({ seed: S, playerClass: 'warrior' });
    sim.setPlayerLevel(60);
  });

  it('town to the middle pier head: down the south stair, across the boardwalk, out along the pier', () => {
    route([
      H(4.27, -9.2),
      H(4.27, -6.5),
      H(4.27, -3.5),
      H(4.2, -1.0),
      H(2.99, 0.6),
      D('pierMiddle', -8, 0),
      D('pierMiddle', 10.5, 0.4),
    ]);
  }, 120_000);

  it('the harbor market to the north pier head: down the north stair, along the boardwalk, out along the pier', () => {
    route([
      H(-4.85, -9.0),
      H(-4.85, -6.0),
      H(-4.85, -2.5),
      H(-5.2, 0.4),
      H(-7.0, 1.0),
      D('pierNorth', -6, 0),
      D('pierNorth', 9.5, -0.2),
    ]);
  }, 120_000);

  it('the beach to the boardwalk and along it to the ferry wharf flight', () => {
    route([H(-10.4, -0.9), H(-8.9, -0.8), H(-7.2, -0.6), H(-2, 0.2), H(3, 0.3), H(7.0, 0.2)]);
  }, 120_000);

  it('the Old Beacon lawn to its dock head: down the stair, out along the dock', () => {
    const st = byId('beaconStair');
    route([
      D('beaconStair', -st.hl - 1.2, 0),
      D('beaconStair', -4, 0),
      D('beaconStair', 3, 0),
      D('beaconPier', -8, 0),
      D('beaconPier', 11, 0),
    ]);
  }, 120_000);

  it('the rails hold: walking or jumping at every drop keeps the player on the planks', () => {
    // (start, push toward) in a deck's frame, and the height the player must keep
    const drops: [Parameters<typeof harborDeck>[0], number, number, number, number][] = [
      ['pierNorth', 3, -1.0, 3, -8],
      ['pierNorth', 3, 1.0, 3, 8],
      ['pierNorth', 10.5, -0.2, 18, -0.2],
      ['pierMiddle', 0, -1.1, 0, -8],
      ['pierMiddle', 0, 1.1, 0, 8],
      ['pierMiddle', 10.8, 0.6, 18, 0.6],
      ['boardwalk', -1.0, 0.8, -1.0, 8],
      ['boardwalk', 6.5, 0.8, 6.5, 8],
      ['boardwalk', -2.2, -0.3, -2.2, -8],
      ['boardwalk', -7.2, 1.0, -12, 1.0],
      ['beaconPier', 0, -1.3, 0, -8],
      ['beaconPier', 0, 1.3, 0, 8],
      ['beaconPier', 11.6, 0, 18, 0],
    ];
    for (const jump of [false, true]) {
      for (const [id, a, c, ta, tc] of drops) {
        const d = byId(id);
        const start = deckPoint(d, a, c);
        const to = deckPoint(d, ta, tc);
        for (const col of colliders) {
          expect(clearance(start.x, start.z, 0.5, col), `start ${id} (${a}, ${c})`).toBeGreaterThan(
            0,
          );
        }
        place(start.x, start.z);
        const y0 = sim.player.pos.y - WATER_LEVEL;
        const end = walk(to.x, to.z, jump, 60);
        expect(end.y, `${jump ? 'jump' : 'walk'} ${id} (${a}, ${c})`).toBeGreaterThan(y0 - 0.05);
      }
    }
    // the stairs' sides: the player stays on the treads (whatever height they reach)
    for (const jump of [false, true]) {
      for (const [id, a] of [
        ['stairSouth', 0],
        ['stairNorth', 0],
        ['beaconStair', 4],
      ] as const) {
        for (const side of [1, -1]) {
          const d = byId(id);
          const start = deckPoint(d, a, side * (d.hw - 0.7));
          const to = deckPoint(d, a, side * 8);
          place(start.x, start.z);
          const y0 = sim.player.pos.y - WATER_LEVEL;
          const end = walk(to.x, to.z, jump, 60);
          expect(end.y, `${id} side ${side}`).toBeGreaterThan(y0 - 0.5);
          const l = harborLocal(end.x, end.z);
          expect(Number.isFinite(l.u)).toBe(true);
        }
      }
    }
  }, 120_000);
});
