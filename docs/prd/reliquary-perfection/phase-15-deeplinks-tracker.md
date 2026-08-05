# Phase 15: Deep links, clickable chat, always-on tracker, guide search

Owns: the openWithPage seam, clickable chat lines (deeds parity), the always-on
tracker the maintainer asked for, and guide search indexing.

### Starter Prompt
```
This is Phase 15 of the Reliquary Perfection packet: Deep links, clickable chat,
tracker, guide search.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: a relic gain in chat is one click from its page; the HUD can keep the chase on
screen; the wiki finds relics by name.

STEP 0: canonical pre-flight + release sync. Memory: hud-window refocus Enter
double-fire; view-model array order.

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md;
src/ui/hud/chat/deed_chat_line.ts (deedLineNodes, deedChatLinkEl, DEED_NAME_TOKEN) and
its hud.ts consumers (~:11824, :13285-13292); src/ui/deeds_window.ts openWithDeed;
the deed tracker: #deed-tracker chrome in index.html/play.html, its painter module,
hud.ts wiring (~:4585-4590, :9087, collapse handling ~:2557-2577), the
deedTrackerCollapsed settings key (src/game/settings.ts:316); src/ui/reliquary_window.ts
open()/nav state; src/guide/ search indexing for deeds (how deed names enter the search
corpus) + src/guide/pages/reliquary.ts; hudChrome catalog reliquary section. Return:
the chat-link and tracker recipes in cloneable detail, the guide search corpus
mechanism.

STEP 2 - EXECUTE (three agents: deep link + chat, tracker, guide search):

Agent A (deep link + chat):
- ReliquaryWindow.openWithPage(pageId): sets nav to the page's shelf, pageId, opens,
  renders, focuses the page header (mirror openWithDeed's focus behavior). Export the
  jump for the recent strip and nearly rows too (Phase 14 buttons adopt it if they
  landed on in-window navigation).
- Chat lines: every reliquary log line (relic gain, Illumination, rank-up) becomes a
  node-built line on the deed_chat_line family: the relic or page name is a clickable
  element calling openWithPage (relic lines jump to pageIds[0]; illumination lines to
  the illuminated page; rank-up lines open the Overview). Reuse logNodes; keep the
  gold color and the retro-summary exemption (retro lines stay plain). Pin with a
  jump test on the deeds_window_jump.test.ts shape.

Agent B (always-on tracker):
- A Reliquary tracker following the deed-tracker recipe exactly: #reliquary-tracker
  chrome in BOTH index.html and play.html beside #deed-tracker; a pure view core
  (reliquary_tracker_view.ts, DOM-free, registered in UI_PURE_CORES, all three lists
  per the bare-named-core memory if bare-named; prefer the _view suffix) computing: up
  to N pinned pages (player-chosen via a pin toggle on page rows in the window,
  persisted in settings like the deeds watchlist; default when nothing pinned: the top
  nearly-complete pages), each with name, owned/total, and delta-flash on change; plus
  a write-elided painter on the PainterHost seam registered in
  tests/hud_perf_budget.test.ts's per-frame bucket with write-elision proven.
- Collapse/expand with persisted state (reliquaryTrackerCollapsed), mobile compact
  behavior mirroring the deed tracker's count chip, safe-area aware, and an options-
  window visibility toggle if the deed tracker has one (match its precedent exactly).
- Localized strings via new hudChrome.reliquary.tracker* keys.
- Tests: view core units (selection order, pin precedence, delta detection), painter
  write-elision pin, settings persistence.

Agent C (guide search):
- Index Reliquary pages and relic display names into the wiki search corpus the same
  way deeds are indexed (spoiler-safe: respect the hidden filter from Phase 10 which
  is structural now; no personal progress). Regenerate wiki content; extend
  tests/guide.test.ts to pin that a known page name and a known relic name resolve in
  search, and that no hidden-deed text does.

INVARIANTS: tracker is a per-frame painter, so write-elision is mandatory and
hud_perf_budget must classify it; graphics fairness (the tracker shows the player's own
progress: not actionable combat info, but never tier-gate it anyway); IWorld only (the
tracker reads existing facet members; if it needs a pinned-pages read, add it to the
facet, implement in BOTH worlds, update the parity pin in the same change: pinned pages
are client-local settings, so prefer keeping them in game settings, NOT on IWorld);
i18n complete.

Out of scope: population rarity (Phase 22), art (Phase 16).

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/architecture.test.ts tests/hud_perf_budget.test.ts tests/reliquary_*.ts
tests/guide.test.ts + the new tracker tests + tests/world_api_parity.test.ts (if the
facet changed) + tests/localization_fixes.test.ts; npm run ci:changed; mobile
screenshot of the tracker. Dispatch: frontend-seam-reviewer + cross-platform-sync
(only if the facet changed) + test-coverage-auditor + qa-checklist.

STEP 4 - COMMIT CADENCE:
- feat(ui): openWithPage deep link and clickable reliquary chat lines
- feat(ui): always-on Reliquary tracker with pinned pages
- feat(guide): index reliquary pages and relics in wiki search

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] Clicking a relic chat line opens the window on that page with focus placed;
      pinned by a jump test.
- [ ] The tracker paints only on change (write-elision pinned), collapses, persists,
      and works on mobile; screenshots committed.
- [ ] Wiki search finds "Gravewyrm Sanctum" and a relic name; hidden text absent.

STEP 6 - DOCS: progress.md, state.md (new module names, settings keys, i18n keys).
STEP 7 - FINAL RESPONSE + handoff to Phase 15 QA.

STOPPING RULES: stop and ask if the tracker cannot meet write-elision without a new
IWorld read (that changes the facet surface; confirm the shape first).
```
