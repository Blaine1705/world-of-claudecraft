# Phase 02 QA: client net-pipeline instrumentation

Phase spec: packet-0-instruments.md, "Phase 02" (rulings R8, R9, R10 binding;
brainstorm finding 20's net half plus the section 6 downgraded-but-not-cleared note).
Status: COMPLETE. All acceptance checks below passed on 2026-07-23.

## What changed

- NEW `src/net/net_pipeline_stats.ts`: always-on counters for the parse/apply
  blind spot. Clock-injected (every timestamp rides in through call arguments;
  the module never reads `performance.now` itself) and bucket-agnostic: src/net
  never imports src/game, main.ts is the junction (R8). `recordSnapshot({nowMs,
  approxBytes, parseMs, applyMs, entCount, keepCount, rawGapMs|null})` feeds
  cumulative totals plus three bounded rings (capacity 1024) whose p50/p95/max
  digests are cached per push, so `summary()` stays cheap at per-frame call
  cadence. `onAnimationFrame(nowMs)` folds the applied-since-last-frame count
  into the 0/1/2/3plus histogram (R9); `noteReset()` counts a reconnect and
  clears the pending fold; `noteVisibilityChange()` clears the pending fold so
  a hidden-tab backlog never fakes a 3plus burst (R9); `summary()` returns the
  small fixed-size record (totals plus p50/p95/max for parse/apply/gap plus the
  histogram). Bytes are the UTF-16 `raw.length` proxy named `approxBytes` (R9),
  never a TextEncoder pass.
- `src/net/online.ts`: the lazy-init holder `netPipeline()` per the wireSeen
  bareClient pattern (no field initializer; bareClient suites build instances
  via `Object.create(ClientWorld.prototype)`, which skips initializers).
  `onMessage` times `JSON.parse`; the snap arm reads the RAW inter-arrival gap
  from `lastSnapAt` BEFORE `applySnapshot` runs (which both updates `lastSnapAt`
  and feeds the (5,500)-windowed EWMA; the filter itself is untouched by
  contract), times `applySnapshot`, and records the sample with `raw.length`
  and the `ents`/`keep` counts. The hello reconnect arm calls `noteReset()`
  next to the existing `lastSnapAt = 0`, so the first post-reconnect snapshot
  records a null gap instead of the multi-second reconnect window.
- `src/game/perf.ts`: UNGATED `setNetPipeline(summary)` into the new nullable
  `PerfSnapshot.netPipeline` (deliberately NOT the enabled-gated `setNetwork`
  pattern; see the ungated-vs-gated argument below); nullable
  `PerfSnapshot.heapSawtooth` served from the sampler; the 1 Hz heap sample
  hooked into the ungated arm of `tick()`; `reset()` clears both; optional
  `recordExternalSpan` exposing the previously unused 'external'
  `DevPerfTraceSpan` kind for dev traces (a no-op unless `?perfTrace=1`).
- NEW `src/game/heap_sawtooth.ts` (R10): injected reader plus injected clock.
  `gcDropCount`/`avgDropMb`/`allocRateMbPerSec` are cumulative from the 1 Hz
  used-heap series; `amplitudeMb` is max minus min over a bounded 360-sample
  window. Quantization tolerance: a decrease only counts as a GC drop once the
  fall from the tracked baseline passes `GC_DROP_MIN_MB` (2 MB); smaller dips
  leave the baseline parked, so noise nets out of the alloc rate while a slow
  multi-sample decline still registers once its cumulative fall crosses the
  floor. A null reader (non-Chromium) or fewer than two samples yields a null
  summary, never NaN.
- `src/main.ts` (wiring only): the per-frame drain next to the existing
  `setNetwork` call (`onAnimationFrame(now)` then `setNetPipeline(summary())`),
  and the visibilitychange hook that resets the pending snapshots-per-rAF count
  (R9). Both reference the concrete `online` (null offline), never IWorld.
- `src/game/perf_reporter.ts`: `netPipeline` and `heapSawtooth` into
  `rawSummary`. `server/perf_report.ts`: both keys appended to the
  `compactRawSummary` truncation allowlist (no DDL; rawSummary is JSONB). The
  phase spec named only 'netPipeline' for the allowlist; 'heapSawtooth' is
  added in the same change because the reporter writes it as its own top-level
  rawSummary key and it would otherwise be silently dropped on truncation (the
  cross-platform reviewer confirmed this as the safe-direction completion).
- Tests: NEW `tests/net_pipeline_stats.test.ts` (hand-computed totals and
  digests, the load-bearing 900 ms retained-gap pin, the null-gap skip,
  histogram folds across all four buckets, noteReset and noteVisibilityChange
  behavior, ring eviction at the literal 1024, plus the bareClient integration
  pins: two real onMessage frames with computed byte sums, the
  gap-read-before-applySnapshot ordering pin, the omitted-keep arm, and the
  hello-reconnect noteReset pin), NEW `tests/heap_sawtooth.test.ts`
  (ramp-drop-ramp with hand-computed values, multi-drop averaging, sub-floor
  noise, slow-decline crossing, null reader, under-two samples, mid-series
  null, reset), NEW `tests/perf_monitor.test.ts` (the ungating pin, the 1 Hz
  ungated heap sampling pin, the reset-clears-both pin, both external-span
  arms), and `tests/perf_reporter.test.ts` plus `tests/perf_report.test.ts`
  extended (rawSummary carriage in both null and populated arms; truncation
  survival of both keys with an anti-vacuous dropped-filler assertion).

Untouched by contract: the (5,500) EWMA gap filter and every other line of
`applySnapshot`; the enabled-gating of `setNetwork`, the overlay, and the
gated spans; all schema/DDL; `src/sim/` entirely; the IWorld seam (no facet
member, `tests/world_api_parity.test.ts` unedited); `tests/snapshots.test.ts`
and `tests/architecture.test.ts` (regression net, unedited and green).

Formatting note: `src/game/perf.ts` predated the 100-column formatter, so the
required biome pass over changed files normalized it; the semantic diff on that
file is only the additions above (verified via a whitespace-insensitive diff).

## The ungated-vs-gated argument (restated)

The fleet story is always-on aggregate counters (R9). `setNetwork` is gated on
`PerfMonitor.enabled` because it feeds the dev overlay; if `setNetPipeline`
copied that pattern, the production fleet (overlay always off) would report
`netPipeline: null` forever and the blind spot would remain exactly as
invisible as before this phase. So `setNetPipeline` and the 1 Hz heap sample
in `tick()` deliberately sit on the ungated path, while everything
player-invisible-but-costly (overlay DOM, dev-trace spans, `markInput*`)
stays gated. The always-on cost is bounded: three capacity-1024 number rings
plus cumulative scalars, digest sorts at most once per 20 Hz snapshot push
(cached between pushes), one small summary object per frame (the same order as
the existing per-frame gated `setNetwork` object), and one heap read per
second. The unit pin for the split is `tests/perf_monitor.test.ts` (network
null while netPipeline populated with `enabled === false`); the live pin is
acceptance check 1 below, on a real disabled-overlay session.

## Acceptance evidence

Probe method: local stack (`npm run db:up`, `npm run server` on :8787,
`npm run dev` on :5173, server bundled AFTER all edits), headless Chromium via
puppeteer-core plus `scripts/browser_path.mjs`, real register/create/enter
flows copied from the proven online-shot scripts. Probe scripts were
session-scratch only (deleted before commit); result JSONs in the session
scratchpad.

1. Online session carries netPipeline with nonzero parse/apply percentiles and
   the raw gap stats, UNGATED. 30 s in-world with the overlay disabled:
   `perf.report()` returned `enabled: false`, `network: null` (the gated write
   was dropped live), and `netPipeline` with snapshots 833, approxBytesTotal
   1057009, entCountTotal 4934, keepCountTotal 43824, parseMs p95 0.1 / max
   0.2, applyMs p95 0.1 / max 1.6, gapMs count 832 with p50 0.1 / p95 266.7 /
   max 4231.2, histogram r0 133 / r1 42 / r2 51 / r3plus 72. The 4231 ms max
   gap is a raw stall outlier the (5,500) EWMA filter would have eaten: the
   exact signal finding 20 wanted. Zero page errors.
2. The fleet path end to end. The reporter's first automatic POST (75 s)
   stored row id 1142 in `client_perf_reports` whose rawSummary carries
   netPipeline (snapshots 1716, parse p95 0.1, apply p95 0.1 / max 0.2, gap
   count 1715 with p95 306.5 / max 676, histogram spread across all four
   buckets) and heapSawtooth (67 samples over 73 s, 28 GC drops, avgDropMb
   14.19, allocRateMbPerSec 5.44, amplitudeMb 31.45), read back via psql.
3. Heap sampler live on Chromium: 26 samples in the 30 s online arm (1 Hz),
   11 GC drops, allocRate 4.97 MB/s: the sawtooth is real and measured.
4. Offline session: `netPipeline: null`, `network: null`, zero page errors
   (fresh browser profile, warrior spawn, 25 s settle). `heapSawtooth` is
   populated offline (23 samples) by design: R10 is a client-wide instrument,
   not an online one.
5. Tests: the seven-suite set green in one run: net_pipeline_stats (11),
   heap_sawtooth (8), perf_monitor (6), perf_reporter, perf_report, snapshots,
   architecture: 221 tests, 0 failures. snapshots and architecture are
   byte-unedited. hud_perf_budget unit arms also green (34 passed, 3
   env-gated skips, pre-existing).
6. Mutation verification (each applied alone against the suite, then
   reverted; all eight went red): removing the online.ts `recordSnapshot`
   call; removing the hello-arm `noteReset`; gating `setNetPipeline` on
   `enabled`; removing the heap sample from `tick()`; applying a (5,500)
   filter to the gap ring; moving the raw-gap read below `applySnapshot`;
   dropping `netPipeline` from the reporter rawSummary; dropping
   'netPipeline' from the server allowlist.
7. `npx tsc --noEmit` clean. `npx @biomejs/biome ci` over the 12 changed
   files: exit 0 (the 50 diagnostics are pre-existing-pattern lint warnings,
   which the gate does not fail on; zero errors, zero format diffs).
   `npm run ci:changed` exit 0. Diff scanned: no em/en dashes, no emojis, no
   `.only(`, no `debugger`.

## Reviewer fan-out and dispositions

Fresh read-only reviewers on the final diff: qa-checklist (verdict READY, zero
blocking, zero should-fix), test-coverage-auditor, cross-platform-sync, plus
privacy-security-review (dispatched on the qa-checklist gate's recommendation
for the new stored client-controlled JSONB surface). Every finding was applied
or is dispositioned here:

- Coverage: the raw-gap read-ordering pin was missing (the one mutation class
  not initially covered); ADDED as the bareClient ordering test and
  mutation-verified (item 6 above). The heap-reset assertion through
  `PerfMonitor.reset()` was vacuous-adjacent; REPLACED with a non-vacuous
  live-then-null pin. The omitted-keep arm was untested; ADDED.
- Coverage, accepted gaps: the three main.ts wiring lines (per-frame drain,
  setNetPipeline publish, visibilitychange listener attachment) have no unit
  test. main.ts is a firewall with no harness by doctrine; the composition is
  covered by acceptance checks 1, 2, and 4 on the real app (the populated
  histogram in check 1 is direct evidence the per-frame drain ran; the
  populated DB row is direct evidence the publish ran).
- Cross-platform: no critical or warning findings. INFO items: the
  visibilitychange listener is page-lifetime and never removed (matches the
  existing main.ts listener pattern; idempotent no-op when it stacks);
  `recordExternalSpan` is spec-mandated optional and deliberately unwired;
  the heapSawtooth allowlist addition is the safe-direction completion noted
  in What changed.
- qa-checklist VERIFY items: live online wiring (closed by acceptance checks
  1 and 2), hud_perf_budget no-regression (run, green, item 5), full
  `npm run gate` (deferred to packet close by the packet cadence: targeted
  vitest plus tsc per phase, full gate plus /qa at close).
- Privacy/security: all checks passed (hostile input bounded by the existing
  16 KB rawSummary cap and JSON round-trip on every path; the counters carry
  only timings, size scalars, and `.length` counts, never names, ids, chat,
  positions, or payload content; no new endpoint or channel; per-instance
  state only, nothing poisonable cross-client). One INFO note: allowlisted
  rawSummary keys pass through verbatim within the cap, a pre-existing
  property of the channel; downstream consumers keep treating `rawSummary.*`
  as untrusted display data.

## Adversarial pass: what is missing or deliberately left

- Parse timing covers every frame type but only snap frames are recorded; a
  pathological non-snap frame (giant events batch) stays invisible to these
  counters. Accepted: finding 20 scopes this phase to the snapshot pipeline,
  and the events path already rides the gated 'events' bucket in `time()`.
- The per-rAF histogram counts snapshots APPLIED, not received; while the tab
  is hidden the counts accumulate and the visibility hook zeroes them on the
  flip, so hidden-tab stretches are simply absent from the histogram rather
  than misattributed. A one-time pre-first-frame backlog can still fold into
  the first frame's bucket at boot; negligible, and R9 mandates only the
  visibility and reconnect resets.
- `gapMs` percentiles cover the most recent 1024 gaps (about 51 s at 20 Hz);
  the report interval is 5 minutes, so the digests are a recent window, not
  the whole interval (the totals ARE whole-session). Bounded rings are the
  R9/spec design; dashboards read the totals for volume and the digests for
  recent shape.
- `applyMs` includes only `applySnapshot` proper, not the recordSnapshot
  bookkeeping itself (sub-microsecond) nor the render consumption of the
  mirror (already inside the renderer bucket).
- The offline arm keeps `netPipeline` null via wiring absence (nothing ever
  sets it), not via an explicit null write; a future offline caller of
  `setNetPipeline` would show up in the ungating pin's sibling suites, and
  the reporter null-passthrough test pins the null carriage.
- The bench/E2E probe scripts are session scratch, deleted before commit;
  phase 07's committed baselines runbook owns the durable capture story.
- `entCount`/`keepCount` use a defensive `Array.isArray` fallback to 0; the
  ents arm of that fallback is unreachable today (`applySnapshot` iterates
  `snap.ents` first and would throw), kept purely as cheap safety; the keep
  arm is reachable (server may omit `keep`) and is pinned by the omitted-keep
  test.
- Not run here: full `npm run gate` and the production-fleet verification
  that dashboards read the new keys; both are packet-close items (phase 07)
  per the packet plan.
