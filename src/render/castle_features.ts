// The Last Keep's castle assembly, all render-only: KayKit Dungeon
// Remastered modules (kit 'kcas') plus red Medieval Hexagon turrets, laid
// along the SAME wall lines, gate spans, tower squares, terrace edges, and
// stair ramps the sim's castle plan authors (sim/castle_layout.ts). The
// wall the player climbs is castleLift terrain; this module dresses that
// exact geometry, and every walkable lift surface gets a VISIBLE floor cap
// (walk slabs, bastion caps, the watch chamber floor), so the player never
// stands on air. The bailey buildings ride the ordinary decorProps path
// (content -> render/props.ts); this module owns the fortifications: the
// curtain, gatehouse, postern, breach, towers, the ward's retaining edge
// and steps, the keep's turret crown, parapets, stairs, banners, torches.
import * as THREE from 'three';
import {
  CASTLE,
  CASTLE_GATES,
  CASTLE_RAMPS,
  CASTLE_TOWERS,
  WARD_STEP_RUN,
  WARD_STEPS,
} from '../sim/castle_layout';
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
  'kcasFoundation',
  'hexrTowerA',
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

interface Placement {
  x: number;
  y: number;
  z: number;
  rot: number;
  /** uniform scale (defaults to the wall-module scale S) */
  s?: number;
}

// Meshopt-quantized attributes are normalized ints; bake them to plain
// floats BEFORE applying a world matrix, or setXYZ clamps every vertex
// back into the normalized [-1, 1] domain and the wall modules collapse
// into 2-unit blobs (the "invisible walls" report; same guard as
// lastkeep_dressing.ts).
function attributeToFloat(geo: THREE.BufferGeometry, name: string): void {
  const attr = geo.getAttribute(name);
  if (!attr || (attr.array instanceof Float32Array && !attr.normalized)) return;
  const out = new Float32Array(attr.count * attr.itemSize);
  for (let i = 0; i < attr.count; i++) {
    for (let c = 0; c < attr.itemSize; c++) out[i * attr.itemSize + c] = attr.getComponent(i, c);
  }
  geo.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize));
}

