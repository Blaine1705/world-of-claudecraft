// The Mirefen muster: the army Warden Fenwick sent out from Fenbridge to contain Balgath.
//
// Data only (the behavior lives in src/sim/mirefen_muster.ts and src/sim/muster_pike.ts;
// the camp art in src/render/muster_camps.ts reads the same records). Nobody at Fenbridge
// knows where the Foreman came from (Brother Aldric's fallen star, the barrow he dug, or
// something older under Varkhul's forges), only that he walks, and that a line of pikes
// is the one thing the fen has that he cannot shrug off. So the muster ringed the Starfall
// Crater with pickets, and he spends his days smashing them.
//
// Every coordinate below was MEASURED, not eyeballed, against the live heightfield and
// the mob camp table, and tests/mirefen_muster.test.ts re-measures it:
//   - every camp sits on dry ground (1.5+ yards above the fen's waterline across its
//     whole footprint) outside every declared water body and outside the crater bowl;
//   - every camp is at least 29 yards clear of the edge of every wildlife camp (the
//     largest idle aggro radius is 20, plus margin), so a quester standing at a picket
//     cannot pull the Widow Thicket spiders onto the muster;
//   - the four PICKETS are Balgath's warpath circuit (content/zone2.ts, in the order of
//     MUSTER_CIRCUIT), and every leg between them, plus the opening leg from his lair,
//     is dry end to end (tests/warpath.test.ts).
// The COMMAND camp is deliberately OFF the circuit: it holds the weapon rack, so it has
// to be the one place a player can walk up to without standing in an arrival slam.

import type { MobTemplate } from '../types';

/** The boss the muster exists to contain (world_boss.ts WORLD_BOSSES, content/zone2.ts). */
export const MUSTER_BOSS_TEMPLATE_ID = 'balgath_cyclops';

export type MusterCampId = 'rim' | 'west' | 'south' | 'crater' | 'command';

export type MusterSoldierTemplateId =
  | 'muster_footman'
  | 'muster_chaplain'
  | 'muster_sergeant'
  | 'muster_captain';

export interface MusterSoldierSlot {
  templateId: MusterSoldierTemplateId;
  /** World-space offset from the camp centre, in yards. */
  dx: number;
  dz: number;
}

export interface MusterCampDef {
  id: MusterCampId;
  /** Camp centre (world x/z; y is grounded at spawn). */
  center: { x: number; z: number };
  /** The heading the camp's gate and its soldiers face at rest (sim convention:
   *  forward is (sin f, cos f), so 0 looks north along +z). */
  facing: number;
  /** A warpath stop (a picket) rather than the command camp. */
  onCircuit: boolean;
  /** Who stands here. The inner ring (within 5.5 yd of the centre) is what an arrival
   *  slam lands on; the two sentries stand 19+ yd out and live to see the next lap. */
  soldiers: readonly MusterSoldierSlot[];
}

/** Inside this of a picket's centre stands the squad an arrival slam takes. */
export const MUSTER_INNER_RADIUS = 5.5;

/** A picket squad: five in the inner ring, two sentries posted out on the flanks. */
function picket(sentryA: [number, number], sentryB: [number, number]): MusterSoldierSlot[] {
  return [
    { templateId: 'muster_footman', dx: 0, dz: 3.2 },
    { templateId: 'muster_footman', dx: 3.0, dz: -1.2 },
    { templateId: 'muster_footman', dx: -3.0, dz: -1.2 },
    { templateId: 'muster_chaplain', dx: 1.6, dz: 0.6 },
    { templateId: 'muster_chaplain', dx: -1.6, dz: 0.6 },
    { templateId: 'muster_sergeant', dx: sentryA[0], dz: sentryA[1] },
    { templateId: 'muster_footman', dx: sentryB[0], dz: sentryB[1] },
  ];
}

