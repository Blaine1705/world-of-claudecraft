// The Sunken Bastion's storm rain plan (src/render/sunken_bastion/
// bastion_rain_core.ts): tier shedding of cosmetic density only, gusts that
// stay in range and swing, a slant that reads as wind without turning the rain
// sideways, motion-blur streak lengths, and splashes that land on the real
// floor (the stones, the swell) and never on a cliff lip.

import type * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildBastionRain } from '../src/render/sunken_bastion/bastion_rain';
import {
  bastionRainTier,
  packSplashHeights,
  planSplashHeights,
  RAIN_SPEED,
  rainGust,
  rainSlant,
  rainStreakLength,
  rainWind,
  SPLASH_CELL_GLSL,
  splashCellCenter,
  splashLattice,
  unpackSplashHeight,
} from '../src/render/sunken_bastion/bastion_rain_core';
import {
  SUNKEN_BASTION_FIELD,
  SUNKEN_BASTION_SEA_LEVEL,
} from '../src/sim/content/sunken_bastion_layout';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import { authoredFieldHeight } from '../src/sim/instances/authored_field';

// The painter only needs the shared clock here: the real gfx module pulls in
// the whole renderer settings graph.
vi.mock('../src/render/gfx', () => ({ sharedUniforms: { uTime: { value: 0 } } }));

// Which built field draws at all is the open-air roster's decision
// (open_air_field_visibility_core.ts), so no rain shader repeats it.
describe('the retained Bastion rain meshes', () => {
  const rain = buildBastionRain({ lowGfx: false, density: 1 });
  const shaderOf = (name: string): string =>
    (
      rain.getObjectByName(name) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
    ).material.vertexShader.replace(/\s+/g, ' ');

  it('wraps the streak box in the slot frame, away from the far instance coordinates', () => {
    const shader = shaderOf('sunkenBastionRain');
    expect(shader).toContain('vec3 cameraLocal = cameraPosition - modelMatrix[3].xyz;');
    expect(shader).toContain('vec3 rel = mod(p - cameraLocal + uBox * 0.5, uBox) - uBox * 0.5;');
    expect(shader).not.toContain('mod(p - cameraPosition');
  });

  it('stands the distant sheets on the slot floor height', () => {
    expect(shaderOf('sunkenBastionRainSheets')).toContain(
      'modelMatrix[3].y + uSea - 3.0 + aCorner.y * 70.0',
    );
  });

  it('places splash centers in slot-local cells instead of adding the camera translation', () => {
    const mesh = rain.getObjectByName('sunkenBastionRainSplashes') as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.ShaderMaterial
    >;
    expect(mesh.material.vertexShader).not.toContain('vec2 center = cameraPosition.xz +');
    expect(mesh.geometry.getAttribute('aCell')).toBeDefined();
    expect(mesh.material.vertexShader).toContain(SPLASH_CELL_GLSL);
    const shader = mesh.material.vertexShader.replace(/\s+/g, ' ');
    expect(shader).toContain('vec2 center = (cell + 0.5 + (jitter - 0.5) * 0.8) * lattice.y;');
    expect(shader).toContain('float period = lattice.x * lattice.y;');
    expect(shader).toContain(
      'return center + period * floor((cameraLocal - center + period * 0.5) / period);',
    );
    expect(mesh.material.vertexShader).toContain(
      'splashCellCenter(aCell, cameraLocal, r2, uLattice)',
    );
    expect(mesh.material.vertexShader).toContain('vec2 center = modelMatrix[3].xz + local');
    expect(mesh.material.vertexShader).toContain('modelMatrix[3].y + h + 0.04');
    const cells = mesh.geometry.getAttribute('aCell');
    const lattice = splashLattice(bastionRainTier(false, 1).splashes);
    expect(mesh.material.uniforms.uLattice.value.toArray()).toEqual([
      lattice.side,
      lattice.cellSize,
    ]);
    // The crown and ring share one exact floor center throughout their cycle.
    for (let i = 0; i < cells.count; i += 8) {
      for (let k = 1; k < 8; k++) {
        expect(cells.getX(i + k)).toBe(cells.getX(i));
        expect(cells.getY(i + k)).toBe(cells.getY(i));
      }
    }
  });
});

