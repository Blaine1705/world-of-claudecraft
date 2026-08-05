# Phase 13: Window structure + information UX

Owns: source hints (the number-one collection-log question), page descs, the ARIA
defect, the name-ladder extraction, token discipline, search/filter, and the behavioral
window test suite.

### Starter Prompt
```
This is Phase 13 of the Reliquary Perfection packet: Window structure + information UX.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: a silhouette tells you where to get it, a page tells you what it is, the DOM is
accessible, the CSS is honest, and the window finally has behavioral tests.

STEP 0: canonical pre-flight + release sync. Memory: window-shell coordinate model,
capped-scroll-list flex trap, hud-window refocus Enter double-fire.

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md; src/ui/reliquary_window.ts
(whole) + reliquary_view.ts (whole); src/sim/content/reliquary.ts relic def shapes;
src/ui/reliquary_i18n.ts (Phase 11); the deeds window search/filter implementation in
src/ui/deeds_window.ts + deeds_view.ts; tests/deeds_window.test.ts +
deeds_window_focus.test.ts + deeds_window_jump.test.ts (the behavioral shapes to
clone); src/styles/components.css reliquary section (~:7810-8170) + the token registry
(src/styles/tokens.css or themeCssVars); DESIGN.md sections 4 (tokens) and 6 (icon
roles); tests/hud_perf_budget.test.ts reliquary rows. Return: relic def union, ladder
call sites, the four pseudo-token names and both fallback hexes, deeds search/filter
mechanics.

STEP 2 - EXECUTE (three agents: sim-side catalog field, window UX, tests):

Agent A (catalog source metadata, sim-side but data-only):
- Extend ReliquaryRelicDef items (and optionally marks) with an authored source hint:
  a structured {sourceKind: 'boss'|'zone'|'profession'|'deed'|'vendor', sourceId}
  rather than free text, so the client localizes via existing entity/deed resolvers.
  Author it for EVERY relic on multi-source pages (dungeon pages with multiple bosses,
  the raid page, Horizons where non-obvious). Single-boss pages may declare a page-level
  default source instead of per-relic repetition. Content test: every item relic on a
  page with 2+ distinct sources carries a hint; every sourceId resolves against the
  live mob/zone/profession/deed tables.

Agent B (window UX):
- Missing-cell tooltip: name + "Not yet found" + the localized source line ("Drops from
  <boss> in <dungeon>", "Gathered from <event>", etc.) via a new
  hudChrome.reliquary.sourceLine* key family resolved through tEntity/deed_i18n/
  reliquary_i18n. Owned item cells keep the full item tooltip.
- Render page desc under the page header via reliquaryPageDesc (Phase 11 surface), and
  the desc as the shelf-row second line where it fits (mobile truncates with the shared
  ellipsis pattern; no title-attr tooltips).
- ARIA: role="listitem" on .reliquary-page-row buttons (or convert the container to
  ul/li like professions); roving tabindex on the grid (one tab stop, arrow keys move,
  matching any existing grid precedent the Explore found; if none exists keep
  tabindex=0 but fold firstFindClears and the source line into the cell aria-label so
  keyboard and screen-reader users get everything hover gets).
- Extract reliquaryRelicDisplayName(kind, id) into reliquary_view.ts (pure) and route
  ALL FOUR ladder sites (cellDisplayName, findDisplayName, both hud.ts ladders) through
  it; the fallback arm uses a t() key (hudChrome.reliquary.unknownRelic) instead of the
  banned humanized-id replace; unit-test the fallback.
- Delete the dead reliquaryWindowOpen getter (hud.ts:15253); fix the four pseudo-tokens
  (define real semantic tokens in the token registry if the roles are themable, else
  use the plain literals the deeds section uses; either way one name = one value);
  give .reliquary-count a real CSS rule (header count demotion); remove the inert-cell
  interactive cursor and add the missing hover state on interactive rows; fix the
  nearly-complete rule: qualify only when remaining <= 3 OR owned/total >= 0.6, keep
  the fewest-remaining sort, update the pinned view tests and the strip label if the
  copy needs it.
- Search + filter (deeds parity): a search box filtering pages and relics by localized
  name, and an owned/missing toggle on page grids, following the deeds window mechanics
  the Explore summarized; state lives on the painter like nav/pageId; signature
  includes them.

Agent C (behavioral window tests): create tests/reliquary_window_behavior.test.ts on
the deeds_window.test.ts shape (happy-dom): construct ReliquaryWindow with stub deps;
assert open/close focus capture and return, data-focus-key restore across a rebuild,
scroll preservation, refreshIfChanged eliding on an identical signature and repainting
on each dimension, nav/page/back clicks moving state, tooltip attach on cells, dialog
root labeling, search filtering, owned/missing toggle, roving tabindex or aria-label
completeness. Remember the happy-dom detached-option trap (bank-search memory) and the
refocus Enter double-fire memory.

INVARIANTS: cold-window contracts (no forced-reflow reads beyond the declared
scrollTop pair, no self-driver; hud_perf_budget must stay green); information never
tier-gated; every new string an English catalog key (M16 check for wordy source lines);
DESIGN.md token discipline; no title-attr tooltips.

Out of scope: Overview composition (Phase 14), cell art (Phase 16), deep links
(Phase 15).

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/reliquary_window.test.ts tests/reliquary_window_behavior.test.ts
tests/reliquary_view.test.ts tests/reliquary_content.test.ts
tests/hud_perf_budget.test.ts tests/architecture.test.ts tests/localization_fixes.test.ts
+ styles suites; npm run ci:changed. Mobile screenshot spot-check with the shot
harness. Dispatch: frontend-seam-reviewer + architecture-reviewer (relic def changed in
sim content) + test-coverage-auditor (new suite) + qa-checklist.

STEP 4 - COMMIT CADENCE:
- feat(reliquary): authored source hints on relics with localized tooltip lines
- feat(ui): page descs, search, owned filter, and list semantics in the window
- refactor(ui): one relic display-name resolver for every surface
- test(ui): behavioral window suite

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] Every missing relic on a multi-boss page shows a localized source line (tooltip
      AND aria); content test enforces hint coverage.
- [ ] A 1/30 page can no longer appear in nearly-complete (pinned).
- [ ] axe-clean list semantics (run npm run test:browser a11y if available locally).
- [ ] One display-name resolver; the chat/banner drift case is pinned.
- [ ] Behavioral suite passes and covers the ten listed behaviors.

STEP 6 - DOCS: progress.md, state.md (relic def extension, new keys, nearly rule).
STEP 7 - FINAL RESPONSE + handoff to Phase 13 QA.

STOPPING RULES: stop and ask if authoring source hints surfaces relics whose true
source is ambiguous in content (list them rather than guessing).
```
