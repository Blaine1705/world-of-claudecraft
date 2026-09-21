// A boss room's modular kit, drawn: instances of the Blender forge kit
// (docs/design/forge-room/) standing where hoard_room_kit_core.ts says, the floor
// marks under them, and the little that moves. Composed by hoard_valley.ts, which
// owns the room; this never touches its outline, its floor or its collision.
//
// Performance contract (the valley's own): the kit GLB is fetched once behind the
// deferred preload and baked into shared geometry; a visit only fills instance
// buffers, under the valley's group, so it compiles at the room's own gated
// attach and never mid-fight. One InstancedMesh per piece per material (the
// painted solid and the molten glow), two floor meshes, one spark cloud on the
// high tier: nothing is allocated per frame, and there are no lights. It is ALL
// cosmetic: a player reads nothing here, so tiers may shed it freely.

import * as THREE from 'three';
import { loadGltf } from './assets/loader';
import { registerDeferredPreload } from './assets/preload';
import {
  FORGE_KIT_PIECES,
  type ForgeKitPiece,
  type RoomKitFloorMark,
  type RoomKitPlan,
  type RoomKitTier,
} from './hoard_room_kit_core';
import { markSharedGeometry, markSharedMaterial } from './shared_resource';

export const FORGE_KIT_URL = '/models/props/hoard_forge_kit.glb';

interface BakedPiece {
  solid: THREE.BufferGeometry | null;
  molten: THREE.BufferGeometry | null;
}

const LOOK = Object.freeze({
  plate: 0x262223,
  plateAlt: 0x2e2927,
  channelEdge: 0x181516,
  /** Dim beside the hammer's fire: decoration never out-glows a telegraph. */
  channel: 0xb6501d,
  ring: 0x1c1919,
  spark: 0xffa64a,
  glow: 0xff6a1e,
});

const kit = new Map<ForgeKitPiece, BakedPiece>();
let solidMaterial: THREE.MeshBasicMaterial | null = null;
let moltenMaterial: THREE.MeshBasicMaterial | null = null;
let floorMaterial: THREE.MeshBasicMaterial | null = null;
const tint = new THREE.Color(1, 1, 1);

function materials(): {
  solid: THREE.MeshBasicMaterial;
  molten: THREE.MeshBasicMaterial;
  floor: THREE.MeshBasicMaterial;
} {
  // DoubleSide: a mirrored instance flips its winding, and one shared material
  // cannot know which instances are mirrored.
  solidMaterial ??= markSharedMaterial(
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide }),
  );
  moltenMaterial ??= markSharedMaterial(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  floorMaterial ??= markSharedMaterial(
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  solidMaterial.name = 'HoardRoomKitSolid';
  moltenMaterial.name = 'HoardRoomKitMolten';
  floorMaterial.name = 'HoardRoomKitFloor';
  return { solid: solidMaterial, molten: moltenMaterial, floor: floorMaterial };
}

/** Follow the valley's readable day/night grade; the molten parts keep their own light. */
export function updateHoardRoomKitTint(grade: readonly [number, number, number]): void {
  tint.setRGB(grade[0], grade[1], grade[2]);
  solidMaterial?.color.copy(tint);
  floorMaterial?.color.copy(tint);
}

/** Decode (the shipped kit is quantized) and bake one node's primitives, split by material. */
function bakeNode(node: THREE.Object3D): BakedPiece {
  // The node's own matrix is NOT a placement to undo: the shipped kit is quantized,
  // and that matrix is what restores its real size. The Blender nodes sit at the
  // origin, so the whole world matrix is baked in.
  node.updateWorldMatrix(true, true);
  const out: BakedPiece = { solid: null, molten: null };
  node.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = new THREE.BufferGeometry();
    for (const name of ['position', 'color']) {
      const attr = child.geometry.getAttribute(name);
      if (!attr) continue;
      // getComponent denormalizes a quantized stream; colour ships RGBA, keep RGB.
      const size = name === 'color' ? 3 : attr.itemSize;
      const values = new Float32Array(attr.count * size);
      for (let i = 0; i < attr.count; i++)
        for (let j = 0; j < size; j++) values[i * size + j] = attr.getComponent(i, j);
      geometry.setAttribute(name, new THREE.BufferAttribute(values, size));
    }
    if (child.geometry.index) geometry.setIndex(child.geometry.index.clone());
    geometry.applyMatrix4(child.matrixWorld);
    geometry.computeBoundingSphere();
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    const slot = /molten/i.test(material?.name ?? '') ? 'molten' : 'solid';
    out[slot] = markSharedGeometry(geometry);
  });
  return out;
}

