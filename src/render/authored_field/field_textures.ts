// Procedural detail textures for authored open-air fields: worn flagstones,
// grave soil, jungle moss over loam, wet basalt column tops and cliff rock,
// each an albedo multiplier (tinted by the vertex paint) plus a matching
// normal map baked from the same height field, so the stone reads carved
// under a raking light. Built once per page and shared by
// every field (markSharedTexture semantics via the material cache).
//
// Deterministic: a local LCG, never Math.random.

import * as THREE from 'three';

type Painter = (height: Float32Array, size: number, rnd: () => number) => void;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function blurWrap(src: Float32Array, size: number, radius: number): Float32Array {
  const out = new Float32Array(src.length);
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += src[y * size + ((x + k + size) % size)];
      tmp[y * size + x] = s / (radius * 2 + 1);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += tmp[((y + k + size) % size) * size + x];
      out[y * size + x] = s / (radius * 2 + 1);
    }
  }
  return out;
}

function noiseField(size: number, rnd: () => number, cells: number): Float32Array {
  // Tileable value noise: a random lattice sampled with smooth interpolation.
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const at = (i: number, j: number) =>
        lattice[((j + cells) % cells) * cells + ((i + cells) % cells)];
      const a = at(x0, y0);
      const b = at(x0 + 1, y0);
      const c = at(x0, y0 + 1);
      const d = at(x0 + 1, y0 + 1);
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

/** Irregular flagstones: slabs of varied tone with sunken, gritty joints. */
const paintFlagstone: Painter = (h, size, rnd) => {
  const rows = 4;
  const slab = size / rows;
  const tone = new Float32Array(size * size);
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * slab * 0.5 + rnd() * slab * 0.2;
    const widths: number[] = [];
    let total = 0;
    while (total < size) {
      const w = slab * (0.7 + rnd() * 0.8);
      widths.push(w);
      total += w;
    }
    const scale = size / total;
    let x0 = offset;
    for (const w0 of widths) {
      const w = w0 * scale;
      const t = 0.55 + rnd() * 0.35;
      for (let y = Math.floor(r * slab); y < Math.floor((r + 1) * slab); y++) {
        for (let xi = Math.floor(x0); xi < Math.floor(x0 + w); xi++) {
          const x = ((xi % size) + size) % size;
          const ex = Math.min(xi - x0, x0 + w - xi);
          const ey = Math.min(y - r * slab, (r + 1) * slab - y);
          const edge = Math.min(ex, ey);
          const joint = edge < 2 ? 0.12 : edge < 4 ? 0.45 + t * 0.3 : t;
          tone[y * size + x] = joint;
        }
      }
      x0 += w;
    }
  }
  const grain = noiseField(size, rnd, 32);
  const broad = noiseField(size, rnd, 6);
  for (let i = 0; i < h.length; i++) {
    h[i] = tone[i] * (0.82 + grain[i] * 0.22) + (broad[i] - 0.5) * 0.12;
  }
  // Chips and cracks: a few dark scratches per slab row.
  for (let k = 0; k < 90; k++) {
    let x = rnd() * size;
    let y = rnd() * size;
    const a = rnd() * Math.PI * 2;
    const len = 6 + rnd() * 22;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a + (rnd() - 0.5) * 0.8);
      y += Math.sin(a + (rnd() - 0.5) * 0.8);
      const i =
        (((Math.floor(y) % size) + size) % size) * size + (((Math.floor(x) % size) + size) % size);
      h[i] *= 0.55;
    }
  }
};

/** Grave soil: clods, pebbles and root litter. */
const paintSoil: Painter = (h, size, rnd) => {
  const a = noiseField(size, rnd, 8);
  const b = noiseField(size, rnd, 24);
  const c = noiseField(size, rnd, 64);
  for (let i = 0; i < h.length; i++) h[i] = 0.35 + a[i] * 0.25 + b[i] * 0.25 + c[i] * 0.2;
  for (let k = 0; k < 420; k++) {
    const cx = rnd() * size;
    const cy = rnd() * size;
    const r = 1 + rnd() * 3.2;
    const lift = 0.15 + rnd() * 0.3;
    for (let y = -4; y <= 4; y++) {
      for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y);
        if (d > r) continue;
        const i =
          (((Math.floor(cy + y) % size) + size) % size) * size +
          (((Math.floor(cx + x) % size) + size) % size);
        h[i] += lift * (1 - d / r);
      }
    }
  }
};

