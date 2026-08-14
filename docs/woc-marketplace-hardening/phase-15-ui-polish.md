# Phase 15: The beautify pass (marketplace UI and UX)

SESSION START (do this first in every fresh session): cd into the worktree
`/Users/fernando/Documents/wocc-marketplace`; verify `pwd` and
`git branch --show-current` (must print `feature/woc-marketplace`). Then
`git fetch origin` and merge the newest `origin/release/**` branch (currently
`origin/release/v0.38.0`) so this session starts current; if the merge is
non-trivial, run the `release-merge-audit` skill on it before continuing.

Follow the shared workflow in `implementation-plan.md` first; `state.md` has the
validation matrix. This file is the phase spec.

- Repo: game. Worktree `/Users/fernando/Documents/wocc-marketplace`, branch `feature/woc-marketplace`.
- Closes: the beautify bar (a stated packet goal from Fernando: the marketplace is a
  HUGE part of the game and must look like a beautiful MMORPG window), and the
  stale-screenshot item inside H13.
- review.md: strengths item 9 (the bar to keep), H13 (stale TOTP screenshots).

## Goal

The marketplace looks and feels like the best surface in the game: a proper classic
MMORPG window family, fully conformant with DESIGN.md, where nothing truncates, every
number and time is formatted, every image reads clearly, and the whole surface holds up
on desktop and mobile.

## Context

The review rates the player UI well built (real pure-core/painter split, ARIA 1.2
combobox, honest degraded states, thoughtful mobile CSS). Phases 12 to 14 landed the
behavior fixes. This phase is presentation only, and it is deep, not a touch-up. Every
committed "after" screenshot currently shows the removed TOTP field and must be
replaced.

## Deliverables

1. DESIGN.md conformance audit and fixes across every marketplace surface (browse,
   listing detail, bid/buy-now, directed offer and trade panel, activity, wallet /
   paused / degraded states, the step-up prompt from phase 13): window-family framing,
   spacing rhythm and padding on the design tokens (no ad-hoc pixel values), alignment
   grids, hierarchy, iconography, hover/focus states, scrollbar and list styling
   consistent with the HUD family. Produce the audit as a checklist first, then apply
   every item (or defer with a reason in progress.md).
2. Content robustness, checked at the extremes, not the happy path:
   - Text never truncates silently: long item names, long seller names, stacked
     suffixes, and the wordiest locale-sized strings either wrap by design or ellipsize
     WITH a tooltip carrying the full text.
   - Numbers, money, dates, times, and percents ALL go through `formatNumber` /
     `formatMoney` / `formatDateTime` / `Intl` (grep-verified: zero `toFixed`, zero
     string-concatenated symbols or units in the market UI); auction countdowns and
     "time ago" rows use the HUD's relative-time conventions and never jump widths.
   - Item icons and images render crisply at HUD scale (correct resolution, no
     stretching, readable rarity framing); empty and placeholder art is deliberate,
     never a broken square.
   - Zero-state, one-item, and max-page-size lists all lay out correctly; loading
     states reserve space (no layout jumps).
3. Tooltip quality: every market tooltip follows `docs/design/tooltip-writing.md` (use
   the `write-game-tooltips` skill for any text change); fee and bond tooltips show
   resolved values.
4. Mobile: phone-width layouts, safe areas, touch targets, the landscape-only in-game
   rule; verify with the mobile screenshot scripts.
5. Fresh before/after screenshot set, desktop AND mobile, at the LOWEST graphics preset
   (standing memory rule), committed under `docs/screenshots/woc-marketplace/`, every
   stale TOTP-bearing capture deleted, referenced from the eventual PR body
   (`pr-screenshots` skill owns the recipe). Include at least one long-name /
   large-number stress capture per surface, not just pristine data.

## Out of scope

Behavior changes of any kind (a behavior bug found here goes to progress.md deferrals);
non-marketplace HUD surfaces (a shared token fix that improves both is fine; a
refactor of another window is not).

## Validation

`npx tsc --noEmit`; the styles/HUD suites the Explore agent identifies plus
`npx vitest run tests/monolith_budget.test.ts` (hud.ts must not regrow);
`npm run ci:changed`; the screenshot scripts; commit, then `node scripts/gate_select.mjs`.

## Reviewers

`frontend-seam-reviewer` (styles layer/token contract, painter thinness, fairness:
purely cosmetic changes only). `qa-checklist` last.

## Acceptance criteria

- [ ] The DESIGN.md audit checklist exists with every item applied or deferred with
      reason
- [ ] Stress content (longest names, largest numbers, zero states) renders correctly on
      every surface; the grep for raw formatting is clean
- [ ] Every market tooltip passes the tooltip-writing bar
- [ ] Mobile captures show correct safe-area and touch layout
- [ ] Fresh screenshot set committed at lowest preset, stress captures included, zero
      TOTP-bearing captures remain
- [ ] Zero behavior diffs (view-core test outputs unchanged)

## Wrap-up

Update progress.md and state.md (screenshot paths for the PR body). Next file:
`docs/woc-marketplace-hardening/phase-15-qa.md` (its verdict includes Fernando's
sign-off on the screenshot set).
