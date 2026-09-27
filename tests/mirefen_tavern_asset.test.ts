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
import { TAVERN_HALL_AIR_TOP } from '../src/render/mirefen_tavern_interior_core';
import {
  TAVERN_DOOR,
  TAVERN_HALL,
  TAVERN_HOOD,
  TAVERN_TOWER,
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
const SHIPPED_SHA256 = 'f3bffa86be4d942f1da0ddbe05963b161183ffd7bd9dd6fa0be50135a41316cc';
const SHIPPED_BYTES = 977344;
/** Triangles per named part, from the Blender build report. */
const TRIANGLES: Record<string, number> = {
  TavernFrame: 10976,
  TavernFurnishings: 7836,
  TavernLights: 4680,
  HallWallFront: 824,
  HallWallFrontLeft: 1068,
  HallWallFrontRight: 1068,
  HallWallBack: 2612,
  HallWallLeft: 2512,
  HallWallRight: 4212,
  HallRoof: 7000,
  WingWallEast: 1344,
  WingWallBack: 1476,
  WingWallWest: 696,
  WingRoof: 1224,
  TowerWall: 4370,
  TowerRoof: 2000,
  HallPorch: 1980,
  BarPillar: 784,
  TavernTrim: 2900,
  TavernClutter: 6478,
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
  hall: { eave: number; ridge: number; truss: number };
  door: number[];
  nookRadius: number;
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
    // a whole inn with its booths, stage, nook, kitchen and hammerbeam roof: under 68k in all,
    // the low tier under 58k, the shipped file under a megabyte
    expect(total).toBeLessThan(68000);
    const low = TAVERN_CRITICAL_PARTS.reduce((n, p) => n + TRIANGLES[p], 0);
    expect(low).toBeLessThan(58000);
    expect(readFileSync(GLB).length).toBeLessThan(1000 * 1024);
  });

  it("stamps the sim's numbers, all generous next to the player", () => {
    const e = extras();
    expect(e.hall).toEqual({
      eave: TAVERN_HALL.eave,
      ridge: TAVERN_HALL.ridge,
      truss: TAVERN_HALL.truss,
    });
    expect(e.door).toEqual([TAVERN_DOOR.width, TAVERN_DOOR.height]);
    expect(e.nookRadius).toBe(TAVERN_TOWER.rIn);
    expect(e.door[1]).toBeGreaterThan(1.7 * PLAYER_H);
    // open to the roof: nothing crosses the room under the hammer beams, near four bodies up
    expect(e.hall.truss).toBeGreaterThan(3.5 * PLAYER_H);
  });

  it('keeps the common room clear of timber between the tables and the top of the air', () => {
    // no beam, brace, joist or hung thing crosses the room where the camera flies: over the
    // floor's furniture (the settles' backs, the candles) and under the camera's air top
    // (render/mirefen_tavern_interior_core.ts), inside the hall clear of its walls, only the bar
    // (its pillar, which cuts away, the kegs and the racks behind it), the wall fire and the
    // trophies an arm's length off the walls stand
    const lo = 2.9;
    const hi = TAVERN_HALL_AIR_TOP;
    const offenders: string[] = [];
    const v = [0, 0, 0];
    for (const n of doc.getRoot().listNodes()) {
      const mesh = n.getMesh();
      if (!mesh) continue;
      const m = n.getWorldMatrix();
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION');
        const idx = prim.getIndices();
        if (!pos || !idx) continue;
        const pt = (k: number): [number, number, number] => {
          pos.getElement(k, v);
          return [
            m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
            m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
            m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
          ];
        };
        for (let t = 0; t < idx.getCount(); t += 3) {
          const a = pt(idx.getScalar(t));
          const b = pt(idx.getScalar(t + 1));
          const c = pt(idx.getScalar(t + 2));
          const x = (a[0] + b[0] + c[0]) / 3;
          const y = (a[1] + b[1] + c[1]) / 3;
          const z = (a[2] + b[2] + c[2]) / 3;
          if (y <= lo || y >= hi) continue;
          if (Math.abs(x) > TAVERN_HALL.x1 - TAVERN_HALL.wall - 1.2) continue;
          if (z < TAVERN_HALL.z0 + TAVERN_HALL.wall + 1.2) continue;
          if (z > TAVERN_HALL.z1 - TAVERN_HALL.wall - 1.2) continue;
          if (x > 2.0 && z < -4.0) continue; // the bar
          if (x > 13.2 && Math.abs(z - 2.5) < 2.6) continue; // the wall fire and its jawbone
          offenders.push(`${n.getName()} at ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`);
        }
      }
    }
    expect(offenders.slice(0, 12)).toEqual([]);
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
