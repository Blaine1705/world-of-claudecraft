import * as THREE from 'three';
import type { DungeonLayout } from '../sim/dungeon_layout';
import { VARKHUL_FORGE_LOCAL_POS } from '../sim/encounters/varkhul';
import { surfaceMat } from './gfx';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';
import { buildVarkhulGrandForge, prepareVarkhulGrandForgeAssets } from './varkhul_grand_forge';

export const IGNIVAR_APPROACH_DRESSING_NAME = 'ignivarForgeApproachDressing';
export const IGNIVAR_ASSEMBLY_DRESSING_NAME = 'ignivarMoltenAssemblyDressing';
export const VARKHUL_CRUCIBLE_DRESSING_NAME = 'varkhulInnerCrucibleDressing';

export interface IgnivarForgeLightPlacement {
  x: number;
  z: number;
  y: number;
  scale: number;
}

let channelGeometry: THREE.BoxGeometry | null = null;
let trenchGeometry: THREE.BoxGeometry | null = null;
let workshopDeckGeometry: THREE.BoxGeometry | null = null;

function sharedMaterial(options: Parameters<typeof surfaceMat>[0]): THREE.Material {
  return markSharedMaterial(surfaceMat(options));
}

export function ensureIgnivarRaidDressingAssets(interior: string): Promise<void> {
  return interior === 'ignivar_depths'
    ? prepareVarkhulGrandForgeAssets().catch(() => undefined)
    : Promise.resolve();
}

function markDressing(group: THREE.Group, name: string): THREE.Group {
  group.name = name;
  group.userData.renderCategory = 'dungeon';
  group.userData.collision = 'none';
  group.userData.actionable = false;
  return group;
}

export function ignivarRaidForgeLightPlacements(
  layout: DungeonLayout,
): IgnivarForgeLightPlacement[] {
  return (layout.decor ?? []).flatMap((entry) =>
    entry.key === 'ignivar_forge_station' ? [{ x: entry.x, z: entry.z, y: 1.1, scale: 2.15 }] : [],
  );
}

function buildWorkshopDeck(layout: DungeonLayout, name: string): THREE.InstancedMesh | null {
  const rooms = layout.rooms ?? [];
  if (rooms.length === 0) return null;
  workshopDeckGeometry ??= markSharedGeometry(new THREE.BoxGeometry(1, 1, 1));
  const material = sharedMaterial({
    color: 0x272321,
    metalness: 0.88,
    roughness: 0.58,
  });
  const deck = new THREE.InstancedMesh(workshopDeckGeometry, material, rooms.length * 4);
  deck.name = name;
  deck.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (const room of rooms) {
    const width = room.x1 - room.x0;
    const depth = room.z1 - room.z0;
    const cx = (room.x0 + room.x1) * 0.5;
    const cz = (room.z0 + room.z1) * 0.5;
    const horizontalLength = Math.max(4, Math.min(13, width - 7));
    const verticalLength = Math.max(4, Math.min(13, depth - 7));
    for (const z of [room.z0 + 2.4, room.z1 - 2.4]) {
      matrix.makeScale(horizontalLength, 0.045, 1.35);
      matrix.setPosition(cx, 0.018, z);
      deck.setMatrixAt(index++, matrix);
    }
    for (const x of [room.x0 + 2.4, room.x1 - 2.4]) {
      matrix.makeScale(1.35, 0.045, verticalLength);
      matrix.setPosition(x, 0.018, cz);
      deck.setMatrixAt(index++, matrix);
    }
  }
  deck.instanceMatrix.needsUpdate = true;
  deck.computeBoundingSphere();
  return deck;
}

