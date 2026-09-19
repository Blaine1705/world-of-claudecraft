import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// docs/design/graphics-settings-fairness.md, "The Frame Rate Limit is a pacing
// choice, not a tier knob": the limit and the HUD tier resolvers must never
// feed each other, or a pacing choice would start moving HUD knobs (and the
// static preset would start moving the frame rate).

const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const code = (path: string): string =>
  stripComments(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

const READS_FRAME_RATE_LIMIT = /frame_cadence|frame_rate_cap|chosen_cadence|frameRateCap/;
const READS_GRAPHICS_TIER = /ui_effects_profile|ui_tier_knobs|graphicsPreset|fxTier|GFX\b/;

const CADENCE_MODULES = [
  'src/game/frame_cadence_core.ts',
  'src/game/frame_cadence_auto_core.ts',
  'src/game/frame_cadence_calm_core.ts',
  'src/game/frame_cadence_surface_core.ts',
  'src/game/frame_cadence_wiring.ts',
  'src/game/display_refresh_estimator_core.ts',
  'src/game/frame_rate_cap_setting.ts',
  'src/render/chosen_cadence.ts',
  'src/render/chosen_cadence_pressure_core.ts',
];
const TIER_RESOLVERS = ['src/game/ui_effects_profile.ts', 'src/game/ui_tier_knobs.ts'];

describe('frame rate limit fairness', () => {
  it.each(TIER_RESOLVERS)('%s never reads the frame rate limit', (path) => {
    expect(code(path)).not.toMatch(READS_FRAME_RATE_LIMIT);
  });

  it.each(CADENCE_MODULES)('%s never reads the graphics tier or the HUD effect profile', (path) => {
    expect(code(path)).not.toMatch(READS_GRAPHICS_TIER);
  });

  it('the automatic memory reads the preset only to key and to sign, never to decide', () => {
    const source = code('src/game/frame_cadence_auto_memory.ts');
    const reads = source.split('\n').filter((line) => READS_GRAPHICS_TIER.test(line));
    expect(reads.map((line) => line.trim())).toEqual([
      "preset = new Settings().get('graphicsPreset');",
      "return `${settings.get('graphicsPreset')}|${settings.get('renderScale')}`;",
    ]);
    // Neither read can reach a ceiling: the module never names one.
    expect(source).not.toMatch(/ceiling\s*=\s*(30|60)|return\s+(30|60)\b/);
  });

  it.each([
    "import { createFrameCadence } from './frame_cadence_core';",
    "import { frameRateCapReading } from './frame_rate_cap_setting';",
    "import { chosenCadenceIntervalMs } from '../render/chosen_cadence';",
    "const cap = settings.get('frameRateCap');",
  ])('the frame rate limit scan fires on %s', (sample) => {
    expect(stripComments(sample)).toMatch(READS_FRAME_RATE_LIMIT);
  });

  it.each([
    "import { uiEffectsProfile } from './ui_effects_profile';",
    "import { tierKnobs } from './ui_tier_knobs';",
    "const preset = settings.get('graphicsPreset');",
    'if (profile.fxTier > 1) return 30;',
    'const budget = GFX.budget.dropFrameMs;',
  ])('the graphics tier scan fires on %s', (sample) => {
    expect(stripComments(sample)).toMatch(READS_GRAPHICS_TIER);
  });

  it('scans code only: a mention in a comment is not a read', () => {
    const sample = '// see ui_tier_knobs\n/* graphicsPreset */\nexport const x = 1;';
    expect(stripComments(sample)).not.toMatch(READS_GRAPHICS_TIER);
  });
});
