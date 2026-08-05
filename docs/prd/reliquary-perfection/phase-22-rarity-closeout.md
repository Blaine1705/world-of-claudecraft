# Phase 22: Population rarity + records close-out

Owns: the last surface-parity idea (percent of players who own a relic/page), the
screenshot repairs, the PR-body correction, and the release riders.

### Starter Prompt
```
This is Phase 22 of the Reliquary Perfection packet: Population rarity + close-out.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: relics show how rare they are across the realm; every record the review found
false is corrected; the PR presents honest, complete evidence.

STEP 0: canonical pre-flight + release sync. Memory: pr-screenshots traps
(cold-vite flake, DOM check is not a frame check, localStorage outlives page.close),
server hot-path seams (cached reads, single-flight), pg traps index.

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md;
how the deeds population percentage works END TO END (the deeds window "% of players
earned": find the server aggregation, its cadence, caching, and wire shape: likely
server/deeds_records.ts + a cached read; summarize the exact recipe);
server/CLAUDE.md "Hot paths" (cached reads with single-flight, retention, build-once
readouts); the current PR #2976 body (gh pr view 2976); docs/screenshots/reliquary/;
scripts/pr_shot_targets.mjs reliquary target; the pr-screenshots skill notes. Return:
the aggregation recipe, cadence, and where reliquary rarity data would live.

STEP 2 - EXECUTE (two agents: rarity, records):

Agent A (population rarity):
- Server: an aggregate job on the deeds-records pattern computing, per catalogued
  relic id (and per page: complete-count), the share of eligible characters owning
  it. Source: the persisted blobs' itemsDiscovered/marks/counts already loaded by the
  existing aggregation pass IF one exists (reuse its scan; never add a second full-
  table scan: if the deeds aggregation walks characters on a cadence, ride the same
  walk). Cadence and caching per the hot-path seams: build-once realm readout,
  cached read with single-flight, bounded staleness (the deeds precedent's cadence),
  serve via the same channel deeds percentages ride (wire or REST: match the deeds
  mechanism exactly; a new REST endpoint, if unavoidable, is a RouteDef module, never
  inline).
- Client: rarity line on relic tooltips ("Owned by {pct} of collectors": formatNumber
  percent; localized) and on page headers ("Illuminated by {pct}"); Overview shelf
  cards may show the rarest owned relic. Fairness: information about the POPULATION,
  not actionable combat info: fine on all tiers. Offline Sim: no realm data: the
  facet read returns null and the UI omits the line (the leaderboard-stub precedent).
- IWorld: a rarity read on the facet, both worlds (ClientWorld mirrors the server
  feed; Sim returns null), parity pin updated.
- Tests: aggregation correctness on a fixture set (including zero-owner and
  all-owner), cache/single-flight behavior, cadence bound, tooltip arm with and
  without data, parity.
- database-performance-reviewer is the primary reviewer here: no new unbounded scan,
  no uncached viewer-identical read, index fit for any new query, measured cost at
  realm scale (the ~150x headroom rule: this must be nowhere near it).

Agent B (records + evidence):
- Screenshots: recapture EVERYTHING stale via the pr-screenshots skill on a warm dev
  server: char-sheet desktop (currently the marketing homepage) framed on the
  Reliquary progression row, char-sheet mobile framed on the row, the final window
  (Overview with cards, a page with source hints + art + rarity), the tracker,
  inspect with sigil + border, a nameplate border. Commit under
  docs/screenshots/reliquary/ and reference each from the PR body.
- PR body rewrite (apply via gh pr edit AFTER showing the maintainer the draft in the
  final response; do not edit without that display): corrections the review demands:
  (1) the seed/golden re-pins were repairs of suites inherited red from
  release/v0.35.0 (craft-cast seed rot), NOT feature-branch world-gen; (2) the locale
  overlay edits are contributor-authored M16 fills needing maintainer translation
  review, not merge hygiene; (3) the testing section states exactly what ran and
  when; (4) the screenshot list matches the recaptured set; (5) a Phases 10 to 22
  summary section. Keep the template structure; no em dashes; no session trailers.
- Release riders (record in state.md and the PR body's residual notes; do NOT file
  issues: the maintainer files by hand): (a) the release-side re-pin chore with the
  inherited-red suite list and the frostveil finding; (b) the release-time
  i18n-locale-fill worklist: every hudChrome.reliquary.*, guide.reliquaryPage.*,
  reliquary_i18n page names/descs, tracker/source/rarity/counts keys across the 15
  Latin locales, plus the nominative-conjunction caveat locales; (c) the Steam/Epic
  portal configuration task; (d) the usedBy locale-fill rider already standing for
  v0.35.0 (cross-reference, do not duplicate).
- Verify the branch's committed-comment corrections from Phase 12 are still accurate
  post-merges; fix drift.

INVARIANTS: hot-path seams (cached, single-flight, bounded); privacy (rarity is
aggregate-only, threshold small cohorts if the deeds precedent does); server stays
observer for membership; no new dependencies.

Out of scope: nothing after this but the final QA.

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/world_api_parity.test.ts tests/reliquary_wire.test.ts + the aggregation suites +
tests/reliquary_window_behavior.test.ts tests/localization_fixes.test.ts; npm run
ci:changed. Dispatch: database-performance-reviewer (primary) +
privacy-security-review + cross-platform-sync + frontend-seam-reviewer + qa-checklist.

STEP 4 - COMMIT CADENCE:
- feat(server): realm relic rarity aggregation on the records cadence
- feat(ui): rarity lines on relic tooltips and page headers
- docs(screenshots): recapture the full reliquary evidence set
- docs: record release riders and correct the packet records

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] A relic tooltip shows a rarity line online and omits it offline (both pinned);
      aggregation cost measured and inside the hot-path rules (db reviewer sign-off).
- [ ] Every committed screenshot shows what its filename claims (frame-checked).
- [ ] The PR body draft covers all five corrections and is shown in the final
      response for the maintainer before gh pr edit is run.
- [ ] All four riders recorded in state.md.

STEP 6 - DOCS: progress.md, state.md.
STEP 7 - FINAL RESPONSE: status + the full PR body draft + handoff to Phase 22 QA
(the final QA: whole-feature matrix + teardown offer).

STOPPING RULES: stop and surface if no deeds aggregation walk exists to ride (a brand
new full-table scan needs the maintainer's explicit sign-off on cadence and cost
before it is built).
```
