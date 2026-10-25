// Pure plan of the Breath vein's Blender kit (phase 2G: docs/design/raid/kit/
// build_smith_heart_breath_kit.py, painted by breath_kit.ts): where every
// Kit_* piece of the Breath stands, from its mouth up to the Storm Cornice.
//
//   - the Cornice's lightning rods (a strike's scar of fused glass at each
//     foot), its two great stone wind-horns (their bells open to the rim),
//     and the wind bridge's shelters, on the layout's props and colliders;
//   - the Wind Bridge's natural arch under its ramp (the field then draws
//     only a shallow keel under the deck, `BREATH_KIT_SHALLOW`);
//   - the low walls along every Breath walk over the void (the edge planner's
//     modules, past the lip over the drop, never over a walk);
//   - each wind channel (the notches in the Cornice's rim) flanked by two
//     cheek stones past its mouth's corners, the groove the Smith cut leading
//     the updraft in from it across the floor;
//   - wind-carved standing stones past the landings' rims, and the cracked
//     plateau's fissures (flat inlays every telegraph draws over).
//
// Nothing render-only stands over a walked floor beyond a hand: the inlays
// are flat, the walls, the jambs and the stones stand past the lips, and
// every solid a body can touch stands on a layout collider. Three-free,
// DOM-free, deterministic (a hash, never rng).

import {
  BREATH,
  CORNICE_CHANNELS,
  SMITH_HEART_FIELD,
  WIND_BRIDGE,
} from '../../sim/content/smith_heart_layout';
import {
  authoredFieldCliffRuns,
  authoredFieldHeight,
  authoredFieldSurfaceAt,
} from '../../sim/instances/authored_field';
import type { HeartKitPlacement } from './heart_kit_core';
import { heartHash, heartPropBase } from './heart_plan_core';

/** The layout prop kinds the kit draws in place of their placeholders. */
export const BREATH_KIT_KINDS: ReadonlySet<string> = new Set([
  'sh_lightning_rod',
  'sh_broken_bellows',
  'sh_wind_shelter',
  'sh_channel_jamb',
  'sh_storm_stone',
]);

/** Every walked floor of the Breath (their lips over the void take the
 *  low walls). */
export const BREATH_WALK_SURFACES: ReadonlySet<string> = new Set([
  'breath_mouth',
  'breath_b1',
  'breath_chimney',
  'breath_b2',
  'wind_bridge',
  'breath_b3',
  'cornice_climb',
  'storm_cornice',
]);

/** The floors whose drop the kit's own rock draws (the Wind Bridge's arch):
 *  once the kit has landed the field draws only a shallow keel under them,
 *  and the mountain's hanging lips leave them alone. */
export const BREATH_KIT_SHALLOW: ReadonlySet<string> = new Set(['wind_bridge']);
/** How deep the field's keel runs under a shallow floor (yards). */
export const BREATH_KIT_KEEL = 3;

/** A wall module's half length at stretch 1, and its span out past the lip
 *  (yards, pinned against the GLB). */
export const BREATH_WALL = { half: 3, near: 0.05, far: 1.0, height: 0.95 } as const;

/** The measures of the Wind Bridge (its ramp's run along +X of the arch). */
export function windBridgeFrame(): { x: number; z: number; rot: number; run: number } {
  const dx = WIND_BRIDGE.toX - WIND_BRIDGE.fromX;
  const dz = WIND_BRIDGE.toZ - WIND_BRIDGE.fromZ;
  const run = Math.hypot(dx, dz);
  // Local +X (cos rot, -sin rot) along the ramp.
  return { x: WIND_BRIDGE.fromX, z: WIND_BRIDGE.fromZ, rot: Math.atan2(-dz, dx), run };
}

const F = SMITH_HEART_FIELD;

/** The point at compass `deg` on the Cornice's rim ellipse, `inset` yards in. */
function corniceAt(deg: number, inset: number): { x: number; z: number } {
  const C = BREATH.cornice;
  const a = (deg * Math.PI) / 180;
  return { x: C.x + Math.sin(a) * (C.rx - inset), z: C.z + Math.cos(a) * (C.rz - inset) };
}

/** The channel nearest (x, z) on the Cornice: the stone's compass bearing
 *  and which side of the channel's line it stands (+1: the channel lies
 *  clockwise of it). */
function nearestChannel(x: number, z: number): { at: number; side: number } {
  const C = BREATH.cornice;
  const at = ((((Math.atan2(x - C.x, z - C.z) * 180) / Math.PI) % 360) + 360) % 360;
  let best = CORNICE_CHANNELS[0];
  let off = 999;
  for (const ch of CORNICE_CHANNELS) {
    let d = ch.deg - at;
    d = ((d + 540) % 360) - 180;
    if (Math.abs(d) < Math.abs(off)) {
      off = d;
      best = ch;
    }
  }
  return { at: best.deg - off, side: off > 0 ? 1 : -1 };
}

function nearestLanding(x: number, z: number): { x: number; z: number } {
  let best: { x: number; z: number } = BREATH.b1;
  for (const c of [BREATH.b1, BREATH.b2, BREATH.b3])
    if (Math.hypot(x - c.x, z - c.z) < Math.hypot(x - best.x, z - best.z)) best = c;
  return best;
}

