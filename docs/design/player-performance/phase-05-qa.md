# Phase 05 QA: perf-doctor wiring + the nudge toast

Phase spec: packet-0-instruments.md, "Phase 05" (rulings R14, R15, R16 binding;
brainstorm finding 16). Status: COMPLETE. All acceptance checks below passed on
2026-07-23.

## What changed

Client:
- `src/game/perf_doctor.ts`: the id catalog is now exported
  (`PERF_SUGGESTION_IDS` + `PerfSuggestionId`, in emit-priority order) along
  with `PerfDoctorSnapshot`; `PerfSuggestion.id` narrowed from `string` to the
  union. NEW `'integrated-gpu'` rule (R15): fires on a bad last10s window plus
  an integrated GPU classification plus NOT the desktop shell (which already
  forces the dGPU, PR #1991), phrased conditionally ("If this computer also has
  a gaming GPU..."). The integrated signal is gfx.ts's own classification:
  `classifyGpuRenderer(name) === 'midIntegrated'` OR `isWeakIntegratedGpu(name)`;
  the generic weak arm is deliberately excluded because it also matches old
  MOBILE SoCs, where switch-GPU advice is nonsense. Mutual exclusion with
  `'hardware-acceleration'` is an else-branch: software classification wins.
  The "no live importer" header is rewritten: the module now has two live
  importers (the reporter and the nudge assembler), ids only; title/body stay
  English dev diagnostics.
- `src/game/perf_reporter.ts`: the payload gains `suggestionIds`,
  CLIENT-computed by running `analyzePerfSuggestions` over the same snapshot
  the report serializes (R14), so the fleet dimension and the player nudge
  agree on the diagnosis. `PerfReporterOptions.desktopShell` threads the shell
  flag (main.ts passes `DESKTOP_APP`); absent means false for benchmark
  harness callers.
- NEW `src/game/perf_nudge.ts` (assembler, modeled on software_render_notice):
  polls the live PerfMonitor snapshot every 30 s once gameplay input is live,
  gated on `frames >= 30` (the reporter's floor) so warm-up garbage is never
  judged; the FIRST nudge-worthy detection ends the polling and hands the id
  set to the UI toast exactly once per session, whatever the toast decides.
  One composition call from main.ts, which gains no logic.
- `src/game/software_render_notice.ts`: records whether the boot notice
  actually DISPLAYED (`softwareNoticeShown()`), the R16 suppression signal;
  `src/ui/gpu_notice_toast.ts` gains only a boolean return for that (2 lines;
  gpuNotice is deliberately NOT refactored, per R16).

UI:
- NEW `src/ui/perf_nudge_view.ts` (pure view-core, registered in
  `UI_PURE_CORES`): `resolvePerfNudge({suggestionIds,
  softwareNoticeAlreadyShown, dismissedBefore, desktopShell})` to
  `{shown, bodyKey}`. Only the two MACHINE-LOCAL arms nudge
  (`PERF_NUDGE_ARM_IDS = ['hardware-acceleration', 'integrated-gpu']`); the
  other six ids stay fleet diagnostics. The software arm is suppressed when
  the boot notice showed this session (R16), suppression is FINAL (no
  fall-through: integrated advice is wrong on a software session), the
  software arm wins if both arms ever co-occur (mirroring R15), and
  `desktopShell` picks the software-arm copy variant exactly like
  `gpuNoticeBodyKey`. `perfNudgeDismissalValue(ids)` is the persisted-dismissal
  VALUE: the arm ids present, sorted and joined, so the same causes never
  re-nag while a changed trigger set re-arms (R16).
- NEW `src/ui/perf_nudge_toast.ts` (thin DOM sibling of gpu_notice_toast, same
  cold-path one-shot shape): own dismissal key `woc_perf_nudge_dismissed`
  storing the keyed value, `role=status` + `aria-live=polite`,
  `woc:languagechange` re-render, renders `t()` keys ONLY (never
  PerfSuggestion.title/body). Returns whether it showed so the assembler's
  decision is observable.
- i18n: `perfNudge.integratedGpu` / `.hardwareAccelerationDesktop` /
  `.hardwareAccelerationWeb` / `.dismiss` beside gpuNotice in
  `src/ui/i18n.catalog/shell.ts` (en-only domain), with the five non-Latin
  overlay fills (zh_CN, zh_TW, ja_JP, ko_KR, ru_RU) in the SAME change per
  M16, and the regenerated i18n artifacts committed in the same commit
  (freshness gate; regeneration verified byte-deterministic across two runs).
- `src/styles/shell.css`: a new ten-dash "performance nudge toast" section,
  sibling of #gpu-notice one fixed slot below it (112px clears both toast
  slots), same tokens, [hidden] handling, focus-visible ring, safe-area inset,
  and the 40x40 coarse-pointer floor.

Server:
- `server/perf_report.ts`: `KNOWN_PERF_SUGGESTION_IDS` (a deliberate copy of
  the client catalog; server/ cannot import src/game, R14) +
  `suggestionIdsIn`: allowlist-filter, trim, dedupe, cap 3, plus a bounded
  scan window (64 entries) so the sanitizer stays O(1) independent of the
  body-size cap. A beacon is never rejected over its diagnostics.
- `server/db.ts`: `ALTER TABLE client_perf_reports ADD COLUMN IF NOT EXISTS
  suggestion_ids TEXT[] NOT NULL DEFAULT '{}'` in the existing packet-0
  guarded boot-DDL block (metadata-only on a populated table, measured 2.5 ms
  at 400k rows by the database reviewer); `ClientPerfReportInsert` +
  `insertClientPerfReport` renumbered to 44 positional params.
- `server/admin_db.ts` + `server/client_perf_summary_shape.ts`: the perf
  summary gains `suggestionCounts` via a SECOND bounded statement inside the
  ONE `runWithStatementTimeout` transaction (R14): a
  `CROSS JOIN LATERAL unnest(suggestion_ids)` aggregate with deterministic
  ordering (`sample_count DESC, s.id ASC`) and `LIMIT
  ${PERF_SUMMARY_LIMITS.suggestionCounts}` (12: eight allowlisted ids plus
  headroom). An array column cannot ride a grouping set (GROUPING SETS counts
  rows, not elements), hence the second statement rather than an eighth set.
  Shape lives in the pure module (`PerfSuggestionCount`,
  `PerfSuggestionCountRow`, `mapSuggestionCountRows`); `PerfSummary` gains the
  field; `clientPerfRaw` + `PerfRawRow` gain the column. No Svelte or admin
  SPA work (API-only, per R14).

Tests (new: perf_nudge_view, perf_nudge, perf_nudge_toast, perf_nudge_css,
perf_suggestion_id_parity; extended: perf_doctor, perf_reporter, perf_report,
software_render_notice, reports_telemetry, client_perf_summary_shape,
client_perf_summary_sql, schema_wiring, admin, client_perf_reports_db_
integration; deliberately updated: the exactly-one-statement pin is now an
exactly-TWO pin with a connect-once transaction pin, and the roundtrip header
counts 44 params). Detail in the acceptance evidence below.

Untouched by contract: the phase 01-04 instruments and gates (including the
stale hudHotDomWrites anchor 153, phase 07's recapture, and the phase 04
bench_gate lib); `src/sim/` entirely; no RouteDef migration (dual-arm dispatch
stays inside handlePerfReport); the compactRawSummary allowlist
(suggestion_ids is a top-level column, never a rawSummary key); gpuNotice's
view core and its dismissal semantics; the (5,500) EWMA filter; the IWorld
seam (`tests/world_api_parity.test.ts` byte-unmodified).

## The R14/R15/R16 arguments (restated)

R14 (client-computed ids, server allowlist): the analyzer needs the full
PerfSnapshot (windows, renderer, browser, device), which only the client
holds; shipping raw inputs server-side would grow the beacon for no gain and
put interpretation logic where it cannot see the machine. The ids are
therefore computed client-side and treated as UNTRUSTED on arrival: an 8-id
allowlist copy (the R14 deliberate-copy pattern, like the crowd labels and
schema version), dedupe, cap 3, and a bounded scan window run BEFORE storage,
so nothing unvetted can reach the column or the admin aggregate. The
cross-boundary parity test is the only drift guard, by design.

R15 (integrated-gpu): the hybrid-laptop cohort (finding 16) is real but
unprovable from the adapter string alone: the string proves the session is
NOT on a discrete GPU, never that one exists. Hence the conditional copy, the
desktop-shell exclusion IN THE ANALYZER (so fleet data never counts
desktop-shell sessions, where the dGPU is already forced and a remaining
integrated classification means there is nothing to switch to), and the
mutual exclusion where software wins (a software session's integrated-looking
string is a rasterizer artifact, and switch-GPU advice would be wrong).

R16 (the nudge lifecycle): one toast per install PER CAUSE SET. The dismissal
stores the triggering arm-id set, so the same causes never re-nag while a NEW
cause re-arms exactly once. The software arm is suppressed only when the boot
gpuNotice actually DISPLAYED this session (the toast's own decision, which
also reads its persisted dismissal, so the memo follows the toast's return
value rather than re-deriving it). Deliberate consequence, documented: an
install that dismissed the boot notice in a PRIOR session can later see the
nudge's software arm once, consistent with R16's "already showed" wording;
after that its keyed dismissal holds forever.

## Acceptance evidence

Stack: `docker start eastbrook-db`, `ALLOW_DEV_COMMANDS=1 npm run server`
(RESTARTED after the last server edit; the server bundles at start),
`npm run dev` (this worktree held :5173; every browser run passed
`GAME_URL=http://localhost:5173` explicitly). Probe scripts, capture JSON,
and mutation backups stayed in the session scratchpad, outside the repo.
Probe accounts registered through the real `/api/register` (email required),
letters-only character names.

1. Software-GL session (headless Chromium with `--use-angle=swiftshader`,
   which IS software GL), three boots in one browser install, all PASS:
   - Boot 1: glRenderer confirmed SwiftShader; #gpu-notice VISIBLE; the nudge
     stayed absent across two 30 s assembler ticks with the frames floor
     proven passed (frames=30 at the wait start; non-vacuous suppression,
     R16); the boot notice was dismissed (persisted '1'); the perfTrace
     beacon posted 5 reports.
   - Boot 2 (reload): #gpu-notice never appeared (persisted dismissal); the
     nudge SHOWED with the web software copy ("The game is running without
     GPU acceleration, which makes it very slow. Enable h..."), role=status;
     dismissing stored `woc_perf_nudge_dismissed = 'hardware-acceleration'`
     (the keyed id-set value) and hid the toast.
   - Boot 3 (reload): the nudge never returned across two ticks (frames=38,
     non-vacuous): one-per-install proven live across reloads.
   - Stored rows: two `client_perf_reports` rows for the probe account,
     `gl_renderer_bucket` 'software', `suggestion_ids`
     `{hardware-acceleration,browser-stalls}`, schema_version 2. The
     acceptance id is present; `browser-stalls` legitimately co-fires under
     SwiftShader (the main thread really does stall), and the nudge keys its
     dismissal on ARM ids only, so the extra diagnostic changes nothing
     player-facing.
2. Healthy session (headed real GPU, Apple M4 Max): no #gpu-notice, no
   #perf-nudge across two ticks at frames=9018 (decisively non-vacuous), 5
   beacons posted, stored row `suggestion_ids = {}` on `apple-m4-max`.
3. `/admin/api/perf/summary` through the real endpoint and permission chain
   (probe account promoted with `is_admin` AND `admin_roles = {viewer}`,
   which carries analytics.read; is_admin alone is not staff) returned
   `suggestionCounts: [{browser-stalls: 2}, {hardware-acceleration: 2}]`
   alongside the untouched bucket lists.
4. The opt-in PG roundtrip ran GREEN against the dev DB (TEST_DATABASE_URL),
   re-run on the final tree: all 44 insert params land in their own columns,
   `suggestion_ids` preserves order, a legacy row reads `[]`, clientPerfRaw
   maps the field, and clientPerfSummary aggregates the seeded ids live. This
   remains the ONLY decisive guard for the positional renumbering.
5. The pg-gated summary differential (WOCC_PG_DIFFERENTIAL=1) ran GREEN with
   the new suggestionCounts spec (seeded multi-id arrays prove per-element
   counting: a two-id row contributes to BOTH ids).
6. Mutation verification, fourteen mutations applied one at a time (file-copy
   restore, never a checkout over uncommitted work), every one red: server
   allowlist check dropped; cap 3 off by one; analyzer mutual exclusion
   inverted (else-if split to if; caught by the deliberate both-matchers
   fixture "UHD Graphics 620, SwiftShader fallback"); dismissal re-arm value
   hardwired; server allowlist id drifted (caught by the parity test); the
   desktop-shell gate dropped (caught in BOTH the analyzer and reporter
   suites); the R16 view suppression dropped; the assembler's stop-before-
   toast dropped (fires-once went red); the payload suggestionIds field
   dropped; the second statement's LIMIT dropped; the DDL ALTER dropped; the
   shape mapper cap off by one; the CSS slot offset drifted; the notice memo
   hardwired to ignore the toast verdict.
7. Tests: final sweep of the 23 touched-plus-regression files in one run
   (366 passed, 8 env-gated skips), plus both PG-gated arms green (item 4/5).
   perf_monitor, net-pipeline/heap suites, and the IWorld parity pin are
   byte-unmodified.
8. i18n: completeness + coverage + S3 green at PR tier; the five non-Latin
   fills land with the English (M16); `npm run i18n:gen` proven
   byte-deterministic (hash-identical across two runs); the
   i18n_resolved_equivalence freshness gate compares against the git INDEX,
   so it goes green when this commit stages the regenerated artifacts
   (verified regeneration produces byte-identical content).
9. `npx tsc --noEmit` clean. `npx @biomejs/biome ci` over the 35 changed
   non-generated files: zero errors, zero format diffs (the 55 warnings are
   the established pre-existing set the gate does not fail on; the 1 info is
   a pre-existing useIndexOf note in schema_wiring outside this diff's
   lines). Diff scanned: no em/en dashes, no emojis, no `.only(`, no
   `debugger`. Full `npm run gate` remains a packet-close item per the
   packet cadence (phase 07).

## Reviewer fan-out and dispositions

Six fresh read-only reviewers on the final diff. Verdicts: qa-checklist READY
(0 blocking, 0 should-fix, 3 VERIFY, all closed below); test-coverage-auditor
(1 SHOULD-FIX, applied); frontend-seam-reviewer PASS (3 notes);
migration-safety PASS (1 info); database-performance-reviewer PASS with
measured evidence (2 P2 records); privacy-security-review clean (2 infos).
Every finding was applied or is dispositioned here:

- Coverage SHOULD-FIX, APPLIED: the R16 persistence round-trip had no test at
  any level (only the pure view was covered; the storage key, keyed value,
  and comparison were unpinned). NEW `tests/perf_nudge_toast.test.ts` (jsdom,
  per-file docblock per tests/CLAUDE.md) drives real localStorage through
  show-dismiss-reboot: same cause stays hidden, a changed cause re-arms and
  re-keys, an empty stored value never reads as dismissed, and the desktop
  copy split renders.
- Coverage NIT, APPLIED: the two-statements pin could not distinguish one
  transaction from two; `expect(pool.connect).toHaveBeenCalledTimes(1)` now
  pins the single raised-timeout transaction.
- Privacy INFO, APPLIED: suggestionIdsIn iterated the whole hostile array
  (bounded only by the upstream body cap); it now scans at most 64 entries,
  with a buried-id-past-the-window test pin.
- Frontend NOTE (low), APPLIED as documentation: the view's suppression path
  deliberately does NOT fall through to the integrated arm; the header now
  says so and why (integrated advice is wrong on a software session), instead
  of overclaiming symmetric mirroring.
- Frontend NOTE (rule of three), DISPOSITIONED as the R16-sanctioned deferral:
  desktop_update_toast, gpu_notice_toast, and perf_nudge_toast are now three
  structurally identical shell toasts; R16 explicitly keeps gpuNotice
  unrefactored this packet, so the shared-toast extraction is follow-up work
  for a later packet, not this diff.
- Frontend NOTE (styles literals), recorded: the #perf-nudge rgba/px literals
  are byte-identical to the #gpu-notice sibling, the established shell-toast
  convention; the no-magic-values guard governs painter TS, not these CSS
  files.
- Migration INFO, recorded: additive one-way-but-benign column; rollback
  needs no schema action (an old binary never references the column).
- Database P2 x2, recorded: the second statement re-scans the same window
  (measured ~36 ms vs ~707 ms for the existing roll-up at 140k rows, ~5% of
  endpoint DB time, admin-only and on-demand), and its cost folds into
  endpoint-level timing (adequate observability for an operator read).
  Correctly NO new index: nothing serves a per-element count over a time
  window, and GIN maintenance would tax every insert for zero read benefit.
- qa-checklist VERIFY items, all closed: the PG-gated roundtrip and
  differential ran green on the dev DB (re-run on the final tree); the
  database-performance reviewer measured the second statement; the i18n
  freshness gate resolves when this commit stages the regenerated artifacts
  (byte-determinism proven).
- qa-checklist adversarial observation, recorded (also under R16 above): a
  prior-session gpuNotice dismissal lets the software nudge show once in a
  later session; intended per R16's "already showed this session" wording.

## Adversarial pass: what is missing or deliberately left

- The nudge arms are exactly the two machine-local causes; the other six
  analyzer ids never toast by design (finding 16 is about machine-local
  causes, and the consequence ledger allows exactly one informational toast).
  A future packet widening the arms must extend PERF_NUDGE_ARM_IDS, the body
  keys, and the dismissal-value semantics together.
- suggestionIds ride only NEW reports; the fleet view has no history before
  this phase, and the 14-day retention bounds the suggestion-count window
  (acceptable, noted for the admin reader, same as the phase 03 columns).
- The software arm's live co-firing with browser-stalls means the stored
  array is often larger than the nudge-relevant set; dashboards counting
  "software sessions" should key on the id, not array equality.
- The assembler stops polling after its one decisive detection, so a session
  that later develops a DIFFERENT machine-local cause (software cannot
  change; integrated cannot appear after software wins) is not re-nudged
  within that session; the next session catches it. Deliberate: the causes
  are machine-level.
- A session where gameplay never reaches 30 frames (instant quit) never
  evaluates the nudge; the beacon's not-ready gate already skips such
  sessions entirely.
- The integrated-GPU cohort quantification (worstGpuBuckets + the new
  suggestionCounts) starts accruing only in production; the phase 07 fleet
  captures are where the cohort size gets read.
- The three-toast extraction (rule of three) is deferred by R16; see the
  frontend disposition above.
- Not run here: full `npm run gate` and the perf:tour budget arm; both are
  packet-close items per the packet plan (phase 07).
