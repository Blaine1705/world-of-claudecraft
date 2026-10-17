// The seasonal city dressing's view (src/render/seasonal_decor.ts): the compile gate
// owns the root's visibility and the event toggle never reveals an unlinked kit; the
// renderer's teardown frees what the view built, once.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/render/seasonal_decor_assets', () => {
  const part = () => ({
    geometry: new THREE.BoxGeometry(0.5, 0.5, 0.5),
    material: new THREE.MeshLambertMaterial(),
  });
  const decor = {
    pumpkin_lit: [part()],
    pumpkin_small: [part()],
    gourd: [part()],
    lantern: [part()],
    garland_pole: [part()],
    garland_leaf: [part()],
    garland_bead: [part()],
  };
  return { gourdlightAssets: () => ({ decor, head: [] }) };
});

import { SeasonalDecor } from '../src/render/seasonal_decor';
import { GOURDLIGHT_EVE_ID } from '../src/sim/content/gourdlight_eve';
import { WORLD_SEED } from '../src/sim/world_seed';

describe('SeasonalDecor', () => {
  it('stays hidden until its programs link, however the event toggles meanwhile', async () => {
    const scene = new THREE.Scene();
    let release: () => void = () => {};
    const gate = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    let active: string | null = GOURDLIGHT_EVE_ID;
    const view = new SeasonalDecor(scene, WORLD_SEED, () => active, gate);
    view.update(1, 0, -14, -100);
    expect(view.root.parent).toBe(scene);
    expect(gate).toHaveBeenCalledTimes(1);
    // built and toggled on, but the gate has not settled: nothing draws
    view.update(1, 0.05, -14, -100);
    expect(view.root.visible).toBe(false);
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(view.root.visible).toBe(true);
    // the event closing hides the dressing without touching the gate's root
    active = null;
    view.update(1, 0.1, -14, -100);
    expect(view.root.visible).toBe(true);
    const content = view.root.getObjectByName('seasonal-decor-content');
    expect(content?.visible).toBe(false);
  });

  it('dispose detaches the view and frees its instance buffers once', () => {
    const scene = new THREE.Scene();
    const view = new SeasonalDecor(scene, WORLD_SEED, () => GOURDLIGHT_EVE_ID);
    view.update(0, 0, -14, -100);
    const meshes: THREE.InstancedMesh[] = [];
    view.root.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) meshes.push(o);
    });
    expect(meshes.length).toBeGreaterThan(0);
    const spies = meshes.map((m) => vi.spyOn(m, 'dispose'));
    view.dispose();
    view.dispose();
    expect(view.root.parent).toBeNull();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    // a disposed view never rebuilds or re-attaches
    view.update(0, 0, -14, -100);
    expect(view.root.parent).toBeNull();
  });
});
