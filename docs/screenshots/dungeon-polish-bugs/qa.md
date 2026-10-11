# Dungeon polish verification — 2026-10-07

Worktree: `.worktrees/dungeon-polish-bugs`, branch `fix/dungeon-polish-bugs`.
Base: release/v0.45.0 plus PR #4352 at `ab3230e6e3d435b983a86c009cb2db74bec2f920`.
The separate baseline worktree uses that exact commit and its own patched dependencies.
The user's original checkout and unrelated edits are preserved. Nothing is staged,
committed, pushed or published.

## Behavior and visual evidence

- Rain: Sunken Bastion's retained storm meshes followed the camera after leaving
  its claim. All three shaders now reject players outside their own instance slot,
  using the existing player-position uniform. Camera orbit does not change ownership.
  [Thornpeak before](before_thornpeak_after_bastion.png) / [after](after_thornpeak_after_bastion.png),
  [Sanctum before](before_sanctum_after_bastion.png) / [after](after_sanctum_after_bastion.png).
  Rain also remains visible with the player on real entry/crown floors and the
  camera outside the slot: [entry](after_bastion_entry_camera_edge.png),
  [crown](after_bastion_crown_camera_edge.png).
- Floor splashes: the jittered lattice stays anchored to world ground and uses the
  actual instance floor heights. Wrapping occurs beyond the visible radius.
  The splash clock is held at 7.4 seconds while the camera orbits:
  [before A](before_splashes_view_a.png), [before B](before_splashes_view_b.png),
  [after A](after_splashes_view_a.png), [after B](after_splashes_view_b.png).
- Korgath bridge: the front-facing deck quads were wound downward and culled from
  above. Correct winding exposes the existing floor without changing collision,
  gate timing or material sidedness. Both captures wait for the bridge to open:
  [before](before_bridge_high.png) / [after](after_bridge_high.png).
- Following NPC: the active guide is Laverock in Drowned Temple. His unchanged
  body now uses a same-skeleton, original-source IK bank with Walk and Run, measured
  at the renderer's Idle normalization pose. Follow speed remains 3.2 yd/s and
  catch-up remains 7 yd/s. The old mixer used Walk at 3.6x for catching up; the
  corrected mixer actually plays Run at about 1.55x and Walk at about 1.73x.
  [Before](before_laverock_follow_1.png) / [after](after_laverock_follow_1.png),
  [mobile landscape](after_laverock_mobile.png).
- Korzul: the exit already exists in the base PR. The real kill spawns one portal
  on the held shore at local (-14, 138), height 4. Walking into it returns outside.
  Normal/Heroic, wrong-claim exclusion and reset cleanup are covered by tests.
  [Actual portal](after_korzul_exit_portal.png).
- Scaleguard: inspected the current custom armored draconic model in-game.
  It loads correctly; its subjective art direction still needs manager feedback.
  [Current model](current_aspecto_scaleguard.png).
- Previously requested death checkpoints are included: 11 recovery points across
  five dungeons, selected only for a ghost returning to its own live claim after
  earned boss progress. Active fights, hazards and blocked arrivals fall back to
  the entrance. No additional saved state or RNG draws.

Captures use `node scripts/dungeon_polish_shot.mjs <weather|bridge|guide|portal>`
against local offline Vite servers, with `SHOT_URL` and `SHOT_PREFIX` selecting
baseline/current. The loading cover must disappear before screenshots. Offline
502 responses and missing training-dummy/staff preload warnings also occur in the
baseline; no error names the new animation bank. GPU telemetry contains inherited
live-program events, so these captures do not establish a zero-event travel gate.

## Shared checks

Logs are in the worktree's ignored `tmp/dungeon-polish/` directory.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed separately in both worktrees; patched Three installed. |
| `npm run check:types` | Passed, including admin Svelte (0 errors, 0 warnings) and bot. |
| `npm run build:env` | Passed. |
| `npm run build:server` | Passed. |
| `npm run build:bot` | Passed. |
| `npm run build:bundle` | Passed; 1,915 hashed media assets, backdrop guard passed. |
| `npm run test:browser` | Passed: 64 files, 521 tests. |
| `npm run security:gate` | Final pass: 12,292 files, 0 unresolved high findings; `security-final.log`. |
| `npm run ci:changed` | Passed against release: 1,046 files, existing warnings. |
| `npx biome ci --vcs-enabled=false --colors=off <task text files>` | Passed: 20 files, 21 warnings, 6 infos; `biome-current.log`. |
| `node scripts/assets/compress_glb_textures.mjs public/models/creatures/temple_laverock_locomotion.glb` | Passed; no textures to compress, bytes unchanged. |
| `node scripts/build_media_manifest.mjs generate` | Passed; new bank hash prefix `43ca4a7f2eb6`. |
| `node scripts/gen_asset_catalog.mjs` | Passed; also catches up inherited missing inventory entries from the base PR. |
| `git diff --check` | Passed. |
| `npm run gate` | Stops at manifest freshness because the legitimate regenerated media entry is unstaged. No staging was authorized. Earlier i18n/wiki/SFX generation and preflight steps passed. |

