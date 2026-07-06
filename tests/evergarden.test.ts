// The Evergarden: zone registration, and the Great Maze contract. The maze
// hedges are pure terrain (world.ts GARDEN_MAZE), so these tests are what
// keeps an edit to the grid honest: the corridors must stay walkable, the
// walls must stay unclimbable, and the entrance must still reach the
// Fountain Court.

import { describe, expect, it } from 'vitest';
import {
  EVERGARDEN_CAMPS,
  EVERGARDEN_PROPS,
  EVERGARDEN_ROADS,
  EVERGARDEN_ZONE,
} from '../src/sim/content/evergarden';
import { PLAYER_MAX_CLIMB_SLOPE } from '../src/sim/pathfind';
import {
  GARDEN_MAZE_GRID,
  inGardenMaze,
  MAZE_CELL,
  MAZE_COLS,
  MAZE_ROWS,
  MAZE_X0,
  MAZE_Z1,
  terrainHeight,
  WATER_LEVEL,
} from '../src/sim/world';

const SEED = 1337; // matches the fixed client seed in src/main.ts

// Cell (col, row) center in world coordinates. Row 0 is the NORTH row.
function cellCenter(c: number, r: number): { x: number; z: number } {
  return {
    x: MAZE_X0 + c * MAZE_CELL + MAZE_CELL / 2,
    z: MAZE_Z1 - r * MAZE_CELL - MAZE_CELL / 2,
  };
}

describe('Evergarden zone registration', () => {
  it('keeps its hub, graveyard, and camps on dry, in-zone ground', () => {
    const { hub, graveyard } = EVERGARDEN_ZONE;
    expect(hub.z).toBeGreaterThan(EVERGARDEN_ZONE.zMin);
    expect(hub.z).toBeLessThan(EVERGARDEN_ZONE.zMax);
    expect(terrainHeight(hub.x, hub.z, SEED)).toBeGreaterThan(WATER_LEVEL);
    expect(terrainHeight(graveyard.x, graveyard.z, SEED)).toBeGreaterThan(WATER_LEVEL);
    for (const camp of EVERGARDEN_CAMPS) {
      expect(terrainHeight(camp.center.x, camp.center.z, SEED)).toBeGreaterThan(WATER_LEVEL);
    }
  });

  it('keeps every road on dry ground along its whole length', () => {
    for (const road of EVERGARDEN_ROADS) {
      for (let i = 0; i < road.length - 1; i++) {
        const a = road[i];
        const b = road[i + 1];
        const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 4));
        for (let k = 0; k <= steps; k++) {
          const x = a.x + ((b.x - a.x) * k) / steps;
          const z = a.z + ((b.z - a.z) * k) / steps;
          expect(
            terrainHeight(x, z, SEED),
            `road ${Math.round(x)},${Math.round(z)}`,
          ).toBeGreaterThan(WATER_LEVEL);
        }
      }
    }
  });

  it('keeps roads, camps (except the court), and props out of the maze', () => {
    for (const road of EVERGARDEN_ROADS) {
      for (const p of road) expect(inGardenMaze(p.x, p.z), `road ${p.x},${p.z}`).toBe(false);
    }
    for (const camp of EVERGARDEN_CAMPS) {
      if (camp.mobId === 'the_topiary_bull') continue; // the court's keeper
      expect(inGardenMaze(camp.center.x, camp.center.z), camp.mobId).toBe(false);
    }
    for (const t of EVERGARDEN_PROPS.greatTrees ?? []) {
      expect(inGardenMaze(t.x, t.z), `tree ${t.x},${t.z}`).toBe(false);
      // dry footing too: a wet spot would strand an invisible trunk collider
      expect(terrainHeight(t.x, t.z, SEED), `tree ${t.x},${t.z}`).toBeGreaterThan(WATER_LEVEL);
    }
  });
});

