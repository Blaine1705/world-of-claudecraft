import { beforeAll, describe, expect, it } from 'vitest';
import { SPEC_BASELINES } from '../src/sim/content/spec_baselines';
import { TALENTS } from '../src/sim/content/talents';
import { offensiveSpecTuningFor, primaryHealingMultiplier } from '../src/sim/spec_output_tuning';
import type { PlayerClass } from '../src/sim/types';
import { ensureLocaleLoaded, setLanguage } from '../src/ui/i18n';
import { specBaselineDescription } from '../src/ui/talent_i18n';

function specDef(cls: PlayerClass, id: string) {
  const spec = TALENTS[cls]?.specs.find((candidate) => candidate.id === id);
  if (!spec) throw new Error(`missing spec ${cls}/${id}`);
  return spec;
}

function line(cls: PlayerClass, id: string): string {
  return specBaselineDescription(specDef(cls, id)) ?? '';
}

describe('spec card Specialization bonus line (hidden spec power made visible)', () => {
  beforeAll(async () => {
    await ensureLocaleLoaded('en');
    setLanguage('en');
  });

  it('describes every spec with a baseline or output tuning, and nothing for the rest', () => {
    for (const [cls, talents] of Object.entries(TALENTS) as [
      PlayerClass,
      (typeof TALENTS)[PlayerClass],
    ][]) {
      for (const spec of talents?.specs ?? []) {
        const described = specBaselineDescription(spec);
        const hidden =
          SPEC_BASELINES[cls]?.[spec.id] !== undefined ||
          offensiveSpecTuningFor(cls, spec.id) !== undefined ||
          primaryHealingMultiplier(cls, spec.id) !== 1;
        if (hidden) {
          expect(described, `${cls}/${spec.id}`).toBeTruthy();
          expect(described, `${cls}/${spec.id}`).not.toContain('undefined');
          expect(described, `${cls}/${spec.id}`).not.toContain('NaN');
        } else {
          expect(described, `${cls}/${spec.id}`).toBeNull();
        }
      }
    }
  });

  it('shows the rogue AP and crit floors that set the specs apart', () => {
    const knifework = line('rogue', 'assassination');
    const thuggery = line('rogue', 'combat');
    const skulduggery = line('rogue', 'subtlety');
    expect(knifework).toContain('Increases critical strike chance by 12%.');
    expect(knifework).toContain('Increases attack power by 57%.');
    expect(thuggery).toContain('Increases attack power by 24.');
    expect(thuggery).toContain('Increases critical strike chance by 14%.');
    expect(thuggery).toContain('Increases attack power by 20%.');
    expect(skulduggery).toContain('Increases critical strike chance by 10%.');
    expect(skulduggery).not.toContain('attack power');
  });

  it('folds the output-tuning bonus into one total per damage bucket', () => {
    // 0.22 legacy meleeDmgPct + 0.10 offense bonus.
    expect(line('rogue', 'assassination')).toContain('Increases melee ability damage by 32%.');
    expect(line('rogue', 'assassination')).not.toContain('by 22%');
    // 0.10 legacy spellDmgPct + 0.22 (Necromancy) and + 0.11 (Ruination).
    expect(line('warlock', 'demonology')).toContain('Increases spell damage by 32%.');
    expect(line('warlock', 'destruction')).toContain('Increases spell damage by 21%.');
    // No legacy bucket: the offense bonus stands alone.
    expect(line('hunter', 'marksmanship')).toContain('Increases melee ability damage by 10%.');
    expect(line('shaman', 'elemental')).toContain('Increases spell damage by 5%.');
  });

  it('reads Doctrine as plain damage and the healer factors as healing done', () => {
    expect(line('priest', 'discipline')).toContain('Increases damage by 30%.');
    expect(line('priest', 'discipline')).not.toContain('melee ability damage');
    expect(line('paladin', 'holy')).toBe('Increases healing done by 10%.');
    expect(line('shaman', 'restoration')).toContain('Increases healing done by 10%.');
    // healPct 0.08 then the 1.05 primary factor: 1.08 x 1.05 = 1.134.
    expect(line('druid', 'restoration')).toContain('Increases healing done by 13.4%.');
  });

  it('leaves the untouched specs blank', () => {
    expect(specBaselineDescription(specDef('warrior', 'arms'))).toBeNull();
    expect(specBaselineDescription(specDef('mage', 'fire'))).toBeNull();
    expect(specBaselineDescription(specDef('paladin', 'protection'))).toBeNull();
  });
});
