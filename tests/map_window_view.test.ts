// Tests for the overworld map window pure core (map_window_view.ts):
//  - the mode discriminator (delve vs overworld) under both world shapes,
//  - the pure overworld draw model: Sim-vs-ClientWorld parity + determinism,
//  - per-state geometry: the framed-continent square + cursor at zoom 1, the
//    zoomed sub-rect above it, the zoomed-detail overlay when zoomed to a realm,
//    the player arrow, multi-realm markers, and ally dedup/order.
//
// DOM/Three/2D-context-free, so this Node suite drives the core directly. The
// painter's canvas draws (map_window_painter.ts) need a real 2D context +
// getComputedStyle and are covered by the no-magic-values source guard instead.

import { describe, expect, it } from 'vitest';
import {
  CAMPS,
  DELVE_X_MIN,
  DUNGEON_LIST,
  QUESTS,
  WORLD_MAX_X,
  WORLD_MAX_Z,
  WORLD_MIN_X,
  WORLD_MIN_Z,
  ZONES,
} from '../src/sim/data';
import { isQuestTurnInNpc, type QuestProgress } from '../src/sim/types';
import type { Decoration } from '../src/sim/world';
import {
  buildOverworldMapModel,
  MAP_MAX_ZOOM,
  mapWindowMode,
  npcMarkerAt,
  type OverworldMapInput,
  questAreaObjectivesAt,
} from '../src/ui/map_window_view';
import type { IWorld } from '../src/world_api';

const ZONE = ZONES[0];
const ZONE_CZ = (ZONE.zMin + ZONE.zMax) / 2; // a z inside the committed zone band
const CANVAS = 560;
// The map is world-relative: zoom 1 frames the whole continent as a square
// (continent height + WORLD_MARGIN, which is 120 in map_window_view.ts).
const FULL_SPAN = WORLD_MAX_Z - WORLD_MIN_Z + 120;
const WORLD_CX = (WORLD_MIN_X + WORLD_MAX_X) / 2;
const WORLD_CZ = (WORLD_MIN_Z + WORLD_MAX_Z) / 2;
// A zoom whose visible span is under LABEL_SPAN (900), so the POI/NPC/ally
// labels draw (FULL_SPAN / 4 = 680 < 900).
const LABELS_ZOOM = 4;
// A quest giver with a real giverNpcId, so the npc-marker branch exercises real
// content rather than an undefined === undefined accident.
function requireQuestWithGiver() {
  const quest = Object.values(QUESTS).find((q) => q.giverNpcId);
  if (!quest) throw new Error('expected a quest with a giverNpcId');
  return quest;
}
const GIVER_QUEST = requireQuestWithGiver();
// A quest whose giver is also a turn-in npc, so a single npc can carry a 'ready'
// turn-in (the '?' glyph branch the painter renders, distinct from '!').
function requireReadyQuest() {
  const quest = Object.values(QUESTS).find(
    (q) => q.giverNpcId && isQuestTurnInNpc(q, q.giverNpcId),
  );
  if (!quest) throw new Error('expected a quest whose giver is also a turn-in npc');
  return quest;
}
const READY_QUEST = requireReadyQuest();

// One scenario as plain data, so we can build two structurally-distinct IWorld
// stubs (a "Sim-shaped" one carrying extra sim-only fields the core must ignore,
// and a lean "ClientWorld-mirror-shaped" one) and assert identical output
// Iteration order of consumed collections is kept identical.
function makeOverworldWorld(
  shape: 'sim' | 'client',
  questLog: Map<string, QuestProgress> = new Map(),
): IWorld {
  const simJunk = shape === 'sim' ? { hp: 100, maxHp: 100, castingAbility: null } : {};
  const player = {
    id: 1,
    kind: 'player',
    name: 'Me',
    pos: { x: 0, z: ZONE_CZ },
    facing: 0.5,
    ...simJunk,
  };
  const npc = {
    id: 2,
    kind: 'npc',
    name: 'Giver',
    templateId: GIVER_QUEST.giverNpcId,
    questIds: [GIVER_QUEST.id],
    pos: { x: 10, z: ZONE_CZ },
    ...simJunk,
  };
  const entities = new Map<number, unknown>([
    [player.id, player],
    [npc.id, npc],
  ]);
  const socialInfo = {
    friends: [{ id: 10, name: 'FriendA', online: true, x: 0, z: ZONE_CZ }],
    guild: {
      members: [
        { id: 10, name: 'FriendA', online: true, x: 0, z: ZONE_CZ }, // dup id -> deduped
        { id: 11, name: 'GuildB', online: true, x: 5, z: ZONE_CZ },
      ],
    },
  };
  return {
    player,
    entities,
    socialInfo,
    delveRun: null,
    cfg: { seed: 42, playerClass: 'warrior' },
    playerId: 1,
    questState: (q: string) => (q === GIVER_QUEST.id ? 'available' : 'unavailable'),
    questLog,
  } as unknown as IWorld;
}

