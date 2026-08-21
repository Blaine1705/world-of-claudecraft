import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildVarkhulAssemblyPrewarmVisual,
  VarkhulAssemblyVisuals,
} from '../src/render/varkhul_assembly_visual';
import type { ActiveVarkhulAssembly } from '../src/sim/varkhul_assembly';
import {
  VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT,
  VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS,
  VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT,
  VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS,
} from '../src/sim/varkhul_assembly';

const ASSEMBLY: ActiveVarkhulAssembly = {
  bossId: 42,
  phase: 'links',
  forgeX: 10,
  forgeZ: 20,
  forgeHp: 40,
  forgeMaxHp: 100,
  cores: [{ id: 'core:1', x: 4, z: 5, carrierId: 1, delivered: false }],
  deliveryWindowRemaining: 3,
  assignments: [
    { playerId: 1, symbol: 0, role: 'anvil', locked: false },
    { playerId: 2, symbol: 0, role: 'hammer', locked: false },
  ],
  pads: Array.from({ length: 5 }, (_, symbol) => ({
    symbol,
    x: 10 + symbol * 4,
    z: 34,
    radius: 3,
    progress: symbol === 0 ? 0.5 : 0,
    locked: false,
    anvilReady: symbol === 0,
    hammerReady: false,
    targetAngle: symbol === 0 ? 0.4 : symbol,
    armAngle: symbol === 0 ? 0.7 : symbol + 0.5,
    control: symbol === 0 ? ('counterclockwise' as const) : ('off' as const),
    aligned: false,
  })),
  round: 1,
  rounds: 1,
  remaining: 20,
};

