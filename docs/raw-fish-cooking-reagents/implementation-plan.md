# Raw fish as cooking reagents: implementation plan

Make every raw fishing catch a cooking reagent, never a free heal. Cooked food
stays the only fish-based sit-heal path. UI and bag UX must make that rule
obvious and pleasant.

Base branch: `release/v0.34.0` (pull latest at the start of every phase).
Plan refresh base tip: `086545b883` (2026-08-04; re-verify with fetch each phase).
Feature branch: `feature/raw-fish-cooking-reagents`.
Worktree: create a separate git worktree for this task (repo default workflow).

| Phase | Slice | Surfaces |
|---|---|---|
| 1 | Sim truth: raw catches non-edible + material taxonomy | `src/sim/`, tests |
| 1 QA | Verify Phase 1 | |
| 2 | Beautiful UI/UX: labels, tooltips, bag actions, icons | `src/ui/`, i18n, tests |
| 2 QA | Verify Phase 2 | |
| 3 | Guide prose, economy floor check, screenshots, packet close | guide catalog, docs, screenshots |
| 3 QA | Final gate + PR readiness | |

Out of scope for this packet (explicitly deferred):

- Kebab-style raw-eat lottery (rejected for economy/profession strength).
- Well Fed combat buffs, party feasts, new cooking skill rungs past the
  existing 0 / 25 / 50 ladder.
- A separate kebab craft item.
- Changing vendor food, conjured food, or cooked meal `foodHp` curves.
- New stations, new recipes, or cooking skill rebalance.

## Team workflow (every phase)

1. **Pre-flight**: `git status` clean in THIS worktree.  
   `git fetch origin release/v0.34.0 && git merge --ff-only origin/release/v0.34.0`  
   (or rebase the feature branch onto latest release). Resolve only release
   conflicts that touch this packet's files; stop if unrelated WIP appears.
2. **Load context**: read `state.md`, `progress.md`, this file's phase section,
   and the listed source files. Prefer targeted reads over whole coordinators
   (`hud.ts` only at the `itemTooltip` food lines and kind line).
3. **Execute**: module-first. New decision logic lives in small sibling modules
   under existing seams; do not grow `hud.ts` or `sim.ts` with new banks.
4. **Validate + review**: run the phase validation commands; dispatch reviewers
   from the matrix below. Fix BLOCKING findings before commit.
5. **Docs**: update `progress.md` and `state.md` ledger. Conventional Commits
   with scope and body. Stage explicit paths only.

Code hygiene: tests for every new behavior, zero unused imports, no generated
file hand-edits, no em dashes / en dashes / emojis, English-only catalog keys
for new player strings (M16 non-Latin fills when the English value is wordy).

### UI construction preference (locked for this packet)

This repo is plain DOM (no UI framework). For **new** UI in this feature:

1. **Pure core first:** models and decisions return data (ids, translation keys,
   plain strings, flags). No markup in pure cores.
2. **Paint with createElement:** thin painters build DOM with `createElement`,
   `textContent` / `classList` / attributes, and `replaceChildren` (or
   PainterHost write-elision on hot paths). Prefer this over `innerHTML` and
   over large HTML template strings.
3. **Generic when reusable:** if two call sites need the same row/line/chip,
   extract one shared component module (for example a tooltip description line
   factory used by material purpose hints and any other item story lines).
4. **No new innerHTML debt:** do not add new helpers whose only job is to
   return HTML strings for `innerHTML` assignment when a createElement path is
   viable. Legacy `itemTooltip` / `attachTooltip(() => string)` may remain for
   unchanged paths; this feature should not expand that pattern for its new
   surfaces. A small generic adapter that lets `#tooltip` accept a prebuilt
   `HTMLElement` / `DocumentFragment` is in scope if it unlocks createElement
   painting without rewriting every caller.
5. **Always `esc` / never raw player text** when any string path remains.

## Review dispatch matrix

