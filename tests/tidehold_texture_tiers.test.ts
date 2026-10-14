// The Tidehold town's texture-tier files (src/render/placed_texture_tier_core.ts):
// beside every building's `<name>.glb` ship `<name>.half.glb` and
// `<name>.quarter.glb`, and beside its far twin `<name>.lod.half.glb`. A low
// profile loads one of them IN PLACE of the model, while collision, seating and
// the interior reveal keep reading the model's own path. That is only sound
// while a tier file is the same model with smaller maps and nothing else, so
// this pins exactly that against the shipped bytes: the same nodes, meshes,
// materials, vertex data and bounds, every image KTX2, and every image half (or
// a quarter of) the size of the model's own.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSET_CATALOG } from '../src/editor/asset_catalog.generated';
import { MEDIA_ASSETS } from '../src/render/assets/manifest.generated';
import { placedTextureTierPath } from '../src/render/placed_texture_tier_core';

const DIR = path.resolve(__dirname, '..', 'public', 'models', 'tidehold');
const BUILDINGS = [
  'bank',
  'hall',
  'house_a',
  'house_b',
  'house_c',
  'house_d',
  'house_e',
  'market',
  'shop_a',
  'shop_b',
  'smithy',
  'tavern',
  'tavern_b',
  'vault',
];

interface Glb {
  // the whole glTF document, read loosely: this suite compares it, it does not model it
  // biome-ignore lint/suspicious/noExplicitAny: a parsed glTF JSON chunk
  json: any;
  bin: Buffer;
}

function read(file: string): Glb {
  const buf = fs.readFileSync(path.join(DIR, file));
  expect(buf.readUInt32LE(0), `${file} is a GLB`).toBe(0x46546c67);
  const jsonLen = buf.readUInt32LE(12);
  return {
    json: JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')),
    bin: buf.subarray(20 + jsonLen + 8),
  };
}

/** Everything about a model that is not a picture: the scene graph, the
 *  materials (with which image each slot names) and every accessor's shape and
 *  bounds. Buffer views are left out: a smaller image moves their offsets. */
function shape({ json }: Glb): string {
  const imageName = (ref?: { index: number }) => {
    if (!ref) return null;
    const tex = json.textures[ref.index];
    return json.images[tex.extensions?.KHR_texture_basisu?.source ?? tex.source].name;
  };
  return JSON.stringify({
    scenes: json.scenes,
    nodes: json.nodes,
    meshes: json.meshes,
    accessors: json.accessors.map((a: Record<string, unknown>) => ({
      componentType: a.componentType,
      count: a.count,
      type: a.type,
      normalized: a.normalized ?? false,
      min: a.min,
      max: a.max,
    })),
    // biome-ignore lint/suspicious/noExplicitAny: a glTF material record
    materials: json.materials.map((m: Record<string, any>) => ({
      ...m,
      pbrMetallicRoughness: {
        ...m.pbrMetallicRoughness,
        baseColorTexture: imageName(m.pbrMetallicRoughness?.baseColorTexture),
        metallicRoughnessTexture: imageName(m.pbrMetallicRoughness?.metallicRoughnessTexture),
      },
      normalTexture: imageName(m.normalTexture),
      occlusionTexture: imageName(m.occlusionTexture),
      emissiveTexture: imageName(m.emissiveTexture),
    })),
    extensionsRequired: json.extensionsRequired,
  });
}

/** Each image's name and pixel size, read from its KTX2 header. */
function images({ json, bin }: Glb): { name: string; mime: string; w: number; h: number }[] {
  return json.images.map((img: { name: string; mimeType: string; bufferView: number }) => {
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

/** How tiers.mjs sizes a map: the model's own size times the factor, on the
 *  four pixel block grid, never under one block. */
const sized = (v: number, factor: number) => Math.max(4, Math.round((v * factor) / 4) * 4);

const TIERS = [
  { suffix: '.half.glb', of: '.glb', factor: 0.5 },
  { suffix: '.quarter.glb', of: '.glb', factor: 0.25 },
  { suffix: '.lod.half.glb', of: '.lod.glb', factor: 0.5 },
] as const;

describe('tidehold texture-tier files', () => {
  it.each(
    BUILDINGS.flatMap((b) =>
      TIERS.map((t) => [`${b}${t.suffix}`, `${b}${t.of}`, t.factor] as const),
    ),
  )('%s is %s with smaller maps and nothing else', (tierFile, baseFile, factor) => {
    const base = read(baseFile);
    const tier = read(tierFile);
    expect(shape(tier)).toBe(shape(base));
    const baseImages = images(base);
    const tierImages = images(tier);
    expect(tierImages.map((i) => i.name)).toEqual(baseImages.map((i) => i.name));
    for (const [i, img] of tierImages.entries()) {
      expect(img.mime, img.name).toBe('image/ktx2');
      expect([img.w, img.h], img.name).toEqual([
        sized(baseImages[i].w, factor),
        sized(baseImages[i].h, factor),
      ]);
    }
    expect(fs.statSync(path.join(DIR, tierFile)).size).toBeLessThan(
      fs.statSync(path.join(DIR, baseFile)).size,
    );
  });

  it('every tier file is in the media manifest, so the loader can find it', () => {
    const exists = (p: string) => MEDIA_ASSETS[p.replace(/^\/+/, '')] !== undefined;
    for (const b of BUILDINGS) {
      const model = `/models/tidehold/${b}.glb`;
      expect(placedTextureTierPath(model, 'half', exists)).toBe(`/models/tidehold/${b}.half.glb`);
      expect(placedTextureTierPath(model, 'quarter', exists)).toBe(
        `/models/tidehold/${b}.quarter.glb`,
      );
      // one twin tier ships; the quarter profile falls back to it
      const twin = `/models/tidehold/${b}.lod.glb`;
      expect(placedTextureTierPath(twin, 'quarter', exists)).toBe(
        `/models/tidehold/${b}.lod.half.glb`,
      );
    }
  });

  it('no tier file is offered as a placeable asset', () => {
    const tierEntries = ASSET_CATALOG.filter((a) => /\.(?:half|quarter)(?:\.glb)?$/.test(a.path));
    expect(tierEntries.map((a) => a.id)).toEqual([]);
    expect(ASSET_CATALOG.some((a) => a.id === 'tidehold/smithy')).toBe(true);
  });
});
