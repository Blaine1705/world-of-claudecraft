// Wickharbor's wooden harbor (the Galecrest): the shore boardwalk laid along the waterline
// under the bluff, the two piers fanned out over the bay from it, the two stairs climbing
// the bluff from it to the town, and the Old Beacon's dock with the stair down the
// headland to it. Data-as-code; ../gale_harbor.ts walks the decks (GALE_HARBOR_DECKS), the
// colliders are built by ../wickharbor_harbor.ts, and render/wickharbor_harbor.ts draws the
// one Blender model (public/models/props/wickharbor_harbor.glb,
// scripts/assets/wickharbor_harbor/, which reads THESE numbers through its exported
// layout.json). The ferry wharf off the boardwalk's south end is its own record
// (content/wickharbor_wharf.ts) in the same wood.
//
// The harbor frame is the boardwalk's: `u` along it (its heading, south), `v` across it
// (positive seaward, east). Every plank surface is set above the water here, never by the
// ground under it, so each one is exact whatever the terrain; the shore anchors (ax, az)
// only keep the terrain under the roots padded as it always was (terrain_calm_anchors.ts),
// and the decks keep their old order for that.
//
// The joins, so no two floors ever share a plank plane:
//  - the middle pier runs square off the boardwalk's seaward edge, its root ON that edge;
//  - the north pier keeps its fanned heading and is cut along that same edge, so the two
//    share the edge and nothing else;
//  - the north stair runs square off the boardwalk's landward edge from the boardwalk's own
//    height, and lands on the bluff top where the ground meets it;
//  - the south stair climbs a bluff too steep for that: its first tread stands ON the
//    boardwalk's landward edge a step above the planks (the ferry wharf's flight idiom);
//  - the Beacon dock is cut along the end of the stair that comes down onto its root.
// tests/wickharbor_harbor.test.ts pins all of it and walks every route.
//
// Scale: the player model stands 2.6 yd to the crown on a 0.5 yd body radius and climbs
// 0.9 yd unaided (MAX_STEP_HEIGHT): the boardwalk is 3.4 wide, the piers 3.6 to 4.4, the
// stairs 2.6 to 2.8, and the rails stand 1.2 yd (the wharf's, above a jump).

import type { GaleDeckCut, GaleDeckDef } from '../gale_harbor';
import type { WyrmwatchHarborProp } from './wyrmwatch_harbor';

/** The harbor frame: the boardwalk's centre and heading (atan2(dx, dz)). */
export const WICKHARBOR_HARBOR_FRAME = { x: 467.5, z: 358, rot: -0.124 } as const;

const SU = Math.sin(WICKHARBOR_HARBOR_FRAME.rot);
const CU = Math.cos(WICKHARBOR_HARBOR_FRAME.rot);

/** A harbor-frame point (u along the boardwalk, v across it, seaward positive) in world yards. */
export function harborPoint(u: number, v: number): { x: number; z: number } {
  return {
    x: WICKHARBOR_HARBOR_FRAME.x + SU * u + CU * v,
    z: WICKHARBOR_HARBOR_FRAME.z + CU * u - SU * v,
  };
}

/** A world point in the harbor frame. */
export function harborLocal(x: number, z: number): { u: number; v: number } {
  const dx = x - WICKHARBOR_HARBOR_FRAME.x;
  const dz = z - WICKHARBOR_HARBOR_FRAME.z;
  return { u: dx * SU + dz * CU, v: dx * CU - dz * SU };
}

/** The boardwalk and the two north piers: the plank height of the shore network, the
 *  freeboard floor plus the deck lift of ../gale_harbor.ts (GALE_DECK_FREEBOARD 0.55 +
 *  GALE_DECK_LIFT 0.34: its shore anchor lies under the freeboard). */
export const WICKHARBOR_BOARDWALK_TOP = 0.89;
/** The Old Beacon dock: its anchor on the headland's bench, plus the deck lift. */
export const WICKHARBOR_BEACON_DOCK_TOP = 1.8858;
/** The Beacon stair's head on the headland (its anchor, plus the deck lift). */
export const WICKHARBOR_BEACON_STAIR_TOP = 6.9871;
/** The south stair's first tread stands this far over the boardwalk it rests on (the ferry
 *  wharf flight's first rise). */
