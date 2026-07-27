# Professions tuning packet

Status: planned, not started. Base: `release/v0.31.0`.

One packet, seven phases. This document is the agreed scope and the record of
what was measured, so the phases can be built and reviewed against it without
re-deriving anything.

Everything below was measured against the shipped source, not estimated. Where a
number is quoted it came from reading the code or simulating it.

## Why this packet exists

Professions shipped with a source problem, a progression problem, and a
readout problem, and they compound:

- The vendor sells bulk trade goods, so crafting mastery is a shopping trip.
  Full armorcrafting mastery is 150 crafts fed entirely by vendor purchases,
  against a stated target of 10 to 20 focused hours.
- Gathering tools buy almost nothing you can feel, so there is no reason to
  chase one.
- Fishing has no failure state that can fire, and its catch table is chosen by
  zone alone with no skill or rod requirement.
- The character sheet prints proficiency in a way that reads as a level.

## Diagnosis: four premises that did not survive measurement

Recorded so they are not re-litigated.

**Vendor-sold gathered materials already violate a locked ruling.**
`docs/design/professions.md` states, under Locked rulings: "No gathered or
monster material ever gets a vendor buyValue." Five of the nine node yields
(`thorium_ore`, `ashwood_log`, `goldleaf_herb`, `elderwood_log`,
`sunpetal_herb`) are both node-gathered and vendor-stocked. The repo's own test
taxonomy in `tests/recipe_economy.test.ts` already sorts them into `NODE_YIELDS`
while keeping a separate `VENDOR_REAGENTS` list. So the delist is not a new
design direction, it is restoring a ruling the content drifted away from.

**No harvest has ever granted a level.** `gatherActionXp` in
`src/sim/professions/profession_xp.ts` pays `10 + 2 * nodeLevel` through a
green/gray falloff. Only three node levels ship, so the entire reachable range
is 3 to 53 XP per harvest, against 400 XP for the cheapest level in the game.
Gathering is roughly 10 percent of the whole 1-to-20 climb; the 85
non-repeatable quests are 109 percent of it on their own.

**Fishing grants zero character XP on every branch.** `completeFishing` in
`src/sim/professions/fishing.ts` never calls `ctx.grantXp`. There are exactly
five `grantXp` sites in the codebase (mob kill, quest turn-in, delve clear,
craft, harvest) and fishing is not one of them.

**The reported "every ore gives me a level" is a readout artifact,** with
three causes: the character sheet prints proficiency as a bare integer with no
denominator while it moves +1.00 per action for the first 25 harvests; deed
unlocks fire the same banner element, colour and lifetime as a real level-up,
and three or more of a new character's first five gathering actions trip a deed;
and level 1 to 2 genuinely is about 20 Eastbrook harvests, which are all
takeable back to back.

## Settled decisions

| # | Decision |
|---|---|
| D1 | Delist the vendor rows for the five gathered materials, in one move. **Keep `buyValue`** on the item defs. |
| D2 | Restate the ruling as "no NPC ever **stocks** a gathered or monster material". |
| D3 | Grant starter tools through `requiredItems` on all four gather quests. |
| D4 | Add a node placement validation test and fix the misplaced nodes. |
| D5 | Expand nodes for coverage, target 6 per type per zone. |
| D6 | Close the relog exploit by persisting node readiness. Respawn stays **per-player**. |
| D7 | Gate tool purchase on gathering proficiency, on the vendor row. |
| D8 | Better tools yield better materials: 9 new `fine_` variants. |
| D9 | Fishing difficulty is skill-versus-zone, not reaction time. |
| D10 | Wire the parked `TOOL_EFFECTS` system as the rare-tool hook. |
| D11 | Fishing keeps granting zero character XP, documented as deliberate. |
| D12 | No XP or proficiency gain constant changes anywhere in this packet. |

### D1: why `buyValue` stays

