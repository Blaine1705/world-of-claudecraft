// The Smith's Heart (docs/design/raid/smith_heart.md): a ten-player raid in
// the heart of Stormcrag, phase 1 blockout. Before he lay down to become
// Thornpeak, the Smith split his strength into four (the Heat, the Breath, the
// Hammer, the Quench: the four acts of the Sanctum's rune creed); each sleeps
// in a vein of the mountain that runs down to its heart, and Korzul's stirring
// woke them. Open air throughout: every vein is a fissure open to the storm
// sky, never a roofed tunnel, so the camera never meets a vault.
//
// Route (north +z, east +x, heights in yards; the Ring is 0):
//   the Cleft (40; the world entrance, a crack in the Stormcrag cliffs) -> the
//   Hammer Gallery, descending (packs h1, h2, h3) -> the Hammer Pit (14; the
//   Hammer guardian, ALWAYS FIRST) -> the Slab (a stone gate that breaks when
//   the guardian dies) -> the Balcony (20; the first view over the whole
//   heart) -> the two Balcony Stairs, curving down to the Ring (0; the
//   circular gallery round the heart, packs r1 to r8, two between each pair
//   of vein mouths) -> in ANY order:
//     north, the Breath (climbs to the Cornice at 60: packs b1 to b3, the
//       Wind Bridge, the Breath guardian);
//     east, the Quench (descends to the Frozen Lake at -30: packs q1 to q3,
//       the Singing Ice, the Quench guardian);
//     west, the Heat (level, the Smith's forge: packs f1 to f3, the Pour
//       Channel, the Heat guardian on the Anvil);
//   -> four colours lit on the heart seal -> the three Causeways open -> the
//   Heart (-8; the open-sky caldera, the four altars, the final boss).
//
// Engine limit: ONE floor height per point (authored_field/CLAUDE.md), so the
// Balcony replaces the Ring's south arc and the Ring loops over it by the two
// stairs. The void between the Ring and the Heart is open air: the seal is in
// sight from every point of the Ring. The whole field stays inside one slot of
// the instance band (|x| < 300, |z| < 250).
//
// Pure data: the sim (height, collision, spawns, gates) and the renderer
// (terrain, light rivers, the seal) read this one record.

import type { AuthoredFieldDef, FieldProp, FieldSurface } from '../instances/authored_field/types';

/** The void under every floor: the fissures' depth (below the Frozen Lake). */
export const SMITH_HEART_VOID_HEIGHT = -70;

/** The floor heights of the route. */
export const SMITH_HEART_HEIGHTS = {
  cleft: 40,
  galleryUpper: 36,
  galleryMiddle: 31,
  galleryLower: 26,
  pit: 14,
  balcony: 20,
  ring: 0,
  heart: -8,
  breathLow: 0,
  breathMid: 16,
  breathHigh: 40,
  cornice: 60,
  quenchUpper: -8,
  quenchMiddle: -16,
  quenchShelf: -24,
  lake: -30,
  heat: 0,
} as const;

const H = SMITH_HEART_HEIGHTS;

/** The four veins, in their lore order (the rune creed). */
export type SmithHeartVein = 'hammer' | 'breath' | 'quench' | 'heat';
export const SMITH_HEART_VEINS: readonly SmithHeartVein[] = ['hammer', 'breath', 'quench', 'heat'];

/** One colour per vein (render: light, light river, seal quarter). The Heat
 *  is white-gold smith fire, never Ignivar's volcanic orange-red. */
export const SMITH_HEART_VEIN_COLORS: Readonly<Record<SmithHeartVein, number>> = {
  hammer: 0xc8903c,
  breath: 0x5ab8e8,
  quench: 0x9ad8ff,
  heat: 0xffe6a0,
};

/** The Ring: the circular gallery round the heart. `R` is its centre line. */
export const RING = { x: 0, z: 0, R: 70, innerR: 62, outerR: 78, h: H.ring } as const;
/** The Ring's arc (degrees, clockwise from north): it runs the long way round
 *  from the west stair's foot to the east stair's foot, through the north. */
export const RING_ARC = { fromDeg: 222, toDeg: 498 } as const;

