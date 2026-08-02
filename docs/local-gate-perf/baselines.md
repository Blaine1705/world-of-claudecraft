# Baselines: local gate performance

Fill during Phase 1 and update after each phase that claims a wall win.
Use wall-clock seconds unless noted. Mark unavailable cells `n/a`.

## How to measure

Prefer the Phase 1 harness:

```bash
cd /Users/fernando/Documents/wocc-gate-perf-research

# Machine facts only
node scripts/gate_profile.mjs --facts

# Full timed gate (same steps as scripts/gate.mjs) + top-20 slow vitest files
node scripts/gate_profile.mjs --vitest-slow --top 20 --json-out tmp/gate-profile.json

# Partials (label clearly in baselines notes)
node scripts/gate_profile.mjs --skip-browser --skip-builds --vitest-slow
node scripts/gate_profile.mjs --from-json tmp/gate-profile-vitest.json --top 20

# Dry-run (no spawns)
node scripts/gate_profile.mjs --dry-run --skip-browser
```

Pure helpers: `scripts/lib/gate_profile.mjs` (pinned by `tests/gate_profile.test.ts`).
CLI entry: `scripts/gate_profile.mjs`. Vitest JSON lands at `tmp/gate-profile-vitest.json`
when `--vitest-slow` is used with timed steps.

Fallback without the harness:

```bash
/usr/bin/time -p npm run gate
npx vitest run --reporter=json --outputFile=tmp/vitest-results.json
```

Record:

- date (UTC)
- OS + arch
- CPU logical count, total RAM, free RAM at start
- Node version, package manager version
- git SHA
- GATE_MAX_WORKERS if set
- workers printed by gate / gate_profile

## Machine inventory

| Alias | OS | Arch | CPUs | RAM GB | Tier | Owner/host notes |
|---|---|---|---|---|---|---|
| M1 | darwin | arm64 | 16 | 128 GiB (137 GB decimal) | high | Fernando local; free RAM at Phase 1 start ~8.8 GiB under multi-session load |
| M2 | | | | | | |
| M3 | | | | | | |

Tier guide: low (4-8 CPUs, 8-16 GB), medium (8-12 CPUs, 16-32 GB), high (12+ CPUs, 32+ GB).
Classification is implemented in `classifyMachineTier` (both dimensions must clear the high bar).

## Phase 0 / Phase 1 cold full gate (before packet code changes)

Measured with `node scripts/gate_profile.mjs --vitest-slow --top 20` on M1 after a
warm `npm ci` (harness itself is measurement-only; worker defaults unchanged).

| Machine | SHA | Workers | Full gate s | Vitest s | Browser s | Types s | Builds s | Notes |
|---|---|---|---|---|---|---|---|---|
| M1 | 2a79ba8a0d | 8 | 336.3 | 277.5 | 4.9 | 4.5 | 10.6 | 2026-08-02T14:57Z UTC; GATE_MAX_WORKERS unset; free RAM 8.8 GiB; builds = env 0.1 + server 0.2 + client 10.3; also dep-sync 0.3, ffmpeg probe 4.6, i18n 2.6, freshness 0.1, malware 4.2, biome 2.5, sfx 24.5; full suite PASS (1951 files, 24739 tests) |

### Phase 1 step breakdown (M1)

| Step | Seconds | Status |
|---|---:|---|
| dependency sync | 0.3 | ok |
| ffmpeg/ffprobe probe | 4.6 | ok |
| i18n artifacts | 2.6 | ok |
| i18n freshness | 0.1 | ok |
| malware scan | 4.2 | ok |
| biome (changed files) | 2.5 | ok |
| sfx check | 24.5 | ok |
| vitest (full suite) | 277.5 | ok |
| browser regressions | 4.9 | ok |
| typecheck | 4.5 | ok |
| env build | 0.1 | ok |
| server build | 0.2 | ok |
| client build | 10.3 | ok |
| **TOTAL** | **336.3** | |

Raw JSON: `tmp/gate-profile-phase1.json` (gitignored under `tmp/`).

## Vitest top slow files (Phase 1)

Source: vitest JSON reporter durations (`endTime - startTime` per file) on M1,
SHA 2a79ba8a0d, maxWorkers=8. Durations are per-file wall on a worker (parallel
suites can overlap; sum of file times exceeds suite wall).

