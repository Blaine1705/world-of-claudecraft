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

// Content tables land in later steps (creatures, town NPCs, quest chain,
// items, props); registered empty now so the zone exists end to end.
export const REALM_MOBS: Record<string, MobTemplate> = {};

export const REALM_NPCS: Record<string, NpcDef> = {};

export const REALM_QUESTS: Record<string, QuestDef> = {};

export const REALM_QUEST_ORDER: string[] = [];

export const REALM_CAMPS: CampDef[] = [];

export const REALM_OBJECTS: GroundObjectDef[] = [];

export const REALM_ITEMS: Record<string, ItemDef> = {};

export const REALM_PROPS: ZonePropsDef = emptyZoneProps();
