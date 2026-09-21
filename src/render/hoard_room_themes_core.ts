// The Buried Hoard BOSS ROOM THEMES: data. One record per boss that has a room of
// its own: its palette (which REPLACES the dig site's biome colours, so the Abyssal
// Maw never fights on a sunny beach), its Blender kit, its hero piece, the clusters
// its walls are dressed with, its floor marks, and the little that moves. The
// engine that reads these is hoard_room_kit_core.ts; the painter hoard_room_kit.ts.
//
// Rules every theme keeps (docs/design/boss-rooms/README.md):
//  - tall things stand against walls, the hero piece against the end wall, and the
//    fight's floor carries only flat, dark or dim marks;
//  - no floor tone may use the colour language of that boss's own telegraphs;
//  - nothing decorative may look like something the fight asks a player to read,
//    stand behind, or attack.

import type { BossRoomTheme, RoomKitCluster } from './hoard_room_kit_core';

const face = { yaw: 'face' } as const;

// ------------------------------------------------------------ Emberforge Tyrant
const FORGE_APRON = [0, 1].flatMap((row) =>
  [-2, -1, 0, 1, 2].map((column) => ({
    shape: 'quad' as const,
    tone: (row + column) % 2 ? 'plate' : 'plateAlt',
    depth: 10.4 + row * 4.4,
    along: column * 5.3 + (row ? 1.1 : -0.6),
    halfLength: 2.0,
    halfWidth: 2.45,
  })),
);

const FORGE_PLATES = [
  { shape: 'quad', tone: 'plate', depth: 3.6, along: -1.8, halfLength: 1.5, halfWidth: 1.7 },
  { shape: 'quad', tone: 'plateAlt', depth: 6.7, along: 2.2, halfLength: 1.5, halfWidth: 1.7 },
] as const;

const FORGE_CLUSTERS: readonly RoomKitCluster[] = [
  {
    name: 'smelter',
    puts: [
      {
        piece: 'Crucible',
        category: 'large',
        depth: 3.4,
        along: 0,
        ...face,
        yawJitter: 0.25,
        scale: 1.05,
      },
      { piece: 'Anvil', category: 'medium', depth: 6.4, along: 5.4, yaw: 'side', yawJitter: 0.55 },
      {
        piece: 'IngotStack',
        category: 'medium',
        depth: 2.8,
        along: -5.2,
        ...face,
        yawJitter: 0.7,
        scale: 0.95,
      },
      { piece: 'ChainHook', category: 'filler', depth: 1.3, along: 0.4, ...face, y: 10.5 },
    ],
    floor: [
      {
        shape: 'fan',
        tone: 'fire',
        depth: 3.4,
        along: 0,
        halfLength: 1,
        halfWidth: 0.34,
        radius: 6.5,
      },
      {
        shape: 'quad',
        tone: 'channel',
        depth: 1.9,
        along: 0,
        halfLength: 1.5,
        halfWidth: 0.35,
        yaw: 'side',
      },
      ...FORGE_PLATES,
    ],
  },
  {
    name: 'bellows',
    puts: [
      { piece: 'Vent', category: 'large', depth: 2.4, along: 0, ...face, scale: 1.1 },
      { piece: 'ForgePost', category: 'medium', depth: 4.6, along: -4.6, ...face, yawJitter: 1.5 },
      { piece: 'ForgePost', category: 'medium', depth: 4.6, along: 4.6, ...face, yawJitter: 1.5 },
      {
        piece: 'IngotStack',
        category: 'filler',
        depth: 3.0,
        along: 8.2,
        ...face,
        yawJitter: 0.8,
        scale: 0.8,
        mirror: true,
      },
    ],
    floor: FORGE_PLATES,
  },
  {
    name: 'braced',
    puts: [
      { piece: 'IronBrace', category: 'large', depth: 0.9, along: -3.6, ...face },
      {
        piece: 'IronBrace',
        category: 'large',
        depth: 0.9,
        along: 3.6,
        ...face,
        scale: 0.94,
        mirror: true,
      },
      {
        piece: 'ChainHook',
        category: 'filler',
        depth: 1.5,
        along: 0,
        ...face,
        scale: 1.15,
        y: 9.2,
      },
      {
        piece: 'Anvil',
        category: 'medium',
        depth: 5.6,
        along: 0.6,
        yaw: 'side',
        yawJitter: 0.6,
        scale: 1.1,
        mirror: true,
      },
    ],
    floor: FORGE_PLATES,
  },
  {
    name: 'stockpile',
    puts: [
      {
        piece: 'IngotStack',
        category: 'medium',
        depth: 3.0,
        along: -2.6,
        ...face,
        yawJitter: 0.6,
        scale: 1.15,
      },
      {
        piece: 'IngotStack',
        category: 'medium',
        depth: 5.4,
        along: 2.9,
        ...face,
        yawJitter: 1.1,
        scale: 0.85,
        mirror: true,
      },
      {
        piece: 'ForgePost',
        category: 'medium',
        depth: 2.2,
        along: 5.8,
        ...face,
        yawJitter: 1.5,
        scale: 1.1,
      },
      {
        piece: 'ChainHook',
        category: 'filler',
        depth: 1.4,
        along: -5.5,
        ...face,
        scale: 0.95,
        y: 9.8,
      },
    ],
    floor: FORGE_PLATES,
  },
];

