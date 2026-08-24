// Pure selection model for the raid guide reached from party frames. It maps
// the player's current raid room to one boss and returns stable translation keys.
// Each guide includes the Heroic-only row explicitly, avoiding any dependency on the
// group's mutable next-entry difficulty while an already-claimed raid is active.

import {
  IGNIVAR_FORGE_APPROACH_ID,
  IGNIVAR_RAID_ARENA_ID,
  IGNIVAR_SECOND_WING_ID,
  VARKHUL_BOSS_ID,
} from '../sim/ignivar_raid_ids';
import { IGNIVAR_BOSS_ID } from '../sim/types';

export type RaidBossGuideBoss = 'ignivar' | 'varkhul';

const IGNIVAR_MECHANICS = [
  'hudChrome.raidBossGuide.ignivar.brand',
  'hudChrome.raidBossGuide.ignivar.movement',
  'hudChrome.raidBossGuide.ignivar.apocalypse',
  'hudChrome.raidBossGuide.ignivar.judgment',
  'hudChrome.raidBossGuide.ignivar.finale',
] as const;

const VARKHUL_MECHANICS = [
  'hudChrome.raidBossGuide.varkhul.tanks',
  'hudChrome.raidBossGuide.varkhul.orbs',
  'hudChrome.raidBossGuide.varkhul.pyre',
  'hudChrome.raidBossGuide.varkhul.ray',
  'hudChrome.raidBossGuide.varkhul.forge',
  'hudChrome.raidBossGuide.varkhul.adds',
] as const;

export type RaidBossGuideMechanicKey =
  | (typeof IGNIVAR_MECHANICS)[number]
  | (typeof VARKHUL_MECHANICS)[number]
  | 'hudChrome.raidBossGuide.ignivar.heroic'
  | 'hudChrome.raidBossGuide.varkhul.heroic';

export interface RaidBossGuideView {
  boss: RaidBossGuideBoss;
  bossId: typeof IGNIVAR_BOSS_ID | typeof VARKHUL_BOSS_ID;
  mechanicKeys: readonly RaidBossGuideMechanicKey[];
}

export function raidBossGuideBossForDungeon(dungeonId: string | null): RaidBossGuideBoss | null {
  if (dungeonId === IGNIVAR_FORGE_APPROACH_ID || dungeonId === IGNIVAR_RAID_ARENA_ID) {
    return 'ignivar';
  }
  if (dungeonId === IGNIVAR_SECOND_WING_ID) return 'varkhul';
  return null;
}

export function raidBossGuideView(boss: RaidBossGuideBoss): RaidBossGuideView {
  if (boss === 'ignivar') {
    return {
      boss,
      bossId: IGNIVAR_BOSS_ID,
      mechanicKeys: [...IGNIVAR_MECHANICS, 'hudChrome.raidBossGuide.ignivar.heroic'],
    };
  }
  return {
    boss,
    bossId: VARKHUL_BOSS_ID,
    mechanicKeys: [...VARKHUL_MECHANICS, 'hudChrome.raidBossGuide.varkhul.heroic'],
  };
}
