import type { HighwatchManorAssetSpec } from '../highwatch_manor/build.mjs';

export const GUILD_TROPHY_DUNGEONS: readonly string[];
export const HIGHWATCH_GUILD_ASSET: HighwatchManorAssetSpec;
export function guildSourceFingerprint(asset?: HighwatchManorAssetSpec, root?: string): string;
export function buildHighwatchGuild(
  asset?: HighwatchManorAssetSpec,
  root?: string,
): Promise<Uint8Array>;
export function mergeGuildCollision(raw: string, rows: unknown, id?: string): string;
