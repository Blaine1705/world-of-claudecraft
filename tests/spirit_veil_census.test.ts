// The spirit veil family against the shipped catalogue: every shape a released
// spirit can draw maps to a tuple of the pinned family, and the family holds
// nothing else. A new part whose morph count, attribute set, texture channel or
// blend mode is not listed fails HERE, at PR time; left to the runtime it would
// stop a ghost behind the effect gate (never a live link, but no longer
// immediate) and name the tuple on the dev channel.
//
// Who can be a released spirit: players only (spirit.ts releaseAtNearestGraveyard
// and the ghost logout restore are the only writers of `ghost`), never in a
// form, never mounted. So the census walks the player rigs (every `player_*`
// VisualDef, the mech included, with its attachments and its low-tier alias),
// every held model a player can carry (item weapons, offhands, weapon skins),
// the composed library as the real part selection and merge compose it, and
// the procedural shapes the rig adds (the baked far mesh and the face decals).
//
// The composed library is modelled the way assets.ts modularVariant builds it:
// modularPartNames picks the nodes of a look, and mergeSkinnedParts folds the
// picked skinned meshes that share a material and a merge partition
// (modular_name_facts_core modularMergePartition) and an attribute set into
// one mesh padded to the UNION of their morph target names. The looks are the
// cross product of the factors that share a bucket (hair, brows, beard) and a
// one-at-a-time sweep of every other style, per gender and per armour loadout.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { glbJsonChunk } from '../scripts/assets/lib/glb_texture_compression_core.mjs';
import {
  ITEM_OFFHAND_MODELS,
  itemWeaponModelUrls,
  VISUALS,
  visualAssetUrlForGraphics,
  weaponSkinModelUrls,
} from '../src/render/characters/manifest';
import {
  ARMOR_SETS,
  type ArmorLoadout,
  BEARD_STYLES,
  BROW_STYLES,
  DEFAULT_APPEARANCE,
  EAR_STYLES,
  EARRING_STYLES,
  EYE_STYLES,
  fullSet,
  HAIR_STYLES,
  MOUTH_STYLES,
  type ModularAppearance,
  modularPartNames,
  normalizeAppearance,
} from '../src/render/characters/modular';
import {
  MODULAR_HEAD_NODES,
  modularMergePartition,
} from '../src/render/characters/modular_name_facts_core';
import {
  SPIRIT_VEIL_FAMILY_KEYS,
  type SpiritVeilPass,
  type SpiritVeilShape,
  spiritVeilTupleKey,
} from '../src/render/characters/spirit_veil_family_core';

interface GltfPrimitive {
  attributes: Record<string, number>;
  targets?: Record<string, number>[];
  material?: number;
}
interface GltfJson {
  nodes?: { name?: string; mesh?: number; skin?: number }[];
  meshes?: { name?: string; primitives: GltfPrimitive[]; extras?: { targetNames?: string[] } }[];
  materials?: {
    name?: string;
    alphaMode?: string;
    pbrMetallicRoughness?: { baseColorTexture?: { index: number; texCoord?: number } };
  }[];
}

/** One drawable a rig ends with: a primitive, or a merged bucket of them. */
interface Part {
  where: string;
  skinned: boolean;
  material: number | undefined;
  attributes: string;
  targetNames: string[];
  morphKinds: Set<string>;
}

const MODULAR_URL = 'models/chars/modular/warrior_modular.glb';
const jsonCache = new Map<string, GltfJson>();

function gltf(url: string): GltfJson {
  let json = jsonCache.get(url);
  if (!json) {
    json = glbJsonChunk(readFileSync(new URL(`../public/${url}`, import.meta.url))) as GltfJson;
    jsonCache.set(url, json);
  }
  return json;
}

function nodeParts(url: string, nodeIndex: number): Part[] {
  const json = gltf(url);
  const node = json.nodes?.[nodeIndex];
  if (!node || node.mesh === undefined) return [];
  const mesh = json.meshes?.[node.mesh];
  if (!mesh) return [];
  // GLTFLoader names a single-primitive mesh after its node, and the meshes of
  // a multi-primitive part after the mesh datablock.
  const name = mesh.primitives.length === 1 ? (node.name ?? '') : (mesh.name ?? '');
  const names = mesh.extras?.targetNames ?? [];
  return mesh.primitives.map((prim) => {
    const targets = prim.targets ?? [];
    const kinds = new Set<string>();
    for (const target of targets) for (const kind of Object.keys(target)) kinds.add(kind);
    return {
      where: `${url}#${name}`,
      skinned: node.skin !== undefined,
      material: prim.material,
      attributes: Object.keys(prim.attributes).sort().join(','),
      targetNames: targets.map((_, i) => names[i] ?? `#${i}`),
      morphKinds: kinds,
    };
  });
}

