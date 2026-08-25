import { describe, expect, it } from 'vitest';
import type { Collider } from '../src/sim/colliders';
import { IGNIVAR_MAELIN_NPC_ID, IGNIVAR_RECORD_IDS } from '../src/sim/content/ignivar_raid_lore';
import { DUNGEONS, MOBS } from '../src/sim/data';
import { INTERIOR_LAYOUTS } from '../src/sim/dungeon_floor';
import {
  type AuthoredRoom,
  type DungeonLayout,
  IGNIVAR_FORGE_APPROACH_LAYOUT,
  IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT,
  IGNIVAR_SECOND_WING_LAYOUT,
  layoutColliders,
} from '../src/sim/dungeon_layout';
import {
  IGNIVAR_APPROACH_GUARDIAN_IDS,
  IGNIVAR_CINDER_ARTIFICER_ID,
  IGNIVAR_CRUCIBLE_WARDEN_ID,
  IGNIVAR_EMBER_SENTINEL_ID,
  IGNIVAR_FORGE_APPROACH_ID,
  IGNIVAR_GATE_LOCKED_TEMPLATE,
  IGNIVAR_MOLTEN_ASSEMBLY_ID,
  IGNIVAR_RAID_ARENA_ID,
  IGNIVAR_RAID_ROOM_IDS,
  IGNIVAR_SECOND_WING_ID,
  ignivarPreviousRaidRoom,
} from '../src/sim/ignivar_raid_ids';
import { enterDungeon, updateDoorTriggers, updateInstances } from '../src/sim/instances/dungeons';
import { PLAYER_BODY_RADIUS } from '../src/sim/pathfind';
import { inAnyRoom } from '../src/sim/rift/authored';
import { Sim } from '../src/sim/sim';
import { IGNIVAR_BOSS_ID } from '../src/sim/types';

function roomIdsAt(rooms: readonly AuthoredRoom[], x: number, z: number): string[] {
  return rooms
    .filter((room) => x > room.x0 && x < room.x1 && z > room.z0 && z < room.z1)
    .map((room) => room.id);
}

function doorEdges(layout: DungeonLayout): string[] {
  const rooms = layout.rooms ?? [];
  return (layout.doors ?? [])
    .map((door) =>
      rooms
        .filter(
          (room) =>
            door.x >= room.x0 && door.x <= room.x1 && door.z >= room.z0 && door.z <= room.z1,
        )
        .map((room) => room.id)
        .sort()
        .join('<->'),
    )
    .sort();
}

function surfaceDistance(collider: Collider, x: number, z: number): number {
  if (collider.type === 'circle') {
    return Math.hypot(x - collider.x, z - collider.z) - collider.r;
  }
  const cosine = Math.cos(collider.rot);
  const sine = Math.sin(collider.rot);
  const dx = x - collider.x;
  const dz = z - collider.z;
  const localX = cosine * dx + sine * dz;
  const localZ = -sine * dx + cosine * dz;
  return Math.hypot(
    Math.max(Math.abs(localX) - collider.hw, 0),
    Math.max(Math.abs(localZ) - collider.hd, 0),
  );
}

function expectClearOfLayout(
  layout: DungeonLayout,
  point: { x: number; z: number },
  label: string,
) {
  for (const collider of layoutColliders(layout)) {
    expect(surfaceDistance(collider, point.x, point.z), label).toBeGreaterThan(PLAYER_BODY_RADIUS);
  }
}

const IGNIVAR_WALL_OR_CEILING_DECOR = new Set([
  'ignivar_chain',
  'ignivar_furnace_pillar',
  'ignivar_gear_broad',
  'ignivar_gear_heavy',
  'ignivar_gear_small',
  'ignivar_gear_wall_cluster',
  'ignivar_wall_gear_relief',
]);

function expectDecorFootprintsContained(layout: DungeonLayout, label: string): void {
  const rooms = layout.rooms ?? [];
  const decor = layout.decor ?? [];
  for (const entry of decor) {
    const radius = entry.r;
    if (radius === undefined) {
      expect(
        IGNIVAR_WALL_OR_CEILING_DECOR.has(entry.key),
        `${label} ${entry.key} intentionally visual-only`,
      ).toBe(true);
      continue;
    }
    const room = rooms.find(
      (candidate) =>
        entry.x > candidate.x0 &&
        entry.x < candidate.x1 &&
        entry.z > candidate.z0 &&
        entry.z < candidate.z1,
    );
    expect(room, `${label} ${entry.key} room at ${entry.x},${entry.z}`).toBeDefined();
    if (!room) continue;
    expect(entry.x - radius, `${label} ${entry.key} left footprint`).toBeGreaterThan(room.x0);
    expect(entry.x + radius, `${label} ${entry.key} right footprint`).toBeLessThan(room.x1);
    expect(entry.z - radius, `${label} ${entry.key} south footprint`).toBeGreaterThan(room.z0);
    expect(entry.z + radius, `${label} ${entry.key} north footprint`).toBeLessThan(room.z1);
  }
  for (let left = 0; left < decor.length; left++) {
    for (let right = left + 1; right < decor.length; right++) {
      const a = decor[left];
      const b = decor[right];
      if (a.r === undefined || b.r === undefined) continue;
      expect(
        Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r,
        `${label} overlapping decor ${a.key}/${b.key}`,
      ).toBeGreaterThan(0);
    }
  }
}

