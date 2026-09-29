// Render-only set dressing for the Hollow Crypt: the pieces that make the
// necropolis a PLACE but that nobody walks into, so they carry no collider:
// the broken chapel the party emerges from, the cloister's arcade arches
// overhead, the bell tower's rock plinth, tracery and webs hung in the wall
// band, the bone crown over the Rite Ring, and far ruins on the crag ring.
//
// Rule (the fairness contract of docs/design/boss-rooms/README.md): anything
// standing inside walkable ground is flat clutter below the knee or hangs
// overhead; everything tall stands on the void side of a cliff lip, in the
// wall band, or far away. `cosmetic` pieces shed on the low tier.
//
// Pure data, Three-free.

export interface KitPlacement {
  piece: string;
  x: number;
  z: number;
  rot: number;
  scale: number;
  /** Absolute instance-local height (else the ground under x, z). */
  y?: number;
  /** Extra lift above the ground. */
  lift?: number;
  /** Stretch along the piece's local x (edge segments fit their run). */
  stretch?: number;
  /** Sheds on the low graphics tier. */
  cosmetic?: boolean;
}

const P = (
  piece: string,
  x: number,
  z: number,
  rot = 0,
  scale = 1,
  extra: Partial<KitPlacement> = {},
): KitPlacement => ({ piece, x, z, rot, scale, ...extra });

function arcadeArches(): KitPlacement[] {
  const out: KitPlacement[] = [];
  // Between the cloister's perimeter columns (x = +-38, z = -70 .. 10 by 10).
  for (let z = -65; z <= 5; z += 10) {
    for (const x of [-38, 38]) {
      const broken = Math.abs(Math.sin(x * 3.1 + z * 1.7)) > 0.7;
      out.push(P(broken ? 'Kit_ArcadeArchBroken' : 'Kit_ArcadeArch', x, z, Math.PI / 2, 1));
    }
  }
  // Across the south walk, between the columns flanking the stair foot.
  for (const x of [-21, 21, -35, 35]) {
    out.push(P('Kit_ArcadeArch', x, -72, 0, 1, { stretch: x * x > 900 ? 0.8 : 1.4 }));
  }
  return out;
}

function graveClutter(): KitPlacement[] {
  const out: KitPlacement[] = [];
  // Low grave mounds and iron fences along the yard's rim, off the pull lanes.
  const spots: [number, number, number][] = [
    [-104, 30, 0.3],
    [-107, 44, -0.2],
    [-100, 60, 0.6],
    [-60, 22, 1.2],
    [-62, 58, -0.8],
    [-96, 80, 0.1],
    [-66, 84, 2.4],
    [-88, 12, 0.9],
  ];
  spots.forEach(([x, z, r], i) => {
    out.push(P(i % 2 ? 'Kit_GraveMound' : 'Kit_GraveFence', x, z, r, 1, { cosmetic: i % 3 === 2 }));
  });
  return out;
}

export const HOLLOW_CRYPT_SET_DRESSING: readonly KitPlacement[] = [
  // The broken parish chapel the party climbs out of, on its own crag behind
  // the landing, and the rock pillar under it.
  P('Kit_ChapelRuin', 0, -158, 0, 1, { y: 20 }),
  P('Kit_RockPillar', 0, -156, 0.4, 1.4, { y: 20 }),
  // Candle clusters and skulls on the landing lip.
  P('Kit_CandleCluster', -13, -132, 0.4, 1, { cosmetic: true }),
  P('Kit_CandleCluster', 13, -134, -0.6, 1, { cosmetic: true }),
  P('Kit_SkullPile', -6, -142, 0.2, 0.8, { cosmetic: true }),
  // The cloister arcade overhead and its corner ossuary niches.
  ...arcadeArches(),
  P('Kit_CoffinStack', -43, -77, 0.8, 1),
  P('Kit_CoffinStack', 43, 17, -2.2, 1),
  P('Kit_SkullPile', 42, -77, 1.1, 1, { cosmetic: true }),
  P('Kit_SkullPile', -42, 16, 2.6, 1, { cosmetic: true }),
  // The Processional: tattered banners on the shrine pillars.
  P('Kit_Banner', -22, 62, Math.PI / 2, 1, { cosmetic: true }),
  P('Kit_Banner', 22, 62, -Math.PI / 2, 1, { cosmetic: true }),
  P('Kit_Banner', -22, 30, Math.PI / 2, 1, { cosmetic: true }),
  P('Kit_Banner', 22, 30, -Math.PI / 2, 1, { cosmetic: true }),
  P('Kit_CoffinStack', 23, 108, 3.4, 1),
  P('Kit_CandleCluster', -23, 106, 0.9, 1, { cosmetic: true }),
  // The Sexton's Yard: mounds, fences, and the bell tower's plinth.
  ...graveClutter(),
  P('Kit_RockPillar', -110, 130, 1.2, 2.2, { y: 8 }),
  P('Kit_OpenGrave', -74, 44, 0.4, 1),
  P('Kit_OpenGrave', -90, 52, -0.7, 1),
  P('Kit_OpenGrave', -70, 128, 1.1, 1),
  P('Kit_OpenGrave', -94, 124, 2.8, 1),
  // Widow's Gallery: silk sheets and cocoons in the wall band, icicles.
  P('Kit_SilkSheet', 56, 30, Math.PI / 2, 1.2),
  P('Kit_SilkSheet', 95, 36, -Math.PI / 2, 1),
  P('Kit_SilkSheet', 56, 70, Math.PI / 2, 1.1),
  P('Kit_HangingCocoon', 62, 26, 0, 1, { lift: 7 }),
  P('Kit_HangingCocoon', 90, 32, 1, 0.8, { lift: 8 }),
  P('Kit_HangingCocoon', 66, 128, 0.4, 1.2, { lift: 10 }),
  P('Kit_HangingCocoon', 94, 126, 2, 1, { lift: 11 }),
  P('Kit_EggCluster', 97, 110, 2.6, 0.9, { cosmetic: true }),
  // The Choir Ruin: the great tracery window behind the organ, framing the
  // crag and the column, and candelabra down the nave.
  P('Kit_TraceryWindow', 0, 173.5, 0, 1, { y: 5 }),
  P('Kit_Candelabrum', -28, 124, 0, 1),
  P('Kit_Candelabrum', 28, 124, 0, 1),
  P('Kit_Candelabrum', -28, 142, 0, 1),
  P('Kit_Candelabrum', 28, 142, 0, 1),
  // The Rite Ring: the bone crown arching over the altar (its feet stand on
  // the rim lip, outside the ring), and standing stones round the rim.
  P('Kit_BoneCrown', 0, 205, 0, 1, { y: 24 }),
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    return P('Kit_RingStone', Math.sin(a) * 29.6, 205 + Math.cos(a) * 29.6, a, 1, { y: 24 });
  }),
  // Far ruins on the crag ring (silhouettes that sell the scale).
  P('Kit_DistantSpire', -210, 20, 0.3, 3.2, { y: -10, cosmetic: true }),
  P('Kit_DistantSpire', 230, 140, 2.1, 3.8, { y: -10, cosmetic: true }),
  P('Kit_DistantSpire', -160, 300, 1.2, 4.4, { y: -10, cosmetic: true }),
  P('Kit_DistantSpire', 150, -120, 0.7, 2.8, { y: -10, cosmetic: true }),
];
