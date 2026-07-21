# Paladin Devotion core

Status: playable foundation for Sunmender, Faithwarden, and Dawnreaver. This document describes
the implementation before new Paladin choice rows are authored. Release-era Paladin rows
remain readable as compatibility data but are intentionally hidden in this branch.

All numbers below are base values before attributes, mastery, critical hits, armor, or other
shared modifiers. Unless marked off GCD, instant abilities activate the normal global
cooldown.

## Shared resource

Devotion ranges from 0 to 20. Holy gains it from effective healing and from unleashing an
active Seal with Verdict. Protection and Retribution gain it from successful damaging
actions. Protection also gains 1 Devotion from a successful block, limited by a 6 second
internal cooldown. Devotion begins decaying 10 seconds after combat ends, at 1 point every
2 seconds.

Divine Ascension consumes 20 Devotion, grants 5 Ascension charges, and lasts up to 25
seconds. Only explicitly marked abilities consume a charge, at most one charge per cast.
The state ends when all five charges are spent or the timer expires. Generation continues
during Ascension but its bank is capped at 10 Devotion.

## Core class abilities

| English / Spanish | Function and normal effect | Devotion | Cooldown, cast, GCD | Range | Ascension interaction | Suggested visual and use |
| --- | --- | ---: | --- | ---: | --- | --- |
| Divine Ascension / Ascensión Divina | Starts the empowered state at 20 Devotion. No mana cost. | Consumes 20 | No cooldown, instant, off GCD | Self | Grants 5 charges for 25 sec. | A vertical gold-white flare, brighter armor edges, and five orbiting sigils. Activate before the situation where its flexible charges matter. |
| Mending Light / Luz Reparadora | Basic directed heal. At rank 4 it heals for 190 to 222 and costs 55 mana. | Holy: 1 on effective healing. Other specs: 0. | No cooldown, 2.5 sec cast, GCD | 30 yd | Never consumes a charge and is not empowered. | A narrow beam that gathers into the ally. Holy filler when stronger heals are unnecessary. |
| Hushbrand / Marca Silente | Protection and Retribution only. Interrupts a cast and locks its school for 4 sec. No mana cost. | 0 | 15 sec, instant, off GCD | 5 yd | Never consumes a charge. | A brief sealed rune over the enemy's mouth or casting focus. Reactive interrupt. |
| Guardian Covenant / Pacto Guardián | Holy only. Reduces an ally's damage taken by 20% for 8 sec. Costs 35 mana. | 0 | 45 sec, instant, off GCD | 30 yd | Marked, consumes 1 charge, and increases reduction to 30%. | A linked shield-rune between Paladin and ally. Use before predictable ally damage. |
| Solar Step / Paso Solar | All specializations. Increases movement speed by 150% for 2 sec without forcing movement. Costs 20 mana. | 0 | 30 sec, instant, GCD | Self | Never consumes a charge. | A sustained solar trail follows the Paladin while moving. Collision, slopes, and walls remain authoritative. |
| Recall the Fallen / Retorno de los Caídos | Holy only. Out-of-combat resurrection at 35% health and mana. Costs 60 mana. | 0 | No cooldown, 8 sec cast, GCD | 30 yd | Never consumes a charge. | A quiet column of dawnlight that reforms the ally. Group recovery only. |

### Additional shared abilities

| Ability | First-pass behavior |
| --- | --- |
| Devotion Ward | Reduces damage taken by 5% for 30 min. Five percent is the initial value because several Paladins can stack their independently owned Devotions. |
| Solar Invocation | Holy only. Instant, 8 sec cooldown, 80 mana, and 30 yd range. Heals one friendly target for 180 to 220 and generates 1 Devotion from effective healing. During Ascension it consumes 1 charge and also heals allied players within 10 yd of the target for half as much. |
| Hammer of Grace | 110% weapon strike plus 28. Restores 70 mana only when it connects. |
| Hammer of Light | 110% weapon strike plus 28. Heals the Paladin for 50% of actual damage dealt and cannot crit as a second healing event. |
| Sacred Form | Holy only. For 30 min, increases healing by 10%, spell critical chance by 5%, and multiplies generated threat by 0.5. |
| Beacon of Light | Holy only, learned at level 16. Marks one group member until the Paladin or carrier dies. Effective healing on another group member within 60 yd of the carrier also heals the Beacon for 75%. Each Paladin owns one mark, and marks from different Paladins coexist. |

