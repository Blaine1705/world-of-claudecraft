// The seasonal city dressing's placement resolver: turns the declarative anchor
// rules (content/gourdlight_eve_decor.ts) into concrete pieces against the LIVE
// world, so a city rework moves the dressing with it and a new building never
// ends up with a pumpkin inside it.
//
// Every piece is anchored to something that moves with the city (a streetlamp
// from the sim's lamp plan, a trick-or-treat NPC, the event keeper, the town
// hub) and then checked:
//   - ground pieces (pumpkins, gourds) must stand clear of every static collider
//     (`isBlocked`, the same query movement uses), off the painted road, off any
//     NPC's standing spot, out of water, and apart from each other. A candidate
//     that fails is NUDGED round a small spiral of offsets; one that never finds
//     a clear spot is dropped, never forced;
//   - an overhead garland strung between two lamps must clear every collider
//     along its whole run (sampled every yard), so it never cuts through a wall.
//
// Pure and deterministic: no rng (variety comes from hashing the anchor id), no
// clock, no Three. The renderer draws exactly this list; the test
// (tests/seasonal_decor_layout.test.ts) re-runs it against the shipped world and
// fails on any overlap, so the gate catches a city change that breaks it.
import { isBlocked, streetlampPlacements } from './colliders';
import { GOURDLIGHT_KEEPER_NPC, TRICK_OR_TREAT_NPC_IDS } from './content/gourdlight_eve';
import {
  GOURDLIGHT_DECOR_CITIES,
  type SeasonalCityDecorRule,
} from './content/gourdlight_eve_decor';
import { getActiveWorldContent, NPCS } from './data';
import { hash2 } from './rng';
import type { PlacedStreetlamp } from './streetlamp_layout';
import { STREETLAMP_COLLIDER_RADIUS, type StreetlampStyleId } from './streetlamp_style';
import { groundHeight, roadDistance, WATER_LEVEL } from './world';

export type SeasonalGroundKind = 'pumpkin_lit' | 'pumpkin_small' | 'gourd' | 'garland_pole';

export interface SeasonalGroundPiece {
  kind: SeasonalGroundKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** What it hangs off ('lamp:<i>', 'npc:<id>', 'keeper', 'square:<zone>'). */
  anchor: string;
}

/** A paper lantern hung on a lamp post's bracket. */
export interface SeasonalLantern {
  x: number;
  y: number;
  z: number;
  yaw: number;
  anchor: string;
}

/** An overhead leaf-and-lantern garland strung between two lamp posts, or from a
 *  lamp post across its road to a festival pole on the far side. */
export interface SeasonalGarland {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  /** How far the middle hangs below the straight line (yards). */
  sag: number;
  anchor: string;
}

export interface SeasonalDecorLayout {
  ground: SeasonalGroundPiece[];
  lanterns: SeasonalLantern[];
  garlands: SeasonalGarland[];
}

/** Body radius a ground piece claims (the big carved pumpkin's footprint). */
export const DECOR_GROUND_RADIUS = 0.75;
/** Each kind's size against its authored model: festival pumpkins are big,
 *  grown for show, so they read at a glance beside a full-size character. */
export const DECOR_KIND_SCALE: Readonly<Record<SeasonalGroundKind, number>> = {
  pumpkin_lit: 1.9,
  pumpkin_small: 1.5,
  gourd: 1.7,
  garland_pole: 1.15,
};
/** Pieces closer than this to an NPC's standing spot would stand in their way. */
export const DECOR_NPC_CLEARANCE = 1.3;
/** Never on the painted track: at least this far from the road centre line. */
export const DECOR_ROAD_CLEARANCE = 3.2;
/** Two ground pieces never closer than this (centre to centre). */
export const DECOR_MIN_SPACING = 1.5;
/** How far from a post's centre its shaft's surface is at lantern height, per
 *  fixture (yards): the bracket's back plate sits against the shaft, not in air.
 *  Measured off the shipped fixtures; an unlisted style takes 0.16. */
