# Phase 7 (impl) starter: pnpm + shared store for worktrees

Paste the fenced block below into a fresh agent session.

### Starter Prompt

```
This is Phase 7 of the Local Gate Performance packet: pnpm migration for multi-worktree install speed.

GOAL: Make spinning many git worktrees cheap by using pnpm's content-addressable store (and document Windows/macOS/Linux). Only keep if CI and full gate stay green and lockfile policy is deliberate.

WORKTREE AND BASE (mandatory):
1. /Users/fernando/Documents/wocc-gate-perf-research
2. git fetch origin release/v0.34.0 && git merge origin/release/v0.34.0
3. feature/local-gate-perf

READ FIRST (policy):
- CONTRIBUTING.md lockfile section (npm@10 package-lock semantics today)
- .github/workflows/*.yml npm ci usage
- package.json engines if any
- state.md locked decision 7 and OPEN item 1

WHY:
Developers and agents create many worktrees; npm install per worktree is painful. pnpm can share a global store.

EXPERIMENTS:
1. Measure baseline: time `npm ci` or `npm install` in a fresh secondary worktree (or dry-run estimate) and record in baselines.md
2. Introduce pnpm (version pin via packageManager field if adopting)
3. Generate pnpm-lock.yaml; decide:
   - Option A: full migration (CI uses pnpm, package-lock removed or generated)
   - Option B: dual transitional period (document only if owner wants)
   Prefer a clean single source of truth if possible.
4. Document worktree workflow: corepack enable, pnpm install, shared store path
5. Update CI workflows if migration kept
6. Update CONTRIBUTING.md lockfile rules carefully (no hand-wavy "just use pnpm")
7. Windows notes: corepack, paths, script-shell if needed
8. Verify native deps: sharp, ffmpeg-static, playwright, @typescript/native optional platform packages

RISKS:
- svelte-check / nested peer issues previously managed under npm@10 lockfile
- CI cache keys hash package-lock.json today
- Agents on machines without corepack

KEEP/DROP:
- Keep only if: install second worktree is clearly faster AND npm run gate (or pnpm run gate) green AND CI config updated and green (or documented CI PR companion)
- Drop and restore npm-only if any hard break; log thoroughly

VALIDATION:
- Clean install on this OS
- pnpm run test (or npm run after install) subset + types
- Prefer full gate once
- experiment-log install times
- progress Phase 7; state ledger package manager decision

COMMIT: may be large (lockfile). Body must explain CI/install policy change.

STOP IF: dual lockfiles would diverge silently; do not ship two competing lockfiles without an explicit owner-approved dual strategy recorded in state.md.
```
