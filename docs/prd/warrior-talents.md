# Warrior: Talent Choices kit and spec decisions

Single source of truth for the warrior redesign (Talents 2.0). BOTH Claude and any other agent
(Codex, Gemini) read AND update this file. If the operator gives a new decision mid-session,
write it here in the same change so the next agent does not have to guess. Never infer a warrior
design decision from memory or from World of Warcraft; if it is not written here and not obvious,
ask the operator.

Status legend: DONE = implemented and green on `integration`; PENDING = not yet built.

## Specs
- Arms (dps): two-handed, deliberate hits, bleeds. Signature `mortal_strike` ("Maiming Strike").
  Mastery "Sharpened Blades" (+10% melee ability damage).
- Fury (dps): dual-wield frenzy. Signature `bloodthirst` ("Bloodletting"). Mastery "Bloodletter"
  (+5% crit, +10 attack power).
- Protection (tank): active mitigation + control. Signature `shield_slam` ("Shieldcrack").
  Mastery "Recompense" (+30% threat, +10% armor).

## Base-kit changes (DONE)
- `battle_shout` "Iron Bellow": GROUP attack-power buff (caster + friendlies within 40 yd),
  duration 1 HOUR, ranks 20/35/50 AP, cost 0 (free), learnLevel 7. Mutually exclusive with
  `commanding_shout` (the `warrior_shout` group).
- `bloodthirst` "Bloodletting" (es "Sangria"): Fury signature. Instant weapon attack that heals the
  caster 3% of max health AND generates 10 rage. Fury has NO `bloodrage`: Bloodletting is its
  generator instead (see gating). While `furious_mending` is active its self-heal is 20% (below).
- `mortal_strike` "Maiming Strike": Arms signature. Adds a 50% healing-reduction debuff on the
  target for 10 sec (the `mortal_wound` aura).
- `rend` "Deep Gash": learnLevel 5.
- `whirlwind` "Bladed Gyre" (Fury, talent-granted) AREA ECHO: after casting it, the caster's next
  2 single-target damaging abilities also strike enemies near their target (aura "Bladed Echo",
  2 charges).

## Spec gating (`AbilityDef.specs`; absent = every spec keeps it)
A player with no spec chosen keeps the full kit; once a spec is picked, abilities reserved for
other specs drop out. Talent/row grants are never gated (their tree is already spec-scoped).

| Ability (id) | Specs that keep it |
|---|---|
| `defensive_stance` (Guarded Stance) | arms, prot |
| `sunder_armor` (Armor Shear) | arms, prot (but its HIGH threat applies ONLY for prot, see below) |
| `commanding_shout` (Bolstering Cry) | prot |
| `demoralizing_shout` (Direhowl) | prot |
| `rend` (Deep Gash) | arms |
| `overpower` (Redhand) | arms |
| `slam` (Brute Swing) | arms, prot |
| `cleave` (Reaping Arc) | arms, prot |
| `bloodrage` (Blood Toll) | arms, prot (Fury uses Bloodletting instead) |

## New abilities

### Fury (DONE)
- `raging_gale` "Twinstrike": lvl 10, free, 2 charges (8s recharge), two 60%-weapon strikes + 8 rage.
- `furious_mending` "Furious Mending" (Regeneracion Enfurecida): lvl 14. For 10s you take 20% reduced
  damage AND, while it is active, your `bloodthirst` (Sangria) self-heal becomes 20% of max health
  (instead of 3%). It is NOT a flat 20% HoT (operator correction 2026-07-07): the healing is
  delivered by casting Bloodletting under the buff.
- `red_harvest` "Red Harvest": lvl 16, 80 rage, three full weapon strikes.

### Arms (PENDING as of this writing; being built)
- `breachmaker` "Breachmaker" (Aplastar Coloso): lvl 16, 10 rage, 45s cd. Weapon strike + marks the
  target so ONLY THE CASTER deals +20% damage to it for 8 sec. PERSONAL, not raid-wide (aura
  `vuln_source`, sourceId = caster). Operator-confirmed 2026-07-07: personal, level 16.
- `measured_fury` "Measured Fury" (Intrepidez): lvl 12, PASSIVE (`AbilityDef.passive`). Your
  abilities cost 10% less rage. Not castable.

### Protection (DONE)
- `raised_guard` "Raised Guard": lvl 10, 15 rage, 12s cd, 50% PHYSICAL-only damage reduction for 6s.
- `iron_resolve` "Iron Resolve": lvl 14, spends ALL current rage (min 20), absorbs (rage x 4) for 10s.
- `faultline` "Faultline": lvl 16, 15 rage, 30s cd, frontal AoE damage + 3s stun.
- `defiant_bellow` "Defiant Bellow": lvl 18, free, 60s cd, area taunt (10 yd).
- `emboldening_roar` "Emboldening Roar": MOVED from Fury to PROT (operator decision 2026-07-07),
  lvl 18. Caster + allies within 40 yd: their next 3 ability casts are guaranteed crits.
  Open tweak to confirm with operator: prot then has two lvl-18 abilities (this + Defiant Bellow),
  and Fury loses its lvl-18 slot.

## Spec-conditional and UI decisions (operator, 2026-07-07)
- `sunder_armor` (Armor Shear) threat: the HIGH tank threat applies ONLY when the caster's committed
  spec is Protection. For Arms it is a plain armor-shred with normal threat (no tank threat bonus).
- Choosing a spec must be a STAGED edit that requires an explicit Save, like talent points; it must
  NOT apply the instant it is clicked.

## Naming (de-brand)
New ability names must be original (not WoW). The locked rename table is `ip-refactor/NAME-MAP.md`.
Known debt: 12 abilities still ship WoW names today (pummel, heroic_leap, rallying_cry, storm_bolt,
intimidating_shout, bladestorm, victory_rush, piercing_howl, die_by_sword, recklessness, avatar,
sanguine_aura); the G0 scanner does not arm them yet. Flag to the maintainer, do not block on it.

## The row/choice engine (PENDING consolidation)
Our warrior work is built on OUR choice-row engine (`src/sim/content/talent_rows.ts` +
`warrior_rows.ts`). The maintainer (ryze) opened PR #1614 with a DIFFERENT engine covering all 9
classes (`src/sim/content/choice_rows.ts` + `choice_rows_classic.ts`). The agreed plan is to
consolidate onto ryze's #1614 as the base, with our playtested warrior tunings + mechanics ported
on top, credited to the operator. The sim MECHANICS (area echo, guaranteed-crit override,
spec-gating field, buff_dr/buff_dr_phys, vuln_source, aoe_echo, absorbSpentResource, aoeTaunt,
frontal AoE, maxCharges) live in engine-independent combat files and port cleanly; only the row
DATA must be re-expressed in ryze's `choice_rows.ts` format. A naive cherry-pick FAILS (the engines
differ); it is a manual port. Do NOT push anything until the operator has playtested.

## Handoff notes (update on every session switch)
- 2026-07-07: base kit + spec gating + Fury kit + Protection kit DONE and green on `integration`.
  Arms kit (Breachmaker + Measured Fury) in progress. The 5 operator gating/level/cost decisions
  above are applied. Codex's earlier Arms commit is preserved on branch `integration-codex-arms`.
  Not yet ported to ryze's #1614; not yet pushed.
