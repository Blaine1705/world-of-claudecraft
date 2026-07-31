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
professions blob, 8,469 bytes measured, 9,728 pinned), and
`tests/professions_zone_scaling.test.ts` plus the minimap rim-cull arms in
`tests/minimap_markers.test.ts` (the zone-scaling projection).

Captured 2026-07-31 (UTC). All four scenarios joined exactly 1,000 of 1,000
bots with all 1,000 alive at window close, and passed the rig's own gate
(`evaluateProfessionsLoadRun`: unconditional join and liveness enforcement,
per-observer sample floors, timer-wire arm purity, and window-scoped
hollow-run evidence). Every artifact stamps `gitHead f881426ba1`, the commit
whose rig produced it, so the whole set shares one provenance. The fix-round
commits that landed AFTER the capture touch no measured server path; they
change the rig itself (transactional seeding, a helper rename, and moving
the window-open perf fetch off the measured clock), so a recapture with the
current rig reproduces the server and wire numbers but reports slightly
lower `rig.loopLagMs` figures than these artifacts carry.
Artifacts, one per scenario beside this file:
`professions-load-mixed-stable.json`, `professions-load-gather-legacy.json`,
`professions-load-gather-stable.json`, `professions-load-fish-stable.json`.

## Capture machine

| Field | Value |
|---|---|
| CPU | Apple M4 Max |
| Cores | 16 logical / 16 physical |
| RAM | 128 GB |
| OS | macOS 26.5.2 (arm64) |
| Node | v26.5.0 |
| Postgres | throwaway `postgres:16-alpine` container on 127.0.0.1:5434 |
| Branch tip | feature/professions-tuning-packet at f881426ba1 (all four artifacts stamp it) |

## The rig recipe

One scenario per invocation, FRESH server per scenario (a restart clears the
world, the rolling perf ring, and every session). The Postgres password is any
throwaway value; keep the container bound to 127.0.0.1 exactly as shown, and
substitute your value in both places:

```sh
docker run -d --name wocc-prof-load-pg -p 127.0.0.1:5434:5432 \
  -e POSTGRES_USER=eastbrook -e POSTGRES_PASSWORD=<throwaway> \
  -e POSTGRES_DB=eastbrook postgres:16-alpine

ALLOW_DEV_COMMANDS=1 PERF_TICK_LOG=1 PORT=8799 DB_POOL_MAX_CLIENTS=80 \
  DATABASE_URL=postgres://eastbrook:<throwaway>@127.0.0.1:5434/eastbrook \
  npm run server

DATABASE_URL=postgres://eastbrook:<throwaway>@127.0.0.1:5434/eastbrook \
  SERVER_URL=http://127.0.0.1:8799 BOTS=1000 MODE=mixed STABLE=1 \
  DURATION_MS=180000 \
  JSON_OUT=docs/design/player-performance/professions-load-mixed-stable.json \
  node scripts/load_professions.mjs
```

The four scenarios vary only `MODE` (`mixed` | `gather` | `fish`) and `STABLE`
(`1` requests the stable timer wire; `0` rides the legacy per-tick arm every
`scripts/*.mjs` client rides by default). The rig's own defaults carried the
rest and are stamped into each artifact: `WARMUP_MS` 45000,
`CONNECT_CONCURRENCY` 20, `OBSERVERS` 32, `TOUR_SEC` 6, `NODES_PER_BOT` 40,
`STEP_MS` 250.

Capture protocol, learned the hard way:

- **`DB_POOL_MAX_CLIENTS=80` is load-bearing, not tuning.** On the 10-client
  default the ramp collapses long before 1,000: the 30 s autosave waves
  (every session, whole blob, no dirty tracking) hold the pool while login
  handshakes wait out the pool connect timeout, surfacing to the client as
  the relabeled 'authentication timed out'. The production default is
  unchanged; the knob parses strictly (decimal digits only, ceiling at the
  stock postgres:16 connection budget of 100).
- **The WS auth deadline is NOT a lever here.** The 10 s timer clears when
  the FIRST frame arrives, before any handshake database work, so raising it
  cannot help the ramp (a knob added mid-phase on that wrong theory was
  reverted by the review round). What converges the ramp instead: the join
  pool TAPERS to five concurrent workers past 70 percent joined, the client
  never aborts a handshake the server is still deciding (30 s client timeout
  against the 10 s server deadline), and the retry passes escalate 5 s to
  90 s. A mid-handshake socket death used to orphan a permanent
  lease-holding zombie session that made a character unjoinable; that server
  defect was found and FIXED in this phase (the ws_auth readyState re-check),
  and post-fix the tail failures are clean rejections the ladder converges.
