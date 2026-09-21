import { existsSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { ASSETS } from '../scripts/assets/forge_room/build.mjs';
import {
  buildHoardRoomKit,
  FORGE_KIT_URL,
  hoardRoomKitInternalsForTest,
} from '../src/render/hoard_room_kit';
import {
  buildForgeRoomKitPlan,
  FORGE_KIT_PIECES,
  ROOM_KIT_DAIS_CLEAR,
  ROOM_KIT_WALL_BAND,
  type RoomKitPlacement,
  roomKitFor,
} from '../src/render/hoard_room_kit_core';
import { type HoardValleyLayoutInput, hoardValleySpanAtZ } from '../src/render/hoard_valley_core';
import { devHoardDestination } from '../src/sim/dev/hoard_travel';
import { RIFT_RANK_BASE_LEVEL } from '../src/sim/rift/ranks';
import { generateRiftFloor, generateRiftPlan } from '../src/sim/rift/rift_gen';

function emberRoom(): { layout: HoardValleyLayoutInput; seed: number } {
  const destination = devHoardDestination('ember');
  if (!destination) throw new Error('no ember hoard seed');
  const plan = generateRiftPlan(destination.seed, RIFT_RANK_BASE_LEVEL.S);
  const floor = generateRiftFloor(destination.seed, RIFT_RANK_BASE_LEVEL.S, plan.floorCount - 1);
  return { layout: floor.layout, seed: floor.seed };
}

/** A plain box room of another size: the kit must not depend on one layout. */
function boxRoom(halfX: number, depth: number): HoardValleyLayoutInput {
  return {
    zMin: 0,
    zMax: depth,
    floorHalfX: halfX,
    dais: { x: 0, z: depth - 18, r: 12 },
    shellPolygon: [
      { x: halfX, z: 0 },
      { x: halfX, z: depth },
      { x: -halfX, z: depth },
      { x: -halfX, z: 0 },
    ],
  };
}

const key = (p: RoomKitPlacement) =>
  `${p.piece}@${p.x.toFixed(3)},${p.z.toFixed(3)},${p.yaw.toFixed(3)}`;

describe('forge room kit plan', () => {
  it('belongs to the Emberforge Tyrant alone', () => {
    expect(roomKitFor('rift_boss_ember')).toBe('forge');
    expect(roomKitFor('rift_boss_frost')).toBeNull();
    expect(roomKitFor(undefined)).toBeNull();
  });

  it('is decided by the seed: one hoard, one room, for every player', () => {
    const { layout, seed } = emberRoom();
    const a = buildForgeRoomKitPlan(layout, seed, 'high');
    const b = buildForgeRoomKitPlan(layout, seed, 'high');
    expect(a).toEqual(b);
    const other = buildForgeRoomKitPlan(layout, seed + 1, 'high');
    expect(other.placements.map(key)).not.toEqual(a.placements.map(key));
  });

  it('sets ONE Great Forge into the end wall, behind the boss, facing the room', () => {
    const { layout, seed } = emberRoom();
    for (const tier of ['high', 'medium', 'low'] as const) {
      const heroes = buildForgeRoomKitPlan(layout, seed, tier).placements.filter(
        (p) => p.category === 'hero',
      );
      expect(heroes).toHaveLength(1);
      expect(heroes[0].piece).toBe('GreatForge');
      expect(heroes[0].z).toBeGreaterThan(layout.dais.z + layout.dais.r * 0.5);
      expect(heroes[0].z).toBeLessThanOrEqual(layout.zMax);
      expect(heroes[0].yaw).toBeCloseTo(Math.PI, 6);
    }
  });

  it('keeps every prop against a wall and off the ground of the boss: the fight stays clear', () => {
    for (const { layout, seed } of [
      emberRoom(),
      { layout: boxRoom(30, 90), seed: 7 },
      { layout: boxRoom(46, 170), seed: 99 },
    ]) {
      const plan = buildForgeRoomKitPlan(layout, seed, 'high');
      expect(plan.placements.length).toBeGreaterThan(10);
      for (const p of plan.placements) {
        if (p.category === 'hero') continue;
        const span = hoardValleySpanAtZ(layout, Math.min(layout.zMax - 0.01, p.z));
        const toSide = Math.min(p.x - span.minX, span.maxX - p.x);
        const toBack = layout.zMax - p.z;
        expect(Math.min(toSide, toBack), `${p.piece} at ${p.x},${p.z}`).toBeLessThanOrEqual(
          ROOM_KIT_WALL_BAND,
        );
        // Inside the room, never out in the rock.
        expect(toSide, `${p.piece} inside`).toBeGreaterThan(0);
        expect(
          Math.hypot(p.x - layout.dais.x, p.z - layout.dais.z),
          `${p.piece} off the dais`,
        ).toBeGreaterThanOrEqual(layout.dais.r + ROOM_KIT_DAIS_CLEAR);
      }
      // Both walls are dressed, and not as mirror images.
      const left = plan.placements.filter((p) => p.x < -5 && p.category !== 'hero');
      const right = plan.placements.filter((p) => p.x > 5 && p.category !== 'hero');
      expect(left.length).toBeGreaterThan(3);
      expect(right.length).toBeGreaterThan(3);
      expect(left.map((p) => `${p.piece}@${p.z.toFixed(1)}`)).not.toEqual(
        right.map((p) => `${p.piece}@${p.z.toFixed(1)}`),
      );
    }
  });

  it('sheds by tier without moving anything: low is a subset of medium of high', () => {
    const { layout, seed } = emberRoom();
    const high = buildForgeRoomKitPlan(layout, seed, 'high');
    const medium = buildForgeRoomKitPlan(layout, seed, 'medium');
    const low = buildForgeRoomKitPlan(layout, seed, 'low');
    const inHigh = new Set(high.placements.map(key));
    const inMedium = new Set(medium.placements.map(key));
    for (const p of medium.placements) expect(inHigh.has(key(p))).toBe(true);
    for (const p of low.placements) expect(inMedium.has(key(p))).toBe(true);
    expect(low.placements.length).toBeLessThan(medium.placements.length);
    expect(medium.placements.length).toBeLessThan(high.placements.length);
    // Low keeps the room's identity: the forge, big silhouettes, the floor's lines.
    expect(low.placements.every((p) => p.category === 'hero' || p.category === 'large')).toBe(true);
    expect(low.placements.some((p) => p.piece === 'GreatForge')).toBe(true);
    expect(low.floor.some((m) => m.kind === 'channel')).toBe(true);
    // Nothing dark is scattered over the floor of the fight, on any tier.
    const kinds = ['plate', 'channel', 'channel-edge', 'ring', 'glow'];
    for (const plan of [high, medium, low]) {
      expect(plan.floor.every((m) => kinds.includes(m.kind))).toBe(true);
    }
    expect(medium.placements.some((p) => p.category === 'filler')).toBe(false);
  });

  it('keeps the molten channels at the foot of the walls, never across the fight', () => {
    const { layout, seed } = emberRoom();
    const plan = buildForgeRoomKitPlan(layout, seed, 'high');
    const channels = plan.floor.filter((m) => m.kind === 'channel' || m.kind === 'channel-edge');
    expect(channels.length).toBeGreaterThan(10);
    for (const mark of channels) {
      const span = hoardValleySpanAtZ(layout, Math.min(layout.zMax - 0.01, mark.z));
      const toSide = Math.min(mark.x - span.minX, span.maxX - mark.x);
      const toBack = layout.zMax - mark.z;
      expect(Math.min(toSide, toBack)).toBeLessThanOrEqual(4);
    }
  });
});

describe('forge room kit view', () => {
  afterEach(() => hoardRoomKitInternalsForTest.clear());

  function fakeKit(): THREE.Group {
    const scene = new THREE.Group();
    for (const piece of FORGE_KIT_PIECES) {
      const node = new THREE.Group();
      node.name = `Kit_${piece}`;
      for (const name of ['ForgeSolid', 'ForgeMolten']) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        geometry.setAttribute(
          'color',
          new THREE.BufferAttribute(
            new Float32Array(geometry.getAttribute('position').count * 4).fill(0.5),
            4,
          ),
        );
        const material = new THREE.MeshStandardMaterial();
        material.name = name;
        node.add(new THREE.Mesh(geometry, material));
      }
      scene.add(node);
    }
    return scene;
  }

  it('draws the whole room in instances: two draws a piece, never one per prop', () => {
    hoardRoomKitInternalsForTest.seedScene(fakeKit());
    expect(hoardRoomKitInternalsForTest.pieces().sort()).toEqual([...FORGE_KIT_PIECES].sort());
    const { layout, seed } = emberRoom();
    const plan = buildForgeRoomKitPlan(layout, seed, 'high');
    const view = buildHoardRoomKit(plan, 'high', false);
    const instanced = view.group.children.filter(
      (child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh,
    );
    expect(instanced.length).toBeLessThanOrEqual(FORGE_KIT_PIECES.length * 2);
    for (const piece of FORGE_KIT_PIECES) {
      const wanted = plan.placements.filter((p) => p.piece === piece).length;
      for (const mesh of instanced.filter((m) => m.name === `HoardRoomKit:${piece}`)) {
        expect(mesh.count).toBe(wanted);
      }
    }
    // Floor marks, channels, firelight, sparks: a handful of draws, whatever the room.
    expect(view.group.children.length).toBeLessThanOrEqual(FORGE_KIT_PIECES.length * 2 + 4);
    expect(view.group.getObjectByName('HoardRoomKitSparks')).toBeDefined();
    expect(() => {
      view.update(1.25);
      view.update(2.5);
    }).not.toThrow();
    view.dispose();
    view.dispose();
  });

  it('sheds the sparks and the sway on the low tier, and survives a kit that never loaded', () => {
    const { layout, seed } = emberRoom();
    const bare = buildHoardRoomKit(buildForgeRoomKitPlan(layout, seed, 'high'), 'high', false);
    // No kit yet: only the floor is drawn, and nothing throws.
    expect(bare.group.children.some((child) => child instanceof THREE.InstancedMesh)).toBe(false);
    bare.dispose();
    hoardRoomKitInternalsForTest.seedScene(fakeKit());
    const low = buildHoardRoomKit(buildForgeRoomKitPlan(layout, seed, 'low'), 'low', false);
    expect(low.group.getObjectByName('HoardRoomKitSparks')).toBeUndefined();
    expect(low.group.getObjectByName('HoardRoomKit:GreatForge')).toBeDefined();
    expect(low.group.getObjectByName('HoardRoomKit:ChainHook')).toBeUndefined();
    low.dispose();
  });
});

describe('the shipped forge kit', () => {
  it('exists, keeps its named parts and two materials, carries its painted colours, and is small', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    expect(ASSETS.map((asset) => asset.target)).toEqual([`public${FORGE_KIT_URL}`]);
    const asset = ASSETS[0];
    expect(existsSync(asset.source)).toBe(true);
    expect(existsSync(asset.target)).toBe(true);
    const shipped = (await io.read(asset.target)).getRoot();
    expect(
      shipped
        .listNodes()
        .map((node) => node.getName())
        .sort(),
    ).toEqual(asset.nodes);
    expect(asset.nodes.filter((name) => name.startsWith('Kit_')).sort()).toEqual(
      FORGE_KIT_PIECES.map((piece) => `Kit_${piece}`).sort(),
    );
    expect(
      shipped
        .listMaterials()
        .map((material) => material.getName())
        .sort(),
    ).toEqual(['ForgeMolten', 'ForgeSolid']);
    expect((shipped.getExtras() as { authoring?: string }).authoring).toBe('Blender');
    expect(shipped.listTextures()).toHaveLength(0);
    let triangles = 0;
    for (const mesh of shipped.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        triangles += (primitive.getIndices()?.getCount() ?? 0) / 3;
        // The room is unlit: a part without its painted colours would be a white block.
        expect(primitive.getAttribute('COLOR_0')).not.toBeNull();
      }
    }
    expect(triangles).toBeGreaterThan(3000);
    expect(triangles).toBeLessThan(9000);
  });
});