/** The Heart: the open-sky caldera where the final boss forms. */
export const HEART = { x: 0, z: 0, r: 38, h: H.heart } as const;
/** The seal at the Heart's centre (render: the four-colour progress disc). */
export const HEART_SEAL = { x: 0, z: 0, r: 9 } as const;

/** A point on the Ring's circle at `deg` (clockwise from north) and radius `r`. */
export function ringPoint(deg: number, r: number = RING.R): { x: number; z: number } {
  const a = (deg * Math.PI) / 180;
  return { x: RING.x + Math.sin(a) * r, z: RING.z + Math.cos(a) * r };
}

/** The four altars at the Heart's rim, one before each vein's mouth. The
 *  raid touches one to choose the final boss's form (phase 2). */
export const HEART_ALTARS: readonly { vein: SmithHeartVein; x: number; z: number }[] = [
  { vein: 'breath', ...ringPoint(0, 31) },
  { vein: 'quench', ...ringPoint(90, 31) },
  { vein: 'hammer', ...ringPoint(180, 31) },
  { vein: 'heat', ...ringPoint(270, 31) },
];

/** The Cleft: the world entrance's landing, high in the south-west. */
export const CLEFT = { x: -100, z: -226, r: 12, h: H.cleft } as const;
/** The Hammer Gallery's three landings (packs h1, h2, h3). */
export const GALLERY_LANDINGS = {
  h1: { x: -50, z: -232, r: 12, h: H.galleryUpper },
  h2: { x: 10, z: -234, r: 12, h: H.galleryMiddle },
  h3: { x: 62, z: -200, r: 12, h: H.galleryLower },
} as const;
/** The Hammer Pit, the first guardian's arena (60 yd across). */
export const HAMMER_PIT = { x: 0, z: -150, r: 30, h: H.pit } as const;
/** The Slab: the living stone that seals the way to the heart. */
export const SLAB = { x: 0, z: -121 } as const;
/** The Balcony: the first view, jutting out over the void toward the seal. */
export const BALCONY = { x0: -12, z0: -114, x1: 12, z1: -58, h: H.balcony } as const;

/** The Breath (north): three landings and the Cornice arena (60 yd). */
export const BREATH = {
  b1: { x: 0, z: 104, r: 13, h: H.breathLow },
  b2: { x: 44, z: 134, r: 11, h: H.breathMid },
  b3: { x: -44, z: 160, r: 11, h: H.breathHigh },
  cornice: { x: 0, z: 206, r: 30, h: H.cornice },
} as const;
/** The Wind Bridge: the natural rock arch between the Breath's second and
 *  third landings (gusts in rhythm, phase 2). */
export const WIND_BRIDGE = { fromX: 16, fromZ: 150, toX: -20, toZ: 158, halfWidth: 6.5 } as const;

/** The Quench (east): two landings, the Singing Ice sheet, the Frozen Lake. */
export const QUENCH = {
  q1: { x: 110, z: 0, r: 12, h: H.quenchUpper },
  q2: { x: 130, z: -40, r: 12, h: H.quenchMiddle },
  ice: { x0: 150, z0: -62, x1: 182, z1: -36, h: H.quenchShelf },
  shelf: { x: 186, z: 10, r: 40, h: H.lake },
  lake: { x: 186, z: 10, r: 32, h: H.lake },
} as const;

/** The Heat (west): the forge hall, the casting floor, the Anvil arena. */
export const HEAT = {
  hall: { x0: -122, z0: -14, x1: -74, z1: 14, h: H.heat },
  floor: { x0: -160, z0: -34, x1: -120, z1: 34, h: H.heat },
  anvil: { x: -192, z: 0 },
} as const;
/** The Pour Channel: where the great crucible's colada crosses the casting
 *  floor's path (render strip now, a timed hazard in phase 2). */
export const POUR_CHANNEL = { x: -132, z0: -34, z1: 34, halfWidth: 2.5 } as const;

/** The Anvil: the Heat guardian's platform, shaped like an anvil whose horn
 *  points west, between channels of molten metal (the void). */
