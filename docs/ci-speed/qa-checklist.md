# CI Speed: whole-packet QA matrix

Run at Phase 5 QA (and skim after each phase). Every row is PASS / FAIL /
DEFERRED with evidence (run id or command output).

## Enforcement (must not regress)

| # | Criterion | Evidence |
|---|---|---|
| E1 | PR tier still English-only legal (no job-level `I18N_RELEASE_TIER` on pr-gate / pr-checks) | PASS: `tests/ci_workflow.test.ts` (`not.toContain('I18N_RELEASE_TIER')` on pr-*); YAML job env only on release-gate |
| E2 | Release tier still `I18N_RELEASE_TIER=1` on every release test shard | PASS: job-level `env: I18N_RELEASE_TIER: '1'` on release-gate; pin adjacency; not on release-checks |
| E3 | Full suite still runs via `npm test` shards (no bare vitest; pretest intact) | PASS: pin `run: npm test -- --shard=...`; `not.toContain('npx vitest')`; SHARD_N=8 |
| E4 | Completeness: sum of shard test-file counts == unsharded count | PASS: 1939 files on runs 30710958267 and 30712431702 (post Phase 3 splits) |
| E5 | Malware gate, freshness, typecheck, env/server/client builds still on code paths | PASS: CHECK_RUN_STEPS on pr-checks + release-checks; skipped only when path filter code=false (docs-only), never on code PRs or release |
| E6 | Browser regressions still own job | PASS: browser-gate own job; path-filtered with changes.code (docs-only skip only) |
| E7 | `scripts/gate.mjs` still full unsharded vitest, no `--shard` | PASS: pin `gate).not.toContain('--shard')` + full suite step |
| E8 | fail-fast remains false on test matrices | PASS: pin on pr-gate + release-gate |

## Performance

| # | Criterion | Evidence |
|---|---|---|
| P1 | Three consecutive green PR walls ≤ 8 min after Phase 2+ | PASS-WITH-FOLLOWUPS: samples 424s (30710958267) and 442s (30712431702) UNDER; three-in-a-row not re-babysat after owner stopped wall loops; Phase 2 explicit DEFER banked by Phase 3 UNDER samples |
| P2 | Phase 3 balance: worst Duration within 20% of median | FAIL accepted: D11 residual ~1.32 on 30712431702 (359.31 / median); s5 import-bound; no more rename loops; path-matrix only with owner OK |
| P3 | Stretch: wall ≤ 6 min if claimed | DEFERRED / not claimed: walls 7.07 and 7.37 min; stretch not asserted |
| P4 | Lint checkout ≤ 40s typical; lint job ≤ 90s typical | PASS: 22/25/24s checkout; 59 to 68s jobs (30707112749, 30707206995, 30707453993) |
| P5 | PR cancel-in-progress observed or probed | PASS: runs 30707112749 / 30707206995 cancelled mid-matrix after superseding pushes |
| P6 | Playwright cache hit on second browser-gate run (or documented miss reason) | PASS: HIT on 30707206995 and 30707518969 (PR scope); MISS on workflow_dispatch expected (different cache scope) |

## Structure

| # | Criterion | Evidence |
|---|---|---|
| S1 | Single `ci.yml` for the gate (D2) | PASS: only `.github/workflows/ci.yml` owns PR/release gate |
| S2 | `release-checks` parallel to release tests (no needs between them) | PASS: both jobs no needs; shared exact RELEASE_IF_LINE; Phase 4 |
| S3 | Docs-only PR skips test matrix; code PR does not | PASS (design + pins); live probe run ids in progress.md Phase 5 notes after push |
| S4 | `tests/ci_workflow.test.ts` green and matches YAML | PASS: 10 tests green; path-filter + release unfiltered pins |
| S5 | No em dashes / en dashes / emojis in packet commits or new copy | PASS: scan of Phase 5 docs/YAML/test comments (ASCII punctuation only) |

## Safety / ops

| # | Criterion | Evidence |
|---|---|---|
| O1 | Concurrency does not cancel unrelated release/** pushes | PASS: group includes `github.event_name` + PR number or ref (D4 pin adjacency) |
| O2 | Branch-protection check-name delta documented for the owner | PASS: progress.md OPEN item 3; PR #2737 body; names `PR gate (English-only legal) (1)`..(8) |
| O3 | No secrets, no `ALLOW_DEV_COMMANDS` in workflows | PASS: privacy-security review of final shape; workflow permissions contents:read only |
| O4 | privacy-security-review PASS on final CI yml shape | PASS: Phase 5 review (path filter is read-only git diff; no secret output; fail closed to full suite) |

## Verdict template

```
Whole-packet QA: PASS-WITH-FOLLOWUPS
Date: 2026-08-01
Base tip: feature/ci-speed (Phases 1 to 5 on PR #2737)
Evidence runs: 30710958267 (424s), 30712431702 (442s), lint 30707112749/30707206995/30707453993; Phase 5 code-touch + docs-only probe ids in progress.md
BLOCKING: none
SHOULD-FIX: none for packet close
NICE-TO-HAVE: owner confirm branch protection with skipped PR matrix on docs-only; OPEN item 6 release-version-gate outside packet; optional path-matrix for D11 with owner OK; Phase 1 pin harden followups
Teardown offer (docs/ci-speed/): pending owner
```
