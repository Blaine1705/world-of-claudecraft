# Discord Bot Stability Packet

Rebuild the Discord bot integration so the 2026-07-29 incident class (a sustained 429
retry storm against Discord plus internal polling that doubled the game server's HTTP
volume) is structurally impossible, and so the integration scales cleanly to 10x the
current population (design envelope: 1,000 concurrent players, 5,000 guild members).
Stability and architecture only: no new player-facing features in this packet.

Branch: `feature/discord-bot-stability` off `release/v0.33.0`.
Worktree: `/Users/fernando/Documents/wocc-discord-bot`.

## Reading order

1. [incident-2026-07-29.md](incident-2026-07-29.md): the production diagnosis this packet answers.
2. [brainstorm.md](brainstorm.md): findings from the code and Discord-contract research, the approved architecture, and OPEN items.
3. [implementation-plan.md](implementation-plan.md): canonical workflow, review dispatch matrix, phase summary.
4. [state.md](state.md): locked decisions, validation matrix, key paths. Read this first in every session.
5. [progress.md](progress.md): phase status and deliverable checklists.
6. [qa-checklist.md](qa-checklist.md): the whole-feature integration matrix for the final QA phase.

## Phases (each implementation phase is followed by its own QA session)

| Phase | File | QA file |
|---|---|---|
| 1. Bot verification foundation | [phase-01-verification-foundation.md](phase-01-verification-foundation.md) | [phase-01-qa.md](phase-01-qa.md) |
| 2. Discord rate-limit governor | [phase-02-rate-limit-governor.md](phase-02-rate-limit-governor.md) | [phase-02-qa.md](phase-02-qa.md) |
| 3. Loop scheduler + diff-before-write | [phase-03-scheduler-and-diffs.md](phase-03-scheduler-and-diffs.md) | [phase-03-qa.md](phase-03-qa.md) |
| 4. Server set-based endpoints | [phase-04-server-batch-endpoints.md](phase-04-server-batch-endpoints.md) | [phase-04-qa.md](phase-04-qa.md) |
| 5. Outbox + linked-member change feed | [phase-05-outbox-change-feed.md](phase-05-outbox-change-feed.md) | [phase-05-qa.md](phase-05-qa.md) |
| 6. Bot consumes the new surface | [phase-06-bot-new-surface.md](phase-06-bot-new-surface.md) | [phase-06-qa.md](phase-06-qa.md) |
| 7. Supervision + deploy hardening | [phase-07-supervision-deploy.md](phase-07-supervision-deploy.md) | [phase-07-qa.md](phase-07-qa.md) |
| 8. Observability | [phase-08-observability.md](phase-08-observability.md) | [phase-08-qa.md](phase-08-qa.md) |
| 9. /api/discord caching | [phase-09-api-discord-caching.md](phase-09-api-discord-caching.md) | [phase-09-qa.md](phase-09-qa.md) |

Every phase runs as a fresh Claude Code session using the starter prompt in its file.
Every QA phase runs at full rigor: ultracode (adversarial-verify workflow) plus mutation
spot checks on the new pure modules. Phase 9 QA closes the packet and offers teardown of
this directory before the PR.
