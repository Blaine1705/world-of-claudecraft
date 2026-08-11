# Phase 15 QA: Marketplace UI polish pass

Dedicated QA session for phase 15. Canonical QA workflow in `implementation-plan.md`.
Repo: game, worktree `/Users/fernando/Documents/wocc-marketplace`.

## What was promised (audit every item)

DESIGN.md-conformant polish across every marketplace surface; complete
empty/loading/error/paused/degraded states; mobile correctness; a fresh lowest-preset
screenshot set with all TOTP captures gone; zero behavior change.

## Phase-specific probes

- Open the screenshots and LOOK at them (Read the image files): check alignment,
  truncation, contrast, and that the fee lines show real values; a screenshot nobody
  looked at is not evidence.
- Fairness invariant: diff the styles/tier changes for anything that sheds actionable
  information (own debuffs, cast bars, HP granularity); cosmetic-only is the rule.
- CSS reach: new selectors must actually reach the new DOM (the class-presence trap in
  the test-pin memory); verify one deep selector per surface in a rendered probe.
- Behavior freeze: re-run the phase 14 view-core tests unchanged; any assertion edit in
  this phase's diff is a finding.
- Mobile: check the captures include a small-phone width and that no control falls
  under the thumb-zone/safe-area insets.

## Reviewers

`frontend-seam-reviewer`; `qa-checklist` last.

## Exit

Verdict, counts, deferrals. Update progress.md and state.md. Next file:
`docs/woc-marketplace-hardening/phase-16-hot-path-scale.md`.