The new animation bank SHA-256 is
`43ca4a7f2eb6b19279465c939e6a81cfa82a436cd655ef2cab10b438d02f001e`.
Its checked-in builder source, rest skeleton, loop closure, contact motion, speed
references and renderer clip mappings are pinned by asset tests.

The browser suite also regenerated existing screenshots under `cosmetics-window`,
`harvest-button-refresh`, and `intentional-gathering-pr1/pr2`. Those outputs are
outside this task's intended source changes and remain unstaged.

## Reviews

Simulation architecture, frontend/rendering and decisive test-coverage reviewers
inspected the actual worktree diff. The camera-versus-player ownership boundary,
Idle pose normalization, shader literal assertions and Walk/Run mapping assertions
they identified were corrected and rechecked. No remaining scoped finding was reported.

## Full-suite status

`npm test -- --maxWorkers=2 --experimental.fsModuleCache=false` was run, then
interrupted after roughly 30 minutes once it had reported 13 failures in 9 files.
It did not finish all 5,000+ test files; there is no complete-suite pass count.
The observed failures were in `delves`, `architecture`, `professions_blob_growth`,
`corpse_harvest_sim`, `ignivar_encounter`, `ci_workflow`, `varkhul_forge_encounter`,
`affliction`, and `item_art_consistency`. Several crossed their 20-second test
budget during concurrent compilation/browser work. Do not treat those as proven
baseline failures without an isolated result.

The clean-base comparison uses:
`npx vitest run tests/item_art_consistency.test.ts tests/professions_blob_growth.test.ts tests/corpse_harvest_sim.test.ts --experimental.fsModuleCache=false --maxWorkers=1`.
Final comparison and focused-suite counts follow below.

The focused final run passed **14 files, 170 tests**:

```sh
npx vitest run tests/dungeon_checkpoints.test.ts tests/drowned_temple_cantor.test.ts tests/drowned_temple_cantor_finale.test.ts tests/drowned_temple_cantor_determinism.test.ts tests/drowned_temple_cantor_model.test.ts tests/drowned_temple_cantor_locomotion_asset.test.ts tests/locomotion.test.ts tests/gravewyrm_sanctum_bridge_painter.test.ts tests/gravewyrm_sanctum_exit_portal.test.ts tests/gravewyrm_sanctum_gates_render.test.ts tests/sunken_bastion_rain_core.test.ts tests/weather.test.ts tests/weather_field_core.test.ts tests/camera_relative_floor_shaders.test.ts --experimental.fsModuleCache=false --maxWorkers=1
```

The clean baseline finished **3 files failing, 4 tests failing, 114 passing**:

- `professions_blob_growth`: stored-data fixed point is 80,474 bytes, pin is 80,334.
- `corpse_harvest_sim`: mob-template census is 289, pin is 285.
- `corpse_harvest_sim`: family-to-item sweep crosses its existing 20-second budget.
- `item_art_consistency`: historical census is 86, pin is 78.

These reproduce without any task edits. No pin or timeout was weakened.

The other nine observed failures passed when isolated after the concurrent
browser/build work finished: **7 files, 9 selected tests passing, 660 skipped**.
This is diagnostic evidence for those cases, not a pass for the complete suites:

```sh
npx vitest run tests/delves.test.ts tests/architecture.test.ts tests/corpse_harvest_sim.test.ts tests/ignivar_encounter.test.ts tests/ci_workflow.test.ts tests/varkhul_forge_encounter.test.ts tests/affliction.test.ts -t 'rollDelveAffixes only|noteRelicObtain is called|grants exactly what the single tag|starts Falling Cinders naturally|keeps Rain of Cinders on cadence|sparse-checkout on the test jobs covers|keeps exposure until the 60-second|replays Warden and Artificer|spends the full pool with Sentence' --experimental.fsModuleCache=false --maxWorkers=1
```

All reported failures from the interrupted run are therefore accounted for by
the baseline comparison or the selected diagnostic pass. Unexecuted files remain
unverified; a full successful gate is still required before merging.

The full gate is **not certified green**, and this work is not declared merge-ready.
