# Implementation Plan: Reliquary Perfection Packet

Phases 10 to 22, each followed by its own QA phase. Every phase is a fresh Claude Code
session running the starter prompt from its `phase-XX-*.md` file. Model: the session's
frontier default (Opus 4.8 or newer) at xhigh effort; `ultracode` where a phase says so.

## Canonical per-phase workflow (referenced by every phase file)

### Step 0: Pre-flight + release sync (EVERY phase, no exceptions)
1. Worktree: `/Users/fernando/Documents/wocc-reliquary-review`, branch
   `feature/reliquary-perfection`. Verify `git status` is clean; if dirty, ask the user
   (concurrent sessions share this machine; the maintainer's own `wocc-reliquary`
   worktree holds the local `feature/reliquary` ref and must NEVER be touched).
2. Sync the integration base:
   `git fetch origin release/v0.35.0` then
   `git merge origin/release/v0.35.0` (a merge commit with a body, e.g.
   `merge(release/v0.35.0): sync before phase NN`).
   If the merge brought release-side changes into branch-owned files, run the
   `release-merge-audit` skill before phase work. If the merged tip is red on inherited
   suites, record which failures are inherited (do not silently re-pin; Phase 12 owns
   the re-pin policy).
3. Memory scan: check MEMORY.md for entries matching the phase domain (test-pin traps
   index, shared-worktree commit care, i18n traps, release-merge falsification).

### Step 1: Load context via an Explore agent (never read planning docs in the main loop)
The Explore agent reads `state.md`, `progress.md`, the phase file, and the phase's listed
source files, and returns a focused summary. The main loop keeps conclusions only.

### Step 2: Orchestrate
Lightest tool that fits: Explore for recon, parallel Agent fan-out (max ~5) for
independent vertical slices, an ultracode Workflow for batch-heavy sweeps (Phase 12) or
adversarially-verified audits. Request fan-out explicitly. Each agent gets ONLY the
Explore summary plus its own files. `isolation: "worktree"` only when agents mutate
overlapping files in parallel.

### Step 3: Validation + review dispatch
Baseline every phase: `npx tsc --noEmit` plus `npx vitest run <affected test files>`.
Add per the state.md validation matrix: `tests/architecture.test.ts` for any sim change,
`tests/localization_fixes.test.ts` for any player-text change,
`tests/snapshots.test.ts tests/env_protocol.test.ts tests/reliquary_wire.test.ts
tests/world_api_parity.test.ts` for any wire/facet change, `npm run ci:changed` always.
Before pushing to the PR: `node scripts/gate_select.mjs` (full `npm run gate` at packet
close). Never pipe test output through `tail`.

#### Review Dispatch Matrix (the one canonical copy; phase files reference it)

| Agent | Spawn ONLY when the diff touches | Skip for |
|-------|----------------------------------|----------|
| `privacy-security-review` | `server/`, `src/admin/`, `src/net/`, deploy/secret files, SQL/auth, or public-surface data exposure | pure ui/render/game/content/docs/test |
| `migration-safety` | `server/db.ts`, `server/*_db.ts`, or a `characters.state` JSONB serialize/deserialize shape change | no DDL and no persisted-shape change |
| `database-performance-reviewer` | SQL or DB call sites, query cadence/cardinality, stored-data growth, aggregation jobs | diffs that cannot change DB work |
| `cross-platform-sync` | `src/world_api/**`, `src/sim/` behavior/SimEvent, `src/net/online.ts`, `server/game.ts` wire, the sim/server i18n matchers | pure i18n catalog refactors |
| `architecture-reviewer` | any `src/sim/` change | non-sim changes |
| `frontend-seam-reviewer` | `src/ui/`, `src/render/`, `src/game/`, `src/styles/` | no frontend surface |
| `qa-checklist` | a phase is COMPLETE (every QA phase spawns it) | mid-phase work |

Prompt every review agent for COVERAGE, not filtering ("report every issue including
low-severity and uncertain ones; ranking happens later"). Resume a truncating agent with:
"Stop reading more files. Output the full report now based on what you've already seen.
No more tool calls. Format: BLOCKING / SHOULD-FIX / NICE-TO-HAVE / VERDICT."
Do not commit until each spawned reviewer reports no BLOCKING issues.

### Step 4: Commit + docs
Conventional Commits with scope and a body (1 to 4 sentences saying what and why), no em
dashes, no en dashes, no emojis, EXPLICIT paths (never `git add -A`; diff the staged set
before committing). Update `progress.md` and `state.md` in the same logical commit set.
Biome only on touched files: `npx @biomejs/biome check --write <file>`.

### Step 5: Push to the PR (QA phases only, after PASS)
After a QA phase reports PASS (or PASS-WITH-FOLLOWUPS with the follow-ups recorded in
progress.md), update the PR:
`git push origin HEAD:feature/reliquary`
Never force-push. If rejected non-fast-forward, `git fetch origin feature/reliquary`,
merge it in, re-gate, then push. Then babysit CI on PR #2976 (AI-assist checks never
gate; CANCELLED counts as failure; comment on the PR only AFTER any AI review run
completes).

## Code hygiene (every phase)
Module-first behind existing seams (IWorld facet, SimContext, content tables, pure core
plus thin painter); new behavior gets tests in the same change; determinism tests for sim
changes; delete dead code, imports, types; never hand-edit generated files (regenerate:
`npm run wiki:content`, i18n gen, `npm run sfx:manifest`, `npm run assets:chrome`);
English-only i18n catalog keys except the M16 five-locale fills for wordy values;
sim/server stay language-agnostic with matcher rules in the same change.

## Phase summary

| Phase | Title | Size | Ultracode (impl) |
|---|---|---|---|
| 10 | Sim correctness close-out | M | no |
| 11 | Page-name localization + i18n hygiene | M | no |
| 12 | Test integrity + catalog pins + record corrections | L | YES |
| 13 | Window structure + information UX | L | no |
| 14 | Overview flagship + Illumination celebration | M | no |
| 15 | Deep links, clickable chat, tracker, guide search | M | no |
| 16 | Art: launcher icon + owned cell art | M | no |
| 17 | Obtain counts + wire/serialize perf | M | no |
| 18 | Rewards ladder | M | no |
| 19 | Borders in-world (nameplates + portraits) | L | no |
| 20 | Inspect + social surfaces | M | no |
| 21 | Catalog growth (Rift, rares, PvP, fishing, retired) | L | YES |
| 22 | Population rarity + records close-out | M | no |

EVERY QA phase runs with ultracode (adversarial-verify fan-out is the QA quality
lever; QA is read-mostly, so wide fan-out has no shared-tree write risk). The
implementation phases NOT marked YES stay on plain xhigh with their hand fan-out:
they are integration-heavy vertical slices where forcing a wide workflow fragments
coherent work and risks interleaved edits in the one shared worktree. The keyword
must appear in the runner prompt the user TYPES; the copies inside the phase files
are reminders, not the opt-in.

Dependency notes: 11 before 13 and 14 (they render new localized text through the Phase
11 channel). 19 before 20 (inspect shows the active border). 12 any time after 10 (it
pins Phase 10 behavior too). 16 after 13 (cell art slots into the reworked cells). The
rest are order-flexible but run them in sequence anyway; each phase's release sync keeps
the base fresh.
