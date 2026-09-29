// Pure placement plan for the Hollow Crypt kit: which Kit_* piece every sim
// prop draws, the cloister arcade derived from its columns, the cliff-edge
// dressing, the curtain walls, the light holders and the render-only set
// dressing, in one list the painter (crypt_kit.ts) instances and the support
// audit (tests/hollow_crypt_kit_support.test.ts) checks piece by piece against
// the real floor and against the pieces that carry it.
//
// The contract (docs/design/dungeon-rework/hollow_crypt.md, "Environment"):
// nothing floats. A piece stands on the floor under its own footprint, rests
// on the top of a piece that carries it (an arch on two capitals), hangs from
// one (a banner from a pillar), or rises from the chasm floor under the mist.
//
// Three-free, DOM-free, deterministic.

import { HOLLOW_CRYPT_FIELD } from '../../sim/content/hollow_crypt_layout';
import type { FieldProp } from '../../sim/instances/authored_field';
import { type EdgeDressing, HOLLOW_CRYPT_LIGHTS, planEdgeDressing } from './crypt_plan_core';
import { HOLLOW_CRYPT_SET_DRESSING, type KitPlacement } from './crypt_set_dressing_core';

function hash(a: number, b: number): number {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** A cloister column the ruin has broken (a deterministic pick by position). */
export function isBrokenCloisterColumn(p: Pick<FieldProp, 'x' | 'z'>): boolean {
  return hash(p.x, p.z) < 0.3;
}

/** The kit node a sim prop kind draws (variants picked by position). */
export function kitPieceForProp(p: FieldProp): string {
  const h = hash(p.x, p.z);
  switch (p.kind) {
    case 'hc_lychgate':
      return 'Kit_Lychgate';
    case 'hc_mourner_statue':
      return 'Kit_MournerStatue';
    case 'hc_cloister_column':
      return isBrokenCloisterColumn(p) ? 'Kit_CloisterColumnBroken' : 'Kit_CloisterColumn';
    case 'hc_ossuary_monument':
      return 'Kit_OssuaryMonument';
    case 'hc_sarcophagus':
      return 'Kit_Sarcophagus';
    case 'hc_processional_pillar':
      return 'Kit_ShrinePillar';
    case 'hc_wing_arch':
      return 'Kit_WingArch';
    case 'hc_headstone':
      return `Kit_Headstone${'ABCD'[Math.floor(h * 4)]}`;
    case 'hc_lantern_post':
      return 'Kit_LanternPost';
    case 'hc_dead_tree':
      return 'Kit_DeadTree';
    case 'hc_bell_tower':
      return 'Kit_BellTower';
    case 'hc_web_column':
      return 'Kit_WebColumn';
    case 'hc_egg_cluster':
      return 'Kit_EggCluster';
    case 'hc_great_web':
      return 'Kit_GreatWeb';
    case 'hc_choir_pillar':
      return 'Kit_ChoirPillar';
    case 'hc_bone_organ':
      return 'Kit_BoneOrgan';
    case 'hc_tracery_window':
      return 'Kit_TraceryWindow';
    case 'hc_pew':
      return 'Kit_Pew';
    case 'hc_nave_column':
      return 'Kit_NaveColumn';
    case 'hc_remembrance_candle':
      return 'Kit_RemembranceCandle';
    case 'hc_rite_altar':
      return 'Kit_RiteAltar';
    case 'hc_sarcophagus_alcove':
      return 'Kit_SarcophagusAlcove';
    case 'hc_ring_stone':
      return 'Kit_RingStone';
    case 'hc_pier':
      // Collider only: the pier it makes solid is part of its gateway's piece.
      return '';
    default:
      return 'Kit_Rubble';
  }
}

export const EDGE_PIECES: Readonly<Record<EdgeDressing['kind'], string>> = {
  balustrade: 'Kit_Balustrade',
  merlon: 'Kit_Parapet',
  boneRail: 'Kit_BoneRail',
  rubble: 'Kit_Rubble',
};

/** The span of one arcade bay (Kit_ArcadeArch springs from capitals 10 apart). */
export const ARCADE_BAY = 10;

/**
 * The cloister arcade, derived from its columns: one arch over every pair of
 * columns exactly one bay apart. A bay whose two columns stand gets a whole
 * arch (or a broken one that keeps both springers); a bay with one fallen
 * column keeps only the springer on the standing capital and its voussoirs lie
 * in the grass; a bay with both columns down is only fallen stone. An arch
 * never hangs over a missing column.
 */
export function planArcade(): KitPlacement[] {
  const cols = HOLLOW_CRYPT_FIELD.props.filter((p) => p.kind === 'hc_cloister_column');
  const out: KitPlacement[] = [];
  for (let i = 0; i < cols.length; i++) {
    for (let j = i + 1; j < cols.length; j++) {
      const a = cols[i];
      const b = cols[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const aligned = Math.abs(dx) < 1e-6 || Math.abs(dz) < 1e-6;
      if (!aligned || Math.abs(Math.hypot(dx, dz) - ARCADE_BAY) > 1e-6) continue;
      const x = (a.x + b.x) / 2;
      const z = (a.z + b.z) / 2;
      // Local +X runs from a to b: three.js yaw maps local X to (cos, -sin).
      const rot = Math.atan2(-dz, dx);
      const aDown = isBrokenCloisterColumn(a);
      const bDown = isBrokenCloisterColumn(b);
      if (!aDown && !bDown) {
        const piece = hash(x * 0.37, z * 0.91) < 0.35 ? 'Kit_ArcadeArchBroken' : 'Kit_ArcadeArch';
        out.push({ piece, x, z, rot, scale: 1 });
      } else if (aDown && bDown) {
        out.push({ piece: 'Kit_ArcadeArchFallen', x, z, rot, scale: 1 });
      } else {
        // The springer is built on the piece's local -X foot: turn it so that
        // foot stands on the column still standing.
        const standing = aDown ? b : a;
        const ux = (standing.x - x) / (ARCADE_BAY / 2);
        const uz = (standing.z - z) / (ARCADE_BAY / 2);
        // local -X in world is (-cos, sin): solve for the yaw that points it at `standing`.
        out.push({
          piece: 'Kit_ArcadeArchSpringer',
          x,
          z,
          rot: Math.atan2(uz, -ux),
          scale: 1,
        });
      }
    }
  }
  return out;
}

/** The holders the light plan stands for its own flames (braziers, posts). */
export function planLightHolders(): KitPlacement[] {
  return HOLLOW_CRYPT_LIGHTS.filter((l) => l.places && l.holder).map((l) => ({
    piece: l.holder as string,
    x: l.x,
    z: l.z,
    rot: l.rot,
    scale: 1,
  }));
}

/** The authored curtain walls tiled with wall segments. */
export function planCurtainWalls(): KitPlacement[] {
  const out: KitPlacement[] = [];
  for (const w of HOLLOW_CRYPT_FIELD.walls) {
    const n = Math.max(1, Math.round((w.hw * 2) / 6));
    const cos = Math.cos(w.rot);
    const sin = Math.sin(w.rot);
    for (let i = 0; i < n; i++) {
      const along = -w.hw + (w.hw * 2 * (i + 0.5)) / n;
      out.push({
        piece: hash(w.x + i, w.z) < 0.35 ? 'Kit_CurtainWallBroken' : 'Kit_CurtainWall',
        x: w.x + along * cos,
        z: w.z - along * sin,
        rot: w.rot,
        scale: 1,
        stretch: (w.hw * 2) / n / 6,
      });
    }
  }
  return out;
}

/** Every kit placement of the necropolis, in a stable order. */
export function planCryptKitPlacements(): KitPlacement[] {
  const out: KitPlacement[] = [];
  for (const p of HOLLOW_CRYPT_FIELD.props) {
    const piece = kitPieceForProp(p);
    if (piece) out.push({ piece, x: p.x, z: p.z, rot: p.rot, scale: p.scale ?? 1 });
  }
  out.push(...planArcade());
  for (const e of planEdgeDressing()) {
    out.push({
      piece: EDGE_PIECES[e.kind],
      x: e.x,
      z: e.z,
      rot: e.rot,
      scale: 1,
      y: e.y,
      stretch: e.stretch,
      shear: e.shear,
    });
  }
  out.push(...planCurtainWalls());
  out.push(...planLightHolders());
  out.push(...HOLLOW_CRYPT_SET_DRESSING);
  return out;
}

/**
 * How a piece is carried, for the support audit. `ground` (the default): every
 * contact patch of its base stands on the floor or on the top of another
 * piece. `hangs`: its top is fixed inside another piece (a banner on its
 * pillar). `rooted`: a rock column reaching down into the chasm floor.
 * `backdrop`: a far silhouette beyond the playable necropolis, rising
 * out of the mist sea.
 */
export type KitSupport = 'ground' | 'hangs' | 'rooted' | 'backdrop';

export const KIT_SUPPORT: Readonly<Record<string, KitSupport>> = {
  Kit_Banner: 'hangs',
  // A rock column whose origin is its levelled top: its foot is in the chasm.
  Kit_RockPillar: 'rooted',
  Kit_DistantSpire: 'backdrop',
};

/** Pieces a base may sink into (rough rock tops), and by how much. */
export const KIT_SINK_TOLERANCE: Readonly<Record<string, number>> = {
  Kit_RockPillar: 3,
};
