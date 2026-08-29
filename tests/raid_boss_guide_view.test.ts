import { describe, expect, it } from 'vitest';
import { VARKHUL_MAKERS_BRAND_TANK_SWAP_STACKS } from '../src/sim/encounters/varkhul';
import {
  VARKHUL_SHARED_PYRE_RAID_DAMAGE_PER_MISSING,
  VARKHUL_SHARED_PYRE_REQUIRED_PLAYERS,
} from '../src/sim/varkhul_shared_pyre';
import { abilityIconRecipe, isUnknownIconRecipe } from '../src/ui/icons';
import { raidBossGuideBossForDungeon, raidBossGuideView } from '../src/ui/raid_boss_guide_view';

describe('raid boss guide view', () => {
  it('selects the next boss from every Ignivar raid room and stays absent elsewhere', () => {
    expect(raidBossGuideBossForDungeon('ignivar_forge_approach')).toBe('ignivar');
    expect(raidBossGuideBossForDungeon('ignivar_raid_arena')).toBe('ignivar');
    expect(raidBossGuideBossForDungeon('ignivar_molten_assembly')).toBe('varkhul');
    expect(raidBossGuideBossForDungeon('ignivar_inner_crucible')).toBe('varkhul');
    expect(raidBossGuideBossForDungeon('hollow_crypt')).toBeNull();
    expect(raidBossGuideBossForDungeon(null)).toBeNull();
  });

  it('builds Ignivar as a phased journal with his real portrait and role guidance', () => {
    const view = raidBossGuideView('ignivar', 'normal');

    expect(view.bossId).toBe('ignivar_herald_of_the_last_flame');
    expect(view.portraitUrl).toBe('/ui/mobs/ignivar_herald_of_the_last_flame.webp');
    expect(view.phases.map((phase) => phase.id)).toEqual([
      'opening',
      'apocalypse',
      'judgment',
      'finale',
    ]);
    expect(view.phases.flatMap((phase) => phase.mechanics).map((mechanic) => mechanic.id)).toEqual([
      'forge-strike',
      'brand-of-the-pyre',
      'searing-torrent',
      'rain-of-cinders',
      'revolving-inferno',
      'forge-wave',
      'apocalypse',
      'judgment-of-the-forge',
      'last-inferno',
    ]);
    expect(
      view.phases
        .flatMap((phase) => phase.mechanics)
        .find((mechanic) => mechanic.id === 'forge-strike')?.roles,
    ).toEqual(['tank', 'healer']);
    expect(view.phases.find((phase) => phase.id === 'apocalypse')).toMatchObject({
      values: { health: 0.65 },
      percentValues: ['health'],
    });
  });

  it('adds Heroic-only mechanics and selects Heroic-specific explanations', () => {
    const normal = raidBossGuideView('ignivar', 'normal');
    const heroic = raidBossGuideView('ignivar', 'heroic');
    const normalMechanics = normal.phases.flatMap((phase) => phase.mechanics);
    const heroicMechanics = heroic.phases.flatMap((phase) => phase.mechanics);

    expect(normalMechanics.some((mechanic) => mechanic.id === 'chains-of-the-forge')).toBe(false);
    expect(heroicMechanics.some((mechanic) => mechanic.id === 'chains-of-the-forge')).toBe(true);
    expect(normalMechanics.find((mechanic) => mechanic.id === 'forge-wave')?.summaryKey).not.toBe(
      heroicMechanics.find((mechanic) => mechanic.id === 'forge-wave')?.summaryKey,
    );
    expect(
      normalMechanics.find((mechanic) => mechanic.id === 'judgment-of-the-forge')?.summaryKey,
    ).not.toBe(
      heroicMechanics.find((mechanic) => mechanic.id === 'judgment-of-the-forge')?.summaryKey,
    );
  });

  it('covers Varkhul tanking, soaks, forge adds, beam blocking, and the final phase', () => {
    const view = raidBossGuideView('varkhul', 'heroic');
    const mechanics = view.phases.flatMap((phase) => phase.mechanics);

    expect(view.bossId).toBe('varkhul_forgefather_of_the_last_flame');
    expect(view.portraitUrl).toBe('/ui/mobs/varkhul_forgefather_of_the_last_flame.webp');
    expect(view.phases.map((phase) => phase.id)).toEqual(['opening', 'assembly', 'finale']);
    expect(mechanics.map((mechanic) => mechanic.id)).toEqual([
      'makers-brand',
      'forgefather-frontal',
      'cinder-orbs',
      'shared-pyre',
      'forgestorm',
      'tempering-ray',
      'anvils-decree',
      'masters-assembly',
      'crucible-beam',
      'forge-legion',
      'masterpiece-unbound',
      'worldfire',
    ]);
    expect(mechanics.find((mechanic) => mechanic.id === 'makers-brand')?.values).toEqual({
      stacks: VARKHUL_MAKERS_BRAND_TANK_SWAP_STACKS,
    });
    expect(mechanics.find((mechanic) => mechanic.id === 'shared-pyre')?.values).toEqual({
      players: VARKHUL_SHARED_PYRE_REQUIRED_PLAYERS,
      missingPenalty: VARKHUL_SHARED_PYRE_RAID_DAMAGE_PER_MISSING,
    });
    expect(mechanics.find((mechanic) => mechanic.id === 'shared-pyre')?.percentValues).toEqual([
      'missingPenalty',
    ]);
    expect(mechanics.find((mechanic) => mechanic.id === 'forge-legion')?.flags).toEqual([
      'interruptible',
      'important',
    ]);
  });

  it('gives every journal mechanic a deliberate and visually distinct ability icon', () => {
    const iconIds = [
      ...new Set(
        (['ignivar', 'varkhul'] as const).flatMap((boss) =>
          raidBossGuideView(boss, 'heroic').phases.flatMap((phase) =>
            phase.mechanics.map((mechanic) => mechanic.iconId),
          ),
        ),
      ),
    ];
    const recipes = iconIds.map((iconId) => abilityIconRecipe(iconId));

    expect(recipes.every((recipe) => !isUnknownIconRecipe(recipe))).toBe(true);
    expect(new Set(recipes.map((recipe) => JSON.stringify(recipe))).size).toBe(iconIds.length);
  });
});
