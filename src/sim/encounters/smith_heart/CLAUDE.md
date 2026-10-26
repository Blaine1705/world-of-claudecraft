# src/sim/encounters/smith_heart: the Smith's Heart raid's sim

The raid's gating and its first boss (`docs/design/raid/smith_heart.md`), ticked once per
claim by `tickSmithHeart` (`seal.ts`), called from `instances/dungeons.ts`
`updateInstances`: the Hammer Council first (so its fall lights the Hammer vein the same
tick), then the seal and the arrival, then the portal hops.

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
| `council.ts` | The coordinator: one pull (`keepTogether`), the fallen and their heirs, Memory of Stone, the bars, the wipe's reset (`regrowHead`), the finish, the dev switches for heroic and mythic (`setCouncilDevTier`) and the `/dev heart council` triggers. |

Rules:
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
  the online mirror). A live raid of bots fights it over a dev server:
  `scripts/heart_council_raid.mjs`.
