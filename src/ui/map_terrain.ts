// Pure terrain painter for the world-map / minimap background. Kept
// host-agnostic (no DOM, no canvas) so it can be unit-tested directly and so
// the heavy per-pixel work can be time-sliced across idle callbacks by the HUD
// without forking the pixel math. It writes straight into a flat RGBA buffer
// (the same `Uint8ClampedArray` an `ImageData.data` exposes).
//
// The colours sample the SAME `terrainHeight`/`roadDistance` the renderer and
// sim use, so the map always matches the real world, do not diverge them.
//
// The style is a hand-drawn fantasy atlas plate: the landmass sits on the
// sea like a carved slab (an inked cliff edge on its shadow side and a cast
// shadow in the water), mountains are drawn caret glyphs with lit faces and
// snow caps, forests are clumped painted crowns, and beneath those the
// relief work remains: two-axis hillshade lit from the northwest, contour
// lines, depth-graded water with shallow foam, wet and dry sand shorelines,
// hypsometric tinting, fbm vegetation mottling, rock exposure on steep
// slopes, and worn dirt tracks with wobbling width and inked edges.
import { ZONES } from '../sim/data';
import { fbm2, hash2 } from '../sim/rng';
import { roadDistance, terrainHeight, WATER_LEVEL, zoneBiomeAt } from '../sim/world';

