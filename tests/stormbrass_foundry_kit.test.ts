// The Stormbrass Foundry kit's contracts: the shipped piece list (scripts/assets/
// stormbrass_foundry_kit/build.mjs) against the pieces the placement plan
// (src/render/stormbrass_foundry/foundry_kit_plan_core.ts), the movers and the
// gates use, the shipped GLB against its sources (fingerprint, nodes,
// materials, budget), every sim prop kind of the layout drawn by a piece, the
// machinery colliders standing clear of every pack, patrol and gate, and the
// dressing audited against the REAL floor with the REAL shipped geometry:
//   - nothing stands in a walkway's head room without a sim collider (a
//     knee-high kerb, low litter and a railing on the lip excepted);
//   - nothing floats: a piece stands on the floor, rises from the drop, sits
//     on its pier, its posts or its lip, or hangs from a rail over every head.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ASSET,
  STORMBRASS_FOUNDRY_KIT_PIECES,
  sourceFingerprint,
} from '../scripts/assets/stormbrass_foundry_kit/build.mjs';
import {
  CRANE_BRIDGE_CARRY_LIFT,
  CRANE_BRIDGE_SEAT_SHARE,
  craneBridgePose,
  craneBridgeProgress,
  craneBridgeRig,
} from '../src/render/stormbrass_foundry/foundry_bridge_core';
import {
  decalCorners,
  FOUNDRY_DECAL_KINDS,
  planFoundryFloorDecals,
} from '../src/render/stormbrass_foundry/foundry_floor_plan_core';
import {
  FOUNDRY_ADOPTED_PIECES,
  FOUNDRY_COLLIDER_ONLY,
  FOUNDRY_EDGE_VARIANTS,
  FOUNDRY_FORGE,
  FOUNDRY_GATE_PIECES,
  FOUNDRY_KIT_SIZES,
  FOUNDRY_LITTER,
  FOUNDRY_MOLTEN_CHANNEL,
  FOUNDRY_OPEN_WALKS,
  FOUNDRY_POUR_MOULDS,
  FOUNDRY_SKYLINE,
  FOUNDRY_WORKER_CAMP_SPOTS,
  type FoundryKitPlacement,
  forgeFurnacePoints,
  foundryEdgeVariant,
  foundryPieceForProp,
  foundrySpawnPoints,
  hammerBlow,
  ladleState,
  POUR_CYCLE,
  pistonStroke,
  planAdits,
  planCatwalkTrusses,
  planFoundryEdges,
  planFoundryEmitters,
  planFoundryKitPlacements,
  planFoundryMovers,
  planFoundryPropPlacements,
  planMoltenChannel,
  planRailYard,
  planSkyline,
  planTargetLine,
} from '../src/render/stormbrass_foundry/foundry_kit_plan_core';
import {
  coilAfterglowAt,
  coilStrikeAt,
  craneBridgeDeck,
  planFoundryLights,
} from '../src/render/stormbrass_foundry/foundry_plan_core';
import { HAULER_LOOP, STORMBRASS_FOUNDRY_GATES } from '../src/sim/content/stormbrass_foundry';
import {
  CRANE_BRIDGE,
  STORMBRASS_FOUNDRY_FIELD,
  STORMBRASS_FOUNDRY_VOID_HEIGHT,
} from '../src/sim/content/stormbrass_foundry_layout';
import {
  FOUNDRY_MACHINERY_PROPS,
  FOUNDRY_POUR_LINE,
} from '../src/sim/content/stormbrass_foundry_machinery';
import {
  authoredFieldCliffRuns,
  authoredFieldHeight,
  authoredFieldSurfaceAt,
  CLIFF_HALF_DEPTH,
  type FieldProp,
} from '../src/sim/instances/authored_field';

const KIT = ASSET.target;
const FIELD = STORMBRASS_FOUNDRY_FIELD;
const VOID = STORMBRASS_FOUNDRY_VOID_HEIGHT;
const floor = (x: number, z: number): number => authoredFieldHeight(FIELD, x, z);
const walkable = (x: number, z: number): boolean => floor(x, z) > VOID + 1;

type V3 = [number, number, number];
interface Shape {
  min: V3;
  max: V3;
  /** Every vertex, glTF frame (x, y up, z front). */
  points: V3[];
}

const shapes = new Map<string, Shape>();
/** Triangles per shipped piece. */
const triangles = new Map<string, number>();
let extras: Record<string, unknown> = {};
let nodeNames: string[] = [];
let materialNames: string[] = [];
const haveKit = existsSync(KIT);

beforeAll(async () => {
  if (!haveKit) return;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(new Uint8Array(readFileSync(KIT)));
  extras = (doc.getRoot().getExtras() ?? {}) as Record<string, unknown>;
  nodeNames = doc
    .getRoot()
    .listNodes()
    .map((n) => n.getName())
    .sort();
  materialNames = doc
    .getRoot()
    .listMaterials()
    .map((m) => m.getName())
    .sort();
  for (const node of doc.getRoot().listNodes()) {
    const name = node.getName();
    if (!name.startsWith('Kit_')) continue;
    const points: V3[] = [];
    const m = node.getWorldMatrix();
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const a = prim.getAttribute('POSITION');
        if (!a) continue;
        const e: number[] = [];
        for (let i = 0; i < a.getCount(); i++) {
          a.getElement(i, e);
          points.push([
            m[0] * e[0] + m[4] * e[1] + m[8] * e[2] + m[12],
            m[1] * e[0] + m[5] * e[1] + m[9] * e[2] + m[13],
            m[2] * e[0] + m[6] * e[1] + m[10] * e[2] + m[14],
          ]);
        }
      }
    }
    let tris = 0;
    if (mesh)
      for (const prim of mesh.listPrimitives())
        tris +=
          (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3;
    triangles.set(name, tris);
    const min: V3 = [Infinity, Infinity, Infinity];
    const max: V3 = [-Infinity, -Infinity, -Infinity];
    for (const p of points)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p[k]);
        max[k] = Math.max(max[k], p[k]);
      }
    shapes.set(name, { min, max, points });
  }
});

/** A local (glTF frame) point to instance-local world, as the painter does
 *  (foundry_kit.ts foundryPlacementMatrix). */