Removing `buyValue` flips **28 recipes gold-positive** against the ECONOMY
INVARIANT in `tests/recipe_economy.test.ts`, because `reagentUnitValue` falls
back to `sellValue` and all five materials are priced at exactly 4x. Two
independent passes derived this and a third reproduced it from scratch. The
field stays as the economy basis; only the vendor rows go.

This is why D2 restates the ruling. "Never gets a `buyValue`" is not
implementable; "no NPC ever stocks it" is, and it is what the ruling means.

`arcanite_bar` keeps its rows (refined, no node). The five staples
(`smithing_flux`, `spool_of_thread`, `tanning_agent`, `cooking_salt`,
`glass_vial`) keep theirs (vendor-only by design, no node, no drop, no recipe).

### D6: why per-player, not shared

`src/sim/cooldown_persist.ts` already solved this exact bug class for ability
cooldowns, and states the pattern: persist remaining-time deltas, not wall-clock
expiry, so timers freeze across a logout and resume on load. Node readiness is
the same shape.

Shared depletion was considered and rejected for this packet. It would reverse a
deliberate documented position (`src/sim/professions/gathering.ts` states the
per-viewer model exists so there is no gather rush or node camping), it degrades
with population worst in the starter zone, it makes gathering bots compete
directly with humans rather than costing them nothing, and the denial string a
losing player sees is the client-side `hudChrome.gathering.notReady`, which
says "for you" and is already filled in every locale.

Shared depletion scoped to tier 2 and tier 3 stays on the roadmap, gated on
telemetry, not in this packet.

### D9: why skill-versus-zone

Both reference games put fishing difficulty in skill versus spot, not in
reflexes. Classic-era fishing above a zone requirement fails constantly while
the reaction click stays generous; RuneScape has no reaction test at all and
rolls per-attempt success against level and tool.

The failure path already exists and is wired: `updateCasting` in
`src/sim/combat/casting_lifecycle.ts` emits `fishingGotAway` past the reel
deadline. It simply cannot fire at a 3.00 to 4.50 second window.

Expressing the skill-versus-zone failure as **empty-hook weight in the existing
table draw** costs zero new rng draws, so the pinned two-draw contract and the
parity goldens are untouched.

## The real bugs this packet closes

| Bug | Detail |
|---|---|
| Relog resets every node timer | `nodeHarvestReadyAt` is session-only and reset on every `addPlayer` |
| Level-1 Thornpeak fishing faucet | Catch table is keyed on zone alone, no level or rod requirement |
| Tier-3 rod is inert | Band 2 requires proficiency 200, which is fishing's cap, so tier-2 and tier-3 rods take an identical number of casts to cap |
| Misplaced nodes | Several sit below the waterline, including all three Eastbrook herb patches on a lake floor; one sits on a near-vertical slope. No test validates a node coordinate |
| Zone-1 tier-5 tool craft | A level-1 can craft a tier-5 pick without leaving Eastbrook, because the only toolworks station sits beside the NPC selling its reagents |
| First quest has no tool | A new character starts with zero copper; `q_prof_intro` says to swing a pick and nothing grants one |
| Vacuous economy guard | The fully-vendor-fed set in `tests/recipe_economy.test.ts` is derived from the vendor tables, so the delist would empty it and its loop would stop asserting silently |
| Stale deed comment | The comment above `prog_tools_of_the_trade` claims it depends on vendor stock; its trigger is `hubCraftsPerformed >= 1`, any station craft |

## Phases

Each phase is independently shippable and revertible, and gated with
`npm run gate`. Only phase 6 moves a parity golden.

### Phase 0: readout and banner

No sim change, no wire, no parity. English catalog only.

- Character sheet gathering readout gets a denominator, matching the shape the
  professions window already uses. (`src/ui/char_window.ts`. Note the
  professions window is already correct: it renders a bounded value and a
  continuous fill, not a pip track.)
- Deed unlock banners get their own visual language, distinct from the level-up
  banner they currently share.
