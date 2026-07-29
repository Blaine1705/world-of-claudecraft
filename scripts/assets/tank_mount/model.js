import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const TANK_STAGES = Object.freeze([
  'blockout',
  'structural',
  'form',
  'material',
  'surface',
  'lighting',
  'interaction',
  'optimization',
  'final',
]);

export const TANK_NATIVE_BOUNDS = Object.freeze({
  width: 2.55,
  height: 2.45,
  depth: 3.45,
});

export const TANK_CLIP_NAMES = Object.freeze(['Idle', 'Walk', 'Run', 'Death']);

export const TANK_SOCKET_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'rider',
    nodeName: 'Socket_Rider',
    position: Object.freeze([0, 2.08, -0.26]),
    purpose: 'mounted player seat',
  }),
  Object.freeze({
    id: 'exhaust',
    nodeName: 'Socket_Exhaust',
    position: Object.freeze([0.82, 1.55, -1.18]),
    purpose: 'future exhaust effect anchor',
  }),
]);

export const TANK_MATERIAL_CONTRACT = Object.freeze([
  Object.freeze({ name: 'TankCreamPaint', color: 0xf0deb2, roughness: 0.62, metalness: 0.34 }),
  Object.freeze({ name: 'TankVioletPaint', color: 0x8a5ea7, roughness: 0.58, metalness: 0.38 }),
  Object.freeze({ name: 'TankDarkIron', color: 0x453b4b, roughness: 0.66, metalness: 0.68 }),
  Object.freeze({ name: 'TankBronze', color: 0xd19a4e, roughness: 0.44, metalness: 0.72 }),
  Object.freeze({ name: 'TankLeather', color: 0x8a5638, roughness: 0.76, metalness: 0 }),
  Object.freeze({ name: 'TankTextile', color: 0x55765a, roughness: 0.86, metalness: 0 }),
]);

const PALETTE = Object.freeze({
  cream: 0xe0cd9f,
  creamLight: 0xf0deb2,
  creamShade: 0xbda47e,
  violet: 0x6f488b,
  violetLight: 0x8a5ea7,
  violetShade: 0x4b3264,
  iron: 0x29252f,
  ironLight: 0x453b4b,
  ironDeep: 0x17161c,
  bronze: 0xb47c37,
  bronzeLight: 0xd19a4e,
  bronzeShade: 0x704421,
  leather: 0x663c28,
  leatherLight: 0x8a5638,
  leatherShade: 0x3d261f,
  textile: 0x395940,
  textileLight: 0x55765a,
  textileShade: 0x253d2d,
  blockoutPrimary: 0x87909b,
  blockoutSecondary: 0x59616d,
});

const VERTEX_COLOR_BASES = new Map([
  [PALETTE.cream, PALETTE.creamLight],
  [PALETTE.creamLight, PALETTE.creamLight],
  [PALETTE.creamShade, PALETTE.creamLight],
  [PALETTE.violet, PALETTE.violetLight],
  [PALETTE.violetLight, PALETTE.violetLight],
  [PALETTE.violetShade, PALETTE.violetLight],
  [PALETTE.iron, PALETTE.ironLight],
  [PALETTE.ironLight, PALETTE.ironLight],
  [PALETTE.ironDeep, PALETTE.ironLight],
  [PALETTE.bronze, PALETTE.bronzeLight],
  [PALETTE.bronzeLight, PALETTE.bronzeLight],
  [PALETTE.bronzeShade, PALETTE.bronzeLight],
  [PALETTE.leather, PALETTE.leatherLight],
  [PALETTE.leatherLight, PALETTE.leatherLight],
  [PALETTE.leatherShade, PALETTE.leatherLight],
  [PALETTE.textile, PALETTE.textileLight],
  [PALETTE.textileLight, PALETTE.textileLight],
  [PALETTE.textileShade, PALETTE.textileLight],
  [PALETTE.blockoutPrimary, PALETTE.blockoutPrimary],
  [PALETTE.blockoutSecondary, PALETTE.blockoutPrimary],
]);