function buildForgeApproachDressing(layout: DungeonLayout, lowGfx: boolean): THREE.Group {
  const group = markDressing(new THREE.Group(), IGNIVAR_APPROACH_DRESSING_NAME);
  const forge = layout.decor?.find((decor) => decor.key === 'ignivar_forge_station') ?? {
    x: 0,
    z: 0,
  };
  channelGeometry ??= markSharedGeometry(new THREE.BoxGeometry(1, 0.05, 1));
  const troughMaterial = sharedMaterial({
    color: 0x17100d,
    metalness: 0.78,
    roughness: 0.74,
  });
  const moltenMaterial = sharedMaterial({
    color: 0x35150b,
    emissive: 0xff7a24,
    emissiveIntensity: lowGfx ? 0.34 : 0.62,
    metalness: 0.05,
    roughness: 0.68,
  });

  const troughs = new THREE.InstancedMesh(channelGeometry, troughMaterial, 2);
  troughs.name = 'ignivarApproachMoltenTroughs';
  const feeds = new THREE.InstancedMesh(channelGeometry, moltenMaterial, 2);
  feeds.name = 'ignivarApproachMoltenFeeds';
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 2; index++) {
    const side = index === 0 ? -1 : 1;
    matrix.makeScale(10.5, 1, 0.8);
    matrix.setPosition(forge.x + side * 9.7, 0.035, forge.z);
    troughs.setMatrixAt(index, matrix);
    matrix.makeScale(10.5, 1, 0.18);
    matrix.setPosition(forge.x + side * 9.7, 0.065, forge.z);
    feeds.setMatrixAt(index, matrix);
  }
  troughs.instanceMatrix.needsUpdate = true;
  feeds.instanceMatrix.needsUpdate = true;
  const deck = buildWorkshopDeck(layout, 'ignivarApproachWorkshopDeck');
  group.add(troughs, feeds);
  if (deck) group.add(deck);
  group.userData.forgeCenter = { x: forge.x, z: forge.z };
  return group;
}

function buildMoltenAssemblyDressing(layout: DungeonLayout, lowGfx: boolean): THREE.Group {
  const group = markDressing(new THREE.Group(), IGNIVAR_ASSEMBLY_DRESSING_NAME);
  const forges = layout.decor?.filter((decor) => decor.key === 'ignivar_forge_station') ?? [];
  channelGeometry ??= markSharedGeometry(new THREE.BoxGeometry(1, 0.05, 1));
  const troughMaterial = sharedMaterial({
    color: 0x17100d,
    metalness: 0.78,
    roughness: 0.74,
  });
  const moltenMaterial = sharedMaterial({
    color: 0x35150b,
    emissive: 0xff7a24,
    emissiveIntensity: lowGfx ? 0.34 : 0.62,
    metalness: 0.05,
    roughness: 0.68,
  });
  const troughs = new THREE.InstancedMesh(channelGeometry, troughMaterial, forges.length * 2);
  troughs.name = 'ignivarAssemblyMoltenTroughs';
  const feeds = new THREE.InstancedMesh(channelGeometry, moltenMaterial, forges.length * 2);
  feeds.name = 'ignivarAssemblyMoltenFeeds';
  const matrix = new THREE.Matrix4();
  let feedIndex = 0;
  for (let index = 0; index < forges.length; index++) {
    const forge = forges[index];
    for (const side of [-1, 1]) {
      matrix.makeScale(0.8, 1, 7);
      matrix.setPosition(forge.x, 0.035, forge.z + side * 6.3);
      troughs.setMatrixAt(feedIndex, matrix);
      matrix.makeScale(0.18, 1, 7);
      matrix.setPosition(forge.x, 0.065, forge.z + side * 6.3);
      feeds.setMatrixAt(feedIndex++, matrix);
    }
  }
  troughs.instanceMatrix.needsUpdate = true;
  feeds.instanceMatrix.needsUpdate = true;
  const deck = buildWorkshopDeck(layout, 'ignivarAssemblyWorkshopDeck');
  group.add(troughs, feeds);
  if (deck) group.add(deck);
  group.userData.forgeCenters = forges.map(({ x, z }) => ({ x, z }));
  return group;
}

function buildInnerCrucibleDressing(
  layout: DungeonLayout,
  lowGfx: boolean,
  forgeBuilder: (x: number, z: number) => THREE.Group = buildVarkhulGrandForge,
): THREE.Group {
  const group = markDressing(new THREE.Group(), VARKHUL_CRUCIBLE_DRESSING_NAME);
  const halfWidth = layout.floorHalfX ?? layout.wallX ?? 40;
  const forgeZ = VARKHUL_FORGE_LOCAL_POS.z;
  const forge = forgeBuilder(VARKHUL_FORGE_LOCAL_POS.x, forgeZ);
  group.add(forge);

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

export function buildIgnivarRaidDressing(
  interior: string,
  layout: DungeonLayout,
  lowGfx: boolean,
): THREE.Group | null {
  if (interior === 'ignivar_approach') return buildForgeApproachDressing(layout, lowGfx);
  if (interior === 'ignivar_assembly') return buildMoltenAssemblyDressing(layout, lowGfx);
  if (interior === 'ignivar_depths') return buildInnerCrucibleDressing(layout, lowGfx);
  return null;
}

export const ignivarRaidDressingInternalsForTest = {
  buildForgeApproachDressing,
  buildMoltenAssemblyDressing,
  buildInnerCrucibleDressing,
};
