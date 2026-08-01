import { describe, expect, it } from 'vitest';
import {
  dominionSummonBlock,
  missingDominionTemplates,
  NECROMANCY_DOMINION_CAP,
} from '../src/sim/combat/necromancy_dominion';

describe('Necromancy Dominion composition', () => {
  it('allows two unique servants and blocks duplicates or a third normal summon', () => {
    const warrior = { templateId: 'necromancy_skeletal_warrior' };
    const mage = { templateId: 'necromancy_bone_mage' };

    expect(NECROMANCY_DOMINION_CAP).toBe(2);
    expect(dominionSummonBlock([], warrior.templateId)).toBeNull();
    expect(dominionSummonBlock([warrior], warrior.templateId)).toBe('duplicate');
    expect(dominionSummonBlock([warrior], mage.templateId)).toBeNull();
    expect(dominionSummonBlock([warrior, mage], 'necromancy_gravewing')).toBe('full');
  });

  it('returns only the archetypes Army of the Dead must add', () => {
    expect(
      missingDominionTemplates([
        { templateId: 'necromancy_skeletal_warrior' },
        { templateId: 'necromancy_bone_mage' },
      ]),
    ).toEqual(['necromancy_gravewing']);
  });
});