const ANVIL_POINTS: readonly (readonly [number, number])[] = [
  [-172, -18],
  [-178, -22],
  [-204, -22],
  [-206, -14],
  [-214, -10],
  [-226, -3],
  [-228, 0],
  [-226, 3],
  [-214, 10],
  [-206, 14],
  [-204, 22],
  [-178, 22],
  [-172, 18],
];

/** Where each boss stands. */
export const SMITH_HEART_BOSS_SPOTS = {
  hammer: { x: HAMMER_PIT.x, z: HAMMER_PIT.z },
  breath: { x: BREATH.cornice.x, z: BREATH.cornice.z + 4 },
  quench: { x: QUENCH.lake.x, z: QUENCH.lake.z },
  heat: { x: -196, z: 0 },
  final: { x: 0, z: 0 },
} as const;

/** Named anchors: the entry, dev teleports and the renderer's set pieces. */
export const SMITH_HEART_ANCHORS = {
  entry: { x: -100, z: -224 },
  exit: { x: -104, z: -232 },
  cleft: { x: -100, z: -226 },
  gallery: { x: 10, z: -234 },
  pit: { x: 0, z: -166 },
  balcony: { x: 0, z: -64 },
  ring: { x: 0, z: 70 },
  ringSouthEast: ringPoint(125),
  ringSouthWest: ringPoint(235),
  breath: { x: 0, z: 100 },
  bridge: { x: 0, z: 154 },
  cornice: { x: -10, z: 190 },
  quench: { x: 104, z: 0 },
  ice: { x: 158, z: -49 },
  lake: { x: 174, z: -12 },
  heat: { x: -90, z: 0 },
  forge: { x: -140, z: 0 },
  anvil: { x: -178, z: 0 },
  heart: { x: 0, z: -30 },
} as const;

/**
 * The floor light-rivers: one per vein, from its guardian's arena down the
 * vein to the heart seal (render; a river lights up when its guardian dies).
 * Each is a polyline of instance-local points; the renderer drapes it on the
 * floor. They run the vein's walking line, so following the light always
 * leads to the guardian.
 */
export const LIGHT_RIVERS: Readonly<Record<SmithHeartVein, readonly { x: number; z: number }[]>> = {
  hammer: [
    { x: 0, z: -150 },
    { x: 0, z: -112 },
    { x: 0, z: -58 },
    { x: 0, z: -38 },
    { x: 0, z: -9 },
  ],
  breath: [
    { x: 0, z: 206 },
    { x: -22, z: 196 },
    { x: -42, z: 172 },
    { x: -44, z: 160 },
    { x: -20, z: 158 },
    { x: 16, z: 150 },
    { x: 40, z: 131 },
    { x: 44, z: 134 },
    { x: 11, z: 113 },
    { x: 0, z: 104 },
    { x: 0, z: 9 },
  ],
  quench: [
    { x: 186, z: 10 },
    { x: 183, z: -26 },
    { x: 178, z: -36 },
    { x: 166, z: -49 },
    { x: 139, z: -47 },
    { x: 130, z: -40 },
    { x: 117, z: -13 },
    { x: 110, z: 0 },
    { x: 9, z: 0 },
  ],
  heat: [
    { x: -192, z: 0 },
    { x: -132, z: 0 },
    { x: -74, z: 0 },
    { x: -9, z: 0 },
  ],
};

// ---- surfaces ----------------------------------------------------------------------

function rect(
  id: string,
  r: { x0: number; z0: number; x1: number; z1: number; h: number },
  extra: Partial<Pick<FieldSurface, 'edge' | 'ground'>> = {},
): FieldSurface {
  return {
    kind: 'poly',
    id,
    points: [
      [r.x0, r.z0],
      [r.x1, r.z0],
      [r.x1, r.z1],
      [r.x0, r.z1],
    ],
    h: r.h,
    ...extra,
  };
}

function disc(
  id: string,
  c: { x: number; z: number; r: number; h: number },
  extra: Partial<Pick<FieldSurface, 'edge' | 'ground'>> = {},
): FieldSurface {
  return { kind: 'circle', id, x: c.x, z: c.z, r: c.r, h: c.h, ...extra };
}

