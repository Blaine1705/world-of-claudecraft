import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PALADIN_CORE_ICON_IDS = [
  'divine_ascension',
  'hushbrand',
  'unbinding_blessing',
  'guardian_covenant',
  'devotion_ward',
  'solar_step',
  'solar_invocation',
  'hammer_of_grace',
  'hammer_of_light',
  'sacred_form',
  'aegis_first_dawn',
  'radiant_devotion',
  'dawn_devotion',
  'grace_devotion',
  'recall_the_fallen',
  'beacon_of_light',
  'oathstrike',
  'final_edict',
  'dawnfall',
  'faithforged_guard',
  'mercy_lance',
  'dawns_embrace',
  'radiant_chorus',
  'life_covenant',
  'vowkeeper_strike',
  'bastion_rite',
  'sunward_disc',
  'sacred_challenge',
  'citadel_of_faith',
] as const;

describe('Paladin core icon identity', () => {
  it('gives every new ability an explicit procedural recipe instead of a fallback', () => {
    const source = readFileSync('src/ui/icons.ts', 'utf8');
    for (const id of PALADIN_CORE_ICON_IDS) {
      expect(source, id).toMatch(new RegExp(`\\n\\s*${id}: r\\(`));
    }
  });

  it('uses the five-charge Ascension seal primitive for Divine Ascension', () => {
    const source = readFileSync('src/ui/icons.ts', 'utf8');
    expect(source).toContain('ascension_seal(ctx, pal)');
    expect(source).toMatch(/divine_ascension: r\([\s\S]*?\{ p: 'ascension_seal', \.\.\.BIG \}/);
  });
});
