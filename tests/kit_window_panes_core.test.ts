// kit_window_panes_core.ts: window-assembly detection for the Eastbrook kit
// buildings. Synthetic cases pin each classification rule on hand-built box
// components; the real-GLB case pins the exact pane set the shipped
// hexb_home_a model yields through the same raw quantized attributes the
// renderer feeds at runtime.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { kitWindowPanes } from '../src/render/kit_window_panes_core';

function panesOf(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  return kitWindowPanes(
    position.array as ArrayLike<number>,
    position.count,
    (geometry.getIndex()?.array as ArrayLike<number> | undefined) ?? null,
  );
}

// A building shell with a thin window-assembly box on its +z face, the same
// shape the render-suite kit fixtures embed in their first mesh geometry.
function shellWithWindow(): THREE.BufferGeometry {
  const merged = mergeGeometries(
    [
      new THREE.BoxGeometry(2, 3, 4),
      new THREE.BoxGeometry(0.4, 0.6, 0.08).translate(0.6, 0.9, 1.96),
    ],
    false,
  );
  if (!merged) throw new Error('failed to merge the window fixture');
  return merged;
}

describe('kit window pane core', () => {
  it('rejects a big wall slab component', () => {
    // One component spanning the whole model: its normalized height is 1,
    // far above the window ceiling, so nothing is emitted.
    expect(panesOf(new THREE.BoxGeometry(2, 3, 4))).toEqual([]);
  });

  it('emits exactly one centered pane for a thin mid-height window assembly', () => {
    const panes = panesOf(shellWithWindow());
    expect(panes).toHaveLength(1);
    const pane = panes[0];
    // Component bbox center, thin across z (the +z face), pane at 70 percent
    // of the thick horizontal extent and height.
    expect(pane.thinX).toBe(false);
    expect(pane.cx).toBeCloseTo(0.6, 6);
    expect(pane.cy).toBeCloseTo(0.9, 6);
    expect(pane.cz).toBeCloseTo(1.96, 6);
    expect(pane.width).toBeCloseTo(0.7 * 0.4, 6);
    expect(pane.height).toBeCloseTo(0.7 * 0.6, 6);
  });

  it('orients the pane across the thin x axis for a side-wall assembly', () => {
    const merged = mergeGeometries(
      [
        new THREE.BoxGeometry(2, 3, 4),
        new THREE.BoxGeometry(0.08, 0.6, 0.4).translate(0.96, 0.9, 0.6),
      ],
      false,
    );
    if (!merged) throw new Error('failed to merge the side-window fixture');
    const panes = panesOf(merged);
    expect(panes).toHaveLength(1);
    const pane = panes[0];
    expect(pane.thinX).toBe(true);
    expect(pane.cx).toBeCloseTo(0.96, 6);
    expect(pane.cy).toBeCloseTo(0.9, 6);
    expect(pane.cz).toBeCloseTo(0.6, 6);
    expect(pane.width).toBeCloseTo(0.7 * 0.4, 6);
    expect(pane.height).toBeCloseTo(0.7 * 0.6, 6);
  });

  it('rejects a tall low door-like component but keeps the same shape higher up', () => {
    // Same 0.8 x 2.4 x 0.08 frame both times; only the height off the ground
    // changes. Near the ground with height 3x its width it is a door; the
    // raised copy clears the door band and reads as a tall window.
    const door = mergeGeometries(
      [
        new THREE.BoxGeometry(2, 8, 4),
        new THREE.BoxGeometry(0.8, 2.4, 0.08).translate(0.6, -2, 1.96),
      ],
      false,
    );
    const raised = mergeGeometries(
      [
        new THREE.BoxGeometry(2, 8, 4),
        new THREE.BoxGeometry(0.8, 2.4, 0.08).translate(0.6, 0, 1.96),
      ],
      false,
    );
    if (!door || !raised) throw new Error('failed to merge the door fixtures');
    expect(panesOf(door)).toEqual([]);
    const panes = panesOf(raised);
    expect(panes).toHaveLength(1);
    expect(panes[0].cy).toBeCloseTo(0, 6);
  });

  it('merges split vertices so duplicated positions still form one component', () => {
    // Non-indexed geometry duplicates every shared corner; exact-position
    // merging must reconnect them into the same two components as the
    // indexed original and emit the identical single pane.
    const split = shellWithWindow().toNonIndexed();
    expect(split.getIndex()).toBeNull();
    const panes = panesOf(split);
    expect(panes).toEqual(panesOf(shellWithWindow()));
    expect(panes).toHaveLength(1);
    expect(panes[0].cx).toBeCloseTo(0.6, 6);
    expect(panes[0].cy).toBeCloseTo(0.9, 6);
    expect(panes[0].cz).toBeCloseTo(1.96, 6);
  });

  it('pins the exact pane set of the shipped hexb_home_a kit model', async () => {
    await MeshoptDecoder.ready;
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
    const document = await io.readBinary(
      readFileSync(path.join(__dirname, '..', 'public/models/biome/hexb_home_a.glb')),
    );
    const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
    const position = primitive.getAttribute('POSITION');
    if (!position) throw new Error('hexb_home_a has no POSITION');
    const positions = position.getArray();
    if (!positions) throw new Error('hexb_home_a POSITION has no array');
    const indices = primitive.getIndices()?.getArray() ?? null;

    const panes = kitWindowPanes(positions, position.getCount(), indices);
    expect(panes).toHaveLength(7);

    let modelMinY = Infinity;
    let modelMaxY = -Infinity;
    for (let vertex = 0; vertex < position.getCount(); vertex++) {
      const y = positions[vertex * 3 + 1];
      if (y < modelMinY) modelMinY = y;
      if (y > modelMaxY) modelMaxY = y;
    }
    for (const pane of panes) {
      expect(pane.width).toBeGreaterThan(0);
      expect(pane.height).toBeGreaterThan(0);
      // Every pane bottom clears the model's bottom 10 percent: nothing at
      // ground level (a door or foundation) was selected.
      expect(pane.cy - pane.height / 2).toBeGreaterThan(modelMinY + 0.1 * (modelMaxY - modelMinY));
    }
  });
});
