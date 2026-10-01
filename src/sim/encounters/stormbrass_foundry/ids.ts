// The Stormbrass Foundry's encounter ids and tuning, as a dependency-free leaf:
// the content (stormbrass_foundry.ts), the encounter modules, the trash kit's
// death bursts (mob/trash_kit/foundry_kit.ts), the dev helpers, the renderer's
// telegraphs and the tests all key on these.
//
// docs/design/dungeon-rework/stormbrass_foundry.md sections 4.3 and 5.

export const FOUNDRY_DUNGEON = 'stormbrass_foundry';

/** The four bosses, in route order (their cores are phase 2). */
export const TOCK_ID = 'line_master_tock';
export const RANGEWARDEN_ID = 'rangewarden';
export const VOLTAIC_WARDEN_ID = 'voltaic_warden';
export const PRIME_DRAFT_ID = 'prime_draft';
/** The showpiece patrol of the Rail Yard. */
export const GANTRY_HAULER_ID = 'gantry_hauler';
/** The trash every kit add rides on. */
export const ARC_DRONE_ID = 'arc_drone';
export const TRIPOD_TURRET_ID = 'tripod_turret';

// ---- the Gantry Hauler (section 4.3) ------------------------------------------

/** Steam Blast: a telegraphed frontal cone that throws everyone in it back. */
export const HAULER_STEAM_BLAST = 'foundry_hauler_steam_blast';
/** Scrap Toss: the crane arm throws a plate at the farthest player. */
export const HAULER_SCRAP_TOSS = 'foundry_hauler_scrap_toss';
/** Unload: at half health it dumps Arc Drones from its bed. */
export const HAULER_UNLOAD = 'foundry_hauler_unload';
/** Boiler Rupture: the boiler bursts where it fell (its trashKit.deathBurst). */
export const HAULER_BOILER_RUPTURE = 'foundry_hauler_boiler_rupture';

/**
 * The Hauler's numbers (normal; heroic scales the damage through the claim's
 * mechanicDamageMult). Damage is stated LANDED on a level-20 cloth wearer of
 * about 950 health (README section 7): Steam Blast about 21 percent, Scrap
 * Toss about 23 percent, both avoidable; Boiler Rupture 16 percent.
 */
export const HAULER_TUNING = {
  blastEvery: 12,
  blastFirst: 6,
  blastCast: 1.5,
  blastRange: 12,
  blastArcDeg: 90,
  blastMin: 180,
  blastMax: 220,
  /** Yards the Steam Blast throws a player back. */
  blastKnockback: 10,
  tossEvery: 15,
  tossFirst: 9,
  /** The plate's warning on the floor before it lands. */
  tossWarning: 2,
  tossRadius: 5,
  tossMin: 200,
  tossMax: 240,
  /** Only a player within this reach of the Hauler is tossed at. */
  tossReach: 45,
  unloadAtHpPct: 0.5,
  unloadCount: 3,
} as const;

// ---- encounter objects: their template id carries their look -----------------

/** A death burst's ring building on the floor (scale = its radius). */
export const FOUNDRY_BURST_RING = 'foundry_burst_ring';
/** A Scrap Toss plate's landing mark (scale = its radius). */
export const FOUNDRY_SCRAP_MARK = 'foundry_scrap_mark';

// ==== The four bosses (section 5, phase 2) ======================================
//
// Every number is stated LANDED on a level-20 cloth wearer of about 950 health
// (README section 7, design section 5): a raid-wide pulse 8 to 15 percent, a
// must-avoid hit 35 to 45 percent, a fumbled core 50 to 70 percent (never a
// one-shot on normal). Heroic scales them through the claim's
// mechanicDamageMult (2.5 on the heroic tuning row, for the 1,250 health
// heroic wearer: a fumbled core is lethal there).

/** Half-Built Frames that Line-Master Tock's chute drops onto the belts. */
export const HALF_BUILT_FRAME_ID = 'half_built_frame';

// ---- Line-Master Ambrel Tock (5.1): fight on moving belts (G19) ----------------

/** The great lever: a 2 s klaxon bar, then the belts reverse. */
export const TOCK_LEVER = 'foundry_tock_lever';
/** The Rivet Gun burst on the one he is fighting (a short bar). */
export const TOCK_RIVET_GUN = 'foundry_tock_rivet_gun';
/** The Stamping Press hammer coming down on one belt's last yards. */
export const TOCK_STAMPING_PRESS = 'foundry_tock_stamping_press';
/** The parts chute dropping Half-Built Frames onto the belts. */
export const TOCK_PARTS_DROP = 'foundry_tock_parts_drop';
/** Tock's pressure gauge (an aura on Tock: its remaining time is the seconds
 *  to the next lever throw, so the gauge needle reads it). */
