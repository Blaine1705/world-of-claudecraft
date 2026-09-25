// The Wyrmwatch cliff harbor's layout, exported for the Blender build
// (build_wyrmwatch_harbor.py reads layout.json beside this file): the decks, rails,
// props and path of src/sim/content/wyrmwatch_harbor.ts in the MODEL's frame (yards,
// origin on the waterline at WYRMWATCH_HARBOR_ORIGIN, axes the world's), each rail
// point and prop base seated on the live ground height, and a terrain height grid
// under the structure so every pile and post in the model runs down into the rock.
// The sim content is the one source of truth; tests/wyrmwatch_harbor_asset.test.ts
// fails when layout.json drifts from it (or from the terrain).
//
//   npx tsx scripts/assets/wyrmwatch_harbor/layout.ts            (writes layout.json)
//   npx tsx scripts/assets/wyrmwatch_harbor/layout.ts --context F (also a wide terrain
//                                                                  patch for the owner scene)

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARBOR_ROUTE_MARKERS } from '../../../src/sim/content/harbor_route_markers';
import {
  WYRMWATCH_HARBOR_DECKS,
  WYRMWATCH_HARBOR_ORIGIN,
  WYRMWATCH_HARBOR_PATH,
  WYRMWATCH_HARBOR_PATH_HALF_WIDTH,
  WYRMWATCH_HARBOR_PROPS,
  WYRMWATCH_HARBOR_RAILS,
  WYRMWATCH_RAIL_HEIGHT,
} from '../../../src/sim/content/wyrmwatch_harbor';
import { FERRY_PIERS } from '../../../src/sim/ferry_piers';
import { groundHeight, terrainHeight, WATER_LEVEL } from '../../../src/sim/world';
import { WORLD_SEED } from '../../../src/sim/world_seed';

const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
const r3 = (v: number): number => Math.round(v * 1e3) / 1e3;

/** The terrain grid under the structure (model frame), at this spacing. */
export const TERRAIN_GRID = { x0: -6, x1: 10, z0: -22, z1: 18, step: 0.5 } as const;

function grid(x0: number, x1: number, z0: number, z1: number, step: number) {
  const ox = WYRMWATCH_HARBOR_ORIGIN.x;
  const oz = WYRMWATCH_HARBOR_ORIGIN.z;
  const nx = Math.round((x1 - x0) / step) + 1;
  const nz = Math.round((z1 - z0) / step) + 1;
  const h: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      h.push(r3(terrainHeight(ox + x0 + i * step, oz + z0 + j * step, WORLD_SEED) - WATER_LEVEL));
    }
  }
  return { x0, z0, step, nx, nz, h };
}

export function wyrmwatchHarborLayout() {
  const ox = WYRMWATCH_HARBOR_ORIGIN.x;
  const oz = WYRMWATCH_HARBOR_ORIGIN.z;
  const aw = (x: number, z: number): number => r4(groundHeight(x, z, WORLD_SEED) - WATER_LEVEL);
  const pier = FERRY_PIERS[1][0];
  const marker = HARBOR_ROUTE_MARKERS.find((m) => m.berth === 'drakelands');
  return {
    version: 1,
    origin: { x: ox, z: oz },
    railHeight: WYRMWATCH_RAIL_HEIGHT,
    decks: WYRMWATCH_HARBOR_DECKS.map((d) => ({
      id: d.id,
      kind: d.kind,
      x: r4(d.x - ox),
      z: r4(d.z - oz),
      rot: r4(d.rot),
      hl: d.hl,
      hw: d.hw,
      near: d.nearAboveWater ?? 0,
      far: d.farAboveWater ?? 0,
    })),
    pier: {
      x: r4(pier.x - ox),
      z: r4(pier.z - oz),
      rot: r4(pier.rot),
      hl: pier.hl,
      hw: pier.hw,
      top: pier.nearAboveWater ?? 0,
    },
    marker: marker ? { x: r4(marker.x - ox), z: r4(marker.z - oz) } : null,
    // each rail as its corners (where posts must stand) and, per leg, the planks'
    // height every half yard (a rail climbing a flight bends onto its landing)
    rails: WYRMWATCH_HARBOR_RAILS.map((rail) => ({
      corners: rail.map(([x, z]) => ({ x: r4(x - ox), z: r4(z - oz), y: aw(x, z) })),
      legs: rail.slice(1).map(([x1, z1], i) => {
        const [x0, z0] = rail[i];
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5));
        return Array.from({ length: n + 1 }, (_, k) => {
          const x = x0 + ((x1 - x0) * k) / n;
          const z = z0 + ((z1 - z0) * k) / n;
          return { x: r4(x - ox), z: r4(z - oz), y: aw(x, z) };
        });
      }),
    })),
    props: WYRMWATCH_HARBOR_PROPS.map((p) => ({
      kind: p.kind,
      x: r4(p.x - ox),
      z: r4(p.z - oz),
      rot: r4(p.rot),
      ...(p.r !== undefined ? { r: p.r } : { hw: p.hw ?? 0.5, hd: p.hd ?? 0.5 }),
      height: p.height,
      base: aw(p.x, p.z),
    })),
    path: {
      points: WYRMWATCH_HARBOR_PATH.map(([x, z]) => [r4(x - ox), r4(z - oz)]),
      halfWidth: WYRMWATCH_HARBOR_PATH_HALF_WIDTH,
    },
    terrain: grid(
      TERRAIN_GRID.x0,
      TERRAIN_GRID.x1,
      TERRAIN_GRID.z0,
      TERRAIN_GRID.z1,
      TERRAIN_GRID.step,
    ),
  };
}

export const WYRMWATCH_LAYOUT_FILE = 'scripts/assets/wyrmwatch_harbor/layout.json';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const layout = wyrmwatchHarborLayout();
  writeFileSync(path.join(root, WYRMWATCH_LAYOUT_FILE), `${JSON.stringify(layout)}\n`);
  console.log(`wrote ${WYRMWATCH_LAYOUT_FILE}`);
  const i = process.argv.indexOf('--context');
  if (i > 0 && process.argv[i + 1]) {
    // the owner's scene: a wide terrain patch (harbor to the path's end), not shipped
    writeFileSync(process.argv[i + 1], `${JSON.stringify(grid(-60, 30, -30, 26, 1))}\n`);
    console.log(`wrote ${process.argv[i + 1]}`);
  }
}