describe('the Great Maze', () => {
  it('has a well-formed grid', () => {
    expect(GARDEN_MAZE_GRID.length).toBe(MAZE_ROWS);
    for (const row of GARDEN_MAZE_GRID) {
      expect(row.length).toBe(MAZE_COLS);
      expect(/^[#.]+$/.test(row)).toBe(true);
    }
  });

  it('is solvable: the entrance reaches the Fountain Court', () => {
    // BFS over open cells from the south entrance (last row's gap).
    const entranceCol = GARDEN_MAZE_GRID[MAZE_ROWS - 1].indexOf('.');
    expect(entranceCol).toBeGreaterThanOrEqual(0);
    const court = { c: 7, r: 8 }; // the open 3x3 center
    expect(GARDEN_MAZE_GRID[court.r][court.c]).toBe('.');
    const seen = new Set<string>([`${entranceCol},${MAZE_ROWS - 1}`]);
    const queue = [{ c: entranceCol, r: MAZE_ROWS - 1 }];
    let reached = false;
    while (queue.length > 0) {
      const cur = queue.shift();
      if (!cur) break;
      if (cur.c === court.c && cur.r === court.r) {
        reached = true;
        break;
      }
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const c = cur.c + dc;
        const r = cur.r + dr;
        if (c < 0 || c >= MAZE_COLS || r < 0 || r >= MAZE_ROWS) continue;
        if (GARDEN_MAZE_GRID[r][c] !== '.') continue;
        const key = `${c},${r}`;
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ c, r });
      }
    }
    expect(reached).toBe(true);
  });

  it('raises hedge walls the climb gate cannot beat', () => {
    // Every wall cell adjacent to a corridor must present a slope steeper
    // than the player's climb limit on the straight approach from the
    // corridor center to the wall center.
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < MAZE_COLS; c++) {
        if (GARDEN_MAZE_GRID[r][c] !== '#') continue;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const oc = c + dc;
          const or = r + dr;
          if (oc < 0 || oc >= MAZE_COLS || or < 0 || or >= MAZE_ROWS) continue;
          if (GARDEN_MAZE_GRID[or][oc] !== '.') continue;
          const from = cellCenter(oc, or);
          const to = cellCenter(c, r);
          // walk the approach in half-yard steps; the steepest step must
          // exceed the climbable slope
          let maxSlope = 0;
          const steps = 18;
          let prev = terrainHeight(from.x, from.z, SEED);
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const x = from.x + (to.x - from.x) * t;
            const z = from.z + (to.z - from.z) * t;
            const h = terrainHeight(x, z, SEED);
            const stepLen = Math.hypot(to.x - from.x, to.z - from.z) / steps;
            maxSlope = Math.max(maxSlope, (h - prev) / stepLen);
            prev = h;
          }
          expect(maxSlope, `wall ${c},${r} from ${oc},${or}`).toBeGreaterThan(
            PLAYER_MAX_CLIMB_SLOPE,
          );
        }
      }
    }
  });

  it('keeps corridor centers flat enough to walk', () => {
    // Along every open cell center, the local slope to its open neighbors
    // stays under the climb gate, so the labyrinth is fully traversable.
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < MAZE_COLS; c++) {
        if (GARDEN_MAZE_GRID[r][c] !== '.') continue;
        const here = cellCenter(c, r);
        const hHere = terrainHeight(here.x, here.z, SEED);
        for (const [dc, dr] of [
          [1, 0],
          [0, 1],
        ]) {
          const oc = c + dc;
          const or = r + dr;
          if (oc >= MAZE_COLS || or >= MAZE_ROWS) continue;
          if (GARDEN_MAZE_GRID[or][oc] !== '.') continue;
          const there = cellCenter(oc, or);
          const hThere = terrainHeight(there.x, there.z, SEED);
          const slope = Math.abs(hThere - hHere) / MAZE_CELL;
          expect(slope, `corridor ${c},${r} -> ${oc},${or}`).toBeLessThan(PLAYER_MAX_CLIMB_SLOPE);
        }
      }
    }
  });
});