export const TOCK_PRESSURE = 'foundry_tock_pressure';
/** A player the press flattened (a short stun). */
export const TOCK_FLATTENED = 'foundry_tock_flattened';
/** A Half-Built Frame still booting up (it cannot act until it wakes). */
export const FRAME_BOOTING = 'foundry_frame_booting';

export const TOCK_TUNING = {
  /** Line Speed: yards a second a belt carries anyone on it (heroic Overtime). */
  beltSpeed: 3,
  overtimeSpeed: 5,
  leverFirst: 20,
  leverEvery: 20,
  /** The klaxon bar before the belts reverse. */
  leverCast: 2,
  pressFirst: 8,
  pressEvery: 12,
  /** The painted strip's warning before the hammer lands. */
  pressWarning: 2,
  /** The hammer covers each belt's last yards at the press end. */
  pressLength: 8,
  pressMin: 250,
  pressMax: 300,
  /** The knockdown the press leaves (seconds stunned). */
  pressKnockdown: 1.5,
  /** Parts Drop thresholds and how many frames each drop puts on the belts. */
  partsAtHpPct: [0.7, 0.4] as readonly number[],
  partsCount: 3,
  /** A frame boots up this long after it lands, wherever it rode to. */
  frameBoot: 8,
  rivetFirst: 6,
  rivetEvery: 10,
  rivetCast: 1,
  /** The Rivet Gun hits as hard as this many of his melee swings. */
  rivetMult: 1.4,
} as const;

export interface BeltLayout {
  xs: readonly number[];
  halfWidth: number;
  z0: number;
  z1: number;
}

/** The belt (0 to 3, west to east) an instance-local spot stands on, or -1. */
export function beltIndexAt(belts: BeltLayout, lx: number, lz: number): number {
  if (lz < belts.z0 || lz > belts.z1) return -1;
  for (let i = 0; i < belts.xs.length; i++) {
    if (Math.abs(lx - belts.xs[i]) <= belts.halfWidth) return i;
  }
  return -1;
}

/** Is an instance-local spot under the press hammer of `belt` (its last
 *  `length` yards at the press end)? */
export function inPressStrip(
  belts: BeltLayout,
  belt: number,
  lx: number,
  lz: number,
  length: number = TOCK_TUNING.pressLength,
): boolean {
  if (belt < 0 || belt >= belts.xs.length) return false;
  return (
    Math.abs(lx - belts.xs[belt]) <= belts.halfWidth && lz >= belts.z1 - length && lz <= belts.z1
  );
}

/** A belt's run state, on its encounter object: idle before and after the
 *  fight, running while it lasts (facing 0 runs toward the press, PI back to
 *  the chute; scale is the belt's speed), alarm while the klaxon says it is
 *  about to reverse. */
export const FOUNDRY_BELT_TEMPLATES = {
  idle: 'foundry_belt_idle',
  run: 'foundry_belt_run',
  alarm: 'foundry_belt_alarm',
} as const;
/** The press strip painted on the belt before the hammer lands (scale = the
 *  strip's length; it stands on the strip's centre). */
export const FOUNDRY_PRESS_STRIP = 'foundry_press_strip';

// ---- The Rangewarden (5.2): a marked player keeps moving (G20 trail salvo) -----

/** Target Lock: the crosshair over a marked player (an aura on the player). */
export const RANGE_TARGET_LOCK = 'foundry_target_lock';
/** One berm shell (the spellfx muzzle cue and the impact). */
export const RANGE_SALVO = 'foundry_range_salvo';
/** Proof Shot: a heavy shell at the tank (a bar). */
export const RANGE_PROOF_SHOT = 'foundry_proof_shot';
/** Dented Plating: the tank takes more physical damage (stacks). */
export const RANGE_DENTED = 'foundry_dented_plating';
/** Drill Drones launch from its back. */
export const RANGE_DRILL_DRONES = 'foundry_drill_drones';
/** Heroic Shrapnel left where a shell burst. */
export const RANGE_SHRAPNEL = 'foundry_shrapnel';

