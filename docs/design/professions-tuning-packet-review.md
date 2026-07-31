# Professions tuning packet: the road to done (phases 8 to 18)

Status: worklist SETTLED with the maintainer (2026-07-28) after TWO review
passes. This file is the canonical worklist for phases 8 through 18, all
landing on `feature/professions-tuning-packet`; the branch merges only when
everything here is done, and the whole packet lands BEFORE the new maps
(past zone 3) release. As each phase lands, strike its items and record what
it settled, the same way `professions-tuning-packet.md` does. Each phase is
followed by its own QA packet run in a NEW session (phase N, then phase N
QA, then phase N+1).

Provenance: pass 1 ran 2026-07-27 (31 agents plus the four domain
reviewers) and produced the original phases 8 to 13. Pass 2 ran the same
day against the committed worklist: 5 finder rounds to dry, 3-lens
adversarial verification (228 agents over three resumed runs), a
completeness critic, plus a live track pass 1 never had (real desktop and
mobile boots with screenshots, the /wiki rendered end to end, an online
smoke over the real WebSocket protocol). Result: 86 additional confirmed
findings (2 blocking, ~33 should-fix, ~51 nits), one refuted, all folded
into the phases below. Per the standing rule, EVERY finding is addressed:
blocking, should-fix, and nits alike. Machine-readable verdicts with full
evidence lived in the review session; the work items below carry their own
anchors and rationale.

## How to run a phase (applies to EVERY phase below)

1. **Sync the base first.** `git fetch origin`, then merge the LATEST
   `release/**` branch (today `release/v0.32.0`; take the newest if a
   later one exists) into `feature/professions-tuning-packet`. Resolve
   conflicts, then run the `release-merge-audit` skill over the merge, and
   get `npm run gate` green BEFORE starting phase work. The project moves
   fast; never build on a stale base. (Pass 2 found the branch a full
   release generation stale with no re-sync scheduled anywhere; this
   preamble is the fix.)
2. **Model and effort.** Each phase header names the recommended build
   session mode (Fable at the stated effort, or ultracode) and the QA
   session mode. Never `max` effort; it overthinks structured work.
3. **QA cadence.** The QA phase runs in a NEW session, reads this doc and
   the phase's diff, and applies the full gate: `/qa`, the named domain
   reviewers, and an adversarial what-is-missing pass. Its findings are
   ALL applied (blocking, should-fix, nits), then the fixes themselves are
   reviewed (fixes are unreviewed code until they are).
4. **Screenshots** for any visual change, desktop and mobile, committed
   under `docs/screenshots/` per the repo rule.

## Old to new phase numbering

| Old (pass-1 doc) | New | Notes |
|---|---|---|
| 8 (closeout) | 8 | Same identity, scope amended, 8c extracted to 17 |
| 9 (D6) | 9 | Widened to the whole professions blob |
| 10 (acquisition craft) | 12 | After the rulings checkpoint and compat work |
| 11 (content/zones) | 13 | Gains the onboarding and direction work |
| 12 (UX) | 14 | Gains gamepad and accessibility |
| 13 (perf) | 16 | Load rig acknowledged as from-scratch |
| (new) | 10 | Sim lifecycle + fishing telemetry |
| (new) | 11 | Stale-client and rollout compatibility |
| (new) | 15 | Ops: GM tooling and the activity feed |
| (new) | 17 | The wiki truth pass + the release locale fill |
| (new) | 18 | Final gate |

## Vision (unchanged from pass 1)

The target: a unique feature that sits between WoW and RuneScape,
beautifully designed, with an incredible experience on desktop and mobile.
V1 everything lands on this branch. V2 skill identity is content-unique,
not mechanics-unique. V3 the proficiency cap rises with zones. V4
performance is engineered against 1,000 concurrent players.

## What the two passes established as sound (do not re-audit)

- Every diagnosis number in the design record holds at HEAD; no
  determinism break (exactly one rng call site changed in the whole diff,
  a dead removal); wire and IWorld parity fully verified; server authority
  holds on every new bonus; grade substitution cannot double-spend.
- Server hot paths are clean and bounded: per-viewer `ncd` capped at the
  node count and allocation-free when unchanged, layered rate limits on
  every packet command, bounded telemetry cardinality, denied requests do
  linear bounded work.
- Persistence normalization is robust against malformed blobs (verified on
  the real load path); the packet's own new guard tests were spot-checked
  as mutation-decisive (vendor gate, env gate).
- The balance ladder is coherent; the rod tooltip's reel numbers are
  CORRECT (0.75 s per tier plus 0.25 s per rarity rung); `sellAllJunk`
  sweeps quality `poor` only, so fine grades are safe from the Sell Junk
  button (guarded by `tests/crafting_materials_quality.test.ts`).
- The live track saw the vendor gate, delve shop, tool-effect row,
  professions window, Book of Deeds rows, fine-material icons/tooltips,
  and the whole /wiki render correctly on desktop and mobile.

## Rulings ledger

R1 through R23: unchanged from pass 1; see the ledger at the bottom of
this file. The two former open rulings (rod fees R8, purchase-versus-use
R7 as amended by R22) stay CLOSED.

New rulings, settled with the maintainer 2026-07-28 (do not re-litigate):

- **R24. Signed specimens are spent LAST.** Quest turn-in consumption
  prefers plain stacks and takes instanced (signed) copies only when no
  plain copy remains, mirroring `removeVendorSellUnits` and
  `removePreferFungible`.
- **R25. Land harvesting gains the in-combat and swimming denials** that
  `startFishing` already enforces. The asymmetry is unexplainable to a
  player.
- **R26. The reel press is exempt from the in-combat gate.** Casting stays
  combat-gated; a bite answered inside the window lands even if something
  aggroed during the wait. (The cast itself still breaks on damage.)
- **R27. Harvesting and fishing break stealth, and action-locked
  shapeshift forms refuse both.** Classic behavior.
- **R28. A live gather or fishing session cancels on every teleport**
  (dungeon/delve entry, jail, revive) and when `/follow` tows the player
  across a zone line. The rod-tier gate reads the WATER'S zone, not the
  caster's, so a cross-boundary cast cannot dodge it.
- **R29. The queued-spell buffer clears when a gather or fishing session
  starts.** No spell fires unprompted when the session ends.
- **R30. Recharge re-derives the charge maximum** from the best tool the
  owner holds AT RECHARGE TIME. The slot-time mint stands as-is, so a
  borrowed epic pick buys one inflated fill at most, never a permanent
  ceiling.
- **R31. The Thornpeak tier-1 faucet is ACCEPTED and recorded** as a
  deliberate traveler reward: bounded by six nodes, the 240 s respawn, and
  a zone that is lethal to a level-1 while alive. Watched via the
  zone-keyed harvest telemetry. Additionally: no skilling while dead
  (already enforced; gains an explicit test pin so it cannot rot).
- **R32. The Copper Dig camp stays exactly as shipped.** Leveling up
  before working the dig is the intended path; no placement guarantee for
  the intro quest. The southwest-to-southeast direction fixes still land
  (quest text and wiki). Veto-able default: the wiki "Where to start"
  wording gains a soft danger hint in phase 17; the quest text does not
  change.
- **R33. Tier-3 danger placements are deliberate** (the vein near the
  world boss spawn, `wood_thornpeak_t3b` inside Marrowlord Varkas's
  aggro): allowlisted in the placement-margin test with a comment naming
  the intent. The Grix-adjacent tutorial veins are the exception and get
  spacing fixes, because Grix's level-scaled aggro means those veins force
  the named fight at ANY level, which is not "level up first".
- **R34. Stale clients get GUARDS, not a version floor.** Old clients
  degrade gracefully; the iOS binary ships before this packet deploys; a
  hard version floor is a separate later decision.
- **R35. GM tooling v1 is the minimal pair:** inspect a player's
  professions state, restore a lost item or slot row. Nothing more yet.
- **R36. The 1,000-concurrent baseline is recorded on the maintainer's
  Mac**, with the hardware named in the baseline file. No prod-shaped
  validation run in this packet.
- **R37. Editor and custom-map professions are DEFERRED.** The new maps
  (past zone 3) ship with no professions content at all until the zone-4
  design pass. A derived guard asserts that no zone or map beyond the
  built-in three carries professions nodes or stations; the phase 13
  new-zone checklist is what flips that guard from assert-absent to
  assert-complete when a future zone ships its professions content.
- **R38. Banners QUEUE instead of last-write-wins** (about 2.5 s each,
  level-up first, then deeds). Pass 2 confirmed live that a fresh
  character's very first level-up banner is replaced by the First Steps
  deed banner.

Structural decisions, same sitting: the phase numbering in this file
supersedes the old 8-to-13 numbering everywhere; fishing telemetry rides
phase 10 so data accumulates early; the acquisition-craft design decisions
(recharge material identity, prompt-flow timing) were settled at the
rulings checkpoint before phase 12 (R39, R40 below).

Rulings checkpoint additions, settled with the maintainer 2026-07-28
(the checkpoint sitting; do not re-litigate):

- **R39. Recharge prices in the arcane material of the tool's rarity
  rung, with the count scaled to the charges restored.** The material
  identity reuses the disenchant ladder keyed on the R30-resolved tool
  rarity (dust for common and uncommon tools, essence for rare, shard
  for epic); the count derives from the fill size (roughly 2 to 5), and
  both existing discounts compose into the count unchanged. Exact
  constants are build-time tuning; the shape is the ruling. The arcane
  family is the identity because all three effects are Enchanter work,
  none of its materials is vendor-stocked (no copper bypass), and the
  shard gains its needed second sink.
- **R40. The prompt confirm flow ships with phase 14, WHOLE.** Phase 12
  ships the craft always-only. Phase 14 ships the resolver widening
  (the one-line mode refusal), the `IWorld` facet widening plus the
  parity pin, the confirm wire surface in both worlds, and the HUD
  dialog with its mobile, gamepad, and accessibility treatment, in one
  change; it also retouches the two comments that tie the re-widening
  to the acquisition craft (`src/world_api/professions.ts` and the
  design record). No inert half ships.
- **R41. An absorbed hit still counts against a live gather or fishing
  session: cancel AND displace.** A knockback-carrying hit that is
  fully absorbed cancels the session exactly as an unabsorbed hit does,
  and its displacement stands; no absorb-conditional physics branch.
  Closes the shield-and-gather-through-mobs hole the R31 acceptance
  otherwise leans on.
- **R42. Charge depletion is conditional on the bonus mattering.** A
  charge is spent only when the effect actually changed the outcome
  (the extra unit really granted, the grade outcome really different),
  computed from the same rng draw with no extra draws; R39 pricing
  assumes no waste.
- **R43. `deleteCharacter` purges the deleted character's world-state
  footprint, in this packet.** Market listings, escrow collection, and
  mail must not stay in the realm blob permanently uncollectable
  (`deleteCharacter` in `server/db.ts` today touches none of them).
  Elevated from a phase 9 QA follow-up to packet scope by the
  maintainer; lands in phase 10.
- **R44. Linkdead sessions stop accruing playtime points, in this
  packet.** The activity window and the disconnect grace are both
  exactly five minutes and `lastInputAt` is never written on socket
  drop, so a linkdead player earns the durable grant for essentially
  the whole window; the fix direction (write `lastInputAt` on drop, or
  gate the grant on a live socket) is the build's choice. Elevated from
  a phase 9 QA follow-up to packet scope by the maintainer; lands in
  phase 10.

Build-decided rulings (phase 12; recorded per the new-rulings process,
veto-able by the maintainer, the R32 pattern):

- **R45. The mint's item route.** The two live effects exist as charm ITEMS
  whose ids equal their effect ids (rare tool-kind defs, sellValue only,
  never vendor-stocked), minted by the game's first enchanting recipes:
  enchanting-homed for skill and specialization identity, TOOLWORKS-bound
  for the station, trainer-taught at tier 1 (skillReq 25) with the trainer
  route resolving through the recipe's own station binding
  (`trainingStationTypeFor`), since enchanting keeps no station of its own.
  Slotting consumes one charm through `resolveSlotToolEffect`, the one mint
  authority; the copy preference is self-signed, then unsigned, then the
  first foreign signature, and the consumed copy's `signer` (a character
  NAME, the craft signing rule's own identity) becomes the slot's
  `craftedBy`. Rare def quality is load-bearing: it is what makes every
  crafted copy signed. No Springback item or recipe exists, derived from
  the R9 policy and pinned both ways. Signed charms trade hand to hand
  only (instanced copies are market- and mail-excluded by the standing
  rules), accepted and recorded.
- **R46. The recharge surface.** Owner-performed, instant behind the shared
  crafting-action window (the ticks dimension of the old placeholder cost is
  RETIRED; every enchanting-family action is instant behind that window),
  no skill gain and no XP. It refuses with no real tool owned for the
  profession (the R30 rarity cannot resolve), at or above the re-derived
  maximum (the inflated-mint fill persists but is never renewed), and on
  the shared throttle; the insufficient-materials refusal carries the
  priced material and count so the cost is legible without a preview
  surface. Count formula: ceil((charges restored / 10) x the composed
  discount), floored at one; the mint-exceeds-recharge inequality is pinned
  per effect per reachable rarity rung, at the DISCOUNTED mint price (a
  specialized enchanter's floor(count x 0.8) consumption is the arm that
  actually competes with a recharge, and pricing only the listed counts let
  it undercut the epic recharge until the adversarial pass caught it).
  A byte-equal re-slot is refused outright (`no_gain`): a re-slot that
  changes nothing would burn a whole charm, and a double-click reaches it.
