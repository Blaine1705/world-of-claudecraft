# Phase 1 (impl) starter: Baseline harness and machine-tier protocol

Paste the fenced block below into a fresh agent session. Do not paste the surrounding prose.

### Starter Prompt

```
This is Phase 1 of the Local Gate Performance packet: Baseline harness and machine-tier protocol.

GOAL: Create a repeatable measurement harness and fill baselines.md / experiment-log.md for this machine so every later phase has numbers. Prefer tooling + docs; product behavior change is optional and must not regress the gate.

WORKTREE AND BASE (mandatory, every phase):
1. All work in: /Users/fernando/Documents/wocc-gate-perf-research
2. cd there. If you are not in that directory, STOP and switch.
3. git fetch origin release/v0.34.0
4. git merge origin/release/v0.34.0 (resolve conflicts carefully; never force-push release)
5. Stay on feature/local-gate-perf (or a phase branch off it). Do not commit on release/*.
6. git status: do not clobber unrelated WIP.

READ FIRST:
- docs/local-gate-perf/state.md (locked decisions, invariants)
- docs/local-gate-perf/research-brief.md (sections 1-3, 5)
- docs/local-gate-perf/progress.md (Phase 1 checklist)
- docs/local-gate-perf/baselines.md
- scripts/gate.mjs, scripts/lib/gate_workers.mjs
- package.json scripts: gate, test, pretest, check:types, build

DELIVERABLES:
1. A small measurement tool under scripts/ (module-first), e.g. scripts/gate_profile.mjs and any pure helper under scripts/lib/, that can:
   - Time each gate step (or equivalent stepped commands) with wall seconds
   - Print machine facts: OS, arch, availableParallelism, total/free mem, node version
   - Optionally run vitest with JSON reporter and emit top-N slowest files
   - Be Windows-safe (spawn with shell on win32 like gate.mjs)
2. Unit tests for pure helpers (parsing, ranking durations), not for full-suite timing.
3. Fill baselines.md for THIS machine (tier classification low/medium/high).
4. Append experiment-log.md baseline row.
5. Document exact commands in baselines.md "How to measure" if the harness CLI differs.
6. Do NOT change worker defaults, package manager, or vitest pool in this phase unless required for the harness itself.

MEASUREMENT NOTES:
- Full gate can take a long time. If the machine is loaded, still capture stepped times for: i18n:gen, security:gate, vitest (even if maxWorkers forced low), check:types, build:server, a shorter proxy if full client build is deferred (note deferral).
- Prefer one quiet full gate when feasible; label partials clearly.
- Capture top slow vitest files even if only a partial suite timing is possible.

VALIDATION:
- node scripts/gate_profile.mjs --help (or equivalent) works on this OS
- npx vitest run tests/<new harness tests>
- npx tsc --noEmit if TS was added
- biome check --write only on touched files
- No em dashes/en dashes/emojis in new text

DOCS + HANDOFF:
- progress.md Phase 1 complete
- state.md current phase + ledger (Phase 1 harness path)
- Commit with Conventional Commits + body (no Claude-Session trailer)
- Stage explicit paths only

STOP IF: worktree path is wrong; merge from release leaves unresolved conflicts you cannot safely fix; another session owns dirty files you did not create.
```