export const WICKHARBOR_STAIR_FIRST_RISE = 0.25;
/** The boardwalk's half width: its seaward edge at v = +1.7, its landward edge at -1.7. */
export const WICKHARBOR_BOARDWALK_HALF_WIDTH = 1.7;
export const WICKHARBOR_BOARDWALK_HALF_LENGTH = 8.1;

export type WickharborHarborDeckId =
  | 'pierNorth'
  | 'pierMiddle'
  | 'boardwalk'
  | 'stairSouth'
  | 'stairNorth'
  | 'beaconPier'
  | 'beaconStair';

/** A walkable harbor deck, named for the model and the tests. */
export interface WickharborHarborDeck extends GaleDeckDef {
  id: WickharborHarborDeckId;
  /** Level decks draw as plank fields, stairs as treads. */
  kind: 'level' | 'stair';
}

const BW_HW = WICKHARBOR_BOARDWALK_HALF_WIDTH;
const BW = WICKHARBOR_BOARDWALK_TOP;

/** A deck square to the boardwalk, over the harbor-frame span v0..v1 (its near end at v0),
 *  centred on u, `hw` either side. Its heading runs from v0 toward v1. */
function squareDeck(
  id: WickharborHarborDeckId,
  kind: WickharborHarborDeck['kind'],
  u: number,
  v0: number,
  v1: number,
  hw: number,
  near: number,
  far: number,
  anchors: Pick<GaleDeckDef, 'ax' | 'az' | 'ax2' | 'az2'>,
): WickharborHarborDeck {
  const c = harborPoint(u, (v0 + v1) / 2);
  const seaward = v1 > v0;
  return {
    id,
    kind,
    x: c.x,
    z: c.z,
    rot: WICKHARBOR_HARBOR_FRAME.rot + (seaward ? Math.PI / 2 : -Math.PI / 2),
    hl: Math.abs(v1 - v0) / 2,
    hw,
    ...anchors,
    nearAboveWater: near,
    farAboveWater: far,
  };
}

/** The boardwalk's seaward edge as a cut: keep the side away from the boardwalk. */
const SEAWARD_EDGE: GaleDeckCut = {
  ...harborPoint(0, BW_HW),
  nx: CU,
  nz: -SU,
};

/** The Beacon stair (unchanged since the headland's cutting was carved for it,
 *  world.ts terrainHeight): down from the headland onto the dock's root. */
const BEACON_STAIR = {
  x: 503.3,
  z: 325.3,
  rot: 0.99,
  hl: 6.94,
  hw: 1.4,
} as const;
/** The stair's foot line, where the dock begins: keep the dock's side of it. */
const BEACON_STAIR_FOOT: GaleDeckCut = {
  x: BEACON_STAIR.x + Math.sin(BEACON_STAIR.rot) * BEACON_STAIR.hl,
  z: BEACON_STAIR.z + Math.cos(BEACON_STAIR.rot) * BEACON_STAIR.hl,
  nx: Math.sin(BEACON_STAIR.rot),
  nz: Math.cos(BEACON_STAIR.rot),
};

/** The shore network's one anchor (the boardwalk's root on the beach). */
const SHORE = { ax: 465, az: 354 } as const;

/** The harbor's walkable decks, in their old order (the terrain pads read their anchors in
 *  it). The middle pier and the stairs are laid square in the harbor frame; the north pier,
 *  the Beacon dock and its stair keep the headings they always had. */
