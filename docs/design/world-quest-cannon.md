# Vehicle action bar and private cannon world quest

## Status

### Commit handoff

Portable cannon dressing evidence is included under
`docs/screenshots/world-quest-cannon/`: `ground.png`, `aim-desktop.png`, and
`aim-mobile.png`. The earlier local capture paths below are historical notes.
The stale calligraphy completion-message test was updated to the existing
English reward message during the combined world-quest commit preparation;
the historical calligraphy pin failures below no longer describe that test.

### Artillery emplacement dressing

`src/sim/content/cannon_emplacement.ts` adds existing-kit closed/open crates on
the left, cannonball piles and a sack on the right, and stacked reserve crates
behind the station. Evergarden registers them through its existing decorProps
streaming/preparation path. No decorative barrel can be mistaken for a target.
The center approach and firing field remain clear.

These small props explicitly use `terrainCalm: false`: the default scenery calm
pad would otherwise reshape the terrain. Existing props retain default behavior;
the unchanged terrain parity fixture passes. Placement and access tests use the
actual terrain and collision paths. Desktop ground/aim captures are local at
`C:/tmp/woc-cannon-dressing-ground-final.png` and
`C:/tmp/woc-cannon-dressing-aim-final.png`.
The touch-emulated 960x540 cannon view is captured at
`C:/tmp/woc-cannon-dressing-mobile.png`; the field stays unobstructed. A physical
mobile GPU performance check remains outstanding.

Validation: `npx.cmd vitest run tests/cannon_emplacement.test.ts tests/vehicle_station_placement.test.ts tests/terrain_height_parity.test.ts tests/render_asset_preload.test.ts tests/architecture.test.ts`
passed. `npx.cmd tsc --noEmit`, `npm.cmd run ci:changed`, and
`npm.cmd run security:gate` passed. `npm.cmd run gate` stopped at the existing
unstaged generated-i18n freshness check; this is not full release acceptance.
Additional `npx.cmd vitest run tests/decor_prop_colliders.test.ts tests/terrain_calm_anchor_doors.test.ts tests/terrain_chunk_geometry.test.ts`
passed, preserving existing terrain geometry and collider behavior.

### Difficulty follow-up

The current tuning supersedes the tactical package's original thresholds below.
Wave one compresses its group intervals by 15%, using integer sim ticks. Wave two
pairs right-flank sappers with two left-flank armored attackers. The commander
arrives with two armored escorts and a sapper, then charges at 65% health.
The total attacker count, weapon damage/cooldowns, breach damage, and ordinary
quest rewards are unchanged. Barrel availability decreases from three to two
(opposite flanks) to one (center); gold now requires 95% integrity and 80% accuracy.

Validation command, passed including the full authoritative three-wave win,
reward protection, deterministic replay, medal boundaries, and total/per-kind
prepared visual capacity bounds:

```sh
npx.cmd vitest run tests/cannon_tactics.test.ts tests/cannon_encounter_content.test.ts tests/cannon_encounter.test.ts tests/vehicles.test.ts tests/cannon_tactics_view.test.ts tests/vehicle_action_bar_controller.test.ts tests/cannon_tactics_wire.test.ts tests/architecture.test.ts
```

`npx.cmd tsc --noEmit`, `npm.cmd run ci:changed`, and `npm.cmd run security:gate`
passed. Simulation and test-coverage reviews found no blocking issues. `npm.cmd run gate`
regenerated wiki/localization artifacts but stopped at the existing i18n freshness
check against unstaged changes. This is not full release acceptance. Human
playtesting of the new difficulty remains necessary; the deterministic winning
policy proves feasibility, not a human win-rate target.

### Tactical encounter package

Implemented locally on `feature/world-quests`, not yet a release-ready verdict:

- Three explosive barrels per wave, spaced 7.5 yards apart in the authored field.
  Shots trigger 180 damage within eight yards and can chain through all three.
- Armored attackers resist 50% damage until a cannonball breaks their armor.
  Exposed armor takes double incendiary damage, including fire patches.
- Three existing runner spawns become fast sappers with 35 breach damage.
  The total remains 91 attackers across three waves.
- The commander charges at half health: 1.8x commander speed and 1.25x troop
  speed until the commander dies. The phase triggers once.
- Wins receive bronze, silver (60 integrity and 50% accuracy), or gold
  (90 integrity and 75% accuracy). Practice after completion grants no additional
  economic reward. Medals are transient results, not persistent unlocks.
- Existing character rigs and barrel assets provide enemy silhouettes, sapper
  backpacks, broken shields, brief death falls, cannon recoil, impact bursts,
  and existing sound cues. Camera shake is opt-in and respects reduced motion.

