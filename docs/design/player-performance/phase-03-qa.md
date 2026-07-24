# Phase 03 QA: report dimensions end to end

Phase spec: packet-0-instruments.md, "Phase 03" (rulings R3, R4, R5, R6, R7 binding;
brainstorm finding 20). Status: COMPLETE. All acceptance checks below passed on
2026-07-23.

## What changed

Client:
- NEW `src/game/crowd_bucket.ts` (R3): the pure label module. Labels
  lt10 | 10-24 | 25-49 | 50-99 | 100plus | unknown, bucketed on the renderer's
  activeViews; null/undefined/non-finite/negative counts fold to 'unknown'. The
  raw simEntities/activeViews/visibleViews ship beside the label in the payload.
- NEW `src/game/worst_window.ts` (R5): the rolling worst-10s tracker.
  `observe(samples, now)` summarizes the trailing 10 s of PerfMonitor's
  frameWindow and retains the window with the highest frameMs p95 since the last
  drain (worst-per-report-interval semantics); `current()` is a pure read;
  `drain()` resets the interval. Pure module: clocks injected, no DOM.
- NEW `src/game/world_telemetry.ts` (R4): `telemetryZoneId(x, z)` emits the
  overworld `zoneAt(z).id` and bounded instance-scoped ids inside the far-off
  x-bands (`dungeon:<id>`, `delve:<id>`, `arena`, `yumi_maze`), following the
  instance_music.ts band pattern, so the crowded-town signal never mixes with
  raid interiors. Defensive fallbacks stay bounded (`delve:unknown`,
  `instance`). This module is the module-first completion of the spec's
  "one-line provider closure": the pure position-to-zone logic needed a
  Node-testable home, and main.ts is a firewall that must not grow logic.
- `src/game/perf.ts`: the four mainMs buckets in `time()` record UNGATED
  (argument restated below); `PerfSnapshot.windows` gains `worst10s`
  (null before the first 1 Hz tick); the tracker is evaluated at the ungated
  1 Hz arm of `tick()` beside the heap sample; `snapshot()` stays a pure read;
  `drainWorstWindow()` is the explicit reporter hook; `reset()` drains.
- `src/game/perf_reporter.ts`: `PerfReporterOptions.worldTelemetryProvider`
  (`() => {zoneId, simEntities} | null`); `payloadFromSnapshot` emits
  zoneOrScenario from the provider for gameplay sessions with the benchmark
  `?perfScenario` label keeping priority, plus `simEntities`, `activeViews`,
  `visibleViews` (null-guarded `renderer.lastFrame`), `crowdBucket`, and
  `worst10sFrameP95Ms`; `schemaVersion` 2 (R6). The success branch of the send
  drains the worst window; HTTP failures and network failures do not (R5).
- `src/main.ts` (wiring only): the provider closure over the in-scope `world`
  (`telemetryZoneId(world.player.pos.x, world.player.pos.z)` plus
  `world.entities.size`) passed to `startPerfReporter`. No IWorld change:
  `player` and `entities` are existing facet members, and
  `tests/world_api_parity.test.ts` is byte-unmodified.

Server:
- `server/perf_report.ts`: `PERF_REPORT_SCHEMA_VERSION` 2 (the intIn clamp
  keeps version-1 clients valid); sanitizers for the five fields (`choiceIn`
  over the fixed crowd labels falling back to 'unknown'; `intIn` 0..100000 for
  the three counts; `numberIn` 0..1000 for the worst-10s p95). The label list
  is a deliberate copy of the client catalog (server/ cannot import src/game);
  the cross-boundary parity pin in `tests/perf_report.test.ts` is the drift
  guard, and the same pattern now covers the schema version constant.
