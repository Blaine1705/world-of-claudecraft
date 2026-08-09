// Shared procedural fire-beam VFX for Ignivar's fixed and rotating ray mechanics.
// Every decorative vertex stays inside the authoritative floor footprint so the
// spectacle cannot imply a wider hitbox than the simulation uses.

import * as THREE from 'three';

export const IGNIVAR_FIRE_BEAM_OUTER_NAME = 'ignivarFireBeamOuter';
export const IGNIVAR_FIRE_BEAM_CORE_NAME = 'ignivarFireBeamCore';
export const IGNIVAR_FIRE_BEAM_FLAMES_NAME = 'ignivarFireBeamFlames';
export const IGNIVAR_FIRE_BEAM_EMBERS_NAME = 'ignivarFireBeamEmbers';

export interface IgnivarFireBeamOptions {
  innerRange: number;
  range: number;
  startHalfWidth: number;
  endHalfWidth: number;
}

function beamPrismGeometry(
  options: IgnivarFireBeamOptions,
  widthScale: number,
  bottom: number,
  top: number,
): THREE.BufferGeometry {
  const startWidth = options.startHalfWidth * widthScale;
  const endWidth = options.endHalfWidth * widthScale;
  const positions = [
    -startWidth,
    bottom,
    options.innerRange,
    startWidth,
    bottom,
    options.innerRange,
    -endWidth,
    bottom,
    options.range,
    endWidth,
    bottom,
    options.range,
    -startWidth,
    top,
    options.innerRange,
    startWidth,
    top,
    options.innerRange,
    -endWidth,
    top,
    options.range,
    endWidth,
    top,
    options.range,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([
    0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5, 2, 6, 3, 3, 6, 7,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function fireMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Builds one white-hot fire wall with tongues and embers along the full lane. */
export function buildIgnivarFireBeam(options: IgnivarFireBeamOptions): THREE.Group {
  const group = new THREE.Group();
  group.userData.vfxLayer = 'fireBeam';
  group.userData.startHalfWidth = options.startHalfWidth;
  group.userData.endHalfWidth = options.endHalfWidth;

  const outer = new THREE.Mesh(
    beamPrismGeometry(options, 0.92, 0.1, 2.15),
    fireMaterial(0xff4a08, 0.34),
  );
  outer.name = IGNIVAR_FIRE_BEAM_OUTER_NAME;
  outer.renderOrder = 5;

  const core = new THREE.Mesh(
    beamPrismGeometry(options, 0.28, 0.12, 0.82),
    fireMaterial(0xfff0a0, 0.82),
  );
  core.name = IGNIVAR_FIRE_BEAM_CORE_NAME;
  core.renderOrder = 6;

  const flameCount = 14;
  const flameGeometry = new THREE.ConeGeometry(1, 1, 5, 1, true);
  const flames = new THREE.InstancedMesh(flameGeometry, fireMaterial(0xff8a16, 0.62), flameCount);
  flames.name = IGNIVAR_FIRE_BEAM_FLAMES_NAME;
  flames.renderOrder = 7;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < flameCount; index++) {
    const progress = (index + 1) / (flameCount + 1);
    const halfWidth = THREE.MathUtils.lerp(options.startHalfWidth, options.endHalfWidth, progress);
    const radius = Math.min(0.36, halfWidth * 0.2);
    const height = 0.75 + ((index * 7) % 5) * 0.18;
    dummy.position.set(
      Math.sin(index * 2.39996) * halfWidth * 0.56,
      0.1 + height / 2,
      THREE.MathUtils.lerp(options.innerRange, options.range, progress),
    );
    dummy.rotation.set(0, index * 1.17, 0);
    dummy.scale.set(radius, height, radius);
    dummy.updateMatrix();
    flames.setMatrixAt(index, dummy.matrix);
  }
  flames.instanceMatrix.needsUpdate = true;

  const emberCount = 24;
  const emberPositions = new Float32Array(emberCount * 3);
  for (let index = 0; index < emberCount; index++) {
    const progress = (index + 0.5) / emberCount;
    const halfWidth = THREE.MathUtils.lerp(options.startHalfWidth, options.endHalfWidth, progress);
    emberPositions[index * 3] = Math.sin(index * 2.39996) * halfWidth * 0.68;
    emberPositions[index * 3 + 1] = 0.65 + ((index * 11) % 9) * 0.17;
    emberPositions[index * 3 + 2] = THREE.MathUtils.lerp(
      options.innerRange,
      options.range,
      progress,
    );
  }
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
  const embers = new THREE.Points(
    emberGeometry,
    new THREE.PointsMaterial({
      color: 0xffd06a,
      size: 0.22,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  embers.name = IGNIVAR_FIRE_BEAM_EMBERS_NAME;
  embers.renderOrder = 8;

  group.add(outer, core, flames, embers);
  return group;
}
