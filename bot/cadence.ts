// How often the bot's background loops run.
//
// These live outside main.ts because main.ts calls main() at module scope, so a
// test cannot import a constant from there without booting the whole bot (real
// env, real Discord REST, a real WebSocket). Keeping them here lets the suite
// pin the cadences directly.
//
// Values only: no env parsing, no derived timers. main.ts is the only RUNTIME
// consumer; the suite imports them directly to pin them.

export const ROLE_SYNC_INTERVAL_MS = 5 * 60_000;
export const PRESENCE_DEBOUNCE_MS = 4_000;
export const RELAY_POLL_MS = 3_000; // how often the bot pulls queued in-game "!" posts
