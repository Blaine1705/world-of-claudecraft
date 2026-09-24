// Transport ship hulls: the walkable collision layout of every ship model a
// `decorProps` row can moor (keyed by the row's `key`). Data-as-code; the
// placement math lives in ../transport_ship.ts and decor_prop_colliders.ts
// places a hull wherever its key is moored.
//
// The Eastbrook ferry (Phase 1: moored at the ferry pier's T-head, static,
// idle-animated). Numbers are yards in the ship frame (origin at the
// waterline centre, +z bow, +x port) and MIRROR the Blender source
// (scripts/assets/eastbrook_ferry/build_eastbrook_ferry.py), whose export
// stamps the headline dimensions into the shipped GLB's root extras;
// tests/eastbrook_ferry_asset.test.ts pins the two against each other.
//
// Scale: the player model stands 2.6 yd to the crown (HUMANOID_H in
// render/characters/manifest.ts) on a 0.5 yd body radius, climbs 0.9 yd
// unaided (MAX_STEP_HEIGHT) and jumps 1.125 yd (player_motion.ts). So the
// rails sit at 1.2 yd (waist height on the model, above a jump), stair
// treads rise 0.3 yd, the cabin door is 3 yd tall, and the waist deck is a
// 9.5 yd wide, 16 yd long open floor with the masts on the centre line.

import type { TransportBerthDef, TransportRouteDef, TransportTimings } from '../transport_schedule';
import { railRun, type ShipHullLayout, type ShipVolume, stairFlight } from '../transport_ship';

const DECK = 3.3; // main (waist) deck, above the waterline
const CAPTAIN = 6.3; // quarterdeck over the stern cabin
const FORECASTLE = 4.5; // raised bow deck
const RAIL = 1.2; // rail height above the deck it guards
/** An open balustrade (turned posts under a rail) is seen and cast through
 *  above its bottom rail, this far over the deck it stands on. */
const BALUSTRADE_SIGHT = 0.3;

/** Outer half-beam of the hull at deck level, stern (-z) to stem (+z). The
 *  Blender source lofts the hull through the same stations. */
export const EASTBROOK_FERRY_BEAM_STATIONS: readonly (readonly [number, number])[] = [
  [-15.5, 4.1],
  [-12, 4.75],
  [-7.5, 5.05],
  [-2.5, 5.15],
  [0.8, 5.15],
  [5, 5.0],
  [8.5, 4.6],
  [11, 3.95],
  [13, 3.0],
  [14.5, 1.9],
  [15.5, 0.7],
];

/** Outer half-beam at z (linear between the stations). */
export function eastbrookFerryHalfBeam(z: number): number {
  const s = EASTBROOK_FERRY_BEAM_STATIONS;
  if (z <= s[0][0]) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    if (z <= s[i][0]) {
      const [z0, w0] = s[i - 1];
      const [z1, w1] = s[i];
      return w0 + ((w1 - w0) * (z - z0)) / (z1 - z0);
    }
  }
  return s[s.length - 1][1];
}

/** Bulwark thickness: the rail's inner face sits this far inside the hull. */
const BULWARK = 0.35;
/** The port gangway opening (the Eastbrook pier side), ship-frame z. */
const GANGWAY_Z0 = -0.4;
const GANGWAY_Z1 = 2.0;
const GANGWAY_Z = (GANGWAY_Z0 + GANGWAY_Z1) / 2;
/** The clear width between the rail ends (each rail box overhangs its end by
 *  half its 0.3 thickness). */
const CLEAR = GANGWAY_Z1 - GANGWAY_Z0 - 0.3;

/** Rail centre-line points along one side between z0 and z1. */
function sideLine(side: 1 | -1, z0: number, z1: number, step = 1.5): [number, number][] {
  const pts: [number, number][] = [];
  const n = Math.max(1, Math.ceil(Math.abs(z1 - z0) / step));
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    pts.push([side * (eastbrookFerryHalfBeam(z) - BULWARK + 0.15), z]);
  }
  return pts;
}

