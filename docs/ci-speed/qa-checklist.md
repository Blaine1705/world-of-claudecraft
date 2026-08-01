# CI Speed: whole-packet QA matrix

Run at Phase 5 QA (and skim after each phase). Every row is PASS / FAIL /
DEFERRED with evidence (run id or command output).

## Enforcement (must not regress)

| # | Criterion | Evidence |
|---|---|---|
| E1 | PR tier still English-only legal (no job-level `I18N_RELEASE_TIER` on pr-gate / pr-checks) | pin + YAML |
| E2 | Release tier still `I18N_RELEASE_TIER=1` on every release test shard | pin + YAML |
| E3 | Full suite still runs via `npm test` shards (no bare vitest; pretest intact) | pin |
| E4 | Completeness: sum of shard test-file counts == unsharded count | latest green run |
| E5 | Malware gate, freshness, typecheck, env/server/client builds still on code paths | YAML |
| E6 | Browser regressions still own job | YAML |
| E7 | `scripts/gate.mjs` still full unsharded vitest, no `--shard` | pin |
| E8 | fail-fast remains false on test matrices | pin |

## Performance

| # | Criterion | Evidence |
|---|---|---|
| P1 | Three consecutive green PR walls ≤ 8 min after Phase 2+ | progress.md log |
| P2 | Phase 3 balance: worst Duration within 20% of median | log lines |
| P3 | Stretch: wall ≤ 6 min if claimed | log |
| P4 | Lint checkout ≤ 40s typical; lint job ≤ 90s typical | three runs |
| P5 | PR cancel-in-progress observed or probed | run notes |
| P6 | Playwright cache hit on second browser-gate run (or documented miss reason) | log |

## Structure

| # | Criterion | Evidence |
|---|---|---|
| S1 | Single `ci.yml` for the gate (D2) | tree |
| S2 | `release-checks` parallel to release tests (no needs between them) | YAML |
| S3 | Docs-only PR skips test matrix; code PR does not | two probe PRs or runs |
| S4 | `tests/ci_workflow.test.ts` green and matches YAML | vitest |
| S5 | No em dashes / en dashes / emojis in packet commits or new copy | scan |

## Safety / ops

| # | Criterion | Evidence |
|---|---|---|
| O1 | Concurrency does not cancel unrelated release/** pushes | design + optional probe |
| O2 | Branch-protection check-name delta documented for the owner | PR bodies |
| O3 | No secrets, no `ALLOW_DEV_COMMANDS` in workflows | review |
| O4 | privacy-security-review PASS on final CI yml shape | review note |

## Verdict template

```
Whole-packet QA: PASS | FAIL | PASS-WITH-FOLLOWUPS
Date:
Base tip:
Evidence runs:
BLOCKING:
SHOULD-FIX:
NICE-TO-HAVE:
Teardown offer (docs/ci-speed/): pending owner | declined | done
```
