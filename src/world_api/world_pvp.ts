// IWorld facet: World PvP, the /pvp flag (src/sim/pvp/world_pvp.ts). The
// self-scoped readout the World PvP tab paints plus the one command that
// raises or lowers the flag. Whether ANOTHER player is flagged is not here: it
// rides the entity roster as `Entity.pvpFlag` (the `pvp` wire bit), which is
// what the nameplate and target-frame cores read, together with the zone
// policy of the ground under each player (src/sim/pvp/world_pvp_zones.ts).
//
// Offline the Sim answers from the primary player's own state; online
// ClientWorld mirrors the server's `wpvp` self key (delta-omitted: an absent
// key keeps the prior readout, null before the first snapshot).

export type WorldPvpZone = 'sanctuary' | 'contested' | 'ffa';

export interface WorldPvpInfo {
  /** Attackable by, and able to attack, other flagged players right now.
   *  Stays true through the whole disarm countdown. */
  flagged: boolean;
  /** Seconds until the flag drops after /pvp off, or null when it is not
   *  switching off (armed for good, or not flagged). */
  disarmRemaining: number | null;
  /** Career world kills paid to this character, and career deaths to other
   *  players in the open world. */
  kills: number;
  deaths: number;
  /** Below WORLD_PVP_MIN_LEVEL: the toggle is shown locked with the requirement. */
  levelLocked: boolean;
  /** What the ground under this player says: a sanctuary (no world PvP at
   *  all), contested (the mutual-flag rule), or free-for-all (everyone here is
   *  fair game, flag or not). */
  zone: WorldPvpZone;
  /** False on a realm whose kill switch is set (server env WORLD_PVP_DISABLED):
   *  no flag can be raised and no zone is free-for-all, so the client paints
   *  nobody hostile on the world arm. */
  enabled: boolean;
}

export interface IWorldWorldPvp {
  worldPvpInfo: WorldPvpInfo | null;
  /** Raise (true) or lower (false) the flag; lowering starts the disarm
   *  countdown. The sim refuses and explains under level or when nothing
   *  changes; the bare /pvp chat command toggles through the same path. */
  setWorldPvpFlag(enabled: boolean): void;
}