- Comment at `completeFishing` recording that zero character XP is deliberate.

### Phase 1: delist and quest tools

Data only. No sim logic, no wire, no parity.

- Remove the vendor rows stocking the five gathered materials.
- `requiredItems` on all four gather quests (`q_prof_intro`,
  `q_prof_attune_smith`, `q_prof_attune_bombardier`, `q_prof_hobby_switch`), so
  `questFallbackGrants` hands out the pick or sickle on accept and re-grants it
  if lost. Two of the four need a sickle, not a pick.
- `noVendorSell` on the three tier-1 starter tools, closing the repeatable-quest
  faucet (`q_prof_hobby_switch` is repeatable with a herb objective).
- Replace the derived fully-vendor-fed set with a counterfactual assertion plus a
  non-vacuity floor.
- Fix the stale `prog_tools_of_the_trade` comment.
- Telemetry counters: copper source, per-band harvest counts.

### Phase 2: placement validator and node fixes

- `tests/gather_node_placement.test.ts` over the sim-pure terrain API
  (`terrainHeight`, `groundHeight`, `terrainSteepness`, `isInWaterBody`,
  `waterLevelAt`, `nearSteepWalls`, `roadDistance` from `src/sim/world.ts`, plus
  the player movement constants from the pathfinding module).
- Arms: dry land with margin, walkable slope, no collider overlap, a reachable
  stand spot within interact range, reachability from the zone hub, zone
  containment (node yields are keyed by zone, so a mis-zoned node yields the
  wrong material), minimum spacing, and a per-zone coverage floor.
- One arm that is easy to miss: the renderer anchors node props at
  `terrainHeight`, while every other check uses `groundHeight`, which adds the
  Sowfield stand lift and dock plank surfaces. Assert the two agree, or a node
  authored on a dock renders sunk into the platform.
- Move the misplaced nodes to valid ground. No allowlist.

### Phase 3: node expansion

Content only. Still per-player timers.

- Target 6 nodes per type per zone, spread for coverage rather than thickened in
  place. Coverage floor of 40 percent of walkable ground within 40 yards,
  deliberately below the mob-camp figure.
- Keep at least one tier-1 node per type per zone, so a traveler with the
  quest-granted starter tool can still gather outside the first zone.
- Respawn moves to 240 seconds alongside 6 nodes per type, holding the existing
  harvests-per-hour ceiling flat. The expansion buys world density and a longer
  circuit, not faster farming. Today every zone circuit is shorter than the
  respawn, so a large fraction of a gathering session is spent standing still.
- Replace the per-node circle loop in the quest-objective map painter with the
  enclosing-circle pattern already in that file, or the map carpets.

### Phase 4: the tool gate

Zero wire, zero parity. `vendorItems` is static content rebuilt client-side, and
gathering proficiency already rides an existing delta as an `IWorld` member in
both hosts.

- A `VendorRowGate` side table plus one pure resolver, mirroring the delve shop
  gate: evaluated authoritatively in the buy path and advisorily in the vendor
  view core, so the row renders locked with a requirement line rather than
  disappearing.
- Thresholds: tier 2 at gathering 40, tier 3 at gathering 70. **Not 75.**
  Tier-1 nodes stop teaching at exactly 75 and the first zone is all tier-1, so
  75 is a knife edge any future constant change would silently brick.
- Ship a derived-ceiling test that computes the tier-1 teaching ceiling from the
  live constants and asserts every gate sits below it, so a future change fails
  loudly instead.
- Prices 120 and 400. A solo player's realistic entire first-zone quest income is
  around 5,300 copper, so thousands would be a wall.
- Zone stocking follows the "hub sells the tiers its own nodes use" rule the
  later zones already follow. Only the first zone over-stocks today.
- Owned tools are never confiscated when a gate arrives. Patch-note line.

