// Bot configuration from env. All secrets are server-side env only (never
// committed). Missing-required values throw at boot with a clear message.

import {
  DEFAULT_BAN_PAUSE_MS,
  DEFAULT_BREAKER_LIMIT,
  DEFAULT_FORBIDDEN_TTL_MS,
  DEFAULT_MAX_RPS,
} from './rate_governor';

export interface BotConfig {
  /** Discord bot token (Bot <token>). */
  token: string;
  /** Discord application (client) id, for slash-command registration. */
  clientId: string;
  /** The official guild id the bot operates in. */
  guildId: string;
  /** Base URL of the game server (for /internal/discord/* calls). */
  gameServerUrl: string;
  /** Shared secret matching the server's DISCORD_BOT_SECRET. */
  botSecret: string;
  /** Featured voice channel id surfaced in the game HUD (optional). */
  voiceChannelId: string;
  /** Channel id for welcome messages on member join (optional). */
  welcomeChannelId: string;
  /** Channel id for a startup "bot online" announcement / test posts (optional). */
  testChannelId: string;
  /** Channel id the in-game "!" community posts (LFG etc.) are delivered to. */
  relayChannelId: string;
  /** Channel id the significant-activity feed (level-ups, drops, ...) posts to. */
  activityChannelId: string;
  /** Channel id for daily rewards top-10 winner announcements. */
  dailyRewardsChannelId: string;
  /** Public game URL shown in bot replies. */
  gameUrl: string;
  /** Sync each linked member's Discord nickname to include their in-game level. */
  syncNicknames: boolean;
  /** Governor send-rate ceiling, requests per second (Discord's own limit is 50). */
  maxRps: number;
  /** Process-wide pause after a 429 whose body is not JSON (a Cloudflare ban). */
  banPauseMs: number;
  /** Invalid responses in one 10 minute window that open the request breaker. */
  breakerLimit: number;
  /** How long a member's 401 or 403 is remembered before it is retried. */
  forbiddenTtlMs: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[bot] missing required env ${name}`);
  return v;
}

/**
 * Positive number from an env VALUE, falling back to the default for anything
 * else. Takes the value rather than the key on purpose: a second dynamic
 * `process.env[...]` lookup would slip past the env-key inventory guard in
 * tests/discord_bot_config.test.ts, which is what keeps this file's real key set
 * enumerable.
 *
 * Empty and non-numeric both fall back. `Number('')` is 0, so an unguarded
 * parse would turn a blank line in a .env into a hard 0, which for the send rate
 * means the bot silently stops sending and for a threshold means it trips
 * immediately.
 */
function positiveNumberFromEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function loadConfig(): BotConfig {
  return {
    token: required('DISCORD_BOT_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: required('DISCORD_GUILD_ID'),
    gameServerUrl: process.env.GAME_SERVER_URL || 'http://127.0.0.1:8787',
    botSecret: required('DISCORD_BOT_SECRET'),
    voiceChannelId: process.env.DISCORD_VOICE_CHANNEL_ID || '',
    welcomeChannelId: process.env.DISCORD_WELCOME_CHANNEL_ID || '',
    testChannelId: process.env.DISCORD_TEST_CHANNEL_ID || '',
    // Relay posts default to the test/announce channel when not set separately.
    relayChannelId:
      process.env.DISCORD_RELAY_CHANNEL_ID || process.env.DISCORD_TEST_CHANNEL_ID || '',
    // Activity feed defaults to the relay channel (then test) when not set.
    activityChannelId:
      process.env.DISCORD_ACTIVITY_CHANNEL_ID ||
      process.env.DISCORD_RELAY_CHANNEL_ID ||
      process.env.DISCORD_TEST_CHANNEL_ID ||
      '',
    dailyRewardsChannelId: process.env.DISCORD_DAILY_REWARDS_CHANNEL_ID || '',
    gameUrl: process.env.PUBLIC_GAME_URL || 'https://worldofclaudecraft.com',
    syncNicknames: process.env.DISCORD_SYNC_NICKNAMES !== '0',
    maxRps: positiveNumberFromEnv(process.env.DISCORD_MAX_RPS, DEFAULT_MAX_RPS),
    banPauseMs: positiveNumberFromEnv(process.env.DISCORD_BAN_PAUSE_MS, DEFAULT_BAN_PAUSE_MS),
    breakerLimit: positiveNumberFromEnv(process.env.DISCORD_BREAKER_LIMIT, DEFAULT_BREAKER_LIMIT),
    forbiddenTtlMs: positiveNumberFromEnv(
      process.env.DISCORD_FORBIDDEN_TTL_MS,
      DEFAULT_FORBIDDEN_TTL_MS,
    ),
  };
}