function makeDelveWorld(shape: 'sim' | 'client'): IWorld {
  const simJunk = shape === 'sim' ? { hp: 100 } : {};
  return {
    player: {
      id: 1,
      kind: 'player',
      name: 'Me',
      pos: { x: DELVE_X_MIN + 200, z: 0 },
      facing: 0,
      ...simJunk,
    },
    entities: new Map(),
    socialInfo: null,
    delveRun: {
      delveId: 'd',
      modules: ['m'],
      moduleIndex: 0,
      origin: { x: DELVE_X_MIN + 200, z: 0 },
    },
    cfg: { seed: 42, playerClass: 'warrior' },
    playerId: 1,
    questState: () => 'unavailable',
    questLog: new Map(),
  } as unknown as IWorld;
}

const NO_DECOR: Decoration[] = [];

function input(
  world: IWorld,
  zoom: number,
  decorations: Decoration[] = NO_DECOR,
): OverworldMapInput {
  return { world, zone: ZONE, zoom, center: null, canvasSize: CANVAS, decorations };
}

describe('mapWindowMode (delve vs overworld discriminator)', () => {
  it('returns overworld for an overworld position with no run (both shapes)', () => {
    expect(mapWindowMode(makeOverworldWorld('sim'))).toBe('overworld');
    expect(mapWindowMode(makeOverworldWorld('client'))).toBe('overworld');
  });

  it('returns delve when the player is in a delve band with an active run (both shapes)', () => {
    expect(mapWindowMode(makeDelveWorld('sim'))).toBe('delve');
    expect(mapWindowMode(makeDelveWorld('client'))).toBe('delve');
  });

  it('returns overworld in a delve band when no run is active (the data-absent trap)', () => {
    const world = makeDelveWorld('client') as unknown as { delveRun: unknown };
    world.delveRun = null;
    expect(mapWindowMode(world as unknown as IWorld)).toBe('overworld');
  });
});

