// Content merge layer. Actual game content lives in sim/content/* — one
// module per zone plus classes (abilities), shared items, and dungeons —
// so content can grow without everything colliding in one file. This module
// merges those records into the flat tables the rest of the engine consumes,
// and owns the world-layout constants.

import { BASE_ITEMS, FISHING_RARE_ID, FISHING_TABLES } from './content/items';
import type {
  CampDef,
  DelveDef,
  DelveModuleDef,
  DungeonDef,
  GroundObjectDef,
  ItemDef,
  MobTemplate,
  NpcDef,
  PlayerClass,
  PortalDef,
  QuestDef,
  QuestState,
  ZoneDef,
  ZonePropsDef,
} from './types';

export type { FishingEntry } from './content/items';
export { FISHING_RARE_ID, FISHING_TABLES };

import {
  AMBERFALL_CAMPS,
  AMBERFALL_ITEMS,
  AMBERFALL_MOBS,
  AMBERFALL_NPCS,
  AMBERFALL_OBJECTS,
  AMBERFALL_PORTALS,
  AMBERFALL_PROPS,
  AMBERFALL_QUEST_ORDER,
  AMBERFALL_QUESTS,
  AMBERFALL_ROADS,
  AMBERFALL_ZONE,
} from './content/amberfall';
import {
  BROTHER_HALVEN,
  COLLAPSED_RELIQUARY_DELVE,
  COLLAPSED_RELIQUARY_MODULES,
  DELVE_MOBS,
} from './content/delves';
import {
  DRAKELANDS_CAMPS,
  DRAKELANDS_ITEMS,
  DRAKELANDS_MOBS,
  DRAKELANDS_NPCS,
  DRAKELANDS_OBJECTS,
  DRAKELANDS_PROPS,
  DRAKELANDS_QUEST_ORDER,
  DRAKELANDS_QUESTS,
  DRAKELANDS_ROADS,
  DRAKELANDS_ZONE,
} from './content/drakelands';
import { DUNGEON_DEFS, DUNGEON_MOBS } from './content/dungeons';
import {
  EVERGARDEN_CAMPS,
  EVERGARDEN_ITEMS,
  EVERGARDEN_MOBS,
  EVERGARDEN_NPCS,
  EVERGARDEN_OBJECTS,
  EVERGARDEN_PORTALS,
  EVERGARDEN_PROPS,
  EVERGARDEN_QUEST_ORDER,
  EVERGARDEN_QUESTS,
  EVERGARDEN_ROADS,
  EVERGARDEN_ZONE,
} from './content/evergarden';
import {
  FROSTVEIL_CAMPS,
  FROSTVEIL_ITEMS,
  FROSTVEIL_MOBS,
  FROSTVEIL_NPCS,
  FROSTVEIL_OBJECTS,
  FROSTVEIL_PORTALS,
  FROSTVEIL_PROPS,
  FROSTVEIL_QUEST_ORDER,
  FROSTVEIL_QUESTS,
  FROSTVEIL_ROADS,
  FROSTVEIL_ZONE,
} from './content/frostveil';
import {
  GALECREST_CAMPS,
  GALECREST_ITEMS,
  GALECREST_MOBS,
  GALECREST_NPCS,
  GALECREST_OBJECTS,
  GALECREST_PORTALS,
  GALECREST_PROPS,
  GALECREST_QUEST_ORDER,
  GALECREST_QUESTS,
  GALECREST_ROADS,
  GALECREST_ZONE,
} from './content/galecrest';
import { GROUND_PICKUP_LINES } from './content/ground_pickup_lines';
import {
  NIGHTBLOOM_CAMPS,
  NIGHTBLOOM_ITEMS,
  NIGHTBLOOM_MOBS,
  NIGHTBLOOM_NPCS,
  NIGHTBLOOM_OBJECTS,
  NIGHTBLOOM_PORTALS,
  NIGHTBLOOM_PROPS,
  NIGHTBLOOM_QUEST_ORDER,
  NIGHTBLOOM_QUESTS,
  NIGHTBLOOM_ROADS,
  NIGHTBLOOM_ZONE,
} from './content/nightbloom';
import {
  PALMREACH_CAMPS,
  PALMREACH_ITEMS,
  PALMREACH_MOBS,
  PALMREACH_NPCS,
  PALMREACH_OBJECTS,
  PALMREACH_PORTALS,
  PALMREACH_PROPS,
  PALMREACH_QUEST_ORDER,
  PALMREACH_QUESTS,
  PALMREACH_ROADS,
  PALMREACH_ZONE,
} from './content/palmreach';
import {
  REALM_CAMPS,
  REALM_ITEMS,
  REALM_MOBS,
  REALM_NPCS,
  REALM_OBJECTS,
  REALM_PORTALS,
  REALM_PROPS,
  REALM_QUEST_ORDER,
  REALM_QUESTS,
  REALM_ROADS,
  REALM_ZONE,
} from './content/realm';
import {
  TEMPLE_CAMPS,
  TEMPLE_DUNGEON_DEFS,
  TEMPLE_DUNGEON_MOBS,
  TEMPLE_ITEMS,
  TEMPLE_MOBS,
  TEMPLE_NPCS,
  TEMPLE_OBJECTS,
  TEMPLE_PROPS,
  TEMPLE_QUEST_ORDER,
  TEMPLE_QUESTS,
} from './content/temple';
import { WARLOCK_PET_MOBS } from './content/warlock_pets';
import {
  WILLOWFEN_CAMPS,
  WILLOWFEN_ITEMS,
  WILLOWFEN_MOBS,
  WILLOWFEN_NPCS,
  WILLOWFEN_OBJECTS,
  WILLOWFEN_PORTALS,
  WILLOWFEN_PROPS,
  WILLOWFEN_QUEST_ORDER,
  WILLOWFEN_QUESTS,
  WILLOWFEN_ROADS,
  WILLOWFEN_ZONE,
} from './content/willowfen';
import {
  WRAITHWOOD_CAMPS,
  WRAITHWOOD_ITEMS,
  WRAITHWOOD_MOBS,
  WRAITHWOOD_NPCS,
  WRAITHWOOD_OBJECTS,
  WRAITHWOOD_PORTALS,
  WRAITHWOOD_PROPS,
  WRAITHWOOD_QUEST_ORDER,
  WRAITHWOOD_QUESTS,
  WRAITHWOOD_ROADS,
  WRAITHWOOD_ZONE,
} from './content/wraithwood';
import {
  GRAVEYARD_POS,
  LAKE,
  TOWN_RADIUS,
  ZONE1_CAMPS,
  ZONE1_CHAPEL_CAMPS,
  ZONE1_MOBS,
  ZONE1_NPCS,
  ZONE1_OBJECTS,
  ZONE1_PROPS,
  ZONE1_QUEST_ORDER,
  ZONE1_QUESTS,
  ZONE1_ROADS,
  ZONE1_ZONE,
} from './content/zone1';
import {
  DEEPFEN_SHALLOWS_LAKE,
  ZONE2_CAMPS,
  ZONE2_ITEMS,
  ZONE2_MOBS,
  ZONE2_NPCS,
  ZONE2_OBJECTS,
  ZONE2_PROPS,
  ZONE2_QUEST_ORDER,
  ZONE2_QUESTS,
  ZONE2_ROADS,
  ZONE2_ZONE,
} from './content/zone2';
import {
  ZONE3_CAMPS,
  ZONE3_ITEMS,
  ZONE3_MOBS,
  ZONE3_NPCS,
  ZONE3_OBJECTS,
  ZONE3_PROPS,
  ZONE3_QUEST_ORDER,
  ZONE3_QUESTS,
  ZONE3_ROADS,
  ZONE3_ZONE,
} from './content/zone3';
import { DUNGEON_WALL_HW } from './dungeon_layout';

