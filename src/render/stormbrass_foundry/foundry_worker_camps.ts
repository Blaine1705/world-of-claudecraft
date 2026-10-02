// The chained workers' camp props (sim/content/stormbrass_foundry_workers.ts
// foundryWorkerCampProps, placed on the authored field): procedural stand-ins
// so the camps draw now, keyed on the SAME prop kinds the Blender kit will
// carry (sf_ore_seam, sf_scrap_heap, sf_chain_post, sf_scrap_cart). When the
// kit ships those pieces this module retires (the dressing draws them like
// every other kit prop); nothing else reads it.
//
// Static geometry merged per material into the foundry's shared materials
// (foundry_mesh.ts): no new material, no light, no per-frame work. Built with
// the interior, so it links behind the interior's own compile gate.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STORMBRASS_FOUNDRY_FIELD } from '../../sim/content/stormbrass_foundry_layout';
import type { FieldProp } from '../../sim/instances/authored_field/types';
import { type FoundryMat, PartBin } from './foundry_mesh';

type Ground = (x: number, z: number) => number;

/** Offset (lx, lz) turned by the prop's yaw, added to its spot. */
function at(p: FieldProp, lx: number, lz: number): [number, number] {
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return [p.x + lx * c + lz * s, p.z - lx * s + lz * c];
}

/** A faceted lump (a polyhedron is unindexed; the bin merges indexed piles). */
function lump(radius: number): THREE.BufferGeometry {
  const raw = new THREE.DodecahedronGeometry(radius, 0);
  const indexed = mergeVertices(raw);
  raw.dispose();
  return indexed;
}

/** A rough boulder: a low-poly rock, squashed and turned. */
function rock(
  bin: PartBin,
  mat: FoundryMat,
  x: number,
  y: number,
  z: number,
  r: number,
  squash: number,
  turn: number,
): void {
  bin.add(mat, lump(r), x, y, z, turn, [1, squash, 0.8], turn * 0.4);
}

/** The ore seam: a blasted rock face twice a worker's height, its storm-blue
 *  ore veins showing, shored with timber, loose ore at its foot. Long side
 *  along local x; the miners stand on its +z side. */
function oreSeam(bin: PartBin, p: FieldProp, g: number): void {
  const hw = p.hw ?? 3.2;
  const rocks: [number, number, number, number, number, FoundryMat][] = [
    // lx, lz, y, radius, squash, material
    [-hw * 0.72, -0.1, 1.5, 1.9, 1.0, 'stone'],
    [-hw * 0.2, -0.3, 2.1, 2.3, 1.15, 'black'],
    [hw * 0.38, -0.2, 1.8, 2.1, 1.05, 'stone'],
    [hw * 0.82, 0, 1.2, 1.5, 0.95, 'stone'],
    [-hw * 0.48, -0.35, 3.9, 1.5, 0.85, 'stone'],
    [hw * 0.12, -0.4, 4.4, 1.3, 0.8, 'black'],
    [hw * 0.55, -0.3, 3.4, 1.1, 0.8, 'stone'],
    // The shoulders that bed it into the floor: no clean edge to the pile.
    [-hw * 1.05, 0.5, 0.5, 1.1, 0.7, 'stone'],
    [hw * 1.1, 0.6, 0.45, 1.0, 0.65, 'stone'],
    [0, -1.2, 1.2, 2.2, 0.9, 'stone'],
  ];
  rocks.forEach(([lx, lz, y, r, squash, mat], i) => {
    const [x, z] = at(p, lx, lz);
    rock(bin, mat, x, g + y, z, r, squash, p.rot + i * 1.3);
  });
  // The ore: veins of storm glass through the face, and brass-bright nuggets.
  const veins: [number, number, number, number, number][] = [
    // lx, lz, y, half length, tilt
    [-hw * 0.6, 1.32, 1.6, 0.7, 0.5],
    [-hw * 0.12, 1.5, 2.6, 0.85, -0.4],
    [hw * 0.42, 1.42, 1.5, 0.75, 0.3],
    [hw * 0.2, 0.75, 4.2, 0.6, 0.8],
    [-hw * 0.45, 0.85, 3.7, 0.55, -0.7],
    [hw * 0.75, 1.18, 1.3, 0.45, -0.2],
  ];
  for (const [lx, lz, y, half, tilt] of veins) {
    const [x, z] = at(p, lx, lz);
    bin.box('glass', x, g + y, z, half, 0.09, 0.12, p.rot, 0, tilt);
  }
  for (const [lx, lz, y, r] of [
    [-hw * 0.78, 1.25, 1.1, 0.3],
    [hw * 0.62, 1.38, 2.2, 0.34],
    [-hw * 0.28, 1.5, 3.3, 0.28],
    [hw * 0.05, 1.62, 1.4, 0.26],
  ] as const) {
    const [x, z] = at(p, lx, lz);
    bin.add('brass', lump(r), x, g + y, z, lx);
  }
  // Timber shoring and the loose ore the picks have knocked down.
  for (const lx of [-hw * 0.98, hw * 0.98]) {
    const [x0, z0] = at(p, lx, 2.3);
    const [x1, z1] = at(p, lx * 0.8, 0.1);
    bin.beam('wood', [x0, g, z0], [x1, g + 4.6, z1], 0.2);
    // A raking strut and an iron shoe at the foot.
    const [sx, sz] = at(p, lx * 0.55, 2.6);
    bin.beam('wood', [sx, g, sz], [x1, g + 3.1, z1], 0.13);
    bin.box('iron', x0, g + 0.12, z0, 0.3, 0.12, 0.3, p.rot);
  }
  const [bx0, bz0] = at(p, -hw * 0.95, 0.05);
  const [bx1, bz1] = at(p, hw * 0.95, 0.05);
  bin.beam('wood', [bx0, g + 4.55, bz0], [bx1, g + 4.75, bz1], 0.22);
  for (const lx of [-hw * 0.78, hw * 0.78]) {
    const [x, z] = at(p, lx, 0.1);
    bin.box('iron', x, g + 4.62, z, 0.3, 0.3, 0.3, p.rot);
  }
  for (const [lx, lz, r] of [
    [-1.4, 1.75, 0.34],
    [0.4, 1.9, 0.26],
    [1.9, 1.7, 0.38],
    [-2.6, 1.8, 0.24],
  ] as const) {
    const [x, z] = at(p, lx, lz);
    rock(bin, 'black', x, g + r * 0.6, z, r, 0.8, lx * 2);
  }
}

