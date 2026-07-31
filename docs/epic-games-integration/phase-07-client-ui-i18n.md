# Phase 7: Client UI + i18n

Add a capability-gated Epic link control that mirrors the Steam Book of Deeds
link UX. Server advert first; shell capability second. English catalog keys only.

## Deliverables

1. `src/ui/epic_link.ts` twin of `src/ui/steam_link.ts`
   - Hidden when unauthenticated
   - Hidden when `/api/status` epic advert is false
   - Link button hidden when shell capability false (website build)
   - Status / unlink when linked
2. Markup: minimal hooks in the existing character-select / account shell
   (same area as Steam). Prefer reusing layout patterns; do not redesign.
3. Client API helpers on the online client if Steam has `steamAdvert` /
   `steamStatus` / link POST twins (`epicAdvert`, `epicStatus`, link/unlink)
4. i18n: English keys in the matching `src/ui/i18n.catalog/` module
   (no locale overlay edits)
5. Tests: `tests/epic_link.test.ts` (capability matrix), markup test if Steam has one
6. Architecture allowlists if required (`UI_DOM_MODULES` etc.)

## Out of scope

Visual redesign, new HUD window family, non-English fills, wallet on epic.

## Acceptance

- Dark server: no Epic UI
- Website desktop: no Link button (capability false) even if server enabled in dev
- S3 localization guard green
- No em/en dashes or emojis in new copy

## Starter prompt

```
This is Phase 7 of the Epic Games Store integration packet: Client UI + i18n.
Worktree: /home/fernandoramirez/Documents/woc-epic-games-integration
Branch: feature/epic-games-integration.

Goal: ship capability-gated Epic link UI twin of Steam, with English t() keys and
decisive tests, without lighting the feature when EPIC_ENABLED is off.

STEP 0 - PRE-FLIGHT: git status clean. Phases 3-5 required; Phase 4 required for
shell capability; Phase 6 recommended.
Read state.md D2, D3, D22, D23 and src/ui/CLAUDE.md i18n rules.

STEP 1 - LOAD CONTEXT:
  src/ui/steam_link.ts
  tests/steam_link.test.ts
  tests/steam_link_markup.test.ts
  src/runtime.ts DesktopBridge epic methods from Phase 4
  src/net/online.ts (steamAdvert/status/link call sites)
  index.html or relevant markup for cs-steam-group
  src/ui/i18n.catalog modules for hudChrome.steam.* keys

STEP 2 - EXECUTE Deliverables. Extract module; do not grow src/main.ts.
Wire refresh on the same lifecycle as Steam link refresh.
All player strings via t().

INVARIANTS: D3, D22, D23. frontend-seam-reviewer when UI lands.

OUT OF SCOPE: redesign, locale overlays, server logic changes beyond tiny advert
plumbing if missing.

STEP 3 - VALIDATE:
  npx vitest run tests/epic_link.test.ts tests/steam_link.test.ts
  npx vitest run tests/localization_fixes.test.ts
  npx tsc --noEmit
  npm run ci:changed
  frontend-seam-reviewer + test-coverage-auditor on new UI tests.

STEP 4 - DOCS: progress.md Phase 7; list new i18n key prefixes in state.md.

STEP 5 - FINAL RESPONSE: handoff for Phase 8 (ops docs + BPT).

STOPPING RULES:
  - Stop if UI appears when server advert is false.
  - Stop if any player-visible English is hardcoded outside the catalog.
```