const LANTERN_POST_REACH: Readonly<Partial<Record<StreetlampStyleId, number>>> = {
  eastbrook_civic: 0.1,
  mirefen_witchflame: 0.13,
  thornpeak_beacon: 0.2,
};
/** Lantern height on its post, above the post's foot. */
export const DECOR_LANTERN_HEIGHT = 2.7;
/** Garland attach height on its posts, above each foot. */
export const DECOR_GARLAND_HEIGHT = 3.7;
/** The longest garland run strung between two posts (yards). */
export const DECOR_GARLAND_MAX_SPAN = 30;
/** A festival pole's garland attach height above its foot (the pole is a little taller). */
export const DECOR_POLE_GARLAND_HEIGHT = 3.5 * 1.15;
/** How far across its road a lamp's festival pole may stand (yards from the post). */
const POLE_REACH: readonly number[] = [8, 9, 10, 11, 12, 7, 13];
/** Which way from the post the pole is tried: across the road first, then
 *  along the roadside either way (a garland beside the road, not over it). */
const POLE_TURNS: readonly number[] = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
const GARLAND_MIN_SPAN = 6;
const GARLAND_MAX_RISE = 3;
const GARLAND_SAMPLE_STEP = 1;
const GARLAND_END_SKIP = 1.2;
/** Clearance past a post's own collider before the garland's run is sampled. */
const POST_SKIP_MARGIN = 0.45;

function postSkip(style: StreetlampStyleId): number {
  return Math.max(GARLAND_END_SKIP, STREETLAMP_COLLIDER_RADIUS[style] + POST_SKIP_MARGIN);
}

/** The nudge spiral: the anchor's own spot first, then rings out to 2.4 yd. */
const NUDGES: readonly { dx: number; dz: number }[] = (() => {
  const out = [{ dx: 0, dz: 0 }];
  for (const r of [0.4, 0.8, 1.2, 1.7, 2.4]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + r;
      out.push({ dx: Math.sin(a) * r, dz: Math.cos(a) * r });
    }
  }
  return out;
})();

function anchorHash(anchor: string, salt: number): number {
  let h = 0;
  for (let i = 0; i < anchor.length; i++) h = (h * 31 + anchor.charCodeAt(i)) | 0;
  return hash2(h, salt, 0x6f2d) / 4294967296;
}

interface Probe {
  seed: number;
  npcSpots: readonly { x: number; z: number }[];
  placed: { x: number; z: number }[];
}

/** Why a ground spot is refused, or null when it is clear (exported for the test). */
export function groundSpotProblem(
  seed: number,
  x: number,
  z: number,
  npcSpots: readonly { x: number; z: number }[],
  placed: readonly { x: number; z: number }[],
): 'collider' | 'road' | 'npc' | 'water' | 'crowded' | null {
  if (groundHeight(x, z, seed) < WATER_LEVEL + 0.4) return 'water';
  if (roadDistance(x, z) < DECOR_ROAD_CLEARANCE) return 'road';
  for (const n of npcSpots) if (Math.hypot(n.x - x, n.z - z) < DECOR_NPC_CLEARANCE) return 'npc';
  for (const p of placed) if (Math.hypot(p.x - x, p.z - z) < DECOR_MIN_SPACING) return 'crowded';
  if (isBlocked(seed, x, z, DECOR_GROUND_RADIUS)) return 'collider';
  return null;
}

function seat(
  probe: Probe,
  out: SeasonalGroundPiece[],
  kind: SeasonalGroundKind,
  x: number,
  z: number,
  anchor: string,
  scale: number,
  face: number,
): boolean {
  for (const n of NUDGES) {
    const px = x + n.dx;
    const pz = z + n.dz;
    if (groundSpotProblem(probe.seed, px, pz, probe.npcSpots, probe.placed) !== null) continue;
    // A carved face turns toward whoever walks past (`face`), give or take a little.
    const yaw = face + (anchorHash(anchor, 1) - 0.5) * 0.6;
    const size = scale * DECOR_KIND_SCALE[kind];
    out.push({ kind, x: px, y: groundHeight(px, pz, probe.seed), z: pz, yaw, scale: size, anchor });
    probe.placed.push({ x: px, z: pz });
    return true;
  }
  return false;
}

/** The run's own posts are colliders: skip each end by its post's radius. */
function garlandClear(seed: number, g: SeasonalGarland, skipA: number, skipB: number): boolean {
  const span = Math.hypot(g.bx - g.ax, g.bz - g.az);
  for (let d = skipA; d <= span - skipB; d += GARLAND_SAMPLE_STEP) {
    const t = d / span;
    const x = g.ax + (g.bx - g.ax) * t;
    const z = g.az + (g.bz - g.az) * t;
    if (isBlocked(seed, x, z, 0.2)) return false;
  }
  return true;
}

