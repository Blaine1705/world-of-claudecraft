import * as THREE from 'three';
import type { DungeonLayout } from '../sim/dungeon_layout';
import { VARKHUL_FORGE_LOCAL_POS } from '../sim/encounters/varkhul';
import {
  addIgnivarPlacedTorchFires,
  type TorchFireColors,
  type TorchFireTuning,
} from './dungeon_torch_rig';
import { surfaceMat } from './gfx';
import {
  filterIgnivarPropPlacements,
  type IgnivarEnvPropKey,
  type IgnivarPropPlacement,
  ignivarApproachPropPlan,
  ignivarArenaPropPlan,
  ignivarCruciblePropPlan,
} from './ignivar_dressing_plan_core';
import { appendIgnivarEnvProps, prepareIgnivarEnvProps } from './ignivar_env_props';
import { buildIgnivarLiftShaft } from './ignivar_lift_room';
import type { FireLightSink } from './point_light_budget';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';
import { addTorchGlowDecal } from './torch_glow_decal';

export const IGNIVAR_APPROACH_DRESSING_NAME = 'ignivarForgeApproachDressing';
export const IGNIVAR_ARENA_DRESSING_NAME = 'ignivarCrucibleArenaDressing';
export const VARKHUL_CRUCIBLE_DRESSING_NAME = 'varkhulInnerCrucibleDressing';
export const IGNIVAR_APPROACH_CLEAR_HALF_WIDTH = 7.5;

type PropAppender = typeof appendIgnivarEnvProps;

let railGeometry: THREE.BoxGeometry | null = null;
let stationGeometry: THREE.CylinderGeometry | null = null;
let trenchGeometry: THREE.BoxGeometry | null = null;

function sharedMaterial(options: Parameters<typeof surfaceMat>[0]): THREE.Material {
  return markSharedMaterial(surfaceMat(options));
}

export function ensureIgnivarRaidDressingAssets(interior: string): Promise<void> {
  return interior === 'ignivar_approach' || interior === 'ignivar' || interior === 'ignivar_depths'
    ? prepareIgnivarEnvProps().catch(() => undefined)
    : Promise.resolve();
}

/** Baked additive floor pools under the molten props (the addTorchGlow
 *  recipe: no new lights, the light census stays frozen). Skipped on the low
 *  tier like every other glow decal. Interior pools sit on the room floor
 *  (y 0 placements only, so a raised prop never mints a floating disc);
 *  `atPlacementY` pools ride their placement's own height instead, for the
 *  exterior pieces whose world y IS their standing surface. */
const PROP_GLOW_POOLS: Partial<
  Record<IgnivarEnvPropKey, { color: number; scale: number; atPlacementY?: boolean }>
> = {
  firepit: { color: 0xff7a2e, scale: 0.75 },
  lava_face: { color: 0xff4316, scale: 0.85 },
  anvil: { color: 0xff5c1e, scale: 1.25 },
  forge: { color: 0xff5c1e, scale: 1.05 },
  reactor: { color: 0xffa04a, scale: 0.7 },
  // the Exterior_Assets fortress kit's molten pieces
  dragon_head: { color: 0xff4316, scale: 0.9 },
  fountain_base: { color: 0xff5c1e, scale: 0.85 },
  lava_furnace_2: { color: 0xff4316, scale: 0.8 },
  lava_pillar: { color: 0xff5c1e, scale: 0.7 },
  lava_ramp: { color: 0xff4316, scale: 0.9 },
  // The raid-door facade: a deep red threshold pool under the mist gate
  // (the facade seats on raised floor plates, so it anchors at placement y).
  dungeon_entrance: { color: 0xff2a14, scale: 0.8, atPlacementY: true },
  // (The bridge rails carry no floor pool: their braziers glow through the
  // flame's own baked emissive, per the owner's direction.)
};

