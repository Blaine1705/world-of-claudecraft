export interface HighwatchGuildAssetSpec {
  source: string;
  target: string;
  collision: string;
  collisionId: string;
  inputs: readonly string[];
  requiredNodes: readonly string[];
  materials: readonly string[];
}

export const GUILD_TROPHY_DUNGEONS: readonly string[];
export const HIGHWATCH_GUILD_ASSET: HighwatchGuildAssetSpec;
export function guildSourceFingerprint(asset?: HighwatchGuildAssetSpec, root?: string): string;
export function buildHighwatchGuild(
  asset?: HighwatchGuildAssetSpec,
  root?: string,
): Promise<Uint8Array>;
export function mergeGuildCollision(raw: string, rows: unknown, id?: string): string;