function claimedRaid(difficulty: 'normal' | 'heroic' = 'normal') {
  const sim = new Sim({
    seed: 3410,
    playerClass: 'warrior',
    devCommands: true,
  });
  sim.chat(`/dev dungeon ignivar_raid_arena ${difficulty}`);
  sim.chat('/dev ignivarraid');
  const boss = [...sim.entities.values()].find((entity) => entity.templateId === IGNIVAR_BOSS_ID);
  const gate = [...sim.entities.values()].find(
    (entity) =>
      entity.templateId === IGNIVAR_GATE_LOCKED_TEMPLATE &&
      entity.dungeonId === IGNIVAR_MOLTEN_ASSEMBLY_ID,
  );
  if (!boss || !gate) throw new Error('Ignivar raid progression fixtures did not spawn');
  return { sim, boss, gate };
}

function teleport(sim: Sim, entityId: number, pos: { x: number; z: number }): void {
  const entity = sim.entities.get(entityId);
  if (!entity) throw new Error(`Missing entity ${entityId}`);
  entity.pos = sim.groundPos(pos.x, pos.z);
  entity.prevPos = { ...entity.pos };
  sim.rebucket(entity);
}

function reapEmptyInstances(sim: Sim): void {
  sim.tickCount = 20;
  for (let second = 0; second <= 300; second++) {
    updateInstances(sim.ctx);
  }
}

function guardianMobs(sim: Sim) {
  return [...sim.entities.values()].filter((entity) =>
    IGNIVAR_APPROACH_GUARDIAN_IDS.some((templateId) => templateId === entity.templateId),
  );
}

function defeatAutomataIn(sim: Sim, dungeonId: string): void {
  const instance = sim.instances.find(
    (candidate) => candidate.dungeonId === dungeonId && candidate.partyKey !== null,
  );
  if (!instance) throw new Error(`Missing claimed raid room ${dungeonId}`);
  for (const mobId of instance.mobIds) {
    const mob = sim.entities.get(mobId);
    if (!mob || !IGNIVAR_APPROACH_GUARDIAN_IDS.includes(mob.templateId as never)) continue;
    mob.dead = true;
    mob.hp = 0;
  }
  sim.tickCount = 20;
  updateInstances(sim.ctx);
}

