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
  tierTarget,
  VERTEX_COLOUR_SCALE,
} from '../scripts/assets/highwatch_guild/build.mjs';
import {
  documentTriangles,
  findCoplanarOverlaps,
  visibleOverlaps,
} from '../scripts/assets/highwatch_guild/coplanar.mjs';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { isPlacedBuildingInterior } from '../src/render/eastbrook_placed_building';
import { HIGHWATCH_GUILD_SIGN } from '../src/render/highwatch_guild_sign';
import { placedTextureTierPath } from '../src/render/placed_texture_tier_core';
import { HIGHWATCH_BUILDINGS_BY_ID } from '../src/sim/highwatch_layout';

// The shipped Highwatch adventurers' guild, Lantern Hall (public/models/tidehold/highwatch/
// guild.glb and its .half and .quarter texture tiers), built in Blender by
// scripts/assets/highwatch_guild/build_guild.py on the guild's own kit, settled as one
// (guild_settle.py), painted with Highwatch's Alpine slate maps of the painted town
// (guild_texture.py, textures.json) and dressed with painted props (guild_props.py, the atlas
// props/build_atlas.mjs packs), then shipped by build.mjs, which also merges the collision rows
// the same Blender run writes into data/asset_collision_overrides.json. Pins the bytes of every
// tier, the live source fingerprint, the named parts the town view draws (the G_INT ones cast no
// shadow, and each trophy and each plaque's gilding is a part of its own for the trophy room),
// the painted materials and their maps, the tiers' sizes, the props' atlas against its
// manifest, the triangle budget, the footing the town buries, the door and the open roof the
// camera's air is cut to, the collision rows, and no z-fighting. Re-pin the sha256, size and
// triangle literals only with a re-export.

const ROOT = path.join(__dirname, '..');
const GLB = path.join(ROOT, HIGHWATCH_GUILD_ASSET.target);
type GuildTier = 'full' | 'half' | 'quarter';
/** Each tier's shipped bytes and sha256 (build.mjs prints both). */
const SHIPPED: Record<GuildTier, { bytes: number; sha256: string }> = {
  full: {
    bytes: 4265488,
    sha256: '59f8f47e14a5979f2997907ad0338fe3ebf6abe527dc501c3727a01160874c9b',
  },
  half: {
    bytes: 2479704,
    sha256: '8a9a04170eb631d67c2cf4c8d6cbcfe1356acc262dfa8c3db35694eb0da39550',
  },
  quarter: {
    bytes: 1974176,
    sha256: 'f9b0042c879cb97cfbeeed5583201ad6290e358283294cd3913a17701f4c4886',
  },
};
const TIERS = Object.keys(SHIPPED) as GuildTier[];
const tierFile = (tier: GuildTier) => path.join(ROOT, tierTarget(tier));
/** Triangles per named part, from the Blender build report. */
const TRIANGLES: Record<string, number> = {
  GuildShell: 20560,
  GuildRoof: 11608,
  GuildTrim: 2188,
  GuildYard: 4433,
  GuildGlow: 668,
  G_INT_Timber: 1968,
  G_INT_Furnishings: 21036,
  G_INT_Trophy_hollow_crypt: 800,
  G_INT_Trophy_sunken_bastion: 797,
  G_INT_Trophy_drowned_temple: 700,
  G_INT_Trophy_wildheart_basin: 797,
  G_INT_Trophy_gravewyrm_sanctum: 1400,
  G_INT_TrophyGilt_hollow_crypt: 306,
  G_INT_TrophyGilt_sunken_bastion: 306,
  G_INT_TrophyGilt_drowned_temple: 306,
  G_INT_TrophyGilt_wildheart_basin: 306,
  G_INT_TrophyGilt_gravewyrm_sanctum: 306,
};

