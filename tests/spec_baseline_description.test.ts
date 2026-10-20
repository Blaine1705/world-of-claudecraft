import { beforeAll, describe, expect, it } from 'vitest';
import { SPEC_BASELINES } from '../src/sim/content/spec_baselines';
import { TALENTS } from '../src/sim/content/talents';
import type { PlayerClass } from '../src/sim/types';
import { ensureLocaleLoaded, setLanguage } from '../src/ui/i18n';
import { specBaselineDescription } from '../src/ui/talent_i18n';

function specDef(cls: PlayerClass, id: string) {
  const spec = TALENTS[cls]?.specs.find((candidate) => candidate.id === id);
  if (!spec) throw new Error(`missing spec ${cls}/${id}`);
  return spec;
}

describe('spec card baseline line (spec_baselines.ts made visible)', () => {
  beforeAll(async () => {
    await ensureLocaleLoaded('en');
    setLanguage('en');
  });

  it('describes every baseline spec, and nothing for the excluded classes', () => {
    for (const [cls, talents] of Object.entries(TALENTS) as [
      PlayerClass,
      (typeof TALENTS)[PlayerClass],
    ][]) {
      for (const spec of talents?.specs ?? []) {
        const described = specBaselineDescription(spec);
        if (SPEC_BASELINES[cls]?.[spec.id]) {
          expect(described, `${cls}/${spec.id}`).toBeTruthy();
          expect(described, `${cls}/${spec.id}`).not.toContain('undefined');
        } else {
          expect(described, `${cls}/${spec.id}`).toBeNull();
        }
      }
    }
  });

  it('shows the rogue AP and crit floors that set the specs apart', () => {
    const knifework = specBaselineDescription(specDef('rogue', 'assassination')) ?? '';
    const thuggery = specBaselineDescription(specDef('rogue', 'combat')) ?? '';
    const skulduggery = specBaselineDescription(specDef('rogue', 'subtlety')) ?? '';
    expect(knifework).toContain('Increases critical strike chance by 12%.');
    expect(knifework).toContain('Increases attack power by 57%.');
    expect(thuggery).toContain('Increases attack power by 24.');
    expect(thuggery).toContain('Increases critical strike chance by 14%.');
    expect(thuggery).toContain('Increases attack power by 20%.');
    expect(skulduggery).toContain('Increases critical strike chance by 10%.');
    expect(skulduggery).not.toContain('attack power');
  });
});
