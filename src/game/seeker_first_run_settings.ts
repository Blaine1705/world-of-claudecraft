export interface SeekerFirstRunState {
  readonly seekerHost: boolean;
  readonly graphicsUserSelected: boolean;
  readonly browserEffectsDefaultApplied: boolean;
  readonly browserEffectsUserSelected: boolean;
  readonly weatherDefaultApplied: boolean;
  readonly weatherUserSelected: boolean;
}

export interface SeekerFirstRunSettings {
  graphicsPreset?: 1;
  browserEffects?: 3;
  weather?: 0;
}

/**
 * Selects only the Seeker defaults that remain eligible. An explicit player
 * choice always wins, while an automatically selected graphics tier may be
 * corrected once the native host is verified as a Seeker.
 */
export function seekerFirstRunSettings(state: SeekerFirstRunState): SeekerFirstRunSettings | null {
  if (!state.seekerHost) return null;

  const selected: SeekerFirstRunSettings = {};
  if (!state.graphicsUserSelected) selected.graphicsPreset = 1;
  if (!state.browserEffectsUserSelected && !state.browserEffectsDefaultApplied) {
    selected.browserEffects = 3;
  }
  if (!state.weatherUserSelected && !state.weatherDefaultApplied) selected.weather = 0;

  return Object.keys(selected).length > 0 ? selected : null;
}