export const MUSTER_CAMPS: readonly MusterCampDef[] = [
  {
    // On the crater's west rim, where the muster first dug in to watch him sleep.
    id: 'rim',
    center: { x: 121, z: 298 },
    facing: 2.95,
    onCircuit: true,
    soldiers: picket([-8, -18], [10, -17]),
  },
  {
    // Out on the dry flats toward the Widow Thicket road, the long leg's far end.
    id: 'west',
    center: { x: 104, z: 248 },
    facing: 1.04,
    onCircuit: true,
    soldiers: picket([-17, -10], [6, -19]),
  },
  {
    // At the foot of the southern rise, below the command camp.
    id: 'south',
    center: { x: 122, z: 226 },
    facing: 0.17,
    onCircuit: true,
    soldiers: picket([-19.5, -4], [19.5, -5]),
  },
  {
    // On the crater's south-west rim, closest to his bed (13 yards off it), in the one gap
    // in the rim's trees wide enough for a squad.
    id: 'crater',
    center: { x: 140, z: 268 },
    facing: -2.03,
    onCircuit: true,
    soldiers: picket([-12, -16], [6, -19]),
  },
  {
    // The command camp on the southern rise, with the weapon rack. Never a warpath stop.
    id: 'command',
    center: { x: 149, z: 206 },
    facing: -0.36,
    onCircuit: false,
    soldiers: [
      { templateId: 'muster_captain', dx: 0.5, dz: 2.5 },
      { templateId: 'muster_sergeant', dx: 5.0, dz: 4.0 },
      { templateId: 'muster_footman', dx: -6.5, dz: 6.0 },
      { templateId: 'muster_footman', dx: 7.5, dz: 7.0 },
      { templateId: 'muster_footman', dx: -9.0, dz: -2.0 },
      { templateId: 'muster_footman', dx: 9.5, dz: -1.5 },
      { templateId: 'muster_chaplain', dx: 0.5, dz: -4.5 },
      { templateId: 'muster_chaplain', dx: -4.0, dz: -6.0 },
    ],
  },
];

/** Balgath's circuit, in walking order (the warpath destinations mirror it exactly). */
export const MUSTER_CIRCUIT: readonly MusterCampId[] = ['rim', 'west', 'south', 'crater'];

/** The weapon rack at the command camp: where anyone picks up a muster pike. */
export const MUSTER_RACK = { x: 146, z: 211, facing: -0.2 } as const;

/**
 * The muster's reach. A muster pike is lent for THIS fight: carried outside this circle
 * (the crater, all four pickets and the command camp, with room to kite him around them)
 * it is reclaimed, and the weapons it displaced go back in the player's hands. Fenbridge
 * is 130 yards away, well outside, so the pike never leaves the fen with anyone.
 */
export const MUSTER_PIKE_LEASH = { x: 124, z: 256, radius: 92 } as const;

export function musterCamp(id: MusterCampId): MusterCampDef {
  const camp = MUSTER_CAMPS.find((c) => c.id === id);
  if (!camp) throw new Error(`unknown muster camp ${id}`);
  return camp;
}

// ---------------------------------------------------------------------------
// The soldiers
// ---------------------------------------------------------------------------

/**
 * The muster's soldiers. Set dressing with a job: they stand their posts, face the Foreman,
 * brace when he comes, cheer when his eye goes out, and die in heaps where his fists land.
 * `musterSoldier` puts them on their own arm of the mob AI (never hostile, never in combat,
 * never on a hate table), so the stats below only size the corpse a slam leaves: nobody can
 * attack them, and the boss's slams are lethal to them by rule (mob/boss_collateral.ts).
 * No loot and no experience, because nothing a player does can kill one.
 */
function soldier(
  id: MusterSoldierTemplateId,
  name: string,
  level: number,
  color: number,
): MobTemplate {
  return {
    id,
    name,
    minLevel: level,
    maxLevel: level,
    family: 'humanoid',
    musterSoldier: true,
    idleStationary: true,
    hpBase: 60,
    hpPerLevel: 22,
    dmgBase: 0,
    dmgPerLevel: 0,
    attackSpeed: 2.0,
    armorPerLevel: 12,
    moveSpeed: 0,
    aggroRadius: 0,
    xpMult: 0,
    loot: [],
    scale: 1.0,
    color,
  };
}

export const MUSTER_MOBS: Record<MusterSoldierTemplateId, MobTemplate> = {
  muster_footman: soldier('muster_footman', 'Muster Footman', 12, 0x8a3b2e),
  muster_chaplain: soldier('muster_chaplain', 'Muster Chaplain', 12, 0xd8cdb0),
  muster_sergeant: soldier('muster_sergeant', 'Muster Sergeant', 13, 0x7a2f25),
  // "Commander", not "Captain": Muster Captain is a named unit in another game (Kings of
  // War's Halflings), and the originality rule forbids reusing a full name in the same role.
  muster_captain: soldier('muster_captain', 'Muster Commander', 15, 0x9c4a2c),
};

/** Ground-object template id of the command camp's weapon rack. */
export const MUSTER_RACK_TEMPLATE_ID = 'muster_weapon_rack';
/** The rack's display name (the object label; localized by the client entity resolver). */
export const MUSTER_RACK_NAME = 'Muster Weapon Rack';