- `server/db.ts`: five `ALTER TABLE client_perf_reports ADD COLUMN IF NOT
  EXISTS` lines (`crowd_bucket TEXT NOT NULL DEFAULT ''` preserving the
  GROUPING-bits contract; the numerics `NOT NULL DEFAULT 0`, which keeps
  zero/legacy rows at the tail of the index's DESC order);
  `ClientPerfReportInsert` and `insertClientPerfReport` renumbered to 43
  positional params; the worst-10s index constants re-exported.
- NEW `server/client_perf_indexes.ts` (R7): the
  `client_perf_reports_worst10s_created (worst_10s_frame_p95_ms DESC,
  created_at DESC)` CREATE INDEX CONCURRENTLY plus invalid-carcass check/drop
  SQL, appended as the fourth entry of `CONCURRENT_INDEX_MIGRATIONS`
  (`server/concurrent_indexes.ts`), never boot DDL. The constants live in this
  dependency-free module because the registry evaluates its list while db.ts
  is still importing: defining them in db.ts would be a TDZ cycle (verified by
  the migration-safety reviewer).
- `server/client_perf_summary_shape.ts` + `server/admin_db.ts`: the summary
  gains the byCrowd dimension end to end: a seventh grouping set
  (`crowd_bucket`), the `g_crowd` GROUPING bit in both window PARTITION BYs
  and the COALESCE volume tie-break, the totals arm at sum = 6, the
  `PERF_SUMMARY_LIMITS.byCrowd` cap (8: six labels plus the legacy '' bucket
  plus headroom), and the read-time fold of legacy '' rows to 'unknown' for
  the byCrowd list ONLY (R3; the two aggregates stay separate because
  percentiles do not compose). `clientPerfRaw` and `PerfRawRow` gain the five
  columns. Zone needed no summary change: byScenario is zone-valued
  automatically now.

Tests (new: crowd_bucket, worst_window, world_telemetry,
perf_monitor_report_dimensions, client_perf_reports_db_integration; extended:
perf_reporter, perf_report, client_perf_summary_shape, client_perf_summary_sql,
schema_wiring, admin): the full list per the phase spec, detailed in the
acceptance evidence below. `tests/perf_monitor.test.ts` and the phase 02
regression net (net_pipeline_stats, heap_sawtooth, snapshots, architecture) are
byte-unmodified and green; the new PerfMonitor pins live in their own
`tests/perf_monitor_report_dimensions.test.ts` so the net stays untouched.

Untouched by contract: the phase 02 netPipeline/heapSawtooth blocks and the
compactRawSummary truncation allowlist (the five new fields are top-level
COLUMNS, never rawSummary keys); the enabled-gating of the overlay, markInput*,
and traceEnabled spans; the benchmark ?perfScenario priority; the IWorld seam;
the (5,500) EWMA filter; `src/sim/` entirely; no RouteDef migration (dual-arm
dispatch stays inside handlePerfReport); nothing from phase 05 (suggestion ids)
despite the shared files.

## The ungated-mainMs argument (restated)

Finding 20: the mainMs bucket split is zeroed unless ?perf is set, so the
fleet's most basic where-does-the-frame-go split never reaches production
reports. The fix ungates ONLY the bucket recording in `time()`: every
`time(bucket, fn)` call now takes two `performance.now()` reads and one ring
push (`MAX_SAMPLES` 7200 per bucket, four buckets), the same bounded always-on
shape phase 02 established for netPipeline and the heap sampler. Everything
player-invisible-but-costly stays gated: the overlay mount and its 1 Hz DOM
render, the whole markInput* chain, and the dev-trace spans
(`recordDevTraceSpan` gates on traceEnabled internally). The unit pin is
`tests/perf_monitor_report_dimensions.test.ts` (bucket count === N with
enabled === false, beside the assertions that intents stay 0, no overlay
mounts, and no devTrace appears); the live pin is acceptance check 1: populated
mainMs on a disabled-overlay production-path session.

The worst-10s window shares the rationale (R5): 5-minute cumulative reports
dilute a discrete hitch storm and the 7200-sample ring evicts it outright, so
the tracker retains the worst 10 s window since the last drain, and only a
SUCCESSFUL send drains it, so a failed post carries the storm into the retry.
`PerfMonitor.snapshot()` stays a pure read (mutation-verified: an impure
drain-on-snapshot goes red).

## Acceptance evidence

Probe method: local stack (`docker start eastbrook-db`, `npm run server` after
all edits, `npm run dev`), headless Chromium via puppeteer-core plus
`scripts/browser_path.mjs`, the proven register/create/enter flow (letters-only
character name; the register form now also requires an email). Probe scripts
were session-scratch only, never in the repo; result JSON in the session
scratchpad.

1. Zone flow-through written FAILS-FIRST: with the new test in place and the
   old reporter, `zoneOrScenario` asserted red with "expected 'gameplay' to be
   'dungeon:hollow_crypt'" (the exact finding 20 hardwiring), alongside the
   six sibling dimension tests; all green after the reporter change. The
   benchmark-priority test passed before AND after (preserved behavior).
2. Live ONLINE session with the overlay DISABLED (`perf.report()` returned
   `enabled: false` and `network: null` live). The first automatic POST
   stored a row whose columns carry every dimension: `schema_version` 2,
   `zone_or_scenario` 'eastbrook_vale' (a real zone id), `source` 'gameplay',
   `crowd_bucket` '50-99' (activeViews 52), `sim_entities` 63,
   `active_views` 52, `visible_views` 27, `worst_10s_frame_p95_ms` 250, and
   `rawSummary.mainMs` populated (renderer/hud/events counts 554; the sim
   bucket is 0 online by design, it only runs for the offline Sim host). The
   40 s mid-session snapshot already showed mainMs counts 276 and a retained
   worst10s window with enabled false.
3. A stale phase-02-era client still reporting during the probe stored a
   version-1 row through the NEW server ('gameplay', crowd 'unknown', zeros):
   live proof of the old-client arm the intIn clamp and column defaults exist
   for.
4. `/admin/api/perf/summary` through the real endpoint (probe account promoted
   to staff) returned `byCrowd`: the probe session's '50-99' bucket plus
   'unknown' entries from both sanitizer-defaulted rows and the read-time ''
   fold, kept as separate aggregates as designed.
5. The opt-in PG roundtrip (`tests/client_perf_reports_db_integration.test.ts`)
   ran GREEN against the dev DB (TEST_DATABASE_URL): all 43 insert params land
   in their own columns (pairwise-distinct values), `clientPerfRaw` maps the
   five dimensions, a legacy row shows the column defaults, and
   `client_perf_reports_worst10s_created` exists and is valid. This is the ONLY
   decisive guard for the positional renumbering, and it proved itself: the
   deliberate param-swap mutation was caught by nothing else.
6. The pg-gated summary differential (`WOCC_PG_DIFFERENTIAL=1`) ran GREEN with
   the new byCrowd arm (crowd seeds across all labels plus legacy '' rows; the
   byCrowd cap arm has no live boundary in the differential because only
   sanitizer-approved labels can reach the column, so the mocked-pool text pin
   carries it).
7. Tests: the touched set plus the regression net green in one run (16 files,
   369 passed, 2 env-gated skips); `tests/perf_monitor.test.ts`,
   net_pipeline_stats, heap_sawtooth, snapshots, and architecture byte-
   unmodified (0-line diffs).
8. Mutation verification: sixteen mutations applied one at a time (file-copy
   restore, never a checkout over uncommitted work), every one red: provider
   zone dropped; benchmark priority dropped; crowd fed visibleViews; the
   drain-on-success call removed; drain made unconditional (also on failure);
   `time()` re-gated on enabled; the 1 Hz observe removed; snapshot made
   impure (drain on read); crowd choiceIn weakened to textIn; the worst-10s
   clamp ceiling dropped; the mapper's '' fold dropped; the SQL g_crowd cap
   arm dropped; the lt10 boundary flipped to <= 10; the retain-the-worst
   condition replaced with always-overwrite; the insert's active/visible
   params swapped (caught ONLY by the PG roundtrip); the server schema
   version drifted to 3 (caught by the new parity pin).
9. `npx tsc --noEmit` clean. `npx @biomejs/biome ci` over the 23 changed
   files: zero errors, zero format diffs (the remaining diagnostics are the
   established noExplicitAny browser-stub lint warnings, which the gate does
   not fail on). Diff scanned: no em/en dashes, no emojis, no `.only(`, no
   `debugger`. Full `npm run gate` and the perf:tour budget check are packet-
   close items per the packet cadence.

## Reviewer fan-out and dispositions

Fresh read-only reviewers on the final diff: qa-checklist (verdict READY, zero
blocking, zero hard should-fix), test-coverage-auditor, migration-safety,
database-performance-reviewer (PASS with measured evidence), and
privacy-security-review (dispatched for the new stored beacon columns). Every
finding was applied or is dispositioned here:

- Coverage (both NITs APPLIED): the defensive world_telemetry fallbacks are now
  pinned with real coordinates (a delve-band slot with no delve record yields
  'delve:unknown'; past the yumi ceiling yields 'instance'), and the
  drain-restart assertion tightened from a range to the exact healthy p95.
- qa-checklist observation, APPLIED: the duplicated PERF_REPORT_SCHEMA_VERSION
  had no cross-boundary pin; the lockstep parity test was added beside the
  crowd-label pin and mutation-verified (server drifted to 3 goes red).
- Index-before-consumer (migration-safety WARNING, database-performance P2,
  qa-checklist observation): the worst-10s index has no in-tree consuming
  query this phase. Dispositioned as ruled: R7 binds the index and its exact
  column order into phase 03 so production accrues indexed history before the
  phase 07 fleet-view captures; the database-performance reviewer measured the
  intended worst-sessions query serving from it (index scan, zero-default rows
  correctly at the DESC tail, validating NOT NULL DEFAULT 0 over nullable).
  Note kept for the future query author: a windowed top-N (created_at range
  filter plus worst sort) may prefer a created_at-leading index; revisit when
  the consumer lands.
- Boot AccessExclusiveLock (database-performance P2, accepted): the idempotent
  ADD COLUMN IF NOT EXISTS takes the standard brief metadata-only lock on
  client_perf_reports inside the boot transaction, identical to the repo's
  existing idempotent-ALTER idiom; measured as attmissingval-only (no table
  rewrite) on a populated table.
- Transition-window duplicate 'unknown' (migration-safety INFO, intended):
  until pre-column rows age out of the query window (14-day retention
  default), byCrowd can show the legacy '' aggregate and the real 'unknown'
  aggregate as two rows, both keyed 'unknown'. Documented in the mapper and
  pinned by the shape test; percentiles cannot be merged.
- Privacy (both INFO, dispositioned): the zone dimension is a coarse,
  catalog-bounded location signal (three overworld zones plus fixed instance
  ids), admin-gated behind analytics.read, retention-bounded, and attached
  only to the player's own verified character; documented here per the
  reviewer's ask. `zone_or_scenario` is deliberately NOT server-allowlisted:
  the same column carries operator-chosen benchmark scenario labels by design
  (pre-existing behavior), gameplay cardinality is bounded by the client
  emitter, and hostile inflation is bounded by textIn(80), the rate limit,
  and retention.
- qa-checklist VERIFY items: the PG roundtrip (run, green, decisive: item 5);
  full gate and perf:tour (packet close per cadence); admin SPA byCrowd
  rendering (API-only this phase by design; display is later work).
- Accepted gap (qa-checklist and phase 02 precedent): the three-line main.ts
  provider closure has no unit test. main.ts is a firewall with no harness by
  doctrine; telemetryZoneId is covered directly and the composition is proven
  by acceptance check 2 (the stored row's real zone id and entity count are
  direct evidence the closure ran).

## Adversarial pass: what is missing or deliberately left

- The worst-10s index serves no in-repo query yet; if the packet closes
  without the phase 07 fleet view landing its consumer, the index is dead
  write amplification and should be re-litigated (see the disposition above).
- The sim mainMs bucket stays 0 for online sessions: `time('sim', ...)` wraps
  only the offline Sim tick. Dashboards reading mainMs.sim get signal from
  offline sessions only; online sim cost lives server-side. Expected, not a
  gap in the client instrument.
- Frame samples clamp at 250 ms client-side (`PerfMonitor.frame`), so
  worst10sFrameP95Ms saturates at 250 for catastrophic hitches; the server's
  0..1000 clamp is headroom, not expectation. The live probe's 250 value is
  that ceiling: a real startup stall window observed at the first 1 Hz ticks.
- A session that never successfully posts keeps its worst window for the whole
  session: bounded (one summary object) and correct under R5's
  worst-per-report-interval semantics.
- The worst10s summary object is returned by reference from `current()`; the
  reporter serializes it immediately and nothing mutates it, but a future
  in-place consumer should copy first.
- The crowd label list and schema version exist as deliberate copies on both
  sides of the server/src boundary; the two parity pins are the only drift
  guards. A third copy anywhere would not be caught automatically.
- The zone dimension makes byScenario zone-valued, so its 30-row cap now
  spans zones plus benchmark scenarios in one list; fine at today's
  cardinality (three zones plus bounded instance ids), worth a dedicated
  dimension only if instance content grows past the cap.
- The admin SPA does not render byCrowd or the new raw columns; operators read
  them through the API this phase.
- Not run here: full `npm run gate` and the perf:tour budget arm; both are
  packet-close items per the packet plan (phase 07).
