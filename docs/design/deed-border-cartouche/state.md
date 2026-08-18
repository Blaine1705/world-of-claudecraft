# Deed-border cartouche: state

Resume here. Do not re-litigate locked decisions; they live in
`implementation-plan.md`.

## Resume point

Phase 3 is complete on `feature/deed-border-cartouche` in worktree
`/Users/fernando/Documents/wocc-deed-border-cartouche`. Next action: run
Phase 4 from `phase-04-qa-identity.md` in that worktree. Do not start
Phase 4 unless the operator asks.

## Blocker

None.

## Next action

1. Work in `/Users/fernando/Documents/wocc-deed-border-cartouche`.
2. Execute Phase 4 (`phase-04-qa-identity.md`): full matrix audit,
   family screenshots, reviewers, selective gate.
3. Do not call the feature done until Phase 4 is green.

## Locked decisions (cheat sheet)

- Four phases: chassis, QA chassis, identity, QA identity.
- Tests in the build phase, audit + screenshots + reviewers in the QA phase.
- Wrap name + title. No title: hug the name row, still padded.
- Guild, HP, cast, markers stay outside.
- Shapes only. Shared ink well. Shared brackets + clasp.
- Catalogue brass retune and motifs landed in Phase 3.
- Title centered on `screenX`. Name-row text vertically centered with badges.
- Width is `max(nameRow, title) + padX * 2`.
- Extra lift is a named value both y-walks consume. It is 14.
- Identity on every graphics tier. Only bloom sheds. Core takes no tier arg.
- Geometry core in render. Palettes stay in `deed_border_view.ts`.
- No sim / server / wire / IWorld change.

## Closed in Phase 1

- Pad is 9 x and 5 y. Radius 6. Well alpha 0.4. Well fill `#14110c`.
- `OVERLAP_THRESHOLD_Y_PX` is 32 and `STACK_OFFSET_PX` is 34 (old 18/20 plus extraLift).

## Closed in Phase 2

- E1-E26 each name a decisive test. E36 is the no-IWorld pin.
- Fairness scan includes the core. `--fx-shadow` is forbidden on the TS path.
- Screenshots under `docs/screenshots/deed-border-cartouche/phase-01/`.
- `node scripts/gate_select.mjs` passed (12 steps).

## Closed in Phase 3

- Motif kinds catalogue / vault / ward / laurel. Four distinct primitive sets.
- `curators_gilt` retuned to `#c9b17a` / `#2a2214` / `#f3ebcf`.
- Inspect CSS cartouche, portrait-ring clasp, picker 3-color swatch.
- E27-E36 tests named in `progress.md`.

## Surfaces in play

- `src/ui/deed_border_view.ts`
- `src/render/nameplate_cartouche_core.ts`
- `src/render/nameplate_canvas.ts`
- `src/render/nameplate_painter.ts`
- `src/render/nameplate_declutter.ts` (Y constants include extraLift)
- `src/styles/hud.css` (Phase 3 ring)
- `src/styles/shell.css` (Phase 3 inspect)
- `src/ui/deeds_window.ts` + `src/styles/components.css` (Phase 3 picker)
- `scripts/pr_shot_targets.mjs` (`nameplate-border` when-list is ready)
- Tests listed in `progress.md`

## Review dispatch (QA phases)

- `qa-checklist` every QA phase.
- `test-coverage-auditor` every QA phase (matrix ids to named tests).
- `frontend-seam-reviewer` every QA phase.
- `architecture-reviewer` / `cross-platform-sync` only if sim or IWorld
  was touched (stop and surface if that happens).
