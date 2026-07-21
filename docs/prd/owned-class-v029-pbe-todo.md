# Hunter, Shaman, and Priest v0.29.0 PBE todo

Status: active PBE work list

Integration PR: #2218

Local correctness pass: verified on top of `55ed43b5b` in the isolated integration worktree.
Release-branch reconciliation is still required before review.

Scope: Hunter, Shaman, and Priest, including all nine specializations, their shared talent rows,
their player-facing states, and the new rotation and starter action-bar work requested after the
first PBE review.

This is the execution order. Finish correctness and measurement before broad tuning. Finish the
English tooltip audit after mechanics and numbers stop moving.

Detailed One Button priorities and exact level 20 templates are in
[`docs/design/one-button-and-spec-bars-v029.md`](../design/one-button-and-spec-bars-v029.md).

## Definition of done

- [ ] Every spec owns only its intended spells and clears old spec state on change, death, relog,
      reconnect, and loadout swap.
- [ ] Every damage, healing, mitigation, threat, and resource result is measured in the shared
      1-target and 3-target harness.
- [ ] Every level 20 spec has a useful default action bar that is applied only when safe.
- [ ] Approved DPS specs have a spellbook `One Button` action with a documented and tested priority
      list.
- [ ] Every new English spell, talent, aura, proc, and mechanic tooltip is plain, exact, and backed
      by live scaling tests.
- [ ] Mobile, desktop, reduced-motion, low-graphics, offline, online, and headless behavior agree.
- [ ] PBE feedback is retested on the same fixed gear and target setup.
- [ ] The integration branch passes the required targeted checks and full gate before merge.

## 1. Lock the baseline and test harness

- [ ] Record the exact #2218 commit used for each PBE measurement.
- [ ] Use the same level 20 gear, target level, target armor, buffs, talents, pet, and weapon setup
      for every comparison.
- [ ] Add a 60 sec single-target sustained test.
- [ ] Add a 15 sec single-target burst test.
- [ ] Add a 60 sec 3-target sustained test.
- [ ] Add a 15 sec 3-target burst test.
- [ ] Record total DPS, per-target DPS, damage by source, resource remaining, cooldown use, and the
      number of rotational buttons pressed.
- [ ] Add a fixed healer damage profile and record HPS, mana, overhealing, prepared healing, and
      emergency recovery time.
- [ ] Add a Warspirit off-tank scenario and record incoming damage, threat, forced-target uptime,
      and time to lose threat after leaving Stonebound.
- [ ] Keep results for release classes beside these nine specs so elite difficulty is not tuned
      only around possibly overtuned redesigns.

## 2. Correctness and state cleanup

- [x] Show Tithefiend damage in floating combat text and attribute it to the Priest in meters.
- [x] Replace every remaining player-facing `Smite` label with `Scouring Hymn` while keeping the
      saved internal id stable.
- [x] Keep Overdraw to one tracker in the aura list. The current branch already deduplicates the
      tracker; a regression test now pins that behavior.
- [x] Show persistent engine states without a one-day duration. This covers Flow State, Overdraw,
      Thunder charges, Warspirit cadence, and the other long-lived Hunter and Shaman counters.
- [x] Confirm Gloamveil uses the existing untimed form display.
- [x] Show permanent states as permanent. Do not display a one-day duration for Flow State,
      Gloamveil, Overdraw tracking, or similar states.
- [x] Clear Flow State when the Shaman changes spec. The existing cleanup was correct and now has
      a direct regression test.
- [ ] Audit every spec-only aura, bank, link, guardian, posture, proc counter, and action
      replacement for cleanup on spec change.
- [ ] Repeat the cleanup audit for death, release, disconnect, reconnect, relog, loadout change,
      and character load.
- [ ] Confirm removed wrong-spec actions are cleared from saved action bars and cannot be cast by a
      forged client command.
- [ ] Confirm transformed actions keep the saved slot and return to the base action after the state
      ends.
- [x] Change every active Shaman spec weapon enhancement from 5 min to 30 min.
- [x] Confirm one weapon posture replaces the other and never leaves both active.

## 3. One Button spellbook feature

This is a new gameplay automation feature. It needs Levy or Fernando approval before it lands on
PBE. Keep it as one incremental feature behind existing ability and command seams.

### Product rules