export const RANGE_TUNING = {
  lockFirst: 8,
  lockEvery: 18,
  lockSeconds: 8,
  /** Players marked per Target Lock (heroic Walking Barrage: three). */
  lockCount: 2,
  heroicLockCount: 3,
  /** A shell is fired every second at where the mark stood this long ago. */
  shellEvery: 1,
  shellLag: 1.5,
  /** The painted circle's beat before the shell lands. */
  shellWarning: 0.6,
  shellRadius: 5,
  shellMin: 250,
  shellMax: 300,
  /** Shells a bunker swallows per Target Lock before it is blown open. */
  bunkerShells: 3,
  /** The cover a bunker gives: this deep behind its east face. */
  bunkerLee: 3.5,
  proofFirst: 10,
  proofEvery: 15,
  proofCast: 1.5,
  proofMult: 1.5,
  dentedPct: 0.1,
  dentedMax: 3,
  dentedSeconds: 12,
  drillAtHpPct: [0.66, 0.33] as readonly number[],
  drillCount: 3,
  // Heroic Shrapnel: each impact leaves shrapnel on the ground.
  shrapnelSeconds: 6,
  shrapnelRadius: 4,
  shrapnelPerSecond: 40,
} as const;

/** A shell's painted circle before it lands (scale = its radius). */
export const FOUNDRY_SHELL_MARK = 'foundry_shell_mark';
/** Heroic shrapnel on the ground (scale = its radius). */
export const FOUNDRY_SHRAPNEL = 'foundry_shrapnel_field';
/** A bunker's state on the range: sound (cover) or blown open this lock. */
export const FOUNDRY_BUNKER_TEMPLATES = {
  sound: 'foundry_bunker_sound',
  breached: 'foundry_bunker_breached',
} as const;

/** Is an instance-local spot sheltered by a bunker (on it or in its lee, east
 *  of the wall, away from the west berm)? Returns the bunker's index, or -1. */
export function bunkerLeeAt(
  bunkers: readonly { x: number; z: number; hw: number; hd: number }[],
  lx: number,
  lz: number,
  lee: number = RANGE_TUNING.bunkerLee,
): number {
  for (let i = 0; i < bunkers.length; i++) {
    const b = bunkers[i];
    if (Math.abs(lz - b.z) > b.hw + 0.5) continue;
    if (lx >= b.x - b.hd && lx <= b.x + b.hd + lee) return i;
  }
  return -1;
}

// ---- The Voltaic Warden (5.3): hit it with the right kind (G21 plating) ---------

/** The plates' two faces, as auras on the Warden (and on its drones). */
export const VOLTAIC_GROUNDED = 'foundry_plating_grounded';
export const VOLTAIC_CHARGED = 'foundry_plating_charged';
/** Stored Charge: the wrong-kind damage banked for the next Discharge (an aura
 *  on the Warden whose stacks are the stored amount). */
export const VOLTAIC_STORED = 'foundry_stored_charge';
/** The plates rattle and half-turn: the bar before they flip. */
export const VOLTAIC_FLIP = 'foundry_plating_flip';
/** Discharge: the stored charge released to everyone as the plates flip. */
export const VOLTAIC_DISCHARGE = 'foundry_discharge';
/** Static Lash on the tank, chaining to one player near the tank. */
export const VOLTAIC_STATIC_LASH = 'foundry_static_lash';
/** Arc Drones launched with the opposite plating. */
export const VOLTAIC_DRONES = 'foundry_voltaic_drones';
/** The great coil strikes a marked spot on the crown. */
export const VOLTAIC_COIL_STRIKE = 'foundry_coil_strike';

export const VOLTAIC_TUNING = {
  flipEvery: 15,
  /** Heroic Rapid Cycling. */
  rapidFlipEvery: 10,
  /** The rattle bar before the flip (part of the cycle, not on top of it). */
  flipCast: 3,
  /** Discharge: this share of the stored amount, landed, capped. */
  dischargeShare: 0.2,
  dischargeCap: 400,
  dronesFirst: 12,
  dronesEvery: 25,
  dronesCount: 2,
  lashFirst: 7,
  lashEvery: 12,
  lashCast: 1,
  lashTankMin: 300,
  lashTankMax: 340,
  /** The lash leaps to the nearest other player this close to the tank. */
  lashChainRange: 6,
  lashChainMin: 200,
  lashChainMax: 240,
  strikeFirst: 10,
  strikeEvery: 18,
  strikeWarning: 1.6,
  strikeRadius: 4,
  strikeMin: 160,
  strikeMax: 190,
} as const;

