# Phase 14: Overview flagship + Illumination celebration

Owns: the "Overview is a stub" finding, the Illumination in-window moment, and the CSS
and elide cleanups in the same surface.

### Starter Prompt
```
This is Phase 14 of the Reliquary Perfection packet: Overview flagship + Illumination
celebration.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: the Overview reads as the feature's front door (the design doc promise: total
progress, Curator rank, recent finds, nearly complete), and completing a page feels
like something happened.

STEP 0: canonical pre-flight + release sync. Memory: view-model array order is a
contract; canvas-sprite traps if any canvas art is used (prefer DOM/CSS).

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md;
src/ui/reliquary_window.ts overviewHtml/recentStripHtml/nearlyStripHtml + wire();
reliquary_view.ts recent/nearly models; the deeds recent-strip implementation
(.deeds-recent-item clickable crest buttons, components.css ~:7445-7460) and the deeds
earned-card flash (components.css ~:7552-7579: bright border + one-shot gold flash +
reduced-motion static ring); src/styles/components.css reliquary section +
hud.mobile.css reliquary block; src/ui/hud.ts handleReliquaryUnlocks refreshWindow arm;
tests for both strips. Return: the deeds patterns in cloneable detail.

STEP 2 - EXECUTE (two agents: view/painter, styles/tests):

Agent A deliverables (composition):
- Recent strip: icon-bearing BUTTONS (item icon via deps.itemIcon, mark/mount/title art
  per the Phase 16-pending fallback: quality ghost until then) that jump to the relic's
  page (consume the Phase 15 openWithPage seam if it landed; otherwise navigate
  in-window via the existing data-page wiring which already exists on nearly rows).
  Real tooltips through deps.attachTooltip, never title attributes. Strip label always
  renders; when the ring is empty show a localized hint (hudChrome.reliquary.recentEmpty:
  what the strip will show and that finds start counting now).
- Nearly-complete strip: keep Phase 13's rule; add a per-row mini progress bar (the
  existing .reliquary-bar family) and the remaining count ("2 to go" via a key with
  {count}).
- Shelf summary cards on the Overview: one card per shelf (Conquerors, Professions,
  Horizons) with owned/total, a progress bar, and the most recent find on that shelf;
  click navigates to the shelf. This fills the dead space the screenshots show, desktop
  and mobile.
- Explain the numbers: a single line under the header reconciling unique relics vs
  shelf slot sums (hudChrome.reliquary.sharedUniquesNote), shown on the Overview only.
- Illumination celebration: when pageDetail.illuminated flips true during an open-window
  drain (plan.refreshWindow path), run a one-shot page-frame gold flash + grid shimmer
  (CSS animation, class added by the painter, removed on animationend); reduced motion
  gets the static bright frame; the standing illuminated state gets a real treatment
  (gold page frame + badge), replacing the letter-spacing-only rule. Fill flash on the
  newly owned cell in the same drain (the plan's documented motion flourish).
- Elide cleanup: move the two Set allocations in buildInput behind the signature check
  (build them only in render), read discovered/marks sizes without Object.keys
  allocation, delete the 44px components.css touch rule, the dead reduced-motion
  box-shadow query, and the inline width style (switch both bars to a --reliquary-fill
  custom property the sheet consumes).

Agent B deliverables (styles + tests):
- All new CSS inside the reliquary @layer components section, tokens only (Phase 13
  fixed the pseudo-tokens; do not reintroduce), mobile: cards stack, strips wrap,
  touch targets >= 44px effective (48 preferred), safe-area respected; landscape clamp
  kept.
- View tests: shelf-card model (per-shelf recent find selection order), empty-ring hint
  arm, celebration plan (one-shot flag set exactly once per illumination, reduced-motion
  arm). Window tests: strips render buttons with tooltips, cards navigate, flash class
  lifecycle. Signature: new dimensions (shelf-card recent ids) move it.

INVARIANTS: cold window (animations are CSS one-shots, no JS driver, no repeating
timer; write-elision unaffected); reduced motion never drops information; every string
a t() key (M16 check on the two wordy notes); fairness untouched.

Out of scope: cell art assets (Phase 16), openWithPage + chat links (Phase 15).

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/reliquary_view.test.ts tests/reliquary_window.test.ts
tests/reliquary_window_behavior.test.ts tests/hud_perf_budget.test.ts + styles suites +
tests/localization_fixes.test.ts; npm run ci:changed; desktop AND mobile screenshots of
the new Overview (warm dev server; pr-screenshots skill traps). Dispatch:
frontend-seam-reviewer + qa-checklist.

STEP 4 - COMMIT CADENCE:
- feat(ui): Overview shelf cards, live recent strip, and reconciliation note
- feat(ui): Illumination page celebration with reduced-motion fallback
- perf(ui): elide window input allocation behind the refresh signature

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] A fresh character's Overview shows labeled strips with hints and three shelf
      cards (no dead-space stub); screenshots committed.
- [ ] Illuminating a page with the window open plays the one-shot flash; with reduced
      motion, the static frame appears; both pinned in tests.
- [ ] refreshIfChanged allocates nothing before the signature compare (assert via the
      behavioral suite or a targeted unit).

STEP 6 - DOCS: progress.md, state.md (new keys, celebration classes).
STEP 7 - FINAL RESPONSE + handoff to Phase 14 QA.

STOPPING RULES: stop if the celebration cannot be built without a JS timer chain
(design constraint: CSS one-shot only).
```