| Agent | Spawn ONLY when the diff touches | Skip when |
|---|---|---|
| `architecture-reviewer` | `src/sim/` | UI-only phase |
| `frontend-seam-reviewer` | `src/ui/`, `src/styles/` | sim-only phase |
| `cross-platform-sync` | `src/world_api/**`, wire, `server_i18n` matcher rows that affect online errors | pure content pin with no new error text path, if proven |
| `test-coverage-auditor` | new or rewritten decisive tests | n/a when phase claims coverage |
| `qa-checklist` | a phase is COMPLETE | mid-phase work |
| `privacy-security-review` | auth, secrets, server authority | this packet as planned |
| `migration-safety` / `database-performance-reviewer` | SQL / schema | this packet (no DB) |

## Locked design decisions

See `state.md` for the authoritative list. Summary:

1. **Raw fish cannot be eaten.** All `raw_*` fish and `glimmerfin_koi` become
   `kind: 'junk'` with **no** `foodHp`, matching `game_meat` / `prime_cut`.
2. **Cooked food unchanged** as the reliable sit-heal product; skill 0 cooking
   recipes remain the onboarding path.
3. **Vendor food and conjured food stay** so non-cooks can still rest.
4. **Honest materials IN:** once kind is junk and recipes consume them, raw
   fish enter `MATERIAL_ITEM_IDS` (bag Materials chip, bank deposit materials).
   This overturns the old structural exclusion that only existed because they
   were `kind: 'food'`.
5. **Refuse-use is loud, not silent.** Right-click / use on raw catch emits a
   clear localized error (sim English literal + `server_i18n` matcher).
6. **UI kind line:** honest materials read as **Material** (not Junk); fine
   grades keep **Fine Material**. Cooking catches also get a tooltip line that
   they must be cooked.
7. **No lottery.** No kebab effects on raw fish in this packet.
8. **Item ids frozen.** Do not rename ids (`raw_stonescale_carp` stays; display
   name remains Raw Slatefin Carp).

## Phase 1: Sim truth (non-edible catches + taxonomy)

### Outcome

Catching fish no longer grants free food. Using a raw catch never heals.
Raw catches are cooking reagents and honest materials for bag/bank filters.

### Scope

- Content defs for every raw catch:
  - `raw_mirror_trout`, `raw_river_perch`, `raw_marsh_pike`, `raw_bog_eel`,
    `raw_frostgill_trout`, `raw_stonescale_carp`, `glimmerfin_koi`
- `kind: 'junk'`, remove `foodHp`, keep quality and sellValue (sellValue
  re-tune is Phase 3 if needed; do not raise vendor floors here).
- Comments in `items.ts` and `material_taxonomy.ts` that still say raw fish
  are food or "out of deposit" must be rewritten to the new rule.
- `useItem` path: raw cooking catches refuse with a stable English error such
  as `That is raw. Cook it first.` (exact string pinned by test + matcher).
  Prefer a small pure content set (for example `RAW_COOKING_CATCH_IDS` next to
  the fishing tables) over a one-off id list buried in `items.ts`.
- `MATERIAL_ITEM_IDS` / `HONEST_MATERIALS` pin grows by the catch ids that are
  recipe reagents (all listed raw fish that recipes consume; koi if consumed
  by rod recipes). Re-pin exact-set equality; update the "fish out" exclusion
  arm so those ids are no longer ruled out.
- Tests that assert catch `kind === 'food'` (for example rod recipe catch
  reagents, bank/bag fixtures, material taxonomy comments) must follow the new
  kind.
- `item_instance_tooltip` prose that says fish share kind food: update.
- Do **not** change cooked outputs, recipes, or skill reqs in this phase.

### Expected modules / seams

- `src/sim/content/items.ts` (defs only)
- Small content export for the raw-catch id set (new sibling under
  `src/sim/content/` or beside fishing tables in `items.ts` if already the
  home of `FISHING_TABLES`; prefer a tiny dedicated module if `items.ts` would
  grow logic)
- `src/sim/items.ts` `useItem`: thin call into a pure helper that decides
  refuse-for-raw-catch (keep coordinator thin)
- `src/sim/material_taxonomy.ts` comments only (derivation is automatic once
  kind is junk + recipe reagent)
- `src/ui/server_i18n.ts` EXACT matcher row for the new error literal
- Tests: new focused file for raw-catch non-edible + refuse; update
  `tests/material_taxonomy.test.ts`, fishing/rod tests, any fixture that pins
  `kind: 'food'` for raw fish