function eastbrookFerryVolumes(): ShipVolume[] {
  const v: ShipVolume[] = [];
  const deck = (id: string, z0: number, z1: number, hw: number, top: number): void => {
    v.push({
      id,
      kind: 'deck',
      shape: 'obb',
      x: 0,
      z: (z0 + z1) / 2,
      hw,
      hd: (z1 - z0) / 2,
      top,
      standable: true,
    });
  };
  // Floors. Every box stays inside the hull's outer skin at its ends, and the
  // rail runs below line the edges, so the floor boxes may run under a rail.
  deck('captain_deck_aft', -15.2, -12, 4.05, CAPTAIN);
  deck('captain_deck_fore', -12, -7.5, 4.6, CAPTAIN);
  deck('main_deck_aft', -7.5, 5, 4.75, DECK);
  deck('main_deck_fore', 5, 8.5, 4.5, DECK);
  deck('forecastle_aft', 8.5, 11, 4.3, FORECASTLE);
  deck('forecastle_mid', 11, 13, 3.4, FORECASTLE);
  deck('forecastle_fore', 13, 14, 2.4, FORECASTLE);
  deck('forecastle_stem', 14, 14.8, 1.6, FORECASTLE);

  // Stairs: two wide flights up the quarterdeck face (against each rail,
  // leaving the cabin door clear between them) and one broad flight up to
  // the forecastle on the centre line. Treads rise 0.3, well under a stride.
  for (const side of [1, -1] as const) {
    const name = side === 1 ? 'port' : 'starboard';
    v.push(
      ...stairFlight(`captain_stair_${name}`, side * 3.72, 0.97, -2.5, -1, 0.5, 10, DECK, CAPTAIN),
    );
  }
  v.push(...stairFlight('forecastle_stair', 0, 1.6, 7.15, 1, 0.45, 3, DECK, FORECASTLE - 0.3));

  // Rails. The waist rail stops at the gangways; the stair section rises to
  // the quarterdeck's rail height with the treads it guards.
  for (const side of [1, -1] as const) {
    const name = side === 1 ? 'port' : 'starboard';
    v.push(...railRun(`rail_${name}_captain`, sideLine(side, -15.2, -7.5), CAPTAIN + RAIL));
    v.push(...railRun(`rail_${name}_stair`, sideLine(side, -7.5, -2.5), CAPTAIN + RAIL));
    v.push(...railRun(`rail_${name}_waist_aft`, sideLine(side, -2.5, GANGWAY_Z0), DECK + RAIL));
    v.push(...railRun(`rail_${name}_waist_fore`, sideLine(side, GANGWAY_Z1, 8.5), DECK + RAIL));
    v.push(
      ...railRun(`rail_${name}_forecastle`, sideLine(side, 8.5, 14.8, 1.1), FORECASTLE + RAIL),
    );
    // The quarterdeck stair's inner banister, over its upper half (a fall
    // from the lower treads is a short hop onto the waist).
    v.push(
      ...railRun(
        `banister_${name}`,
        [
          [side * 2.6, -4.5],
          [side * 2.6, -7.5],
        ],
        CAPTAIN + RAIL,
        0.25,
      ),
    );
    // Forecastle break rail, each side of its stair.
    v.push(
      ...railRun(
        `rail_${name}_forecastle_break`,
        [
          [side * 1.75, 8.6],
          [side * (eastbrookFerryHalfBeam(8.6) - BULWARK), 8.6],
        ],
        FORECASTLE + RAIL,
        0.3,
        'rail',
        FORECASTLE + BALUSTRADE_SIGHT,
      ),
    );
  }
  // The starboard gangway is closed by its drop bar until a dock meets it.
  v.push(
    ...railRun('gate_starboard', sideLine(-1, GANGWAY_Z0, GANGWAY_Z1), DECK + RAIL, 0.3, 'gate'),
  );
  // The bow rail closing the two forecastle rails at the stem head.
  const stemX = eastbrookFerryHalfBeam(14.8) - BULWARK + 0.15;
  v.push(
    ...railRun(
      'rail_bow',
      [
        [stemX, 14.8],
        [-stemX, 14.8],
      ],
      FORECASTLE + RAIL,
    ),
  );
  // Taffrail across the stern, and the quarterdeck's front rail over the
  // cabin door (open at each end where the stairs arrive).
  v.push(
    ...railRun(
      'rail_taffrail',
      [
        [-3.85, -15.25],
        [3.85, -15.25],
      ],
      CAPTAIN + RAIL,
    ),
  );
  v.push(
    ...railRun(
      'rail_captain_front',
      [
        [-2.6, -7.6],
        [2.6, -7.6],
      ],
      CAPTAIN + RAIL,
      0.3,
      'rail',
      CAPTAIN + BALUSTRADE_SIGHT,
    ),
  );

  // Masts: full-height posts on the centre line.
  const mast = (id: string, z: number, r: number, top: number): void => {
    v.push({ id, kind: 'mast', shape: 'circle', x: 0, z, r, top, standable: false });
  };
  mast('mast_fore', 11.2, 0.5, 24);
  mast('mast_main', 2.5, 0.55, 28);
  mast('mast_mizzen', -10.5, 0.45, 21);

  // Dressing along the deck edges. Everything that stands against a rail is a
  // WALL, not a floor: a bench or a crate a player could stand on would lift a
  // jump over the rail beside it. Only the low hatch in mid-deck is a floor.
  const prop = (
    id: string,
    x: number,
    z: number,
    hw: number,
    hd: number,
    top: number,
    standable = false,
  ): void => {
    v.push({ id, kind: 'prop', shape: 'obb', x, z, hw, hd, top, standable });
  };
  // the main hatch's raised grating, a low step on the waist
  prop('hatch_main', 0, -1.0, 1.1, 1.1, DECK + 0.22, true);
  prop('bench_port', 4.2, 5.0, 0.35, 1.3, DECK + 0.55);
  prop('bench_starboard', -4.2, 5.0, 0.35, 1.3, DECK + 0.55);
  prop('crates_port', 3.55, 7.5, 0.65, 0.8, DECK + 1.5);
  v.push({
    id: 'barrels_starboard',
    kind: 'prop',
    shape: 'circle',
    x: -3.6,
    z: 7.45,
    r: 0.8,
    top: DECK + 1.0,
    standable: false,
  });
  v.push({
    id: 'helm_wheel',
    kind: 'prop',
    shape: 'circle',
    x: 0,
    z: -13.4,
    r: 0.55,
    top: CAPTAIN + 1.8,
    standable: false,
  });
  prop('chart_table', -2.6, -9.6, 0.55, 0.75, CAPTAIN + 1.0);

  // Boarding. The port gangway's side platform, then the gangplank the
  // Eastbrook berth deploys onto the ferry pier's T-head (the pier deck
  // stands 2.64 yd above the water, so the plank drops 0.66 over 2.4 yd in
  // two treads).
  v.push({
    id: 'gangway_port',
    kind: 'gangway',
    shape: 'obb',
    x: 5.325,
    z: GANGWAY_Z,
    hw: 0.575,
    hd: 1.2,
    top: DECK,
    standable: true,
  });
  v.push({
    id: 'gangplank_1',
    kind: 'gangplank',
    shape: 'obb',
    x: 6.5,
    z: GANGWAY_Z,
    hw: 0.6,
    hd: 0.8,
    top: DECK - 0.22,
    standable: true,
  });
  v.push({
    id: 'gangplank_2',
    kind: 'gangplank',
    shape: 'obb',
    x: 7.7,
    z: GANGWAY_Z,
    hw: 0.6,
    hd: 0.8,
    top: DECK - 0.44,
    standable: true,
  });
  return v;
}

