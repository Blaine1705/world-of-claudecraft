# Phase 01 QA: draw_stats accumulator (composer tiers)

Phase spec: packet-0-instruments.md, "Phase 01" (rulings R1, R2 binding).
Status: COMPLETE. All acceptance checks below passed on 2026-07-23.

## What changed

- NEW `src/render/draw_stats_core.ts`: pure core (registered in `RENDER_PURE_CORES`,
  `tests/architecture.test.ts`). `createDrawStatsAccumulator()` turns the monotonic
  WebGL counters into per-frame deltas: `beginFrame(read)` returns the previous
  frame's delta (per-field, clamped at zero; the first call only establishes the
  baseline and returns a zero frame), `noteOutOfBand(read)` drops an out-of-band
  render (the caller resets the counters right after, so the baseline drops to
  zero). `governorDrawSignal(tier, frame)` returns the frozen
  `COMPOSER_TIER_LEGACY_DRAW_SIGNAL` on high/ultra and the frame verbatim on
  low/medium. Local structural counters interface; no three/DOM/clock/i18n imports.
  The module header documents the version-pinned three r165 behavior by symbol:
  `WebGLRenderer.render()` calls `info.reset()` after `WebGLShadowMap.render` and
  before the scene pass when `info.autoReset` is true; `WebGLInfo.reset()` zeroes
  only the render counters, never `info.memory` or `info.programs`.
- `src/render/renderer.ts` (thin consumer edits only): flips `info.autoReset` to
  false at construction ONLY when `GFX.composer` (R1) and creates the accumulator;
  `sync()` snapshots the previous frame's delta via `beginFrame` before
  `updateAdaptiveResolution` runs; `perfStats()` serves `calls`/`triangles` from
  the snapshot on composer tiers and the live info elsewhere (field names
  unchanged); `updateAdaptiveResolution` feeds the governor through
  `governorDrawSignal` on the composer path only; `renderPrewarmPass` and
  `captureScreenshot` route through a shared `discardOutOfBandDraws()` helper
  (`noteOutOfBand` + `info.reset()`, no-op off the composer path).
- `src/render/gfx.ts`: `GFX_CONFIG_VERSION` 17 to 18 (R2) so fleet dashboards can
  segment the draw-count semantics change.
- `scripts/profiler/harness.mjs`: the collector's draws/tris fields now come from
  the `perfStats()` surface (the raw counters are monotonic on composer tiers);
  points/lines stay raw and are documented as monotonic there.
- `scripts/prewarm_travel_bench.mjs`: its calls/triangles probe fields switch to
  the perfStats surface too (via the `g.perf.report()` snapshot it already
  holds). The bench forces `?gfx=ultra` by default, so the raw fields would have
  been monotonic totals; both the qa-checklist and frontend-seam reviewers
  flagged this, falsifying the phase spec's "one out-of-src consumer" wording,
  which is corrected in `packet-0-instruments.md` in the same change.
- NEW `tests/draw_stats_core.test.ts`: the five pinned behaviors plus a per-field
  clamp case, the passthrough-by-reference pin, and the `GFX_CONFIG_VERSION` 18
  pin (R2). The out-of-band exclusion fixture arms a NON-ZERO in-band baseline
  before `noteOutOfBand` so a no-op exclusion fails the test (a coverage-audit
  finding); mutation-verified: no-opping `noteOutOfBand` turns the suite red.
- `tests/architecture.test.ts`: the one-line `RENDER_PURE_CORES` registration.

Untouched by contract: `src/render/render_budget.ts`, its `CAPS_BY_TIER`,
`tests/render_budget.test.ts` (verified absent from the diff), the separate
`WebGLRenderer` instances (portrait/preview/armory/guide own their `info`), and
every consumer of `info.memory`/`info.programs` (never reset).

## Design decisions recorded

- The gate is `GFX.composer`, not the tier name. `GFX.composer` is false on the
  native-iOS memory profile and under the advanced preset's effects shed even at
  tier high/ultra; those profiles keep three's auto-reset, live reads, and live
  governor input, bit-identical to before. `governorDrawSignal` is therefore only
  consulted on the composer path (its low/medium passthrough arm is pinned by the
  unit test); routing a non-composer high/ultra profile through it would have
  frozen a live governor input, which R1 forbids.
- The WebGL counters stay monotonic between frames on composer tiers: `sync()`
  never calls `info.reset()`; the accumulator re-arms its baseline instead. Only
  out-of-band renders reset the counters (paired with `noteOutOfBand`).
- Cost of an out-of-band exclusion: the in-band draws accumulated since the last
  `beginFrame` are discarded with it, so the frame in which a screenshot or a
  prewarm burst happens under-reports once. Screenshot capture is user-triggered
  and prewarm bursts accompany loading/teleport transitions; accepted as
  telemetry-only noise and documented in the core's contract comment.
- `beginFrame` returns a fresh small delta object (and copies the baseline) each
  frame on composer tiers, about two short-lived objects per frame. The
  frontend-seam reviewer noted the deviation from the render suite's
  allocation-free `*Into` pattern and judged it acceptable (capable-hardware
  tiers only, gen-0 sized); the phase spec pins the `beginFrame(read)` returning
  signature, so the returning API stands. Revisit only if an allocation probe
  ever gates this path.

## Acceptance evidence

