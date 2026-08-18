# Deed-border cartouche: state

Resume here. Do not re-litigate locked decisions; they live in
`implementation-plan.md`.

## Resume point

Packet committed on `feature/deed-border-cartouche` in worktree
`/Users/fernando/Documents/wocc-deed-border-cartouche`, based on
`origin/release/v0.39.0`. Next action: run Phase 1 from
`phase-01-chassis.md` in that worktree.

## Blocker

None.

## Next action

1. Work in `/Users/fernando/Documents/wocc-deed-border-cartouche`.
2. `pnpm install --frozen-lockfile` if `node_modules` is not present.
3. Execute Phase 1 (`phase-01-chassis.md`): cartouche core + tests first,
   then rewire `nameplate_canvas.ts`.
4. Do not start Phase 2 until Phase 1 exit criteria are met.
5. Do not start Phase 3 until Phase 2 is green.

## Locked decisions (cheat sheet)

- Four phases: chassis, QA chassis, identity, QA identity.
- Tests in the build phase, audit + screenshots + reviewers in the QA phase.
- Wrap name + title. No title: hug the name row, still padded.
- Guild, HP, cast, markers stay outside.
- Shapes only. Shared ink well. Shared brackets + clasp.
- Catalogue brass retune and motifs wait for Phase 3.
- Title centered on `screenX`. Name-row text vertically centered with badges.
- Width is `max(nameRow, title) + padX * 2`.
- Extra lift is a named value both y-walks consume.
- Identity on every graphics tier. Only bloom sheds. Core takes no tier arg.
- Geometry core in render. Palettes stay in `deed_border_view.ts`.
- No sim / server / wire / IWorld change.

## Open only if Phase 1 measurement forces it

- Exact pad px (plan target: 8-10 x, 4-5 y) after the 24px Discord
  portrait is optically centered.
- Whether `OVERLAP_THRESHOLD_Y_PX` / `STACK_OFFSET_PX` in
  `nameplate_declutter.ts` must rise with `extraLift`.

## Surfaces in play

- `src/ui/deed_border_view.ts`
- `src/render/nameplate_canvas.ts`
- `src/render/nameplate_painter.ts`
- `src/render/nameplate_declutter.ts` (constants only, if lift requires)
- `src/styles/hud.css` (Phase 3 ring)
- `src/styles/shell.css` (Phase 3 inspect)
- `src/ui/deeds_window.ts` + `src/styles/components.css` (Phase 3 picker)
- `scripts/pr_shot_targets.mjs` (`nameplate-border` and later picker/inspect)
- Tests listed in the plan

## Review dispatch (QA phases)

- `qa-checklist` every QA phase.
- `test-coverage-auditor` every QA phase (matrix ids to named tests).
- `frontend-seam-reviewer` every QA phase.
- `architecture-reviewer` / `cross-platform-sync` only if sim or IWorld
  was touched (stop and surface if that happens).
