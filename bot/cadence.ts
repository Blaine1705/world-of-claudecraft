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

/**
 * How long the linked-member sweep waits between SLICES while a pass is live.
 *
 * The pass itself still runs every ROLE_SYNC_INTERVAL_MS; this is the pacing
 * INSIDE one, and it is what turns the sweep from a single burst into a spread.
 * The old sweep asked about every online member in one tick, so a thousand
 * concurrent players meant a thousand reads and up to a thousand Discord writes
 * queued at once; at this cadence one pass over the same population is a few
 * hundred requests spread across a couple of minutes, which the rate governor
 * can pace without ever reaching its queue depth.
 */
export const SWEEP_SLICE_MS = 3_000;
