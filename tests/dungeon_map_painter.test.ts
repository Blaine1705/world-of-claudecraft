import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import {
  IGNIVAR_EMBER_SENTINEL_ID,
  IGNIVAR_FORGE_APPROACH_ID,
  IGNIVAR_GATE_LOCKED_TEMPLATE,
  IGNIVAR_MOLTEN_ASSEMBLY_ID,
  VARKHUL_BOSS_ID,
} from '../src/sim/ignivar_raid_ids';
import { DungeonMapPainter } from '../src/ui/dungeon_map_painter';
import { buildDungeonMinimapModel, buildDungeonWorldMapModel } from '../src/ui/dungeon_map_view';
import { dungeonDisplayName } from '../src/ui/entity_i18n';
import type { PainterHostWriters } from '../src/ui/painter_host';
import type { IWorld } from '../src/world_api';

class RecordingContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 1;
  globalAlpha = 1;
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  fills: string[] = [];
  strokes: string[] = [];
  strokeRecords: Array<{ style: string; width: number }> = [];
  clips = 0;
  arcs: Array<{ x: number; y: number; r: number; style: string }> = [];
  moves: Array<{ x: number; y: number; style: string }> = [];
  texts: string[] = [];
  draws = 0;

  clearRect(): void {}
  fillRect(): void {
    this.fills.push(String(this.fillStyle));
  }
  beginPath(): void {}
  moveTo(x: number, y: number): void {
    this.moves.push({ x, y, style: String(this.fillStyle) });
  }
  lineTo(): void {}
  closePath(): void {}
  fill(): void {
    this.fills.push(String(this.fillStyle));
  }
  stroke(): void {
    this.strokes.push(String(this.strokeStyle));
    this.strokeRecords.push({ style: String(this.strokeStyle), width: this.lineWidth });
  }
  arc(x: number, y: number, r: number): void {
    this.arcs.push({ x, y, r, style: String(this.fillStyle) });
  }
  save(): void {}
  restore(): void {}
  clip(): void {
    this.clips++;
  }
  translate(): void {}
  rotate(): void {}
  drawImage(): void {
    this.draws++;
  }
  strokeText(text: string): void {
    this.texts.push(text);
  }
  fillText(text: string): void {
    this.texts.push(text);
  }
}

function raidWorld(dungeonId = IGNIVAR_FORGE_APPROACH_ID): IWorld {
  const origin = instanceOrigin(DUNGEONS[dungeonId].index, 0);
  const player = {
    id: 1,
    kind: 'player',
    templateId: 'warrior',
    name: 'Tester',
    pos: { x: origin.x, y: 0, z: origin.z },
    facing: 0,
  };
  const mob = {
    id: 2,
    kind: 'mob',
    templateId: IGNIVAR_EMBER_SENTINEL_ID,
    name: 'Sentinel',
    pos: { x: origin.x + 4, y: 0, z: origin.z },
    hostile: true,
    dead: false,
    lootable: false,
    aggroTargetId: player.id,
  };
  const gate = {
    id: 3,
    kind: 'object',
    templateId: IGNIVAR_GATE_LOCKED_TEMPLATE,
    name: 'Gate',
    pos: { x: origin.x, y: 0, z: origin.z + 12 },
    hostile: false,
    dead: false,
    lootable: false,
  };
  return {
    player,
    entities: new Map<number, unknown>([
      [player.id, player],
      [mob.id, mob],
      [gate.id, gate],
    ]),
    partyInfo: null,
    riftFloor: null,
    delveRun: null,
  } as unknown as IWorld;
}