describe("Varkhul Master's Assembly rendering", () => {
  it('shows five self-explanatory receptor and three-control stations without guidance threads', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulAssemblyVisuals(scene, () => 2);
    visuals.sync([ASSEMBLY]);
    const root = scene.getObjectByName('varkhul-assembly-42') as THREE.Group;
    expect(root).toBeDefined();
    expect(root.getObjectByName('varkhul-molten-core')?.position.y).toBe(5);
    expect(root.getObjectByName('varkhul-link-partner-0')).toBeUndefined();
    expect(root.getObjectByProperty('type', 'Line')).toBeUndefined();
    for (let symbol = 0; symbol < 5; symbol++) {
      const pad = root.getObjectByName(`varkhul-link-pad-${symbol}`) as THREE.Group;
      expect(pad.visible).toBe(true);
      expect(pad.userData).toMatchObject({ actionable: true, symbol });
      expect(pad.userData).toMatchObject({
        anvilTargetOrbit: VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT,
        anvilTargetRadius: VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS,
        hammerControlOrbit: VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT,
        hammerControlRadius: VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS,
      });
      expect(
        (pad.getObjectByName('varkhul-link-anvil-target-rim') as THREE.Mesh).userData,
      ).toMatchObject({ role: 'anvil', hollow: true });
      for (const control of ['counterclockwise', 'brake', 'clockwise']) {
        const plate = pad.getObjectByName(`varkhul-link-control-${control}`) as THREE.Group;
        expect(plate).toBeDefined();
        expect(Math.hypot(plate.position.x, plate.position.z)).toBeCloseTo(
          VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT,
          5,
        );
        expect(plate.userData).toMatchObject({
          control,
          radius: VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS,
        });
      }
      const left = pad.getObjectByName('varkhul-link-control-counterclockwise') as THREE.Group;
      const brake = pad.getObjectByName('varkhul-link-control-brake') as THREE.Group;
      const right = pad.getObjectByName('varkhul-link-control-clockwise') as THREE.Group;
      expect(left.position.x).toBeLessThan(0);
      expect(brake.position.x).toBeCloseTo(0, 5);
      expect(right.position.x).toBeGreaterThan(0);
      const interiorXs = (control: THREE.Group): number[] => {
        const surface = control.getObjectByName('varkhul-link-control-surface') as THREE.Mesh;
        const positions = surface.geometry.getAttribute('position') as THREE.BufferAttribute;
        const xs: number[] = [];
        for (let index = 0; index < positions.count; index++) {
          const x = positions.getX(index);
          const z = positions.getZ(index);
          if (Math.hypot(x, z) < 0.55) xs.push(x);
        }
        return xs;
      };
      const leftIconXs = interiorXs(left);
      const brakeIconXs = interiorXs(brake);
      const rightIconXs = interiorXs(right);
      expect(Math.min(...leftIconXs)).toBeLessThan(-0.45);
      expect(Math.max(...leftIconXs)).toBeLessThanOrEqual(0.441);
      expect(brakeIconXs.length).toBeGreaterThan(0);
      expect(Math.max(...brakeIconXs.map(Math.abs))).toBeGreaterThanOrEqual(0.3);
      expect(Math.max(...brakeIconXs.map(Math.abs))).toBeLessThanOrEqual(0.311);
      expect(Math.max(...rightIconXs)).toBeGreaterThan(0.45);
      expect(Math.min(...rightIconXs)).toBeGreaterThanOrEqual(-0.441);
      expect(pad.getObjectByName('varkhul-link-fire-arm')).toBeDefined();
      expect(pad.getObjectByName('varkhul-link-pad-entry-window')).toBeUndefined();
      const visibleDraws: THREE.Object3D[] = [];
      pad.traverse((child) => {
        if (child.visible && child instanceof THREE.Mesh) visibleDraws.push(child);
      });
      expect(visibleDraws.length).toBeLessThanOrEqual(8);
    }
    expect(
      root.children.filter((child) => child.name.startsWith('varkhul-assembly-forge-health')),
    ).toHaveLength(0);
    const forge = root.getObjectByName('varkhul-assembly-forge') as THREE.Group;
    expect(
      forge.children.filter(
        (child) => child.name.startsWith('varkhul-assembly-forge-health-') && child.visible,
      ),
    ).toHaveLength(8);
    visuals.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('prewarms every actionable control, receptor, and fire-arm material without a thread', () => {
    const root = buildVarkhulAssemblyPrewarmVisual();
    expect(root.getObjectByProperty('type', 'Line')).toBeUndefined();
    expect(root.getObjectByName('varkhul-link-control-counterclockwise')).toBeDefined();
    expect(root.getObjectByName('varkhul-link-control-brake')).toBeDefined();
    expect(root.getObjectByName('varkhul-link-control-clockwise')).toBeDefined();
    expect(root.getObjectByName('varkhul-link-anvil-target')).toBeDefined();
    expect(root.getObjectByName('varkhul-link-fire-arm')).toBeDefined();
    const progress = root.getObjectByName('varkhul-link-progress') as THREE.InstancedMesh;
    expect(progress.visible).toBe(true);
    expect(progress.count).toBe(8);
    expect(root.getObjectByName('varkhul-link-lock-burst')?.visible).toBe(true);
  });

  it('places the receptor exactly, rotates the arm, and lights the occupied control', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulAssemblyVisuals(scene, () => 0);
    visuals.sync([ASSEMBLY]);
    const pad = scene.getObjectByName('varkhul-link-pad-0') as THREE.Group;
    const target = pad.getObjectByName('varkhul-link-anvil-target') as THREE.Group;
    const targetRim = target.getObjectByName('varkhul-link-anvil-target-rim') as THREE.Mesh;
    const arm = pad.getObjectByName('varkhul-link-fire-arm') as THREE.Group;
    const counterclockwise = pad.getObjectByName(
      'varkhul-link-control-counterclockwise',
    ) as THREE.Group;
    const counterclockwiseRim = counterclockwise.getObjectByName(
      'varkhul-link-control-surface',
    ) as THREE.Mesh;
    const brakeRim = pad
      .getObjectByName('varkhul-link-control-brake')
      ?.getObjectByName('varkhul-link-control-surface') as THREE.Mesh;
    expect(Math.hypot(target.position.x, target.position.z)).toBeCloseTo(
      VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT,
      5,
    );
    expect(Math.atan2(target.position.x, target.position.z)).toBeCloseTo(0.4, 5);
    expect(arm.rotation.y).toBeCloseTo(0.7, 5);
    expect((targetRim.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xffffff);
    expect((counterclockwiseRim.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xffffff);
    expect((brakeRim.material as THREE.MeshBasicMaterial).color.getHex()).not.toBe(0xffffff);
    visuals.sync([
      {
        ...ASSEMBLY,
        pads: ASSEMBLY.pads.map((state) =>
          state.symbol === 0
            ? {
                ...state,
                anvilReady: false,
                hammerReady: true,
                armAngle: state.targetAngle,
                control: 'brake' as const,
                aligned: true,
                progress: 0.75,
              }
            : state,
        ),
      },
    ]);
    expect((targetRim.material as THREE.MeshBasicMaterial).color.getHex()).not.toBe(0xffffff);
    expect((brakeRim.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xffffff);
    expect(arm.rotation.y).toBeCloseTo(0.4, 5);
    const progress = target.getObjectByName('varkhul-link-progress') as THREE.InstancedMesh;
    expect(progress.visible).toBe(true);
    expect(progress.count).toBe(6);
    expect(progress.boundingSphere?.radius).toBeGreaterThan(0.84);

    visuals.sync([
      {
        ...ASSEMBLY,
        pads: ASSEMBLY.pads.map((state) =>
          state.symbol === 0 ? { ...state, locked: true, progress: 1 } : state,
        ),
      },
    ]);
    expect(progress.visible).toBe(false);
    expect(target.getObjectByName('varkhul-link-lock-burst')?.visible).toBe(true);
    const lockedDraws: THREE.Object3D[] = [];
    pad.traverse((child) => {
      if (child.visible && child instanceof THREE.Mesh) lockedDraws.push(child);
    });
    expect(lockedDraws.length).toBeLessThanOrEqual(8);
  });

  it('hides the rune interface outside the links phase without hiding core transport', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulAssemblyVisuals(scene, () => 0);
    visuals.sync([{ ...ASSEMBLY, phase: 'cores' }]);
    const root = scene.getObjectByName('varkhul-assembly-42') as THREE.Group;
    expect(root.getObjectByName('varkhul-link-pad-0')?.visible).toBe(false);
    expect(root.getObjectByName('varkhul-molten-core')).toBeDefined();
  });
});