describe('Ignivar raid progression', () => {
  it('authors an ordered, hidden four-room raid family', () => {
    expect(IGNIVAR_RAID_ROOM_IDS).toEqual([
      IGNIVAR_FORGE_APPROACH_ID,
      IGNIVAR_RAID_ARENA_ID,
      IGNIVAR_MOLTEN_ASSEMBLY_ID,
      IGNIVAR_SECOND_WING_ID,
    ]);
    expect(ignivarPreviousRaidRoom(IGNIVAR_FORGE_APPROACH_ID)).toBeNull();
    expect(ignivarPreviousRaidRoom(IGNIVAR_RAID_ARENA_ID)).toBe(IGNIVAR_FORGE_APPROACH_ID);
    expect(ignivarPreviousRaidRoom(IGNIVAR_MOLTEN_ASSEMBLY_ID)).toBe(IGNIVAR_RAID_ARENA_ID);
    expect(ignivarPreviousRaidRoom(IGNIVAR_SECOND_WING_ID)).toBe(IGNIVAR_MOLTEN_ASSEMBLY_ID);
    expect(DUNGEONS[IGNIVAR_FORGE_APPROACH_ID]).toMatchObject({
      id: IGNIVAR_FORGE_APPROACH_ID,
      overworldDoor: false,
      guideVisible: false,
      interior: 'ignivar_approach',
      suggestedPlayers: 10,
    });
    expect(INTERIOR_LAYOUTS.ignivar_approach).toBe(IGNIVAR_FORGE_APPROACH_LAYOUT);
    expect(IGNIVAR_FORGE_APPROACH_LAYOUT.zMin).toBe(-66);
    expect(IGNIVAR_FORGE_APPROACH_LAYOUT.zMax).toBe(76);
    expect(IGNIVAR_FORGE_APPROACH_LAYOUT.rooms).toEqual([
      { id: 'entry', x0: -16, x1: 16, z0: -66, z1: -42 },
      { id: 'smelter_hub', x0: -24, x1: 24, z0: -42, z1: 32 },
      { id: 'west_workshop', x0: -60, x1: -24, z0: -30, z1: 36 },
      { id: 'east_store', x0: 24, x1: 60, z0: -12, z1: 36 },
      { id: 'herald_antechamber', x0: -52, x1: 52, z0: 36, z1: 76 },
    ]);
    expect(IGNIVAR_FORGE_APPROACH_LAYOUT.doors).toEqual([
      { x: 0, z: -42, hw: 5, hd: 1 },
      { x: -24, z: -8, hw: 1, hd: 5 },
      { x: 24, z: 10, hw: 1, hd: 5 },
      { x: -40, z: 36, hw: 5, hd: 1 },
      { x: 40, z: 36, hw: 5, hd: 1 },
    ]);
    expect(doorEdges(IGNIVAR_FORGE_APPROACH_LAYOUT)).toEqual([
      'east_store<->herald_antechamber',
      'east_store<->smelter_hub',
      'entry<->smelter_hub',
      'herald_antechamber<->west_workshop',
      'smelter_hub<->west_workshop',
    ]);
    expect(
      IGNIVAR_FORGE_APPROACH_LAYOUT.decor?.map(({ key, x, z }) => ({
        key,
        x,
        z,
      })),
    ).toEqual([
      { key: 'ignivar_forge_station', x: 0, z: -8 },
      { key: 'slag_cauldron', x: -55, z: 6 },
      { key: 'slag_cauldron', x: 55, z: 6 },
      { key: 'infernal_brazier', x: -20, z: -36 },
      { key: 'infernal_brazier', x: 20, z: -36 },
      { key: 'infernal_brazier', x: -56, z: -26 },
      { key: 'infernal_brazier', x: -56, z: 30 },
      { key: 'infernal_brazier', x: 56, z: -8 },
      { key: 'infernal_brazier', x: 56, z: 30 },
      { key: 'infernal_brazier', x: -17, z: 70 },
      { key: 'infernal_brazier', x: 17, z: 70 },
      { key: 'infernal_statue', x: -17, z: 43 },
      { key: 'infernal_statue', x: 17, z: 43 },
      { key: 'hanging_cage', x: -29, z: 26 },
      { key: 'hanging_cage', x: 29, z: 26 },
      { key: 'obsidian_fang', x: -52, z: 34 },
      { key: 'obsidian_fang', x: 52, z: 34 },
      { key: 'obsidian_fang', x: -27, z: -23 },
      { key: 'obsidian_fang', x: 27, z: -5 },
      { key: 'ignivar_firepit', x: -12, z: -46 },
      { key: 'ignivar_firepit', x: 12, z: -46 },
      { key: 'ignivar_wall_gear_relief', x: -15.5, z: -55 },
      { key: 'ignivar_chain', x: -15, z: -63 },
      { key: 'ignivar_chain', x: 15, z: -63 },
      { key: 'ignivar_gear_small', x: -23.2, z: -31 },
      { key: 'ignivar_gear_heavy', x: 23.2, z: -30 },
      { key: 'ignivar_furnace_pillar', x: -23.1, z: 24 },
      { key: 'ignivar_workbench', x: -28, z: -26 },
      { key: 'ignivar_gear_machine', x: -57, z: -5 },
      { key: 'ignivar_fallen_automa', x: -29, z: 8 },
      { key: 'ignivar_reactor', x: 29, z: -7 },
      { key: 'ignivar_gear_broad', x: 59, z: 31 },
      { key: 'ignivar_gear_wall_cluster', x: -51, z: 52 },
      { key: 'ignivar_fallen_automa', x: -38, z: 65 },
      { key: 'ignivar_fallen_automa', x: 38, z: 65 },
    ]);
    expect(IGNIVAR_FORGE_APPROACH_LAYOUT.decor?.map(({ r }) => r)).toEqual([
      2.34,
      0.98,
      0.98,
      0.85,
      0.85,
      0.85,
      0.85,
      0.85,
      0.85,
      0.85,
      0.85,
      0.98,
      0.98,
      1,
      1,
      0.85,
      0.85,
      0.85,
      0.85,
      1.1,
      1.1,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      1.3,
      2,
      1.25,
      1.65,
      undefined,
      undefined,
      1.25,
      1.25,
    ]);
    expectDecorFootprintsContained(IGNIVAR_FORGE_APPROACH_LAYOUT, 'Forge Approach');
    expect(DUNGEONS[IGNIVAR_MOLTEN_ASSEMBLY_ID]).toMatchObject({
      id: IGNIVAR_MOLTEN_ASSEMBLY_ID,
      name: 'Molten Assembly',
      index: 13,
      overworldDoor: false,
      guideVisible: false,
      interior: 'ignivar_assembly',
      mobDifficultyTuningId: IGNIVAR_SECOND_WING_ID,
      suggestedPlayers: 10,
    });
    expect(INTERIOR_LAYOUTS.ignivar_assembly).toBe(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT);
    expect(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.zMin).toBe(-66);
    expect(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.zMax).toBe(84);
    expect(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.rooms).toEqual([
      { id: 'entry', x0: -16, x1: 16, z0: -66, z1: -44 },
      { id: 'intake_floor', x0: -52, x1: 52, z0: -44, z1: -12 },
      { id: 'west_tempering', x0: -52, x1: 0, z0: -12, z1: 38 },
      { id: 'east_hammering', x0: 0, x1: 52, z0: -12, z1: 38 },
      { id: 'north_gallery', x0: -52, x1: 52, z0: 38, z1: 54 },
      { id: 'varkhul_antechamber', x0: -28, x1: 28, z0: 54, z1: 84 },
    ]);
    expect(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.doors).toEqual([
      { x: 0, z: -44, hw: 5, hd: 1 },
      { x: -26, z: -12, hw: 5, hd: 1 },
      { x: 26, z: -12, hw: 5, hd: 1 },
      { x: 0, z: 13, hw: 1, hd: 5 },
      { x: -26, z: 38, hw: 5, hd: 1 },
      { x: 26, z: 38, hw: 5, hd: 1 },
      { x: 0, z: 54, hw: 6, hd: 1 },
    ]);
    expect(doorEdges(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT)).toEqual([
      'east_hammering<->intake_floor',
      'east_hammering<->north_gallery',
      'east_hammering<->west_tempering',
      'entry<->intake_floor',
      'intake_floor<->west_tempering',
      'north_gallery<->varkhul_antechamber',
      'north_gallery<->west_tempering',
    ]);
    expect(
      IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor?.map(({ key, x, z }) => ({
        key,
        x,
        z,
      })),
    ).toEqual([
      { key: 'ignivar_forge_station', x: -36, z: 0 },
      { key: 'ignivar_forge_station', x: 36, z: 0 },
      { key: 'slag_cauldron', x: -18, z: -32 },
      { key: 'slag_cauldron', x: 18, z: -32 },
      { key: 'infernal_brazier', x: -47, z: -39 },
      { key: 'infernal_brazier', x: 47, z: -39 },
      { key: 'infernal_brazier', x: -48, z: 34 },
      { key: 'infernal_brazier', x: 48, z: 34 },
      { key: 'infernal_brazier', x: -23, z: 79 },
      { key: 'infernal_brazier', x: 23, z: 79 },
      { key: 'infernal_statue', x: -21, z: 60 },
      { key: 'infernal_statue', x: 21, z: 60 },
      { key: 'infernal_altar', x: 0, z: 59 },
      { key: 'hanging_cage', x: -47, z: 17 },
      { key: 'hanging_cage', x: 47, z: 17 },
      { key: 'obsidian_fang', x: -46, z: 45 },
      { key: 'obsidian_fang', x: 46, z: 45 },
      { key: 'obsidian_fang', x: -20, z: 50 },
      { key: 'obsidian_fang', x: 20, z: 50 },
      { key: 'ignivar_firepit', x: -35, z: -39 },
      { key: 'ignivar_firepit', x: 35, z: -39 },
      { key: 'ignivar_wall_gear_relief', x: -51, z: -28 },
      { key: 'ignivar_chain', x: -15, z: -63 },
      { key: 'ignivar_chain', x: 15, z: -63 },
      { key: 'ignivar_fallen_automa', x: -36, z: -18 },
      { key: 'ignivar_fallen_automa', x: 36, z: -18 },
      { key: 'ignivar_gear_machine', x: -48, z: -4 },
      { key: 'ignivar_workbench', x: -47, z: 10 },
      { key: 'ignivar_reactor', x: 48, z: -4 },
      { key: 'ignivar_forge_anvil', x: 47, z: 10 },
      { key: 'ignivar_gear_small', x: -51, z: 28 },
      { key: 'ignivar_gear_heavy', x: 51, z: 28 },
      { key: 'ignivar_gear_broad', x: 51, z: 18 },
      { key: 'ignivar_gear_wall_cluster', x: -51, z: 17 },
      { key: 'ignivar_furnace_pillar', x: -51, z: 46 },
      { key: 'ignivar_fallen_automa', x: -24, z: 70 },
      { key: 'ignivar_fallen_automa', x: 24, z: 70 },
    ]);
    expect(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor?.map(({ r }) => r)).toEqual([
      2.34,
      2.34,
      0.98,
      0.98,
      0.85,
      0.85,
      0.85,
      0.85,
      0.85,
      0.85,
      0.98,
      0.98,
      1.25,
      1,
      1,
      0.85,
      0.85,
      0.85,
      0.85,
      1.1,
      1.1,
      undefined,
      undefined,
      undefined,
      1.25,
      1.25,
      2,
      1.3,
      1.65,
      1.5,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      1.25,
      1.25,
    ]);
    expectDecorFootprintsContained(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT, 'Molten Assembly');
    expect(DUNGEONS[IGNIVAR_MOLTEN_ASSEMBLY_ID].spawns).toHaveLength(14);
    expect(DUNGEONS[IGNIVAR_MOLTEN_ASSEMBLY_ID].objects?.at(-1)).toMatchObject({
      templateId: IGNIVAR_GATE_LOCKED_TEMPLATE,
      dungeonId: IGNIVAR_SECOND_WING_ID,
    });
    expect(DUNGEONS[IGNIVAR_SECOND_WING_ID]).toMatchObject({
      id: IGNIVAR_SECOND_WING_ID,
      overworldDoor: false,
      guideVisible: false,
      interior: 'ignivar_depths',
      suggestedPlayers: 10,
    });
    expect(INTERIOR_LAYOUTS.ignivar_depths).toBe(IGNIVAR_SECOND_WING_LAYOUT);
    expect(IGNIVAR_SECOND_WING_LAYOUT.shellPolygon).toHaveLength(12);
    expect(IGNIVAR_SECOND_WING_LAYOUT.floorHalfX).toBe(40);
    expect(IGNIVAR_SECOND_WING_LAYOUT.pillars).toEqual([]);

    const approach = DUNGEONS[IGNIVAR_FORGE_APPROACH_ID];
    const approachRooms = IGNIVAR_FORGE_APPROACH_LAYOUT.rooms ?? [];
    expect(roomIdsAt(approachRooms, approach.entry.x, approach.entry.z)).toEqual(['entry']);
    expect(approach.spawns.map((spawn) => roomIdsAt(approachRooms, spawn.x, spawn.z))).toEqual([
      ['smelter_hub'],
      ['smelter_hub'],
      ['west_workshop'],
      ['west_workshop'],
      ['west_workshop'],
      ['west_workshop'],
      ['east_store'],
      ['east_store'],
      ['east_store'],
      ['east_store'],
      ['herald_antechamber'],
      ['herald_antechamber'],
      ['herald_antechamber'],
    ]);
    expect(approach.npcs?.map((npc) => roomIdsAt(approachRooms, npc.x, npc.z))).toEqual([
      ['entry'],
    ]);
    expect(approach.objects?.map((object) => roomIdsAt(approachRooms, object.x, object.z))).toEqual(
      [['entry'], ['west_workshop'], ['east_store'], ['herald_antechamber']],
    );
    expect(
      approach.objects?.map((object) => ({
        id: object.itemId || object.dungeonId,
        roomId: roomIdsAt(approachRooms, object.x, object.z)[0],
      })),
    ).toEqual([
      { id: IGNIVAR_RECORD_IDS.firstTempering, roomId: 'entry' },
      { id: IGNIVAR_RECORD_IDS.livingMetal, roomId: 'west_workshop' },
      { id: IGNIVAR_RECORD_IDS.heraldKey, roomId: 'east_store' },
      { id: IGNIVAR_RAID_ARENA_ID, roomId: 'herald_antechamber' },
    ]);

    const assembly = DUNGEONS[IGNIVAR_MOLTEN_ASSEMBLY_ID];
    const assemblyRooms = IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.rooms ?? [];
    expect(roomIdsAt(assemblyRooms, assembly.entry.x, assembly.entry.z)).toEqual(['entry']);
    expect(assembly.spawns.map((spawn) => roomIdsAt(assemblyRooms, spawn.x, spawn.z))).toEqual([
      ['intake_floor'],
      ['intake_floor'],
      ['west_tempering'],
      ['west_tempering'],
      ['west_tempering'],
      ['west_tempering'],
      ['east_hammering'],
      ['east_hammering'],
      ['east_hammering'],
      ['east_hammering'],
      ['varkhul_antechamber'],
      ['varkhul_antechamber'],
      ['varkhul_antechamber'],
      ['varkhul_antechamber'],
    ]);
    expect(assembly.npcs?.map((npc) => roomIdsAt(assemblyRooms, npc.x, npc.z))).toEqual([
      ['entry'],
    ]);
    expect(assembly.objects?.map((object) => roomIdsAt(assemblyRooms, object.x, object.z))).toEqual(
      [['varkhul_antechamber']],
    );
    expect(
      assembly.objects?.map((object) => ({
        id: object.itemId || object.dungeonId,
        roomId: roomIdsAt(assemblyRooms, object.x, object.z)[0],
      })),
    ).toEqual([{ id: IGNIVAR_SECOND_WING_ID, roomId: 'varkhul_antechamber' }]);

    for (const dungeonId of [IGNIVAR_FORGE_APPROACH_ID, IGNIVAR_MOLTEN_ASSEMBLY_ID]) {
      const dungeon = DUNGEONS[dungeonId];
      const rooms = INTERIOR_LAYOUTS[dungeon.interior].rooms;
      if (!rooms) throw new Error(`${dungeonId} must use an authored room graph`);
      for (const point of [
        dungeon.entry,
        ...dungeon.spawns,
        ...(dungeon.npcs ?? []),
        ...(dungeon.objects ?? []),
        ...(INTERIOR_LAYOUTS[dungeon.interior].decor ?? []),
      ]) {
        expect(inAnyRoom(rooms, point.x, point.z), `${dungeonId}: ${point.x},${point.z}`).toBe(
          true,
        );
      }

      for (const point of [
        dungeon.entry,
        ...dungeon.spawns,
        ...(dungeon.npcs ?? []),
        ...(dungeon.objects ?? []),
      ]) {
        expectClearOfLayout(
          INTERIOR_LAYOUTS[dungeon.interior],
          point,
          `${dungeonId} blocked placement at ${point.x},${point.z}`,
        );
      }

      const adjacency = new Map(rooms.map((room) => [room.id, new Set<string>()]));
      for (const door of INTERIOR_LAYOUTS[dungeon.interior].doors ?? []) {
        const touching = rooms.filter(
          (room) =>
            door.x >= room.x0 && door.x <= room.x1 && door.z >= room.z0 && door.z <= room.z1,
        );
        expect(touching, `${dungeonId} door at ${door.x},${door.z}`).toHaveLength(2);
        const crossesX = door.hd > door.hw;
        for (const offset of [-1.5, 0, 1.5]) {
          const point = {
            x: door.x + (crossesX ? offset : 0),
            z: door.z + (crossesX ? 0 : offset),
          };
          if (offset !== 0) {
            expect(inAnyRoom(rooms, point.x, point.z), `${dungeonId} door crossing`).toBe(true);
          }
          expectClearOfLayout(
            INTERIOR_LAYOUTS[dungeon.interior],
            point,
            `${dungeonId} blocked door crossing at ${point.x},${point.z}`,
          );
        }
        adjacency.get(touching[0].id)?.add(touching[1].id);
        adjacency.get(touching[1].id)?.add(touching[0].id);
      }
      const reached = new Set<string>([rooms[0].id]);
      const pending = [rooms[0].id];
      while (pending.length > 0) {
        const roomId = pending.shift();
        if (!roomId) continue;
        for (const neighbor of adjacency.get(roomId) ?? []) {
          if (reached.has(neighbor)) continue;
          reached.add(neighbor);
          pending.push(neighbor);
        }
      }
      expect(reached.size, `${dungeonId} room graph`).toBe(rooms.length);
    }
  });

  it('ends the Approach trash with one Warden miniboss and opens the Herald gate only after all die', () => {
    const sim = new Sim({
      seed: 3412,
      playerClass: 'warrior',
      devCommands: true,
    });
    const allyPid = sim.addPlayer('paladin', 'Approach Ally');
    const raid = sim.ctx.formDungeonFinderGroup(
      [sim.player.id, allyPid].map((pid) => ({
        partyId: null,
        leaderPid: pid,
        members: [pid],
      })),
      { raid: true },
    );
    if (!raid) throw new Error('Approach test raid did not form');
    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, sim.player.id, true)).toBe(true);
    const claim = sim.instances.find(
      (instance) => instance.dungeonId === IGNIVAR_FORGE_APPROACH_ID && instance.partyKey !== null,
    );
    if (!claim) throw new Error('Forge approach did not form a claim');
    expect(claim.npcIds).toHaveLength(1);
    expect(sim.entities.get(claim.npcIds[0])?.templateId).toBe(IGNIVAR_MAELIN_NPC_ID);
    const gate = claim.objectIds
      .map((id) => sim.entities.get(id))
      .find((entity) => entity?.dungeonId === IGNIVAR_RAID_ARENA_ID);
    if (!gate) throw new Error('Forge approach gate did not spawn');

    const guardians = guardianMobs(sim);
    expect(guardians).toHaveLength(13);
    expect(
      guardians.filter((guardian) => guardian.templateId === IGNIVAR_EMBER_SENTINEL_ID),
    ).toHaveLength(12);
    expect(
      guardians.filter((guardian) => guardian.templateId === IGNIVAR_CRUCIBLE_WARDEN_ID),
    ).toHaveLength(1);
    expect(
      claim.mobIds.some((id) => sim.entities.get(id)?.templateId === IGNIVAR_CINDER_ARTIFICER_ID),
    ).toBe(false);
    expect(MOBS[IGNIVAR_APPROACH_GUARDIAN_IDS[0]].arcCleave?.name).toBe('Tempered Sweep');
    expect(MOBS[IGNIVAR_APPROACH_GUARDIAN_IDS[1]].bigCast?.castId).toBe('crucible_quake');
    expect(gate.templateId).toBe(IGNIVAR_GATE_LOCKED_TEMPLATE);

    const lastPack = guardians.filter(
      (guardian) => guardian.templateId === IGNIVAR_CRUCIBLE_WARDEN_ID,
    );
    lastPack[0].dead = true;
    lastPack[0].hp = 0;
    sim.tickCount = 20;
    updateInstances(sim.ctx);
    expect(gate.templateId).toBe(IGNIVAR_GATE_LOCKED_TEMPLATE);
    lastPack[0].dead = false;
    lastPack[0].hp = lastPack[0].maxHp;

    for (const guardian of guardians.filter(
      (mob) => mob.templateId === IGNIVAR_EMBER_SENTINEL_ID,
    )) {
      guardian.dead = true;
      guardian.hp = 0;
    }
    sim.tickCount = 20;
    updateInstances(sim.ctx);
    expect(gate.templateId).toBe(IGNIVAR_GATE_LOCKED_TEMPLATE);

    lastPack[0].dead = true;
    lastPack[0].hp = 0;
    updateInstances(sim.ctx);
    expect(gate.templateId).toBe('dungeon_door');
    teleport(sim, sim.player.id, gate.pos);
    updateDoorTriggers(sim.ctx, sim.player);
    expect(sim.instanceInfoAt(sim.player.pos)?.dungeonId).toBe(IGNIVAR_RAID_ARENA_ID);
  });

  it.each(['normal', 'heroic'] as const)(
    'walks through the %s assembly packs into Varkhul with source difficulty',
    (difficulty) => {
      const { sim, boss, gate } = claimedRaid(difficulty);
      const opposite = difficulty === 'normal' ? 'heroic' : 'normal';
      sim.setDungeonDifficulty(opposite);
      expect(sim.dungeonDifficulty()).toBe(opposite);
      const source = sim.instances.find(
        (instance) => instance.dungeonId === IGNIVAR_RAID_ARENA_ID && instance.partyKey !== null,
      );
      expect(source?.difficulty).toBe(difficulty);
      expect(gate.templateId).toBe(IGNIVAR_GATE_LOCKED_TEMPLATE);

      teleport(sim, sim.player.id, gate.pos);
      updateDoorTriggers(sim.ctx, sim.player);
      expect(sim.instanceInfoAt(sim.player.pos)?.dungeonId).toBe(IGNIVAR_RAID_ARENA_ID);

      boss.dead = true;
      boss.hp = 0;
      sim.tick();

      expect(gate.templateId).toBe('dungeon_door');
      updateDoorTriggers(sim.ctx, sim.player);
      expect(sim.instanceInfoAt(sim.player.pos)?.dungeonId).toBe(IGNIVAR_MOLTEN_ASSEMBLY_ID);
      expect(
        sim.instances.find(
          (instance) =>
            instance.dungeonId === IGNIVAR_MOLTEN_ASSEMBLY_ID && instance.partyKey !== null,
        )?.difficulty,
      ).toBe(difficulty);

      const assembly = sim.instances.find(
        (instance) =>
          instance.dungeonId === IGNIVAR_MOLTEN_ASSEMBLY_ID && instance.partyKey !== null,
      );
      if (!assembly) throw new Error('Molten Assembly did not form a claim');
      const automata = assembly.mobIds
        .map((id) => sim.entities.get(id))
        .filter((entity): entity is NonNullable<typeof entity> => entity !== undefined);
      expect(automata).toHaveLength(14);
      expect(automata.every((mob) => mob.level === (difficulty === 'heroic' ? 22 : 20))).toBe(true);
      const wardens = automata.filter((mob) => mob.templateId === IGNIVAR_CRUCIBLE_WARDEN_ID);
      expect(wardens).toHaveLength(2);
      for (const warden of wardens) {
        expect(warden).toMatchObject({
          maxHp: difficulty === 'heroic' ? 9426 : 7539,
          hp: difficulty === 'heroic' ? 9426 : 7539,
          scale: 2.75,
          ccImmune: true,
          slowImmune: true,
        });
      }
      if (difficulty === 'heroic') {
        const byTemplate = Object.fromEntries(automata.map((mob) => [mob.templateId, mob]));
        expect(byTemplate.ignivar_ember_sentinel).toMatchObject({
          maxHp: 3312,
          weapon: { min: 153, max: 239 },
          stats: { armor: 806 },
          mechanicDamageMult: 1.25,
          mechanicBurnDamageMult: 1.25,
        });
        expect(byTemplate.ignivar_crucible_warden).toMatchObject({
          maxHp: 9426,
          weapon: { min: 138, max: 216 },
          stats: { armor: 1058 },
        });
        expect(byTemplate.ignivar_crucible_warden?.mechanicDamageMult).toBeCloseTo(
          (92.2 * 1.25) / 99.8,
          8,
        );
      }
      expect(automata.filter((mob) => mob.templateId === IGNIVAR_EMBER_SENTINEL_ID)).toHaveLength(
        12,
      );
      expect(automata.some((mob) => mob.templateId === IGNIVAR_CINDER_ARTIFICER_ID)).toBe(false);
      const finalGate = assembly.objectIds
        .map((id) => sim.entities.get(id))
        .find((entity) => entity?.dungeonId === IGNIVAR_SECOND_WING_ID);
      if (!finalGate) throw new Error('Final Crucible gate did not spawn');
      expect(finalGate.templateId).toBe(IGNIVAR_GATE_LOCKED_TEMPLATE);
      teleport(sim, sim.player.id, finalGate.pos);
      updateDoorTriggers(sim.ctx, sim.player);
      expect(sim.instanceInfoAt(sim.player.pos)?.dungeonId).toBe(IGNIVAR_MOLTEN_ASSEMBLY_ID);

      for (const warden of wardens) {
        warden.dead = true;
        warden.hp = 0;
      }
      sim.tickCount = 20;
      updateInstances(sim.ctx);
      expect(finalGate.templateId).toBe(IGNIVAR_GATE_LOCKED_TEMPLATE);
      for (const warden of wardens) {
        warden.dead = false;
        warden.hp = warden.maxHp;
      }
      for (const sentinel of automata.filter(
        (mob) => mob.templateId === IGNIVAR_EMBER_SENTINEL_ID,
      )) {
        sentinel.dead = true;
        sentinel.hp = 0;
      }
      updateInstances(sim.ctx);
      expect(finalGate.templateId).toBe(IGNIVAR_GATE_LOCKED_TEMPLATE);

      defeatAutomataIn(sim, IGNIVAR_MOLTEN_ASSEMBLY_ID);
      expect(finalGate.templateId).toBe('dungeon_door');
      updateDoorTriggers(sim.ctx, sim.player);
      expect(sim.instanceInfoAt(sim.player.pos)?.dungeonId).toBe(IGNIVAR_SECOND_WING_ID);
      expect(
        sim.instances.find(
          (instance) => instance.dungeonId === IGNIVAR_SECOND_WING_ID && instance.partyKey !== null,
        )?.difficulty,
      ).toBe(difficulty);
    },
  );

  it('denies assembly entry independently for a foreign claim and an outside player', () => {
    const { sim, boss } = claimedRaid();
    const source = sim.instances.find(
      (instance) => instance.dungeonId === IGNIVAR_RAID_ARENA_ID && instance.partyKey !== null,
    );
    if (!source?.partyKey) throw new Error('Ignivar source claim did not form');
    boss.dead = true;
    boss.hp = 0;
    sim.tick();

    const ownerKey = source.partyKey;
    source.partyKey = 'party:foreign';
    expect(enterDungeon(sim.ctx, IGNIVAR_MOLTEN_ASSEMBLY_ID, sim.player.id)).toBe(false);
    source.partyKey = ownerKey;

    teleport(sim, sim.player.id, { x: 0, z: 0 });
    expect(enterDungeon(sim.ctx, IGNIVAR_MOLTEN_ASSEMBLY_ID, sim.player.id)).toBe(false);
  });

  it('requires a raid group even after a solo dev tester defeats Ignivar', () => {
    const sim = new Sim({
      seed: 3411,
      playerClass: 'warrior',
      devCommands: true,
    });
    sim.chat(`/dev dungeon ${IGNIVAR_RAID_ARENA_ID} normal`);
    const boss = [...sim.entities.values()].find((entity) => entity.templateId === IGNIVAR_BOSS_ID);
    if (!boss) throw new Error('Solo Ignivar did not spawn');
    boss.dead = true;
    boss.hp = 0;
    sim.tick();

    expect(enterDungeon(sim.ctx, IGNIVAR_MOLTEN_ASSEMBLY_ID, sim.player.id)).toBe(false);
    expect(sim.instanceInfoAt(sim.player.pos)?.dungeonId).toBe(IGNIVAR_RAID_ARENA_ID);
  });

  it('keeps every claimed raid room alive while the raid occupies any sibling', () => {
    const { sim, boss } = claimedRaid();
    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, sim.player.id, true)).toBe(true);
    boss.dead = true;
    boss.hp = 0;
    sim.tick();

    const party = sim.partyOf(sim.player.id);
    if (!party) throw new Error('Practice raid did not form');
    for (const pid of party.members) {
      expect(enterDungeon(sim.ctx, IGNIVAR_RAID_ARENA_ID, pid, true)).toBe(true);
      expect(enterDungeon(sim.ctx, IGNIVAR_MOLTEN_ASSEMBLY_ID, pid, true)).toBe(true);
    }
    defeatAutomataIn(sim, IGNIVAR_MOLTEN_ASSEMBLY_ID);
    for (const pid of party.members) {
      expect(enterDungeon(sim.ctx, IGNIVAR_SECOND_WING_ID, pid)).toBe(true);
    }

    reapEmptyInstances(sim);

    const family = sim.instances.filter(
      (instance) =>
        IGNIVAR_RAID_ROOM_IDS.some((dungeonId) => dungeonId === instance.dungeonId) &&
        instance.partyKey !== null,
    );
    expect(family.map((instance) => instance.dungeonId).sort()).toEqual(
      [...IGNIVAR_RAID_ROOM_IDS].sort(),
    );
    expect(family.map((instance) => sim.entities.get(instance.npcIds[0])?.templateId)).toEqual(
      IGNIVAR_RAID_ROOM_IDS.map(() => IGNIVAR_MAELIN_NPC_ID),
    );
    expect(sim.entities.get(boss.id)?.dead).toBe(true);

    for (const pid of party.members) {
      expect(enterDungeon(sim.ctx, IGNIVAR_RAID_ARENA_ID, pid, true)).toBe(true);
    }
    reapEmptyInstances(sim);
    for (const roomId of IGNIVAR_RAID_ROOM_IDS) {
      expect(
        sim.instances.find(
          (instance) => instance.dungeonId === roomId && instance.partyKey !== null,
        ),
      ).toBeDefined();
    }
  });

  it('frees all empty rooms atomically and reclaims a fresh locked approach', () => {
    const { sim, boss } = claimedRaid();
    expect(enterDungeon(sim.ctx, IGNIVAR_FORGE_APPROACH_ID, sim.player.id, true)).toBe(true);
    boss.dead = true;
    boss.hp = 0;
    sim.tick();
    const party = sim.partyOf(sim.player.id);
    if (!party) throw new Error('Practice raid did not form');
    for (const pid of party.members) {
      expect(enterDungeon(sim.ctx, IGNIVAR_RAID_ARENA_ID, pid, true)).toBe(true);
      expect(enterDungeon(sim.ctx, IGNIVAR_MOLTEN_ASSEMBLY_ID, pid, true)).toBe(true);
    }
    defeatAutomataIn(sim, IGNIVAR_MOLTEN_ASSEMBLY_ID);
    for (const pid of party.members) {
      expect(enterDungeon(sim.ctx, IGNIVAR_SECOND_WING_ID, pid)).toBe(true);
      teleport(sim, pid, { x: 0, z: 0 });
    }
    const familyNpcIds = sim.instances
      .filter(
        (instance) =>
          IGNIVAR_RAID_ROOM_IDS.some((dungeonId) => dungeonId === instance.dungeonId) &&
          instance.partyKey !== null,
      )
      .flatMap((instance) => instance.npcIds);

    reapEmptyInstances(sim);
    expect(
      sim.instances.filter(
        (instance) =>
          IGNIVAR_RAID_ROOM_IDS.some((dungeonId) => dungeonId === instance.dungeonId) &&
          instance.partyKey !== null,
      ),
    ).toEqual([]);
    for (const npcId of familyNpcIds) expect(sim.entities.has(npcId)).toBe(false);

    sim.chat(`/dev dungeon ${IGNIVAR_FORGE_APPROACH_ID} normal`);
    const freshGate = [...sim.entities.values()].find(
      (entity) =>
        entity.templateId === IGNIVAR_GATE_LOCKED_TEMPLATE &&
        entity.dungeonId === IGNIVAR_RAID_ARENA_ID,
    );
    expect(freshGate).toBeDefined();
    expect(enterDungeon(sim.ctx, IGNIVAR_RAID_ARENA_ID, sim.player.id)).toBe(false);
  });
});