export type VoltaicPlating = 'grounded' | 'charged';

/** The plating a hit from `school` must meet: physical needs Grounded plates,
 *  every spell school needs Charged ones. */
export function platingFor(school: string): VoltaicPlating {
  return school === 'physical' ? 'grounded' : 'charged';
}

/** The plating a hit from (sx, sz) meets on a body at (tx, tz) facing `yaw`
 *  wearing `front`: heroic Split Plating turns the back half to the other face. */
export function platingFacing(
  front: VoltaicPlating,
  split: boolean,
  tx: number,
  tz: number,
  yaw: number,
  sx: number,
  sz: number,
): VoltaicPlating {
  if (!split) return front;
  const dx = sx - tx;
  const dz = sz - tz;
  // Behind it: the attacker sits more than 90 degrees off its facing.
  const behind = Math.sin(yaw) * dx + Math.cos(yaw) * dz < 0;
  if (!behind) return front;
  return front === 'grounded' ? 'charged' : 'grounded';
}

/** A Coil Strike's mark on the crown (scale = its radius). */
export const FOUNDRY_COIL_STRIKE_MARK = 'foundry_coil_strike_mark';

// ---- The Prime Draft (5.4): carry a storm cell into its chest (G12) ------------

/** The Draft wakes in its scaffold (a bar on the pull). */
export const DRAFT_AWAKEN = 'foundry_draft_awaken';
export const DRAFT_PISTON_FIST = 'foundry_piston_fist';
export const DRAFT_ARM_SWEEP = 'foundry_arm_sweep';
/** It tears its feet out of the gantry at 70 percent (a bar). */
export const DRAFT_UNBOLT = 'foundry_draft_unbolt';
export const DRAFT_TREMOR_STEP = 'foundry_tremor_step';
export const DRAFT_ARC_SURGE = 'foundry_arc_surge';
/** A rack ejects a Storm Cell (the spellfx cue). */
export const DRAFT_CHARGE_CYCLE = 'foundry_charge_cycle';
/** A cell slotted into the open hatch: stunned, and it takes more damage. */
export const DRAFT_OVERLOAD = 'foundry_overload';
/** The extra damage it takes after an Overload (an aura on the Draft). */
export const DRAFT_OVERLOADED = 'foundry_overloaded';
/** A cell slotted against a closed hatch arcs back. */
export const DRAFT_ARC_BACK = 'foundry_cell_arc_back';
/** A cell left too long shorts out over the whole gantry. */
export const DRAFT_SHORT_OUT = 'foundry_cell_short_out';
/** Its feet are bolted in (phase 1: an aura on the Draft). */
export const DRAFT_BOLTED = 'foundry_draft_bolted';
/** Below 15 percent: it runs past every limit. */
export const DRAFT_ENRAGE = 'foundry_draft_overdrive';
/** The carrier's aura: the cell, its slow. Its stacks are the Static it deals
 *  a second; its sourceId is the hatch ring (the HUD reads the hatch's state). */
export const DRAFT_CELL_CARRY = 'foundry_storm_cell_carry';
/** Static: the carrier's crackle (the damage ticks' label). */
export const DRAFT_STATIC = 'foundry_static';