/** The Ring as one flat annulus sector (clockwise from `fromDeg` to `toDeg`). */
function ringSector(): FieldSurface {
  const pts: [number, number][] = [];
  const step = 4;
  for (let d = RING_ARC.fromDeg; d <= RING_ARC.toDeg; d += step) {
    const p = ringPoint(d, RING.outerR);
    pts.push([p.x, p.z]);
  }
  for (let d = RING_ARC.toDeg; d >= RING_ARC.fromDeg; d -= step) {
    const p = ringPoint(d, RING.innerR);
    pts.push([p.x, p.z]);
  }
  return { kind: 'poly', id: 'ring', points: pts, h: H.ring, edge: 'balustrade', ground: 'slate' };
}

/**
 * One Balcony Stair, following the Ring's circle from the Balcony down to the
 * Ring: flat from `topDeg` for 4 degrees, down to the Ring by `footDeg` (+-6
 * degrees of flat run into the Ring). `dir` is +1 for the west stair
 * (clockwise), -1 for the east.
 */
function balconyStair(id: string, topDeg: number, footDeg: number): FieldSurface {
  const dir = Math.sign(footDeg - topDeg);
  const pts: [number, number, number][] = [];
  const flatTop = topDeg + 4 * dir;
  const flatFoot = footDeg + 6 * dir;
  const push = (deg: number, h: number) => {
    const p = ringPoint(deg);
    pts.push([p.x, p.z, h]);
  };
  push(topDeg, H.balcony);
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    push(flatTop + (footDeg - flatTop) * t, H.balcony + (H.ring - H.balcony) * t);
  }
  push(flatFoot, H.ring);
  return {
    kind: 'path',
    id,
    points: pts,
    halfWidth: 7,
    stairs: true,
    edge: 'balustrade',
    ground: 'slate',
  };
}

/** A straight causeway from the Ring down across the void into the Heart. */
function causeway(id: string, deg: number): FieldSurface {
  const at = (r: number, h: number): [number, number, number] => {
    const p = ringPoint(deg, r);
    return [p.x, p.z, h];
  };
  return {
    kind: 'path',
    id,
    points: [at(66, H.ring), at(61, H.ring), at(40, H.heart), at(34, H.heart)],
    halfWidth: 7,
    edge: 'balustrade',
    ground: 'slate',
  };
}

