// Lantern Hall's trophy room, the pure half (render/highwatch_guild_trophies.ts paints it): which
// of the five dungeon trophies the viewing player has earned, read off the Book of Deeds' own
// clear records (IWorldDeeds.deedStats.dungeonClears: '<dungeon>' counts Normal clears,
// '<dungeon>:heroic' Heroic ones). A trophy hangs once the dungeon has been cleared at all; its
// plaque is gilded once cleared on Heroic. Render-only: nothing here reaches the sim.
// Three-, DOM- and i18n-free.

/** The five five-player dungeons the trophy room keeps a plaque for, in the model's part
 *  names (scripts/assets/highwatch_guild/build.mjs GUILD_TROPHY_DUNGEONS, pinned equal). */
export const GUILD_TROPHY_DUNGEONS = [
  'hollow_crypt',
  'sunken_bastion',
  'drowned_temple',
  'wildheart_basin',
  'gravewyrm_sanctum',
] as const;

export type GuildTrophyDungeon = (typeof GUILD_TROPHY_DUNGEONS)[number];

export interface GuildTrophyState {
  readonly dungeon: GuildTrophyDungeon;
  /** The trophy hangs on its plaque. */
  readonly trophy: boolean;
  /** The plaque wears its Heroic gilding. */
  readonly gilt: boolean;
}

function clears(record: Readonly<Record<string, number>> | undefined, key: string): number {
  const value = record?.[key];
  return typeof value === 'number' && value > 0 ? value : 0;
}

export function guildTrophyStates(
  dungeonClears: Readonly<Record<string, number>> | undefined,
): GuildTrophyState[] {
  return GUILD_TROPHY_DUNGEONS.map((dungeon) => {
    const heroic = clears(dungeonClears, `${dungeon}:heroic`);
    const normal = clears(dungeonClears, dungeon);
    return { dungeon, trophy: heroic + normal > 0, gilt: heroic > 0 };
  });
}

/** A compact signature of the states (two bits a dungeon), so the painter re-applies only on
 *  a change. */
export function guildTrophySignature(states: readonly GuildTrophyState[]): number {
  let sig = 0;
  for (const [i, state] of states.entries()) {
    if (state.trophy) sig |= 1 << (2 * i);
    if (state.gilt) sig |= 1 << (2 * i + 1);
  }
  return sig;
}

/** The model's part names for one dungeon's trophy and gilding. */
export function guildTrophyNodeNames(dungeon: GuildTrophyDungeon): {
  trophy: string;
  gilt: string;
} {
  return { trophy: `G_INT_Trophy_${dungeon}`, gilt: `G_INT_TrophyGilt_${dungeon}` };
}