function raidMarkerWorld(): IWorld {
  const world = raidWorld();
  const { x, z } = world.player.pos;
  const entities = world.entities as Map<number, unknown>;
  entities.set(4, {
    id: 4,
    kind: 'mob',
    templateId: IGNIVAR_EMBER_SENTINEL_ID,
    name: 'Idle Sentinel',
    pos: { x: x + 6, y: 0, z },
    hostile: true,
    dead: false,
    lootable: false,
    aggroTargetId: null,
  });
  entities.set(5, {
    id: 5,
    kind: 'mob',
    templateId: VARKHUL_BOSS_ID,
    name: 'Boss',
    pos: { x: x - 6, y: 0, z },
    hostile: true,
    dead: false,
    lootable: false,
    aggroTargetId: world.player.id,
  });
  entities.set(6, {
    id: 6,
    kind: 'object',
    templateId: 'dungeon_exit',
    name: 'Exit',
    pos: { x, y: 0, z: z - 6 },
    lootable: false,
  });
  entities.set(7, {
    id: 7,
    kind: 'object',
    templateId: 'raid_cache',
    name: 'Cache',
    pos: { x: x + 6, y: 0, z: z + 6 },
    lootable: true,
  });
  entities.set(8, {
    id: 8,
    kind: 'npc',
    templateId: 'ignivar_maelin',
    name: 'Maelin',
    pos: { x: x - 6, y: 0, z: z - 6 },
  });
  (world as unknown as { partyInfo: unknown }).partyInfo = {
    members: [
      { pid: world.player.id, x, z, cls: 'warrior', dead: 0 },
      { pid: 20, x: x + 3, z: z + 3, cls: 'mage', dead: 0 },
      { pid: 21, x: x - 3, z: z - 3, cls: 'priest', dead: 1 },
    ],
  };
  return world;
}