- **R47. The recharge PRICE rung is floored at the slot's own ceiling, and
  the ceiling is a high-water mark.** R39 read alone made the price a
  bag-state choice, because the per-charge price climbs steeply with rarity
  while the charge buys the same bonus at every rung: the adversarial pass
  found that an epic-tool owner could bank the pick, refill at the dust rung
  for about a ninth per charge, and withdraw it (and, staged as ascending
  partial fills, complete an epic-cap refill for a third of its price),
  which retires the shard sink R39 exists to feed. So the FILL stays R30's
  (sized by the tool held now) while the PRICE rung is the higher of that
  tool's and the one the slot's stored maximum implies, and a lesser tool no
  longer lowers that maximum. Consequences, all deliberate: a downgraded
  owner pays their old rung until they re-slot a fresh charm (the charm is
  the toll, and it costs more than any recharge); a slot beyond what the
  carried tool can fill refuses as `tool_capped` rather than "already full",
  so the line can point at the tool; and R30's own guarantee is unchanged,
  since a borrowed epic pick still buys exactly one inflated fill. THE
  USE-TIME ARM, added when the fix review found the residual: the ceiling
  also RATCHETS at harvest time, to the rung of the best tool owned while
  the effect actually fires, because minting low with the good pick stashed
  otherwise kept dust prices forever (node access forces the pick to be
  CARRIED, so taking the bonus and dodging the price cannot coexist; the
  mint-low route dies on the first bonus-bearing harvest). The re-slot toll
  stays the sanctioned way DOWN, including at exactly-full durability and
  for provenance upgrades (the no_gain refusal compares the FULL minted
  outcome: ceiling, charges, and craftedBy). ACCEPTED residual: a transient
  better tool in bags during a recharge raises the ceiling for that fill
  and latches it (couriering a friend's pick while topping up); no gain for
  anyone, self-inflicted, escapable by the same re-slot toll, and a cost
  preview is phase 14's surface. SURFACED for the maintainer: this makes
  the earned maximum a permanent price floor, a stronger reading of "never
  a permanent ceiling" than R30 wrote; the alternative (accept the
  arbitrage) was not taken because it guts the ruling's stated sink.
  QA AMENDMENTS (phase 12 QA, same veto-ability): (1) the use-time arm
  reads BOTH ends of the cast, a start capture plus the completion bags,
  because trade has no casting gate and a mid-cast handoff could
  otherwise fire the bonus with the pick already gone ("node access
  forces the pick to be CARRIED" is true only at cast start); the QA
  round's economics analysis found the dodge also forfeits the
  completion-read fine grade, so its payoff was marginal, and the
  capture closes the class structurally (trade, bank, or mail, solo or
  two-client) rather than leaving the premise false. (2) The ACCEPTED
  transient-courier residual covers the HARVEST-TIME sibling too: a
  courier's better pick in bags while the bonus fires latches the
  ceiling on that harvest, same acceptance grounds (no gain for anyone,
  self-inflicted, escapable by the re-slot toll, preview is phase 14).
  (3) Confirmed as the ruling's letter: the ratchet fires on every
  APPLIED use, mattered or not (an Artisan's Eye that changed nothing
  still latches), the same family as the courier residual.
- **R48. The no_gain provenance arm is DIRECTIONAL, and the viewer's own
  provenance crosses the wire as a boolean.** QA-round-decided, veto-able
  (the R45 pattern). Recharging is owner-performed (R46), so
  `isOriginalCrafter` can only ever match the OWNER: a craftedBy rewrite
  is economically real only TOWARD the slotter's own signature. The
  security pass found the symmetric compare let a double-click whose
  first click consumed the last self-signed copy burn a FOREIGN copy
  next and silently retire the owner's discount; the arm now lands a
  full-slot re-slot on a provenance change only when the consumed copy's
  signer IS the slotter and the slot's recorded crafter is not
  (downgrades and laterals refuse as no_gain, including the
  formerly-accepted unsigned-copy provenance clear). Because the
  directional compare only ever tests craftedBy against the viewer's own
  name, the window's affordance achieves EXACT resolver parity from a
  privacy-preserving `selfCrafted` boolean on the tslot projection (the
  name itself still never crosses; the identity-free pin stands), which
  closed the phantom-button drift three review streams found
  independently. The window's focus fallback also stops re-parking on a
  DIFFERENT action button (every row action spends; a held Enter's
  repeats once retargeted from a vanished Recharge onto Slot and burned
  a charm): the ladder is now the same control, then Close, with a
  sent-guard on each painted button.

Build-decided rulings (phase 13; recorded per the new-rulings process,
veto-able by the maintainer, the R32/R45 pattern):

- **R49. The fine-grade tier reads the WIELD-FILTERED scan, in lockstep
  with the access gate.** The grade resolution
  (`effectiveGradeToolTier` through `harvestYieldItemId`), both capacity
  pre-gates, the grant's own scan, and the cast speed all read the best
  WIELDABLE tool, so a traded tier-4 pick a player cannot swing mints no
  fine grade and buys no speed: the exact traded-tool bypass R22 exists to
  close, applied to value as well as access. The PRICE family deliberately
  stays ownership-based (R30's letter): the R47 use-time ratchet and the
  recharge rung keep reading the best tool OWNED, since they price rather
  than gate, and filtering them would let an unearned tool dodge its price
  rung. SURFACED for the maintainer, found by the phase's adversarial
  round: the slot MINT's starting charge count also reads ownership
  (R30's slot-time letter), so an unearned epic pick in the bags fattens a
  charm's mint from 20 to 50 charges, a VALUE effect on the ownership side
  of the line; the alternative (wield-filtering the mint size) would
  re-rule R30/R45 and is left as the maintainer's call, with the harvest
  gate's comment stating the boundary precisely.
- **R50. The corpse premium arm reads the wield-aware ANY-profession
  scan.** Each land profession's contribution filters by its own counter,
  a rod contributes unfiltered (the R22 exemption), bare hands still floor
  the scan at tier 1, and the plain grant stays ungated. Zero behavior
  change in shipped content (every wave-one family is tier 1); the seam is
  pinned at source plus a raised-family-tier negative
  (`tests/corpse_harvest_sim.test.ts`). SURFACED beside it, same
  adversarial round: through the rod exemption a purchased or traded rod
  covers ANY future tier-2+ monster-material family at zero proficiency
  (rods reach tier 5), a pre-dodged seam the moment such a family ships;
  whether the exemption should extend to the land-side corpse surface is
  the call to make WITH that family, named here so it cannot ship by
  omission.
- **R51. The wield ladder is 40 / 70 / 85 / 100 for tiers 2 to 5, one
  frozen table.** `WIELD_REQUIREMENT_BY_TIER`
  (`src/sim/professions/wield_gate.ts`) is the single source; the vendor
  advisory constants alias it. Knife-edge derivation pinned against the
  live curve (`tests/professions_tool_gate.test.ts`): tiers 2/3 strictly
  under the tier-1 teaching ceiling with margin, tier 4 at least five
  under the cap (tier-2+ ground teaches to the cap at quarter gain), and
  tier 5 AT the cap deliberately: the masterwork rung asks for the
  mastered counter, reachable by construction. The `gatherDenied` event
  gained the additive optional `wieldProficiency` field (present exactly
  when a covering tool is carried and only the counter is short, valued at
  the smallest requirement unlocking something carried); old bundles
  render their tier-based copy, wording-misleading only, the phase 11
  stale-client doctrine.
- **R52. The craft-mastery prose target MOVES to the measured band; the
  curve stays.** The authored 10-to-20 focused hours predated the v0.32.0
  expansion (ten starter zones re-grant thorium and one re-grants iron
  from tier-1 nodes: the all-zones supply arm prices the same bill at
  about 2.8 conservative gather hours, floored at 2 as the
  trivially-short alarm) and predated the #2387 Battlefield Experience
  attribution fix; the all-levers climb measures nearer 1 to 3 gathering
  hours plus cast, throttle, and travel. The record now states roughly
  1.5 to 5 focused hours. Moving the CURVE instead was declined: the
  pre-approved material-quantities lever (named in the record for the
  maintainer) would need a 4x-to-9x sweep late in the packet, rippling
  through the recipe economy and R46's mint inequality, and would fight
  the expansion's own supply design; the durable supply-side answer is
  the zone-4 pass re-tiering the starter faucets (R37's owner).
- **R53. The work-order calls: later-zone thinness is deliberate, and the
  out-tooled flat payout stands.** Orders are a per-station-master
  convention (four masters in Eastbrook, one each in Fenbridge and
  Highwatch), so the distribution follows the crafting-anchor record;
  filling it would need non-master givers or later-zone stations, both
  declined. The flat payout stays deliberate friction: substitution keeps
  every order farmable for a fine-only player, the order's real pay is
  its XP and cadence, the coin sink survives by construction, and the
  surrendered value is bounded per window. Both recorded in
  `docs/design/professions.md` beside the conventions they interpret.
- **R55. Farshore Isle gains Gull Mere, real fishable water.** The
  fishing-town-themed starter zone shipped with ZERO fishable water (the
  Hilltop Spring's bed is re-raised above swim depth by the Crown dome's
  +14 lift, and open ocean is never a water body), so its tier-1 rod row
  was decorative: the merge-settlement checkpoint's probe sweep proved it
  and handed the authoring here. The experiment swept the whole rect: the
  entire inland approach from Gullhaven sits in the dome's shadow (the
  first fishable basin appears about 100 yards from the dome centre, and
  the hub is 102.6 from it), a radius-14 lake has NO fully-inland
  footprint anywhere on the isle, and the north downs carry the only
  clean basins. Gull Mere lands at (350, 118) radius 10: 82 percent of
  the disc fishable at the world-wide canonical -7.60 bed, a complete
  castable walkable shore ring, a 1.28-steepness walk from the hub, every
  hazard gap measured and recorded at the lake's authoring comment, and
  the water flora census re-minted (one new region, 3 lilies, 5 reeds).
  The zone stays R37-starter otherwise: tier-1 rod row now real, catch
  table still the Vale fallback until the zone-4 re-tier.
- **R54. Fishing's identity has NO fine-grade axis, and rare-moment
  flavor stays zone-agnostic.** The richness audit's two decisions,
  written into the design record: fishing's specials are its
  zone-exclusive catch ladder, the koi, the Codfather, the Slatefin, and
  the empty-hook rhythm, with the rod ladder, band tables, and the R19
  ceiling as its pacing; a fine-fish axis would duplicate what the band
  tables already express and was declined. Rare-event flavor and signing
  stay type- and proficiency-keyed on the one shared cadence knob;
  zone-flavored moments ride the zone-4 pass with a signature material
  family.

---

## Phase 8: base repair and review closeout

Build: Fable xhigh. QA: ultracode, new session.

The phase that makes the branch trustworthy: CI actually green off-mac,
base re-synced, and every pass-1 closeout item with its pass-2 scope
corrections.

### 8.0 Unbreak CI and the base (do these first)

1. **Icon `--check` platform strategy** (BLOCKING). The fine-material and
   rod icon checks do byte-equality against a fresh sharp render
   (`scripts/assets/fine_material_icons.mjs`,
   `scripts/assets/rod_tier_icons.mjs`), and sharp/libvips renders
   different bytes on linux-x64 than the committed darwin bytes
   (empirically reproduced in a linux/amd64 container with the identical
   sharp/libvips versions; 6 of 11 icons differ).
   `tests/material_grades.test.ts` and
   `tests/professions_rod_recipes.test.ts` execFileSync the checks
   unguarded and CI runs `npm test` on ubuntu-latest, so the FIRST PUSH of
   this branch reds CI. Pick and implement one: platform-keyed committed
   bytes, a CI-side regeneration step, or a structural-equality check
   (decode and compare pixels within tolerance) instead of byte equality.
   While there: unify the two checks' node spawn (one uses `'node'` from
   PATH, the other `process.execPath`).
2. **Release re-sync now, and every phase hereafter** per the How-to-run
   preamble (the branch is currently a full release generation stale).
3. **The R37 guard**: a derived test asserting no zone or map beyond the
   built-in three carries professions nodes, stations, catch tables, or
   vendor professions rows. Written so the phase 13 checklist can flip it
   per-zone to assert-complete later.

### 8a Sim correctness (amended)

1. Cast-start capacity pre-gate resolves through the slotted quality
   effect (`harvestYieldItemId`) so start and grant agree (pass-1 8a.1,
   confirmed 6x).
2. Refuse Springback Charm and fishing slots at `resolveSlotToolEffect`
   (pass-1 8a.2/8a.3) AND at load: `normalizeToolEffectSlots` validates
   against the catalog but never consults resolver policy, so persisted
   refused rows would survive a restart. The refusal needs both arms, and
   the load arm drops the row the same way retired ids are dropped.
3. Starter-tool mint (pass-1 8a.4, RE-SCOPED): the cadence alone cannot
   bound the mint, because the grant fires in `finalizeQuestAccept`
   whenever the bags-only count is zero and cadence arms only in
   `turnInQuestCore`, so bank-the-tool, abandon, re-accept loops forever.
   The fix gates the re-grant on a predicate spanning bank, mail, and
   market escrow (exactly what the `items.ts` comment already prescribed),
   plus the cadence for the turn-in loop, plus the truthful comment
   rewrite.
4. `delveBuy` gains the `canAddItem` capacity gate its sibling `buyItem`
   has (pre-existing; the packet newly pointed tools at it).

### 8b Guard and pin work (amended)

Pass-1 items 8b.1 through 8b.8 unchanged (stock-table sweeps, hub rod
rows, tier-ramp non-vacuity, dist2d sweep, tool-less fine boundary, real
access pin, derived crafts-to-mastery, Copper Dig pathing arm). Added:

9. Pin the slot-owner two-draw contract at the COMMAND boundary (drive
   `harvestNode` with a slotted effect owner and count draws), not only at
   the unit level.
10. Deduplicate the placement test's re-declared threshold constants so a
    content change cannot silently diverge from the guard.
11. Pin no-skilling-while-dead (R31) for harvest and fishing both.
12. The R37 guard from 8.0 item 3 lands with per-table non-vacuity arms.

### 8d Prose, comments, and doc corrections (amended)

The enumerated pass-1 list (items 1 through 14) stands, MINUS the items
this rewrite already fixed in place (the six-goldens wording, the 8c.4
pointer, the three-versus-four site count, the phase 11 checklist
clarifying clause). Added, and the acceptance criterion CHANGES: finish
with a grep-based sweep for superseded phrasings (purchase-gate language,
"Wilkes exclusive", "parked, do not wire", "no trainer fee", "sells
osmium/thorium ore", rng-consumption wording), not just the enumerated
list. New known sites the sweep must catch:

- The third stale rod-rule comment in `tests/professions_tool_gate.test.ts`
  (pass-1 8d.11 said "reword both"; there are three).
- `src/sim/professions/training.ts` still cites the rod-fee ruling as
  open; R8 closed it.
- `src/ui/npc_service_range.ts` claims the vendor window is never
  repainted; the packet's own vendor work disproves it.
- The deleted `GATHERING_NAME_KEYS` symbol named in
  `tests/professions_window_focus.test.ts`.
- The two recipe comments claiming Darva and Hesk sell tool reagents
  (`src/sim/content/recipes.ts`, the tannery and forge blocks); phase 1
  delisted those rows.
- The 5,300 c solo income figure: re-derive it with a stated exclusion
  set, or replace the literal with the derivation (pass 2 could only
  reproduce it under an inconsistent set).
- D7's text and the two `docs/design/professions.md` passages that still
  describe the superseded purchase-gate-only model (R22 changed it).

### 8e Hygiene (amended)

Pass-1 items (unused imports, `Object.hasOwn`, narrow the
`IWorld.slotToolEffect` signature, freeze `VENDOR_ROW_GATES`) plus:

5. Record as ACCEPTED: the offline console handle can call
   `slotToolEffect` ungated (a player cheating their own offline world is
   /dev-equivalent; no gate, one comment).

### 8f Content and telemetry (unchanged)

1. Move `wood_mirefen_t2` off the road (R11), with the combat-golden
   caveat recorded in pass 1.
2. Re-key the harvest telemetry bands by zone tier (R3).

---

## Phase 9: node persistence and blob integrity

Build: Fable xhigh. QA: ultracode, new session.

BUILT 2026-07-28. QA COMPLETE 2026-07-28 (ultracode, new session): the
full-range pass ran qa-checklist, cross-platform-sync,
database-performance, privacy-security, and test-coverage reviewers plus
five fresh lenses (two correctness deep-dives found nothing) with
per-finding adversarial verification; zero behavior defects. Every
finding was applied (1 test-pin blocking: the mastery-reset drop guard's
flag-ABSENT arm, the shape every real pre-curve save has, was untested;
plus should-fix and nit rounds), 16 mutations were each killed by the
arm built for them, and the fix round itself was re-reviewed by three
fresh lenses (one false comment invariant caught and corrected: the
transition rule's prune and baseline commute). Notable QA additions: the
shared `applyPairTransitionTierMail` extraction, the write-versus-load
respawn-ceiling coupling sweep with its 240 s coincidence guard and
record-size tripwire, the blob sweep's `equipmentInstance` column, the
corrected linkdead narrative (the ~30 s autosave covers linkdead
sessions; the cast-in-flight crash corner rolls back timer and yield
together, value-neutral), and DEPLOY.md's professions rollback bullet.

What each item settled:

D6 landed as scoped: `src/sim/professions/node_persist.ts` (remaining-time
deltas, the `cooldown_persist.ts` scheme) plus the optional zero-default
`CharacterState.nodeHarvestCooldowns` field; the `addPlayer` re-anchor is
filtered to live node ids and clamped to one respawn; the session-only
comment sites were corrected; `tests/professions_node_persist.test.ts`
pins the round trip, the freeze across logout, the retired-id drop, and
the field omission. Zero wire changes (`ncd` untouched) and no offline
site (only the server persists characters). The freeze is the logout
frame's; a linkdead drop safety-flushes a drop-time freeze that the
autosave and grace-expiry saves overwrite (a crash in grace makes the
last-landed save durable; timers running at a save only ever err toward
a longer wait, and the cast-in-flight crash corner rolls back timer and
yield together, value-neutral).

1. DONE: `tests/professions_blob_roundtrip.test.ts`, a presence-pinned
   literal field list, a byte-faithful one-cycle sweep per field, and a
   whole-blob fixed point (which also catches non-idempotent load
   transforms for fields the list has not learned about yet), built on the
   `toolEffectSlots` fixed-point contract rather than re-deriving it.
2. DONE: one shared "rollback erases newer fields" note in the design
   record covers `toolEffectSlots`, both clamp-on-load fields
   (`normalizeGatheringProficiency` AND `normalizeCraftSkills`, each with
   a cap-raise-caveat pointer at the clamp site), and the new
   `nodeHarvestCooldowns` key; the mechanical fix rides the first cap
   raise. The sweep's clamp arm pins the mechanism to the shipped caps.
3. DONE: `serializeCharacter` folds still-queued grants into BOTH
   persisted proficiency keys via `foldPendingGatherGrants` (one clamp
   rule shared with the tick drain). The live queue is untouched, so the
   drain doctrine (tick path only) holds; covers every save, not only
   leave (autosave and linkdead grace-expiry included).
4. DONE: `pruneTierMailToActiveMajors` runs on every transition entry
   point (the quest attunement path and both legacy wrappers, via the
   shared `applyPairTransitionTierMail` rule) and on load (healing stale
   pre-prune saves); a craft shared by the old and new pair keeps its
   entry, so no live crossing is swallowed.
5. DONE: the `craftThrottle` comment now cites `lastActiveTick` and
   records that its session-only status is deliberate, unlike the
   now-persisted `nodeHarvestReadyAt`.

---

## Rulings checkpoint (before phase 10)

RUN 2026-07-28, one sitting, no build. Preamble: origin fetched, the
latest release was still `release/v0.32.0` with its tip already an
ancestor of the branch (no merge, nothing for the release-merge audit),
and the full gate was green at the entry tip before checkpoint work.

Encodings: all fifteen of R24 to R38 were verified against the shipped
branch, one adversarial verifier per ruling, ZERO mismatches. Three are
encoded-correct in the shipped work with their remainders correctly
scheduled (R31: zone-keyed telemetry plus both no-skilling-dead pins
shipped, the node-tier label rides phase 10; R32: camp untouched, the
direction fix in phase 13 and the danger hint in phase 17; R37: the
derived rollout guard with per-table non-vacuity and the per-zone flip
shipped, the active-content unification rides phase 10). The other
twelve are correctly scheduled with their code premises re-verified in
the tree (R24 to R29 in phase 10, R30 in phase 12, R33 in phase 13,
R34 in phase 11, R35 in phase 15, R36 in phase 16, R38 in phase 14).
One comment-truth note for the phase 10 build was recorded on its
item 5.

Decisions: R39 (recharge material identity), R40 (prompt confirm flow
placement), R41 (the absorb rule phase 10 item 7 awaited), and R42
(the depletion arm phase 12 item 5 awaited) were settled with the
maintainer; R43 and R44 were added when the maintainer elevated the two
phase 9 QA follow-ups (the `deleteCharacter` world-state orphan and the
linkdead playtime-points grant) into packet scope, both landing in
phase 10. Full text in the rulings ledger above.

Anything phases 10 to 17 discover that needs a new ruling still gets an
R-number in the ledger rather than an inline decision; this ledger is
the channel pass 2 found missing.

---

## Phase 10: sim correctness and session lifecycle (+ fishing telemetry)

Build: ultracode (many interacting exit paths; fan out per path and
adversarially verify). QA: ultracode, new session.

QA COMPLETE 2026-07-28 (ultracode, new session), over the whole build
range on a fresh release/v0.32.0 re-sync (merge audited clean by seven
lenses; one nit applied: the phase 13 mastery-hours note gained the
battlefield-credit caveat). The pass ran qa-checklist plus all seven
domain reviewers including the never-before-dispatched
frontend-seam-reviewer, plus eight fresh lenses (session exit paths,
mail/name-reclaim attack sequences, telemetry, item-clause completeness,
combat semantics vs the rulings, hobby integrity, turn-in gates, and the
what-is-missing pass), with per-finding verification and thirteen
mutation checks each killed by the pin built for it. Verdict: the build
is sound (zero behavior defects on the enumerated items; the exit-path
lens independently re-enumerated all 32 position-write sites and found
every one wired, excluded by the stated scope, or arena-family-reset).
Applied findings, most severe first: the name-reclaim rekey now uses the
holder's STORED casing (the db returns freedName; both create arms pass
it; a case-variant reclaim used to strand the orphan's name-keyed rows
for a future exact-case holder, the same escrow class 58ab0a134 closed)
and runs the rename path's THIRD rekey, the instance-signer sweep over
the orphan's blob; the mail purge's return arm moves the unread count
off the legacy name bucket before normalizing (a 58ab0a134 regression:
the freed name's next holder read a permanent phantom unread badge);
the duel-terminal cancel gained the tail's self-hit exclusion (the
Cauterize self-burn can land the clamped blow) and now emits in tail
order (damage, then castStop); zoneAt regained totality on a zero-zone
content; the banker-chest collider walk joined the active-content read
it had half-missed; the successful-reel clear-after-completion ordering
got the cross-boundary pin that the whole suite was blind to (the one
BLOCKING test gap); a new parity scenario drives the real
startFishing-bite-reel path (3 draws pinned; no other scenario called
startFishing); the legacy CREATE arm's reclaim rekey got the source pin
its DELETE sibling had; the acceptArchetypeQuest restore proved LIVE
(reachable after a normalizer reset) and is now pinned; plus the S3
corpus rows for both new sim modules, the whiffed-swing kind negative,
the zonesReadout swap test, the save-skip and armed-reel and
approve-direction arms, the ClientWorld-to-preview composition test,
and the comment/doc honesty fixes (band-drift edge, harvest-counter
label migration note, rename-stamp consequence, reclaim crash window).
The recorded gather_node_interact pre-verdict question is JUDGED: keep
the round-trip; do not mirror the new deny arms into the client
pre-verdict (the client has no own-inCombat truth online, a false
client refusal is the fairness-shaped failure, the pattern's arms are
durable facet-backed facts, and fishing has no pre-verdict at all);
premise correction: three new deny arms, not four (stealth is a
break-on-success side effect, not a denial). Recorded-only additions:
system mail with attachments is immortal and the realm blob rewrite is
linear (dev book already 1879 letters; separate issue with a
woc_mail_letters gauge recommended); the release-inherited friendAdd
blocker-detection oracle (#2437); the reclaim FOR UPDATE dedupe-probe
planning cost; lastPlaytimeGrantAt unpruned growth; the concurrent
same-name create 409-though-free wart; professionSurfaceRefreshSig
omits questedHobbies (correct today, a trap when a new consumer lands);
and the hud/terrain builtin-ZONES family zoneAt's unification widened.
The fix round was itself re-reviewed by three fresh lenses (source
correctness, pin quality, conventions and record accuracy), and their
findings applied in a second wave: the purge and the signer-sweep save
now swallow-and-log like the sibling save wrappers (a throw after the
committed DELETE or reclaim used to 500 the request and, on the
reclaim, skip the create retry), the duel-arm comment's zero-amount
claim was corrected (a loser at exactly 1 hp clamps to an emitted 0),
the phantom-unread test pins its name-bucket precondition, and the
normalizer-reset fixture clears attunedPairs like the real normalizer.
One conventions nit was recorded, not applied: one fix-round commit
subject runs 79 columns, and a message-only history rewrite was
declined earlier in this packet for the same class of change, so the
note lives here instead.

BUILT 2026-07-28 (ultracode). All twelve items landed with tests, every
sim and server change mutation-checked one at a time. The build ran its
own adversarial pass per the header: thirteen refuter lenses fanned over
every session exit path and item claim, plus six domain reviewers
(architecture, cross-platform-sync, migration-safety,
database-performance, privacy-security, test-coverage). Every finding of
every wave was applied, including two real cancel gaps the refuters
found beyond the enumerated paths (the Vale Cup pitch-police eject,
which can sweep a bystander harvesting the herb node inside the Sowfield
bounds, and the duel-terminal 1 hp clamp, whose early return skipped the
landed-hit cancel), and the fix rounds were re-reviewed by three fresh
lenses. The fix-round refuters then found and the build closed four
more: a BLOCKED swing (kind 'block', at least one point of damage, the
knockback rider still rolling) now ends a session like a clean hit
(spell pushback keeps its classic hit-only gate); the Vale Cup
golden-goal and goal-reset kickoff placements run the displacement
cancel (fighters can legally gather the pitch herb during the goal
pause); a deactivated-name reclaim now runs the SAME market/mail rekeys
a rename runs (a reclaim IS a rename of the orphaned holder, and
without it a name-reclaimer could collect the orphan's escrow through
the name-fallback read arms, from both create dispatch arms); and the
mail book's pre-#2450 name exposure was hardened end to end (the rename
rekey stamps outgoing letters like the purge does, the purge normalizes
a name-keyed address to the stable id before its return flight, the
stamp is player-kind only, and the boot-time soulbound migration keys
its minted return by the stable sender id whenever the row carries
one).

Item notes beyond the texts: item 5's rod gate pins the probe zone on a
fourth hidden Entity field (`fishCastZoneId`) consumed by the catch
table, the deed credit, and the telemetry, and the displacement helper's
scope is stated exactly (arena-family placements clear sessions in their
own resets; a same-zone tow, a damage-free knockback, and a flight in
progress do not cancel, bounded by the pin). Item 8's second clause is a
persisted per-pair record (`professions/hobby_memory.ts`, the tier-mail
shape) with a mode-blind restore at all three transition entry points,
plus a cprof-mirrored `questedHobbies` view field so the attunement
preview promises the hobby a return will actually restore. Item 10's
node-tier consideration resolved YES (zones x 3 tiers, nine series);
casts ride the generic castStart observer (post-tick, accepting a
one-tick edge on same-tick cancels); the koi counter is a strict subset
beside the catch counter; the telemetry vocabularies deliberately read
BUILTIN content as a stated exception to item 9's sweep. Item 12 purges
the LIVE realm books (a blob-only edit would lose to the 30 s autosave),
from both dispatch arms through one shared helper; the mail purge
preserves the return-flight invariant (four delete categories, one
return category), stamps the deleted character's own pre-#2450 outgoing
letters with the stable id so a return cannot land on a reclaimed name,
and its comments state honestly that the senderName fallback is the live
path for every letter written before this release. A bags-full catch
now emits the got-away event, giving that branch two player lines on
purpose (the transient error carries the reason, the durable log line
records the loss).

SURFACED FOR THE RULINGS LEDGER (found by the adversarial pass, not
decided in the build, not filed): (a) whether a BLOCKED hit should push
a SPELL cast back (the session cancel now covers blocks; classic
pushback stays hit-only, unchanged); (b) the cross-grade spend
order collides R24 with the base-before-fine grade plan: a SIGNED
base-grade specimen is consumed while plain fine-grade copies that could
pay survive, and any reorder must move `consumeOneScratch` and the
`removePreferFungible` call pattern together or it re-opens the
over-capacity class; (c) whether a damage-free hostile knockback
(Typhoon) or a leap/charge flight crossing a zone line should cancel a
session (the pinned zone bounds the harm today); (d) the daily-reward
activity loop still accrues for linkdead sessions, R44's sibling
surface; (e) turn-in consumes a boundTo instanced copy with no exemption
(latent: no shipped path binds a collect item), where vendor sell and
trade both spare bound copies; (f) (QA-surfaced) the reclaim refusal
checks banned_at but not suspended_until, so a suspended player who
self-deactivates can lose their name mid-suspension (pre-existing; the
phase only widened the return type); (g) (QA-surfaced) the reclaim
transaction locks only the character row, so an admin reactivation
committing between the holder SELECT and the archive UPDATE loses the
race and the returning player finds their name gone with a forced
rename (pre-existing, rare, and the archive is irreversible for them).

Recorded-only (pre-existing or operational, no packet change): the five
unindexed FK columns that dominate the character-delete cost; the
crash-window between the committed DELETE and the blob saves (the purge
narrows the pre-existing leak; a boot sweep could close it); a
pre-feature binary rollback drops `questedHobbies` one way; the
pre-existing delve member sweep counts any-delve presence as this-run
presence; `ctx.completeFishing` is a zero-consumer seam member; and one
shared-worktree interleave swept three concurrent hunks into the
session-cancel commit (its message amendment was declined, so the note
lives here).

Implements R24 through R29 on the executable paths:

1. Turn-in spend order (R24): instanced-last consumption at
   `turnInQuestCore`, reusing the vendor-sell pattern; a mixed-stack test
   proves a signed specimen survives a turn-in that plain copies can pay.
2. `harvestNode` in-combat and swimming gates (R25), with the same
   text-free denial idiom fishing uses, matcher keys included.
3. Reel exemption from the combat gate (R26): reorder the reel arm above
   the combat check in `startFishing`; pin that aggro during the bite no
   longer eats a valid reel.
4. Stealth breaks on harvest/cast; action-locked forms refuse (R27).
5. Session cancellation on every teleport and `/follow` zone crossing
   (R28): dungeon/delve entry, jail, revive; one shared cancel helper, not
   five copies. The rod gate reads the water's zone at the PROBE POINT,
   closing the 24-yard cross-boundary cast. While there, rewrite the
   over-claiming comment in `src/sim/professions/fishing.ts` that says
   there is no way to be carried into another zone mid-cast; `/follow`
   refutes it (checkpoint-verified).
6. Queued-spell buffer clears on session start (R29).
7. A fully-absorbed hit skips the cast cancel but its knockback still
   displaces the caster; per R41 the hit counts both ways: the absorbed
   hit cancels the session AND its displacement stands, with no
   absorb-conditional physics branch.
8. Hobby-switch integrity: exclude `q_prof_hobby_switch` from pair
   transitions so a banked selection cannot go stale, and stop the
   make-amends return from silently discarding an explicitly quested
   hobby choice.
9. Unify the builtin-versus-swappable content reads: the rod gate resolves
   builtin `ZONES` while water reads the active (swappable) content, and
   station COLLIDERS use static `STATIONS` while the station gate and
   visuals use the active bundle (`ClientWorld` pins the static list too).
   All three read the active content, which also serves R37.
10. **Fishing telemetry** (pulled forward from ops): casts, catches,
    got-aways, and koi by band and zone; empty-hook rate; rod-fee
    payments. Bounded label sets, pre-seeded to zero, riding the existing
    exporter; check multi-realm label behavior while wiring it. R4, R8,
    and the shared-depletion deferral all gate their revisits on this
    data existing. While in the exporter, consider a bounded node-tier
    label on the harvest counter (zones x 3): the R31 watch premise wants
    to separate a level-1 traveler on the Thornpeak tier-1 faucet from a
    capped player working t2/t3, and the zone band alone cannot.
11. Linkdead playtime-points fix (R44): a linkdead player must stop
    accruing the durable playtime grant across the disconnect grace
    (today the activity window and the grace are both exactly five
    minutes and `lastInputAt` is never written on socket drop); the
    mechanism is the build's choice, with a server-rig test either way.
12. `deleteCharacter` world-state purge (R43): deleting a character
    also removes its market listings, escrow collection, and mail from
    the realm blob (today it touches none of them, leaving that state
    permanently uncollectable); migration-safety and
    database-performance review both apply.

---

## Phase 11: stale-client and rollout compatibility

Build: Fable xhigh. QA: Fable xhigh, new session (verify against the real
merge-base bundle via git show, the way pass 2 did).

R34 scope: guards, not a floor.

BUILT 2026-07-28 (Fable xhigh). Preamble: origin fetched, release/v0.32.0
still the latest release branch with its tip 9d7a1a021 already merged (no
re-sync, nothing for the release-merge audit), gate green at the entry tip
4e4201051. RE-SYNCED 2026-07-29 (the phase 11 QA preamble): release/v0.32.0
had moved 685 commits to 0b427afca (the procedural dungeons expansion);
merged as d15ecf338 (56 conflicts), release-merge audit run, gate green on
the merged tree. Every "since the deployed release" claim below was
measured against 9d7a1a021, which remains the deployed commit; the QA
record at the end of this section re-scopes the claims the merge
overtook. The code half is two commits (the trade guard and the bags/bank
visibility work); the rest of the phase lands as this record plus the
deploy-order note in DEPLOY.md. No screenshots: every guarded state needs a
version-skewed client against a newer server, which matched local builds
cannot produce.

What each item settled:

1. DONE: the offer row resolves through a new pure core
   (`buildTradeItemRow` in `src/ui/trade_view.ts`): an unknown id keeps its
   raw id as the label and the painter swaps in the shared fallback icon
   (`src/ui/unknown_item_icon.ts`, extracted from the loot roll
   controller's three identical inline copies), never a throw; the repaint
   signature commits in a finally behind the render's try, which states the
   KNOWN throw eliminated and the UNKNOWN one bounded: on such a throw the
   panel keeps its last paint until the offer data next changes (one log
   per attempt, the callers banded after the trade window keep running),
   the deliberate trade against re-running a deterministic throw every
   band tick. One precision: a tail throw AFTER the innerHTML assignment
   (listener attach) would leave that new partial paint showing, handlers
   missing, until the next data change; only a throw during string
   building leaves the previous complete paint. The fallback img src is
   safe against a hostile id by construction, with the mechanism stated
   exactly (the review corrected an overstatement here): the id-interpolating
   static-URL arm is Set-gated to bundle-known ids, the weapon-art arm is a
   prototype-reachable Record lookup but interpolates only its model-name
   VALUE (quote-free for every prototype key), and every other id lands on
   the canvas data-URL arm; the src is esc()-wrapped anyway. Pinned in
   `tests/trade_view.test.ts` (model arms
   driven with unknown ids, both count variants, plus comment-stripped
   painter pins including the signature-after-render ordering), each pin
   mutation-checked.
2. DONE where a client-side fallback exists: bag cells (both grid views;
   `applyBagFilter` keeps unknown-id slots visible in the everything view,
   ranks them below poor in the quality sort, name-sorts them by raw id;
   the pristine cell stays a drop target, exposes no CLICK action, and is
   a DRAG SOURCE for the index-based move, the review round's capability
   addition) and bank cells (the same family via `filterBankSlots`;
   withdraw stays live because it resolves server-side by slot index).
   Grant lines were ALREADY guarded (`grantItemToken` returns the raw id
   for an id absent from ITEMS, pinned with an unknown-id arm in
   `tests/grant_line_view.test.ts`); verified, no change. Two new keys
   ship with their non-Latin fills (the completeness gate enforces those
   in-change; Latin locales pend to the release fill as usual): the
   `itemUi.bags.unknownItem` tooltip sub-line and the
   `itemUi.bags.unknownItemAria` accessible name.

   ACCEPTED STALE-CLIENT COSMETICS (no graceful client-side fallback
   exists; every arm self-heals when the client updates, and the runbook
   deploy order bounds the window):
   - Vendor rows and prices are bundle truth end to end (the online
     mirror resolves `vendorItems` from the local NPCS table), so an old
     bundle shows its own stock and its own prices while the
     authoritative buy path charges the server's; a repriced item renders
     the old price until the client updates, and a newly stocked item
     does not render at all.
   - The rod-zone denial copy: the event is text-free and the key
     selection at HEAD already covers unexpected shapes (pinned in
     `tests/gathering_view.test.ts`), but a bundle that predates the
     fishing tier split renders its generic implement wording for the
     zone gate; unfixable from HEAD. Precise mechanism (wire sweep): the
     base resolver returns the tierless fishing key unconditionally, and
     the packet widened `gatherDenied.requiredTier`'s emitted range on
     that surface from the literal 1 to the zone ladder, so the old copy
     tells a rod-carrying player they have no tackle. Misleading, never
     a throw.
   - Market browse and collect drop unknown-id rows (the browse drop is
     commented in `market_view.ts`; the collect drop is a bare skip), a
     staged unknown sell id renders the pick-empty state, and the
     dropped rows skew the browse pager BOTH ways (a dropped stranger
     row under-counts; a dropped own row inflates the derived others
     total). The sharpest edge: a page of only-unknown listings renders
     the no-match empty state with NO pager, so the stale client cannot
     page past it. Collect-all still collects invisibly held items into
     the bags, where the new unknown cell makes them visible.
   - The vendor buyback arm drops an unknown-id row the same way
     (`vendor_view.ts`), so an item sold on a current client cannot be
     repurchased from a stale one; reachable only cross-device inside
     the deploy window, the sale price is already banked, and the loss
     can become permanent (the buyback ring holds twelve rows, so
     twelve more sales evict the invisible one for good).
   - The character sheet and the inspect window render an unknown
     equipped id as an empty slot (their guarded ternaries treat no-def
     as empty), and an unknown equipped BAG renders as an empty socket
     the same way: a cosmetic lie, but throw-free, and correcting it
     would touch every paperdoll consumer for a state the deploy order
     already bounds.
   - The opened-mail attachment chip already degrades to raw-id text (no
     icon); the compose-parcel picker skips unknown ids, unreachable
     while unknown bag cells expose no attach action.
   - An unknown-id stack cannot be shift-click linked into chat from the
     bags (outside bank mode the unknown cell has no click handler at
     all): the link needs only the id and a peer's newer bundle could
     resolve it, but adding a click arm for the one gesture would grow
     the cell's surface for a window the deploy order already bounds
     (merge-settlement checkpoint observation).
3. DONE: DEPLOY.md gains "Client/server deploy order for content
   releases" (Operational notes): server first, clients after; the iOS
   binary is approved and released BEFORE the server moves (R34) and the
   binary-to-server gap stays short. Verified against the real merge-base
   bundle (git show 9d7a1a021:...), independently by this session and by
   a five-category wire sweep, agreeing on every point: the
   PACKET-AUTHORED wire delta since the deployed release is ONE new SimEvent type
   (`fishingEmptyHook`; an old client ignores unknown event types, both
   base HUD event switches have no default arm), additive fields on two
   existing events (`fishingResult`/`fishingGotAway` gained zoneId and
   band; old arms read only fields they knew), ONE new self-delta wire
   key (`tslot`, read behind an explicit undefined guard so a new client
   on an old server defaults to empty) plus one additive nested field
   (`cprof.questedHobbies`, conditional-spread guarded, and semantically
   right against an old server: no hobby memory means the skill default,
   which is what the preview then promises), ONE new command
   (`slot_tool_effect`, dev-gated with NO shipped sender; an old server
   would log a protocol anomaly to the bot detector and spend a
   rate-limit token), ZERO removed or reshaped wire keys (ALL_DELTA_KEYS
   57 to 58, purely additive), ZERO REST registry changes, four
   error literals newly EMITTED from the new deny paths but all present
   in the sim at the base and matched by the base bundle (two via the
   hud matcher, two via sim_i18n), and the world-seed dedup pins the
   same shipped value
   (`src/sim/world_seed.ts`). Server-first therefore suffices for every
   packet surface; the one surface no order can cover on its own is the
   node-position skew below.

   MERGED-BRANCH delta versus the deployed bundle (the v0.32.0 re-sync,
   measured by the phase 11 QA): delta keys 57 to 63 (the packet's tslot
   plus the release's einst, mntOwn, mntRtd, mntLesson, mntRace; mloot
   already existed at the base), sendable commands 164 to 174 and
   dispatched 173 to 185 (the release's eleven, none dev-gated, of which
   FOUR are reachable from the shipped client's own surfaces: the mount
   key, the two race controls, and the Settings unstuck; the rift forge
   and riding-training senders exist on ClientWorld but nothing shipped
   calls them yet), SimEvents 118 to 131 (thirteen new: twelve release
   additions, two of them pid-less, plus the packet's own
   fishingEmptyHook), registered RouteDefs 180 to 181 and surface-inventory
   rows 195 to 196 (one admin-only unstuck-reports route; the registry
   file itself is byte-identical). Still true and
   verified at the base: every addition is purely additive, no key was
   removed or reshaped, and the base client ignores unknown event types
   (no default arm on any of its three event switches, no wire allowlist).

   THE DEPLOYED-BUNDLE CONSEQUENCE (wire sweep, recorded here and in the
   runbook): the guards in items 1 and 2 protect bundles built from this
   release onward; the bundle already live predates them, so for THIS
   deploy the old client's two TypeError arms are real once the new
   server mints ANY item id the bundle predates (the packet's fine-grade
   materials and rods, and after the re-sync the expansion's whole
   catalog; the mechanism is the failure, so no count is recorded).
   The trade arm fires when a stale session's trade partner stages one
   (the throw freezes that trade panel behind the base bundle's early-set
   signature); the loot-window arm is unreachable through the PACKET'S ids
   (gathering, recipe, vendor, or delve-shop content only, swept out of
   every loot feeder by the deploy-window pin) but NOT for the merged
   release as a whole: the v0.32.0 expansion put its four mount reins into
   the heroic loot of five deployed-base encounters (the four heroic
   finales plus the Nythraxis raid), and its rift runs push the rift
   catalog onto boss corpses at runtime, so solo and free-for-all clears
   can hand a stale bundle an id it cannot resolve (the QA extended the
   pin to the heroic table and pinned the reins as the exact exception
   set; DEPLOY.md carries the operator-facing statement). The trade arm
   likewise now spans the expansion's whole tradeable catalog, not just
   the packet's ids. A stale session keeps its bundle across the
   restart countdown and reconnect; only a page reload updates it.
4. RECORDED, both directions accepted (they resolve once both sides are
   current; the runbook note names them and the deploy order bounds the
   window). Direction detail from the collider table (GATHER_NODE_BODIES
   in `src/sim/prop_layout.ts`, walked by `src/sim/colliders.ts`): ore
   and wood nodes are solid bodies while herb clusters are deliberately
   soft, and each side collides against ITS OWN bundle's positions. For
   a stale client that means relocated or added ore and wood collide
   invisibly at their server spots AND stand as solid stale props at
   their old client spots (the server lets the player walk where the
   client predicts a block, and vice versa, so both read as rubber-band
   corrections); herb skew is phantom-prop cosmetics only, with no
   collider on either side. A new client against an old server advertises
   nodes, items, and minimap markers the server denies, and every
   relocated node is unusable there; among the zones the deployed server
   HAS, the worst cases are Eastbrook tier-1 herbalism (the whole group
   moved or new) and Mirefen's tier-2 band, which the QA's own
   ore_mirefen_t2 relocation completed as a fully dead group; the eleven
   expansion zones are a different class (their ground does not exist on
   the old server at all). The relocation set already grew in the
   v0.32.0 re-sync and grows again in phase 13, so the runbook names the
   mechanism and the worst case, never a count. Node ADDITIONS carry no
   server-message hazard in either direction: placements are client-side
   static content, `ncd` keys are copied verbatim and only
   membership-tested, and the base HUD has no consumer of a result
   event's nodeId at all.

Also fixed while verifying: the operator comment in
`server/http/game_metrics.ts` claimed the harvest counter gained its
tier label "in this release" and told operators to migrate live panels;
the metric's whole history is this branch (absent at 9d7a1a021 and on
release/v0.32.0), so there is no live panel to migrate and the note now
states the label as a fact of the metric's first shipped release. The
two-meanings-of-band warning beside it kept the same false live-dashboard
premise and understated the fishing band (it is the EFFECTIVE band,
proficiency capped by the rod); the claims round caught both and the
warning now states the two vocabularies without either.

SURFACED FOR THE RULINGS LEDGER (deploy decision, not decided here):
whether this deploy should force stale web sessions onto the new bundle
(a version prompt or forced reload at reconnect) or accept the
stale-tab window the runbook now describes. R34 DEFERRED a hard
version floor as a separate later decision on the premise that clients
degrade gracefully; that premise is materially weaker after the
v0.32.0 re-sync. The old bundle now fails to degrade in FOUR verified
places (the runtime rift-loot arm above is excluded from this count only
because a stale tab's path INTO a rift is unverified either way):
the trade-throw arm, the heroic-reins loot-window arm, the void world
past the old terrain rectangle (the server rim moved outward, so a
stale tab can walk onto ground its renderer has no mesh for), and the
rebased instance plane (INSTANCE_X_BASE moved every dungeon, delve,
and arena interior to coordinates a stale renderer draws as a
collider-less void until relog). The release left the fail-closed gate
at its current ONLINE_WORLD_LAYOUT_VERSION (pinned by
tests/security.test.ts) through both layout changes, so bumping it is
the one-line mechanical lever if the answer is to refuse stale
sessions; the question, now with that lever named, stays the
maintainer's to make.

REVIEW ROUND (same sitting): five fresh lenses over the build diff
(qa-checklist, frontend-seam, test-coverage, privacy-security, and an
independent claims verifier over the doc and runbook text) beside the
five-category wire sweep, every finding applied:
- The one real coverage gap: the corpse and delve-chest LOOT WINDOW
  still dereferenced an unknown id (`loot_window_controller.ts`
  itemRowHtml and the tooltip attach), the same throw with a worse
  blast radius (the corpse became un-lootable with the player's windows
  already closed; the chest arm aborted the rest of that frame's event
  batch). Guarded like the trade row, with a real jsdom behavioral test
  driving a ghost id through openCorpse (the harness already ran under
  jsdom, so no new infra).
- Hardening: `unknownItemIconHtml` esc()-wraps both interpolations per
  the unconditional rule (with a hostile-quality escaping test); the
  icon recipe layer got own-property gates (`ITEM_RECIPES` and `ITEMS`
  both resolve prototype keys as truthy non-defs, and 'constructor' is
  a function whose `.name` IS a string, so a shape check alone waved it
  into a garbage derived recipe), plus a canvas-free introspection
  export (`itemIconRecipe`/`isUnknownIconRecipe`) that finally pins the
  premise every fallback surface rests on.
- Capability and a11y: the unknown bag cell is now a DRAG SOURCE
  (moveInventoryItem acts on indices alone, the same argument that kept
  bank withdraw live), with the touch drop honoring only the bag-cell
  move; shift-click chat linking is not wired because the send path
  already refuses an unresolvable display name, so it would be a silent
  no-op (the "[?]" a stale client sees is the receiver's degradation of
  a link a CURRENT client sent, which nothing here affects); a new
  `itemUi.bags.unknownItemAria` key carries the UNKNOWN signal on the
  aria channel for bags and bank (the tooltip is hover-only), filled in
  the five non-Latin overlays; and `.bag-item[aria-disabled='true']`
  suppresses the hover lift outright while its themed-arrow cursor
  covers only the NON-draggable state, since the later
  `[draggable="true"]` grab rule deliberately wins whenever the drag
  (the cell's one live action) is available; both rules and the
  interplay are pinned. Like every bag cell, the drag has no keyboard
  path (pre-existing, window-wide).
- The trade render now sits in try/catch/finally: throw-free by
  construction, and an unknown future throw logs once per data change
  instead of aborting the update() calls banded after it.
- Test debt closed: the loot-roll re-point gained call-site pins with
  the wire-quality argument (dropping it type-checks and silently
  renders epic fallbacks at common); the trade label gained a
  sentinel-name test (the previous oracle compared itemDisplayName to
  itself, so a raw `.name` regression passed); the skip-a-slot negative
  pins are now slice-scoped zero-continue pins (the literal wording pin
  was evadable); the bank chip exclusion loops every category like the
  bags sibling; the builder's q-common class and count badge are
  pinned.
- Adjudications: `unknown_item_icon.ts` stays UNREGISTERED (two
  reviewers split; the canvas-backed icons import means it is not
  Node-executable unmocked, so pure-core registration would claim what
  the module cannot honor); the bags/bank grids keep source pins per
  those suites' established style with the loot window carrying the
  round's behavioral pin; `src/ui/CLAUDE.md`'s pure-core prose dropped
  its stale "i18n-free" claim (several registered cores import i18n and
  the guard never enforced it).
- Recorded-only (pre-existing, follow-ups not filed): the `delve_buy`
  handler reaches a caught, rate-limited server TypeError on a
  prototype-key delveId (`DELVES[msg.delveId]` truthiness; the fix is
  the same own-property gate); the mailbox windows still concatenate a
  hardcoded ` x{n}` stack suffix outside t(); the six-site
  `item ? itemIcon(item) : unknownItemIconHtml(...)` branch is one
  helper away from folding (rule of three met, deferred to keep this
  diff scoped); an unknown cell's visible raw-id label is deliberately
  not name-searchable (search matches display names); and the catalog
  spread idiom means future English-only adds under `itemUi.bags`
  compile without locale edits, the same trade the market block made.
- The full gate then caught two integration gaps in the fix round
  itself, both closed: the new aria key's `{id}` placeholder was
  missing from the localization coverage harness's shared value bag,
  and the fallback icon THREW on any host without a working 2d canvas
  (the procedural icon is canvas-composited), surfaced by the bags
  money-row suite the moment its synthetic inventory ids started
  rendering as unknown cells. The helper now swallows a canvas failure
  and ships a transparent pixel, keeping its never-a-throw contract
  true by construction, with the catch arm pinned by a throwing-mock
  test and mutation-checked.
- A second fresh lens then reviewed the fix round itself and its
  findings were applied in turn: the record's trade-throw sentence
  contradicted the shipped finally (rewritten above to state the real
  semantics: last complete paint until the data changes, never a
  silent every-tick retry); item 2's settled text still denied the drag
  capability the same round added; the unknown cell's cursor rule was
  DEAD for the draggable state (the pre-existing grab rule wins at
  equal specificity by source order, which is the right affordance;
  the rule now covers the non-draggable state via the themed arrow
  token, with both rules and the interplay pinned); the runbook gained
  the deployed-bundle bags/bank arm below; the loot popup's unknown
  row gained the same minimal tooltip its bag and bank siblings render;
  the shift-click rationale was corrected (send-path refusal, not the
  receiver's "[?]"); and the pin set was tightened (a runBagAction/
  onclick negative beside the click-listener pin, a comment-stripped
  total-count pin on the loot-roll call sites, and honest guard
  attribution in the prototype-key test).
- The runbook omission that lens caught, now fixed in DEPLOY.md: the
  fine grades are minted by HARVESTING with an outclassing tool, no
  loot table involved, so on the deployed bundle a stale tab's own
  freshly gathered fine materials land in INVISIBLE bag and bank cells
  (the shipped `if (!item) continue` arms) until the page reloads. The
  keep-out-of-loot-tables instruction bounds only the loot-popup
  throw; the vanishing-ore reports come from this arm and are
  cosmetic, self-healing on reload.
- Recorded-only additions from that lens (pre-existing, same class as
  the delve_buy entry): `abilityFallback` and the aura recipe arm share
  the ungated prototype-key lookup the item arm was gated for
  (`ABILITIES['__proto__']` is truthy and its missing name would throw)
  and aura ids do ride server events; no realistic server mints such an
  id, so the item-arm gate is the one shipped. Accepted with reasons:
  the bags drag wiring is pinned by source text only (the loot window
  carries this round's behavioral pin; a bags/bank jsdom harness would
  be new infra), and no test drives the trade window's catch with a
  real throw (that needs a Hud instance the suite deliberately avoids).
- The claims verifier's late pass then re-checked every factual sentence
  in the record and runbook against the tree and its findings were
  applied in turn: the loot-table exclusion became an enforced pin
  (`tests/stale_client_rollout.test.ts`, the 11 new ids swept out of
  mob/dungeon loot and the delve chest feeders, release-scoped and
  deletable once clients roll); the weapon-art arm gained the same
  own-property gate as its siblings (a prototype key used to stringify
  into a garbage /ui/weapons/ URL); the esc() on the src interpolation
  and the draggable gating literal gained their missing pins; the
  metrics band warning dropped the false live-dashboard premise it
  still carried and now names the EFFECTIVE (rod-capped) fishing band;
  the R34 paraphrase was corrected (a floor is DEFERRED, not ruled
  out); the wood-collider, market-pager, buyback-permanence, and
  error-literal sentences were made exact (details in place above);
  and the collider-table citation now names prop_layout.ts.
- Also from that pass, recorded-only: /metrics gained ten families of
  pre-seeded series this release (operator-token-gated, not a RouteDef,
  zero in-repo consumers, so outside the registry claim by
  construction); the phase 10 delete/reclaim purges change OTHER
  players' visible mail and market data at deploy (release-notes
  material, not a stale-client arm); `stationPlacements` became an
  active-content getter (byte-identical on shipped hosts, `?? []`
  guarded); and the whole wire verification assumes production runs
  the measured merge base, an assumption the runbook now states.

1. Guard the trade-window unknown-item path at HEAD (the old client
   throws in `itemIcon` on any unknown id and the early-set signature
   freezes the offer display; the same unguarded pattern exists at HEAD,
   so every FUTURE item addition re-breaks old clients). Fallback icon
   plus raw-id label, never a throw.
2. Unknown-id fallbacks everywhere a stale bundle renders server truth:
   bag cells (currently invisible with a counted slot), grant lines,
   vendor prices (old bundles show 60/150 c against the server's 120/400
   charge), and the rod-zone denial copy. Where a graceful fallback is
   impossible client-side, record the arm as accepted stale-client
   cosmetics in this doc.
3. The reverse arm: 7 relocated node ids brick Eastbrook herbalism for a
   NEW client on an OLD server mid-deploy; write the deploy runbook note
   (server first, then clients; the iOS binary ships before deploy per
   R34) and verify the order suffices for every packet surface.
4. Phantom/missing nodes, BOTH directions: a stale client renders nodes
   the current server moved (invisible walls, phantom props), and a new
   client against an old server advertises nodes and minimap blobs the
   server denies. Both accepted and recorded (they resolve once both
   sides are current), with the runbook note naming them and the deploy
   order bounding the window.

QA 2026-07-29 (Fable xhigh, new session). Preamble: release/v0.32.0 had
moved 685 commits to 0b427afca (the procedural dungeons expansion, 11
zones, mounts, rifts, a 2D column world); merged as d15ecf338 with 56
conflicts, the semantic centers being zoneAt going 2D over the active
content list, both sides extending showBanner at the same position, the
seed-467 fishing walks and the deeds hunted literals re-recorded on the
merged stream, and six parity goldens re-minted (every other golden
byte-identical). The release-merge audit ran as four lenses plus the
main session; the full gate then surfaced nine suites where the packet's
guards met the expansion's starter-zone reality, absorbed by giving the
R37 ledger a 'starter' state (nodes tier-1-only, explicit tier-1 rod
rows, Vale-fallback catch tables) with the telemetry vocabularies and
node-persist ceiling re-derived, six nodes nudged onto workable ground,
and the placement suite's dead rim fixtures re-anchored (the release
fades the rim into open staging, so steep and cut-off are separate
fixtures now).

The audits' load-bearing findings, all applied and mutation-checked:
the release's rift teleport family, /dev mountquest, and the overworld
portal pairs bypassed the one-helper session teardown (five sites
wired, a rift entry-and-exit case pinned); a quality tool effect burned
charges in starter zones where the fine grade is categorically
unreachable (use-time gate via fineGradeReachable, starter sweep pinned
in material_grades); the /unstuck chat alias paid no rate-limit lane
(now draws the command lane, drained-lane pin); the release's
unstuck-reports prune shipped as the exact boot-blocking one-shot the
retention sweep exists to retire (now a sweep table off a real config
key, behavioral suite on the db_retention_prune template, dead prune
deleted); mntOwn moved behind the heavy self gate its inputs sit
behind; and the merge-fused worldXBoundsAt static-ZONES walk (NaN
terrain on custom maps) plus the release's zoneBiomeAt and hub-plateau
static reads went back to the active-content list.

The phase's own guards were then re-verified and extended. Every claim
in the BUILT record was independently re-checked against git show
9d7a1a021 and held; five of the build's mutation-checked pins were
re-mutated independently and all killed. The qa-checklist lens found
the release had falsified the loot-window unreachability claim (the
heroic reins, corrected above); the deploy-window pin now sweeps
HEROIC_BOSS_LOOT and freezes its whole id set for the window with the
four reins as the named exception. The adversarial what-is-missing lens
then proved the phase's item-id axis was only one of four: an unknown
QUEST id killed the whole HUD every frame through the quest tracker
(now renders at its log position, raw id, no objectives, prototype arm
pinned); a peer-typed [[i:constructor]] chat link threw inside the
event batch because every guarded surface branched on bare table
truthiness one layer above the icon gate (a shared own-property
predicate, src/ui/known_item.ts, now branches the chat links, the trade
core, loot window and roll, bags and bank windows, and the injected
filter lookups); the stored hotbar layout silently destroyed unknown-id
bindings server-side on every ordinary save (the stored-layout parse
now preserves them as inert slots, round-trip pinned); and the four
wire-enum key tables indexed into t() with no fallback. Same wave: the
loot roll window carried the exact pre-fix trade bug (fingerprint
committed before an unprotected render; now finally-committed around a
catch), Hud.itemIcon gained the canvas swallow its unknown sibling had,
the trade panel turns visible before its render body, authored letters
a bundle predates render their wire-shipped text, sell-junk stays live
on unknown-only grays, the unknown cell gained its two def-free
omissions (bank deposit and the instance glyph with per-kind aria keys,
five-locale fills composed from existing translations), and the fix
round's own touch-drop suppression regression was caught by the
reviewing lens and pinned.

RECORDED-ONLY from this QA (fix shapes in the review reports, none
silently dropped): the rift forge's seven failure reasons produce no
player feedback and its commands have no shipped UI; the rift floor
name is English prose in a snapshot field with themeName doubling as an
identity key (needs a themeId wire field; music and the upgrader draft
key off the display string); the forge addresses items by base id, not
instance; the unknown-quest log detail pane renders nothing and the
slot-keyed abandon is unreachable there; the own-paperdoll withholds
the def-free unequip capability (the accepted empty-slot visual covers
inspect, not the capability); the unbind window's def-less fallback
arms are dead code; the loot-roll fallback arms are pinned by
occurrence count only; a stale client cannot reclaim its own market
listing (the accepted browse drop's one functional consequence, for the
ledger); the HUD event switch has no union-coverage pin; /metrics
zone-labeled series grew ~4.7x with no cardinality bound; the base
bundle's idle Sim.tick measured 2.34ms on the merged tree against a
reported ~0.3ms at the branch parent (unmemoized groundHeight vs its
memoized steepness sibling), a phase 16 input; the chronomancy DPS-gap
floor reads 20.7 percent min-over-seeds against the owner's 22 percent
target on the merged world (the test asserts the measured minimum and
restates the target: the class owner's re-tune, not a fixture edit);
the mastery window's low arm is knowingly blind to expansion supply
until phase 13 re-derives the model; and fishingEmptyHook's
telemetry-only asymmetry is by design, its online routing arm now
pinned. Later-phase premises shifted by the merge: phase 13 inherits
eleven concrete starter zones plus the scoped-down circuit floors,
phase 16 baselines on a 14-zone 120-node world with 58 new solid
colliders and renderer chunk streaming, phase 17's release fill now
sizes expansion content, phase 15 is unaffected (bot/ byte-identical).

Cadence: six review lenses plus three fix-round sub-reviews over the QA
commits; roughly 60 findings applied across nine fix waves, every new
pin mutation-checked decisive, gate green at 427829018 mid-stream and
PASS (all 11 steps) at the final tip db1e860b5. The closing wave laddered
the unknown bag cell's deposit behind the same mode precedence as
bagItemAction, pinned the mntOwn heavy-gate placement and the rift
upgrader intake cap (32, drop-newest, unmarked refusals retryable, one
slot refilled per in-flight dispatch), and recorded the metrics
zone-label growth (3 to 14 zones, 42 series per family) in DEPLOY.md.
The forced-refresh ledger entry now carries
the four verified non-degrading surfaces and the layout-version lever;
it remains the maintainer's, as does pulling the heroic reins for the
deploy window.

---

## Merge-settlement checkpoint (before phase 12)

Run: Fable xhigh, NEW session (fresh context is the point of this
checkpoint; do not run it in a continued session). No build items of its
own: it is a review pass over work that already shipped, and it lands
fixes only where a finding demands one.

Why it exists: the phase 11 QA session merged 685 release commits
(d15ecf338, 56 conflicts) AND applied roughly 60 findings over nine fix
waves in a single session that ran past its context budget and was
compacted. The later the wave, the less fresh-eyed review it got (the
closing wave was mutation-checked but never independently reviewed), and
several calls late in that session were design judgments, not
verifications. Fresh context re-checks all of that cheaply before phase
12 builds on it.

Scope A, the QA session's own output (commit range d15ecf338..db1e860b5;
1257a8e18 is docs-only past it). Review the diffs fresh, and re-judge
these named late-session calls explicitly, each ending CONFIRMED or
reopened as a finding:
1. The R37 rollout ledger's 'starter' state (three-state
   complete/starter/none) was DESIGNED mid-session to absorb the
   guard-vs-expansion collisions; re-derive it from R37's text and the
   expansion zones' actual kit.
2. The rift upgrader intake cap ruling: one freed slot refills per
   in-flight dispatch was judged correct behavior, and the cap bounds
   the queue, not the marked-pending population; re-judge both halves
   (tests/server/rift_upgrader.test.ts pins the current semantics).
3. The chronomancy min-over-seeds floor sits at the measured minimum
   (1.2 vs the 1.22 owner target): confirm it reads as a regression
   floor, not as an endorsement of the shortfall, and that the owner
   flag survives in the doc.
4. The unknown bag cell end to end: deposit precedence ladder,
   suppressNextClick ordering, and the four per-kind unknownItemAria
   keys, on both mouse and touch paths.
5. mntOwn behind the heavy self gate is pinned by SOURCE ORDER only
   (tests/snapshots.test.ts); decide whether a behavioral arm (an
   ownedMounts input change with no heavy-dirty command) earns its cost
   or the placement pin suffices, and record the decision.
6. Spot-verify a sample of the merge's semantic-center resolutions
   independently (zoneAt going 2D over the active-content walk, the
   showBanner position-4 collision, the re-recorded fishing seeds and
   re-minted parity goldens): they were resolved and reviewed inside
   one session.

Scope B, packet-x-expansion interaction seams. The release-merge audit
is structural by design and phase 11's lens was wire/rollout by design;
neither systematically drove packet behavior INSIDE expansion content.
Exercise, at minimum:
- Gathering and fishing across the eleven expansion zones beyond the
  starter-ledger pins: fine-grade reachability from tier-1 nodes, the
  4096 node-persist ceiling, waterline classification in new waters.
- Mounts crossed with profession sessions: mounting mid-session,
  gathering while mounted, and displacement teardown on every
  mount-adjacent teleport path.
- Rift and dungeon interiors crossed with session teardown, driven end
  to end at least once per site class (the five wired teleport sites).
- The expansion economy (rift essence and gems, new vendors, heroic
  reins) against the packet's vendor rows, fees, and market gates.
- The 2D column world against packet node placement: colliders and the
  zoneAt-derived telemetry labels.

Non-goals, stated so the checkpoint stays half a phase: no re-audit of
the release's own 685 commits (QA'd on its branch); R1 to R44 and every
recorded-only item stay settled; the phase 13, 16, and 17 inheritances
(starter zones, the merged-tree perf baseline, expansion locale sizing)
stay scheduled where they are; the maintainer's ledger items (forced
refresh at deploy, pulling the heroic reins, the
ONLINE_WORLD_LAYOUT_VERSION bump) stay surfaced, not decided.