const AUTHORED_SURFACES: FieldSurface[] = [
  // --- The Hammer (south): the Cleft, the Gallery, the Pit ---------------------------
  disc('cleft', CLEFT, { edge: 'rock', ground: 'slate' }),
  {
    kind: 'path',
    id: 'gallery_upper',
    points: [
      [-96, -227, H.cleft],
      [-90, -228, H.cleft],
      [-60, -231, H.galleryUpper],
      [-54, -232, H.galleryUpper],
    ],
    halfWidth: 7,
    edge: 'rock',
    ground: 'earth',
  },
  disc('gallery_h1', GALLERY_LANDINGS.h1, { edge: 'rock', ground: 'earth' }),
  {
    kind: 'path',
    id: 'gallery_middle',
    points: [
      [-46, -232, H.galleryUpper],
      [-40, -232, H.galleryUpper],
      [-2, -234, H.galleryMiddle],
      [4, -234, H.galleryMiddle],
    ],
    halfWidth: 7,
    edge: 'rock',
    ground: 'earth',
  },
  disc('gallery_h2', GALLERY_LANDINGS.h2, { edge: 'rock', ground: 'earth' }),
  {
    kind: 'path',
    id: 'gallery_lower',
    points: [
      [16, -232, H.galleryMiddle],
      [22, -230, H.galleryMiddle],
      [54, -208, H.galleryLower],
      [58, -204, H.galleryLower],
    ],
    halfWidth: 7,
    edge: 'rock',
    ground: 'earth',
  },
  disc('gallery_h3', GALLERY_LANDINGS.h3, { edge: 'rock', ground: 'earth' }),
  {
    kind: 'path',
    id: 'pit_descent',
    points: [
      [56, -196, H.galleryLower],
      [50, -191, H.galleryLower],
      [24, -170, H.pit],
      [20, -166, H.pit],
    ],
    halfWidth: 7,
    stairs: true,
    edge: 'rock',
    ground: 'slate',
  },
  disc('hammer_pit', HAMMER_PIT, { edge: 'rock', ground: 'earth' }),
  // --- The Slab and the Balcony -------------------------------------------------------
  {
    kind: 'path',
    id: 'slab_stair',
    points: [
      [0, -128, H.pit],
      [0, -124, H.pit],
      [0, -114, H.balcony],
      [0, -110, H.balcony],
    ],
    halfWidth: 7,
    stairs: true,
    edge: 'rock',
    ground: 'slate',
  },
  rect('balcony', BALCONY, { edge: 'balustrade', ground: 'slate' }),
  // --- The Ring and its two stairs ----------------------------------------------------
  ringSector(),
  balconyStair('balcony_stair_east', 172, 142),
  balconyStair('balcony_stair_west', 188, 218),
  // --- The Breath (north): climbs to the Cornice --------------------------------------
  {
    kind: 'path',
    id: 'breath_mouth',
    points: [
      [0, 74, H.ring],
      [0, 80, H.ring],
      [0, 92, H.breathLow],
      [0, 96, H.breathLow],
    ],
    halfWidth: 7,
    edge: 'rock',
    ground: 'slate',
  },
  disc('breath_b1', BREATH.b1, { edge: 'rock', ground: 'slate' }),
  {
    kind: 'path',
    id: 'breath_chimney',
    points: [
      [6, 110, H.breathLow],
      [11, 113, H.breathLow],
      [36, 129, H.breathMid],
      [40, 131, H.breathMid],
    ],
    halfWidth: 7,
    stairs: true,
    edge: 'rock',
    ground: 'slate',
  },
  disc('breath_b2', BREATH.b2, { edge: 'rock', ground: 'slate' }),
  {
    kind: 'path',
    id: 'wind_bridge',
    points: [
      [38, 138, H.breathMid],
      [33, 141, H.breathMid],
      [WIND_BRIDGE.fromX, WIND_BRIDGE.fromZ, 24],
      [WIND_BRIDGE.toX, WIND_BRIDGE.toZ, 36],
      [-33, 160, H.breathHigh],
      [-38, 160, H.breathHigh],
    ],
    halfWidth: WIND_BRIDGE.halfWidth,
    edge: 'balustrade',
    ground: 'slate',
  },
  disc('breath_b3', BREATH.b3, { edge: 'rock', ground: 'slate' }),
  {
    kind: 'path',
    id: 'cornice_climb',
    points: [
      [-44, 166, H.breathHigh],
      [-42, 172, H.breathHigh],
      [-22, 196, H.cornice],
      [-18, 199, H.cornice],
    ],
    halfWidth: 7,
    stairs: true,
    edge: 'rock',
    ground: 'slate',
  },
  disc('breath_cornice', BREATH.cornice, { edge: 'balustrade', ground: 'slate' }),
  // --- The Quench (east): descends to the Frozen Lake ---------------------------------
  {
    kind: 'path',
    id: 'quench_mouth',
    points: [
      [74, 0, H.ring],
      [80, 0, H.ring],
      [98, 0, H.quenchUpper],
      [102, 0, H.quenchUpper],
    ],
    halfWidth: 7,
    stairs: true,
    edge: 'rock',
    ground: 'slate',
  },
  disc('quench_q1', QUENCH.q1, { edge: 'rock', ground: 'snow' }),
  {
    kind: 'path',
    id: 'quench_stair',
    points: [
      [114, -8, H.quenchUpper],
      [117, -13, H.quenchUpper],
      [127, -29, H.quenchMiddle],
      [129, -33, H.quenchMiddle],
    ],
    halfWidth: 7,
    stairs: true,
    edge: 'rock',
    ground: 'snow',
  },
  disc('quench_q2', QUENCH.q2, { edge: 'rock', ground: 'snow' }),
  {
    kind: 'path',
    id: 'quench_shelf_stair',
    points: [
      [135, -45, H.quenchMiddle],
      [139, -47, H.quenchMiddle],
      [152, -49, H.quenchShelf],
      [156, -49, H.quenchShelf],
    ],
    halfWidth: 7,
    stairs: true,
    edge: 'rock',
    ground: 'snow',
  },
  rect('singing_ice', QUENCH.ice, { edge: 'rock', ground: 'ice' }),
  {
    kind: 'path',
    id: 'lake_descent',
    points: [
      [176, -40, H.quenchShelf],
      [178, -36, H.quenchShelf],
      [183, -26, H.lake],
      [184, -22, H.lake],
    ],
    halfWidth: 7,
    edge: 'rock',
    ground: 'snow',
  },
  disc('lake_shelf', QUENCH.shelf, { edge: 'rock', ground: 'slate' }),
  disc('frozen_lake', QUENCH.lake, { edge: 'rock', ground: 'ice' }),
  // --- The Heat (west): the Smith's forge, level with the Ring ------------------------
  rect('forge_hall', HEAT.hall, { edge: 'masonry', ground: 'soot' }),
  rect('casting_floor', HEAT.floor, { edge: 'masonry', ground: 'soot' }),
  {
    kind: 'path',
    id: 'anvil_bridge',
    points: [
      [-156, 0, H.heat],
      [-160, 0, H.heat],
      [-170, 0, H.heat],
      [-174, 0, H.heat],
    ],
    halfWidth: 7,
    edge: 'masonry',
    ground: 'plate',
  },
  { kind: 'poly', id: 'anvil', points: ANVIL_POINTS, h: H.heat, edge: 'masonry', ground: 'plate' },
  // --- The Heart (the final caldera) and its three causeways --------------------------
  disc('heart', HEART, { edge: 'balustrade', ground: 'ritual' }),
  causeway('causeway_north', 0),
  causeway('causeway_east', 90),
  causeway('causeway_west', 270),
];