Simulation rules live in `src/sim/minigames/cannon_tactics.ts`; presentation uses
`src/render/cannon_tactical_visuals.ts` and the vehicle HUD helper modules. The
shared vehicle action bar remains the entry point; no separate encounter HUD.

Validation: the final ten-file mechanics/wire/UI/CSS run passed all 50 tests,
including a complete authoritative win and practice reward protection. The final
architecture, monolith, HUD budget, and CSS run passed 295 tests (four skipped).
`npx.cmd tsc --noEmit`, `npm.cmd run ci:changed`, and
`npm.cmd run security:gate` passed. `npm.cmd run gate` stopped at generated i18n
freshness against unstaged changes. `npm.cmd run build:bundle` stopped at Windows
EPERM replacing `public/audio/sfx/runtime-pack.json`. Three existing calligraphy
message pins also fail outside the scoped passing suite; they were not changed.

Browser checks exercised desktop aiming and an actual touch shot detonating all
three barrels. At 960x540, the final mobile player frame ends at y=344.68, above
the action bar, and button hit testing succeeds. Evidence is local in
`C:/tmp/woc-cannon-tactics-mobile-final.png`. Physical-device performance and a
two-client runtime isolation check remain outstanding. Earlier status sections
below record prior iterations, not the current tactical/art implementation.

### Denser waves and button descriptions

The cannon now fields 27/33/31 attackers (91 total), with every movement speed
increased by 40% and unchanged individual health and weapon damage. Simultaneous
formations maintain at least one yard of separation. A conservative permanent-slow
occupancy test proves the existing 32-enemy wire and visual pools remain sufficient.
All three buttons use the shared HUD tooltip path, including focus and touch-peek
handling, and provide the same mechanic text in their accessible descriptions.
Amounts are resolved from `CANNON_ACTIONS`, not duplicated balance literals.

Verification for this adjustment: seven targeted files, 198 tests passed and four
skipped; the authoritative complete-win and single-reward test still passes.
`npm.cmd run ci:changed` passes. The full gate still stops at generated i18n
freshness against the unstaged branch, so this is not a release-ready verdict.
`npx.cmd tsc --noEmit` also passes. Targeted command:
`npx.cmd vitest run tests/cannon_encounter_content.test.ts tests/cannon_encounter.test.ts tests/vehicles.test.ts tests/vehicle_action_tooltip.test.ts tests/vehicle_action_bar_controller.test.ts tests/hud_perf_budget.test.ts tests/monolith_budget.test.ts`.
Desktop hover was verified for all three buttons, captured in
`C:/tmp/woc-cannon-tooltips-desktop.png`. The mobile browser attempt timed out
around session re-entry after viewport emulation reloaded the client; do not count
that as a mobile pass. The touch-peek consumption path has a controller unit test,
but a complete mobile pointer/long-press visual check remains outstanding.

Enemy art is unchanged. Proposed next visual pass: existing animated `mob_bandit`
for infantry/runners, `player_warrior` for shielded armor, and `npc_knight` for the
commander, through the existing `CharacterVisual` preparation and animation seams.

Implementation in progress on `feature/world-quests`. Entry and a cannonball have
been exercised through the browser; full encounter acceptance is still pending.
The deterministic prototype engine and its paired tests exist in
`src/sim/minigames/cannon_encounter.ts` and `tests/cannon_encounter.test.ts`.
Tuning and ordered wave spawns live in `src/sim/content/cannon_encounter.ts`.
The authoritative vehicle facet, owner-only snapshot, entry/exit lifecycle,
world-quest completion adapter and action-bar/ground-aim routing are now wired.
The cannon uses the existing hex_cannon asset at (442, 1034), approached from
(442, 1036). The original candidate had a hostile 5.6 yards away, and the next
candidate crossed a lake. The final 30-by-40-yard field passes one-yard water,
slope and collision probes and stays over 15 yards outside camp footprints.
One named procedural tree is excluded; terrain parity fixtures still pass.
In developer worlds, `/dev cannon` selects the rotation; `/dev tp 442 1036`
reaches the station. Neither command grants encounter completion.
Camera composition fits landscape and portrait views, restores the normal
orbit, and keeps ground clicks enabled. A bounded personal visual pool now
draws lanes, soldiers, health, projectiles and fire without shared sim actors.

Still NOT READY: full browser playthrough and visual acceptance, controller keycaps,
outcome feedback, cosmetic deed/wiki/localization completion, wire lifecycle
and two-client acceptance tests. Coordinator extractions now pass the monolith
budgets with lowered ceilings. Controller physical buttons route independently
of saved class bindings: LB/RB/X choose shots, A confirms, B cancels aim, Back
exits and Start opens the menu. Stick aim uses vehicle camera yaw, and snapping
uses private enemies only. No commit or push made.

