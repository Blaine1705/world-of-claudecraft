// The Frostveil Reach (levels 17-20). A snowbound mountain realm of terraced
// benches, frozen tarns, and auroras, hidden behind the Drakemaw's volcanic
// wall. Reached only by portal: an ice fissure in the Veiled Hollow's west
// coast cliffs opens into the Heartfrost Cavern on the Reach's south rim
// (sealedSouthBorder keeps the land route shut). Terrain shape: the FROST_*
// tables in world.ts (coast lobes, the bench terracing).

import type {
  CampDef,
  GroundObjectDef,
  ItemDef,
  MobTemplate,
  NpcDef,
  PortalDef,
  QuestDef,
  ZoneDef,
  ZonePropsDef,
} from '../types';
import { emptyZoneProps } from '../types';

export const FROSTVEIL_ZONE: ZoneDef = {
  id: 'frostveil',
  name: 'The Frostveil Reach',
  zMin: 2040,
  zMax: 2560,
  levelRange: [17, 20],
  biome: 'frost',
  sealedSouthBorder: true,
  hub: { x: -30, z: 2160, radius: 22, name: 'Icemantle' },
  graveyard: { x: -34, z: 2176 },
  lakes: [
    { x: 60, z: 2240, radius: 16 }, // Glacier Tarn
    { x: 48, z: 2252, radius: 9 }, // ...its still northern finger
    { x: -90, z: 2360, radius: 12 }, // the Shiverfen pool
  ],
  pois: [
    { x: -30, z: 2160, label: 'Icemantle' },
    { x: -18, z: 2092, label: 'Heartfrost Cavern' },
    { x: 60, z: 2240, label: 'Glacier Tarn' },
    { x: 30, z: 2340, label: 'The Aurora Steps' },
    { x: -90, z: 2360, label: 'The Shiverfen' },
    { x: 100, z: 2410, label: 'The Howling Terraces' },
  ],
  welcome: 'Snow swallows every sound. Under the dancing lights, the cold itself feels awake.',
};

// Bench-to-bench mountain paths; terracing is suppressed near roads so every
// marked route stays climbable (see the frost shaping in world.ts).
export const FROSTVEIL_ROADS: { x: number; z: number }[][] = [
  [
    { x: -18, z: 2092 },
    { x: -24, z: 2120 },
    { x: -30, z: 2160 },
  ], // Heartfrost Cavern -> Icemantle
  [
    { x: -30, z: 2160 },
    { x: 10, z: 2200 },
    { x: 42, z: 2226 },
  ], // Icemantle -> the Glacier Tarn shore
  [
    { x: 42, z: 2226 },
    { x: 28, z: 2262 },
    { x: 40, z: 2300 },
    { x: 30, z: 2340 },
  ], // the tarn shore -> the Aurora Steps, skirting the tarn's finger
  [
    { x: -30, z: 2160 },
    { x: -70, z: 2260 },
    { x: -78, z: 2346 },
  ], // Icemantle -> the Shiverfen's edge
  [
    { x: 30, z: 2340 },
    { x: 70, z: 2390 },
    { x: 90, z: 2430 },
  ], // the Aurora Steps -> the Howling Terraces
];

// The ice fissure: hidden in the Veiled Hollow's west coast cliffs (no POI on
// the Hollow's map, so it stays a discovery), opening into Heartfrost Cavern.
export const FROSTVEIL_PORTALS: PortalDef[] = [
  {
    id: 'heartfrost_fissure',
    a: { x: 158, z: 1108, landing: { x: 154, z: 1103, facing: -2.4 } },
    b: { x: -18, z: 2086, landing: { x: -18, z: 2093, facing: 0 } },
    radius: 2.0,
    enterText: 'Cold pours from the fissure. You squeeze through into snow and silence.',
    leaveText: 'The warm dusk of the Hollow washes back over you.',
  },
];

// Content fill (creatures, folk, quests) lands in a follow-up pass.
export const FROSTVEIL_MOBS: Record<string, MobTemplate> = {};
export const FROSTVEIL_NPCS: Record<string, NpcDef> = {};
export const FROSTVEIL_QUESTS: Record<string, QuestDef> = {};
export const FROSTVEIL_QUEST_ORDER: string[] = [];
export const FROSTVEIL_ITEMS: Record<string, ItemDef> = {};
export const FROSTVEIL_CAMPS: CampDef[] = [];
export const FROSTVEIL_OBJECTS: GroundObjectDef[] = [];

export const FROSTVEIL_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // both fissure mouths, so the passage reads as a cave at each end
  mines: [
    { x: 160, z: 1110, rot: -2.4 }, // Hollow side, opening toward the shore path
    { x: -18, z: 2084, rot: 0 }, // Reach side, opening north out of the cavern
  ],
  campfires: [[-30, 2160]],
};