// bake a loaded scene into parts, xz-centered with min-y at 0
function extractParts(scene: THREE.Group): { geo: THREE.BufferGeometry; mat: THREE.Material }[] {
  scene.updateMatrixWorld(true);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone();
    attributeToFloat(geo, 'position');
    attributeToFloat(geo, 'normal');
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
  const wardY = CASTLE.ward.h;
  const walkY = CASTLE.walkAbs;

  const spots = new Map<CastleKey, Placement[]>();
  const put = (key: CastleKey, p: Placement): void => {
    let list = spots.get(key);
    if (!list) {
      list = [];
      spots.set(key, list);
    }
    list.push(p);
  };

  // stone slab helper: the visible floor caps and stair masses
  const slabMat = surfaceMat({ color: 0x8a7568, roughness: 0.95 });
  const capMat = surfaceMat({ color: 0x97826f, roughness: 0.9 });
  const slab = (
    cx: number,
    cz: number,
    sx: number,
    sz: number,
    topY: number,
    thick = 0.36,
    mat = capMat,
  ): void => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, thick, sz), mat);
    mesh.position.set(cx, topY - thick / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  // ---- curtain walls: modules along each wall line, grid-anchored so
  // every gate is exactly one module slot; walls stand on the bailey ----
  interface WallRun {
    axis: 'x' | 'z';
    line: number;
    a0: number;
    a1: number;
    gate: { a0: number; a1: number } | null;
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
    const rot = run.axis === 'z' ? Math.PI / 2 : 0;
    put(key, { x, y: padY, z, rot, s });
  };
  for (const run of runs) {
    const count = Math.round((run.a1 - run.a0) / M);
    for (let k = 0; k < count; k++) {
      const c = run.a0 + M / 2 + k * M;
      const gate = run.gate;
      if (gate && c > gate.a0 - 1 && c < gate.a1 + 1) {
        if (run.gatePiece) place(run, c, run.gatePiece);
        else {
          place(run, gate.a0 - 1.6, 'kcasWallBroken');
          place(run, gate.a1 + 1.6, 'kcasWallBroken');
        }
        continue;
      }
      const v = Math.abs(Math.round(c * 7 + run.line)) % 11;
      place(run, c, v === 3 ? 'kcasWallWindow' : 'kcasWall');
    }
    // parapets along BOTH walk edges, parted over gates
    const off = CASTLE.wallTh / 2 - 0.2;
    for (let c = run.a0 + 1; c <= run.a1 - 1; c += 2 * S) {
      if (run.gate && c > run.gate.a0 - 1 && c < run.gate.a1 + 1) continue;
      for (const side of [-1, 1] as const) {
        const x = run.axis === 'z' ? run.line + side * off : c;
        const z = run.axis === 'z' ? c : run.line + side * off;
        put('kcasBarrierHalf', { x, y: walkY, z, rot: run.axis === 'z' ? Math.PI / 2 : 0 });
      }
    }
    // the VISIBLE walk floor: cap slabs over the whole strip, parted at
    // gates and tucked under the tower caps at the ends
    const segs: [number, number][] = [];
    if (run.gate) {
      segs.push([run.a0, run.gate.a0], [run.gate.a1, run.a1]);
    } else {
      segs.push([run.a0, run.a1]);
    }
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 1) continue;
      const mid = (s0 + s1) / 2;
      const len = s1 - s0;
      if (run.axis === 'z') slab(run.line, mid, CASTLE.wallTh + 0.2, len, walkY - 0.02);
      else slab(mid, run.line, len, CASTLE.wallTh + 0.2, walkY - 0.02);
    }
  }

  // ---- towers: a shell of wall modules at each bastion, a visible cap on
  // every top, a second windowed storey on the SE watch ----
  for (const t of CASTLE_TOWERS) {
    const thw = t.hw;
    const faces = [
      { x: t.x, z: t.z - thw, rot: 0 },
      { x: t.x, z: t.z + thw, rot: 0 },
      { x: t.x - thw, z: t.z, rot: Math.PI / 2 },
      { x: t.x + thw, z: t.z, rot: Math.PI / 2 },
    ];
    const shellScale = (thw * 2) / 4; // face length matches the square
    for (const f of faces) put('kcasWall', { x: f.x, y: padY, z: f.z, rot: f.rot, s: shellScale });
    slab(t.x, t.z, thw * 2 + 0.5, thw * 2 + 0.5, t.hAbs - 0.02);
    if (t.tall) {
      // the watch chamber: a windowed second storey on all four faces,
      // stacked flush on the shell so the shaft reads solid at range (the
      // flight arrives at the tower TOP, above these piece tops, so the
      // west face can close too; features are render-only, terrain moves)
      const storeyY = padY + 4 * shellScale - 0.1;
      put('kcasWallWindow', { x: t.x, y: storeyY, z: t.z - thw, rot: 0, s: shellScale });
      put('kcasWallWindow', { x: t.x, y: storeyY, z: t.z + thw, rot: 0, s: shellScale });
      put('kcasWallWindow', { x: t.x + thw, y: storeyY, z: t.z, rot: Math.PI / 2, s: shellScale });
      put('kcasWallWindow', { x: t.x - thw, y: storeyY, z: t.z, rot: Math.PI / 2, s: shellScale });
      slab(t.x, t.z, thw * 2 + 0.5, thw * 2 + 0.5, CASTLE.watchAbs - 0.02);
      put('kcasBannerRedTriple', {
        x: t.x + thw - 0.4,
        y: CASTLE.watchAbs + 0.1,
        z: t.z,
        rot: -Math.PI / 2,
        s: 1.4,
      });
      put('kcasTorch', { x: t.x, y: CASTLE.watchAbs, z: t.z, rot: 0, s: 1.6 });
    } else {
      for (const f of faces) {
        put('kcasBarrier', { x: f.x, y: t.hAbs, z: f.z, rot: f.rot, s: shellScale });
      }
      put('kcasBannerRedShield', { x: t.x, y: t.hAbs, z: t.z, rot: Math.PI / 4, s: 1.4 });
    }
  }

  // ---- the ward: a foundation-block retaining edge with two stone stair
  // cuts, so the keep terrace reads as built masonry, not a dirt shelf ----
  {
    const w = CASTLE.ward;
    const rise = w.h - padY;
    const fScale = rise / 2; // foundation piece is 2 units tall
    const edges: { x0: number; z0: number; x1: number; z1: number }[] = [
      { x0: w.x0, z0: w.z0, x1: w.x0, z1: w.z1 }, // west edge
      { x0: w.x0, z0: w.z1, x1: w.x1, z1: w.z1 }, // south edge (stair cuts)
      { x0: w.x1, z0: w.z0, x1: w.x1, z1: w.z1 }, // east edge
    ];
    const stepGap = (v: number): boolean =>
      WARD_STEPS.some((cut) => v > cut.x0 - 1.4 && v < cut.x1 + 1.4);
    for (const e of edges) {
      const len = Math.hypot(e.x1 - e.x0, e.z1 - e.z0);
      const n = Math.ceil(len / (2.2 * fScale));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = e.x0 + (e.x1 - e.x0) * t;
        const z = e.z0 + (e.z1 - e.z0) * t;
        if (e.z0 === e.z1 && stepGap(x)) continue; // part at the stair cuts
        put('kcasFoundation', {
          x,
          y: padY,
          z,
          rot: e.x0 === e.x1 ? Math.PI / 2 : 0,
          s: fScale,
        });
      }
    }
    // the stair cuts: wide stone steps down from the terrace
    for (const cut of WARD_STEPS) {
      const cx = (cut.x0 + cut.x1) / 2;
      put('kcasStairsWide', {
        x: cx,
        y: padY,
        z: w.z1 + WARD_STEP_RUN / 2,
        rot: Math.PI,
        s: 0.62,
      });
      // sloped mass under the walk surface so the cut reads solid
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(cut.x1 - cut.x0, 1.0, WARD_STEP_RUN + 0.8),
        slabMat,
      );
      mesh.position.set(cx, padY + rise / 2 - 0.2, w.z1 + WARD_STEP_RUN / 2);
      mesh.rotation.x = Math.atan2(rise, WARD_STEP_RUN);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // terrace floor trim: large tiles along the ward's south rim
    for (let x = w.x0 + 3.5; x < w.x1 - 1; x += M) {
      put('kcasFloorLarge', { x, y: w.h + 0.02, z: w.z1 - 3, rot: 0 });
    }
  }

  // ---- the keep's turret crown: red hex tower drums rising from the keep
  // mass (the multi-storey silhouette; the keep model itself is placed by
  // the decorProps path) ----
  {
    const kx = 421;
    const kz = 2003;
    put('hexrTowerA', { x: kx - 5.5, y: wardY + 21, z: kz - 4.5, rot: 0.4, s: 5 });
    put('hexrTowerA', { x: kx + 5.5, y: wardY + 24, z: kz + 4.5, rot: 2.2, s: 5 });
    put('hexrTowerA', { x: kx, y: wardY + 29, z: kz, rot: 1.1, s: 5.5 });
    put('kcasBannerRedTriple', { x: kx, y: wardY + 41, z: kz + 1.2, rot: Math.PI, s: 1.6 });
  }

  // ---- gate dressing ----
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

  // ---- the stair flights: solid sloped masses with a tread at the foot ----
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
    mesh.position.set(cx, (rmp.h0 + rmp.h1) / 2 - 0.55, cz);
    const tilt = Math.atan2(rise, rmp.a1 - rmp.a0);
    if (rmp.axis === 'x') mesh.rotation.z = -tilt;
    else mesh.rotation.x = tilt;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (rmp.h0 <= padY + 0.1) {
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

  // ---- the bailey court: a tiled plaza south of the ward steps, torches
  // at its corners, weeds tiles down the gate road ----
  for (let px = 398; px <= 429; px += M) {
    for (let pz = 2024; pz <= 2040; pz += M) {
      put('kcasFloorLarge', { x: px, y: padY + 0.02, z: pz, rot: 0 });
    }
  }
  for (let px = 366; px <= 392; px += M) {
    put('kcasFloorWeeds', { x: px, y: padY + 0.02, z: gm + 1.2, rot: (px * 13) % 3 });
  }
  for (const [tx, tz] of [
    [398, 2024],
    [429, 2024],
    [398, 2040],
    [429, 2040],
  ] as const) {
    put('kcasTorch', { x: tx, y: padY, z: tz, rot: 0, s: 1.6 });
    const light = new THREE.PointLight(0xff7a28, 4, 14, 2);
    light.position.set(tx, padY + 2.4, tz);
    light.userData.baseIntensity = 4;
    glowLights.push(light);
    group.add(light);
  }
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

  return { group, glowLights };
}