const TEXTURES = JSON.parse(
  readFileSync(path.join(ROOT, 'scripts/assets/highwatch_guild/textures.json'), 'utf8'),
) as {
  headroom: number;
  materials: Record<string, { color: string; normal?: string; atlas?: boolean }>;
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

interface GlbJson {
  scenes: unknown;
  nodes: unknown;
  meshes: unknown;
  accessors: Record<string, unknown>[];
  materials: Record<string, unknown>[];
  textures: unknown;
  images: { name: string; mimeType: string; bufferView: number }[];
  bufferViews: { byteOffset?: number; byteLength: number }[];
  extensionsRequired?: string[];
}

function readGlb(file: string): { json: GlbJson; bin: Buffer } {
  const buf = readFileSync(file);
  expect(buf.readUInt32LE(0), `${file} is a GLB`).toBe(0x46546c67);
  const jsonLen = buf.readUInt32LE(12);
  return {
    json: JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as GlbJson,
    bin: buf.subarray(20 + jsonLen + 8),
  };
}

/** Everything about a tier file that is not a picture: the scene graph, the meshes, every
 *  accessor's shape and the materials. */
function shape({ json }: { json: GlbJson }): string {
  return JSON.stringify({
    scenes: json.scenes,
    nodes: json.nodes,
    meshes: json.meshes,
    accessors: json.accessors.map((a) => ({
      componentType: a.componentType,
      count: a.count,
      type: a.type,
      normalized: a.normalized ?? false,
      min: a.min,
      max: a.max,
    })),
    materials: json.materials,
    textures: json.textures,
    extensionsRequired: json.extensionsRequired,
  });
}

/** Each image's name, type and pixel size (read from its KTX2 header). */
function images({ json, bin }: { json: GlbJson; bin: Buffer }) {
  return json.images.map((img) => {
    const view = json.bufferViews[img.bufferView];
    const at = view.byteOffset ?? 0;
    return {
      name: img.name,
      mime: img.mimeType,
      w: bin.readUInt32LE(at + 20),
      h: bin.readUInt32LE(at + 24),
    };
  });
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
  it('carries no light, transmission, volume, skin or animation a post-boot building must not add', () => {
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
    expect(doc.getRoot().listSkins()).toEqual([]);
    expect(doc.getRoot().listAnimations()).toEqual([]);
  });

  it('ships the pinned bytes of every texture tier, in the media manifest, credited as project art', () => {
    for (const tier of TIERS) {
      const bytes = readFileSync(tierFile(tier));
      expect(bytes.length, tier).toBe(SHIPPED[tier].bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), tier).toBe(SHIPPED[tier].sha256);
      expect(bytes.toString('latin1'), tier).toContain('EXT_meshopt_compression');
      const key = tierTarget(tier).replace(/^public\//, '');
      const stem = key.replace(/\.glb$/, '').replace(/\./g, '\\.');
      expect(MEDIA_ASSETS[key], tier).toMatch(new RegExp(`^/media/${stem}\\.[0-9a-f]{12}\\.glb$`));
    }
    const credits = readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
    const row = credits
      .split('\n')
      .find((line) =>
        line.includes(
          "Highwatch adventurers' guild, Lantern Hall (`public/models/tidehold/highwatch/guild.glb`",
        ),
      );
    expect(row).toBeDefined();
    // the painted maps it wears and the painted props it is dressed with are named
    expect(row).toMatch(/painted/i);
    expect(row).toMatch(/Tripo/);
  });

  it('carries the live source fingerprint on every tier, its own kit, maps and props included', async () => {
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    for (const tier of TIERS) {
      const file = await io.read(tierFile(tier));
      expect(file.getRoot().getExtras(), tier).toMatchObject({
        authoring: 'Blender',
        sourceFingerprint: guildSourceFingerprint(),
      });
    }
    // a change to the guild's kit, its paint, its settling or its props re-ships it; the
    // manor's kit it was first built with is gone from the tree and from its inputs
    for (const input of [
      'scripts/assets/highwatch_guild/guild_lib.py',
      'scripts/assets/highwatch_guild/guild_texture.py',
      'scripts/assets/highwatch_guild/guild_settle.py',
      'scripts/assets/highwatch_guild/textures.json',
      'scripts/assets/highwatch_guild/props/props_data.json',
      'scripts/assets/highwatch_guild/tex/GuildProps_Color.jpg',
    ]) {
      expect(HIGHWATCH_GUILD_ASSET.inputs).toContain(input);
    }
    expect(HIGHWATCH_GUILD_ASSET.inputs.some((input) => input.includes('highwatch_manor'))).toBe(
      false,
    );
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

  it('wears the painted maps on its painted materials, the rest untextured, its glass warm', () => {
    const root = doc.getRoot();
    const names = root
      .listMaterials()
      .map((m) => m.getName())
      .sort();
    for (const name of names) expect(HIGHWATCH_GUILD_ASSET.materials).toContain(name);
    for (const name of [
      'GuildTimber',
      'GuildDressed',
      'GuildPlaster',
      'GuildSlate',
      'GuildProps',
      'GuildGlow',
      'GuildGlowLantern',
    ]) {
      expect(names, name).toContain(name);
    }
    for (const material of root.listMaterials()) {
      const name = material.getName();
      const spec = TEXTURES.materials[name];
      const map = material.getBaseColorTexture();
      if (!spec) {
        expect(map, name).toBeNull();
        continue;
      }
      expect(map, name).not.toBeNull();
      expect(map?.getMimeType(), name).toBe('image/ktx2');
      expect(material.getNormalTexture() !== null, name).toBe(Boolean(spec.normal));
      // the vertex colours sit under the headroom; the runtime multiplies them back
      expect(material.getExtras(), name).toMatchObject({ vertexColourScale: VERTEX_COLOUR_SCALE });
    }
    expect(VERTEX_COLOUR_SCALE).toBeGreaterThan(1);
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
        const painted = TEXTURES.materials[prim.getMaterial()?.getName() ?? ''];
        expect(prim.getAttribute('TEXCOORD_0') !== null, mesh.getName()).toBe(Boolean(painted));
      }
    }
  });

  it('ships its texture tiers: the same model with every map at half and a quarter of its size', () => {
    const base = readGlb(GLB);
    const baseImages = images(base);
    // the five tiling colour maps (plaster, timber, dressed stone, slate, cloth), their five
    // normal maps and the props' atlas
    expect(baseImages).toHaveLength(11);
    for (const img of baseImages) expect(img.mime).toBe('image/ktx2');
    const atlas = baseImages.find((img) => img.name === 'GuildProps_color');
    expect(atlas).toBeDefined();
    for (const tier of TIERS.filter((t) => t !== 'full')) {
      const file = readGlb(tierFile(tier));
      expect(shape(file), tier).toBe(shape(base));
      const sizes = HIGHWATCH_GUILD_ASSET.tiers[tier];
      const k = sizes.color / HIGHWATCH_GUILD_ASSET.tiers.full.color;
      expect(
        images(file).map(({ name, mime, w, h }) => ({ name, mime, w, h })),
        tier,
      ).toEqual(
        baseImages.map((img) => {
          if (img.name.endsWith('_normal')) return { ...img, w: sizes.normal, h: sizes.normal };
          if (img.name === 'GuildProps_color') return { ...img, w: img.w * k, h: img.h * k };
          return { ...img, w: sizes.color, h: sizes.color };
        }),
      );
      expect(readFileSync(tierFile(tier)).length, tier).toBeLessThan(readFileSync(GLB).length);
    }
    const { full, half, quarter } = HIGHWATCH_GUILD_ASSET.tiers;
    for (const kind of ['color', 'normal'] as const) {
      expect(half[kind]).toBe(full[kind] / 2);
      expect(quarter[kind]).toBe(full[kind] / 4);
      expect(quarter[kind] % 4).toBe(0);
    }
    // the loader finds each tier through the media manifest (placed_texture_tier_core.ts)
    const exists = (p: string) => MEDIA_ASSETS[p.replace(/^\/+/, '')] !== undefined;
    const model = '/models/tidehold/highwatch/guild.glb';
    expect(placedTextureTierPath(model, 'full', exists)).toBe(model);
    expect(placedTextureTierPath(model, 'half', exists)).toBe(
      '/models/tidehold/highwatch/guild.half.glb',
    );
    expect(placedTextureTierPath(model, 'quarter', exists)).toBe(
      '/models/tidehold/highwatch/guild.quarter.glb',
    );
  });

  it("was packed from the live props manifest: each piece's source, budget and tile", () => {
    // props_data.json and the atlas are what props/build_atlas.mjs made of props/props.json (its
    // sources are a maintainer-local pack under tmp/asset_src, never checked in): a piece added,
    // dropped, re-sourced, over its budget or moved to another tile without re-running it
    // fails here
    const dir = path.join(ROOT, 'scripts/assets/highwatch_guild/props');
    const manifest = JSON.parse(readFileSync(path.join(dir, 'props.json'), 'utf8')) as {
      atlas: { width: number; height: number; pad: number; out: string };
      props: { id: string; source: string; dense?: string; triangles: number; tile: number[] }[];
    };
    const data = JSON.parse(readFileSync(path.join(dir, 'props_data.json'), 'utf8')) as {
      atlas: string;
      props: Record<string, { source: string; uvs: number[][]; faces: number[][] }>;
    };
    expect(data.atlas).toBe(manifest.atlas.out);
    expect(TEXTURES.materials.GuildProps.color).toBe(manifest.atlas.out);
    expect(Object.keys(data.props).sort()).toEqual(manifest.props.map((p) => p.id).sort());
    const { width, height, pad } = manifest.atlas;
    // (UVs rounded to 1e-4, stored with Blender's bottom-left origin)
    const slack = 2e-4;
    for (const p of manifest.props) {
      const piece = data.props[p.id];
      expect(piece.source, p.id).toBe(p.source);
      expect(piece.faces.length, p.id).toBeGreaterThan(0);
      expect(piece.faces.length, p.id).toBeLessThanOrEqual(p.triangles);
      const [left, top, side] = p.tile;
      // a small piece a small tile ("lower texture size for smaller objects")
      expect([256, 512, 1024], p.id).toContain(side);
      const u0 = (left + pad) / width - slack;
      const u1 = (left + side - pad) / width + slack;
      const v0 = 1 - (top + side - pad) / height - slack;
      const v1 = 1 - (top + pad) / height + slack;
      const outside = piece.uvs.filter(([u, v]) => u < u0 || u > u1 || v < v0 || v > v1);
      expect(outside.length, `${p.id} corners off its tile`).toBe(0);
    }
    // the trophy room's five trophies, its plaques and their gilding are all painted pieces
    for (const id of [
      'trophy_crypt',
      'trophy_bastion',
      'trophy_temple',
      'trophy_wildheart',
      'trophy_gravewyrm',
      'trophy_plaque',
      'gilt_laurel',
    ]) {
      expect(Object.keys(data.props), id).toContain(id);
    }
  });

  it('stays inside its triangle budget, part by part', () => {
    let total = 0;
    for (const [name, want] of Object.entries(TRIANGLES)) {
      const got = trianglesUnder(node(name));
      expect(got, name).toBe(want);
      total += got;
    }
    // never past 90,000 with every room furnished
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

/**
 * The contacts the audit sees on the shipped model, by group (the two parts and materials, the
 * facing): how many and their area in square yards. Every one is a flush joint of the kit's own
 * shell and roof the texture-free model already had (a timber against a wall's plaster or
 * stone, a porch slate on its dressed gable, the trophy hall's posts meeting the great hall's
 * back wall), which the audit then passed as twins (one material, one colour: the same pixel).
 * The painted maps and the baked light tint each face its own way, so the audit now weighs
 * them, as it did the painted Highwatch manor on the same kit; each stays under a quarter of a
 * square yard. A new contact anywhere, or one of these grown, turns this red.
 */
const KNOWN_CONTACTS: Record<string, { hits: number; area: number }> = {
  'GuildRoof/GuildSlate x GuildRoof/GuildSlate n=0,0.8,-0.6': { hits: 1, area: 0.254 },
  'GuildRoof/GuildSlate x GuildShell/GuildDressed n=-0.49,0.87,0': { hits: 2, area: 0.112 },
  'GuildRoof/GuildSlate x GuildShell/GuildDressed n=0.49,0.87,0': { hits: 1, area: 0.102 },
  'GuildShell/GuildDressed x GuildShell/GuildDressed n=0,0,-1': { hits: 3, area: 0.125 },
  'GuildShell/GuildDressed x GuildShell/GuildTimber n=-1,0,0': { hits: 2, area: 0.067 },
  'GuildShell/GuildPlaster x GuildShell/GuildTimber n=0,-1,0': { hits: 13, area: 0.544 },
  'GuildShell/GuildPlaster x GuildShell/GuildTimber n=0,1,0': { hits: 1, area: 0.029 },
  'GuildShell/GuildTimber x GuildShell/GuildTimber n=-1,0,0': { hits: 3, area: 0.21 },
  'GuildShell/GuildTimber x GuildShell/GuildTimber n=0,0,-1': { hits: 2, area: 0.019 },
  'GuildShell/GuildTimber x GuildShell/GuildTimber n=1,0,0': { hits: 1, area: 0.206 },
};

describe('the Highwatch guild has no coplanar faces fighting in the depth buffer', () => {
  it('finds no new overlap a camera can see across the whole shipped model', () => {
    const triangles = documentTriangles(doc);
    const all = findCoplanarOverlaps(triangles);
    // not vacuous: the model is full of flush joints the audit has to weigh
    expect(all.length).toBeGreaterThan(1000);
    const visible = visibleOverlaps(triangles, all);
    const label = (hit: (typeof visible)[number]) =>
      `${hit.parts.join(' x ')} at ${hit.at.join(', ')} gap ${hit.gap.toFixed(3)}`;
    // every decal-like piece (the rugs, the painted props: the trophies, their plaques and
    // gilding, the board, the banners, the crest, the furniture; the yard's paving) stands a
    // real layer clear of what it lies on, and no prop fights itself (props/build_atlas.mjs drops
    // a piece's coplanar twins): none at all outside the frame
    const frame = /^(GuildShell|GuildRoof)\//;
    expect(
      visible.filter((hit) => !hit.parts.every((part) => frame.test(part))).map(label),
    ).toEqual([]);
    const groups: Record<string, { hits: number; area: number }> = {};
    for (const hit of visible) {
      const key = `${[...hit.parts].sort().join(' x ')} n=${hit.normal.join(',')}`;
      const group = groups[key] ?? { hits: 0, area: 0 };
      group.hits++;
      group.area += hit.area;
      groups[key] = group;
    }
    expect(Object.keys(groups).sort()).toEqual(Object.keys(KNOWN_CONTACTS).sort());
    for (const [key, known] of Object.entries(KNOWN_CONTACTS)) {
      expect(groups[key]?.hits, key).toBe(known.hits);
      expect(groups[key]?.area, key).toBeCloseTo(known.area, 3);
    }
  }, 120000);
});
