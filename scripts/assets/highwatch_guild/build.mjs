// Ship the Blender-authored Highwatch guild hall (scripts/assets/highwatch_guild/): validate the
// exported hierarchy, materials and root extras, stamp the source fingerprint, then prune, dedup
// and meshopt it into public/models/tidehold/highwatch/guild.glb, and merge its collision rows
// (guild.collision.json, written by the same Blender run) into data/asset_collision_overrides.json
// under the model's id. Never flatten or join: the town view casts no shadow from the G_INT*
// parts (render/eastbrook_placed_building.ts), and the trophy room shows each trophy part by its
// own node (render/highwatch_guild_trophies.ts).
//
//   blender --background --python scripts/assets/highwatch_guild/build_guild.py
//   node scripts/assets/highwatch_guild/build.mjs
//   node scripts/gen_collision_overrides.mjs
//   node scripts/gen_asset_catalog.mjs
//   node scripts/build_media_manifest.mjs generate
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// The fingerprint and the collision merge this builder used to import from the Highwatch
// manor's builder (scripts/assets/highwatch_manor/build.mjs, deleted with the manor), kept
// here unchanged so the guild's tests still load. The manor kit files listed in `inputs`
// below are gone too, so the fingerprint no longer resolves until the guild's own pipeline
// replaces them.
function sourceFingerprint(asset, root) {
  const hash = createHash('sha256');
  for (const file of asset.inputs) {
    // Text inputs hash with normalized line endings so a Windows checkout and a Linux
    // checkout agree; the source GLB and the maps are binary and hash byte for byte.
    const bytes = readFileSync(path.join(root, file));
    const body = /\.(glb|jpg|png)$/.test(file)
      ? bytes
      : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    hash.update(file).update('\0').update(body).update('\0');
  }
  return hash.digest('hex');
}

/**
 * The override table's text with one asset's rows set: its own entry replaced in place (or
 * appended at the end), every other byte untouched (the table is formatted by hand and by the
 * Collision Master, so it is never re-serialized whole).
 */
function mergeCollisionRows(raw, rows, id) {
  const body = JSON.stringify(rows, null, 2).replace(/\n/g, '\n  ');
  const key = `"${id}": `;
  const at = raw.indexOf(`\n  ${key}`);
  if (at >= 0) {
    const open = raw.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < raw.length; end++) {
      if (raw[end] === '{') depth++;
      else if (raw[end] === '}' && --depth === 0) break;
    }
    return `${raw.slice(0, open)}${body}${raw.slice(end + 1)}`;
  }
  const close = raw.lastIndexOf('}');
  const head = raw.slice(0, close).replace(/\s*$/, '');
  return `${head},\n  ${key}${body}\n}${raw.slice(close + 1)}`;
}

/** The five five-player dungeons the trophy room keeps a plaque for (guild_plan.TROPHY_SLOTS). */
export const GUILD_TROPHY_DUNGEONS = [
  'hollow_crypt',
  'sunken_bastion',
  'drowned_temple',
  'wildheart_basin',
  'gravewyrm_sanctum',
];

