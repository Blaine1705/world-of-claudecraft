// The Sunken Bastion's storm rain plan (src/render/sunken_bastion/
// bastion_rain_core.ts): tier shedding of cosmetic density only, gusts that
// stay in range and swing, a slant that reads as wind without turning the rain
// sideways, motion-blur streak lengths, and splashes that land on the real
// floor (the stones, the swell) and never on a cliff lip.

import { readFileSync } from 'node:fs';
import type * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { sharedUniforms } from '../src/render/gfx';
import { buildBastionRain } from '../src/render/sunken_bastion/bastion_rain';
import {
  bastionRainInSlot,
  bastionRainTier,
  packSplashHeights,
  planSplashHeights,
  RAIN_SLOT_GLSL,
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
import { DUNGEONS, instanceOrigin, ZONES } from '../src/sim/data';
import { authoredFieldHeight } from '../src/sim/instances/authored_field';

vi.mock('../src/render/gfx', async () => {
  const { Vector3 } = await import('three');
  return {
    sharedUniforms: {
      uTime: { value: 0 },
      uCarpetRing: { value: new Vector3() },
    },
  };
});

describe('the retained Bastion rain meshes', () => {
  const rain = buildBastionRain({ lowGfx: false, density: 1 });
  it.each([
    ['sunkenBastionRain', 'vec3 rel = mod('],
    ['sunkenBastionRainSplashes', 'vec2 local = splashCellCenter('],
    ['sunkenBastionRainSheets', 'vec3 world = vec3(cameraPosition.x'],
  ])('clips %s only when the player leaves its own instance', (name, work) => {
    const mesh = rain.getObjectByName(name) as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.ShaderMaterial
    >;
    expect(mesh.material.vertexShader).toContain(
      'bastionRainInSlot(uPlayerXZ.xy - modelMatrix[3].xz)',
    );
    expect(mesh.material.uniforms.uPlayerXZ).toBe(sharedUniforms.uCarpetRing);
    expect(mesh.material.vertexShader).toContain(RAIN_SLOT_GLSL);
    expect(mesh.material.vertexShader).toContain('gl_Position = vec4(2.0, 2.0, 2.0, 1.0)');
    // Literal shader pins are independent of the export we also include.
    const shader = mesh.material.vertexShader.replace(/\s+/g, ' ');
    expect(shader).toContain('local.x >= -300.0 && local.x < 300.0');
    expect(shader).toContain('local.y >= -250.0 && local.y < 250.0');
    const main = shader.slice(shader.indexOf('void main()'));
    const guard = main.indexOf('if (!bastionRainInSlot(uPlayerXZ.xy - modelMatrix[3].xz))');
    const firstWork = main.indexOf(work);
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(main.indexOf('return;')).toBeGreaterThan(guard);
    expect(firstWork).toBeGreaterThan(main.indexOf('return;'));
    if (name === 'sunkenBastionRainSplashes') {
      expect(main.indexOf('vec4 texel = texture2D(')).toBeGreaterThan(main.indexOf('return;'));
    }
  });

  it.each([-240, 235])(
    'keeps every mesh owned by a player at z=%s when the orbit camera leaves the band',
    (playerZ) => {
      const origin = instanceOrigin(DUNGEONS.sunken_bastion.index, 3);
      const cameraZ = playerZ < 0 ? -280 : 275;
      sharedUniforms.uCarpetRing.value.set(origin.x, origin.z + playerZ, 0);
      expect(bastionRainInSlot({ x: 0, z: cameraZ })).toBe(false);
      for (const drawable of rain.children) {
        const material = (drawable as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>)
          .material;
        const player = material.uniforms.uPlayerXZ.value as THREE.Vector3;
        expect(bastionRainInSlot({ x: player.x - origin.x, z: player.y - origin.z })).toBe(true);
        expect(material.vertexShader).not.toContain('bastionRainInSlot(cameraPosition');
      }
    },
  );

  it('shares the player coordinates used by prewarm before camera update and every live frame', () => {
    const renderer = readFileSync(
      new URL('../src/render/renderer.ts', import.meta.url),
      'utf8',
    ).replace(/\r\n/g, '\n');
    const start = renderer.indexOf('private prewarmWorldFrame(');
    const prewarm = renderer.slice(start, renderer.indexOf('\n  private ', start + 1));
    expect(prewarm).toContain(
      'sharedUniforms.uCarpetRing.value.set(p.pos.x, p.pos.z, GFX.bladeCarpetRadius)',
    );
    expect(prewarm.indexOf('sharedUniforms.uCarpetRing.value.set')).toBeLessThan(
      prewarm.indexOf('this.updateCamera('),
    );
    expect(renderer).toContain(
      'sharedUniforms.uCarpetRing.value.set(\n      this.sim.player.pos.x,\n      this.sim.player.pos.z,',
    );
    const origin = instanceOrigin(DUNGEONS.sunken_bastion.index, 3);
    // A prewarm position set before building the material is immediately visible.
    sharedUniforms.uCarpetRing.value.set(origin.x, origin.z, 0);
    const warmed = buildBastionRain({ lowGfx: true, density: 0.35 });
    for (const drawable of warmed.children) {
      const material = (drawable as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>)
        .material;
      expect(material.uniforms.uPlayerXZ).toBe(sharedUniforms.uCarpetRing);
    }
    // No repaint/rebuild is needed after a live player move, even with no carpet.
    sharedUniforms.uCarpetRing.value.set(origin.x, origin.z + 500, 0);
    for (const drawable of rain.children) {
      const player = (drawable as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>).material
        .uniforms.uPlayerXZ.value as THREE.Vector3;
      expect(bastionRainInSlot({ x: player.x - origin.x, z: player.y - origin.z })).toBe(false);
      expect(bastionRainInSlot({ x: player.x - origin.x, z: player.y - (origin.z + 500) })).toBe(
        true,
      );
    }
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

describe('Bastion rain slot and stationary splash decisions', () => {
  const origin = instanceOrigin(DUNGEONS.sunken_bastion.index, 3);
  const local = (world: { x: number; z: number }) => ({
    x: world.x - origin.x,
    z: world.z - origin.z,
  });

  it('keeps rain over its own field, including both end terraces', () => {
    for (const pos of [
      { x: 0, z: 0 },
      { x: 0, z: -242 },
      { x: 0, z: 238 },
    ]) {
      expect(bastionRainInSlot(local({ x: origin.x + pos.x, z: origin.z + pos.z }))).toBe(true);
    }
  });

  it('does not follow the camera to Thornpeak or Gravewyrm Sanctum', () => {
    const thornpeak = ZONES.find((z) => z.id === 'thornpeak_heights');
    if (!thornpeak) throw new Error('The shipped Thornpeak zone must exist');
    expect(bastionRainInSlot(local({ x: 0, z: (thornpeak.zMin + thornpeak.zMax) / 2 }))).toBe(
      false,
    );
    expect(bastionRainInSlot(local(instanceOrigin(DUNGEONS.gravewyrm_sanctum.index, 3)))).toBe(
      false,
    );
  });

  it('excludes another party slot even at its closest terrace edge', () => {
    for (const slot of [2, 4]) {
      const neighbour = instanceOrigin(DUNGEONS.sunken_bastion.index, slot);
      for (const z of [-242, 0, 238]) {
        expect(bastionRainInSlot(local({ x: neighbour.x, z: neighbour.z + z }))).toBe(false);
      }
    }
  });

  it('uses literal half-open x and z band boundaries on both sides', () => {
    for (const [x, z, inside] of [
      [-300.01, 0, false],
      [-300, 0, true],
      [-299.99, 0, true],
      [299.99, 0, true],
      [300, 0, false],
      [300.01, 0, false],
      [0, -250.01, false],
      [0, -250, true],
      [0, -249.99, true],
      [0, 249.99, true],
      [0, 250, false],
      [0, 250.01, false],
    ] as const) {
      expect(bastionRainInSlot({ x, z }), `position ${x}, ${z}`).toBe(inside);
    }
  });

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