### Tests to add or update

- Pin: every raw catch id has `kind === 'junk'`, no `foodHp`.
- Pin: `useItem` on each raw catch does not start eating, does not reduce HP
  gap via food, does not consume the item, emits the refuse error once.
- Pin: cooked control (for example `pan_seared_perch`) still eats and heals.
- Pin: `MATERIAL_ITEM_IDS` exact set includes the raw catches that recipes
  consume; exclusion list no longer claims them out.
- Pin: rod recipes still detect water catches (predicate must not rely only on
  `kind === 'food'`; use the raw-catch set and/or `FISHING_RARE_ID`).
- S3: new error string has a `server_i18n` matcher row.

### Validation

```bash
git fetch origin release/v0.34.0 && git merge --ff-only origin/release/v0.34.0
npx tsc --noEmit
npx vitest run tests/material_taxonomy.test.ts tests/professions_rod_recipes.test.ts \
  tests/professions_fishing.test.ts tests/localization_fixes.test.ts \
  <new raw-catch test file>
npm run ci:changed
```

### Exit criteria

- [ ] No raw catch is edible food.
- [ ] Refuse-use path works offline and has matcher coverage for online.
- [ ] Honest materials pin updated and green.
- [ ] Cooked food path untouched and still green via control assertion.
- [ ] Architecture + test-coverage reviewers clean of BLOCKING issues.

### State for Phase 2

Raw catches are junk reagents in content and sim. UI still shows them poorly
(likely "Junk", no cooking line, possible wrong procedural icon). Phase 2 owns
presentation.

### Phase 1 starter prompt

```
This is Phase 1 of Raw fish as cooking reagents: sim truth only.

Work from a dedicated worktree on branch feature/raw-fish-cooking-reagents,
based on the latest release/v0.34.0.

Goal: every raw fishing catch is a non-edible cooking reagent. Using one never
heals and never consumes the item; it refuses with a clear error. Honest
material taxonomy includes those catches. Cooked food is unchanged.

STEP 0 - PRE-FLIGHT:
- git status clean in this worktree.
- git fetch origin release/v0.34.0 && git merge --ff-only origin/release/v0.34.0
  (or create the feature branch from that tip if it does not exist yet).
- Read docs/raw-fish-cooking-reagents/state.md and progress.md and the Phase 1
  section of docs/raw-fish-cooking-reagents/implementation-plan.md.

STEP 1 - LOAD CONTEXT (targeted reads):
- docs/raw-fish-cooking-reagents/state.md (locked decisions; reuse notes for Phase 2)
- src/sim/content/items.ts: raw_* and glimmerfin_koi defs; FISHING_TABLES
- src/sim/content/recipes.ts: cooking + rod recipes that consume catches
- src/sim/content/profession_items.ts: cooked meal control (pan_seared_perch)
- src/sim/material_taxonomy.ts and tests/material_taxonomy.test.ts
- src/sim/items.ts useItem food branch and fallthrough
- src/ui/server_i18n.ts error matcher pattern for a similar short refuse
- tests/professions_rod_recipes.test.ts catch-reagent predicate
- tests/professions_fishing.test.ts only as needed for kind assumptions
- Skim only (do not implement in Phase 1): Phase 2 will paint cooking purpose
  lines with createElement components (no new innerHTML debt); export a pure
  catch-id set in Phase 1 so UI can reuse it without HTML.
Return: exact catch id list, every test that pins kind food on them, and the
cleanest place for a RAW_COOKING_CATCH_IDS (or equivalent) export.

STEP 2 - EXECUTE:
Deliverables:
1) Content: all locked catch ids -> kind 'junk', remove foodHp. Update nearby
   comments that call them food heals.
2) Export a pure id set for the raw cooking catches (module-first; tiny content
   module or co-located with fishing tables if that is already the home).
3) useItem: if the item is in that set, ctx.error with a stable English literal
   (prefer: That is raw. Cook it first.), return without removeItem or eating.
   Keep the helper pure if non-trivial; do not grow sim.ts.
4) server_i18n EXACT matcher for that literal in the same change.
5) material taxonomy: re-pin HONEST_MATERIALS / exact set so recipe-consumed
   catches are IN; remove "fish out" exclusion pins and fix comments in
   material_taxonomy.ts.
6) Fix rod/fishing tests that detect catches solely via kind === 'food'.
7) Tests (new focused file): every catch non-edible + refuse; cooked control
   still starts eating; item not consumed on refuse.

INVARIANTS: sim purity, English error + matcher, no em/en dashes or emojis,
no cooked foodHp or recipe skillReq changes, item ids frozen, explicit path
staging only.

Out of scope: UI labels, tooltips, icons, guide prose, sellValue retune,
kebab lottery, Well Fed, feasts.

STEP 3 - VALIDATION + REVIEW:
- npx tsc --noEmit
- npx vitest run tests/material_taxonomy.test.ts tests/professions_rod_recipes.test.ts
  tests/professions_fishing.test.ts tests/localization_fixes.test.ts
  <new raw-catch test file>
- npm run ci:changed
- Dispatch architecture-reviewer + test-coverage-auditor on the diff; fix BLOCKING.

STEP 4 - COMMIT (explicit paths, Conventional Commits + body), for example:
- feat(sim): make raw fishing catches non-edible cooking reagents
- test(sim): pin raw catch refuse-use and material taxonomy membership

STEP 5 - ACCEPTANCE:
- [ ] useItem on every raw catch refuses, no heal, stack unchanged
- [ ] pan_seared_perch (or equivalent) still edible
- [ ] MATERIAL_ITEM_IDS includes the catches; tests green
- [ ] localization_fixes / matcher green

STEP 6 - DOCS: update progress.md and state.md ledger.

STEP 7 - FINAL RESPONSE: status, files, commands, review verdicts, one-line
handoff for Phase 1 QA.

STOPPING RULES: stop and ask if you need a new ItemDef.kind, a DB migration,
or any cooked-food power change; those contradict the locked design.
```

