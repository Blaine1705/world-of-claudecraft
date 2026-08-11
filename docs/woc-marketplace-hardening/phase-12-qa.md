# Phase 12 QA: Wire completeness and environment truth

Dedicated QA session for phase 12. Canonical QA workflow in `implementation-plan.md`.
Repo: game, worktree `/Users/fernando/Documents/wocc-marketplace`.

## What was promised (audit every item)

Fee split and signatureRequired on the wire and rendered; a complete `.env.example`;
honest health rail; mutation-checked wire pins.

## Phase-specific probes

- Sweep EVERY market view serializer (not just the two cited) against its source object:
  any other silently dropped field is the same bug class; report all.
- The fee lines must render correctly for zero-fee and rounding-edge amounts (one cent,
  the $0.25 floor); check the formatter path uses the i18n money formatting, not string
  concat.
- Env sweep independence: re-run your own `process.env` grep over the market modules and
  diff against `.env.example`; a missed name is a finding.
- Wire pins: confirm the pin test would fail on field REMOVAL and on RENAME, and that it
  reads the real serializer output, not a hand-copied literal list that can drift
  (test-pin-traps memory).

## Reviewers

`cross-platform-sync`, `frontend-seam-reviewer`, `test-coverage-auditor`; `qa-checklist`
last.

## Exit

Verdict, counts, deferrals. Update progress.md and state.md. Next file:
`docs/woc-marketplace-hardening/phase-13-listing-step-up.md`.
