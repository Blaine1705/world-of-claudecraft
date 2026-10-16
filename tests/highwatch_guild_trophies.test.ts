// Lantern Hall's trophy room (render-only): the pure states off the viewer's clear records
// (src/render/highwatch_guild_trophies_core.ts) and the painter that flips the model's trophy
// and gilding parts (src/render/highwatch_guild_trophies.ts).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GUILD_TROPHY_DUNGEONS as BUILT } from '../scripts/assets/highwatch_guild/build.mjs';
import { createGuildTrophyRoom } from '../src/render/highwatch_guild_trophies';
import {
  GUILD_TROPHY_DUNGEONS,
  guildTrophyNodeNames,
  guildTrophySignature,
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
});