Hammer of Grace and Hammer of Light are separate actions but share one 10 second cooldown.
Neither is an Ascension charge spender.

### Devotion buff ownership

Each Paladin may contribute one of the following Devotions at a time. Casting another
replaces only buffs owned by that Paladin on each recipient. Devotions owned by other
Paladins remain, even when they have the same name.

| Devotion | Duration | Effect |
| --- | ---: | --- |
| Devotion Ward | 30 min | 5% damage reduction. |
| Radiant Devotion | 30 min | 20 spell power. |
| Dawn Devotion | 30 min | 40 attack power. It has a Paladin-specific identity and is not removed by Warrior Battle Shout. |
| Grace Devotion | 3 min | Restores 15 mana every 5 sec and reduces mana costs by 6%. Copies from different Paladins stack additively, with an 80% cost floor. |

## Dawnreaver

Retribution is a melee damage specialization with deliberate heavy hits and a small number
of high-value Ascension decisions.

| English / Spanish | Function and normal effect | Devotion | Cooldown, cast, GCD | Range | Ascension interaction | Suggested visual and rotation use |
| --- | --- | ---: | --- | ---: | --- | --- |
| Oathstrike / Golpe del Juramento | Main attack for weapon damage plus 21. No mana cost. | 1 on hit | 5 sec, instant, GCD | Melee | Marked. Consumes 1 charge and repeats the strike at 60% power. | A gold afterimage repeats the weapon arc. Highest steady-cadence generator and efficient single-target charge use. |
| Final Edict / Edicto Final | Heavy attack for 140% weapon damage plus 52. Costs 25 mana. | 2 on hit | 8 sec, instant, GCD | Melee | Marked. Consumes 1 charge and adds a 55 to 70 Holy explosion in a 6 yd area, soft-capped at 5 targets. | A descending seal breaks into a circular shockwave. Prioritize for heavy single-target damage and clustered cleave. |
| Dawnfall / Caída del Alba | Deals 55 to 70 Holy damage in 6 yd, soft-capped at 5 targets. Costs 35 mana. | 2 if it hits at least one enemy | 12 sec, instant, GCD | Self-centered | Marked. Consumes 1 charge, deals 50% more damage, and expands to 10 yd. | A ring of sunlight strikes the ground. Primary area generator and preferred charge use on groups. |
| Faithforged Guard / Guardia Forjada en Fe | Absorbs 140 damage for 8 sec. Costs 20 mana. | 0 | 75 sec, instant, off GCD | Self | Marked. Consumes 1 charge and increases absorption to 210. | A translucent plated shell closes around the Paladin. Reserve a charge when survival is more valuable than damage. |

Basic priority: keep Oathstrike cycling, use Final Edict on cooldown, and add Dawnfall when
it will hit a useful target count. At 20 Devotion, activate Divine Ascension off GCD. Spend
charges on Oathstrike and Final Edict for single target, move charges into Dawnfall for area
damage, or retain one for Faithforged Guard. The 25 second window means the player does not
need to empty every charge immediately.

## Sunmender

Holy generates Devotion through effective healing and by unleashing an active Seal with
Verdict for 1 Devotion. Mercy Lance may deal damage, but its offensive use does not generate
Devotion.

