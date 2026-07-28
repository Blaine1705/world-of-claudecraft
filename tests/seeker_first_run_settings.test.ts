import { describe, expect, it } from 'vitest';
import { seekerFirstRunSettings } from '../src/game/seeker_first_run_settings';

describe('Seeker first-run settings', () => {
  it('selects the low, minimal-effects, weather-off profile for a verified first run', () => {
    expect(
      seekerFirstRunSettings({
        seekerHost: true,
        graphicsUserSelected: false,
        browserEffectsDefaultApplied: false,
        browserEffectsUserSelected: false,
        weatherDefaultApplied: false,
        weatherUserSelected: false,
      }),
    ).toEqual({
      graphicsPreset: 1,
      browserEffects: 3,
      weather: 0,
    });
  });

  it('does not change defaults on a non-Seeker host', () => {
    expect(
      seekerFirstRunSettings({
        seekerHost: false,
        graphicsUserSelected: false,
        browserEffectsDefaultApplied: false,
        browserEffectsUserSelected: false,
        weatherDefaultApplied: false,
        weatherUserSelected: false,
      }),
    ).toBeNull();
  });

  it('replaces an automatic graphics preset but preserves every explicit player choice', () => {
    expect(
      seekerFirstRunSettings({
        seekerHost: true,
        graphicsUserSelected: false,
        browserEffectsDefaultApplied: false,
        browserEffectsUserSelected: true,
        weatherDefaultApplied: false,
        weatherUserSelected: true,
      }),
    ).toEqual({ graphicsPreset: 1 });
  });

  it('applies each unselected Seeker default only once', () => {
    expect(
      seekerFirstRunSettings({
        seekerHost: true,
        graphicsUserSelected: true,
        browserEffectsDefaultApplied: true,
        browserEffectsUserSelected: false,
        weatherDefaultApplied: true,
        weatherUserSelected: false,
      }),
    ).toBeNull();
  });
});
