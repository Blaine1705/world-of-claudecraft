// The Last Keep's castle assembly, all render-only: KayKit Dungeon
// Remastered modules (kit 'kcas', imported by scripts/assets/specs/
// drakelands_castle.json) laid along the SAME wall lines, gate spans,
// bastion squares, and stair ramps the sim's castle plan authors
// (sim/castle_layout.ts). The wall the player climbs is castleLift terrain;
// this module dresses that exact geometry, so nothing floats and nothing
// blocks that you cannot see. The bailey buildings themselves ride the
// ordinary decorProps path (content -> render/props.ts); this module owns
// the fortifications: curtain walls, the gatehouse, the postern, the
// breach, bastions, the watch chamber, parapets, stairs, banners, torches.
import * as THREE from 'three';
import { CASTLE, CASTLE_GATES, CASTLE_RAMPS, CASTLE_TOWERS } from '../sim/castle_layout';
import { loadGltf } from './assets/loader';
import { registerPreload } from './assets/preload';
import { surfaceMat } from './gfx';
import { PROP_ASSET_DEFS } from './props';

// the castle set: every key resolves through the shared prop registry so
// the preload gate and the media manifest already cover it
const CASTLE_KEYS = [
  'kcasWall',
  'kcasWallHalf',
  'kcasWallCorner',
  'kcasWallGated',
  'kcasWallDoorway',
  'kcasWallBroken',
  'kcasWallWindow',
  'kcasWallPillar',
  'kcasBarrier',
  'kcasBarrierHalf',
  'kcasBarrierCorner',
  'kcasBannerRedA',
  'kcasBannerRedShield',
  'kcasBannerRedTriple',
  'kcasTorch',
  'kcasTorchMounted',
  'kcasRubbleLarge',
  'kcasRubbleHalf',
  'kcasRocks',
  'kcasFloorLarge',
  'kcasFloorWeeds',
  'kcasStairsWide',
] as const;
type CastleKey = (typeof CASTLE_KEYS)[number];

const castleScenes: Partial<Record<CastleKey, THREE.Group>> = {};
for (const key of CASTLE_KEYS) {
  registerPreload(
    loadGltf(PROP_ASSET_DEFS[key].url).then((gltf) => {
      castleScenes[key] = gltf.scene;
    }),
  );
}

export const castleFeaturesPreloadInternalsForTest = {
  propUrls: CASTLE_KEYS.map((k) => PROP_ASSET_DEFS[k].url),
};

/** world scale for the wall modules: the KayKit wall is 4 units long */
const S = CASTLE.module / 4; // 1.75
const WALL_H = 4 * S; // 7, matches CASTLE.wallH

interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number;
  /** uniform scale (defaults to the wall-module scale S) */
  s?: number;
}

// bake a loaded scene into parts, xz-centered with min-y at 0 (the
// ember_features idiom; scale is uniform so parts keep their proportions)
function extractParts(scene: THREE.Group): { geo: THREE.BufferGeometry; mat: THREE.Material }[] {
  scene.updateMatrixWorld(true);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    parts.push({ geo, mat: mesh.material as THREE.Material });
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    box.union(p.geo.boundingBox as THREE.Box3);
  }
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  for (const p of parts) {
    p.geo.translate(-cx, -box.min.y, -cz);
    p.geo.computeBoundingBox();
    p.geo.computeBoundingSphere();
  }
  return parts;
}

export interface CastleFeaturesView {
  group: THREE.Group;
  glowLights: THREE.PointLight[];
}

