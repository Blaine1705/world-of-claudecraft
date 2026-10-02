// Ship the Blender-authored Stormbrass Foundry kit (docs/design/dungeon-rework/kit/).
// Never flatten or join: the runtime bakes each Kit_* node on its own and splits
// it by material (KitMetal riveted brass, copper, iron and steel; KitPaint
// dielectric paint, stone, timber and ceramic; KitGlow emissive molten brass,
// lamps and storm coils; KitGlass translucent cells, lamps and gauges).
//
//   "<blender>" -b --factory-startup --python docs/design/dungeon-rework/kit/build_stormbrass_foundry_kit.py
//   node scripts/assets/stormbrass_foundry_kit/build.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Every piece the runtime draws (src/render/stormbrass_foundry/foundry_kit.ts, placed
 *  by foundry_kit_plan_core.ts; the movers by foundry_machines.ts; the shutters, the
 *  arc posts and the Crane Bridge's span, hook and chains by foundry_gates.ts), plus
 *  the press hammer and carriage foundry_press.ts adopts. */
export const STORMBRASS_FOUNDRY_KIT_PIECES = [
  'ArcPost',
  'BeltDrum',
  'BeltHousing',
  'BlueprintTable',
  'Boiler',
  'BoilerHouse',
  'BridgeSpan',
  'Bunker',
  'Cable',
  'CatwalkTruss',
  'CellRack',
  'CellRackSmall',
  'Chain',
  'ChainHang',
  'ChainPost',
  'ChannelSegment',
  'CoilPylon',
  'ConveyorRun',
  'CraneJib',
  'CraneMast',
  'Crate',
  'CrateStack',
  'DraftScaffoldTower',
  'DrumCluster',
  'FloodMast',
  'FloorGrille',
  'Flywheel',
  'FurnaceMouth',
  'GantryScaffold',
  'Gear',
  'GreatCoil',
  'GreatCoilGlow',
  'Grinder',
  'HookBlock',
  'IngotStack',
  'Ladle',
  'LadleRail',
  'LadleTrolley',
  'LiftStation',
  'LightningRod',
  'MachineBlock',
  'MachineLip',
  'ModelFrame',
  'Mould',
  'ObservationPost',
  'OreSeam',
  'PartsChute',
  'Pier',
  'PipeEdge',
  'PipeRun',
  'PipeValve',
  'PistonEngine',
  'PistonRod',
  'PlateStack',
  'PourFrame',
  'PressCarriage',
  'PressCrown',
  'PressHammer',
  'PressPost',
  'PressRam',
  'RailBuffer',
  'RailCart',
  'RailTrack',
  'RailingEdge',
  'RangeFlag',
  'Sandbags',
  'Scaffold',
  'ScrapCart',
  'ScrapHeap',
  'ShutterFrame',
  'ShutterPanel',
  'Smokestack',
  'Spool',
  'SteamVent',
  'StormCoil',
  'TargetFrame',
  'TowerPanel',
  'TurretEmplacement',
  'WaterTower',
  'WorkLamp',
  'Workbench',
  'YardGantry',
  'YardGantryTrolley',
];

export const ASSET = {
  source: 'docs/design/dungeon-rework/kit/stormbrass_foundry_kit_components.glb',
  target: 'public/models/props/stormbrass_foundry_kit.glb',
  root: 'StormbrassFoundryKit_ROOT',
  materials: ['KitGlass', 'KitGlow', 'KitMetal', 'KitPaint'],
};

export function sourceFingerprint(root = ROOT) {
  const hash = createHash('sha256');
  // The Blender output itself is a local intermediate (reproducible from the
  // Python sources), so the fingerprint covers the sources.
  for (const file of [
    'docs/design/dungeon-rework/kit/hckit.py',
    'docs/design/dungeon-rework/kit/build_stormbrass_foundry_kit.py',
    'scripts/assets/stormbrass_foundry_kit/build.mjs',
  ]) {
    hash
      .update(file)
      .update('\0')
      .update(readFileSync(path.join(root, file)))
      .update('\0');
  }
  return hash.digest('hex');
}

export async function buildKit(root = ROOT) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  const doc = await io.read(path.join(root, ASSET.source));
  const gltf = doc.getRoot();
  // The builder may carry pieces the runtime does not draw yet: ship exactly
  // the listed ones (a missing one is an error, an extra one is dropped).
  const wanted = new Set([ASSET.root, ...STORMBRASS_FOUNDRY_KIT_PIECES.map((p) => `Kit_${p}`)]);
  for (const node of gltf.listNodes()) {
    if (!wanted.has(node.getName())) node.dispose();
  }
  const names = gltf
    .listNodes()
    .map((node) => node.getName())
    .sort();
  const expected = [...wanted].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    const missing = expected.filter((n) => !names.includes(n));
    throw new Error(`Blender nodes missing: ${missing.join(', ')}`);
  }
  await doc.transform(prune({ keepExtras: true }));
  const materials = gltf
    .listMaterials()
    .map((material) => material.getName())
    .sort();
  if (JSON.stringify(materials) !== JSON.stringify(ASSET.materials)) {
    throw new Error(`Unexpected Blender materials: ${materials.join(', ')}`);
  }
  if (gltf.listAnimations().length || gltf.listCameras().length || gltf.listTextures().length) {
    throw new Error('Only static texture-free geometry may ship');
  }
  gltf.setExtras({ sourceFingerprint: sourceFingerprint(root), authoring: 'Blender' });
  await doc.transform(
    prune({ keepExtras: true }),
    dedup(),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  return io.writeBinary(doc);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = await buildKit();
  mkdirSync(path.dirname(path.join(ROOT, ASSET.target)), { recursive: true });
  writeFileSync(path.join(ROOT, ASSET.target), bytes);
  console.log(
    `${ASSET.target}: ${bytes.length} bytes, sha256 ${createHash('sha256').update(bytes).digest('hex')}`,
  );
}
