import { describe, expect, it } from 'vitest';
import { abilitiesKnownAt } from '../src/sim/content/classes';
import { computeTalentModifiers } from '../src/sim/content/talents';
import type { AbilityEffect, PlayerClass } from '../src/sim/types';

function rowMods(cls: PlayerClass, rows: Record<number, string>) {
  return computeTalentModifiers(cls, { spec: null, rows }, 20);
}

function resolvedEffect<T extends AbilityEffect['type']>(
  cls: PlayerClass,
  abilityId: string,
  type: T,
  rows: Record<number, string>,
): Extract<AbilityEffect, { type: T }> {
  const ability = abilitiesKnownAt(cls, 20, rowMods(cls, rows)).find((a) => a.def.id === abilityId);
  if (!ability) throw new Error(`missing resolved ability ${cls}:${abilityId}`);
  const effect = ability.effects.find((candidate) => candidate.type === type);
  if (!effect) throw new Error(`missing resolved effect ${cls}:${abilityId}:${type}`);
  return effect as Extract<AbilityEffect, { type: T }>;
}

function resolvedAbility(cls: PlayerClass, abilityId: string, rows: Record<number, string>) {
  const ability = abilitiesKnownAt(cls, 20, rowMods(cls, rows)).find((a) => a.def.id === abilityId);
  if (!ability) throw new Error(`missing resolved ability ${cls}:${abilityId}`);
  return ability;
}

describe('talent buffPct resolver fixes', () => {
  it('Improved Cutthroat Tempo scales Slice and Dice finisher haste bonus', () => {
    const effect = resolvedEffect('rogue', 'slice_and_dice', 'finisherHaste', {
      11: 'rog_r11_improved_slice_and_dice',
    });

    expect(effect.mult).toBeCloseTo(1.375, 6);
    expect(effect.basedur).toBe(9);
    expect(effect.perCombo).toBe(3);
  });

  it('Improved Evasion scales Evasion dodge and cooldown', () => {
    const ability = resolvedAbility('rogue', 'evasion', { 17: 'rog_r17_improved_evasion' });
    const effect = ability.effects.find((candidate) => candidate.type === 'selfBuff');

    expect(ability.cooldown).toBeCloseTo(240, 6);
    expect(effect).toMatchObject({ kind: 'buff_dodge', value: 0.65 });
  });

  it("Aspect Mastery scales Marten's Guise fractional dodge", () => {
    const effect = resolvedEffect('hunter', 'aspect_of_the_monkey', 'selfBuff', {
      5: 'hun_r5_aspect_mastery',
    });

    expect(effect.kind).toBe('buff_dodge');
    expect(effect.value).toBeCloseTo(0.112, 6);
  });

  it('Rapid Killing preserves Fevered Draw fractional haste multiplier', () => {
    const ability = resolvedAbility('hunter', 'rapid_fire', { 20: 'hun_r20_rapid_killing' });
    const effect = ability.effects.find((candidate) => candidate.type === 'selfBuff');

    expect(ability.cooldown).toBeCloseTo(150, 6);
    expect(effect).toMatchObject({ kind: 'buff_haste', value: 1.75 });
  });

  it('Righteous Cause scales the Judgement trigger damage multiplier', () => {
    const effect = resolvedEffect('paladin', 'judgement', 'judgement', {
      14: 'pal_r14_righteous_cause',
    });

    expect(effect.dmgMult).toBeCloseTo(1.15, 6);
    expect(effect.flat ?? 0).toBe(0);
  });
});