export function buildCastleFeatures(): CastleFeaturesView {
  const group = new THREE.Group();
  group.name = 'castle-features';
  const glowLights: THREE.PointLight[] = [];
  const padY = CASTLE.pad.h;
  const walkY = padY + CASTLE.wallH;

  const spots = new Map<CastleKey, Placement[]>();
  const put = (key: CastleKey, p: Placement): void => {
    let list = spots.get(key);
    if (!list) {
      list = [];
      spots.set(key, list);
    }
    list.push(p);
  };

  // ---- curtain walls: modules along each wall line, aligned so one module
  // exactly spans each gate; halves patch the leftover against bastions ----
  interface WallRun {
    /** 'x' walls run along x at fixed z; 'z' walls along z at fixed x */
    axis: 'x' | 'z';
    line: number;
    a0: number;
    a1: number;
    gate: { a0: number; a1: number } | null;
    /** which piece fills the gate module */
    gatePiece: CastleKey | null;
  }
  const hw = CASTLE.towerHw;
  const runs: WallRun[] = [
    {
      axis: 'z',
      line: CASTLE.wx0,
      a0: CASTLE.wz0 + hw,
      a1: CASTLE.wz1 - hw,
      gate: CASTLE_GATES.main,
      gatePiece: 'kcasWallGated',
    },
    {
      axis: 'z',
      line: CASTLE.wx1,
      a0: CASTLE.wz0 + hw,
      a1: CASTLE.wz1 - hw,
      gate: CASTLE_GATES.breach,
      gatePiece: null,
    },
    {
      axis: 'x',
      line: CASTLE.wz0,
      a0: CASTLE.wx0 + hw,
      a1: CASTLE.wx1 - hw,
      gate: CASTLE_GATES.postern,
      gatePiece: 'kcasWallDoorway',
    },
    {
      axis: 'x',
      line: CASTLE.wz1,
      a0: CASTLE.wx0 + hw,
      a1: CASTLE.wx1 - hw,
      gate: null,
      gatePiece: null,
    },
  ];
  const M = CASTLE.module;
  const place = (run: WallRun, along: number, key: CastleKey, s = S): void => {
    const x = run.axis === 'z' ? run.line : along;
    const z = run.axis === 'z' ? along : run.line;
    const rot = run.axis === 'z' ? Math.PI / 2 : 0; // module length runs local +x
    put(key, { x, y: padY, z, rot, s });
  };
  for (const run of runs) {
    // modules anchor at the bastion edge; the gates are grid-aligned in the
    // plan, so a gate is always exactly one module slot
    const count = Math.round((run.a1 - run.a0) / M);
    for (let k = 0; k < count; k++) {
      const c = run.a0 + M / 2 + k * M;
      const gate = run.gate;
      if (gate && c > gate.a0 - 1 && c < gate.a1 + 1) {
        if (run.gatePiece) place(run, c, run.gatePiece);
        else {
          // the breach: broken stubs lean into the gap from both sides
          place(run, gate.a0 - 1.6, 'kcasWallBroken');
          place(run, gate.a1 + 1.6, 'kcasWallBroken');
        }
        continue;
      }
      // vary the run: an occasional window or cracked module
      const v = Math.abs(Math.round(c * 7 + run.line)) % 11;
      place(run, c, v === 3 ? 'kcasWallWindow' : 'kcasWall');
    }
    // parapets: barriers along BOTH edges of the walk on this wall, parted
    // over gates (the walk itself is parted there too)
    const off = CASTLE.wallTh / 2 - 0.2;
    for (let c = run.a0 + 1; c <= run.a1 - 1; c += 2 * S) {
      if (run.gate && c > run.gate.a0 - 1 && c < run.gate.a1 + 1) continue;
      for (const side of [-1, 1] as const) {
        const x = run.axis === 'z' ? run.line + side * off : c;
        const z = run.axis === 'z' ? c : run.line + side * off;
        put('kcasBarrierHalf', { x, y: walkY, z, rot: run.axis === 'z' ? Math.PI / 2 : 0 });
      }
    }
  }

  // ---- bastions: a square shell of wall modules at each corner tower;
  // the SE watch gets a second storey (the open watch chamber) ----
  for (const t of CASTLE_TOWERS) {
    const faces = [
      { x: t.x, z: t.z - hw, rot: 0 },
      { x: t.x, z: t.z + hw, rot: 0 },
      { x: t.x - hw, z: t.z, rot: Math.PI / 2 },
      { x: t.x + hw, z: t.z, rot: Math.PI / 2 },
    ];
    for (const f of faces) put('kcasWall', { x: f.x, y: padY, z: f.z, rot: f.rot });
    if (t.tall) {
      // the watch chamber: window walls around the high platform, one face
      // left open where the watch flight arrives (the west face)
      put('kcasWallWindow', { x: t.x, y: walkY, z: t.z - hw, rot: 0 });
      put('kcasWallWindow', { x: t.x, y: walkY, z: t.z + hw, rot: 0 });
      put('kcasWallWindow', { x: t.x + hw, y: walkY, z: t.z, rot: Math.PI / 2 });
      // the chamber banner and beacon
      put('kcasBannerRedTriple', {
        x: t.x + hw - 0.4,
        y: CASTLE.pad.h + CASTLE.towerH + 0.1,
        z: t.z,
        rot: -Math.PI / 2,
        s: 1.4,
      });
      put('kcasTorch', { x: t.x, y: CASTLE.pad.h + CASTLE.towerH, z: t.z, rot: 0, s: 1.6 });
    } else {
      // bastion parapet ring + banner
      for (const f of faces) {
        put('kcasBarrier', { x: f.x, y: walkY, z: f.z, rot: f.rot });
      }
      put('kcasBannerRedShield', { x: t.x, y: walkY, z: t.z, rot: Math.PI / 4, s: 1.4 });
    }
  }

  // ---- the gatehouse dressing: pillars, banners, and torches at the main
  // gate; a mounted torch at the postern; rubble in the breach ----
  const gm = (CASTLE_GATES.main.a0 + CASTLE_GATES.main.a1) / 2;
  for (const side of [-1, 1] as const) {
    put('kcasWallPillar', {
      x: CASTLE.wx0,
      y: padY,
      z: gm + side * (M / 2 + 1.3),
      rot: Math.PI / 2,
    });
    put('kcasBannerRedA', {
      x: CASTLE.wx0 - 1.5,
      y: padY + 2.8,
      z: gm + side * (M / 2 + 1.5),
      rot: Math.PI / 2,
      s: 1.5,
    });
    put('kcasTorchMounted', {
      x: CASTLE.wx0 - 1.3,
      y: padY + 2.2,
      z: gm + side * 4.4,
      rot: Math.PI / 2,
      s: 1.4,
    });
  }
  const pm = (CASTLE_GATES.postern.a0 + CASTLE_GATES.postern.a1) / 2;
  put('kcasTorchMounted', {
    x: pm - 2.2,
    y: padY + 2.2,
    z: CASTLE.wz0 - 1.3,
    rot: Math.PI,
    s: 1.4,
  });
  const bm = (CASTLE_GATES.breach.a0 + CASTLE_GATES.breach.a1) / 2;
  put('kcasRubbleLarge', { x: CASTLE.wx1 + 0.6, y: padY, z: bm - 1.2, rot: 0.7, s: 1.1 });
  put('kcasRubbleHalf', { x: CASTLE.wx1 - 1.4, y: padY, z: bm + 1.8, rot: 2.3, s: 1.2 });
  put('kcasRocks', { x: CASTLE.wx1 + 2.6, y: padY, z: bm + 2.6, rot: 1.1, s: 1.3 });
  put('kcasRocks', { x: CASTLE.wx1 - 3.0, y: padY, z: bm - 2.8, rot: 4.2, s: 1.0 });

  // ---- the stair flights: solid sloped slabs (the walk geometry players
  // climb), with a stone tread piece at each foot ----
  const slabMat = surfaceMat({ color: 0x8a7568, roughness: 0.95 });
  for (const rmp of CASTLE_RAMPS) {
    const len = Math.abs(rmp.a1 - rmp.a0);
    const width = rmp.b1 - rmp.b0;
    const rise = rmp.h1 - rmp.h0;
    const geo = new THREE.BoxGeometry(
      rmp.axis === 'x' ? len : width,
      1.2,
      rmp.axis === 'x' ? width : len,
    );
    const mesh = new THREE.Mesh(geo, slabMat);
    const cx = rmp.axis === 'x' ? (rmp.a0 + rmp.a1) / 2 : (rmp.b0 + rmp.b1) / 2;
    const cz = rmp.axis === 'x' ? (rmp.b0 + rmp.b1) / 2 : (rmp.a0 + rmp.a1) / 2;
    mesh.position.set(cx, padY + (rmp.h0 + rmp.h1) / 2 - 0.55, cz);
    const tilt = Math.atan2(rise, rmp.a1 - rmp.a0);
    if (rmp.axis === 'x') mesh.rotation.z = -tilt;
    else mesh.rotation.x = tilt;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // a wide stone stair at the foot sells the tread read
    if (rmp.h0 === 0) {
      const fx = rmp.axis === 'x' ? rmp.a0 - 1.2 : (rmp.b0 + rmp.b1) / 2;
      const fz = rmp.axis === 'x' ? (rmp.b0 + rmp.b1) / 2 : rmp.a0 - 1.2;
      put('kcasStairsWide', {
        x: fx,
        y: padY,
        z: fz,
        rot: rmp.axis === 'x' ? -Math.PI / 2 : Math.PI,
        s: 0.62,
      });
    }
  }

  // ---- courtyard paving: a tiled plaza around the well and a road strip
  // in from the main gate ----
  for (let px = 399; px <= 417; px += M) {
    for (let pz = 2026; pz <= 2042; pz += M) {
      put('kcasFloorLarge', { x: px, y: padY + 0.02, z: pz, rot: 0 });
    }
  }
  for (let px = 377; px <= 396; px += M) {
    put('kcasFloorWeeds', { x: px, y: padY + 0.02, z: gm + 1.2, rot: (px * 13) % 3 });
  }
  // courtyard torches at the plaza corners
  for (const [tx, tz] of [
    [399, 2026],
    [417, 2026],
    [399, 2042],
    [417, 2042],
  ] as const) {
    put('kcasTorch', { x: tx, y: padY, z: tz, rot: 0, s: 1.6 });
    const light = new THREE.PointLight(0xff7a28, 4, 14, 2);
    light.position.set(tx, padY + 2.4, tz);
    light.userData.baseIntensity = 4;
    glowLights.push(light);
    group.add(light);
  }
  // gate torch light
  const gateLight = new THREE.PointLight(0xff7a28, 5, 18, 2);
  gateLight.position.set(CASTLE.wx0 - 1, padY + 3.2, gm);
  gateLight.userData.baseIntensity = 5;
  glowLights.push(gateLight);
  group.add(gateLight);

  // ---- instance every placed piece ----
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (const [key, list] of spots) {
    const scene = castleScenes[key];
    if (!scene || list.length === 0) continue;
    for (const part of extractParts(scene)) {
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((p, i) => {
        const s = p.s ?? S;
        q.setFromAxisAngle(up, p.rot);
        v.set(p.x, p.y, p.z);
        sc.set(s, s, s);
        mesh.setMatrixAt(i, m4.compose(v, q, sc));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }

  // Every piece sits at authored pad height: the pad is graded to exactly
  // that height by applyCastlePad, so no per-piece terrain probing is
  // needed and the assembly can never float.
  return { group, glowLights };
}