- **Verify the fresh bind, by hand, before every scenario.** A dying server
  closes its listener before it finishes draining, so a quick restart can
  leave the new process as an EADDRINUSE zombie while the old one serves on.
  After starting the server and before starting the rig, check all three:
  the new server's log contains no EADDRINUSE, something LISTENS on the port
  (`lsof -nP -iTCP:8799 -sTCP:LISTEN`), and `/api/status` reports
  `"players_online":0`. Abort the scenario if any check fails; the recipe
  has no committed wrapper that does this for you.
- **The rig measures itself.** `rig.loopLagMs` in each artifact is the
  driver-loop lag; at 1,000 sockets on the shared box its p95 ran 313 to
  508 ms across the four captures, so treat client-side GAP numbers as
  same-box-relative. Byte counts are unaffected (counted per frame received).
- **Snapshot cadence sheds under saturation by design.** The server keeps
  sim ticks near 15.5 Hz through catch-up but broadcasts once per loop
  callback; at 1,000 professions bots each client received 1.53 to 1.57
  SNAPSHOTS a second (derived from every artifact's observer counts:
  `roles.*.snapshots / observers / 180`). `fleet.rxFramesPerSecondPerBot`
  (2.9 to 3.2) counts every ws frame, snapshots plus event frames; do not
  read it as the broadcast rate.
- **The server phase table is a rolling ring, wider than the window.** The
  `/api/perf` profile keeps the last 1200 LOOP CALLBACKS, roughly 10 to 13
  minutes at the observed callback cadences, so the close scrape
  (`serverPerf`) blends the ramp and warmup with the window (the tell:
  `total.mean` sits below `total.p50` in all four artifacts, and the window
  itself contributes only about 280 of the 1200 entries). Each artifact
  also stores `serverPerfAtWindowOpen`; the ring is already full at window
  open, so the two scrapes cannot be subtracted, but comparing them bounds
  the pre-window drift. The window-scoped client evidence (mean
  inter-snapshot gap about 0.64 to 0.65 s) is the honest steady-state
  callback estimate, matching the ring's p95 rather than its p50.
