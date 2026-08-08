# Desktop Client Update: implementation plan

TOC packet. Each phase is a fresh Claude Code session running Fable 5 at xhigh effort;
the starter prompt for phase N lives in phase-NN-<slug>.md and its QA in
phase-NN-qa.md. This file carries the canonical workflow and the one Review Dispatch
Matrix; phase files reference them and never inline copies.

## Phase summary

| Phase | Title | Core deliverables |
|---|---|---|
| 1 | Electron runtime plumbing | electron 43.3.0 + electron-builder 26.15.7 via pnpm; codeCache privilege on app:// |
| 1 QA | Verify phase 1 | audit, pack smoke, pins |
| 2 | Shell startup and window polish | ready-to-show; second-instance focus; Win/Linux menu; DESKTOP_VERSION sync |
| 2 QA | Verify phase 2 | audit, pins |
| 3 | Hybrid-GPU visibility | main GPU verdict -> bridge push -> player gpu notice; discrete-inactive body |
| 3 QA | Verify phase 3 | audit, i18n guard |
| 4 | Presentation lifecycle | hidden-window render skip; display/DPI change re-resolve |
| 4 QA | Verify phase 4 | audit, no-backlog proof |
| 5 | Governor and LOW tier | recovery-ladder stall fix; LOW monotonicity retune with lowPlus gated to weak iGPU |
| 5 QA | Verify phase 5 | audit, monotonicity pins, perf evidence |
| 6 | three.js 0.185 train | freeze baseline; three 0.185.1 + postprocessing 6.39.4 + n8ao 2.0.0; migration action list |
| 6 QA | Verify phase 6 | correctness, shader smoke, perf + visual comparison vs frozen baseline |
| 7 | Desktop prefs store and window memory | first electron persistence module; bounds/display restore; GPU-force opt-out |
| 7 QA | Verify phase 7 | audit, corrupt-store cases |
| 8 | Display modes and power | display-mode option via the options doctrine; gamepad powerSaveBlocker |
| 8 QA | Verify phase 8 | audit, options pins |
| 9 | Notifications and what's new | OS notifications (update ready, party invite unfocused); what's-new link in the toast |
| 9 QA | Verify phase 9 | audit, string-contract pins |
| 10 | Discord Rich Presence | in-house IPC client; empirical gate probe; localized activity; options toggle |
| 10 QA | Verify phase 10 | audit, codec pins, absence behavior |
| 11 | Final integration QA | whole-packet qa-checklist.md matrix; full gate; perf summary; teardown offer |

Ordering rationale: shell foundation first (1-2), then the performance core the user
prioritized (3-6), then UX features (7-10), integration close (11). The governor/LOW
work (5) lands BEFORE the three train (6) so laptop wins ship even if the train needs
extra rounds, and so phase 6's baseline includes the retuned tiers.

## Canonical phase workflow (every session)

0. PRE-FLIGHT.
   - Work ONLY in /home/fernandoramirez/Documents/woc-desktop-client-update (branch
     feature/desktop-client-update). Multiple sessions share this machine: every git
     command uses `git -C` with that absolute path; verify cwd assumptions with
     `status --porcelain` before and after each commit.
   - LOCAL-ONLY: never push, never open a PR (user releases this rule at packet end).
   - Pull the base: `git -C <worktree> fetch origin release/v0.36.0 &&
     git -C <worktree> merge origin/release/v0.36.0`. If the merge is non-trivial,
     re-run the suites this phase depends on before writing new code.
   - `git status` must be clean before starting; if not, stop and ask the user.
   - Memory scan per the phase file's suggested topics.
1. LOAD CONTEXT via an Explore agent (state.md + progress.md + the phase file + the
   listed sources). The orchestrator does not read large files itself.
2. CHOOSE ORCHESTRATION deliberately (Explore recon; parallel Agent fan-out per vertical
   slice, cap ~5; ultracode Workflow only for batch-heavy phases and only when the
   running prompt carries the keyword). Request fan-out explicitly. Give agents the
   Explore summary, not raw planning docs. Every spawned reviewer gets a hard ~30-tool
   call budget and a report-first instruction; nudge idle agents to dump their report
   with no further tool calls.
