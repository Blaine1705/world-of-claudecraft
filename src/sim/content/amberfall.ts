// The Amberfall (levels 18-20). An eternal-autumn weald behind the Veiled
// Hollow's western cliffs: fire-colored forests under a honey-gold sky,
// harvest meadows, and the Great Mere at its heart, ringed by the lantern
// town of Lanternmere. Walked into through the Rootway, a tunnel behind the
// Frostveil's north benches over the Goldmelt pass, snow melting into
// gold underfoot (southPassX). Terrain shape: AMBER_* tables in world.ts.

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

export const AMBERFALL_ZONE: ZoneDef = {
  id: 'amberfall',
  name: 'The Amberfall',
  zMin: 2560,
  zMax: 3120,
  levelRange: [18, 20],
  biome: 'amber',
  southPassX: 10, // the Goldmelt: where the snow road melts into autumn
  hub: { x: 0, z: 2812, radius: 24, name: 'Lanternmere' },
  graveyard: { x: 24, z: 2790 },
  lakes: [
    { x: 0, z: 2872, radius: 26 }, // the Great Mere
    { x: 28, z: 2886, radius: 14 }, // ...its reeded eastern reach
    { x: -30, z: 2884, radius: 13 }, // ...and the willow-shaded west
    { x: -84, z: 2742, radius: 10 }, // the Orchard Pool
    { x: 96, z: 2986, radius: 9 }, // the Monolith tarn
  ],
  pois: [
    { x: 0, z: 2812, label: 'Lanternmere' },
    { x: 10, z: 2588, label: 'The Goldmelt' },
    { x: -72, z: 2732, label: 'The Gilded Orchard' },
    { x: 70, z: 2700, label: 'Harvest Hollow' },
    { x: 0, z: 2872, label: 'The Great Mere' },
    { x: -70, z: 2950, label: 'Cindermaple Rise' },
    { x: 84, z: 2970, label: 'The Leaning Monolith' },
  ],
  welcome:
    'Every leaf here burns gold and red, yet none ever fall. The lanterns of Lanternmere are lit for you.',
};

export const AMBERFALL_ROADS: { x: number; z: number }[][] = [
  [
    { x: 10, z: 2558 },
    { x: 0, z: 2620 },
    { x: -14, z: 2770 },
    { x: 0, z: 2812 },
  ], // the Goldmelt pass -> Lanternmere
  [
    { x: -12, z: 2790 },
    { x: -50, z: 2760 },
    { x: -72, z: 2734 },
  ], // Lanternmere -> the Gilded Orchard's edge
  [
    { x: 12, z: 2790 },
    { x: 45, z: 2740 },
    { x: 70, z: 2700 },
  ], // Lanternmere -> Harvest Hollow
  [
    { x: -14, z: 2830 },
    { x: -58, z: 2886 },
    { x: -70, z: 2950 },
  ], // Lanternmere -> Cindermaple Rise, west of the Mere
  [
    { x: 16, z: 2832 },
    { x: 58, z: 2910 },
    { x: 88, z: 2966 },
  ], // Lanternmere -> the Leaning Monolith, east of the Mere
];

// The Westway: an open meadow crossing at the world's western edge; walking
// west past the Mirrorshallow carries you straight into the Amberfall (a
// wide unmarked trigger, no cave and no wall, like walking into a new land).
// No portals: the Amberfall is walked into over the Goldmelt pass, where
// the Frostveil's snow road melts mile by mile into autumn gold.
export const AMBERFALL_PORTALS: PortalDef[] = [];

// Creatures and quests follow in the content pass.
export const AMBERFALL_MOBS: Record<string, MobTemplate> = {};
export const AMBERFALL_NPCS: Record<string, NpcDef> = {};
export const AMBERFALL_QUESTS: Record<string, QuestDef> = {};
export const AMBERFALL_QUEST_ORDER: string[] = [];
export const AMBERFALL_ITEMS: Record<string, ItemDef> = {};
export const AMBERFALL_CAMPS: CampDef[] = [];
export const AMBERFALL_OBJECTS: GroundObjectDef[] = [];

export const AMBERFALL_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // Lanternmere: an autumn market town on the Mere's north shore
  buildings: [
    { kind: 'inn', x: -12, z: 2806, w: 6, d: 7, rot: 0.6 },
    { kind: 'house', x: 12, z: 2802, w: 6, d: 6, rot: -0.8 },
    { kind: 'house', x: -14, z: 2824, w: 6, d: 6, rot: 2.0 },
    { kind: 'chapel', x: 14, z: 2822, w: 5, d: 7, rot: -2.2 },
  ],
  wells: [{ x: 0, z: 2814, r: 1.5 }],
  stalls: [
    { x: 6, z: 2808, rot: 0.4, r: 1.6 },
    { x: -6, z: 2820, rot: -1.4, r: 1.6 },
  ],
  fences: [
    { x1: -18, z1: 2798, x2: -8, z2: 2794 },
    { x1: 8, z1: 2828, x2: 18, z2: 2830 },
  ],
  campfires: [
    [0, 2808],
    [8, 2585],
  ],
};