---

## Phase 2: Beautiful UI and UX

### Outcome

A player who hovers or clicks a raw fish immediately understands: this is a
cooking material, not a snack. Bag, bank, and tooltip language match the sim.

### Scope

- **Kind label:** extend `itemKindLabel` so `kind === 'junk'` and
  `isMaterialItem(item)` reads as Material (`itemUi.kind.material` new key),
  while fine grades still read Fine Material. Grey non-material junk stays
  Junk. This also upgrades `game_meat` and other honest reagents (desired).
- **Tooltip body (pure model + createElement paint):**
  - Data: reuse the `MATERIAL_HINT_KEYS` idea (item id -> one shared cooking
    key, same as fine grades). Keep the table data-only; localized plain text
    resolved in the host or a pure helper that returns keys/strings, not HTML.
  - Paint: add or extend a **generic** tooltip line component that creates a
    `div.tt-desc` (or `tt-sub`) via `createElement` + `textContent`. Mount it
    into the shared tooltip without new `innerHTML` template builders for this
    feature. If `paintTooltipAt` / `attachTooltip` only accept HTML strings
    today, prefer a minimal generic adapter (string **or** node) over teaching
    every new feature to emit markup strings.
  - Do not grow `materialHintLine`'s HTML-string return for the new catches if
    a createElement path is available in the same change. Do not grow `hud.ts`
    with inline HTML. No `useFood` heal line once `foodHp` is gone.
- **Bag affordances:** `bags_view` / action resolution must not offer
  "Click to consume" for raw catches. Prefer material / neutral use copy, or
  no consume hint. Right-click that still hits `useItem` surfaces the Phase 1
  error toast via existing error pipeline.
- **Icons:** raw catch names must still render a fish-like procedural icon
  after leaving `kind: 'food'`. Extend the icon recipe path (name tokens trout /
  perch / pike / eel / carp / koi / fish, or the raw-catch id set) so icons do
  not fall through to generic junk trinkets.
- **Pet feed:** raw catches must not count as pet food (`kind === 'food'`
  already gates this; confirm and pin if a test exists).