/** Every path is drawn AFTER the floors it joins (a later surface wins where
 *  two overlap), so a stair's flat end runs owned into its landing and the
 *  landing's disc never cuts the stair's top off into a step. */
const SURFACES: FieldSurface[] = [
  ...AUTHORED_SURFACES.filter((s) => s.kind !== 'path'),
  ...AUTHORED_SURFACES.filter((s) => s.kind === 'path'),
];

// ---- props (blockout dressing; `r` or `hw`/`hd` add a collider) ----------------------
// Kinds are the blockout renderer's keys (render/smith_heart). Nothing solid
// stands on a walking line, a pack's spot, a gate's span or an arena's middle.

const ALTAR_PROPS: FieldProp[] = HEART_ALTARS.map((a) => ({
  kind: `sh_altar_${a.vein}`,
  x: a.x,
  z: a.z,
  rot: Math.atan2(HEART.x - a.x, HEART.z - a.z),
  r: 1.8,
  h: 3,
}));

/** The Hammer Pit's columns (rise and fall in phase 2), on a 22 yd circle. */
const PIT_COLUMNS: FieldProp[] = [30, 100, 170, 250, 320].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return {
    kind: 'sh_pit_column',
    x: HAMMER_PIT.x + Math.sin(a) * 22,
    z: HAMMER_PIT.z + Math.cos(a) * 22,
    rot: a,
    r: 2.2,
    h: 9,
  };
});

/** The Frozen Lake's braziers on its rock shelf (the Quench form's warmth). */
const LAKE_BRAZIERS: FieldProp[] = [40, 140, 220, 320].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return {
    kind: 'sh_brazier',
    x: QUENCH.lake.x + Math.sin(a) * 36,
    z: QUENCH.lake.z + Math.cos(a) * 36,
    rot: 0,
    r: 1,
    h: 2,
  };
});

