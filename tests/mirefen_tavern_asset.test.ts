import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Document, type Node as GltfNode, getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  MIREFEN_TAVERN_ASSET,
  sourceFingerprint,
} from '../scripts/assets/mirefen_tavern/build.mjs';
import {
  MIREFEN_TAVERN_LAYOUT_FILE,
  mirefenTavernLayout,
} from '../scripts/assets/mirefen_tavern/layout';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import {
  TAVERN_CRITICAL_PARTS,
  TAVERN_OPTIONAL_PARTS,
  TAVERN_SHELL_PARTS,
  TAVERN_TRIM_PARTS,
} from '../src/render/mirefen_tavern_core';
import {
  TAVERN_DOOR,
  TAVERN_HALL,
  TAVERN_HOOD,
  TAVERN_TOWER,
  TAVERN_UPPER,
} from '../src/sim/content/mirefen_tavern';

// The shipped Mirefen tavern GLB (public/models/props/mirefen_tavern.glb), built in Blender from
// the sim's own layout (scripts/assets/mirefen_tavern/layout.json, exported from
// src/sim/content/mirefen_tavern.ts with the terrain under it) and shipped by build.mjs. Pins the
// bytes, the source fingerprint, the layout's freshness against the sim and the terrain, the
// named tier and shell parts the runtime keeps, sheds and cuts away, the five texture-free
// materials, the triangle budget, and the model's stamped numbers against the sim. Re-pin the
// sha256, size and triangle literals only with a re-export (docs/design/mirefen-tavern.md).

const ROOT = path.join(__dirname, '..');
const GLB = path.join(ROOT, MIREFEN_TAVERN_ASSET.target);
const SHIPPED_SHA256 = '6bf57fff357513b6b0a3aec003bdd267d322ddc9a3a255de8527e9d18fc93068';
const SHIPPED_BYTES = 844736;
/** Triangles per named part, from the Blender build report. */
const TRIANGLES: Record<string, number> = {
  TavernFrame: 12292,
  TavernFurnishings: 2944,
  TavernLights: 3048,
  HallWallFront: 5156,
  HallWallBack: 2220,
  HallWallLeft: 2320,
  HallWallRight: 4212,
  HallRoof: 5640,
  WingWallEast: 1344,
  WingWallBack: 1476,
  WingWallWest: 696,
  WingRoof: 1272,
  TowerWall: 3240,
  TowerRoof: 1876,
  Gallery: 4000,
  RoomWalls: 888,
  TavernTrim: 1252,
  TavernClutter: 3538,
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

interface TavernExtras {
  tiers: Record<string, string[]>;
  shell: string[];
  upper: number;
  hall: { eave: number; ridge: number; tie: number; aisleBeam: number };
  door: number[];
  stairWidth: number;
}

function extras(): TavernExtras {
  return (node('MirefenTavern_ROOT').getExtras() as { mirefenTavern: TavernExtras }).mirefenTavern;
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  doc = await io.read(GLB);
});