describe('Bastion stationary splash decisions', () => {
  const origin = instanceOrigin(DUNGEONS.sunken_bastion.index, 3);
  it('keeps a surviving ring stationary during camera motion and across a cell admission', () => {
    const lattice = splashLattice(560);
    const cell = { x: 0, z: 0 };
    const jitter = { x: 0.25, z: 0.75 };
    const initial = splashCellCenter(cell, { x: 0, z: 0 }, jitter, lattice);
    for (const camera of [
      { x: 0.7, z: -0.6 },
      { x: lattice.cellSize + 0.01, z: 0 },
      { x: -lattice.cellSize - 0.01, z: 0 },
    ]) {
      expect(splashCellCenter(cell, camera, jitter, lattice)).toEqual(initial);
    }
    const movedCycle = splashCellCenter(cell, { x: 0, z: 0 }, { x: 0.75, z: 0.25 }, lattice);
    expect(movedCycle).not.toEqual(initial);
    // Reuse happens only once the current center has left the 26 yd fade.
    expect(splashCellCenter(cell, { x: initial.x + 25.99, z: 0 }, jitter, lattice)).toEqual(
      initial,
    );
    expect(
      splashCellCenter(cell, { x: initial.x + 26.01, z: 0 }, jitter, lattice).x - initial.x,
    ).toBeCloseTo(52);
  });

  it('recycles only distant cells, on both axes and at negative camera coordinates', () => {
    const lattice = splashLattice(560);
    const cell = { x: 0, z: 0 };
    const jitter = { x: 0.5, z: 0.5 };
    const initial = splashCellCenter(cell, { x: 0, z: 0 }, jitter, lattice);
    const moved = splashCellCenter(cell, { x: 60, z: -60 }, jitter, lattice);
    expect(moved.x - initial.x).toBeCloseTo(52);
    expect(moved.z - initial.z).toBeCloseTo(-52);
    expect(Math.hypot(moved.x - 60, moved.z + 60)).toBeLessThan(26);
  });

  it('translates the same splash and real sampled floor into a different slot', () => {
    const lattice = splashLattice(560);
    const camera = { x: 57, z: 126 };
    const center = splashCellCenter({ x: 2, z: 10 }, camera, { x: 0.5, z: 0.5 }, lattice);
    const grid = planSplashHeights(1);
    const col = Math.round((center.x - grid.minX) / grid.step);
    const row = Math.round((center.z - grid.minZ) / grid.step);
    const k = row * grid.cols + col;
    expect(grid.flat[k]).toBe(1);
    expect(grid.heights[k]).toBeCloseTo(
      authoredFieldHeight(SUNKEN_BASTION_FIELD, grid.minX + col, grid.minZ + row),
    );
    const other = instanceOrigin(DUNGEONS.sunken_bastion.index, 8);
    const inOther = splashCellCenter(
      { x: 2, z: 10 },
      { x: other.x + camera.x - other.x, z: other.z + camera.z - other.z },
      { x: 0.5, z: 0.5 },
      lattice,
    );
    expect(inOther).toEqual(center);
    expect(other.z + inOther.z - (origin.z + center.z)).toBe(other.z - origin.z);
    const mesh = rainMesh();
    const texture = mesh.material.uniforms.uHeights.value as THREE.DataTexture;
    const packed = texture.image.data as Uint8Array;
    expect(unpackSplashHeight(packed[k * 4], packed[k * 4 + 1])).toBeCloseTo(grid.heights[k], 2);
  });
});

function rainMesh(): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  return buildBastionRain({ lowGfx: false, density: 0.1 }).getObjectByName(
    'sunkenBastionRainSplashes',
  ) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
}

describe('the Bastion storm rain plan', () => {
  it('sheds only density with the tier, and never stops raining', () => {
    const high = bastionRainTier(false, 1);
    const mid = bastionRainTier(false, 0.6);
    const low = bastionRainTier(true, 0.35);
    expect(high.streaks).toBeGreaterThan(mid.streaks);
    expect(mid.streaks).toBeGreaterThan(low.streaks);
    expect(low.streaks).toBeGreaterThan(200);
    expect(high.splashes).toBeGreaterThan(0);
    expect(low.splashes).toBe(0);
    expect(low.sheets).toBeGreaterThan(0);
  });

  it('gusts stay in range and actually swing over a minute', () => {
    let lo = 1;
    let hi = 0;
    for (let t = 0; t < 120; t += 0.25) {
      const g = rainGust(t);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
    expect(hi - lo).toBeGreaterThan(0.5);
  });

  it('leans with the wind but never turns sideways', () => {
    for (let t = 0; t < 120; t += 0.5) {
      const w = rainWind(t);
      const slowest = rainSlant(RAIN_SPEED.min, w);
      expect(slowest).toBeGreaterThan(0.12);
      expect(slowest).toBeLessThan(0.62);
    }
  });

  it('draws motion-blurred streaks of about a yard or two', () => {
    expect(rainStreakLength(RAIN_SPEED.min, 0)).toBeGreaterThan(0.7);
    expect(rainStreakLength(RAIN_SPEED.max, 1)).toBeLessThan(2.6);
    expect(rainStreakLength(RAIN_SPEED.max, 1)).toBeGreaterThan(
      rainStreakLength(RAIN_SPEED.min, 0),
    );
  });

  it('lands splashes on the floor, on the swell over the void, never on a lip', () => {
    const grid = planSplashHeights(2);
    const packed = packSplashHeights(grid);
    let onFloor = 0;
    let onSea = 0;
    for (let j = 1; j + 1 < grid.rows; j += 3) {
      for (let i = 1; i + 1 < grid.cols; i += 3) {
        const k = j * grid.cols + i;
        const x = grid.minX + i * grid.step;
        const z = grid.minZ + j * grid.step;
        const floor = authoredFieldHeight(SUNKEN_BASTION_FIELD, x, z);
        const decoded = unpackSplashHeight(packed[k * 4], packed[k * 4 + 1]);
        if (floor <= SUNKEN_BASTION_FIELD.voidHeight + 0.5) {
          expect(decoded).toBeCloseTo(SUNKEN_BASTION_SEA_LEVEL, 2);
          onSea++;
        } else {
          expect(Math.abs(decoded - floor)).toBeLessThan(0.01);
          onFloor++;
        }
        // A cell flagged for splashes has no step round it bigger than a hand.
        if (grid.flat[k]) {
          for (const n of [k - 1, k + 1, k - grid.cols, k + grid.cols]) {
            expect(Math.abs(grid.heights[n] - grid.heights[k])).toBeLessThan(0.6);
          }
        }
      }
    }
    expect(onFloor).toBeGreaterThan(500);
    expect(onSea).toBeGreaterThan(500);
    // The rampart's sea-side lip is not a landing spot.
    const lip = Math.round((65 - grid.minX) / grid.step);
    const row = Math.round((50 - grid.minZ) / grid.step);
    const edgeCells = [lip - 1, lip, lip + 1].map((c) => grid.flat[row * grid.cols + c]);
    expect(edgeCells).toContain(0);
  });
});