describe('buildOverworldMapModel (pure draw model)', () => {
  it('Sim-shaped and ClientWorld-mirror-shaped stubs render identically', () => {
    const sim = makeOverworldWorld('sim');
    const client = makeOverworldWorld('client');
    expect(sim).not.toBe(client);
    const fromSim = buildOverworldMapModel(input(sim, 3));
    const fromClient = buildOverworldMapModel(input(client, 3));
    expect(fromSim).toEqual(fromClient);
  });

  it('is deterministic: identical inputs produce a deep-equal model', () => {
    const a = buildOverworldMapModel(input(makeOverworldWorld('sim'), 3));
    const b = buildOverworldMapModel(input(makeOverworldWorld('sim'), 3));
    expect(a).toEqual(b);
  });

  it('at zoom 1 frames the whole continent square and is not draggable', () => {
    const model = buildOverworldMapModel(input(makeOverworldWorld('sim'), 1));
    expect(model.cursor).toBe('default');
    expect(model.detail).toBeNull();
    // zoom 1 = the whole continent framed as a square (open ocean east/west),
    // centred on the world; the visible region equals the framed bounds.
    expect(model.view.spanX).toBe(model.view.spanZ);
    expect(model.view).toEqual({
      spanX: FULL_SPAN,
      spanZ: FULL_SPAN,
      minX: WORLD_CX - FULL_SPAN / 2,
      maxX: WORLD_CX + FULL_SPAN / 2,
      minZ: WORLD_CZ - FULL_SPAN / 2,
      maxZ: WORLD_CZ + FULL_SPAN / 2,
    });
    expect(model.region).toEqual({
      minX: WORLD_CX - FULL_SPAN / 2,
      maxX: WORLD_CX + FULL_SPAN / 2,
      minZ: WORLD_CZ - FULL_SPAN / 2,
      maxZ: WORLD_CZ + FULL_SPAN / 2,
    });
    expect(model.zoneId).toBe(ZONE.id);
  });

  it('zooms into a smaller square sub-rect and turns draggable above zoom 1', () => {
    const model = buildOverworldMapModel(input(makeOverworldWorld('sim'), 3));
    expect(model.cursor).toBe('grab');
    // the visible span is the framed square divided by the zoom (uniform, square)
    expect(model.view.spanX).toBeCloseTo(FULL_SPAN / 3, 6);
    expect(model.region.maxX - model.region.minX).toBeCloseTo(FULL_SPAN / 3, 6);
    expect(model.region.maxZ - model.region.minZ).toBeCloseTo(FULL_SPAN / 3, 6);
  });

  it('builds the zoomed-detail overlay only when zoomed in to a realm', () => {
    const decor: Decoration[] = [
      { kind: 'rock', x: 0, z: ZONE_CZ, scale: 1, variant: 0, biome: ZONE.biome },
      { kind: 'tree', x: 1, z: ZONE_CZ, scale: 1, variant: 0, biome: ZONE.biome },
      { kind: 'tree2', x: -1, z: ZONE_CZ, scale: 1, variant: 0, biome: ZONE.biome },
    ];
    // continent / multi-realm zoom: no detail overlay
    expect(buildOverworldMapModel(input(makeOverworldWorld('sim'), 1, decor)).detail).toBeNull();
    // zoomed in to a single realm (max zoom): the overlay draws
    const detail = buildOverworldMapModel(
      input(makeOverworldWorld('sim'), MAP_MAX_ZOOM, decor),
    ).detail;
    expect(detail).not.toBeNull();
    // rock/tree(pine)/tree2(oak) map to the three decoration color keys, in order.
    expect(detail?.decorations.map((d) => d.kind)).toEqual(['rock', 'tree', 'oak']);
  });

  it('projects markers at world scale: +X is map-left, centred on the player when zoomed in', () => {
    // A galecrest-shaped realm (x 180..540); the player at (394, 697) projects by
    // the world region (east = map-left) and, being interior, sits centred at max
    // zoom (the map is world-relative now, not one zone stretched to the canvas).
    const col: typeof ZONE = {
      ...ZONE,
      id: 'col_zone',
      zMin: 180,
      zMax: 700,
      xMin: 180,
      xMax: 540,
    };
    const world = makeOverworldWorld('sim') as unknown as {
      player: { pos: { x: number; z: number } };
    };
    world.player.pos.x = 394;
    world.player.pos.z = 697;
    const model = buildOverworldMapModel({
      world: world as unknown as IWorld,
      zone: col,
      zoom: MAP_MAX_ZOOM,
      center: null,
      canvasSize: CANVAS,
      decorations: NO_DECOR,
    });
    expect(model.player).not.toBeNull();
    // centred within a pixel at max zoom, since (394, 697) is interior
    expect(model.player?.mx).toBeCloseTo(CANVAS / 2, 0);
    expect(model.player?.my).toBeCloseTo(CANVAS / 2, 0);
    // matches the world region transform exactly (+X is map-left)
    const r = model.region;
    expect(model.player?.mx).toBeCloseTo(((r.maxX - 394) / (r.maxX - r.minX)) * CANVAS, 6);
  });

  it('emits a player arrow at -facing and one quest-giver glyph when zoomed in', () => {
    const model = buildOverworldMapModel(input(makeOverworldWorld('sim'), LABELS_ZOOM));
    expect(model.player).not.toBeNull();
    expect(model.player?.angle).toBe(-0.5);
    // the npc has an available quest from its own giver -> one '!' (not ready) glyph
    expect(model.npcs).toHaveLength(1);
    expect(model.npcs[0].ready).toBe(false);
    // the glyph carries its quest identity for the hover tooltip
    expect(model.npcs[0].quests).toEqual([{ questId: GIVER_QUEST.id, ready: false }]);
  });

  it('hit-tests the nearest glyph within the hover radius (and misses outside it)', () => {
    const model = buildOverworldMapModel(input(makeOverworldWorld('sim'), 1));
    const glyph = model.npcs[0];
    expect(npcMarkerAt(model.npcs, glyph.mx, glyph.my)).toBe(glyph);
    expect(npcMarkerAt(model.npcs, glyph.mx + 5, glyph.my - 5)).toBe(glyph); // slack
    expect(npcMarkerAt(model.npcs, glyph.mx + 500, glyph.my)).toBeNull();
    expect(npcMarkerAt([], glyph.mx, glyph.my)).toBeNull();
  });

  it("marks the glyph ready when a turn-in is ready (the '?' branch, not '!')", () => {
    const world = makeOverworldWorld('client') as unknown as {
      entities: Map<number, { templateId: string; questIds: string[] }>;
      questState: (q: string) => string;
    };
    // Re-point the in-zone npc (id 2) at a quest whose giver is its turn-in npc,
    // and make that quest ready: hasReady wins, so the painter draws '?' not '!'.
    const npc = world.entities.get(2);
    if (!npc) throw new Error('expected the seeded in-zone npc');
    npc.templateId = READY_QUEST.giverNpcId as string;
    npc.questIds = [READY_QUEST.id];
    world.questState = (q) => (q === READY_QUEST.id ? 'ready' : 'unavailable');
    const model = buildOverworldMapModel(input(world as unknown as IWorld, LABELS_ZOOM));
    expect(model.npcs).toHaveLength(1);
    expect(model.npcs[0].ready).toBe(true);
  });

  it('projects the in-view realm POIs and dungeon portals by the world transform', () => {
    // ZONE (eastbrook_vale) carries POIs and one overworld dungeon entrance.
    // Zoomed in over the vale, all its POIs are present (tagged with its own zone
    // id) and projected by the world region flip (+X is map-left). The map is
    // multi-realm now, so a neighbour's POIs may also be in view; we assert the
    // vale's set specifically.
    const model = buildOverworldMapModel(input(makeOverworldWorld('sim'), LABELS_ZOOM));
    const valePois = model.pois.filter((p) => p.zoneId === ZONE.id);
    expect(valePois).toHaveLength(ZONE.pois.length);
    expect(valePois.map((p) => p.poiIndex)).toEqual(ZONE.pois.map((_, i) => i));
    const r = model.region;
    const poi0 = ZONE.pois[0];
    expect(valePois[0].mx).toBeCloseTo(((r.maxX - poi0.x) / (r.maxX - r.minX)) * CANVAS, 6);
    expect(valePois[0].my).toBeCloseTo(((r.maxZ - poi0.z) / (r.maxZ - r.minZ)) * CANVAS, 6);
    // dungeon portals in view are finite-projected (portals show at every zoom)
    expect(model.portals.every((p) => Number.isFinite(p.mx) && Number.isFinite(p.my))).toBe(true);
  });

  it('dedups allies by id (friend wins ties) and orders friends before guild (zoomed in)', () => {
    const model = buildOverworldMapModel(input(makeOverworldWorld('sim'), LABELS_ZOOM));
    expect(model.allies.map((a) => a.kind)).toEqual(['friend', 'guild']);
    expect(model.allies.map((a) => a.name)).toEqual(['FriendA', 'GuildB']);
  });

  it('drops the player marker when standing east past the world edge', () => {
    const world = makeOverworldWorld('client') as unknown as { player: { pos: { x: number } } };
    world.player.pos.x = WORLD_MAX_X + 50;
    const model = buildOverworldMapModel(input(world as unknown as IWorld, 1));
    expect(model.player).toBeNull();
  });

  it('exposes the zoom ceiling used by the zoom control', () => {
    expect(MAP_MAX_ZOOM).toBeGreaterThan(1);
  });
});

