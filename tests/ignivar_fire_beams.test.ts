import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildIgnivarFireBeam,
  IGNIVAR_FIRE_BEAM_CORE_NAME,
  IGNIVAR_FIRE_BEAM_EMBERS_NAME,
  IGNIVAR_FIRE_BEAM_FLAMES_NAME,
  IGNIVAR_FIRE_BEAM_OUTER_NAME,
} from '../src/render/ignivar_fire_beams';

function expectFireBeamInsideFootprint(
  beam: THREE.Group,
  options: { innerRange: number; range: number; startHalfWidth: number; endHalfWidth: number },
): void {
  const expectPointInside = (x: number, z: number) => {
    expect(z).toBeGreaterThanOrEqual(options.innerRange - 1e-6);
    expect(z).toBeLessThanOrEqual(options.range + 1e-6);
    const progress = (z - options.innerRange) / (options.range - options.innerRange);
    const allowed = THREE.MathUtils.lerp(options.startHalfWidth, options.endHalfWidth, progress);
    expect(Math.abs(x)).toBeLessThanOrEqual(allowed + 1e-6);
  };

  for (const name of [IGNIVAR_FIRE_BEAM_OUTER_NAME, IGNIVAR_FIRE_BEAM_CORE_NAME]) {
    const mesh = beam.getObjectByName(name) as THREE.Mesh;
    const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index++) {
      expectPointInside(positions.getX(index), positions.getZ(index));
    }
  }

  const flames = beam.getObjectByName(IGNIVAR_FIRE_BEAM_FLAMES_NAME) as THREE.InstancedMesh;
  const flamePositions = flames.geometry.getAttribute('position') as THREE.BufferAttribute;
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  for (let instance = 0; instance < flames.count; instance++) {
    flames.getMatrixAt(instance, matrix);
    for (let vertex = 0; vertex < flamePositions.count; vertex++) {
      point.fromBufferAttribute(flamePositions, vertex).applyMatrix4(matrix);
      expectPointInside(point.x, point.z);
    }
  }

  const embers = beam.getObjectByName(IGNIVAR_FIRE_BEAM_EMBERS_NAME) as THREE.Points;
  const emberPositions = embers.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < emberPositions.count; index++) {
    expectPointInside(emberPositions.getX(index), emberPositions.getZ(index));
  }
}

describe('Ignivar fire beam VFX', () => {
  it('builds a volumetric white-hot beam with flames and embers inside its danger lane', () => {
    const beam = buildIgnivarFireBeam({
      innerRange: 2.5,
      range: 34,
      startHalfWidth: 1,
      endHalfWidth: 1,
    });

    expect(beam.userData.vfxLayer).toBe('fireBeam');
    expect(beam.getObjectByName(IGNIVAR_FIRE_BEAM_OUTER_NAME)).toBeInstanceOf(THREE.Mesh);
    expect(beam.getObjectByName(IGNIVAR_FIRE_BEAM_CORE_NAME)).toBeInstanceOf(THREE.Mesh);
    expect(beam.getObjectByName(IGNIVAR_FIRE_BEAM_FLAMES_NAME)).toBeInstanceOf(THREE.InstancedMesh);
    expect(beam.getObjectByName(IGNIVAR_FIRE_BEAM_EMBERS_NAME)).toBeInstanceOf(THREE.Points);

    expectFireBeamInsideFootprint(beam, {
      innerRange: 2.5,
      range: 34,
      startHalfWidth: 1,
      endHalfWidth: 1,
    });
  });

  it('widens a fire beam only as far as its cone footprint', () => {
    const halfAngle = Math.PI / 10;
    const radius = 24;
    const range = Math.cos(halfAngle) * radius;
    const endHalfWidth = Math.sin(halfAngle) * radius;
    const options = {
      innerRange: 0,
      range,
      startHalfWidth: 0,
      endHalfWidth,
    };
    const beam = buildIgnivarFireBeam({
      ...options,
    });
    expectFireBeamInsideFootprint(beam, options);
  });
});