/** Cliff rock: fractured faces (tileable Worley cells with dark cracks) and pitting. */
const paintRock: Painter = (h, size, rnd) => {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 46; i++) pts.push([rnd() * size, rnd() * size, 0.55 + rnd() * 0.45]);
  const b = noiseField(size, rnd, 17);
  const c = noiseField(size, rnd, 48);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      let tone = 0.7;
      for (const [px, py, t] of pts) {
        let dx = Math.abs(x - px);
        let dy = Math.abs(y - py);
        dx = Math.min(dx, size - dx);
        dy = Math.min(dy, size - dy);
        // Stretched cells: the rock fractures in slabs.
        const d = Math.hypot(dx * 0.7, dy * 1.25);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          tone = t;
        } else if (d < d2) d2 = d;
      }
      const crack = Math.min(1, (d2 - d1) / 3.5);
      const i = y * size + x;
      h[i] = (0.25 + tone * 0.45 + b[i] * 0.2 + c[i] * 0.12) * (0.25 + 0.75 * crack) + d1 * 0.002;
    }
  }
};

/** Jungle loam under moss: soft cushions of moss over dark loam, with leaf
 *  litter and root threads between the clumps. */
const paintMoss: Painter = (h, size, rnd) => {
  const broad = noiseField(size, rnd, 5);
  const clumps = noiseField(size, rnd, 22);
  const fine = noiseField(size, rnd, 80);
  for (let i = 0; i < h.length; i++) {
    // Moss cushions swell where the clump field is high; loam sinks between.
    const cushion = Math.max(0, clumps[i] - 0.42) * 1.9;
    h[i] = 0.32 + broad[i] * 0.2 + cushion * 0.34 + fine[i] * 0.06;
  }
  // Leaf litter: small flat ovals pressed into the loam.
  for (let k = 0; k < 70; k++) {
    const cx = rnd() * size;
    const cy = rnd() * size;
    const a = rnd() * Math.PI;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const len = 2 + rnd() * 3.5;
    for (let y = -5; y <= 5; y++) {
      for (let x = -5; x <= 5; x++) {
        const u = (x * ca + y * sa) / len;
        const v = (-x * sa + y * ca) / (len * 0.45);
        if (u * u + v * v > 1) continue;
        const i =
          (((Math.floor(cy + y) % size) + size) % size) * size +
          (((Math.floor(cx + x) % size) + size) % size);
        h[i] = h[i] * 0.75 + 0.18;
      }
    }
  }
  // Root threads: thin raised lines wandering across.
  for (let k = 0; k < 9; k++) {
    let x = rnd() * size;
    let y = rnd() * size;
    let a = rnd() * Math.PI * 2;
    const len = 30 + rnd() * 70;
    for (let s = 0; s < len; s++) {
      a += (rnd() - 0.5) * 0.35;
      x += Math.cos(a);
      y += Math.sin(a);
      const i =
        (((Math.floor(y) % size) + size) % size) * size + (((Math.floor(x) % size) + size) % size);
      h[i] += 0.12;
    }
  }
};

/** Wet basalt: the tops of hexagonal columns, each a slab of its own tone
 *  with dark sunken joints, fine pitting and a polished wet sheen. */
const paintBasalt: Painter = (h, size, rnd) => {
  // A tileable hex lattice: cells of 4 across the tile, jittered.
  const cols = 4;
  const rows = 4;
  const pts: [number, number, number][] = [];
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const ox = (q + (r % 2) * 0.5 + (rnd() - 0.5) * 0.25) * (size / cols);
      const oy = (r + (rnd() - 0.5) * 0.25) * (size / rows);
      pts.push([ox, oy, 0.5 + rnd() * 0.4]);
    }
  }
  const grain = noiseField(size, rnd, 64);
  const broad = noiseField(size, rnd, 7);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let d1 = Infinity;
      let d2 = Infinity;
      let tone = 0.6;
      for (const [px, py, t] of pts) {
        let dx = Math.abs(x - px);
        let dy = Math.abs(y - py);
        dx = Math.min(dx, size - dx);
        dy = Math.min(dy, size - dy);
        const d = Math.hypot(dx, dy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          tone = t;
        } else if (d < d2) d2 = d;
      }
      const joint = Math.min(1, (d2 - d1) / 4);
      const i = y * size + x;
      // A slight dome on each column top, darker grout in the joints.
      const dome = Math.max(0, 1 - d1 / (size / cols)) * 0.12;
      h[i] = (tone + dome + grain[i] * 0.12 + (broad[i] - 0.5) * 0.1) * (0.18 + 0.82 * joint);
    }
  }
};

