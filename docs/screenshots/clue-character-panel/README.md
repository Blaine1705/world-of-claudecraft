# Clue-scroll character panel polish

Base: `feature/clue-scrolls` at `542b782cd9`. Implementation worktree:
`C:/tmp/woc-clue-character-panel`, branch `feature/clue-character-panel-polish`.
No commit, push, or modification of the original worktree.

The existing Character, Reputation, Currencies, Progression, and Professions footer
tabs and five attributes remain intact. The existing specialization card below
Defense now presents the active specialization emblem, name, and localized class.
Equipment alignment, text, stage background, footer alignment, and mobile layout
are refined without changing simulation or character-model assets.

## Visual evidence

- `before-desktop.png`: actual clue-scroll base before these changes.
- `after-desktop.png`: revised panel, 1920x1080 viewport, panel crop.
- `after-portrait.png` and `after-portrait-footer.png`: 390x844 viewport.
- `after-landscape.png` and `after-landscape-footer.png`: 844x390 viewport.
- `stress-paired-bags.png`: character and bag windows together.
- `stress-portrait.png` and `stress-landscape.png`: synthetic long-label stress.

Captured in Chromium with the real offline game, level-20 Warrior, Battlecraft
specialization. The capture session hides GPU/performance notices; mobile capture
enables touch layout and removes the rotation prompt to inspect the underlying UI.
The stress capture replaces equipment text in the DOM only, not game data.
All five tabs were clicked and their actual content and aria-labelledby checked.
Portrait and landscape have no horizontal window overflow (388/388 and 842/842).

## Verification

- PASS: `pnpm exec vitest run tests/character_progression_view.test.ts tests/char_window.test.ts tests/char_view.test.ts tests/css_corpus.test.ts tests/css_value_validity.test.ts tests/css_token_resolution.test.ts tests/css_raw_color_ratchet.test.ts tests/mobile_window_layout.test.ts tests/mobile_window_transform.test.ts --maxWorkers=2 --reporter=json --outputFile=tmp/panel-tests.json` (189 tests).
- PASS: `pnpm exec tsc --noEmit`.
- PASS: `npm run build`.
- PASS: `npm run ci:changed` (647 branch-diff files; warnings remain).
- PASS: `pnpm exec vitest run --config vitest.browser.config.ts tests/browser/a11y.browser.test.ts -t 'axe: character window'` (1 passed, 38 unrelated tests skipped).
- PASS: `git diff --check`.
- Frontend specialist reviewed the final diff and screenshots with no remaining
  blocker. Its equipment text stacking and helmet-eye anchor findings were fixed.
- Full gate rerun with `GATE_SELECT_BASE=feature/clue-scrolls` and
  `GATE_MAX_WORKERS=2`: NOT GREEN. Generation, freshness, security scan, and
  lint passed. The full suite reported a failure in `tests/delves.test.ts`,
  `rollDelveAffixes only draws implemented affixes`, after 27.4 seconds.
  The coordinator stopped that test process after this failure; the full gate
  was not completed. See `tmp/panel-gate-clue.log`.
- PASS on isolated recheck: `pnpm exec vitest run tests/delves.test.ts -t 'rollDelveAffixes only draws implemented affixes' --maxWorkers=2`
  (1 passed, 171 skipped, 11.8 seconds test time). This does not make the full
  gate green or establish the cause of the earlier failure.
- Test-coverage reviewer confirmed decisive identity, Defense adjacency, and
  footer membership assertions. Mobile geometry is manual evidence, not an
  automated regression guarantee. Its stale test-description finding was fixed.

The first full gate attempt stopped on formatting in the two edited CSS files;
both were formatted and the default branch-wide lint command then passed.
Manual forced-colors and exhaustive keyboard interaction remain unverified.

Verdict: NOT READY for merge until a complete gate passes. The scoped visual
implementation is available for review; no simulation files were changed.

## Follow-up: functional trinket and full desktop sheet

The user subsequently requested and authorized a functional single trinket slot,
not a decorative placeholder. `trinket-desktop.png` and `trinket-laptop.png` show
the updated Character sheet; `trinket-portrait.png` and `trinket-landscape.png`
show the touch layouts (with corresponding footer captures).

The bottom row is Main Hand, Off Hand, Trinket. The window is now 1060x860,
viewport-capped with a smaller desktop top inset, a wider stat rail, and compact
spacing on short desktops. Character's complete stats and Arms mastery fit at
1920x1080 and 1366x768 without vertical scrolling. Phones retain accessible
scrolling rather than hide content or reduce touch targets. Inspect shares the
new slot and wraps its bottom row on touch.

The live slot vocabulary now includes trinket as unarmored jewelry. Existing
equip/unequip, passive stats, loadouts, saves, server validation, and snapshots
carry it. The frozen launch-completion slots are unchanged. There are no new
authored items, activation effects, commands, database queries, or schema changes.
The user explicitly authorized Spanish (Abalorio) and five required non-Latin
translations, overriding the ordinary maintainer-only locale-edit rule.

Compatibility: old saves without trinkets load forward. Do not roll populated
trinket saves back to pre-trinket binaries: their slot validator can discard the
trinket instance payload on load/resave. Deploy matching builds before introducing
obtainable trinkets. The representative signer-only test fixture adds less than
200 UTF-8 bytes to the equipment serialization and stays stable across three
reloads; this is not a maximum for every legal instance payload.

