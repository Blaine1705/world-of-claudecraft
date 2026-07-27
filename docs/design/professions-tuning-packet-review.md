# Professions tuning packet: review findings and the road to done

Status: findings recorded and direction SETTLED with the maintainer
(2026-07-27). This file is the worklist for phases 8 through 13, all landing
on `feature/professions-tuning-packet`; the branch merges only when
everything here is done. As each phase lands, strike its items and record
what it settled, the same way `professions-tuning-packet.md` does.

Provenance: whole-packet review run 2026-07-27 against the full branch diff
(merge-base with `release/v0.32.0` through HEAD), after all seven phases were
built and gate-green. Method: 31 review agents across 12 claim-verification
and cross-phase groups with adversarial verification of every consequential
finding, plus the four repo domain reviewers (architecture,
cross-platform-sync, privacy-security, test-coverage). Every finding below
either survived an independent refutation attempt or was verified by hand
against the executable code path. "Confirmed Nx" counts fully independent
discoveries of the same defect by separate reviewers.

## The packet in one paragraph

Professions shipped with three compounding problems: crafting mastery was a
vendor shopping trip, gathering tools bought nothing a player could feel, and
fishing had no failure state, while the character sheet made proficiency read
as levels. The packet turns gathering and fishing into real progression:
materials come from the world instead of a counter (phase 1 delist), the
world can support that (phases 2 and 3, placement validator and 54 nodes),
tools are earned and matter (phase 4 gate, phase 5 fine materials), fishing
difficulty lives in skill versus water (phase 6), and rare-tool effects are
wired for a future acquisition craft (phase 7, dev-gated). All of it without
touching an XP or gain constant (D12) or a pinned draw contract.

## Vision and settled direction (maintainer, 2026-07-27)

The target: a unique feature that sits between WoW and RuneScape, beautifully
designed, with an incredible experience on desktop and mobile. Nothing grants
mastery right away; professions carry a player through the entire game, and
the game is about to grow past its current 3 zones and level 20 cap.

- V1. **Everything lands on this branch.** Phases 8 through 13 all build
  here; the branch merges once the whole worklist is done.
