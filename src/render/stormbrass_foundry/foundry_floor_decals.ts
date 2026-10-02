// The Stormbrass Foundry's floor marks (foundry_floor_plan_core.ts): every
// stain, puddle, drain, painted band, chalk layout, rut and crater as ONE
// merged mesh of floor quads, drawn with one lit, shadow-receiving material
// from one procedural atlas (a 4 by 4 sheet painted once per session, like the
// authored field's own detail textures). The mesh sits on the floor ladder's
// GROUND rung, so every player effect and every encounter telegraph paints
// over it; its paint is worn and its stains dark, never a threat colour at
// telegraph brightness. Cosmetic: the scatter sheds on the low tier.

import * as THREE from 'three';
import { floorVfxRenderOrder } from '../floor_vfx_layer';
import { markSharedMaterial } from '../shared_resource';
import {
  decalCorners,
  FOUNDRY_DECAL_KINDS,
  type FoundryDecalKind,
  foundryFloorMarkHeight,
  planFoundryFloorDecals,
} from './foundry_floor_plan_core';

const CELL = 256;
const GRID = 4;

type Rgba = [number, number, number, number];

function hash2(x: number, y: number, s: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}
function noise(x: number, y: number, s: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s);
  const b = hash2(ix + 1, iy, s);
  const c = hash2(ix, iy + 1, s);
  const d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x: number, y: number, s: number): number {
  return (
    noise(x, y, s) * 0.5 +
    noise(x * 2.1, y * 2.1, s + 3) * 0.3 +
    noise(x * 4.3, y * 4.3, s + 7) * 0.2
  );
}
const sat = (v: number): number => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = sat((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** A ragged blob's coverage at (u, v) in -1..1: 1 inside, 0 outside. */
function blob(u: number, v: number, seed: number, ragged = 0.45): number {
  const r = Math.hypot(u, v);
  const a = Math.atan2(v, u);
  const edge = 0.62 + ragged * (fbm(Math.cos(a) * 1.6 + 4, Math.sin(a) * 1.6 + 4, seed) - 0.5);
  return smooth(edge + 0.16, edge - 0.1, r);
}

/** One mark's colour and cover at (u, v), both -1..1 across its cell. */
const PAINT: Record<FoundryDecalKind, (u: number, v: number) => Rgba> = {
  oil(u, v) {
    const k = blob(u, v, 1) * (0.55 + 0.45 * fbm(u * 3 + 9, v * 3, 2));
    const sheen = fbm(u * 5, v * 5 + 3, 4);
    return [0.05 + sheen * 0.06, 0.045 + sheen * 0.05, 0.05 + sheen * 0.09, k * 0.78];
  },
  scorch(u, v) {
    const r = Math.hypot(u, v);
    const streak = fbm(Math.atan2(v, u) * 2.2, r * 2, 5);
    const k = smooth(0.95, 0.15, r + (streak - 0.5) * 0.5);
    return [0.03, 0.028, 0.026, k * 0.8];
  },
  hazard(u, v) {
    // A band along u: diagonal stripes, worn through by traffic.
    const stripe = Math.floor((u * 4 + v * 0.9 + 8) * 1.2) % 2 === 0;
    const worn = smooth(0.25, 0.6, fbm(u * 3 + 2, v * 6, 6));
    const edge = smooth(1, 0.82, Math.abs(v)) * smooth(1, 0.94, Math.abs(u));
    return stripe ? [0.5, 0.36, 0.06, edge * worn * 0.85] : [0.04, 0.04, 0.04, edge * worn * 0.8];
  },
  chalk(u, v) {
    // A draughtsman's layout: a circle, centre lines, a rectangle, ticks.
    const r = Math.hypot(u, v);
    const line = (d: number, w = 0.012) => smooth(w * 2, w * 0.5, Math.abs(d));
    let k = line(r - 0.78) + line(r - 0.36) * 0.8;
    k += line(u) * (Math.floor((v + 1) * 9) % 2 ? 1 : 0.2) * smooth(0.95, 0.9, Math.abs(v));
    k += line(v) * (Math.floor((u + 1) * 9) % 2 ? 1 : 0.2) * smooth(0.95, 0.9, Math.abs(u));
    const box = Math.max(Math.abs(u - 0.1) - 0.5, Math.abs(v + 0.08) - 0.62);
    k += line(box) * 0.9;
    k += line(u - v * 0.6 - 0.2) * smooth(0.5, 0.45, Math.abs(v)) * 0.7;
    for (let i = -3; i <= 3; i++)
      k += line(u - i * 0.22, 0.008) * smooth(0.9, 0.86, v) * smooth(0.8, 0.84, v);
    const dust = 0.55 + 0.45 * fbm(u * 14, v * 14, 8);
    return [0.86, 0.87, 0.84, sat(k) * dust * 0.8];
  },
  puddle(u, v) {
    // Standing water: dark, with the storm's sky in it and a thin bright
    // meniscus where it meets the floor.
    const k = blob(u * 0.95, v * 0.95, 9, 0.35);
    const inner = blob(u * 1.1, v * 1.1, 9, 0.35);
    const rim = k * (1 - inner);
    const sky = fbm(u * 1.2 + 5, v * 1.2, 10);
    return [
      0.02 + sky * 0.05 + rim * 0.07,
      0.028 + sky * 0.065 + rim * 0.08,
      0.045 + sky * 0.1 + rim * 0.1,
      k * (0.5 + rim * 0.3),
    ];
  },
  drain(u, v) {
    const r = Math.hypot(u, v);
    const stain = smooth(1, 0.5, r) * 0.45;
    if (r > 0.62) return [0.1, 0.07, 0.05, stain];
    if (r > 0.52) return [0.24, 0.24, 0.26, 1];
    const slot = Math.abs((((v + 1) * 5.5) % 1) - 0.5) < 0.22;
    return slot ? [0.015, 0.015, 0.018, 1] : [0.2, 0.2, 0.22, 1];
  },
  slag(u, v) {
    const k = blob(u, v, 11, 0.6);
    const crack = smooth(0.1, 0.02, Math.abs(fbm(u * 4, v * 4, 12) - 0.5));
    const hot = crack * smooth(0.75, 0.2, Math.hypot(u, v));
    return [0.1 + hot * 0.8, 0.07 + hot * 0.3, 0.06 + hot * 0.04, k * 0.92];
  },
  ruts(u, v) {
    // Two tracks along u, tread bars across them, churned edges.
    const track = Math.min(Math.abs(v - 0.45), Math.abs(v + 0.45));
    const inTrack = smooth(0.3, 0.2, track + (fbm(u * 3, v * 2, 13) - 0.5) * 0.1);
    const tread = Math.abs((((u + 1) * 7) % 1) - 0.5) < 0.24 ? 1 : 0.55;
    const ends = smooth(1, 0.7, Math.abs(u));
    return [0.07, 0.055, 0.045, inTrack * tread * ends * 0.62];
  },
  crater(u, v) {
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);
    const ray = fbm(a * 3.2, 1, 14);
    const pit = smooth(0.4, 0.14, r);
    const ejecta = smooth(0.95, 0.38, r + (ray - 0.5) * 0.55) * (1 - pit);
    const rim = smooth(0.09, 0, Math.abs(r - 0.43));
    // Blasted earth: a black pit, a lip of turned soil, rays of thrown dirt.
    return [
      0.025 * pit + (0.1 + rim * 0.16) * (1 - pit),
      0.02 * pit + (0.075 + rim * 0.13) * (1 - pit),
      0.018 * pit + (0.055 + rim * 0.09) * (1 - pit),
      sat(pit * 0.85 + ejecta * 0.5 + rim * 0.25),
    ];
  },
  seam(u, v) {
    // A lapped plate seam along u: a dark joint, a bright worn lip, rivets.
    const joint = smooth(0.14, 0.04, Math.abs(v));
    const lip = smooth(0.16, 0.06, Math.abs(v - 0.24)) * 0.6;
    const pu = (((u + 1) * 6) % 1) - 0.5;
    const rivet = smooth(0.2, 0.1, Math.hypot(pu * 0.33, (Math.abs(v) - 0.55) * 1));
    const ends = smooth(1, 0.92, Math.abs(u));
    const k = sat(joint * 0.75 + lip + rivet * 0.9) * ends;
    const c = joint > lip + rivet ? 0.03 : 0.42;
    return [c, c, c * 1.04, k];
  },
  rust(u, v) {
    const mottle = fbm(u * 6, v * 6, 16);
    const k = blob(u, v * 0.8, 15, 0.7) * smooth(0.25, 0.7, mottle);
    return [0.2 + mottle * 0.08, 0.09 + mottle * 0.03, 0.04, k * 0.5];
  },
  lane(u, v) {
    // A dashed painted line along u.
    const dash = ((u + 1) * 1.5) % 1 < 0.62 ? 1 : 0;
    const worn = smooth(0.2, 0.55, fbm(u * 4, v * 9 + 4, 17));
    return [0.5, 0.48, 0.42, dash * worn * smooth(0.8, 0.6, Math.abs(v)) * 0.55];
  },
  keepClear(u, v) {
    const r = Math.hypot(u, v);
    const a = Math.atan2(v, u);
    const ring = smooth(0.09, 0.05, Math.abs(r - 0.86));
    const stripe = Math.floor((a / Math.PI + 1) * 14) % 2 === 0;
    const worn = smooth(0.2, 0.6, fbm(u * 5 + 1, v * 5, 18));
    return stripe ? [0.5, 0.36, 0.06, ring * worn * 0.85] : [0.04, 0.04, 0.04, ring * worn * 0.75];
  },
  turntable(u, v) {
    const r = Math.hypot(u, v);
    if (r > 0.98) return [0, 0, 0, 0];
    const pitWall = smooth(0.05, 0.02, Math.abs(r - 0.93));
    const ringRail = smooth(0.03, 0.012, Math.abs(r - 0.8));
    // The bridge: two rails along u on a plated deck, across the pit.
    const onBridge = Math.abs(v) < 0.2 && r < 0.9;
    const rail = smooth(0.022, 0.008, Math.abs(Math.abs(v) - 0.12));
    const tie = Math.abs((((u + 1) * 12) % 1) - 0.5) < 0.2;
    const pivot = smooth(0.12, 0.09, r);
    let c: [number, number, number] = [0.06, 0.055, 0.05];
    if (onBridge) c = tie ? [0.16, 0.12, 0.09] : [0.19, 0.19, 0.2];
    if (rail > 0.5 && r < 0.9) c = [0.5, 0.5, 0.52];
    if (ringRail > 0.5) c = [0.42, 0.42, 0.44];
    if (pitWall > 0.5) c = [0.3, 0.29, 0.28];
    if (pivot > 0.5) c = [0.5, 0.38, 0.16];
    const grime = 0.75 + 0.25 * fbm(u * 6, v * 6, 19);
    return [c[0] * grime, c[1] * grime, c[2] * grime, smooth(0.98, 0.95, r) * 0.95];
  },
  grille(u, v) {
    const au = Math.abs(u);
    const av = Math.abs(v);
    const soot = smooth(1, 0.6, Math.max(au, av)) * 0.5;
    if (au > 0.74 || av > 0.74) return [0.04, 0.035, 0.03, soot];
    if (au > 0.64 || av > 0.64) return [0.26, 0.26, 0.28, 1];
    const bar = Math.abs((((u + 1) * 7) % 1) - 0.5) < 0.2;
    return bar ? [0.22, 0.22, 0.24, 1] : [0.012, 0.012, 0.016, 1];
  },
  scuff(u, v) {
    // Traffic polish: a paler, worn patch.
    const k = blob(u, v * 0.7, 20, 0.7) * fbm(u * 7 + 2, v * 3, 21);
    return [0.5, 0.5, 0.52, k * 0.28];
  },
};

let atlas: THREE.CanvasTexture | null = null;
let material: THREE.MeshLambertMaterial | null = null;

function decalAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const size = CELL * GRID;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('foundry decal atlas canvas unavailable');
  const img = ctx.createImageData(size, size);
  const lin = (c: number) => Math.round(sat(c) ** (1 / 2.2) * 255);
  FOUNDRY_DECAL_KINDS.forEach((kind, i) => {
    const cx = (i % GRID) * CELL;
    const cy = Math.floor(i / GRID) * CELL;
    const paint = PAINT[kind];
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const u = ((x + 0.5) / CELL) * 2 - 1;
        const v = ((y + 0.5) / CELL) * 2 - 1;
        const [r, g, b, a] = paint(u, v);
        // A two pixel clear border, so no cell bleeds into its neighbour.
        const border = x < 2 || y < 2 || x >= CELL - 2 || y >= CELL - 2 ? 0 : 1;
        const o = ((cy + y) * size + cx + x) * 4;
        img.data[o] = lin(r);
        img.data[o + 1] = lin(g);
        img.data[o + 2] = lin(b);
        img.data[o + 3] = Math.round(sat(a) * 255 * border);
      }
    }
  });
  ctx.putImageData(img, 0, 0);
  atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