- **Bank deposit-all:** confirm `hudChrome.bank.depositAllTooltip` still
  matches behavior after catches enter `isMaterialItem` (expected: no copy
  change; they are crafting reagents / junk).
- **i18n:** English catalog keys only; M16 non-Latin fills for wordy strings
  in the same change.
- Screenshots optional here; Phase 3 captures formal before/after if not done.

### Expected modules / seams

- `src/ui/item_kind_label.ts` + `tests/item_kind_line.test.ts`
- Purpose-key table (extend `material_hint_view` data **or** a sibling pure
  table module) + **generic createElement tooltip line component**
- Optional small generic tooltip paint adapter (node-capable) if required
- `src/ui/bags_view.ts` consume / click hint resolution (prefer pure decision
  helper + createElement if new bag chrome is added)
- `src/ui/icons.ts` fish recipe arm
- `src/ui/i18n.catalog/*` (itemUi kind + materialHint / tooltip keys)
- `src/ui/server_i18n.ts` only if Phase 1 left a gap

### Tests

- Kind label matrix: fine material, honest material (ore + raw perch), grey
  junk, food meal.
- Purpose-key / cooking-hint data: every raw catch id shares the cooking key;
  cooked meal and non-catch junk stay unhinted (or keep existing hints only).
- Generic line component: creates the expected class + textContent without
  requiring `innerHTML` (jsdom or pure factory tests).
- Bag action / hint: raw catch is not `clickConsume`.
- Icon recipe: each raw catch id maps to a fish (or water) primitive, not the
  generic junk fallback (pin whatever the compositor exposes unit-testably).
- Guard: new feature files do not introduce `innerHTML` assignments (scoped
  test or review checklist).

### Validation

```bash
git fetch origin release/v0.34.0 && git merge --ff-only origin/release/v0.34.0
npx tsc --noEmit
npx vitest run tests/item_kind_line.test.ts tests/material_hint_view.test.ts \
  tests/bag_filter.test.ts tests/bags_view.test.ts tests/localization_fixes.test.ts \
  <new component / icon tests>
npm run ci:changed
```

### Exit criteria

- [ ] Hovering raw fish never claims it restores health.
- [ ] Kind line says Material (or Fine Material only for fine grades).
- [ ] Cooking-ingredient line present and localized.
- [ ] New UI for this feature uses createElement components (no new innerHTML
      string builders for its surfaces).
- [ ] No consume affordance on raw catches.
- [ ] Icons still read as fish.
- [ ] Frontend-seam + coverage reviewers clean of BLOCKING issues.

### State for Phase 3

Player-facing UX complete in code. Guide prose and PR visuals remain.

### Phase 2 starter prompt

```
This is Phase 2 of Raw fish as cooking reagents: beautiful UI/UX.

Pre-flight: clean worktree; git fetch origin release/v0.34.0 && merge --ff-only
(or rebase feature/raw-fish-cooking-reagents onto it). Phase 1 must already be
merged into this branch (raw catches are junk reagents with refuse-use).

Read docs/raw-fish-cooking-reagents/state.md, progress.md, and Phase 2 in
implementation-plan.md.

Goal: raw fish look and behave like cooking materials in every player surface
(tooltip kind line, cooking-ingredient copy, bag affordances, icons). No sim
rule changes unless a Phase 1 gap is found (then fix it and note it).

REUSE / BUILD RULES (release + this packet):
- Data: id -> purpose key table (material_hint_view pattern; fineGrade shared key).
  Prefer pure keys/strings, not HTML templates.
- Paint: createElement components, not new innerHTML helpers. Extract a generic
  tooltip line component if this feature needs tt-desc / tt-sub rows so later
  call sites reuse it. Optional small adapter so #tooltip can take a node.
- Do not expand materialHintLine-style HTML string returns for the new work if
  a createElement path is available in the same change.
- Bank depositAllTooltip (#2715): verify after catches are isMaterialItem; reword
  only if wrong.

Deliverables:
- itemKindLabel: junk + isMaterialItem => Material; fine grades unchanged;
  grey junk unchanged. New itemUi.kind.material key.
- Cooking-ingredient purpose line for every raw catch (shared key + DOM paint).
- bags_view: raw catches are not clickConsume (pure decision; no new HTML soup).
- icons: fish-like procedural recipe for raw catch names/ids.
- Tests + i18n (M16 if wordy). No new feature-owned innerHTML builders.
- frontend-seam-reviewer + test-coverage-auditor; ci:changed; tsc; vitest.

Out of scope: guide prose, screenshots formal set, sellValue, new recipes,
rewriting the entire legacy itemTooltip HTML stack.

Update progress.md / state.md. Hand off to Phase 2 QA.
```

