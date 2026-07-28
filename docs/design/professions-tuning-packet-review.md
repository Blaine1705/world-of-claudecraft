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
(recharge material identity, prompt-flow timing) are settled at the
rulings checkpoint before phase 12.

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

BUILT 2026-07-28 (QA pending). What each item settled:

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
4. DONE: `pruneTierMailToActiveMajors` runs on both transition entry
   points (the quest attunement path and the legacy `switchArchetype`
   command) and on load (healing stale pre-prune saves); a craft shared
   by the old and new pair keeps its entry, so no live crossing is
   swallowed.
5. DONE: the `craftThrottle` comment now cites `lastActiveTick` and
   records that its session-only status is deliberate, unlike the
   now-persisted `nodeHarvestReadyAt`.

---

## Rulings checkpoint (before phase 10)

One sitting, no build: confirm the R24 to R38 encodings against the
phase 8/9 diffs, and settle the two scheduled acquisition-craft decisions
(the recharge MATERIAL identity, and whether the prompt confirm flow ships
with phase 12 or phase 14). Anything phases 10 to 17 discover that needs a
new ruling gets an R-number here rather than an inline decision; this
ledger is the channel pass 2 found missing.

---

## Phase 10: sim correctness and session lifecycle (+ fishing telemetry)

Build: ultracode (many interacting exit paths; fan out per path and
adversarially verify). QA: ultracode, new session.

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
   closing the 24-yard cross-boundary cast.
6. Queued-spell buffer clears on session start (R29).
7. A fully-absorbed hit skips the cast cancel but its knockback still
   displaces the caster; make absorb consistent with the cancel rule
   (whichever way the checkpoint rules, displacement and cancel agree).
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

---

## Phase 11: stale-client and rollout compatibility

Build: Fable xhigh. QA: Fable xhigh, new session (verify against the real
merge-base bundle via git show, the way pass 2 did).

R34 scope: guards, not a floor.

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

---

## Phase 12: the acquisition craft

Build: ultracode (the free-grant incident lived exactly here; adversarial
verification is mandatory). QA: ultracode, new session.

Pass-1 phase 10 scope plus the pass-2 constraints:

1. The capacity pre-gate fix (8a.1) must already be in (it is, phase 8).
2. ONE validation authority: the resolver policy check runs at slot time
   AND load time (phase 8's 8a.2 arm), and the craft mints through the
   same resolver, so no path can mint what another path refuses.
3. Recharge pricing in a MATERIAL IDENTITY per the checkpoint ruling; the
   flat 4-count spans a 20x value range and cannot ship.
4. Charge economics per R30: slot-time mint stands, recharge re-derives
   the maximum from currently-owned tools.
5. `always`-mode waste (charges burned when the bonus changes nothing):
   make depletion conditional on the bonus mattering, or price charges
   assuming waste, per the checkpoint ruling.
6. The rollback caveat becomes real player value here: phase 9's shared
   rollback note is re-checked and the release notes carry it.
7. Remove the dev gate and its two-direction pin in the same change; the
   enchanting guide prose decision (what the page promises) is made here
   and HANDED to phase 17 for the wording.
8. `craftedBy` starts being written by the production craft; the
   original-crafter discount goes live with it.

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
   the curve does.
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

---

## Phase 14: UX polish (desktop, mobile, gamepad, accessibility)

Build: Fable xhigh (screenshot-driven, serial). QA: ultracode, new
session (fresh-eyes coverage over every surface).

Pass-1 phase 12 scope (gather-node tooltip grade preview; respawn
countdown in the node tooltip; last-charge signal; the prompt confirm
flow if the checkpoint placed it here; professions window `maxSkill`
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
   - Enchanting `identityBody` per the phase 12 decision.
   - The packet's own reword calling the Glyphsteel Bar Bree-only
     (Gizzel stocks it at the toolworks).
   - `fish.startBody` "rather than bought" (the Marks route).
   - `bandsBody`'s cast-shave claim rendering on the fishing page where
     bands shave nothing.
   - The tool table gains the delve CLEARS gates beside the Marks prices.
   - `scheduleNote` joins the remove-and-refill set (the R19 reword
     stales it; pass 2 found the pass-1 refill scope missed it).
   - R32's veto-able soft danger hint in "Where to start".
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