function cityDecor(
  seed: number,
  rule: SeasonalCityDecorRule,
  hub: { x: number; z: number },
  lamps: readonly PlacedStreetlamp[],
  probe: Probe,
  layout: SeasonalDecorLayout,
): void {
  const inTown = (x: number, z: number) => Math.hypot(x - hub.x, z - hub.z) <= rule.radius;
  // Lamps in town, by stable plan index (the anchor id survives a re-plan that
  // only moves posts, and a new post simply joins the list).
  const town = lamps
    .map((lamp, index) => ({ lamp, index }))
    .filter(({ lamp }) => inTown(lamp.x, lamp.z));
  for (const { lamp, index } of town) {
    const anchor = `lamp:${index}`;
    // The post's road side: roadYaw points from the post at the road. The
    // lantern hangs off the post's flank, a quarter turn from the road, so it
    // never clashes with the fixture's own arm over the track.
    const side = lamp.roadYaw + Math.PI / 2;
    const reach = LANTERN_POST_REACH[lamp.style] ?? 0.16;
    layout.lanterns.push({
      x: lamp.x + Math.sin(side) * reach,
      y: lamp.y + DECOR_LANTERN_HEIGHT,
      z: lamp.z + Math.cos(side) * reach,
      yaw: side,
      anchor,
    });
    // Gourds at the post's foot, on the side AWAY from the road.
    const back = lamp.roadYaw + Math.PI;
    const bx = lamp.x + Math.sin(back) * 1.25;
    const bz = lamp.z + Math.cos(back) * 1.25;
    seat(probe, layout.ground, 'pumpkin_lit', bx, bz, `${anchor}:a`, 1, lamp.roadYaw);
    if (anchorHash(anchor, 2) < 0.6) {
      const ox = Math.sin(back + 0.9) * 1.7;
      const oz = Math.cos(back + 0.9) * 1.7;
      seat(
        probe,
        layout.ground,
        'gourd',
        lamp.x + ox,
        lamp.z + oz,
        `${anchor}:b`,
        0.9,
        lamp.roadYaw,
      );
    }
  }
  // Garlands: each post strung to its nearest neighbour (once per pair), when
  // the run is a sensible street width and every yard of it is clear.
  const strung = new Set<string>();
  for (const { lamp: a, index: ia } of town) {
    let best: { lamp: (typeof town)[number]['lamp']; index: number; d: number } | null = null;
    for (const { lamp: b, index: ib } of town) {
      if (ib === ia) continue;
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d < GARLAND_MIN_SPAN || d > DECOR_GARLAND_MAX_SPAN) continue;
      if (Math.abs(b.y - a.y) > GARLAND_MAX_RISE) continue;
      if (!best || d < best.d) best = { lamp: b, index: ib, d };
    }
    if (!best) continue;
    const key = ia < best.index ? `${ia}-${best.index}` : `${best.index}-${ia}`;
    if (strung.has(key)) continue;
    const g: SeasonalGarland = {
      ax: a.x,
      ay: a.y + DECOR_GARLAND_HEIGHT,
      az: a.z,
      bx: best.lamp.x,
      by: best.lamp.y + DECOR_GARLAND_HEIGHT,
      bz: best.lamp.z,
      sag: Math.min(1.6, 0.35 + best.d * 0.05),
      anchor: `garland:${key}`,
    };
    if (!garlandClear(seed, g, postSkip(a.style), postSkip(best.lamp.style))) continue;
    strung.add(key);
    layout.garlands.push(g);
  }
  // Festival poles: every town lamp not already strung to a neighbour is strung
  // ACROSS its road to a pole on the far side, so the streets read as dressed.
  for (const { lamp, index } of town) {
    if ([...strung].some((key) => key.split('-').includes(String(index)))) continue;
    let done = false;
    for (const turn of POLE_TURNS) {
      if (done) break;
      const dir = lamp.roadYaw + turn;
      for (const reach of POLE_REACH) {
        const px = lamp.x + Math.sin(dir) * reach;
        const pz = lamp.z + Math.cos(dir) * reach;
        if (groundSpotProblem(seed, px, pz, probe.npcSpots, probe.placed) !== null) continue;
        const py = groundHeight(px, pz, seed);
        if (Math.abs(py - lamp.y) > GARLAND_MAX_RISE) continue;
        const g: SeasonalGarland = {
          ax: lamp.x,
          ay: lamp.y + DECOR_GARLAND_HEIGHT,
          az: lamp.z,
          bx: px,
          by: py + DECOR_POLE_GARLAND_HEIGHT,
          bz: pz,
          sag: 0.35 + reach * 0.05,
          anchor: `garland:lamp:${index}`,
        };
        if (!garlandClear(seed, g, postSkip(lamp.style), GARLAND_END_SKIP)) continue;
        const anchor = `pole:${index}`;
        layout.ground.push({
          kind: 'garland_pole',
          x: px,
          y: py,
          z: pz,
          yaw: dir,
          scale: DECOR_KIND_SCALE.garland_pole,
          anchor,
        });
        probe.placed.push({ x: px, z: pz });
        layout.garlands.push(g);
        done = true;
        break;
      }
    }
  }
  // A lit pumpkin at every knocking door in this town: the read for "knock here".
  for (const id of [...TRICK_OR_TREAT_NPC_IDS].sort()) {
    const npc = NPCS[id];
    if (!npc || !inTown(npc.pos.x, npc.pos.z)) continue;
    const a = npc.facing + Math.PI / 2;
    seat(
      probe,
      layout.ground,
      'pumpkin_small',
      npc.pos.x + Math.sin(a) * 1.6,
      npc.pos.z + Math.cos(a) * 1.6,
      `npc:${id}`,
      1,
      npc.facing,
    );
  }
  // The square: a ring of gourds round the hub.
  for (let k = 0; k < rule.square.count; k++) {
    const a = (k / rule.square.count) * Math.PI * 2 + anchorHash(rule.zoneId, 3) * Math.PI;
    const kind: SeasonalGroundKind = k % 2 === 0 ? 'pumpkin_lit' : 'gourd';
    seat(
      probe,
      layout.ground,
      kind,
      hub.x + Math.sin(a) * rule.square.ring,
      hub.z + Math.cos(a) * rule.square.ring,
      `square:${rule.zoneId}:${k}`,
      kind === 'gourd' ? 1.1 : 1.15,
      a,
    );
  }
}

