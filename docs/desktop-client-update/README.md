# Desktop Client Update packet

One branch, one deliverable: an Electron desktop client update focused on performance
(hybrid-GPU laptops first) and AAA-feel UX across Windows, macOS, and Linux. Client
stack upgrades (Electron 43.3.0, three.js 0.185.1 on WebGL2, postprocessing 6.39.4,
n8ao 2.0.0), shell polish (code cache, ready-to-show, second-instance focus, window
memory, display modes), performance fixes (hidden-window render skip, DPI handling,
governor recovery-ladder stall, LOW-tier monotonicity), and desktop features (GPU
visibility, OS notifications, what's-new link, gamepad display-sleep blocker, in-house
Discord Rich Presence). Worktree: /home/fernandoramirez/Documents/woc-desktop-client-update,
branch feature/desktop-client-update off release/v0.36.0. LOCAL-ONLY until the user
says done.

## Index

Cross-cutting:
- [brainstorm.md](brainstorm.md): vision, verified current state, research briefs
  (three migration, governor verdicts, Discord RPC), rejected alternatives.
- [implementation-plan.md](implementation-plan.md): canonical workflow, Review Dispatch
  Matrix, phase summary table.
- [progress.md](progress.md): live status and per-phase checklists.
- [state.md](state.md): cross-phase cheat sheet; read first in every session.
- [qa-checklist.md](qa-checklist.md): whole-packet integration matrix for phase 11.

Phases (implement, then QA, in order):
- [phase-01-electron-runtime.md](phase-01-electron-runtime.md) / [phase-01-qa.md](phase-01-qa.md)
- [phase-02-shell-startup-polish.md](phase-02-shell-startup-polish.md) / [phase-02-qa.md](phase-02-qa.md)
- [phase-03-gpu-visibility.md](phase-03-gpu-visibility.md) / [phase-03-qa.md](phase-03-qa.md)
- [phase-04-presentation-lifecycle.md](phase-04-presentation-lifecycle.md) / [phase-04-qa.md](phase-04-qa.md)
- [phase-05-governor-low-tier.md](phase-05-governor-low-tier.md) / [phase-05-qa.md](phase-05-qa.md)
- [phase-06-three-upgrade.md](phase-06-three-upgrade.md) / [phase-06-qa.md](phase-06-qa.md)
- [phase-07-prefs-window-memory.md](phase-07-prefs-window-memory.md) / [phase-07-qa.md](phase-07-qa.md)
- [phase-08-display-modes-powersave.md](phase-08-display-modes-powersave.md) / [phase-08-qa.md](phase-08-qa.md)
- [phase-09-notifications-whatsnew.md](phase-09-notifications-whatsnew.md) / [phase-09-qa.md](phase-09-qa.md)
- [phase-10-discord-presence.md](phase-10-discord-presence.md) / [phase-10-qa.md](phase-10-qa.md)
- [phase-11-final-qa.md](phase-11-final-qa.md)

To run a phase: open a fresh Claude Code session, paste the starter prompt from the
phase file. The prompt is self-contained.
