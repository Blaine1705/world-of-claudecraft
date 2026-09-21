// IWorld facet: World PvP, the /pvp flag (src/sim/pvp/world_pvp.ts). The
// self-scoped readout the World PvP tab paints plus the one command that
// raises or lowers the flag. Whether ANOTHER player is flagged is not here: it
// rides the entity roster as `Entity.pvpFlag` (the `pvp` wire bit), which is
// what the nameplate and target-frame cores read.
//
// Offline the Sim answers from the primary player's own state; online
// ClientWorld mirrors the server's `wpvp` self key (delta-omitted: an absent
// key keeps the prior readout, null before the first snapshot).

export interface WorldPvpInfo {
  /** Attackable by, and able to attack, other flagged players right now.
   *  Stays true through the whole disarm countdown. */
  flagged: boolean;
  /** Seconds until the flag drops after /pvp off, or null when it is not
   *  switching off (armed for good, or not flagged). */
  disarmRemaining: number | null;
  /** Career world kills paid to this character, and career deaths to flagged
   *  players. */
  kills: number;
  deaths: number;
  /** Below WORLD_PVP_MIN_LEVEL: the toggle is shown locked with the requirement. */
  levelLocked: boolean;
}

export interface IWorldWorldPvp {
  worldPvpInfo: WorldPvpInfo | null;
  /** Raise (true) or lower (false) the flag; lowering starts the disarm
   *  countdown. The sim refuses and explains under level or when nothing
   *  changes; the bare /pvp chat command toggles through the same path. */
  setWorldPvpFlag(enabled: boolean): void;
}
