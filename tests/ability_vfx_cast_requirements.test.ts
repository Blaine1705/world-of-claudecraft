// The cast gate's requirement masks (src/render/ability_vfx/cast_requirements.ts):
// the families a cast of each ability waits on. Every painter cast waits on the
// engine; a Warrior appearance also waits on the kit; no other class ever does.

import { describe, expect, it } from 'vitest';
import {
  castVfxRequirement,
  drawsWarriorKit,
  WARRIOR_KIT_REQUIREMENT,
} from '../src/render/ability_vfx/cast_requirements';
import { CAST_VFX_ENGINE, CAST_VFX_KIT } from '../src/render/cast_vfx_family';
import { WARRIOR_VFX_FULL_SPECS } from '../src/render/warrior_vfx_specs';
import { ABILITIES } from '../src/sim/data';
import { abilityVfxSpecIds } from './helpers/ability_vfx_spec_ids';

const IDS = abilityVfxSpecIds();

describe('the requirement masks', () => {
  it('walks the whole spec union', () => {
    expect(IDS.length).toBeGreaterThan(300);
    for (const id of ['fireball', 'heroic_strike', 'chaos_bolt', 'emberkin_felbolt'])
      expect(IDS).toContain(id);
  });

  it('asks every id for the engine, and the kit exactly for the Warrior appearances', () => {
    const wrong: string[] = [];
    for (const id of IDS) {
      const mask = castVfxRequirement(id);
      const warrior =
        ABILITIES[id]?.class === 'warrior' || Object.hasOwn(WARRIOR_VFX_FULL_SPECS, id);
      if ((mask & CAST_VFX_ENGINE) === 0) wrong.push(`${id}: no engine`);
      if (((mask & CAST_VFX_KIT) !== 0) !== warrior) wrong.push(`${id}: kit ${!warrior}`);
      if ((mask & ~(CAST_VFX_ENGINE | CAST_VFX_KIT)) !== 0) wrong.push(`${id}: unknown family`);
    }
    expect(wrong).toEqual([]);
  });

  it('never makes another class wait on the kit', () => {
    const kit = IDS.filter((id) => drawsWarriorKit(id));
    expect(kit.length).toBeGreaterThan(20);
    expect(kit.filter((id) => ABILITIES[id] && ABILITIES[id].class !== 'warrior')).toEqual([]);
    expect(castVfxRequirement('fireball')).toBe(CAST_VFX_ENGINE);
    expect(castVfxRequirement('heroic_strike')).toBe(WARRIOR_KIT_REQUIREMENT);
    expect(WARRIOR_KIT_REQUIREMENT).toBe(CAST_VFX_ENGINE | CAST_VFX_KIT);
  });

  it('answers an id with no spec with the engine alone', () => {
    expect(castVfxRequirement('no_such_ability_for_the_gate')).toBe(CAST_VFX_ENGINE);
  });
});