export function addPropGlowPools(
  group: THREE.Group,
  placements: readonly IgnivarPropPlacement[],
  lowGfx: boolean,
): void {
  // The pools are canvas-backed cosmetics: skip on the low tier, and in
  // DOM-less hosts (the dressing builders are unit-tested in Node).
  if (lowGfx || typeof document === 'undefined') return;
  for (const placement of placements) {
    const pool = PROP_GLOW_POOLS[placement.key];
    if (!pool) continue;
    if (pool.atPlacementY) {
      addTorchGlowDecal(
        group,
        placement.x,
        placement.z,
        pool.color,
        placement.y + 0.09,
        pool.scale,
      );
      continue;
    }
    if (placement.y !== 0) continue;
    addTorchGlowDecal(group, placement.x, placement.z, pool.color, 0.07, pool.scale);
  }
}

function markDressing(group: THREE.Group, name: string): THREE.Group {
  group.name = name;
  group.userData.renderCategory = 'dungeon';
  group.userData.collision = 'none';
  group.userData.actionable = false;
  return group;
}

function buildForgeApproachDressing(
  layout: DungeonLayout,
  lowGfx: boolean,
  appendProps: PropAppender = appendIgnivarEnvProps,
): THREE.Group {
  const group = markDressing(new THREE.Group(), IGNIVAR_APPROACH_DRESSING_NAME);
  const placements = filterIgnivarPropPlacements(ignivarApproachPropPlan(layout), lowGfx);
  appendProps(group, placements, lowGfx);
  addPropGlowPools(group, placements, lowGfx);
  // The forge-lift car's descending-shaft illusion wraps the entry pocket
  // (self-animating on the shared uTime clock, zero per-frame CPU).
  group.add(buildIgnivarLiftShaft(lowGfx));
  const halfWidth = layout.floorHalfX ?? layout.wallX ?? 18;
  const sideX = Math.max(IGNIVAR_APPROACH_CLEAR_HALF_WIDTH + 2, Math.min(halfWidth - 3.5, 13));
  const length = Math.max(12, layout.zMax - layout.zMin - 10);
  const centerZ = (layout.zMin + layout.zMax) / 2;

  railGeometry ??= markSharedGeometry(new THREE.BoxGeometry(0.32, 0.08, 1));
  const railMaterial = sharedMaterial({
    color: 0x493a34,
    metalness: 0.72,
    roughness: 0.48,
  });
  const rails = new THREE.InstancedMesh(railGeometry, railMaterial, 4);
  rails.name = 'ignivarApproachAssemblyRails';
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 4; index++) {
    const x = (index < 2 ? -1 : 1) * sideX + (index % 2 === 0 ? -0.7 : 0.7);
    matrix.makeScale(1, 1, length);
    matrix.setPosition(x, 0.08, centerZ);
    rails.setMatrixAt(index, matrix);
  }
  rails.instanceMatrix.needsUpdate = true;
  group.add(rails);

  stationGeometry ??= markSharedGeometry(new THREE.CylinderGeometry(1.45, 1.7, 1.1, 12));
  const stationMaterial = sharedMaterial({
    color: 0x241a19,
    emissive: 0x8a2d12,
    emissiveIntensity: lowGfx ? 0.55 : 0.95,
    metalness: 0.55,
    roughness: 0.58,
  });
  const stationCount = lowGfx ? 4 : 6;
  const stations = new THREE.InstancedMesh(stationGeometry, stationMaterial, stationCount);
  stations.name = 'ignivarApproachTemperingStations';
  for (let index = 0; index < stationCount; index++) {
    const lane = index % 2 === 0 ? -1 : 1;
    const row = Math.floor(index / 2);
    const rowCount = Math.ceil(stationCount / 2);
    const z = layout.zMin + 10 + (row / Math.max(1, rowCount - 1)) * (length - 10);
    matrix.makeTranslation(lane * sideX, 0.55, z);
    stations.setMatrixAt(index, matrix);
  }
  stations.instanceMatrix.needsUpdate = true;
  group.add(stations);
  group.userData.clearHalfWidth = IGNIVAR_APPROACH_CLEAR_HALF_WIDTH;
  return group;
}

/** Crucible of the Last Spring: authored props only; the arena atmosphere
 *  module owns the floor bands and embers. */
