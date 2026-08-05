# Reliquary Perfection Packet (Phases 10 to 22)

Close-out packet for PR #2976 (The Reliquary). Phases 1 to 9 shipped the feature on
`feature/reliquary`; this packet addresses every finding from the 2026-08-05 multi-agent
review (6 domain reviewers, 8 research audits, 14 adversarial verifications, all upheld)
plus the maintainer's full product checklist. Every blocking, should-fix, nit, note, and
idea finding is owned by exactly one phase below. Work lands on the local branch
`feature/reliquary-perfection` in the `wocc-reliquary-review` worktree; after each QA
phase passes, the branch is pushed to `origin/feature/reliquary` so PR #2976 stays the
single reviewable unit.

## Index

Every session runs the frontier default model at xhigh effort. The Runner column says
whether to type the `ultracode` keyword at the top of your runner prompt: the keyword
must be in the prompt you TYPE (the copy inside the phase file is a reminder, not the
opt-in). Rule of thumb: implementation phases 12 and 21 plus EVERY QA phase.

| Phase | File | Runner | One line |
|---|---|---|---|
| 10 | [phase-10-sim-correctness.md](phase-10-sim-correctness.md) | xhigh | Hidden-deed spoiler removal, retro-safe join path, sim robustness |
| 10 QA | [phase-10-qa.md](phase-10-qa.md) | ULTRACODE | Verify Phase 10 |
| 11 | [phase-11-page-i18n.md](phase-11-page-i18n.md) | xhigh | Localize the 28 page names, i18n hygiene, glossary reconciliation |
| 11 QA | [phase-11-qa.md](phase-11-qa.md) | ULTRACODE | Verify Phase 11 |
| 12 | [phase-12-test-integrity.md](phase-12-test-integrity.md) | ULTRACODE | Catalog drift pins, gameable-test repairs, record corrections |
| 12 QA | [phase-12-qa.md](phase-12-qa.md) | ULTRACODE | Verify Phase 12 (mutation audit) |
| 13 | [phase-13-window-information.md](phase-13-window-information.md) | xhigh | Source hints, page descs, ARIA, name ladder, tokens, behavioral tests |
| 13 QA | [phase-13-qa.md](phase-13-qa.md) | ULTRACODE | Verify Phase 13 |
| 14 | [phase-14-overview-flagship.md](phase-14-overview-flagship.md) | xhigh | Overview rebuild, Illumination celebration, CSS cleanup |
| 14 QA | [phase-14-qa.md](phase-14-qa.md) | ULTRACODE | Verify Phase 14 |
| 15 | [phase-15-deeplinks-tracker.md](phase-15-deeplinks-tracker.md) | xhigh | openWithPage, clickable chat lines, always-on tracker, guide search |
| 15 QA | [phase-15-qa.md](phase-15-qa.md) | ULTRACODE | Verify Phase 15 |
| 16 | [phase-16-art.md](phase-16-art.md) | xhigh | Painted launcher art, owned-cell art for non-item relics |
| 16 QA | [phase-16-qa.md](phase-16-qa.md) | ULTRACODE | Verify Phase 16 |
| 17 | [phase-17-obtain-counts-perf.md](phase-17-obtain-counts-perf.md) | xhigh | Per-relic obtain counts, wire memoization, serialize slimming |
| 17 QA | [phase-17-qa.md](phase-17-qa.md) | ULTRACODE | Verify Phase 17 |
| 18 | [phase-18-rewards-ladder.md](phase-18-rewards-ladder.md) | xhigh | Capstone deeds, Illumination titles, Discord feed, achievements, marquee |
| 18 QA | [phase-18-qa.md](phase-18-qa.md) | ULTRACODE | Verify Phase 18 |
| 19 | [phase-19-borders-inworld.md](phase-19-borders-inworld.md) | xhigh | Border rendering on nameplates and portraits (activeBorder) |
| 19 QA | [phase-19-qa.md](phase-19-qa.md) | ULTRACODE | Verify Phase 19 |
| 20 | [phase-20-inspect-social.md](phase-20-inspect-social.md) | xhigh | Curator sigil on inspect, rank on inspect, privacy note |
| 20 QA | [phase-20-qa.md](phase-20-qa.md) | ULTRACODE | Verify Phase 20 |
| 21 | [phase-21-catalog-growth.md](phase-21-catalog-growth.md) | ULTRACODE | Rift, Rares of the Realm, PvP Warfare, fishing, retired shelf |
| 21 QA | [phase-21-qa.md](phase-21-qa.md) | ULTRACODE | Verify Phase 21 |
| 22 | [phase-22-rarity-closeout.md](phase-22-rarity-closeout.md) | xhigh | Population rarity, screenshots, PR body, release riders |
| 22 QA | [phase-22-qa.md](phase-22-qa.md) | ULTRACODE | Final packet QA, whole-feature matrix, teardown offer |

## Cross-cutting docs

- [brainstorm.md](brainstorm.md): review corpus summary, locked decisions, finding-to-phase map.
- [implementation-plan.md](implementation-plan.md): canonical per-phase workflow (release sync,
  orchestration, review dispatch matrix, push-to-PR rule) + phase summary table.
- [progress.md](progress.md): status table + per-phase deliverable checklists.
- [state.md](state.md): cross-phase cheat sheet (locked decisions, validation matrix, surfaces added).
- [qa-checklist.md](qa-checklist.md): whole-feature integration matrix for the final QA phase.