/** Resolve the whole seasonal dressing for the active world at `seed`. */
export function resolveSeasonalDecor(seed: number): SeasonalDecorLayout {
  const layout: SeasonalDecorLayout = { ground: [], lanterns: [], garlands: [] };
  const content = getActiveWorldContent();
  const npcSpots = Object.values(NPCS).map((n) => ({ x: n.pos.x, z: n.pos.z }));
  const probe: Probe = { seed, npcSpots, placed: [] };
  const lamps = streetlampPlacements(seed);
  for (const rule of GOURDLIGHT_DECOR_CITIES) {
    const zone = content.zones.find((z) => z.id === rule.zoneId);
    if (!zone) continue;
    cityDecor(seed, rule, zone.hub, lamps, probe, layout);
  }
  // The keeper's stand: a pile of gourds either side of her.
  const k = GOURDLIGHT_KEEPER_NPC;
  for (const [i, off] of [
    [0, -1.9],
    [1, 1.9],
    [2, -2.6],
  ] as const) {
    const a = k.facing + Math.PI / 2;
    const fx = Math.sin(k.facing) * -0.6;
    const fz = Math.cos(k.facing) * -0.6;
    const kind: SeasonalGroundKind = i === 2 ? 'gourd' : 'pumpkin_lit';
    seat(
      probe,
      layout.ground,
      kind,
      k.pos.x + Math.sin(a) * off + fx,
      k.pos.z + Math.cos(a) * off + fz,
      `keeper:${i}`,
      i === 2 ? 1.2 : 1.25,
      k.facing,
    );
  }
  return layout;
}

const layoutMemo = new WeakMap<object, Map<number, SeasonalDecorLayout>>();

/** The memoized layout per active world and seed (its colliders are fixed once built). */
export function seasonalDecorLayout(seed: number): SeasonalDecorLayout {
  const content = getActiveWorldContent();
  let bySeed = layoutMemo.get(content);
  if (!bySeed) {
    bySeed = new Map();
    layoutMemo.set(content, bySeed);
  }
  let layout = bySeed.get(seed);
  if (!layout) {
    layout = resolveSeasonalDecor(seed);
    bySeed.set(seed, layout);
  }
  return layout;
}
