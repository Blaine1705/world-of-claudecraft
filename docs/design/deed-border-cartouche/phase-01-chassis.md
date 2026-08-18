# Phase 1 starter: cartouche chassis

Model: grok-4.6. Reasoning: xhigh. Do not drop to a faster model or a
lower reasoning setting. Do not weaken tests, skip matrix rows, or start
Phase 3 identity work.

## Goal

Land the Book of Deeds nameplate cartouche chassis: a centered ink plaque
around name + title, shared corner brackets and top clasp, today's four
palettes, decisive unit tests for matrix rows E1-E26.

## Where to work

Worktree: `/Users/fernando/Documents/wocc-deed-border-cartouche`
Branch: `feature/deed-border-cartouche` off `origin/release/v0.39.0`

```
cd /Users/fernando/Documents/wocc-deed-border-cartouche
pnpm install --frozen-lockfile
```

Do not edit the `release/v0.39.0` checkout. Do not base on `main`.
Run `git status --short` first and preserve unrelated work.

## Read first

- Root `CLAUDE.md` (module-first, i18n, fairness, no em/en dashes or emojis).
- `src/render/CLAUDE.md` (nameplate suite, `RENDER_PURE_CORES`).
- `src/ui/CLAUDE.md` (fairness, painter rules) before any `src/ui` file.
- This packet: `implementation-plan.md`, `state.md`, `progress.md`.
- Live code: `src/render/nameplate_canvas.ts` (`drawNameRow`,
  `drawBorderAccent`, `drawBase`, `drawEmote`),
  `src/ui/deed_border_view.ts`, `tests/nameplate_canvas.test.ts`,
  `tests/deed_border_accent.test.ts`, `tests/architecture.test.ts`
  (`RENDER_PURE_CORES`), `src/render/nameplate_declutter.ts`.

## Authorized

- Add `src/render/nameplate_cartouche_core.ts` (DOM/Three/i18n-free).
- Add `tests/nameplate_cartouche_core.test.ts`.
- Register the core in `RENDER_PURE_CORES`.
- Rewire `nameplate_canvas.ts` as a thin consumer of the core.
- Update `tests/nameplate_canvas.test.ts`, `tests/deed_border_accent.test.ts`,
  and declutter constants if `extraLift` requires it.
- Extend `scripts/pr_shot_targets.mjs` `nameplate-border` `when` to include
  `render/nameplate_canvas` and `render/nameplate_cartouche_core`.
- Format only files you change (`npx @biomejs/biome check --write <file>`).
- Update `progress.md` and `state.md` when the phase exits.

## Not authorized

- Phase 3 identity: motifs, Catalogue brass retune, picker swatches,
  inspect/ring clasp.
- Phase 2 screenshot capture (QA owns that). You may leave the shot
  target `when` list ready.
- Commits unless the operator asks. No push, no PR, no issue.
- Sim, server, wire, or IWorld changes. If you think you need one, STOP.
- Growing `nameplate_canvas.ts` instead of extracting the core.
- New player-facing strings. New image assets. Animation.

## How to build it

1. Test-first on the core. Write failing tests for E1-E4, E15, E16, E21,
   E22's extraLift number, then implement `nameplateCartoucheInto(out, input)`.
   Caller-owned result record. Named exports for pad, radius, well alpha,
   extraLift. No per-call allocation.
2. Pin every remaining Phase 1 matrix row (E1-E26) with a decisive
   assertion: a wrong pad, a missing well, a title left outside, a
   24px portrait kissing the floor, or a leaked palette hex under
   forced-colors must fail. Load-bearing numbers are literals.
3. Rewire the canvas. Title is drawn inside the plaque when a slug is
   active. Borderless title path unchanged. `drawBase` and `drawEmote`
   share `extraLift`. Name-row text vertically centered with badges.
4. Replace the "adds no vertical space" pin with the shared-lift pin.
   Keep the no-sprite pin (E23).
5. Fairness: the core and the drawer take no gfx / governor /
   effects-profile argument. Extend the existing scan if the new file
   is not already on the accent path list.
6. If extraLift can make two player plates overlap, bump and pin
   declutter Y constants (E24).

DESIGN.md: gold is a fine antique edge on an ink well, never a thick
yellow bar. Clarity beats ornament. Hardware is small L-brackets and a
clasp, still shapes.

## Checks (must be green before you stop)

```
npx tsc --noEmit
npx vitest run tests/nameplate_cartouche_core.test.ts tests/nameplate_canvas.test.ts tests/nameplate_ai_tag.test.ts tests/deed_border_accent.test.ts tests/architecture.test.ts tests/monolith_budget.test.ts
npx @biomejs/biome check src/render/nameplate_cartouche_core.ts src/render/nameplate_canvas.ts tests/nameplate_cartouche_core.test.ts
```

Report the exact commands and outcomes. If a check cannot run, say so.

## Handoff

Fill `progress.md` (Phase 1 status, any matrix rows you could not pin
and why) and `state.md` (resume point = Phase 2). Do not start Phase 2
in this session unless the operator asks. The next prompt is
`phase-02-qa-chassis.md`.
