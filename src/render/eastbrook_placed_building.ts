// A PLACED town building: one of the painted Tidehold models stood in the
// built-in Eastbrook at the anchor, turn, size and seat it has on the Studio
// rebuild map (sim/eastbrook_layout.ts makePlacedBuilding), drawn with its own
// materials. The town view owns everything around it (the reveal gate, the fog
// cull, the camera fade); this module only builds the group.
//
// It mirrors what render/placed_assets.ts does for the same file on an
// authored map, so the built-in town and the map show the same building:
//   - the seat: the model's lowest point rests on the terrain under its own
//     origin, then the authored lift buries the footing;
//   - the size: one uniform scale, never the per-axis fit the kit shells take;
//   - the glow: a weakly authored emissive channel is lifted over the bloom
//     threshold, exactly as a placed asset's is;
//   - the file: the profile's texture tier of the model, same geometry.
import * as THREE from 'three';
import type { EASTBROOK_LAYOUT } from '../sim/eastbrook_layout';
import { GFX } from './gfx';
import { cloneMaterialWithHooks } from './material_clone_hooks';
import { type OccluderFadeMat, occluderFadeRecordFor } from './occluder_fade';

type EastbrookBuilding = (typeof EASTBROOK_LAYOUT.buildings)[number];

const PLACED_BUILDING_ASSET_PREFIX = '/models/tidehold/';

/** The emissive floor render/placed_assets.ts lifts a placed model's glow to
 *  (its MIN_NATIVE_EMISSIVE_INTENSITY): the painted walls author their lit
 *  panes at 1, under the bloom threshold, so unlifted they never glow. */
export const PLACED_BUILDING_EMISSIVE_FLOOR = 2.2;

/** Nodes holding a model's furniture. Indoors, so they never cast a shadow
 *  anyone can see; they still draw, through every door and pane. */
const INTERIOR_NODE_PREFIX = 'G_INT';

export function isPlacedBuildingAsset(url: string): boolean {
  return url.startsWith(PLACED_BUILDING_ASSET_PREFIX);
}

/** Whether a mesh hangs under one of the model's interior groups. */
export function isPlacedBuildingInterior(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node.name.startsWith(INTERIOR_NODE_PREFIX)) return true;
  }
  return false;
}

type PlacedSourceMaterial = THREE.Material & {
  map?: THREE.Texture | null;
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveMap?: THREE.Texture | null;
  emissiveIntensity?: number;
};

function liftWeakEmissive(material: PlacedSourceMaterial): void {
  const emissive = material.emissive;
  const intensity = material.emissiveIntensity;
  if (!emissive || intensity === undefined) return;
  if (emissive.r <= 0 && emissive.g <= 0 && emissive.b <= 0) return;
  if (intensity > 0 && intensity < PLACED_BUILDING_EMISSIVE_FLOOR) {
    material.emissiveIntensity = PLACED_BUILDING_EMISSIVE_FLOOR;
  }
}

/**
 * The per-building clone of one of the model's materials. The Standard tiers
 * keep the GLB material whole; the Lambert tiers downgrade like every town
 * material, carrying everything a Lambert can still say about it (the leaf
 * cards' cutout and both-sides draw included, or they would draw as solid
 * quads).
 */
export function placedBuildingMaterial(source: THREE.Material): THREE.Material {
  if (GFX.standardMaterials) {
    // The hook-preserving clone and nothing more: the camera fade's gate twin
    // (occluder_fade_gate.ts) is cloned the same way, so the program the twin
    // links is the program the fade flips to. A shader layer the clone-hook
    // registry does not carry (the loader's leaf edge fade) is deliberately
    // not copied by hand: the twin would not carry it, and the first fade
    // would link its program cold in a live frame. The leaf cards keep their
    // authored cutout.
    const clone = cloneMaterialWithHooks(source) as PlacedSourceMaterial;
    liftWeakEmissive(clone);
    return clone;
  }
  const from = source as PlacedSourceMaterial;
  const lambert = new THREE.MeshLambertMaterial({
    map: from.map ?? null,
    color: from.color?.clone() ?? new THREE.Color(0xffffff),
    vertexColors: source.vertexColors,
    side: source.side,
    alphaTest: source.alphaTest,
    transparent: source.transparent,
    opacity: source.opacity,
    depthWrite: source.depthWrite,
  });
  if (from.emissive) lambert.emissive = from.emissive.clone();
  if (from.emissiveMap) lambert.emissiveMap = from.emissiveMap;
  if (from.emissiveIntensity !== undefined) lambert.emissiveIntensity = from.emissiveIntensity;
  lambert.name = source.name;
  return lambert;
}

export interface PlacedBuildingBuild {
  group: THREE.Group;
  /** One fade record per (material, mesh shape) of the building. */
  mats: OccluderFadeMat[];
  /** World height of the model's top, for the camera-fade box. */
  topY: number;
  /** From the record's own centre out to the farthest corner the model
   *  reaches (its porch, stair and eaves), for the fog cull. */
  cullRadius: number;
}

/**
 * Stand `source` (the loaded model scene) in the town for `building`.
 * `groundAt` is the terrain height under a world point.
 */
export function buildEastbrookPlacedBuilding(
  building: EastbrookBuilding,
  source: THREE.Object3D,
  groundAt: (x: number, z: number) => number,
): PlacedBuildingBuild {
  const { placement } = building;
  const clone = source.clone(true);
  // Bounds while the clone is parentless at the origin: the model's own frame.
  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);

  const mats: OccluderFadeMat[] = [];
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = !isPlacedBuildingInterior(child);
    child.receiveShadow = true;
    const list = Array.isArray(child.material) ? child.material : [child.material];
    const cloned = list.map((material) => placedBuildingMaterial(material));
    child.material = Array.isArray(child.material) ? cloned : cloned[0];
    for (const material of cloned) occluderFadeRecordFor(mats, material, child);
  });

  const wrap = new THREE.Group();
  wrap.add(clone);
  wrap.scale.setScalar(placement.scale);

  const ground = groundAt(placement.x, placement.z);
  const group = new THREE.Group();
  group.name = `eastbrookBuilding:${building.id}`;
  group.userData.eastbrookBuildingId = building.id;
  group.userData.assetId = building.assetId;
  group.userData.assetUrl = building.assetId;
  group.userData.position = building.position;
  group.userData.rotation = building.rotation;
  group.userData.target = building.nativeDimensions;
  group.userData.front = building.frontStandingPoint;
  group.userData.placement = placement;
  // The footing is the model's own, buried by the lift: no skirt is drawn.
  group.userData.foundationDepth = 0;
  group.position.set(
    placement.x,
    ground - box.min.y * placement.scale + placement.lift,
    placement.z,
  );
  group.rotation.y = placement.rotation;
  group.add(wrap);

  const reach = building.reach;
  const cullRadius =
    Math.hypot(reach.center.x - building.position.x, reach.center.z - building.position.z) +
    Math.hypot(reach.halfWidth, reach.halfDepth);
  return {
    group,
    mats,
    topY: ground + building.nativeDimensions.height,
    cullRadius,
  };
}
