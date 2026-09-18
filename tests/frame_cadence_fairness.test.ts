import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// docs/design/graphics-settings-fairness.md, "The Frame Rate Limit is a pacing
// choice, not a tier knob": the limit and the HUD tier resolvers must never
// feed each other, or a pacing choice would start moving HUD knobs (and the
// static preset would start moving the frame rate).

const code = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

const CADENCE_MODULES = [
  'src/game/frame_cadence_core.ts',
  'src/game/frame_cadence_auto_core.ts',
  'src/game/frame_cadence_wiring.ts',
  'src/game/display_refresh_estimator_core.ts',
  'src/game/frame_rate_cap_setting.ts',
];
const TIER_RESOLVERS = ['src/game/ui_effects_profile.ts', 'src/game/ui_tier_knobs.ts'];

describe('frame rate limit fairness', () => {
  it.each(TIER_RESOLVERS)('%s never reads the frame rate limit', (path) => {
    expect(code(path)).not.toMatch(/frame_cadence|frame_rate_cap|chosen_cadence|frameRateCap/);
  });

  it.each(CADENCE_MODULES)('%s never reads the graphics tier or the HUD effect profile', (path) => {
    expect(code(path)).not.toMatch(/ui_effects_profile|ui_tier_knobs|graphicsPreset|fxTier|GFX\b/);
  });
});
