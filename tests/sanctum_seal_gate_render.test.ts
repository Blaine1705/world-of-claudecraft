// The Seal Gate's cosmetic layer: the pure plan (sanctum_seal_gate_core.ts:
// the mist flow, its tier thinning, the rime fan) and the painter's contract
// (sanctum_seal_gate.ts: one point light, two cull groups, one instanced mist
// draw on the shared clock, the floor ladder, the stand-in when no GLB loaded).
// Three.js runs headless in Node (no WebGL needed for the scene graph).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { floorVfxRenderOrder } from '../src/render/floor_vfx_layer';
import { gfxInternalsForTest, sharedUniforms } from '../src/render/gfx';
import { MIST_GATE_PROGRAM_CACHE_KEY } from '../src/render/ignivar_mist_gate';
import {
  buildSanctumSealGate,
  SANCTUM_MIST_PROGRAM_CACHE_KEY,
  sanctumSealGateInternalsForTest,
} from '../src/render/sanctum_seal_gate';
import {
  type MistPose,
  rimeFanAlpha,
  rimeFanVertex,
  SANCTUM_MIST_FILM,
  SANCTUM_MIST_FLOW,
  SANCTUM_RIME_FAN,
  SANCTUM_RUNE_LIGHT,
  sanctumMistPose,
  sanctumMistPuff,
  sanctumMistPuffCount,
} from '../src/render/sanctum_seal_gate_core';
import { DUNGEONS } from '../src/sim/data';
import { terrainHeight } from '../src/sim/world';

const SEED = 42;

describe('the cold mist plan', () => {
  it('thins the puffs by the static effects tier, never to zero', () => {
    const counts = (['low', 'medium', 'high', 'ultra'] as const).map(sanctumMistPuffCount);
    expect(counts).toEqual([6, 12, 18, 24]);
  });

  it('pours out of the mouth over the plaza, widening, fading in and out', () => {
    const puff = sanctumMistPuff(3, 12);
    const pose: MistPose = { x: 0, y: 0, z: 0, scale: 0, alpha: 0 };
    const t0 = (1 - puff.phase) / puff.speed; // the moment its cycle restarts
    const born = { ...sanctumMistPose(puff, t0 + 0.001, pose) };
    const mid = { ...sanctumMistPose(puff, t0 + 0.5 / puff.speed, pose) };
    const dying = { ...sanctumMistPose(puff, t0 + 0.999 / puff.speed, pose) };
    expect(born.z).toBeCloseTo(SANCTUM_MIST_FLOW.startLz, 1);
    expect(mid.z).toBeLessThan(born.z);
    expect(dying.z).toBeCloseTo(SANCTUM_MIST_FLOW.endLz, 0);
    expect(mid.scale).toBeGreaterThan(born.scale);
    expect(born.alpha).toBeLessThan(0.05);
    expect(mid.alpha).toBeCloseTo(1, 5);
    expect(dying.alpha).toBeLessThan(0.05);
    // no random stream: the same index always gives the same puff
    expect(sanctumMistPuff(3, 12)).toEqual(puff);
  });

  it('every puff lane lies inside the fan and the film fills the mouth behind the trigger', () => {
    for (let i = 0; i < 24; i++) {
      const p = sanctumMistPuff(i, 24);
      expect(Math.abs(p.lane)).toBeLessThanOrEqual(1);
      expect(p.phase).toBeGreaterThanOrEqual(0);
      expect(p.phase).toBeLessThan(1);
    }
    // the film stands behind the door line (lz 0), where the trigger has
    // already taken a walker, and is wider than the 4yd lane
    expect(SANCTUM_MIST_FILM.lz).toBeGreaterThan(2);
    expect(SANCTUM_MIST_FILM.width).toBeGreaterThan(4);
  });
});

describe('the rime fan', () => {
  it('opens from the gate toward the plaza and fades out at its rim and sides', () => {
    const f = SANCTUM_RIME_FAN;
    for (let row = 0; row <= f.rows; row++) {
      for (let col = 0; col <= f.cols; col++) {
        const a = rimeFanAlpha(row, col);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(0.85);
        const { lz } = rimeFanVertex(row, col);
        // the fan lies in front of the gate, never under the pylons or inside
        expect(lz).toBeLessThan(0);
      }
      expect(rimeFanAlpha(row, 0)).toBe(0);
      expect(rimeFanAlpha(row, f.cols)).toBe(0);
    }
    for (let col = 0; col <= f.cols; col++) expect(rimeFanAlpha(f.rows, col)).toBe(0);
    // about 12 yd of rime in front of the gate
    const far = rimeFanVertex(f.rows, f.cols / 2);
    expect(Math.hypot(far.lx, far.lz)).toBeGreaterThan(11);
    expect(Math.hypot(far.lx, far.lz)).toBeLessThan(15);
  });
});