3. VALIDATE per the matrix in state.md, then dispatch review agents per the Review
   Dispatch Matrix below. Prompt reviewers for COVERAGE, not filtering. Do not commit
   until no BLOCKING findings remain. Close the phase with `node scripts/gate_select.mjs`.
4. UPDATE docs (progress.md, state.md inventory) and memory. Commit with explicit paths
   only, Conventional Commits with a body, no em dashes or emojis anywhere. Never
   `git add -A`.

## Review Dispatch Matrix (single source of truth for this packet)

Match the change surface to the agent. Spawn an agent ONLY when its row matches the
diff; if no row matches, spawn none.

| Agent | Spawn ONLY when the diff touches | Skip it for |
|-------|----------------------------------|-------------|
| `privacy-security-review` | `server/`, `src/admin/`, `src/net/`, a deploy/secret file, SQL/auth/secrets, OR (packet addition) `electron/` IPC surface, preload bridge, CSP, permissions, protocol/scheme privileges, or anything that writes OS state (registry, files) | pure `src/ui` / `src/render` / `src/game` / docs / test changes |
| `migration-safety` | `server/db.ts`, `server/*_db.ts`, or persisted-state shape changes | no DDL and no persisted-state change (note: the phase 7 electron prefs store is NOT server persistence; its safety cases live in the phase spec) |
| `database-performance-reviewer` | SQL, database call sites, cadence/cardinality, pool/lock/timeout, stored-data growth | any diff that cannot change database work |
| `cross-platform-sync` | `src/world_api*`, `src/sim/` behavior/`SimEvent`, `src/net/online.ts`, `server/game.ts` wire, the sim/server i18n matchers, RL surface | pure catalog refactors with keys unchanged |
| `architecture-reviewer` | any `src/sim/` change | non-sim changes |
| `frontend-seam-reviewer` | `src/ui/`, `src/render/`, `src/game/`, `src/styles/` | no frontend surface |
| `qa-checklist` | a phase / deliverable set is COMPLETE | mid-phase work, docs/test-only |

Expected dispatch for this packet's typical phases: shell phases (1, 2, 7 electron half,
9 main half, 10 main half) trigger privacy-security-review via the packet addition row;
render phases (4, 5, 6) trigger frontend-seam-reviewer; options/UI work (3, 7, 8, 9, 10
renderer halves) triggers frontend-seam-reviewer; nothing here should touch sim, server,
or the database, so architecture-reviewer / migration-safety / database-performance-
reviewer / cross-platform-sync should stay silent, and a diff that DOES trip one of
those rows is itself a scope alarm worth surfacing.

## Code hygiene (every phase)

Module-first behind existing seams (electron pure-module pattern with .d.cts + Node
tests; pure view-cores for UI; render logic in RENDER_PURE_CORES-eligible modules).
Every new module, bridge method, setting, and behavior gets tests. Bug fixes are
test-first. Dead code removed, imports clean, no generated-file hand-edits (i18n
resolved bundles, media manifest, translation_keys.generated.ts). The i18n contract:
English-only catalog keys, wordy values carry the five non-Latin fills (M16), rendered
text always via t(), main process stays language-agnostic (pushed-strings doctrine).

## Mobile note

This packet is desktop-focused, but options rows and HUD surfaces it adds are shared:
any options/UI change must not break the touch layout, and desktop-only rows/features
must feature-detect (DESKTOP_APP or bridge presence) so web and mobile never show dead
controls. Phases 3, 8, 9, 10 name this in their acceptance criteria.

## Performance guardrails

Phases 4, 5, 6 carry perf evidence obligations (before/after via perf:baseline and the
phase-named scripts). Graphics-settings fairness: nothing in this packet may hide or
delay actionable information; tier knobs stay driven by the static preset. The hidden
window skip renders nothing only while the window is hidden, which is gameplay-neutral
by construction, but the netPipeline and sim tick must keep running (state.md locked
decision).

## Deploy

No phase in this packet deploys anything. The packet ends at a local, gate-green,
unpushed branch; the user triggers push/PR explicitly after phase 11.