function stageIndex(stage) {
  const index = TANK_STAGES.indexOf(stage);
  if (index < 0) throw new Error(`unknown tank stage: ${stage}`);
  return index;
}

function atLeast(stage, threshold) {
  return stageIndex(stage) >= stageIndex(threshold);
}

function stageColor(stage, finished, blockout = PALETTE.blockoutPrimary) {
  return atLeast(stage, 'material') ? finished : blockout;
}

function matrixFor(position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
}

function prepareGeometry(source, color, matrix = null) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('uv1');
  if (matrix) geometry.applyMatrix4(matrix);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const tint = new THREE.Color(color);
  const base = new THREE.Color(VERTEX_COLOR_BASES.get(color) ?? 0xffffff);
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let index = 0; index < geometry.getAttribute('position').count; index++) {
    colors[index * 3] = THREE.MathUtils.clamp(tint.r / base.r, 0, 1);
    colors[index * 3 + 1] = THREE.MathUtils.clamp(tint.g / base.g, 0, 1);
    colors[index * 3 + 2] = THREE.MathUtils.clamp(tint.b / base.b, 0, 1);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function addGeometry(bucket, geometry, color, options = {}) {
  bucket.push(
    prepareGeometry(
      geometry,
      color,
      matrixFor(options.position ?? [0, 0, 0], options.rotation, options.scale),
      options.variation ?? 0,
    ),
  );
}

function addBox(bucket, size, position, color, options = {}) {
  const radius = Math.min(options.radius ?? 0.025, Math.min(...size) * 0.45);
  const geometry =
    radius > 0
      ? new RoundedBoxGeometry(size[0], size[1], size[2], options.segments ?? 1, radius)
      : new THREE.BoxGeometry(...size);
  addGeometry(bucket, geometry, color, {
    position,
    rotation: options.rotation,
    variation: options.variation,
  });
}

function addCylinder(bucket, radius, length, position, color, options = {}) {
  const geometry = new THREE.CylinderGeometry(
    radius,
    options.radiusTop ?? radius,
    length,
    options.radialSegments ?? 12,
    1,
    options.openEnded ?? false,
  );
  addGeometry(bucket, geometry, color, {
    position,
    rotation: options.rotation ?? [0, 0, Math.PI / 2],
    variation: options.variation,
  });
}

function addSphere(bucket, radius, position, color, options = {}) {
  addGeometry(bucket, new THREE.IcosahedronGeometry(radius, options.detail ?? 1), color, {
    position,
    scale: options.scale,
    variation: options.variation,
  });
}

function addTube(bucket, points, radius, color, tubularSegments = 18, radialSegments = 7) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  addGeometry(
    bucket,
    new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false),
    color,
  );
}