- [ ] Add one visible spellbook action named `One Button` for each approved DPS specialization.
- [ ] Explain in its tooltip that each press uses the highest-priority available rotational action.
- [ ] Keep the player responsible for targeting and positioning.
- [ ] Do not automate movement, interrupts, defensive cooldowns, crowd control, dispels, taunts,
      long travel, resurrection, pet taming, or encounter-specific utility.
- [ ] Decide whether major offensive cooldowns are automatic, opt-in, or excluded. Default to
      excluded until PBE approves automatic use.
- [ ] Never queue an ability the player does not know or that belongs to another spec.
- [ ] Never bypass range, line of sight, cost, cooldown, cast, channel, target, pet, weapon, aura,
      or global cooldown rules.
- [ ] Return one clear reason when no rotational action is usable.
- [ ] Do not add another resource bar or hidden resource.
- [ ] Keep priority logic deterministic and shared across offline, online, server, and headless
      hosts.

### Rotation records

- [ ] Store each approved priority list as data or a small pure resolver, not a hardcoded branch in
      the HUD or `sim.ts`.
- [ ] Record the ideal single-target priority for Packlord.
- [ ] Record the ideal 3-target priority for Packlord.
- [ ] Record the ideal single-target priority for Coldsight.
- [ ] Record the ideal 3-target priority for Coldsight.
- [ ] Record the ideal single-target priority for Fieldcraft.
- [ ] Record the ideal 3-target priority for Fieldcraft.
- [ ] Record the ideal single-target priority for Thundercall.
- [ ] Record the ideal 3-target priority for Thundercall.
- [ ] Record the ideal single-target priority for Warspirit.
- [ ] Record the ideal 3-target priority for Warspirit.
- [ ] Record the ideal single-target priority for Vespers.
- [ ] Record the ideal 3-target priority for Vespers.
- [ ] Decide whether Doctrine receives a damage-only version or is excluded because it is a hybrid
      healer.
- [ ] Exclude Benison and Spiritmend unless a separate healer-assist design is approved.

### One Button tests

- [ ] Add fail-first tests for spellbook ownership and wrong-spec rejection.
- [ ] Test every priority step with the higher-priority actions available and unavailable.
- [ ] Test no-resource, no-target, wrong-range, dead-pet, missing-pet, moving, silenced, disarmed,
      and line-of-sight cases.
- [ ] Test 1-target and 3-target decisions.
- [ ] Test that a press casts only one action and spends resources once.
- [ ] Test channels and cast times without clipping or free follow-up casts.
- [ ] Test same-seed event and damage parity across the direct action and One Button path.
- [ ] Test server authority and reject a forged request for an action outside the selected
      priority record.
- [ ] Test action-bar, keybind, controller, and mobile action-ring use.
- [ ] Add an English tooltip that names what the button does and what it deliberately leaves to the
      player.

## 4. Level 20 default action bars

Apply a default bar when a player first selects a spec at level 20 or when an empty bar is repaired.
Do not overwrite a player-customized bar.

### Shared rules

- [ ] Define the exact empty-bar and first-spec-selection conditions.
- [ ] Preserve every non-empty player slot unless the slot contains an invalid wrong-spec action.
- [ ] Clear invalid old-spec actions, then fill only genuinely empty slots from the new spec
      template.
- [ ] Keep the same functional categories in the same positions where practical: core action,
      spender, area action, interrupt, movement, defense, heal, major cooldown, and utility.
- [ ] Keep the highest-frequency actions in the easiest keyboard and mobile positions.
- [ ] Put `One Button` in a visible starter slot when the spec owns it, without replacing the manual
      rotation.
- [ ] Include no unlearned, talent-dependent, or wrong-spec action in a base template.
- [ ] Add talent-granted actions to the next safe empty slot when selected.
- [ ] Make template application deterministic across offline, online, load, respec, and imported
      loadouts.
- [ ] Add a player setting or one-time reset command only if PBE shows that automatic repair is not
      enough.

### Hunter templates

- [ ] Packlord: Pack Command, Fell Shot, Venom Barb, Volley, One Button, Hushing Shot, Trailbreak,
      Shellskin, Wildheart, Howling Rage, Frostjaw Trap, and pet care access.
- [ ] Coldsight: Measured Shot, Long Draw, Fell Shot, Fevered Draw, Volley, One Button, Hushing Shot,
      Trailbreak, Shellskin, Wildheart, Cold Focus, and Frostjaw Trap.