export type { DelveShopEntry, DelveShopGate, DelveShopOffer } from './content/delves';
// Delve affix/companion catalogs are consumed by the Sim delve engine; re-export
// them here so sim.ts imports the whole delve data surface from one module.
export {
  COMPANION_UPGRADE_COSTS,
  DELVE_AFFIXES,
  DELVE_COMPANIONS,
  DELVE_SHOPS,
  delveShopGateUnlocked,
  resolveDelveShopOffers,
} from './content/delves';

import { DELVE_ITEMS } from './content/delves/items';
import { DELVE_MODULE_LAYOUTS, type DelveModuleId, delveModuleSpan } from './delve_layout';

function mergeItems(...parts: Record<string, ItemDef>[]): Record<string, ItemDef> {
  const merged = Object.assign({}, ...parts);
  for (const [id, lines] of Object.entries(GROUND_PICKUP_LINES)) {
    if (merged[id]) {
      merged[id] = { ...merged[id], pickupDeny: lines.deny, pickupEnough: lines.enough };
    }
  }
  return merged;
}

export type { ClassDef } from './content/classes';
export { ABILITIES, abilitiesKnownAt, CLASSES } from './content/classes';
// Re-export content shapes so existing `from './data'` imports keep working.
export type {
  BiomeId,
  CampDef,
  DelveDef,
  DungeonDef,
  DungeonSpawn,
  GroundObjectDef,
  NpcDef,
  ZoneDef,
  ZonePropsDef,
} from './types';

// ---------------------------------------------------------------------------
// Merged content tables
// ---------------------------------------------------------------------------