export const EASTBROOK_FERRY_HULL: ShipHullLayout = {
  id: 'eastbrookFerry',
  mainDeckY: DECK,
  captainDeckY: CAPTAIN,
  forecastleY: FORECASTLE,
  railHeight: RAIL,
  length: 31,
  beam: 10.3,
  draft: 2.4,
  boarding: [
    { id: 'gangway_port', side: 'port', x: 5.15, y: DECK, z: GANGWAY_Z, width: CLEAR, open: true },
    {
      id: 'gangway_starboard',
      side: 'starboard',
      x: -5.15,
      y: DECK,
      z: GANGWAY_Z,
      width: CLEAR,
      open: false,
    },
  ],
  volumes: eastbrookFerryVolumes(),
};

/** Every hull a decorProps row can moor, by the row's `key`. */
export const TRANSPORT_SHIP_HULLS: Readonly<Record<string, ShipHullLayout>> = {
  eastbrookFerry: EASTBROOK_FERRY_HULL,
};

// ---------------------------------------------------------------------------
// Scheduled routes (Phase 2): the Eastbrook ferry sails a free, round-trip
// timetable between Eastbrook Docks and Wickharbor (transport_schedule.ts owns
// the cycle math, transport_ferry.ts carries the passengers). A route's ship
// is NOT a decorProps row: its hull colliders are placed at BOTH berths and
// gated by the schedule (transport_gates.ts), so the deck exists only where
// and while the ship lies docked.
// ---------------------------------------------------------------------------