function allParts(url: string): Part[] {
  const json = gltf(url);
  return (json.nodes ?? []).flatMap((_, index) => nodeParts(url, index));
}

function materialOf(url: string, part: Part) {
  return part.material === undefined ? undefined : gltf(url).materials?.[part.material];
}

/** The tuple keys a part draws once veiled: its colour (or decal) arm and,
 *  for a body, its depth pre-pass. */
function partKeys(url: string, part: Part): string[] {
  const material = materialOf(url, part);
  const texture = material?.pbrMetallicRoughness?.baseColorTexture;
  // The veil carries the source map on its own channel; only uv 0 is listed.
  expect(texture?.texCoord ?? 0, `${part.where} map channel`).toBe(0);
  const attributes = new Set(part.attributes.split(','));
  const shape: SpiritVeilShape = {
    skinned: part.skinned,
    morphTargets: part.targetNames.length,
    morphPositions: part.morphKinds.has('POSITION'),
    morphNormals: part.morphKinds.has('NORMAL'),
    morphColors: part.morphKinds.has('COLOR_0'),
    normals: attributes.has('NORMAL'),
    positions: attributes.has('POSITION'),
    instanced: false,
    batched: false,
  };
  // A transparent source takes the decal variant (ghost_veil.ts).
  const pass: SpiritVeilPass = material?.alphaMode === 'BLEND' ? 'decal' : 'color';
  const keys = [spiritVeilTupleKey(pass, shape, texture !== undefined)];
  if (pass === 'color') keys.push(spiritVeilTupleKey('depth', shape, false));
  return keys;
}

