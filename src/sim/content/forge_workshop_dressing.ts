import type { ZonePropsDef } from '../types';

/** Supplies complement the existing Last Keep blacksmith without a second furnace. */
export const FORGE_WORKSHOP_DRESSING: NonNullable<ZonePropsDef['decorProps']> = [
  { key: 'hexSack', x: 377.5, z: 2027, rot: 0.4, scale: 5, terrainCalm: false },
  { key: 'hexSack', x: 378.2, z: 2027.5, rot: -0.3, scale: 4.5, terrainCalm: false },
];
