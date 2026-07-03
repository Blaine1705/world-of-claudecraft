// The Veiled Hollow (levels 15-20). A sheltered valley realm sealed beneath
// the mountains north of Thornpeak long before the Gravecaller conspiracy;
// the seal has thinned, and a concealed cave in the Thornpeak cliffs now
// leads through. Permanent dusk, glowing flora, and the town of Eldergleam
// around the roots of a great tree. Reached only by portal: the southern
// border ridge is sealed (see sealedSouthBorder in world.ts).

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

export const REALM_ZONE: ZoneDef = {
  id: 'veiled_hollow',
  name: 'The Veiled Hollow',
  zMin: 900,
  zMax: 1260,
  levelRange: [15, 20],
  biome: 'dusk',
  sealedSouthBorder: true,
  hub: { x: -40, z: 1030, radius: 22, name: 'Eldergleam' },
  graveyard: { x: -52, z: 1014 },
  lakes: [
    { x: 110, z: 985, radius: 22 }, // Starfall Basin
    { x: 75, z: 1165, radius: 18 }, // the Crystalline Shallows
  ],
  pois: [
    { x: -40, z: 1030, label: 'Eldergleam' },
    { x: -140, z: 952, label: 'Duskfall Cave' },
    { x: -118, z: 988, label: 'Duskfall Overlook' },
    { x: 30, z: 955, label: 'Elder Grove' },
    { x: 110, z: 985, label: 'Starfall Basin' },
    { x: 125, z: 1085, label: 'The Sunken Court' },
    { x: 75, z: 1165, label: 'Crystalline Shallows' },
    { x: -70, z: 1155, label: 'The Gleaming Deep' },
  ],
  welcome: 'The air hums with old magic. Seek Keeper Saelwyn beneath the great tree of Eldergleam.',
};

// Winding valley paths: the cave descent into Eldergleam, then spokes out to
// the grove, the basin, the ruins, and the mushroom forest.
export const REALM_ROADS: { x: number; z: number }[][] = [
  [
    { x: -140, z: 955 },
    { x: -125, z: 980 },
    { x: -95, z: 1005 },
    { x: -40, z: 1030 },
  ], // Duskfall Cave -> Eldergleam
  [
    { x: -45, z: 1052 },
    { x: -60, z: 1105 },
    { x: -70, z: 1150 },
  ], // Eldergleam -> the Gleaming Deep
  [
    { x: -18, z: 1030 },
    { x: 30, z: 1042 },
    { x: 80, z: 1062 },
    { x: 120, z: 1085 },
  ], // Eldergleam -> the Sunken Court
  [
    { x: -30, z: 1010 },
    { x: 15, z: 982 },
    { x: 70, z: 975 },
  ], // Eldergleam -> Starfall Basin shore
  [
    { x: -62, z: 1155 },
    { x: -10, z: 1172 },
    { x: 38, z: 1170 },
  ], // the Gleaming Deep -> Crystalline Shallows
];

// The hidden way in. Side a is the concealed cave in the northwest Thornpeak
// cliffs (no POI, no map marker: found by exploring); side b is the Duskfall
// Cave on the realm's southern wall. Landings sit ~5yd outside the opposite
// trigger so arrivals never bounce straight back.
export const REALM_PORTALS: PortalDef[] = [
  {
    id: 'duskfall_passage',
    a: { x: -140, z: 845, landing: { x: -140, z: 841, facing: Math.PI } },
    b: { x: -140, z: 950, landing: { x: -140, z: 955, facing: 0 } },
    radius: 2.0,
    enterText: 'A veil of dusk parts before you, and the Hollow opens ahead.',
    leaveText: 'The veil closes behind you, and the mountain air bites again.',
  },
];

// Content tables land in later steps (creatures, town NPCs, quest chain,
// items, props); registered empty now so the zone exists end to end.
export const REALM_MOBS: Record<string, MobTemplate> = {};

export const REALM_NPCS: Record<string, NpcDef> = {};

export const REALM_QUESTS: Record<string, QuestDef> = {};

export const REALM_QUEST_ORDER: string[] = [];

export const REALM_CAMPS: CampDef[] = [];

export const REALM_OBJECTS: GroundObjectDef[] = [];

export const REALM_ITEMS: Record<string, ItemDef> = {};

export const REALM_PROPS: ZonePropsDef = {
  ...emptyZoneProps(),
  // The two cave mouths of the Duskfall passage: the concealed entrance in
  // the Thornpeak cliffs and its twin on the realm's southern wall. The mine
  // arch faces its rot direction; the portal trigger sits just outside each.
  mines: [
    { x: -140, z: 847, rot: Math.PI }, // Thornpeak side, opening south
    { x: -140, z: 948, rot: 0 }, // realm side, opening north
  ],
  // Eldergleam: the hub town under the great tree (the tree itself is placed
  // by render/realm_flora.ts; these are the built structures around it).
  buildings: [
    { kind: 'inn', x: -48, z: 1038, w: 6, d: 7, rot: 0.7 },
    { kind: 'house', x: -30, z: 1040, w: 7, d: 6, rot: -0.4 },
    { kind: 'house', x: -52, z: 1024, w: 6, d: 6, rot: 1.2 },
    { kind: 'chapel', x: -28, z: 1020, w: 5, d: 7, rot: -1.9 }, // the shrine
  ],
  wells: [{ x: -38, z: 1036, r: 1.5 }],
  stalls: [
    { x: -45, z: 1030, rot: Math.PI / 2, r: 1.7 }, // Provisioner Fenna
    { x: -34, z: 1032, rot: -0.5, r: 1.7 }, // Wardsmith Orun
  ],
  crates: [
    [-44, 1028],
    [-33, 1034],
  ],
  campfires: [
    [-40, 1018], // town square gathering fire
    [-70, 1005], // wayfarer camp on the Duskfall road
    [32, 958], // Grove Keeper camp
  ],
  tents: [
    { x: 27, z: 953, rot: 0.6, scale: 1 }, // Grove Keeper camp
    { x: 35, z: 952, rot: -0.9, scale: 0.9 },
    { x: 31, z: 962, rot: 2.4, scale: 1.05 },
  ],
  fences: [
    // the magical garden ring on the town's north edge
    { x1: -50, z1: 1044, x2: -42, z2: 1047 },
    { x1: -42, z1: 1047, x2: -33, z2: 1046 },
    { x1: -33, z1: 1046, x2: -27, z2: 1042 },
  ],
  ruinRings: [
    // the Sunken Court: an overgrown temple complex
    { x: 125, z: 1085, ringR: 9, columns: 7 },
    { x: 138, z: 1072, ringR: 6, columns: 5 },
    { x: 112, z: 1098, ringR: 5, columns: 4 },
    // the Duskfall Overlook: a broken vantage ring at the first viewpoint
    { x: -118, z: 988, ringR: 4, columns: 3 },
    // a lone forgotten monument in the far northeast (no POI: a secret)
    { x: 160, z: 1230, ringR: 4, columns: 3 },
  ],
  graveyards: [{ x: -52, z: 1014 }],
};
