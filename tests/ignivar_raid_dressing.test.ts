import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { IgnivarPropPlacement } from '../src/render/ignivar_dressing_plan_core';
import type { appendIgnivarEnvProps } from '../src/render/ignivar_env_props';
import {
  IGNIVAR_APPROACH_CLEAR_HALF_WIDTH,
  IGNIVAR_APPROACH_DRESSING_NAME,
  IGNIVAR_ARENA_DRESSING_NAME,
  ignivarRaidDressingInternalsForTest,
  VARKHUL_CRUCIBLE_DRESSING_NAME,
} from '../src/render/ignivar_raid_dressing';
import type { DungeonLayout } from '../src/sim/dungeon_layout';
import { VARKHUL_FORGE_LOCAL_POS } from '../src/sim/encounters/varkhul';

function capturingAppender(captured: IgnivarPropPlacement[]): typeof appendIgnivarEnvProps {
  return (_group, placements) => {
    captured.push(...placements);
    return placements.length;
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
  it("keeps the approach's central combat route free at both graphics tiers", () => {
    for (const lowGfx of [true, false]) {
      const group = ignivarRaidDressingInternalsForTest.buildForgeApproachDressing(
        APPROACH_LAYOUT,
        lowGfx,
      );
      expect(group.name).toBe(IGNIVAR_APPROACH_DRESSING_NAME);
      expect(group.userData.clearHalfWidth).toBe(IGNIVAR_APPROACH_CLEAR_HALF_WIDTH);
      for (const name of ['ignivarApproachAssemblyRails', 'ignivarApproachTemperingStations']) {
        const mesh = group.getObjectByName(name) as THREE.InstancedMesh;
        expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        for (let index = 0; index < mesh.count; index++) {
          mesh.getMatrixAt(index, matrix);
          position.setFromMatrixPosition(matrix);
          expect(Math.abs(position.x)).toBeGreaterThan(IGNIVAR_APPROACH_CLEAR_HALF_WIDTH);
        }
      }
    }
  });

  it('keeps the crucible trenches and fighting floor under the baked hand-placed pass', () => {
    const captured: IgnivarPropPlacement[] = [];
    const group = ignivarRaidDressingInternalsForTest.buildInnerCrucibleDressing(
      INNER_LAYOUT,
      false,
      capturingAppender(captured),
    );
    const trenches = group.getObjectByName('varkhulMoltenSideTrenches') as THREE.InstancedMesh;

    expect(group.name).toBe(VARKHUL_CRUCIBLE_DRESSING_NAME);
    expect(captured.length).toBeGreaterThanOrEqual(40);
    // The baked pass hugs the walls: every floor placement stays outside
    // the fighting-floor clear radius the rig itself declares, except the
    // forge-anchor dressing (the anvil the boss works pre-pull).
    const clearRadius = group.userData.fightingFloorClearRadius as number;
    for (const placement of captured) {
      if (placement.y !== 0) continue;
      const forgeDistance = Math.hypot(
        placement.x - VARKHUL_FORGE_LOCAL_POS.x,
        placement.z - VARKHUL_FORGE_LOCAL_POS.z,
      );
      if (forgeDistance <= 10) continue;
      expect(
        Math.hypot(placement.x, placement.z),
        `${placement.key} at ${placement.x},${placement.z} enters the fighting floor`,
      ).toBeGreaterThan(clearRadius);
    }
    expect(trenches.count).toBe(2);
    expect(group.userData.fightingFloorClearRadius).toBeGreaterThanOrEqual(30);
  });

  it('dresses the arena with props that respect the fighting circle', () => {
    const captured: IgnivarPropPlacement[] = [];
    const group = ignivarRaidDressingInternalsForTest.buildCrucibleArenaDressing(
      { ...APPROACH_LAYOUT, zMin: -33, zMax: 33, wallX: 33, floorHalfX: 33 },
      false,
      capturingAppender(captured),
    );
    expect(group.name).toBe(IGNIVAR_ARENA_DRESSING_NAME);
    expect(captured.length).toBeGreaterThan(0);
    for (const placement of captured) {
      if (placement.y !== 0) continue;
      expect(Math.hypot(placement.x, placement.z)).toBeGreaterThan(18);
    }
  });
});
