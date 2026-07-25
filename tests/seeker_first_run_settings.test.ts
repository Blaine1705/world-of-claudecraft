import { describe, expect, it } from 'vitest';
import { seekerFirstRunSettings } from '../src/game/seeker_first_run_settings';

describe('Seeker first-run settings', () => {
  it('selects the low, minimal-effects, weather-off profile for a verified first run', () => {
    expect(seekerFirstRunSettings(false, true)).toEqual({
      graphicsPreset: 1,
      browserEffects: 3,
      weather: 0,
    });
  });

  it('does not change defaults on a non-Seeker host', () => {
    expect(seekerFirstRunSettings(false, false)).toBeNull();
  });

  it('does not overwrite settings after a device default or player choice was applied', () => {
    expect(seekerFirstRunSettings(true, true)).toBeNull();
  });
});