| English / Spanish | Function and normal effect | Devotion | Cooldown, cast, GCD | Range | Ascension interaction | Suggested visual and priority use |
| --- | --- | ---: | --- | ---: | --- | --- |
| Mercy Lance / Lanza de Misericordia | Heals an ally or damages an enemy for 80 to 100. Costs 20 mana. | 1 on effective healing | 6 sec, instant, GCD | 30 yd | Marked. On a healing cast it consumes 1 charge and also heals one nearby ally at 70% power. | A narrow lance changes from warm gold on allies to white-gold on enemies. Use frequently for movement and efficient spot healing. |
| Dawn's Embrace / Abrazo del Alba | Strong heal for 260 to 310. Costs 45 mana. | 2 on effective healing | 10 sec, 1.5 sec cast, GCD | 30 yd | Marked. Consumes 1 charge, becomes instant, and heals for 35% more. | A sunrise fan opens behind the target. Tank or emergency heal and the strongest reactive charge use. |
| Radiant Chorus / Coro Radiante | Heals nearby allies for 90 to 110 in 30 yd. Costs 60 mana. | 2 if at least one ally is effectively healed | 12 sec, 2 sec cast, GCD | Self-centered | Marked. Consumes 1 charge, heals for 20% more, and expands to 40 yd. | Several light notes or rings converge on injured allies. Group damage response. |
| Life Covenant / Pacto de Vida | Reduces an ally's damage taken by 40% for 6 sec. Costs 40 mana. | 0 | 90 sec, instant, off GCD | 30 yd | Improved during Ascension but never consumes a charge. It also grants a 120-point shield. | A bright life-rune locks over the ally's health frame and model. Pre-empt lethal damage. |

Healing priority: prevent lethal damage with Life Covenant, use Dawn's Embrace for large
deficits, use Radiant Chorus when several allies need healing, use Mercy Lance for efficient
instant healing, and fill with Mending Light. During Ascension, charges can be held for
emergency instant Dawn's Embrace casts, spent on group healing through Radiant Chorus, or
used on Mercy Lance for efficient two-target coverage.

## Faithwarden

Protection combines shield mitigation, block timing, Holy threat, and ally protection.
Using a shield enables baseline block. Paladins do not inherit the Warrior's Strength-based
parry.

| English / Spanish | Function and normal effect | Devotion | Cooldown, cast, GCD | Range | Ascension interaction | Suggested visual and defensive use |
| --- | --- | ---: | --- | ---: | --- | --- |
| Vowkeeper Strike / Golpe del Custodio | Main attack for weapon damage plus 21 with 3x threat. No mana cost. | 1 on hit | 5 sec, instant, GCD | Melee | Marked. Consumes 1 charge and grants a shield equal to 6% maximum health for 6 sec. | A shield-shaped spark remains on the Paladin after impact. Main threat generator and mixed offense-defense charge use. |
| Bastion Rite / Rito del Bastión | Reduces physical damage by 20% and adds 20% block chance for 6 sec. Costs 20 mana. | 1 on use | 10 sec, instant, GCD | Self | Marked. Consumes 1 charge and extends both effects to 10 sec. | A broad geometric ward forms in front of the equipped shield. Maintain around dangerous melee sequences rather than blindly on cooldown. |
| Sunward Disc / Disco Solar | Requires a shield. Initial hit for 90 to 110 and two bounces for 60 to 75, all with 3x threat. Costs 25 mana. | 2 on hit | 10 sec, instant, GCD | 30 yd | Marked. Consumes 1 charge, increases damage by 30%, and permits five bounces. | A spinning sun-disc leaves a readable arc between targets. Ranged pickup and primary group-threat charge use. |
| Sacred Challenge / Desafío Sagrado | Taunts an enemy. No mana cost. | 0 | 10 sec, instant, off GCD | 30 yd | Improved during Ascension but never consumes a charge. Also grants 15% damage reduction for 4 sec. | A pillar and oath-chain mark the challenged enemy. Recover threat or brace for a forced attack. |