/** The layout's props fitted with their pieces: the rods (and their
 *  scars), the horns (each bell turned to the rim) and the shelters. */
export function planBreathProps(): HeartKitPlacement[] {
  const out: HeartKitPlacement[] = [];
  const C = BREATH.cornice;
  for (const p of F.props) {
    if (!BREATH_KIT_KINDS.has(p.kind)) continue;
    const y = heartPropBase(p.x, p.z);
    if (p.kind === 'sh_lightning_rod') {
      // The fork's opening (local X) across the bearing: the crown's
      // crystal faces the Cornice's middle.
      const rot = Math.atan2(C.x - p.x, C.z - p.z);
      out.push({ piece: 'Kit_StormRod', x: p.x, y, z: p.z, rot });
      out.push({
        piece: 'Kit_StrikeScar',
        x: p.x,
        y: y + 0.02,
        z: p.z,
        rot: heartHash(Math.round(p.x), Math.round(p.z)) * Math.PI * 2,
        noShadow: true,
        cosmetic: true,
      });
    } else if (p.kind === 'sh_broken_bellows') {
      // The collider box is symmetric: turn the bell (local +Z) to whichever
      // end faces out to the rim.
      const ox = p.x - C.x;
      const oz = p.z - C.z;
      const facesOut = Math.sin(p.rot) * ox + Math.cos(p.rot) * oz > 0;
      out.push({
        piece: 'Kit_WindHorn',
        x: p.x,
        y,
        z: p.z,
        rot: facesOut ? p.rot : p.rot + Math.PI,
      });
    } else if (p.kind === 'sh_channel_jamb') {
      // The blade leans (local +X) out over its channel's line.
      const ch = nearestChannel(p.x, p.z);
      const a = (ch.at * Math.PI) / 180;
      out.push({ piece: 'Kit_ChannelJamb', x: p.x, y, z: p.z, rot: ch.side > 0 ? a : a + Math.PI });
    } else if (p.kind === 'sh_storm_stone') {
      // Its scalloped windward face (local +Z) out to the gale past the rim.
      const c = nearestLanding(p.x, p.z);
      out.push({
        piece: 'Kit_StormStone',
        x: p.x,
        y,
        z: p.z,
        rot: Math.atan2(p.x - c.x, p.z - c.z),
      });
    } else {
      out.push({ piece: 'Kit_WindShelter', x: p.x, y, z: p.z, rot: p.rot });
    }
  }
  const b = windBridgeFrame();
  out.push({ piece: 'Kit_WindBridge', x: b.x, y: BREATH.b2.h, z: b.z, rot: b.rot, noShadow: true });
  return out;
}

/** A wall module's length along a lip (yards): short enough that its chord
 *  hugs a landing's curve (the walls bend round it a module at a time). */
export const BREATH_WALL_MODULE = 4;

/** The Breath walks' lips over the void, chained end to end per surface:
 *  each chain a polyline along the lip with the outward normal at each run. */
function breathLipChains(): { x: number; z: number; nx: number; nz: number }[][] {
  const runs = authoredFieldCliffRuns(F).filter(
    (r) =>
      BREATH_WALK_SURFACES.has(r.surface) &&
      r.low <= F.voidHeight + 1 &&
      r.high - r.low >= 4 &&
      Math.hypot(r.bx - r.ax, r.bz - r.az) > 1e-3,
  );
  const chains: { x: number; z: number; nx: number; nz: number }[][] = [];
  let last: (typeof runs)[number] | null = null;
  for (const r of runs) {
    const joined =
      last && last.surface === r.surface && Math.hypot(last.bx - r.ax, last.bz - r.az) < 0.05;
    if (!joined) chains.push([{ x: r.ax, z: r.az, nx: r.nx, nz: r.nz }]);
    chains[chains.length - 1].push({ x: r.bx, z: r.bz, nx: r.nx, nz: r.nz });
    last = r;
  }
  return chains;
}

/** The low walls along every Breath walk's lip over the void: modules a
 *  few yards long walked along each lip's chain, each set on its chord and
 *  pushed out past the lip's own bow (never over the walk), following a
 *  stair's slope, none where the lip bends onto another floor. */
