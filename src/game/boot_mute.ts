// Boot the client silent: `?mute=1` (or a bare `?mute`) zeroes every audio volume
// for the session without touching the player's saved levels.
//
// This exists for the cases where sound is actively unwanted rather than merely
// off: a screenshot or E2E run opening several tabs at once, a shared machine, a
// meeting. Turning the sliders down by hand persists, so the next real session
// comes back silent and the player has to remember why; a query flag lasts exactly
// as long as the tab.
//
// Pure: `search` is a parameter with a `location.search` default, matching the
// other query flags here (perf_doctor, gpu_hitch_receipt), so it unit-tests
// without a browser.

/** The volume settings the flag silences. */
export const MUTED_VOLUME_KEYS = ['sfxVolume', 'musicVolume', 'voiceVolume'] as const;

export type MutedVolumeKey = (typeof MUTED_VOLUME_KEYS)[number];

function currentSearch(): string {
  try {
    return typeof location === 'undefined' ? '' : location.search;
  } catch {
    return '';
  }
}

/**
 * Whether this boot is muted. Accepts `?mute`, `?mute=1` and `?mute=true`;
 * `?mute=0` / `?mute=false` explicitly does NOT mute, so the flag can be pinned
 * off in a URL that is otherwise copied around.
 */
export function isBootMuted(search: string = currentSearch()): boolean {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return false;
  }
  const raw = params.get('mute');
  if (raw === null) return false;
  if (raw === '') return true; // a bare ?mute
  return raw !== '0' && raw.toLowerCase() !== 'false';
}

/** True for a volume key the mute flag overrides. */
export function isMutedVolumeKey(key: string): key is MutedVolumeKey {
  return (MUTED_VOLUME_KEYS as readonly string[]).includes(key);
}