- [ ] Fieldcraft: Bloodhook, Gutting Strike, Woundrend, Shrapnel Charge, One Button, Hushing Shot,
      Trailbreak, Shellskin, Wildheart, Bloodtrail Assault, Frostjaw Trap, and Fettering Slash.
- [ ] Decide whether guises live on the main bar, a secondary bar, or a stance strip.
- [ ] Keep Wildbond, Patch Up, and Release Companion reachable without crowding the main rotation.

### Shaman templates

- [ ] Thundercall: Arc Bolt, Earthen Jolt, Cinder Jolt, Rime Jolt, Faultwake, One Button, Thunder
      Ward, Mending Waters, Shadewolf, Pyrebrand Weapon, Primal Mastery, and Storm Chorus.
- [ ] Warspirit: Ancestral Strike, Earthen Jolt, Arc Bolt, Cinder Jolt, Rime Jolt, One Button,
      Thunder Ward, Mending Waters, Shadewolf, Galeheart Weapon, Stonebound Weapon, and Storm Chorus.
- [ ] Spiritmend: Mending Waters, Tidecall, Cascading Mend, Earthen Jolt, Arc Bolt, Thunder Ward,
      Shadewolf, Lifespring Weapon, Storm Chorus, and the chosen talent utility.
- [ ] Keep Galeheart and Stonebound beside each other so the damage and off-tank posture choice is
      obvious.
- [ ] Do not put a DPS One Button action on Spiritmend by default.

### Priest templates

- [ ] Doctrine: Scouring Hymn, Scouring Mercy, Psalm of Warding, Dirge of Decay, Mindfracture,
      Urgent Prayer, Solemn Prayer, Veilstep, Terror Canticle, and chosen talent utility.
- [ ] Benison: Solemn Prayer, Urgent Prayer, Choirmend, Sunburst Canticle, Seraphic Vigil, Lingering
      Grace, Psalm of Warding, Veilstep, Terror Canticle, and chosen talent utility.
- [ ] Vespers: Mindfracture, Dirge of Decay, Litany of Woe, Call Tithefiend, Gloamveil, One Button,
      Psalm of Warding, Urgent Prayer, Veilstep, Terror Canticle, and chosen talent utility.
- [ ] Decide whether Doctrine gets a One Button slot only after its hybrid role decision is made.
- [ ] Keep emergency healing visible on every Priest template without crowding the DPS loop.

### Action-bar tests

- [ ] Add a table-driven expected template for all nine specs.
- [ ] Test first selection, respec, repeat selection, relog, reconnect, loadout import, level-up to
      20, and an already-customized bar.
- [ ] Test that no customized valid slot is overwritten.
- [ ] Test that wrong-spec actions are removed and safe empty slots are filled once.
- [ ] Test that talent grants enter and leave cleanly.
- [ ] Test desktop bars, controller access, and mobile action-ring reachability.

## 5. Hunter PBE work

### Packlord, Beast Mastery

- [ ] Treat Pack Command as the non-retail name for the Kill Command generator role.
- [ ] On a successful living-pet hit, Pack Command generates Focus and one Pack Ferocity stack.
- [ ] Keep Pack Command from granting anything on a miss, invalid target, missing pet, or dead pet.
- [ ] Make Pack Ferocity a visible Hunter-owned buff with three stages.
- [ ] Give each stage a visible pet size and red-tint increase without changing collision, reach,
      or pathing.
- [ ] Tune a clear per-stack increase to all pet-originated damage. The current design target is
      10% per stack, subject to PBE measurement.
- [ ] Apply the bonus to pet basic attacks, Pack Command, pet cleaves, pet claps, Unleash Beast,
      and Stampede beasts.
- [ ] Do not apply Ferocity to the Hunter's direct weapon damage.
- [ ] Resolve Pack Command with the pre-cast Ferocity state, then add its new stack.
- [ ] At three stacks, replace Pack Command with Unleash Beast in the same saved action slot.
- [ ] Make Unleash Beast consume all three stacks, use the full Ferocity bonus for its clap and
      frenzy, then return the pet to its calm size and color.
- [ ] Make Fell Shot a deliberate Focus spender instead of the only repeated filler.
- [ ] Add Stampede as a Packlord offensive cooldown that summons temporary beasts to attack the
      selected target without pet micromanagement.
- [ ] Credit Stampede damage to the Hunter in meters and show it in floating combat text.
- [ ] Decide whether Stampede snapshots Ferocity or reads it live. Use one rule in combat and the
      tooltip.