Process: the how-to-run preamble applies unchanged (sync, audit any new
merge, gate green before checkpoint work). Findings are ALL applied,
the fixes re-reviewed, every new pin mutation-checked decisive on a
committed tree, gate green before done. Record the outcome here and in
a professions-tuning-packet-merge-settlement memory.

RUN 2026-07-29 (Fable xhigh, new session). Preamble: release/v0.32.0
had moved 77 commits to a802b4be2 (the release locale fill, detachable
combat meters, the pet taunt gate, heal-landing feedback with the
additive heal2 `absorbed` field, heal2 interest scoping); merged as
a625fe099 with ONE conflict, the generated i18n pending set, resolved
by regenerating from the merged sources (the aggregate baseline is
retired, so regeneration IS the reconciliation). The release-merge
audit came back clean: every branch-owned overlap read against both
parents, the changed delivery helper has exactly one call site on the
branch's routeEvents path, zero new routes, commands, or event types,
the maintainer levers (heroic reins, ONLINE_WORLD_LAYOUT_VERSION)
untouched by the delta, and the release-authored db-mock trap checked
and green. Gate PASS at the merge before checkpoint work.

Scope A, the six calls. (1) CONFIRMED: the R37 'starter' state is a
faithful two-sided widening (the release itself shipped the kits; both
alternatives red wrongly), pinning the shipped shape per zone AND per
profession type; the only zone-keyed professions tables are the swept
ones (work orders are quest records on zone NPCs, outside R37's
scope). (2) CONFIRMED, both halves: the cap bounds the queue array,
one slot refills per dispatch by construction, and the marked-pending
population is transitively bounded (queue cap + one in flight +
undrained results under the hourly cap); a persisted 'pending' maps to
'fallback' at load so restarts cannot strand, and the release-owned
spawn-time strand (a null heuristic build) self-heals the same way,
noted, not fixed. (3) CONFIRMED: the asserted floor sits at 1.2 just
under the measured 1.207 as anti-flake headroom, the test restates the
owner's 22 percent target, and the recorded-only flag survives. (4)
REOPENED, twice: the unknown cell set suppressNextClick with no
fresh-press clear (the round's one blocking fix: a drag whose
synthetic click misses the row latches the flag and eats the next real
deposit tap) and its comment still claimed the cell had no click
handler; the deposit ladder, the four per-kind aria keys, and both
input paths held. (5) DECIDED: the placement pin suffices AND gains a
call-elision spy arm (tests/snapshots.test.ts): the wire-observing arm
the spec sketched stays rejected because delta elision makes placement
wire-invisible and every real input writer is a heavy command, but
spying the ownedMountsFor CALL on a quiet pass observes the work the
gate exists to skip, which is the claim itself. (6) CONFIRMED on all
four sampled centers: the zoneAt union keeps the release's 2D walk
over the branch's active content with the northmost clamp correctly
generalized, every showBanner caller shifted past the variant slot
(type-guarded by the literal union), exactly six goldens differ from
the RELEASE side (the packet-diverging surfaces; the other 53 taken
byte-identical), and the re-recorded fishing walks keep their
divergence discriminators.