/** The Eastbrook berth: broadside across the ferry pier's T-head, bow north
 *  (+z), the port gangway square to the pier's end (world z -54) so the
 *  gangplank drops onto the pier deck (Phase 1's mooring, unchanged). */
const EASTBROOK_BERTH: TransportBerthDef = {
  id: 'eastbrook',
  x: -125,
  z: -54.8,
  rot: 0,
  // ahead up the cove, then a long turn to port out past the western buoys
  departure: [
    { x: -125, z: -54.8, rot: 0 },
    { x: -125.6, z: -42, rot: -0.15 },
    { x: -135, z: -32, rot: -0.9 },
    { x: -155, z: -27.5, rot: -1.42 },
    { x: -172, z: -28.5, rot: -1.64 },
  ],
  // in from the south-western shallows, bow first, straightening into the berth
  arrival: [
    { x: -166, z: -96, rot: 0.8 },
    { x: -143, z: -80, rot: 0.5 },
    { x: -128.5, z: -68, rot: 0.12 },
    { x: -125, z: -54.8, rot: 0 },
  ],
  // the ferry pier's T-head, facing back up the pier toward the quay
  landing: { x: -113.5, z: -54, facing: Math.PI / 2 },
};

/** The Wickharbor berth: broadside across the deepwater pier's T-head (the
 *  south pier, gale_harbor.ts GALE_HARBOR_DECKS[2]: centre (464.1, 378), rot
 *  1.3, hl 12, so its end is (475.66, 381.21)). The ship lies with the same
 *  relation to the pier as at Eastbrook (ship rot = pier rot + PI/2, the port
 *  gangway on the pier's axis), 12.3 yd out along the axis: the pier deck is
 *  only 0.89 yd above the water where Eastbrook's stands 2.64, so the Galecrest
 *  boarding stair (the ramp deck appended to GALE_HARBOR_DECKS) bridges the
 *  last 4.7 yd from the pier's end up to the gangplank. */
const WICKHARBOR_BERTH: TransportBerthDef = {
  id: 'wickharbor',
  x: 487.3,
  z: 385.27,
  rot: 1.3 + Math.PI / 2,
  // a pivot to starboard in place (the bow swings away from the middle pier's
  // end), then out east across the bay
  departure: [
    { x: 487.3, z: 385.27, rot: 1.3 + Math.PI / 2 },
    { x: 490.5, z: 381, rot: 2.3 },
    { x: 501, z: 375.5, rot: 1.8 },
    { x: 521, z: 373, rot: 1.62 },
    { x: 540, z: 373.5, rot: 1.56 },
  ],
  // up the bay from the south, bow first, onto the berth
  arrival: [
    { x: 506, z: 441, rot: 3.55 },
    { x: 494, z: 416, rot: 3.3 },
    { x: 488.8, z: 399, rot: 2.98 },
    { x: 487.3, z: 385.27, rot: 1.3 + Math.PI / 2 },
  ],
  // on the deepwater pier, just shoreward of the boarding stair, facing town
  landing: { x: 473.25, z: 380.54, facing: 1.3 - Math.PI },
};

/** The Eastbrook ferry's timetable, in seconds (transport_schedule.ts). */
export const EASTBROOK_FERRY_TIMINGS: TransportTimings = {
  docked: 60,
  departing: 8,
  atSea: 12,
  arriving: 8,
};

export const EASTBROOK_WICKHARBOR_FERRY: TransportRouteDef = {
  id: 'eastbrookWickharbor',
  ship: 'eastbrookFerry',
  berths: [EASTBROOK_BERTH, WICKHARBOR_BERTH],
  timings: EASTBROOK_FERRY_TIMINGS,
};

/** Every scheduled route in the built-in world. */
export const TRANSPORT_ROUTES: readonly TransportRouteDef[] = [EASTBROOK_WICKHARBOR_FERRY];