- [ ] While Stampede is on cooldown, let successful Pack Commands trigger a visible Stampede Ready
      proc that resets the cooldown and makes the action glow.
- [ ] Do not allow the reset proc while Stampede beasts are active.
- [ ] Add deterministic bad-luck protection after the approved number of failed Pack Commands. The
      current design range is five to six failures.
- [ ] Retest the manual and One Button loops after Stampede lands.

### Coldsight, Marksmanship

- [x] Keep Overdraw to one tracker in the aura list.
- [x] Replace its one-day display with an untimed counter state.
- [ ] Confirm Measured Shot remains the deliberate Focus generator.
- [ ] Confirm Long Draw is the main Focus spender and respects movement and cast interruption.
- [ ] Confirm Fevered Draw can move while channeling and does not double-count tooltip damage.
- [ ] Retest Cold Focus duration, Focus generation, Long Draw cost, and cast-time changes.
- [ ] Compare single-target and 3-target output after the shared Overdraw fix.

### Fieldcraft, Survival

- [ ] Reduce Guttering Strike or Gutting Strike spam from the reported 150 DPS outlier.
- [ ] Reduce empowered Woundrend from the reported 300 DPS outlier.
- [ ] Keep the Trailbreak into Bloodhook re-entry interaction.
- [ ] Keep Bloodhook as movement to the enemy, never a pull of the enemy.
- [ ] Keep the range and blocked-geometry checks.
- [ ] Keep the melee-led bleed, trap, explosive, and disengage identity.
- [ ] Audit Bloodhook, Bloodhook Wound, Woundrend, Shrapnel Charge, Bloodtrail Assault, and Hunting
      Momentum against the shared scaling rules.
- [ ] Decide and implement the intended Bloodhook bleed scaling before claiming it in the tooltip.
      The current base bleed is flat 24 damage over 12 sec; only the re-entry hit adds 8% of Ranged
      Attack Power.
- [ ] Replace `primary wound` with plain English in every player-facing description.
- [ ] Test Bloodhook tooltip values at two Ranged Attack Power values after scaling lands.

#### Bloodhook DPS balance

- [ ] Set a per-cast damage budget for Bloodhook's base bleed, optional re-entry hit, and
      Bloodtrail spread. Its movement utility must count as part of the spell's power budget.
- [ ] Measure Bloodhook alone and inside the full Fieldcraft rotation in the 15 sec and 60 sec
      1-target tests. Record base bleed damage, Ranged Attack Power contribution, re-entry damage,
      and cooldown-normalized DPS separately.
- [ ] Repeat the measurement with 3 targets. Confirm Bloodtrail spread and Shrapnel interactions
      stay within the shared area-damage target and do not grow more than intended.
- [ ] Tune the flat bleed and Ranged Attack Power coefficient separately so Bloodhook is useful at
      level 5, scales with level 20 gear, and does not become the largest rotational damage source.
- [ ] Add deterministic tests that pin the chosen 1-target and 3-target damage budgets at low and
      high Ranged Attack Power, including normal entry and Trailbreak re-entry.

## 6. Shaman PBE work

### Thundercall, Elemental

- [ ] Preserve the current burst feel while bringing the reported 200 sustained and 260 burst DPS
      into the shared target range.
- [ ] Confirm exactly which spells build Thunder and which spells spend it.
- [ ] Confirm Earthen Jolt and Faultwake spend the bank only after a valid cast resolves.
- [ ] Keep defensive Thunder Ward charges separate from offensive Thunder charges.
- [ ] Treat Chain Lightning as a separate follow-up, not a requirement for this PBE fix pass.
- [ ] Treat extra shock interactions as a separate follow-up after the base bank is clear.

### Warspirit, Enhancement

- [ ] Preserve the liked instant-spell flexibility and reported 170 DPS feel.
- [ ] Keep Galeheart as the damage posture and Stonebound as the explicit off-tank posture.
- [ ] Confirm dual-wield main-hand and off-hand hits advance one deterministic cadence.
- [ ] Prevent echoes from advancing or recursively triggering the cadence.
- [ ] Remove every Stonebound armor, mitigation, threat, control, and smoothing effect when the
      posture ends.
- [ ] Benchmark damage, mitigation, and threat before changing numbers.

### Spiritmend, Restoration