Gating on zone alone does not work and is not attempted: there is no level gate,
no quest gate and no travel cost anywhere, the inter-zone ridge has a road pass,
and a ghost-run chain is safe because mobs skip dead entities.

### Phase 5: fine materials

Pure state change, zero new rng draws.

Five forks were settled while building it; recorded here so they are not
re-opened.

1. **Zone tier, not node tier.** The upgrade compares the tool against the
   MATERIAL's zone tier (Eastbrook 1, Mirefen 2, Thornpeak 3), with a second
   arm requiring the vein to carry that tier. Node tier alone would have made
   the tier-4 pick's reagent farmable off a Thornpeak tier-1 vein, and the
   vein arm is what keeps the deliberate lower-tier veins yielding the plain
   material. The tier column is derived from `GATHER_NODES` in the tests.
2. **Completion, not cast start.** The grade is read at the grant. Cast start
   would have needed transient cast state on `Entity` for a difference only a
   mid-cast tool change could see; losing the tool mid-cast costs the upgrade,
   never the harvest.
3. **The tier-4 pick is re-pointed, not exempted.** It consumes the Mirefen
   fine ore, gated on the tier-3 pick it already consumes, which is the shape
   the axe and sickle lines already had.
4. **The tier-5 pick keeps `arcanite_bar` and GAINS the Thornpeak fine
   grade.** Re-pointing off the bar would strand it and its vendor rows; it
   was also the one rung still buyable off a counter.
5. **Downward substitution, a fork the packet did not anticipate.** The fine
   grade replaces the plain yield, and Eastbrook is all tier-1 veins, so a
   tier-2 tool would have made `copper_ore`, `ironbark_log` and
   `silverleaf_herb` ungatherable, blocking two shipped repeatable work orders
   and roughly 19 tier-1 recipes. A fine grade now satisfies a requirement for
   its base (never the reverse) in the craft gate, the craft capacity
   simulation, the craft consumption, and quest collect credit and turn-in.

Two premises in the original scope did not survive contact and are corrected
here: the icons are NOT procedural (the compositor is unreachable for a
non-weapon item, so each grade ships committed derived art plus provenance),
and eight of the nine names trip M16, so all nine carry non-Latin fills.

- Nine `fine_` variants, one per zone and type. A tool one tier above the node
  yields the fine version.
- The six tool recipes are re-specced to consume them, so a better tool is the
  only path to the next tool up. Zero new recipes.
- Naming: `fine_` is a plain English quality adjective. It avoids the `pristine_`
  specimen family, avoids the rare-event flavor vocabulary
  (`pristine_vein` / `ancient_heartwood` / `moonlit_bloom`), and is not a
  distinctive coin of another property. Verify against `tests/ip_scrub.test.ts`
  and `tests/originality_renames.test.ts` before authoring.
- Nine procedural icon entries. `tests/shipped_item_ids.test.ts` is append-only,
  so these ids are permanent once shipped.

### Phase 6: fishing

The only phase that moves a parity golden, and only because of the session cap.

- Per-zone minimum rod tier, checked beside the existing implement gate and
  denied through the existing text-free denial event. Pre-draw and rng-free.
- Empty-hook weight scales on proficiency versus the zone requirement: roughly
  8 to 12 percent at or above, around 35 percent one tier under, around 55
  percent two tiers under.
- Junk roughly doubles at low skill and thins as you climb. Every band row must
  still sum to 100 and stay monotone.
- Reel window 3.00 to 2.50 seconds. A light trim only: the difficulty lives in
  the skill-versus-zone axis, and a shorter window is a platform tax on mobile
  once tick quantization and network round trip are counted.
- Session cap must move with the bite delay. If max bite plus max window exceeds
  the cap, the session-complete arm fires first and silently eats a valid reel
  window, which is a fairness defect rather than a difficulty knob.
- Sunglint Koi gets a skill-scaled weight and a use as the tier-4 rod reagent.
  It is currently flat across every band and consumed by zero recipes.