/** The composed rig of one look: picked parts, merged per bucket. */
function composedParts(app: ModularAppearance, worn: ArmorLoadout): Part[] {
  const json = gltf(MODULAR_URL);
  const picked = new Set(modularPartNames(app, worn));
  const parts: Part[] = [];
  (json.nodes ?? []).forEach((node, index) => {
    if (node.name && picked.has(node.name)) parts.push(...nodeParts(MODULAR_URL, index));
  });
  const buckets = new Map<string, Part[]>();
  for (const part of parts) {
    const name = part.where.slice(part.where.indexOf('#') + 1);
    const key = part.skinned
      ? `${part.material}|${modularMergePartition(name)}`
      : `rigid:${part.where}:${buckets.size}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(part);
    else buckets.set(key, [part]);
  }
  const out: Part[] = [];
  for (const bucket of buckets.values()) {
    const sameAttributes = bucket.every((part) => part.attributes === bucket[0].attributes);
    if (bucket.length < 2 || !sameAttributes) {
      out.push(...bucket);
      continue;
    }
    const names: string[] = [];
    const kinds = new Set<string>();
    for (const part of bucket) {
      for (const name of part.targetNames) if (!names.includes(name)) names.push(name);
      for (const kind of part.morphKinds) kinds.add(kind);
    }
    out.push({
      ...bucket[0],
      where: `${bucket[0].where}+${bucket.length - 1}`,
      targetNames: names,
      morphKinds: kinds,
    });
  }
  return out;
}

function looks(): { app: ModularAppearance; worn: ArmorLoadout }[] {
  const out: { app: ModularAppearance; worn: ArmorLoadout }[] = [];
  const loadouts: ArmorLoadout[] = [{}, ...ARMOR_SETS.map((set) => fullSet(set))];
  for (const gender of ['male', 'female'] as const) {
    const base: ModularAppearance = { ...DEFAULT_APPEARANCE, gender };
    const sweeps: Partial<ModularAppearance>[] = [
      ...EYE_STYLES.map((eyeShape) => ({ eyeShape })),
      ...EAR_STYLES.map((ears) => ({ ears })),
      ...MOUTH_STYLES.map((mouth) => ({ mouth })),
      ...EARRING_STYLES.map((earrings) => ({ earrings })),
      { lashes: true },
      { lashes: false },
    ];
    for (const hair of HAIR_STYLES)
      for (const brows of BROW_STYLES)
        for (const beard of BEARD_STYLES) sweeps.push({ hair, brows, beard });
    for (const worn of loadouts) {
      for (const sweep of sweeps)
        out.push({ app: normalizeAppearance({ ...base, ...sweep }), worn });
    }
  }
  return out;
}

function playerRigUrls(): string[] {
  const urls = new Set<string>();
  for (const [key, def] of Object.entries(VISUALS)) {
    if (!key.startsWith('player_') || def.modular) continue;
    for (const url of [def.url, ...(def.attach ?? []).map((a) => a.url)]) {
      urls.add(url);
      urls.add(visualAssetUrlForGraphics(url, false));
    }
  }
  return [...urls];
}

function heldModelUrls(): string[] {
  return [
    ...new Set([
      ...itemWeaponModelUrls(),
      ...Object.values(ITEM_OFFHAND_MODELS).map((key) => `models/weapons/${key}.glb`),
      ...weaponSkinModelUrls(),
    ]),
  ];
}

/** The shapes the rig mints at runtime, beside the GLB parts. */
function proceduralKeys(): Map<string, string> {
  const out = new Map<string, string>();
  // The baked far LOD (buildFarMeshes): one plain Mesh over an idle-pose bake
  // with normals and no morphs, its groups mapped or not.
  const far: SpiritVeilShape = {
    skinned: false,
    morphTargets: 0,
    morphPositions: false,
    morphNormals: false,
    morphColors: false,
    normals: true,
    positions: true,
    instanced: false,
    batched: false,
  };
  for (const key of [
    spiritVeilTupleKey('color', far, true),
    spiritVeilTupleKey('color', far, false),
    spiritVeilTupleKey('depth', far, false),
  ]) {
    out.set(key, 'far mesh');
  }
  // The stubble, scalp and makeup decals (stubble.ts / makeup.ts): the
  // composed head's own surface, skinned to its skeleton, carrying its position
  // morphs, its normals and a generated RGBA map, alpha-blended.
  const heads = allParts(MODULAR_URL).filter((part) =>
    MODULAR_HEAD_NODES.includes(part.where.slice(part.where.indexOf('#') + 1)),
  );
  expect(heads.length).toBe(MODULAR_HEAD_NODES.length);
  for (const head of heads) {
    const decal: SpiritVeilShape = {
      skinned: true,
      morphTargets: head.targetNames.length,
      morphPositions: head.targetNames.length > 0,
      morphNormals: false,
      morphColors: false,
      normals: true,
      positions: true,
      instanced: false,
      batched: false,
    };
    out.set(spiritVeilTupleKey('decal', decal, true), `face decal over ${head.where}`);
  }
  return out;
}

function census(): Map<string, string> {
  const needed = new Map<string, string>();
  const add = (keys: string[], where: string) => {
    for (const key of keys) if (!needed.has(key)) needed.set(key, where);
  };
  for (const url of [...playerRigUrls(), ...heldModelUrls()]) {
    for (const part of allParts(url)) add(partKeys(url, part), part.where);
  }
  for (const { app, worn } of looks()) {
    for (const part of composedParts(app, worn)) add(partKeys(MODULAR_URL, part), part.where);
  }
  for (const [key, where] of proceduralKeys()) add([key], where);
  return needed;
}

describe('the spirit veil family covers the catalogue', () => {
  const needed = census();

  it('walks a real catalogue (the vacuity floor)', () => {
    expect(playerRigUrls().length).toBeGreaterThanOrEqual(10);
    expect(heldModelUrls().length).toBeGreaterThanOrEqual(70);
    expect(looks().length).toBeGreaterThan(1000);
  });

  it('maps every reachable shape to a pinned tuple', () => {
    const missing = [...needed].filter(([key]) => !SPIRIT_VEIL_FAMILY_KEYS.has(key));
    expect(missing.map(([key, where]) => `${key} <- ${where}`)).toEqual([]);
  });

  it('pins nothing the catalogue cannot reach', () => {
    const dead = [...SPIRIT_VEIL_FAMILY_KEYS].filter((key) => !needed.has(key));
    expect(dead).toEqual([]);
  });
});