function bakeKit(scene: THREE.Object3D): void {
  for (const piece of FORGE_KIT_PIECES) {
    const node = scene.getObjectByName(`Kit_${piece}`);
    if (node) kit.set(piece, bakeNode(node));
  }
}

if (typeof window !== 'undefined') {
  registerDeferredPreload(() =>
    loadGltf(FORGE_KIT_URL).then((gltf) => {
      if (kit.size === 0) bakeKit(gltf.scene);
    }),
  );
}

// ------------------------------------------------------------------ the floor
function pushQuad(
  positions: number[],
  colors: number[],
  mark: RoomKitFloorMark,
  y: number,
  color: THREE.Color,
): void {
  const cos = Math.cos(mark.yaw);
  const sin = Math.sin(mark.yaw);
  // Its length runs along its own +Z, turned by yaw like everything else here.
  const corner = (along: number, across: number): [number, number, number] => [
    mark.x + sin * along + cos * across,
    y,
    mark.z + cos * along - sin * across,
  ];
  const a = corner(-mark.halfLength, -mark.halfWidth);
  const b = corner(-mark.halfLength, mark.halfWidth);
  const c = corner(mark.halfLength, mark.halfWidth);
  const d = corner(mark.halfLength, -mark.halfWidth);
  for (const p of [a, b, c, a, c, d]) {
    positions.push(p[0], p[1], p[2]);
    colors.push(color.r, color.g, color.b);
  }
}

function pushRing(
  positions: number[],
  colors: number[],
  mark: RoomKitFloorMark,
  y: number,
  color: THREE.Color,
): void {
  const radius = mark.radius ?? 1;
  const segments = 48;
  for (let s = 0; s < segments; s++) {
    // A broken ring: every sixth segment is left out, like an old inlay.
    if (s % 6 === 5) continue;
    const a0 = (s / segments) * Math.PI * 2;
    const a1 = ((s + 1) / segments) * Math.PI * 2;
    const inner = radius - mark.halfWidth;
    const outer = radius + mark.halfWidth;
    const p = (angle: number, r: number): [number, number, number] => [
      mark.x + Math.sin(angle) * r,
      y,
      mark.z + Math.cos(angle) * r,
    ];
    for (const v of [
      p(a0, inner),
      p(a0, outer),
      p(a1, outer),
      p(a0, inner),
      p(a1, outer),
      p(a1, inner),
    ]) {
      positions.push(v[0], v[1], v[2]);
      colors.push(color.r, color.g, color.b);
    }
  }
}

function floorMesh(
  marks: readonly RoomKitFloorMark[],
  molten: boolean,
  material: THREE.Material,
): THREE.Mesh | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  marks.forEach((mark, index) => {
    if (mark.kind === 'glow' || (mark.kind === 'channel') !== molten) return;
    if (mark.kind === 'channel')
      pushQuad(positions, colors, mark, 0.05, color.setHex(LOOK.channel));
    else if (mark.kind === 'channel-edge')
      pushQuad(positions, colors, mark, 0.04, color.setHex(LOOK.channelEdge));
    else if (mark.kind === 'plate')
      pushQuad(positions, colors, mark, 0.03, color.setHex(index % 2 ? LOOK.plate : LOOK.plateAlt));
    else pushRing(positions, colors, mark, 0.035, color.setHex(LOOK.ring));
  });
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = molten ? 'HoardRoomKitChannels' : 'HoardRoomKitFloorMarks';
  mesh.receiveShadow = false;
  return mesh;
}

