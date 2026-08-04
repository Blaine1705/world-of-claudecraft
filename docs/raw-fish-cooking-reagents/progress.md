# Raw fish as cooking reagents: progress

| Phase | Status | Completed |
|---|---|---|
| Planning packet | Complete | 2026-08-03 |
| Phase 1: Sim truth | Complete | 2026-08-04 |
| Phase 1 QA | Complete (covered with Phase 2 QA on tip) | 2026-08-04 |
| Phase 2: UI/UX | Complete | 2026-08-04 |
| Phase 2 QA | Complete | 2026-08-04 |
| Phase 3: Guide, economy, screenshots | Pending | |
| Phase 3 QA (gate + PR readiness) | Pending | |

## Done (Phases 1 to 2)

- All raw catches: `kind: 'junk'`, no `foodHp`; refuse-use + sim_i18n matcher
- Honest materials + Material kind line; cooking tooltip line (createElement)
- Bags: no consume affordance; fish icons; i18n + M16 fills
- Validation green on tip: tsc, Phase 1/2 vitest suites, architecture pure-core
  filters, ci:changed. Reviewers clean of BLOCKING.

## Phase 3 remaining

- [ ] Guide cooking materials prose accurate (raw = ingredients, meals = food)
- [ ] sellValue floor check (change only if vendor dump is too attractive); pin
      if changed
- [ ] Screenshots under `docs/screenshots/raw-fish-cooking-reagents/` (raw
      tooltip, cooked tooltip, Materials chip with fish)
- [ ] `npm run gate` + Phase 3 QA; ready for PR when asked

Validation sketch:

```bash
git fetch origin release/v0.34.0 && git merge --ff-only origin/release/v0.34.0
npm run wiki:content   # if guide catalog changed
npx vitest run tests/guide.test.ts tests/localization_fixes.test.ts
npm run ci:changed
# Phase 3 QA: npm run gate
```
