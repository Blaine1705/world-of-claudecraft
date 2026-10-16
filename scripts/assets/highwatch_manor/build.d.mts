export interface HighwatchManorAssetSpec {
  source: string;
  target: string;
  collision: string;
  collisionId: string;
  inputs: readonly string[];
  requiredNodes: readonly string[];
  materials: readonly string[];
}
export const HIGHWATCH_MANOR_ASSET: HighwatchManorAssetSpec;
export function sourceFingerprint(asset?: HighwatchManorAssetSpec, root?: string): string;
export function buildHighwatchManor(
  asset?: HighwatchManorAssetSpec,
  root?: string,
): Promise<Uint8Array>;
export function mergeManorCollision(raw: string, rows: unknown, id?: string): string;