describe('mirefen tavern GLB', () => {
  it('ships the pinned bytes, in the media manifest', () => {
    const bytes = readFileSync(GLB);
    expect(bytes.length).toBe(SHIPPED_BYTES);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHIPPED_SHA256);
    expect(bytes.toString('latin1')).toContain('EXT_meshopt_compression');
    expect(MEDIA_ASSETS['models/props/mirefen_tavern.glb']).toMatch(
      /^\/media\/models\/props\/mirefen_tavern\.[0-9a-f]{12}\.glb$/,
    );
  });

  it('is credited as original project art', () => {
    const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
    expect(credits).toContain('Mirefen tavern (`public/models/props/mirefen_tavern.glb`');
  });

  it('carries the live source fingerprint', () => {
    expect(doc.getRoot().getExtras()).toMatchObject({
      authoring: 'Blender',
      sourceFingerprint: sourceFingerprint(),
    });
  });

  it('was built from the live layout: the sim content and the terrain under it', () => {
    const committed = JSON.parse(readFileSync(path.join(ROOT, MIREFEN_TAVERN_LAYOUT_FILE), 'utf8'));
    expect(committed).toEqual(JSON.parse(JSON.stringify(mirefenTavernLayout())));
  });

  it('keeps every named part the runtime keeps, sheds or cuts away, under one root', () => {
    const root = doc.getRoot().listScenes()[0].listChildren();
    expect(root.map((n) => n.getName())).toEqual(['MirefenTavern_ROOT']);
    for (const name of MIREFEN_TAVERN_ASSET.requiredNodes) expect(node(name)).toBeTruthy();
    for (const part of [...TAVERN_CRITICAL_PARTS, ...TAVERN_TRIM_PARTS, ...TAVERN_OPTIONAL_PARTS]) {
      expect(node(part).getParentNode()?.getName(), part).toBe('MirefenTavern_ROOT');
      expect(trianglesUnder(node(part)), part).toBeGreaterThan(0);
    }
    expect(extras().tiers).toEqual({
      low: [...TAVERN_CRITICAL_PARTS],
      medium: [...TAVERN_TRIM_PARTS],
      high: [...TAVERN_OPTIONAL_PARTS],
    });
    expect(extras().shell).toEqual([...TAVERN_SHELL_PARTS]);
  });

  it('shares five texture-free, vertex-coloured materials, and nothing animates', () => {
    const materials = doc.getRoot().listMaterials();
    expect(materials.map((m) => m.getName()).sort()).toEqual(MIREFEN_TAVERN_ASSET.materials);
    expect(doc.getRoot().listTextures()).toHaveLength(0);
    expect(doc.getRoot().listSkins()).toHaveLength(0);
    expect(doc.getRoot().listAnimations()).toHaveLength(0);
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        expect(prim.getAttribute('COLOR_0'), mesh.getName()).not.toBeNull();
      }
    }
  });

  it('holds each part to its triangle budget, the low tier inside it', () => {
    let total = 0;
    for (const [name, count] of Object.entries(TRIANGLES)) {
      expect(trianglesUnder(node(name)), name).toBe(count);
      total += count;
    }
    expect(trianglesUnder(node('MirefenTavern_ROOT'))).toBe(total);
    // a whole two-storey inn with its furniture: under 60k in all, the low tier under 55k
    expect(total).toBeLessThan(60000);
    const low = TAVERN_CRITICAL_PARTS.reduce((n, p) => n + TRIANGLES[p], 0);
    expect(low).toBeLessThan(55000);
    expect(readFileSync(GLB).length).toBeLessThan(900 * 1024);
  });

  it("stamps the sim's numbers, all generous next to the player", () => {
    const e = extras();
    expect(e.upper).toBe(TAVERN_UPPER);
    expect(e.hall).toEqual({
      eave: TAVERN_HALL.eave,
      ridge: TAVERN_HALL.ridge,
      tie: TAVERN_HALL.tie,
      aisleBeam: TAVERN_HALL.aisleBeam,
    });
    expect(e.door).toEqual([TAVERN_DOOR.width, TAVERN_DOOR.height]);
    expect(e.stairWidth).toBeCloseTo(TAVERN_TOWER.rIn - TAVERN_TOWER.newel, 4);
    expect(e.door[1]).toBeGreaterThan(1.7 * PLAYER_H);
    expect(e.hall.aisleBeam).toBeGreaterThan(2 * PLAYER_H);
  });

  it('stands on the ground floor at its origin, the base running down into the ground', () => {
    const scene = doc.getRoot().listScenes()[0];
    expect(scene.listChildren()[0].getTranslation()).toEqual([0, 0, 0]);
    const { min, max } = getBounds(scene);
    // the stone base reaches down under the lowest ground round the building
    expect(min[1]).toBeLessThan(-2.5);
    // the tallest things are the tower's finial over its hat and the hood's flue cap
    expect(max[1]).toBeGreaterThan(TAVERN_TOWER.peak + 1.5);
    expect(max[1]).toBeGreaterThan(TAVERN_HOOD.flueTop);
    expect(max[1]).toBeLessThan(TAVERN_TOWER.peak + 3);
  });
});
