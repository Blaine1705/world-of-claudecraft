import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Document, type Node as GltfNode, getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  sourceFingerprint,
  WYRMWATCH_HARBOR_ASSET,
} from '../scripts/assets/wyrmwatch_harbor/build.mjs';
import {
  WYRMWATCH_LAYOUT_FILE,
  wyrmwatchHarborLayout,
} from '../scripts/assets/wyrmwatch_harbor/layout';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import {
  WYRMWATCH_HARBOR_CRITICAL_PARTS,
  WYRMWATCH_HARBOR_OPTIONAL_PARTS,
  WYRMWATCH_HARBOR_TRIM_PARTS,
  WYRMWATCH_PATH_STONE_PARTS,
  WYRMWATCH_PATH_STONE_TOP,
} from '../src/render/wyrmwatch_harbor_core';
import {
  WYRMWATCH_HARBOR_DECKS,
  WYRMWATCH_HARBOR_ORIGIN,
  WYRMWATCH_RAIL_HEIGHT,
  WYRMWATCH_TOP_ABOVE_WATER,
} from '../src/sim/content/wyrmwatch_harbor';

// The shipped Wyrmwatch cliff harbor GLB (public/models/props/wyrmwatch_harbor.glb), built in
// Blender from the sim's own layout (scripts/assets/wyrmwatch_harbor/layout.json, exported from
// src/sim/content/wyrmwatch_harbor.ts with the terrain under it) and shipped by build.mjs. Pins
// the bytes, the source fingerprint, the layout's freshness against the sim and the terrain,
// the named tier parts the runtime keeps or sheds, the five texture-free materials, the
// triangle budget, and the model's stamped numbers against the sim. Re-pin the sha256 and size
// literals only with a re-export.

const ROOT = path.join(__dirname, '..');
const GLB = path.join(ROOT, WYRMWATCH_HARBOR_ASSET.target);
const SHIPPED_SHA256 = '49c07a45cff5606ec066cd9bd58448c31cae004ae8a00cc077736cb1b76959dd';
const SHIPPED_BYTES = 233864;
/** Triangles per named part, from the Blender build report. */
const TRIANGLES: Record<string, number> = {
  QuayDecks: 2688,
  StairFlights: 1272,
  Landings: 804,
  Railings: 1844,
  HarborGate: 968,
  Lanterns: 1832,
  HarborShack: 1172,
  Cargo: 900,
  HarborTrim: 2724,
  HarborClutter: 1740,
  PathStoneA: 44,
  PathStoneB: 38,
  PathStoneC: 50,
};
/** The player model, pivot to crown (HUMANOID_H in render/characters/manifest.ts). */
const PLAYER_H = 2.6;

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

interface HarborExtras {
  origin: number[];
  tiers: Record<string, string[]>;
  pathStones: string[];
  stoneTop: number;
  decks: Record<string, number[]>;
  railHeight: number;
  gateTop: number;
}

function extras(): HarborExtras {
  return (node('WyrmwatchHarbor_ROOT').getExtras() as { wyrmwatchHarbor: HarborExtras })
    .wyrmwatchHarbor;
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  doc = await io.read(GLB);
});