---

## Phase 3: Guide, economy check, screenshots, close

### Outcome

Wiki/guide text matches the new rule; vendor sell floors do not gut the
market; PR has visual proof; packet ready for final QA and merge.

### Scope

- Update cooking guide prose that implies raw fish are snacks if any still
  does (`guide.profPages.craftProse.cooking.materialsBody` and related). State
  clearly that catches are cooking ingredients; meals are what you eat.
- Light **sellValue** review: raw catches should vendor for weak copper so
  market/trade is preferred. Change only if current values are high enough to
  dump; keep monotonicity with zone tier. Pin with a small content test if you
  change numbers.
- Confirm skill 0 recipes still teach and craft (smoke test in vitest if not
  already covered).
- Capture before/after screenshots under `docs/screenshots/raw-fish-cooking-reagents/`
  (desktop at minimum): raw trout tooltip, cooked perch tooltip, bags with
  Materials chip showing fish. Use the `pr-screenshots` skill recipe.
- Optional one-line note in `docs/design/professions.md` under cooking/fishing
  if that file still claims raw fish heal (only if stale).

### Validation

```bash
git fetch origin release/v0.34.0 && git merge --ff-only origin/release/v0.34.0
npm run wiki:content   # if guide catalog / generated wiki inputs changed
npx vitest run tests/guide.test.ts tests/localization_fixes.test.ts \
  <any sellValue pin test>
npm run ci:changed
```

### Exit criteria

- [ ] Guide text accurate.
- [ ] Sell floors sane or explicitly accepted.
- [ ] Screenshots committed and paths listed in `progress.md`.
- [ ] Ready for Phase 3 QA (`npm run gate` + full checklist).

### Phase 3 starter prompt

```
This is Phase 3 of Raw fish as cooking reagents: guide, economy floor,
screenshots, packet close prep.

Pre-flight: clean worktree; pull latest origin/release/v0.34.0 into
feature/raw-fish-cooking-reagents. Phases 1 and 2 must be complete on the branch.

Read docs/raw-fish-cooking-reagents/state.md and progress.md.

Deliverables:
- Align guide.profPages.craftProse.cooking.* copy so raw catches are ingredients,
  not snacks; regenerate wiki content if required; guide tests green.
- Review raw catch sellValue vs cooked/market intent; change only if vendor
  dumping is too attractive; pin if changed.
- Screenshots via pr-screenshots skill under
  docs/screenshots/raw-fish-cooking-reagents/ (raw tooltip, cooked tooltip,
  materials chip with fish).
- Update progress.md / state.md for Phase 3 QA (gate).

Do not open a PR unless asked. Do not implement kebab lottery or Well Fed.
```

---

## Phase QA pattern (1 QA, 2 QA, 3 QA)

Each QA session:

1. Pull latest `release/v0.34.0` into the feature branch (ff or rebase).
2. Re-run that phase's validation commands plus any suites the implementer
   skipped.
3. Dispatch `qa-checklist` and the domain reviewers for the phase diff.
4. Fix BLOCKING / SHOULD-FIX that are in scope; ledger deferrals in `state.md`.
5. Phase 3 QA also runs `npm run gate` and reports PR readiness.

Do not open the PR unless the user asks. Planning does not authorize push or PR.

## Completion criteria (whole packet)

- Raw catches: non-edible, refuse-use, honest materials, Material kind label,
  cooking tooltip line, fish icons, no consume hint.
- Cooked fish and vendor/conjured food still work.
- Taxonomy and fishing tests green; i18n guards green; gate green on the
  feature branch.
- Guide and screenshots match reality.
- Deferred work (kebab lottery, Well Fed, feasts) is written only as future
  notes, not half-implemented.