export interface MapRegion {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Pixel height of a W-wide terrain canvas covering `region` (square-pixel).
export function mapCanvasHeight(W: number, region: MapRegion): number {
  return Math.round((W * (region.maxZ - region.minZ)) / (region.maxX - region.minX));
}

// How thick the tree cover stipples per biome (chance per ~1.3yd hash cell).
const FOREST_STIPPLE: Partial<Record<ReturnType<typeof zoneBiomeAt>, number>> = {
  vale: 0.4,
  marsh: 0.26,
  peaks: 0.2,
  dusk: 0.3,
  ember: 0.22,
  frost: 0.14,
  amber: 0.44,
  fen: 0.24,
  night: 0.2,
  haunt: 0.55, // the canopy is the realm
};

const CONTOUR_STEP = 6; // height units between contour lines
const CONTOUR_WIDTH = 0.42; // how much height-band each line inks

// Paint rows [y0, y1) of a W×H RGBA buffer for `region`. Splitting by whole
// rows is what lets the prewarm chunk the work: the per-row state is the
// current and previous rows' heights, and a chunk's FIRST row recomputes its
// previous row explicitly (same math, same values), so a chunked render is
// byte-identical to a single-pass one (guarded by tests/map_terrain.test.ts).
export function paintTerrainRows(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  region: MapRegion,
  seed: number,
  y0: number,
  y1: number,
): void {
  const spanX = region.maxX - region.minX;
  const spanZ = region.maxZ - region.minZ;
  const worldX = (ix: number) => region.maxX - (ix / W) * spanX;
  const worldZ = (iy: number) => region.maxZ - (iy / H) * spanZ;

  // Heights of the row ABOVE the one being painted, for the north-south
  // hillshade component and the coastline stroke. Seeded from a real sample
  // pass at a chunk's first row so chunked output never drifts.
  let prevRow = new Float64Array(W);
  let curRow = new Float64Array(W);
  if (y0 > 0) {
    const zUp = worldZ(y0 - 1);
    for (let ix = 0; ix < W; ix++) prevRow[ix] = terrainHeight(worldX(ix), zUp, seed);
  }

  for (let iy = y0; iy < y1; iy++) {
    let leftH = 0; // height of the left-neighbour pixel
    for (let ix = 0; ix < W; ix++) {
      // +Z up, +X LEFT: facing 0 is +Z ("north") and turning right decreases
      // facing, so the world's east is -X, and drawing +X to the right
      // mirrored the whole map east-west
      const x = worldX(ix);
      const z = worldZ(iy);
      const h = terrainHeight(x, z, seed);
      curRow[ix] = h;
      const left = ix === 0 ? h : leftH;
      const up = iy === 0 ? h : prevRow[ix];
      leftH = h;
      const biome = zoneBiomeAt(z);
      let r = 58,
        g = 105,
        b = 48;

      if (h < WATER_LEVEL) {
        // -- water: depth-graded blue with a faint chop, coastline inked --
        const depth = Math.min(1, (WATER_LEVEL - h) / 9);
        r = 58 + (18 - 58) * depth;
        g = 118 + (44 - 118) * depth;
        b = 158 + (86 - 158) * depth;
        const chop = (hash2(Math.round(x * 0.6), Math.round(z * 0.6), seed + 811) - 0.5) * 7;
        r += chop;
        g += chop;
        b += chop;
        // breaking foam on the shallowest fringe, just off the sand
        const foam = 1 - Math.min(1, (WATER_LEVEL - h) / 0.4);
        if (foam > 0) {
          r += (150 - r) * foam * 0.6;
          g += (188 - g) * foam * 0.6;
          b += (198 - b) * foam * 0.6;
        }
        // the land slab's cast shadow on the sea (light from screen
        // top-left; screen right/down = world -x/-z, so the caster sits at
        // world +x,+z)
        if (terrainHeight(x + 2.4, z + 2.4, seed) >= WATER_LEVEL) {
          r *= 0.66;
          g *= 0.66;
          b *= 0.7;
        } else if (terrainHeight(x + 4.8, z + 4.8, seed) >= WATER_LEVEL) {
          r *= 0.84;
          g *= 0.84;
          b *= 0.87;
        }
        if (left >= WATER_LEVEL || up >= WATER_LEVEL) {
          // the ink line where the sea meets the land
          r *= 0.45;
          g *= 0.45;
          b *= 0.5;
        }
        const k = (iy * W + ix) * 4;
        data[k] = r;
        data[k + 1] = g;
        data[k + 2] = b;
        data[k + 3] = 255;
        continue;
      }

      // -- land base color per biome (the special regional grades keep their
      // existing math) --
      if (biome === 'marsh') {
        r = 64;
        g = 86;
        b = 48;
      } else if (biome === 'peaks') {
        r = 92;
        g = 100;
        b = 82;
      } else if (biome === 'dusk') {
        r = 96;
        g = 84;
        b = 104;
      } else if (biome === 'ember') {
        // green gatewood in the south drying to sand, scorched near the belt
        const sandT = Math.max(0, Math.min(1, (z - 1545) / 145));
        r = 74 + 76 * sandT;
        g = 110 + 10 * sandT;
        b = 52 + 32 * sandT;
        const passT = 1 - Math.max(0, Math.min(1, (Math.abs(x + 10) - 26) / 26));
        const valley = passT * Math.max(0, Math.min(1, (z - 1930) / 80));
        const scorch = Math.max(0, Math.min(1, (z - 1880) / 100)) * (1 - valley);
        r = r * (1 - scorch * 0.35) - 60 * valley * (sandT > 0 ? 1 : 0);
        g = g * (1 - scorch * 0.45);
        b = b * (1 - scorch * 0.4) - 25 * valley;
      } else if (biome === 'frost') {
        // the Snowline corridor greens the map too, fading under the snow
        const passT = 1 - Math.max(0, Math.min(1, (Math.abs(x + 10) - 26) / 26));
        const snowline = Math.max(Math.min(1, Math.max(0, (z - 2055) / 85)), 1 - passT);
        r = 74 + 140 * snowline;
        g = 110 + 114 * snowline;
        b = 52 + 184 * snowline;
      } else if (biome === 'amber') {
        r = 168;
        g = 130;
        b = 58;
      } else if (biome === 'night') {
        // dream-violet downs
        r = 118;
        g = 106;
        b = 168;
      } else if (biome === 'haunt') {
        // the haunted wood reads near-black forest
        r = 48;
        g = 56;
        b = 44;
      }

      // -- high ground overrides (crag/snow tints per biome, as before) --
      if (biome === 'dusk' && h > 26) {
        r = 60;
        g = 50;
        b = 72;
      } else if (biome === 'dusk' && h > 11) {
        r = 78;
        g = 68;
        b = 88;
      } else if (biome === 'ember' && h > 20) {
        r = 84;
        g = 58;
        b = 52;
      } else if (biome === 'frost' && h > 22) {
        r = 188;
        g = 199;
        b = 214;
      } else if (biome === 'amber' && h > 20) {
        r = 128;
        g = 92;
        b = 58;
      } else if (biome === 'night' && h > 20) {
        r = 154;
        g = 140;
        b = 190;
      } else if (biome === 'haunt' && h > 20) {
        r = 82;
        g = 86;
        b = 78;
      } else if (biome === 'frost' && h > 6) {
        r = 202;
        g = 212;
        b = 226;
      } else if (h > 26) {
        // generic ridge / peak rock+snow
        r = 168;
        g = 172;
        b = 178;
      } else if (h > 11) {
        r = 112;
        g = 110;
        b = 102;
      } else if (h > 6) {
        r = 88;
        g = 102;
        b = 62;
      }

      const shore = h - WATER_LEVEL;
      const yardsPerPx = spanX / W;
      // slope in height-per-yard, resolution-independent, from the same
      // neighbours the hillshade uses
      const slope = Math.max(Math.abs(h - left), Math.abs(h - up)) / Math.max(yardsPerPx, 0.001);

      // -- hypsometric tint: valleys lush, high ground dry and pale --
      const lift = Math.max(0, Math.min(1, (h - 2) / 26));
      r += (30 - r * 0.06) * lift * 0.5;
      g += (16 - g * 0.05) * lift * 0.4;
      b *= 1 - lift * 0.08;

      // -- vegetation mottle: broad moisture patches + fine ground texture,
      // the thing that stops real land ever being one flat color --
      const veg = fbm2(x * 0.045, z * 0.045, seed + 601, 2) - 0.5;
      const grain = fbm2(x * 0.3, z * 0.3, seed + 613, 2) - 0.5;
      const mottle = 1 + veg * 0.16 + grain * 0.1;
      r *= mottle;
      g *= 1 + veg * 0.2 + grain * 0.1; // moisture reads mostly in the greens
      b *= mottle;

      // -- rock exposure: steep faces shed their vegetation --
      const rockT = Math.max(0, Math.min(1, (slope - 0.55) / 0.6));
      if (rockT > 0) {
        const rr = 122 + grain * 40;
        const rg = 116 + grain * 40;
        const rb = 106 + grain * 36;
        r += (rr - r) * rockT * 0.85;
        g += (rg - g) * rockT * 0.85;
        b += (rb - b) * rockT * 0.85;
      }

      // -- the carved slab edge: the coast facing away from the light is
      // cut as a dark cliff band, the lit coast gets a bright rim --
      if (shore < 4) {
        if (terrainHeight(x - 2.2, z - 2.2, seed) < WATER_LEVEL) {
          r *= 0.5;
          g *= 0.5;
          b *= 0.52;
        } else if (terrainHeight(x + 2.2, z + 2.2, seed) < WATER_LEVEL) {
          r = Math.min(255, r * 1.22 + 14);
          g = Math.min(255, g * 1.22 + 14);
          b = Math.min(255, b * 1.18 + 10);
        }
      }

      // -- the shoreline: a wet dark line at the waterline, dry pale sand above --
      if (shore < 1.6) {
        const t = 1 - shore / 1.6;
        if (shore < 0.5) {
          const wet = 1 - shore / 0.5;
          r += (128 - r) * wet * 0.8;
          g += (114 - g) * wet * 0.8;
          b += (88 - b) * wet * 0.8;
        } else {
          r += (176 - r) * t * 0.7;
          g += (160 - g) * t * 0.7;
          b += (122 - b) * t * 0.7;
        }
      }

      // -- forests: clumped painted crowns (round blobs with a lit rim on
      // the northwest, the hand-drawn-map read), kept off exposed rock --
      const density = FOREST_STIPPLE[biome] ?? 0.3;
      if (h < 22 && shore > 1.2 && rockT < 0.4) {
        const cx = Math.floor(x / 2.4);
        const cz = Math.floor(z / 2.4);
        const cell = hash2(cx, cz, seed + 271);
        if (cell < density) {
          const jx = (hash2(cx, cz, seed + 277) - 0.5) * 0.5;
          const jz = (hash2(cz, cx, seed + 283) - 0.5) * 0.5;
          const u = x / 2.4 - cx - 0.5 + jx;
          const v = z / 2.4 - cz - 0.5 + jz;
          const rad = 0.3 + cell * 0.45;
          const d = Math.sqrt(u * u + v * v);
          if (d < rad) {
            const crown = 0.62 + cell * 0.25;
            r *= crown;
            g *= crown * 1.1; // crowns keep a green cast
            b *= crown;
            // the lit rim toward the light (world +x,+z)
            if (u > rad * 0.25 && v > rad * 0.25) {
              r *= 1.3;
              g *= 1.3;
              b *= 1.25;
            }
          }
        }
      }

      // -- topographic contour lines (skip the beach so the coast stays
      // sand, and the high ground where the mountain glyphs take over) --
      if (shore > 1.6 && h <= 14) {
        const f = ((h % CONTOUR_STEP) + CONTOUR_STEP) % CONTOUR_STEP;
        if (f < CONTOUR_WIDTH) {
          r *= 0.78;
          g *= 0.78;
          b *= 0.78;
        }
      }

      // -- mountain glyphs: the hand-drawn caret marks every fantasy map
      // ranges its highlands with, inked with a lit northwest face (and a
      // snow-white one on frozen ground) --
      if (h > 14) {
        const gx = Math.floor(x / 7);
        const gz = Math.floor(z / 7);
        if (hash2(gx, gz, seed + 431) < 0.85) {
          const jx = (hash2(gx, gz, seed + 433) - 0.5) * 0.24;
          const jz = (hash2(gz, gx, seed + 437) - 0.5) * 0.24;
          const u = x / 7 - gx - 0.5 + jx;
          const v = z / 7 - gz - 0.5 + jz;
          // the caret: apex up-screen (v positive is screen-up in world +z)
          const ridge = 0.2 - 1.3 * Math.abs(u);
          const strokeW = Math.max(0.06, (yardsPerPx / 7) * 1.2);
          if (Math.abs(u) < 0.34 && v > -0.26 && v < ridge + strokeW) {
            const snowy = biome === 'frost' || biome === 'peaks' || h > 26;
            if (v > ridge - strokeW) {
              // the inked ridge line
              r *= 0.4;
              g *= 0.4;
              b *= 0.42;
            } else if (u < 0) {
              // the shadowed southeast face
              r *= 0.62;
              g *= 0.62;
              b *= 0.64;
            } else if (snowy) {
              // the lit face carries the snow
              r = r * 0.3 + 205 * 0.7;
              g = g * 0.3 + 212 * 0.7;
              b = b * 0.3 + 222 * 0.7;
            } else {
              r *= 1.28;
              g *= 1.24;
              b *= 1.18;
            }
          }
        }
      }

      // -- settlements and roads over everything --
      let nearHub = false;
      let hubRing = false;
      for (const zn of ZONES) {
        const d = Math.hypot(x - zn.hub.x, z - zn.hub.z);
        if (d < 11) {
          nearHub = true;
          break;
        }
        if (d < 14) {
          hubRing = true;
          break;
        }
      }
      if (nearHub) {
        r = 146;
        g = 118;
        b = 80;
      } else if (hubRing) {
        r = 74;
        g = 58;
        b = 40;
      } else {
        const road = roadDistance(x, z);
        if (road < 4.2) {
          // a worn dirt track, not a painted band: the width wobbles like a
          // real path, the middle is packed pale by feet and wheels, and the
          // verge is inked so it reads against every ground color
          const wobble = (fbm2(x * 0.3, z * 0.3, seed + 911, 2) - 0.5) * 0.9;
          const core = 2.0 + wobble;
          if (road < core * 0.45) {
            r = 178;
            g = 152;
            b = 110;
          } else if (road < core) {
            r = 156;
            g = 128;
            b = 88;
          } else if (road < core + 1.0) {
            r *= 0.7;
            g *= 0.7;
            b *= 0.7;
          }
        }
      }

      // -- two-axis hillshade, lit from the northwest --
      const shade = Math.max(0.6, Math.min(1.42, 1 + (h - left) * 0.13 + (h - up) * 0.13));
      r = Math.min(255, r * shade);
      g = Math.min(255, g * shade);
      b = Math.min(255, b * shade);

      const k = (iy * W + ix) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = 255;
    }
    // the just-painted row becomes the next row's "up" neighbours
    const swap = prevRow;
    prevRow = curRow;
    curRow = swap;
  }
}