function placer(p: FoundryKitPlacement): (lx: number, ly: number, lz: number) => V3 {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const y0 = p.y ?? floor(p.x, p.z) + (p.lift ?? 0);
  const sx = p.scale * (p.stretch ?? 1);
  const sy = p.scale * (p.scaleY ?? 1);
  return (lx, ly, lz) => {
    const x = lx * sx;
    const y = ly * sy + (p.shear ?? 0) * x;
    const z = lz * p.scale;
    return [p.x + x * c + z * s, y0 + y, p.z - x * s + z * c];
  };
}

function worldBox(p: FoundryKitPlacement, shape: Shape): { min: V3; max: V3 } {
  const at = placer(p);
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const lx of [shape.min[0], shape.max[0]])
    for (const ly of [shape.min[1], shape.max[1]])
      for (const lz of [shape.min[2], shape.max[2]]) {
        const w = at(lx, ly, lz);
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], w[k]);
          max[k] = Math.max(max[k], w[k]);
        }
      }
  return { min, max };
}

const CLIFFS = authoredFieldCliffRuns(FIELD);

/** Distance from (x, z) to the nearest generated cliff wall's line. */
function cliffDistance(x: number, z: number): number {
  let best = Infinity;
  for (const r of CLIFFS) {
    const dx = r.bx - r.ax;
    const dz = r.bz - r.az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - r.ax) * dx + (z - r.az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (r.ax + dx * t), z - (r.az + dz * t)));
  }
  return best;
}

/** Inside a generated cliff wall's collider (the lip dressing clads it)? */
function inCliff(x: number, z: number): boolean {
  return cliffDistance(x, z) <= CLIFF_HALF_DEPTH + 0.05;
}

/** A prop's footprint corners (a circle's bounding square). */
function footprint(p: FieldProp, margin = 0): [number, number][] {
  const hw = (p.hw ?? p.r ?? 0.5) + margin;
  const hd = (p.hd ?? p.r ?? 0.5) + margin;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return (
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const
  ).map(([lx, lz]) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c]);
}

/** Inside a sim prop's collider footprint (grown by `margin`)? */
function inCollider(props: readonly FieldProp[], x: number, z: number, margin: number): boolean {
  for (const p of props) {
    const dx = x - p.x;
    const dz = z - p.z;
    if (p.r !== undefined && p.r > 0) {
      if (Math.hypot(dx, dz) <= p.r + margin) return true;
    } else if (p.hw !== undefined && p.hd !== undefined) {
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) <= p.hw + margin && Math.abs(lz) <= p.hd + margin) return true;
    }
  }
  return false;
}

/** Distance from a point to a prop's footprint (0 inside). */
function colliderDistance(p: FieldProp, x: number, z: number): number {
  const dx = x - p.x;
  const dz = z - p.z;
  if (p.r !== undefined && p.r > 0) return Math.max(0, Math.hypot(dx, dz) - p.r);
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const lx = Math.abs(dx * c - dz * s) - (p.hw ?? 0);
  const lz = Math.abs(dx * s + dz * c) - (p.hd ?? 0);
  return Math.hypot(Math.max(0, lx), Math.max(0, lz));
}

