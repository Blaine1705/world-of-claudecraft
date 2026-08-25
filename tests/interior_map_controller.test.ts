import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import { IGNIVAR_FORGE_APPROACH_ID } from '../src/sim/ignivar_raid_ids';
import type { IWorld } from '../src/world_api';

const calls = vi.hoisted(() => ({
  dungeonMinimap: vi.fn(),
  dungeonWorld: vi.fn(),
  lastKeepMinimap: vi.fn(),
  lastKeepWorld: vi.fn(),
  dawnholdMinimap: vi.fn(),
  dawnholdWorld: vi.fn(),
}));

vi.mock('../src/ui/dungeon_map_painter', () => ({
  DungeonMapPainter: class {
    paintMinimap(...args: unknown[]): void {
      calls.dungeonMinimap(...args);
    }
    paintWorldMap(...args: unknown[]): unknown {
      calls.dungeonWorld(...args);
      return { model: { markers: [] }, title: 'Dungeon title' };
    }
  },
}));

vi.mock('../src/ui/lastkeep_map_painter', () => {
  const dawnholdSpec = { id: 'dawnhold' };
  return {
    DAWNHOLD_MAP_PAINTER_SPEC: dawnholdSpec,
    LastKeepMapPainter: class {
      private readonly dawnhold: boolean;
      constructor(_writers: unknown, _classColor: unknown, spec?: unknown) {
        this.dawnhold = spec === dawnholdSpec;
      }
      paintMinimap(...args: unknown[]): void {
        (this.dawnhold ? calls.dawnholdMinimap : calls.lastKeepMinimap)(...args);
      }
      paintWorldMap(...args: unknown[]): string {
        (this.dawnhold ? calls.dawnholdWorld : calls.lastKeepWorld)(...args);
        return this.dawnhold ? 'Dawnhold title' : 'Last Keep title';
      }
    },
  };
});

import { InteriorMapController } from '../src/ui/interior_map_controller';

function worldAtDungeon(dungeonId: string): IWorld {
  const dungeon = DUNGEONS[dungeonId];
  const origin = instanceOrigin(dungeon.index, 0);
  const player = {
    id: 1,
    kind: 'player',
    templateId: 'warrior',
    name: 'Mapper',
    pos: { x: origin.x, y: 0, z: origin.z },
    facing: 0,
  };
  return {
    player,
    entities: new Map([[player.id, player]]),
    partyInfo: null,
    riftFloor: null,
    delveRun: null,
  } as unknown as IWorld;
}

function worldAtInterior(interior: string): IWorld {
  const entry = Object.entries(DUNGEONS).find(([, dungeon]) => dungeon.interior === interior);
  if (!entry) throw new Error(`missing ${interior} dungeon fixture`);
  return worldAtDungeon(entry[0]);
}

function outsideWorld(): IWorld {
  const world = worldAtDungeon(IGNIVAR_FORGE_APPROACH_ID);
  world.player.pos.x = 0;
  world.player.pos.z = 0;
  return world;
}

function controller(): InteriorMapController {
  return new InteriorMapController({} as never, () => '#fff');
}

describe('InteriorMapController', () => {
  it('routes minimap paint to dungeon, Last Keep, and Dawnhold without fallthrough', () => {
    const subject = controller();
    const ctx = {} as CanvasRenderingContext2D;
    const label = {} as HTMLElement;
    const dungeon = worldAtDungeon(IGNIVAR_FORGE_APPROACH_ID);
    const lastKeep = worldAtInterior('lastkeep');
    const dawnhold = worldAtInterior('dawnhold');
    expect(subject.paintMinimap(ctx, dungeon, label, 162, 1.25)).toBe(true);
    expect(subject.paintMinimap(ctx, lastKeep, label, 162, 1.25)).toBe(true);
    expect(subject.paintMinimap(ctx, dawnhold, label, 162, 1.25)).toBe(true);
    expect(subject.paintMinimap(ctx, outsideWorld(), label, 162, 1.25)).toBe(false);
    expect(calls.dungeonMinimap).toHaveBeenCalledExactlyOnceWith(ctx, dungeon, label, 162, 1.25);
    expect(calls.lastKeepMinimap).toHaveBeenCalledExactlyOnceWith(ctx, lastKeep, label, 162, 1.25);
    expect(calls.dawnholdMinimap).toHaveBeenCalledExactlyOnceWith(ctx, dawnhold, label, 162, 1.25);
  });

  it('routes M-map paint to the exact dungeon or castle painter', () => {
    const subject = controller();
    const ctx = {} as CanvasRenderingContext2D;
    const dungeon = worldAtDungeon(IGNIVAR_FORGE_APPROACH_ID);
    const lastKeep = worldAtInterior('lastkeep');
    const dawnhold = worldAtInterior('dawnhold');
    expect(subject.paintDungeonWorldMap(ctx, dungeon, 560)).toEqual({
      model: { markers: [] },
      title: 'Dungeon title',
    });
    expect(subject.paintDungeonWorldMap(ctx, outsideWorld(), 560)).toBeNull();
    expect(subject.paintCastleWorldMap(ctx, lastKeep, 560)).toBe('Last Keep title');
    expect(subject.paintCastleWorldMap(ctx, dawnhold, 560)).toBe('Dawnhold title');
    expect(
      subject.paintCastleWorldMap(ctx, worldAtDungeon(IGNIVAR_FORGE_APPROACH_ID), 560),
    ).toBeNull();
    expect(calls.dungeonWorld).toHaveBeenCalledExactlyOnceWith(ctx, dungeon, 560);
    expect(calls.lastKeepWorld).toHaveBeenCalledExactlyOnceWith(ctx, lastKeep, 560);
    expect(calls.dawnholdWorld).toHaveBeenCalledExactlyOnceWith(ctx, dawnhold, 560);
  });

  it('keeps the HUD dungeon branch schematic and accessibility wiring intact', () => {
    const hud = readFileSync('src/ui/hud.ts', 'utf8');
    expect(hud).toMatch(
      /const schematic = inRift \|\| inDelve \|\| inBattleground \|\| inDungeon;/,
    );
    expect(hud).toContain("this.setDisplay($('#map-level-toggle'), schematic ? 'none' : 'block')");
    expect(hud).toContain(
      "this.setDisplay($('#map-zoom'), schematic || this.mapLevel === 'continent' ? 'none' : 'flex')",
    );
    const start = hud.indexOf('if (inDungeon) {');
    const end = hud.indexOf("this.setText(\n      $('#map-level-toggle')", start);
    const branch = hud.slice(start, end);
    expect(branch).toContain('paintDungeonWorldMap(ctx, this.sim, S)');
    expect(branch).toContain("t('hud.core.mapSummary', { zone: title })");
    expect(branch).toContain('semantics.updateDungeon(result?.model ?? null, title, S)');
    expect(hud).toContain('this.interiorMaps.paintMinimap(');
    expect(hud).toContain('this.interiorMaps.paintCastleWorldMap(ctx, this.sim, S)');
  });
});