### Latest verification (2026-09-05)

- `npx.cmd vitest run tests/vehicles.test.ts`: PASS, seven tests, including a
  complete authoritative three-wave win with living commander kill, positive
  integrity, unchanged player health and exactly one copper reward. This full-world
  case uses a documented 60-second wall timeout (about 25 seconds measured);
  its simulated completion requirement remains 120-240 seconds.
- `npm.cmd run ci:changed`: PASS (exit 0), 771 warnings remain.
- `npm.cmd run gate`: STOPPED again at generated i18n freshness against Git;
  no files staged to bypass this. Build/security/full-suite acceptance is not complete.
- `npx.cmd vitest run tests/gamepad.test.ts tests/vehicle_gamepad_core.test.ts tests/ground_aim_lifecycle_wiring.test.ts tests/vehicle_action_bar_controller.test.ts tests/css_token_resolution.test.ts tests/hud_update_drive.test.ts tests/hud_perf_budget.test.ts tests/monolith_budget.test.ts`: PASS.
- `npx.cmd vitest run tests/vehicle_gamepad.test.ts`: PASS.
- Latest focused UI/input/architecture pass: 314 passed, 4 skipped (eight files).
- Vehicle polling test: PASS, including held-button elision and no class dispatch.
- Server snapshot/session/placement/cadence pass: 269 passed (four files).
- Developer entry and shared-writer vehicle bar tests: PASS. Sixty identical
  frames produce zero writer mutations, and explicit exit restores the normal mode.
- Browser: real right-click entry, wave spawn, key-1 aim, click-to-fire cooldown,
  and authoritative exit verified. Screenshot: `C:/tmp/woc-cannon-dry-field.png`.
  This revealed player-frame overlap, patched with temporary CSS spacing; the
  spacing change still needs browser verification. The apparent missing icons
  were initial image loads; all three were visible once loaded.
- Terrain height and chunk geometry fixtures: PASS without regenerating either.

Earlier checkpoints (superseded where noted above):

- `npx.cmd tsc --noEmit`: PASS after updating the ground-aim harness's renamed field.
- `npm.cmd run ci:changed`: PASS, exit 0; existing warnings remain.
- `npx.cmd vitest run tests/ground_aim_hud.test.ts tests/ground_aim_lifecycle_wiring.test.ts tests/vehicle_camera_core.test.ts tests/vehicle_aim_core.test.ts tests/cannon_encounter_visual.test.ts tests/world_guidance.test.ts tests/vehicles.test.ts tests/vehicle_command_wire.test.ts tests/vehicle_station_placement.test.ts tests/input.test.ts tests/world_api_parity.test.ts tests/command_schema.test.ts tests/architecture.test.ts tests/snapshots.test.ts`: PASS, 935 tests.
- After formatting, reran ground-aim HUD, vehicle aim/camera/visual and architecture with the monolith guard: 164 passed, 5 monolith failures.
- `npm.cmd run gate`: STOPPED at i18n freshness (generated translations differ from the Git index). No staging performed to bypass it.
- Remaining sizes/ceilings: HUD 18917/18905, renderer 13203/13194, Sim 12268/12243, server 10660/10640, online 5913/5908. Server already exceeded its ceiling before this cannon integration.
- Read-only security review: corrected synchronous logout cleanup and `meta.leaving` eligibility. Frontend review: corrected hidden icons, cooldown CSS class and desktop button sizing. Browser acceptance is still pending.

## Accepted interaction and visual design

Reference: the vehicle action bar visible at 12:38 in
https://www.youtube.com/watch?v=R8hTGL5866Y. Use the composition, not Blizzard art.
The desktop `interfacevehicle.jpg` thumbnail is too small for visual acceptance.

- Click an accessible cannon to operate it. The character remains beside it;
  there is no seating animation or shared occupancy lock.
- Replace the visible normal action bars with reusable vehicle chrome: a wide
  iron/brass chassis, vertical integrity gauge on the left, three central action
  buttons, and a separate explicit exit control on the right.
- Preserve the player's frame, chat, minimap and quest tracker. Never rewrite
  saved hotbars, stances, keybinds or camera preferences.
- Use the existing `ActionBarPainter` family with a vehicle-specific pure view.
  Reuse key labels, cooldown overlays and accessible action descriptions.
- Press action 1, 2 or 3, place its ground reticle, then confirm with a terrain
  click. Changing action switches the reticle. Invalid placement stays red and
  spends no cooldown. Right click or Escape cancels aiming only. Outside aiming,
  Escape retains its normal menu behavior; leaving uses the explicit exit button.
