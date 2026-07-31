# Epic Games Store integration packet

Ship World of ClaudeCraft on the Epic Games Store as a third desktop distribution
channel (beside website downloads and Steam), with the same merge-safe, env-gated
shape as the existing Steam link + Book of Deeds achievement mirror.

Branch: `feature/epic-games-integration` off `release/v0.33.0`.
Worktree: `/home/fernandoramirez/Documents/woc-epic-games-integration`.

## Reading order

1. [research-brief.md](research-brief.md): web + codebase research, options, risks.
2. [implementation-plan.md](implementation-plan.md): workflow, review matrix, phase summary.
3. [state.md](state.md): locked decisions (D1+), validation matrix, key paths. Read first every session.
4. [progress.md](progress.md): phase status and deliverable checklists.
5. [qa-checklist.md](qa-checklist.md): whole-feature integration matrix at packet close.

## Phases

| Phase | File |
|---|---|
| 1. Desktop channel plumbing | [phase-01-channel-plumbing.md](phase-01-channel-plumbing.md) |
| 2. Epic packaging channel | [phase-02-packaging-channel.md](phase-02-packaging-channel.md) |
| 3. Server dark surface | [phase-03-server-dark-surface.md](phase-03-server-dark-surface.md) |
| 4. Desktop Epic shell | [phase-04-desktop-epic-shell.md](phase-04-desktop-epic-shell.md) |
| 5. Server link verification | [phase-05-server-link-verification.md](phase-05-server-link-verification.md) |
| 6. Achievement mirror | [phase-06-achievement-mirror.md](phase-06-achievement-mirror.md) |
| 7. Client UI + i18n | [phase-07-client-ui-i18n.md](phase-07-client-ui-i18n.md) |
| 8. Ops docs + BPT runbook | [phase-08-ops-docs-bpt.md](phase-08-ops-docs-bpt.md) |

Each phase file embeds a ready starter prompt. Run one phase per focused session.
Epic org / Developer Portal setup proceeds in parallel and is not a blocker for
phases 1 to 7 (D3, D26).

## Non-goals (v1)

- Login with Epic
- Linux EGS depot
- Epic friends / social overlay product surface
- In-app Epic checkout or Web Shop
- Enabling electron-updater on Epic builds
- Requiring Epic secrets for website/steam/CI default paths