describe('the Seal Gate painter', () => {
  it('builds one rune light, two cull groups and the cosmetic layer on the door', () => {
    sanctumSealGateInternalsForTest.resetCaches();
    const view = buildSanctumSealGate(SEED);
    expect(view.glowLights).toHaveLength(1);
    const light = view.glowLights[0];
    expect(light).toBeInstanceOf(THREE.PointLight);
    expect(light.color.getHex()).toBe(SANCTUM_RUNE_LIGHT.color);
    const door = DUNGEONS.gravewyrm_sanctum.doorPos;
    const base = terrainHeight(door.x, door.z, SEED);
    expect(light.position.y).toBeCloseTo(base + SANCTUM_RUNE_LIGHT.y, 5);
    expect(view.cullGroups.map((g) => g.name)).toEqual(['sanctumSealGateBody', 'sanctumIceTongue']);
    const gate = view.cullGroups[0];
    expect(gate.position.x).toBe(door.x);
    expect(gate.position.z).toBe(door.z);
    expect(gate.position.y).toBeCloseTo(base, 6);
    let points = 0;
    view.group.traverse((o) => {
      if ((o as THREE.PointLight).isPointLight) points++;
    });
    expect(points, 'at most one point light, through the fire-light sink').toBe(1);
  });

  it('the cold mist is ONE instanced draw on the shared clock, on the ground band', () => {
    const view = buildSanctumSealGate(SEED);
    const mist = view.group.getObjectByName('sanctumColdMist') as THREE.InstancedMesh;
    expect(mist.isInstancedMesh).toBe(true);
    expect(mist.renderOrder).toBe(floorVfxRenderOrder('ground', 1));
    const rime = view.group.getObjectByName('sanctumRimeFan') as THREE.Mesh;
    expect(rime.renderOrder).toBe(floorVfxRenderOrder('ground', 0));
    const material = mist.material as THREE.MeshBasicMaterial;
    expect(material.customProgramCacheKey()).toBe(SANCTUM_MIST_PROGRAM_CACHE_KEY);
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <map_fragment>',
    };
    material.onBeforeCompile(
      shader as unknown as THREE.WebGLProgramParametersWithUniforms,
      null as unknown as THREE.WebGLRenderer,
    );
    expect(shader.uniforms.uTime).toBe(sharedUniforms.uTime);
    expect(shader.vertexShader).toContain('attribute vec4 aPuff');
    expect(shader.vertexShader).not.toContain('#include <project_vertex>');
    expect(shader.fragmentShader).toContain('diffuseColor.a *= vPuffAlpha');
    // the vertex stage is the core's own flow, constant for constant
    const src = sanctumSealGateInternalsForTest.mistVertex;
    expect(src).toContain(SANCTUM_MIST_FLOW.spread.toFixed(2));
    expect(src).toContain(SANCTUM_MIST_FLOW.startLz.toFixed(2));
    expect(src).toContain(SANCTUM_MIST_FLOW.endLz.toFixed(2));
  });

  it('the mouth film reuses the mist gate family program (no new program for the portal look)', () => {
    const view = buildSanctumSealGate(SEED);
    const film = view.group.getObjectByName('sanctumMistFilm') as THREE.Group;
    expect(film.children).toHaveLength(2);
    for (const sheet of film.children as THREE.Mesh[]) {
      const material = sheet.material as THREE.MeshBasicMaterial;
      expect(material.customProgramCacheKey()).toBe(MIST_GATE_PROGRAM_CACHE_KEY);
      expect(material.depthWrite).toBe(false);
    }
  });

  it('without the GLBs (headless, pre-load) the pylons still draw as a stand-in', () => {
    const view = buildSanctumSealGate(SEED);
    const body = view.cullGroups[0];
    let blocks = 0;
    body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && (mesh.geometry as THREE.BoxGeometry).type === 'BoxGeometry') blocks++;
    });
    expect(blocks).toBe(3);
  });

  it('the rime follows the live tier: Standard on PBR tiers, Lambert where the tier sheds it', () => {
    sanctumSealGateInternalsForTest.resetCaches();
    const built: THREE.Material[] = [];
    for (const standardMaterials of [true, false]) {
      const restore = gfxInternalsForTest.overrideSettings({ standardMaterials });
      try {
        const m = sanctumSealGateInternalsForTest.rimeMaterial();
        expect(m).toBeInstanceOf(
          standardMaterials ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial,
        );
        // each family is built once and reused
        expect(sanctumSealGateInternalsForTest.rimeMaterial()).toBe(m);
        built.push(m);
      } finally {
        restore();
      }
    }
    expect(built[0]).not.toBe(built[1]);
    for (const m of built) {
      expect(m.transparent).toBe(true);
      expect(m.depthWrite).toBe(false);
      expect(m.polygonOffset).toBe(true);
      expect(m.vertexColors).toBe(true);
    }
  });

  it('the mist matrices are seeded across the flow envelope (the fog sweep measures them)', () => {
    const view = buildSanctumSealGate(SEED);
    const mist = view.group.getObjectByName('sanctumColdMist') as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let minZ = Infinity;
    let maxAbsX = 0;
    for (let i = 0; i < mist.count; i++) {
      mist.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      minZ = Math.min(minZ, p.z);
      maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
    }
    expect(minZ).toBeLessThan(SANCTUM_MIST_FLOW.endLz / 2);
    expect(maxAbsX).toBeGreaterThan(3);
  });

  it('the runes are unlit and dimmed (a faint glow, never a light source)', () => {
    sanctumSealGateInternalsForTest.resetCaches();
    const runes = sanctumSealGateInternalsForTest.kitMaterial('KitGlow') as THREE.MeshBasicMaterial;
    expect(runes).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(runes.vertexColors).toBe(true);
    expect(runes.color.r).toBeLessThan(1);
  });
});
