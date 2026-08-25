import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildIgnivarRaidDressing,
  IGNIVAR_APPROACH_DRESSING_NAME,
  IGNIVAR_ASSEMBLY_DRESSING_NAME,
  ignivarRaidDressingInternalsForTest,
  ignivarRaidForgeLightPlacements,
  VARKHUL_CRUCIBLE_DRESSING_NAME,
} from '../src/render/ignivar_raid_dressing';
import {
  buildIgnivarRaidStandIns,
  settleIgnivarRaidStandIns,
} from '../src/render/ignivar_raid_stand_ins';
import {
  buildIgnivarRaidWallFacade,
  IGNIVAR_RAID_FLOOR_TINT,
  IGNIVAR_RAID_WALL_TINT,
} from '../src/render/ignivar_raid_wall_facade';
import {
  ensureInfernalDecorAssets,
  isInfernalDecorModelAvailable,
  resetInfernalDecorAssetsForTest,
} from '../src/render/rift_decor';
import {
  type DungeonLayout,
  IGNIVAR_FORGE_APPROACH_LAYOUT,
  IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT,
} from '../src/sim/dungeon_layout';
import { VARKHUL_FORGE_LOCAL_POS } from '../src/sim/encounters/varkhul';
import { authoredWallSegments } from '../src/sim/rift/authored';

function instanceTransform(mesh: THREE.InstancedMesh, index: number) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.getMatrixAt(index, matrix);
  matrix.decompose(position, rotation, scale);
  const rounded = (value: number): number => Math.round(value * 1_000) / 1_000;
  return {
    position: [rounded(position.x), rounded(position.y), rounded(position.z)],
    scale: [rounded(scale.x), rounded(scale.y), rounded(scale.z)],
  };
}

const APPROACH_LAYOUT: DungeonLayout = {
  zMin: -38,
  zMax: 38,
  sideWallZ: 0,
  sideWallHd: 38,
  wallX: 18,
  floorHalfX: 18,
  doorZ: -38,
  pillars: [],
  tombs: [],
  stubs: [],
  dais: { x: 0, z: 30, r: 5 },
};

const INNER_LAYOUT: DungeonLayout = {
  ...APPROACH_LAYOUT,
  zMin: -40,
  zMax: 40,
  wallX: 40,
  floorHalfX: 40,
};