export const WICKHARBOR_HARBOR_DECKS: readonly WickharborHarborDeck[] = [
  // the north pier: fanned north along the bay, cut along the boardwalk's seaward edge
  {
    id: 'pierNorth',
    kind: 'level',
    x: 481.6,
    z: 353.7,
    rot: 1.3,
    hl: 12,
    hw: 1.8,
    ...SHORE,
    nearAboveWater: BW,
    farAboveWater: BW,
    cuts: [SEAWARD_EDGE],
  },
  // the middle pier: square off the boardwalk, its head where it always was
  squareDeck('pierMiddle', 'level', 2.99, BW_HW, 25.87, 2.0, BW, BW, SHORE),
  // the shore boardwalk along the waterline; its south end gives onto the ferry wharf,
  // whose flight stands on it
  {
    id: 'boardwalk',
    kind: 'level',
    x: WICKHARBOR_HARBOR_FRAME.x,
    z: WICKHARBOR_HARBOR_FRAME.z,
    rot: WICKHARBOR_HARBOR_FRAME.rot,
    hl: WICKHARBOR_BOARDWALK_HALF_LENGTH,
    hw: BW_HW,
    ...SHORE,
    nearAboveWater: BW,
    farAboveWater: BW,
  },
  // the south stair up the bluff to the town: its first tread on the boardwalk
  squareDeck('stairSouth', 'stair', 4.27, -1.35, -7.4, 1.3, BW + WICKHARBOR_STAIR_FIRST_RISE, 5.6, {
    ...SHORE,
    ax2: 458,
    az2: 361,
  }),
  // the north stair up to the harbor market, from the boardwalk's own edge
  squareDeck('stairNorth', 'stair', -4.85, -BW_HW, -8.0, 1.3, BW, 3.65, {
    ...SHORE,
    ax2: 460,
    az2: 352,
  }),
  // the Old Beacon dock: long and low off the headland's bench, begun where its stair ends
  {
    id: 'beaconPier',
    kind: 'level',
    x: 517.2,
    z: 337.2,
    rot: 0.785,
    hl: 13,
    hw: 2.2,
    ax: 507,
    az: 327,
    nearAboveWater: WICKHARBOR_BEACON_DOCK_TOP,
    farAboveWater: WICKHARBOR_BEACON_DOCK_TOP,
    cuts: [BEACON_STAIR_FOOT],
  },
  // ...and its stair down the headland's cutting from the lawn by the lighthouse
  {
    id: 'beaconStair',
    kind: 'stair',
    ...BEACON_STAIR,
    ax: 497,
    az: 321,
    ax2: 507,
    az2: 327,
    nearAboveWater: WICKHARBOR_BEACON_STAIR_TOP,
    farAboveWater: WICKHARBOR_BEACON_DOCK_TOP,
  },
];

export function harborDeck(id: WickharborHarborDeckId): WickharborHarborDeck {
  const d = WICKHARBOR_HARBOR_DECKS.find((x) => x.id === id);
  if (!d) throw new Error(`no harbor deck ${id}`);
  return d;
}

/** A deck-frame point (along its heading, across it) in world yards. */
export function deckPoint(d: GaleDeckDef, along: number, across: number): { x: number; z: number } {
  return {
    x: d.x + Math.sin(d.rot) * along + Math.cos(d.rot) * across,
    z: d.z + Math.cos(d.rot) * along - Math.sin(d.rot) * across,
  };
}

/** A world point in a deck's frame. */
export function deckLocal(d: GaleDeckDef, x: number, z: number): { along: number; across: number } {
  const dx = x - d.x;
  const dz = z - d.z;
  return {
    along: dx * Math.sin(d.rot) + dz * Math.cos(d.rot),
    across: dx * Math.cos(d.rot) - dz * Math.sin(d.rot),
  };
}

/** Where two lines meet: each a point and a direction (world x, z). */
function meet(
  p: { x: number; z: number },
  d: { x: number; z: number },
  q: { x: number; z: number },
  e: { x: number; z: number },
): { x: number; z: number } {
  const den = d.x * e.z - d.z * e.x;
  const t = ((q.x - p.x) * e.z - (q.z - p.z) * e.x) / den;
  return { x: p.x + d.x * t, z: p.z + d.z * t };
}

function heading(d: GaleDeckDef): { x: number; z: number } {
  return { x: Math.sin(d.rot), z: Math.cos(d.rot) };
}

/** The rails stand this far inside the edges they guard (the collider is 0.3 thick, so its
 *  outer face IS the edge; the wharf's own inset). */
export const WICKHARBOR_RAIL_INSET = 0.15;
const IN = WICKHARBOR_RAIL_INSET;

const PIER_N = harborDeck('pierNorth');
const PIER_M = harborDeck('pierMiddle');
const STAIR_S = harborDeck('stairSouth');
const STAIR_N = harborDeck('stairNorth');
const BEACON = harborDeck('beaconPier');
const BEACON_ST = harborDeck('beaconStair');
const U = { x: SU, z: CU };

/** Where the boardwalk's north end is railed, from its seaward corner to this far across
 *  (landward of it the beach meets the planks within a stride). */
export const WICKHARBOR_NORTH_END_RAIL_V = 0.3;

