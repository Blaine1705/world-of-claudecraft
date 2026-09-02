import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { syncWorldQuestCarryVisual } from '../src/render/world_quest_carry_visual';
import { worldQuestFreightVisualInternalsForTest } from '../src/render/world_quest_freight_visual';
import { hasWorldQuestDeliveryCargo } from '../src/sim/world_quest_delivery';

describe('world quest freight visual', () => {
  it('recognizes public entity cargo', () => {
    const entity = {
      auras: [
        {
          id: 'world_quest_delivery_cargo',
          kind: 'world_quest_cargo' as const,
        },
      ],
    };
    expect(hasWorldQuestDeliveryCargo(entity as never)).toBe(true);
    expect(hasWorldQuestDeliveryCargo({ auras: [] } as never)).toBe(false);
  });

  it('builds once on pickup, follows the player group, and detaches on drop', () => {
    const parent = new THREE.Group();
    const crate = new THREE.Group();
    crate.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
    const build = vi.fn(() => ({ group: crate }));

    const carrying = syncWorldQuestCarryVisual(null, parent, true, build);
    expect(carrying?.root).toBe(crate);
    expect(parent.children).toContain(crate);
    expect(crate.position).toMatchObject({ x: 0, y: 0.88, z: 0.48 });
    expect(syncWorldQuestCarryVisual(carrying, parent, true, build)).toBe(carrying);
    expect(build).toHaveBeenCalledTimes(1);

    expect(syncWorldQuestCarryVisual(carrying, parent, false, build)).toBeNull();
    expect(parent.children).not.toContain(crate);
  });

  it('uses the shipped wagon, horse, and crate models', () => {
    expect(worldQuestFreightVisualInternalsForTest.assetUrls).toEqual({
      wagon: '/models/biome/city_wagon.glb',
      horse: '/models/mounts/valorsteed.glb',
      crate: '/models/quest/supply_crate.glb',
    });
  });

  it('keeps the real character and ground-object renderer wiring', () => {
    const freightVisual = readFileSync(
      new URL('../src/render/world_quest_freight_visual.ts', import.meta.url),
      'utf8',
    );
    const renderer = readFileSync(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
    const questObjects = readFileSync(
      new URL('../src/render/quest_objects.ts', import.meta.url),
      'utf8',
    );
    expect(renderer).toContain('v.worldQuestCarryVisual = syncWorldQuestCarryVisual(');
    expect(renderer).toContain('!e.dead && !e.mountKey && hasWorldQuestDeliveryCargo(e)');
    expect(questObjects).toContain("if (itemId === 'eastbrook_freight_wagon')");
    expect(questObjects).toContain('const freightWagon = buildWorldQuestFreightWagon();');
    expect(questObjects).toContain('if (freightWagon) return freightWagon;');
    expect(freightVisual).toContain('clone as cloneSkinned');
    expect(freightVisual).toContain('const horse = cloneSkinned(horseSource);');
    expect(freightVisual).toContain('horse.position.set(x, 0, 3.45);');
    expect(freightVisual).toContain(
      'return { group: cloneSkinned(template) as THREE.Group, height: 2.3 };',
    );
  });
});