Defensive priority: keep Vowkeeper Strike cycling for threat, use Sunward Disc to collect
or control groups, and time Bastion Rite around physical pressure. Successful blocks grant
1 Devotion at most once every 6 seconds. Sacred Challenge recovers enemies and becomes a
small no-charge defensive during Ascension.

## Expected cadence

- Retribution reaches 20 Devotion in 32.65 seconds in the deterministic level 20 priority
  rotation when every generator connects.
- Holy reaches 20 in 36.15 seconds during uninterrupted effective healing with its real mana
  pool. Mending Light
  alone remains intentionally slower, at about 50 seconds of uninterrupted casting.
- Protection reaches 20 in 40.05 seconds without block generation. Correctly timed blocks
  accelerate the cycle, while the internal cooldown prevents mass pulls from collapsing it.

The automated balance harness keeps all three ideal rotations inside the intended 30 to 45
second window without refilling mana between casts. These are first-pass targets, not
guarantees. Downtime, misses, overhealing, and movement lengthen the cycle.

## Feedback identity

- Divine Ascension begins with a dedicated salute, a rising gold-white burst, a sun nova,
  and a sampled activation sound.
- The transformed character uses brighter armor edges, a translucent light column, two
  counter-rotating halos, and one orbiting seal for each remaining charge.
- Healing impacts rise in ivory light, defensive impacts mix gold with ward-blue, offensive
  impacts use concentrated white-gold, and area impacts spread amber across a wider nova.
- Every action that will consume a charge carries a visible `-1` badge in desktop and mobile
  action bars. Its accessible label also states that one Ascension charge will be consumed.
- The final charge changes the transformation toward amber and increases the existing visual
  urgency without hiding actionable information when reduced motion is enabled.

## Ascension decisions

- Retribution chooses single target, area damage, or one defensive charge.
- Holy chooses immediate throughput, group coverage, tank focus, or delayed emergency
  healing. Life Covenant improves for free so it cannot accidentally waste a charge.
- Protection chooses personal mitigation, group threat, ally protection, or holding a charge
  for the next tank buster. Sacred Challenge improves for free.
- Generation during Ascension creates limited forward momentum, but the 10-point bank cap
  prevents immediate back-to-back transformations.

## Balance risks

- A 25 second window may produce very high empowered-ability uptime if cooldown alignment
  is too forgiving. Charge count, not duration, should be the first tuning lever.
- Retribution may overvalue Final Edict in every target pattern because its empowered
  explosion adds free cleave. Its explosion, rather than the base hit, should be tuned first.
- Holy can generate too quickly in sustained raid damage or too slowly when healing demand
  is low. Effective-heal gating prevents idle overheal farming but needs encounter testing.
- Protection's block generation is sensitive to enemy swing rate. The 6 second internal
  cooldown is the main safety control and should be visible in telemetry even if it is not a
  player-facing timer.
- Banking 10 Devotion during Ascension may shorten the next cycle too far for high-skill
  players. Test caps of 5, 8, and 10 before reducing normal generation.
- Guardian Covenant competes with core defensive charge spenders only for Protection. Its
  30% empowered reduction may be too dominant in organized group play.
- Fixed healing and shielding values need to be checked across the full level curve, not only
  at level 20.

## PBE order

1. Verify state correctness: generation, 20-point gate, five charges, one charge per marked
   cast, 25 second expiry, death reset, out-of-combat decay, and 10-point active bank.
2. Verify UI clarity on desktop and mobile: Devotion count, ready state, remaining charges,
   and empowered-button glow.
3. Measure time to 20 Devotion for each spec in single-target, group, movement, and low-heal
   scenarios.
4. Verify Protection block generation under one target and mass pulls, including shield and
   facing requirements.
5. Compare charge choices inside each spec. A charge should not have one universal answer.
6. Tune throughput and mitigation only after the resource loop and charge consumption are
   reliable.

No new Paladin choice rows should be authored until these six checks establish a stable
baseline. Before wider testing, update the branch from the release commit that contains the
automatic passive restoration work.