/** The rails as world polylines. Openings: every join of two floors, the heads of the
 *  stairs on the bluff and the headland, the boardwalk's landward edge where the beach and
 *  the bluff's foot meet its planks, the landward half of its north end onto the beach,
 *  and its south end, where the ferry wharf's flight stands. */
export const WICKHARBOR_HARBOR_RAILS: readonly (readonly (readonly [number, number])[])[] = [
  // the seaward line: from the boardwalk's north end, round the north pier, down the boardwalk's seaward edge, round the
  // middle pier, and on to the wharf flight's foot (the wharf's own rail takes it up)
  [
    harborPoint(-WICKHARBOR_BOARDWALK_HALF_LENGTH + IN, WICKHARBOR_NORTH_END_RAIL_V),
    // across the cut onto the north pier's root, and straight to its north corner (the pier
    // runs on past the boardwalk's end there, over the beach)
    harborPoint(-WICKHARBOR_BOARDWALK_HALF_LENGTH + IN, BW_HW + IN),
    deckPoint(PIER_N, -PIER_N.hl + IN, PIER_N.hw - IN),
    deckPoint(PIER_N, PIER_N.hl - IN, PIER_N.hw - IN),
    deckPoint(PIER_N, PIER_N.hl - IN, -PIER_N.hw + IN),
    meet(deckPoint(PIER_N, 0, -PIER_N.hw + IN), heading(PIER_N), harborPoint(0, BW_HW - IN), U),
    harborPoint(2.99 - PIER_M.hw + IN, BW_HW - IN),
    deckPoint(PIER_M, PIER_M.hl - IN, PIER_M.hw - IN),
    deckPoint(PIER_M, PIER_M.hl - IN, -PIER_M.hw + IN),
    harborPoint(2.99 + PIER_M.hw - IN, BW_HW - IN),
    harborPoint(WICKHARBOR_BOARDWALK_HALF_LENGTH - 0.1, BW_HW - IN),
  ],
  // the north stair's south side, on along the boardwalk's landward edge over the hollow
  // under it
  [
    deckPoint(STAIR_N, STAIR_N.hl - IN, STAIR_N.hw - IN),
    harborPoint(-4.85 + STAIR_N.hw - IN, -BW_HW + IN),
    harborPoint(-0.9, -BW_HW + IN),
  ],
  // the north stair's north side, on a little way north along the landward edge
  [
    deckPoint(STAIR_N, STAIR_N.hl - IN, -STAIR_N.hw + IN),
    harborPoint(-4.85 - STAIR_N.hw + IN, -BW_HW + IN),
    harborPoint(-7.2, -BW_HW + IN),
  ],
  // the south stair's two sides, down to its first tread
  [
    deckPoint(STAIR_S, STAIR_S.hl - IN, STAIR_S.hw - IN),
    deckPoint(STAIR_S, -STAIR_S.hl + IN, STAIR_S.hw - IN),
  ],
  [
    deckPoint(STAIR_S, STAIR_S.hl - IN, -STAIR_S.hw + IN),
    deckPoint(STAIR_S, -STAIR_S.hl + IN, -STAIR_S.hw + IN),
  ],
  // the Beacon: down one side of the stair, across the dock's root beside its foot, round
  // the dock, and back up the stair's other side
  [
    deckPoint(BEACON_ST, -BEACON_ST.hl + IN, -BEACON_ST.hw + IN),
    deckPoint(BEACON_ST, BEACON_ST.hl + IN, -BEACON_ST.hw + IN),
    meet(
      deckPoint(BEACON_ST, BEACON_ST.hl + IN, 0),
      { x: Math.cos(BEACON_ST.rot), z: -Math.sin(BEACON_ST.rot) },
      deckPoint(BEACON, 0, -BEACON.hw + IN),
      heading(BEACON),
    ),
    deckPoint(BEACON, BEACON.hl - IN, -BEACON.hw + IN),
    deckPoint(BEACON, BEACON.hl - IN, BEACON.hw - IN),
    meet(
      deckPoint(BEACON_ST, BEACON_ST.hl + IN, 0),
      { x: Math.cos(BEACON_ST.rot), z: -Math.sin(BEACON_ST.rot) },
      deckPoint(BEACON, 0, BEACON.hw - IN),
      heading(BEACON),
    ),
    deckPoint(BEACON_ST, BEACON_ST.hl + IN, BEACON_ST.hw - IN),
    deckPoint(BEACON_ST, -BEACON_ST.hl + IN, BEACON_ST.hw - IN),
  ],
].map((rail) => rail.map((p) => [p.x, p.z] as const));