Probe method: headless Chromium (swiftshader) against the local Vite dev client,
offline warrior spawn in town, 150 frames sampled per run after a 9 s settle; each
sample reads raw `webgl.info.render`, `perfStats()`, and the governor state.
Artifacts: `draw-stats-{pre,post}-{high,ultra,low}.json` (session scratchpad).

1. Legacy constant confirmed live before pinning (spec requirement). Pre-change
   high AND ultra: every one of 150 sampled frames on each tier read exactly
   `{calls: 1, triangles: 1, points: 0, lines: 0}` (one distinct tuple per run),
   matching brainstorm finding 19's final-fullscreen-pass prediction. That exact
   value is pinned as `COMPOSER_TIER_LEGACY_DRAW_SIGNAL` and asserted as literals
   in `tests/draw_stats_core.test.ts`.
2. Composer tiers report real numbers. Post-change high: `perfStats().calls`
   857 to 866, triangles about 3.53M to 3.55M per frame (55 views in town), so
   the `?perf` overlay draws row (`perf_metrics_sampler.ts` reads
   `perfStats().calls`) reports hundreds in town, not 1. Post-change ultra:
   calls 855 to 865. `autoReset` false, `graphicsConfigVersion` 18 confirmed in
   both runs.
3. Low tier byte-identical to the pre-change control. Same code path by
   construction (accumulator is null: constructor flip, sync snapshot, perfStats
   arm, and governor arm all reduce to the pre-change expressions; `autoReset`
   stayed true in the run). Control comparison: pre-change low read calls
   405-406; two post-change low runs read 402-403 and 401-402, drifting by the
   same 1-3 calls BETWEEN the two post-change runs as between pre and post, with
   the structural signature identical in all three runs: exactly two distinct
   adjacent tuples, points constant at 4154, and the intra-run triangle spread
   exactly 2858 in every run. The drift tracks wall-clock scene variance
   (time-of-day visuals), not the change.
4. Governor neutrality. Governor reason histograms contain no `draw` reason in
   any run; quality levels are identical pre vs post on every tier (high:
   grass 0.6 / foliage 0.6 / vfx 0.68 / lighting 0.62 under swiftshader
   submit-stall pressure, both sides; ultra: governor disabled, levels 1.0, both
   sides; low: the low-tier minimums, both sides). `render_budget.ts` and
   `tests/render_budget.test.ts` are unedited and the suite passes.
5. Tests. `npx vitest run tests/draw_stats_core.test.ts`: 8 passed. Regression
   net unmodified and green in one run: `render_budget`, `perf_metrics_sampler`,
   `perf_overlay_model`, `perf_reporter`, `architecture` (79 tests, 5 files).
6. `npx tsc --noEmit`: clean. `npx @biomejs/biome ci` over the six changed files:
   exit 0 (warnings pre-existing in `renderer.ts`/`harness.mjs`, none in the new
   files). Diff scanned: no em/en dashes, no emojis, no `.only(`, no `debugger`.

## Per-tier neutrality argument (restated)

- low / medium: `GFX.composer` is false, so `drawStats` is null and every touched
  code path evaluates the identical pre-change expression against a counter that
  three still auto-resets per render. Governor input, `perfStats` output, and the
  raw counters are unchanged.
- high / ultra (composer active): the governor received the final-pass constant
  1 call / 1 triangle before (live-confirmed) and now receives the frozen legacy
  constant with the same values, so its draw-pressure arm remains exactly as dead
  as it was; its frame/submit/stall inputs are untouched. Only TELEMETRY
  (`perfStats().calls`/`triangles` and everything downstream: overlay,
  `rendererCalls`/`rendererTriangles` in perf reports, the profiler harness)
  changes, which is the point of the phase; dashboards segment on
  `GFX_CONFIG_VERSION` 18.
- native-iOS high/ultra and advanced-preset effects shed (composer false at a
  high/ultra tier): accumulator null, so identical to low/medium: no flip, live
  reads, live governor input. `governorDrawSignal` is never consulted there.

## Adversarial pass: what is missing or deliberately left

- `scripts/prewarm_travel_bench.mjs` sampled raw `info.render.calls`/`triangles`
  as a secondary probe field; FIXED in this phase (switched to the perfStats
  surface) after both reviewers flagged it, see the design decisions above.
  `scripts/freeze_walk_debug.mjs` reads only `info.programs`: unaffected.
  `scripts/profile.mjs` consumes the already-corrected harness snapshot.
- `perfStats()` deliberately does not grow points/lines fields (field names
  unchanged per the phase spec), so the harness keeps those two from the raw
  counters, documented as monotonic on composer tiers.
- One-frame telemetry under-report per out-of-band exclusion (see design
  decisions); mid-game prewarm bursts (instance transitions) hit this by design.
- The first `sync()` frame on composer tiers reports a zero delta (first-call
  baseline discard). Pre-change it reported 1/1 garbage; both are meaningless
  boot samples.
- The live-probe script is session-scratch tooling, not committed; phase 07's
  committed baselines runbook owns the durable capture story.
- `points`/`lines` are accumulated by the core and tested, but no production
  consumer reads them yet; they exist so the structural interface mirrors
  `WebGLInfo.render` and later packets need no core change.
- Not run here: full `npm run gate` and the fleet-side verification that
  dashboards segment on version 18; both are packet-close items per the packet
  plan (phase 07).
