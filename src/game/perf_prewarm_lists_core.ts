// Which members of the streamed-prewarm diagnostic lists a perf report can
// afford to carry, and which ones are worth carrying.
//
// Sizing, measured against a real capture
// (projected through the report's own field mapping): a compile unit costs
// about 280 bytes, a manifest entry about 190, a pacing transition about 115.
// The pre-existing prewarm summary (32 manifest entries plus the resume block)
// is already about 7 KB of the server's 16 KB raw-summary budget, and the rest
// of rawSummary takes several more. Carrying 32 compile units would add ~9 KB
// on its own, pushing every report of a session that actually compiled over
// the cap and into the compact path, which is exactly where these fields would
// be dropped: the diagnostic would be missing precisely when it is interesting.
//
// So the lists are SAMPLES, and the sampling picks the informative members
// rather than the first ones:
//   - compile units: every failure first (a failed unit is the signal), then
//     the slowest by synchronous time, which is what a hitch is made of;
//   - pacing transitions: the most RECENT, which carry the end state;
//   - budget variants: the first, since they enumerate a fixed level ladder in
//     a meaningful order and are all equally interesting.
// Selected members are emitted back in their original order, so a reader still
// sees a timeline rather than a ranking.

/** Per-list caps for the verbatim report path. */
export const PREWARM_REPORT_COMPILE_UNITS = 12;
export const PREWARM_REPORT_BUDGET_VARIANTS = 8;
export const PREWARM_REPORT_TRANSITIONS = 12;

/** The fields the compile-unit sampling ranks on. */
export interface SampledCompileUnit {
  failedAtMs?: number | null;
  syncMs?: number | null;
  settledDurationMs?: number | null;
}

/**
 * The most diagnostic `limit` compile units, in their original order.
 * Failures rank above everything; the rest rank by synchronous time, then by
 * settle duration, so a tie between two zero-cost units is broken stably.
 */
export function sampleCompileUnits<T extends SampledCompileUnit>(
  units: readonly T[],
  limit = PREWARM_REPORT_COMPILE_UNITS,
): T[] {
  if (units.length <= limit) return [...units];
  const ranked = units.map((unit, index) => ({ unit, index }));
  ranked.sort((a, b) => {
    const failed = Number(b.unit.failedAtMs != null) - Number(a.unit.failedAtMs != null);
    if (failed !== 0) return failed;
    const sync = (b.unit.syncMs ?? 0) - (a.unit.syncMs ?? 0);
    if (sync !== 0) return sync;
    const settled = (b.unit.settledDurationMs ?? 0) - (a.unit.settledDurationMs ?? 0);
    if (settled !== 0) return settled;
    return a.index - b.index;
  });
  return ranked
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.unit);
}

/** The most recent `limit` pacing transitions, oldest first. */
export function sampleTransitions<T>(units: readonly T[], limit = PREWARM_REPORT_TRANSITIONS): T[] {
  return units.length <= limit ? [...units] : units.slice(units.length - limit);
}
