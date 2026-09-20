import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HoardBossFx } from '../src/render/hoard_boss_fx';
import { hoardCueAppearance, hoardSweepMeteorWarnings } from '../src/render/hoard_boss_fx_core';
import {
  IGNIVAR_FRONTAL_FILL_NAME,
  IGNIVAR_FRONTAL_FLAME_CURTAINS_NAME,
  IGNIVAR_FRONTAL_HEAT_BANDS_NAME,
} from '../src/render/ignivar_frontal_telegraph';
import { HOARD_SWEEP_HALF_ANGLE } from '../src/sim/rift/hoard_boss';
import type { HoardBossCueView } from '../src/world_api/dungeons';

function cue(overrides: Partial<HoardBossCueView> = {}): HoardBossCueView {
  return {
    instanceId: 4,
    cueId: 1,
    kind: 'mark',
    phase: 'warning',
    x: 12,
    z: 34,
    radius: 3,
    remaining: 2,
    total: 2,
    ...overrides,
  };
}

function object(root: THREE.Object3D, name: string): THREE.Object3D {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

function verticalRange(target: THREE.Object3D): number {
  const mesh = target.children[0] as THREE.Mesh<THREE.BufferGeometry>;
  const position = mesh.geometry.getAttribute('position');
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < position.count; index++) {
    min = Math.min(min, position.getY(index));
    max = Math.max(max, position.getY(index));
  }
  return max - min;
}