describe('wyrmwatch cliff harbor GLB', () => {
  it('ships the pinned bytes, in the media manifest', () => {
    const bytes = readFileSync(GLB);
    expect(bytes.length).toBe(SHIPPED_BYTES);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHIPPED_SHA256);
    expect(bytes.toString('latin1')).toContain('EXT_meshopt_compression');
    expect(MEDIA_ASSETS['models/props/wyrmwatch_harbor.glb']).toMatch(
      /^\/media\/models\/props\/wyrmwatch_harbor\.[0-9a-f]{12}\.glb$/,
    );
  });

  it('is credited as original project art', () => {
    const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
    expect(credits).toContain('Wyrmwatch cliff harbor (`public/models/props/wyrmwatch_harbor.glb`');
  });

  it('carries the live source fingerprint', () => {
    expect(doc.getRoot().getExtras()).toMatchObject({
      authoring: 'Blender',
      sourceFingerprint: sourceFingerprint(),
    });
  });

  it('was built from the live layout: the sim content and the terrain under it', () => {
    const committed = JSON.parse(readFileSync(path.join(ROOT, WYRMWATCH_LAYOUT_FILE), 'utf8'));
    // the same decks, rails, props, path and ground heights the sim has today (a moved
    // deck or a reshaped cliff means re-exporting the model so no pile floats)
    expect(committed).toEqual(JSON.parse(JSON.stringify(wyrmwatchHarborLayout())));
  });

  it('keeps every named part the runtime keeps or sheds, under one root', () => {
    const names = new Set(
      doc
        .getRoot()
        .listNodes()
        .map((n) => n.getName()),
    );
    for (const name of WYRMWATCH_HARBOR_ASSET.requiredNodes)
      expect(names.has(name), name).toBe(true);
    const root = doc.getRoot().listScenes()[0].listChildren();
    expect(root.map((n) => n.getName())).toEqual(['WyrmwatchHarbor_ROOT']);
    for (const part of [
      ...WYRMWATCH_HARBOR_CRITICAL_PARTS,
      ...WYRMWATCH_HARBOR_TRIM_PARTS,
      ...WYRMWATCH_HARBOR_OPTIONAL_PARTS,
      ...WYRMWATCH_PATH_STONE_PARTS,
    ]) {
      expect(node(part).getParentNode()?.getName(), part).toBe('WyrmwatchHarbor_ROOT');
      expect(trianglesUnder(node(part)), part).toBeGreaterThan(0);
    }
    expect(extras().tiers).toEqual({
      low: [...WYRMWATCH_HARBOR_CRITICAL_PARTS],
      medium: [...WYRMWATCH_HARBOR_TRIM_PARTS],
      high: [...WYRMWATCH_HARBOR_OPTIONAL_PARTS],
    });
    expect(extras().pathStones).toEqual([...WYRMWATCH_PATH_STONE_PARTS]);
  });

  it('shares five texture-free, vertex-coloured materials, and nothing animates', () => {
    const materials = doc.getRoot().listMaterials();
    expect(materials.map((m) => m.getName()).sort()).toEqual(WYRMWATCH_HARBOR_ASSET.materials);
    expect(doc.getRoot().listTextures()).toHaveLength(0);
    expect(doc.getRoot().listSkins()).toHaveLength(0);
    expect(doc.getRoot().listAnimations()).toHaveLength(0);
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        expect(prim.getAttribute('COLOR_0'), mesh.getName()).not.toBeNull();
      }
    }
  });

  it('holds each part to its triangle budget, the low tier well inside it', () => {
    let total = 0;
    for (const [name, count] of Object.entries(TRIANGLES)) {
      expect(trianglesUnder(node(name)), name).toBe(count);
      total += count;
    }
    expect(trianglesUnder(node('WyrmwatchHarbor_ROOT'))).toBe(total);
    // a whole harbor (two quays, a switchback, a gate, a shack): under 18k in all,
    // the low tier under 12k
    expect(total).toBeLessThan(18000);
    const low = WYRMWATCH_HARBOR_CRITICAL_PARTS.reduce((n, p) => n + TRIANGLES[p], 0);
    expect(low).toBeLessThan(12000);
  });

  it("stamps the sim's numbers: the origin, the deck heights, the rail and the stones", () => {
    const e = extras();
    expect(e.origin).toEqual([WYRMWATCH_HARBOR_ORIGIN.x, WYRMWATCH_HARBOR_ORIGIN.z]);
    for (const d of WYRMWATCH_HARBOR_DECKS) {
      expect(e.decks[d.id], d.id).toEqual([d.nearAboveWater, d.farAboveWater]);
    }
    expect(e.railHeight).toBe(WYRMWATCH_RAIL_HEIGHT);
    expect(e.stoneTop).toBe(WYRMWATCH_PATH_STONE_TOP);
    // the gate stands generously over the player: more than twice a player's height
    expect(e.gateTop - WYRMWATCH_TOP_ABOVE_WATER).toBeGreaterThan(2 * PLAYER_H);
  });

  it('sits on the waterline at its origin, its piles running down into the sea bed', () => {
    const scene = doc.getRoot().listScenes()[0];
    expect(scene.listChildren()[0].getTranslation()).toEqual([0, 0, 0]);
    const { min, max } = getBounds(scene);
    // the piles reach below the waterline, the gate's crest stands over the cliff top
    expect(min[1]).toBeLessThan(-1.5);
    expect(min[1]).toBeGreaterThan(-4);
    expect(max[1]).toBeGreaterThan(WYRMWATCH_TOP_ABOVE_WATER + 6);
    expect(max[1]).toBeLessThan(WYRMWATCH_TOP_ABOVE_WATER + 8);
    // no timetable, clock or ship state is modelled: no node names one
    for (const n of doc.getRoot().listNodes()) {
      expect(n.getName(), n.getName()).not.toMatch(/timer|clock|schedule|status|depart/i);
    }
  });
});