export const EMBERFORGE_THEME: BossRoomTheme = {
  id: 'forge',
  boss: 'rift_boss_ember',
  palette: {
    fogColor: 0x6c4b42,
    fogNear: 74,
    fogFar: 205,
    ground: 0x342f2d,
    groundLight: 0x554239,
    cliff: 0x292729,
    cliffLight: 0x57433d,
    trunk: 0x241b18,
    accent: 0xd65b31,
  },
  kitUrl: '/models/props/hoard_forge_kit.glb',
  pieces: [
    'GreatForge',
    'Anvil',
    'Crucible',
    'IngotStack',
    'Vent',
    'ForgePost',
    'ChainHook',
    'IronBrace',
  ],
  hero: {
    piece: 'GreatForge',
    inset: 3.6,
    scale: 0.94,
    flank: [
      { piece: 'IronBrace', category: 'large', dx: 19.5, inset: 0.6, scale: 1.05 },
      { piece: 'ChainHook', category: 'filler', dx: 15.2, inset: 1.4, scale: 1.1, y: 11.5 },
      { piece: 'Vent', category: 'large', dx: 25.5, inset: 2.6, scale: 0.95 },
    ],
    floor: [
      { shape: 'fan', tone: 'fire', depth: 9, along: 0, halfLength: 1, halfWidth: 0.5, radius: 17 },
      ...FORGE_APRON,
    ],
  },
  clusters: FORGE_CLUSTERS,
  clusterSpacing: 23,
  clusterSkip: 0.28,
  tones: {
    plate: { color: 0x262223, lift: 0.03 },
    plateAlt: { color: 0x2e2927, lift: 0.03 },
    channelEdge: { color: 0x181516, lift: 0.04 },
    /** Dim beside the hammer's fire: decoration never out-glows a telegraph. */
    channel: { color: 0xb6501d, lift: 0.05, lit: true },
    ring: { color: 0x1c1919, lift: 0.035 },
    fire: { color: 0xff6a1e, lift: 0.06, lit: true },
  },
  floor: {
    rings: [
      [3.2, 0.22, 'ring'],
      [4.1, 0.12, 'ring'],
    ],
    wallRuns: [
      [1.7, 0.72, 'channelEdge'],
      [1.7, 0.32, 'channel'],
    ],
  },
  ambient: {
    pulse: [0.82, 1.06, 1.3],
    sway: ['ChainHook'],
    particles: {
      color: 0xffa64a,
      count: 56,
      size: 0.22,
      mode: 'rise',
      emitters: { GreatForge: [5, 4], Crucible: [3.3, 1.1] },
    },
  },
};

export const BOSS_ROOM_THEMES: readonly BossRoomTheme[] = [EMBERFORGE_THEME];

/** The room theme of a hoard floor's boss, or null for a boss with no room of its own. */
export function bossRoomThemeFor(bossTemplateId: string | undefined): BossRoomTheme | null {
  if (!bossTemplateId) return null;
  return BOSS_ROOM_THEMES.find((theme) => theme.boss === bossTemplateId) ?? null;
}