- **Repeat runs accumulate rows on the throwaway database.** Pass `CLEANUP=1`
  to the rig invocation to delete the seeded accounts at teardown (the
  recipe above omits it, so each scenario leaves its fleet's rows behind);
  even with cleanup, tables referencing accounts with ON DELETE SET NULL
  (chat logs, reports, moderation trails) keep their rows. Fine for a
  disposable container; never point the rig anywhere else (the loopback
  guards refuse it).

## Results

Server phase times are per LOOP CALLBACK (one broadcast plus however many
catch-up sim ticks ran), from the ring described above at capture close.
Snapshot sizes are bytes per received `snap` frame across the parsing
observers; `ncd/tslot per-snap` is that field's average VALUE-payload byte
cost per snapshot under the delta rules (the field key and separator, about
7 bytes when present, are excluded by the measurement's re-stringify).

### 1. mixed-stable (the flagship: 500 gather + 500 fish, stable timer wire)

| Metric | Value |
|---|---|
| Joined / alive at window close | 1000 / 1000 (verdict PASS) |
| Per-client snapshot rate | 1.57/s (gather and fish observers alike) |
| Snapshot bytes, gather observers p50 / p95 / p99 / max | 4,688 / 25,056 / 61,290 / 101,043 |
| Snapshot bytes, fish observers p50 / p95 / p99 / max | 10,453 / 24,234 / 29,919 / 36,033 |
| ncd presence ratio / bytes per snapshot (gather) | 0.074 / 34.7 B |
| tslot presence ratio (both roles) | 0 (fully elided in steady state; the bots never slot an effect, so the tslot budget's non-empty arm is CI-only by design, owned by tests/professions_wire_budget.test.ts) |
| Fleet receive rate per bot | 21,594 B/s at 3.2 frames/s |
| Server loop total p50 / p95 / max | 525.4 / 646.3 / 704.6 ms |
| Server broadcast p50 / p95 / max | 63.4 / 87.5 / 111.6 ms (bcastSelf 15.3 / 24.0 / 30.2) |
| Sim tick rate under catch-up | 15.8 Hz at 1,832 entities |
| Rig loop lag p95 | 475.3 ms |

### 2. gather-legacy (1,000 gatherers, the pre-stable per-tick ncd arm)

| Metric | Value |
|---|---|
| Joined / alive at window close | 1000 / 1000 (verdict PASS) |
| Per-client snapshot rate | 1.53/s |
| Snapshot bytes p50 / p95 / p99 / max | 12,013 / 28,950 / 45,388 / 63,243 |
| ncd presence ratio / bytes per snapshot | 1.0 / 479.5 B (every frame, whole map) |
| Fleet receive rate per bot | 23,697 B/s at 3.0 frames/s |
| Server loop total p50 / p95 / max | 556.7 / 670.4 / 733.7 ms |
| Server broadcast p50 / p95 / max | 63.1 / 81.6 / 98.6 ms (bcastSelf 16.4 / 27.0 / 36.4) |
| Sim tick rate under catch-up | 15.4 Hz at 1,830 entities |
| Rig loop lag p95 | 421.4 ms |

### 3. gather-stable (1,000 gatherers, stable timer wire; the arm contrast)

| Metric | Value |
|---|---|
| Joined / alive at window close | 1000 / 1000 (verdict PASS) |
| Per-client snapshot rate | 1.56/s |
| Snapshot bytes p50 / p95 / p99 / max | 4,759 / 19,934 / 44,152 / 60,537 |
| ncd presence ratio / bytes per snapshot | 0.076 / 37.2 B |
| Fleet receive rate per bot | 12,397 B/s at 2.9 frames/s |
| Server loop total p50 / p95 / max | 538.7 / 659.8 / 720.8 ms |
| Server broadcast p50 / p95 / max | 54.2 / 72.6 / 97.9 ms (bcastSelf 15.4 / 23.8 / 35.4) |
| Sim tick rate under catch-up | 15.8 Hz at 1,831 entities |
| Rig loop lag p95 | 312.7 ms |

**The arm contrast (2 versus 3, identical workload):** the stable timer wire
cuts the median gather snapshot 2.5x (12,013 to 4,759 B), the steady-state
ncd cost 12.9x (479.5 to 37.2 B per snapshot), and the fleet receive rate
1.9x (23.7 to 12.4 KB/s per bot). This is the measured value of the
negotiated `tw:2` arm for professions traffic, and the number a rollback to
the legacy arm pays back.

### 4. fish-stable (1,000 anglers on 64 discovered shore spots)

| Metric | Value |
|---|---|
| Joined / alive at window close | 1000 / 1000 (verdict PASS) |
| Per-client snapshot rate | 1.53/s |
| Snapshot bytes p50 / p95 / p99 / max | 32,513 / 43,149 / 43,726 / 141,174 |
| ncd / tslot presence | 0 / 0 (fishing populates neither) |
| Fleet receive rate per bot | 42,386 B/s at 3.2 frames/s |
| Server loop total p50 / p95 / max | 588.4 / 658.8 / 702.2 ms |
| Server broadcast p50 / p95 / max | 90.5 / 114.0 / 129.9 ms (bcastGrid 64.0 / 73.2 / 84.9) |
| Sim tick rate under catch-up | 15.4 Hz at 1,824 entities |
| Rig loop lag p95 | 507.6 ms |

The fish scenario's larger snapshots are CO-LOCATION, not professions wire:
1,000 anglers over 64 spots is about 16 players per interest set, and
`bcastGrid` (the entity stream) carries the growth while `bcastSelf` stays
flat across all four scenarios (15.4 to 17.4 ms mean). That matches the
packet's standing finding that professions self-deltas are cheap and
crowding is the broadcast cost.

## What the projection takes from this

- At 1,000 active professions bots this box runs the loop callback at about
  0.64 s steady state (1.53 to 1.57 broadcasts a second per client) while
  catch-up holds sim ticks near 15.5 Hz; the professions SELF-delta block
  (`bcastSelf`) is about 16 ms of that callback for a thousand sessions, and
  the entity stream plus the sim tick dominate. Professions wire is not the
  1,000-concurrent bottleneck on either arm.
- The legacy arm's whole-map-per-tick behavior is the one professions term
  that grows with node count times online count; the stable arm's steady
  state is byte-free and the delta pins in
  `tests/professions_wire_budget.test.ts` hold it there.