Follow-up checks:

- PASS: `pnpm exec vitest run tests/equip_trinket.test.ts tests/trinket_wire.test.ts tests/equip_jewelry.test.ts tests/equip_target_slot.test.ts tests/loadout_gear.test.ts tests/item_level.test.ts tests/world_api_parity.test.ts tests/env_protocol.test.ts --maxWorkers=2` (538 tests).
- PASS: `pnpm exec vitest run tests/i18n_completeness.test.ts --maxWorkers=2` (14 tests after authorized translations).
- PASS: `pnpm exec tsc --noEmit` and `npm run ci:changed`.
- PASS: `pnpm exec vitest run --config vitest.browser.config.ts tests/browser/char_panel_layout.browser.test.ts` (5 cases: two desktop sizes, longest authored mastery at laptop size, and Character/Inspect portrait and landscape containment with all 13 slots reachable).
- Full `npm run gate`, with `GATE_SELECT_BASE=feature/clue-scrolls` and
  `GATE_MAX_WORKERS=4`, stopped at i18n freshness because the required regenerated
  catalogs are unstaged. Staging is explicitly prohibited without user permission;
  no files were staged to bypass that check. Independent remaining checks follow.
- Database-performance/persistence and cross-platform read-only reviews found no
  blocker in the sparse-slot implementation; rollback limitation recorded above.
- PASS: `npm run build`, `npm run security:gate` (zero high findings), and
  `git diff --check`.
- PASS: `pnpm exec vitest run tests/equip_trinket.test.ts --maxWorkers=1`
  (8 tests after the coverage review added a literal 0.6 accessory-budget pin
  and concrete level-20 budget outputs).
- PASS: `pnpm exec vitest run --config vitest.browser.config.ts tests/browser/a11y.browser.test.ts -t 'axe: character window'`
  (1 passed, 38 unrelated cases skipped).
- PASS: `pnpm exec vitest run tests/architecture.test.ts tests/localization_fixes.test.ts tests/char_view.test.ts tests/char_window.test.ts tests/item_slot_labels.test.ts tests/equip_drop_core.test.ts tests/css_corpus.test.ts tests/css_value_validity.test.ts tests/css_token_resolution.test.ts tests/css_raw_color_ratchet.test.ts tests/mobile_window_layout.test.ts tests/mobile_window_transform.test.ts --maxWorkers=2`
  (421 passed, 3 existing skips).

Follow-up verdict: scoped checks pass; full merge readiness remains unproven until
the authorized changes are staged and the complete gate passes. No staging,
commits, pushes, or remote writes were performed.

## Professions and cosmetics visual polish

User scope: the Professions tab of Character C and the Cosmetics dialog it opens,
on the same clue-scrolls worktree. No main crafting-window redesign or new assets.
Professions now uses two grouped card grids, 40-48px icons, readable names and
named progress bars. Cosmetics uses existing catalog artwork, shared cards/buttons,
larger typography and a solid themed background. Existing actions are preserved.

Captures: [professions before](before-professions.png),
[professions after](after-professions.png), [cosmetics before](before-cosmetics.png),
[cosmetics after](after-cosmetics.png). Portrait and landscape after captures are
included alongside these. Screenshots use the real offline level-one character;
browser fixtures separately cover populated collections and profession values.

Checks for this follow-up:

- PASS: `pnpm exec vitest run tests/char_window.test.ts tests/cosmetics_window.test.ts tests/cosmetics_view.test.ts tests/css_corpus.test.ts tests/css_value_validity.test.ts tests/css_token_resolution.test.ts tests/css_raw_color_ratchet.test.ts tests/architecture.test.ts tests/localization_fixes.test.ts --maxWorkers=1`
  (318 passed, 3 existing skips). The earlier two-worker attempt had a 20-second
  localization timeout and a teardown RPC error; this explicit manual rerun kept
  the original timeouts and assertions unchanged.
- PASS: `pnpm exec vitest run --config vitest.browser.config.ts tests/browser/character_professions_layout.browser.test.ts tests/browser/cosmetics.browser.test.ts tests/browser/char_panel_layout.browser.test.ts`
  (18 passed after final background change). Covers desktop 1920x1080/1366x768,
  mobile 390x844/844x390, preview/action reachability and progressbar semantics.
- PASS: `npm run ci:changed` (existing warnings), and direct
  `pnpm exec biome check tests/browser/character_professions_layout.browser.test.ts tests/browser/cosmetics.browser.test.ts`
  (15 non-null-assertion warnings, no errors).
- PASS: `pnpm exec tsc --noEmit`, `npm run security:gate`
  (9593 files, zero high findings after priors), and `git diff --check`.
- PASS: `npm run build` (5808 modules; backdrop-filter preservation check passed).
- `npm run gate` stops at i18n freshness on the previously authorized trinket
  catalogs, still unstaged. No staging was performed to bypass this restriction.
- Frontend and test-coverage reviewers used. Fixed the stale 56px icon pin to 96px,
  added preview geometry and progressbar assertions from the coverage review.

Verdict: NOT READY for merge because the complete gate remains blocked; scoped
visual implementation and regression checks pass. No commit, push or remote write.
