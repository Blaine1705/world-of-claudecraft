# Professions 1,000-concurrent baselines (phase 16, R36)

The professions tuning packet's load baseline: synthetic gathering and fishing
sessions at 1,000 connections against a local dev server, captured with
`scripts/load_professions.mjs` (`npm run perf:professions`). Every number here
is a SAME-MACHINE-RELATIVE measurement per R36 (recorded on the maintainer's
Mac, hardware below, with the rig sharing the box); nothing in this file is
CI-asserted. The CI-assertable half of the phase 16 budget split lives in
tests: `tests/professions_wire_budget.test.ts` (ncd/tslot bytes per player per
tick under the delta rules, both timer-wire arms, allocation stability of the
empty arms), `tests/professions_blob_growth.test.ts` (the settled worst-case
professions blob, 7,033 bytes measured, 8,192 pinned), and
`tests/professions_zone_scaling.test.ts` plus the minimap rim-cull arms in
`tests/minimap_markers.test.ts` (the zone-scaling projection).

Captured 2026-07-31 (UTC). All four scenarios joined exactly 1,000 of 1,000
bots and passed the rig's own gate (`evaluateProfessionsLoadRun`: unconditional
join enforcement, per-observer sample floors, timer-wire arm purity, and
hollow-run evidence). Artifacts, one per scenario beside this file:
`professions-load-mixed-stable.json`, `professions-load-gather-legacy.json`,
`professions-load-gather-stable.json`, `professions-load-fish-stable.json`.
Each stamps its `gitHead` and `startIso`; the code under test for the whole
set is the phase 16 tip (the mixed-stable artifact's stamp reads one commit
earlier because the final rig ramp fix was committed while that run was in
flight; the rig file content was identical).

## Capture machine

| Field | Value |
|---|---|
| CPU | Apple M4 Max |
| Cores | 16 logical / 16 physical |
| RAM | 128 GB |
| OS | macOS 26.5.2 (arm64) |
| Node | v26.5.0 |
| Postgres | throwaway `postgres:16-alpine` container on :5434 |
| Branch tip | feature/professions-tuning-packet at c6b351563a |

## The rig recipe

One scenario per invocation, FRESH server per scenario (a restart clears the
world, the rolling perf window, and every session):

```sh
docker run -d --name wocc-prof-load-pg -p 127.0.0.1:5434:5432 \
  -e POSTGRES_USER=eastbrook -e POSTGRES_PASSWORD=ci-local \
  -e POSTGRES_DB=eastbrook postgres:16-alpine

ALLOW_DEV_COMMANDS=1 PERF_TICK_LOG=1 PORT=8799 \
  DB_POOL_MAX_CLIENTS=80 WS_AUTH_TIMEOUT_MS=30000 \
  DATABASE_URL=postgres://eastbrook:ci-local@127.0.0.1:5434/eastbrook \
  npm run server

DATABASE_URL=postgres://eastbrook:ci-local@127.0.0.1:5434/eastbrook \
  SERVER_URL=http://127.0.0.1:8799 BOTS=1000 MODE=mixed STABLE=1 \
  DURATION_MS=180000 \
  JSON_OUT=docs/design/player-performance/professions-load-mixed-stable.json \
  node scripts/load_professions.mjs
```

The four scenarios vary only `MODE` (`mixed` | `gather` | `fish`) and `STABLE`
(`1` requests the stable timer wire; `0` rides the legacy per-tick arm every
`scripts/*.mjs` client rides by default).

Capture protocol, learned the hard way:

- **The two server env knobs are load-bearing, not tuning.** On defaults, the
  ramp collapses long before 1,000: the 10-client pool exhausts under the 30 s
  autosave waves once about 500 are online (handshakes then eat the pool
  connect timeout), and the 10 s auth deadline starves at the ramp tail where
  every loop callback is slow. Both defaults are unchanged in production;
  both knobs parse strictly (blank or malformed stays on the default).