export function planBreathWalls(): HeartKitPlacement[] {
  const out: HeartKitPlacement[] = [];
  const ground = (x: number, z: number) => authoredFieldHeight(F, x, z);
  for (const chain of breathLipChains()) {
    const cum = [0];
    for (let i = 1; i < chain.length; i++)
      cum.push(cum[i - 1] + Math.hypot(chain[i].x - chain[i - 1].x, chain[i].z - chain[i - 1].z));
    const total = cum[cum.length - 1];
    if (total < BREATH_WALL_MODULE * 0.6) continue;
    const pieces = Math.max(1, Math.round(total / BREATH_WALL_MODULE));
    const len = total / pieces;
    const at = (s: number) => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      const a = chain[i - 1];
      const b = chain[i];
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, i };
    };
    for (let k = 0; k < pieces; k++) {
      const p0 = at(k * len);
      const p1 = at((k + 1) * len);
      const cx = (p0.x + p1.x) / 2;
      const cz = (p0.z + p1.z) / 2;
      let ux = p1.x - p0.x;
      let uz = p1.z - p0.z;
      const ul = Math.hypot(ux, uz) || 1;
      ux /= ul;
      uz /= ul;
      // The outward normal: the chord's perpendicular on the runs' side.
      let nx = uz;
      let nz = -ux;
      const run = chain[Math.min(chain.length - 1, p0.i)];
      if (nx * run.nx + nz * run.nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      // Out past the lip's own bow between the chord's ends.
      let bow = 0;
      for (let i = p0.i; i < p1.i; i++)
        bow = Math.max(bow, (chain[i].x - cx) * nx + (chain[i].z - cz) * nz);
      const x = cx + nx * (bow + 0.02);
      const z = cz + nz * (bow + 0.02);
      const rot = Math.atan2(nx, nz);
      const stretch = ul / (BREATH_WALL.half * 2);
      if (stretch < 0.35 || !wallClear(x, z, rot, stretch)) continue;
      // Local +X is (cos rot, -sin rot): the slope along it.
      const lx = Math.cos(rot);
      const lz = -Math.sin(rot);
      const y0 = ground(x - lx * ul * 0.45 - nx * 0.4, z - lz * ul * 0.45 - nz * 0.4);
      const y1 = ground(x + lx * ul * 0.45 - nx * 0.4, z + lz * ul * 0.45 - nz * 0.4);
      const y = ground(x - nx * 0.4, z - nz * 0.4);
      const shear = Math.abs(y1 - y0) < ul ? (y1 - y0) / (ul * 0.9) : 0;
      const h = heartHash(Math.round(x * 3), Math.round(z * 3));
      out.push({
        piece: h < 0.22 ? 'Kit_BreathWallB' : 'Kit_BreathWallA',
        x,
        y,
        z,
        rot,
        stretch,
        shear,
        noShadow: true,
      });
    }
  }
  return out;
}

/** Does a wall module at (x, z) turned by `rot` stand wholly over the drop
 *  (none where the lip bends onto another floor)? */
export function wallClear(x: number, z: number, rot: number, stretch: number): boolean {
  const ux = Math.cos(rot);
  const uz = -Math.sin(rot);
  const nx = Math.sin(rot);
  const nz = Math.cos(rot);
  const half = BREATH_WALL.half * stretch;
  for (let k = -6; k <= 6; k++) {
    const a = (k / 6) * half;
    for (const w of [0.2, 0.55, BREATH_WALL.far]) {
      if (authoredFieldSurfaceAt(F, x + ux * a + nx * w, z + uz * a + nz * w)) return false;
    }
  }
  return true;
}

/** Each wind channel's groove, cut in the Cornice's floor to lead the
 *  updraft in from its notch (its cheek stones are layout props). */
export function planBreathChannels(): HeartKitPlacement[] {
  const C = BREATH.cornice;
  return CORNICE_CHANNELS.map((ch) => {
    // The groove's notch end (local +Z) toward the rim.
    const tip = corniceAt(ch.deg, ch.depth + 7);
    return {
      piece: 'Kit_WindGroove',
      x: tip.x,
      y: C.h + 0.015,
      z: tip.z,
      rot: (ch.deg * Math.PI) / 180,
      noShadow: true,
      cosmetic: true,
    };
  });
}

/** The cracked plateau's fissures, flat on the Cornice's floor (more
 *  toward its rim) and a star on each landing. */
export function planBreathDressing(): HeartKitPlacement[] {
  const out: HeartKitPlacement[] = [];
  // The cracked plateau: long fissures and stars on the Cornice's floor,
  // more toward its rim, a few on the landings.
  const cracks: { x: number; z: number; piece: string }[] = [];
  for (let k = 0; k < 16; k++) {
    const deg = k * 22.5 + heartHash(k, 71) * 14;
    const inset = 8 + heartHash(k, 73) * 26;
    const p = corniceAt(deg, inset);
    cracks.push({ ...p, piece: k % 3 === 2 ? 'Kit_PlateauCrackB' : 'Kit_PlateauCrackA' });
  }
  for (const c of [BREATH.b1, BREATH.b2, BREATH.b3])
    cracks.push({ x: c.x + 2, z: c.z - 3, piece: 'Kit_PlateauCrackB' });
  for (const [i, c] of cracks.entries()) {
    const s = authoredFieldSurfaceAt(F, c.x, c.z);
    if (!s || !BREATH_WALK_SURFACES.has(s.id)) continue;
    out.push({
      piece: c.piece,
      x: c.x,
      y: authoredFieldHeight(F, c.x, c.z) + 0.012,
      z: c.z,
      rot: heartHash(i, 79) * Math.PI * 2,
      noShadow: true,
      cosmetic: true,
    });
  }
  return out;
}

/** The whole Breath kit's dressing. */
export function planBreathKit(): HeartKitPlacement[] {
  return [
    ...planBreathProps(),
    ...planBreathWalls(),
    ...planBreathChannels(),
    ...planBreathDressing(),
  ];
}