export const DRAFT_TUNING = {
  awakenCast: 3,
  // Phase 1, Bolted.
  fistFirst: 8,
  fistEvery: 12,
  fistWarning: 2,
  fistRadius: 8,
  fistMin: 250,
  fistMax: 300,
  sweepFirst: 12,
  sweepEvery: 14,
  sweepCast: 1.5,
  sweepRange: 12,
  sweepArcDeg: 120,
  sweepMin: 280,
  sweepMax: 330,
  // Phase 2, Unbolted.
  unboltAtHpPct: 0.7,
  unboltCast: 2.5,
  rivetShowerMin: 90,
  rivetShowerMax: 110,
  rivetShowerRadius: 14,
  unboltedSpeed: 3,
  tremorFirst: 6,
  tremorEvery: 10,
  tremorCast: 1.5,
  tremorRadius: 10,
  tremorMin: 200,
  tremorMax: 240,
  // Phase 3, Heartless.
  heartlessAtHpPct: 0.35,
  surgeFirst: 6,
  surgeEvery: 15,
  surgeCount: 3,
  surgeMin: 180,
  surgeMax: 220,
  enrageAtHpPct: 0.15,
  enrageDamage: 0.3,
  // The Charge Cycle.
  cycleFirst: 15,
  cycleEvery: 30,
  heartlessCycleEvery: 25,
  /** A cell shorts out this long after it is ejected unless slotted. */
  cellLife: 15,
  shortOutMin: 190,
  shortOutMax: 210,
  /** Static on the carrier: this much a second, rising this much every 2 s held. */
  staticBase: 30,
  staticStep: 5,
  staticStepEvery: 2,
  /** The carrier moves at this share of their speed. */
  carrySlow: 0.7,
  /** The same player cannot take a cell back for this long after dropping it. */
  retakeLock: 3,
  pickupRange: 4,
  // The Core Hatch.
  hatchOpenAfter: 5,
  hatchWarning: 3,
  hatchOpenFor: 6,
  /** The gold ring in front of the hatch: its radius and its distance out. */
  hatchRingRadius: 4,
  hatchRingOut: 5,
  overloadStun: 6,
  overloadVuln: 0.25,
  overloadVulnSeconds: 12,
  /** Heroic Double Load: one cell alone only stuns this long, and the extra
   *  damage lasts half as long. */
  halfLoadStun: 2,
  arcBackMin: 190,
  arcBackMax: 210,
  arcBackRadius: 5,
  /** Heroic Jammed Racks: an ejected cell rolls this long before it settles. */
  jamRollSeconds: 3,
  jamRollSpeed: 3,
} as const;

/** The Storm Cell on the floor (scale = its pickup radius); a jammed cell
 *  rolling out of its rack cannot be taken yet. */
export const FOUNDRY_CELL_TEMPLATES = {
  ready: 'foundry_storm_cell',
  rolling: 'foundry_storm_cell_rolling',
} as const;
/** The Core Hatch's ring in front of the Draft: closed, shuddering (warned)
 *  or open (scale = the ring's radius, facing = the Draft's). */
export const FOUNDRY_HATCH_TEMPLATES = {
  closed: 'foundry_hatch_closed',
  warn: 'foundry_hatch_warn',
  open: 'foundry_hatch_open',
} as const;
export type HatchState = keyof typeof FOUNDRY_HATCH_TEMPLATES;
/** A Piston Fist's mark (scale = its radius). */
export const FOUNDRY_FIST_MARK = 'foundry_piston_fist_mark';
/** The quest item the Draft Record carries: the lore object left in the
 *  Prime Draft's opened chest (a ground object, so the generic pick-up and
 *  interact-credit paths own it). */
export const DRAFT_RECORD_ITEM = 'draft_record';

/** The hatch's state `t` seconds after a cell was ejected. */
export function hatchStateAt(t: number): HatchState {
  const T = DRAFT_TUNING;
  if (t >= T.hatchOpenAfter && t < T.hatchOpenAfter + T.hatchOpenFor) return 'open';
  if (t >= T.hatchOpenAfter - T.hatchWarning && t < T.hatchOpenAfter) return 'warn';
  return 'closed';
}

/** The hatch state an encounter object's template names, or null. */
export function hatchStateOf(templateId: string): HatchState | null {
  if (templateId === FOUNDRY_HATCH_TEMPLATES.open) return 'open';
  if (templateId === FOUNDRY_HATCH_TEMPLATES.warn) return 'warn';
  if (templateId === FOUNDRY_HATCH_TEMPLATES.closed) return 'closed';
  return null;
}

/** Static on a carrier who has held the cell `held` seconds (per second). */
export function staticPerSecond(held: number): number {
  const T = DRAFT_TUNING;
  return T.staticBase + T.staticStep * Math.floor(Math.max(0, held) / T.staticStepEvery);
}

/** Every Foundry encounter object the dungeon draws itself. */
export const FOUNDRY_OBJECT_TEMPLATES: ReadonlySet<string> = new Set<string>([
  FOUNDRY_BURST_RING,
  FOUNDRY_SCRAP_MARK,
  ...Object.values(FOUNDRY_BELT_TEMPLATES),
  FOUNDRY_PRESS_STRIP,
  FOUNDRY_SHELL_MARK,
  FOUNDRY_SHRAPNEL,
  ...Object.values(FOUNDRY_BUNKER_TEMPLATES),
  FOUNDRY_COIL_STRIKE_MARK,
  ...Object.values(FOUNDRY_CELL_TEMPLATES),
  ...Object.values(FOUNDRY_HATCH_TEMPLATES),
  FOUNDRY_FIST_MARK,
]);
