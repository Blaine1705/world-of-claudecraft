# Phase 15: Marketplace UI polish pass

Follow the shared workflow in `implementation-plan.md` first; `state.md` has the
validation matrix. This file is the phase spec.

- Repo: game. Worktree `/Users/fernando/Documents/wocc-marketplace`, branch `feature/woc-marketplace`.
- Closes: the "beautiful UI and UX" bar, and the stale-screenshot item inside H13.
- review.md: strengths item 9 (the bar to keep), H13 (stale TOTP screenshots).

## Goal

The marketplace looks and feels like the best surface in the game: consistent with
DESIGN.md, polished on desktop and mobile, with honest empty/loading/degraded states,
and a fresh committed screenshot set.

## Context

The review rates the player UI well built (real pure-core/painter split, ARIA 1.2
combobox, honest degraded states, thoughtful mobile CSS). This phase raises finish
quality without changing behavior: phases 12 to 14 landed the behavior fixes; every
committed "after" screenshot currently shows the removed TOTP field and must be
replaced.

## Deliverables

1. Design audit + fixes across every marketplace surface (browse, listing detail,
   bid/buy-now, directed offer and trade panel, activity, wallet/paused/degraded
   states) against DESIGN.md: hierarchy, spacing rhythm, alignment, iconography,
   window-family consistency, tooltip quality per `docs/design/tooltip-writing.md`
   (use the `write-game-tooltips` skill for any tooltip text changes).
2. State completeness: every surface has designed empty, loading, error, paused, and
   degraded states (no blank panels, no layout jumps); verify the fee/You-receive lines
   from phase 12 sit correctly in the layout.
3. Mobile: phone-width layouts, safe areas, touch targets, the landscape-only in-game
   rule; verify with the mobile screenshot scripts.
4. Fresh before/after screenshot set, desktop AND mobile, at the LOWEST graphics preset
   (standing memory rule), committed under `docs/screenshots/woc-marketplace/`; every
   stale TOTP-bearing capture deleted; the set referenced from the eventual PR body
   (`pr-screenshots` skill owns the capture recipe).

## Out of scope

Behavior changes of any kind (if the audit finds a behavior bug, file it in progress.md
deferrals for a fix round, do not fix it silently here); non-marketplace HUD surfaces.

## Validation

`npx tsc --noEmit`; the styles/HUD suites the Explore agent identifies plus
`npx vitest run tests/monolith_budget.test.ts` (hud.ts must not regrow);
`npm run ci:changed`; the screenshot scripts; commit, then `node scripts/gate_select.mjs`.

## Reviewers

`frontend-seam-reviewer` (styles layer/token contract, painter thinness, fairness:
purely cosmetic changes only). `qa-checklist` last.

## Acceptance criteria

- [ ] Design audit findings list produced and every item applied or deferred with reason
- [ ] All five states designed on every surface; no blank panel reachable
- [ ] Mobile screenshots show correct safe-area and touch layout
- [ ] Fresh screenshot set committed at lowest preset; zero TOTP-bearing captures remain
- [ ] Zero behavior diffs (view-core test outputs unchanged)

## Wrap-up

Update progress.md and state.md (screenshot paths for the PR body). Next file:
`docs/woc-marketplace-hardening/phase-15-qa.md`.