const PROPS: FieldProp[] = [
  // The Cleft: the crack's mouth behind the landing (render only).
  { kind: 'sh_cleft_mouth', x: -112, z: -230, rot: Math.PI / 2 },
  // The Hammer Gallery: the Smith's half-carved mountain statues on the rims.
  { kind: 'sh_rough_statue', x: -50, z: -244, rot: 0, r: 2.5, h: 10 },
  { kind: 'sh_rough_statue', x: 10, z: -222, rot: Math.PI, r: 2.5, h: 10 },
  { kind: 'sh_rough_statue', x: 72, z: -208, rot: -1.2, r: 2.5, h: 10 },
  { kind: 'sh_geode', x: -42, z: -222, rot: 0.4, r: 1.5, h: 3 },
  { kind: 'sh_geode', x: 20, z: -244, rot: 1.9, r: 1.5, h: 3 },
  ...PIT_COLUMNS,
  // The Slab's broken halves lie either side of the stair once it falls.
  { kind: 'sh_slab_frame', x: SLAB.x, z: SLAB.z, rot: 0 },
  // The Ring: forge pillars on the outer rim, between the pack spots.
  ...[0, 45, 90, 135, 225, 270, 315].map((deg) => {
    const p = ringPoint(deg + 22.5, RING.outerR - 1.5);
    return { kind: 'sh_ring_pillar', x: p.x, z: p.z, rot: 0, r: 1.2, h: 12 };
  }),
  // The Breath: wind shelters on the bridge's windward edge (phase 2 gusts
  // push the raid against them, never off the arch).
  { kind: 'sh_wind_shelter', x: 6, z: 156, rot: -0.22, hw: 2.4, hd: 0.7, h: 2 },
  { kind: 'sh_wind_shelter', x: -10, z: 160, rot: -0.22, hw: 2.4, hd: 0.7, h: 2 },
  ...LAKE_BRAZIERS,
  // The Quench: half-forged blades set in the ice beside the path.
  { kind: 'sh_ice_blade', x: 160, z: -40, rot: 0.3, r: 0.8, h: 4 },
  { kind: 'sh_ice_blade', x: 170, z: -58, rot: 1.2, r: 0.8, h: 4 },
  // The Heat: house-sized crucibles, the great pour crucible, chains.
  { kind: 'sh_crucible', x: -100, z: 11, rot: 0, r: 2.4, h: 6 },
  { kind: 'sh_crucible', x: -100, z: -11, rot: 0, r: 2.4, h: 6 },
  { kind: 'sh_pour_crucible', x: -132, z: 30, rot: Math.PI, r: 3, h: 10 },
  { kind: 'sh_anvil_horn', x: -222, z: 0, rot: -Math.PI / 2 },
  // The Heart: the four altars and the seal.
  ...ALTAR_PROPS,
  { kind: 'sh_heart_seal', x: HEART_SEAL.x, z: HEART_SEAL.z, rot: 0 },
];

export const SMITH_HEART_FIELD: AuthoredFieldDef = {
  key: 'smith_heart',
  bounds: { minX: -232, maxX: 230, minZ: -246, maxZ: 240 },
  voidHeight: SMITH_HEART_VOID_HEIGHT,
  cliffStep: 1.1,
  mapVoid: 'mist',
  surfaces: SURFACES,
  walls: [],
  props: PROPS,
  lightZones: [
    { id: 'cleft', x: -60, z: -228, r: 60, key: 0xc8c0b0, accent: 0xc8903c, fog: 0x5a5448 },
    { id: 'pit', x: 0, z: -150, r: 45, key: 0xc8bca8, accent: 0xc8903c, fog: 0x584e40 },
    { id: 'balcony', x: 0, z: -80, r: 30, key: 0xc4c8d8, accent: 0xc8903c, fog: 0x4c5468 },
    { id: 'ring', x: 0, z: 0, r: 85, key: 0xbcc4d8, accent: 0xd8c8a0, fog: 0x485068 },
    { id: 'breath', x: 0, z: 160, r: 80, key: 0xbcd0ec, accent: 0x5ab8e8, fog: 0x4a6080 },
    { id: 'quench', x: 160, z: -10, r: 75, key: 0xc0d8f0, accent: 0x9ad8ff, fog: 0x4c6888 },
    { id: 'heat', x: -160, z: 0, r: 75, key: 0xe0d4bc, accent: 0xffe6a0, fog: 0x6a6050 },
  ],
};
