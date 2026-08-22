import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildVarkhulAssemblyPrewarmVisual,
  buildVarkhulRuneControlArrowGeometry,
  buildVarkhulRuneSymbol,
  VarkhulAssemblyVisuals,
} from '../src/render/varkhul_assembly_visual';
import type { ActiveVarkhulAssembly } from '../src/sim/varkhul_assembly';
import {
  VARKHUL_ASSEMBLY_RUNE_GLYPH_ORBIT,
  VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS,
  VARKHUL_ASSEMBLY_RUNE_TARGET_ORBIT,
} from '../src/sim/varkhul_assembly';

const RUNES = Array.from({ length: 10 }, (_, symbol) => ({
  symbol,
  x: Math.sin(Math.PI / 10 + (symbol * Math.PI) / 5) * 30,
  z: Math.cos(Math.PI / 10 + (symbol * Math.PI) / 5) * 30,
  radius: 3.3,
  assignedPlayerId: symbol + 100,
  locked: symbol === 1,
  targetAngle: 0.4 + symbol * 0.1,
  glyphAngle: 0.7 + symbol * 0.1,
  control: symbol === 0 ? ('counterclockwise' as const) : ('off' as const),
  aligned: false,
}));

const ASSEMBLY: ActiveVarkhulAssembly = {
  bossId: 42,
  phase: 'links',
  forgeX: 0,
  forgeZ: 22,
  forgeHp: 60,
  forgeMaxHp: 100,
  cores: [{ id: 'core', x: 1, z: 2, carrierId: null, delivered: false }],
  deliveryWindowRemaining: 0,
  assignments: RUNES.map((rune) => ({
    playerId: rune.assignedPlayerId ?? 0,
    symbol: rune.symbol,
    locked: rune.locked,
  })),
  runes: RUNES,
  round: 0,
  rounds: 1,
  remaining: 18,
};