function decalMaterial(): THREE.MeshLambertMaterial {
  if (!material) {
    material = new THREE.MeshLambertMaterial({
      map: decalAtlas(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      name: 'stormbrassFloorDecals',
    });
    markSharedMaterial(material);
  }
  return material;
}

/** Every floor mark of the Foundry as one mesh. */
export function buildFoundryFloorDecals(lowGfx: boolean): THREE.Mesh | null {
  const decals = planFoundryFloorDecals().filter((d) => !(lowGfx && d.cosmetic));
  if (decals.length === 0) return null;
  const pos = new Float32Array(decals.length * 12);
  const uv = new Float32Array(decals.length * 8);
  const nor = new Float32Array(decals.length * 12);
  const index = new Uint16Array(decals.length * 6);
  const inset = 0.5 / (CELL * GRID);
  decals.forEach((d, i) => {
    const corners = decalCorners(d);
    const k = FOUNDRY_DECAL_KINDS.indexOf(d.kind);
    const u0 = (k % GRID) / GRID + inset;
    const u1 = (k % GRID) / GRID + 1 / GRID - inset;
    // The canvas's rows run down; a texture's v runs up.
    const v1 = 1 - Math.floor(k / GRID) / GRID - inset;
    const v0 = 1 - Math.floor(k / GRID) / GRID - 1 / GRID + inset;
    const uvs = [u0, v1, u1, v1, u1, v0, u0, v0];
    corners.forEach(([x, z], c) => {
      // The marks' rung of the floor's ladder, a hair apart per mark, so two
      // overlapping marks never fight.
      pos.set([x, foundryFloorMarkHeight(d, i), z], i * 12 + c * 3);
      nor.set([0, 1, 0], i * 12 + c * 3);
    });
    uv.set(uvs, i * 8);
    index.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, decalMaterial());
  mesh.name = 'stormbrassFloorDecals';
  mesh.receiveShadow = true;
  // The world's own marks: under every player effect and every telegraph.
  mesh.renderOrder = floorVfxRenderOrder('ground', 0);
  return mesh;
}