Scope B, driven. All 33 starter-zone harvests complete and grant the
zone-table material with no fine-grade leak; live casts in ten of the
eleven zones land catches from the Vale fallback rows; farshore_isle
has NO fishable water anywhere in its rect (probe sweep, zero hits),
so the fishing-town themed zone ships a decorative rod row: a PHASE 13
input, content authoring owns it. The rift descend and /dev mountquest
teardowns are now driven live (descentOpen forced, dev sim) beside
their source pins. Heroic reins refuse market listing and vendor sale
cleanly (no NaN, no item loss); expansion vendor rows all resolve to
real items with finite prices and no tools; zoneAt resolves every live
node to its authored zone (the 2D column labels). THE seam finding:
mounts and profession casts had no interlock (harvest and fishing
start while mounted, a summon channel racing a gather cast), fixed to
the release's own castStart auto-dismount family in both session
starts, with the reins-click-mid-cast direction already owned by
useItem's busy guard and now pinned with it
(tests/professions_mount_interlock.test.ts).

Fix round: four read-only reviewers (architecture, frontend seam,
test-coverage, privacy-security) over the QA range plus my own pass;
every finding applied across six commits (a625fe099..8b7ff1305) except
the recorded-only re-raises (mailbox attachment arms stay accepted
cosmetics, the unknown-quest log detail pane stays recorded). Notable
beyond the calls above: staff moderation chat commands now pay the
command lane (the /unstuck audit finding's exact sibling, WARNING
severity); the zoneBiomeAt equivalence pin had become a tautology when
the delegation landed and is now literal 2D-ladder probes; the
active-content empty-zone policy is settled and pinned (resolution
stays total via the builtin fallback, terrain features follow the
active zones verbatim, tests/world_active_content.test.ts); the R9
quality-slot suppression is one definition with two readers
(usableToolEffectSlot); tEntity's Record arms read through ownEntry so
peer-typed prototype keys render as raw ids everywhere (the itemSet
arm used to throw); the tracker labels an unknown quest with a
localizable sentence. The fix round was itself re-reviewed by a fresh
qa-checklist pass, which caught one blocker and two real gaps: the new
tracker key shipped English-only (M16; the five non-Latin fills landed
with it), and the interlock's other-direction claim missed the two
lesson-mount routes that skip useItem (the riding-lesson summon toggle
and the race-start instant mount), both now refusing on a live
profession cast with the registered busy line and driven in the
interlock suite; the spectating moderation dispatch gained its own
drained-lane drop arm and the pristine bags branch a behavioral
prototype-key arm. Mutation pass: 28 mutations on the committed tree,
all killed; four initially survivable pins were hardened first (the
tracker sentence, a prototype-key loot drop, the pristine bags branch
twice, textually then behaviorally).