describe('Varkhul Assembly rune rendering', () => {
  it('authors ten geometry-distinct symbols instead of relying on color', () => {
    const signatures = Array.from({ length: 10 }, (_, symbol) => {
      const mesh = buildVarkhulRuneSymbol(symbol);
      const positions = mesh.geometry.getAttribute('position');
      const signature = Array.from({ length: positions.count }, (_, index) =>
        Math.hypot(positions.getX(index), positions.getY(index)).toFixed(3),
      )
        .sort()
        .join('|');
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      return signature;
    });
    expect(new Set(signatures).size).toBe(10);
  });

  it('draws opposite arrows in physically separate inner and outer control zones', () => {
    const inner = buildVarkhulRuneControlArrowGeometry('counterclockwise');
    const outer = buildVarkhulRuneControlArrowGeometry('clockwise');
    inner.computeBoundingBox();
    outer.computeBoundingBox();
    const innerBounds = inner.boundingBox;
    const outerBounds = outer.boundingBox;
    if (!innerBounds || !outerBounds) throw new Error('Rune arrow geometry has no bounds');
    expect(Math.abs(innerBounds.min.x)).toBeGreaterThan(innerBounds.max.x);
    expect(outerBounds.max.x).toBeGreaterThan(Math.abs(outerBounds.min.x));
    expect((innerBounds.min.z + innerBounds.max.z) / 2).toBeCloseTo(0, 5);
    expect((outerBounds.min.z + outerBounds.max.z) / 2).toBeCloseTo(
      (VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS +
        VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS) /
        2,
      5,
    );
    inner.dispose();
    outer.dispose();
  });

  it('builds ten room stations with exact radial controls and powerful lock VFX', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulAssemblyVisuals(scene, () => 0);
    visuals.sync([ASSEMBLY]);
    const root = scene.getObjectByName('varkhul-assembly-42') as THREE.Group;
    expect(root).toBeDefined();
    expect(root.children.filter((child) => child.name.startsWith('varkhul-rune-'))).toHaveLength(
      10,
    );
    for (let symbol = 0; symbol < 10; symbol++) {
      const rune = root.getObjectByName(`varkhul-rune-${symbol}`) as THREE.Group;
      expect(rune.position.x).toBeCloseTo(RUNES[symbol].x, 5);
      expect(rune.position.z).toBeCloseTo(RUNES[symbol].z, 5);
      expect(rune.userData.innerControlRadius).toBe(VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS);
      expect(rune.userData.outerControlInnerRadius).toBe(
        VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS,
      );
      expect(rune.userData.outerControlOuterRadius).toBe(
        VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS,
      );
      expect(rune.getObjectByName('varkhul-rune-control-counterclockwise')).toBeDefined();
      expect(rune.getObjectByName('varkhul-rune-control-clockwise')).toBeDefined();
      expect(rune.getObjectByName('varkhul-rune-target-socket')).toBeDefined();
      expect(rune.getObjectByName('varkhul-rune-moving-glyph')).toBeDefined();
      expect(rune.getObjectByName('varkhul-rune-embers')).toBeDefined();
      expect(rune.getObjectByName('varkhul-rune-lock-burst')).toBeDefined();
      const inner = rune.getObjectByName('varkhul-rune-control-counterclockwise') as THREE.Mesh;
      const outer = rune.getObjectByName('varkhul-rune-control-clockwise') as THREE.Mesh;
      const radialExtents = (mesh: THREE.Mesh) => {
        const positions = mesh.geometry.getAttribute('position');
        const radii = Array.from({ length: positions.count }, (_, index) =>
          Math.hypot(positions.getX(index), positions.getZ(index)),
        );
        return { min: Math.min(...radii), max: Math.max(...radii) };
      };
      expect(radialExtents(inner).max).toBeCloseTo(VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS, 4);
      expect(radialExtents(outer).min).toBeCloseTo(
        VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS,
        4,
      );
      expect(radialExtents(outer).max).toBeCloseTo(
        VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS,
        4,
      );
    }
    expect(root.getObjectByName('varkhul-rune-lock-burst')?.visible).toBe(false);
    expect(
      root.getObjectByName('varkhul-rune-1')?.getObjectByName('varkhul-rune-lock-burst')?.visible,
    ).toBe(true);
    const lockEffect = root
      .getObjectByName('varkhul-rune-1')
      ?.getObjectByName('varkhul-rune-lock-effect') as THREE.Mesh;
    lockEffect.geometry.computeBoundingBox();
    expect(lockEffect.geometry.getAttribute('position').count).toBeGreaterThan(500);
    expect(
      (lockEffect.geometry.boundingBox?.max.y ?? 0) - (lockEffect.geometry.boundingBox?.min.y ?? 0),
    ).toBeGreaterThan(3.5);
    let visibleDraws = 0;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      let current: THREE.Object3D | null = object;
      while (current) {
        if (!current.visible) return;
        current = current.parent;
      }
      visibleDraws++;
    });
    expect(visibleDraws).toBeLessThanOrEqual(95);
    visuals.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('places the socket and moving glyph at their authoritative angles and lights the occupied zone', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulAssemblyVisuals(scene, () => 0);
    visuals.sync([ASSEMBLY]);
    const rune = scene.getObjectByName('varkhul-rune-0') as THREE.Group;
    const target = rune.getObjectByName('varkhul-rune-target') as THREE.Group;
    const rotor = rune.getObjectByName('varkhul-rune-rotor') as THREE.Group;
    expect(Math.hypot(target.position.x, target.position.z)).toBeCloseTo(
      VARKHUL_ASSEMBLY_RUNE_TARGET_ORBIT,
      5,
    );
    expect(Math.atan2(target.position.x, target.position.z)).toBeCloseTo(RUNES[0].targetAngle, 5);
    expect(Math.hypot(rotor.position.x, rotor.position.z)).toBeCloseTo(
      VARKHUL_ASSEMBLY_RUNE_GLYPH_ORBIT,
      5,
    );
    expect(Math.atan2(rotor.position.x, rotor.position.z)).toBeCloseTo(RUNES[0].glyphAngle, 5);
    expect(VARKHUL_ASSEMBLY_RUNE_TARGET_ORBIT).toBeGreaterThan(VARKHUL_ASSEMBLY_RUNE_GLYPH_ORBIT);
    const inner = rune.getObjectByName('varkhul-rune-control-counterclockwise') as THREE.Mesh;
    const outer = rune.getObjectByName('varkhul-rune-control-clockwise') as THREE.Mesh;
    expect((inner.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0xffffff);
    expect((outer.material as THREE.MeshBasicMaterial).color.getHex()).not.toBe(0xffffff);

    visuals.update(0.1, false);
    expect((rune.getObjectByName('varkhul-rune-embers') as THREE.Object3D).rotation.y).not.toBe(0);
    const targetScaleBeforeReduction = target.scale.x;
    expect(targetScaleBeforeReduction).not.toBe(1);
    visuals.update(0.1, true);
    expect(target.scale.x).toBe(1);
  });

  it('prewarms all ten symbols, both controls, embers, and lock effects', () => {
    const root = buildVarkhulAssemblyPrewarmVisual();
    expect(root.children.filter((child) => child.name.startsWith('varkhul-rune-'))).toHaveLength(
      10,
    );
    for (let symbol = 0; symbol < 10; symbol++) {
      const rune = root.getObjectByName(`varkhul-rune-${symbol}`);
      expect(rune?.getObjectByName('varkhul-rune-control-counterclockwise')).toBeDefined();
      expect(rune?.getObjectByName('varkhul-rune-control-clockwise')).toBeDefined();
      expect(rune?.getObjectByName('varkhul-rune-embers')).toBeDefined();
      expect(rune?.getObjectByName('varkhul-rune-lock-burst')?.visible).toBe(true);
    }
  });

  it('hides the rune interface outside links without hiding core transport', () => {
    const scene = new THREE.Scene();
    const visuals = new VarkhulAssemblyVisuals(scene, () => 0);
    visuals.sync([{ ...ASSEMBLY, phase: 'cores' }]);
    const root = scene.getObjectByName('varkhul-assembly-42') as THREE.Group;
    expect(root.getObjectByName('varkhul-rune-0')?.visible).toBe(false);
    expect(root.getObjectByName('varkhul-molten-core')).toBeDefined();
  });
});
