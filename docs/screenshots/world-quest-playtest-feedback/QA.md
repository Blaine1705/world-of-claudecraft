# World quest playtest feedback

Worktree: `feature/world-quests-combat-five`, preserving its existing uncommitted feature work.

Three combat expeditions remain: Warband, Restless Company, and Hold Highwatch. Warband now uses one shared encounter for every participating player, with shared progress and individual completion credit. Restless Company moved to the flatter eastern clearing near Highwatch. Beast Hunt and Break Command were removed from content, rotation, commands, deeds, UI, wire state, and translations. Hold Highwatch keeps its phased assault and sapper defense. World quests that start through an NPC use an explicit `Start WQ` confirmation action.

## Validation

- `npm.cmd run i18n:gen`: passed; resolved locale files and the translation-key catalog are current in the worktree.
- `npm.cmd run wiki:content`: passed; generated guide content reflects the retained catalog.
- `npx.cmd vitest run tests/world_quest_combat.test.ts tests/world_quest_combat_content.test.ts tests/world_quest_combat_view.test.ts tests/world_quest_combat_wire.test.ts tests/world_quest_combat_role_view.test.ts tests/world_quest_combat_role_wire.test.ts tests/world_quest_start.test.ts tests/world_quest_start_rl.test.ts tests/world_quest_start_wire.test.ts tests/quest_dialog_controller.test.ts tests/quest_tracker_controller.test.ts tests/quest_strip_controller.test.ts tests/quest_tracker.test.ts tests/command_schema.test.ts tests/world_quest_rotation.test.ts tests/deeds_content.test.ts tests/deeds_view.test.ts tests/deed_i18n.test.ts tests/deed_icons.test.ts tests/missing_painted_icons_wave.test.ts tests/localization_coverage.test.ts --maxWorkers=3`: 20 suites passed, 423 tests passed, 4 skipped by design.
- `npx.cmd vitest run tests/parity/parity_g.test.ts --maxWorkers=1`: 74 tests passed after deliberately minting `combat_world_quest_shared.json`; the new scenario proves shared start, no duplicated enemies, owner transfer, exact leader/boss sequence, and survivor reward.
- World wire layout epoch advanced to `auth-world-34`; the authoritative TypeScript constant, Node WebSocket helper, declaration, server rejection cases, and compatibility pins agree.
- `npm.cmd run test:browser -- tests/browser/quest_strip.browser.test.ts`: 30 browser tests passed, including the visible Highwatch integrity meter at narrow widths.
- `node tmp/wq-restless-visual.mjs`: real-game Restless Company first wave loaded at `(75, 710)` with zero page errors; the capture confirms the open clearing and live quest tracker.
- Terrain tests sample the entire Restless Company field and its player route from Highwatch. The field height range stays below 25 units and all sampled path slopes remain within `PLAYER_MAX_CLIMB_SLOPE`.
- Shared Warband tests prove that a second player joins the same run without duplicate enemies, both participants receive completion credit, an eligible participant can advance the encounter if the initiator dies, and ownership transfers if the initiator leaves.
- `npx.cmd tsc --noEmit`: passed.
- `npm.cmd run security:gate`: passed, 7,846 files scanned and zero high-severity flags after repository priors.
- `npm.cmd run ci:changed`: passed, 398 files checked with repository-accepted warnings only.
- `git diff --check`: passed.
- `http://127.0.0.1:5173/`: returned HTTP 200 from the running Vite server.

## Gate limit

After staging the generated artifacts, `npm.cmd run gate` passed their freshness check and entered the full repository suite. The run was interrupted before its final summary after broad environment failures in unrelated Docker, WebGL, filesystem-link, port-3000, and timeout tests. An isolated `tests/storage_price_guard.test.ts` run points only to pre-existing literals in `cannon_tactics_view.ts` and `vehicle_session_wire.ts`, outside this diff. The focused i18n, typecheck, browser, simulation, content, parity, security, and changed-file checks above pass.