describe('expanded Ignivar raid dressing', () => {
  it('keeps only failed collidable props on the temporary loading footprints', () => {
    const decor = [
      { key: 'ignivar_forge_station', x: -8, z: 4, yaw: 0, r: 2.34 },
      { key: 'ignivar_reactor', x: 9, z: 7, yaw: Math.PI / 2, r: 1.65 },
    ];
    const standIns = buildIgnivarRaidStandIns(decor);
    if (!standIns) throw new Error('Collidable decor did not create loading footprints');
    const root = new THREE.Group();
    root.add(standIns.group);

    expect(standIns.mesh.count).toBe(2);
    expect(instanceTransform(standIns.mesh, 0)).toEqual({
      position: [-8, 0.08, 4],
      scale: [2.34, 1, 2.34],
    });

    const failed = settleIgnivarRaidStandIns(
      standIns,
      (entry) => entry.key === 'ignivar_forge_station',
    );
    expect(failed).toBe(1);
    expect(standIns.mesh.count).toBe(1);
    expect(instanceTransform(standIns.mesh, 0)).toEqual({
      position: [9, 0.08, 7],
      scale: [1.65, 1, 1.65],
    });
    expect(root.children).toContain(standIns.group);

    expect(settleIgnivarRaidStandIns(standIns, () => true)).toBe(0);
    expect(root.children).not.toContain(standIns.group);

    const allFailed = buildIgnivarRaidStandIns(decor);
    if (!allFailed) throw new Error('Failed decor did not create loading footprints');
    const failedRoot = new THREE.Group();
    failedRoot.add(allFailed.group);
    expect(settleIgnivarRaidStandIns(allFailed, () => false)).toBe(2);
    expect(allFailed.mesh.count).toBe(2);
    expect(failedRoot.children).toContain(allFailed.group);
  });

  it('settles infernal footprints through the real model-availability predicate', async () => {
    resetInfernalDecorAssetsForTest();
    const decor = [
      { key: 'infernal_brazier', x: -3, z: 1, yaw: 0, r: 0.85 },
      { key: 'infernal_statue', x: 4, z: 1, yaw: 0, r: 0.98 },
    ];
    const loader = async (url: string) => {
      if (url.endsWith('infernal_statue.glb')) throw new Error('missing optional statue');
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
      return { scene };
    };
    try {
      await ensureInfernalDecorAssets(decor, loader);
      expect(isInfernalDecorModelAvailable('infernal_brazier')).toBe(true);
      expect(isInfernalDecorModelAvailable('infernal_statue')).toBe(false);
      const standIns = buildIgnivarRaidStandIns(decor);
      if (!standIns) throw new Error('Infernal decor did not create loading footprints');
      expect(
        settleIgnivarRaidStandIns(standIns, (entry) => isInfernalDecorModelAvailable(entry.key)),
      ).toBe(1);
      expect(standIns.mesh.count).toBe(1);
      expect(instanceTransform(standIns.mesh, 0)).toEqual({
        position: [4, 0.08, 1],
        scale: [0.98, 1, 0.98],
      });
    } finally {
      resetInfernalDecorAssetsForTest();
    }
  });

  it.each([
    ['approach', IGNIVAR_FORGE_APPROACH_LAYOUT],
    ['assembly', IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT],
  ] as const)('builds dark forge facades inside every hideable %s wall run', (_name, layout) => {
    const segments = authoredWallSegments(layout.rooms ?? [], layout.doors ?? []);
    const facades = segments.map((segment) => buildIgnivarRaidWallFacade(segment, false));

    expect(facades).toHaveLength(segments.length);
    for (let index = 0; index < facades.length; index++) {
      const facade = facades[index];
      const segment = segments[index];
      const length = segment.b - segment.a;
      const center = (segment.a + segment.b) * 0.5;
      expect(facade.group.userData.wallSegment).toEqual(segments[index]);
      expect(facade.fadeMaterials).toHaveLength(2);
      expect(facade.group.children).toHaveLength(2);
      const ironwork = facade.group.getObjectByName('ignivarWallIronwork') as THREE.InstancedMesh;
      expect(ironwork).toBeInstanceOf(THREE.InstancedMesh);
      expect(instanceTransform(ironwork, 0)).toEqual(
        segment.axis === 'x'
          ? { position: [center, 0.42, segment.fixed], scale: [length, 0.84, 1.46] }
          : { position: [segment.fixed, 0.42, center], scale: [1.46, 0.84, length] },
      );
      expect(facade.group.getObjectByName('ignivarWallEmberSeams')).toBeInstanceOf(
        THREE.InstancedMesh,
      );
    }
    expect(new Set(facades.flatMap((facade) => facade.fadeMaterials)).size).toBe(
      segments.length * 2,
    );
    expect(IGNIVAR_RAID_WALL_TINT).toBe(0x68473c);
    expect(IGNIVAR_RAID_FLOOR_TINT).toBe(0x8d756a);
  });

  it('feeds the approach smelter through physical troughs without a closed telegraph ring', () => {
    const forge = IGNIVAR_FORGE_APPROACH_LAYOUT.decor?.find(
      (decor) => decor.key === 'ignivar_forge_station',
    );
    if (!forge) throw new Error('Approach forge decor is missing');
    expect(ignivarRaidForgeLightPlacements(IGNIVAR_FORGE_APPROACH_LAYOUT)).toEqual([
      { x: 0, z: -8, y: 1.1, scale: 2.15 },
    ]);

    for (const lowGfx of [true, false]) {
      const group = ignivarRaidDressingInternalsForTest.buildForgeApproachDressing(
        IGNIVAR_FORGE_APPROACH_LAYOUT,
        lowGfx,
      );
      expect(group.name).toBe(IGNIVAR_APPROACH_DRESSING_NAME);
      expect(group.userData.forgeCenter).toEqual({ x: forge.x, z: forge.z });
      const troughs = group.getObjectByName('ignivarApproachMoltenTroughs') as THREE.InstancedMesh;
      const feeds = group.getObjectByName('ignivarApproachMoltenFeeds') as THREE.InstancedMesh;
      const deck = group.getObjectByName('ignivarApproachWorkshopDeck') as THREE.InstancedMesh;
      expect(group.getObjectByName('ignivarApproachSmelterHalo')).toBeUndefined();
      expect(troughs).toBeInstanceOf(THREE.InstancedMesh);
      expect(troughs.count).toBe(2);
      expect(feeds).toBeInstanceOf(THREE.InstancedMesh);
      expect(feeds.count).toBe(2);
      expect(deck).toBeInstanceOf(THREE.InstancedMesh);
      expect(deck.count).toBe((IGNIVAR_FORGE_APPROACH_LAYOUT.rooms?.length ?? 0) * 4);
      expect([0, 1, 2, 3, 16, 17, 18, 19].map((index) => instanceTransform(deck, index))).toEqual([
        { position: [0, 0.018, -63.6], scale: [13, 0.045, 1.35] },
        { position: [0, 0.018, -44.4], scale: [13, 0.045, 1.35] },
        { position: [-13.6, 0.018, -54], scale: [1.35, 0.045, 13] },
        { position: [13.6, 0.018, -54], scale: [1.35, 0.045, 13] },
        { position: [0, 0.018, 38.4], scale: [13, 0.045, 1.35] },
        { position: [0, 0.018, 73.6], scale: [13, 0.045, 1.35] },
        { position: [-49.6, 0.018, 56], scale: [1.35, 0.045, 13] },
        { position: [49.6, 0.018, 56], scale: [1.35, 0.045, 13] },
      ]);
      expect([0, 1].map((index) => instanceTransform(troughs, index))).toEqual([
        { position: [-9.7, 0.035, -8], scale: [10.5, 1, 0.8] },
        { position: [9.7, 0.035, -8], scale: [10.5, 1, 0.8] },
      ]);
      expect([0, 1].map((index) => instanceTransform(feeds, index))).toEqual([
        { position: [-9.7, 0.065, -8], scale: [10.5, 1, 0.18] },
        { position: [9.7, 0.065, -8], scale: [10.5, 1, 0.18] },
      ]);
      const feedMaterial = feeds.material as THREE.MeshStandardMaterial;
      expect(feedMaterial.color.getHex()).toBe(0x35150b);
      expect(feedMaterial.emissive.getHex()).toBe(0xff7a24);
      expect(feedMaterial.emissiveIntensity).toBe(lowGfx ? 0.34 : 0.62);
    }
  });

  it('gives both Molten Assembly workshops their own physical feed channels', () => {
    const group = ignivarRaidDressingInternalsForTest.buildMoltenAssemblyDressing(
      IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT,
      false,
    );
    const forges = IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.decor?.filter(
      (decor) => decor.key === 'ignivar_forge_station',
    );
    const troughs = group.getObjectByName('ignivarAssemblyMoltenTroughs') as THREE.InstancedMesh;
    const feeds = group.getObjectByName('ignivarAssemblyMoltenFeeds') as THREE.InstancedMesh;
    const deck = group.getObjectByName('ignivarAssemblyWorkshopDeck') as THREE.InstancedMesh;

    expect(ignivarRaidForgeLightPlacements(IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT)).toEqual([
      { x: -36, z: 0, y: 1.1, scale: 2.15 },
      { x: 36, z: 0, y: 1.1, scale: 2.15 },
    ]);

    expect(group.name).toBe(IGNIVAR_ASSEMBLY_DRESSING_NAME);
    expect(group.userData.forgeCenters).toEqual(forges?.map(({ x, z }) => ({ x, z })));
    expect(group.getObjectByName('ignivarAssemblyForgeHalos')).toBeUndefined();
    expect(troughs).toBeInstanceOf(THREE.InstancedMesh);
    expect(troughs.count).toBe(4);
    expect(feeds).toBeInstanceOf(THREE.InstancedMesh);
    expect(feeds.count).toBe(4);
    expect(deck).toBeInstanceOf(THREE.InstancedMesh);
    expect(deck.count).toBe((IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT.rooms?.length ?? 0) * 4);
    expect([0, 1, 2, 3, 20, 21, 22, 23].map((index) => instanceTransform(deck, index))).toEqual([
      { position: [0, 0.018, -63.6], scale: [13, 0.045, 1.35] },
      { position: [0, 0.018, -46.4], scale: [13, 0.045, 1.35] },
      { position: [-13.6, 0.018, -55], scale: [1.35, 0.045, 13] },
      { position: [13.6, 0.018, -55], scale: [1.35, 0.045, 13] },
      { position: [0, 0.018, 56.4], scale: [13, 0.045, 1.35] },
      { position: [0, 0.018, 81.6], scale: [13, 0.045, 1.35] },
      { position: [-25.6, 0.018, 69], scale: [1.35, 0.045, 13] },
      { position: [25.6, 0.018, 69], scale: [1.35, 0.045, 13] },
    ]);
    expect([0, 1, 2, 3].map((index) => instanceTransform(troughs, index))).toEqual([
      { position: [-36, 0.035, -6.3], scale: [0.8, 1, 7] },
      { position: [-36, 0.035, 6.3], scale: [0.8, 1, 7] },
      { position: [36, 0.035, -6.3], scale: [0.8, 1, 7] },
      { position: [36, 0.035, 6.3], scale: [0.8, 1, 7] },
    ]);
    expect([0, 1, 2, 3].map((index) => instanceTransform(feeds, index))).toEqual([
      { position: [-36, 0.065, -6.3], scale: [0.18, 1, 7] },
      { position: [-36, 0.065, 6.3], scale: [0.18, 1, 7] },
      { position: [36, 0.065, -6.3], scale: [0.18, 1, 7] },
      { position: [36, 0.065, 6.3], scale: [0.18, 1, 7] },
    ]);
    const feedMaterial = feeds.material as THREE.MeshStandardMaterial;
    expect(feedMaterial.color.getHex()).toBe(0x35150b);
    expect(feedMaterial.emissive.getHex()).toBe(0xff7a24);
    expect(feedMaterial.emissiveIntensity).toBe(0.62);

    const lowGroup = ignivarRaidDressingInternalsForTest.buildMoltenAssemblyDressing(
      IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT,
      true,
    );
    const lowFeeds = lowGroup.getObjectByName('ignivarAssemblyMoltenFeeds') as THREE.InstancedMesh;
    const lowFeedMaterial = lowFeeds.material as THREE.MeshStandardMaterial;
    expect(lowFeedMaterial.color.getHex()).toBe(0x35150b);
    expect(lowFeedMaterial.emissive.getHex()).toBe(0xff7a24);
    expect(lowFeedMaterial.emissiveIntensity).toBe(0.34);
  });

  it('dispatches Assembly dressing and reveals the structural shell before decor downloads', () => {
    expect(
      buildIgnivarRaidDressing('ignivar_assembly', IGNIVAR_MOLTEN_ASSEMBLY_LAYOUT, false)?.name,
    ).toBe(IGNIVAR_ASSEMBLY_DRESSING_NAME);
    expect(buildIgnivarRaidDressing('crypt', APPROACH_LAYOUT, false)).toBeNull();

    const dungeonSource = readFileSync(
      new URL('../src/render/dungeon.ts', import.meta.url),
      'utf8',
    );
    const authoredStart = dungeonSource.indexOf("if (interior === 'ignivar_approach'");
    const authoredEnd = dungeonSource.indexOf('await ensureInfernalDecorAssets();', authoredStart);
    const authoredRaidArm = dungeonSource.slice(authoredStart, authoredEnd);
    const shellAttach = authoredRaidArm.indexOf(
      'attachSceneGroupGated(this.scene, group, this.compileGate)',
    );
    const decorEnsure = authoredRaidArm.indexOf('ensureInfernalDecorAssets(layout.decor ?? [])');
    expect(authoredStart).toBeGreaterThan(-1);
    expect(authoredEnd).toBeGreaterThan(authoredStart);
    expect(shellAttach).toBeGreaterThan(-1);
    expect(decorEnsure).toBeGreaterThan(shellAttach);
    expect(authoredRaidArm).toContain(
      'ensureIgnivarRaidPropAssets(layout.decor ?? [], this.lowGfx)',
    );
    expect(authoredRaidArm).toMatch(
      /buildIgnivarRaidProps\(\s*layout\.decor \?\? \[\],\s*this\.lowGfx,?\s*\)/,
    );
    expect(authoredRaidArm).toContain('buildIgnivarRaidStandIns(layout.decor ?? [])');
    expect(authoredRaidArm).toContain('settleIgnivarRaidStandIns(');
    expect(authoredRaidArm).not.toContain('collidableDecorStandInPlacements');
    expect(authoredRaidArm).not.toMatch(/p\.add\(\s*'pillar'/);
    expect(authoredRaidArm).toMatch(
      /isInfernalDecorModelAvailable\(entry\.key\)\s*\|\|\s*isIgnivarRaidPropAvailable\(entry\.key, this\.lowGfx\)/,
    );
    expect(authoredRaidArm).toContain('placeAuthoredWalls(p, layout, variant, {');
    expect(authoredRaidArm).toContain('wallTint: IGNIVAR_RAID_WALL_TINT');
    expect(authoredRaidArm).toContain('floor: opts?.style?.floorTint ?? IGNIVAR_RAID_FLOOR_TINT');
    expect(authoredRaidArm).toContain('buildIgnivarRaidWallFacade(seg, this.lowGfx)');
    expect(authoredRaidArm).toContain(
      'for (const forgeLight of ignivarRaidForgeLightPlacements(layout))',
    );
    expect(authoredRaidArm).toContain('this.addInfernalLight(decorGroup, x, z, color, y, scale)');
    expect(authoredRaidArm).toContain(
      'light(forgeLight.x, forgeLight.z, torch.light, forgeLight.y, forgeLight.scale)',
    );
    expect(authoredRaidArm).toMatch(
      /buildIgnivarRaidDressing\(\s*interior,\s*layout,\s*this\.lowGfx,?\s*\)/,
    );
    expect(authoredRaidArm).toContain('attachSceneGroupGated(group, decorGroup, this.compileGate)');
    expect(dungeonSource).toContain('facade: hideable.buildFacade?.(seg)');
    expect(dungeonSource).toContain(
      'for (const material of pending.facade.fadeMaterials) mats.push(occluderFadeMat(material))',
    );
  });

  it('anchors the grand forge at the rear wall and keeps side trenches outside the arena', () => {
    const fakeForgeBuilder = (x: number, z: number): THREE.Group => {
      const forge = new THREE.Group();
      forge.name = 'varkhulGrandForge';
      forge.position.set(x, 0, z);
      return forge;
    };
    const group = ignivarRaidDressingInternalsForTest.buildInnerCrucibleDressing(
      INNER_LAYOUT,
      false,
      fakeForgeBuilder,
    );
    const forge = group.getObjectByName('varkhulGrandForge') as THREE.Group;
    const trenches = group.getObjectByName('varkhulMoltenSideTrenches') as THREE.InstancedMesh;

    expect(group.name).toBe(VARKHUL_CRUCIBLE_DRESSING_NAME);
    expect(forge.position.x).toBe(VARKHUL_FORGE_LOCAL_POS.x);
    expect(forge.position.z).toBe(VARKHUL_FORGE_LOCAL_POS.z);
    expect(trenches.count).toBe(2);
    expect(group.userData.fightingFloorClearRadius).toBeGreaterThanOrEqual(30);
  });
});