export const ITEMS: Record<string, ItemDef> = mergeItems(
  BASE_ITEMS,
  ZONE2_ITEMS,
  ZONE3_ITEMS,
  TEMPLE_ITEMS,
  DELVE_ITEMS,
  REALM_ITEMS,
  DRAKELANDS_ITEMS,
  FROSTVEIL_ITEMS,
  AMBERFALL_ITEMS,
  WILLOWFEN_ITEMS,
  NIGHTBLOOM_ITEMS,
  WRAITHWOOD_ITEMS,
  PALMREACH_ITEMS,
  EVERGARDEN_ITEMS,
  GALECREST_ITEMS,
);

export type { AggregatedSetEffect } from './content/item_sets';
export { aggregateSetBonuses, ITEM_SETS } from './content/item_sets';

export const MOBS: Record<string, MobTemplate> = {
  ...ZONE1_MOBS,
  ...ZONE2_MOBS,
  ...ZONE3_MOBS,
  ...DUNGEON_MOBS,
  ...WARLOCK_PET_MOBS,
  ...TEMPLE_MOBS,
  ...TEMPLE_DUNGEON_MOBS,
  ...DELVE_MOBS,
  ...REALM_MOBS,
  ...DRAKELANDS_MOBS,
  ...FROSTVEIL_MOBS,
  ...AMBERFALL_MOBS,
  ...WILLOWFEN_MOBS,
  ...NIGHTBLOOM_MOBS,
  ...WRAITHWOOD_MOBS,
  ...PALMREACH_MOBS,
  ...EVERGARDEN_MOBS,
  ...GALECREST_MOBS,
};

// Realm NPCs are appended after brother_halven: NPCs spawn in insertion order
// before camps, so existing entity ids stay stable (determinism).
export const NPCS: Record<string, NpcDef> = {
  ...ZONE1_NPCS,
  ...ZONE2_NPCS,
  ...ZONE3_NPCS,
  ...TEMPLE_NPCS,
  brother_halven: BROTHER_HALVEN,
  ...REALM_NPCS,
  ...DRAKELANDS_NPCS,
  ...FROSTVEIL_NPCS,
  ...AMBERFALL_NPCS,
  ...WILLOWFEN_NPCS,
  ...NIGHTBLOOM_NPCS,
  ...WRAITHWOOD_NPCS,
  ...PALMREACH_NPCS,
  ...EVERGARDEN_NPCS,
  ...GALECREST_NPCS,
};

export const QUESTS: Record<string, QuestDef> = {
  ...ZONE1_QUESTS,
  ...ZONE2_QUESTS,
  ...ZONE3_QUESTS,
  ...TEMPLE_QUESTS,
  ...REALM_QUESTS,
  ...DRAKELANDS_QUESTS,
  ...FROSTVEIL_QUESTS,
  ...AMBERFALL_QUESTS,
  ...WILLOWFEN_QUESTS,
  ...NIGHTBLOOM_QUESTS,
  ...WRAITHWOOD_QUESTS,
  ...PALMREACH_QUESTS,
  ...EVERGARDEN_QUESTS,
  ...GALECREST_QUESTS,
};

export const QUEST_ORDER: string[] = [
  ...ZONE1_QUEST_ORDER,
  ...ZONE2_QUEST_ORDER,
  ...ZONE3_QUEST_ORDER,
  ...TEMPLE_QUEST_ORDER,
  ...REALM_QUEST_ORDER,
  ...DRAKELANDS_QUEST_ORDER,
  ...FROSTVEIL_QUEST_ORDER,
  ...AMBERFALL_QUEST_ORDER,
  ...WILLOWFEN_QUEST_ORDER,
  ...NIGHTBLOOM_QUEST_ORDER,
  ...WRAITHWOOD_QUEST_ORDER,
  ...PALMREACH_QUEST_ORDER,
  ...EVERGARDEN_QUEST_ORDER,
  ...GALECREST_QUEST_ORDER,
];

// Camps spawn in array order, each drawing world-gen RNG, so an entry inserted
// before others shifts their spawn positions. New rare-elite camps
// (ZONE1_CHAPEL_CAMPS) and the Eastbrook rare Grix are appended LAST so every
// existing zone camp keeps its exact draw order (determinism).
export const CAMPS: CampDef[] = [
  ...ZONE1_CAMPS,
  ...ZONE2_CAMPS,
  ...ZONE3_CAMPS,
  ...TEMPLE_CAMPS,
  ...ZONE1_CHAPEL_CAMPS,
  { mobId: 'grix_the_tunnelking', center: { x: -95, z: -78 }, radius: 4, count: 1 },
  // Veiled Hollow camps stay LAST for the same draw-order reason; the two
  // northern realms append after it in registration order.
  ...REALM_CAMPS,
  ...DRAKELANDS_CAMPS,
  ...FROSTVEIL_CAMPS,
  ...AMBERFALL_CAMPS,
  ...WILLOWFEN_CAMPS,
  ...NIGHTBLOOM_CAMPS,
  ...WRAITHWOOD_CAMPS,
  ...PALMREACH_CAMPS,
  ...EVERGARDEN_CAMPS,
  ...GALECREST_CAMPS,
];

