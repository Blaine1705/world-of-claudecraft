import type { NpcDef, WorldQuestDef, WorldQuestTraceDef } from '../types';

export const WORLD_QUEST_CALLIGRAPHY_ID = 'wq_eastbrook_calligraphy';

/** All variants use the same tested clearing and one continuous closed stroke. */
export const WORLD_QUEST_CALLIGRAPHY_ADVANCED: readonly WorldQuestTraceDef[] = [
  {
    kind: 'star',
    points: [
      { x: 172, z: -20 },
      { x: 175.5267115138, z: -30.8541019662 },
      { x: 166.2936609022, z: -24.1458980338 },
      { x: 177.7063390978, z: -24.1458980338 },
      { x: 168.4732884862, z: -30.8541019662 },
      { x: 172, z: -20 },
    ],
  },
  {
    kind: 'hourglass',
    points: [
      { x: 168, z: -31 },
      { x: 176, z: -23 },
      { x: 168, z: -23 },
      { x: 176, z: -31 },
      { x: 168, z: -31 },
    ],
  },
  {
    kind: 'lightning',
    points: [
      { x: 174, z: -31 },
      { x: 168, z: -26 },
      { x: 172, z: -26 },
      { x: 170, z: -21 },
      { x: 177, z: -28 },
      { x: 173, z: -28 },
      { x: 174, z: -31 },
    ],
  },
  {
    kind: 'spiral',
    points: [
      { x: 168, z: -31 },
      { x: 177, z: -31 },
      { x: 177, z: -22 },
      { x: 168, z: -22 },
      { x: 168, z: -27 },
      { x: 173, z: -27 },
      { x: 173, z: -24 },
      { x: 168, z: -31 },
    ],
  },
  {
    kind: 'double-triangle',
    points: [
      { x: 172, z: -27 },
      { x: 166, z: -31 },
      { x: 166, z: -23 },
      { x: 172, z: -27 },
      { x: 178, z: -23 },
      { x: 178, z: -31 },
      { x: 172, z: -27 },
    ],
  },
];

/** A dry, gently sloped clearing. No terrain stamps or calm pads are added. */
export const WORLD_QUEST_CALLIGRAPHY_QUEST: WorldQuestDef = {
  id: WORLD_QUEST_CALLIGRAPHY_ID,
  zoneId: 'eastbrook_vale',
  minLevel: 10,
  area: { x: 172, z: -28, radius: 24 },
  objective: {
    type: 'tracing',
    instructorNpcId: 'calligraphy_instructor',
    advancedShapes: WORLD_QUEST_CALLIGRAPHY_ADVANCED,
    shapes: [
      {
        kind: 'triangle',
        points: [
          { x: 166, z: -31 },
          { x: 178, z: -31 },
          { x: 172, z: -20.6076951546 },
          { x: 166, z: -31 },
        ],
      },
      {
        kind: 'square',
        points: [
          { x: 168, z: -31 },
          { x: 176, z: -31 },
          { x: 176, z: -23 },
          { x: 168, z: -23 },
          { x: 168, z: -31 },
        ],
      },
      WORLD_QUEST_CALLIGRAPHY_ADVANCED[0],
    ],
  },
  count: 3,
  reward: { type: 'xp', rate: 0.12 },
};

/** Session-spawned teachers leave the legacy roster and terrain unchanged. */
export const WORLD_QUEST_CALLIGRAPHY_NPCS: Record<string, NpcDef> = {
  calligraphy_instructor: {
    id: 'calligraphy_instructor',
    name: 'Instructor Elian',
    title: 'Arcane Calligraphy',
    pos: { x: 172, z: -35 },
    facing: 0,
    color: 0x9475c4,
    questIds: [],
    dynamic: true,
    greeting:
      'A steady step makes a steady line. Teach my apprentices a triangle, a square, and an advanced rune.',
  },
  calligraphy_apprentice_1: {
    id: 'calligraphy_apprentice_1',
    name: 'Apprentice Tessa',
    title: 'Student of Calligraphy',
    pos: { x: 168, z: -35.5 },
    facing: 0,
    color: 0x79a6bd,
    questIds: [],
    dynamic: true,
    greeting: 'I keep turning too soon. Will you show me where the corners belong?',
  },
  calligraphy_apprentice_2: {
    id: 'calligraphy_apprentice_2',
    name: 'Apprentice Pip',
    title: 'Student of Calligraphy',
    pos: { x: 175, z: -35.5 },
    facing: 0,
    color: 0xb5a064,
    questIds: [],
    dynamic: true,
    greeting: 'A triangle first, then a square, then a rune. One steady step at a time!',
  },
};

/** Reserved below the stable ground-object band; never consumes nextId. */
export const WORLD_QUEST_CALLIGRAPHY_NPC_IDS: Readonly<Record<string, number>> = {
  calligraphy_instructor: 2_146_800_001,
  calligraphy_apprentice_1: 2_146_800_002,
  calligraphy_apprentice_2: 2_146_800_003,
};
