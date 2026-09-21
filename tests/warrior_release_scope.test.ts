import { describe, expect, it } from 'vitest';
import { abilityVfxFullSpec, abilityVfxSpec } from '../src/render/ability_vfx_registry';
import { WARRIOR_CHOREOGRAPHY } from '../src/render/warrior_vfx_specs';
import { ABILITIES } from '../src/sim/data';
import {
  abilityVfxSpec as priorCompact,
  abilityVfxFullSpec as priorFull,
} from './helpers/release44_ability_vfx_reference';

describe('Warrior-only release44 integration', () => {
  it('leaves every other class resolved on the original release objects', () => {
    let checked = 0;
    for (const [id, ability] of Object.entries(ABILITIES)) {
      if (ability.class === 'warrior') continue;
      expect(abilityVfxSpec(id), id).toBe(priorCompact(id));
      expect(abilityVfxFullSpec(id), id).toBe(priorFull(id));
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
  it('selects the authored physical choreography for every reviewed Warrior ability', () => {
    for (const [id, physical] of Object.entries(WARRIOR_CHOREOGRAPHY)) {
      expect(ABILITIES[id]?.class, id).toBe('warrior');
      expect(abilityVfxFullSpec(id)?.physical, id).toBe(physical);
      expect(abilityVfxFullSpec(id)?.windupStyle, id).toBe('none');
    }
  });
});