export const GROUND_OBJECTS: GroundObjectDef[] = [
  ...ZONE1_OBJECTS,
  ...ZONE2_OBJECTS,
  ...ZONE3_OBJECTS,
  ...TEMPLE_OBJECTS,
  ...REALM_OBJECTS,
  ...DRAKELANDS_OBJECTS,
  ...FROSTVEIL_OBJECTS,
  ...AMBERFALL_OBJECTS,
  ...WILLOWFEN_OBJECTS,
  ...NIGHTBLOOM_OBJECTS,
  ...WRAITHWOOD_OBJECTS,
  ...PALMREACH_OBJECTS,
  ...EVERGARDEN_OBJECTS,
  ...GALECREST_OBJECTS,
];

export const ROADS: { x: number; z: number }[][] = [
  ...ZONE1_ROADS,
  ...ZONE2_ROADS,
  ...ZONE3_ROADS,
  ...REALM_ROADS,
  ...DRAKELANDS_ROADS,
  ...FROSTVEIL_ROADS,
  ...AMBERFALL_ROADS,
  ...WILLOWFEN_ROADS,
  ...NIGHTBLOOM_ROADS,
  ...WRAITHWOOD_ROADS,
  ...PALMREACH_ROADS,
  ...EVERGARDEN_ROADS,
  ...GALECREST_ROADS,
];

// Paired overworld portals (src/sim/portals.ts checks these each tick).
export const PORTALS: PortalDef[] = [
  ...REALM_PORTALS,
  ...FROSTVEIL_PORTALS,
  ...AMBERFALL_PORTALS,
  ...WILLOWFEN_PORTALS,
  ...NIGHTBLOOM_PORTALS,
  ...WRAITHWOOD_PORTALS,
  ...PALMREACH_PORTALS,
  ...EVERGARDEN_PORTALS,
  ...GALECREST_PORTALS,
];

export const PROPS: ZonePropsDef = mergeProps([
  ZONE1_PROPS,
  ZONE2_PROPS,
  ZONE3_PROPS,
  TEMPLE_PROPS,
  REALM_PROPS,
  DRAKELANDS_PROPS,
  FROSTVEIL_PROPS,
  AMBERFALL_PROPS,
  WILLOWFEN_PROPS,
  NIGHTBLOOM_PROPS,
  WRAITHWOOD_PROPS,
  PALMREACH_PROPS,
  EVERGARDEN_PROPS,
  GALECREST_PROPS,
]);

function mergeProps(sets: ZonePropsDef[]): ZonePropsDef {
  return {
    buildings: sets.flatMap((s) => s.buildings),
    wells: sets.flatMap((s) => s.wells),
    stalls: sets.flatMap((s) => s.stalls),
    mines: sets.flatMap((s) => s.mines),
    docks: sets.flatMap((s) => s.docks),
    tents: sets.flatMap((s) => s.tents),
    crates: sets.flatMap((s) => s.crates),
    campfires: sets.flatMap((s) => s.campfires),
    mudHuts: sets.flatMap((s) => s.mudHuts),
    ruinRings: sets.flatMap((s) => s.ruinRings),
    fences: sets.flatMap((s) => s.fences),
    graveyards: sets.flatMap((s) => s.graveyards),
    // optional per-zone field, was being dropped here, so the delve entrance
    // marker (name slab + arch) never reached the renderer (props.ts)
    delveMarkers: sets.flatMap((s) => s.delveMarkers ?? []),
    greatTrees: sets.flatMap((s) => s.greatTrees ?? []),
  };
}

// Quest reward fallback by archetype: classes without an explicit entry use these.
export const REWARD_ARCHETYPE: Record<PlayerClass, PlayerClass> = {
  warrior: 'warrior',
  paladin: 'warrior',
  shaman: 'warrior',
  rogue: 'rogue',
  hunter: 'rogue',
  mage: 'mage',
  priest: 'mage',
  warlock: 'mage',
  druid: 'mage',
};

// Resolve the item a quest awards a given class: a class-specific reward if the
// quest lists one, else the reward for the class's archetype (rewards are
// authored per archetype — warrior/rogue/mage). The dialog preview and the
// turn-in grant MUST both call this so what the player is shown matches what
// they receive. Returns undefined when the quest has no item reward.
export function questRewardItem(quest: QuestDef, cls: PlayerClass): string | undefined {
  return quest.itemRewards[cls] ?? quest.itemRewards[REWARD_ARCHETYPE[cls]];
}

