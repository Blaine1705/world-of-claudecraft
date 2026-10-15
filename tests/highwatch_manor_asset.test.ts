import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Document, type Node as GltfNode, getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HIGHWATCH_MANOR_ASSET,
  mergeManorCollision,
  sourceFingerprint,
} from '../scripts/assets/highwatch_manor/build.mjs';
import {
  documentTriangles,
  findCoplanarOverlaps,
  type ManorTriangle,
  visibleOverlaps,
} from '../scripts/assets/highwatch_manor/coplanar.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { isPlacedBuildingInterior } from '../src/render/eastbrook_placed_building';
import { HIGHWATCH_BUILDINGS_BY_ID } from '../src/sim/highwatch_layout';

// The shipped Highwatch manor GLB (public/models/tidehold/highwatch/manor.glb), built in Blender
// by scripts/assets/highwatch_manor/build_manor.py and shipped by build.mjs, which also merges
// the collision rows the same Blender run writes into data/asset_collision_overrides.json.
// Pins the bytes, the live source fingerprint, the named parts the town view draws (the G_INT
// ones cast no shadow), the texture-free materials, the triangle budget, the footing the
// town buries, the door and the open roof the camera's air is cut to, and the collision rows.
// Re-pin the sha256, size and triangle literals only with a re-export.

const ROOT = path.join(__dirname, '..');
const GLB = path.join(ROOT, HIGHWATCH_MANOR_ASSET.target);
const SHIPPED_SHA256 = 'ddae2cee9d55c66d9e97f1bc784bb11088d6677c7780f8378c6e430878cba12e';
const SHIPPED_BYTES = 1021588;
/** Triangles per named part, from the Blender build report. */
const TRIANGLES: Record<string, number> = {
  ManorShell: 25418,
  ManorRoof: 14278,
  ManorTrim: 5982,
  ManorGrounds: 7256,
  ManorGlow: 3006,
  G_INT_Timber: 3542,
  G_INT_Furnishings: 18507,
};

let doc: Document;

function node(name: string): GltfNode {
  const found = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === name);
  if (!found) throw new Error(`no node ${name}`);
  return found;
}

function trianglesUnder(n: GltfNode): number {
  let total = 0;
  const walk = (m: GltfNode): void => {
    for (const prim of m.getMesh()?.listPrimitives() ?? []) {
      total += (prim.getIndices()?.getCount() ?? 0) / 3;
    }
    for (const child of m.listChildren()) walk(child);
  };
  walk(n);
  return total;
}

interface ManorExtras {
  floor: number;
  door: number[];
  hall: { plate: number; ridge: number; truss: number };
  lantern: number[];
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  doc = await io.read(GLB);
});