- **Never abort a handshake the server is still deciding.** A client-side
  abort can orphan a zombie session that holds the character lease for
  minutes and turns the tail of the ramp unrecoverable ("character already in
  world"). The rig's join timeout sits at 30 s and its retry passes escalate
  5 s to 90 s; the join pool also TAPERS to five concurrent workers past 70
  percent joined. Recorded server follow-up: the auth-deadline rejection can
  race a completing join and leak that session.
- **Verify the fresh bind.** A dying server closes its listener before it
  finishes draining, so a quick restart can leave the new process as an
  EADDRINUSE zombie while the old one serves on. The capture wrapper aborts
  unless the new server's log is EADDRINUSE-free, a listener exists, and
  `/api/status` reports zero online.
- **The rig measures itself.** `rig.loopLagMs` in each artifact is the
  driver-loop lag; at 1,000 sockets on the shared box its p95 sits near the
  broadcast cadence (about 0.45 s), so treat client-side GAP numbers as
  same-box-relative. Byte counts are unaffected (counted per frame received).
- **Snapshot cadence sheds under saturation by design.** The server keeps sim
  ticks near 20 Hz through catch-up but broadcasts once per loop callback;
  at 1,000 professions bots the callback runs about 0.55 s, so each client
  sees roughly 2 to 3 frames a second. `fleet.rxFramesPerSecondPerBot` in the
  artifacts carries the observed rate.

## Results

Server phase times are per LOOP CALLBACK (one broadcast plus however many
catch-up sim ticks ran), from the server's own `/api/perf` 1200-tick window at
capture end. Snapshot sizes are bytes per received `snap` frame across the
parsing observers; `ncd/tslot per-snap` is that field's average byte cost per
snapshot under the delta rules (the phase 16 budget number).

### 1. mixed-stable (the flagship: 500 gather + 500 fish, stable timer wire)

| Metric | Value |
|---|---|
| Joined / alive at end | 1000 / 1000 (verdict PASS) |
| Snapshot bytes, gather observers p50 / p95 / p99 / max | 4,699 / 25,452 / 62,188 / 103,647 |
| Snapshot bytes, fish observers p50 / p95 / p99 / max | 10,247 / 24,119 / 29,442 / 39,991 |
| ncd presence ratio / bytes per snapshot (gather) | 0.077 / 38.1 B |
| tslot presence ratio (both roles) | 0 (fully elided in steady state) |
| Fleet receive rate per bot | 21,169 B/s at 3.2 frames/s |
| Server loop total p50 / p95 / max | 547.7 / 664.3 / 708.8 ms |
| Server broadcast p50 / p95 / max | 65.2 / 87.7 / 107.6 ms (bcastSelf 15.8 / 24.0 / 35.4) |
| Sim tick rate under catch-up | 15.4 Hz at 1,831 entities |

### 2. gather-legacy (1,000 gatherers, the pre-stable per-tick ncd arm)

| Metric | Value |
|---|---|
| Joined / alive at end | 1000 / 1000 (verdict PASS) |
| Snapshot bytes p50 / p95 / p99 / max | 12,214 / 29,015 / 45,358 / 59,991 |
| ncd presence ratio / bytes per snapshot | 1.0 / 493.1 B (every frame, whole map) |
| Fleet receive rate per bot | 23,793 B/s at 3.1 frames/s |
| Server loop total p50 / p95 / max | 539.0 / 678.6 / 729.3 ms |
| Server broadcast p50 / p95 / max | 58.6 / 82.7 / 123.6 ms (bcastSelf 15.6 / 27.7 / 46.7) |
| Sim tick rate under catch-up | 15.4 Hz at 1,831 entities |

### 3. gather-stable (1,000 gatherers, stable timer wire; the arm contrast)

| Metric | Value |
|---|---|
| Joined / alive at end | 1000 / 1000 (verdict PASS) |
| Snapshot bytes p50 / p95 / p99 / max | 4,486 / 20,157 / 44,243 / 65,152 |
| ncd presence ratio / bytes per snapshot | 0.073 / 35.6 B |
| Fleet receive rate per bot | 12,128 B/s at 2.8 frames/s |
| Server loop total p50 / p95 / max | 547.2 / 668.6 / 718.3 ms |
| Server broadcast p50 / p95 / max | 54.9 / 74.2 / 94.8 ms (bcastSelf 15.6 / 23.7 / 35.5) |
| Sim tick rate under catch-up | 15.5 Hz at 1,830 entities |

**The arm contrast (2 versus 3, identical workload):** the stable timer wire
cuts the median gather snapshot 2.7x (12,214 to 4,486 B) and the steady-state
ncd cost 14x (493 to 36 B per snapshot), and the fleet receive rate roughly
2x (23.8 to 12.1 KB/s per bot). This is the measured value of the negotiated
`tw:2` arm for professions traffic, and the number a rollback to the legacy
arm pays back.

### 4. fish-stable (1,000 anglers on 64 discovered shore spots)

| Metric | Value |
|---|---|
| Joined / alive at end | 1000 / 1000 (verdict PASS) |
| Snapshot bytes p50 / p95 / p99 / max | 32,533 / 43,267 / 43,705 / 140,628 |
| ncd / tslot presence | 0 / 0 (fishing populates neither) |
| Fleet receive rate per bot | 43,496 B/s at 3.3 frames/s |
| Server loop total p50 / p95 / max | 553.0 / 642.7 / 684.7 ms |
| Server broadcast p50 / p95 / max | 85.0 / 112.5 / 150.8 ms (bcastGrid 59.6 / 71.1 / 87.8) |
| Sim tick rate under catch-up | 15.6 Hz at 1,832 entities |

The fish scenario's larger snapshots are CO-LOCATION, not professions wire:
1,000 anglers over 64 spots is about 16 players per interest set, and
`bcastGrid` (the entity stream) carries the growth while `bcastSelf` stays
flat across all four scenarios. That matches the packet's standing finding
that professions self-deltas are cheap and crowding is the broadcast cost.

## What the projection takes from this

- At 1,000 active professions bots this box runs the loop callback at about
  0.55 s (2 to 3 broadcasts a second per client) while catch-up holds sim
  ticks near 15.5 Hz; the professions SELF-delta block (`bcastSelf`) is about
  16 ms p50 of that callback for a thousand sessions, and the entity stream
  plus the sim tick dominate. Professions wire is not the 1,000-concurrent
  bottleneck on either arm.
- The legacy arm's whole-map-per-tick behavior is the one professions term
  that grows with node count times online count; the stable arm's steady
  state is byte-free and the delta pins in
  `tests/professions_wire_budget.test.ts` hold it there.
