// Build the Ignivar raid dressing props (beams, pillars, gear walls, the
// vault door, reactor, firepit, the Inner Crucible forge and anvil, roof
// chains) from the maintainer's Tripo drop in tmp/asset_src, at the
// willowfen fidelity recipe: weld + BOUNDED simplify (small error so the
// gear filigree survives; ratio chosen per item from a triangle target,
// with a second looser pass where the tight bound stops short), prune,
// dedup, per-item webp texture sizing, meshopt. GEAR201v.glb is a
// byte-identical duplicate of GEAR MACHINE 1v.glb (same node UUID and
// texture hash) and is deliberately not an item: one shipped asset.
// Every prop re-shares its baseColor as an emissive map (zero extra texture
// bytes): a faint 0.28 self-light on the plain metals so their detail reads
// in the dim forge grades (the tile-kit carrier trick), and a strong
// overdrive on the lava-bearing props.
// After this, run the mandatory KTX2 step + manifest regen:
//   node scripts/assets/compress_glb_textures.mjs
//   node scripts/build_media_manifest.mjs generate
// Usage: node scripts/assets/build_ignivar_props.mjs [name...]
// With name arguments only those items rebuild (the shipped set stays
// byte-identical; a full run reverts every prop to webp until the KTX2
// step re-runs over all of them).
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ITEMS = [
  { src: '_Outter_Walls/Beam_Large_v02.glb', name: 'beam', target: 1400, tex: 512, emissive: 0.28 },
  {
    src: '_Outter_Walls/Curved_Wall.glb',
    name: 'curved_wall',
    target: 9000,
    tex: 512,
    emissive: 0.28,
  },
  { src: '_Outter_Walls/Firepitv1.glb', name: 'firepit', tex: 512, emissive: 1.6 },
  {
    src: '_Outter_Walls/GEAR%20MACHINE%201v.glb',
    name: 'gear_machine',
    target: 12000,
    tex: 1024,
    emissive: 0.28,
  },
  {
    src: '_Outter_Walls/GEAR%20VAULT%20DOOR.glb',
    name: 'vault_door',
    target: 12000,
    tex: 1024,
    emissive: 0.28,
  },
  {
    src: '_Outter_Walls/PERFECTGEARWALL.glb',
    name: 'gear_wall',
    target: 12000,
    tex: 1024,
    emissive: 0.28,
  },
  {
    src: '_Outter_Walls/PIller_01.glb',
    name: 'pillar_broad',
    target: 6000,
    tex: 512,
    emissive: 0.28,
  },
  { src: '_Outter_Walls/Pillar_Large.glb', name: 'pillar_slim', tex: 512, emissive: 0.28 },
  { src: '_Outter_Walls/REACTOR.glb', name: 'reactor', target: 12000, tex: 1024, emissive: 1.0 },
  {
    src: '_Outter_Walls/Rusty%20gear%20wall%20.glb',
    name: 'gear_wall_rusty',
    target: 12000,
    tex: 1024,
    emissive: 0.28,
  },
  {
    src: '_Outter_Walls/WALL%20LAVE%20FACE%20V5.glb',
    name: 'lava_face',
    target: 10000,
    tex: 1024,
    emissive: 1.5,
  },
  {
    src: '_Raid_Room/%20ANVIL%20LAVA%20.glb',
    name: 'anvil',
    target: 16000,
    tex: 1024,
    emissive: 1.5,
  },
  { src: '_Raid_Room/Forge.glb', name: 'forge', target: 16000, tex: 1024, emissive: 1.4 },
  { src: '_Roof/Chain.glb', name: 'chain', tex: 512, darken: 0.45 },
  { src: '_Roof/Chain_Hanging.glb', name: 'chain_hanging', tex: 512, darken: 0.45 },
  // The New_Assets drop (2026-08-27) arrives pre-decimated (1k-3k tris), so
  // no simplify targets: weld only, texture sizing and the emissive pass.
  {
    src: 'New_Assets/Control_Machine.glb',
    name: 'control_machine',
    tex: 1024,
    emissive: 1.0,
  },
  { src: 'New_Assets/Furnace_Small.glb', name: 'furnace_small', tex: 1024, emissive: 1.4 },
  { src: 'New_Assets/Gear+Pile.glb', name: 'gear_pile', tex: 512, emissive: 0.28 },
  { src: 'New_Assets/Lava_Furnace.glb', name: 'lava_furnace', tex: 1024, emissive: 1.5 },
  { src: 'New_Assets/Press+Machine.glb', name: 'press_machine', tex: 1024, emissive: 1.4 },
  { src: 'New_Assets/Shelf.glb', name: 'shelf', tex: 1024, emissive: 0.28 },
  { src: 'New_Assets/Square+Wall.glb', name: 'square_wall', tex: 1024, emissive: 0.28 },
];
const SRC_DIR = 'tmp/asset_src/_IGNAR_Environment_Assets';
const OUT_DIR = 'public/models/dungeon';

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

function countTris(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += idx ? idx.getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3;
    }
  return tris;
}

const only = process.argv.slice(2);
const unknown = only.filter((name) => !ITEMS.some((item) => item.name === name));
if (unknown.length) throw new Error(`unknown item name(s): ${unknown.join(', ')}`);

for (const item of ITEMS) {
  if (only.length && !only.includes(item.name)) continue;
  const doc = await io.read(path.join(SRC_DIR, item.src));
  const before = countTris(doc);
  if (item.target && item.target < before) {
    await doc.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: item.target / before, error: 0.009 }),
    );
    const mid = countTris(doc);
    if (mid > item.target * 1.4)
      await doc.transform(
        simplify({ simplifier: MeshoptSimplifier, ratio: item.target / mid, error: 0.03 }),
      );
  } else {
    await doc.transform(weld());
  }
  await doc.transform(
    prune(),
    dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [item.tex, item.tex] }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  const root = doc.getRoot();
  if (item.darken) {
    // Bright steel sources read white in the dark forge grades: multiply the
    // albedo down to dark iron before compression.
    for (const tex of root.listTextures()) {
      const darkened = await sharp(Buffer.from(tex.getImage()))
        .modulate({ brightness: item.darken, saturation: 0.9 })
        .webp({ quality: 90 })
        .toBuffer();
      tex.setImage(new Uint8Array(darkened));
      tex.setMimeType('image/webp');
    }
  }
  for (const node of root.listNodes())
    if (node.getName().startsWith('tripo_')) node.setName(item.name);
  for (const mesh of root.listMeshes()) mesh.setName(item.name);
  for (const mat of root.listMaterials()) {
    mat.setName(item.name);
    if (item.emissive) {
      const base = mat.getBaseColorTexture();
      if (base && !mat.getEmissiveTexture()) {
        // Spec-valid overdrive: emissiveFactor stays in [0,1], the boost
        // rides KHR_materials_emissive_strength.
        mat.setEmissiveTexture(base);
        mat.setEmissiveFactor([1, 1, 1]);
        const strengthExt = doc.createExtension(KHRMaterialsEmissiveStrength);
        mat.setExtension(
          'KHR_materials_emissive_strength',
          strengthExt.createEmissiveStrength().setEmissiveStrength(item.emissive),
        );
      }
    }
  }
  const outPath = path.join(OUT_DIR, `ignivar_prop_${item.name}.glb`);
  await io.write(outPath, doc);
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(
    `ignivar_prop_${item.name}: ${Math.round(before / 1000)}k -> ${Math.round(countTris(doc) / 1000)}k tris, ${kb}KB`,
  );
}
