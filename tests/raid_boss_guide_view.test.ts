import { describe, expect, it } from 'vitest';
import { raidBossGuideBossForDungeon, raidBossGuideView } from '../src/ui/raid_boss_guide_view';

describe('raid boss guide view', () => {
  it('selects the boss from the current raid room and stays absent elsewhere', () => {
    expect(raidBossGuideBossForDungeon('ignivar_forge_approach')).toBe('ignivar');
    expect(raidBossGuideBossForDungeon('ignivar_raid_arena')).toBe('ignivar');
    expect(raidBossGuideBossForDungeon('ignivar_molten_assembly')).toBe('varkhul');
    expect(raidBossGuideBossForDungeon('ignivar_inner_crucible')).toBe('varkhul');
    expect(raidBossGuideBossForDungeon('hollow_crypt')).toBeNull();
    expect(raidBossGuideBossForDungeon(null)).toBeNull();
  });

  it('keeps each guide concise while always identifying its Heroic-only rule', () => {
    expect(raidBossGuideView('ignivar')).toEqual({
      boss: 'ignivar',
      bossId: 'ignivar_herald_of_the_last_flame',
      mechanicKeys: [
        'hudChrome.raidBossGuide.ignivar.brand',
        'hudChrome.raidBossGuide.ignivar.movement',
        'hudChrome.raidBossGuide.ignivar.apocalypse',
        'hudChrome.raidBossGuide.ignivar.judgment',
        'hudChrome.raidBossGuide.ignivar.finale',
        'hudChrome.raidBossGuide.ignivar.heroic',
      ],
    });
    expect(raidBossGuideView('varkhul').mechanicKeys).toEqual([
      'hudChrome.raidBossGuide.varkhul.tanks',
      'hudChrome.raidBossGuide.varkhul.orbs',
      'hudChrome.raidBossGuide.varkhul.pyre',
      'hudChrome.raidBossGuide.varkhul.ray',
      'hudChrome.raidBossGuide.varkhul.forge',
      'hudChrome.raidBossGuide.varkhul.adds',
      'hudChrome.raidBossGuide.varkhul.heroic',
    ]);
  });
});
