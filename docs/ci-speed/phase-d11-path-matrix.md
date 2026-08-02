# D11 follow-on: path-matrix (balanced shard packs)

Owner-authorized optional follow-on after Phase 3 stop. Pure renames exhausted;
target D11 ≤ 1.20 under locked N=8 without raising N.

## Measurement (baseline, run 30712431702, N=8 green)

| Shard | Duration s | Import s | Tests s | Files |
|---|---|---|---|---|
| 1 | 260.83 | 108 | 266 | 241 |
| 2 | 291.05 | 106 | 331 | 243 |
| 3 | 277.99 | 115 | 346 | 243 |
| 4 | 263.66 | 94 | 313 | 241 |
| **5** | **359.31** | **420** | **149** | 241 |
| 6 | 204.68 | 85 | 229 | 241 |
| 7 | 206.63 | 81 | 257 | 241 |
| 8 | 292.25 | 159 | 323 | 240 |

Worst/median Duration = 359.31 / 270.83 = **1.327** (need ≤ 1.20; target worst ≤ 325).
Wall samples UNDER 8 min already (424s / 442s). Completeness sum ≈ 1939 files.

s5 is **import-bound**: top per-file test times only ~13s; cumulative import ~420s
vs peers ~80 to 160s. Contiguous sha1 slices (vitest default) cluster expensive
import graphs by chance; renames cannot close that residual.

## Design (chosen)

**Keep CI shape:** `matrix.shard: [1..8]`, `fail-fast: false`, half-core
`maxWorkers`, `npm test -- --shard=${{ matrix.shard }}/8` (never bare vitest).

**Replace vitest default sha1 contiguous packs** with a custom
`sequence.sequencer` (`scripts/ci_balanced_sequencer.mjs`) that:

1. Scores each test file with a deterministic **import-cost weight**
   (byte size + boosts for three/render/electron/server/sim/jsdom/admin/i18n
   markers and a small overlay of known long-Duration files from Phase 3).
2. Packs files with **LPT** (longest processing time first: sort by weight
   desc, assign each to the current lightest shard, ties by lower shard index
   then path).
3. Returns the pack for `config.shard.index` (1-based).

Pure partition math lives in `scripts/ci_shard_partition.mjs` (Node-tested,
no vitest import). Completeness: union of packs == full file set; packs
disjoint; every pack non-empty when `files.length >= N`.

### Why not YAML path lists

Enumerating ~240 paths per matrix cell in `ci.yml` is unmaintainable and
drifts when tests are added. LPT over the live file list keeps completeness
automatic and CI YAML essentially unchanged (comments + sequencer wire only).

### Why not more renames

Phase 3 three rounds already moved s5 monsters; residual is cumulative import
across many medium files. Renames cannot target import graph clustering.

### Expected D11 math

If import cumulative (~1168s across shards) were even, fair share ≈ 146s/shard
instead of s5's 420s. Even a partial rebalance of heavy-import markers should
pull worst Duration toward the peer band (~250 to 300s). Target:
worst ≤ median * 1.20. Wall should stay ≤ 8 min if worst drops.

### Completeness proof

- Runtime: LPT assigns every input file exactly once.
- Pin: `tests/ci_shard_partition.test.ts` proves disjoint union and stable
  LPT for fixed inputs; `tests/ci_workflow.test.ts` pins sequencer wiring and
  that `--shard=i/8` + N=8 + fail-fast false remain.
- Live CI: sum of "Test Files" across 8 shards must still match the unsharded
  suite count (update baseline when suite grows).

### Phase 5 / release invariants (must stay)

- `changes` job path filter: docs-only skip of pr-gate/pr-checks/browser-gate.
- release-gate / release-checks / release-version-gate: **unfiltered**, always full.
- pr-checks parallel to pr-gate; release-checks parallel to release-gate.
- `I18N_RELEASE_TIER` job-level on release-gate only.
- `scripts/gate.mjs` unsharded (no `--shard`).

## Out of scope

- N > 8
- fail-fast true
- bare `npx vitest` in CI
- Deleting `docs/ci-speed/` (owner teardown only)
- Deep app import-graph rewrites (D15)
