// How often the bot's background loops run.
//
// These live outside main.ts because main.ts calls main() at module scope, so a
// test cannot import a constant from there without booting the whole bot (real
// env, real Discord REST, a real WebSocket). Keeping them here lets the suite
// pin the cadences directly.
//
// Values only: no env parsing, no derived timers. As of Phase 3 the runtime
// consumer is bot/config.ts, which layers the D13 env overrides on top of these
// as its fallbacks (main.ts reads the resolved BotConfig fields, never these
// constants); the suite still imports them directly to pin them.

export const ROLE_SYNC_INTERVAL_MS = 5 * 60_000;
export const PRESENCE_DEBOUNCE_MS = 4_000;
export const RELAY_POLL_MS = 3_000; // how often the bot pulls queued in-game "!" posts