- [ ] Preserve the liked Mending Current loop.
- [ ] Confirm Mending Waters creates an owned current on the healed ally.
- [ ] Confirm Tidecall immediately heals and enlarges that current.
- [ ] Confirm Cascading Mend consumes every owned current on every ally it reaches.
- [ ] Keep another Shaman's currents separate.
- [ ] Test the normal heal when an ally has no prepared current.
- [ ] Treat an out-of-combat group revive talent as a separate follow-up.

### Shared Shaman

- [x] Change weapon enhancement duration to 30 min.
- [x] Fix Flow State so its ready state is shown without a timer and never survives a spec change.
- [ ] Rewrite every level 20 talent tooltip with exact spec-specific outcomes.
- [ ] Retest weapon, Flow State, and talent state through relog and reconnect.

## 7. Priest PBE work

### Vespers, Shadow

- [ ] Raise normal rotation damage before adding more power to Tithefiend.
- [ ] Compare Vespers with other DPS specs in both 1-target and 3-target tests.
- [ ] Reduce Tithefiend mana restoration so it does not create effectively infinite mana.
- [x] Show every Tithefiend hit in floating combat text and credit it to the Priest in meters.
- [ ] Add depth through one existing Shadow spell interacting with Effigy or Gloomtithe rather
      than adding another button by default.
- [ ] Keep Effigy ownership, movement, replacement, and cleanup deterministic.
- [ ] Explain exactly how Effigy is applied, how echoes choose targets, how Gloomtithe is earned,
      its five-stack cap, and what Call Tithefiend consumes.
- [ ] Keep the rotation mobile friendly.

### Doctrine, Discipline

- [ ] Do not tune Doctrine by comparing it only with the currently weak Vespers result.
- [ ] Benchmark the reported 70 DPS and 20 to 30 HPS against an explicit hybrid role target.
- [ ] Measure damage conversion, shield use, emergency direct healing, mana, and group value.
- [ ] Decide whether its One Button option is a damage priority helper or whether hybrid play stays
      fully manual.
- [ ] Preserve the fresh damage-to-clean-healing play style.

### Benison, Holy

- [ ] Run real dungeon tests before changing Solemn Prayer or Seraphic Vigil.
- [ ] Test whether Solemn Prayer needs a longer cast time.
- [ ] Test whether Seraphic Vigil needs more than its current 30 sec duration.
- [ ] Measure large group healing, angel timing, overhealing, mana, and emergency recovery.
- [ ] Preserve the strong group-healing identity without making normal dungeon damage irrelevant.

### Shared Priest

- [x] Replace all visible English `Smite` labels with `Scouring Hymn`.
- [x] Confirm Gloamveil uses the existing untimed form display.
- [ ] Audit cleanup for Doctrine links, Seraphic Vigils, Effigies, Gloomtithe, Tithefiends, and
      capstone state.

## 8. Final English tooltip audit

Use `docs/design/tooltip-writing.md` and the tooltip skill. Do this after the mechanics and balance
numbers above are locked. Edit English sources first. Do not hand-edit locale overlays or generated
resolved catalogs.

### Required content for every tooltip

- [ ] State the target and main action plainly.
- [ ] Show exact live damage, healing, absorb, resource, duration, cooldown, charge, stack, radius,
      and target-cap values.
- [ ] State important triggers, reset rules, consumption rules, and failure conditions.
- [ ] State or correctly resolve Spell Power, Attack Power, Ranged Attack Power, weapon damage,
      maximum-health, pet-state, or flat scaling.
- [ ] For periodic effects, state whether the number is total damage or per tick.
- [ ] Remove unexplained terms such as `primary wound`, `valid impact`, `spec relationship`, and
      `calculated healing`.
- [ ] Keep ability names consistent across the spellbook, action bar, aura frame, talent window,
      combat log, floating combat text, meters, and guide.
- [ ] Test each scaling tooltip at two power values and compare it with the combat result.

### Hunter spell and state inventory

- [ ] Shared: Harrier's Guise, Venom Barb, Fell Shot, Rattling Shot, Fettering Slash, Trailbreak,
      Wildheart, Shellskin, Frostjaw Trap, Wildbond, Release Companion, Patch Up, Marten's Guise,
      Courser's Guise, Volley, and Hushing Shot.
- [ ] Packlord: Pack Command, Pack Ferocity, Unleash Beast, Howling Rage, Stampede, Stampede Ready,
      and every temporary beast damage source.
