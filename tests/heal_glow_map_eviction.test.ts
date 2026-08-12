import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Renderer } from '../src/render/renderer';

interface LifecycleView {
  group: THREE.Group;
  viewLights: THREE.Light[];
  clickTarget: THREE.Object3D;
  visual: null;
  objectPoolKey: null;
  objectMesh: null;
  portal: null;
  iceBlockVisual: null;
  temporalHourglassVisual: null;
  frostNovaRootVisual: null;
  mageBarrierVisual: null;
  paladinAscensionVisual: null;
  paladinAvengingWrathVisual: null;
  paladinOathChainVisual: null;
  paladinAegisVisual: null;
  paladinSunVerdictVisual: null;
}

interface LifecycleHarness {
  views: Map<number, LifecycleView>;
  healGlowAt: Map<number, number>;
  scene: { remove(object: THREE.Object3D): void };
  lightOwnerGroups: Set<THREE.Group>;
  viewLights: THREE.Light[];
  clickTargets: THREE.Object3D[];
  lightRankDirty: boolean;
  weaponSkinApplies: { cancel(id: number): void };
  nameplatePainter: { remove(id: number): void };
  removeView(id: number, terminal?: boolean): void;
}

function objectView(clickTarget: THREE.Object3D): LifecycleView {
  return {
    group: new THREE.Group(),
    viewLights: [],
    clickTarget,
    visual: null,
    objectPoolKey: null,
    objectMesh: null,
    portal: null,
    iceBlockVisual: null,
    temporalHourglassVisual: null,
    frostNovaRootVisual: null,
    mageBarrierVisual: null,
    paladinAscensionVisual: null,
    paladinAvengingWrathVisual: null,
    paladinOathChainVisual: null,
    paladinAegisVisual: null,
    paladinSunVerdictVisual: null,
  };
}

function harness(views: Map<number, LifecycleView>, healGlowAt: Map<number, number>) {
  const renderer = Object.create(Renderer.prototype) as unknown as LifecycleHarness;
  renderer.views = views;
  renderer.healGlowAt = healGlowAt;
  renderer.scene = { remove: vi.fn() };
  renderer.lightOwnerGroups = new Set(Array.from(views.values(), (v) => v.group));
  renderer.viewLights = [];
  renderer.clickTargets = Array.from(views.values(), (v) => v.clickTarget);
  renderer.lightRankDirty = false;
  renderer.weaponSkinApplies = { cancel: vi.fn() };
  renderer.nameplatePainter = { remove: vi.fn() };
  return renderer;
}

describe('healGlowAt eviction', () => {
  it('drops the throttle entry when the healed entity loses its view', () => {
    const views = new Map([
      [7, objectView(new THREE.Object3D())],
      [9, objectView(new THREE.Object3D())],
    ]);
    const healGlowAt = new Map([
      [7, 12345],
      [9, 67890],
    ]);
    const renderer = harness(views, healGlowAt);

    renderer.removeView(7);

    expect(healGlowAt.has(7)).toBe(false);
    expect(healGlowAt.has(9)).toBe(true);
  });

  it('is a no-op when the entity never bloomed a heal glow', () => {
    const views = new Map([[7, objectView(new THREE.Object3D())]]);
    const healGlowAt = new Map<number, number>();
    const renderer = harness(views, healGlowAt);

    expect(() => renderer.removeView(7)).not.toThrow();
    expect(healGlowAt.size).toBe(0);
  });

  it('evicts on a terminal despawn too, not only interest-range churn', () => {
    const views = new Map([[7, objectView(new THREE.Object3D())]]);
    const healGlowAt = new Map([[7, 12345]]);
    const renderer = harness(views, healGlowAt);

    renderer.removeView(7, true);

    expect(healGlowAt.has(7)).toBe(false);
  });
});