export const questRewardItemId = questRewardItem;

// Vanilla group XP multipliers by party size (1-5).
export const GROUP_XP_BONUS = [1, 1, 1.166, 1.3, 1.43];

// ---------------------------------------------------------------------------
// Zones. The world is a north-running strip of zone bands: x in
// [-WORLD_SIZE/2, WORLD_SIZE/2], z from WORLD_MIN_Z through the last zone's
// zMax. Each zone owns a hub settlement (terrain flattens there), a
// graveyard, its lakes, and a biome palette the renderer keys off.
// ---------------------------------------------------------------------------

export const ZONES: ZoneDef[] = [
  ZONE1_ZONE,
  ZONE2_ZONE,
  ZONE3_ZONE,
  REALM_ZONE,
  DRAKELANDS_ZONE,
  FROSTVEIL_ZONE,
  AMBERFALL_ZONE,
  WILLOWFEN_ZONE,
  NIGHTBLOOM_ZONE,
  WRAITHWOOD_ZONE,
  PALMREACH_ZONE,
  EVERGARDEN_ZONE,
  GALECREST_ZONE,
];

export const WORLD_SIZE = 360; // the original strip's width (one grid column)
// A zone without an explicit x-range spans the original strip column.
export const STRIP_MIN_X = -WORLD_SIZE / 2;
export const STRIP_MAX_X = WORLD_SIZE / 2;
// World bounds are the bounding box of all zone rects: today exactly the
// strip, and they grow automatically when a column is added east or west.
export const WORLD_MIN_X = Math.min(...ZONES.map((zn) => zn.xMin ?? STRIP_MIN_X));
export const WORLD_MAX_X = Math.max(...ZONES.map((zn) => zn.xMax ?? STRIP_MAX_X));
// Like the x bounds: derived over ALL zone rects, not the array ends. A
// column zone appends LAST for rng-stream stability regardless of where its
// band sits, so "first/last entry" stopped meaning "south/north end" the
// moment the world grew its second column.
export const WORLD_MIN_Z = Math.min(...ZONES.map((zn) => zn.zMin));
export const WORLD_MAX_Z = Math.max(...ZONES.map((zn) => zn.zMax));

export const PLAYER_START = { x: 2, z: -2 };

// Zone containing a world position (overworld only; clamps to the world
// edges). Zones are rectangles: z picks the band (stacked south to north,
// as always) and x picks the column within it. Every zone without an
// explicit x-range spans the original full-width strip, so a one-column
// world behaves exactly as before.
// The world's northmost zone, for clamping beyond the north end (append
// order stopped meaning stack order when the first column landed).
const NORTHMOST_ZONE: ZoneDef = ZONES.reduce((a, b) => (b.zMax > a.zMax ? b : a));

export function zoneAt(x: number, z: number): ZoneDef {
  let fallback: ZoneDef | null = null;
  for (const zone of ZONES) {
    if (z >= zone.zMax) continue;
    if (fallback === null || zone.zMax < fallback.zMax) fallback = zone; // southmost band containing z
    const x0 = zone.xMin ?? STRIP_MIN_X;
    const x1 = zone.xMax ?? STRIP_MAX_X;
    if (z >= zone.zMin && x >= x0 && x < x1) return zone;
  }
  return fallback ?? NORTHMOST_ZONE;
}

// The original strip column and the east/west columns beside it. Sequential
// band cascades (terrain shape, palettes, the sky crossfade) walk
// STRIP_ZONES in stack order exactly as they always did; COLUMN_ZONES blend
// in sideways via columnBlendAt. With no columns registered both are inert
// and the world is byte-identical to the strip era.
export const STRIP_ZONES: readonly ZoneDef[] = ZONES.filter(
  (zn) => (zn.xMin ?? STRIP_MIN_X) <= STRIP_MIN_X,
);
export const COLUMN_ZONES: readonly ZoneDef[] = ZONES.filter(
  (zn) => (zn.xMin ?? STRIP_MIN_X) > STRIP_MIN_X,
);

function sm01(raw: number): number {
  const t = Math.max(0, Math.min(1, raw));
  return t * t * (3 - 2 * t);
}

// Blend weight of a column zone at a position: 1 deep inside its rect,
// easing to 0 across the same -30/+35yd window the band cascades use, so a
// column's palette/shape/sky arrives at exactly the rate a band's does.
export function columnBlendAt(zone: ZoneDef, x: number, z: number): number {
  const x0 = zone.xMin ?? STRIP_MIN_X;
  const x1 = zone.xMax ?? STRIP_MAX_X;
  const xT =
    x0 >= STRIP_MAX_X
      ? sm01((x - (x0 - 30)) / 65) // an east column, entered moving +x
      : 1 - sm01((x - (x1 - 35)) / 65); // a west column, entered moving -x
  const zT = sm01((z - (zone.zMin - 30)) / 65) * (1 - sm01((z - (zone.zMax - 30)) / 65));
  return xT * zT;
}

