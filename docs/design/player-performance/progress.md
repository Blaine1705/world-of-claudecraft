# Player Performance Overhaul: Program Progress

Program source of truth: brainstorm.md (revision 2, decisions resolved 2026-07-23).
Cadence per packet: phased-packet (each phase lands with its phase-NN-qa.md before the
next begins; full gate + /qa before a packet is called done; PR off the latest release
branch).

| Packet | Scope | Plan doc | Status |
|---|---|---|---|
| 0 | Instruments (draw stats, report dimensions, net traces, honest gates, doctor nudge, baselines) | packet-0-instruments.md | PHASES COMPLETE (01-07, phase-01-qa.md through phase-07-qa.md; baselines.md + jitter-soak-baseline.json committed). PENDING: maintainer captures (live-site trace, production peak + 48 h summary; commands in baselines.md section 4) and the maintainer's go on push + PR |
| 3 | Input cadence contract (limiter redesign; ships with or before 1-2) | packet-3-input-cadence.md | PLAN AUTHORED, IN PROGRESS (2026-07-24; rulings R1 to R14 resolved; phases 01 to 06 pending; worktree /Users/fernando/Documents/wocc-input-cadence, branch feature/input-cadence, local only, based on release/v0.30.0 with packet 0 unmerged per ruling R1) |
| 1 | Crowd character cost (articulated ceiling, far-swap exemptions, governor rung, nameplate cap) | not authored | PENDING |
| 2 | Hitch elimination (player rig pooling, create deadline, compile batching, light budget, HUD thrash) | not authored | PENDING |
| 4 | Fleet pixel-fill defaults (ultra DPR/AO, governor on auto-ultra, M-series to HIGH) | not authored | PENDING |
| 5 | Graphics settings rationalization (knob coherence, governor retune, orbit bench) | not authored | PENDING |
| 6 | Server broadcast residuals (dirty epochs, invalidation matrix, catch-up policy, load soak) | not authored | PENDING |

Worktrees (one per packet, each local only, never pushed without the maintainer's go):
packet 0 at /Users/fernando/Documents/wocc-player-perf (feature/perf-instruments);
packet 3 at /Users/fernando/Documents/wocc-input-cadence (feature/input-cadence). This
progress.md copy rides the packet 3 branch while packet 0 is unmerged; on whichever
merge lands second, resolve the add/add collision by union (packet 0's rows plus the
packet 3 row) per packet-3-input-cadence.md ruling R1.

Execution order ruling (brainstorm section 7): 0 first; 3 with or before 1-2; then 4-5;
6 alongside as capacity work.
