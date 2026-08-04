# Raw fish as cooking reagents: remaining plan

Phases 1 and 2 (sim truth + UI/UX) are complete and QA-clean. This file keeps
only Phase 3 scope. Locked decisions and the ledger live in `state.md`; status
in `progress.md`.

## Phase 3: Guide, economy, screenshots, close

### Outcome

Wiki/guide text matches the rule; sell floors do not gut the market; PR has
visual proof; packet ready for final gate.

### Scope

- Align cooking guide prose so catches are ingredients, meals are what you eat
  (`guide.profPages.craftProse.cooking.materialsBody` and related).
- Light sellValue review on raw catches: weak copper so market/trade wins.
  Change only if current values invite dumping; keep zone-tier monotonicity;
  pin if numbers change.
- Screenshots under `docs/screenshots/raw-fish-cooking-reagents/` (desktop
  minimum): raw trout tooltip, cooked perch tooltip, bags Materials chip with
  fish (`pr-screenshots` skill).
- Optional: one-line fix in `docs/design/professions.md` if it still claims
  raw fish heal.

### Out of scope

Kebab lottery, Well Fed, feasts, new recipes, cooked `foodHp` rebalance, full
legacy itemTooltip HTML migration.

### Validation

```bash
git fetch origin release/v0.34.0 && git merge --ff-only origin/release/v0.34.0
npm run wiki:content   # if guide inputs changed
npx vitest run tests/guide.test.ts tests/localization_fixes.test.ts
npm run ci:changed
# Phase 3 QA: npm run gate
```

### Exit criteria

- [ ] Guide text accurate
- [ ] Sell floors sane or explicitly accepted
- [ ] Screenshots committed; paths listed in `progress.md`
- [ ] Ready for Phase 3 QA (`npm run gate` + checklist)

### Packet complete when

Raw catches non-edible with refuse-use, honest materials, Material kind,
cooking tooltip line, fish icons, no consume hint; cooked/vendor/conjured food
still work; guide + screenshots match; gate green. Deferred work stays notes
only.
