export interface SeekerFirstRunSettings {
  readonly graphicsPreset: 1;
  readonly browserEffects: 3;
  readonly weather: 0;
}

const SEEKER_FIRST_RUN_SETTINGS: SeekerFirstRunSettings = {
  graphicsPreset: 1,
  browserEffects: 3,
  weather: 0,
};

/**
 * Defaults for a verified Seeker host that has not applied any device default.
 * Returning null preserves every explicit or previously applied player choice.
 */
export function seekerFirstRunSettings(
  defaultAlreadyApplied: boolean,
  seekerHost: boolean,
): SeekerFirstRunSettings | null {
  return !defaultAlreadyApplied && seekerHost ? SEEKER_FIRST_RUN_SETTINGS : null;
}