/** Riveted steel deck plate (the Stormbrass Foundry): four plates to the
 *  tile, each with a diamond tread, sunken weld seams, a rivet row along every
 *  edge, and scuffs where boots and carts wear it. */
const paintPlate: Painter = (h, size, rnd) => {
  const cells = 2;
  const cell = size / cells;
  const tone: number[] = [];
  for (let i = 0; i < cells * cells; i++) tone.push(0.56 + rnd() * 0.16);
  const grain = noiseField(size, rnd, 40);
  const broad = noiseField(size, rnd, 5);
  const tread = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      const lx = x - cx * cell;
      const ly = y - cy * cell;
      const edge = Math.min(lx, ly, cell - 1 - lx, cell - 1 - ly);
      let v =
        tone[cy * cells + cx] +
        (grain[y * size + x] - 0.5) * 0.08 +
        (broad[y * size + x] - 0.5) * 0.08;
      // The diamond tread: short raised lozenges, alternating diagonals.
      if (edge > 6) {
        const ty = Math.floor(ly / tread);
        const tx = Math.floor(lx / tread);
        const fx = lx / tread - tx - 0.5;
        const fy = ly / tread - ty - 0.5;
        const flip = (tx + ty) % 2 === 0 ? 1 : -1;
        const u = (fx + fy * flip) * Math.SQRT1_2;
        const w = (fx - fy * flip) * Math.SQRT1_2;
        if (Math.abs(u) < 0.32 && Math.abs(w) < 0.08) v += 0.13;
      }
      // Sunken weld seams between the plates.
      if (edge < 2) v = 0.18 + edge * 0.08;
      h[y * size + x] = v;
    }
  }
  // Rivets: a row of domes a few pixels in from every plate edge.
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const x0 = cx * cell;
      const y0 = cy * cell;
      for (let t = 6; t < cell - 3; t += 12) {
        for (const [rx, ry] of [
          [x0 + t, y0 + 5],
          [x0 + t, y0 + cell - 6],
          [x0 + 5, y0 + t],
          [x0 + cell - 6, y0 + t],
        ]) {
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const d = Math.hypot(dx, dy);
              if (d > 2.3) continue;
              const i = ((ry + dy + size) % size) * size + ((rx + dx + size) % size);
              h[i] = Math.max(h[i], 0.78 - d * 0.1);
            }
          }
        }
      }
    }
  }
  // Scuffs and gouges.
  for (let k = 0; k < 60; k++) {
    let x = rnd() * size;
    let y = rnd() * size;
    const a = rnd() * Math.PI * 2;
    const len = 5 + rnd() * 18;
    for (let s = 0; s < len; s++) {
      x += Math.cos(a);
      y += Math.sin(a);
      const i =
        (((Math.floor(y) % size) + size) % size) * size + (((Math.floor(x) % size) + size) % size);
      h[i] *= 0.82;
    }
  }
};

/** Catwalk bar grating: load bars along the tile, cross rods every few
 *  inches, the dark drop showing through every gap. */
const paintGrating: Painter = (h, size, rnd) => {
  const pitch = 8;
  const cross = 32;
  const grain = noiseField(size, rnd, 48);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bar = x % pitch < 3;
      const rod = y % cross < 2;
      let v = 0.04;
      if (bar) v = 0.62 + (x % pitch === 1 ? 0.12 : 0) + (grain[y * size + x] - 0.5) * 0.12;
      else if (rod) v = 0.5 + (grain[y * size + x] - 0.5) * 0.1;
      // A frame band every tile edge (the panel's own border).
      if (y % (size / 2) < 3) v = 0.58 + (grain[y * size + x] - 0.5) * 0.08;
      h[y * size + x] = v;
    }
  }
};