/** Firelight on the floor: a soft additive fan under the forge and the crucibles.
 *  A mark's halfWidth carries its strength. No light is ever added to the scene. */
function glowMesh(marks: readonly RoomKitFloorMark[]): THREE.Mesh | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const warm = new THREE.Color(LOOK.glow);
  const spokes = 20;
  for (const mark of marks) {
    if (mark.kind !== 'glow') continue;
    const radius = mark.radius ?? 1;
    const strength = mark.halfWidth;
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * Math.PI * 2;
      const a1 = ((i + 1) / spokes) * Math.PI * 2;
      positions.push(mark.x, 0.06, mark.z);
      positions.push(mark.x + Math.sin(a0) * radius, 0.06, mark.z + Math.cos(a0) * radius);
      positions.push(mark.x + Math.sin(a1) * radius, 0.06, mark.z + Math.cos(a1) * radius);
      // Additive: the colour IS the light, bright at the hearth and nothing at the rim.
      colors.push(warm.r * strength, warm.g * strength, warm.b * strength, 0, 0, 0, 0, 0, 0);
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: true,
    }),
  );
  mesh.name = 'HoardRoomKitFirelight';
  mesh.renderOrder = 2;
  return mesh;
}

// ------------------------------------------------------------------- the view
interface Swaying {
  meshes: THREE.InstancedMesh[];
  index: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  phase: number;
}

const SPARKS = 56;

export interface HoardRoomKitView {
  readonly group: THREE.Group;
  /** Per frame: the chains' sway, the molten pulse, the sparks. */
  update(timeSec: number): void;
  dispose(): void;
}