describe('the Highwatch manor GLB', () => {
  it('ships the pinned bytes, in the media manifest, credited as project art', () => {
    const bytes = readFileSync(GLB);
    expect(bytes.length).toBe(SHIPPED_BYTES);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHIPPED_SHA256);
    expect(bytes.toString('latin1')).toContain('EXT_meshopt_compression');
    expect(MEDIA_ASSETS['models/tidehold/highwatch/manor.glb']).toMatch(
      /^\/media\/models\/tidehold\/highwatch\/manor\.[0-9a-f]{12}\.glb$/,
    );
    const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
    expect(credits).toContain('Highwatch manor (`public/models/tidehold/highwatch/manor.glb`)');
  });

  it('carries the live source fingerprint', () => {
    expect(doc.getRoot().getExtras()).toMatchObject({
      authoring: 'Blender',
      sourceFingerprint: sourceFingerprint(),
    });
  });

  it('keeps its named parts under one root, the interior ones in shadowless groups', () => {
    const roots = doc.getRoot().listScenes()[0].listChildren();
    expect(roots.map((n) => n.getName())).toEqual(['HighwatchManor_ROOT']);
    const parts = roots[0].listChildren().map((n) => n.getName());
    expect([...parts].sort()).toEqual(Object.keys(TRIANGLES).sort());
    // the town view casts no shadow from a part under a G_INT group
    // (render/eastbrook_placed_building.ts): the trusses and the furniture are indoors
    for (const name of ['G_INT_Timber', 'G_INT_Furnishings']) {
      expect(isPlacedBuildingInterior({ name, parent: null } as never), name).toBe(true);
    }
    for (const name of ['ManorShell', 'ManorRoof', 'ManorGrounds']) {
      expect(isPlacedBuildingInterior({ name, parent: null } as never), name).toBe(false);
    }
  });

  it('ships texture-free materials, unskinned and still', () => {
    const root = doc.getRoot();
    expect(
      root
        .listMaterials()
        .map((m) => m.getName())
        .sort(),
    ).toEqual([...HIGHWATCH_MANOR_ASSET.materials]);
    expect(root.listTextures()).toHaveLength(0);
    expect(root.listSkins()).toHaveLength(0);
    expect(root.listAnimations()).toHaveLength(0);
    // the lit glass glows warm amber (a glTF emission cannot read the vertex colours, so the
    // glowing materials carry their own hue); the coloured glass glows faintly
    const glow = root.listMaterials().find((m) => m.getName() === 'ManorGlow');
    const [r, g, b] = glow?.getEmissiveFactor() ?? [0, 0, 0];
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(0);
    const glass = root.listMaterials().find((m) => m.getName() === 'ManorGlass');
    expect(Math.max(...(glass?.getEmissiveFactor() ?? [0]))).toBeLessThan(r);
    // the stained glass's colours each glow in their own hue: blue, garnet and gold
    const hue = (name: string) =>
      root
        .listMaterials()
        .find((m) => m.getName() === name)
        ?.getEmissiveFactor() ?? [0, 0, 0];
    const [br, bg, bb] = hue('ManorGlassBlue');
    expect(bb).toBeGreaterThan(Math.max(br, bg));
    const [rr, rg, rb] = hue('ManorGlassRed');
    expect(rr).toBeGreaterThan(Math.max(rg, rb) * 3);
    const [gr, gg, gb] = hue('ManorGlassGold');
    expect(gr).toBeGreaterThan(gg);
    expect(gg).toBeGreaterThan(gb);
    // the warm lights come in four tones, every one warm, no two alike: amber and honey
    // windows, the brighter lanterns, the softer candle flames
    const warm = ['ManorGlow', 'ManorGlowSoft', 'ManorGlowLantern', 'ManorGlowCandle'].map(hue);
    for (const [wr, wg, wb] of warm) {
      expect(wr).toBeGreaterThan(wg);
      expect(wg).toBeGreaterThan(wb);
    }
    expect(new Set(warm.map((c) => c.map((v) => v.toFixed(2)).join(','))).size).toBe(4);
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        expect(prim.getAttribute('COLOR_0'), mesh.getName()).not.toBeNull();
      }
    }
  });

  it('stays inside its triangle budget, part by part', () => {
    let total = 0;
    for (const [name, want] of Object.entries(TRIANGLES)) {
      const got = trianglesUnder(node(name));
      expect(got, name).toBe(want);
      total += got;
    }
    // the proposal's budget: 50,000 to 70,000 with all the furniture, never past 90,000 (the
    // exterior detail pass, the cresting, corbels and leaded glass, spends some of that headroom)
    expect(total).toBeGreaterThanOrEqual(50_000);
    expect(total).toBeLessThanOrEqual(90_000);
  });

  it('stands on a yard of footing, as wide and deep as its record reaches', () => {
    const bounds = getBounds(doc.getRoot().listScenes()[0]);
    // the painted set's seat: the ground line at y 0 and a yard of footing under it
    expect(bounds.min[1]).toBeCloseTo(-1, 2);
    const manor = HIGHWATCH_BUILDINGS_BY_ID.highwatch_manor;
    const reach = manor.reach;
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(reach.halfWidth * 2, 2);
    expect(bounds.max[2] - bounds.min[2]).toBeCloseTo(reach.halfDepth * 2, 2);
    // centred across, the garden in front (-z), the dais bay behind
    expect(bounds.min[0] + bounds.max[0]).toBeCloseTo(0, 3);
    expect(bounds.min[2]).toBeLessThan(-25);
    expect(bounds.max[2]).toBeGreaterThan(15);
  });

  it('stamps the door, the open roof and the lantern the camera and the town read', () => {
    const extras = (node('HighwatchManor_ROOT').getExtras() as { highwatchManor: ManorExtras })
      .highwatchManor;
    // a grand door: 3.6 wide, 5.2 high over the floor (a player stands 2.6)
    expect(extras.door).toEqual([3.6, 5.2]);
    expect(extras.floor).toBeCloseTo(0.6, 9);
    // the great hall: walls of 10.5, the ridge at 19, nothing of the roof under 11 over the floor
    expect(extras.hall.plate - extras.floor).toBeCloseTo(10.5, 9);
    expect(extras.hall.ridge - extras.floor).toBeCloseTo(19, 9);
    expect(extras.hall.truss - extras.floor).toBeGreaterThanOrEqual(11);
    // the lantern stands over the ridge, over the hearth
    expect(extras.lantern[1]).toBeGreaterThan(extras.hall.ridge);
    expect(extras.lantern[0]).toBe(0);
    expect(extras.lantern[2]).toBe(0);
  });

  it('ships the collision rows the Blender run wrote, under the model id', () => {
    const written = JSON.parse(
      readFileSync(path.join(ROOT, HIGHWATCH_MANOR_ASSET.collision), 'utf8'),
    ) as { size: number; rows: unknown };
    const table = JSON.parse(
      readFileSync(path.join(ROOT, 'data/asset_collision_overrides.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(table[HIGHWATCH_MANOR_ASSET.collisionId]).toEqual(written.rows);
    // the rows are stored in multiples of the model's largest dimension
    const bounds = getBounds(doc.getRoot().listScenes()[0]);
    expect(written.size).toBeCloseTo(
      Math.max(...[0, 1, 2].map((i) => bounds.max[i] - bounds.min[i])),
      1,
    );
    // merging is idempotent and touches nothing else in the table's text
    const raw = readFileSync(path.join(ROOT, 'data/asset_collision_overrides.json'), 'utf8');
    expect(mergeManorCollision(raw, written.rows)).toBe(raw);
  });
});

// Two flat squares facing up, `lift` apart (the second smaller, inside the first).
function stack(lift: number, colorB = [0.9, 0.1, 0.1]): ManorTriangle[] {
  const quad = (y: number, r: number, color: number[], part: string): ManorTriangle[] => [
    { part, material: 'M', a: [-r, y, -r], b: [-r, y, r], c: [r, y, r], color },
    { part, material: 'M', a: [-r, y, -r], b: [r, y, r], c: [r, y, -r], color },
  ];
  return [...quad(0, 2, [0.5, 0.5, 0.5], 'floor'), ...quad(lift, 1, colorB, 'rug')];
}

describe('the Highwatch manor has no coplanar faces fighting in the depth buffer', () => {
  it('finds a rug a hair over a floor, and lets one a layer over it be', () => {
    const close = stack(0.01);
    expect(visibleOverlaps(close, findCoplanarOverlaps(close)).length).toBeGreaterThan(0);
    const lifted = stack(0.05);
    expect(findCoplanarOverlaps(lifted)).toEqual([]);
    // twins (same material, same colour) draw the same pixel either way
    const twins = stack(0.0, [0.5, 0.5, 0.5]);
    expect(findCoplanarOverlaps(twins)).toEqual([]);
  });

  it('finds no overlap a camera can see across the whole shipped model', () => {
    const triangles = documentTriangles(doc);
    const all = findCoplanarOverlaps(triangles);
    // not vacuous: the model is full of flush joints the audit has to weigh
    expect(all.length).toBeGreaterThan(1000);
    const visible = visibleOverlaps(triangles, all);
    const label = (hit: (typeof visible)[number]) =>
      `${hit.parts.join(' x ')} at ${hit.at.join(', ')} gap ${hit.gap.toFixed(3)}`;
    // every decal-like piece (rugs, banners, tapestries, the crest, the furniture, the garden's
    // paving and beds, the glass) stands a real layer clear of what it lies on: none at all
    const frame = /^(ManorShell|ManorRoof)\//;
    expect(
      visible.filter((hit) => !hit.parts.every((part) => frame.test(part))).map(label),
    ).toEqual([]);
    // what is left is slivers where a hewn timber meets a wall's face at a joint: each under
    // a hand's breadth square, all of them together under a square yard, and never more
    for (const hit of visible) expect(hit.area, label(hit)).toBeLessThan(0.15);
    expect(visible.reduce((sum, hit) => sum + hit.area, 0)).toBeLessThan(1.0);
  }, 120000);
});