Deferred, recorded: a rift entry/exit leg for a parity scenario (the
draw-order gate is blind at the five new teleport arms; a scenario
plus golden mint, phase 16's neighbor); farshore water authoring
(phase 13); the maintainer's three levers stay surfaced and untouched.
Final gate: PASS, all 11 steps, on the committed idle tree at
399786aaf (the code tip; its one prior red was the sell-junk sweep-rule
pin still anchored on the pre-extraction hud.ts consumer, re-anchored
onto both links of the extracted chain). The checkpoint is CLOSED;
phase 12 (the acquisition craft, ultracode) builds on this tree.

---

## Phase 12: the acquisition craft

Build: ultracode (the free-grant incident lived exactly here; adversarial
verification is mandatory). QA: ultracode, new session.

Pass-1 phase 10 scope plus the pass-2 constraints:

1. The capacity pre-gate fix (8a.1) must already be in (it is, phase 8).
2. ONE validation authority: the resolver policy check runs at slot time
   AND load time (phase 8's 8a.2 arm), and the craft mints through the
   same resolver, so no path can mint what another path refuses.
3. Recharge pricing per R39: the arcane material of the R30-resolved
   tool rarity rung (dust for common and uncommon, essence for rare,
   shard for epic), count scaled to the charges restored, both existing
   discounts composing into the count; the flat 4-count spanned a 20x
   value range and could not ship. The craft's own mint reagent cost
   must exceed the generic recharge, because re-slotting resets charges
   to full for free and would otherwise bypass recharging entirely.
4. Charge economics per R30: slot-time mint stands, recharge re-derives
   the maximum from currently-owned tools.
5. `always`-mode waste, per R42: depletion becomes conditional on the
   bonus mattering (the same-draw counterfactual, no extra rng draws);
   R39 pricing assumes no waste.
6. The rollback caveat becomes real player value here: phase 9's shared
   rollback note is re-checked and the release notes carry it.
7. Remove the dev gate and its two-direction pin in the same change; the
   enchanting guide prose decision (what the page promises) is made here
   and HANDED to phase 17 for the wording.
8. `craftedBy` starts being written by the production craft; the
   original-crafter discount goes live with it.

BUILT 2026-07-29 (Fable, ultracode). Preamble: origin fetched,
release/v0.32.0 unmoved at a802b4be2 (already merged as a625fe099), no
re-sync needed; entry tip 8e0006388, docs-only over the merge-settlement
gate-PASS code tip 399786aaf. Six build commits through the UI slice, then
the docs slice and the adversarial round below. What each item settled:

1. DONE (verification only): the capacity pre-gate resolves through the
   slotted quality effect at BOTH cast ends (gathering.ts harvestNode and
   completeGatherCast via harvestYieldItemId), confirmed in place.
2. DONE: one mint authority. `resolveSlotToolEffect` gained the charm arm
   (typed refusals; the six gates in one resolver) and the command body
   (professions/tool_effect_actions.ts, a new SimContext module with Sim
   keeping thin delegates) consumes exactly the copy the resolver chose.
   The load arm was already policy-shared (phase 8); the CRAFTABLE set now
   derives from the same policy: no path can mint a Springback charm
   because no item or recipe exists for a policy-refused-everywhere
   effect, pinned bidirectionally in
   tests/professions_tool_effect_craft.test.ts. The craft itself is the
   two TOOL_EFFECT_RECIPES (content/recipes.ts): the game's first
   enchanting recipes, R45's trainer route, with derived charm icons
   (scripts/assets/tool_effect_icons.mjs, the fine-material derivation
   pattern) and the five non-Latin name fills.
3. DONE: R39 pricing. The flat 4-count RechargeCost is retired for
   resolveRechargeToolEffect: material identity is the disenchant ladder
   (DISENCHANT_MATERIAL_BY_QUALITY, moved to the disenchant_reagents leaf
   so tools.ts shares the ONE table) keyed on the R30-resolved rung, count
   = ceil((restored / 10) x discount) floored at one (full fills land on
   the ruling's 2 to 5 band across the shipped rungs), both discounts
   compose into the count via rechargeDiscountFor (specialization still
   original-crafter-only). The mint-exceeds-recharge inequality holds with
   reagents 4 shard + 3 essence + 5 dust (304 copper) against the worst
   generic fill (5 shards, 275) and is pinned per effect per REACHABLE
   rung, where reachable derives from the live gatherTool defs: a
   legendary tool shipping reds the pin until the recipes retune.
   Residual, accepted: a specialized enchanter's discounted re-mint (about
   225) can undercut the GENERIC recharge of a foreign-crafted slot (275);
   that is the crafting perk working, not a bypass of the recharge economy.
4. DONE: R30 at the command. The fill re-derives from the best tool owned
   at recharge time and lands on BOTH counters; at or above the re-derived
   maximum the recharge refuses (already_full), so a borrowed epic pick's
   inflated mint spends out and is never renewed. Pinned at the resolver
   and through the real command (tests/professions_tool_effect_recharge).
5. DONE: R42. applyToolEffectUse (formerly resolveToolEffectUse) applies
   and never spends; the command boundary settles the charge AFTER the
   grant against the same-draw counterfactual the resolution carries
   (granted id differs, or granted count exceeds the base), so a quality
   charm on an already-sufficient tool and a quantity charm clipped by
   full bags both keep their charge, each pinned through the real command
   at exactly two draws. No parity golden moved (no scenario slots an
   effect; verified by the full parity run).
6. DONE: the rollback caveat re-checked. The packet doc's toolEffectSlots
   arm and DEPLOY.md's professions-rollback bullet now state the real
   player-value loss (charm cost, recharges, craftedBy provenance) and
   the restore-from-backup posture; "the release notes carry it" is
   encoded where release notes are actually authored from: the
   release-cut checklist in docs/design/professions.md gained the caveat
   as a named DESTRUCTIVE entry.
7. DONE: the dev gate and its two-direction pin removed together. The
   online suite's replacement arms pin the new directions: a charm-less
   hand-built frame on a production realm mints nothing and consumes
   nothing (the free-grant attack, refused by the resolver with the
   no_charm event), a charm-holding sender mints and pays. Every refusal
   is player-visible now: the new text-free personal toolEffectResult
   event (a HEAVY_SELF_EVENTS member) reports both actions, rendered as
   localized chat lines with M16 fills. THE ENCHANTING GUIDE PROSE
   DECISION, handed to phase 17 for wording: the enchanting identityBody's
   "no station, no trainer, and no recipe list to buy" gains the
   tool-effect exception (the two charm recipes are trainer-taught at the
   TOOLWORKS for a tier-1 fee, the one enchanting surface that is); the
   page promises that the charms are Enchanter-crafted items consumed by
   slotting, that they trade hand to hand only (signed copies never list
   on the market and never mail), that recharges price in the arcane
   material of the recharge-time tool at a count scaled to the fill, at
   half count for the effect's original crafter and deeper once
   specialized, and that the Springback Charm stays parked. toolsNote is
   NOT stale by this phase (its rarity and never-for-coin claims still
   hold; it stays on phase 17's existing list for its own reasons).
8. DONE: craftedBy is written by the production craft, structurally: the
   charm defs are rare, so the existing #1149 signing rule stamps every
   crafted copy with the crafter's name, and the slot copies the consumed
   copy's signer. The discount is live through the recharge command
   (self-crafted slots price at the composed discount; foreign and
   unsigned copies at the generic rate), and the identity round-trips the
   character blob (the roundtrip fixture carries a craftedBy row).

ADVERSARIAL ROUND (same sitting, the phase header's mandate): six lenses
over every grant, mint, and recharge path plus a fresh architecture
reviewer, then two independent verifiers per finding. 19 findings confirmed
and ALL applied; the architecture pass found no determinism, seam, or purity
break (draw order, tick phases, the SimContext contract, sim purity,
move-not-rewrite and the R42 predicate all verified clean, parity untouched).
The load-bearing one was the recharge rung arbitrage three lenses found
independently, now closed by R47; beside it: the specialized-crafter mint
undercut (reagents retuned to 5 shard / 4 essence / 6 dust so the DISCOUNTED
mint still out-costs the worst generic recharge, and the pin now prices
through the real consumption resolver), the byte-equal re-slot that ate a
charm on a double-click (`no_gain`), the rename sweep missing `craftedBy`
(a renamed crafter silently lost their own discount forever), the charm
consume skipping the quest-inventory hook, deny events rendering an empty
effect name, the repaint parking focus on Close (the #2377 double-fire
family, now the stable-identity refocus seam) and never re-latching its
signature, a prototype-key slot lookup, missing hasOwn guards on
server-echoed ids, the charm's silent right-click no-op, the slottable
catalog-order drift, and the four comments R42 had falsified. Recorded as
ACCEPTED rather than fixed: reclaimed character names inherit the crafter
discount (the settled name-as-identity ruling, now stated at
`isOriginalCrafter`); a persisted 'prompt' row still loads as-is because
phase 14 owns that mode; and the deny event forcing a heavy self re-diff,
which is exactly what every sibling result event already does.

THE FIX-ROUND RE-REVIEW (same sitting; fixes are unreviewed code until
reviewed): five fresh lenses over the fix commit plus per-finding
verification, 15 confirmed findings, ALL applied. The load-bearing one: R47
as first shipped floored the price at the slot's stored maximum, but the
maximum itself was a bag-state choice at MINT time, so minting with the good
pick stashed kept dust prices forever; closed by the use-time ratchet now in
R47's ledger text (the ceiling latches when the bonus fires alongside a
better OWNED tool, settled at the same command boundary as the R42 spend and
pinned end to end through the real harvest). Beside it: the no_gain refusal
compared too little and blocked the two legitimate full-slot re-slots (the
R47 ceiling downgrade and the craftedBy provenance upgrade), now a
deep-equal compare over the minted outcome with both routes pinned; the
rename sweep and the keyed focus restore each had ZERO coverage (a deleting
mutation survived the suite; both now pinned, the focus family through real
jsdom activeElement assertions including the same-row fallback rung); the
new sim error string missed the de_DE dictionary block, invisible to every
i18n gate because the English fallback registers as translated
(FILLED, and flagged to phase 17: sim_i18n dictionary fills are
gate-blind, sweep them by hand); render() re-latches from the one input it
painted; the defensive rungs of the ceiling inverse and the high-water write
gained their own pins; and the stale read-only window docs were corrected.
Recorded ACCEPTED: the transient-courier ceiling latch (in R47's text) and
the two-full-rebuilds-per-action cost now collapsing to one via the
re-latch.

Also in this phase: the professions window gained the minimal slot and
recharge senders (the dev gate's removal would otherwise ship a command
only hand-built frames can reach), derived through the sim's own resolvers
so the buttons never offer what the server refuses; desktop and mobile
captures refreshed under docs/screenshots/prof-tool-effects/ with the
frame-honesty checks extended to the buttons. Deploy-window deltas against
the phase 11 census: sendable commands 174 to 175 and dispatched 185 to
186 (recharge_tool_effect), SimEvents 131 to 132 (toolEffectResult), and
slot_tool_effect moves from the dev-gated set to reachable-from-shipped-
surfaces; all additive, and the old bundle ignores unknown event types.
The R40 comments (the confirm-flow re-widening in world_api/professions.ts
and the design record) stay untouched for phase 14, per the ruling.

Mutation pass: 12 targeted mutations over the fix-round pins (the ratchet
body and its settle call, the three no_gain conjuncts, the rename sweep,
the keyed focus ladder, the rung inverse clamp, the ceiling price floor,
the recharge high-water write, the reagent counts, the apply-half spend),
all applied with the prove-application guard and all KILLED on the
committed idle tree. The first full-gate run then caught three repairs
the targeted suites could not see: the four CJK overlay fills wrapped to
the biome line width, the toolEffectResult arm moved out of the
trainResult source-pin span (several hud.ts pins slice the event switch
between named cases; the hud_update_drive registry row and its
resolved-guard golden respelled to the professions window's inline guard
in the same change), and the wiki regen the reagent retune had skipped.
Final gate: PASS, all 11 steps, on the committed idle tree at 8e8ebc868
(the code tip). Phase 12 is BUILT; its QA runs in a new session, per the
cadence.

QA'D 2026-07-29 (Fable, ultracode, new session), judging 8e0006388 through
8e8ebc868 plus the docs close. Preamble: origin fetched, release/v0.32.0
still the newest release branch and unmoved at a802b4be2 (the merge base),
no re-sync; opening gate PASS, all 11 steps, at ee8a862f7. The fan-out:
seven fresh reviewers (qa-checklist, architecture, cross-platform-sync,
privacy-security, migration-safety, frontend-seam, and test-coverage, the
last running 678 targeted tests) plus a 26-agent adversarial workflow
(seven lenses over every grant, mint, recharge, and depletion path, two
independent refuters per finding, then a completeness critic; the
hostile-wire lens verified clean end to end), roughly sixty findings in
all, EVERY one applied, recorded, or explicitly resolved. The fixes were
then re-reviewed by a fresh five-reviewer panel and its findings applied
in turn (the fix-round commit), 21 targeted mutations over the new pins
all KILLED under the prove-application guard on the committed idle tree,
and the closing gate ran PASS, all 11 steps, at the QA code tip 9a712215a
(eight QA commits past the build's docs close).

The load-bearing findings, all closed: R48 (ledger above), found as the
phantom slot button by three streams independently (the view resolver ran
without craftedBy or the slotter name, so the primary crafter flow offered
a button the server always refused) and given its sharp edge by the
security pass (a double-click whose first click consumed the last
self-signed copy burned a FOREIGN copy next and silently retired the
owner's discount); the directional conjunct plus the selfCrafted boolean
projection close both at once, with the name itself still never crossing
the wire. The mid-cast tool handoff dodged R47's use-time ratchet (trade
has no casting gate; two workflow lenses found it, and the verification
split settled honestly: the dodge also forfeits the completion-read fine
grade, so its payoff was marginal), closed structurally by the cast-start
capture and the max(start, completion) ratchet, with the fix round then
closing its own corner (a fresh mid-cast mint retires the stale capture:
the re-slot toll buys the downgrade). Two zero-coverage arms whose
deleting mutations survived the whole suite: the recharge ceiling's raise
arm, whose loss would clamp paid charges away on the next load, and the
ratchet's raise-only guard, whose loss reopens the arbitrage; both pinned
with literals. The held-Enter focus retarget (a recharge success repaint
handed the Enter stream to the row's charm-burning slot button): the
ladder is now the same control then Close, with sent-guards on both
buttons and a dropped-frame re-arm timer. The eight tail locales missed
the charm right-click row one file past the build's hand sweep (the
BASE_NEW blocks live in the GENERATED newlocales module; the sweep note
now covers both files). The recharge deny order inverted the family rule
and hid the price-carrying deny from a throttled player. Beside those:
the professions.md release-cut line blamed a pre-craft binary for the
rollback erasure when only a binary predating the toolEffectSlots FIELD
erases (the deployed release and earlier), the stale trade buyback
comment misdirected the signed-charm laundering audit, and the nit tail
(the maxDurability JSDoc rewritten to its R47 semantics, the coupled
pricing-inverse note, required-param tightening, renames, hasOwn
consistency in the window, header scoping in tool_effect_name and
focus_restore) all landed.

Deploy-window delta: the tslot row gained the selfCrafted boolean,
additive (the deployed bundle's whole-row decode ignores it); no new
command, event, or route. Parity goldens never moved (the new transient
Entity capture field is inert outside a live cast and sampled by
omit-defaults). RECORDED, not changed, each with its owner: the blind
marginal top-up price (one full material for one charge at 49 of 50; the
cost preview is ruled phase 14's surface and the marginal case rides with
it), the capacity-wall unslot gap (deliberate per 8a.1; an unslot or
suspend affordance handed to phase 14), the trade copy-choice gap
(removePreferFungible ships the newest copy signer-blind, so a seller can
ship their own discount-bearing self-signed copy; a copy picker or
signer-aware preference handed to phase 14), the parity suite's zero
slotted-effect scenarios (the build's no-golden-moved outcome kept
deliberately; one scenario handed to phase 13/16), the golden re-mint
judgment (stands as recorded), ratchet-on-applied (confirmed as R47's
letter, now in its ledger text), and the standing acceptances (deny
events force a heavy self re-diff; result lines render unknown ids raw;
one window rebuild per result event; the normalizer's one-sided max,
whose refutation both verifiers grounded in the trust boundary, with the
one overstating doc word fixed). The ru_RU overlay's long rows resolved
as no-action: biome size-skips the file, so the gate green was real
evidence. The maintainer's surfaced levers stay surfaced (forced refresh,
heroic reins, ONLINE_WORLD_LAYOUT_VERSION), and R45, R46, R47 with its QA
amendments, and R48 remain veto-able rulings. Phase 12 is QA COMPLETE;
phase 13 (build, ultracode) runs in a new session, per the cadence.

---

## Phase 13: content, zone progression, and onboarding

Build: ultracode (widest surface: derived tests, R22 carve-outs, content
authoring). QA: ultracode, new session.

Pass-1 phase 11 scope (R19 fishing teaching ceiling with its D12 scope
note; R21 Thornpeak gatherer deed; the per-skill richness audit; the
out-tooled work-order economics call; the new-zone checklist encoded as a
derived test; the cap-scaling design note) plus:

1. **R22 wield gates with per-caller rulings.** The shared resolver feeds
   the node gate, the fine-grade tier, the corpse arm, and the FISHING
   band cap; rods are R22-exempt, so the proficiency-aware resolution
   must carve fishing out (parameter or split resolver) and the grade and
   corpse arms get explicit decisions recorded here. Re-mint the phase 4
   purchase-deny pins as wield-deny pins; derived-ceiling test now derives
   USE requirements.
2. **Onboarding and direction truth:** fix the Copper Dig direction in
   the quest text (southeast, not southwest) and its wiki twin; the
   Codfather quest names the rod its water actually takes; the apothecary
   (east meadow, boars are west) and outfitter (western woods, spiders
   are east) directions. R32: the camp itself does not change.
3. **Placement-margin arm** in the placement suite: named-mob and boss
   aggro radii (level-scaled where applicable) against every node's
   harvest disc, with the R33 allowlist naming the deliberate t3 dangers;
   fix the two Grix tutorial veins' spacing.
4. The zone-progression audit numbers that pass 2 could not reproduce are
   re-derived, not trusted (the two it did re-run both broke). Include the
   mastery-hours figure: the QA refuter measured the derived 6.94 h model
   as an OVER-estimate (the unmodeled rare-event yield multiplier,
   proficiency climb, and self-signed reduction bring a real focused climb
   to roughly 3 to 5 hours against the design record's 10-to-20 prose
   target), so the content pass should decide whether the target moves or
   the curve does. The re-derivation must also account for release fix
   #2387 (merged at the phase 10 QA re-sync): the refuter measured the
   self-signed reduction while recipeForResultItem searched common recipes
   only, so Battlefield Experience credited nothing for the rare ladder
   potions; with the credit working, the real climb sits further below the
   recorded figure.
5. The crafting-anchor record includes the documented mobile-station
   bypass; the later-zone work-order thinness (one order each in zones 2
   and 3) is filled or recorded as deliberate.
6. Economy note: per-player node timers mean no cross-player scarcity, so
   fine-grade market depth floats free of supply pressure; record the
   consequence and what telemetry would trigger a revisit.
7. The new-zone checklist carries R23 and R37: a future zone's top rung
   names its content source, its hub does not stock it (the hub rule
   applies BELOW the top rung), and the R37 guard flips per-zone from
   assert-absent to assert-complete.

BUILT 2026-07-29/30 (Fable, ultracode). Preamble: origin fetched,
release/v0.32.0 still the newest release branch and unmoved at a802b4be2
(already merged), no re-sync, nothing for the release-merge audit; opening
gate PASS, all 11 steps, at the entry tip 1ab42967d. Twenty-one code,
docs, asset, and gate-fix commits, 44140364e through 8886bef8e, plus
this record. What each item settled:

Pass-1 scope: R19 landed as the zone-tier teaching ceiling DERIVED from
the gain schedule's own row boundaries (tier-1 water grays at 100, tier-2
at 150, tier-3 at the cap; `fishingTeachingCeilingFor` and
`fishingCatchGainAt` in fishing.ts, the D12 extension recorded at the
packet doc's D12 row), draw-free behind the single table draw, reading
the same cast-zone local the table, deeds, and telemetry read; no golden
moved (tier-1 water at proficiency 0 still grants 1), and the schedule
half keeps a grant-sites-do-not-belong-here banner. R21 landed as
chr_peaks_gatherer (stand-alone: rule 9 freezes the shipped peaks chapter
deedIds; catalog pins and the frozen digest re-baselined). The per-skill
richness audit produced R54's two identity decisions (written into
professions.md), the matrix in this record's inputs (deed coverage is
per-zone symmetric after R21), and R55 (Gull Mere: the farshore probe
swept the whole rect, the lagoon landed at (350,118) r10 with the flora
census re-minted; the merge-settlement hand-off closed). The out-tooled
work-order economics call and the thinness call settled as R53; the
new-zone checklist landed as the assert-complete half of the R37 guard
itself (eleven derived arms in tests/professions_zone_rollout.test.ts,
same-file ledger, so a flip conscripts the whole kit), with the
cap-scaling design note in professions.md's How to extend. Item 1 (R22)
landed whole: the wield_gate.ts pure leaf (one frozen 40/70/85/100 table,
R51), the wield-filtered scans behind the harvest gate, cast speed,
fine-grade resolution (R49) and corpse premium arm (R50), the retired
buy deny with advisory vendor rows, the wieldProficiency denial arm end
to end (sim event, client keys with five non-Latin fills, tooltip line,
node-hover and minimap and interact mirrors on ONE client scan), and the
re-minted deny pins plus the knife-edge derivation. Item 2 landed as the
compass-truth sweep: the four named fixes plus five more verified-wrong
claims (q_supplies, q_mogger, q_old_cragmaw, the three grave anchors,
the sealed crypt), the guide's startBody twin, overlay word-swaps in all
eighteen locales with the two restructured texts fully retranslated in
the five non-Latin locales (the always-on non-Latin completeness arm
forbids English-fill there) and their Latin rows re-pended to the phase
17 fill; the naive-axis placement comments were corrected and the
canonical convention note now owns the file. JUDGED, recorded: q_zealots'
"southern peaks" is atmospheric wind flavor, not navigation, and
q_nythraxis_bound_guardian's directions were verified CORRECT and left
alone. Item 3 landed as the placement-margin arm (level-scaled aggro,
camps of rare-or-boss named mobs plus the world boss registry, the whole
harvest disc, exact-set allowlist with per-entry recorded clearances at
one-yard tolerance) and the two Grix veins moved to 34.0 and 31.3 yards
inside the pinned dig ring; the wander-tail acceptance is stated at the
arm (the bound is the standing worst case; the 2-to-9-yard idle ring is
a transient tail whose pricing would condemn five of the six veins
including the always-shipped trio). Items 4 to 6 landed as R52, the
crafting-anchor and work-order records, the all-zones supply arm
(un-blinding the mastery floor the phase 11 QA left), and the
market-depth watch with its honest trigger.

The review rounds (the phase header's mandate): four domain reviewers
(architecture, test-coverage, frontend-seam, cross-platform-sync)
dispatched fresh over the committed range, plus a 66-agent adversarial
workflow (six lenses, paired refuters per finding, resumed twice across
a session-limit window with the dead verifiers re-run to completion).
Roughly sixty findings across the rounds, EVERY one applied, recorded,
or refuted with the reason written down. Load-bearing fixes: the
committed R22 slice had left the minimap consumer un-staged (the tip did
not compile; repaired and recorded here, history unrewritten), the
client viewer scan moved onto the guarded plain-proficiency map
(restoring the documented fail-closed contract and un-redding 21
minimap tests), the vendor advisory's accessible name gained the
combined requirement key, the node-hover tooltip gained the wield arm
the click toast already had, a vacuous buy-path arm was re-driven at the
counter that stocks the tier-3 pick, the grant-and-cast-duration scans
gained their live discriminating drive, the drowned_litany parity red
was bisected in an isolated worktree to the vein-collider relocation
(the one long scenario that keeps world mobs; golden re-recorded with
the mechanism), the fine-grade parity scenario's stale stand point (dead
since the v0.32.0 re-sync, headline arm recording a denial with no
coverage block to notice) was fixed via a shared content-derived helper
with its coverage block added, the slot-tool-effect scenario handed from
phase 12 QA landed with a byte-identical-across-tree-states mint, and
the catch-table shortfall sweep's zone list now derives from the tables'
own keys (the round overturned this record-keeper's own wrong
refutation there). PROCESS RECORDS: five intermediate commits
(d68d02458..b5794ff0e) ship a red parity_e, re-minted at be129ac89, the
red window recorded rather than rewritten; be129ac89's message says
"one draw ahead" where the recorded delta is eleven draws; d68d02458's
title overclaims the rule its own record scopes precisely.

Three delegated coverage arms closed the round at 25639f236, each
independently verified before commit: the recharge ownership arm proves
the R47/R30 family prices off the best tool OWNED (an unwieldable rare
pick sets the same 40-charge arcane_essence rung at proficiency 0 and
at its wield requirement, with a positive control proving the wield
filter genuinely refuses that pick, so "they price, they do not gate"
now has teeth); the live Mirefen drive at proficiency 120 kills the
literal-tier mutant at the gain call, pins the exact 0.1 grant, and
permanently asserts the catch event's zoneId so a silent Vale fallback
can never impersonate tier-2 teaching; and the compass-truth guard
resolves every audited direction claim against live content under the
east-is-minus-X convention, with the convention itself pinned as
arithmetic through the continent map projection and the compass strip,
control rows plus a both-signs arm guarding the table's own shape, and
q_nythraxis_graves excluded with its reason written at the table.
PROCESS RECORD: mid-round the Mirefen arm read as red to the concurrent
architecture reviewer; the cause was the arm's own literal-tier mutant
transiently live in the shared worktree during its author's kill check,
not a regression, and the reviewer's opposite-consequence narrowing
plus the author's isolated reproduction settled it without widening
anything; the lesson (mutation checks run in an isolated worktree, or
the window is announced) was applied to this phase's own mutation pass.

The mutation pass ran in that isolated worktree over a 30-mutant
worklist spanning every new pin family (the wield ladder and its
knife edges, the harvest, grade, speed, and corpse wiring, the deny
payload, the R19 ceiling and the literal-tier read, the rod-tier rows,
the placement clearances, the checklist ledger, the deed, the lake, a
compass reword, the vendor advisory, the recharge ownership scan, and
the UI keys): thirty proven kills in total, every kill showing a
genuinely failed named test, and zero hollow runs (no kill with zero
tests executed). Every apparent survivor resolved with evidence rather
than a shrug: the deny-payload mutant is pinned by the tool-gate suite
(the worklist had predicted the wrong file), the first placement mutant
was mis-specified in the worklist itself (its "toward the camp" move
went AWAY from the camp, so surviving it proved nothing) and the
corrected mutant, 23.5 yards against the 29-yard hot boundary, kills
both the exact-set pin and the counter-example arm, the two catalog
mutants are invisible to the predicted UI suites but are killed by two
arms of the resolved-equivalence reproducibility suite (catalog text
only reaches t() through the committed bundles, so the regeneration arm
is the only check that can pin a catalog row; proven live on a fixed
tip), and the single-faucet blind is below the supply floor's
resolution while blinding all ten expansion faucets kills it (a
collapse alarm, which is what its comment claims).
The pass also caught a real defect: the fix-round's supplies-quest
reword never regenerated the resolved i18n bundles, so the
reproducibility arm was red on the tip itself; the regeneration landed
as its own commit and the equivalence suite is green on the committed
tree since.

Screenshots landed at b186b994f (docs/screenshots/professions-wield-gate/
and docs/screenshots/gull-mere/): the tool tooltip requirement line at
tiers 2 and 3, the vendor advisory rows BEFORE and AFTER on desktop and
mobile (the before pair shows the retired locked rendering, including
its empty accessible name), the wield deny toast naming the counter,
the node hover wield line, and Gull Mere on the downs. The node hover
surface has no mobile frame BY DESIGN: touch pointers have no hover, so
the tooltip module returns early for them and there is nothing to
shoot. Every frame was DOM-asserted before capture, and the pass
surfaced findings of its own: the repo's bare screenshots/ ignore
pattern silently swallowed every NEW file under docs/screenshots (a
plain git add no-ops; root-anchored now, which also un-traps the
pr-screenshots recipe's commit step), the error toast's computed
opacity is not a readiness signal (blank its textContent, poll for it
to refill, then wait out the fade-in), and two shipped
pr_shot_targets.mjs entries carry stale premises after this change
(vendor-tool-gate still frames its subject as a LOCKED row and leans on
the surviving .vendor-locked style hook; the node-hover target's
toolless/tooled variants miss the new owned-but-unwieldable state).
Both are cheap QA-session follow-ups, and the capture driver is kept at
tmp/phase13_shots.mjs (gitignored) for that session.

SURFACED for the maintainer, beside the standing levers: the slot MINT
charge-size ownership reading (R49's entry), the corpse rod exemption at
future tier-2+ families (R50's entry), and the R19 starter-zone
progression inversion (a level-17 expansion zone teaches fishing to 100
while the level-6 marsh teaches to 150; named at fishing_zones.ts,
owned by the zone-4 re-tier per R37). Accepted residuals with reasons:
the wander tail (above); the caster-zone-at-the-gain-site line
regression is not discriminated by any live drive (caster and water
coincide in all of them; the shared zoneId local plus the architecture
review's read is the evidence, and a cross-boundary gain drive needs
water within 24 yards of a zone line, none convenient), a QA-session
candidate; the compound wield-and-tier denials carry no wieldProficiency
(correct semantics, recorded by the sim-suite re-mint); the browser axe
suite and the perf tour were not run by any reviewer here and belong to
the QA session's live track.

CLOSING GATE: three rounds. Round one failed at changed-files biome on
one format error, this round's own ja_JP wield fills running past the
line width (wrapped by biome itself; CJK strings blow the width
silently, so an overlay fill owes a format pass on the touched file in
the same change), with a context find worth keeping: the changed-set
base origin/main fast-forwarded twice mid-session under concurrent
sessions' fetches, so the set a long session gates against moves under
it. Round two failed at the full suite on two stragglers, out of
23559 tests, that NO targeted run had covered all round: the deeds
view's fresh-character denominator pins had not moved for the new
chronicle (the catalog pins live in a different suite and were
re-baselined; the view-side pins were not), and the D8 grade-credit
rig hands its player a tier-2 pick at mining 0, which is now the
covering-but-unwieldable DENIAL rather than a yield upgrade, so the
rig earns the tier-2 wield counter first. Both fixed with the R22
comment written at the rig. Round three: PASS, all 11 steps, at
8886bef8e. The lesson stands in the record: a content-count or
gate-contract change owes a full-suite run well before the close,
because per-file iteration and reviewer runs missed both stragglers
for the whole round.

QA COMPLETE 2026-07-30 (Fable, ultracode, new session). Judged
44140364e^..32a349d7b plus the record commits, fresh eyes. Preamble:
origin fetched; release/v0.33.0 had shipped and stood 14 commits past
the v0.32.0 sync, so the branch re-synced first (merge cc75acdb3): four
conflicts, three clean unions of the branch's unstuck_reports retention
entry beside the release's three new swept tables and the generated
pending.ts regenerated; the release-merge audit ran as an eight-agent
workflow, six areas clean with the Bombardier hobby tiebreak, the
reins-on-action-bar widening (still behind the sim-side mount
interlock), and the retention signatures each verified against both
parents, and its two comment-level residues fixed at 9735ffd69; full
gate PASS post-merge before any QA work.

The round: six fresh domain reviewers (qa-checklist, architecture,
test-coverage, frontend-seam, cross-platform-sync, privacy-security)
over the whole range plus a 24-agent adversarial workflow (seven blind
lenses, two independent refuters per finding, completeness critic) and
a scouting agent for the caster-zone question. Roughly thirty distinct
findings after convergence; EVERY one applied, recorded with its
reason, or refuted with the file open. One blocking: the zone-rollout
EARNABLE arm was derived-both-sides on the gather half (expected marks
built from the arm's own template; a producer rename bricked all three
gatherer chronicles with every suite green; proven live, then pinned by
a real harvest against the producer's write). Load-bearing shouldfixes:
the ten buyAriaWithRequirement translations sat in the item catalog's
INERT inline locale blocks so every locale shipped English on the
screen-reader-only surface (root cause: the uncast dialect aliases
type-forced keys into the dead blocks; fills moved to the overlays,
aliases cast with the reason, pending dropped exactly 12); the cooking
guide page sent players west to kitchens that stand east under the
pinned convention (English plus all eighteen translated overlays
word-swapped); ten comment sites still described the wield-gated axes
as ownership-scanned (swept, with the fine-grade parameter renamed
usableToolTier); the guide startBody and cooking twins gained the
compass-guard arm the quest rows already had; Gull Mere gained its
depth-fraction, dry-shore, and castability probes at the shipped seed
plus the rod-tier-row sweep; the farshore geometry suite moved off a
false client-seed premise onto WORLD_SEED; the fishing rod-tier ladder
gained a schedule-completeness tripwire (corrected once: the first
strictly-increasing shape passed a lone over-tiered zone, caught while
planning its own mutant); the delivered wield deny is pinned over the
live server with its literal counter; the merge's auth-token TTLs are
pinned inside the earliest legal prune horizon (email-change sits
exactly on the 24-hour boundary); and the accepted caster-zone residual
CLOSED beyond the record's hope: a scouting sweep proved no live
tier-differing site exists (nearest fishable rim 36 yards against the
24-yard cast, brute-forced over every differing edge), the border-lake
fixture now discriminates the GAIN itself (0.1 at proficiency 120 where
the caster's zone would teach zero), and a live veiled_hollow to
evergarden cast at (172,936) pins the probe-point zone on shipped
content, with the forward note that any zone-4 re-tier makes it a full
gain discriminator for free.

The fix round was re-reviewed as unreviewed code (READY, six nits, all
applied), and its frontend slice took a second bounded seam pass whose
six shouldfixes reshaped the vendor focus ladder: restoration now walks
the same grid slot outward before sell-junk and Close (a last-stack buy
had parked a keyboard player on the close button), every rung resolves
by focus key, and the previously unpinned promises each carry an arm
(neighbor landing, enabled sell-junk rung, containment from outside the
window, buyback positional slot, one-proficiency-read-per-build against
a counting getter, explicit-map-wins plus read-through). Mutation
evidence, run in an ISOLATED worktree and removed after: 12 of 12
killed, zero hollow runs, including the corrected tripwire naming its
zone and the M1 zoneId mutant killed by exactly the three
completion-side arms while the cast-start arm stayed green as
predicted.

The live track ran for the first time in the packet: the browser axe
suite green (90 tests, the vendor window newly axed with its combined
advisory aria), the perf tour both viewports (structural gates pass,
FCT pool bounded at 24 across waves; the numbers are the headless
software-rendering norm and stand as the packet's first recorded
baseline in tmp/), and a changed-surfaces probe showing the Gull Mere
area renders at hub-comparable rates. The two stale pr_shot_targets
premises are retired (vendor target now verifies the advisory contract
including the folded aria; node-hover gained the covering-but-
unwieldable variant that refuses a frame missing the wield line), and
the locale-fill skill gained the overlay biome-format step whose
absence cost the build's closing gate a round.

NEW FLAG for the maintainer, beside the standing levers: Thornpeak's
Glimmermere, the only tier-3 fishing water, is roughly one percent
fishable at the shipped seed (a single small patch on the east rim; two
independent refuters reproduced the probe, and casts facing the visible
lake centre from most of the shore are refused), so the R19 endgame
climb from 150 to 200 rests on nearly decorative water; the zone-4
water pass owns the fix (widen or deepen the basin as Gull Mere did, or
re-tier). Recorded, not changed here. Also flagged: the fishing town
stocks no fishing implement on the isle (poles are mainland-only), a
natural zone-4 item. Recorded residuals: the R22-as-written edge that a
player whose ONLY tool is tier-3-plus at proficiency zero cannot
harvest even tier-1 nodes until a tier-1 tool is acquired; the
rollback-skew direction (a cached new bundle against a rolled-back
server refuses harvests the server would allow); negative proficiency
would lock everything but no path produces one; the vendor
re-announcement note under looting parties; bags_window still lacking
focus restore (handed to phase 14 with the rest of its focus family);
sub-yard deepening creep inside the placement tolerance (cooling is
caught by the exact-set arm); and the deed i18n rows plus the toolsNote
clause added to the phase 17 fill list. Release-tier deed_i18n red on
chr_peaks_gatherer rows was reproduced and is the recorded phase 17
debt, correct at PR tier.

CLOSING GATE: two rounds. Round one failed at the full suite on ONE
straggler out of 23598 that no targeted run had covered all round:
the delve-map compositional WCAG arm scraped vendor_window.ts for the
adjacency literal "data-close aria-label=" and the focus-restore key
now sits between the attributes; the pin moved to the same-tag shape
its claim was always about (0ab4ec15f). The build round's closing-gate
lesson repeated to the letter, including the second half: the round-one
verdict was nearly misread because the gate ran piped through tail,
which masks the exit code, the exact trap the repo doc warns about.
Round two: PASS, all 11 steps, on the committed idle tree at the code
tip 0ab4ec15f (the record commit after it is docs-only).

---

## Phase 14: UX polish (desktop, mobile, gamepad, accessibility)

Build: Fable xhigh (screenshot-driven, serial). QA: ultracode, new
session (fresh-eyes coverage over every surface).

Pass-1 phase 12 scope (gather-node tooltip grade preview; respawn
countdown in the node tooltip; last-charge signal; the prompt confirm
flow, placed HERE per R40 and shipping WHOLE: resolver widening, facet
widening plus the parity pin, the confirm wire surface in both worlds,
the dialog with its mobile, gamepad, and accessibility treatment, and
the two comment retouches R40 names; professions window `maxSkill`
sourcing; the mobile audit of every professions flow) plus:

1. Banner queueing per R38 (small design note, then the queue).
2. **Touch hotbar for rods**: the touch drag path gains the action-slot
   arm (`resolveDropTargetAt` has none), so mobile anglers stop reeling
   via bags-row taps inside a 2.5 s window.
3. **Gamepad**: the controller panel offers Crafting but the dispatch
   drops it (wire it); the pad reel path gets a first-class answer
   instead of cursor bag clicks with the B-button interact/close
   conflict.
4. **Accessibility bullets** (new to the phase): colorblind-safe channels
   for node lock/tier state and the deed-versus-level banner distinction
   (shape or label, not hue alone); minimap lock state gains a non-hue
   cue; audit against the interface standard in `DESIGN.md`.
5. Empty-hook reel feedback: the correctly-timed reel on an empty hook
   gets an SFX cue and FCT line beside its grey log line.
6. Fine grades stop reading as "Junk" in the tooltip kind line
  (presentation only; the kind stays `junk` internally).
7. Crafting window signals when a craft will consume fine grades because
   base stock ran short (today it substitutes silently at 2x value).
8. Collect objectives for node-yield materials draw map guidance (the
   gather-objective circles exist; collect objectives have none), and
   hand-verify the gather-quest circle renders (pass 2's accepted-quest
   map capture showed none; determine why).
9. Node props gain tier differentiation in the 3D world (pass-2 nit:
   tier is tooltip-only today); low-preset fog's effect on node spotting
   plus the bobber's low/native bite splash get a professions
   fairness-guard test naming what is cosmetic and what is actionable.
10. The removed prompt-mode HUD badge leftovers check (pass-1 item)
    rides along.

BUILT 2026-07-30 (Fable xhigh, screenshot-driven, serial). Preamble:
origin fetched; release/v0.33.0 stood one commit past the sync (the
perf-overlay ornament scroll fix), merged clean, release-merge-audit run
(two branch-owned overlaps, scripts/pr_shot_targets.mjs and
src/styles/components.css, read against both parents with both sides
intact; no routes, no injected helpers, no premise moved), full gate PASS
post-merge before any phase work. Twenty-one code, test, style, and
screenshot commits; the record commit follows the closing gate.

The pass-1 scope, what each settled: the node tooltip gained the grade
preview and the live respawn countdown together. The preview resolves
through effectiveGradeToolTier ITSELF, its promised third reader: the
grant's meta parameter narrowed to the new GradeReadMeta subset and the
client adapts the IWorld reads (bags, proficiency map, tool-effect rows,
unknown ids dropped) into the same function, so the tier a tooltip
previews and the tier the grant runs share one definition. The countdown
rides the new IWorldProfessions nodeRespawnSeconds member, implemented in
both worlds (Sim reads the per-player timer through the new
nodeRespawnRemainingSec helper beside the gate it mirrors; ClientWorld
reads the ncd mirror, whose stable-timer entries are already aged
remaining seconds), null exactly when nodeHarvestableByMe answers true,
parity pin moved to 278, and the m:ss line ceils so a live timer never
reads 0:00. The last-charge signal finally reads depleteEffect's return:
gatherResult carries an additive optional effectDepleted flag on exactly
the emptying spend (absent otherwise keeps every other harvest
byte-identical), rendered as ONE FCT self-note; the charge row stays the
durable record, and the kept-charge R42 arms pin that a suppressed or
unfired use never announces.

R40 shipped WHOLE. The resolver accepts the 'always' | 'prompt' union
(out-of-union values still refuse outright), the facet re-widened both
members (slotToolEffect's union and harvestNode's confirmEffectUse flag,
the commission idiom: strict boolean-true on the wire, omitted otherwise,
so an unconfirmed harvest's frame stays byte-identical), and the consent
is captured at cast start on a new inert-false Entity transient
(gatherCastEffectConfirmed, mirrored at every sibling clear site, seeded
live in the wire-leak scan, never wired) then threaded through BOTH
capacity pre-gates and the grant, so the id the pre-gate reserves and the
id the grant mints share one consent value. An unconfirmed prompt use
skips the effect whole: no bonus, no charge, the harvest proceeds, which
is the stale-client fail-safe (an old bundle simply never fires its
prompt slot). The dialog rides the one confirm-dialog family, which
gained a no-choice callback firing exactly once on cancel, Esc, and
replacement, so the flow always answers; the pure gatherEffectPrompt
question (asks only when the effect WOULD fire, so R9-suppressed and
spent slots never prompt) is shared by all three gather entry points, and
the ask sits AFTER every deny arm. The professions window gained the
Ask-each-use toggle (the mode rides the mint; the slottable affordance
asks the resolver with the mode the button will SEND, so a
mode-only re-slot renders its button exactly when the server would accept
it) and the live-slot "Asks each use" chip. Both ruling-named comment
retouches landed, Sim.harvestNode's pid moved to LAST (the slotToolEffect
convention) with 117 call sites swept mechanically and tsc-verified, and
the sender side of the flag got its own pin after the mutation plan found
the gap. The professions window maxSkill now reads the
GATHERING_PROFESSIONS content cap behind the prototype hasOwn guard with
non-finite wire skills clamped, pinned on BOTH content caps so a
hardcoded denominator cannot pass.

Items 1 to 10: (1) R38 banners queue through banner_queue.ts, a
registered pure core with its design note in docs/design/banner-queue.md:
celebrations FIFO with level-up filing ahead of queued deeds (the level
arm's talent banners ride the same class; they used to clobber the level
banner itself), ambient keeps its immediate replace over a live ambient
(race countdowns depend on it) and waits in one latest-wins seat behind a
celebration, the queue is bounded with drop-incoming (the log and
announcer are the durable records), the unstuck clear purges its queued
entries and advances, hard hides flush whole, and the R38 collision is
pinned end to end on the real method. (2) The touch item drag gained
actionSlot and actionRingSlot arms in resolveDropTargetAt, validated the
equip-arm way; the bags release routes both into the HUD's
placeHotbarItemFromTouch, the desktop drop's exact item branch, with the
ring position resolved through the live page at drop time (the ring arm
is the one mobile fingers reach; the desktop rows are display:none under
mobile-touch). (3) The pad's offered-but-dropped class was EIGHT wide:
crafting, petStop, petTaunt, petAttack, petDefensive, petAggressive, the
dungeon finder, and the sheathe toggle all had panel rows and no dispatch
case; each is wired to its exact keyboard handler and a guard now diffs
every offered edge action against the dispatch (minus the two
Input-handled ids), so the class cannot reopen. The interact press also
gained the reel arm (pad_reel.ts): mid fishing cast it re-uses the
carried implement ahead of the nearby scan, ending cursor-mode bag
clicks and the B-button conflict. (4) The colorblind audit against
DESIGN.md's color-independence rule found ONE hue-only channel, the
minimap lock tint; locked nodes now carry an outline-colored diagonal
strike on both respawn silhouettes, source-pinned reachable from both
fills. Compliant and recorded: the deed-versus-level banners split by
LABEL and PLATE, the tooltip lock in words, the crafting shortfall and
the new substitution suffix in words. (5) The fishingEmptyHook event,
telemetry-only client-side until now, renders the reel cue (the timing
confirmation) and an FCT self-note beside the sim's grey line; the
absent catch line and loot ding stay what say empty. (6) Fine grades
read "Fine Material" in the tooltip kind line through the
baseMaterialFor pairing; the kind stays junk internally and base
materials keep Junk, pinned side by side. (7) The crafting window states
the substitution before the click: each reagent row resolves
fineSubstituted through the sim's own planGradeRemoval and the window
appends a spends-N-fine-grade suffix to the visible line and the aria
fold; the refresh signature already keys per grade id. (8) Collect
objectives for node-yield materials draw map guidance: nodeYieldClusters
circles the nodes whose zone-and-type yield is the item or its fine
grade, and THE PASS-2 CAPTURE MYSTERY IS RESOLVED: the gather arm always
worked (the hand-verify pin drives it); the captured quest was the
collect-of-node-yield class, the three shipped work-order quests, which
drew nothing until this arm. (9) Node props scale one uniform step per
tier (nodeTierScale in the pure lookup sibling: size, never hue, static
on every preset), and the new professions fairness guard
(tests/professions_graphics_fairness.test.ts) names the actionable set
(bobber bite state, minimap markers, the tier ladder: profile- and
governor-free, comment-stripped scans) and the cosmetic set (LOW_FOG's
scenery shed, splash richness) with the reasons. (10) The prompt-badge
leftovers check came back CLEAN: the removed badge left zero references
anywhere, and the R40 chip is its shipped replacement.

The handed-forward items, all settled: the recharge cost preview rides
the ONE resolver call the view already made (now fed the viewer's REAL
craft skills, so the specialization discount previews at the charged
count), painted as a price line beside the button; the blind marginal
top-up is thereby stated before the click (one full material for one
charge at one short, pinned at 19 of 20), and R46's deny line stays the
affordability surface with both formerly-contradicting comments
retouched. The trade copy-choice is closed sim-side: removePreferFungible
gained a deprioritize predicate (matched instanced copies consumed LAST,
two passes over the same highest-index order; skip still spares
outright) and the trade drop arm passes the seller's own signature, so
shipping one charm prefers a foreign or unsigned copy over the seller's
discount-bearing self-signed one, which still ships when it is all there
is; every other caller is byte-identical. The bags window carries
keyboard focus across its rebuild: every focusable surface has a
data-focus-key identity, and the restore ladder is the vendor contract
exactly (exact control, same grid slot walking outward, Close), pinned
through the real window including the consumed-stack landing.

New ruling, build-decided, veto-able (the R32/R45 pattern): R56, NO
unslot or suspend affordance ships this packet. The capacity wall stays
deliberate per 8a.1; its live escapes are clearing one bag slot and the
now-real R40 prompt mode, whose unconfirmed use resolves the BASE grade
at both capacity gates, so a prompt-mode slot can always gather past a
fine-capacity wall by declining the charge. An unslot that destroys
remaining charges is a support-ticket generator and a suspend toggle is
a whole new persisted wire surface for a wall with two escapes; revisit
on telemetry. The vendor re-announce note is RECORDED as accepted with
its honest mechanism: the rebuild replaces the focused node, so
restoring focus re-reads the row's aria under party looting; bounded to
focus already inside the vendor, dropping focus instead would be the
worse failure, and the live-region politeness 'silent' tier is the named
future fix if telemetry shows pain. Surfaced beside the standing levers:
proficiency bands above today's caps are deliberate V3 headroom (band 1
is fishing-only, band 2 reachable by nobody; the stale 300-cap comment
is corrected), and the confirm-dialog buttons gained the coarse-pointer
floor the R40 dialog made routine.

Mutation evidence: 12 targeted mutations over the phase's new pins
(content-cap sourcing, the effectDepleted emit, the resolver widening,
the consent capture, the sender flag, the queue priority, the lock
strike, the yield-cluster match, the deprioritized pass, the bags
neighbors rung, the preview count, the fineUpgrade compare), run in an
ISOLATED worktree (git worktree add plus cp -c node_modules, removed
after) with the prove-application guard: 12 of 12 KILLED, zero hollow
runs. Screenshots: nineteen frames under
docs/screenshots/professions-ux-phase14/ (the R40 dialog reached through
the real interact key on both form factors; the staged slot row showing
charges, chip, price line, and toggle; the tooltip's grade line and live
countdown; the substitution suffix; the minimap strike; the Fine
Material line; plus the curated change-aware set), captured by
scripts/pr_screenshots.mjs plus the tmp/phase14_shots.mjs driver
(gitignored, the phase 13 convention). The mobile audit rode the same
captures: the reviewed flows are clean, with the dialog and toggle
touch floors as its fixes. New surfaces are after-only on purpose: each
line or control is additive, so the before state is its absence.

CLOSING GATE: two rounds. Round one failed at changed-files biome on
five format diffs: the four CJK confirm-body fills applied by script
without a biome pass (the phase 13 locale-fill lesson repeated to the
letter) plus one sweep-lengthened test line. Formatted, resolved bundles
byte-identical, and round two ran PASS, all 11 steps, exit code read
explicitly, on the committed idle tree at the code tip 5ed690b9c9 (the
record commit after it is docs-only). Phase 14 is BUILT; its QA runs in
a NEW session (ultracode), per the cadence.

QA COMPLETE 2026-07-30 (Fable ultracode, new session, fresh eyes over
16a36005a..5ed690b9c9 plus the docs close). Preamble: origin fetched,
release/v0.33.0 unmoved past the synced b0acba0ad, tree clean at the
entry tip, no re-sync needed. The round: six domain reviewers via the
Agent tool (qa gate, architecture, cross-platform, frontend seam, test
coverage, privacy/security) plus a 23-agent adversarial Workflow (eight
blind lenses with paired refuters and a completeness critic), then a
three-reviewer fix round over the applied changes as unreviewed code.
Roughly ninety findings, ALL applied or recorded, across nineteen code,
test, style, and screenshot commits; the record commit after the gate
is docs-only.

The round's three blockers. The trade capacity model: fitsAfterSwap
still walked the old single-pass order while removeOffer shipped the
two-pass signer order, runtime-proven by the architecture reviewer
against both parents as a receiver pushed to seventeen of sixteen slots
with no error; closed by scoping the deprioritize predicate to charm
items (crafting signs every rare-or-better output, so the wide
predicate silently rerouted commission and masterwork equipment
trades) and by mirroring the two-pass into the model from one exported
predicate builder, with the charm stack-of-one premise, the scope, and
the structural mirror all pinned. The capacity pre-gates: neither end
of an unconfirmed prompt cast had a pin that failed when the consent
argument reverted (every table arm had roomy bags); closed with the
room-for-base-only fixture at both gates. The touch drop arms: under
the phone HUD the desktop rows are display none and the bags sheet
covered the ring's layer, so the phase's own drag-to-slot flow could
not be performed at all, and the touch Use button still ran the nearby
scan over a live bobber; closed with a drag-scoped raise of the
controls layer plus (the fix round's own blocker) a neutralization
rule that keeps ONLY the ring pointer-active while dragging, the
padReelItemId arm on the touch press, and a live probe
(tmp/phase14_drag_probe.mjs) that asserts the armed drag, the ring
hit-test, and the seat flip end to end, with the completed-drag
captures committed.

Load-bearing closures beyond the blockers, each pinned: the R40
re-press self-decline (a second interact press re-asked, the confirm
family's replacement contract answered the open ask as a decline, and
the real answer landed on the busy gate; a pending-node latch swallows
the repeat press), the cross-profession consent revocation (a mid-cast
mint on an UNRELATED profession cleared the live cast's captured
consent; the clear now keys on the casting profession), the
cannot-matter ask (a prompt-mode quality charm on a tool already past
the material's rung popped a dialog every harvest where neither answer
did anything; gatherEffectPrompt now mirrors the grant's mattered
predicate plus the locally knowable deny arms and the confirmed-grade
capacity read, with its two honest online limits named in place), the
mount-race banner takeover discarding queued celebrations (hideLive
plus a self-armed advance), the stale parked-ambient replay (the
ambient max-defer), the frozen respawn countdown (a shown-scoped 1 Hz
interval in the renamed gather_node_tooltip_controller, contracted in
the hud_perf_budget driver registry with write elision), the fairness
guard's inert governor arm (two tokens matched nothing in the repo;
now the real render_budget pair, with the tier ladder literal-pinned,
proven applied on built meshes, and the base-anchored scale that
stopped tier props sinking into the terrain), the minimap strike pin
proven gameable by reconstruction (replaced with a segment-tracing
rasterization drive over all three lock states), the bags focus keys
(same-item ordinals instead of raw indexes, the sort select joining
the ladder, element-identity pins), the Ask-each-use toggle
contradicting the chip (seeded from the live slot at open), the
last-charge singular (count-neutral confirm body in English, Russian,
Japanese, and Korean), and the confirmed-harvest parity chapter (no
scenario had ever driven a consented use, so a draw added inside the
consent-gated branch would have passed every shard; the golden now
pins both consent arms at the exact draw ledger).

BUILT-record corrections (the completeness critic): the "ask sits
AFTER every deny arm" claim held only for the three client verdicts
(the locally knowable sim arms now also suppress, and the swimming arm
stays server-side by intent); the "ring arm is the one mobile fingers
reach" and the mobile-audit-clean claims were false until this round's
reachability fixes; the "restore ladder is the vendor contract
exactly" claim missed the sort select; and the pad guard's "minus the
two Input-handled ids" undersold the exemption set (every slotN id
plus the panel's own escape row, each now pinned where its exemption
is handled). The two refuted adversarial findings were judged by hand
and both refutations HELD: the unknown-id null is the facet doc's own
enumerated case (the rationale clause was still sharpened), and the
attunement moment's durable record is its zone-broadcast epic log line
(the banner was reclassed to the celebration queue anyway, as the
mechanical half was right).

Mutation evidence: thirty-nine targeted mutants over the round's new
pins, run in an ISOLATED worktree (git worktree add plus cp -c
node_modules, removed after) with the prove-tests-ran guard:
thirty-nine of thirty-nine KILLED. Two pins were strengthened mid
-battery when their first forms survived (the bags identity arm, which
a key-string assertion could not decide, and the neutralization rule's
two selector lines). Live track: the real-browser suite 90 of 90 (axe,
target size, focus indicator, keyboard nav), the perf tour on both
viewports (structural pass, FCT cap-bounded at 24, hud skip 98 to 99
percent), and the drag probe run twice, before and after the
ring-scoping fix.

Surfaced for the maintainer, changing nothing: the trade
deprioritization's charm scope is a deliberate NARROWING (signed
non-charm equipment reverts to the plain highest-index walk, pinned;
confirm the ruling reading). The migration review's operator note,
recorded verbatim in spirit: toolEffectSlots has never shipped
(absent from release/v0.33.0), so rolling back past this packet drops
the whole key on each character's first autosave, destroying every
slot and the charms spent on them; a mid-packet rollback to a
pre-phase-14 build additionally makes player-minted prompt slots fire
and spend on every harvest with NO on-screen indication (the chip and
toggle are phase 14); the load coercion re-serializes permanently, so
a garbled stored mode becomes a deliberate-looking prompt and the way
back costs a charm. Follow-ups recorded, not filed: the banner pair's
banner_view/banner_painter extraction together with moving the
ambient-staleness rule into the queue as advance(nowMs); the
reagentLine suffix's single-key form; the padStart numeral-system
idiom shared with four older clocks. Standing levers and R45 through
R56 stay as recorded; no new ruling was needed.

CLOSING GATE: PASS, all 11 steps, exit code read explicitly, on the
committed idle tree at the code tip 2f7b7e8b26 (nineteen commits
23797e7d6 through 2f7b7e8b26; this record commit is docs-only). Phase
14 is QA COMPLETE; next is the phase 15 build (ops: GM tooling and the
activity feed), new session per the cadence.

---

## Phase 15: ops (GM tooling and the activity feed)

Build: Fable xhigh. QA: Fable xhigh, new session.

1. R35 GM minimal pair on the admin dashboard: inspect a player's
   professions state (proficiencies, slots, node timers), restore a lost
   item or slot row. Admin surface strings are player-visible i18n per
   the repo rule (operators are users).
2. Discord activity feed: professions moments (first koi, masterwork,
   deed titles) become feed-visible where the rareloot detector today
   cannot see them; fix the pre-existing vale_cup empty-embed render in
   `bot/logic.ts` while in the file.
3. Multi-realm metric labeling double-check for every professions series
   (single-exporter registration, per-realm labels), building on the
   phase 10 wiring.

**Phase 15 BUILT** (2026-07-30, Fable xhigh, serial build with fresh-eyes
reviewers dispatched via the Agent tool). Entry tip de2f9bdd3d;
release/v0.33.0 unmoved past the synced b0acba0ad, so no re-sync and no
merge audit were owed. Seventeen commits 8fd7a0604..352d6c804; the final
gate ran at the committed idle tip 352d6c804: PASS, all 11 steps, exit
code 0 read explicitly.

Item 1, the R35 minimal pair. GET /admin/api/characters/:id/professions
(accounts.read) shapes the stored blob, or a fresh live serializeCharacter
snapshot when the character is online here, through a pure normalizer
(server/character_professions.ts) that runs the LOADER'S own per-field
normalizers, so the operator reads what the next login resolves: the
legacy `professions` dual-key fallback, the clamps, the retired/refused
slot drops, the confirmMode coercion, the positive() node-timer filter and
respawnSeconds clamp. Retired node ids stay VISIBLE with null enrichment,
the one deliberate divergence (the operator should see the row existed). A
NULL state blob (created but never entered; the admin list shows such
rows) reads as defaults and is emptyBlob, never pre-migration; a stored
blob predating the one-shot load migrations is MARKED preMigration and the
modal warns that skills and recipes will be rewritten at next login. When
the character is live, the query suppresses the state fetch entirely
(state undefined, distinguishable from a genuinely NULL blob by contract).
The two restores (POST .../restore-item and .../restore-slot,
moderation.act) run validate, require-online (a cheap adminCharacterOnline
predicate), audit, then mint, on BOTH dispatch arms: the audit row via
recordProfessionsRestore (reason REQUIRED; the locally-capped folded
prefix names the CHARACTER, since account_moderation_actions has no
character column, and says "requested" because a post-audit refusal
surfaces as a 400), then the sync live mint plus a forced saveCharacter so
the committed audit row cannot long outlive the grant (the 200 still
precedes save durability by one queued save; accepted and recorded, as is
the narrow lease-release-window save fence the deed-unlock forced save
already shares). Item restore mints through sim.addItem at the dev_give
1..20 clamp (every non-integer clamps to 1); slot restore is
restoreToolEffectSlotAction in src/sim/professions/tool_effect_actions.ts,
a charm-free mint exported for the server admin runtime ALONE (the
free-grant incident fence: no wire command, no IWorld member, no dev
command; a source-scan guard walks src/server/headless/bot/scripts/
electron and pins server/game.ts as the only importer). It shares the real
mint's validation, tool-rarity charge sizing, post-mint capture hygiene,
and success event through the extracted applyMintedSlot body (verified a
byte-equivalent move), refuses no_tool (R30 sizes charges by an owned
tool: restore the tool first), and refuses to OVERWRITE an intact slot
(already_slotted, checked before no_tool and order-pinned: an overwrite
would destroy craftedBy provenance, the R40 confirmMode choice, and an R47
ratcheted ceiling); craftedBy stays unset, so a restored slot pays the
generic recharge rate. The SPA: a Professions column on the Characters
page opens CharacterProfessionsModal (sheet tables, live/saved and
preMigration badges, GM restore controls behind moderation.act through the
ModerationActionPrompt reason flow with pre-prompt validation, pure
professions_restore builders, server-authored profession and effect
vocabularies). All strings ride the admin catalog; the error reverse map
is guarded by a SCAN of every inline-rendered fail() literal in
server/admin.ts, which also surfaced and closed five PRE-EXISTING unmatched
proses. Before/after screenshots:
docs/screenshots/r35-admin-professions-inspector/ (before-characters.png,
after-characters.png, after-professions-modal.png), captured by
scripts/admin_professions_shot.mjs against a real server with BOTH restore
endpoints exercised live (200 + 200); the tool refuses non-local servers
and is registered in the world-auth script pin.

Item 2, the Discord feed. Masterwork procs and feed-worthy deed unlocks
(title deeds plus the first-koi deed col_glimmerfin) enqueue activity
cards where the rareloot detector cannot see them (a craft, a catch, and a
deed fire no loot roll). discordFeedDeed (server/deeds_records.ts) is the
feed-worthiness gate, fail-CLOSED through isPubliclyListableDeedId: a
Discord channel is exactly the third-party surface the hidden-deed
contract covers. fanOutDeedUnlock replaces maybeBroadcastDeedUnlock: ONE
deed_broadcasts opt-out read serves the guild marquee AND the feed card
(read-count pinned), retro unlocks never fan out anywhere (query-ABSENCE
pinned: the retro gate is the veteran-login storm guard), and dedupe is
per account AND deed. The masterwork arm claims its account-scoped dedupe
key SYNCHRONOUSLY (claimDedupeKey, the atomic test-and-set
enqueueActivity itself now uses) BEFORE the opt-out read, so a proc burst
costs one query and one card per TTL, and a REJECTED read releases the
key (one db blip loses one card, never the account's whole window;
pinned). The card rides the same deed_broadcasts opt-out (R58) because
procs repeat, unlike the once-ever levelup/rareloot arms. Accepted and
recorded: the masterwork card lands a microtask late in feed order, a db
blip fail-closes the card (matching the deed arm), and the queue keeps
its global FIFO 100-cap (kind-blind under a stalled bot). The vale_cup
empty-embed bug is fixed test-first: the server had enqueued vale_cup
cards since the Cup shipped while the bot's builder union lacked the
kind, so every card posted an author-less empty embed Discord rejects.
The bot now renders the nation (a typed Record<VcNationId, string> label
map, compile-time exhaustive, raw-id fallback), bracket, and winner-first
score; an unknown kind returns null, which buildActivityMessages (the
testable seam bot/main.ts posts through) drops rather than posts. The
drift class is closed twice more: a tsc-level SERVER_KINDS parity pin
fails the build in both directions, and the koi deed id is pinned across
the process boundary. The activity drain batches its discord_links
lookups into one ANY(int[]) query per poll on both dispatch arms (the
pre-existing N+1 the new kinds would have fed); the legacy drain arm
remains covered only by route parity, a recorded pre-existing shape.

Item 3, the metrics double-check. Every professions series is
realm-agnostic BY DESIGN, so "per-realm labels" executed as verification
(R57). The one real hazard: woc_rod_fee_copper is a static content gauge
identical in every realm process, and its published usage recipe
multiplied summed counters by a SUMMED gauge, overstating copper by the
realm count; the gauge comment, help text, and DEPLOY.md now carry the
max()-based form, and DEPLOY.md gains the missing multi-realm scrape
guidance (per-realm targets, realm as a scrape-config target label). New
pins: the production single-registry shape (exporter, game-state, and
business registrars on ONE prom-client Registry, never exercised before:
a duplicate name across families now fails a test instead of throwing at
boot), a double-register throw pin with a message matcher, and the
realm/realm_name/server_name prohibition extended to the business
family's forbidden list with the empty-value regex escape closed.
Correction recorded: account_moderation_actions is a deliberate
forever-kept audit log, not a retention gap.

New rulings, build-decided, veto-able (the R32/R45 pattern):
- **R57. Realm identity is a SCRAPE-TIME label, never a series label.**
  The item's "per-realm labels" reads against the shipped design
  (docs/api-pipeline/state.md, the game_metrics forbidden-label pin, one
  process per realm): professions series stay realm-agnostic and
  identically shaped across realm processes; operators attach realm as a
  Prometheus target label per DEPLOY.md. A realm series label would
  redden tests/server/http/game_metrics.test.ts by design.
- **R58. accounts.deed_broadcasts is the professions-feed consent flag.**
  The guild/friend marquee opt-out now also gates the Discord feed's deed
  AND masterwork cards: opting out of the in-game audience a fortiori
  covers the third-party one, and a dedicated toggle would be a new
  persisted wire surface for a preference the flag already expresses. The
  settings-row wording is staled by the widening; its reword rides phase
  17 (scheduled there).
- **R59. The restores gate on moderation.act, surfaced for the
  maintainer.** These are the first moderation.act routes that MINT
  economic value (every sibling is punitive or metadata), so every
  moderator can mint any item in ITEMS, 20 per audited action, onto any
  online character. Kept on moderation.act because GM restores are the
  moderation team's job and the audit trail (operator, character, item,
  reason, forced save) is the control; the accounts.password precedent
  (admin-only, so moderators cannot reset passwords) is the named
  alternative if the maintainer wants minting held tighter.

Review evidence. Six fresh-eyes reviewers (architecture,
privacy-security, migration-safety, database-performance,
cross-platform-sync, test-coverage-auditor), a fix-round architecture
re-review with an extension sweep over the later commits, and the
qa-checklist adversarial close. The database round BLOCKed on a
read-amplification bug the first fix round itself introduced (the
per-proc opt-out read the claim-before-read now prevents); the fix-round
re-review confirmed the charm mint byte-unweakened, the parity digest
untouched, and the online-predicate substitution equivalence; the
qa-checklist's blocking find (the item-id placeholder, the only literal
placeholder in the entire UI codebase) and its polish items are all
applied. Roughly fifty findings applied across the rounds; the two
caught-live regressions beyond them (the adminCharacterOnline
null-vs-undefined sentinel; the capture tool missing from the world-auth
pin) were each killed by a new test the same round they appeared.
Mutation evidence: 51 distinct targeted mutants, 56 runs counting the
post-fix re-proofs, ALL KILLED in an isolated worktree (git worktree add
plus cp -c node_modules, removed after), spanning the sim restore's every
refusal arm plus its draw-free and single-importer guards, the feed
detector's dedupe, retro, opt-out, key-release, and query-count arms,
both dispatch arms' audit-before-mint order, the permission rows, the
sheet's null-state, dual-key, preMigration, and clamp arms, the db
layer's SQL and reason folding, both tsc-level parity directions, and the
SPA builders, badges, and wiring; the feed suite is shuffle-stable across
two randomized orders.

MAINTAINER FLAGS (veto-able, surfaced not re-litigated): R57, R58, R59
above; the masterwork feed cadence (every proc, account-TTL deduped,
opt-out gated) as the rareloot-altitude reading of this phase's
"masterwork" moment; craftedBy provenance shown to operators behind
accounts.read; and the GM item restore minting PLAIN copies only (no
client-supplied instance payloads by design, so a signed or masterwork
original is not exactly reproducible; recorded, not solved).

**Phase 15 QA COMPLETE** (2026-07-30, Fable xhigh, new session). Judged
de2f9bdd3d..0aec2cdb80 with fresh eyes over every surface. Preamble:
release/v0.33.0 unmoved past the synced b0acba0ad, so no re-sync and no
merge audit were owed. Evidence: eight reviewers via the Agent tool
(architecture, privacy-security, migration-safety, database-performance,
cross-platform-sync, test-coverage-auditor, plus general-purpose admin
SPA and bot reviewers), a 23-agent workflow (eight blind lenses with
paired adversarial refuters per finding and a completeness critic; every
refuter vote upheld its finding, no hand-judging owed), a live track,
a four-reviewer fix-round review over the applied fixes, and thirty
targeted mutants in an isolated worktree (git worktree add plus cp -c
node_modules, removed after): twenty-nine killed, one confirmed
EQUIVALENT (a scan-regex mutant that matches the same calls on flattened
source; the floor's real teeth were proven separately by killing the
named-constant-resolution arm), on top of the seven mutants the fix
agents killed in place. Roughly sixty findings applied across thirteen QA
commits acfe98484..2f976d75b.

The four blockers: the inspector modal had no scrollable body
(ModalDialog clips at overflow:hidden, so a tall sheet left the restore
Confirm unreachable on a laptop viewport; it now has the sibling-standard
padded scrolling body, a visible close control, and the container-type
that revives the responsive fallback); the first-koi feed test never
asserted the guild marquee stayed SILENT for a renown-0 feed-worthy deed
(an unconditional marquee would have shipped green); the legacy dispatch
arm, the one-flag production rollback, had no behavioral coverage of the
restore-slot success or refusal ladder (it now mirrors the RouteDef
twin's tests, including the includeState=false detoast suppression the
database round had measured); and discordForAccounts, the N+1 fix
itself, had zero direct tests (its SQL shape, Set dedupe, empty-drain
short-circuit, and keying are now pinned, its projection narrowed to the
three tag columns so discord_email stays out of the feed path, and the
drain pins ONE links read per poll).

Landed beyond the blockers: the inspector's archetype trio and
knownRecipes count now run through the loader's own normalizers (the
operator sees the repaired pair and resolved hobby the next login
produces; a corrupt non-iterable recipes blob renders 0 instead of
500ing the sheet the operator opened to diagnose it); the masterwork
arm's rejected opt-out read RE-STAMPS its dedupe key with a 2s retry
backoff behind an ownership compare instead of deleting it (R60); a
fenced-out forced save after an audited restore logs a restore-specific
error (saveCharacter now reports the fence); a woc_db_pool_clients
gauge (total/idle/waiting, coerced at the pg boundary) gives the pool
the saturation signal every fire-and-forget read family lacked; the
published rod-fee recipe gained its missing by (recipe) grouping in
DEPLOY.md and the gauge help (the two rod fees differ 4x, so the
ungrouped product multiplied every training by the highest fee); the
sim restore refuses a non-finite pid and a drift-pin matrix feeds the
same tuples to resolveSlotToolEffect and the restore so the shared gate
chains cannot silently diverge; the bot poster gained an in-flight
guard, || title fallbacks, membership in the tsc program (bot/main.ts
and its siblings were type-checked by nothing), non-blank
author/title/description pins per kind, and a value pin of the nation
labels against the game catalog; the admin fail() prose scan flattens
multi-line calls, resolves named constants and ternary fallbacks (ten
pre-existing unmatched proses joined the reverse map), scans the body
validators, and holds a floor just under the real count; the SPA sheet
mirror is pinned to the server type bidirectionally at tsc level; the
capture tool loopback-guards all three targets including the
DATABASE_URL arm that actually mints superadmin (resolved through
pg-connection-string so a ?host= override cannot slip past); and the
three R35 routes joined the adminIdParamDecode deviation registry.

Live track, driven twice (API_DISPATCH default AND legacy, byte-identical
prose on every probe): inspector live/stored/never-entered(null-blob)/404
arms, both restores 200, and every refusal live (already_slotted, the
refused fishing pair, no_tool via a toolless logging restore, the count
validator, missing reason, unknown item, offline on a never-entered
character). The feed detector was exercised END TO END live: a real
masterwork proc from a ~150-craft session (recipe_eastbrook_warded_
leggings) flowed claim, consent read, enqueue, and the LEGACY drain arm
over HTTP with the secret, enriched through the batched links read,
closing the arm route-parity had covered only structurally. The R35
captures were re-shot against the final copy. Two live-track discoveries
recorded: /dev level cannot reach the Veteran lifetime-XP threshold
(xpToReachLevel(cap) sits below 250k, so no cheap live title-deed
trigger exists), and the masterwork proc effect-gates on PRIMARY-stat
outputs (masterworkBonusStats returns null for armor-only or
weapon-only commons such as the chain vest and the arming sword, so
those recipes never proc; the feed tests inject the event and are
unaffected). MAINTAINER note: most starter commons therefore cannot
masterwork; flagged as a content observation, not changed.

**R60. A rejected consent read re-opens its dedupe key after a short
backoff, never immediately, and only for its own claim.** The BUILT
record's "a REJECTED read releases the key" is amended: an unconditional
delete removed the throttle exactly when the pool was failing (one read
per proc against a 10-client pool already timing out) and could delete a
window a NEWER claimant legitimately owned (a driver-timeout rejection
lands after the TTL). The release is now a compare-and-set re-stamp:
one blip still costs one card, a retry lands 2s later, and a stale
claimant's late rejection is a no-op. Pinned at the pure layer and
through the GameServer arm.

R59 flag, sharpened (not re-litigated): the security round named the
restore-item SCOPE as the adjacent question R59's text acknowledges but
does not decide: the whole ITEMS catalog is mintable where a
professions-scoped allowlist (gather tools plus profession materials)
would serve every incident the tool was built for and bound what a
compromised moderator session can mint. Surfaced as the named tighter
alternative beside accounts.password; behavior unchanged. Also flagged:
a restored item feeds the discovery ledger, so an operator restoring
something never owned can publish a discovery-deed card the player did
not earn (inert for the intended restore-what-was-lost use; operator
note, not code).

Accepted and recorded this round: the un-coalesced forced saves (N
rapid restores are N blob writes; GM-paced), the restore landing on a
mid-gather-cast window (the player strictly gains), saveCharacter's true
meaning not-fenced rather than landed (the no-state arm is an
unreachable no-op for the restore paths), addStacked never refusing on
bag capacity (a 20-item restore can push past the ceiling into the
documented tolerated overflow), no rate limiter on the authed restore
routes (surface-consistent; the audit row is the volume control), the
updatedAt string-typed TIMESTAMPTZ matching the sibling convention, the
derived scan roots walking untracked directories (env-dependent
brittleness in a dirty checkout, hermetic in CI), and the eviction
backstop bounding sweep size rather than recurrence. Follow-ups recorded
NOT filed: the RELAY drain still runs the N+1 the activity drain shed
(now marginally harder to batch since the narrowed projection dropped
discord_username), pollRelay and pollDailyRewardWinners share the
unguarded-overlap shape pollActivity just closed, the QueuedActivity
FIELD axis (unlike the kind axis) has no cross-process pin, and the
bot's description-level ?? fallbacks share the empty-string blind spot
the title sites shed (cosmetic only).

Final gate: PASS, all 11 steps green, exit code 0 read explicitly, run
on the committed idle tree at the QA code tip 2f976d75b (this record is
the docs-only close on top). The branch stays LOCAL, not pushed.

---

## Phase 16: performance at 1,000 concurrent

Build: Fable xhigh (measurement discipline beats fan-out). QA: Fable
xhigh, new session.

Pass-1 phase 13 scope, honestly re-scoped:

1. The professions load rig is a FROM-SCRATCH build:
   `scripts/load_players.mjs` contains zero professions verbs. Synthetic
   gathering and fishing sessions at 1,000 connections, tick-time and
   broadcast-size percentiles checked in as the baseline, hardware named
   per R36 (the maintainer's Mac).
2. Budgets split into two families: CI-assertable pins (bytes per player
   per tick for `ncd`/`tslot` under the delta rules, allocation counts,
   blob growth bounds) versus Mac-baseline measured numbers (tick time,
   broadcast percentiles). The legacy per-tick `ncd` arm that pre-stable
   clients ride is measured too, not just the delta arm.
3. Zone-scaling projection: per-zone structures grow linearly, nothing
   viewer-identical is rebuilt per tick uncached; client side covers the
   painter budgets AND zone-scaling of node meshes, colliders, and
   minimap markers.
4. Character-blob growth measurement (node timers plus slots plus
   proficiency) lands here with a bound asserted.

**Phase 16 BUILT** (2026-07-31, Fable xhigh, new session). Preamble:
release/v0.33.0 unmoved past the synced b0acba0ad (no re-sync, no merge
audit). Entry a33e30720e; nineteen commits to the code tip 86176bed9a,
this record the docs-only close on top.

Item 1, the rig, from scratch as scoped: `scripts/load_professions.mjs`
(`npm run perf:professions`) drives synthetic gathering tours over the
real `GATHER_NODES` table and fishing with bite-reactive reeling at up
to 1,200 connections, with sampled parsing observers recording snapshot
sizes and per-snapshot ncd/tslot payload bytes on either timer-wire arm,
and a pinned gate (`evaluateProfessionsLoadRun`: unconditional join AND
liveness enforcement, shed-aware sample floors, timer-wire arm purity in
both directions, window-scoped hollow-run evidence per role). The pure
halves live in `scripts/lib/prof_load_util.mjs` and the shared
`scripts/lib/loopback_guard.mjs` (the thrice-copied local-only control,
collapsed on the rule of three), both d.mts-typed and Vitest-pinned.
Four gated captures at exactly 1,000 of 1,000 joined and alive are
committed beside `docs/design/player-performance/
professions-load-baseline.md` (hardware named per R36: Apple M4 Max, 16
cores, 128 GB, macOS 26.5.2, Node v26.5.0), all four stamping one
gitHead: mixed-stable, gather-legacy, gather-stable, fish-stable. The
capture-protocol section records the traps the shakedowns hit (the pool
default as the login wall, the spawn-point pileup, the EADDRINUSE zombie
restart, the orphaned-lease ramp tail, the rolling perf ring's
pre-window blend).

Item 2, the budget split. CI pins:
`tests/professions_wire_budget.test.ts` (tslot ships `[]` once then zero
bytes per quiet tick, re-ships only on a charge change, plus its
cleared-slot transition; stable ncd ships absolute deadlines once then
zero bytes while cooling; legacy ncd re-ships the whole map every tick
and returns to `{}` then silence on elapse; the 120-node worst case
under the 4096-byte node_persist twin at thirty days of fractional
uptime with the tw echo asserted; allocation stability of both empty
arms pinned by reference identity to the shared frozen instance) and
`tests/professions_blob_growth.test.ts` (the settled worst-case
professions blob, 8,469 bytes measured against a 9,728 ceiling, every
field present AND non-empty, every entry cap, and the junk-drop arms).
Mac baselines, never CI-asserted: at 1,000 active professions bots the
loop callback runs about 0.64 s steady state (1.53 to 1.57 snapshots per
client per second, sim ticks held 15.4 to 15.8 Hz by catch-up), and the
legacy per-tick ncd arm is measured live as scoped: 479.5 B in every
frame against the stable arm's 37.2 B in 7.6 percent of frames, a 12.9x
steady-state cut (2.5x on the median gather snapshot, 1.9x on fleet
receive rate). The pass-1 "allocation-free when unchanged" claim was
true of the stable arm only; the phase made it true of the legacy empty
arm too and pinned both, via two byte-identical wire fast paths (the
tslot empty arm compares the constant `[]`, the legacy ncd arm probes
the readyAt map alloc-free and ships the constant `{}`) plus the shared
frozen empty tool-effect projection.

Item 3, the zone-scaling projection. Server side is a VERIFIED
NEGATIVE: no per-tick work scales with node or zone count (no per-zone
node registry exists; node respawn is a lazy per-player comparison; the
only GATHER_NODES walks are module-init, the command path, and the
seed-cached collider build). The real per-tick term is O(players): the
professions self-delta block sits above the heavy gate and measured
about 16 ms of each 1,000-session callback (bcastSelf), flat across all
four scenarios, so professions wire is not the 1,000-concurrent
bottleneck on either arm. The one genuine defect found there is fixed:
`updateMasteryResetNotices` was an ungated 20 Hz O(players) walk, and
the sibling cadence gate would have LOST the one-shot notice (its
persisted gate saves true from the first save while the flag is
transient), so it now runs behind a live pending counter on the
SimContext seam, one integer read per tick, draining on the very next
tick as before. Client side: `tests/professions_zone_scaling.test.ts`
pins the render group to the GATHER_NODES id set (the resident linear
term), every node's collider arm through the real spatial grid (solid
ore and wood at authored radii, soft herb), and the per-zone table
derivations in both directions; the minimap rim-cull parity arms landed
in `tests/minimap_markers.test.ts`; the professions painter budgets were
already enforced (every professions surface COLD, the gathering bar on
the hot shared cast bar). Two false test comments claiming every zone
carries six nodes per type were corrected to the tuned-zone scope.

Item 4, the blob bound, with three load-side clamps beside it (the
node_persist doctrine, drop-only, each dropping ALONE): `craftedBy` and
`equipmentInstance`/inventory `signer` at the enforced 16-character name
shape (cross-tied to `validCharNameShape` behaviorally, at and one past
the clamp), and `knownRecipes` ids at a 64-character shape bound that
keeps the grandfather contract (retired ids still load; catalog
filtering would redden the roundtrip arm built to catch it).

Server changes beyond the wire paths: `DB_POOL_MAX_CLIENTS` became
env-tunable (decimal-digit-only, ceiling at the stock postgres:16
connection budget of 100, the budget rule documented in db.ts and
.env.example, the env wiring scrape-pinned) because the 10-client
default is the real 1,000-login wall (autosave waves hold the pool
while handshakes wait out the connect timeout); and a mid-handshake
socket death no longer mints a PERMANENT lease-holding zombie session
(the close event fired before the handler existed; the ping sweep skips
non-open sockets; the grace sweep needs linkdead): the attach site
re-checks readyState and routes the death through socketClosed, pinned
three ways. A WS_AUTH_TIMEOUT_MS knob added mid-phase was REVERTED by
the review round with the mechanism corrected in place: the deadline
clears on the FIRST frame, before any handshake database work, and the
client-facing authTimedOut literal is a relabel of any escaping
handshake rejection.

Evidence: five Explore mappers up front, five build reviewers via the
Agent tool (architecture, database-performance, test-coverage,
privacy-security, general-purpose rig/doc), TWO fix-round reviewers
over the applied fixes, and qa-checklist as the adversarial close
(READY, zero blocking; its six accuracy findings applied). Twenty-six
targeted mutants in an isolated worktree (git worktree add plus cp -c
node_modules, removed after), every one KILLED with parsed fail counts,
including two survivors-turned-kills that forced pin strengthening (a
discarded allocation-probe verdict; a spot-discovery fixture whose cap
filled from benign candidates before the guarded arm ran). Final gate:
PASS, all 11 steps green, exit code 0 read explicitly, on the committed
idle tree at 86176bed9a (the first gate run caught the one ws_auth
consumer fixture the targeted sweeps missed, fixed as its own commit).

Recorded follow-ups, NOT filed (pre-existing unless noted): the login
handshake's four separate single-row accounts reads inside eight
sequential pool checkouts (a one-SELECT collapse would cut login pool
demand roughly a third); autosave's missing dirty tracking and its
four-round-trip per-character transaction (a serialized-blob hash skip
and a single-statement autosave arm are the sketched relief); the
uncounted pre-auth socket population (bounded only by the 10 s
first-frame deadline); the client-facing authTimedOut relabel hiding
pool exhaustion from clients (wire-change territory); the
cprof/prof/gprof per-tick rebuild-and-stringify above the heavy gate
(cprof sorts the recipe list twice per tick per player; memoization
candidates recorded with the PartyFrameProjectionCache precedent,
deferred because bcastSelf measured flat at 1,000); zoneAt's O(zones)
linear scan and emitToZonePlayers' O(players x zones) per rare proc
(benign at 1/90; the v0.33.0 merge adds zoneContaining, a second
O(zones) scan once per mob death); the hover raycast over the node
group (instanced batches per type and z-band since the v0.33.0
draw-call diet; about 8 Hz, bounded today); nodeHarvestReadyAt's
session-monotonic growth
toward 120 keys (a runtime prune was rejected as delicate against the
save doctrine); the ClientWorld toolEffectSlots mirror staying a fresh
mutable array where the Sim returns the shared frozen instance (inert,
no consumer mutates); the pure-allocation reverts of the wire fast
paths being equivalent-by-design for behavior pins; the rig's loop lag
disclosed rather than gated and the tslot non-empty arm CI-only by
design; and this file's own R37 prose ("no zone beyond the built-in
three") remaining stale against the v0.32.0 starter kits, which
`tests/professions_zone_rollout.test.ts` already records.

**v0.33.0 sync-merge premise corrections** (2026-07-31, the
release-merge audit over merge 49fcacb701; release/v0.33.0 was REBASED,
so the true merge base is 2ef4d9b891, not the previously synced
b0acba0ad). The zone-scaling verified negative HOLDS at the merged tip
(the release's respawn-tier work is mob-only and per-death; the four
GATHER_NODES walks are unchanged). Corrections the merge forced:

- R45 is FALSIFIED by the release's instanced exchange pipes (#2507):
  a signed charm now lists on the World Market and mails like any
  instanced item, because market and mail refuse only quest kind,
  noMarketList or soulbound, and locked copies, and the two charm defs
  carry none of those flags. Restoring the hand-to-hand-only intent
  needs an explicit noMarketList or soulbound flag on the charm defs:
  MAINTAINER decision, flagged not changed (R45+ veto rule). The phase
  12 handoff wording ("signed copies never list on the market and never
  mail") must NOT be published by the phase 17 wiki sweep; the
  items.ts charm comment was corrected in the merge-audit commit.
- R37's prose scope is sharpened once more: the derived guard's true
  scope is "no zone beyond the built-in three carries professions
  stations, catch tables, or above-tier-1 nodes" (the release added
  corpse-harvest componentTags on mobs across eight later zones; the
  guard is unaffected and green).
- R31's stated facts hold, but one acceptance ground weakened: Thornpeak
  sits in the endgame respawn tier now, so trash respawn went 25 s to
  180 s while the 240 s node timer still exceeds it; the faucet's rate
  bound survives, the undefended-camp window is 7.2x longer. Maintainer
  awareness, not a doc error.
- Phase 17 sizing: the release already reworded and refilled six
  professions and economy prose keys to the new instance-payload Market
  rules (econ.marketBody, econ.provenanceBody, faq.a1, masterworkBody,
  craftProse.enchanting.marketBody, guide.economy.mailHow), so they are
  off this phase's reword list like harvestBodyChoice; the fill is
  measured at the merged tip as 144 pending keys / 2,563 pending rows
  (main 63/943, admin 81/1,620; the branch-owned professions slice is
  27 main keys plus one admin key, 425 rows). chr_peaks_gatherer still
  owes its locale rows.
- Phase 18: the phase 11 wire-delta sweep wants a re-measure at the
  merged base (surface rows 201, COMMAND_NAMES 187, IWORLD_MEMBERS 280,
  and the registry file gained the OTA route module); the deploy
  runbook gains the release's self-hosted OTA lane, so the "iOS binary
  ships before deploy" premise is optional rather than load-bearing
  (R34's decision unaffected).
- The load-baseline doc gained the post-merge throwaway-boot note (the
  boot-time CREATE INDEX CONCURRENTLY migration) and the entity-count
  provenance note (the rift scheduler stands about ten more ground
  objects at the merged tip); its measured server-path numbers are
  untouched by the merge.

**Phase 16 QA COMPLETE** (2026-07-31, Fable xhigh ultracode, new session, no
authorship stake). Judged a33e30720e..15436d3f41 at tip c6e9ba1a20; the QA
found the shared worktree switched to another branch by a later session
(clean, reflog-verified, restored) and release/v0.33.0 unmoved, so no re-sync
was owed. Verdict up front: the BUILT record's claims all verified, the
committed baseline set stands unrecommitted, and the round closed thirty-odd
defects none of which invalidates a measured number.

Evidence: seven read-only reviewers via the Agent tool (architecture,
database-performance, test-coverage, privacy-security, cross-platform-sync,
migration-safety, and a general-purpose rig/baselines auditor whose child ran
a 41-mutant audit of the rig libs), a 27-agent blind-lens workflow (six
lenses disjoint from the reviewer domains, paired adversarial refuters on the
top ten deduped findings, completeness critic; about 1.8M subagent tokens),
and an independent number-by-number artifact reconciliation by the lead:
every value in all four Results tables, all three derived ratios, and the
mean-below-p50 ring-blend tell verified against the committed JSONs.

The live track re-ran three of the four scenarios at the merged tip
(pre-fix rig and bundle, gitHead-stamped c6e9ba1a20): mixed-stable,
gather-legacy, and gather-stable all PASSED at exactly 1,000 of 1,000 and
reproduced the committed numbers within same-box noise, entity counts ten to
twelve higher from rift portals exactly as disclosed, rig loop lag LOWER
exactly as the recapture note predicts. The re-measured arm contrast:
12.3x ncd steady-state cut (committed 12.9x), 2.55x median gather snapshot
(2.5x), 1.90x fleet receive rate (1.9x). A fourth diagnostic run evidenced
the pool knob's motivating claim with the gauge the DB reviewer demanded: on
the production-default 10-client pool the same ramp pinned the pool from
about 487 online, oscillated 6 to 2,480 WAITING checkouts in autosave-wave
rhythm, and ground to only 864 joined in twenty minutes, against the
80-client captures' clean seven-minute ramps. Recorded here, not committed
as an artifact.

Findings, all applied per the standing rule (six commits: 81d4905380 sim,
7298751e2e server, 489b9fe269 docs, 96a7ef42ac test polish, f53c503eee rig,
186fa3bf25 the fix-round review's own findings). The headline defects: a
knownRecipes value stored as a JSON string crashed Sim.addPlayer and locked
the character out permanently (found independently by three reviewers; the
sanitizer is now total on unknown with a 512-entry cap); the signer clamp
missed the bank and vendor-buyback containers and every non-signer payload
string (one shared sanitizer now bounds all four containers, drops
clone-mangled numeric-keyed junk, rebuilds rift payloads before bounding on
both arms, and logs one aggregated dev-channel line per character load); a
late first frame after the auth-deadline reject still ran the full handshake
and minted a five-minute linkdead ghost holding a realm slot and the lease
(readyState guard, pre-auth close listener, discard-mode handshake buffer);
the mid-handshake death save no longer enqueues a whole-realm market write at
the exact moment the pool is exhausted (withMarket: false on that one call
site, behavior-pinned end to end); DB_POOL_MAX_CLIENTS was unreachable on
the shipped compose file, blessed 98..100 against a 97 budget, and fell back
silently (compose passthrough, 1..97, loud reject, boot readout, realm
multiplication warning); the rig's tslot attribution had zero assertions and
the gate's hollow-run floors were one-sample floors a degraded fleet could
pass to inflate the headline ratio (window-proportional floors, a 10 s
continuity ceiling with a terminal-aware worst gap, per-observer evidence
plus pool gauges, gitDirty, and reportMs stamped into every future artifact,
teardown that drains the save wave before deleting). The loopback guard
gained hostaddr refusal, suffix-lookalike pins, a fail-closed-catch pin that
had a surviving fail-OPEN mutant, adoption by load_players.mjs, and a
discovery arm classifying every script that touches Postgres.

The fix round was itself reviewed by two fresh reviewers (code and tests),
whose forty-plus findings were all applied in 186fa3bf25, including a
biome-format gate breaker, an unreachable sanitizer arm the call sites'
clone masked, a bags/equipment ordering divergence on over-keyed rift
payloads, a gate compatibility test rebuilt to derive from the committed
artifacts instead of hand-typed counts, and five baseline-doc drifts (the
disclosure list, the 90 yd player interest radius, the reconstructed 20
percent residual, version attributions replaced with stable symbols). One
implementer died on a session usage limit with all its work complete on disk
and unreported; the work was verified line by line before committing.

Mutation ledger, every mutant with parsed fail counts in an isolated
worktree restored pristine: 24 sim/server mutants (all killed), the rig
slice's 22 self-run mutants (all killed; three re-verified independently by
the fix-round code reviewer), 6 round-two mutants over the new arms (all
killed), plus the 41-mutant audit of the pre-existing rig-lib pins that
seeded the round. No survivor stands.

Recorded, not fixed (beyond the BUILT record's standing list): six
pre-existing operator scripts import pg without the loopback guard
(armory_skins_e2e, armory_visual_e2e, bank_audit, chat_log_persistence,
create_gm, grant_admin; now pinned as a classified exempt list, adoption is
the follow-up) and name_reclaim_shot's DB arm; the ws_auth test fakes'
fidelity limits (close() does not move readyState; reject paths exercise the
replay branch) are documented in the fixture; the comment-strip source pins
remain gameable by block comments by doctrine (a block-comment strip eats
string content); the /metrics scrape requires METRICS_TOKEN and stamps null
without it; the sheet-vs-loader knownRecipes divergence on a corrupt string
is documented rather than reconciled; and jail is the one blob key written
outside the serializer, classified explicitly in the complement pin. R45+
rulings were not touched; the one save-policy-adjacent change (the
withMarket scope on the mid-handshake arm) is flagged here for maintainer
visibility with its reachability argument in the code.

Final gate: PASS, all steps green, exit code 0 read explicitly, on the
committed idle tree at 186fa3bf25 (this docs close on top). NEXT: phase 17,
the wiki truth pass and the release locale fill (ultracode, new session).

---

## Phase 17: the wiki truth pass and the release locale fill

Build: ultracode (per-page and per-locale verification is fan-out
shaped). QA: ultracode, new session.

Runs LAST before the final gate, once every string-affecting decision has
landed, so English is reworded exactly once and the overlays re-fill
exactly once.

1. **The full guide accuracy sweep** against the live sim, every
   professions-related page. Known-falsified keys to fix (beyond the
   pass-1 8c set of engineering.materialsBody, fish.startBody,
   fish.biteBody, fish.tablesNote, koiBody, toolsNote, and the
   craft-overview never-stocked line):
   - The engineering five: `ladderBody` ("no trainer fee ever"),
     `trainingBody` (renders under a contradicting table now),
     `identityBody` ("only through an engineer", the Marks route exists),
     `faq.a6` (wrong rungs and fees), `econ.trainingNote` ("higher tiers
     wait for future content").
   - The osmium three: weaponcrafting/armorcrafting/leatherworking
     `materialsBody` still selling the Darva/Hesk shopping trip.
   - `gainBody` ("the one tier 3 node"; there are two per trade).
   - `faq.a7` ("bare hands count as tier 1"; every harvest needs a tool).
   - The fishing where-you-stand prose (the "How much you pay depends on
     where you are standing" family): phase 10 moved the rod gate, catch
     table, deed credit, and telemetry to the WATER'S zone at the probe
     point, so a cross-boundary cast (up to 24 yards) contradicts the
     published wording (found by the phase 10 QA; the reword rides here
     per the reword-staleness rule, not mid-packet).
   - Enchanting `identityBody` per the phase 12 decision, AND its mirrored
     compass claim (the toolworks sits in the SOUTHWEST corner of Eastbrook
     Square, Gizzel at positive-x negative-z; the phase 13 compass sweep
     verified it and left the fix to this key's already-scheduled reword).
   - THE R22 SET (staled by phase 13's wield gate; the branch ships whole,
     so the interim falsehood reaches no player, and English rewords land
     exactly once here): `toolsNote`'s purchase-gating sentences ("the row
     names the requirement" survives; the merchant REFUSING does not), its
     "anything you already own keeps working" clause (R22 falsifies it: an
     owned tier-2 tool does not work until its wield counter is met), its
     silence on the wield ladder (40/70 and the crafted rungs at 85/100
     now pace USE), the gatherIntro trio's "all it takes is a tool in your
     bags" phrasing, and the tool table gaining the wield-requirement
     column beside the delve CLEARS gates this list already carries.
   - THE R19 SET (staled by the fishing teaching ceiling): `scheduleNote`
     (already listed) must state that the WATER caps how far it teaches
     (100/150/cap by zone tier); `fish.tablesNote` and `bandsBody` should
     say the climb itself pulls an angler to better water; the fishing
     page nowhere surfaces the ceiling today, which the phase 13
     adversarial round flagged as the mechanic's one missing player
     surface, so this reword is where it gains one.
   - THE PHASE 15 CONSENT REWORD: the deed-sharing settings row
     (`broadcastsLabel`, "Share deed unlocks with guild and friends") is
     staled by phase 15, which reuses `accounts.deed_broadcasts` to gate
     the Discord activity feed's deed AND masterwork cards (R58): the row
     must name the Discord feed as an audience, and its sibling comment
     scope note follows. Flagged by the phase 15 security review (W1);
     rides here per the reword-once protocol since the branch ships whole
     and the interim mismatch reaches no player.
   - The packet's own reword calling the Glyphsteel Bar Bree-only
     (Gizzel stocks it at the toolworks).
   - `fish.startBody` "rather than bought" (the Marks route).
   - `bandsBody`'s cast-shave claim rendering on the fishing page where
     bands shave nothing.
   - The tool table gains the delve CLEARS gates beside the Marks prices.
   - `scheduleNote` joins the remove-and-refill set (the R19 reword
     stales it; pass 2 found the pass-1 refill scope missed it).
   - R32's veto-able soft danger hint in "Where to start".
   - The `chr_peaks_gatherer` deed's rows in every deed i18n locale table
     (the phase 13 QA round reproduced the release-tier `deed_i18n` red
     naming `de_DE.chr_peaks_gatherer.name`: the deed shipped with zero
     locale rows, a legal pending state at PR tier that this fill owes).
2. Every reword follows the remove-and-refill protocol (stale overlays
   deleted so keys re-pend; non-Latin fills for M16-wordy values in the
   same change), because the gate cannot see reword staleness.
3. Re-size the release fill AFTER the sweep (the 21-key/315-row figure is
   already stale, and it moved AGAIN with the v0.32.0 merge: release
   commit 0f9d6c2d4 retired `guide.professions.harvestBody` for a new
   `harvestBodyChoice` and ran the remove-and-refill protocol on it
   itself, so that key is OFF this phase's reword list; do not re-reword
   it without re-checking its post-release English first) and record the
   new count here.
4. The release-tier locale fill (`I18N_RELEASE_TIER=1` green) is this
   phase's closing act, via the i18n-locale-fill skill.

**Phase 17 BUILT** (2026-07-31, Fable xhigh ultracode, new session). Entry
found the worktree on the right branch at e753614ff2, but release/v0.33.0
had MOVED to 893fdafb94 (four PRs: the tank mount #2638, the admin
online-players page #2635, the shot-script prune #2685, the screenshot
purge #2676). Synced as merge f4434f9977 (one real conflict, the catalog
items.ts appended-ids tail, union-resolved; generated slices regenerated
per convention), release-merge audited CLEAN by five verifiers with
executable proof, and the release-side en delta measured at ZERO rewords
plus three mount keys, so the six release-refilled prose keys and
harvestBodyChoice were byte-verified unchanged and stay off the reword
list. One inherited red: the release tip fails its own
tests/terrorspark_groundshaker_asset.test.ts because the maintainer's
KTX2 conversion (0578ede3c0) updated the GLB and media manifest but not
the test pins; re-pinned to the shipped basisu export in dda84f425d (sha,
1152 KiB budget, KHR_texture_basisu, image/ktx2 list) and the release
branch wants the same fix. Post-merge full gate PASS all 11, exit 0.

MAINTAINER INSTRUCTION, mid-phase and binding: do NOT translate into
every language; add English only; translation happens after the packet is
done. Item 4 (the release-tier fill and its I18N_RELEASE_TIER=1 close) is
therefore DESCOPED from this phase, the chr_peaks_gatherer deed locale
rows defer with it, and the phase closes on the PR-tier gate instead. The
remove-and-refill protocol was adapted to the smallest gate-viable shape:
reworded keys re-pend in the 13 Latin overlays (650 rows deleted), while
the 5 non-Latin overlays KEEP their now-stale fills (deleting them reds
the always-on M16 wordy-English guard, and the completeness gate's
token-preservation arm additionally forbids any reword that changes a
kept key's token set, so the crafted-rung wield thresholds and the
delve-clears count ride the two long-translated tool keys as ENGLISH
LITERALS pinned in tests/guide.test.ts against the frozen wield table and
DELVE_SHOPS). The ONE new wordy key (toolCraftedOrMarksHeroic) got its
five mandatory M16 fills, built from each overlay's shipped Delve
Marks/Heroic terminology; those five short strings are the only
translation this phase performed.

Item 1 ran as a 10-verifier fan-out (one per professions surface:
overview, land gathering, fishing, forge/soft/trial crafts, enchanting,
economy plus shared sections, FAQ, the R58 consent row) checking 238
claims against the sim: 161 verified TRUE, 77 FALSE or PARTIAL. Every
known-falsified item on this section's list was confirmed and fixed, and
the fresh eyes found new falsehoods beyond it, the headline ones being:
koiBody's odds were wrong AGAIN (the sim's koi row is 1/3/6 percent by
band, identical in every zone, no Thornpeak bonus; the flat-3/4 wording
also contradicted tablesNote's correct six-times-likelier claim on the
same page); disenchanting a crafted, signed, or masterworked piece
teaches NOTHING (only world-found gear grants skill), which the leveling
prose now states; Chime Shards have three sinks (Greater enchants, five
per charm recipe, the epic recharge rung), where the prose said one; the
enchanting release-refill's "identically enchanted copies stack" is
impossible (gear never stacks) and was dropped; the two live charm
recipes are trainer-taught by Gizzel at the toolworks (enchanting 25,
tier-1 fee, toolworks-bound), retiring "no trainer, no station" from
four keys; the trainer-fee table's higher rungs are live (rod lessons at
75/125 for 4/16 gold); dormant crafts still climb on common recipes to
75; the amends escalation counts prior RETURNS only; the tier-4/5 tools
are also sold for Delve Marks behind the Litany's clears gates (24 after
three clears, 56 after a Heroic clear), which the engineering identity,
intro, ladder, and both fish keys now say; and the eleven v0.32.0
expansion zones (starter nodes everywhere, no tool counters, Vale
fallback fishing tables, no first-fish deeds) reached the gatherIntro
trio, toolsNote, and both fishing summary keys. The tool table gained
the R22 "Use at" column and the clears-gated Marks source cells
(generator fields wieldProficiency/marksClears/marksHeroicClear mirrored
in tests/guide.test.ts), and the R32 soft danger hint (veto-able) and
R58 consent-row widening (the label now names guildmates, followers, and
the Discord feed's deed and masterwork cards; four stale sibling
comments widened) landed. All in commit 0f860a3cb3.

Findings REJECTED with reason, for the QA round: two verifiers derived
compass words from the layout file's raw +x=east naming, but the
player-facing convention is the rendered map's (east = -X, north = +Z;
anchored on the canonical Copper Dig southeast at (-84,-64) and the map
projection math in map_window_view.ts, whose own inline "+Z is map-down"
comment contradicts its math and should not be trusted): so the
kitchens-east-side prose is CORRECT as shipped (kitchens at x:-11) and
the toolworks is confirmed SOUTHWEST exactly as this section's
parenthetical and the phase 13 sweep said. Accepted-not-applied:
harvestBodyChoice's two verifier nits (the component-family example list
and the owned-vs-wieldable premium arm, which has no live effect while
every shipped family needs only tier 1) stay unapplied per this
section's own release-refill ruling; ringWaveNote's future-caps claim is
forward-looking design intent, unverifiable by construction.

New rulings, build-decided, veto-able (the R32/R45 pattern):

- **R61. The rendered map is the compass authority.** A player-facing
  compass word resolves through the world map projection (east = -X,
  north = +Z), never the layout file's raw-coordinate legacy names.
- **R62. harvestBodyChoice stays as the release refilled it.** The two
  fresh nits are recorded here for the post-packet fill instead.
- **R63. A release-refilled key is re-reworded ONLY for a factually
  false sentence,** minimally: enchanting marketBody lost its impossible
  stacking sentence, provenanceBody and masterworkBody lost the wrong
  "single-copy" signing qualifier and gained the specimen-arm and
  wieldable-tool provisos. Their fresh release fills are re-staled by
  this, ledgered below.
- **R64. Literal-with-pin over token-set change.** Where a reword would
  have changed a long-translated key's placeholder set, the new numbers
  ride as English literals pinned to their sim constants in
  tests/guide.test.ts (toolsNote's 85/100, toolCraftedOrMarks's
  "three"), so the token-preservation gate keeps the stale non-Latin
  fills viable until the deferred translation pass.

THE REWORD LEDGER (load-bearing for the post-packet fill; the pending
registry CANNOT see these, because a present overlay row re-records the
new enHash as its srcHash and reads "translated"): all 52 reworded keys
carry now-stale translations in ALL FIVE non-Latin overlays (260 rows to
re-translate beyond the pending registry). The 52: guide.professions.
{whatBody, archetypesBody, archetypeSwitchBody, startBody};
hudChrome.deeds.broadcastsLabel; guide.profPages.{rhythmBody, gainBody,
toolsNote, toolCraftedOrMarks, priceNone, bandsBody, specimenBody,
trainingBody, howBody, masterworkBody}; gatherIntro.{mining, logging,
herbalism, fishing}; gatherDeeds.fishing; fish.{startBody, biteBody,
scheduleNote, tablesNote, koiBody}; craftIntro.{engineering,
enchanting}; craftProse.weaponcrafting.{materialsBody, routeBody};
craftProse.armorcrafting.{identityBody, materialsBody, ladderBody};
craftProse.leatherworking.{materialsBody, ladderBody, routeBody};
craftProse.cooking.{identityBody, materialsBody};
craftProse.alchemy.{identityBody, ladderBody, routeBody};
craftProse.engineering.{identityBody, materialsBody, ladderBody};
craftProse.enchanting.{identityBody, levelingBody, marketBody};
ench.enchantsNote; econ.{trainingNote, provenanceBody}; faq.{a6, a7,
a8}. The Latin side of the same 52 keys is ordinary pending.

Item 3, the re-sized fill at this build's tip: 210 pending keys /
3,613 pending rows (main 119/1,793; admin 91/1,820; sim and server 0),
PLUS the 260 ledgered non-Latin stale rows above, PLUS the
chr_peaks_gatherer deed locale rows (deed_i18n scope, still zero rows).
The pre-phase figure of 144/2,563 is superseded.

Review round: four fresh reviewers (a prose truth-refuter over the new
English and the five fills, qa-checklist, frontend-seam-reviewer,
test-coverage-auditor) ran over dda84f425d + 0f860a3cb3; their findings
and the closing gate state are recorded at the end of this block.

---

## Phase 18: final gate

Build/review: ultracode. No separate QA (this IS the QA).

1. A fresh whole-branch review in the shape of pass 2: finder fan-out to
   dry, adversarial verification, a completeness critic, AND a live track
   (desktop, mobile, wiki, online smoke), run by a session with no
   authorship stake in any phase.
2. The release-malware-audit skill over the working tree.
3. Screenshots refreshed for every visual surface, committed and linked.
4. `npm run gate` at release tier, the deploy runbook check (server
   first, iOS binary shipped per R34), then the merge decision with the
   maintainer.

---

## Deferred and accepted, with reasons (pass-2 additions)

- Thornpeak t1 faucet: accepted, telemetry-watched (R31).
- Copper Dig camp danger: intended; level first (R32).
- Tier-3 danger placements: deliberate, allowlisted (R33).
- Offline console `slotToolEffect`: /dev-equivalent, recorded (8e.5).
- Stale-client cosmetic arms without a graceful fallback: recorded in
  phase 11 as accepted.
- Editor/custom-map professions, including the editor 2D canvas's node
  blindness and the 3D viewport's terrain re-seat: deferred behind R37
  until the zone-4 design pass.
- A hard client version floor: separate later decision (R34).
- Pass-1 deferrals stand: shared node depletion (telemetry-gated), the
  strike minigame (rejected), the quest XP curve (out of scope).

## Rulings R1 to R23 (pass 1, unchanged)

R1 branch, R2 content-unique identity, R3 telemetry re-key, R4 koi odds,
R5 cap rises with zones, R6 perf target, R7 purchase-versus-use as
amended by R22, R8 rod fees stand, R9 refuse inert slots, R10 starter
tool cadence plus truthful comment, R11 move wood_mirefen_t2, R12
biteBody number, R13 derived mastery test, R14 Copper Dig pathing arm,
R15 map-doc D2 note, R16 header restate, R17 Marks-to-copper conversion
blessed, R18 reel-window trim blessed, R19 fishing teaching ceiling, R20
rod ladder stays buyable at Wilkes, R21 Thornpeak gatherer deed, R22 land
tool USE requirements (rods exempt), R23 future-zone tools through
content. Full text in this file's git history (pass-1 revision).
