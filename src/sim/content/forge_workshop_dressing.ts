import { hexBuildingBox } from '../hex_building_dims';
import type { ZonePropsDef } from '../types';

/** Wyrmwatch blacksmith building and workshop dressing. */
export const FORGE_WORKSHOP_DRESSING: NonNullable<ZonePropsDef['decorProps']> = [
  {
    key: 'hexrBlacksmith',
    x: 426,
    z: 1902,
    rot: -Math.PI / 2,
    scale: 7,
    r: 5,
    h: 7,
    ...(hexBuildingBox('hexrBlacksmith', 7) ?? {}),
  },
  { key: 'hexSack', x: 421.5, z: 1896.5, rot: 0.4, scale: 5, terrainCalm: false },
  { key: 'hexSack', x: 422.2, z: 1897.0, rot: -0.3, scale: 4.5, terrainCalm: false },
];
