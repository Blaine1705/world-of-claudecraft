# The Reliquary: feature packet

Player-facing collection trophy system that pairs with the Book of Deeds.

## Worktree (mandatory for every session)

| | |
|---|---|
| **Path** | `/Users/fernando/Documents/wocc-reliquary` |
| **Branch** | `feature/reliquary` |
| **Base** | `origin/release/v0.35.0` (or the current `release/**` when it advances) |

**Do all Reliquary work in this worktree only.** Do not implement in the main
checkout (`world-of-claudecraft`) or any other session worktree. Many parallel
sessions share the monorepo; isolation is the point of this path.

At the **start of every phase and every QA pass**, from this worktree:

```bash
cd /Users/fernando/Documents/wocc-reliquary
git status --short
git fetch origin release/v0.35.0
git merge --no-edit origin/release/v0.35.0
# resolve conflicts if any, re-run phase validation, then continue
```

If the active release branch renames (e.g. `release/v0.36.0`), fetch/merge
that tip instead and update `state.md`.

| Doc | Role |
|---|---|
| [`docs/design/reliquary.md`](../../design/reliquary.md) | Design contract and authoring rules |
| [`implementation-plan.md`](./implementation-plan.md) | Architecture, locked decisions, phases, validation |
| [`progress.md`](./progress.md) | Phase checklist status |
| [`state.md`](./state.md) | Resume point, locks, validation matrix |

**Ship shape:** one feature branch in this worktree; sequential vertical phases;
single PR when the completion criteria in the implementation plan are green.
**Planning does not authorize full implementation of later phases.** Start a
phase only when the operator asks.
