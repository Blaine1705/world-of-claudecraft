/** Original fixed courtyard. Every corridor belongs to a loop; no procedural generation. */
export const WISP_MAZE_GRID = [
  '###########',
  '#.........#',
  '#.#.#.#.#.#',
  '#.........#',
  '#.###.###.#',
  '#.........#',
  '#.#.#.#.#.#',
  '#.........#',
  '#.###.###.#',
  '#.........#',
  '###########',
] as const;

export const WISP_MAZE_PITCH = 4;
export const WISP_MAZE_SPAWN_CELL = 104;
export const WISP_MAZE_POWER_CELLS = [12, 20, 100, 108] as const;
export const WISP_MAZE_ENEMY_SPAWNS = [16, 34, 42, 60] as const;

export const WISP_MAZE_PROFILES = {
  easy: { enemyCount: 2, enemySpeed: 4.2, enemyMaxSpeed: 5.6, powerSeconds: 8 },
  normal: { enemyCount: 3, enemySpeed: 4.6, enemyMaxSpeed: 6, powerSeconds: 7 },
  hard: { enemyCount: 4, enemySpeed: 5, enemyMaxSpeed: 6.4, powerSeconds: 6 },
} as const;

export const WISP_MAZE_PRESSURE = {
  startSeconds: 15,
  maxSeconds: 90,
  contactRadius: 1.65,
  frightenedSpeedMultiplier: 0.75,
} as const;
