# Phase 5 QA: Path filters and whole-packet close

## Starter prompt

```
This is Phase 5 QA of the CI Speed packet (also the whole-packet gate).

Goal: verify path filters cannot skip code PRs or release tiers, complete
docs/ci-speed/qa-checklist.md, and leave a clear teardown decision for the
owner.

Checks:
1. Path filter composition: quote the if-conditions; attack them with
   hypothetical diffs (docs-only markdown; src/ change; mixed; release push)
2. Docs-only probe evidence and code PR evidence
3. Branch protection / aggregator story is sound
4. Whole-packet qa-checklist.md every row filled with evidence
5. Performance rows still hold after Phase 2+ (≤ 8 min; balance if Phase 3
   claimed; lint timings)
6. Enforcement rows E1 to E8 still true on final YAML
7. Teardown: pending owner | declined | done (never silent delete)

Reviewers: privacy-security-review, test-coverage-auditor, full qa-checklist
agent if available. Fix BLOCKING. Mark the final PR ready only on PASS or
PASS-WITH-FOLLOWUPS with owner-visible follow-ups.

Final response: whole-packet verdict, run ids, remaining risks, first
follow-up if any.
```
