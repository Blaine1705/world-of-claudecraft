// Lantern Hall's trophy room (render-only): the pure states off the viewer's clear records
// (src/render/highwatch_guild_trophies_core.ts) and the painter that flips the model's trophy
// and gilding parts (src/render/highwatch_guild_trophies.ts).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GUILD_TROPHY_DUNGEONS as BUILT } from '../scripts/assets/highwatch_guild/build.mjs';
import { createGuildTrophyRoom, visibilityNode } from '../src/render/highwatch_guild_trophies';
import {
  GUILD_TROPHY_DUNGEONS,
  guildTrophyNodeNames,
  guildTrophySignature,
  guildTrophySignatureOf,
  guildTrophyStates,
} from '../src/render/highwatch_guild_trophies_core';

describe('the trophy states', () => {
  it('keeps a plaque for each of the five dungeons the model carries', () => {
    expect([...GUILD_TROPHY_DUNGEONS]).toEqual([...BUILT]);
  });

  it('hangs a trophy for any clear and gilds it for a Heroic one', () => {
    const states = guildTrophyStates({
      hollow_crypt: 2,
      'sunken_bastion:heroic': 1,
      drowned_temple: 0,
      'drowned_temple:heroic': -3,
    });
    expect(states.map((s) => [s.dungeon, s.trophy, s.gilt])).toEqual([
      ['hollow_crypt', true, false],
      ['sunken_bastion', true, true],
      ['drowned_temple', false, false],
      ['wildheart_basin', false, false],
      ['gravewyrm_sanctum', false, false],
    ]);
    expect(guildTrophyStates(undefined).every((s) => !s.trophy && !s.gilt)).toBe(true);
    // the signature moves with every bit and only with them
    const a = guildTrophySignature(states);
    expect(
      guildTrophySignature(guildTrophyStates({ hollow_crypt: 9, 'sunken_bastion:heroic': 4 })),
    ).toBe(a);
    expect(guildTrophySignature(guildTrophyStates({ hollow_crypt: 1 }))).not.toBe(a);
    // the painter's allocation-free per-frame signature agrees with the shaped one
    for (const record of <(Record<string, number> | undefined)[]>[
      undefined,
      {},
      { hollow_crypt: 1 },
      { 'gravewyrm_sanctum:heroic': 2, wildheart_basin: 1, 'drowned_temple:heroic': -1 },
      { hollow_crypt: 2, 'sunken_bastion:heroic': 1, drowned_temple: 0 },
    ]) {
      expect(guildTrophySignatureOf(record)).toBe(guildTrophySignature(guildTrophyStates(record)));
    }
    expect(guildTrophySignatureOf({ 'gravewyrm_sanctum:heroic': 1 })).toBe(0b11 << 8);
  });
});

describe('the trophy room painter', () => {
  function town() {
    const root = new THREE.Group();
    const guild = new THREE.Group();
    guild.name = 'highwatchBuilding:highwatch_guild';
    const parts: Record<string, THREE.Object3D> = {};
    for (const dungeon of GUILD_TROPHY_DUNGEONS) {
      for (const name of Object.values(guildTrophyNodeNames(dungeon))) {
        const node = new THREE.Object3D();
        node.name = name;
        guild.add(node);
        parts[name] = node;
      }
    }
    return { root, guild, parts };
  }

  it("waits for the model, then shows only the viewer's trophies, re-applying on a change", () => {
    const { root, guild, parts } = town();
    const room = createGuildTrophyRoom(root);
    const deedStats = { dungeonClears: { gravewyrm_sanctum: 1 } as Record<string, number> };
    const world = { deedStats } as never;
    // the model is not in the town yet: nothing to bind, no throw
    room.sync(world);
    root.add(guild);
    // the retry cadence: the next attempts wait, then the bind lands
    for (let i = 0; i < 12; i++) room.sync(world);
    expect(parts.G_INT_Trophy_gravewyrm_sanctum.visible).toBe(true);
    expect(parts.G_INT_TrophyGilt_gravewyrm_sanctum.visible).toBe(false);
    expect(parts.G_INT_Trophy_hollow_crypt.visible).toBe(false);
    // a Heroic clear lands: the gilding follows on the next sync
    deedStats.dungeonClears['gravewyrm_sanctum:heroic'] = 1;
    room.sync(world);
    expect(parts.G_INT_TrophyGilt_gravewyrm_sanctum.visible).toBe(true);
    // an outside write is not fought every frame: unchanged records apply nothing
    parts.G_INT_Trophy_hollow_crypt.visible = true;
    room.sync(world);
    expect(parts.G_INT_Trophy_hollow_crypt.visible).toBe(true);
  });

  it("keeps an unearned trophy hidden through the low tier's interior cull, a mesh part too", () => {
    // the painted rebuild carries each trophy and gilding in one material, so each loads as one
    // bare mesh: the very object the interior cull (placed_town_buildings.ts) flips
    const root = new THREE.Group();
    const guild = new THREE.Group();
    guild.name = 'highwatchBuilding:highwatch_guild';
    const meshes: Record<string, THREE.Mesh> = {};
    for (const dungeon of GUILD_TROPHY_DUNGEONS) {
      for (const name of Object.values(guildTrophyNodeNames(dungeon))) {
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
        mesh.name = name;
        mesh.position.set(1, 2, 3);
        guild.add(mesh);
        meshes[name] = mesh;
      }
    }
    root.add(guild);
    root.updateMatrixWorld(true);
    const before = meshes.G_INT_Trophy_hollow_crypt.matrixWorld.clone();
    const room = createGuildTrophyRoom(root);
    const world = { deedStats: { dungeonClears: { hollow_crypt: 1 } } } as never;
    room.sync(world);
    const shown = (name: string) => {
      let node: THREE.Object3D | null = meshes[name];
      while (node) {
        if (!node.visible) return false;
        node = node.parent;
      }
      return true;
    };
    expect(shown('G_INT_Trophy_hollow_crypt')).toBe(true);
    expect(shown('G_INT_Trophy_sunken_bastion')).toBe(false);
    expect(shown('G_INT_TrophyGilt_hollow_crypt')).toBe(false);
    // the cull hides every interior mesh as the viewer walks away, then re-shows them all
    for (const mesh of Object.values(meshes)) mesh.visible = false;
    room.sync(world);
    for (const mesh of Object.values(meshes)) mesh.visible = true;
    room.sync(world);
    expect(shown('G_INT_Trophy_hollow_crypt')).toBe(true);
    expect(shown('G_INT_Trophy_sunken_bastion')).toBe(false);
    expect(shown('G_INT_TrophyGilt_hollow_crypt')).toBe(false);
    // the holder stands where the mesh did: the part has not moved, and keeps its name
    root.updateMatrixWorld(true);
    expect(meshes.G_INT_Trophy_hollow_crypt.matrixWorld.equals(before)).toBe(true);
    expect(guild.getObjectByName('G_INT_Trophy_hollow_crypt')).toBe(
      meshes.G_INT_Trophy_hollow_crypt,
    );
    // a group part is flipped as itself
    const group = new THREE.Group();
    expect(visibilityNode(group)).toBe(group);
  });
});
