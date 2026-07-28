// Hand-written declarations for derived_icon_check.mjs so the Vitest unit
// suite (tests/derived_icon_check.test.ts) type-checks its imports. Keep in
// step with the .mjs exports.
export declare const MAX_CHANNEL_DELTA: number;
export declare const MAX_MEAN_DELTA: number;
export declare function derivedIconStale(
  committed: Buffer,
  rendered: Buffer,
): Promise<string | null>;