function makeFrustum(widthBottom, widthTop, height, depthBottom, depthTop) {
  const y0 = -height / 2;
  const y1 = height / 2;
  const xb = widthBottom / 2;
  const xt = widthTop / 2;
  const zb = depthBottom / 2;
  const zt = depthTop / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        -xb,
        y0,
        -zb,
        xb,
        y0,
        -zb,
        xb,
        y0,
        zb,
        -xb,
        y0,
        zb,
        -xt,
        y1,
        -zt,
        xt,
        y1,
        -zt,
        xt,
        y1,
        zt,
        -xt,
        y1,
        zt,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0,
    4, 3, 4, 7,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function roundedTrackShape(length, height, radius, inset = 0) {
  const halfLength = length / 2 - inset;
  const halfHeight = height / 2 - inset;
  const r = Math.max(0.08, radius - inset);
  const shape = new THREE.Shape();
  shape.moveTo(-halfLength + r, -halfHeight);
  shape.lineTo(halfLength - r, -halfHeight);
  shape.quadraticCurveTo(halfLength, -halfHeight, halfLength, -halfHeight + r);
  shape.lineTo(halfLength, halfHeight - r);
  shape.quadraticCurveTo(halfLength, halfHeight, halfLength - r, halfHeight);
  shape.lineTo(-halfLength + r, halfHeight);
  shape.quadraticCurveTo(-halfLength, halfHeight, -halfLength, halfHeight - r);
  shape.lineTo(-halfLength, -halfHeight + r);
  shape.quadraticCurveTo(-halfLength, -halfHeight, -halfLength + r, -halfHeight);
  shape.closePath();
  return shape;
}

function makeTrackLoop(length, height, radius, width) {
  const outer = roundedTrackShape(length, height, radius);
  const hole = roundedTrackShape(length - 0.28, height - 0.28, radius - 0.14);
  hole.curves.reverse();
  outer.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(outer, {
    depth: width,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 4,
  });
  geometry.translate(0, 0, -width / 2);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function makeShield(width, height, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(width * 0.46, -height * 0.1);
  shape.lineTo(0, -height / 2);
  shape.lineTo(-width * 0.46, -height * 0.1);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.015,
    bevelThickness: 0.015,
    curveSegments: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function mergeBucket(bucket, label) {
  if (bucket.length === 0) return null;
  const merged = mergeGeometries(bucket, false);
  if (!merged) throw new Error(`could not merge tank ${label} geometry`);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function createMaterial(contract, stage, blockoutColor) {
  const finished = TANK_MATERIAL_CONTRACT.find((entry) => entry.name === contract.name);
  const material = new THREE.MeshStandardMaterial({
    name: contract.name,
    color: atLeast(stage, 'material') ? finished.color : blockoutColor,
    roughness: atLeast(stage, 'material') ? finished.roughness : 0.8,
    metalness: atLeast(stage, 'material') ? finished.metalness : 0,
    vertexColors: true,
    flatShading: false,
  });
  material.userData.semanticColor = blockoutColor;
  return material;
}

function addTrackPads(bucket, stage, sideX) {
  const color = stageColor(stage, PALETTE.iron, PALETTE.blockoutSecondary);
  const padX = sideX + Math.sign(sideX) * 0.045;
  const straightZ = [-0.82, -0.5, -0.18, 0.18, 0.5, 0.82];
  for (const y of [0.11, 1.13]) {
    for (const z of straightZ) {
      addBox(bucket, [0.42, 0.12, 0.25], [padX, y, z], color, {
        radius: 0.018,
        variation: 0.012,
      });
    }
  }
  for (const endSign of [-1, 1]) {
    for (let index = 0; index < 6; index++) {
      const angle = -Math.PI / 2 + ((index + 0.5) * Math.PI) / 6;
      const z = endSign * (0.9 + Math.cos(angle) * 0.34);
      const y = 0.62 + Math.sin(angle) * 0.51;
      addBox(bucket, [0.42, 0.12, 0.24], [padX, y, z], color, {
        radius: 0.018,
        rotation: [endSign * angle, 0, 0],
        variation: 0.012,
      });
    }
  }
}

function createWheelGeometry(stage, side, index) {
  const violet = stageColor(stage, PALETTE.violet, PALETTE.blockoutSecondary);
  const bucket = [];
  addCylinder(bucket, 0.335, 0.16, [0, 0, 0], violet, {
    radialSegments: atLeast(stage, 'form') ? 14 : 10,
    variation: atLeast(stage, 'surface') ? 0.012 : 0,
  });
  if (atLeast(stage, 'form')) {
    for (let spoke = 0; spoke < 5; spoke++) {
      const angle = (spoke * Math.PI * 2) / 5 + index * 0.13 + (side === 'R' ? 0.18 : 0);
      addBox(
        bucket,
        [0.18, 0.075, 0.25],
        [0, Math.sin(angle) * 0.16, Math.cos(angle) * 0.16],
        stageColor(stage, PALETTE.violetLight, PALETTE.blockoutSecondary),
        {
          radius: 0,
          rotation: [angle, 0, 0],
        },
      );
    }
  }
  return mergeBucket(bucket, `${side} wheel ${index}`);
}

function addRunningGear(root, buckets, stage, wheelNodes, wheelMaterial) {
  const iron = stageColor(stage, PALETTE.iron, PALETTE.blockoutSecondary);
  const bronze = stageColor(stage, PALETTE.bronze, PALETTE.blockoutSecondary);
  const violetShade = stageColor(stage, PALETTE.violetShade, PALETTE.blockoutSecondary);
  const wheelZ = [-0.84, -0.43, 0, 0.43, 0.84];

  for (const [side, x] of [
    ['L', -1.02],
    ['R', 1.02],
  ]) {
    addGeometry(buckets.dark, makeTrackLoop(2.55, 1.18, 0.46, 0.42), iron, {
      position: [x, 0.62, 0],
      variation: atLeast(stage, 'surface') ? 0.01 : 0,
    });
    if (atLeast(stage, 'structural')) addTrackPads(buckets.dark, stage, x);

    for (let index = 0; index < wheelZ.length; index++) {
      const node = new THREE.Group();
      node.name = `Wheel_${side}_${index}`;
      node.position.set(x + (side === 'L' ? -0.225 : 0.225), 0.62, wheelZ[index]);
      const mesh = new THREE.Mesh(createWheelGeometry(stage, side, index), wheelMaterial);
      mesh.name = `TankWheel_${side}_${index}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      node.add(mesh);
      root.add(node);
      wheelNodes.push(node);

      if (atLeast(stage, 'structural')) {
        const outwardX = x + (side === 'L' ? -0.33 : 0.33);
        addCylinder(buckets.bronze, 0.13, 0.08, [outwardX, 0.62, wheelZ[index]], bronze, {
          radialSegments: 10,
        });
        addCylinder(
          buckets.dark,
          0.058,
          0.1,
          [outwardX + (side === 'L' ? -0.045 : 0.045), 0.62, wheelZ[index]],
          iron,
          { radialSegments: 8 },
        );
      }
    }

    if (atLeast(stage, 'form')) {
      addBox(buckets.violet, [0.43, 0.22, 2.25], [x, 1.16, -0.02], violetShade, { radius: 0.055 });
      const outerX = x + Math.sign(x) * 0.255;
      for (const z of [-0.66, 0.62]) {
        addBox(
          buckets.violet,
          [0.11, 0.3, 0.46],
          [outerX, 1.17, z],
          stageColor(stage, PALETTE.violetLight, PALETTE.blockoutSecondary),
          { radius: 0.045 },
        );
        for (const yOffset of [-0.09, 0.09]) {
          addSphere(
            buckets.bronze,
            0.04,
            [outerX + Math.sign(x) * 0.065, 1.17 + yOffset, z],
            bronze,
            { detail: 1 },
          );
        }
      }
    }
  }
}

function addHull(buckets, stage) {
  const cream = stageColor(stage, PALETTE.cream);
  const creamLight = stageColor(stage, PALETTE.creamLight);
  const creamShade = stageColor(stage, PALETTE.creamShade);
  const violet = stageColor(stage, PALETTE.violet, PALETTE.blockoutSecondary);
  const violetLight = stageColor(stage, PALETTE.violetLight, PALETTE.blockoutSecondary);
  const bronze = stageColor(stage, PALETTE.bronze, PALETTE.blockoutSecondary);
  const iron = stageColor(stage, PALETTE.iron, PALETTE.blockoutSecondary);
  const leather = stageColor(stage, PALETTE.leather, PALETTE.blockoutSecondary);
  const leatherShade = stageColor(stage, PALETTE.leatherShade, PALETTE.blockoutSecondary);
  const textile = stageColor(stage, PALETTE.textile, PALETTE.blockoutSecondary);

  addGeometry(buckets.cream, makeFrustum(1.7, 1.42, 0.72, 2.12, 1.86), cream, {
    position: [0, 0.78, -0.02],
    variation: atLeast(stage, 'surface') ? 0.009 : 0,
  });
  addGeometry(buckets.cream, makeFrustum(1.42, 1.08, 0.42, 1.4, 1.03), creamLight, {
    position: [0, 1.27, 0.3],
    rotation: [-0.08, 0, 0],
  });
  addBox(buckets.violet, [1.32, 0.3, 0.58], [0, 0.63, 1.0], violet, {
    radius: 0.06,
    rotation: [-0.17, 0, 0],
  });

  if (atLeast(stage, 'structural')) {
    addBox(buckets.cream, [1.22, 0.2, 0.62], [0, 1.14, 0.84], creamShade, {
      radius: 0.045,
      rotation: [-0.22, 0, 0],
    });
    addGeometry(buckets.violet, makeShield(0.62, 0.6, 0.08), violetLight, {
      position: [0, 0.86, 1.315],
      rotation: [-0.08, 0, 0],
    });
    addBox(buckets.cream, [1.5, 0.24, 0.78], [0, 1.31, -0.72], creamShade, {
      radius: 0.045,
    });
    addBox(buckets.violet, [0.5, 0.36, 0.46], [-0.48, 1.48, -0.92], violet, {
      radius: 0.055,
    });
    addBox(buckets.leather, [0.72, 0.38, 0.52], [0.34, 1.53, -0.94], leather, {
      radius: 0.065,
      rotation: [0, -0.04, 0],
    });
    addCylinder(buckets.dark, 0.105, 0.48, [0.67, 1.65, -1.02], iron, {
      rotation: [0, 0, 0],
      radialSegments: 10,
      radiusTop: 0.085,
    });
    addCylinder(buckets.bronze, 0.135, 0.09, [0.67, 1.43, -1.02], bronze, {
      rotation: [0, 0, 0],
      radialSegments: 10,
    });
    addBox(buckets.dark, [0.23, 0.1, 0.18], [0.67, 1.91, -1.06], iron, {
      radius: 0.025,
      rotation: [0.12, 0, 0],
    });
  }

  addGeometry(buckets.cream, makeFrustum(1.28, 1.0, 0.58, 1.08, 0.88), cream, {
    position: [0, 1.55, -0.12],
  });
  addBox(buckets.violet, [1.38, 0.25, 0.78], [0, 1.37, 0.08], violet, {
    radius: 0.06,
  });

  if (atLeast(stage, 'structural')) {
    for (const x of [-0.56, 0.56]) {
      addBox(buckets.violet, [0.28, 0.42, 0.76], [x, 1.6, -0.08], violetLight, {
        radius: 0.06,
        rotation: [0, x > 0 ? -0.08 : 0.08, 0],
      });
      addBox(buckets.textile, [0.22, 0.38, 0.5], [x * 0.92, 1.8, -0.38], textile, {
        radius: 0.035,
      });
    }

    addBox(buckets.leather, [0.72, 0.14, 0.66], [0, 1.93, -0.35], leather, {
      radius: 0.065,
      rotation: [-0.08, 0, 0],
    });
    addBox(buckets.leather, [0.74, 0.38, 0.18], [0, 2.1, -0.64], leather, {
      radius: 0.07,
      rotation: [-0.14, 0, 0],
    });
    addBox(buckets.leather, [0.16, 0.22, 0.54], [-0.39, 2.0, -0.36], leatherShade, {
      radius: 0.045,
    });
    addBox(buckets.leather, [0.16, 0.22, 0.54], [0.39, 2.0, -0.36], leatherShade, {
      radius: 0.045,
    });
    addTube(
      buckets.bronze,
      [
        [-0.42, 1.97, -0.68],
        [-0.44, 2.25, -0.73],
        [0, 2.38, -0.76],
        [0.44, 2.25, -0.73],
        [0.42, 1.97, -0.68],
      ],
      0.055,
      bronze,
      24,
      8,
    );
    addTube(
      buckets.leather,
      [
        [-0.18, 2.33, -0.76],
        [0, 2.38, -0.76],
        [0.18, 2.33, -0.76],
      ],
      0.068,
      stageColor(stage, PALETTE.leatherLight, PALETTE.blockoutSecondary),
      8,
      7,
    );

    addBox(buckets.cream, [0.72, 0.62, 0.18], [0, 1.62, 0.48], creamLight, {
      radius: 0.07,
    });
    addCylinder(buckets.violet, 0.32, 0.25, [0, 1.66, 0.56], violet, {
      rotation: [Math.PI / 2, 0, 0],
      radialSegments: 14,
    });
  }

  addCylinder(buckets.dark, 0.27, 0.94, [0, 1.66, 1.0], iron, {
    rotation: [Math.PI / 2, 0, 0],
    radialSegments: atLeast(stage, 'form') ? 16 : 10,
  });
  addCylinder(buckets.dark, 0.21, 0.5, [0, 1.66, 1.69], iron, {
    rotation: [Math.PI / 2, 0, 0],
    radialSegments: atLeast(stage, 'form') ? 16 : 10,
  });
  addCylinder(buckets.dark, 0.34, 0.3, [0, 1.66, 2.05], iron, {
    rotation: [Math.PI / 2, 0, 0],
    radialSegments: atLeast(stage, 'form') ? 18 : 10,
  });
  addCylinder(buckets.dark, 0.235, 0.025, [0, 1.66, 2.21], PALETTE.ironDeep, {
    rotation: [Math.PI / 2, 0, 0],
    radialSegments: atLeast(stage, 'form') ? 18 : 10,
  });

  if (atLeast(stage, 'structural')) {
    const rivetPoints = [
      [-0.56, 0.79, 1.29],
      [0.56, 0.79, 1.29],
      [-0.5, 1.18, 0.96],
      [0.5, 1.18, 0.96],
      [-0.67, 1.4, 0.25],
      [0.67, 1.4, 0.25],
      [-0.62, 1.39, -0.65],
      [0.62, 1.39, -0.65],
    ];
    for (const point of rivetPoints) {
      addSphere(buckets.bronze, 0.055, point, bronze, { detail: 1 });
    }
  }
}

function createAnimations(hullPivot, wheelNodes) {
  const clips = [];
  const makeWheelTracks = (duration, rotations) => {
    const times = rotations.map((_, index) => (index * duration) / (rotations.length - 1));
    const tracks = [];
    for (const node of wheelNodes) {
      const values = [];
      for (const angle of rotations) {
        const quaternion = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          angle,
        );
        values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values));
    }
    return tracks;
  };

  const idleTimes = [0, 0.6, 1.2, 1.8, 2.4];
  clips.push(
    new THREE.AnimationClip('Idle', 2.4, [
      new THREE.VectorKeyframeTrack(
        `${hullPivot.name}.position`,
        idleTimes,
        [0, 0, 0, 0, 0.018, 0, 0, 0, 0, 0, -0.012, 0, 0, 0, 0],
      ),
    ]),
  );

  const cycleAngles = [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2, Math.PI * 2];
  const walkTimes = [0, 0.2, 0.4, 0.6, 0.8];
  clips.push(
    new THREE.AnimationClip('Walk', 0.8, [
      new THREE.VectorKeyframeTrack(
        `${hullPivot.name}.position`,
        walkTimes,
        [0, 0, 0, 0, 0.04, 0.008, 0, 0.008, 0, 0, 0.04, -0.008, 0, 0, 0],
      ),
      ...makeWheelTracks(0.8, cycleAngles),
    ]),
  );

  const runTimes = [0, 0.1375, 0.275, 0.4125, 0.55];
  clips.push(
    new THREE.AnimationClip('Run', 0.55, [
      new THREE.VectorKeyframeTrack(
        `${hullPivot.name}.position`,
        runTimes,
        [0, 0, 0, 0, 0.075, 0.025, 0, 0.012, 0, 0, 0.075, -0.025, 0, 0, 0],
      ),
      ...makeWheelTracks(0.55, cycleAngles),
    ]),
  );

  const deathTimes = [0, 0.28, 0.72, 1.2];
  const deathRotations = [];
  for (const [x, z] of [
    [0, 0],
    [-0.04, 0.025],
    [0.11, -0.07],
    [0.14, -0.08],
  ]) {
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, z));
    deathRotations.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }
  clips.push(
    new THREE.AnimationClip('Death', 1.2, [
      new THREE.VectorKeyframeTrack(
        `${hullPivot.name}.position`,
        deathTimes,
        [0, 0, 0, 0, 0.03, 0, 0, -0.1, 0.02, 0, -0.13, 0.02],
      ),
      new THREE.QuaternionKeyframeTrack(`${hullPivot.name}.quaternion`, deathTimes, deathRotations),
      ...makeWheelTracks(1.2, [0, Math.PI / 4, Math.PI / 2, Math.PI / 2]),
    ]),
  );
  return clips;
}

function addSemanticMesh(parent, bucket, material, name, shadows = true) {
  const geometry = mergeBucket(bucket, name);
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function createTankMount({ stage = 'final', sourceFingerprint = null } = {}) {
  stageIndex(stage);
  const root = new THREE.Group();
  root.name = 'Tank';
  root.userData = {
    assetId: 'tank',
    assetType: 'rideable-mount',
    sourceFingerprint,
    frontAxis: [0, 0, 1],
    nativeBounds: TANK_NATIVE_BOUNDS,
    clips: TANK_CLIP_NAMES,
  };

  const materialByName = new Map(
    TANK_MATERIAL_CONTRACT.map((contract) => [
      contract.name,
      createMaterial(contract, stage, PALETTE.blockoutPrimary),
    ]),
  );
  const wheelNodes = [];
  const runningBuckets = { dark: [], violet: [], bronze: [] };
  addRunningGear(root, runningBuckets, stage, wheelNodes, materialByName.get('TankVioletPaint'));

  const hullPivot = new THREE.Group();
  hullPivot.name = 'HullPivot';
  root.add(hullPivot);
  const hullBuckets = {
    cream: [],
    violet: [],
    dark: [],
    bronze: [],
    leather: [],
    textile: [],
  };
  addHull(hullBuckets, stage);

  addSemanticMesh(root, runningBuckets.dark, materialByName.get('TankDarkIron'), 'TankTracks');
  addSemanticMesh(root, runningBuckets.bronze, materialByName.get('TankBronze'), 'TankWheelHubs');
  addSemanticMesh(
    root,
    runningBuckets.violet,
    materialByName.get('TankVioletPaint'),
    'TankTrackArmor',
  );
  addSemanticMesh(
    hullPivot,
    hullBuckets.cream,
    materialByName.get('TankCreamPaint'),
    'TankCreamArmor',
  );
  addSemanticMesh(
    hullPivot,
    hullBuckets.violet,
    materialByName.get('TankVioletPaint'),
    'TankVioletArmor',
  );
  addSemanticMesh(hullPivot, hullBuckets.dark, materialByName.get('TankDarkIron'), 'TankCannon');
  addSemanticMesh(hullPivot, hullBuckets.bronze, materialByName.get('TankBronze'), 'TankHardware');
  addSemanticMesh(hullPivot, hullBuckets.leather, materialByName.get('TankLeather'), 'TankLeather');
  addSemanticMesh(hullPivot, hullBuckets.textile, materialByName.get('TankTextile'), 'TankTextile');

  const riderSocket = new THREE.Object3D();
  riderSocket.name = 'Socket_Rider';
  riderSocket.position.fromArray(TANK_SOCKET_DEFINITIONS[0].position);
  riderSocket.userData = {
    socketType: 'rider-seat',
    purpose: TANK_SOCKET_DEFINITIONS[0].purpose,
  };
  hullPivot.add(riderSocket);

  const exhaustSocket = new THREE.Object3D();
  exhaustSocket.name = 'Socket_Exhaust';
  exhaustSocket.position.fromArray(TANK_SOCKET_DEFINITIONS[1].position);
  exhaustSocket.userData = {
    socketType: 'vfx-emitter',
    purpose: TANK_SOCKET_DEFINITIONS[1].purpose,
  };
  hullPivot.add(exhaustSocket);

  root.traverse((object) => {
    if (object.isMesh) object.frustumCulled = true;
  });
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);
  return {
    root,
    animations: createAnimations(hullPivot, wheelNodes),
  };
}
