// The Great Maze's modeled-hedge plan: pure placement logic mapping the
// sim's wall grid (sim/world.ts owns it, and movement blocking + the map
// painter read the same cells) to hedge-piece and arch transforms for
// garden_features.ts to draw. Piece kinds come from gardenMazeCellPieces,
// so the drawn hedges and the blocked ground can never disagree.
import {
  GARDEN_MAZE_GRID,
  gardenMazeCellPieces,
  MAZE_CELL,
  MAZE_COLS,
  MAZE_ROWS,
  MAZE_WALL_DEPTH,
  MAZE_X0,
  MAZE_Z1,
} from '../sim/world';

export interface MazePieceSpot {
  x: number;
  z: number;
  rot: number; // 0 runs east-west; PI/2 runs north-south
}

// The source models' authored bounds (hedge 0.98 x 0.57 x 0.38, arch
// 0.98 x 0.84 x 0.38, both minY 0). One uniform scale spans a piece across
// its 9yd cell and lands the hedge depth just inside MAZE_WALL_DEPTH, so
// the collide box sits a hair proud of the leaves instead of inside them.
export const MAZE_WALL_SCALE = MAZE_CELL / 0.98; // 9.18: 9 long, 5.2 high, 3.5 deep
export const MAZE_ARCH_SCALE = MAZE_CELL / 0.98; // same span, 7.7 high at the crown

export interface GardenMazePlan {
  walls: MazePieceSpot[];
  arches: MazePieceSpot[];
}

/** All hedge pieces plus an arch over every perimeter opening. */
export function planGardenMazePieces(): GardenMazePlan {
  const walls: MazePieceSpot[] = [];
  const arches: MazePieceSpot[] = [];
  const cx = (c: number) => MAZE_X0 + (c + 0.5) * MAZE_CELL;
  const cz = (r: number) => MAZE_Z1 - (r + 0.5) * MAZE_CELL;
  for (let r = 0; r < MAZE_ROWS; r++) {
    for (let c = 0; c < MAZE_COLS; c++) {
      const p = gardenMazeCellPieces(c, r);
      if (p) {
        if (p.h) walls.push({ x: cx(c), z: cz(r), rot: 0 });
        if (p.v) walls.push({ x: cx(c), z: cz(r), rot: Math.PI / 2 });
        continue;
      }
      // a perimeter opening gets the hedge arch, its passage along the
      // axis of travel through the maze edge
      const north = r === 0;
      const south = r === MAZE_ROWS - 1;
      const west = c === 0;
      const east = c === MAZE_COLS - 1;
      if (north || south) arches.push({ x: cx(c), z: cz(r), rot: 0 });
      else if (west || east) arches.push({ x: cx(c), z: cz(r), rot: Math.PI / 2 });
    }
  }
  return { walls, arches };
}

// re-exported so the painter and its test share the exact cell math
export { GARDEN_MAZE_GRID, MAZE_CELL, MAZE_COLS, MAZE_ROWS, MAZE_WALL_DEPTH, MAZE_X0, MAZE_Z1 };