export const HIGHWATCH_GUILD_ASSET = {
  source: 'scripts/assets/highwatch_guild/guild_source.glb',
  target: 'public/models/tidehold/highwatch/guild.glb',
  collision: 'scripts/assets/highwatch_guild/guild.collision.json',
  /** The asset id its collision rows are stored under (the model's path, as placed). */
  collisionId: 'tidehold/highwatch/guild',
  /** The fingerprinted inputs: the guild's Blender sources, the manor's kit they build with (and
   *  the ferry's shared shiplib under it), the exported source and this builder. */
  inputs: [
    'scripts/assets/highwatch_guild/guild_source.glb',
    'scripts/assets/highwatch_guild/build_guild.py',
    'scripts/assets/highwatch_guild/guild_materials.py',
    'scripts/assets/highwatch_guild/guild_plan.py',
    'scripts/assets/highwatch_guild/guild_shell.py',
    'scripts/assets/highwatch_guild/guild_furnish.py',
    'scripts/assets/highwatch_guild/guild_yard.py',
    'scripts/assets/highwatch_manor/manor_lib.py',
    'scripts/assets/highwatch_manor/manor_plan.py',
    'scripts/assets/highwatch_manor/manor_shell.py',
    'scripts/assets/highwatch_manor/manor_furnish.py',
    'scripts/assets/highwatch_manor/manor_grounds.py',
    'scripts/assets/highwatch_manor/manor_weather.py',
    'scripts/assets/highwatch_manor/manor_glass.py',
    'scripts/assets/eastbrook_ferry/shiplib.py',
    'scripts/assets/highwatch_guild/build.mjs',
  ],
  /** Named nodes the runtime and the tests depend on. */
  requiredNodes: [
    'HighwatchGuild_ROOT',
    'GuildShell',
    'GuildRoof',
    'GuildTrim',
    'GuildYard',
    'GuildGlow',
    'G_INT_Timber',
    'G_INT_Furnishings',
    ...GUILD_TROPHY_DUNGEONS.map((d) => `G_INT_Trophy_${d}`),
    ...GUILD_TROPHY_DUNGEONS.map((d) => `G_INT_TrophyGilt_${d}`),
  ],
  materials: [
    'GuildGlass',
    'GuildGlassBlue',
    'GuildGlassGold',
    'GuildGlassRed',
    'GuildGlow',
    'GuildGlowCandle',
    'GuildGlowLantern',
    'GuildGlowSoft',
    'GuildMetal',
    'GuildPlaster',
    'GuildSlate',
    'GuildStone',
    'GuildWood',
  ],
};

export function guildSourceFingerprint(asset = HIGHWATCH_GUILD_ASSET, root = ROOT) {
  return sourceFingerprint(asset, root);
}

export async function buildHighwatchGuild(asset = HIGHWATCH_GUILD_ASSET, root = ROOT) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  const doc = await io.read(path.join(root, asset.source));
  const gltf = doc.getRoot();
  const names = new Set(gltf.listNodes().map((node) => node.getName()));
  const missing = asset.requiredNodes.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Guild source is missing nodes: ${missing.join(', ')}`);
  await doc.transform(prune({ keepExtras: true, keepLeaves: true }));
  const materials = gltf
    .listMaterials()
    .map((material) => material.getName())
    .sort();
  // A material no face uses is pruned away: the set must be the declared one or a subset of it.
  const unknown = materials.filter((name) => !asset.materials.includes(name));
  if (unknown.length) throw new Error(`Unexpected guild materials: ${unknown.join(', ')}`);
  if (
    gltf.listTextures().length ||
    gltf.listCameras().length ||
    gltf.listSkins().length ||
    gltf.listAnimations().length
  ) {
    throw new Error('The guild ships texture-free, camera-free, unskinned and still');
  }
  const extras = gltf.listScenes()[0]?.listChildren()[0]?.getExtras() ?? {};
  if (!extras.highwatchGuild) throw new Error('HighwatchGuild_ROOT lost its extras');
  gltf.setExtras({ sourceFingerprint: guildSourceFingerprint(asset, root), authoring: 'Blender' });
  await doc.transform(
    prune({ keepExtras: true, keepLeaves: true }),
    dedup(),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  return io.writeBinary(doc);
}

export function mergeGuildCollision(raw, rows, id = HIGHWATCH_GUILD_ASSET.collisionId) {
  return mergeCollisionRows(raw, rows, id);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = await buildHighwatchGuild();
  mkdirSync(path.dirname(path.join(ROOT, HIGHWATCH_GUILD_ASSET.target)), { recursive: true });
  writeFileSync(path.join(ROOT, HIGHWATCH_GUILD_ASSET.target), bytes);
  console.log(
    `${HIGHWATCH_GUILD_ASSET.target}: ${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
  const coll = JSON.parse(readFileSync(path.join(ROOT, HIGHWATCH_GUILD_ASSET.collision), 'utf8'));
  const tablePath = path.join(ROOT, 'data/asset_collision_overrides.json');
  writeFileSync(tablePath, mergeGuildCollision(readFileSync(tablePath, 'utf8'), coll.rows));
  console.log(
    `${HIGHWATCH_GUILD_ASSET.collisionId}: ${coll.rows.boxes.length} boxes, ${coll.rows.ramps.length} decks`,
  );
}
