import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { inFarBand } from '../scripts/lib/far_band_experiment.mjs';
import { collectMiddleBandScenery, inMiddleBand } from '../scripts/lib/middle_band_experiment.mjs';
import { sceneryQualityIndices } from '../scripts/lib/scenery_quality_indices.mjs';
import { collectSceneryPlacements } from '../src/render/scenery_bands/collect';
import {
  prepareSceneryBandGeometry,
  sceneryBandIndices,
} from '../src/render/scenery_bands/geometry';
import {
  LOW_SCENERY_BUDGET,
  lowSceneryRepresentation,
} from '../src/render/scenery_bands/policy_core';

describe('selected scenery prototype production parity', () => {
  it('keeps the measured near budget and outer replacement boundaries', () => {
    expect(LOW_SCENERY_BUDGET).toMatchObject({
      full: 60,
      middle: 120,
      far: 240,
      horizon: 480,
      fadeEnd: 560,
      middleTriangles: 512,
      palmMiddleTriangles: 256,
      farTriangles: 32,
      outerTriangles: 12,
      giantViews: 4,
      giantCellPixels: 256,
    });
    for (const kind of ['foliage', 'zone-instance', 'landmark'] as const) {
      for (const distance of [
        39, 59, 60, 60.01, 63.99, 64, 64.01, 119, 120, 120.01, 240, 240.01, 480, 560, 560.01,
      ]) {
        const item = {
          kind,
          x: distance,
          z: 0,
          bounds: [distance, distance + 3, 0, 3] as [number, number, number, number],
        };
        const selected = lowSceneryRepresentation(item, 0, 0, false);
        expect(selected === 'middle').toBe(inMiddleBand(item, 0, 0));
        expect(selected === 'far').toBe(inFarBand(item, 0, 0));
        const giant = lowSceneryRepresentation(item, 0, 0, true);
        expect(giant === 'sprite').toBe(
          distance > (kind === 'foliage' ? 60 : 64) && distance <= 560,
        );
      }
    }
  });

  it.each([false, true])(
    'uses the exact measured middle reduction (Palmreach %s)',
    async (palm) => {
      await prepareSceneryBandGeometry();
      for (const geometry of [
        new THREE.BoxGeometry(3, 12, 3),
        new THREE.SphereGeometry(8, 48, 32),
      ]) {
        const target = palm ? 256 : 512;
        const before = geometry.attributes.position.array.slice();
        expect(sceneryBandIndices(geometry, target, palm ? 'palm' : 'quality')).toEqual(
          sceneryQualityIndices(geometry, target, palm),
        );
        expect(geometry.attributes.position.array).toEqual(before);
        geometry.dispose();
      }
    },
  );

  it('collects the same eligible whole placements, excluding clutter and towns', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const material = new THREE.MeshLambertMaterial();
    material.name = 'Leaves_Pine';
    for (const name of [
      'foliage',
      'garden-features',
      'jungle-features',
      'props',
      'eastbrook-town',
    ]) {
      const root = new THREE.Group();
      root.name = name;
      scene.add(root);
      for (const size of [1, 8]) {
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), material, 3);
        for (let i = 0; i < 3; i++)
          mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(90 + i * 300, 0, 0));
        root.add(mesh);
      }
    }
    const projection = (
      items: readonly {
        key: string;
        kind: string;
        x: number;
        z: number;
        bounds: readonly number[];
        parts: readonly { source: THREE.Mesh; index: number | null; matrix: THREE.Matrix4 }[];
      }[],
    ) =>
      items.map((item) => ({
        key: item.key,
        kind: item.kind,
        x: item.x,
        z: item.z,
        bounds: item.bounds,
        parts: item.parts.map((part) => ({
          id: part.source.uuid,
          index: part.index,
          matrix: part.matrix.elements,
        })),
      }));
    const port = collectSceneryPlacements(scene.children, 0, 0, 630);
    expect(projection(port)).toEqual(projection(collectMiddleBandScenery({ scene, camera }, 630)));
    expect(port).toHaveLength(6);
    expect(port.every((item) => item.parts.length === 2)).toBe(true);
  });
});