- V2. **Skill identity is content-unique, not mechanics-unique.** Mining,
  logging, herbalism, and fishing keep the shared gather core; uniqueness
  comes from each skill's own nodes, tools, materials, recipes, and deeds.
  No new per-skill minigames or interaction models. (This re-confirms the
  packet's earlier rejection of a gathering strike minigame.)
- V3. **The proficiency cap rises with zones.** Today's 100 (fishing 200) is
  correct for 3 zones; each new zone tier ships a longer bar together with
  its own node tier, materials, fine grades, and tool rung. The old deferral
  ("nothing exists to put in the back half of a longer bar") is retired: the
  fine-material axis is that content. See phase 11 for the expansion
  checklist that makes this mechanical.
- V4. **Performance is engineered against 1,000 concurrent players** (10x
  today's 100). Professions-specific budgets and benchmarks pin it; see
  phase 13.

## What the review established as sound (do not re-audit)

- Every diagnosis number in the design record still holds at HEAD: exactly
  three node levels across all 54 nodes, the 3 to 53 XP harvest range, five
  `grantXp` sites with fishing not among them, and D12 (the
  `profession_xp.ts` diff against the merge-base is empty).
- No determinism break. Exactly one rng call site changed in the entire diff,
  and it is a removal with no live caller (`depleteEffect`'s old roll). The
  six moved parity goldens are geometry and expansion driven, verified
  key-by-key; the solid node bodies came from the release (PR #2527), not
  this branch.
- Wire and IWorld parity are fully verified: the tool-effect slot member is
  real in both worlds, pinned, and driven through a live encode-to-decode
  test; both `ncd` arms agree; the RL surface is untouched.
- Server authority holds on every new bonus; the vendor gate fails closed on
  malformed input on both arms; grade substitution cannot double-spend; the
  telemetry band map derives fine grades from their base family (not the
  unmapped-item defect class of #2514).
- The balance ladder is coherent: first-zone income covers the tool prices,
  the Marks route is a multi-session goal, recipes stay gold-negative with
  fine grades priced at 2x sell and 4x buyValue basis, and a hand derivation
  puts post-delist armorcrafting mastery at roughly 8 to 14 hours, inside the
  stated 10 to 20 hour target.

## Known-open items, acknowledged, not findings

The effects have no acquisition path (wire command dev-gated until phase 10),
the release-time locale fill (sized in 8c.4), and the `toolEffectSlots`
whole-blob rollback caveat (owned by phase 10). The two former open rulings
(rod fees, purchase-versus-use) are now settled; see the rulings ledger.

---

## Phase 8: review closeout

No new design decisions required; everything here corrects the packet against
what it already decided, plus the small work items the rulings ledger
created. Shippable as one phase with six workstreams.

### 8a. Sim correctness

1. **Cast-start capacity pre-gate disagrees with the grant** (confirmed 6x).
   `harvestNode`'s pre-gate resolves the yield id from the raw
   `bestOwnedGatherToolTierOrNone` result while the completion gate and the
   grant resolve through the slotted quality effect
   (`effectiveGradeToolTier`). This falsifies the agreement contract written
   above `harvestYieldItemId` in `src/sim/professions/gathering.ts` and the
   twin claim in `src/sim/professions/material_grades.ts`. With a quality
   effect slotted: room-for-base-but-not-fine passes the start gate and eats
   the whole cast before a late "Your bags are full."; room-for-fine-but-not-
   base is falsely denied at start. Latent until the acquisition craft ships.
   Fix: resolve the start gate through `harvestYieldItemId(meta, node)` (note
   it re-walks the bags, so update the no-second-bag-walk comment) or thread
   the effective tier through. Check: a test combining a slotted quality
   effect with each capacity gate; none exists today.
2. **Refuse Springback Charm at the slot resolver** (ruling R9). Its bonus
   arm is a deliberate no-op while depletion runs unconditionally, and the
   catalog description still promises respawn shortening.
   `resolveSlotToolEffect` accepts any catalog id today. Check: slot refusal
   pinned, and a harvest spends nothing.
3. **Refuse fishing at the slot resolver** (ruling R9). Fishing slots are
   mintable, HUD-rendered, and inert: `completeFishing` never consults the
   effect system, so a fishing slot never fires and never spends, and the
   phase 7 tests actively pin the inert row as expected output. Refused
   until an effect has real fishing behavior (wiring one instead needs its
   own draw-order review; the catch-table draw sits ahead of the grant).
   Check: refusal pinned in both directions.
4. **Starter-tool mint: add a repeat cadence and a truthful comment**
   (ruling R10). `q_prof_hobby_switch` is repeatable with no
   `repeatCadenceTicks`, so the tool mint is unbounded; give it the cadence
   its four work-order siblings carry. Direct trade stays OPEN by ruling.
   Rewrite the `src/sim/content/items.ts` comment block to enumerate
   truthfully: bank and trade open, vendor, market, and mail closed (the
   current comment claims "no route to value at all" and also names mail as
   open, both wrong; the attach path refuses via `noMarketList`).

### 8b. Guard and pin work (tests only)

1. **Widen the D2 material never-stocked sweeps to all three stock tables.**
   `professions_master_stock.test.ts` (`stockedByNpc`) and the fine-grade
   sweep in `material_grades.test.ts` read `NPCS[*].vendorItems` only, blind
   to `HEROIC_VENDOR_STOCK` and `DELVE_SHOPS`, the exact hole phase 7
   documented and fixed for the two tool guards. Sharpest consequence today:
   a delve row for `glimmerfin_koi` would sell the tier-4 rod reagent with
   every test green, and every fine grade carries a live buyValue so a
   single stock row anywhere sells it. Mirror the union the tool guard uses,
   with per-table non-vacuity arms.
2. **Pin the hub rod rows.** Fenbridge's ironreel and Highwatch's
   silverstream rows (the phase 6 no-strand story) have no test, and two
   stale comments actively invite their deletion (see 8d). Add both rows to
   the hub-stock sweep in `professions_tools.test.ts`.
3. **Give the tier-ramp placement arm a non-vacuity counter.** Its discovery
   regex empties silently on an id rename; every other arm in
   `gather_node_placement.test.ts` counts. Assert the six zone/type groups
   that must participate.
4. **Fix the one-directional `dist2d` sweep** in
   `professions_tool_gate.test.ts`: it matches only greater-than
   comparisons, its comment ("the shipped file has none") is disproven by
   the market-NPC range check in `hud.ts` (a hand-inlined 8 duplicating the
   value `NPC_WINDOW_CLOSE_RANGE` names), and its character class cannot
   span a nested call. Widen the class, allow one nested paren level, name
   the 8.
5. **Pin the tool-less fine-grade boundary.** A bare-handed harvest with a
   quality effect stays below the fine threshold by exactly one point
   (bonus 1 against a minimum gather tier of 1); a future bonus-2 effect
   would mint fine grades with no tool. One boundary test plus a comment.
6. **Replace the vacuous access pin** in `professions_rarity_roll.test.ts`
   (it exercises `canGatherTier` in isolation, which stays true under the
   regression it names). Real pin: drive `harvestNode` at a tier-2 node with
   a tier-1 pick and a slotted quality effect, assert `gatherDenied`.
7. **Add the derived crafts-to-mastery test** (ruling R13). The 10-to-20
   hour target is prose only; derive crafts-to-cap and the material bill
   from the live recipe and gain tables the way the tier-1 ceiling test
   derives its bound, so a reagent or curve edit moves it loudly. The hand
   derivation to reproduce: roughly 8 to 14 hours for armorcrafting,
   gathering-dominated.
8. **Add the Copper Dig pathing arm** (ruling R14). Nothing asserts a
   starter-camp mob can still reach a player standing among the six
   now-solid veins, or that no camp spawn ring intersects a node body.
   Radii are small (~0.44 yd) and the re-recorded combat goldens suggest
   pathing works; make it an assertion instead of an inference.

### 8c. i18n repair

1. **Un-strand the four reworded guide keys** (confirmed; no remediation
   path exists). `guide.profPages.craftProse.engineering.materialsBody`,
   `fish.startBody`, `fish.biteBody`, and `fish.tablesNote` kept pre-reword
   overlays in all 18 locale files; the release fill reads pending rows only
   and a reword never pends. The stale rows teach the old recipes and deny
   the packet's own mechanics (the German materialsBody says Gizzel sells
   all six reagents; current English says fine materials are sold nowhere).
   Apply the packet's own toolsNote precedent: delete the stale rows so the
   keys re-enter pending, refill the non-Latin locales in the same change
   (M16, these are wordy values).
2. **Fix `koiBody`'s English**, which is itself outgrown: it still says the
   koi odds are a flat 3 percent (4 in Thornpeak) at every band; the shipped
   table is 1/3/6 by band, identical across zones, and the sibling
   `tablesNote` on the same wiki page already says so. Then give it the same
   remove-and-refill treatment (fixing English re-stales its overlays).
3. **Fix `biteBody`'s Silverstream number** (ruling R12): it quotes 4
   seconds; the shipped rod is uncommon and reaches 4.25 through the rarity
   rung. Same remove-and-refill treatment rides along with item 1 (biteBody
   is already in that set).
4. **Scope the craft-overview line** that says the tier 4 and 5 tools are
   ones "no vendor will ever stock": the delve counter stocks all eight for
   Marks. Reword to the never-for-copper form the tests pin.
5. **Release-fill accounting note:** the true pending set is 315 rows, 21
   keys across 15 locale rows each (13 Latin bases plus es_ES/fr_CA through
   the dialect chain), not "13 toolsNote rows". Record it wherever the fill
   is scoped so the job is sized right.

### 8d. Prose, comments, and doc corrections

Design record (`professions-tuning-packet.md`):

1. The Phases intro sentence "No phase moved a parity golden in the end" is
   false as written; replace with the draw-order form the parity section
   already uses. While there, the parity section attributes the
   `professions_gather` re-record to the node expansion alone; it was
   re-recorded twice (phase 2 relocations, then phase 3 expansion).
2. D6 and the bug table: phase 9 builds D6, so the row stays but gains a
   "built in phase 9" pointer until it lands; the status header should name
   the phase 8 to 13 worklist (this file) instead of implying the packet is
   finished. Restate the header's open-rulings line against the rulings
   ledger below (ruling R16): the two old rulings are settled, and the two
   phase 5 maintainer calls (gather-tooltip grade preview, out-tooled
   work-order economics) are now owned by phases 12 and 11 respectively.
3. "Nine procedural icon entries" contradicts the correction two paragraphs
   above it; reword to committed derived art.
4. "A better tool is the only path to the next tool up" was outgrown by the
   phase 7 Marks route; scope it to the craft path. Same fix in the two code
   copies: the `material_grades.ts` module header and the
   `material_grades.test.ts` file header.
5. Phase 3 asserts the circuit-idle premise the branch's own measurement
   falsified (true only of Eastbrook; both later zones got slightly worse),
   and "holding the existing harvests-per-hour ceiling flat" is false for
   two of three zones (360 to 270 is a 25 percent cut; the placement test
   states it honestly). Phase 3 is the only phase without a closeout
   section; add one quoting the measured table that today lives only in the
   `gather_nodes.ts` comment.
6. Small stale numbers: the phase 6 empty-hook plan range (8 to 12) versus
   the shipped 10/8/6 surplus taper, and the phase 6 closeout's 271-tick
   worst session, which phase 7's rarity rung moved to 286.
7. **Record the blessed trades** (rulings R4, R17, R18): the koi band-0
   weight cut to 1 is deliberate skill-scaling; the reel-window trim's 17
   percent cost to a tier-1 angler is the accepted mobile-latency price; the
   Marks-to-copper conversion through delve-bought tools (vendor 60/150) is
   blessed as a bounded, loss-making conversion (closing it would flag the
   shared item defs crafted tools use too).
8. **Record the map-doc policy** (ruling R15): D2 governs shipped content;
   custom map documents (an editor-only surface today) can stock any item id
   and are outside the guard. One line in the design record beside D2.

Other docs and comments:

9. `docs/design/professions.md` constants table still lists the reel window
   as 3 / 0.75 with no rarity-bonus row; the packet edited adjacent rows of
   that same table. Update to 2.5 / 0.75 / 0.25.
10. Two comment blocks in `src/sim/content/professions.ts` still describe
    the deleted rng-rolled consumption curve and cite the dead symbol
    `effectConsumptionChance`; the deterministic-depletion ruling itself
    required these updates in the same change. Rewrite both.
11. Stale rod-exclusivity prose: the zone3 Highwatch comment ("Tiered rods
    stay a Wilkes exclusive.") is disproven by the silverstream row in its
    own array, and the `professions_tools.test.ts` comment ("fishing has no
    nodes for the hub rule to be expressed against") was superseded by
    phase 6. Reword both to the buy-ahead framing zone1/zone3 already use.
12. `src/sim/professions/CLAUDE.md` still says tool effects are parked
    ("do not wire"); this packet wired them. Update, and add the missing
    `fishing_zones.ts` row to its module map.
13. `effectiveGradeToolTier`'s comment claims three readers including a
    tooltip that does not exist yet (phase 12 builds it); trim to the two
    real readers, or point forward to phase 12.
14. A test comment counts the Eastbrook de-stock as "six rows"; it was six
    item ids across twelve vendor rows. Reword to avoid the literal count.

### 8e. Hygiene

1. Drop the unused `TOOL_EFFECTS` / `ToolEffectId` imports from
   `src/sim/sim.ts` (biome warning; survives the gate, which fails only on
   errors).
2. Harden `rodTierRequiredForZone` with `Object.hasOwn`, matching the
   sibling `resolveVendorRowGate` which cites the same map-doc-authored
   string door (traced benign today; both worlds converge on the denial).
3. Narrow the `IWorld.slotToolEffect` signature to the modes a host accepts
   (today it advertises `'prompt'`, which every host silently refuses);
   re-widen when phase 12 ships the confirm flow.
4. `VENDOR_ROW_GATES` is `Readonly`-typed but never frozen; its packet
   siblings freeze. Freeze it.

### 8f. Content and telemetry (from the rulings)

1. **Move `wood_mirefen_t2` off the road surface** (ruling R11). It stands
   at 0.3 yd, grandfathered by the road-band exemption pin the placement
   test carries; the test's own comment calls it a real defect. Move it to
   legal ground, drop it from the exemption set, and note: nodes are solid
   bodies now, so a move can shift mob pathing and re-record a combat
   golden; if one moves, document the geometry cause in the commit, matching
   the packet's precedent.
2. **Re-key the harvest telemetry bands by zone tier** (ruling R3):
   starter/mid/premium becomes Eastbrook/Mirefen/Thornpeak by the node's
   zone rather than the material's price tier, so the series answers the
   question it exists for ("do players reach the top rung") and scales with
   V3 as new zones ship. Update `harvestBandForItem` (or key from the node
   rather than the item), its pre-seeded label set, and the derivation
   tests; keep the label set bounded and pre-seeded to zero.

## Phase 9: build D6 (node-readiness persistence). GO.

Settled: build it (V-series direction; the doc must stop promising what the
code lacks, and the code is the right side to move). The design record lists
"Relog resets every node timer" first under "the real bugs this packet
closes" and D6 says "persist node readiness", but no phase scheduled the
work: `nodeHarvestReadyAt` is session-only, reset on every `addPlayer`, never
written by `serializeCharacter`; the `ncd` wire block only displays it. The
packet made the exploit worth more while not closing it: phase 3's 240-second
respawn doubled what a relog erases, and phase 1's delist made harvests the
only supply of the five materials the new tool recipes demand. The fast cycle
is the explicit logout frame; a linkdead drop resumes and does not reset.

Scope, verified small:

- One optional remaining-deltas field on `CharacterState`, written
  future-only and omitted when empty, following the `cooldown_persist.ts`
  pattern the design record itself cites (freeze remaining time across
  logout, resume on load).
- Re-anchor in `addPlayer` from the persisted deltas, filtered to live
  `GATHER_NODES` ids (drops retired nodes on load, the same shape
  `normalizeToolEffectSlots` uses).
- Comment updates at the three "session-only, never persisted" sites
  (`sim.ts` twice, `gathering.ts`, `gather_nodes.ts`).
- Zero wire changes (`ncd` re-derives from live meta every broadcast; the
  client mirror is already correct), zero golden movement (no parity
  scenario round-trips `serializeCharacter`), no offline work (the offline
  world has no character persistence; an offline relog is a page reload that
  rebuilds the Sim), and no existing test pins the session-only behavior.
- New coverage: a persistence round-trip test for the field, a
  freeze-across-logout behavior test, and a retired-node-id drop test.

## Phase 10: the acquisition craft (needs its own design rulings first)

Already the packet's declared next step (it drops the dev gate). The review
adds constraints the craft's author must satisfy, recorded here so they are
not rediscovered:

- The capacity pre-gate fix (8a.1) must land before or with it; the
  divergence becomes player-facing the day an effect is obtainable.
- Price the recharge in a material identity, not a bare count.
  `RechargeCost.materials` is a flat 4 with no item id anywhere; a charge's
  value spans roughly 4 to 80 copper depending on effect, zone, and tool, a
  20x spread against one flat cost. If the material lands near staple
  prices, a 50-charge fine-tier refill is a strongly positive loop.
  Recommendation: price in the fine grade of the profession's own top
  material, or per effect.
- `always`-mode quality effects burn a charge even when the bonus changes
  nothing (non-qualifying vein, already-fine yield); either make depletion
  conditional on the bonus mattering, ship the prompt flow (phase 12), or
  price charges assuming waste.
- The rollback caveat (whole-blob save erasing `toolEffectSlots` under an
  older binary) turns into real player-value loss here; the acquisition
  change owns it.
- Remove the dev gate and its two-direction test pin in the same change, per
  the packet record.

## Phase 11: content uniqueness, zone progression, and expansion readiness (V2, V3)

The vision phase for "each skill has its own unique nodes, tools, and
materials, fun and worthwhile, carrying through the whole game", within the
settled content-unique-only frame (no new mechanics).

### Zone-progression audit (run 2026-07-27, traced through the executable code)

The maintainer's requirement: each zone is a progression (better fish, ores,
herbs up the ladder), and a player must not be able to do everything in
zone 1. Verdicts per axis:

- **Gathering: STRONG, already as desired.** Yields are zone-keyed and
  strictly better up the ladder (ore 4/8/15, wood and herb 4/15/40 copper
  sell); tier-1 nodes stop teaching at exactly 75 of 100 (derived and
  pinned), so the cap requires Mirefen t2 or Thornpeak t3 veins; the fine
  grades the tool recipes consume only mint from later-zone veins; zone 1
  stocks only tier-1 tools. Caveats: zone 3 is the fast finish, not a hard
  requirement for the cap (Mirefen t2 trickles to 100 at quarter gain);
  rare events and material signing are zone-agnostic by construction.
- **Fishing: catches STRONG, climb was NONE.** Every zone's fish are
  exclusive and strictly better (food value, coin, recipe demand;
  Slatefin Carp is Thornpeak-only), and the rod gate holds. But
  proficiency gain had no zone input: zone-1 water taught to the 200 cap
  and was mathematically the OPTIMAL grind spot (best food-fish density at
  every band, ~3,740 casts to cap at Mirror Lake), and the whole rod ladder
  is buyable in zone 1 at Wilkes. Fixed by ruling R19 below.
- **Crafting: PARTIAL, defensible.** Leatherworking is genuinely anchored
  to Fenbridge and alchemy to Highwatch (stations and trainers, 19
  zone-locked recipes); tanning agent and glass vial are later-zone counter
  exclusives. Engineering (the whole tool and rod ladder) crafts and trains
  entirely at the Eastbrook toolworks with its pull carried by the reagent
  side; the World Market lets a funded buyer purchase every later-zone pull
  from Eastbrook Square (accepted under R7; R22 later closed the
  tool-wielding half of that bypass, materials remain tradeable);
  specialization (75) in any
  craft is grindable in zone 1 off field recipes, but training the real
  ladder still requires the zone-anchored trainers.
- One containment is airtight by design: fishing grants zero character XP,
  so zone-1 fishing can never substitute for combat leveling.

### Zone-progression work items (from rulings R19 to R21)

- **The fishing teaching ceiling (R19).** Give fishing the land
  professions' tier-falloff shape: the water's zone tier feeds the gain
  curve, so tier-1 water grays out around 100 of 200, tier-2 around 150,
  and tier-3 teaches to the cap. Exact thresholds are a design pass,
  derived from live constants and pinned by a derived test exactly like the
  75 land ceiling. Implementation notes, verified in the audit: gain is
  draw-free, so the fishing draw contract (2/1/0) is untouched; the parity
  suite drives no fishing session, so no golden moves; this deliberately
  extends the packet's D12 scope with maintainer authorization, and the
  design record must say so. Sequencing: this rewords the fishing guide
  prose again, so land it BEFORE the release locale fill, and if it
  rewords keys 8c already refilled, repeat the remove-and-refill for the
  affected keys (the reword-staleness gate cannot see it otherwise).
- **The missing Thornpeak gatherer deed (R21).** The per-zone gatherer deed
  line stops at zone 2: `completeGatherCast` already writes
  `gather:thornpeak_heights:*` visit marks and no deed consumes them, so
  the deed pull outward goes silent exactly where the t3 veins are. Author
  the zone-3 gatherer chronicle per `docs/design/deeds.md` (cosmetic only)
  and update the `tests/deeds_content.test.ts` pins.
- **Tool use requirements (R22).** The RuneScape-shaped gate: the harvest
  path's tool resolution becomes "best owned tool the player can USE"
  (`bestOwnedGatherToolTierOrNone` learns the proficiency input), with a
  text-free denial event plus a matcher-keyed requirement message, tooltip
  and vendor requirement lines updated, and the guide reworded. The
  authoritative vendor buy-deny relaxes to advisory display (re-mint the
  phase 4 purchase-deny pins as wield-deny pins; the derived-ceiling test
  now derives USE requirements). Draw contracts untouched (pre-draw
  denial). Sequencing: rides with R19 in this phase since both reword the
  professions guide prose; land both before the release locale fill.
- **Rare-event and signing zone flavor (audit consideration, optional).**
  Both systems pay identically in every zone today (type-keyed flavor,
  flat 1/90, proficiency-keyed signing). Decide inside the per-skill
  richness audit whether later zones earn zone-flavored rare moments;
  content-only if so.
- **Crafting-anchor consideration.** Record engineering's all-Eastbrook
  station and trainer placement as the deliberate hub design (pull rides
  the reagents), or give a later zone a station-side stake in the audit;
  and note the later-zone work-order economy is thin (one order each for
  zones 2 and 3 versus four in zone 1), a fill candidate.

- **Per-skill richness audit.** Build the matrix per skill (mining, logging,
  herbalism, fishing): nodes per zone and tier, tool ladder rungs and where
  each is obtained, base and fine materials, recipes consuming them, deeds,
  work orders, and the skill's signature moments (rare events, signed
  specimens, the koi). Find and fill the asymmetries: fishing has no fine
  analog (the koi and Slatefin are its specials; decide whether that is its
  stated identity and write it down), herbalism/logging/mining are today
  symmetric by construction (verify that is true through deeds and work
  orders too, not just nodes). Every fill is content-as-data plus its Book
  of Deeds records and wiki prose, per the repo's content rules.
- **The out-tooled work-order economics** (a phase 5 open item) lands here:
  either re-derive the reward from what the player actually hands over, or
  record the flat reward as deliberate friction. It is a content-tuning
  call inside this audit's scope.
- **The new-zone authoring checklist, derived-tested.** V3 makes the cap
  rise with zones, so a new zone must be mechanically complete on arrival:
  six nodes per type on legal ground, a tier assignment, materials plus
  fine grades with icons and i18n, a tool or rod rung if the zone opens a
  new tier, per-band catch tables that sum to 100, hub stocking per the
  hub rule, use requirements under the derived teaching ceiling (R22), and
  deeds and wiki prose keys. Per R23, the zone's TOP tool rung also names
  its content source (raid, dungeon, world boss, or their currency) and
  its hub deliberately does not stock it; the checklist asserts both. Write the checklist in this doc's successor AND encode
  it as a derived test over the zone registry, so shipping an incomplete
  zone reds the gate instead of relying on memory. This is the packet's
  guard philosophy applied to the future.
- **Cap-scaling design note.** Specify how `GATHERING_PROFESSIONS` caps
  derive from shipped zone tiers when zone 4 arrives (so the cap rise is a
  content consequence, not a constant edit), and what the character-sheet
  denominator, the gate ceilings, and the empty-hook schedule each do at
  the new cap. Design note in this phase; implementation rides the first
  new zone.

## Phase 12: UX polish, desktop and mobile (V-vision)

The "beautifully designed, incredible user experience" phase. Every item is
a small, already-identified gap; all visual changes carry before/after
screenshots (desktop and mobile) per the repo rule.

- **Gather-node tooltip grade preview** (phase 5 left it open): a player at
  a vein sees whether their tool upgrades the yield. Everything needed is
  in the tooltip's view core; one boolean plus one copy line, plus the
  `effectiveGradeToolTier` comment gains its promised third reader.
- **Respawn countdown in the node tooltip** (phase 3 deliberately deferred
  it): needs an `IWorld` member, the parity pin, and an i18n key; the `ncd`
  wire already carries the data.
- **Last-charge signal**: the resolve result's `depleted` flag is discarded
  today, so an effect expires silently. Surface it (FCT line or toast).
- **The prompt confirm flow** for tool effects, un-refusing `'prompt'` mode
  end to end (widen the seam signature back, wire the confirmation, update
  the HUD badge that was removed). Can ride with phase 10 if that is more
  natural.
- **Professions window `maxSkill`** (the phase 0 follow-up): it still
  renders the wire-sourced value and carries the "12 / 0" malformed-row
  exposure the character sheet was cured of. Same denominator sourcing fix.
- **Mobile audit of every professions flow**: vendor locked rows and their
  requirement lines, the crafting window's grade display, gathering cast
  and denial feedback, the fishing reel press timing feel at mobile
  latency, and tooltip reachability on touch. Fix what the audit finds;
  screenshots per surface.
- **Banner queueing** (phase 0 recorded ruling: a deed banner in the same
  tick replaces a level-up banner, last-write-wins): decide queue-or-keep
  and implement if queued. Behavior change, so it needs its own small
  design note.

## Phase 13: performance at 1,000 concurrent (V4)

Professions must stay flat-per-player at 10x today's population with more
zones coming. The whole-backend evaluation already found large headroom;
this phase pins the professions share of it with budgets and benchmarks, on
the server perf seams (`server/CLAUDE.md` "Hot paths").

- **Budgets, asserted in tests**: `ncd` and `tslot` bytes per player per
  tick under the delta rules (only-while-cooling, absent-keeps-prior); the
  per-command cost of the gather and fishing paths; per-player
  `nodeHarvestReadyAt` map size as node count grows with zones (bounded by
  live node ids); the D6 blob growth (deltas only for cooling nodes).
- **A load benchmark**: drive the authoritative server with synthetic
  gathering/fishing sessions at 1,000 connected players (extend the
  existing load rig) and record tick-time and broadcast-size percentiles as
  a checked-in baseline, so a future regression has a number to red
  against.
- **Zone-scaling projection**: assert the per-zone structures (nodes,
  catch tables, cluster map circles, vendor gates) grow linearly with zone
  count and none is rebuilt per-viewer per-tick without a cache; anything
  viewer-identical rides the cached-read seam.
- **Client side**: the professions HUD surfaces (vendor window, crafting
  grades, gathering readout, tooltip additions from phase 12) stay inside
  the per-frame budget in `tests/hud_perf_budget.test.ts`, on both painter
  buckets.

## Rulings ledger (settled 2026-07-27)

Settled by the maintainer directly:

- R1. **Branch**: everything lands on this branch; merge when the worklist
  is done. (V1)
- R2. **Skill identity**: content-unique only; no per-skill mechanics. (V2)
- R3. **Telemetry bands**: re-key by zone tier. Work item 8f.2.
- R4. **Koi odds**: 1/3/6 by band blessed; record the low-band trade as
  deliberate (8d.7).
- R5. **Cap**: rises with zones; checklist and cap-derivation in phase 11.
  (V3)
- R6. **Perf target**: 1,000 concurrent. (V4, phase 13)
- R7. **Purchase-versus-use** (open since phase 4): purchase-gate only.
  CLOSED, then AMENDED the same day by R22 after the zone-progression
  audit: the use-never-gated arm is reversed for land tools; the
  acquisition-stays-open arm survives (market, trade, mail, delve Marks,
  and now the counters themselves all sell freely; the wield is the gate).
- R8. **Rod training fees** (open since phase 6): the derived 4g/16g fees
  stand; the curve stays exception-free and more recipes will reach those
  rungs as the cap rises. Revisit only on telemetry. CLOSED.
- R19. **Fishing gets a teaching ceiling, mirroring the land curve.** The
  water's zone tier feeds the gain falloff so the climb itself pulls a
  player to better water; exact thresholds derived and pinned in phase 11.
  This authorizes extending the packet's D12 no-gain-changes scope for that
  one mechanic.
- R20. **The rod ladder stays fully buyable at Wilkes** (the phase 6
  buy-ahead fork is re-confirmed); rods stay proficiency-ungated. The
  teaching ceiling, not the counter, is what restores fishing progression.
- R21. **Author the missing Thornpeak gatherer deed** (phase 11); the marks
  are already written and unconsumed.
- R23. **Future-zone tools are unlocked through content, not counters**
  (direction for the expansion era, recorded 2026-07-27). When new zones
  ship their tool tiers, acquisition runs through raids, dungeons, world
  bosses, and their currencies (the shipped delve-shop route, clears gates
  plus Marks, is the prototype), because a tool you earned is more fun than
  a tool you bought. Shape questions deliberately left for the zone-4
  design pass, not decided now: whether content drops the tool itself or
  the recipe/reagent (the latter keeps engineering's craft ladder alive,
  the classic recipe-drop pattern); whether a craft route always coexists
  so pure gatherers are not forced into raid lockouts to progress their
  profession; and tradeability of earned tools (R22's use requirements
  make even tradeable trophies safe for the ladder). The new-zone
  checklist in phase 11 carries this: a future zone's top tool rung names
  its content source, and its hub deliberately does NOT stock it.
- R22. **Land tools gain USE requirements** (ruled later the same day,
  superseding R7's use-never-gated arm; R7's acquisition-stays-open arm
  survives and is strengthened). Tier-2/3 land tools require gathering
  40/70 to wield; tier-4/5 requirements are derived in-phase under the
  knife-edge rule (each requirement reachable on the previous tier's
  ground, derived and pinned like the 40/70 ceiling test). Rods stay
  exempt: the zone water gate plus the R19 ceiling are fishing's pacing.
  The vendor purchase gates become advisory display (every counter sells
  ahead freely, like Wilkes); enforcement moves to the harvest gate. This
  closes the audit's traded-tool bypass. Live-realm note: players who
  bought tier-2/3 tools before any gate keep them but must reach 40/70 to
  wield, amending phase 4's never-confiscated patch note; both thresholds
  are reachable entirely in zone 1.

Applied as maintainer-direction defaults (veto by striking the item):

- R9. Fishing slots and Springback Charm: refuse at the resolver until real
  behavior exists (8a.2, 8a.3).
- R10. Starter tools: repeat cadence plus truthful comment; trade stays
  open (8a.4).
- R11. `wood_mirefen_t2`: move it off the road (8f.1).
- R12. `biteBody`: fix the Silverstream number (8c.3).
- R13. Derived crafts-to-mastery test: yes (8b.7).
- R14. Copper Dig pathing arm: yes (8b.8).
- R15. Map-doc D2 policy note: yes (8d.8).
- R16. Restate the design record's open-rulings header: yes (8d.2).
- R17. Marks-to-copper conversion via delve tools: blessed as bounded and
  loss-making; record it (8d.7).
- R18. Reel-window cost to tier-1 anglers: blessed (mobile latency
  rationale); record it (8d.7).

## Still open after all of the above

Only the phase 10 design rulings (the acquisition craft's shape, its
recharge material identity, and the prompt-flow timing) and the release-time
locale fill (sized at 21 keys, 315 rows, see 8c.5).