- Mobile uses the same ability-then-ground interaction with adequate touch
  targets. Controller aiming uses the existing ground-aim callbacks and explicit
  vehicle slot routing, never the player's saved class abilities.
- Integrity below 25 percent is clearly warned. Actionable enemies, range and
  danger cues remain visible on every graphics preset.

## Camera

Use an approximately 70-degree downward view over the cannon, defense line and
three enemy lanes. Fit the battlefield for the current aspect ratio. Transition
in approximately 0.6 seconds, or snap when reduced motion is enabled. Restore
the captured yaw, pitch and distance on every exit path.

Do not reuse `Input.isCameraLocked` as the vehicle lock: its mouse-down early
return also suppresses picking. Camera-motion suppression must preserve aim
hover, terrain picking, touch confirmation and controller confirmation. The
renderer must retain its single camera-position writer; compose the vehicle
pivot and orbit before its existing camera projection.

## Prototype kit

The minigame has its own tuning, not class spells or classic combat formulas.
No player mana, gear, talents or ordinary auto-attack affect its damage.

| Action | Impact | Radius | Cooldown | Additional effect |
|---|---|---|---|---|
| Cannonball | 100 | 6 | 2 seconds | None |
| Grapeshot | 60 | 9 | 6 seconds | 50 percent slow for 3 seconds |
| Incendiary | 30 | 7 | 12 seconds | 20 damage per second for 5 seconds |

The prototype uses a 0.8-second flight and 0.5-second shared recovery. Damage
resolves at impact against the enemies' then-current positions. Incendiary
damage is a ground patch, not a target-following debuff. Impact resolves before
breach movement on the same tick, so a last-moment hit can save the cannon.

## Encounter and placement

Working name: North Watch Defense. Candidate area: northern Evergarden near
the existing watch post and cannonball pile at `(406, 1114)`. Candidate cannon
position `(406, 1118)` is NOT final: validate terrain, collision, nearby hostile
camps, accessibility and camera coverage before authoring the fixture. This is
not the Dawnhold wall. Do not add terrain-deforming world-object calm anchors.

- Three escalating waves, targeting a roughly three-minute first successful run.
- Three-second opening countdown and five-second gaps between waves.
- Grouped infantry first, then multiple lanes and runners, then armored enemies
  and a commander. The final wave requires the commander to be killed.
- Start at 100 integrity. Breaching enemies damage the cannon, not the player.
- At zero integrity, fail and clear the transient encounter. Retry after ten
  seconds; no character death and no partial reward.
- Successful completion awards the ordinary WQ reward once per cycle. Connect
  to the existing claim ledger, not a second reward implementation. Add the
  required cosmetic content deed and wiki/localization coverage with activation.
- Sessions, enemies, projectiles and fire patches are personal. Multiple players
  can use the same cannon independently. Cooperation is explicitly out of scope.

## Integration contract still to implement

1. Add a genuinely new `IWorldVehicles` facet and implement both worlds together.
   Keep optional runtime state on `PlayerMeta`; do not persist active sessions.
   Use a `SimContext` adapter for admission, tick lifecycle and WQ completion.
2. Validate station identity, range, life, combat restrictions, active WQ cycle
   and prior completion on entry. Cancel casts, auto-attacks, mounts, follow and
   forced movement. Gate ordinary class, item and pet actions in authority, not
   only by hiding their UI.
3. Send the owner vehicle snapshot outside the heavy snapshot cadence. Omitted
   delta means retain, explicit null means clear. Validate bounded payloads;
   never accept a client owner id, timer, damage, enemy roster or completion flag.
4. Stop immediately on explicit exit, death, displacement, teleport, cycle
   change and disconnect. Server socket-close cleanup is required: linkdead
   characters survive much longer than an active vehicle session should.
5. Compose HUD entry/exit/aim and the camera controller. Do not route vehicle
   key-down through class empower handling or cross-hotbar item fallbacks.
6. Render owner-only private actors with existing assets, prewarm all new GPU
   producers, and preserve their actionable cues on low/mobile settings.
7. Activate the WQ with the existing rotation, interaction, progress, reward,
   localization, guide and deed contracts. Append wire commands and update
   command/facet/snapshot/parity pins together.

## Acceptance

The engine test alone is not end-to-end acceptance. Require real `Sim` lifecycle
tests, malicious-command tests, offline/online parity, two-client isolation,
single-credit save/reconnect tests, and desktop/mobile/controller input tests.
Capture the real in-game bar and camera on desktop and mobile. Verify custom
normal bars and the old camera return after success, failure, exit and reconnect.
Run the contribution QA skill and canonical gate before marking this ready.