describe('Buried Hoard boss actionable cues', () => {
  it('rebuilds the same three Ignivar meteor warnings from a resumed sweep', () => {
    const warnings = hoardSweepMeteorWarnings([
      cue({
        instanceId: 9,
        cueId: 12,
        kind: 'sweep',
        radius: 13,
        facing: 0.8,
        halfAngle: HOARD_SWEEP_HALF_ANGLE,
        remaining: 1.1,
        total: 2.2,
      }),
    ]);
    expect(warnings).toHaveLength(3);
    expect(warnings.map((warning) => warning.id)).toEqual([
      'hoard-sweep:9:12:0',
      'hoard-sweep:9:12:1',
      'hoard-sweep:9:12:2',
    ]);
    expect(warnings.every((warning) => warning.remaining === 1.1)).toBe(true);
    expect(hoardSweepMeteorWarnings([cue()])).toEqual([]);
  });

  it('pools a terrain-draped X and turns it into its lingering hazard', async () => {
    const scene = new THREE.Scene();
    const visuals = new HoardBossFx(scene, (x) => 7 + x * 0.2);
    await visuals.readyForEntry;
    visuals.sync([cue()]);
    const root = object(scene, 'hoard-boss-actionable-cues');
    const warning = object(root, 'hoard-boss-mark-warning');
    expect(warning.visible).toBe(true);
    expect(warning.parent?.position).toMatchObject({ x: 12, y: 9.4, z: 34 });
    expect(verticalRange(warning)).toBeGreaterThan(0.5);
    visuals.update(1);
    expect(warning.scale.x).toBeGreaterThan(0.95);

    visuals.sync([cue({ phase: 'hazard', remaining: 1.8 })]);
    expect(warning.visible).toBe(false);
    expect(object(root, 'hoard-boss-mark-hazard').visible).toBe(true);
    visuals.sync([]);
    expect(root.children.every((slot) => !slot.visible)).toBe(true);
    visuals.dispose();
    expect(scene.getObjectByName('hoard-boss-actionable-cues')).toBeUndefined();
  });

  it('drapes the authoritative sweep radius, facing, and half angle over terrain', async () => {
    const scene = new THREE.Scene();
    const visuals = new HoardBossFx(scene, (x, z) => x * 0.16 + z * 0.08);
    await visuals.readyForEntry;
    visuals.sync([
      cue({
        kind: 'sweep',
        radius: 13,
        facing: 1.2,
        halfAngle: HOARD_SWEEP_HALF_ANGLE,
        remaining: 1.45,
        total: 1.45,
      }),
    ]);
    const sweep = object(scene, 'hoard-boss-sweep');
    expect(sweep.visible).toBe(true);
    expect(object(sweep, IGNIVAR_FRONTAL_FILL_NAME)).toBeInstanceOf(THREE.Mesh);
    expect(object(sweep, IGNIVAR_FRONTAL_HEAT_BANDS_NAME)).toBeInstanceOf(THREE.Mesh);
    expect(object(sweep, IGNIVAR_FRONTAL_FLAME_CURTAINS_NAME)).toBeInstanceOf(THREE.Mesh);
    expect(sweep.userData.halfAngle).toBeCloseTo(HOARD_SWEEP_HALF_ANGLE);
    expect(sweep.userData.range).toBe(13);
    expect(sweep.rotation.y).toBeCloseTo(1.2);
    visuals.update(0.3);
    expect(sweep.scale.x).toBeGreaterThan(0.95);
    visuals.dispose();
  });

  it('uses shaped elemental warnings instead of Ignivar fire for non-fire bosses', async () => {
    const scene = new THREE.Scene();
    const visuals = new HoardBossFx(scene, () => 0);
    await visuals.readyForEntry;
    visuals.sync([
      cue({
        kind: 'sweep',
        variant: 'frost-gust',
        radius: 20,
        facing: 0.4,
        halfAngle: Math.PI * 0.3,
      }),
    ]);
    const root = object(scene, 'hoard-boss-actionable-cues');
    expect(object(root, 'hoard-boss-sweep').visible).toBe(false);
    const shaped = object(root, 'hoard-boss-shaped-sweep');
    expect(shaped.visible).toBe(true);
    expect(shaped.rotation.y).toBeCloseTo(0.4);

    visuals.sync([
      cue({
        variant: 'arcane-ring',
        radius: 8.5,
        innerRadius: 4.5,
      }),
    ]);
    const warning = object(root, 'hoard-boss-mark-warning');
    expect(warning.visible).toBe(true);
    expect(warning.children[0].visible).toBe(false);
    expect(warning.children[1].visible).toBe(true);
    expect((warning.children[1] as THREE.Mesh).geometry).toBe(
      (warning.children[2] as THREE.Mesh).geometry,
    );
    expect(warning.children[2].visible).toBe(true);
    visuals.dispose();
  });

  it('plans every bespoke shape and keeps elemental riders reconnectable', () => {
    expect(hoardCueAppearance(cue({ kind: 'sweep', variant: 'ember-frontal' }))).toMatchObject({
      shape: 'ignivar',
      palette: 'fire',
    });
    expect(hoardCueAppearance(cue({ kind: 'sweep', variant: 'brute-long' }))).toMatchObject({
      shape: 'sector',
      palette: 'physical',
    });
    expect(hoardCueAppearance(cue({ kind: 'sweep', variant: 'tide-wave' }))).toMatchObject({
      shape: 'wave',
      palette: 'tide',
      elementalRider: true,
    });
    expect(hoardCueAppearance(cue({ kind: 'sweep', variant: 'tide-tether' }))).toMatchObject({
      shape: 'tether',
      palette: 'tide',
    });
    expect(hoardCueAppearance(cue({ variant: 'arcane-ring' }))).toMatchObject({
      shape: 'annulus',
      countdown: 'annulus',
    });
    for (const variant of [
      'frost-ice',
      'arcane-blizzard',
      'storm-charge',
      'storm-field',
      'ember-fire',
    ] as const) {
      expect(hoardCueAppearance(cue({ variant })).elementalRider).toBe(true);
    }
  });

  it('renders a traveling wave and a persistent Healing Tide link', async () => {
    const scene = new THREE.Scene();
    const visuals = new HoardBossFx(scene, () => 0);
    await visuals.readyForEntry;
    visuals.sync([
      cue({
        kind: 'sweep',
        variant: 'tide-wave',
        radius: 28,
        facing: 0,
        remaining: 2,
        total: 4.2,
      }),
    ]);
    const root = object(scene, 'hoard-boss-actionable-cues');
    const wave = object(root, 'hoard-boss-traveling-tide');
    visuals.update(0.1);
    expect(wave.visible).toBe(true);
    expect(wave.children[0].position.z).not.toBe(0);

    visuals.sync([
      cue({
        kind: 'sweep',
        variant: 'tide-tether',
        radius: 6,
        facing: 1,
        remaining: 1.5,
        total: 2.1,
      }),
    ]);
    const tether = object(root, 'hoard-healing-tide-link');
    expect(tether.visible).toBe(true);
    expect((tether.children[0] as THREE.Mesh).scale.z).toBe(6);
    visuals.dispose();
  });
});