// East-west extent of the world at a given z: the union of the zone rects
// in that row. One column today (the original strip everywhere); a column
// added east or west widens its own rows and nothing else. Beyond the world
// ends this clamps to the nearest band, like zoneAt.
export function worldXBoundsAt(z: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const zone of ZONES) {
    if (z < zone.zMin || z >= zone.zMax) continue;
    min = Math.min(min, zone.xMin ?? STRIP_MIN_X);
    max = Math.max(max, zone.xMax ?? STRIP_MAX_X);
  }
  if (min > max) {
    const band = zoneAt(0, z);
    for (const zone of ZONES) {
      if (zone.zMin !== band.zMin || zone.zMax !== band.zMax) continue;
      min = Math.min(min, zone.xMin ?? STRIP_MIN_X);
      max = Math.max(max, zone.xMax ?? STRIP_MAX_X);
    }
  }
  return { min, max };
}

export function zoneWelcomeText(
  zone: ZoneDef,
  questState: (questId: string) => QuestState,
): string | null {
  if (zone.welcomeQuestId && questState(zone.welcomeQuestId) !== 'available') return null;
  return zone.welcome;
}

// Legacy single-zone exports (zone 1) — still referenced by tests and the
// starter-town logic.
export { DEEPFEN_SHALLOWS_LAKE, GRAVEYARD_POS, LAKE, TOWN_RADIUS };
export const ZONE_NAME = ZONE1_ZONE.name;

// ---------------------------------------------------------------------------
// Dungeons — private party instances at far-off flat origins (see
// world.groundHeight). Each dungeon gets its own x-band of instance origins;
// slots stack along z.
// ---------------------------------------------------------------------------

// Concurrent copies a single dungeon can host. Each slot is a cheap, empty
// InstanceSlot (no entities, no rng) pre-allocated in the Sim ctor and only
// populated when a party claims it, so a generous ceiling costs little memory
// and lets a busy realm keep many leveling groups in the same dungeon at once.
export const INSTANCE_SLOT_COUNT = 24;
// The whole instance coordinate plane (dungeons, the arena, delves) lives
// far east of any possible world land. It was based at x 600 when the world
// was a single strip; the world-grid work (stage 2) moved it out so columns
// of real zones can grow east without standing inside an instance band. The
// relative layout below is unchanged: everything shifted by the same base.
export const INSTANCE_X_BASE = 99_400;
export const DUNGEON_X_THRESHOLD = INSTANCE_X_BASE + 600; // x beyond this = inside an instance
export const DUNGEON_FLOOR_Y = 0;

export function instanceOrigin(dungeonIndex: number, slot: number): { x: number; z: number } {
  return { x: INSTANCE_X_BASE + 900 + dungeonIndex * 600, z: -1250 + slot * 500 };
}

export const DUNGEONS: Record<string, DungeonDef> = { ...DUNGEON_DEFS, ...TEMPLE_DUNGEON_DEFS };

export const DUNGEON_LIST: DungeonDef[] = Object.values(DUNGEONS).sort((a, b) => a.index - b.index);

export function dungeonByIndex(index: number): DungeonDef | null {
  return DUNGEON_LIST.find((d) => d.index === index) ?? null;
}

// Which dungeon a far-off instance position belongs to, by x-band.
export function dungeonAt(x: number): DungeonDef | null {
  if (x <= DUNGEON_X_THRESHOLD || x >= ARENA_X_MIN) return null;
  return dungeonByIndex(Math.round((x - (INSTANCE_X_BASE + 900)) / 600));
}

// ---------------------------------------------------------------------------
// The Ashen Coliseum — 1v1 ranked arena. Its match instances live in their own
// far-off flat-ground x-band, well past the dungeon bands (index 0/1/2 sit at
// x 900/1500/2100). Like dungeons, x beyond DUNGEON_X_THRESHOLD means flat
// ground (world.groundHeight) and instance-local collision (sim/colliders.ts);
// the band split below keeps arena positions from being read as a dungeon.
// ---------------------------------------------------------------------------

export const ARENA_X = INSTANCE_X_BASE + 4200; // arena instances share this x; slots stack along z
export const ARENA_X_MIN = ARENA_X; // x at/after this = an arena instance, not a dungeon
export const ARENA_SLOT_COUNT = 4; // concurrent 1v1 matches the world can host
const ARENA_Z0 = -1250;
const ARENA_SLOT_SPACING = 120; // > the pit footprint (~44yd) so slots never overlap

export function arenaOrigin(slot: number): { x: number; z: number } {
  return { x: ARENA_X, z: ARENA_Z0 + slot * ARENA_SLOT_SPACING };
}

