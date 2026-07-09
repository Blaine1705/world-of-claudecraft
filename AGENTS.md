# AGENTS.md

Any non-Claude coding agent (Codex and similar) treats this file as the entry point for World
of ClaudeCraft. **The root `CLAUDE.md` and the per-directory `CLAUDE.md` files are the canonical
source of truth.** Read the root `CLAUDE.md` in full, and the local `CLAUDE.md` when you open
files in a directory (`src/sim/`, `src/render/`, `src/ui/`, `server/`, ...). They own the
architecture, the hard invariants (sim purity and determinism, graphics fairness, i18n,
secrets), the module-first doctrine, the conventions, the commands, and the QA gate. If anything
here disagrees with `CLAUDE.md`, `CLAUDE.md` wins. This file holds ONLY the agent-runtime notes
that are not themselves repo facts.

## Startup checklist
1. Run `git status --short` before edits.
2. Preserve unrelated user work: do not revert, discard, stage, or commit changes unless asked.
3. Read the root `CLAUDE.md`, then `GEMINI.md` for any supplemental local context.
4. Use `rg` and targeted reads for discovery; read existing code and follow local patterns.

## Definition of done (do NOT skip; this is what keeps rework at zero)
A task is NOT complete until it is GREEN and WHOLE. Before you tell the operator something is done:
1. **Run the checks.** Prefer the full `npm run gate` (types + tests + builds). While iterating, at
   minimum run `npx tsc --noEmit` AND `npx vitest run <every test file that covers your change>`;
   they must ALL pass. Never leave a red test behind, and never claim done on a suite you did not run.
2. **Keep tests in lockstep with behavior.** If you change a behavior, update its test in the SAME
   change (prefer test-first: a failing test that reproduces the intent, then the code that greens
   it). A code change that reddens an existing test means either that test or your code is now wrong,
   fix the correct one; do not leave it red and do not silently weaken an assertion to hide it.
3. **Deliver the WHOLE task.** If the request lists N items/abilities, ship all N. Re-read the
   request and check every item off before finishing; do not stop at the first.
4. **Do not hand-edit generated files** (i18n resolved tables, media manifest, wiki content).
   Regenerate with the documented command and stage the result.

## Design decisions live in the repo, not in chat
Gameplay/design decisions (which ability belongs to which spec, learn levels, costs, mechanics) are
recorded under `docs/prd/` (e.g. `docs/prd/warrior-talents.md`). Before implementing a feature, READ
the matching doc and follow it verbatim. If the operator gives you a NEW decision mid-session, WRITE
it into that doc in the same change, so the next agent (Claude or otherwise) does not have to guess
or re-derive it. Never infer a design decision from memory or from World of Warcraft; if it is not
written down and not obvious, ask.

## Tool notes
- Plain Node `http` + `ws` server, no Express. Vanilla DOM UI, no Tailwind or new UI framework.
- For external library or API usage, fetch current docs via Context7 or the official docs
  rather than writing from memory.
- Keep `AGENTS.md` and `GEMINI.md` tracked: do not add either to `.gitignore`.
- Do not commit unless asked; if committing, stage only the files for your change and use
  Conventional Commits with a scope (`<type>(scope): ...`), matching `CLAUDE.md`.
