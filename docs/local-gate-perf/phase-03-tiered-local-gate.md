# Phase 3 (impl) starter: Tiered local gate + tier worker presets

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 3 of the Local Gate Performance packet: Tiered local gate + machine-tier worker presets.

GOAL: Give agents and mid/low-tier machines a fast day-loop path while keeping full gate as the merge contract. Document tier worker guidance for Windows, macOS, and Linux.

WORKTREE AND BASE (mandatory):
1. /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. Confirm Phase 2 merged or note if still open (can implement scripts either way)
4. feature/local-gate-perf

READ:
- state.md locked decisions 3 and 5 (full gate is merge bar; keep mem clamp)
- scripts/gate.mjs, scripts/lib/gate_workers.mjs, tests/gate_workers.test.ts
- docs/qa-gate.md, .githooks/pre-push
- Phase 1 baselines (what dominates wall)

DELIVERABLES:
1. A documented fast path, e.g. package script `gate:fast` or `gate:dev`, that runs a high-signal subset suitable for agents/day-to-day. Suggested ingredients (tune with profiling):
   - biome changed
   - architecture + localization_fixes guards
   - check:ts (incremental)
   - vitest related to changed files OR a small critical set
   - optional: malware gate if cheap enough
   - NOT required: full client vite build, full unsharded suite
2. Keep `npm run gate` as full merge bar (all current steps, possibly improved by Phase 2).
3. Machine-tier worker guidance:
   - low / medium / high presets (env GATE_MAX_WORKERS or a small helper)
   - Never remove free-mem clamp
   - Document in docs/local-gate-perf or CONTRIBUTING pointer
4. Cross-platform: scripts must work with win32 shell spawn pattern.
5. Tests for pure worker preset logic if you add any.
6. Update docs/qa-gate.md briefly so agents know gate:fast vs gate.

OUT OF SCOPE: changing CI shard count; weakening pre-push floor unless owner asks.

VALIDATION:
- gate:fast completes on this machine with clear output
- full gate still invocable and green if time permits (else stepped proof + note)
- gate_workers tests green
- experiment-log: day-loop time before/after
- progress + state updates

COMMIT: explicit paths only.

STOP IF: "fast" path silently becomes the only documented gate and full gate is removed from docs. Full gate must remain obvious.
```