| Rank | File | Duration ms | Machine | SHA |
|---|---|---:|---|---|
| 1 | tests/professions_trend_guild_letter.test.ts | 57070 | M1 | 2a79ba8a0d |
| 2 | tests/sfx_export_core.test.ts | 40206 | M1 | 2a79ba8a0d |
| 3 | tests/mail_expiry.test.ts | 35984 | M1 | 2a79ba8a0d |
| 4 | tests/sfx_studio_server_security.test.ts | 33755 | M1 | 2a79ba8a0d |
| 5 | tests/eastbrook_gameplay_integration.test.ts | 31873 | M1 | 2a79ba8a0d |
| 6 | tests/professions_trend_delivery_kind.test.ts | 24269 | M1 | 2a79ba8a0d |
| 7 | tests/tank_crit_immunity_druid_pair.test.ts | 23583 | M1 | 2a79ba8a0d |
| 8 | tests/tank_crit_immunity_warrior_pair.test.ts | 23257 | M1 | 2a79ba8a0d |
| 9 | tests/tank_crit_immunity_paladin_pair.test.ts | 23168 | M1 | 2a79ba8a0d |
| 10 | tests/stable_yard.test.ts | 18470 | M1 | 2a79ba8a0d |
| 11 | tests/mail_instance.test.ts | 18194 | M1 | 2a79ba8a0d |
| 12 | tests/corpse_harvest_sim.test.ts | 17041 | M1 | 2a79ba8a0d |
| 13 | tests/escort_quest.test.ts | 16958 | M1 | 2a79ba8a0d |
| 14 | tests/escort_ambush_convoy.test.ts | 15033 | M1 | 2a79ba8a0d |
| 15 | tests/terrain_streaming.test.ts | 14963 | M1 | 2a79ba8a0d |
| 16 | tests/parity/parity_g.test.ts | 14741 | M1 | 2a79ba8a0d |
| 17 | tests/professions_deeds_playthrough.test.ts | 14574 | M1 | 2a79ba8a0d |
| 18 | tests/frost_mage_procs.test.ts | 13798 | M1 | 2a79ba8a0d |
| 19 | tests/frostveil_pit_escape.test.ts | 12384 | M1 | 2a79ba8a0d |
| 20 | tests/grave_inferno.test.ts | 12104 | M1 | 2a79ba8a0d |

## Install / worktree cost (Phase 1 and Phase 7)

| Scenario | Manager | Time s | Machine | Notes |
|---|---|---:|---|---|
| Fresh install empty store | npm | n/a | M1 | Not measured (would require `npm cache clean --force`; deferred) |
| Fresh install warm cache | npm | 8.7 | M1 | `npm ci` on empty node_modules with warm global cache; 1037 packages |
| Second worktree install | npm | n/a | M1 | Deferred to Phase 7 comparison |
| Fresh install empty store | pnpm | n/a | | after P7 |
| Second worktree install | pnpm | n/a | | after P7 |

## After each phase (copy rows forward)

| Phase | Machine | Full gate s | Vitest s | Delta vs Phase 1 | Keep? |
|---|---|---:|---:|---|---|
| 1 (baseline) | M1 | 336.3 | 277.5 | 0 | keep (foundation) |
| 2 | M1 | 291.5 (composite) | 245.4 | -44.8 (see notes) | keep |
| 3 | | | | | |
| 4 warm related | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 cold/warm | | | | | |
| 9 | | | | | |
| 10 | | | | | |

## Target bands (aspirational, not hard CI fail)

Adjusted after Phase 1 M1 numbers (high-tier full gate already ~5.6 min when quiet).

| Path | Low tier | Medium | High |
|---|---|---|---|
| Agent day-loop (`gate:fast` / related) | under 5 min typical edit | under 3 min | under 2 min |
| Full local gate | usable overnight / CI proxy OK | under 45 min stretch goal | under 10 min stretch (M1 baseline 5.6 min; protect under load) |

Phase 1 takeaway: on a high-tier quiet-ish M1, full gate wall is already under the
old 25 min stretch. The agent pain is more likely multi-worktree free-RAM clamp,
duplicated i18n/wiki work, and day-loop needing full suite. Later phases should
still chase mid/low tiers and loaded free-mem cases, not only best-case wall.

## Phase 2 - gate orchestration dedupe (after)

**Decision:** Option C generate-once sequencing + Option B pretest env skip.

| Path | Before (one full gate) | After |
|---|---|---|
| i18n gen | 3x (gate + pretest + build) | 1x (`i18n:gen` step) |
| wiki content | 2x (pretest + build) | 1x (explicit gate step) |
| pretest under gate | always runs gens | `WOC_SKIP_PRETEST=1` no-op |
| client build | `npm run build` (gens + bundle) | `npm run build:bundle` |

Standalone `npm test` still runs full pretest. Standalone `npm run build` still runs
`i18n:gen` + `wiki:content` + `build:bundle`.

### Artifact-path microbench (M1, 2026-08-02)

| Step | Seconds |
|---|---:|
| i18n:gen | 2.45 |
| wiki:content | 0.18 |
| pretest with WOC_SKIP_PRETEST=1 | 0.02 |
| pretest full (no skip) | 2.72 |
| build:bundle | 7.20 |
| full `npm run build` (gens + bundle) | 10.02 |

Attributed gen savings per full gate: about **5 s** (skip second i18n in pretest
~2.5 s + skip third i18n/wiki in client build ~2.8 s; wiki runs once early at ~0.2 s).

### Composite full gate (M1)

Vitest suite green at 245.4 s with pretest skip logged. Non-vitest steps re-profiled
after a Phase 1 type pin fix (`collectMachineFacts` platform/arch accept functions):
all ok; client build 7.5 s via `build:bundle`. Composite total **291.5 s**
(= 245.4 vitest + 46.1 other). Vitest wall also moved ~32 s vs Phase 1 (machine
load / free-RAM variance; freemem ~6.8 GiB at end), so **do not treat the full
-44.8 s as pure Phase 2 credit**. Keep the orchestration change for correctness
and the solid ~5 s artifact win.

Raw JSON: `tmp/gate-profile-phase2.json` (vitest path; typecheck failed pre-fix),
`tmp/gate-profile-phase2-rest.json` (skip-vitest full green tail).