/** A harbor prop, placed in its deck's frame (the collider and the model read the world
 *  record below). */
interface HarborPropFrame {
  deck: WickharborHarborDeckId;
  kind: WyrmwatchHarborProp['kind'];
  along: number;
  across: number;
  /** Extra yaw on top of the deck's own (props turn with their deck: local +x along it). */
  turn?: number;
  r?: number;
  hw?: number;
  hd?: number;
  height: number;
  standable?: boolean;
}

const PROP_FRAME: readonly HarborPropFrame[] = [
  // lantern posts at the pier heads, their lanterns hanging out over the water beyond the
  // rails (the rails' newel lanterns light the walks between, no collider)
  {
    deck: 'pierNorth',
    kind: 'lanternPost',
    along: 11.4,
    across: -1.2,
    turn: -Math.PI / 2,
    r: 0.24,
    height: 4.4,
  },
  {
    deck: 'pierMiddle',
    kind: 'lanternPost',
    along: 11.5,
    across: 1.4,
    turn: Math.PI / 2,
    r: 0.24,
    height: 4.4,
  },
  {
    deck: 'beaconPier',
    kind: 'lanternPost',
    along: 12.3,
    across: -1.55,
    turn: -Math.PI / 2,
    r: 0.24,
    height: 4.4,
  },
  {
    deck: 'beaconPier',
    kind: 'lanternPost',
    along: 12.3,
    across: 1.55,
    turn: Math.PI / 2,
    r: 0.24,
    height: 4.4,
  },
  // ...and on the boardwalk, one on the landward rail between the stairs
  {
    deck: 'boardwalk',
    kind: 'lanternPost',
    along: -2.3,
    across: -1.1,
    turn: Math.PI,
    r: 0.24,
    height: 4.4,
  },
  // cargo at the pier heads, against a rail, clear of the walk
  {
    deck: 'pierNorth',
    kind: 'barrel',
    along: 10.1,
    across: 1.02,
    r: 0.45,
    height: 1.35,
    standable: true,
  },
  {
    deck: 'pierMiddle',
    kind: 'crateStack',
    along: 9.6,
    across: -1.1,
    turn: Math.PI / 2,
    hw: 0.55,
    hd: 0.95,
    height: 1.7,
    standable: true,
  },
  {
    deck: 'pierMiddle',
    kind: 'barrel',
    along: 8.1,
    across: -1.15,
    r: 0.5,
    height: 1.35,
    standable: true,
  },
  {
    deck: 'beaconPier',
    kind: 'crateStack',
    along: 10.4,
    across: -1.25,
    turn: Math.PI / 2,
    hw: 0.55,
    hd: 0.95,
    height: 1.7,
    standable: true,
  },
  {
    deck: 'beaconPier',
    kind: 'barrel',
    along: 8.3,
    across: 1.3,
    r: 0.5,
    height: 1.35,
    standable: true,
  },
];

export type WickharborHarborProp = WyrmwatchHarborProp;

export const WICKHARBOR_HARBOR_PROPS: readonly WickharborHarborProp[] = PROP_FRAME.map((p) => {
  const d = harborDeck(p.deck);
  const at = deckPoint(d, p.along, p.across);
  return {
    kind: p.kind,
    x: at.x,
    z: at.z,
    rot: d.rot - Math.PI / 2 + (p.turn ?? 0),
    height: p.height,
    ...(p.r !== undefined ? { r: p.r } : { hw: p.hw ?? 0.5, hd: p.hd ?? 0.5 }),
    ...(p.standable ? { standable: true } : {}),
  };
});

/** Decor rows the rebuild moved off the planks (content/galecrest.ts), each keeping the
 *  terrain pad it had where it first lay (terrain_calm_anchors.ts), so the ground round the
 *  harbor is byte-identical: the dinghy that lay half under the north pier's root. */
export const WICKHARBOR_HARBOR_MOVED_DECOR: readonly {
  key: string;
  from: { x: number; z: number };
  to: { x: number; z: number };
}[] = [{ key: 'hexBoat', from: { x: 474, z: 354 }, to: { x: 473.9, z: 355.5 } }];