describe('Stormbrass Foundry kit: the piece list and the shipped GLB', () => {
  it('ships exactly the pieces the plan, the movers, the gates and the press use', () => {
    const shipped = new Set(STORMBRASS_FOUNDRY_KIT_PIECES.map((p) => `Kit_${p}`));
    const used = new Set(planFoundryKitPlacements().map((p) => p.piece));
    for (const m of planFoundryMovers()) used.add(m.piece);
    for (const piece of FOUNDRY_GATE_PIECES) used.add(piece);
    for (const piece of FOUNDRY_ADOPTED_PIECES) used.add(piece);
    expect([...used].sort()).toEqual([...shipped].sort());
    // The pieces the other painters adopt exist (foundryKitPiece).
    for (const piece of ['Kit_PressHammer', 'Kit_PressCarriage', 'Kit_GreatCoilGlow'])
      expect(shipped.has(piece), piece).toBe(true);
  });

  it.skipIf(!haveKit)('was built from the current sources, nodes and materials intact', () => {
    expect(extras.sourceFingerprint).toBe(sourceFingerprint());
    expect(nodeNames).toEqual(
      [ASSET.root, ...STORMBRASS_FOUNDRY_KIT_PIECES.map((p) => `Kit_${p}`)].sort(),
    );
    expect(materialNames).toEqual(ASSET.materials);
    expect(statSync(KIT).size).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it.skipIf(!haveKit)('keeps every piece and the whole dressing inside the triangle budget', () => {
    // Per piece: a hero piece at most 20k, a tile drawn hundreds of times far less.
    const tiles = new Set([
      'Kit_RailingEdge',
      'Kit_RailingEdgeB',
      'Kit_RailingEdgeC',
      'Kit_MachineLip',
      'Kit_MachineLipB',
      'Kit_RetainingWall',
      'Kit_PipeEdge',
      'Kit_PipeEdgeB',
      'Kit_PipeEdgeC',
      'Kit_TowerPanel',
      'Kit_CatwalkTruss',
      'Kit_BeltHousing',
      'Kit_ChannelSegment',
      'Kit_LadleRail',
      'Kit_RailTrack',
      'Kit_PipeRun',
      'Kit_Sandbags',
      'Kit_Cable',
    ]);
    for (const [name, n] of triangles) {
      expect(n, name).toBeGreaterThan(0);
      expect(n, name).toBeLessThanOrEqual(tiles.has(name) ? 1000 : 20000);
    }
    // The whole static dressing as drawn on the top tier, and on the low one.
    const drawn = (low: boolean) =>
      planFoundryKitPlacements()
        .filter((p) => !(low && p.cosmetic))
        .reduce((sum, p) => sum + (triangles.get(p.piece) ?? 0), 0);
    expect(drawn(false)).toBeLessThan(1_450_000);
    // The low tier sheds the skyline, the mains and the litter: a quarter at least.
    expect(drawn(true)).toBeLessThan(drawn(false) * 0.78);
  });

  it.skipIf(!haveKit)('keeps the moving and tiling pieces to their contract', () => {
    const size = (name: string) => {
      const s = shapes.get(name) as Shape;
      return { s, w: s.max[0] - s.min[0], h: s.max[1] - s.min[1], d: s.max[2] - s.min[2] };
    };
    // The bridge span: a 4 yd tile, 9 wide, its walking surface on the origin.
    const span = size('Kit_BridgeSpan');
    expect(span.w).toBeGreaterThan(3.9);
    expect(span.w).toBeLessThan(4.4);
    expect(span.d).toBeGreaterThan(8.8);
    const deckTop = span.s.points
      .filter((p) => Math.abs(p[2]) < 4.51 && Math.abs(p[0]) < 1.8 && p[1] < 0.3)
      .reduce((m, p) => Math.max(m, p[1]), -Infinity);
    expect(Math.abs(deckTop)).toBeLessThan(0.15);
    // Tiles join end to end along x.
    for (const [name, half] of [
      ['Kit_RailingEdge', 2],
      ['Kit_RailingEdgeB', 2],
      ['Kit_RailingEdgeC', 2],
      ['Kit_MachineLip', 2],
      ['Kit_MachineLipB', 2],
      ['Kit_RetainingWall', 2],
      ['Kit_PipeEdge', 2],
      ['Kit_PipeEdgeB', 2],
      ['Kit_PipeEdgeC', 2],
      ['Kit_TowerPanel', 2],
      ['Kit_CatwalkTruss', 2],
      ['Kit_BeltHousing', 2],
      ['Kit_ChannelSegment', 2],
      ['Kit_LadleRail', 2],
      ['Kit_RailTrack', 1],
    ] as const) {
      const s = shapes.get(name) as Shape;
      expect(s.min[0], name).toBeGreaterThan(-half - 0.15);
      expect(s.min[0], name).toBeLessThan(-half + 0.1);
      expect(s.max[0], name).toBeLessThan(half + 0.15);
      expect(s.max[0], name).toBeGreaterThan(half - 0.1);
    }
    // The truss hangs wholly under its deck; a railing stays a knee tall.
    expect((shapes.get('Kit_CatwalkTruss') as Shape).max[1]).toBeLessThanOrEqual(0);
    for (const name of ['Kit_RailingEdge', 'Kit_RailingEdgeB', 'Kit_RailingEdgeC'])
      expect((shapes.get(name) as Shape).max[1], name).toBeLessThanOrEqual(1.4);
    // An edge tile's variants keep its contract: the same depth down the face
    // and the same kerb height, so any one fits any run.
    for (const [basePiece, variants] of Object.entries(FOUNDRY_EDGE_VARIANTS)) {
      const b = shapes.get(basePiece) as Shape;
      for (const v of variants) {
        const s = shapes.get(v) as Shape;
        expect(Math.abs(s.min[1] - b.min[1]), v).toBeLessThan(0.1);
        expect(s.max[1], v).toBeLessThanOrEqual(b.max[1] + 0.05);
        expect(s.max[2], v).toBeLessThanOrEqual(b.max[2] + 0.3);
      }
    }
    // Spinning parts turn about their hub (the origin).
    for (const name of ['Kit_Flywheel', 'Kit_Gear']) {
      const s = shapes.get(name) as Shape;
      expect(Math.abs(s.max[1] + s.min[1]), name).toBeLessThan(0.3);
      expect(Math.abs(s.max[2] + s.min[2]), name).toBeLessThan(0.3);
    }
    // The coil's glow sits inside the coil.
    const coil = shapes.get('Kit_GreatCoil') as Shape;
    const glow = shapes.get('Kit_GreatCoilGlow') as Shape;
    for (let k = 0; k < 3; k++) {
      expect(glow.min[k]).toBeGreaterThanOrEqual(coil.min[k] - 0.6);
      expect(glow.max[k]).toBeLessThanOrEqual(coil.max[k] + 0.6);
    }
    expect(coil.max[1]).toBeGreaterThan(30);
    // The ladle hangs under its trunnions; the hammer strikes with its origin.
    expect((shapes.get('Kit_Ladle') as Shape).min[1]).toBeGreaterThan(-3.6);
    expect(Math.abs((shapes.get('Kit_PressHammer') as Shape).min[1])).toBeLessThan(0.1);
  });
});

describe('Stormbrass Foundry kit: the layout props', () => {
  it('draws every sf_ prop kind with a piece, or names it collider-only', () => {
    const kinds = new Set(FIELD.props.map((p) => p.kind));
    expect(kinds.size).toBeGreaterThan(25);
    for (const kind of kinds) {
      expect(kind.startsWith('sf_'), kind).toBe(true);
      const sample = FIELD.props.find((p) => p.kind === kind) as FieldProp;
      const piece = foundryPieceForProp(sample);
      expect(piece !== '' || FOUNDRY_COLLIDER_ONLY.has(kind), kind).toBe(true);
    }
    expect(foundryPieceForProp({ kind: 'sf_not_a_kind', x: 0, z: 0, rot: 0 })).toBe('');
  });

  it('stands every prop piece on a floor, never down in the void', () => {
    for (const p of planFoundryPropPlacements()) {
      // (The lift station's own pier rises out of the drop.)
      if (p.piece === 'Kit_Pier') continue;
      const y = p.y ?? floor(p.x, p.z);
      expect(y, `${p.piece} at ${p.x}, ${p.z}`).toBeGreaterThan(VOID + 1);
    }
    const station = planFoundryPropPlacements().find((p) => p.piece === 'Kit_LiftStation');
    expect(station?.y).toBe(floor(0, -224));
  });

  it('stands every machinery collider on one flat floor, inside its terrace', () => {
    for (const p of FOUNDRY_MACHINERY_PROPS) {
      const g = floor(p.x, p.z);
      expect(g, `${p.kind} at ${p.x}, ${p.z}`).toBeGreaterThan(VOID + 1);
      // The furnace's back hangs over the lip by design (its collider does not).
      for (const [x, z] of footprint(p)) {
        expect(
          Math.abs(floor(x, z) - g),
          `${p.kind} at ${p.x}, ${p.z} corner ${x}, ${z}`,
        ).toBeLessThan(0.05);
      }
    }
  });

  it('keeps the machinery clear of every pack, patrol line and gate', () => {
    const spawns = foundrySpawnPoints();
    for (const p of FOUNDRY_MACHINERY_PROPS) {
      const tag = `${p.kind} at ${p.x}, ${p.z}`;
      for (const s of spawns) expect(colliderDistance(p, s.x, s.z), tag).toBeGreaterThan(2.5);
      for (const g of STORMBRASS_FOUNDRY_GATES)
        expect(colliderDistance(p, g.x, g.z), `${tag} vs ${g.id}`).toBeGreaterThan(g.hw + 1);
    }
    // The Hauler's loop, walked densely.
    for (let i = 0; i < HAULER_LOOP.length; i++) {
      const a = HAULER_LOOP[i];
      const b = HAULER_LOOP[(i + 1) % HAULER_LOOP.length];
      for (let t = 0; t <= 1; t += 0.05) {
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        for (const p of FOUNDRY_MACHINERY_PROPS)
          expect(colliderDistance(p, x, z), `${p.kind} vs the loop`).toBeGreaterThan(5);
      }
    }
  });

  it('leaves the three workers camps walkable at their centre, on their floor', () => {
    expect(FOUNDRY_WORKER_CAMP_SPOTS).toHaveLength(3);
    for (const c of FOUNDRY_WORKER_CAMP_SPOTS) {
      expect(floor(c.x, c.z), c.id).toBeCloseTo(c.floor, 3);
      for (const p of FIELD.props) {
        if (p.r === undefined && p.hw === undefined) continue;
        expect(colliderDistance(p, c.x, c.z), `camp ${c.id} vs ${p.kind}`).toBeGreaterThan(1.2);
      }
      // Its ore seam and scrap heap stand within reach of it.
      const near = FOUNDRY_MACHINERY_PROPS.filter(
        (p) =>
          (p.kind === 'sf_ore_seam' || p.kind === 'sf_scrap_heap') &&
          Math.hypot(p.x - c.x, p.z - c.z) < 10,
      );
      expect(near.map((p) => p.kind).sort(), c.id).toEqual(['sf_ore_seam', 'sf_scrap_heap']);
    }
  });
});

describe('Stormbrass Foundry kit: the plan', () => {
  it('rails every balustraded walk, lips every terrace, clads the tower', () => {
    const edges = planFoundryEdges();
    // (A tile and its variants count as one family.)
    const count = (piece: string) =>
      edges.filter(
        (e) => e.piece === piece || (FOUNDRY_EDGE_VARIANTS[piece] ?? []).includes(e.piece),
      ).length;
    expect(count('Kit_RailingEdge')).toBeGreaterThan(80);
    expect(count('Kit_MachineLip')).toBeGreaterThan(80);
    expect(count('Kit_PipeEdge')).toBeGreaterThan(60);
    expect(count('Kit_TowerPanel')).toBeGreaterThan(25);
    for (const e of edges) {
      // On the high side of a lip, on the floor.
      expect(walkable(e.x, e.z), `${e.piece} at ${e.x}, ${e.z}`).toBe(true);
      expect(cliffDistance(e.x, e.z), `${e.piece} at ${e.x}, ${e.z}`).toBeLessThan(1.2);
    }
  });

  it('hangs a truss only under an open walk, and stands its piers in the drop', () => {
    const trusses = planCatwalkTrusses();
    expect(trusses.filter((p) => p.piece === 'Kit_CatwalkTruss').length).toBeGreaterThan(20);
    for (const p of trusses) {
      if (p.piece === 'Kit_CatwalkTruss') {
        const s = authoredFieldSurfaceAt(FIELD, p.x, p.z);
        expect(s && FOUNDRY_OPEN_WALKS.has(s.id), `truss at ${p.x}, ${p.z}`).toBe(true);
        expect(p.y as number).toBeCloseTo(floor(p.x, p.z), 1);
      } else {
        expect(p.piece).toBe('Kit_Pier');
        // Its top meets the truss it carries, its foot is sunk under the drop.
        const top = (p.y as number) + FOUNDRY_KIT_SIZES.pierHeight * p.scale * (p.scaleY ?? 1);
        expect(top).toBeLessThan(floor(p.x, p.z) - 2);
        expect(top).toBeGreaterThan(floor(p.x, p.z) - 5);
        expect(p.y as number).toBeLessThanOrEqual(VOID);
      }
    }
  });

  it('lays the track along the Haulers loop and the cart siding, on the yard floor', () => {
    const track = planRailYard();
    expect(track.filter((p) => p.piece === 'Kit_RailTrack').length).toBeGreaterThan(70);
    for (const p of track) expect(floor(p.x, p.z), `${p.piece} at ${p.x}, ${p.z}`).toBe(0);
    // Every straight of the loop carries track at its middle.
    for (let i = 0; i < HAULER_LOOP.length; i++) {
      const a = HAULER_LOOP[i];
      const b = HAULER_LOOP[(i + 1) % HAULER_LOOP.length];
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      expect(track.some((p) => Math.hypot(p.x - mx, p.z - mz) < 1.2)).toBe(true);
    }
    // The Proving Range's target line lies on the range floor, clear of its bunkers.
    const line = planTargetLine();
    expect(line.length).toBeGreaterThan(10);
    const bunkers = FIELD.props.filter(
      (p) => p.kind === 'sf_bunker' || p.kind === 'sf_target_frame',
    );
    for (const p of line) {
      expect(floor(p.x, p.z), `${p.piece} at ${p.x}, ${p.z}`).toBe(10);
      for (const b of bunkers) expect(colliderDistance(b, p.x, p.z)).toBeGreaterThan(1.7);
    }
  });

  it('runs the molten channel through the gulf under the Line Catwalk', () => {
    const C = FOUNDRY_MOLTEN_CHANNEL;
    const half = FOUNDRY_KIT_SIZES.channelInnerHalf * C.scale + 1.2;
    // Never over a floor a body can stand on, save the catwalk it runs under.
    for (let x = C.x0; x <= C.x1; x += 1) {
      for (const dz of [-half, 0, half]) {
        const s = authoredFieldSurfaceAt(FIELD, x, C.z + dz);
        if (s) expect(s.id, `${x}, ${C.z + dz}`).toBe('line_catwalk');
      }
    }
    // The catwalk crosses well over the metal (a body never touches it).
    expect(floor(0, C.z) - C.y).toBeGreaterThan(4.5);
    // Both banks of the gulf are terraces (the trough is wedged between them).
    expect(walkable(0, C.z - half - 3.5)).toBe(true);
    expect(walkable(0, C.z + half + 3.5)).toBe(true);
    const pieces = planMoltenChannel();
    expect(pieces.filter((p) => p.piece === 'Kit_ChannelSegment').length).toBeGreaterThan(8);
    // The furnace stands on its pier.
    const furnace = pieces.find((p) => p.piece === 'Kit_FurnaceMouth') as FoundryKitPlacement;
    const pier = pieces.find((p) => p.piece === 'Kit_Pier') as FoundryKitPlacement;
    const pierTop =
      (pier.y as number) + FOUNDRY_KIT_SIZES.pierHeight * pier.scale * (pier.scaleY ?? 1);
    expect(pierTop).toBeCloseTo(furnace.y as number, 3);
    expect(walkable(furnace.x, furnace.z)).toBe(false);
    // The forge's lights ride the river.
    // (The Forge Gauntlet's furnace carries its own, far up the route.)
    const forge = planFoundryLights().filter(
      (l) => l.kind === 'forge' && l.y !== undefined && l.z !== FOUNDRY_FORGE.furnace.z,
    );
    expect(forge.length).toBeGreaterThanOrEqual(3);
    for (const l of forge) {
      expect(l.z).toBe(C.z);
      expect(l.y as number).toBeGreaterThan(C.y);
    }
  });

  it('stands the skyline in the drop, well clear of every walkway', () => {
    expect(FOUNDRY_SKYLINE.length).toBeGreaterThanOrEqual(10);
    const pieces = planSkyline();
    for (const s of FOUNDRY_SKYLINE) {
      for (let dx = -14; dx <= 14; dx += 7)
        for (let dz = -14; dz <= 14; dz += 7)
          expect(walkable(s.x + dx, s.z + dz), `skyline at ${s.x}, ${s.z}`).toBe(false);
    }
    for (const p of pieces) {
      if (p.piece !== 'Kit_BoilerHouse') continue;
      const pier = pieces.find((q) => q.piece === 'Kit_Pier' && q.x === p.x && q.z === p.z);
      expect(pier).toBeDefined();
      const top =
        ((pier as FoundryKitPlacement).y as number) + FOUNDRY_KIT_SIZES.pierHeight * p.scale;
      expect(top).toBeCloseTo(p.y as number, 3);
      expect((pier as FoundryKitPlacement).y as number).toBeLessThan(VOID);
    }
  });

  it('scatters the litter on walkable floor, off every pack and patrol', () => {
    const spawns = foundrySpawnPoints();
    for (const [piece, x, z] of FOUNDRY_LITTER) {
      const tag = `${piece} at ${x}, ${z}`;
      expect(walkable(x, z), tag).toBe(true);
      for (const s of spawns) expect(Math.hypot(s.x - x, s.z - z), tag).toBeGreaterThan(2.5);
      // Clear of every collider (a crate never stands inside a boiler).
      for (const p of FIELD.props) {
        if (p.r === undefined && p.hw === undefined) continue;
        expect(colliderDistance(p, x, z), `${tag} vs ${p.kind}`).toBeGreaterThan(0.4);
      }
      for (const g of STORMBRASS_FOUNDRY_GATES)
        expect(Math.hypot(g.x - x, g.z - z), `${tag} vs ${g.id}`).toBeGreaterThan(g.hw + 1.5);
    }
  });

  it('breathes steam and smoke from the vents, the stacks and the skyline', () => {
    const emitters = planFoundryEmitters(planFoundryKitPlacements());
    const smoke = emitters.filter((e) => e.kind === 'smoke');
    const steam = emitters.filter((e) => e.kind === 'steam');
    expect(smoke.length).toBeGreaterThan(30);
    expect(steam.length).toBeGreaterThan(12);
    // A floor stack smokes from its top, over every head.
    for (const p of FIELD.props.filter((q) => q.kind === 'sf_smokestack')) {
      const top = smoke.find((e) => Math.hypot(e.x - p.x, e.z - p.z) < 0.01);
      expect(top?.y, `stack at ${p.x}, ${p.z}`).toBeCloseTo(floor(p.x, p.z) + 24, 3);
    }
  });
});

describe('Stormbrass Foundry kit: the working machinery', () => {
  it('turns a flywheel on every engine house and swings a jib on every crane but the bridges', () => {
    const movers = planFoundryMovers();
    const engines = FIELD.props.filter((p) => p.kind === 'sf_machine_block');
    const cranes = FIELD.props.filter((p) => p.kind === 'sf_crane_base');
    // One on every engine house, one in the press crown's gearbox slot.
    expect(movers.filter((m) => m.piece === 'Kit_Flywheel').length).toBe(engines.length + 1);
    // The bridge crane's jib is the Crane Bridge gate's.
    expect(movers.filter((m) => m.piece === 'Kit_CraneJib').length).toBe(cranes.length - 1);
    const rig = craneBridgeRig();
    expect(cranes.some((c) => c.x === rig.mast.x && c.z === rig.mast.z)).toBe(true);
    for (const m of movers) {
      if (m.piece !== 'Kit_CraneJib') continue;
      // Slewing high over every head.
      expect(m.y - floor(m.x, m.z)).toBeGreaterThanOrEqual(15.9);
    }
    expect(movers.filter((m) => m.piece === 'Kit_PistonRod').length).toBe(
      FIELD.props.filter((p) => p.kind === 'sf_piston_engine').length,
    );
  });

  it('pumps a piston between its stops', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 4; t += 0.01) {
      const k = pistonStroke(t, 0.9, 0.3);
      lo = Math.min(lo, k);
      hi = Math.max(hi, k);
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(lo).toBeLessThan(0.05);
    expect(hi).toBeLessThanOrEqual(1);
    expect(hi).toBeGreaterThan(0.95);
  });

  it('rides two ladles out to their moulds and back without ever meeting', () => {
    const L = FOUNDRY_POUR_LINE;
    let poured0 = 0;
    let poured1 = 0;
    for (let t = 0; t < POUR_CYCLE * 2; t += 0.05) {
      const a = ladleState(t, 0, 0);
      const b = ladleState(t, 0.5, 1);
      for (const s of [a, b]) {
        expect(s.x).toBeGreaterThanOrEqual(L.railX0 + 1);
        expect(s.x).toBeLessThanOrEqual(L.railX1 - 1);
        expect(s.tip).toBeGreaterThanOrEqual(0);
        expect(s.tip).toBeLessThanOrEqual(1);
        // It pours only standing over its mould.
        if (s.pour > 0) {
          const mould = s === a ? FOUNDRY_POUR_MOULDS[0] : FOUNDRY_POUR_MOULDS[1];
          expect(Math.abs(s.x - mould)).toBeLessThan(0.01);
        }
      }
      expect(b.x - a.x).toBeGreaterThan(5);
      poured0 = Math.max(poured0, a.pour);
      poured1 = Math.max(poured1, b.pour);
    }
    expect(poured0).toBeCloseTo(1, 6);
    expect(poured1).toBeCloseTo(1, 6);
    // The ladles ride over every head: their buckets clear the floor by more
    // than a player's reach.
    const padFloor = floor(L.posts[0], L.railZ);
    const bucketFoot = padFloor + L.railLift - FOUNDRY_KIT_SIZES.ladleHang - 3.2;
    expect(bucketFoot - padFloor).toBeGreaterThanOrEqual(4.5);
    // The moulds stand on the pad under the rail.
    for (const x of FOUNDRY_POUR_MOULDS) expect(floor(x, L.railZ)).toBe(padFloor);
  });

  it('glows the coil after a strike and lets it cool', () => {
    let lit = 0;
    let dark = 0;
    for (let t = 0; t < 120; t += 0.05) {
      const after = coilAfterglowAt(t);
      expect(after).toBeGreaterThanOrEqual(0);
      expect(after).toBeLessThanOrEqual(1);
      // While the bolt is lit the coil burns at full.
      if (coilStrikeAt(t, 3).flash > 0) expect(after).toBe(1);
      if (after > 0) lit++;
      else dark++;
    }
    expect(lit).toBeGreaterThan(200);
    expect(dark).toBeGreaterThan(200);
  });
});

describe('Stormbrass Foundry kit: the second pass', () => {
  it('breaks every long edge run into its variants, deterministically', () => {
    const edges = planFoundryEdges();
    for (const [basePiece, variants] of Object.entries(FOUNDRY_EDGE_VARIANTS)) {
      const family = edges.filter((e) => e.piece === basePiece || variants.includes(e.piece));
      expect(family.length, basePiece).toBeGreaterThan(20);
      for (const v of [basePiece, ...variants])
        expect(family.filter((e) => e.piece === v).length / family.length, v).toBeGreaterThan(0.05);
    }
    expect(foundryEdgeVariant('Kit_PipeEdge', 3, 4)).toBe(foundryEdgeVariant('Kit_PipeEdge', 3, 4));
    expect(foundryEdgeVariant('Kit_TowerPanel', 3, 4)).toBe('Kit_TowerPanel');
  });

  it('stands the Forge Gauntlet in the drop either side of the Gantry Catwalk', () => {
    const G = FOUNDRY_FORGE;
    // The catwalk runs up x 0 between them; neither stands over a floor.
    expect(G.furnace.x).toBeGreaterThan(20);
    for (const h of G.hammers) expect(h.x).toBeLessThan(-12);
    // (Its hearth, r 9.5; the GLB audit holds every vertex of it off the floors.)
    for (let dx = -9; dx <= 9; dx += 3)
      for (let dz = -9; dz <= 9; dz += 3)
        expect(walkable(G.furnace.x + dx, G.furnace.z + dz), `furnace ${dx}, ${dz}`).toBe(false);
    for (const h of G.hammers)
      for (let dx = -2; dx <= 2; dx += 1)
        for (let dz = -3.6; dz <= 3.6; dz += 1.2)
          expect(walkable(h.x + dx, h.z + dz), `hammer ${h.x + dx}, ${h.z + dz}`).toBe(false);
    // The furnace's forge light sits at its mouth (foundry_plan_core.ts).
    const mouth = forgeFurnacePoints().mouth;
    const light = planFoundryLights().find((l) => l.kind === 'forge' && l.z === G.furnace.z);
    expect(light).toBeDefined();
    expect(Math.hypot((light?.x ?? 0) - mouth.x, (light?.y ?? 0) - mouth.y)).toBeLessThan(5);
    // One tup per hammer, each a third of a blow behind the last.
    const tups = planFoundryMovers().filter((m) => m.motion === 'hammer');
    expect(tups).toHaveLength(G.hammers.length);
    expect(new Set(tups.map((m) => m.phase)).size).toBe(G.hammers.length);
  });

  it('lifts a tup slowly and drops it fast, sparking only as it lands', () => {
    let rising = 0;
    let falling = 0;
    let prev = hammerBlow(0, 0).lift;
    for (let t = 0.01; t < FOUNDRY_FORGE.period; t += 0.01) {
      const b = hammerBlow(t, 0);
      expect(b.lift).toBeGreaterThanOrEqual(0);
      expect(b.lift).toBeLessThanOrEqual(1);
      if (b.struck > 0) expect(b.lift).toBe(0);
      if (b.lift > prev + 1e-9) rising++;
      if (b.lift < prev - 1e-9) falling++;
      prev = b.lift;
    }
    expect(rising).toBeGreaterThan(falling * 3);
    expect(hammerBlow(0, 0).struck).toBe(1);
  });

  it('lets the mine adits into cliff faces, clear of every floor', () => {
    const adits = planAdits();
    expect(adits.length).toBeGreaterThanOrEqual(5);
    for (const a of adits) {
      expect(walkable(a.x, a.z), `${a.x}, ${a.z}`).toBe(false);
      expect(cliffDistance(a.x, a.z)).toBeLessThan(5);
    }
  });

  it('lays every floor mark flat on one floor, and the same every time', () => {
    const decals = planFoundryFloorDecals();
    expect(decals.length).toBeGreaterThan(350);
    expect(decals.filter((d) => !d.cosmetic).length).toBeGreaterThan(80);
    for (const kind of FOUNDRY_DECAL_KINDS)
      expect(
        decals.some((d) => d.kind === kind),
        kind,
      ).toBe(true);
    for (const d of decals) {
      expect(d.y, `${d.kind} at ${d.x}, ${d.z}`).toBe(floor(d.x, d.z));
      for (const [x, z] of decalCorners(d))
        expect(floor(x, z), `${d.kind} corner at ${x}, ${z}`).toBeCloseTo(d.y, 2);
    }
    // Every range target has its craters.
    const targets = FIELD.props.filter((p) => p.kind === 'sf_target_frame');
    for (const t of targets)
      expect(
        decals.some(
          (d) =>
            (d.kind === 'crater' || d.kind === 'scorch') && Math.hypot(d.x - t.x, d.z - t.z) < 8,
        ),
        `target at ${t.x}, ${t.z}`,
      ).toBe(true);
    expect(planFoundryFloorDecals()).toEqual(decals);
  });
});

describe('Stormbrass Foundry kit: the Crane Bridge swing', () => {
  it('seats the span exactly on the walked deck', () => {
    const deck = craneBridgeDeck();
    const pose = craneBridgePose(1, 12.3);
    expect(pose.span.x).toBeCloseTo(CRANE_BRIDGE.x, 6);
    expect(pose.span.y).toBeCloseTo(CRANE_BRIDGE.fromH, 6);
    expect(pose.span.z).toBeCloseTo(CRANE_BRIDGE.fromZ, 6);
    expect(pose.span.yaw).toBeCloseTo(0, 6);
    expect(pose.span.pitch).toBeCloseTo(deck.pitch, 6);
    expect(pose.touchdown).toBe(0);
    expect(pose.working).toBe(0);
  });

  it('parks the span level over the gulf, and swings it clear of every floor', () => {
    const deck = craneBridgeDeck();
    const rig = craneBridgeRig();
    // Parked: level, lifted, no yard of it over any floor.
    const parked = craneBridgePose(0, 0);
    expect(Math.abs(parked.span.pitch)).toBeLessThan(0.05);
    const underside = (pose: typeof parked, s: number): number =>
      pose.span.y - Math.sin(pose.span.pitch) * s - 2.6;
    const spot = (pose: typeof parked, s: number, off: number): [number, number] => {
      const along = Math.cos(pose.span.pitch) * s;
      return [
        pose.span.x + Math.sin(pose.span.yaw) * along + Math.cos(pose.span.yaw) * off,
        pose.span.z + Math.cos(pose.span.yaw) * along - Math.sin(pose.span.yaw) * off,
      ];
    };
    for (let s = 0; s <= deck.len; s += 1.5)
      for (const off of [-4.5, 0, 4.5]) {
        const [x, z] = spot(parked, s, off);
        expect(walkable(x, z), `parked at ${x}, ${z}`).toBe(false);
      }
    // All the way round: the hook hangs under the jib, and wherever the span
    // passes over a floor (its own seats' lips, as it comes round) its
    // underside clears it.
    const seated = CRANE_BRIDGE_SEAT_SHARE;
    for (let k = 0; k <= seated / 2; k += 0.0215) {
      const pose = craneBridgePose(k, 0);
      expect(pose.hook.y, `k ${k}`).toBeLessThan(rig.mast.top);
      for (let s = 0; s <= deck.len; s += 1.5)
        for (const off of [-4.5, 0, 4.5]) {
          const [x, z] = spot(pose, s, off);
          // (The bridge's own hidden walk is the span's seat, not a floor yet.)
          if (authoredFieldSurfaceAt(FIELD, x, z)?.id === 'crane_bridge') continue;
          const g = floor(x, z);
          if (g > VOID + 1)
            expect(underside(pose, s) - g, `k ${k} at ${x}, ${z}`).toBeGreaterThan(1);
        }
    }
    // The lowering sets it down from its carry height.
    expect(craneBridgePose(seated / 2, 0).span.y - craneBridgePose(1, 0).span.y).toBeCloseTo(
      CRANE_BRIDGE_CARRY_LIFT,
      1,
    );
  });

  it('swings on its own slow clock, from where it stood', () => {
    expect(craneBridgeProgress(true, 0, 0)).toBe(0);
    expect(craneBridgeProgress(true, 4.5, 0)).toBeCloseTo(0.5, 6);
    expect(craneBridgeProgress(true, 99, 0)).toBe(1);
    expect(craneBridgeProgress(false, 99, 1)).toBe(0);
    // A reversal mid-swing starts from where the span hangs.
    expect(craneBridgeProgress(false, 0, 0.4)).toBeCloseTo(0.4, 6);
    // The sparks fly only over the last of the lowering.
    expect(craneBridgePose(0.5, 0).touchdown).toBe(0);
    expect(craneBridgePose(0.84, 0).touchdown).toBeGreaterThan(0.5);
    // Seated, the slings drop and the hook hoists clear of the walkers' heads.
    expect(craneBridgePose(CRANE_BRIDGE_SEAT_SHARE, 0).release).toBe(0);
    const freed = craneBridgePose(1, 0);
    expect(freed.release).toBe(1);
    expect(freed.hook.y - 2.3 - (CRANE_BRIDGE.fromH + CRANE_BRIDGE.toH) / 2).toBeGreaterThan(6);
  });
});

/** Pieces allowed in a walkway's head room without a collider, and why. */
const HEAD_ROOM_ALLOWANCE: Readonly<Record<string, number>> = {
  // A railing on the lip, inside the cliff collider's reach (the Temple's
  // balustrade precedent).
  Kit_RailingEdge: 1.9,
  Kit_RailingEdgeB: 1.9,
  Kit_RailingEdgeC: 1.9,
};
/** Knee-high litter (kerbs, ingots, drums, sandbags, rails) is fine anywhere. */
const KNEE = 1.6;
/** A player's head room above the floor. */
const HEAD = 4.5;

describe('Stormbrass Foundry kit: nothing stands in a walkway without a collider', () => {
  it.skipIf(!haveKit)('keeps every vertex out of the head room over every floor', () => {
    const failures: string[] = [];
    const props = FIELD.props;
    for (const p of planFoundryKitPlacements()) {
      const shape = shapes.get(p.piece);
      if (!shape) continue;
      const allow = HEAD_ROOM_ALLOWANCE[p.piece] ?? KNEE;
      const box = worldBox(p, shape);
      // Skip pieces whose box meets no floor's head room (a coarse sweep).
      let meets = false;
      for (let x = box.min[0]; x <= box.max[0] + 1e-6 && !meets; x += 1.5)
        for (let z = box.min[2]; z <= box.max[2] + 1e-6 && !meets; z += 1.5) {
          const g = floor(x, z);
          if (g > VOID + 1 && box.max[1] > g + allow && box.min[1] < g + HEAD) meets = true;
        }
      if (!meets) continue;
      const at = placer(p);
      for (const v of shape.points) {
        const w = at(v[0], v[1], v[2]);
        const g = floor(w[0], w[2]);
        if (g <= VOID + 1) continue;
        const d = w[1] - g;
        if (d <= allow || d >= HEAD) continue;
        if (inCollider(props, w[0], w[2], 0.5) || inCliff(w[0], w[2])) continue;
        failures.push(
          `${p.piece} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}): a vertex ${d.toFixed(2)} over the floor at (${w[0].toFixed(1)}, ${w[2].toFixed(1)})`,
        );
        break;
      }
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it.skipIf(!haveKit)('floats nothing: every piece stands, sits or hangs', () => {
    const failures: string[] = [];
    const all = planFoundryKitPlacements();
    const piers = all.filter((p) => p.piece === 'Kit_Pier');
    const pierTop = (p: FoundryKitPlacement) =>
      (p.y as number) + FOUNDRY_KIT_SIZES.pierHeight * p.scale * (p.scaleY ?? 1);
    for (const p of all) {
      const shape = shapes.get(p.piece);
      if (!shape) continue;
      const box = worldBox(p, shape);
      const tag = `${p.piece} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`;
      switch (p.piece) {
        case 'Kit_CatwalkTruss': {
          // Hangs under its walk's deck.
          const deck = floor(p.x, p.z);
          if (!(box.max[1] <= deck + 2.5 && box.max[1] >= deck - 2.5))
            failures.push(`${tag}: no deck over the truss`);
          continue;
        }
        case 'Kit_MineAdit': {
          // Let into a cliff face under a lip.
          if (cliffDistance(p.x, p.z) > 5) failures.push(`${tag}: no cliff face behind it`);
          if (walkable(p.x, p.z)) failures.push(`${tag}: on a floor`);
          continue;
        }
        case 'Kit_BoilerHouse':
        case 'Kit_BlastFurnace':
        case 'Kit_SteamHammer':
        case 'Kit_FurnaceMouth':
        case 'Kit_LiftStation':
        case 'Kit_ModelFrame':
        case 'Kit_DraftScaffoldTower':
        case 'Kit_Scaffold': {
          if (walkable(p.x, p.z)) break;
          // On a pier's top (anywhere on its cap), or stacked on the bay under it.
          const on = piers.some(
            (q) =>
              Math.abs(q.x - p.x) < 10 * q.scale &&
              Math.abs(q.z - p.z) < 10 * q.scale &&
              box.min[1] - pierTop(q) > -0.6 &&
              box.min[1] - pierTop(q) < (p.piece === 'Kit_Scaffold' ? 4.6 : 0.6),
          );
          if (!on) failures.push(`${tag}: no pier under it`);
          continue;
        }
        case 'Kit_YardGantryTrolley':
        case 'Kit_ChainHang': {
          // Hangs from a beam high over every head.
          if (box.min[1] < floor(p.x, p.z) + HEAD)
            failures.push(`${tag}: hangs into the head room`);
          continue;
        }
        case 'Kit_PipeRun':
        case 'Kit_PipeValve': {
          // A steam main: carried from an engine house into the shelf's face.
          if (walkable(p.x, p.z)) failures.push(`${tag}: a main over a floor`);
          continue;
        }
        case 'Kit_ChannelSegment':
          // Wedged between the gulf's two banks (audited above).
          continue;
        case 'Kit_PressCrown': {
          // On its posts (14 yd over the floor).
          if (box.min[1] > floor(p.x, p.z) + 14.2) failures.push(`${tag}: over its posts`);
          continue;
        }
        case 'Kit_PressRam':
          // Hangs from the crown.
          if (box.max[1] < floor(p.x, p.z) + FOUNDRY_KIT_SIZES.pressCrownLift - 0.3)
            failures.push(`${tag}: short of the crown`);
          continue;
        case 'Kit_LadleRail': {
          // Carried by the furnace's hood and the east post.
          const pad = floor(FOUNDRY_POUR_LINE.posts[0], FOUNDRY_POUR_LINE.railZ);
          if (Math.abs(box.min[1] - (pad + FOUNDRY_POUR_LINE.railLift)) > 0.4)
            failures.push(`${tag}: off its posts`);
          continue;
        }
        case 'Kit_Cable':
        case 'Kit_GreatCoilGlow':
          continue;
        default:
      }
      const support = Math.max(floor(p.x, p.z), VOID);
      if (box.min[1] > support + 0.3)
        failures.push(`${tag}: base ${box.min[1].toFixed(2)} over ${support}`);
    }
    expect(failures, failures.slice(0, 40).join('\n')).toEqual([]);
  });

  it.skipIf(!haveKit)('carries the pour rail on the furnace and its post', () => {
    const L = FOUNDRY_POUR_LINE;
    const pad = floor(L.posts[0], L.railZ);
    const post = shapes.get('Kit_PourFrame') as Shape;
    const scale = (FIELD.props.find((p) => p.kind === 'sf_pour_frame')?.h ?? 9) / 9;
    expect(Math.abs(post.max[1] * scale - L.railLift)).toBeLessThan(0.6);
    const furnace = shapes.get('Kit_FurnaceMouth') as Shape;
    expect(furnace.max[1]).toBeGreaterThan(L.railLift);
    expect(pad).toBe(8);
  });
});