export function buildHoardRoomKit(
  plan: RoomKitPlan,
  tier: RoomKitTier,
  shadows: boolean,
): HoardRoomKitView {
  const group = new THREE.Group();
  group.name = 'HoardRoomKit';
  const mats = materials();
  const owned: THREE.BufferGeometry[] = [];
  const swaying: Swaying[] = [];
  const transform = new THREE.Object3D();

  for (const molten of [false, true]) {
    const mesh = floorMesh(plan.floor, molten, molten ? mats.molten : mats.floor);
    if (!mesh) continue;
    owned.push(mesh.geometry);
    group.add(mesh);
  }

  const firelight = glowMesh(plan.floor);
  if (firelight) {
    owned.push(firelight.geometry);
    group.add(firelight);
  }

  const emitters: { x: number; y: number; z: number; spread: number }[] = [];
  for (const piece of FORGE_KIT_PIECES) {
    const baked = kit.get(piece);
    const placements = plan.placements.filter((placement) => placement.piece === piece);
    if (!baked || placements.length === 0) continue;
    const meshes: THREE.InstancedMesh[] = [];
    for (const [geometry, material] of [
      [baked.solid, mats.solid],
      [baked.molten, mats.molten],
    ] as const) {
      if (!geometry) continue;
      const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
      mesh.name = `HoardRoomKit:${piece}`;
      mesh.castShadow = shadows && material === mats.solid;
      mesh.receiveShadow = false;
      meshes.push(mesh);
      group.add(mesh);
    }
    placements.forEach((placement, index) => {
      transform.position.set(placement.x, placement.y, placement.z);
      transform.rotation.set(0, placement.yaw, 0);
      transform.scale.set(
        placement.mirror ? -placement.scale : placement.scale,
        placement.scale,
        placement.scale,
      );
      transform.updateMatrix();
      for (const mesh of meshes) mesh.setMatrixAt(index, transform.matrix);
      if (piece === 'ChainHook' && tier !== 'low') {
        swaying.push({
          meshes,
          index,
          x: placement.x,
          y: placement.y,
          z: placement.z,
          yaw: placement.yaw,
          scale: placement.scale,
          phase: (placement.x * 0.37 + placement.z * 0.61) % (Math.PI * 2),
        });
      }
      if (piece === 'GreatForge')
        emitters.push({ x: placement.x, y: 5, z: placement.z - 3.2, spread: 4 });
      if (piece === 'Crucible')
        emitters.push({ x: placement.x, y: 3.3, z: placement.z, spread: 1.1 });
    });
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  // Sparks off the forge and the crucibles: high tier only, one small cloud.
  let sparks:
    | { points: THREE.Points; position: THREE.BufferAttribute; seeds: Float32Array }
    | undefined;
  if (tier === 'high' && emitters.length > 0) {
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3);
    position.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position);
    owned.push(geometry);
    const material = new THREE.PointsMaterial({
      color: LOOK.spark,
      size: 0.22,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      fog: true,
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'HoardRoomKitSparks';
    points.frustumCulled = false;
    const seeds = new Float32Array(SPARKS * 4);
    for (let i = 0; i < SPARKS; i++) {
      // Most of them belong to the forge; the rest are shared by the crucibles.
      const emitter = i < SPARKS * 0.55 ? 0 : 1 + (i % Math.max(1, emitters.length - 1));
      seeds[i * 4] = Math.min(emitters.length - 1, emitter);
      seeds[i * 4 + 1] = ((i * 0.6180339887) % 1) * 6.0 + 2.5; // life, seconds
      seeds[i * 4 + 2] = (i * 0.7548776662) % 1; // phase
      seeds[i * 4 + 3] = ((i * 0.5698402909) % 1) * Math.PI * 2; // bearing
    }
    sparks = { points, position, seeds };
    group.add(points);
  }

  let disposed = false;
  return {
    group,
    update(timeSec: number): void {
      if (disposed) return;
      // The molten parts breathe together, slowly: a forge, not an alarm.
      mats.molten.color.setScalar(
        0.92 + 0.1 * Math.sin(timeSec * 1.3) + 0.04 * Math.sin(timeSec * 5.1),
      );
      for (let i = 0; i < swaying.length; i++) {
        const chain = swaying[i];
        transform.position.set(chain.x, chain.y, chain.z);
        transform.rotation.set(
          0.055 * Math.sin(timeSec * 0.9 + chain.phase),
          chain.yaw,
          0.04 * Math.sin(timeSec * 0.7 + chain.phase * 1.7),
          'YXZ',
        );
        transform.scale.setScalar(chain.scale);
        transform.updateMatrix();
        for (const mesh of chain.meshes) {
          mesh.setMatrixAt(chain.index, transform.matrix);
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
      if (sparks) {
        for (let i = 0; i < SPARKS; i++) {
          const emitter = emitters[sparks.seeds[i * 4]];
          const life = sparks.seeds[i * 4 + 1];
          const t = (timeSec / life + sparks.seeds[i * 4 + 2]) % 1;
          const bearing = sparks.seeds[i * 4 + 3];
          const drift = emitter.spread * (0.35 + 0.65 * t);
          sparks.position.setXYZ(
            i,
            emitter.x + Math.sin(bearing + t * 1.7) * drift,
            emitter.y + t * t * 9 + t * 2,
            emitter.z + Math.cos(bearing + t * 1.7) * drift * 0.6,
          );
        }
        sparks.position.needsUpdate = true;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const geometry of owned) geometry.dispose();
      if (sparks) (sparks.points.material as THREE.Material).dispose();
      if (firelight) (firelight.material as THREE.Material).dispose();
    },
  };
}

export const hoardRoomKitInternalsForTest = {
  seedScene(scene: THREE.Object3D): void {
    kit.clear();
    bakeKit(scene);
  },
  clear(): void {
    kit.clear();
  },
  pieces(): ForgeKitPiece[] {
    return [...kit.keys()];
  },
};
