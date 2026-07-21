import * as THREE from 'three';

// Procedural canvas textures for the ability VFX primitives, ported from the
// Ability VFX Gallery (arc_bolt_preview.js texture section). Built once at
// first use; the module-local rnd() keeps generation deterministic (the
// textures.ts idiom: never Math.random in texture generation).

let seedState = 77031;
function rnd(): number {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
const rr = (a: number, b: number): number => a + (b - a) * rnd();

function makeCanvas(
  size: number,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// Value-noise fBm, sampled by the ring band shader and the decal dissolve.
function fbmTexture(size = 128, oct = 4): THREE.CanvasTexture {
  const tex = makeCanvas(size, (g, s) => {
    const img = g.createImageData(s, s);
    const grid = 8;
    const layers: { n: number; layer: Float32Array }[] = [];
    for (let o = 0; o < oct; o++) {
      const n = grid << o;
      const layer = new Float32Array(n * n);
      for (let i = 0; i < n * n; i++) layer[i] = rnd();
      layers.push({ n, layer });
    }
    const sample = (l: { n: number; layer: Float32Array }, x: number, y: number): number => {
      const n = l.n;
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const sx = xf * xf * (3 - 2 * xf);
      const sy = yf * yf * (3 - 2 * yf);
      const at = (ix: number, iy: number): number =>
        l.layer[(((iy % n) + n) % n) * n + (((ix % n) + n) % n)];
      const a = at(xi, yi);
      const b = at(xi + 1, yi);
      const c2 = at(xi, yi + 1);
      const d = at(xi + 1, yi + 1);
      return a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy;
    };
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        let v = 0;
        let amp = 0.5;
        for (let o = 0; o < oct; o++) {
          v += sample(layers[o], (x / s) * layers[o].n, (y / s) * layers[o].n) * amp;
          amp *= 0.5;
        }
        const q = Math.floor(Math.min(1, Math.max(0, v)) * 255);
        const i = (y * s + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = q;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Soft horizontal energy strip: bright core, feathered edges (ribbon cross
// section). RepeatWrapping so u can scroll past 1.
function ribbonTexture(): THREE.CanvasTexture {
  const tex = makeCanvas(64, (g, s) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0.0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.32, 'rgba(255,255,255,0.25)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)');
    grad.addColorStop(0.68, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// Arcane rune circle: concentric rings, glyph band, inner spokes. Near-white
// so the decal shader's uColor carries the school palette.
function runeRingTexture(): THREE.CanvasTexture {
  return makeCanvas(256, (g, s) => {
    const c = s / 2;
    const k = s / 512;
    g.strokeStyle = 'rgba(240,245,255,0.95)';
    g.lineCap = 'round';
    for (const [r, w] of [
      [224, 9],
      [204, 4],
      [140, 6],
      [126, 3],
    ]) {
      g.lineWidth = w * k;
      g.beginPath();
      g.arc(c, c, r * k, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const gx = c + Math.cos(a) * 172 * k;
      const gy = c + Math.sin(a) * 172 * k;
      g.save();
      g.translate(gx, gy);
      g.rotate(a + Math.PI / 2);
      g.lineWidth = 5.5 * k;
      const strokes = 3 + Math.floor(rnd() * 3);
      for (let st = 0; st < strokes; st++) {
        g.beginPath();
        g.moveTo(rr(-16, 16) * k, rr(-20, 20) * k);
        g.lineTo(rr(-16, 16) * k, rr(-20, 20) * k);
        if (rnd() < 0.6) g.lineTo(rr(-16, 16) * k, rr(-20, 20) * k);
        g.stroke();
      }
      g.restore();
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.13;
      g.lineWidth = 3.5 * k;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * 46 * k, c + Math.sin(a) * 46 * k);
      g.lineTo(c + Math.cos(a) * (86 + rnd() * 24) * k, c + Math.sin(a) * (86 + rnd() * 24) * k);
      g.stroke();
    }
  });
}

// Ember ring: glowing clumps biased to an annulus. Additive-tinted it reads as
// cooling scorch for fire/blood novas (the gallery's dark soot pass needs
// normal blending; one additive path keeps the decal pool to one material).
function emberRingTexture(): THREE.CanvasTexture {
  return makeCanvas(128, (g, s) => {
    const c = s / 2;
    for (let i = 0; i < 190; i++) {
      const a = rnd() * Math.PI * 2;
      const d = (0.35 + rnd() ** 1.4 * 0.55) * c;
      const rad = rr(1.5, 5) * (1 - (d / c) * 0.5);
      const alpha = 0.5 * (1 - Math.abs(d / c - 0.62));
      g.fillStyle = `rgba(255,255,255,${Math.max(0, alpha).toFixed(3)})`;
      g.beginPath();
      g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, rad, 0, Math.PI * 2);
      g.fill();
    }
  });
}

// Rime bloom: crystalline streaks radiating from center (frost/moon decals).
function rimeTexture(): THREE.CanvasTexture {
  return makeCanvas(128, (g, s) => {
    const c = s / 2;
    g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rr(-0.09, 0.09);
      const r0 = rr(4, 12);
      const r1 = rr(0.45, 0.95) * c;
      g.lineWidth = rr(1, 3);
      g.beginPath();
      g.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0);
      g.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      if (rnd() < 0.6) {
        const fa = a + rr(-0.45, 0.45);
        const fr = r1 * rr(0.55, 0.8);
        g.lineTo(c + Math.cos(fa) * fr, c + Math.sin(fa) * fr);
      }
      g.stroke();
    }
    const grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

// 2x2 overlay sprite atlas: soft glow, four-point star, rune diamond, spark.
// Cell indices are the OVERLAY_CELL constants; append means a bigger grid.
export const OVERLAY_ATLAS_GRID = 2;
export const OVERLAY_CELL = { glow: 0, star: 1, rune: 2, spark: 3 } as const;

function overlayAtlasTexture(): THREE.CanvasTexture {
  const cell = 64;
  return makeCanvas(cell * OVERLAY_ATLAS_GRID, (g) => {
    const at = (ix: number, iy: number, draw: (cx: number, cy: number) => void): void => {
      g.save();
      draw(ix * cell + cell / 2, iy * cell + cell / 2);
      g.restore();
    };
    // glow: soft radial dot
    at(0, 0, (cx, cy) => {
      const r = g.createRadialGradient(cx, cy, 0, cx, cy, cell / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.3, 'rgba(255,255,255,0.6)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r;
      g.fillRect(cx - cell / 2, cy - cell / 2, cell, cell);
    });
    // star: 5-point
    at(1, 0, (cx, cy) => {
      g.translate(cx, cy);
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? cell * 0.42 : cell * 0.16;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    });
    // rune: hollow diamond with a center tick
    at(0, 1, (cx, cy) => {
      g.translate(cx, cy);
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(0, -cell * 0.36);
      g.lineTo(cell * 0.26, 0);
      g.lineTo(0, cell * 0.36);
      g.lineTo(-cell * 0.26, 0);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.moveTo(0, -cell * 0.14);
      g.lineTo(0, cell * 0.14);
      g.stroke();
    });
    // spark: thin elongated flash
    at(1, 1, (cx, cy) => {
      g.translate(cx, cy);
      const grad = g.createLinearGradient(0, -cell * 0.42, 0, cell * 0.42);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(-cell * 0.07, -cell * 0.42, cell * 0.14, cell * 0.84);
      g.fillRect(-cell * 0.24, -cell * 0.07, cell * 0.48, cell * 0.14);
    });
  });
}

export interface AbilityVfxTextures {
  noise: THREE.CanvasTexture;
  ribbon: THREE.CanvasTexture;
  rune: THREE.CanvasTexture;
  ember: THREE.CanvasTexture;
  rime: THREE.CanvasTexture;
  overlay: THREE.CanvasTexture;
}

let cached: AbilityVfxTextures | null = null;

// Build the whole set once (roughly 140 KB of canvases); every pool shares it.
export function abilityVfxTextures(): AbilityVfxTextures {
  if (!cached) {
    cached = {
      noise: fbmTexture(),
      ribbon: ribbonTexture(),
      rune: runeRingTexture(),
      ember: emberRingTexture(),
      rime: rimeTexture(),
      overlay: overlayAtlasTexture(),
    };
  }
  return cached;
}