- Tier-4 and tier-5 rods. Note the pre-training recipe list is frozen, so these
  route through trainer acquisition, and the tier-5 recipe must sit at a skill
  requirement inside engineering's cap.

### Phase 7: tool effects and rare tools

Its own phase because it is the only one that touches persistence and the wire.

- Wire Gatherer's Cache and Artisan's Eye. Park Springback Charm: a
  respawn-speed bonus points the endgame loop back at the starter zone.
- **Depletion must be deterministic.** `depleteEffect` currently draws
  `rng.chance`, which would be a third draw per harvest and break the pinned
  two-draw contract for any player owning a slot. Spend one charge per fire and
  fold the rarity intent into starting durability.
- Tool rarity grants narrow non-gating bonuses: a wider reel window on rods, and
  longer effect durability on land tools. An epic tool opens no node a common
  tool of the same tier cannot. This amends the shipped "rarity is cosmetic and
  value-only" comment, which must be updated in the same change.
- Tier-4 and tier-5 tools added to the delve shop behind clear counts, giving
  non-crafters a route to top tools. **Widen the "never vendor-sold" guard in
  `tests/professions_tools.test.ts` to cover the delve and heroic shops** and
  restate the claim as "never sold for copper", so it asserts what it means
  instead of passing on a technicality.
- Cost: a player meta field, an optional persisted field with a default, an
  `IWorld` member implemented in both hosts with the parity pin updated, a delta
  field with the snapshot pin updated, a slot command, and a HUD row.

## Test and invariant obligations

- **Parity.** No phase changes rng draw order or count except phase 7, which is
  why depletion is deterministic. Phase 6 re-records one golden for the session
  cap; prove the diff is confined to the cast timing fields.
- **The gathering two-draw contract** (2 per granted harvest, 0 on denial) is
  golden-pinned and must hold everywhere.
- **Fishing draws** stay at 2 per landed session, 1 on a miss.
- **`tests/recipe_economy.test.ts`** must not be left with a derived set that can
  empty. Add the non-vacuity floor in the same change as the delist.
- **i18n.** English-only per the PR-tier gate, with locale fills at release.
  Flag: a few new values are wordy enough to need non-Latin fills in the same
  change, and rewording an existing English value stales every locale for that
  key.
- **Screenshots.** Phases 0, 4, 6 and 7 are visual. Desktop and mobile.

## Recorded rulings

Settled with the maintainer during planning. Do not re-litigate.

1. The "gathering 100 in 8 to 12 hours" target means **while you play**, roughly
   23 to 34 harvests per hour picked up opportunistically, not dedicated
   farming. Dedicated farming would need a 3 to 4x harvest-count increase, whose
   only lever is a gain number, which the locked ruling forbids.
2. Character XP falls **inside** the locked "never via smaller gain numbers"
   ruling. No XP constant moves in this packet.
3. Fishing grants zero character XP by design, because it is the only uncapped
   gathering faucet. At equal per-action XP it would be several times the XP per
   hour of every other gathering profession.
4. Tool rarity may grant narrow bonuses that never affect access.
5. Crafted top-tier tools may be sold for delve marks, and the guard is widened
   to say so.
6. The delist lands in one move rather than staged behind telemetry, with the
   telemetry counters shipping alongside in the same phase.

## Deferred, with reasons

- **Shared node depletion.** Rejected for this packet, see D6. Revisit scoped to
  tier 2 and 3 only, gated on telemetry.
- **A gathering strike minigame.** The fine-material axis answers the same
  complaint with far less surface. Revisit only if tools still feel flat after
  phase 5.
- **Raising the gathering skill cap.** Nothing exists to put in the back half of
  a longer bar until node yields vary by tier.
- **Springback Charm.** See phase 7.
- **The quest XP curve.** The non-repeatable quests alone pay more than the whole
  level climb, which is the actual reason leveling is fast. Out of scope here.