function buildCrucibleArenaDressing(
  layout: DungeonLayout,
  lowGfx: boolean,
  appendProps: PropAppender = appendIgnivarEnvProps,
): THREE.Group {
  const group = markDressing(new THREE.Group(), IGNIVAR_ARENA_DRESSING_NAME);
  const placements = filterIgnivarPropPlacements(ignivarArenaPropPlan(layout), lowGfx);
  appendProps(group, placements, lowGfx);
  addPropGlowPools(group, placements, lowGfx);
  return group;
}

function buildInnerCrucibleDressing(
  layout: DungeonLayout,
  lowGfx: boolean,
  appendProps: PropAppender = appendIgnivarEnvProps,
): THREE.Group {
  const group = markDressing(new THREE.Group(), VARKHUL_CRUCIBLE_DRESSING_NAME);
  const halfWidth = layout.floorHalfX ?? layout.wallX ?? 40;
  const forgeZ = VARKHUL_FORGE_LOCAL_POS.z;
  // The authored anvil sits exactly on the encounter's forge anchor (the
  // boss works it pre-pull); the furnace and sealed vault stack behind it.
  const placements = filterIgnivarPropPlacements(ignivarCruciblePropPlan(layout), lowGfx);
  appendProps(group, placements, lowGfx);
  addPropGlowPools(group, placements, lowGfx);

  trenchGeometry ??= markSharedGeometry(new THREE.BoxGeometry(1, 0.045, 1));
  const trenchMaterial = sharedMaterial({
    color: 0x55180d,
    emissive: 0xff4316,
    emissiveIntensity: lowGfx ? 0.72 : 1.25,
    metalness: 0.08,
    roughness: 0.66,
  });
  const trenches = new THREE.InstancedMesh(trenchGeometry, trenchMaterial, 2);
  trenches.name = 'varkhulMoltenSideTrenches';
  const matrix = new THREE.Matrix4();
  const trenchX = Math.max(18, halfWidth - 5);
  const trenchLength = Math.max(18, layout.zMax - layout.zMin - 14);
  for (let index = 0; index < 2; index++) {
    matrix.makeScale(1.15, 1, trenchLength);
    matrix.setPosition(index === 0 ? -trenchX : trenchX, 0.07, 0);
    trenches.setMatrixAt(index, matrix);
  }
  trenches.instanceMatrix.needsUpdate = true;
  group.add(trenches);
  group.userData.forgeZ = forgeZ;
  group.userData.fightingFloorClearRadius = Math.max(14, trenchX - 3);
  return group;
}

export interface IgnivarTorchFire {
  flames: THREE.Mesh[];
  fireLights: FireLightSink;
  colors: TorchFireColors;
  tuning: TorchFireTuning;
}

function ignivarRoomPropPlan(interior: string, layout: DungeonLayout): IgnivarPropPlacement[] {
  if (interior === 'ignivar_approach') return ignivarApproachPropPlan(layout);
  if (interior === 'ignivar') return ignivarArenaPropPlan(layout);
  if (interior === 'ignivar_depths') return ignivarCruciblePropPlan(layout);
  return [];
}

export function buildIgnivarRaidDressing(
  interior: string,
  layout: DungeonLayout,
  lowGfx: boolean,
  torchFire?: IgnivarTorchFire,
): THREE.Group | null {
  const group =
    interior === 'ignivar_approach'
      ? buildForgeApproachDressing(layout, lowGfx)
      : interior === 'ignivar'
        ? buildCrucibleArenaDressing(layout, lowGfx)
        : interior === 'ignivar_depths'
          ? buildInnerCrucibleDressing(layout, lowGfx)
          : null;
  if (group && torchFire) {
    // Fire for the plan's placed torches, on the same tier filtering the
    // meshes get so a dropped density torch never leaves an orphan flame.
    addIgnivarPlacedTorchFires(
      { group, flames: torchFire.flames, fireLights: torchFire.fireLights },
      filterIgnivarPropPlacements(ignivarRoomPropPlan(interior, layout), lowGfx),
      torchFire.colors,
      torchFire.tuning,
    );
  }
  return group;
}

export const ignivarRaidDressingInternalsForTest = {
  buildForgeApproachDressing,
  buildCrucibleArenaDressing,
  buildInnerCrucibleDressing,
};
