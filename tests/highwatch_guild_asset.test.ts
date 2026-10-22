import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type Document, type Node as GltfNode, getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  GUILD_TROPHY_DUNGEONS,
  guildSourceFingerprint,
  HIGHWATCH_GUILD_ASSET,
  mergeGuildCollision,
} from '../scripts/assets/highwatch_guild/build.mjs';
import {
  documentTriangles,
  findCoplanarOverlaps,
  visibleOverlaps,
} from '../scripts/assets/highwatch_guild/coplanar.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { isPlacedBuildingInterior } from '../src/render/eastbrook_placed_building';
import { HIGHWATCH_GUILD_SIGN } from '../src/render/highwatch_guild_sign';
import { HIGHWATCH_BUILDINGS_BY_ID } from '../src/sim/highwatch_layout';

// The shipped Highwatch adventurers' guild GLB (public/models/tidehold/highwatch/guild.glb),
// built in Blender by scripts/assets/highwatch_guild/build_guild.py on the manor's kit and
// shipped by build.mjs, which also merges the collision rows the same Blender run writes into
// data/asset_collision_overrides.json. Pins the bytes, the live source fingerprint, the named
// parts the town view draws (the G_INT ones cast no shadow, and each trophy and each plaque's
// gilding is a part of its own for the trophy room), the texture-free materials, the triangle
// budget, the footing the town buries, the door and the open roof the camera's air is cut to,
// the collision rows, and no z-fighting. Re-pin the sha256, size and triangle literals only
// with a re-export.

const ROOT = path.join(__dirname, '..');
const GLB = path.join(ROOT, HIGHWATCH_GUILD_ASSET.target);
const SHIPPED_SHA256 = 'c70acc7ce38193690f1b6c3c13f3a59fd306f3a326e03d26f54d1dca70cd7225';
const SHIPPED_BYTES = 718960;
/** Triangles per named part, from the Blender build report. */
const TRIANGLES: Record<string, number> = {
  GuildShell: 20378,
  GuildRoof: 11360,
  GuildTrim: 2179,
  GuildYard: 3046,
  GuildGlow: 708,
  G_INT_Timber: 1968,
  G_INT_Furnishings: 10356,
  G_INT_Trophy_hollow_crypt: 508,
  G_INT_Trophy_sunken_bastion: 404,
  G_INT_Trophy_drowned_temple: 338,
  G_INT_Trophy_wildheart_basin: 456,
  G_INT_Trophy_gravewyrm_sanctum: 1066,
  G_INT_TrophyGilt_hollow_crypt: 100,
  G_INT_TrophyGilt_sunken_bastion: 100,
  G_INT_TrophyGilt_drowned_temple: 100,
  G_INT_TrophyGilt_wildheart_basin: 100,
  G_INT_TrophyGilt_gravewyrm_sanctum: 100,
};

let doc: Document;

function node(name: string): GltfNode {
  const found = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getName() === name);
  if (!found) throw new Error(`no node ${name}`);
  return found;
}

function trianglesUnder(n: GltfNode): number {
  let total = 0;
  const walk = (m: GltfNode): void => {
    for (const prim of m.getMesh()?.listPrimitives() ?? []) {
      total += (prim.getIndices()?.getCount() ?? 0) / 3;
    }
    for (const child of m.listChildren()) walk(child);
  };
  walk(n);
  return total;
}

interface GuildExtras {
  floor: number;
  door: number[];
  hall: { plate: number; ridge: number; truss: number };
  tower: number[];
  trophies: string[];
  sign: { x: number; y: number; z: number; width: number; height: number; face: number };
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  doc = await io.read(GLB);
});