- [ ] Coldsight: Measured Shot, Long Draw, Fevered Draw, Cold Focus, and Overdraw.
- [ ] Fieldcraft: Bloodhook, Bloodhook Wound, Gutting Strike, Hunting Momentum, Woundrend, Shrapnel
      Charge, Bloodtrail Assault, and the re-entry payoff.
- [ ] Hunter talents: Tactical Retreat, Enduring Courser, Predator's Pace, Receding Shell, Shared
      Recovery, Beastguard, Double Hush, Binding Payload, Crippling Pursuit, Efficient Rhythm,
      Trapcraft, Guise Mastery, Apex Instinct, Shell and Fang, Pack Rally, Overdraw, Chain Reaction,
      and Fang Chorus.

### Shaman spell and state inventory

- [ ] Shared: Arc Bolt, Mending Waters, Earthen Jolt, Thunder Ward, Cinder Jolt, Rime Jolt,
      Shadewolf, and Storm Chorus.
- [ ] Thundercall: Pyrebrand Weapon, Thunder charges, Faultwake, and Primal Mastery.
- [ ] Warspirit: Galeheart Weapon, Stonebound Weapon, Ancestral Strike, Stormcast, cadence echoes,
      and off-tank threat or mitigation states.
- [ ] Spiritmend: Lifespring Weapon, Mending Current, Tidecall, and Cascading Mend.
- [ ] Shaman talents: Wolfstep, Gathering Winds, Flowing Elements, Stoneward, Warded Elements,
      Ancestral Mending, Fault Rebuke, Rime Lock, Gripping Earth, Flow State, Imbue Mastery, Ward
      Cycle, Primal Exaltation, Wayfarer Grace, Ancestral Bulwark, Deep Reservoir, Echoing Elements,
      and Living Weapon.

### Priest spell and state inventory

- [ ] Shared: Scouring Hymn, Whispered Prayer, Litany of Resolve, Dirge of Decay, Psalm of Warding,
      Lingering Grace, Mindfracture, Solemn Prayer, Litany of Woe, Urgent Prayer, Veilstep, and
      Terror Canticle.
- [ ] Doctrine: Scouring Mercy, Doctrine link, converted healing, and any damage-priority One Button
      state if approved.
- [ ] Benison: Choirmend, Sunburst Canticle, Seraphic Vigil, angel trigger, and angel recovery.
- [ ] Vespers: Gloamveil, Effigy, Effigy echoes, Gloomtithe, Call Tithefiend, Tithefiend damage, and
      Tithefiend mana return.
- [ ] Priest talents: Sheltering Step, Veil Unbound, Processional Grace, Last Prayer, Shattered
      Psalm, Wounded Halo, Hushword, Lingering Dread, Binding Psalm, Stilled Mind, Measured Faith,
      Living Covenant, Anointing, Martyr's Aegis, Choir of Deliverance, Twin Covenant, Second Verse,
      and Incarnate Spirit.

## 9. Dungeon and unrelated follow-ups

Keep these outside the nine-spec fix unless a separate PR is approved.

- [ ] Benchmark elite and dungeon scaling with unchanged release classes before raising global mob
      health or damage.
- [ ] Investigate Gravewyrm normal and heroic difficulty as its own balance task.
- [ ] Fix dungeon reset being blocked by unlooted loot as its own bug-fix PR.
- [ ] Audit weak wand auto-attack scaling as its own combat-balance task.
- [ ] Consider Shaman group revive as its own utility follow-up.
- [ ] Consider Thundercall Chain Lightning as its own rotation follow-up.
- [ ] Consider more shock interactions only after current Thunder generation and spending are
      clear.

## 10. Final validation and handoff

- [ ] Run focused mechanic tests for Hunter, Shaman, and Priest.
- [ ] Run spec ownership, hotbar, tooltip consistency, scaling, cleanup, snapshot, parity,
      localization, guide, architecture, and talent tests touched by the work.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run changed-file formatting and copy checks.
- [ ] Run mobile portrait and landscape checks for action bars, spellbook, One Button, aura states,
      and long tooltips.
- [ ] Run desktop checks for the same surfaces.
- [ ] Run reduced-motion and low-graphics checks for every actionable state.
- [ ] Regenerate owned generated artifacts through their normal commands.
- [ ] Run `npm run gate` on the fixed final head.
- [ ] Update the #2218 PR body with the final PBE measurements, screenshots, fails-before and
      passes-after bug evidence, and remaining separate follow-ups.
- [ ] Keep #2218 current with `release/v0.29.0` through review until merge or explicit closure.
