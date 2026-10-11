// Exercise the built bridge mesh: centerline height math alone cannot detect
// a walking surface whose triangle winding hides it from a camera above.
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharedUniforms } from '../src/render/gfx';
import { buildSanctumGates } from '../src/render/gravewyrm_sanctum/sanctum_gates';
import {
  CHAIN_BRIDGE_DECK,
  chainBridgeDeckHeight,
} from '../src/render/gravewyrm_sanctum/sanctum_gates_core';
import { sanctumGround } from '../src/render/gravewyrm_sanctum/sanctum_plan_core';
import {
  clearGateMemoryForTest,
  gateMemoryKey,
  observeGate,
} from '../src/render/hollow_crypt/crypt_gate_state_core';
import { GRAVEWYRM_SANCTUM_GATES } from '../src/sim/content/gravewyrm_sanctum';

// Only the canvas glow texture needs a Node substitute, not the bridge builder,
// geometry, gate memory, animation hook, or production material.
vi.mock('../src/render/textures', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/render/textures')>()),
  radialGlowTexture: () => new THREE.Texture(),
}));

afterEach(() => {
  clearGateMemoryForTest();
  sharedUniforms.uTime.value = 0;
});

function openBridge(): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  clearGateMemoryForTest();
  const gate = GRAVEWYRM_SANCTUM_GATES.find((g) => g.kind === 'chain_bridge');
  if (!gate) throw new Error('No chain bridge gate');
  observeGate(gateMemoryKey(0, 0, gate.id), 'dungeon_gate_open', 0);
  const group = buildSanctumGates(0, 0, sanctumGround);
  const driver = group.getObjectByName('sanctumChainBridgeLinks:stone');
  const crust = group.getObjectByName('sanctumChainBridgeCrust');
  if (!(driver instanceof THREE.Mesh) || !(crust instanceof THREE.Mesh))
    throw new Error('Missing built chain bridge meshes');
  group.updateMatrixWorld(true);
  driver.onBeforeRender(
    null as unknown as THREE.WebGLRenderer,
    new THREE.Scene(),
    new THREE.Camera(),
    driver.geometry,
    driver.material as THREE.Material,
    null as unknown as THREE.Group,
  );
  group.updateMatrixWorld(true);
  expect(crust.visible).toBe(true);
  expect(crust.material.side).toBe(THREE.FrontSide);
  return crust;
}

describe('the painted Sanctum chain bridge deck', () => {
  it('faces every center walking triangle upward', () => {
    const crust = openBridge();
    const pos = crust.geometry.getAttribute('position');
    const normal = crust.geometry.getAttribute('normal');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const cross = new THREE.Vector3();
    let centerTriangles = 0;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      if (Math.max(Math.abs(a.x), Math.abs(b.x), Math.abs(c.x)) > 0.81) continue;
      centerTriangles++;
      cross.crossVectors(b.sub(a), c.sub(a)).normalize();
      expect(cross.y, `geometric normal for triangle ${i / 3}`).toBeGreaterThan(0.9);
      for (let k = i; k < i + 3; k++) expect(normal.getY(k)).toBeGreaterThan(0.9);
    }
    expect(centerTriangles).toBeGreaterThan(100);
  });

  it('is visible from above across the walk on the FrontSide production material', () => {
    const crust = openBridge();
    const ray = new THREE.Raycaster();
    for (const z of [2, 9, 14, 22, 27]) {
      for (const dx of [-3, 0, 3]) {
        ray.set(new THREE.Vector3(CHAIN_BRIDGE_DECK.x + dx, 80, z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(crust, false);
        expect(hits.length, `surface above ${dx},${z}`).toBeGreaterThan(0);
        expect(hits[0].point.y).toBeCloseTo(chainBridgeDeckHeight(z) + 0.04, 2);
      }
    }
  });
});
