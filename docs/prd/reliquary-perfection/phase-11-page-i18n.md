# Phase 11: Page-name localization + i18n hygiene

Owns: the 28-page-name t() violation (three reviewers, independently), the dead
pageStubNote key, the wiki-vs-window glossary conflict, and the small i18n nits.

### Starter Prompt
```
This is Phase 11 of the Reliquary Perfection packet: Page-name localization + i18n hygiene.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: every Reliquary page name (and, structurally, every future page name and desc)
renders through a localization channel; the dead key is gone; wiki and window agree on
shelf terminology in every locale.

STEP 0: canonical pre-flight + release sync (implementation-plan.md Step 0). Memory
scan: i18n traps (catalog locale blocks are INERT; reword staleness; M16 wordy leaves).

STEP 1 - LOAD CONTEXT (Explore agent):
- docs/prd/reliquary-perfection/state.md + progress.md
- src/ui/deed_i18n.ts and src/ui/deed_i18n.locales/ (the proven content-name
  localization pattern: manifest + per-locale overlay + pinned test deed_i18n.test.ts)
- src/sim/content/reliquary.ts (page name + desc fields; 27 pages after Phase 10)
- Render sites: src/ui/reliquary_window.ts:313-320 (nearly aria), :352 (shelf row),
  :381 (grid aria), :386 (page heading); src/ui/hud.ts handleReliquaryUnlocks
  (~:13222, :13245: page?.name interpolated into illuminateToast/illuminateBanner)
- src/ui/i18n.catalog/hud_chrome.ts reliquary section (the pageStubNote key ~:4024 and
  the comment claiming names may stay English)
- src/ui/i18n.locales/{ja_JP,ko_KR,ru_RU,zh_CN,zh_TW}.ts reliquary blocks (the
  authored fills), src/ui/i18n.catalog/guide.ts reliquaryPage shelf keys
- tests/reliquary_window.test.ts:81 (the pageStubNote negative pin)
- src/ui/CLAUDE.md i18n sections; the i18n glossary (wow-style-translation-conventions
  memory names the file: src/ui/i18n_glossary or equivalent; locate it)
Return: the deed_i18n mechanism in enough detail to clone, every page-name render site,
the current glossary terms for Professions and Horizons per locale.

STEP 2 - EXECUTE (one implementation agent for the resolver + render sites, one for
overlays/glossary/cleanup; they touch disjoint files):

Agent A deliverables (the channel):
- Create src/ui/reliquary_i18n.ts on the deed_i18n pattern: reliquaryPageName(pageId)
  (and reliquaryPageDesc(pageId) for Phase 13 to consume) resolving from a manifest of
  English defaults (the catalog strings) plus per-locale overlays, falling back to the
  catalog English. Register wherever deed_i18n is registered (language fan-out is
  already covered because the window re-renders on locale switch; verify).
- Route EVERY page-name render site through it: the four window sites, the two hud
  toast/banner interpolations, and the "nearly complete" rows. Grep for `.name` on page
  models afterward to prove no raw catalog name reaches HTML or aria.
- Update the misleading comments (hud_chrome.ts "may stay English", reliquary_view.ts
  "client may re-localize later") to state the channel.
- Pinned test on the deed_i18n.test.ts shape: every catalog page id resolves in every
  locale that ships an overlay; unknown id falls back to catalog English; no page name
  string reaches the window HTML builder unresolved (assert the builder output for a
  synthetic page in a non-English locale).
- Fix the nav-rail count hand-concat (reliquary_window.ts ~:250: `${owned}/${total}`)
  to use the existing progressText key.
- Reword loading.tips.reliquary so it does not hardcode "Shift+X" (either drop the key
  name from the copy or resolve the live keybind label the way other tips do; check the
  loading_tips pattern first).

Agent B deliverables (overlays, glossary, cleanup):
- Delete hudChrome.reliquary.pageStubNote from the catalog, its five locale-overlay
  entries, and the negative pin at tests/reliquary_window.test.ts:81; delete the dead
  .reliquary-page-stub and .reliquary-page-stub-note CSS in src/styles/components.css.
  Regenerate i18n (npm run i18n:gen or the owning steps) so the resolved bundles and
  pending.ts drop the key everywhere; re-baseline per the i18n baseline memory in the
  SAME commit.
- Reconcile shelf terminology: pick ONE term per locale for Professions and Horizons
  (prefer the existing guide.nav.professions glossary term where one exists), align
  guide.reliquaryPage.shelf.* and hudChrome.reliquary.nav* in ja_JP, ko_KR, zh_CN,
  zh_TW (ru_RU is already consistent), and add the chosen terms to the i18n glossary so
  release fills lock to them.
- Author page-name overlays for the five M16 locales in the new reliquary_i18n locale
  files (dungeon-backed names should match how those dungeons are already localized:
  cross-check entity_i18n/tEntity translations for The Hollow Crypt and siblings so the
  same dungeon never has two translations).
- English catalog keys stay English-only; do not touch the 15 Latin locales (release
  fill; Phase 22 records the worklist).

INVARIANTS: every player string through t()/the resolver; contributors add English
only + the sanctioned M16/overlay-manifest fills; sim stays language-agnostic (the
catalog keeps its English name field as data; ONLY render sites change); no em dashes
or emojis in copy.

Out of scope: rendering page descs in the window (Phase 13 consumes
reliquaryPageDesc), any layout change.

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/localization_fixes.test.ts tests/i18n_completeness.test.ts
tests/localization_coverage.test.ts tests/language_fanout_registry.test.ts
tests/reliquary_window.test.ts tests/reliquary_view.test.ts tests/deed_i18n.test.ts
tests/guide.test.ts + the new reliquary_i18n test; npm run ci:changed. Dispatch:
frontend-seam-reviewer (+ qa-checklist at completion). cross-platform-sync is NOT
needed (catalog-refactor exemption) unless you changed a sim/server emit; you did not.

STEP 4 - COMMIT CADENCE:
- feat(i18n): reliquary_i18n page-name channel and render-site routing
- fix(i18n): drop the dead pageStubNote key and its fills
- fix(i18n): align reliquary shelf terminology across wiki and window

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] A ja_JP session renders zero English page names in the window, toasts, banners,
      and aria (assert via the pinned test, spot-check via a screenshot).
- [ ] pageStubNote is absent from catalog, overlays, resolved bundles, pending.ts, CSS.
- [ ] One shelf term per locale, glossary updated, both surfaces agree.
- [ ] Nav counts use progressText; the loading tip has no hardcoded chord.

STEP 6 - DOCS: progress.md, state.md (new files: reliquary_i18n.ts + locales; keys
added/removed; glossary terms locked).

STEP 7 - FINAL RESPONSE: status, files, validation, verdicts, handoff to Phase 11 QA.

STOPPING RULES: stop and ask if the deed_i18n pattern cannot cleanly host page descs
too (Phase 13 depends on that surface existing).
```