describe('active-quest objective areas (the classic POI blobs)', () => {
  // A kill quest whose target mob camps inside the committed zone band, so the
  // quest-area branch exercises real content rather than a synthetic fixture.
  function requireKillQuestInZone() {
    for (const q of Object.values(QUESTS)) {
      const obj = q.objectives.find((o) => o.type === 'kill' && o.targetMobId);
      if (!obj) continue;
      const camp = CAMPS.find(
        (c) => c.mobId === obj.targetMobId && c.center.z >= ZONE.zMin && c.center.z < ZONE.zMax,
      );
      if (camp) return { quest: q, camp };
    }
    throw new Error('expected a kill quest with a camp in the first zone');
  }
  const { quest } = requireKillQuestInZone();
  const activeLog = (): Map<string, QuestProgress> =>
    new Map([
      [
        quest.id,
        { questId: quest.id, counts: quest.objectives.map(() => 0), state: 'active' as const },
      ],
    ]);

  it('plots a blob over the target camp for an active kill quest (both shapes, identical)', () => {
    const sim = buildOverworldMapModel(input(makeOverworldWorld('sim', activeLog()), 1));
    const client = buildOverworldMapModel(input(makeOverworldWorld('client', activeLog()), 1));
    expect(sim.questAreas.length).toBeGreaterThan(0);
    expect(client.questAreas).toEqual(sim.questAreas);
    for (const a of sim.questAreas) {
      expect(a.radius).toBeGreaterThan(0);
      expect(Number.isFinite(a.mx)).toBe(true);
      expect(Number.isFinite(a.my)).toBe(true);
    }
  });

  it('plots nothing with an empty quest log or once the quest is turn-in ready', () => {
    expect(buildOverworldMapModel(input(makeOverworldWorld('sim'), 1)).questAreas).toEqual([]);
    const readyLog: Map<string, QuestProgress> = new Map([
      [
        quest.id,
        {
          questId: quest.id,
          counts: quest.objectives.map((o) => o.count),
          state: 'ready' as const,
        },
      ],
    ]);
    expect(
      buildOverworldMapModel(input(makeOverworldWorld('sim', readyLog), 1)).questAreas,
    ).toEqual([]);
  });

  it('scales the blob radius with the zoom level', () => {
    const z1 = buildOverworldMapModel(input(makeOverworldWorld('sim', activeLog()), 1));
    const z2 = buildOverworldMapModel(input(makeOverworldWorld('sim', activeLog()), 2));
    expect(z2.questAreas[0].radius).toBeCloseTo(z1.questAreas[0].radius * 2, 5);
  });

  it('numbers areas by the quest log acceptance order and drops untracked quests', () => {
    const model = buildOverworldMapModel(input(makeOverworldWorld('sim', activeLog()), 1));
    // single-quest log: every area carries badge number 1
    for (const a of model.questAreas) expect(a.numbers).toEqual([1]);
    // untracking the quest removes its areas entirely
    const untracked = buildOverworldMapModel({
      ...input(makeOverworldWorld('sim', activeLog()), 1),
      untrackedQuestIds: new Set([quest.id]),
    });
    expect(untracked.questAreas).toEqual([]);
  });

  it('hit-tests a hovered point to the objective identities under it (deduped)', () => {
    const model = buildOverworldMapModel(input(makeOverworldWorld('sim', activeLog()), 1));
    const a = model.questAreas[0];
    // the blob carries its objective identity for the tooltip
    expect(a.objectives.length).toBeGreaterThan(0);
    const inside = questAreaObjectivesAt(model.questAreas, a.mx, a.my);
    expect(inside.length).toBeGreaterThan(0);
    expect(inside.some((r) => r.questId === quest.id)).toBe(true);
    // far outside every blob: nothing under the cursor
    expect(questAreaObjectivesAt(model.questAreas, -10_000, -10_000)).toEqual([]);
    // overlapping duplicates never repeat a ref
    const dup = questAreaObjectivesAt([...model.questAreas, ...model.questAreas], a.mx, a.my);
    expect(dup).toEqual(inside);
  });
});