interface DetailPair {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

const cache = new Map<string, DetailPair>();

function bake(
  key: string,
  painter: Painter,
  seed: number,
  size: number,
  relief: number,
  blur = 1,
  /** Albedo swing from the deepest to the highest point (out of 255). */
  contrast = 145,
): DetailPair {
  const cached = cache.get(key);
  if (cached) return cached;
  const rnd = lcg(seed);
  const raw = new Float32Array(size * size);
  painter(raw, size, rnd);
  const height = blurWrap(raw, size, blur);
  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = size;
  const normal = document.createElement('canvas');
  normal.width = normal.height = size;
  const actx = albedo.getContext('2d');
  const nctx = normal.getContext('2d');
  if (!actx || !nctx) throw new Error('authored field texture canvas unavailable');
  const aimg = actx.createImageData(size, size);
  const nimg = nctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const hv = Math.max(0, Math.min(1, height[i]));
      const v = Math.round(255 - contrast + hv * contrast);
      aimg.data[i * 4] = v;
      aimg.data[i * 4 + 1] = v;
      aimg.data[i * 4 + 2] = v;
      aimg.data[i * 4 + 3] = 255;
      const l = height[y * size + ((x - 1 + size) % size)];
      const r = height[y * size + ((x + 1) % size)];
      const u = height[((y - 1 + size) % size) * size + x];
      const d = height[((y + 1) % size) * size + x];
      const nx = (l - r) * relief;
      const ny = (u - d) * relief;
      const len = Math.hypot(nx, ny, 1);
      nimg.data[i * 4] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      nimg.data[i * 4 + 3] = 255;
    }
  }
  actx.putImageData(aimg, 0, 0);
  nctx.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normal);
  for (const t of [map, normalMap]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  const pair = { map, normalMap };
  cache.set(key, pair);
  return pair;
}

export function flagstoneDetail(): DetailPair {
  return bake('flagstone', paintFlagstone, 0x51a7, 256, 6);
}

export function soilDetail(): DetailPair {
  return bake('soil', paintSoil, 0x2c3d, 256, 5);
}

export function rockDetail(): DetailPair {
  return bake('rock', paintRock, 0x9e11, 256, 7);
}

/** Bedded mountain rock (the Stormbrass Foundry's cut faces): level beds of
 *  uneven thickness, each its own tone, a dark parting between them, fine
 *  lamination and a slow warp so no bed runs dead straight. */
const paintStrata: Painter = (h, size, rnd) => {
  const fine = noiseField(size, rnd, 44);
  const broad = noiseField(size, rnd, 6);
  const bed = new Float32Array(size);
  let y = 0;
  while (y < size) {
    const thick = 5 + Math.floor(rnd() * 24);
    const tone = 0.32 + rnd() * 0.58;
    for (let k = 0; k < thick && y + k < size; k++) bed[y + k] = k === 0 ? tone * 0.35 : tone;
    y += thick;
  }
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = py * size + px;
      const warped = (((py + Math.round((broad[i] - 0.5) * 12)) % size) + size) % size;
      h[i] = bed[warped] * 0.72 + fine[i] * 0.2 + Math.sin(warped * 1.9) * 0.04;
    }
  }
};

export function strataDetail(): DetailPair {
  return bake('strata', paintStrata, 0x57a7, 256, 6, 1, 150);
}

export function mossDetail(): DetailPair {
  // Soft cushions: a wider blur and a low relief (no pixel grit at range).
  return bake('moss', paintMoss, 0x6d0b, 256, 3, 2, 80);
}

export function basaltDetail(): DetailPair {
  return bake('basalt', paintBasalt, 0xba5a, 256, 8);
}

export function plateDetail(): DetailPair {
  return bake('plate', paintPlate, 0x7a7e, 256, 7, 0, 160);
}

export function gratingDetail(): DetailPair {
  // Hard bar edges: no blur, a deep relief and the full albedo swing (the
  // gaps read black, the drop showing through).
  return bake('grating', paintGrating, 0x96a1, 256, 9, 0, 200);
}