/** The scrap heap: bent brass plate, cogs, pipe and iron offcuts in a mound
 *  as tall as the workers who feed it. */
function scrapHeap(bin: PartBin, p: FieldProp, g: number): void {
  const r = p.r ?? 1.8;
  // The mound under it.
  bin.add('iron', new THREE.ConeGeometry(r * 0.98, 2.0, 9), p.x, g + 1.0, p.z, 0.4);
  bin.add('black', new THREE.ConeGeometry(r * 0.7, 2.6, 7), p.x + 0.2, g + 1.3, p.z - 0.1, 1.1);
  // Plates leaning every way.
  const plates: [number, number, number, number, number, number][] = [
    // angle, dist, y, half size, tilt, roll
    [0.3, 0.6, 1.0, 0.8, 0.9, 0.2],
    [1.7, 0.72, 0.8, 0.72, -0.7, 0.5],
    [2.9, 0.55, 1.3, 0.66, 0.6, -0.4],
    [4.2, 0.78, 0.7, 0.78, -1.0, 0.1],
    [5.3, 0.5, 1.7, 0.6, 0.4, 0.7],
    [0.9, 0.2, 2.3, 0.55, 0.2, -0.3],
    [3.4, 0.25, 2.0, 0.5, -0.5, 0.4],
  ];
  plates.forEach(([a, d, y, half, tilt, roll], i) => {
    const x = p.x + Math.sin(a) * d * r;
    const z = p.z + Math.cos(a) * d * r;
    const mat: FoundryMat = i === 3 ? 'verdigris' : i % 2 === 0 ? 'iron' : 'brass';
    bin.box(mat, x, g + y, z, half, 0.05, half * 0.7, a, tilt, roll);
  });
  // Cogs and a pipe or two sticking out.
  for (const [a, d, y, radius] of [
    [1.1, 0.85, 0.5, 0.55],
    [3.6, 0.55, 1.6, 0.45],
    [5.0, 0.9, 0.42, 0.4],
    [2.2, 0.3, 2.5, 0.36],
  ] as const) {
    const x = p.x + Math.sin(a) * d * r;
    const z = p.z + Math.cos(a) * d * r;
    const cog = new THREE.TorusGeometry(radius, 0.11, 6, 12);
    bin.add('brass', cog, x, g + y, z, a, [1, 1, 1], 1.1);
    const hub = new THREE.CylinderGeometry(0.13, 0.13, 0.24, 8);
    bin.add('iron', hub, x, g + y, z, a, [1, 1, 1], 0.47);
  }
  bin.beam(
    'brass',
    [p.x - r * 0.5, g + 0.4, p.z + r * 0.2],
    [p.x + r * 0.35, g + 2.9, p.z - r * 0.3],
    0.11,
  );
  bin.beam(
    'iron',
    [p.x + r * 0.6, g + 0.3, p.z + r * 0.5],
    [p.x - r * 0.15, g + 2.4, p.z + r * 0.1],
    0.09,
  );
}

/** The chain post: a tall iron stake in a stone footing, the ring the chains
 *  run to near its foot, hazard bands and a brass cap over a worker's head. */
