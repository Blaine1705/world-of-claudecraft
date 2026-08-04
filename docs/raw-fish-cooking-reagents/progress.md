# Raw fish as cooking reagents: progress

| Phase | Status | Completed |
|---|---|---|
| Planning packet | Complete | 2026-08-03 |
| Phase 1: Sim truth | Complete | 2026-08-04 |
| Phase 1 QA | Complete (covered with Phase 2 QA on tip) | 2026-08-04 |
| Phase 2: UI/UX | Complete | 2026-08-04 |
| Phase 2 QA | Complete | 2026-08-04 |
| Phase 3: Guide, economy, screenshots | Complete | 2026-08-04 |
| Phase 3 QA (gate + PR readiness) | Pending | |

## Done (Phases 1 to 2)

- All raw catches: `kind: 'junk'`, no `foodHp`; refuse-use + sim_i18n matcher
- Honest materials + Material kind line; cooking tooltip line (createElement)
- Bags: no consume affordance; fish icons; i18n + M16 fills
- Validation green on tip: tsc, Phase 1/2 vitest suites, architecture pure-core
  filters, ci:changed. Reviewers clean of BLOCKING.

## Phase 3 deliverables

- [x] Guide cooking + fishing prose: raw catches are kitchen reagents; meals are
      what restore health (`guide.gear.fishingBody` / `fishingFood`,
      `guide.profPages.fish.tablesNote`,
      `guide.profPages.craftProse.cooking.materialsBody`)
- [x] sellValue floor review: **accepted unchanged** (weak copper; zone-tier
      monotonic; raw below primary cooked meal). Pinned in
      `tests/raw_cooking_catches.test.ts`
- [x] Screenshots under `docs/screenshots/raw-fish-cooking-reagents/`:
  - `raw-mirror-trout-tooltip-desktop.png`
  - `cooked-pan-seared-perch-tooltip-desktop.png`
  - `bags-materials-chip-fish-desktop.png`
  - Harness: `scripts/raw_fish_cooking_shots.mjs`
- [ ] `npm run gate` + Phase 3 QA; ready for PR when asked

Validation run (Phase 3 implement):

```bash
git fetch origin release/v0.34.0 && git merge --ff-only origin/release/v0.34.0  # already up to date
npm run i18n:gen
npm run wiki:content
npx tsc --noEmit
npx vitest run tests/raw_cooking_catches.test.ts tests/guide.test.ts tests/localization_fixes.test.ts
# next: npm run ci:changed; Phase 3 QA: npm run gate
```