describe('the Highwatch guild GLB', () => {
  it('carries no light, transmission, volume or texture a post-boot building must not add', () => {
    const used = doc
      .getRoot()
      .listExtensionsUsed()
      .map((ext) => ext.extensionName);
    for (const banned of [
      'KHR_lights_punctual',
      'KHR_materials_transmission',
      'KHR_materials_volume',
    ]) {
      expect(used, banned).not.toContain(banned);
    }
    expect(doc.getRoot().listTextures()).toEqual([]);
    expect(doc.getRoot().listSkins()).toEqual([]);
    expect(doc.getRoot().listAnimations()).toEqual([]);
  });

  it('ships the pinned bytes, in the media manifest, credited as project art', () => {
    const bytes = readFileSync(GLB);
    expect(bytes.length).toBe(SHIPPED_BYTES);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SHIPPED_SHA256);
    expect(bytes.toString('latin1')).toContain('EXT_meshopt_compression');
    expect(MEDIA_ASSETS['models/tidehold/highwatch/guild.glb']).toMatch(
      /^\/media\/models\/tidehold\/highwatch\/guild\.[0-9a-f]{12}\.glb$/,
    );
    const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
    expect(credits).toContain(
      "Highwatch adventurers' guild, Lantern Hall (`public/models/tidehold/highwatch/guild.glb`)",
    );
  });

  it('carries the live source fingerprint, the manor kit it builds with included', () => {
    expect(doc.getRoot().getExtras()).toMatchObject({
      authoring: 'Blender',
      sourceFingerprint: guildSourceFingerprint(),
    });
    // a change to the manor's shared kit re-ships the guild too
    expect(HIGHWATCH_GUILD_ASSET.inputs).toContain('scripts/assets/highwatch_manor/manor_lib.py');
    expect(HIGHWATCH_GUILD_ASSET.inputs).toContain('scripts/assets/highwatch_manor/manor_shell.py');
  });

  it('keeps its named parts under one root, a trophy and a gilding part per dungeon', () => {
    const roots = doc.getRoot().listScenes()[0].listChildren();
    expect(roots.map((n) => n.getName())).toEqual(['HighwatchGuild_ROOT']);
    const parts = roots[0].listChildren().map((n) => n.getName());
    expect([...parts].sort()).toEqual(Object.keys(TRIANGLES).sort());
    expect([...GUILD_TROPHY_DUNGEONS].sort()).toEqual([
      'drowned_temple',
      'gravewyrm_sanctum',
      'hollow_crypt',
      'sunken_bastion',
      'wildheart_basin',
    ]);
    for (const dungeon of GUILD_TROPHY_DUNGEONS) {
      expect(parts).toContain(`G_INT_Trophy_${dungeon}`);
      expect(parts).toContain(`G_INT_TrophyGilt_${dungeon}`);
    }
    // the town view casts no shadow from a part under a G_INT group
    // (render/eastbrook_placed_building.ts): the trusses, the furniture and the trophies
    for (const name of parts.filter((part) => part.startsWith('G_INT'))) {
      expect(isPlacedBuildingInterior({ name, parent: null } as never), name).toBe(true);
    }
    for (const name of ['GuildShell', 'GuildRoof', 'GuildYard']) {
      expect(isPlacedBuildingInterior({ name, parent: null } as never), name).toBe(false);
    }
  });

  it('ships texture-free materials, unskinned and still, the lit glass warm', () => {
    const root = doc.getRoot();
    const names = root
      .listMaterials()
      .map((m) => m.getName())
      .sort();
    for (const name of names) expect(HIGHWATCH_GUILD_ASSET.materials).toContain(name);
    expect(names).toContain('GuildGlow');
    expect(names).toContain('GuildGlowLantern');
    expect(root.listTextures()).toHaveLength(0);
    expect(root.listSkins()).toHaveLength(0);
    expect(root.listAnimations()).toHaveLength(0);
    const hue = (name: string) =>
      root
        .listMaterials()
        .find((m) => m.getName() === name)
        ?.getEmissiveFactor() ?? [0, 0, 0];
    for (const name of ['GuildGlow', 'GuildGlowLantern']) {
      const [r, g, b] = hue(name);
      expect(r, name).toBeGreaterThan(g);
      expect(g, name).toBeGreaterThan(b);
    }
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        expect(prim.getAttribute('COLOR_0'), mesh.getName()).not.toBeNull();
      }
    }
  });

  it('stays inside its triangle budget, part by part', () => {
    let total = 0;
    for (const [name, want] of Object.entries(TRIANGLES)) {
      const got = trianglesUnder(node(name));
      expect(got, name).toBe(want);
      total += got;
    }
    // the manor's budget: never past 90,000 with every room furnished
    expect(total).toBeGreaterThanOrEqual(40_000);
    expect(total).toBeLessThanOrEqual(90_000);
    // each trophy a small part of its own (the room shows up to five at once)
    for (const dungeon of GUILD_TROPHY_DUNGEONS) {
      expect(TRIANGLES[`G_INT_Trophy_${dungeon}`], dungeon).toBeLessThan(2_000);
    }
  });

  it('stands on a yard of footing, as wide and deep as its record reaches', () => {
    const bounds = getBounds(doc.getRoot().listScenes()[0]);
    expect(bounds.min[1]).toBeCloseTo(-1, 2);
    const guild = HIGHWATCH_BUILDINGS_BY_ID.highwatch_guild;
    const reach = guild.reach;
    expect(bounds.max[0] - bounds.min[0]).toBeCloseTo(reach.halfWidth * 2, 2);
    expect(bounds.max[2] - bounds.min[2]).toBeCloseTo(reach.halfDepth * 2, 2);
    expect(bounds.max[1] - bounds.min[1]).toBeCloseTo(guild.nativeDimensions.height + 1.05, 2);
    // the yard in front (-z), the trophy hall behind
    expect(bounds.min[2]).toBeLessThan(-24);
    expect(bounds.max[2]).toBeGreaterThan(20);
  });

  it('stamps the door, the open roof and the belfry lantern the camera and the town read', () => {
    const extras = (node('HighwatchGuild_ROOT').getExtras() as { highwatchGuild: GuildExtras })
      .highwatchGuild;
    // a grand door: 3.8 wide, 5.6 high over the floor (a player stands 2.6)
    expect(extras.door).toEqual([3.8, 5.6]);
    expect(extras.floor).toBeCloseTo(0.6, 9);
    // the great hall: walls of 10.5, the ridge at 19, nothing of the roof under 11 over the floor
    expect(extras.hall.plate - extras.floor).toBeCloseTo(10.5, 9);
    expect(extras.hall.ridge - extras.floor).toBeCloseTo(19, 9);
    expect(extras.hall.truss - extras.floor).toBeGreaterThanOrEqual(11);
    // the belfry lantern stands over the great roof's ridge
    expect(extras.tower[1]).toBeGreaterThan(extras.hall.ridge);
    expect([...extras.trophies].sort()).toEqual([...GUILD_TROPHY_DUNGEONS].sort());
    // the gateway's name board: the painted lettering stands where the model's board hangs,
    // well over a player's head, a real gap proud of the board's faces
    expect(extras.sign).toEqual({ ...HIGHWATCH_GUILD_SIGN });
    expect(extras.sign.y - extras.sign.height / 2).toBeGreaterThan(3);
    expect(extras.sign.face).toBeGreaterThanOrEqual(0.09 + 0.04);
  });

  it('ships the collision rows the Blender run wrote, under the model id', () => {
    const written = JSON.parse(
      readFileSync(path.join(ROOT, HIGHWATCH_GUILD_ASSET.collision), 'utf8'),
    ) as { size: number; rows: unknown };
    const table = JSON.parse(
      readFileSync(path.join(ROOT, 'data/asset_collision_overrides.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(table[HIGHWATCH_GUILD_ASSET.collisionId]).toEqual(written.rows);
    const bounds = getBounds(doc.getRoot().listScenes()[0]);
    expect(written.size).toBeCloseTo(
      Math.max(...[0, 1, 2].map((i) => bounds.max[i] - bounds.min[i])),
      1,
    );
    const raw = readFileSync(path.join(ROOT, 'data/asset_collision_overrides.json'), 'utf8');
    expect(mergeGuildCollision(raw, written.rows)).toBe(raw);
  });
});

describe('the Highwatch guild has no coplanar faces fighting in the depth buffer', () => {
  it('finds no overlap a camera can see across the whole shipped model', () => {
    const triangles = documentTriangles(doc);
    const all = findCoplanarOverlaps(triangles);
    // not vacuous: the model is full of flush joints the audit has to weigh
    expect(all.length).toBeGreaterThan(1000);
    const visible = visibleOverlaps(triangles, all);
    const label = (hit: (typeof visible)[number]) =>
      `${hit.parts.join(' x ')} at ${hit.at.join(', ')} gap ${hit.gap.toFixed(3)}`;
    // every decal-like piece (rugs, banners, the notices on the board, the plaques, their
    // gilding and trophies, the crest, the yard's paving) stands a real layer clear of what it
    // lies on: none at all
    const frame = /^(GuildShell|GuildRoof)\//;
    expect(
      visible.filter((hit) => !hit.parts.every((part) => frame.test(part))).map(label),
    ).toEqual([]);
    // what is left is slivers where a hewn timber meets a wall's face at a joint (the manor's
    // walls, the same kit): each under a hand's breadth square, all together under a yard
    for (const hit of visible) expect(hit.area, label(hit)).toBeLessThan(0.15);
    expect(visible.reduce((sum, hit) => sum + hit.area, 0)).toBeLessThan(1.0);
  }, 120000);
});