function chainPost(bin: PartBin, p: FieldProp, g: number): void {
  bin.cyl('stone', p.x, g, g + 0.3, p.z, 0.6, 0.78, 8);
  bin.cyl('iron', p.x, g + 0.3, g + 2.9, p.z, 0.2, 0.27, 8);
  bin.cyl('hazard', p.x, g + 1.5, g + 1.75, p.z, 0.235, 0.24, 8);
  bin.cyl('hazard', p.x, g + 2.3, g + 2.5, p.z, 0.215, 0.22, 8);
  bin.cyl('brass', p.x, g + 2.9, g + 3.15, p.z, 0.32, 0.24, 8);
  bin.add('brass', new THREE.SphereGeometry(0.2, 8, 6), p.x, g + 3.3, p.z);
  bin.ring('brass', p.x, g + 0.55, p.z, 0.36, 0.06);
  // The staple the ring hangs from.
  bin.box('iron', p.x, g + 0.64, p.z, 0.32, 0.06, 0.06);
  bin.box('iron', p.x, g + 0.64, p.z, 0.06, 0.06, 0.32);
}

/** The scrap cart: a copper tub on four wheels, loaded with scrap over its
 *  rim. Long side along local z. */
function scrapCart(bin: PartBin, p: FieldProp, g: number): void {
  const hw = p.hw ?? 1.3;
  const hd = p.hd ?? 2;
  bin.box('iron', p.x, g + 0.85, p.z, hw, 0.12, hd, p.rot);
  bin.box('wood', p.x, g + 1.0, p.z, hw * 0.94, 0.05, hd * 0.94, p.rot);
  // The tub's four walls, brass bound along the top.
  for (const side of [-1, 1]) {
    const [sx, sz] = at(p, side * hw, 0);
    bin.box('wood', sx, g + 1.6, sz, 0.08, 0.65, hd, p.rot);
    bin.box('iron', sx, g + 2.3, sz, 0.12, 0.07, hd * 1.02, p.rot);
    bin.box('iron', sx, g + 1.05, sz, 0.11, 0.06, hd * 1.02, p.rot);
    const [ex, ez] = at(p, 0, side * hd);
    bin.box('wood', ex, g + 1.6, ez, hw, 0.65, 0.08, p.rot);
    bin.box('iron', ex, g + 2.3, ez, hw * 1.02, 0.07, 0.12, p.rot);
    // Iron straps up the long sides, a brass rivet head on each, and the
    // corner posts.
    for (const lz of [-hd * 0.55, 0, hd * 0.55]) {
      const [bx, bz] = at(p, side * (hw + 0.09), lz);
      bin.box('iron', bx, g + 1.65, bz, 0.03, 0.68, 0.09, p.rot);
      bin.box('brass', bx, g + 2.05, bz, 0.05, 0.05, 0.05, p.rot);
      bin.box('brass', bx, g + 1.3, bz, 0.05, 0.05, 0.05, p.rot);
    }
    for (const end of [-1, 1]) {
      const [cx, cz] = at(p, side * hw, end * hd);
      bin.box('iron', cx, g + 1.65, cz, 0.13, 0.75, 0.13, p.rot);
    }
  }
  // Wheels and the tow bar.
  for (const lz of [-hd * 0.6, hd * 0.6])
    for (const lx of [-hw, hw]) {
      const [x, z] = at(p, lx * 1.08, lz);
      const tyre = new THREE.CylinderGeometry(0.66, 0.66, 0.24, 16);
      bin.add('iron', tyre, x, g + 0.66, z, p.rot, [1, 1, 1], 0, Math.PI / 2);
      const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8);
      bin.add('brass', hub, x, g + 0.66, z, p.rot, [1, 1, 1], 0, Math.PI / 2);
    }
  const [tx0, tz0] = at(p, 0, hd);
  const [tx1, tz1] = at(p, 0, hd + 1.6);
  bin.beam('iron', [tx0, g + 0.95, tz0], [tx1, g + 0.45, tz1], 0.07);
  // The load: plates and a cog heaped over the rim.
  for (const [lx, lz, y, half, tilt] of [
    [-0.3, -0.6, 2.25, 0.62, 0.5],
    [0.25, 0.2, 2.45, 0.56, -0.4],
    [-0.1, 0.9, 2.2, 0.5, 0.3],
    [0.35, -0.2, 2.7, 0.42, 0.9],
  ] as const) {
    const [x, z] = at(p, lx * hw, lz * hd * 0.6);
    bin.box(lx > 0 ? 'iron' : 'brass', x, g + y, z, half, 0.05, half * 0.75, p.rot + lx, tilt, 0.2);
  }
  const [cx, cz] = at(p, 0.3 * hw, -0.9 * hd * 0.6);
  const cog = new THREE.TorusGeometry(0.42, 0.1, 6, 12);
  bin.add('brass', cog, cx, g + 2.6, cz, p.rot, [1, 1, 1], 1.2);
}

/** Build the worker camps' props: one merged mesh per shared material. */
export function buildFoundryWorkerCamps(ground: Ground): THREE.Group {
  const bin = new PartBin();
  for (const p of STORMBRASS_FOUNDRY_FIELD.props) {
    const g = ground(p.x, p.z);
    if (p.kind === 'sf_ore_seam') oreSeam(bin, p, g);
    else if (p.kind === 'sf_scrap_heap') scrapHeap(bin, p, g);
    else if (p.kind === 'sf_chain_post') chainPost(bin, p, g);
    else if (p.kind === 'sf_scrap_cart') scrapCart(bin, p, g);
  }
  return bin.build('stormbrassWorkerCamps');
}
