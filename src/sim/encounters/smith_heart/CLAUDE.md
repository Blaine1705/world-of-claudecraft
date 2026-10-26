# src/sim/encounters/smith_heart: the Smith's Heart raid's sim

The raid's gating, its first boss and the Guardian of the Breath (`docs/design/raid/
smith_heart.md`), ticked once per claim by `tickSmithHeart` (`seal.ts`), called from
`instances/dungeons.ts` `updateInstances`: the Hammer Council first (so its fall lights the
Hammer vein the same tick), then the Breath's guardian, then the seal and the arrival, then
the portal hops.

| Module | Role |
|---|---|
| `entry.ts` | The dev-only door while `SMITH_HEART_PLAYABLE` is false. |
| `seal.ts` | The heart seal's veins, the portal bit and the arrival bit, derived every tick and carried on the seal markers' template ids; `smithHeartVeinWon` (the Hammer's vein waits on the whole council). |
| `portal.ts` | The portal hop both ways. |
| `council_ids.ts` | Leaf: the council's template, cast, aura, object and cue ids, the per-difficulty rules (`COUNCIL_DIFFICULTY`: the mythic seam), the SKETCH tuning (`COUNCIL_TUNING`), the pillar template helpers, the soak's pure split. The content, the renderer, the HUD and the tests key on it; it imports nothing. |
| `council_state.ts` | Type-only: `CouncilFightState`, ONE object shared by the three members as `Entity.smithHeartFight`. |
| `council_scope.ts` | The per-tick scope (claim, state, bodies, players on the Quarry floor, rules) and the plumbing every member module shares: the job holder (`jobHolder`: a member's own job, else its first living heir), the bars, the hashed marks, the damage rolls, the raid warnings (chat `raidWarning` with a `hudChrome.council.warn.*` key). |
| `council_pillars.ts` | The pillars: the five columns (claim objects) and the risen ones as combat walls, their integrity, the rise (nudged to a clear spot, the throw), the cracks, the fall into rubble, the wipe's restore, the fall's settle, the Wrath's cover test (`pillarBetween`), the heroic pulse. |
| `council_wrath.ts` | The Guardian's job: the energy (the holder's resource), Mountain's Wrath and the shielding pillars, Hammer's Weight. |
| `council_stone.ts` | The Slabwright's job: Wake the Stone (its marks; an heir's locked rise spots), the Falling Rock and its split. |
| `council_song.ts` | The Seam Singer's job: Seam Bolt, the Song of the Seam (a kick leaves one mark), Resonance's cracking. |
| `council_soul.ts` | Mythic only (the prototype behind `/dev heart council mythic`): Soul in the Stone. A fallen member's soul takes the most intact pillar (`soulHost`, `takeSoul`); its pips (`strikeSoulPip`: only the rock and Resonance), its burst, the last kill's crumble; the Guardian's Echo of Wrath (`landEcho`), the Slabwright's Walking Slab (`largestGroup`, the moving wall), the Singer's Endless Song; the `soul` and `soulpip` dev verbs. |
| `council_voice.ts` | What the three members SAY: boss yells carrying their catalog key (`hudChrome.council.say.<role>_<moment>`, `COUNCIL_LINES` the same English): the pull's three lines a breath apart, each member's own job lines (never an heir's, at most once in `SAY_EVERY`), a fall's line (its soul's on mythic) and a survivor's "the stone remembers", the last fall's defeat, a wipe. Voices are auditions only (`scripts/voices/raid_boss_voice_prompts.mjs` `HAMMER_COUNCIL_VOICE_PROMPTS`). |
| `breath_ids.ts` | Leaf: the Guardian of the Breath's cast, aura, object and cue ids, the per-difficulty rules (`BREATH_DIFFICULTY`: mythic is heroic whole, the seam), the SKETCH tuning (`BREATH_TUNING`), the pure helpers (`calmSeconds`, `BLOW_BEARINGS`/`blowBearing`, `forkPath`, `cradleShare`, `swellMult`) and the objects' template codecs (`breathWindTemplate`, `calmTemplate`, `timedTemplate`). Imports nothing. |
| `breath_geometry.ts` | PURE over the layout and the field (no SimContext, for the bots to reuse): the arena (`inBreathArena`), the gaps (`gapAt`), the pin (`pinnedAgainstRim`), the void (`fellFromCornice`), Thessaly's post and circle spot, the loose gales' paths, the barrage's spots. |
| `breath_state.ts` | Type-only: `BreathFightState` (`Entity.smithHeartBreath` on the guardian). |
| `breath_scope.ts` | The per-tick scope and the shared plumbing: the players on the Cornice, the bar, the hashed marks, the rolls, the raid warnings (`hudChrome.breathGuardian.warn.*`), the fight's objects, the quiet `internal_cd` markers, the anchor test, the void-safe throw (`throwPlayer`). |
| `breath_gale.ts` | The Wind: the blow cycle and its wind object, the kernel's wind and pull auras (`src/sim/wind_drift.ts`), the pin, the void (`stepVoid`), the indrawn breath, its vortex and Bellows Gust, heroic's loose gales and phase-2 storm gusts. |
| `breath_thessaly.ts` | Captain Thessaly's circle of calm (land, hold, spent; three seats, the anchor, heroic's Calm Spent); nothing once the storm has broken. |
| `breath_storm.ts` | The storm breaking and its barrage, the strikes and charged ground, the Leaping Bolt, the Thunder's Cradle (carried, `carried_body.ts`), Drawn Lightning, the swelling storm. |
| `breath_voice.ts` | What the guardian and Thessaly SAY (`hudChrome.breathGuardian.say.*`, `BREATH_LINES` the same English). |
| `breath.ts` | The coordinator: the pull, the bar, the halves, the wipe's reset, the fall, the dev tier switch (`setBreathDevTier`) and the `/dev heart breath` triggers and readout. |
| `council.ts` | The coordinator: one pull (`keepTogether`), the fallen and their heirs, Memory of Stone, the bars, the wipe's reset (`regrowHead`), the finish, the dev switches for heroic and mythic (`setCouncilDevTier`; a switch mid-fight applies whole through `council_soul.ts` `syncSoulsToTier`) and the `/dev heart council` triggers. |

Rules:
- The Breath's push is the shared motion kernel's (an aura it reads, `src/sim/wind_drift.ts`),
  never a per-tick displacement: both hosts step it and the online client predicts it. A
  throw that can carry a body over a gap goes through `throwPlayer` (the knockback walker
  alone would seat it on the void's floor alive). Never name a wind aura `*_pull` (the Oath
  Chain's suffix, combat/paladin_control.ts).
- Deterministic: every pick is hashed (`pickMarkTargets`) or ordered (roles, roster, entity
  ids); the only rng draws are damage rolls, in claim-player order.
- Every visible state rides existing fields (cast bars and their targets, the holder's
  resource, auras on players and on the council, the pillar, rubble and rise-spot objects,
  `spellfx` cues), so the online client mirrors the fight with no wire or IWorld change; the
  pillars' collision rides the combat-wall view (`net/combat_wall_wire.ts` online).
- A new council mechanic lands in its member's module; a new difficulty is a
  `COUNCIL_DIFFICULTY` row, never a branch on a tier's name.
- Player text: every raid warning carries its catalog key (`hudChrome.council.warn.*`); the
  damage and aura names are matched by `src/ui/sim_i18n.ts`.
- Tests: `tests/smith_heart_council.test.ts` (on `tests/helpers/council_fight.ts`),
  `tests/smith_heart_council_ui.test.ts`, `tests/smith_heart_gating.test.ts`,
  `tests/smith_heart_pull.test.ts`, `tests/smith_heart_dev.test.ts`,
  `tests/smith_heart_council_mythic.test.ts` (the mythic row and Soul in the Stone),
  `tests/smith_heart_council_soul_wire.test.ts` (the soul pillars through the server into
  the online mirror), `tests/smith_heart_council_voice.test.ts` (the lines and the mythic
  player text); the Breath: `tests/smith_heart_breath.test.ts` (on
  `tests/helpers/breath_fight.ts`), `tests/smith_heart_breath_ui.test.ts`,
  `tests/smith_heart_breath_wire.test.ts`, `tests/wind_drift.test.ts`,
  `tests/wind_drift_online.test.ts`. A live raid of bots fights it over a dev server:
  `scripts/heart_council_raid.mjs`.
