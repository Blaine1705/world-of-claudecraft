# State: local gate performance

Resume point for the next session. Keep current after every phase.

**Current phase:** Phase 1 complete.  
**Next action:** run Phase 2 starter prompt (`phase-02-gate-orchestration-dedupe.md`).  
**Worktree:** `/Users/fernando/Documents/wocc-gate-perf-research`  
**Branch:** `feature/local-gate-perf`  
**Base:** always `origin/release/v0.34.0`

---

## Locked decisions (do not re-litigate without owner)

1. **Integration base is `release/v0.34.0`**, not `main`. Every phase fetches and
   merges `origin/release/v0.34.0` before coding.
2. **All packet work happens in the dedicated worktree**
   `/Users/fernando/Documents/wocc-gate-perf-research` so other sessions stay safe.
3. **Full gate remains the merge contract.** Faster paths are additive
   (`gate:fast`, related tests, cached steps). They never replace pre-merge full gate
   without an explicit owner decision recorded here.
4. **Experiment freely; measure always.** A MISS is logged and dropped, not hidden.
5. **Worker memory clamp stays.** Do not remove `computeGateWorkers` free-mem clamp
   to chase wall time. Add tier presets and docs instead.
6. **Prefer Vitest/Vite/Node plugs first.** turbo-test / Bun / Deno are spikes only
   unless a phase proves pass rate and wall win on this suite.
7. **pnpm is desired for multi-worktree install**, but only if CI and Windows/macOS/Linux
   stay green and lockfile policy is updated deliberately (CONTRIBUTING today pins
   npm@10 lockfile semantics).
8. **No em dashes, en dashes, or emojis** in docs, commits, or code comments.
9. **No Claude-Session trailers** in commits.

## Non-negotiable invariants

1. Determinism and sim purity (`tests/architecture.test.ts`).
2. IWorld parity if any world API is touched (not expected in this packet).
3. i18n: no hand-edit of generated locale trees; English catalog only for new strings.
4. Server authority and no secrets / `ALLOW_DEV_COMMANDS` in prod paths.
5. Gate exit codes must not be masked (no `npm test | tail` patterns).
6. Cross-platform: new scripts must work on Windows (shell spawn), macOS, Linux.
7. Stage only this task's files; never `git add -A` while other WIP might exist.

## Validation matrix

| Change type | Minimum checks |
|---|---|
| Docs/packet only | Markdown hygiene (no em/en dash/emoji); optional link check |
| Measurement scripts | `npx vitest run tests/<new>.test.ts`; dry-run on a short suite |
| gate.mjs / package scripts | `node scripts/gate.mjs` or stepped timings; pin tests if any |
| Vitest config | Full `npm test` once with new config; flake watch on heavy files |
| happy-dom | All previously jsdom files green; spot UI tests |
| pnpm | Install clean on macOS + document Windows/Linux; CI job update; `npm run gate` |
| turbo/wireit | Cache hit/miss demo; gate green cold and warm |
| Suite splits | Targeted + full test; CI shard completeness pins if renames |

Always before calling a phase complete:

- Update `progress.md`, `state.md`, `baselines.md`, `experiment-log.md`
- `npx @biomejs/biome check --write` only on files you touched
- Prefer `npm run gate` after phases that touch gate/test/build orchestration

## Review-dispatch (when implementing, not for docs-only)

| Surface | Reviewer |
|---|---|
| End of contribution | `$woc-qa` / qa-checklist |
| `scripts/gate.mjs`, CI | test pins in `tests/ci_workflow.test.ts`, `tests/gate_workers.test.ts` |
| Security scan scripts | privacy-security if malware scope changes |
| No sim/server game logic expected | skip architecture/cross-platform unless touched |

## Key paths

| Path | Role |
|---|---|
| `scripts/gate.mjs` | Local full gate |
| `scripts/lib/gate_workers.mjs` | Worker CPU/mem policy |
| `scripts/gate_profile.mjs` | Phase 1 measurement CLI (timed steps + slow files) |
| `scripts/lib/gate_profile.mjs` | Pure helpers for gate_profile (tested) |
| `package.json` | scripts: test, pretest, gate, build, check:types |
| `vite.config.ts` | Vitest `test` block |
| `vitest.browser.config.ts` | Browser suite |
| `.github/workflows/ci.yml` | CI shards and checks |
| `docs/qa-gate.md` | QA contract docs |
| `CONTRIBUTING.md` | npm lockfile policy |
| `docs/local-gate-perf/*` | This packet |

## Ledger (created by this packet)

Fill as phases ship:

- (Phase 1) timing harness path: `scripts/gate_profile.mjs` + `scripts/lib/gate_profile.mjs` (tests: `tests/gate_profile.test.ts`); M1 baseline full gate 336.3s / vitest 277.5s / workers 8 at SHA 2a79ba8a0d
- (Phase 2) gate dedupe approach:
- (Phase 3) new scripts (`gate:fast`, ...):
- (Phase 4) vitest cache flags:
- (Phase 5) happy-dom adoption scope:
- (Phase 6) pool/projects kept:
- (Phase 7) package manager decision:
- (Phase 8) task cache tool:
- (Phase 9) suite splits / fixtures:
- (Phase 10) experimental runner outcome:
- (Phase 11) tier matrix doc path:
- (Phase 12) teardown:

## OPEN items

1. Whether CI stays on `npm ci` while local uses pnpm, or full migration.
2. Whether local multi-shard full gate is worth supporting on high-tier only.
3. Owner sign-off if `gate:fast` is ever allowed as pre-push instead of full gate
   (default: no; pre-push floor stays as today).
4. Cold empty-store install and second-worktree install timings (deferred to Phase 7).
5. Low/medium tier machine baselines still empty (only M1 high-tier filled).