export function isArenaPos(x: number): boolean {
  return x >= ARENA_X_MIN && x < DELVE_BAND_X_MIN;
}

// Nearest arena instance origin to a far-off position, matched by z-band (the
// x is shared across slots). Mirrors how the dungeon collider resolver maps a
// position back to its instance slot.
export function arenaOriginAt(z: number): { x: number; z: number; slot: number } {
  let best = 0,
    bestD = Infinity;
  for (let i = 0; i < ARENA_SLOT_COUNT; i++) {
    const d = Math.abs(z - arenaOrigin(i).z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const o = arenaOrigin(best);
  return { x: o.x, z: o.z, slot: best };
}

// Saved positions from before the instance plane moved east (stage 2 of the
// world grid) sit in the old bands at x 600..5400+. Map them to the same
// door the old load rule would have chosen, using the OLD layout frozen as
// literals: dungeons at 900+index*600 past threshold 600, the delve band
// from 4773. Anything unmapped falls back exactly like the old rule did.
export function migrateLegacyInstancePos(pos: { x: number; z: number }): {
  x: number;
  z: number;
} | null {
  if (pos.x <= 600 || pos.x >= INSTANCE_X_BASE) return null; // not a legacy instance pos
  if (pos.x >= 4773) {
    const delve = DELVE_LIST.find((d) => d.index === Math.round((pos.x - 4800) / 600));
    const door = (delve ?? DELVE_LIST[0]).doorPos;
    return { x: door.x, z: door.z - 4 };
  }
  const dungeon = dungeonByIndex(Math.round((pos.x - 900) / 600)) ?? DUNGEON_LIST[0];
  return { x: dungeon.doorPos.x, z: dungeon.doorPos.z - 4 };
}

// Legacy aliases for the Hollow Crypt (tests + scripts reference these).
export const CRYPT_DOOR_POS = DUNGEONS.hollow_crypt.doorPos;
export const CRYPT_ENTRY = DUNGEONS.hollow_crypt.entry;
export const CRYPT_EXIT_OFFSET = DUNGEONS.hollow_crypt.exitOffset;
export const CRYPT_SPAWNS = DUNGEONS.hollow_crypt.spawns;

// ---------------------------------------------------------------------------
// Delves, private party instances past the arena x-band (see docs/prd/delves.md).
// DELVE_X_MIN must stay above ARENA_X_MIN (4000) and ARENA_X (4200).
// ---------------------------------------------------------------------------

// 4800 sits clear of the v0.10.0 layout: dungeons end at ARENA_X_MIN (4000) and
// the arena pit is centred at ARENA_X (4200, ~±22u footprint). The delve band's
// west edge (DELVE_BAND_X_MIN = 4773) leaves a comfortable margin past the arena.
export const DELVE_X_MIN = INSTANCE_X_BASE + 4800;
// Each delve room is centred at DELVE_X_MIN + index*600. Delve modules use wider
// side walls than the base crypt kit: the side-wall centre is at instance-local
// |x| = DELVE_WALL_X (25, mirror of delve_layout.ts WALL_X) and the collider's
// outer face sits 1u beyond that (|x| = 26), i.e. world-x = DELVE_X_MIN - 26 =
// 4774 for slot 0. We set the band edge 1u further west again (4773) so
// isDelvePos covers the ENTIRE room footprint, including the west wall face,
// and the west half is never misclassified as arena. Still >500u clear of ARENA_X.
const DELVE_WALL_X = 25; // mirror of delve_layout.ts WALL_X (delve side-wall centre)
export const DELVE_BAND_X_MIN = DELVE_X_MIN - (DELVE_WALL_X + DUNGEON_WALL_HW + 1);
// Concurrent copies a single delve can host (mirrors INSTANCE_SLOT_COUNT).
export const DELVE_SLOT_COUNT = 24;
export const DELVE_MODULE_GAP = 16;
export const DELVE_MODULE_Z_START = 8;
const DELVE_Z0 = -1250;
const DELVE_SLOT_SPACING = 620; // covers 110u×4 rooms + 16u×3 gaps + 40u margin ≈ 536u

export function delveOrigin(delveIndex: number, slot: number): { x: number; z: number } {
  return { x: DELVE_X_MIN + delveIndex * 600, z: DELVE_Z0 + slot * DELVE_SLOT_SPACING };
}

export function isDelvePos(x: number): boolean {
  return x >= DELVE_BAND_X_MIN;
}

export function delveAt(x: number): DelveDef | null {
  if (!isDelvePos(x)) return null;
  const index = Math.round((x - DELVE_X_MIN) / 600);
  return DELVE_LIST.find((d) => d.index === index) ?? null;
}

export const DELVES: Record<string, DelveDef> = {
  [COLLAPSED_RELIQUARY_DELVE.id]: COLLAPSED_RELIQUARY_DELVE,
};
export const DELVE_LIST: DelveDef[] = Object.values(DELVES).sort((a, b) => a.index - b.index);
export const DELVE_MODULES: Record<string, DelveModuleDef> = {
  ...COLLAPSED_RELIQUARY_MODULES,
};

function delveModuleFootprint(moduleId: string): number {
  const mod = DELVE_MODULES[moduleId];
  const layoutId = (mod?.layout ?? moduleId) as DelveModuleId;
  if (DELVE_MODULE_LAYOUTS[layoutId]) return delveModuleSpan(layoutId);
  return mod?.length ?? 50;
}

/** World-z offset of a delve module within its instance slot (matches Sim). */
export function delveModuleZOffset(modules: readonly string[], moduleIndex: number): number {
  let z = DELVE_MODULE_Z_START;
  for (let i = 0; i < moduleIndex; i++) {
    z += delveModuleFootprint(modules[i]) + DELVE_MODULE_GAP;
  }
  return z;
}

/** Relative-z extent of a full module chain from the slot door (matches renderer gate). */
export function delveModuleStackEndRelZ(modules: readonly string[], margin = 40): number {
  if (modules.length === 0) return DELVE_MODULE_Z_START + 80 + margin;
  const lastId = modules[modules.length - 1];
  const layoutId = (DELVE_MODULES[lastId]?.layout ?? lastId) as DelveModuleId;
  const layout = DELVE_MODULE_LAYOUTS[layoutId];
  return delveModuleZOffset(modules, modules.length - 1) + (layout?.zMax ?? 91) + margin;
}

/** Pick the instance slot whose stacked module band contains world-z. */
export function delveSlotAt(delveIndex: number, z: number, modules: readonly string[]): number {
  const mods = modules.length > 0 ? modules : ['reliquary_sunken_ossuary'];
  const stackEnd = delveModuleStackEndRelZ(mods);
  const zMin = DELVE_MODULE_Z_START - 30;
  for (let i = 0; i < DELVE_SLOT_COUNT; i++) {
    const o = delveOrigin(delveIndex, i);
    const relZ = z - o.z;
    if (relZ >= zMin && relZ <= stackEnd) return i;
  }
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < DELVE_SLOT_COUNT; i++) {
    const o = delveOrigin(delveIndex, i);
    const d = Math.abs(z - o.z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

// Memoized: the default chain is a pure function of the static DELVES table, and
// callers (collision/camera fallback) hit it per-frame inside the delve band, so
// cache one frozen array per delve id instead of reallocating each call.
const DEFAULT_DELVE_MODULES = new Map<string, readonly string[]>();

/** Default module chain for a delve when no active run is available. */
export function defaultDelveModules(delveId: string): readonly string[] {
  const cached = DEFAULT_DELVE_MODULES.get(delveId);
  if (cached) return cached;
  const delve = DELVES[delveId];
  const chain = delve
    ? Object.freeze([
        ...delve.modules.slice(0, delve.moduleCount[0] ?? delve.modules.length),
        delve.finaleModuleId,
      ])
    : Object.freeze(['reliquary_sunken_ossuary']);
  DEFAULT_DELVE_MODULES.set(delveId, chain);
  return chain;
}

/** Map world position to the active delve module band (instance-local coords). */
export function delveModuleLocal(
  x: number,
  z: number,
  modules: readonly string[],
): {
  ox: number;
  oz: number;
  moduleIndex: number;
  moduleId: string;
  localX: number;
  localZ: number;
} {
  const delve = delveAt(x);
  const index = delve?.index ?? Math.round((x - DELVE_X_MIN) / 600);
  const mods =
    modules.length > 0
      ? modules
      : delve
        ? defaultDelveModules(delve.id)
        : ['reliquary_sunken_ossuary'];
  const slot = delveOrigin(index, delveSlotAt(index, z, mods));
  const ox = slot.x;
  const slotOz = slot.z;
  const relZ = z - slotOz;
  let zCursor = DELVE_MODULE_Z_START;
  for (let i = 0; i < mods.length; i++) {
    const len = delveModuleFootprint(mods[i]);
    if (relZ < zCursor + len || i === mods.length - 1) {
      return {
        ox,
        oz: slotOz + zCursor,
        moduleIndex: i,
        moduleId: mods[i],
        localX: x - ox,
        localZ: relZ - zCursor,
      };
    }
    zCursor += len + DELVE_MODULE_GAP;
  }
  const last = mods[mods.length - 1];
  return {
    ox,
    oz: slotOz + zCursor,
    moduleIndex: mods.length - 1,
    moduleId: last,
    localX: x - ox,
    localZ: relZ - zCursor,
  };
}