describe('DungeonMapPainter', () => {
  const setText = vi.fn();
  const writers = { setText } as unknown as PainterHostWriters;
  let createdContexts: RecordingContext[];

  beforeEach(() => {
    createdContexts = [];
    setText.mockClear();
    vi.stubGlobal('document', {
      documentElement: {},
      createElement: () => {
        const context = new RecordingContext();
        createdContexts.push(context);
        return { width: 0, height: 0, getContext: () => context };
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => `paint:${name}`,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('paints the authoritative floor plan and live markers into the circular minimap', () => {
    const ctx = new RecordingContext();
    const label = {} as HTMLElement;
    const painter = new DungeonMapPainter(writers, (cls) => `class:${cls}`);

    painter.paintMinimap(ctx as unknown as CanvasRenderingContext2D, raidWorld(), label, 162, 1);

    const plate = createdContexts[0];
    expect(plate).toBeDefined();
    expect(setText).toHaveBeenCalledWith(label, dungeonDisplayName(IGNIVAR_FORGE_APPROACH_ID));
    expect(ctx.clips).toBe(1);
    expect(ctx.draws).toBe(1);
    expect(plate.fills).toContain('paint:--color-border-showcase');
    expect(ctx.fills).toContain('paint:--color-minimap-mob-aggro');
    expect(ctx.fills).toContain('paint:--color-minimap-portal');
    expect(plate.fills).toContain('paint:--color-map-ping');
    expect(plate.strokes).toContain('paint:--color-map-castle-wall');
    expect(
      plate.strokeRecords.some(
        (stroke) => stroke.style === 'paint:--color-map-castle-wall' && stroke.width > 3,
      ),
    ).toBe(true);
    expect(plate.arcs.length).toBeGreaterThan(20); // decor footprints + dais
  });

  it('fits the current room on M and returns/draws its localized title', () => {
    const ctx = new RecordingContext();
    const painter = new DungeonMapPainter(writers, (cls) => `class:${cls}`);
    const result = painter.paintWorldMap(
      ctx as unknown as CanvasRenderingContext2D,
      raidWorld(),
      560,
    );

    expect(result?.title).toBe(dungeonDisplayName(IGNIVAR_FORGE_APPROACH_ID));
    expect(ctx.texts).toEqual([result?.title, result?.title]);
    expect(ctx.draws).toBe(1);
    expect(createdContexts[0].fills).toContain('paint:--color-border-showcase');
    expect(createdContexts[0].fills).toContain('paint:--color-map-ping');
    expect(createdContexts[0].strokes).toContain('paint:--color-map-castle-wall');
    expect(createdContexts[0].arcs[0]).toEqual({
      x: result?.model.dais?.cx,
      y: result?.model.dais?.cy,
      r: result?.model.dais?.r,
      style: 'paint:--color-map-region-current-fill',
    });

    const repeated = painter.paintWorldMap(
      ctx as unknown as CanvasRenderingContext2D,
      raidWorld(),
      560,
    );
    expect(repeated).toBe(result);
  });

  it('reuses one offscreen static plate while the minimap player position changes', () => {
    const ctx = new RecordingContext();
    const painter = new DungeonMapPainter(writers, (cls) => `class:${cls}`);
    const first = raidWorld();
    const second = raidWorld();
    second.player.pos.x += 3;

    painter.paintMinimap(
      ctx as unknown as CanvasRenderingContext2D,
      first,
      {} as HTMLElement,
      162,
      1,
    );
    painter.paintMinimap(
      ctx as unknown as CanvasRenderingContext2D,
      second,
      {} as HTMLElement,
      162,
      1,
    );

    expect(createdContexts).toHaveLength(1);
    expect(ctx.draws).toBe(2);
  });

  it('paints every marker family with its authored color and marker scale', () => {
    const ctx = new RecordingContext();
    const world = raidMarkerWorld();
    const painter = new DungeonMapPainter(writers, (cls) => `class:${cls}`);
    painter.paintWorldMap(ctx as unknown as CanvasRenderingContext2D, world, 560);

    for (const color of [
      'paint:--color-minimap-mob',
      'paint:--color-minimap-mob-aggro',
      'paint:--color-minimap-portal',
      'paint:--color-minimap-object-loot',
      'paint:--color-map-label',
      'class:mage',
      'paint:--color-minimap-party-dead',
      'paint:--color-minimap-player',
    ]) {
      expect(ctx.fills).toContain(color);
    }
    expect(ctx.arcs).toContainEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      r: 5,
      style: 'class:mage',
    });
    expect(ctx.arcs).toContainEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      r: 5,
      style: 'paint:--color-minimap-party-dead',
    });

    const model = buildDungeonWorldMapModel(world, 560, Math.round(560 * 0.06));
    const boss = model?.markers.find((marker) => marker.kind === 'mob' && marker.boss);
    expect(boss?.kind).toBe('mob');
    if (boss?.kind === 'mob') {
      expect(ctx.moves).toContainEqual({
        x: boss.cx,
        y: boss.cy - 7,
        style: 'paint:--color-minimap-mob-aggro',
      });
    }
  });

  it('uses the minimap-specific boss and party marker radii', () => {
    const ctx = new RecordingContext();
    const world = raidMarkerWorld();
    const painter = new DungeonMapPainter(writers, (cls) => `class:${cls}`);
    painter.paintMinimap(
      ctx as unknown as CanvasRenderingContext2D,
      world,
      {} as HTMLElement,
      162,
      1,
    );

    expect(ctx.arcs).toContainEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      r: 4,
      style: 'class:mage',
    });
    expect(ctx.arcs).toContainEqual({
      x: expect.any(Number),
      y: expect.any(Number),
      r: 4,
      style: 'paint:--color-minimap-party-dead',
    });
    const boss = buildDungeonMinimapModel(world, 162, 1.7)?.markers.find(
      (marker) => marker.kind === 'mob' && marker.boss,
    );
    expect(boss?.kind).toBe('mob');
    if (boss?.kind === 'mob') {
      expect(ctx.moves).toContainEqual({
        x: boss.cx,
        y: boss.cy - 5.5,
        style: 'paint:--color-minimap-mob-aggro',
      });
    }
  });

  it('invalidates the static plate only when zoom or raid-room layout changes', () => {
    const ctx = new RecordingContext();
    const painter = new DungeonMapPainter(writers, (cls) => `class:${cls}`);
    const approach = raidWorld();

    painter.paintMinimap(
      ctx as unknown as CanvasRenderingContext2D,
      approach,
      {} as HTMLElement,
      162,
      1,
    );
    painter.paintMinimap(
      ctx as unknown as CanvasRenderingContext2D,
      approach,
      {} as HTMLElement,
      162,
      1,
    );
    expect(createdContexts).toHaveLength(1);

    painter.paintMinimap(
      ctx as unknown as CanvasRenderingContext2D,
      approach,
      {} as HTMLElement,
      162,
      1.25,
    );
    expect(createdContexts).toHaveLength(2);

    painter.paintMinimap(
      ctx as unknown as CanvasRenderingContext2D,
      raidWorld(IGNIVAR_MOLTEN_ASSEMBLY_ID),
      {} as HTMLElement,
      162,
      1.25,
    );
    expect(createdContexts).toHaveLength(3);
  });
});
